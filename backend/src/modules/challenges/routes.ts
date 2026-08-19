// --- CHALLENGES MODULE ---
import { Router, Response, NextFunction } from 'express';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';

export const challengesRouter = Router();

challengesRouter.get('/', async (req, res, next) => {
  try {
    const list = await query(`
      SELECT c.*, COUNT(cm.user_id) as participant_count
      FROM challenges c
      LEFT JOIN challenge_members cm ON c.id = cm.challenge_id
      WHERE c.end_time >= NOW()
      GROUP BY c.id
      ORDER BY c.start_time ASC
    `);
    res.json({ success: true, data: list.rows });
  } catch (e) { next(e); }
});

challengesRouter.post('/:id/join', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await query(`
      INSERT INTO challenge_members (challenge_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (challenge_id, user_id) DO NOTHING
    `, [req.params.id, req.user!.userId]);
    res.json({ success: true, message: 'Joined challenge successfully' });
  } catch (e) { next(e); }
});
