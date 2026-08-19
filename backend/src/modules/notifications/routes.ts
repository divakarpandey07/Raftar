// --- NOTIFICATIONS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';

export const notificationsRouter = Router();

notificationsRouter.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const list = await query(`
      SELECT n.*, p.display_name as actor_name, p.avatar_url as actor_avatar
      FROM notifications n
      LEFT JOIN profiles p ON n.actor_id = p.user_id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [req.user!.userId]);
    res.json({ success: true, data: list.rows });
  } catch (e) { next(e); }
});

notificationsRouter.patch('/:id/read', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [req.params.id, req.user!.userId]);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (e) { next(e); }
});
