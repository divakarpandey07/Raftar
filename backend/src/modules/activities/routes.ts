// --- ACTIVITIES MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { AppError } from '../../utils/problem-details';

export const updateActivitySchema = z.object({
  title: z.string().min(1).max(150).optional(),
  description: z.string().max(2000).optional(),
  privacy: z.enum(['PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE']).optional()
});

export const activitiesRouter = Router();

activitiesRouter.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit as string || '20', 10));
    const offset = parseInt(req.query.offset as string || '0', 10);

    const result = await query(`
      SELECT a.id, a.client_local_id, a.sport_type, a.title, a.privacy, a.start_time, a.end_time,
             m.distance_meters, m.elapsed_duration_seconds, m.moving_duration_seconds,
             m.avg_pace_sec_km, m.elevation_gain_meters, m.calories_burned, m.avg_hr, m.tss_score
      FROM activities a
      JOIN activity_metrics m ON a.id = m.activity_id
      WHERE a.user_id = $1
      ORDER BY a.start_time DESC
      LIMIT $2 OFFSET $3
    `, [req.user!.userId, limit, offset]);

    res.json({ success: true, data: result.rows });
  } catch (e) { next(e); }
});

activitiesRouter.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const actRes = await query(`
      SELECT a.*, m.distance_meters, m.elapsed_duration_seconds, m.moving_duration_seconds,
             m.avg_speed_mps, m.max_speed_mps, m.avg_pace_sec_km, m.elevation_gain_meters,
             m.elevation_loss_meters, m.calories_burned, m.avg_hr, m.max_hr, m.tss_score,
             ST_AsGeoJSON(a.route_geom) as route_geojson
      FROM activities a
      JOIN activity_metrics m ON a.id = m.activity_id
      WHERE a.id = $1
    `, [req.params.id]);

    if (actRes.rows.length === 0) throw AppError.notFound('Activity not found');

    const activity = actRes.rows[0];

    // Privacy check
    if (activity.privacy === 'PRIVATE' && activity.user_id !== req.user!.userId) {
      throw AppError.forbidden('This activity is private');
    }

    const splitsRes = await query(
      'SELECT * FROM activity_splits WHERE activity_id = $1 ORDER BY split_number ASC',
      [req.params.id]
    );

    activity.splits = splitsRes.rows;
    res.json({ success: true, data: activity });
  } catch (e) { next(e); }
});

activitiesRouter.patch('/:id', authenticate, validate({ body: updateActivitySchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const updated = await query(`
      UPDATE activities
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          privacy = COALESCE($3, privacy),
          updated_at = NOW()
      WHERE id = $4 AND user_id = $5
      RETURNING *
    `, [b.title, b.description, b.privacy, req.params.id, req.user!.userId]);

    if (updated.rows.length === 0) throw AppError.notFound('Activity not found or unauthorized');
    res.json({ success: true, data: updated.rows[0] });
  } catch (e) { next(e); }
});

activitiesRouter.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const deleted = await query('DELETE FROM activities WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user!.userId]);
    if (deleted.rows.length === 0) throw AppError.notFound('Activity not found or unauthorized');
    res.json({ success: true, message: 'Activity deleted' });
  } catch (e) { next(e); }
});
