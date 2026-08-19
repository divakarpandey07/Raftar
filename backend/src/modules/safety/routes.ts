// --- SAFETY MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { v4 as uuidv4 } from 'uuid';
import { redisClient } from '../../database/redis';
import { AppError } from '../../utils/problem-details';

export const createSafetyContactSchema = z.object({
  contactName: z.string().min(2),
  phoneNumber: z.string().min(7),
  email: z.string().email().optional(),
  notifyOnStart: z.boolean().default(true),
  notifyOnSos: z.boolean().default(true)
});

export const safetyRouter = Router();

safetyRouter.get('/contacts', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const list = await query('SELECT * FROM safety_contacts WHERE user_id = $1 ORDER BY created_at ASC', [req.user!.userId]);
    res.json({ success: true, data: list.rows });
  } catch (e) { next(e); }
});

safetyRouter.post('/contacts', authenticate, validate({ body: createSafetyContactSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const inserted = await query(
      'INSERT INTO safety_contacts (user_id, contact_name, phone_number, email, notify_on_start, notify_on_sos) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.user!.userId, b.contactName, b.phoneNumber, b.email, b.notifyOnStart, b.notifyOnSos]
    );
    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (e) { next(e); }
});

safetyRouter.post('/beacon/start', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const beaconToken = uuidv4();
    const beaconPayload = {
      userId: req.user!.userId,
      startTime: Date.now(),
      status: 'ACTIVE'
    };

    // Store ephemeral beacon for 6 hours
    await redisClient.set(`beacon:${beaconToken}`, JSON.stringify(beaconPayload), 'EX', 60 * 60 * 6);

    res.json({
      success: true,
      data: {
        beaconToken,
        liveTrackingUrl: `https://raftar.app/live/${beaconToken}`,
        expiresInSeconds: 21600
      }
    });
  } catch (e) { next(e); }
});

safetyRouter.get('/beacon/live/:token', async (req, res, next) => {
  try {
    const raw = await redisClient.get(`beacon:${req.params.token}`);
    if (!raw) throw AppError.notFound('Live beacon session expired or not found');
    res.json({ success: true, data: JSON.parse(raw) });
  } catch (e) { next(e); }
});
