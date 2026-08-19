// --- SOCIAL MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';

export const createPostSchema = z.object({
  activityId: z.string().uuid().optional(),
  content: z.string().max(2000),
  mediaUrls: z.array(z.string().url()).optional()
});

export const socialRouter = Router();

socialRouter.get('/feed', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(50, parseInt(req.query.limit as string || '20', 10));

    const feedRes = await query(`
      SELECT p.id as post_id, p.content, p.media_urls, p.created_at,
             u.id as athlete_id, prof.display_name, prof.handle, prof.avatar_url,
             a.id as activity_id, a.sport_type, a.title as activity_title,
             m.distance_meters, m.avg_pace_sec_km, m.elapsed_duration_seconds,
             (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) as kudos_count,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
             EXISTS(SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.user_id = $1) as has_reacted
      FROM posts p
      JOIN users u ON p.user_id = u.id
      JOIN profiles prof ON u.id = prof.user_id
      LEFT JOIN activities a ON p.activity_id = a.id
      LEFT JOIN activity_metrics m ON a.id = m.activity_id
      WHERE (p.user_id = $1 OR p.user_id IN (SELECT following_id FROM followers WHERE follower_id = $1))
      ORDER BY p.created_at DESC
      LIMIT $2
    `, [userId, limit]);

    res.json({ success: true, data: feedRes.rows });
  } catch (e) { next(e); }
});

socialRouter.post('/posts', authenticate, validate({ body: createPostSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const inserted = await query(`
      INSERT INTO posts (user_id, activity_id, content, media_urls)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [req.user!.userId, b.activityId, b.content, b.mediaUrls || []]);

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (e) { next(e); }
});
