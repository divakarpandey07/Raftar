// --- GEAR MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { AppError } from '../../utils/problem-details';

export const createGearSchema = z.object({
  name: z.string().min(2).max(100),
  gearType: z.enum(['SHOES', 'BIKE', 'WATCH', 'OTHER']),
  brand: z.string().optional(),
  model: z.string().optional(),
  maxDistanceMeters: z.number().default(400000)
});

export const gearRouter = Router();

gearRouter.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const list = await query('SELECT * FROM gear WHERE user_id = $1 AND is_retired = FALSE ORDER BY created_at DESC', [req.user!.userId]);
    res.json({ success: true, data: list.rows });
  } catch (e) { next(e); }
});

gearRouter.post('/', authenticate, validate({ body: createGearSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const inserted = await query(`
      INSERT INTO gear (user_id, name, gear_type, brand, model, max_distance_meters)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [req.user!.userId, b.name, b.gearType, b.brand, b.model, b.maxDistanceMeters]);

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (e) { next(e); }
});
