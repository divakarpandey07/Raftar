// --- REACTIONS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';

export const reactionsRouter = Router();

reactionsRouter.post('/posts/:postId/toggle', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const postId = req.params.postId;

    const existing = await query('SELECT user_id FROM reactions WHERE post_id = $1 AND user_id = $2', [postId, userId]);
    if (existing.rows.length > 0) {
      await query('DELETE FROM reactions WHERE post_id = $1 AND user_id = $2', [postId, userId]);
      res.json({ success: true, action: 'REMOVED' });
    } else {
      await query('INSERT INTO reactions (post_id, user_id, reaction_type) VALUES ($1, $2, $3)', [postId, userId, 'KUDOS']);
      res.json({ success: true, action: 'ADDED' });
    }
  } catch (e) { next(e); }
});
