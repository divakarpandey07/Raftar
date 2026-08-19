// --- ANALYTICS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';

export const analyticsRouter = Router();

analyticsRouter.get('/overview', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    // Get weekly TSS & training load
    const weeklyRes = await query(`
      SELECT COALESCE(SUM(m.tss_score), 0) as weekly_tss,
             COALESCE(SUM(m.distance_meters), 0) as weekly_distance_meters,
             COALESCE(SUM(m.moving_duration_seconds), 0) as weekly_duration_seconds,
             COUNT(a.id) as weekly_activity_count
      FROM activities a
      JOIN activity_metrics m ON a.id = m.activity_id
      WHERE a.user_id = $1 AND a.start_time >= NOW() - INTERVAL '7 days'
    `, [userId]);

    // Daily breakdown for the past 7 days (Monday - Sunday)
    const dailyRes = await query(`
      SELECT TO_CHAR(a.start_time, 'Dy') as day_name,
             COALESCE(SUM(m.tss_score), 0) as daily_tss,
             COALESCE(SUM(m.distance_meters), 0) as daily_distance_meters
      FROM activities a
      JOIN activity_metrics m ON a.id = m.activity_id
      WHERE a.user_id = $1 AND a.start_time >= NOW() - INTERVAL '7 days'
      GROUP BY TO_CHAR(a.start_time, 'Dy'), DATE_TRUNC('day', a.start_time)
      ORDER BY DATE_TRUNC('day', a.start_time) ASC
    `, [userId]);

    const profileRes = await query('SELECT vo2_max, resting_hr FROM profiles WHERE user_id = $1', [userId]);

    res.json({
      success: true,
      data: {
        summary: weeklyRes.rows[0],
        trainingLoadTss: parseInt(weeklyRes.rows[0].weekly_tss, 10),
        trainingStatus: 'OPTIMAL',
        vo2Max: profileRes.rows[0]?.vo2_max || 54.2,
        hrvStatus: { score: 68, status: 'BALANCED' },
        dailyBreakdown: dailyRes.rows
      }
    });
  } catch (e) { next(e); }
});
