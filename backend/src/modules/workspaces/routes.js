import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../utils/httpError.js';

const imageParams = z.strictObject({
  code: z.string().regex(/^[A-Z0-9_-]{1,16}$/),
  image: z.enum(['logo', 'photo']),
});

/**
 * The workspace screen after sign-in: one card per active insurer of the catalogue, dressed with
 * the installation's branding file (INSURER_BRANDING_FILE). Choosing a card only filters the
 * lists on screen: every user may see every insurer, and each API still checks its permission.
 */
export function workspacesRoutes({ prisma, config, guards }) {
  const signedIn = guards.requireActive;
  const branding = config.INSURER_BRANDING ?? {};
  const router = Router();

  router.get('/workspaces', signedIn, async (req, res) => {
    const insurers = await prisma.insurer.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
    res.json({
      items: insurers.map((insurer) => {
        const brand = branding[insurer.code];
        return {
          id: insurer.id,
          code: insurer.code,
          name: insurer.name,
          title: brand?.title ?? insurer.name,
          tagline: brand?.tagline ?? null,
          colour: brand?.colour ?? null,
          photoCredit: brand?.photo ? (brand.photoCredit ?? null) : null,
          logo: Boolean(brand?.logo),
          photo: Boolean(brand?.photo),
        };
      }),
    });
  });

  router.get('/workspaces/:code/:image', signedIn, (req, res) => {
    const parsed = imageParams.safeParse(req.params);
    const file = parsed.success ? branding[parsed.data.code]?.[parsed.data.image] : null;
    if (!file) throw new HttpError(404, 'NOT_FOUND', 'No image set.');
    // Checked at startup: a PNG or JPEG, sent as such, never sniffed as anything else.
    res.setHeader('Content-Type', file.type);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(file.bytes);
  });
  return router;
}
