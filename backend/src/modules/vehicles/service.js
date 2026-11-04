import { HttpError } from '../../utils/httpError.js';
import { normalizeRegistration, searchable } from '../../utils/identifiers.js';
import { pageResult, toSkipTake } from '../../utils/pagination.js';
import { todayIn } from '../../utils/time.js';
import { displayNameOf } from '../customers/service.js';
import { categoryIssues } from './schemas.js';
import { vehicleInWorkspace } from '../workspaces/filters.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Véhicule introuvable.');
const conflict = () =>
  new HttpError(
    409,
    'VERSION_CONFLICT',
    'Cet élément a été modifié entre-temps. Rechargez la page et recommencez.',
  );

const ownerSelect = {
  select: { id: true, ref: true, type: true, firstName: true, lastName: true, legalName: true },
};
const include = {
  owner: ownerSelect,
  fleet: { select: { id: true, name: true } },
  usage: { select: { id: true, label: true } },
  insurerUsage: { select: { id: true, label: true, groupLabel: true } },
};

// Fields stored as given; registration and the date are converted separately.
const PLAIN_FIELDS = [
  'category',
  'make',
  'model',
  'vin',
  'fiscalPowerCv',
  'engineCc',
  'seats',
  'fuel',
  'taxiType',
  'passengerTransportKind',
  'fleetId',
  'usageId',
  'insurerUsageId',
];

const toDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : iso);
const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);

function owner(row) {
  return { id: row.id, ref: row.ref, displayName: displayNameOf(row) };
}

function toView(vehicle) {
  return {
    id: vehicle.id,
    registration: vehicle.registration,
    category: vehicle.category,
    make: vehicle.make,
    model: vehicle.model,
    firstRegistrationDate: fromDate(vehicle.firstRegistrationDate),
    vin: vehicle.vin,
    fiscalPowerCv: vehicle.fiscalPowerCv,
    engineCc: vehicle.engineCc,
    seats: vehicle.seats,
    fuel: vehicle.fuel,
    taxiType: vehicle.taxiType,
    passengerTransportKind: vehicle.passengerTransportKind,
    owner: owner(vehicle.owner),
    fleet: vehicle.fleet ?? null,
    usage: vehicle.usage ?? null,
    insurerUsage: vehicle.insurerUsage
      ? {
          id: vehicle.insurerUsage.id,
          label: vehicle.insurerUsage.label,
          group: vehicle.insurerUsage.groupLabel,
        }
      : null,
    archivedAt: vehicle.archivedAt,
    archiveReason: vehicle.archiveReason,
    createdAt: vehicle.createdAt,
    version: vehicle.version,
  };
}

function validationError(issues) {
  return new HttpError(
    400,
    'VALIDATION_ERROR',
    'Données invalides.',
    issues.map((issue) => ({ path: issue.path.join('.'), rule: issue.message })),
  );
}

