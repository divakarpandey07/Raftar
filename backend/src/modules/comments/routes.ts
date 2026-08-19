// --- COMMENTS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';

export const createCommentSchema = z.object({
  content: z.string().min(1).max(1000),
  parentCommentId: z.string().uuid().optional()
});

export const commentsRouter = Router();

commentsRouter.get('/posts/:postId', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const list = await query(`
      SELECT c.id, c.content, c.created_at, p.display_name, p.handle, p.avatar_url
      FROM comments c
      JOIN profiles p ON c.user_id = p.user_id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
    `, [req.params.postId]);
    res.json({ success: true, data: list.rows });
  } catch (e) { next(e); }
});

commentsRouter.post('/posts/:postId', authenticate, validate({ body: createCommentSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const inserted = await query(`
      INSERT INTO comments (post_id, user_id, content, parent_comment_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [req.params.postId, req.user!.userId, req.body.content, req.body.parentCommentId]);
    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (e) { next(e); }
});
