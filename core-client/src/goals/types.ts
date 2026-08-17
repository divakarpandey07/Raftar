import { SportType } from '../types';

export type GoalType = 'DISTANCE_METERS' | 'DURATION_SECONDS' | 'ELEVATION_GAIN_METERS' | 'WORKOUT_COUNT';
export type GoalPeriod = 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
export type GoalStatus = 'NOT_STARTED' | 'ACTIVE' | 'PAUSED' | 'ACHIEVED' | 'EXPIRED' | 'CANCELLED';

export interface Goal {
  id: string;
  athleteId: string;
  goalType: GoalType;
  sportType?: SportType;
  period: GoalPeriod;
  targetValue: number;
  currentValue: number;
  startDate: string; // ISO date YYYY-MM-DD (Occurrence time window)
  endDate: string;   // ISO date YYYY-MM-DD
  pausedDurationMs?: number; // Total cumulative milliseconds the goal spent in PAUSED state (freezes deadline consumption)
  timezone?: string;
  status: GoalStatus;
  progressPercentage: number;
  isAchieved: boolean;
  createdAt: number;
}