export function createVehiclesService({ prisma, audit, clock, config }) {
  const today = () => todayIn(config.APP_TIMEZONE, clock.now());

  async function load(client, id) {
    const vehicle = await client.vehicle.findUnique({ where: { id }, include });
    if (!vehicle) throw notFound();
    return vehicle;
  }

  /** Same plate or same chassis number: refused, with the existing vehicle to open instead. */
  async function checkDuplicates(client, { registrationKey, vin }, excludeId) {
    const others = excludeId ? { NOT: { id: excludeId } } : {};
    const describe = (row) => ({
      id: row.id,
      registration: row.registration,
      owner: owner(row.owner),
      archived: Boolean(row.archivedAt),
    });
    if (registrationKey) {
      const row = await client.vehicle.findFirst({
        where: { ...others, registrationKey },
        include,
      });
      if (row) {
        throw new HttpError(409, 'DUPLICATE_REGISTRATION', 'Ce véhicule est déjà enregistré.', {
          candidates: [describe(row)],
        });
      }
    }
    if (vin) {
      const row = await client.vehicle.findFirst({ where: { ...others, vin }, include });
      if (row) {
        throw new HttpError(409, 'DUPLICATE_VIN', 'Ce numéro de châssis est déjà enregistré.', {
          candidates: [describe(row)],
        });
      }
    }
  }

  async function assertFleetOfOwner(client, fleetId, ownerId) {
    if (!fleetId) return;
    const fleet = await client.fleet.findUnique({
      where: { id: fleetId },
      select: { customerId: true },
    });
    if (!fleet || fleet.customerId !== ownerId) {
      throw new HttpError(400, 'INVALID_FLEET', 'Cette flotte n’appartient pas à ce client.');
    }
  }

  /**
   * Rule L16: the usage comes from the catalogue and must be confirmed and active when it is
   * chosen. A vehicle keeps its usage if that usage is later deactivated.
   */
  async function assertUsableUsage(client, usageId) {
    if (!usageId) return;
    const usage = await client.vehicleUsage.findUnique({
      where: { id: usageId },
      select: { status: true, active: true },
    });
    if (!usage || usage.status !== 'CONFIRMED' || !usage.active) {
      throw validationError([{ path: ['usageId'], message: 'USAGE_NOT_USABLE' }]);
    }
  }

  /**
   * An electric two- or three-wheeler keeps its moped usage (model E) on the usage Divers (model
   * D), as RMA issues it (ACAPS letter of 19/02/2026).
   * Same rule as the trigger vehicle_insurer_usage_fits.
   */
  async function keptOnDivers(client, insurerUsage, usageId, fuel) {
    if (fuel !== 'ELECTRIC' || insurerUsage.usage.modelCode !== 'E' || !usageId) return false;
    const usage = await client.vehicleUsage.findUnique({
      where: { id: usageId },
      select: { modelCode: true },
    });
    return usage?.modelCode === 'D';
  }

  const insurerUsageSelect = {
    usageId: true,
    active: true,
    usage: { select: { modelCode: true } },
  };

  /**
   * The insurer's own usage chosen on its platform ("C1 (COMMERCE <= 3,5T)") decides the legal
   * usage, so the attestation model stays the legal one. Returns the legal usage the vehicle gets:
   * the one asked for, else the one it keeps (`keptUsageId`) when allowed, else the insurer's.
   */
  async function insurerUsageOf(client, insurerUsageId, { usageId, keptUsageId, fuel }) {
    const row = await client.insurerUsage.findUnique({
      where: { id: insurerUsageId },
      select: insurerUsageSelect,
    });
    if (!row || !row.active) {
      throw validationError([{ path: ['insurerUsageId'], message: 'INSURER_USAGE_NOT_USABLE' }]);
    }
    const wanted = usageId ?? keptUsageId;
    if (wanted && wanted !== row.usageId && (await keptOnDivers(client, row, wanted, fuel))) {
      return wanted;
    }
    if (usageId && usageId !== row.usageId) {
      throw validationError([{ path: ['insurerUsageId'], message: 'INSURER_USAGE_OTHER_USAGE' }]);
    }
    return row.usageId;
  }

  /** True when the insurer's usage may stay on a vehicle of this usage and fuel. */
  async function insurerUsageFits(client, insurerUsageId, usageId, fuel) {
    const row = await client.insurerUsage.findUnique({
      where: { id: insurerUsageId },
      select: insurerUsageSelect,
    });
    if (!row || !usageId) return false;
    return row.usageId === usageId || keptOnDivers(client, row, usageId, fuel);
  }

  /** Uniqueness and foreign keys in the database win any race the checks could not see. */
  function mapDatabaseError(err) {
    if (err?.code === 'P2002') {
      return new HttpError(
        409,
        'DUPLICATE_REGISTRATION',
        'Immatriculation ou châssis déjà enregistré.',
      );
    }
    if (err?.code === 'P2003') {
      return new HttpError(400, 'INVALID_FLEET', 'Cette flotte n’appartient pas à ce client.');
    }
    return err;
  }

  return {
    async list({ q, category, customerId, fleetId, archived, insurerId, page, pageSize }) {
      const where = {
        ...(insurerId ? { AND: [vehicleInWorkspace(insurerId)] } : {}),
        ...(archived === 'exclude' ? { archivedAt: null } : {}),
        ...(archived === 'only' ? { archivedAt: { not: null } } : {}),
        ...(category ? { category } : {}),
        ...(customerId ? { ownerId: customerId } : {}),
        ...(fleetId ? { fleetId } : {}),
      };
      if (q) {
        const { key } = normalizeRegistration(q);
        const text = searchable(q);
        where.OR = [
          ...(key ? [{ registrationKey: { contains: key } }] : []),
          { make: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } },
          { owner: { searchText: { contains: text } } },
        ];
      }
      const [rows, total] = await prisma.$transaction([
        prisma.vehicle.findMany({
          where,
          include,
          orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { registrationKey: 'asc' }],
          ...toSkipTake({ page, pageSize }),
        }),
        prisma.vehicle.count({ where }),
      ]);
      return pageResult(rows.map(toView), total, { page, pageSize });
    },

    /** The vehicle, with the avenants that changed its plate or replaced it (its history). */
    async get(id) {
      const vehicle = await load(prisma, id);
      const amendments = await prisma.amendment.findMany({
        where: { OR: [{ vehicleId: id }, { previousVehicleId: id }] },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          contract: { select: { id: true, ref: true } },
          previousVehicle: { select: { id: true, registration: true } },
          vehicle: { select: { id: true, registration: true } },
        },
      });
      return {
        ...toView(vehicle),
        amendments: amendments.map((a) => ({
          id: a.id,
          kind: a.kind,
          number: a.number,
          effectiveDate: fromDate(a.effectiveDate),
          contract: a.contract,
          previousRegistration: a.previousRegistration,
          registration: a.registration,
          // The other vehicle of a vehicle change: the one it replaced, or its replacement.
          replaced: a.kind === 'VEHICLE_CHANGE' && a.vehicleId === id ? a.previousVehicle : null,
          replacedBy: a.kind === 'VEHICLE_CHANGE' && a.previousVehicleId === id ? a.vehicle : null,
        })),
      };
    },

    async create(auth, request, body) {
      const issues = categoryIssues(body, { today: today() });
      if (issues.length) throw validationError(issues);
      const { display, key } = normalizeRegistration(body.registration);

      try {
        const created = await prisma.$transaction(async (tx) => {
          const customer = await tx.customer.findUnique({
            where: { id: body.ownerId },
            select: { id: true, ref: true, archivedAt: true },
          });
          if (!customer) throw new HttpError(404, 'NOT_FOUND', 'Client introuvable.');
          if (customer.archivedAt) {
            throw new HttpError(
              409,
              'OWNER_ARCHIVED',
              'Ce client est archivé : restaurez-le d’abord.',
            );
          }
          await assertFleetOfOwner(tx, body.fleetId, body.ownerId);
          const usageId = body.insurerUsageId
            ? await insurerUsageOf(tx, body.insurerUsageId, {
                usageId: body.usageId,
                fuel: body.fuel,
              })
            : body.usageId;
          await assertUsableUsage(tx, usageId);
          await checkDuplicates(tx, { registrationKey: key, vin: body.vin });

          const values = { ...body, usageId };
          const data = Object.fromEntries(
            PLAIN_FIELDS.filter((f) => values[f] !== undefined).map((f) => [f, values[f]]),
          );
          const vehicle = await tx.vehicle.create({
            data: {
              ...data,
              ownerId: body.ownerId,
              registration: display,
              registrationKey: key,
              firstRegistrationDate: toDate(body.firstRegistrationDate),
              createdById: auth.user.id,
            },
          });
          await audit.record(
            {
              actorUserId: auth.user.id,
              action: 'vehicle.created',
              entityType: 'vehicle',
              entityId: vehicle.id,
              request,
              details: { category: body.category, ownerRef: customer.ref },
            },
            tx,
          );
          return vehicle;
        });
        return this.get(created.id);
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },

    async update(auth, request, id, body) {
      const { version, ...changes } = body;
      try {
        await prisma.$transaction(async (tx) => {
          const current = await load(tx, id);
          const fuel = changes.fuel !== undefined ? changes.fuel : current.fuel;
          if (changes.insurerUsageId) {
            changes.usageId = await insurerUsageOf(tx, changes.insurerUsageId, {
              usageId: changes.usageId,
              keptUsageId: current.usageId,
              fuel,
            });
          } else if (
            changes.insurerUsageId === undefined &&
            (changes.usageId !== undefined || changes.fuel !== undefined) &&
            current.insurerUsageId &&
            !(await insurerUsageFits(
              tx,
              current.insurerUsageId,
              changes.usageId !== undefined ? changes.usageId : current.usageId,
              fuel,
            ))
          ) {
            // Another legal usage or fuel: the insurer's usage chosen before no longer fits it.
            changes.insurerUsageId = null;
          }
          if (current.archivedAt) {
            throw new HttpError(
              409,
              'ARCHIVED',
              'Ce véhicule est archivé. Restaurez-le pour le modifier.',
            );
          }
          const currentView = {
            ...current,
            firstRegistrationDate: fromDate(current.firstRegistrationDate),
          };
          const merged = { ...currentView, ...changes };
          const issues = categoryIssues(merged, { today: today() });
          if (issues.length) throw validationError(issues);

          const data = {};
          const changed = [];
          for (const field of PLAIN_FIELDS) {
            if (changes[field] !== undefined && changes[field] !== current[field]) {
              data[field] = changes[field];
              changed.push(field);
            }
          }
          if (
            changes.firstRegistrationDate !== undefined &&
            changes.firstRegistrationDate !== currentView.firstRegistrationDate
          ) {
            data.firstRegistrationDate = toDate(changes.firstRegistrationDate);
            changed.push('firstRegistrationDate');
          }
          let registrationKey;
          if (changes.registration !== undefined) {
            const { display, key } = normalizeRegistration(changes.registration);
            if (display !== current.registration) {
              data.registration = display;
              data.registrationKey = key;
              registrationKey = key !== current.registrationKey ? key : undefined;
              changed.push('registration');
            }
          }
          if (changed.includes('fleetId'))
            await assertFleetOfOwner(tx, data.fleetId, current.ownerId);
          if (changed.includes('usageId')) await assertUsableUsage(tx, data.usageId);
          await checkDuplicates(
            tx,
            { registrationKey, vin: changed.includes('vin') ? data.vin : null },
            id,
          );

          const { count } = await tx.vehicle.updateMany({
            where: { id, version },
            data: { ...data, version: { increment: 1 } },
          });
          if (count === 0) throw conflict();
          await audit.record(
            {
              actorUserId: auth.user.id,
              action: 'vehicle.updated',
              entityType: 'vehicle',
              entityId: id,
              request,
              details: { fields: changed },
            },
            tx,
          );
        });
      } catch (err) {
        throw mapDatabaseError(err);
      }
      return this.get(id);
    },

    async archive(auth, request, id, { reason, version }) {
      await prisma.$transaction(async (tx) => {
        const current = await load(tx, id);
        if (current.archivedAt)
          throw new HttpError(409, 'ARCHIVED', 'Ce véhicule est déjà archivé.');
        const { count } = await tx.vehicle.updateMany({
          where: { id, version },
          data: {
            archivedAt: clock.now(),
            archivedById: auth.user.id,
            archiveReason: reason,
            version: { increment: 1 },
          },
        });
        if (count === 0) throw conflict();
        await audit.record(
          {
            actorUserId: auth.user.id,
            action: 'vehicle.archived',
            entityType: 'vehicle',
            entityId: id,
            request,
          },
          tx,
        );
      });
      return this.get(id);
    },

    async restore(auth, request, id, { version }) {
      await prisma.$transaction(async (tx) => {
        const current = await load(tx, id);
        if (!current.archivedAt)
          throw new HttpError(409, 'NOT_ARCHIVED', 'Ce véhicule n’est pas archivé.');
        // The plate may have been registered again on another vehicle meanwhile.
        await checkDuplicates(
          tx,
          { registrationKey: current.registrationKey, vin: current.vin },
          id,
        );
        const { count } = await tx.vehicle.updateMany({
          where: { id, version },
          data: {
            archivedAt: null,
            archivedById: null,
            archiveReason: null,
            version: { increment: 1 },
          },
        });
        if (count === 0) throw conflict();
        await audit.record(
          {
            actorUserId: auth.user.id,
            action: 'vehicle.restored',
            entityType: 'vehicle',
            entityId: id,
            request,
          },
          tx,
        );
      });
      return this.get(id);
    },

    async listFleets(customerId) {
      const fleets = await prisma.fleet.findMany({
        where: { customerId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { vehicles: { where: { archivedAt: null } } } } },
      });
      return fleets.map((fleet) => ({
        id: fleet.id,
        name: fleet.name,
        vehicleCount: fleet._count.vehicles,
        version: fleet.version,
      }));
    },

    async createFleet(auth, request, { customerId, name }) {
      return prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { archivedAt: true },
        });
        if (!customer) throw new HttpError(404, 'NOT_FOUND', 'Client introuvable.');
        if (customer.archivedAt) {
          throw new HttpError(
            409,
            'OWNER_ARCHIVED',
            'Ce client est archivé : restaurez-le d’abord.',
          );
        }
        if (await tx.fleet.findUnique({ where: { customerId_name: { customerId, name } } })) {
          throw new HttpError(409, 'DUPLICATE_FLEET', 'Ce client a déjà une flotte de ce nom.');
        }
        const fleet = await tx.fleet.create({
          data: { customerId, name, createdById: auth.user.id },
        });
        await audit.record(
          {
            actorUserId: auth.user.id,
            action: 'fleet.created',
            entityType: 'fleet',
            entityId: fleet.id,
            request,
          },
          tx,
        );
        return { id: fleet.id, name: fleet.name, vehicleCount: 0, version: fleet.version };
      });
    },

    async renameFleet(auth, request, id, { name, version }) {
      return prisma.$transaction(async (tx) => {
        const fleet = await tx.fleet.findUnique({ where: { id } });
        if (!fleet) throw new HttpError(404, 'NOT_FOUND', 'Flotte introuvable.');
        const clash = await tx.fleet.findUnique({
          where: { customerId_name: { customerId: fleet.customerId, name } },
        });
        if (clash && clash.id !== id) {
          throw new HttpError(409, 'DUPLICATE_FLEET', 'Ce client a déjà une flotte de ce nom.');
        }
        const { count } = await tx.fleet.updateMany({
          where: { id, version },
          data: { name, version: { increment: 1 } },
        });
        if (count === 0) throw conflict();
        await audit.record(
          {
            actorUserId: auth.user.id,
            action: 'fleet.renamed',
            entityType: 'fleet',
            entityId: id,
            request,
          },
          tx,
        );
        return { id, name, version: version + 1 };
      });
    },
  };
}
