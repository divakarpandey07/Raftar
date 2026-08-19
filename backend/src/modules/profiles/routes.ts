// --- PROFILES MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { AppError } from '../../utils/problem-details';

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  weightKg: z.number().min(30).max(300).optional(),
  heightCm: z.number().min(100).max(250).optional(),
  restingHr: z.number().min(30).max(120).optional(),
  maxHr: z.number().min(100).max(240).optional(),
  vo2Max: z.number().min(15).max(95).optional()
});

export const profilesRouter = Router();

profilesRouter.patch('/me', authenticate, validate({ body: updateProfileSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const resUpdate = await query(`
      UPDATE profiles
      SET display_name = COALESCE($1, display_name),
          bio = COALESCE($2, bio),
          avatar_url = COALESCE($3, avatar_url),
          weight_kg = COALESCE($4, weight_kg),
          height_cm = COALESCE($5, height_cm),
          resting_hr = COALESCE($6, resting_hr),
          max_hr = COALESCE($7, max_hr),
          vo2_max = COALESCE($8, vo2_max),
          updated_at = NOW()
      WHERE user_id = $9
      RETURNING *
    `, [b.displayName, b.bio, b.avatarUrl, b.weightKg, b.heightCm, b.restingHr, b.maxHr, b.vo2Max, req.user!.userId]);

    res.json({ success: true, data: resUpdate.rows[0] });
  } catch (e) { next(e); }
});

profilesRouter.get('/:id', async (req, res, next) => {
  try {
    const profileRes = await query(`
      SELECT p.user_id, p.display_name, p.handle, p.avatar_url, p.bio, p.level_tier,
             p.vo2_max, p.created_at,
             COALESCE(SUM(m.distance_meters), 0) as lifetime_distance_meters,
             COALESCE(SUM(m.elapsed_duration_seconds), 0) as total_duration_seconds,
             COALESCE(SUM(m.elevation_gain_meters), 0) as total_elevation_gain_meters
      FROM profiles p
      LEFT JOIN activities a ON p.user_id = a.user_id AND a.privacy = 'PUBLIC'
      LEFT JOIN activity_metrics m ON a.id = m.activity_id
      WHERE p.user_id = $1
      GROUP BY p.user_id
    `, [req.params.id]);

    if (profileRes.rows.length === 0) throw AppError.notFound('Athlete profile not found');
    res.json({ success: true, data: profileRes.rows[0] });
  } catch (e) { next(e); }
});
