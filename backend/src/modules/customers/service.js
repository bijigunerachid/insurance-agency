import { nextCounterValue } from '../../services/counter.js';
import { HttpError } from '../../utils/httpError.js';
import {
  maskIdentityNumber,
  normalizeIdentityNumber,
  normalizePhone,
  searchable,
} from '../../utils/identifiers.js';
import { pageResult, toSkipTake } from '../../utils/pagination.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { checkCombined } from './schemas.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Client introuvable.');
const conflict = () =>
  new HttpError(
    409,
    'VERSION_CONFLICT',
    'Ce client a été modifié entre-temps. Rechargez la page et recommencez.',
  );
const forbidden = (code, message) => new HttpError(403, code, message);

const assigneeSelect = { select: { id: true, displayName: true } };
const IDENTITY_FIELDS = ['identityType', 'identityNumber'];
const EDITABLE_FIELDS = [
  'firstName',
  'lastName',
  'legalName',
  'ice',
  'identityType',
  'identityNumber',
  'phone',
  'email',
  'addressLine',
  'city',
  'assignedUserId',
];

export function displayNameOf(customer) {
  return customer.type === 'BUSINESS'
    ? customer.legalName
    : `${customer.firstName} ${customer.lastName}`;
}

function searchTextOf(customer, ref) {
  return searchable(
    [ref, customer.firstName, customer.lastName, customer.legalName].filter(Boolean).join(' '),
  ).slice(0, 400);
}

/** May this user see this customer's full identity number? */
export function canSeeIdentity(auth, customer) {
  return (
    auth.permissions.has(PERMISSIONS.CUSTOMERS_IDENTITY) ||
    (customer.assignedUserId !== null && customer.assignedUserId === auth.user.id)
  );
}

function toView(customer, auth) {
  const identityVisible = canSeeIdentity(auth, customer);
  return {
    id: customer.id,
    ref: customer.ref,
    type: customer.type,
    displayName: displayNameOf(customer),
    firstName: customer.firstName,
    lastName: customer.lastName,
    legalName: customer.legalName,
    ice: customer.ice,
    identityType: customer.identityType,
    identityNumber: identityVisible
      ? customer.identityNumber
      : maskIdentityNumber(customer.identityNumber),
    identityMasked: Boolean(customer.identityNumber) && !identityVisible,
    phone: customer.phone,
    email: customer.email,
    addressLine: customer.addressLine,
    city: customer.city,
    assignedUser: customer.assignedUser ?? null,
    archivedAt: customer.archivedAt,
    archiveReason: customer.archiveReason,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    version: customer.version,
  };
}

/** List rows carry no identity number at all (data minimisation). */
function toListItem(customer) {
  return {
    id: customer.id,
    ref: customer.ref,
    type: customer.type,
    displayName: displayNameOf(customer),
    phone: customer.phone,
    city: customer.city,
    assignedUser: customer.assignedUser ?? null,
    archivedAt: customer.archivedAt,
    // Issued contracts: the insurances the person has with the agency now.
    activeContracts: customer._count?.contracts ?? 0,
  };
}

