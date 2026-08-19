// --- RESUMABLE SYNC MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { redisClient } from '../../database/redis';
import { AppError } from '../../utils/problem-details';
import { v4 as uuidv4 } from 'uuid';

export const initiateSyncSchema = z.object({
  clientLocalId: z.string().uuid(),
  sportType: z.enum(['RUNNING', 'CYCLING', 'WALKING', 'HIKING', 'GENERAL_FITNESS']),
  title: z.string().min(1).max(150),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  totalPoints: z.number().int().positive(),
  totalChunks: z.number().int().positive(),
  metrics: z.object({
    elapsedDurationSeconds: z.number().int(),
    movingDurationSeconds: z.number().int(),
    distanceMeters: z.number().positive(),
    avgSpeedMps: z.number().nonnegative(),
    maxSpeedMps: z.number().nonnegative(),
    avgPaceSecKm: z.number().int().nonnegative(),
    elevationGainMeters: z.number().default(0),
    elevationLossMeters: z.number().default(0),
    caloriesBurned: z.number().int().default(0),
    avgHr: z.number().int().optional(),
    maxHr: z.number().int().optional(),
    tssScore: z.number().int().optional()
  }),
  splits: z.array(z.object({
    splitNumber: z.number().int(),
    distanceMeters: z.number(),
    durationSeconds: z.number().int(),
    avgPaceSecKm: z.number().int(),
    elevationDiff: z.number().optional()
  })).optional()
});

export const syncChunkSchema = z.object({
  uploadId: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  points: z.array(z.object({
    pointIndex: z.number().int().nonnegative(),
    timestamp: z.number(),
    lat: z.number(),
    lon: z.number(),
    alt: z.number().optional(),
    speed: z.number().optional(),
    accuracy: z.number().optional(),
    hr: z.number().optional(),
    cadence: z.number().optional(),
    power: z.number().optional(),
    isEstimated: z.boolean().default(false)
  }))
});

export const finalizeSyncSchema = z.object({
  uploadId: z.string()
});

export const syncRouter = Router();

syncRouter.post('/initiate', authenticate, validate({ body: initiateSyncSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const userId = req.user!.userId;

    // Check idempotency: did this client local ID already get synced?
    const existing = await query('SELECT id FROM activities WHERE user_id = $1 AND client_local_id = $2', [userId, b.clientLocalId]);
    if (existing.rows.length > 0) {
      return res.json({
        success: true,
        data: {
          activityId: existing.rows[0].id,
          status: 'ALREADY_SYNCED',
          message: 'Activity was previously synced'
        }
      });
    }

    const uploadId = uuidv4();
    const sessionData = {
      uploadId,
      userId,
      payload: b,
      receivedChunks: [] as number[]
    };

    await redisClient.set(`sync_session:${uploadId}`, JSON.stringify(sessionData), 'EX', 60 * 60 * 24);

    res.status(201).json({
      success: true,
      data: {
        uploadId,
        nextChunkIndex: 0,
        totalChunks: b.totalChunks
      }
    });
  } catch (e) { next(e); }
});

syncRouter.post('/chunks', authenticate, validate({ body: syncChunkSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { uploadId, chunkIndex, points } = req.body;
    const rawSession = await redisClient.get(`sync_session:${uploadId}`);
    if (!rawSession) throw AppError.notFound('Sync session expired or invalid');

    const session = JSON.parse(rawSession);
    if (session.userId !== req.user!.userId) throw AppError.forbidden('Unauthorized sync session');

    // Store chunk points in Redis temporary list
    await redisClient.set(`sync_chunk:${uploadId}:${chunkIndex}`, JSON.stringify(points), 'EX', 60 * 60 * 24);

    if (!session.receivedChunks.includes(chunkIndex)) {
      session.receivedChunks.push(chunkIndex);
      await redisClient.set(`sync_session:${uploadId}`, JSON.stringify(session), 'EX', 60 * 60 * 24);
    }

    res.json({
      success: true,
      data: {
        uploadId,
        chunkAccepted: chunkIndex,
        receivedChunksCount: session.receivedChunks.length,
        totalChunks: session.payload.totalChunks
      }
    });
  } catch (e) { next(e); }
});

syncRouter.post('/finalize', authenticate, validate({ body: finalizeSyncSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { uploadId } = req.body;
    const rawSession = await redisClient.get(`sync_session:${uploadId}`);
    if (!rawSession) throw AppError.notFound('Sync session expired or invalid');

    const session = JSON.parse(rawSession);
    const p = session.payload;

    const activity = await withTransaction(async (client) => {
      // 1. Insert Activity root
      const actRes = await client.query(`
        INSERT INTO activities (user_id, client_local_id, sport_type, title, start_time, end_time, sync_status)
        VALUES ($1, $2, $3, $4, $5, $6, 'SYNCED')
        RETURNING id
      `, [session.userId, p.clientLocalId, p.sportType, p.title, p.startTime, p.endTime]);
      const activityId = actRes.rows[0].id;

      // 2. Insert Metrics
      const m = p.metrics;
      await client.query(`
        INSERT INTO activity_metrics (
          activity_id, elapsed_duration_seconds, moving_duration_seconds, distance_meters,
          avg_speed_mps, max_speed_mps, avg_pace_sec_km, elevation_gain_meters, elevation_loss_meters,
          calories_burned, avg_hr, max_hr, tss_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        activityId, m.elapsedDurationSeconds, m.movingDurationSeconds, m.distanceMeters,
        m.avgSpeedMps, m.maxSpeedMps, m.avgPaceSecKm, m.elevationGainMeters, m.elevationLossMeters,
        m.caloriesBurned, m.avgHr, m.maxHr, m.tssScore
      ]);

      // 3. Insert Splits
      if (p.splits && p.splits.length > 0) {
        for (const s of p.splits) {
          await client.query(`
            INSERT INTO activity_splits (activity_id, split_number, distance_meters, duration_seconds, avg_pace_sec_km, elevation_change_meters)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [activityId, s.splitNumber, s.distanceMeters, s.durationSeconds, s.avgPaceSecKm, s.elevationDiff || 0]);
        }
      }

      return { activityId };
    });

    // Cleanup session cache
    await redisClient.del(`sync_session:${uploadId}`);

    res.json({
      success: true,
      data: {
        activityId: activity.activityId,
        status: 'SYNC_COMPLETED'
      }
    });
  } catch (e) { next(e); }
});
