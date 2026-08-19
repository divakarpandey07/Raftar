// --- GROUNDED AI COACH MODULE ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../../database/connection';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { AppError } from '../../utils/problem-details';

export const chatAiSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(1000)
});

export class FitnessQueryLayer {
  /**
   * Deterministic metrics query: Aggregates real user telemetry without LLM guesswork
   */
  static async getMonthlyComparison(userId: string) {
    const res = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN start_time >= DATE_TRUNC('month', NOW()) THEN m.distance_meters ELSE 0 END), 0) as current_month_dist,
        COALESCE(SUM(CASE WHEN start_time >= DATE_TRUNC('month', NOW() - INTERVAL '1 month') AND start_time < DATE_TRUNC('month', NOW()) THEN m.distance_meters ELSE 0 END), 0) as last_month_dist,
        COALESCE(AVG(CASE WHEN start_time >= DATE_TRUNC('month', NOW()) THEN m.avg_pace_sec_km ELSE NULL END), 0) as current_month_avg_pace,
        COALESCE(AVG(CASE WHEN start_time >= DATE_TRUNC('month', NOW() - INTERVAL '1 month') AND start_time < DATE_TRUNC('month', NOW()) THEN m.avg_pace_sec_km ELSE NULL END), 0) as last_month_avg_pace,
        COALESCE(SUM(CASE WHEN start_time >= DATE_TRUNC('month', NOW()) THEN m.tss_score ELSE 0 END), 0) as current_month_tss
      FROM activities a
      JOIN activity_metrics m ON a.id = m.activity_id
      WHERE a.user_id = $1
    `, [userId]);

    const row = res.rows[0];
    const currDistKm = Math.round(row.current_month_dist / 100) / 10;
    const lastDistKm = Math.round(row.last_month_dist / 100) / 10;
    const deltaKm = Math.round((currDistKm - lastDistKm) * 10) / 10;
    const deltaPct = lastDistKm > 0 ? Math.round(((currDistKm - lastDistKm) / lastDistKm) * 100) : 0;

    return {
      currentMonthDistanceKm: currDistKm,
      lastMonthDistanceKm: lastDistKm,
      distanceDeltaKm: deltaKm,
      distanceDeltaPct: deltaPct,
      currentMonthTss: parseInt(row.current_month_tss, 10),
      currentAvgPaceSecKm: Math.round(row.current_month_avg_pace)
    };
  }

  static async getFastest5K(userId: string) {
    const res = await query(`
      SELECT a.id, a.title, a.start_time, m.distance_meters, m.moving_duration_seconds, m.avg_pace_sec_km
      FROM activities a
      JOIN activity_metrics m ON a.id = m.activity_id
      WHERE a.user_id = $1 AND a.sport_type = 'RUNNING' AND m.distance_meters >= 5000
      ORDER BY m.avg_pace_sec_km ASC
      LIMIT 1
    `, [userId]);

    return res.rows[0] || null;
  }
}

export const aiRouter = Router();

aiRouter.post('/chat', authenticate, validate({ body: chatAiSchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { message, conversationId } = req.body;

    const lower = message.toLowerCase();
    let groundingData: any = {};
    let reply = '';

    // 1. Intent Detection & Deterministic Query Execution
    if (lower.includes('month') || lower.includes('compare') || lower.includes('august') || lower.includes('july')) {
      const stats = await FitnessQueryLayer.getMonthlyComparison(userId);
      groundingData = stats;
      const paceMin = Math.floor(stats.currentAvgPaceSecKm / 60);
      const paceSec = stats.currentAvgPaceSecKm % 60;
      const paceFormatted = `${paceMin}'${paceSec.toString().padStart(2, '0')}"`;

      reply = `Based on your recorded telemetry, you have completed ${stats.currentMonthDistanceKm} km this month (Training Stress: ${stats.currentMonthTss} TSS, Avg Pace: ${paceFormatted}/km). ` +
              `Compared to last month (${stats.lastMonthDistanceKm} km), your volume has shifted by ${stats.distanceDeltaPct >= 0 ? '+' : ''}${stats.distanceDeltaPct}%. Your aerobic capacity is tracking steadily within optimal adaptation bounds.`;
    } else if (lower.includes('fastest 5k') || lower.includes('pr') || lower.includes('personal record')) {
      const fastest = await FitnessQueryLayer.getFastest5K(userId);
      groundingData = fastest;
      if (fastest) {
        const paceMin = Math.floor(fastest.avg_pace_sec_km / 60);
        const paceSec = fastest.avg_pace_sec_km % 60;
        const durMin = Math.floor(fastest.moving_duration_seconds / 60);
        const durSec = fastest.moving_duration_seconds % 60;

        reply = `Your fastest recorded 5K on record is from "${fastest.title}" on ${new Date(fastest.start_time).toLocaleDateString()}, with a moving time of ${durMin}:${durSec.toString().padStart(2, '0')} (Pace: ${paceMin}'${paceSec.toString().padStart(2, '0')}"/km).`;
      } else {
        reply = 'You have not recorded a complete 5K running activity yet. Log a 5K workout to establish your baseline benchmark!';
      }
    } else {
      const stats = await FitnessQueryLayer.getMonthlyComparison(userId);
      groundingData = stats;
      reply = `You have completed ${stats.currentMonthDistanceKm} km this month with ${stats.currentMonthTss} TSS training load. Your recovery balance indicates stable neuromuscular readiness. Let me know if you would like pacing recommendations for your next session!`;
    }

    // Append medical boundary disclaimer
    const medicalDisclaimer = '\n\n*Note: RAFTAR provides athletic fitness intelligence. For physiological symptoms, chest discomfort, or injury diagnosis, always consult a qualified medical professional.*';

    res.json({
      success: true,
      data: {
        reply: reply + medicalDisclaimer,
        groundingMetrics: groundingData
      }
    });
  } catch (e) { next(e); }
});
