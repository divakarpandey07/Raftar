import { Goal, GoalStatus } from './types';

export interface ValidatedActivityRecord {
  id: string;
  sportType: string;
  status: 'RECORDING' | 'PAUSED' | 'COMPLETED';
  validityStatus: 'VALID' | 'SUSPICIOUS' | 'INVALID';
  isManual?: boolean;
  isDeleted?: boolean;
  startTime: number; // Occurrence time (epoch ms)
  endTime?: number;
  durationSeconds: number;
  distanceMeters: number;
  elevationGainMeters: number;
  timezone?: string;
  uploadedAt?: number; // Upload/sync time (never used for date boundaries)
}

export class GoalsEngine {
  /**
   * Evaluates goal progress deterministically using verified, completed, and non-deleted activities
   * based strictly on activity OCCURRENCE TIME (startTime), preserving offline recording date integrity.
   */
  static evaluateGoalProgress(goal: Goal, activities: ValidatedActivityRecord[]): Goal {
    const startTime = new Date(goal.startDate + 'T00:00:00Z').getTime();
    const pausedExtension = goal.pausedDurationMs || 0;
    const effectiveEndTime = new Date(goal.endDate + 'T23:59:59.999Z').getTime() + pausedExtension;
    const now = Date.now();

    if (goal.status === 'PAUSED') {
      return { ...goal };
    }

    if (now < startTime) {
      return {
        ...goal,
        status: 'NOT_STARTED',
        currentValue: 0,
        progressPercentage: 0,
        isAchieved: false
      };
    }

    // Strict validation filter using OCCURRENCE TIME
    const eligibleActivities = activities.filter((act) => {
      if (act.isDeleted) return false;
      if (act.status !== 'COMPLETED') return false;
      if (act.validityStatus === 'INVALID') return false;
      if (goal.sportType && act.sportType !== goal.sportType) return false;

      const occurrenceTime = act.startTime;
      return occurrenceTime >= startTime && occurrenceTime <= effectiveEndTime;
    });

    let currentVal = 0;

    for (const act of eligibleActivities) {
      switch (goal.goalType) {
        case 'DISTANCE_METERS':
          currentVal += act.distanceMeters;
          break;
        case 'DURATION_SECONDS':
          currentVal += act.durationSeconds;
          break;
        case 'ELEVATION_GAIN_METERS':
          currentVal += act.elevationGainMeters;
          break;
        case 'WORKOUT_COUNT':
          currentVal += 1;
          break;
      }
    }

    const progressPct = goal.targetValue > 0 ? Math.min(100, Math.round((currentVal / goal.targetValue) * 100)) : 0;
    const isAchieved = currentVal >= goal.targetValue;

    let status: GoalStatus = goal.status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE';
    if (isAchieved) {
      status = 'ACHIEVED';
    } else if (now > effectiveEndTime) {
      status = 'EXPIRED';
    }

    return {
      ...goal,
      currentValue: Number(currentVal.toFixed(2)),
      progressPercentage: progressPct,
      isAchieved,
      status
    };
  }
}