export function createCustomersService({ prisma, audit, clock }) {
  async function load(client, id) {
    const customer = await client.customer.findUnique({
      where: { id },
      include: { assignedUser: assigneeSelect },
    });
    if (!customer) throw notFound();
    return customer;
  }

  async function assertAssignable(client, userId) {
    if (userId === null || userId === undefined) return;
    const user = await client.user.findUnique({ where: { id: userId }, select: { active: true } });
    if (!user?.active) {
      throw new HttpError(400, 'INVALID_ASSIGNEE', 'Agent responsable introuvable ou désactivé.');
    }
  }

  /**
   * Same identity number or ICE: refused (a customer exists already). Same phone or same name:
   * a warning the user may override after checking. Never merged automatically.
   */
  async function checkDuplicates(client, data, { excludeId, confirmNotDuplicate }) {
    const others = { NOT: excludeId ? { id: excludeId } : undefined };
    const match = async (where) =>
      client.customer.findMany({
        where: { ...others, ...where },
        take: 5,
        select: {
          id: true,
          ref: true,
          type: true,
          firstName: true,
          lastName: true,
          legalName: true,
          archivedAt: true,
        },
      });
    const describe = (rows, matchedOn) =>
      rows.map((row) => ({
        id: row.id,
        ref: row.ref,
        displayName: displayNameOf(row),
        archived: Boolean(row.archivedAt),
        matchedOn,
      }));

    if (data.identityNumber) {
      const rows = await match({
        identityType: data.identityType,
        identityNumber: data.identityNumber,
      });
      if (rows.length) {
        throw new HttpError(409, 'DUPLICATE_IDENTITY', 'Un client a déjà ce numéro d’identité.', {
          candidates: describe(rows, 'identity'),
        });
      }
    }
    if (data.ice) {
      const rows = await match({ ice: data.ice });
      if (rows.length) {
        throw new HttpError(409, 'DUPLICATE_ICE', 'Une entreprise a déjà cet ICE.', {
          candidates: describe(rows, 'ice'),
        });
      }
    }
    if (confirmNotDuplicate) return;

    const candidates = [];
    if (data.phone) candidates.push(...describe(await match({ phone: data.phone }), 'phone'));
    const name =
      data.type === 'BUSINESS'
        ? searchable(data.legalName)
        : searchable(`${data.firstName ?? ''} ${data.lastName ?? ''}`);
    if (name) {
      // searchText is "<ref> <normalised name>": compare what follows the reference, exactly.
      const rows = await client.$queryRaw`
        SELECT id, ref, type::text AS type, "firstName", "lastName", "legalName", "archivedAt"
        FROM customer
        WHERE type::text = ${data.type}
          AND substring("searchText" FROM position(' ' IN "searchText") + 1) = ${name}
          AND id::text <> ${excludeId ?? ''}
        LIMIT 5`;
      candidates.push(...describe(rows, 'name'));
    }
    if (candidates.length) {
      throw new HttpError(
        409,
        'DUPLICATE_SUSPECTED',
        'Un client semblable existe peut-être déjà. Vérifiez avant de continuer.',
        { candidates },
      );
    }
  }

  /** Database uniqueness wins any race the checks above could not see. */
  function mapUniqueViolation(err) {
    if (err?.code === 'P2002') {
      return new HttpError(
        409,
        'DUPLICATE_IDENTITY',
        'Un client a déjà ce numéro d’identité ou cet ICE.',
      );
    }
    return err;
  }

  return {
    async list(auth, { q, type, archived, page, pageSize }) {
      const where = {
        ...(archived === 'exclude' ? { archivedAt: null } : {}),
        ...(archived === 'only' ? { archivedAt: { not: null } } : {}),
        ...(type ? { type } : {}),
      };
      if (q) {
        const text = searchable(q);
        const or = [{ searchText: { contains: text } }];
        const phone = normalizePhone(q);
        if (phone) or.push({ phone });
        const compact = normalizeIdentityNumber(q);
        // Exact match only: the user must already know the number to find someone by it.
        if (/^[A-Z0-9]{5,20}$/.test(compact))
          or.push({ identityNumber: compact }, { ice: compact });
        where.OR = or;
      }
      const [rows, total] = await prisma.$transaction([
        prisma.customer.findMany({
          where,
          include: {
            assignedUser: assigneeSelect,
            _count: { select: { contracts: { where: { status: 'ISSUED' } } } },
          },
          orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { ref: 'desc' }],
          ...toSkipTake({ page, pageSize }),
        }),
        prisma.customer.count({ where }),
      ]);
      return pageResult(rows.map(toListItem), total, { page, pageSize });
    },

    async get(auth, id) {
      return toView(await load(prisma, id), auth);
    },

    async create(auth, request, body) {
      const { confirmNotDuplicate, ...data } = body;
      const canAssign = auth.permissions.has(PERMISSIONS.CUSTOMERS_ASSIGN);
      if (data.assignedUserId !== undefined && !canAssign) {
        throw forbidden('FORBIDDEN', 'Seul un responsable peut choisir l’agent responsable.');
      }
      // Agents become responsible for the customers they create.
      const assignedUserId = canAssign ? (data.assignedUserId ?? null) : auth.user.id;

      try {
        const created = await prisma.$transaction(async (tx) => {
          await assertAssignable(tx, assignedUserId);
          await checkDuplicates(tx, data, { confirmNotDuplicate });
          const ref = `CLI-${String(await nextCounterValue(tx, 'customer')).padStart(6, '0')}`;
          const customer = await tx.customer.create({
            data: {
              ...data,
              ref,
              assignedUserId,
              createdById: auth.user.id,
              searchText: searchTextOf(data, ref),
            },
          });
          await audit.record(
            {
              actorUserId: auth.user.id,
              action: 'customer.created',
              entityType: 'customer',
              entityId: customer.id,
              request,
              details: {
                ref,
                type: data.type,
                duplicateWarningOverridden: Boolean(confirmNotDuplicate),
              },
            },
            tx,
          );
          return customer;
        });
        return this.get(auth, created.id);
      } catch (err) {
        throw mapUniqueViolation(err);
      }
    },

    async update(auth, request, id, body) {
      const { version, confirmNotDuplicate, ...changes } = body;
      try {
        await prisma.$transaction(async (tx) => {
          const current = await load(tx, id);
          if (current.archivedAt) {
            throw new HttpError(
              409,
              'ARCHIVED',
              'Ce client est archivé. Restaurez-le pour le modifier.',
            );
          }
          if (
            changes.assignedUserId !== undefined &&
            changes.assignedUserId !== current.assignedUserId &&
            !auth.permissions.has(PERMISSIONS.CUSTOMERS_ASSIGN)
          ) {
            throw forbidden('FORBIDDEN', 'Seul un responsable peut changer l’agent responsable.');
          }
          // Nobody may overwrite an identity number they are not allowed to see.
          if (
            IDENTITY_FIELDS.some((f) => changes[f] !== undefined) &&
            !canSeeIdentity(auth, current)
          ) {
            throw forbidden(
              'IDENTITY_HIDDEN',
              'Vous ne pouvez pas modifier une pièce d’identité masquée.',
            );
          }

          const merged = { ...current, ...changes };
          const issues = [];
          checkCombined(merged, { addIssue: (issue) => issues.push(issue) }, current.type);
          if (current.type === 'INDIVIDUAL' && (!merged.firstName || !merged.lastName)) {
            issues.push({
              path: [merged.firstName ? 'lastName' : 'firstName'],
              message: 'REQUIRED',
            });
          }
          if (current.type === 'BUSINESS' && !merged.legalName) {
            issues.push({ path: ['legalName'], message: 'REQUIRED' });
          }
          if (issues.length) {
            throw new HttpError(
              400,
              'VALIDATION_ERROR',
              'Données invalides.',
              issues.map((i) => ({ path: i.path.join('.'), rule: i.message })),
            );
          }

          const changed = EDITABLE_FIELDS.filter(
            (f) => changes[f] !== undefined && changes[f] !== current[f],
          );
          const duplicateRelevant = [
            'identityType',
            'identityNumber',
            'ice',
            'phone',
            'firstName',
            'lastName',
            'legalName',
          ];
          if (changed.some((f) => duplicateRelevant.includes(f))) {
            await checkDuplicates(
              tx,
              {
                type: current.type,
                ...pick(merged, duplicateRelevant),
                // Only re-check identifiers that actually changed.
                identityNumber:
                  changed.includes('identityNumber') || changed.includes('identityType')
                    ? merged.identityNumber
                    : null,
                ice: changed.includes('ice') ? merged.ice : null,
                phone: changed.includes('phone') ? merged.phone : null,
              },
              { excludeId: id, confirmNotDuplicate },
            );
          }
          if (changes.assignedUserId !== undefined)
            await assertAssignable(tx, changes.assignedUserId);

          const { count } = await tx.customer.updateMany({
            where: { id, version },
            data: {
              ...pick(changes, changed),
              searchText: searchTextOf(merged, current.ref),
              version: { increment: 1 },
            },
          });
          if (count === 0) throw conflict();
          await audit.record(
            {
              actorUserId: auth.user.id,
              action: 'customer.updated',
              entityType: 'customer',
              entityId: id,
              request,
              // Names of the changed fields only: never the personal data itself.
              details: {
                fields: changed,
                duplicateWarningOverridden: Boolean(confirmNotDuplicate),
              },
            },
            tx,
          );
        });
      } catch (err) {
        throw mapUniqueViolation(err);
      }
      return this.get(auth, id);
    },

    async archive(auth, request, id, { reason, version }) {
      await prisma.$transaction(async (tx) => {
        const current = await load(tx, id);
        if (current.archivedAt) throw new HttpError(409, 'ARCHIVED', 'Ce client est déjà archivé.');
        const { count } = await tx.customer.updateMany({
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
            action: 'customer.archived',
            entityType: 'customer',
            entityId: id,
            request,
          },
          tx,
        );
      });
      return this.get(auth, id);
    },

    async restore(auth, request, id, { version }) {
      await prisma.$transaction(async (tx) => {
        const current = await load(tx, id);
        if (!current.archivedAt)
          throw new HttpError(409, 'NOT_ARCHIVED', 'Ce client n’est pas archivé.');
        const { count } = await tx.customer.updateMany({
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
            action: 'customer.restored',
            entityType: 'customer',
            entityId: id,
            request,
          },
          tx,
        );
      });
      return this.get(auth, id);
    },

    /** Shows a masked identity number to an allowed user, with an audited reason. */
    async revealIdentity(auth, request, id, { reason }) {
      return prisma.$transaction(async (tx) => {
        const customer = await load(tx, id);
        if (!customer.identityNumber) {
          throw new HttpError(404, 'NO_IDENTITY', 'Aucune pièce d’identité enregistrée.');
        }
        await audit.record(
          {
            actorUserId: auth.user.id,
            action: 'customer.identity_revealed',
            entityType: 'customer',
            entityId: id,
            request,
            details: { reason },
          },
          tx,
        );
        return { identityType: customer.identityType, identityNumber: customer.identityNumber };
      });
    },

    /** Active staff a customer can be assigned to (names only). */
    async assignees() {
      return prisma.user.findMany({
        where: { active: true, role: { code: { in: ['ADMIN', 'MANAGER', 'AGENT'] } } },
        select: { id: true, displayName: true },
        orderBy: { displayName: 'asc' },
      });
    },
  };
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]));
}
