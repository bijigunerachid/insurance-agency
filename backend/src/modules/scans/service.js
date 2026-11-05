import { DOCUMENT_TYPES, matchesSignature } from '../../services/documentStore.js';
import { HttpError } from '../../utils/httpError.js';
import {
  normalizeIdentityNumber,
  normalizeRegistration,
  normalizeVin,
} from '../../utils/identifiers.js';
import {
  amendBody,
  createContractBody,
  createAttestationBody,
  transitionBody,
} from '../contracts/schemas.js';
import { createContractsService } from '../contracts/service.js';
import { createCustomersService, displayNameOf } from '../customers/service.js';
import { updateVehicleBody } from '../vehicles/schemas.js';
import { createVehiclesService } from '../vehicles/service.js';
import { readPdfText } from '../../services/pdfText.js';
import { parseAttestation } from './parse.js';
import {
  isPlatformSheet,
  isProvisionalSheet,
  parsePlatformSheet,
  parseProvisionalSheet,
} from './platform.js';
import { isCatSheet, parseCatSheet } from './cat.js';
import { insurerUsagesFor, productFits, ruleProduct, sheetKind } from './products.js';

const userName = { select: { id: true, displayName: true } };
const notFound = (what) => new HttpError(404, 'NOT_FOUND', `${what} introuvable.`);
const conflict = () =>
  new HttpError(
    409,
    'VERSION_CONFLICT',
    'Ce scan a été modifié entre-temps. Rechargez la page et recommencez.',
  );
const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);
/** Letters and digits only: "POL 0001" and "POL-0001" are the same policy number. */
const compact = (value) =>
  String(value ?? '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toUpperCase();

function view(row) {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedAt: row.uploadedAt,
    uploadedBy: row.uploadedBy,
    confidence: row.confidence,
    read: row.text !== null,
    proposed: row.proposed,
    status: row.status,
    progress: {
      customerId: row.customerId,
      vehicleId: row.vehicleId,
      contractId: row.contractId,
    },
    documentId: row.documentId,
    closed: row.closedAt ? { at: row.closedAt, by: row.closedBy, reason: row.discardReason } : null,
    version: row.version,
  };
}

/**
 * Scanned attestations: read offline, checked by an employee, then filed through the same rules
 * as the screens (customer, vehicle, contract, attestation). Each record created is kept on the
 * scan at once, so a filing stopped by an error goes on from there when it is sent again.
 */
/** Provisional attestations the agency takes in a row for a vehicle (owner, 29/10/2026). */
const PROVISIONALS_IN_A_ROW = 3;

