import { Router } from 'express';
import { z } from 'zod';
import { createTodayService } from './service.js';

const searchQuery = z.strictObject({ q: z.string().trim().min(2).max(80) });

/** The home page: one search and the to-do list (each part limited by the person's rights). */
export function todayRoutes({ prisma, audit, clock, config, guards }) {
  const service = createTodayService({ prisma, audit, clock, config });
  const signedIn = guards.requireActive;
  const router = Router();

  router.get('/today', signedIn, async (req, res) => {
    res.json(await service.todo(req.auth));
  });
  router.get('/search', signedIn, async (req, res) => {
    res.json(await service.search(req.auth, searchQuery.parse(req.query).q));
  });
  return router;
}
