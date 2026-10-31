import { HttpError } from '../../utils/httpError.js';
import { searchable } from '../../utils/identifiers.js';

/** Rule L1 (loi 17-99 art. 292): an agent represents at most two insurers. */
export const MAX_ACTIVE_INSURERS = 2;

const conflict = () =>
  new HttpError(
    409,
    'VERSION_CONFLICT',
    'Cet élément a été modifié entre-temps. Rechargez la page et recommencez.',
  );
const notFound = (what) => new HttpError(404, 'NOT_FOUND', `${what} introuvable.`);

const userName = { select: { id: true, displayName: true } };

/** Status, source and, once confirmed, who confirmed it, when and from which document. */
function verification(row) {
  return {
    status: row.status,
    source: row.source,
    confirmation:
      row.status === 'CONFIRMED'
        ? { at: row.confirmedAt, by: row.confirmedBy, reference: row.confirmationRef }
        : null,
  };
}

const CLEARED_CONFIRMATION = {
  status: 'TO_CONFIRM',
  confirmedAt: null,
  confirmedById: null,
  confirmationRef: null,
};

function insurerView(row) {
  return { id: row.id, code: row.code, name: row.name, active: row.active, version: row.version };
}

function modelView(row) {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    provisional: row.provisional,
    officialNumber: row.officialNumber,
    colour: row.colour,
    ...verification(row),
    active: row.active,
    version: row.version,
  };
}

const modelSummary = (model) =>
  model
    ? {
        code: model.code,
        label: model.label,
        provisional: model.provisional,
        status: model.status,
      }
    : null;

function usageView(row) {
  return {
    id: row.id,
    label: row.label,
    model: modelSummary(row.model),
    ...verification(row),
    active: row.active,
    vehicleCount: row._count?.vehicles,
    version: row.version,
  };
}

function seriesView(row) {
  return {
    id: row.id,
    insurer: { id: row.insurer.id, code: row.insurer.code, name: row.insurer.name },
    code: row.code,
    model: modelSummary(row.model),
    ...verification(row),
    active: row.active,
    version: row.version,
  };
}

function productView(row) {
  return {
    id: row.id,
    insurer: { id: row.insurer.id, code: row.insurer.code, name: row.insurer.name },
    line: row.line,
    name: row.name,
    insurerCode: row.insurerCode,
    description: row.description,
    ...verification(row),
    active: row.active,
    // A quote may only use an active, confirmed product (Phase 6 checks this again).
    usable: row.active && row.status === 'CONFIRMED',
    createdAt: row.createdAt,
    version: row.version,
  };
}

function ruleView(row) {
  return {
    id: row.id,
    code: row.code,
    insurer: row.insurer ? { id: row.insurer.id, code: row.insurer.code } : null,
    statement: row.statement,
    effect: row.effect,
    source: row.source,
    status: row.status,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy ?? null,
    version: row.version,
  };
}

/** Rules are listed in register order: L1, L2 … L10, then R…, then C… */
function compareRuleCodes(a, b) {
  const order = (code) => {
    const [, prefix, number] = /^([A-Z]+)(\d+)$/.exec(code);
    return [prefix === 'L' ? '0' : prefix, Number(number)];
  };
  const [pa, na] = order(a.code);
  const [pb, nb] = order(b.code);
  return pa === pb ? na - nb : pa.localeCompare(pb);
}

const changedFields = (current, changes, fields) =>
  fields.filter((field) => changes[field] !== undefined && changes[field] !== current[field]);

