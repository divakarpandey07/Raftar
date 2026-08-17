export type BadgeTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'CENTURION';
export type BadgeCategory = 'DISTANCE' | 'ELEVATION' | 'CONSISTENCY' | 'PACE' | 'TIME_OF_DAY' | 'LIFETIME';
export type AchievementScope = 'SINGLE_ACTIVITY' | 'LIFETIME' | 'STREAK';
export type AchievementStatus = 'LOCKED' | 'UNLOCKED' | 'REVOKED';
export type EvidenceClass =
  | 'VERIFIED_DEVICE'
  | 'GPS_VALIDATED'
  | 'SENSOR_VALIDATED'
  | 'IMPORTED_VERIFIED'
  | 'MANUAL'
  | 'INVALID';

export interface AchievementBadge {
  id: string;
  name: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  badgeIcon: string;
  sport?: string;
  scope: AchievementScope;
  threshold: number;
  unit: string;
  minEvidenceRequired: EvidenceClass;
  version: string;
  status: AchievementStatus;
  unlocked: boolean;
  unlockedAt?: number;
  revokedAt?: number;
  revocationReason?: string;
  triggerActivityId?: string;
}

export interface AchievementUnlockedEvent {
  badge: AchievementBadge;
  activityId: string;
  timestamp: number;
}

export interface AchievementRevokedEvent {
  badge: AchievementBadge;
  activityId: string;
  reason: string;
  timestamp: number;
}
