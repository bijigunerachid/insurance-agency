import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import {
  confirmBody,
  createInsurerBody,
  createModelBody,
  createProductBody,
  createRuleBody,
  createSeriesBody,
  createUsageBody,
  idParams,
  listProductsQuery,
  listRulesQuery,
  reviewRuleBody,
  updateInsurerBody,
  updateModelBody,
  updateProductBody,
  updateRuleBody,
  updateSeriesBody,
  updateUsageBody,
} from './schemas.js';
import { createCatalogueService } from './service.js';

/** Insurers, attestation models, vehicle usages, attestation series, products and the rules register. */
export function catalogueRoutes({ prisma, audit, clock, guards }) {
  const service = createCatalogueService({ prisma, audit, clock });
  const { authorize } = guards;
  const read = authorize(PERMISSIONS.CATALOGUE_READ);
  const manage = authorize(PERMISSIONS.CATALOGUE_MANAGE);
  const idOf = (req) => idParams.parse(req.params).id;
  const router = Router();

  // Each kind of entry gets: list, create, update and (when it has one) confirm.
  const crud = (path, { list, create, update, confirm }) => {
    router.get(path, read, async (req, res) => res.json({ items: await list(req) }));
    router.post(path, manage, async (req, res) => {
      res.status(201).json(await create(req.auth, req, create.schema.parse(req.body)));
    });
    router.patch(`${path}/:id`, manage, async (req, res) => {
      const id = idOf(req);
      res.json(await update(req.auth, req, id, update.schema.parse(req.body)));
    });
    if (confirm) {
      router.post(`${path}/:id/confirm`, manage, async (req, res) => {
        const id = idOf(req);
        res.json(await confirm(req.auth, req, id, confirmBody.parse(req.body)));
      });
    }
  };
  const withSchema = (fn, schema) => Object.assign(fn, { schema });

  crud('/insurers', {
    list: () => service.listInsurers(),
    create: withSchema(service.createInsurer.bind(service), createInsurerBody),
    update: withSchema(service.updateInsurer.bind(service), updateInsurerBody),
  });
  crud('/attestation-models', {
    list: () => service.listModels(),
    create: withSchema(service.createModel.bind(service), createModelBody),
    update: withSchema(service.updateModel.bind(service), updateModelBody),
    confirm: service.confirmModel,
  });
  crud('/vehicle-usages', {
    list: () => service.listUsages(),
    create: withSchema(service.createUsage.bind(service), createUsageBody),
    update: withSchema(service.updateUsage.bind(service), updateUsageBody),
    confirm: service.confirmUsage,
  });
  router.get('/insurer-usages', read, async (req, res) => {
    res.json({ items: await service.listInsurerUsages() });
  });
  crud('/attestation-series', {
    list: () => service.listSeries(),
    create: withSchema(service.createSeries.bind(service), createSeriesBody),
    update: withSchema(service.updateSeries.bind(service), updateSeriesBody),
    confirm: service.confirmSeries,
  });
  crud('/products', {
    list: (req) => service.listProducts(listProductsQuery.parse(req.query)),
    create: withSchema(service.createProduct.bind(service), createProductBody),
    update: withSchema(service.updateProduct.bind(service), updateProductBody),
    confirm: service.confirmProduct,
  });
  router.get('/products/:id', read, async (req, res) => {
    res.json(await service.getProduct(idOf(req)));
  });

  crud('/rules', {
    list: (req) => service.listRules(listRulesQuery.parse(req.query)),
    create: withSchema(service.createRule.bind(service), createRuleBody),
    update: withSchema(service.updateRule.bind(service), updateRuleBody),
  });
  router.get('/rules/:id', read, async (req, res) => {
    res.json(await service.getRule(idOf(req)));
  });
  router.post('/rules/:id/review', manage, async (req, res) => {
    const id = idOf(req);
    res.json(await service.reviewRule(req.auth, req, id, reviewRuleBody.parse(req.body)));
  });

  return router;
}
