// --- ROUTES MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { AppError } from '../../utils/problem-details';

export const createRouteSchema = z.object({
  name: z.string().min(3).max(150),
  sportType: z.enum(['RUNNING', 'CYCLING', 'WALKING', 'HIKING']),
  distanceMeters: z.number().positive(),
  elevationGainMeters: z.number().default(0),
  difficulty: z.enum(['EASY', 'MODERATE', 'HARD', 'EXTREME']).default('MODERATE'),
  surfaceType: z.string().optional(),
  coordinates: z.array(z.object({ lat: z.number(), lon: z.number() })).min(2)
});

export const routesRouter = Router();

routesRouter.get('/', async (req, res, next) => {
  try {
    const list = await query(`
      SELECT id, name, sport_type, distance_meters, elevation_gain_meters, difficulty, surface_type,
             ST_AsGeoJSON(geom) as geojson, created_at
      FROM routes
      WHERE is_public = TRUE
      ORDER BY created_at DESC
      LIMIT 50
    `);
    res.json({ success: true, data: list.rows });
  } catch (e) { next(e); }
});

routesRouter.post('/', authenticate, validate({ body: createRouteSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const lineStringWkt = `SRID=4326;LINESTRING(${b.coordinates.map((c: any) => `${c.lon} ${c.lat}`).join(',')})`;

    const inserted = await query(`
      INSERT INTO routes (creator_id, name, sport_type, distance_meters, elevation_gain_meters, difficulty, surface_type, geom)
      VALUES ($1, $2, $3, $4, $5, $6, $7, ST_GeomFromEWKT($8))
      RETURNING id, name, sport_type, distance_meters, created_at
    `, [req.user!.userId, b.name, b.sportType, b.distanceMeters, b.elevationGainMeters, b.difficulty, b.surfaceType, lineStringWkt]);

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (e) { next(e); }
});
