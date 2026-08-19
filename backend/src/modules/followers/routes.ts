// --- FOLLOWERS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';

export const followersRouter = Router();

followersRouter.post('/:targetUserId', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const followerId = req.user!.userId;
    const targetUserId = req.params.targetUserId;

    await query(`
      INSERT INTO followers (follower_id, following_id, status)
      VALUES ($1, $2, 'ACCEPTED')
      ON CONFLICT (follower_id, following_id) DO NOTHING
    `, [followerId, targetUserId]);

    res.json({ success: true, message: 'Followed athlete successfully' });
  } catch (e) { next(e); }
});

followersRouter.delete('/:targetUserId', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await query('DELETE FROM followers WHERE follower_id = $1 AND following_id = $2', [req.user!.userId, req.params.targetUserId]);
    res.json({ success: true, message: 'Unfollowed athlete' });
  } catch (e) { next(e); }
});
