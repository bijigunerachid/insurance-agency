import { Router } from 'express';
import { HttpError } from '../../utils/httpError.js';

/**
 * Public: the sign-in page shows whose application this is. The name, the tagline and the
 * images only; the agency's identifiers stay behind sign-in (on the receipt).
 */
export function agencyRoutes({ config }) {
  const router = Router();
  router.get('/agency/brand', (req, res) => {
    res.json({
      name: config.AGENCY_NAME ?? null,
      tagline: config.AGENCY_TAGLINE ?? null,
      logo: Boolean(config.AGENCY_LOGO),
      icon: Boolean(config.AGENCY_ICON),
    });
  });
  const image = (setting) => (req, res) => {
    const file = config[setting];
    if (!file) throw new HttpError(404, 'NOT_FOUND', 'No image set.');
    // Checked at startup: a PNG or JPEG, sent as such, never sniffed as anything else.
    res.setHeader('Content-Type', file.type);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(file.bytes);
  };
  router.get('/agency/logo', image('AGENCY_LOGO'));
  router.get('/agency/icon', image('AGENCY_ICON'));
  return router;
}
