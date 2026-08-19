// --- CLUBS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';

export const createClubSchema = z.object({
  name: z.string().min(3).max(150),
  description: z.string().max(1000).optional(),
  sportType: z.enum(['RUNNING', 'CYCLING', 'WALKING', 'HIKING', 'GENERAL_FITNESS']),
  isPrivate: z.boolean().default(false)
});

export const clubsRouter = Router();

clubsRouter.get('/', async (req, res, next) => {
  try {
    const list = await query(`
      SELECT c.*, COUNT(cm.user_id) as member_count
      FROM clubs c
      LEFT JOIN club_members cm ON c.id = cm.club_id
      GROUP BY c.id
      ORDER BY member_count DESC
    `);
    res.json({ success: true, data: list.rows });
  } catch (e) { next(e); }
});

clubsRouter.post('/', authenticate, validate({ body: createClubSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const club = await withTransaction(async (client) => {
      const inserted = await client.query(`
        INSERT INTO clubs (name, description, sport_type, is_private, owner_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [b.name, b.description, b.sportType, b.isPrivate, req.user!.userId]);

      await client.query(`
        INSERT INTO club_members (club_id, user_id, role)
        VALUES ($1, $2, 'OWNER')
      `, [inserted.rows[0].id, req.user!.userId]);

      return inserted.rows[0];
    });

    res.status(201).json({ success: true, data: club });
  } catch (e) { next(e); }
});

clubsRouter.post('/:id/join', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await query(`
      INSERT INTO club_members (club_id, user_id, role)
      VALUES ($1, $2, 'MEMBER')
      ON CONFLICT (club_id, user_id) DO NOTHING
    `, [req.params.id, req.user!.userId]);
    res.json({ success: true, message: 'Joined club successfully' });
  } catch (e) { next(e); }
});
