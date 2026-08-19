// --- PRIVACY MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';

export const updatePrivacySchema = z.object({
  defaultActivityPrivacy: z.enum(['PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE']).optional(),
  hideHeartRate: z.boolean().optional(),
  hidePower: z.boolean().optional(),
  privacyZonesEnabled: z.boolean().optional(),
  homeZoneRadiusMeters: z.number().min(100).max(5000).optional(),
  homeLat: z.number().optional(),
  homeLon: z.number().optional()
});

export const privacyRouter = Router();

privacyRouter.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await query('SELECT * FROM privacy_settings WHERE user_id = $1', [req.user!.userId]);
    res.json({ success: true, data: result.rows[0] });
  } catch (e) { next(e); }
});

privacyRouter.patch('/me', authenticate, validate({ body: updatePrivacySchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    let homeGeomSql = 'home_zone_center';
    const params: any[] = [
      b.defaultActivityPrivacy,
      b.hideHeartRate,
      b.hidePower,
      b.privacyZonesEnabled,
      b.homeZoneRadiusMeters,
      req.user!.userId
    ];

    if (b.homeLat !== undefined && b.homeLon !== undefined) {
      params.push(b.homeLon, b.homeLat);
      homeGeomSql = `ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}), 4326)`;
    }

    const updated = await query(`
      UPDATE privacy_settings
      SET default_activity_privacy = COALESCE($1, default_activity_privacy),
          hide_heart_rate = COALESCE($2, hide_heart_rate),
          hide_power = COALESCE($3, hide_power),
          privacy_zones_enabled = COALESCE($4, privacy_zones_enabled),
          home_zone_radius_meters = COALESCE($5, home_zone_radius_meters),
          home_zone_center = ${homeGeomSql},
          updated_at = NOW()
      WHERE user_id = $6
      RETURNING *
    `, params);

    res.json({ success: true, data: updated.rows[0] });
  } catch (e) { next(e); }
});
