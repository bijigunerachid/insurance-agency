import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import { toCsv, toXlsx } from '../../services/spreadsheet.js';
import { productionExportQuery, productionQuery } from './schemas.js';
import { createProductionService } from './service.js';

const FILE_TYPES = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * The état de production on screen and printed (every employee, an agent's own only), and its
 * Excel file (management, after a recent re-authentication, like every report export).
 */
export function productionRoutes({ prisma, audit, config, guards }) {
  const service = createProductionService({ prisma, audit, config });
  const { authorize, requireRecentAuth } = guards;
  const read = authorize(PERMISSIONS.PRODUCTION_READ);
  const exportFile = [read, authorize(PERMISSIONS.REPORTS_EXPORT), requireRecentAuth];
  const router = Router();

  router.get('/production', read, async (req, res) => {
    res.json(await service.build(req.auth, req, productionQuery.parse(req.query)));
  });
  router.get('/production/operators', read, async (req, res) => {
    res.json(await service.operators(req.auth));
  });
  router.get('/production/export', exportFile, async (req, res) => {
    const { format, ...query } = productionExportQuery.parse(req.query);
    const report = await service.build(req.auth, req, query);
    // The sheet's totals under the rows, as printed.
    const rows = [
      ...report.rows,
      {
        policyNumber: 'TOTAUX',
        premium: report.totals.premium,
        balance: report.totals.balance,
      },
      { policyNumber: 'ENCAISSEMENT', premium: report.totals.collected },
    ];
    const body =
      format === 'csv'
        ? toCsv(report.columns, rows)
        : toXlsx(report.columns, rows, 'État de production');
    await service.recordExport(req.auth, req, { ...query, format }, report.rows.length);
    res.setHeader('Content-Type', FILE_TYPES[format]);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="etat-production_${query.from}_${query.to}.${format}"`,
    );
    res.send(body);
  });
  return router;
}
