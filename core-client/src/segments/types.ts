import { SportType } from '../types';

export type ClimbCategory = 'FLAT' | 'CAT_4' | 'CAT_3' | 'CAT_2' | 'CAT_1' | 'HC';
export type EffortValidityStatus = 'VALID' | 'INVALID' | 'PENDING_REVIEW';

export type SegmentMatchReasonCode =
  | 'IMPOSSIBLE_SPEED'
  | 'GPS_TELEPORTATION'
  | 'LOW_GPS_CONFIDENCE'
  | 'CORRIDOR_VIOLATION'
  | 'INVALID_PROGRESS'
  | 'TIMESTAMP_ANOMALY'
  | 'GAP_REQUIRES_REVIEW';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  altitudeMeters?: number;
  timestamp?: number;
}

export interface Segment {
  id: string;
  name: string;
  sportType: SportType;
  distanceMeters: number;
  elevationGainMeters: number;
  startCoordinate: GeoPoint;
  endCoordinate: GeoPoint;
  polylinePoints: GeoPoint[];
  climbCategory: ClimbCategory;
  startGateRadiusMeters: number;
  endGateRadiusMeters: number;
  maxCorridorOffsetMeters: number;
  warningSpeedMpsThreshold: number;
  hardRejectionSpeedMpsThreshold: number;
  isStarred?: boolean;
}

export interface SegmentEffort {
  id: string;
  segmentId: string;
  activityId: string;
  athleteId: string;
  elapsedTimeSeconds: number;
  movingTimeSeconds: number;
  startIndex: number;
  endIndex: number;
  averageSpeedMps: number;
  maxSpeedMps: number;
  averageHeartRate?: number;
  averagePowerWatts?: number;
  validityStatus: EffortValidityStatus;
  reasonCode?: SegmentMatchReasonCode;
  rank?: number;
}

export interface SegmentMatchResult {
  matched: boolean;
  effort?: SegmentEffort;
  reason?: string;
  reasonCode?: SegmentMatchReasonCode;
  adherencePercentage: number;
}

export interface SegmentLeaderboardEntry {
  rank: number;
  effortId: string;
  athleteId: string;
  athleteName: string;
  elapsedTimeSeconds: number;
  averageSpeedMps: number;
  averageHeartRate?: number;
  averagePowerWatts?: number;
  achievedAt: number;
}
