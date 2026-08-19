// --- GPS TRACKS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { AppError } from '../../utils/problem-details';

export const gpsTracksRouter = Router();

gpsTracksRouter.get('/:activityId/points', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pointsRes = await query(`
      SELECT point_index, timestamp, ST_X(coordinate::geometry) as lon, ST_Y(coordinate::geometry) as lat,
             ST_Z(coordinate::geometry) as alt, speed_mps, accuracy_meters, heart_rate, cadence, power_watts, is_estimated
      FROM activity_raw_points
      WHERE activity_id = $1
      ORDER BY point_index ASC
    `, [req.params.activityId]);

    res.json({ success: true, count: pointsRes.rows.length, data: pointsRes.rows });
  } catch (e) { next(e); }
});
