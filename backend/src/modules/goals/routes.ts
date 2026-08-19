// --- GOALS MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { AppError } from '../../utils/problem-details';

export const createGoalSchema = z.object({
  goalType: z.enum(['WEEKLY_DISTANCE', 'MONTHLY_DISTANCE', 'ANNUAL_DISTANCE', 'ACTIVITY_COUNT', 'ACTIVE_MINUTES']),
  sportType: z.enum(['RUNNING', 'CYCLING', 'WALKING', 'HIKING']).optional(),
  targetValue: z.number().positive(),
  startDate: z.string(),
  endDate: z.string()
});

export const goalsRouter = Router();

goalsRouter.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const list = await query('SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC', [req.user!.userId]);
    res.json({ success: true, data: list.rows });
  } catch (e) { next(e); }
});

goalsRouter.post('/', authenticate, validate({ body: createGoalSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const inserted = await query(`
      INSERT INTO goals (user_id, goal_type, sport_type, target_value, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [req.user!.userId, b.goalType, b.sportType, b.targetValue, b.startDate, b.endDate]);

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (e) { next(e); }
});
