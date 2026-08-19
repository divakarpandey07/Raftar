// --- SEGMENTS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { AppError } from '../../utils/problem-details';

export const segmentsRouter = Router();

const createSegmentSchema = z.object({
  name: z.string().min(3).max(150),
  sportType: z.enum(['RUNNING', 'CYCLING', 'WALKING', 'HIKING']),
  distanceMeters: z.number().positive(),
  avgGradePct: z.number().optional().default(0),
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  endLat: z.number().min(-90).max(90),
  endLng: z.number().min(-180).max(180),
  linestringGeoJson: z.string()
});

segmentsRouter.post('/', authenticate, validate({ body: createSegmentSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, sportType, distanceMeters, avgGradePct, startLat, startLng, endLat, endLng, linestringGeoJson } = req.body;

    const result = await query(`
      INSERT INTO segments (name, sport_type, distance_meters, avg_grade_pct, geom, start_point, end_point)
      VALUES (
        $1, $2, $3, $4,
        ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
        ST_SetSRID(ST_MakePoint($6, $7), 4326),
        ST_SetSRID(ST_MakePoint($8, $9), 4326)
      )
      RETURNING id, name, sport_type, distance_meters, avg_grade_pct, created_at
    `, [name, sportType, distanceMeters, avgGradePct, linestringGeoJson, startLng, startLat, endLng, endLat]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (e) { next(e); }
});

segmentsRouter.get('/nearby', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);
    const radius = parseFloat(req.query.radius as string || '5000');

    if (isNaN(lat) || isNaN(lon)) {
      throw AppError.badRequest('Query parameters lat and lon are required');
    }

    const segmentsRes = await query(`
      SELECT id, name, sport_type, distance_meters, avg_grade_pct,
             ST_Distance(start_point::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance_to_start
      FROM segments
      WHERE ST_DWithin(start_point::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
      ORDER BY distance_to_start ASC
      LIMIT 20
    `, [lon, lat, radius]);

    res.json({ success: true, data: segmentsRes.rows });
  } catch (e) { next(e); }
});

segmentsRouter.get('/:id/leaderboard', async (req, res, next) => {
  try {
    const lbRes = await query(`
      SELECT e.id, e.user_id, p.display_name, p.handle, p.avatar_url,
             e.elapsed_time_seconds, e.avg_speed_mps, e.recorded_at,
             DENSE_RANK() OVER (ORDER BY e.elapsed_time_seconds ASC) as rank
      FROM segment_efforts e
      JOIN profiles p ON e.user_id = p.user_id
      WHERE e.segment_id = $1
      ORDER BY e.elapsed_time_seconds ASC
      LIMIT 50
    `, [req.params.id]);

    res.json({ success: true, data: lbRes.rows });
  } catch (e) { next(e); }
});
