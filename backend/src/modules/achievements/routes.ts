// --- ACHIEVEMENTS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';

export const achievementsRouter = Router();

achievementsRouter.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const achievements = await query(`
      SELECT a.id, a.name, a.description, a.category, a.badge_icon,
             ua.unlocked_at,
             CASE WHEN ua.id IS NOT NULL THEN TRUE ELSE FALSE END as is_unlocked
      FROM achievements a
      LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
      ORDER BY a.category, a.name
    `, [userId]);

    res.json({ success: true, data: achievements.rows });
  } catch (e) { next(e); }
});
