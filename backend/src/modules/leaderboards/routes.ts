// --- LEADERBOARDS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { query } from '../../database/connection';

export const leaderboardsRouter = Router();

leaderboardsRouter.get('/global', async (req, res, next) => {
  try {
    const list = await query(`
      SELECT u.id as user_id, p.display_name, p.handle, p.avatar_url,
             SUM(m.distance_meters) as total_distance_meters,
             SUM(m.elevation_gain_meters) as total_elevation_gain_meters,
             COUNT(a.id) as activity_count,
             DENSE_RANK() OVER (ORDER BY SUM(m.distance_meters) DESC) as rank
      FROM activities a
      JOIN users u ON a.user_id = u.id
      JOIN profiles p ON u.id = p.user_id
      JOIN activity_metrics m ON a.id = m.activity_id
      WHERE a.privacy = 'PUBLIC' AND a.start_time >= NOW() - INTERVAL '30 days'
      GROUP BY u.id, p.display_name, p.handle, p.avatar_url
      ORDER BY total_distance_meters DESC
      LIMIT 100
    `);
    res.json({ success: true, data: list.rows });
  } catch (e) { next(e); }
});