export function createCatalogueService({ prisma, audit, clock }) {
  const record = (tx, auth, request, action, entityType, entityId, details) =>
    audit.record({ actorUserId: auth.user.id, action, entityType, entityId, request, details }, tx);

  async function updateVersioned(tx, model, id, version, data) {
    const { count } = await tx[model].updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) throw conflict();
  }

  /** A unique index refused the row: a concurrent request created the same entry. */
  function mapUnique(err, code, message) {
    return err?.code === 'P2002' ? new HttpError(409, code, message) : err;
  }

  async function assertInsurerLimit(tx, excludeId, confirmLimit) {
    const active = await tx.insurer.count({
      where: { active: true, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });
    if (active >= MAX_ACTIVE_INSURERS && !confirmLimit) {
      throw new HttpError(
        409,
        'INSURER_LIMIT',
        'Un agent ne peut représenter que deux assureurs (règle L1). Confirmez pour continuer.',
        { activeCount: active, max: MAX_ACTIVE_INSURERS },
      );
    }
    return active >= MAX_ACTIVE_INSURERS;
  }

  /**
   * Shared behaviour of the entries that need confirmation (usages, series, products):
   * editing what was confirmed makes the entry "to confirm" again.
   */
  function verifiedEntries({ model, entityType, what, substantive, load, toView, beforeConfirm }) {
    return {
      async update(auth, request, id, body, extraCheck) {
        const { version, ...changes } = body;
        await prisma.$transaction(async (tx) => {
          const current = await load(tx, id);
          if (extraCheck) await extraCheck(tx, current, changes);
          const changed = changedFields(current, changes, [...substantive, 'source', 'active']);
          const data = Object.fromEntries(changed.map((field) => [field, changes[field]]));
          const cleared =
            current.status === 'CONFIRMED' && changed.some((f) => substantive.includes(f));
          await updateVersioned(tx, model, id, version, {
            ...data,
            ...(cleared ? CLEARED_CONFIRMATION : {}),
          });
          await record(tx, auth, request, `${entityType}.updated`, entityType, id, {
            fields: changed,
            ...(cleared ? { confirmationCleared: true } : {}),
          });
        });
        return toView(await load(prisma, id));
      },

      async confirm(auth, request, id, { reference, version }) {
        await prisma.$transaction(async (tx) => {
          const current = await load(tx, id);
          if (current.status === 'CONFIRMED') {
            throw new HttpError(409, 'ALREADY_CONFIRMED', `${what} déjà confirmé(e).`);
          }
          if (beforeConfirm) await beforeConfirm(tx, current);
          await updateVersioned(tx, model, id, version, {
            status: 'CONFIRMED',
            confirmedAt: clock.now(),
            confirmedById: auth.user.id,
            confirmationRef: reference,
          });
          await record(tx, auth, request, `${entityType}.confirmed`, entityType, id, {
            reference,
          });
        });
        return toView(await load(prisma, id));
      },
    };
  }

  // --- Attestation models -----------------------------------------------------
  async function loadModel(client, id) {
    const row = await client.attestationModel.findUnique({
      where: { id },
      include: { confirmedBy: userName },
    });
    if (!row) throw notFound('Modèle');
    return row;
  }
  const models = verifiedEntries({
    model: 'attestationModel',
    entityType: 'attestation_model',
    what: 'Modèle',
    substantive: ['label', 'officialNumber', 'colour'],
    load: loadModel,
    toView: modelView,
  });

  /**
   * A new link to a model (usage or series) needs an active one; a usage never takes the
   * provisional model P. Existing links are kept when a model is later deactivated.
   */
  async function checkModelLink(tx, code, { path, forUsage }) {
    const model = await tx.attestationModel.findUnique({ where: { code } });
    const rule = !model
      ? 'UNKNOWN_MODEL'
      : !model.active
        ? 'MODEL_INACTIVE'
        : forUsage && model.provisional
          ? 'MODEL_PROVISIONAL'
          : null;
    if (rule) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Données invalides.', [{ path, rule }]);
    }
  }
  const modelNotConfirmed = (message) => new HttpError(409, 'MODEL_NOT_CONFIRMED', message);

  // --- Vehicle usages ---------------------------------------------------------
  const usageInclude = {
    model: true,
    confirmedBy: userName,
    _count: { select: { vehicles: { where: { archivedAt: null } } } },
  };
  async function loadUsage(client, id) {
    const row = await client.vehicleUsage.findUnique({ where: { id }, include: usageInclude });
    if (!row) throw notFound('Usage');
    return row;
  }
  const usages = verifiedEntries({
    model: 'vehicleUsage',
    entityType: 'vehicle_usage',
    what: 'Usage',
    substantive: ['label', 'modelCode'],
    load: loadUsage,
    toView: usageView,
    // The usage determines the attestation model: it is only as certain as that model.
    async beforeConfirm(tx, current) {
      if (current.model?.status !== 'CONFIRMED') {
        throw modelNotConfirmed(
          'Indiquez d’abord le modèle d’attestation de cet usage, et confirmez ce modèle.',
        );
      }
    },
  });

  // --- Attestation series -----------------------------------------------------
  const seriesInclude = { insurer: true, model: true, confirmedBy: userName };
  /** The model offered by default: the letter of the code ("14 A" → A). Chosen freely after. */
  const modelOf = (code) => code.slice(-1);
  async function loadSeries(client, id) {
    const row = await client.attestationSeries.findUnique({
      where: { id },
      include: seriesInclude,
    });
    if (!row) throw notFound('Série');
    return row;
  }
  const series = verifiedEntries({
    model: 'attestationSeries',
    entityType: 'attestation_series',
    what: 'Série',
    substantive: ['code', 'modelCode'],
    load: loadSeries,
    toView: seriesView,
    // A series is only as certain as the model printed on it.
    async beforeConfirm(tx, current) {
      if (current.model.status !== 'CONFIRMED') {
        throw modelNotConfirmed('Confirmez d’abord le modèle d’attestation de cette série.');
      }
    },
  });

  // --- Products ---------------------------------------------------------------
  const productInclude = { insurer: true, confirmedBy: userName };
  async function loadProduct(client, id) {
    const row = await client.product.findUnique({ where: { id }, include: productInclude });
    if (!row) throw notFound('Produit');
    return row;
  }
  const products = verifiedEntries({
    model: 'product',
    entityType: 'product',
    what: 'Produit',
    substantive: ['line', 'name', 'insurerCode', 'description'],
    load: loadProduct,
    toView: productView,
    async beforeConfirm(tx, current) {
      if (!current.insurer.active) {
        throw new HttpError(409, 'INSURER_INACTIVE', 'L’assureur de ce produit est désactivé.');
      }
    },
  });

  async function activeInsurer(tx, insurerId) {
    const insurer = await tx.insurer.findUnique({ where: { id: insurerId } });
    if (!insurer) throw notFound('Assureur');
    if (!insurer.active) {
      throw new HttpError(409, 'INSURER_INACTIVE', 'Cet assureur est désactivé.');
    }
    return insurer;
  }

  // --- Rules ------------------------------------------------------------------
  const ruleInclude = { insurer: true, reviewedBy: userName };
  async function loadRule(client, id) {
    const row = await client.insurerRule.findUnique({ where: { id }, include: ruleInclude });
    if (!row) throw notFound('Règle');
    return row;
  }

  return {
    // --- Insurers -------------------------------------------------------------
    async listInsurers() {
      const rows = await prisma.insurer.findMany({ orderBy: { code: 'asc' } });
      return rows.map(insurerView);
    },

    async createInsurer(auth, request, { code, name, confirmLimit }) {
      try {
        return await prisma.$transaction(async (tx) => {
          if (await tx.insurer.findFirst({ where: { OR: [{ code }, { name }] } })) {
            throw new HttpError(409, 'DUPLICATE_INSURER', 'Cet assureur existe déjà.');
          }
          const overLimit = await assertInsurerLimit(tx, null, confirmLimit);
          const insurer = await tx.insurer.create({ data: { code, name } });
          await record(tx, auth, request, 'insurer.created', 'insurer', insurer.id, {
            code,
            ...(overLimit ? { limitOverridden: true } : {}),
          });
          return insurerView(insurer);
        });
      } catch (err) {
        throw mapUnique(err, 'DUPLICATE_INSURER', 'Cet assureur existe déjà.');
      }
    },

    async updateInsurer(auth, request, id, { version, confirmLimit, ...changes }) {
      try {
        return await prisma.$transaction(async (tx) => {
          const current = await tx.insurer.findUnique({ where: { id } });
          if (!current) throw notFound('Assureur');
          const changed = changedFields(current, changes, ['name', 'active']);
          if (changes.name && changed.includes('name')) {
            const clash = await tx.insurer.findUnique({ where: { name: changes.name } });
            if (clash) throw new HttpError(409, 'DUPLICATE_INSURER', 'Cet assureur existe déjà.');
          }
          const overLimit =
            changed.includes('active') && changes.active
              ? await assertInsurerLimit(tx, id, confirmLimit)
              : false;
          await updateVersioned(
            tx,
            'insurer',
            id,
            version,
            Object.fromEntries(changed.map((field) => [field, changes[field]])),
          );
          await record(tx, auth, request, 'insurer.updated', 'insurer', id, {
            fields: changed,
            ...(overLimit ? { limitOverridden: true } : {}),
          });
          return insurerView(await tx.insurer.findUnique({ where: { id } }));
        });
      } catch (err) {
        throw mapUnique(err, 'DUPLICATE_INSURER', 'Cet assureur existe déjà.');
      }
    },

    // --- Attestation models ---------------------------------------------------
    async listModels() {
      const rows = await prisma.attestationModel.findMany({
        include: { confirmedBy: userName },
        orderBy: { code: 'asc' },
      });
      return rows.map(modelView);
    },

    async createModel(auth, request, body) {
      try {
        const id = await prisma.$transaction(async (tx) => {
          const clash = await tx.attestationModel.findFirst({
            where: {
              OR: [
                { code: body.code },
                { label: body.label },
                ...(body.officialNumber ? [{ officialNumber: body.officialNumber }] : []),
              ],
            },
          });
          if (clash) throw new HttpError(409, 'DUPLICATE_MODEL', 'Ce modèle existe déjà.');
          const row = await tx.attestationModel.create({ data: body });
          await record(
            tx,
            auth,
            request,
            'attestation_model.created',
            'attestation_model',
            row.id,
            {
              code: body.code,
            },
          );
          return row.id;
        });
        return modelView(await loadModel(prisma, id));
      } catch (err) {
        throw mapUnique(err, 'DUPLICATE_MODEL', 'Ce modèle existe déjà.');
      }
    },

    async updateModel(auth, request, id, body) {
      try {
        return await models.update(auth, request, id, body, async (tx, current, changes) => {
          if (changes.label && changes.label !== current.label) {
            if (await tx.attestationModel.findUnique({ where: { label: changes.label } })) {
              throw new HttpError(409, 'DUPLICATE_MODEL', 'Ce modèle existe déjà.');
            }
          }
          const number = changes.officialNumber;
          if (number && number !== current.officialNumber) {
            if (await tx.attestationModel.findUnique({ where: { officialNumber: number } })) {
              throw new HttpError(409, 'DUPLICATE_MODEL', 'Ce modèle existe déjà.');
            }
          }
        });
      } catch (err) {
        throw mapUnique(err, 'DUPLICATE_MODEL', 'Ce modèle existe déjà.');
      }
    },

    confirmModel: models.confirm,

    // --- Vehicle usages -------------------------------------------------------
    async listUsages() {
      const rows = await prisma.vehicleUsage.findMany({
        include: usageInclude,
        orderBy: { label: 'asc' },
      });
      return rows.map(usageView);
    },

    /**
     * The insurers' own usages (RMA GAMA « Type d'usage »), in the platform's order, each with the
     * legal usage it belongs to. Reference data: read only.
     */
    async listInsurerUsages() {
      const rows = await prisma.insurerUsage.findMany({
        include: {
          insurer: { select: { id: true, code: true } },
          usage: { select: { id: true, label: true, modelCode: true } },
          _count: { select: { vehicles: true } },
        },
        orderBy: [{ insurer: { code: 'asc' } }, { sortOrder: 'asc' }],
      });
      return rows.map((row) => ({
        id: row.id,
        insurer: row.insurer,
        group: row.groupLabel,
        label: row.label,
        usage: row.usage,
        active: row.active,
        vehicleCount: row._count.vehicles,
      }));
    },

    async createUsage(auth, request, { label, modelCode, source }) {
      try {
        const id = await prisma.$transaction(async (tx) => {
          if (await tx.vehicleUsage.findUnique({ where: { label } })) {
            throw new HttpError(409, 'DUPLICATE_USAGE', 'Cet usage existe déjà.');
          }
          if (modelCode) {
            await checkModelLink(tx, modelCode, { path: 'modelCode', forUsage: true });
          }
          const usage = await tx.vehicleUsage.create({
            data: { label, modelCode: modelCode ?? null, source },
          });
          await record(tx, auth, request, 'vehicle_usage.created', 'vehicle_usage', usage.id);
          return usage.id;
        });
        return usageView(await loadUsage(prisma, id));
      } catch (err) {
        throw mapUnique(err, 'DUPLICATE_USAGE', 'Cet usage existe déjà.');
      }
    },

    async updateUsage(auth, request, id, body) {
      try {
        return await usages.update(auth, request, id, body, async (tx, current, changes) => {
          if (changes.label && changes.label !== current.label) {
            if (await tx.vehicleUsage.findUnique({ where: { label: changes.label } })) {
              throw new HttpError(409, 'DUPLICATE_USAGE', 'Cet usage existe déjà.');
            }
          }
          if (changes.modelCode && changes.modelCode !== current.modelCode) {
            await checkModelLink(tx, changes.modelCode, { path: 'modelCode', forUsage: true });
          }
        });
      } catch (err) {
        throw mapUnique(err, 'DUPLICATE_USAGE', 'Cet usage existe déjà.');
      }
    },

    confirmUsage: usages.confirm,

    // --- Attestation series ---------------------------------------------------
    async listSeries() {
      const rows = await prisma.attestationSeries.findMany({
        include: seriesInclude,
        orderBy: [{ insurer: { code: 'asc' } }, { code: 'asc' }],
      });
      return rows.map(seriesView);
    },

    async createSeries(auth, request, { modelCode: chosen, ...body }) {
      const modelCode = chosen ?? modelOf(body.code);
      try {
        const id = await prisma.$transaction(async (tx) => {
          await activeInsurer(tx, body.insurerId);
          await checkModelLink(tx, modelCode, { path: chosen ? 'modelCode' : 'code' });
          const exists = await tx.attestationSeries.findUnique({
            where: { insurerId_code: { insurerId: body.insurerId, code: body.code } },
          });
          if (exists) {
            throw new HttpError(409, 'DUPLICATE_SERIES', 'Cet assureur a déjà cette série.');
          }
          const row = await tx.attestationSeries.create({ data: { ...body, modelCode } });
          await record(
            tx,
            auth,
            request,
            'attestation_series.created',
            'attestation_series',
            row.id,
            {
              code: body.code,
              model: modelCode,
            },
          );
          return row.id;
        });
        return seriesView(await loadSeries(prisma, id));
      } catch (err) {
        throw mapUnique(err, 'DUPLICATE_SERIES', 'Cet assureur a déjà cette série.');
      }
    },

    /** The model changes only when it is chosen; a new code keeps the current model. */
    async updateSeries(auth, request, id, changes) {
      try {
        return await series.update(auth, request, id, changes, async (tx, current) => {
          if (changes.modelCode && changes.modelCode !== current.modelCode) {
            await checkModelLink(tx, changes.modelCode, { path: 'modelCode' });
          }
          if (changes.code && changes.code !== current.code) {
            const clash = await tx.attestationSeries.findUnique({
              where: { insurerId_code: { insurerId: current.insurerId, code: changes.code } },
            });
            if (clash) {
              throw new HttpError(409, 'DUPLICATE_SERIES', 'Cet assureur a déjà cette série.');
            }
          }
        });
      } catch (err) {
        throw mapUnique(err, 'DUPLICATE_SERIES', 'Cet assureur a déjà cette série.');
      }
    },

    confirmSeries: series.confirm,

    // --- Products -------------------------------------------------------------
    async listProducts({ insurerId, line, status, active, q }) {
      const where = {
        ...(insurerId ? { insurerId } : {}),
        ...(line ? { line } : {}),
        ...(status ? { status } : {}),
        ...(active === 'active' ? { active: true } : {}),
        ...(active === 'inactive' ? { active: false } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { insurerCode: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const rows = await prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [{ insurer: { code: 'asc' } }, { name: 'asc' }],
      });
      return rows.map(productView);
    },

    async getProduct(id) {
      return productView(await loadProduct(prisma, id));
    },

    async createProduct(auth, request, body) {
      try {
        const id = await prisma.$transaction(async (tx) => {
          await activeInsurer(tx, body.insurerId);
          const exists = await tx.product.findUnique({
            where: { insurerId_name: { insurerId: body.insurerId, name: body.name } },
          });
          if (exists) {
            throw new HttpError(
              409,
              'DUPLICATE_PRODUCT',
              'Cet assureur a déjà un produit de ce nom.',
            );
          }
          const product = await tx.product.create({ data: body });
          await record(tx, auth, request, 'product.created', 'product', product.id, {
            line: body.line,
          });
          return product.id;
        });
        return productView(await loadProduct(prisma, id));
      } catch (err) {
        throw mapUnique(err, 'DUPLICATE_PRODUCT', 'Cet assureur a déjà un produit de ce nom.');
      }
    },

    async updateProduct(auth, request, id, body) {
      try {
        return await products.update(auth, request, id, body, async (tx, current, changes) => {
          if (changes.name && changes.name !== current.name) {
            const clash = await tx.product.findUnique({
              where: { insurerId_name: { insurerId: current.insurerId, name: changes.name } },
            });
            if (clash) {
              throw new HttpError(
                409,
                'DUPLICATE_PRODUCT',
                'Cet assureur a déjà un produit de ce nom.',
              );
            }
          }
        });
      } catch (err) {
        throw mapUnique(err, 'DUPLICATE_PRODUCT', 'Cet assureur a déjà un produit de ce nom.');
      }
    },

    confirmProduct: products.confirm,

    // --- Rules register -------------------------------------------------------
    async listRules({ insurer, status, q }) {
      const where = {
        ...(insurer === 'GENERAL' ? { insurerId: null } : {}),
        ...(insurer && insurer !== 'GENERAL' ? { insurer: { code: insurer } } : {}),
        ...(status ? { status } : {}),
      };
      const rows = await prisma.insurerRule.findMany({ where, include: ruleInclude });
      // Accent-insensitive text search over a register of a few dozen rows.
      const needle = q ? searchable(q) : null;
      return rows
        .filter(
          (row) =>
            !needle ||
            searchable(`${row.code} ${row.statement} ${row.effect} ${row.source}`).includes(needle),
        )
        .sort(compareRuleCodes)
        .map(ruleView);
    },

    async getRule(id) {
      const rule = await loadRule(prisma, id);
      const reviews = await prisma.ruleReview.findMany({
        where: { ruleId: id },
        include: { reviewer: userName },
        orderBy: { id: 'desc' },
      });
      return {
        ...ruleView(rule),
        reviews: reviews.map((review) => ({
          id: String(review.id),
          at: review.at,
          fromStatus: review.fromStatus,
          toStatus: review.toStatus,
          note: review.note,
          reference: review.reference,
          reviewer: review.reviewer,
        })),
      };
    },

    async createRule(auth, request, { insurerId, ...body }) {
      try {
        const id = await prisma.$transaction(async (tx) => {
          if (await tx.insurerRule.findUnique({ where: { code: body.code } })) {
            throw new HttpError(409, 'DUPLICATE_RULE', 'Une règle porte déjà ce code.');
          }
          if (insurerId && !(await tx.insurer.findUnique({ where: { id: insurerId } }))) {
            throw notFound('Assureur');
          }
          const rule = await tx.insurerRule.create({
            data: { ...body, insurerId: insurerId ?? null },
          });
          await record(tx, auth, request, 'rule.created', 'insurer_rule', rule.id, {
            code: body.code,
            status: body.status,
          });
          return rule.id;
        });
        return this.getRule(id);
      } catch (err) {
        throw mapUnique(err, 'DUPLICATE_RULE', 'Une règle porte déjà ce code.');
      }
    },

    async updateRule(auth, request, id, { version, ...changes }) {
      await prisma.$transaction(async (tx) => {
        const current = await loadRule(tx, id);
        // The confirmation covered this exact text.
        if (current.status === 'CONFIRMED') {
          throw new HttpError(
            409,
            'RULE_CONFIRMED',
            'Une règle confirmée ne se modifie pas : enregistrez d’abord une revue qui change son statut.',
          );
        }
        const changed = changedFields(current, changes, ['statement', 'effect', 'source']);
        await updateVersioned(
          tx,
          'insurerRule',
          id,
          version,
          Object.fromEntries(changed.map((field) => [field, changes[field]])),
        );
        await record(tx, auth, request, 'rule.updated', 'insurer_rule', id, { fields: changed });
      });
      return this.getRule(id);
    },

    async reviewRule(auth, request, id, { status, note, reference, version }) {
      await prisma.$transaction(async (tx) => {
        const current = await loadRule(tx, id);
        const at = clock.now();
        await updateVersioned(tx, 'insurerRule', id, version, {
          status,
          reviewedAt: at,
          reviewedById: auth.user.id,
        });
        await tx.ruleReview.create({
          data: {
            ruleId: id,
            fromStatus: current.status,
            toStatus: status,
            note,
            reference: reference ?? null,
            reviewerId: auth.user.id,
            at,
          },
        });
        await record(tx, auth, request, 'rule.reviewed', 'insurer_rule', id, {
          code: current.code,
          from: current.status,
          to: status,
        });
      });
      return this.getRule(id);
    },
  };
}