export function createScansService({ prisma, audit, clock, config, store, ocr }) {
  const customers = createCustomersService({ prisma, audit, clock });
  const vehicles = createVehiclesService({ prisma, audit, clock, config });
  const contracts = createContractsService({ prisma, audit, clock, config });
  const record = (client, auth, request, action, entityId, details) =>
    audit.record(
      { actorUserId: auth.user.id, action, entityType: 'scan', entityId, request, details },
      client,
    );
  const include = { uploadedBy: userName, closedBy: userName };

  async function load(client, id) {
    const row = await client.attestationScan.findUnique({ where: { id }, include });
    if (!row) throw notFound('Scan');
    return row;
  }

  /** The series printed ("14 A") as recorded in the catalogue, which also gives the insurer. */
  async function withSeries(client, proposed) {
    if (!proposed.seriesCode) return proposed;
    const found = await client.attestationSeries.findMany({
      where: { code: proposed.seriesCode },
      include: { insurer: { select: { code: true } } },
    });
    const series =
      found.find((s) => s.insurer.code === proposed.insurerCode) ??
      (found.length === 1 ? found[0] : null);
    if (!series) return { ...proposed, seriesUnknown: true };
    const result = { ...proposed, seriesId: series.id, insurerCode: series.insurer.code };
    // The usage chosen on the insurer's platform, as printed: proposed with its legal usage.
    if (proposed.usage) {
      const insurerUsages = await client.insurerUsage.findMany({
        where: { insurerId: series.insurerId, active: true },
        select: { id: true, label: true, usageId: true },
        orderBy: { sortOrder: 'asc' },
      });
      const named = insurerUsagesFor(insurerUsages, proposed.usage);
      if (named.length === 1) {
        result.insurerUsageId = named[0].id;
        result.insurerUsageUsageId = named[0].usageId;
      } else if (named.length > 1) {
        // A label cut short: only the usages it may be are offered to the employee.
        result.insurerUsageChoices = named.map((u) => u.id);
      }
    }
    // Several readings of the number: the one of an unused blank form of the agency's stock.
    if (proposed.numberCandidates) {
      const forms = await client.attestationForm.findMany({
        where: {
          seriesId: series.id,
          number: { in: proposed.numberCandidates },
          status: { in: ['AVAILABLE', 'ASSIGNED'] },
        },
        select: { number: true },
      });
      if (forms.length === 1) {
        result.number = forms[0].number;
        result.numberToCheck = false;
        result.numberFromStock = true;
      }
    }
    return result;
  }

  /**
   * The next year of a contract, as the platform prints it ("RENOUVELLEMENT"): a draft linked
   * to the contract it renews (same customer and vehicles, the scanned period), under the new
   * policy number the sheet prints. An open renewal of the old contract is closed as renewed.
   */
  async function renewFromScan(auth, request, renew, customerId, vehicleId, policyNumber) {
    return prisma.$transaction(async (tx) => {
      const old = await tx.contract.findUnique({
        where: { id: renew.id },
        include: {
          nextContract: { select: { id: true } },
          vehicles: { where: { removedAt: null }, select: { vehicleId: true } },
        },
      });
      if (!old) throw notFound('Contrat');
      if (old.nextContract) {
        throw new HttpError(409, 'ALREADY_RENEWED', 'Ce contrat a déjà un contrat suivant.');
      }
      if (old.customerId !== customerId) {
        throw new HttpError(
          409,
          'RENEWAL_OTHER_CUSTOMER',
          'Le renouvellement est celui du client du contrat renouvelé.',
        );
      }
      const draft = createContractBody.parse({
        customerId,
        // The sheet's policy number: a renewal always has a new one (owner, 05/11/2026).
        policyNumber,
        productId: renew.productId ?? old.productId,
        startDate: renew.startDate,
        endDate: renew.endDate,
        ...(renew.premiumTotal ? { premiumTotal: renew.premiumTotal } : {}),
        tacitRenewal: old.tacitRenewal,
        noticeDays: old.noticeDays,
        vehicleIds: [...new Set([...old.vehicles.map((v) => v.vehicleId), vehicleId])],
      });
      const newId = await contracts.insertDraft(tx, auth, request, {
        ...draft,
        previousContractId: old.id,
      });
      const open = await tx.renewal.findUnique({ where: { contractId: old.id } });
      if (open && !['RENEWED', 'NOT_RENEWED'].includes(open.status)) {
        await tx.renewal.update({
          where: { id: open.id },
          data: { status: 'RENEWED', renewedContractId: newId, version: { increment: 1 } },
        });
        await tx.renewalEvent.create({
          data: {
            renewalId: open.id,
            fromStatus: open.status,
            toStatus: 'RENEWED',
            note: 'Renouvellement enregistré depuis un scan',
            userId: auth.user.id,
            at: clock.now(),
          },
        });
        await audit.record(
          {
            actorUserId: auth.user.id,
            action: 'renewal.renewed',
            entityType: 'renewal',
            entityId: open.id,
            request,
            details: { contractId: newId, via: 'scan' },
          },
          tx,
        );
      }
      return newId;
    });
  }

  async function saveProgress(id, data) {
    await prisma.attestationScan.update({ where: { id }, data });
  }

  return {
    /** Keeps the scan, reads it and proposes its values. Nothing else is recorded yet. */
    async upload(auth, request, { buffer, mimeType, name }) {
      if (!Object.hasOwn(DOCUMENT_TYPES, mimeType)) {
        throw new HttpError(
          400,
          'UNSUPPORTED_FILE',
          'Seuls les fichiers PDF, JPEG et PNG sont acceptés.',
        );
      }
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new HttpError(400, 'EMPTY_FILE', 'Le fichier est vide.');
      }
      if (!matchesSignature(buffer, mimeType)) {
        throw new HttpError(
          400,
          'UNSUPPORTED_FILE',
          'Le contenu du fichier ne correspond pas à son type.',
        );
      }
      const saved = await store.save(buffer, clock.now());
      try {
        const pending = await prisma.attestationScan.findFirst({
          where: { sha256: saved.sha256, status: 'PENDING' },
          select: { id: true },
        });
        if (pending) {
          throw new HttpError(409, 'DUPLICATE_SCAN', 'Ce scan attend déjà d’être traité.', {
            scanId: pending.id,
          });
        }
        // The PDF of the insurer's platform carries its text: read exactly, no recognition.
        const sheet = mimeType === 'application/pdf' ? await readPdfText(buffer) : null;
        let reading;
        let parsed;
        if (isPlatformSheet(sheet) || isProvisionalSheet(sheet) || isCatSheet(sheet)) {
          const text = ['left', 'right']
            .map((side) => sheet[side].map((row) => row.text).join('\n'))
            .join('\n\n');
          reading = { text, confidence: 100 };
          // RMA's full sheet, RMA's provisional (attestation half only), or CAT's sheet.
          const read = isPlatformSheet(sheet)
            ? parsePlatformSheet(sheet)
            : isProvisionalSheet(sheet)
              ? parseProvisionalSheet(sheet)
              : parseCatSheet(sheet);
          parsed = { ...read, source: 'PLATFORM_PDF' };
        } else {
          reading = await ocr.recognize(buffer, mimeType);
          parsed = reading ? parseAttestation(reading.text) : null;
        }
        const proposed = parsed ? await withSeries(prisma, parsed) : {};
        const row = await prisma.$transaction(async (tx) => {
          const created = await tx.attestationScan.create({
            data: {
              storageKey: saved.storageKey,
              sha256: saved.sha256,
              originalName: name,
              mimeType,
              size: buffer.length,
              uploadedAt: clock.now(),
              uploadedById: auth.user.id,
              text: reading ? reading.text.slice(0, 20000) : null,
              confidence: reading ? reading.confidence : null,
              proposed,
            },
            include,
          });
          // The values read are personal data: only what was found is audited, not the values.
          await record(tx, auth, request, 'scan.uploaded', created.id, {
            confidence: created.confidence,
            found: Object.keys(proposed),
          });
          return created;
        });
        return view(row);
      } catch (err) {
        await store.discard(saved.storageKey);
        if (err?.code === 'P2002') {
          throw new HttpError(409, 'DUPLICATE_SCAN', 'Ce scan attend déjà d’être traité.');
        }
        throw err;
      }
    },

    async list({ status }) {
      const rows = await prisma.attestationScan.findMany({
        where: { status },
        include,
        orderBy: { uploadedAt: status === 'PENDING' ? 'asc' : 'desc' },
        take: 100,
      });
      return { items: rows.map(view) };
    },

    async get(id) {
      return view(await load(prisma, id));
    },

    /**
     * The products of the series' insurer for the contract, those that fit the sheet first, and
     * the one to propose: the agency's last choice for the same kind of sheet, else the one
     * the sheet points to (products.js). The employee can always choose another.
     */
    async products(id, { seriesId }) {
      const row = await load(prisma, id);
      const series = await prisma.attestationSeries.findUnique({
        where: { id: seriesId },
        include: { model: true },
      });
      if (!series) throw notFound('Série');
      const products = await prisma.product.findMany({
        where: { insurerId: series.insurerId, status: 'CONFIRMED', active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, line: true },
      });
      const sheet = {
        modelCode: series.modelCode,
        provisional: series.model.provisional,
        bodyType: row.proposed?.bodyType,
        usage: row.proposed?.usage,
      };
      const items = products.map((product) => ({
        ...product,
        fits: productFits(product, sheet) === true,
      }));

      let suggestion = null;
      const kind = sheetKind(row.proposed);
      if (kind) {
        // The latest filed scans of the same series (a few hundred at most in a year).
        const filed = await prisma.$queryRaw`
          SELECT s."proposed", c."productId"
          FROM "attestation_scan" s JOIN "contract" c ON c."id" = s."contractId"
          WHERE s."status" = 'FILED' AND s."id" <> ${row.id}::uuid
            AND s."proposed"->>'insurerCode' = ${row.proposed.insurerCode}
            AND s."proposed"->>'seriesCode' = ${row.proposed.seriesCode}
          ORDER BY s."closedAt" DESC
          LIMIT 500`;
        const last = filed.find(
          (scan) =>
            sheetKind(scan.proposed) === kind && products.some((p) => p.id === scan.productId),
        );
        if (last) suggestion = { productId: last.productId, reason: 'LAST_CHOICE' };
      }
      if (!suggestion) {
        const product = ruleProduct(products, sheet);
        if (product) suggestion = { productId: product.id, reason: 'SHEET' };
      }
      return { items, suggestion };
    },

    /** The scan's file, to show it beside the values. Opening it is audited (personal data). */
    async open(auth, request, id) {
      const row = await load(prisma, id);
      const stream = await store.open(row.storageKey);
      await record(prisma, auth, request, 'scan.opened', id, {});
      return { row, stream };
    },

    /** Records the values on the scan already match: customer, vehicle, contract, attestation. */
    async matches(
      auth,
      { identityNumber, registration, vin, policyNumber, replacesPolicy, seriesId, number },
    ) {
      const result = { customer: null, vehicle: null, contract: null, attestation: null };
      if (identityNumber) {
        const customer = await prisma.customer.findFirst({
          where: { identityNumber: normalizeIdentityNumber(identityNumber) },
        });
        if (customer) {
          result.customer = {
            id: customer.id,
            ref: customer.ref,
            displayName: displayNameOf(customer),
            archived: Boolean(customer.archivedAt),
          };
        }
      }
      const vehicleInclude = {
        owner: true,
        usage: { select: { label: true, modelCode: true } },
        insurerUsage: { select: { label: true } },
      };
      let vehicle = registration
        ? await prisma.vehicle.findUnique({
            where: { registrationKey: normalizeRegistration(registration).key },
            include: vehicleInclude,
          })
        : null;
      let matchedBy = 'REGISTRATION';
      // Same chassis under another plate: the plate changed (registration-change avenant).
      if (!vehicle && vin) {
        vehicle = await prisma.vehicle.findUnique({
          where: { vin: normalizeVin(vin) },
          include: vehicleInclude,
        });
        matchedBy = 'VIN';
      }
      if (vehicle) {
        // Provisional attestations in a row since the vehicle's last definitive one, cancelled
        // ones left out: after three, the next must be definitive (owner, 29/10/2026; not in
        // arrêté 213-05, so the review warns).
        const latest = await prisma.attestation.findMany({
          where: { vehicleId: vehicle.id, cancelledAt: null },
          orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
          take: PROVISIONALS_IN_A_ROW + 1,
          select: { provisional: true },
        });
        const definitiveAt = latest.findIndex((a) => !a.provisional);
        result.vehicle = {
          id: vehicle.id,
          provisionalsInARow: definitiveAt < 0 ? latest.length : definitiveAt,
          matchedBy,
          archived: Boolean(vehicle.archivedAt),
          registration: vehicle.registration,
          makeAndModel: [vehicle.make, vehicle.model].filter(Boolean).join(' '),
          usage: vehicle.usage?.label ?? null,
          usageId: vehicle.usageId,
          usageModel: vehicle.usage?.modelCode ?? null,
          fuel: vehicle.fuel,
          insurerUsageId: vehicle.insurerUsageId,
          insurerUsage: vehicle.insurerUsage?.label ?? null,
          owner: { id: vehicle.ownerId, displayName: displayNameOf(vehicle.owner) },
        };
      }
      const series = seriesId
        ? await prisma.attestationSeries.findUnique({ where: { id: seriesId } })
        : null;
      const byPolicy = async (number) => {
        const [row] = await prisma.$queryRaw`
          SELECT "id" FROM "contract"
          WHERE "insurerId" = ${series.insurerId}::uuid
            AND upper(regexp_replace("policyNumber", '[^[:alnum:]]', '', 'g')) = ${compact(number)}
          ORDER BY "startDate" DESC
          LIMIT 1`;
        return row ?? null;
      };
      let found = policyNumber && series ? await byPolicy(policyNumber) : null;
      // Not followed yet under its own number: the contract of the policy it replaces, whose next
      // contract it is (« REMPLACEMENT DE POLICE N … »).
      let replaced = false;
      if (!found && replacesPolicy && series) {
        found = await byPolicy(replacesPolicy);
        replaced = Boolean(found);
      }
      // A renewal sheet prints the new year's number, which no contract has yet (owner,
      // 05/11/2026): the vehicle's latest contract at the insurer not renewed yet, offered as the
      // one it renews when the sheet's period follows it (the review compares the dates).
      let byVehicle = false;
      if (!found && result.vehicle && series) {
        found = await prisma.contract.findFirst({
          where: {
            insurerId: series.insurerId,
            status: { not: 'CANCELLED' },
            nextContract: { is: null },
            vehicles: { some: { vehicleId: result.vehicle.id, removedAt: null } },
          },
          orderBy: { endDate: 'desc' },
          select: { id: true },
        });
        byVehicle = Boolean(found);
      }
      if (found) {
        const contract = await prisma.contract.findUnique({
          where: { id: found.id },
          include: {
            vehicles: {
              where: { removedAt: null },
              orderBy: { addedAt: 'asc' },
              select: {
                vehicle: { select: { id: true, registration: true, make: true, model: true } },
              },
            },
          },
        });
        result.contract = {
          id: contract.id,
          ref: contract.ref,
          status: contract.status,
          policyNumber: contract.policyNumber,
          startDate: fromDate(contract.startDate),
          endDate: fromDate(contract.endDate),
          customerId: contract.customerId,
          vehicleIds: contract.vehicles.map((v) => v.vehicle.id),
          // The vehicles an avenant may replace or renumber.
          vehicles: contract.vehicles.map((v) => v.vehicle),
          replacedPolicy: replaced,
          // Found by the vehicle, not by the sheet's number: only its next year, never itself.
          byVehicle,
        };
      }
      if (series && number) {
        const attestation = await prisma.attestation.findFirst({
          where: { seriesId: series.id, number: number.replace(/\s/g, ''), duplicateOfId: null },
          include: { contract: { select: { id: true, ref: true, policyNumber: true } } },
        });
        if (attestation) result.attestation = attestation.contract;
      }
      return result;
    },

    /**
     * Files the scan: the customer, the vehicle and the contract (existing or new), the contract
     * sent to the insurer and issued with the policy number when the attestation is definitive,
     * the attestation recorded, and the scan attached to the contract with what it prints.
     */
    async file(auth, request, id, body) {
      const scan = await load(prisma, id);
      if (scan.status !== 'PENDING') {
        throw new HttpError(409, 'SCAN_CLOSED', 'Ce scan est déjà traité.');
      }
      // Claimed with its version: the same filing sent twice runs once.
      const claimed = await prisma.attestationScan.updateMany({
        where: { id, version: body.version, status: 'PENDING' },
        data: { version: { increment: 1 } },
      });
      if (claimed.count === 0) throw conflict();

      let customerId = scan.customerId;
      if (!customerId) {
        customerId =
          body.customer.id ?? (await customers.create(auth, request, body.customer.create)).id;
        await saveProgress(id, { customerId });
      }
      let vehicleId = scan.vehicleId;
      if (!vehicleId) {
        vehicleId =
          body.vehicle.id ??
          (await vehicles.create(auth, request, { ...body.vehicle.create, ownerId: customerId }))
            .id;
        await saveProgress(id, { vehicleId });
      }
      // The usage of a vehicle already recorded, corrected to the attestation's model when the
      // employee chose another one, and the insurer's usage printed on the sheet (audited like
      // any change of the vehicle).
      const { usageId, insurerUsageId } = body.vehicle;
      if (usageId || insurerUsageId) {
        const current = await prisma.vehicle.findUnique({
          where: { id: vehicleId },
          select: { usageId: true, insurerUsageId: true, version: true },
        });
        const changes = {
          ...(usageId && usageId !== current?.usageId ? { usageId } : {}),
          ...(insurerUsageId && insurerUsageId !== current?.insurerUsageId
            ? { insurerUsageId }
            : {}),
        };
        if (current && Object.keys(changes).length) {
          await vehicles.update(
            auth,
            request,
            vehicleId,
            updateVehicleBody.parse({ ...changes, version: current.version }),
          );
        }
      }

      const series = await prisma.attestationSeries.findUnique({
        where: { id: body.seriesId },
        include: { model: true },
      });
      if (!series) throw notFound('Série');
      const provisional = series.model.provisional;
      let contract;
      let contractId = scan.contractId;
      if (!contractId && body.contract.id) {
        // An existing contract is saved on the scan too: a filed scan always names its contract.
        contractId = body.contract.id;
        await saveProgress(id, { contractId });
      }
      // The guarantees the platform sheet prints, for a contract this sheet creates or renews (an
      // avenant's sheet repeats the year's, and a contract already followed keeps its own).
      const fromSheet = scan.proposed?.source === 'PLATFORM_PDF' && !body.amendment;
      const printedGuarantees = fromSheet ? (scan.proposed.guarantees ?? null) : null;
      // With the formula printed after them (« RC », « DC »).
      const printedFormula = fromSheet ? (scan.proposed.formula ?? null) : null;
      const keepGuarantees = async (newId) => {
        if (printedGuarantees?.length || printedFormula) {
          await prisma.contract.update({
            where: { id: newId },
            data: {
              ...(printedGuarantees?.length ? { guarantees: printedGuarantees } : {}),
              ...(printedFormula ? { formula: printedFormula } : {}),
            },
          });
        }
      };
      if (!contractId && body.contract.renew) {
        contractId = await renewFromScan(
          auth,
          request,
          body.contract.renew,
          customerId,
          vehicleId,
          body.policyNumber,
        );
        await keepGuarantees(contractId);
        await saveProgress(id, { contractId });
        contract = await contracts.get(contractId);
      } else if (!contractId) {
        const { productId, startDate, endDate, premiumTotal } = body.contract.create;
        contract = await contracts.create(
          auth,
          request,
          createContractBody.parse({
            customerId,
            // Printed on every platform sheet, provisional ones included.
            policyNumber: body.policyNumber,
            productId,
            startDate,
            endDate,
            // An avenant's total is its own amount, never the contract's premium.
            ...(premiumTotal && !body.amendment ? { premiumTotal } : {}),
            vehicleIds: [vehicleId],
          }),
        );
        contractId = contract.id;
        await keepGuarantees(contractId);
        await saveProgress(id, { contractId });
      } else {
        contract = await contracts.get(contractId);
      }

      // Sent to the insurer, then issued with the printed policy number (definitive only).
      // The insurer's proof of issue: its quittance when the platform PDF gives it.
      const reference = body.quittanceNumber
        ? `Quittance n° ${body.quittanceNumber}, attestation ${series.code} n° ${body.number}`
        : `Attestation ${series.code} n° ${body.number} (scan)`;
      if (contract.status === 'DRAFT') {
        contract = await contracts.transition(
          auth,
          request,
          contractId,
          transitionBody.parse({ to: 'AWAITING_INSURER', version: contract.version }),
        );
      }
      if (contract.status === 'AWAITING_INSURER' && !provisional) {
        if (!body.policyNumber) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'Données invalides.', [
            { path: 'policyNumber', rule: 'REQUIRED' },
          ]);
        }
        contract = await contracts.transition(
          auth,
          request,
          contractId,
          transitionBody.parse({
            to: 'ISSUED',
            policyNumber: body.policyNumber,
            insurerReference: reference,
            version: contract.version,
          }),
        );
      }

      const already = contract.attestations?.some(
        (a) => a.series.id === body.seriesId && a.number === body.number && !a.cancelled,
      );
      if (!already && body.amendment) {
        // The avenant moves or renumbers the vehicle and records its attestation with it.
        const { kind, number, effectiveDate, amount, previousVehicleId, registration } =
          body.amendment;
        await contracts.amend(
          auth,
          request,
          contractId,
          amendBody.parse({
            kind,
            number,
            effectiveDate,
            amount,
            insurerReference: body.quittanceNumber ? `Quittance n° ${body.quittanceNumber}` : null,
            previousVehicleId: kind === 'REGISTRATION_CHANGE' ? vehicleId : previousVehicleId,
            vehicleId: kind === 'VEHICLE_CHANGE' ? vehicleId : null,
            registration,
            attestation: {
              seriesId: body.seriesId,
              number: body.number,
              validFrom: body.validFrom,
              validTo: body.validTo,
            },
            version: contract.version,
          }),
        );
      } else if (!already) {
        await contracts.addAttestation(
          auth,
          request,
          contractId,
          createAttestationBody.parse({
            vehicleId,
            seriesId: body.seriesId,
            number: body.number,
            validFrom: body.validFrom,
            validTo: body.validTo,
            ...(body.coverNoteRef ? { coverNoteRef: body.coverNoteRef } : {}),
          }),
        );
      }

      // The scan joins the contract's documents, with what it prints for later comparisons.
      await prisma.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            contractId,
            type: 'ATTESTATION',
            originalName: scan.originalName,
            mimeType: scan.mimeType,
            size: scan.size,
            sha256: scan.sha256,
            storageKey: scan.storageKey,
            uploadedAt: clock.now(),
            uploadedById: auth.user.id,
          },
        });
        await tx.documentCapture.create({
          data: {
            documentId: document.id,
            fields: body.printed,
            capturedAt: clock.now(),
            capturedById: auth.user.id,
          },
        });
        await tx.attestationScan.update({
          where: { id },
          data: {
            status: 'FILED',
            documentId: document.id,
            closedAt: clock.now(),
            closedById: auth.user.id,
            version: { increment: 1 },
          },
        });
        await record(tx, auth, request, 'scan.filed', id, {
          customerId,
          vehicleId,
          contractId,
          documentId: document.id,
        });
      });
      return { scan: await this.get(id), contractId };
    },

    async discard(auth, request, id, { reason, version }) {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.attestationScan.updateMany({
          where: { id, version, status: 'PENDING' },
          data: {
            status: 'DISCARDED',
            closedAt: clock.now(),
            closedById: auth.user.id,
            discardReason: reason,
            version: { increment: 1 },
          },
        });
        if (count === 0) {
          await load(tx, id);
          throw conflict();
        }
        await record(tx, auth, request, 'scan.discarded', id, {});
      });
      return this.get(id);
    },
  };
}
