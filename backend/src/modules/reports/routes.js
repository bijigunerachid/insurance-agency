import { Router } from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import { toCsv, toXlsx } from '../../services/spreadsheet.js';
import { exportQuery, reportParams, reportQuery } from './schemas.js';
import { REPORTS, createReportsService } from './service.js';

const FILE_TYPES = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** The agency's reports; exports for management only, after a recent re-authentication. */
export function reportsRoutes({ prisma, audit, clock, config, guards }) {
  const service = createReportsService({ prisma, audit, clock, config });
  const { authorize, requireRecentAuth } = guards;
  const read = authorize(PERMISSIONS.REPORTS_READ);
  // Exports take personal data out of the application (security.md §4).
  const exportFile = [authorize(PERMISSIONS.REPORTS_EXPORT), requireRecentAuth];
  const router = Router();

  router.get('/reports', read, (req, res) => {
    res.json({ items: Object.entries(REPORTS).map(([name, title]) => ({ name, title })) });
  });
  router.get('/reports/:name', read, async (req, res) => {
    const { name } = reportParams.parse(req.params);
    res.json(await service.build(name, reportQuery.parse(req.query)));
  });
  router.get('/reports/:name/export', exportFile, async (req, res) => {
    const { name } = reportParams.parse(req.params);
    const { from, to, format } = exportQuery.parse(req.query);
    const report = await service.build(name, { from, to });
    const body =
      format === 'csv'
        ? toCsv(report.columns, report.rows)
        : toXlsx(report.columns, report.rows, report.title);
    await service.recordExport(req.auth, req, name, { from, to, format, rows: report.rows.length });
    res.setHeader('Content-Type', FILE_TYPES[format]);
    res.setHeader('Content-Disposition', `attachment; filename="${name}_${from}_${to}.${format}"`);
    res.send(body);
  });
  return router;
}
