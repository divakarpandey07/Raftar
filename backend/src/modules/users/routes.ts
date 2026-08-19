// --- USERS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { AppError } from '../../utils/problem-details';

export const usersRouter = Router();

usersRouter.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userRes = await query(`
      SELECT u.id, u.email, u.created_at, p.display_name, p.handle, p.avatar_url, p.bio, p.level_tier,
             p.weight_kg, p.height_cm, p.resting_hr, p.max_hr, p.vo2_max
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE u.id = $1 AND u.deleted_at IS NULL
    `, [req.user!.userId]);

    if (userRes.rows.length === 0) throw AppError.notFound('User not found');
    res.json({ success: true, data: userRes.rows[0] });
  } catch (e) { next(e); }
});

usersRouter.delete('/me', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await query('UPDATE users SET deleted_at = NOW(), is_active = FALSE WHERE id = $1', [req.user!.userId]);
    res.json({ success: true, message: 'Account scheduled for deletion' });
  } catch (e) { next(e); }
});
