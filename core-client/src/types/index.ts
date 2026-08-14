export type SportType = 'RUNNING' | 'CYCLING' | 'WALKING' | 'HIKING' | 'SWIMMING' | 'GENERAL_FITNESS';

export type TrackingState =
  | 'IDLE'
  | 'READY'
  | 'RECORDING'
  | 'PAUSED'
  | 'GPS_DEGRADED'
  | 'RESUMING'
  | 'FINISHING'
  | 'COMPLETED'
  | 'FAILED';

export type LocationQualityState =
  | 'HIGH_ACCURACY'       // 🟢 Full GNSS lock <= 10m
  | 'MODERATE_ACCURACY'   // 🟡 GNSS/Network 10m - 25m
  | 'DEGRADED'            // 🟠 Weak GNSS > 25m
  | 'ESTIMATED'           // 🟠 Dead-Reckoning (is_estimated = true)
  | 'UNAVAILABLE';        // 🔴 Hardware disabled / permission revoked

export interface Coordinate {
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp: number; // epoch ms
}

export interface RawGpsPoint extends Coordinate {
  id?: number;
  localActivityId: string;
  pointIndex: number;
  speed?: number; // m/s
  accuracy: number; // meters
  heartRate?: number;
  cadence?: number;
  power?: number;
  isEstimated: boolean;
}

export interface LocalActivity {
  localId: string;
  serverId?: string;
  sportType: SportType;
  title: string;
  privacy: 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';
  status: 'RECORDING' | 'PAUSED' | 'COMPLETED';
  startTime: number; // epoch ms
  endTime?: number;
  syncState: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
}

export interface LocalActivityMetrics {
  localActivityId: string;
  elapsedSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  avgSpeedMps: number;
  maxSpeedMps: number;
  avgPaceSecKm: number;
  currentPaceSecKm: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  calories: number;
  avgHr: number;
  maxHr: number;
  tssScore: number;
  hrZone1Seconds: number;
  hrZone2Seconds: number;
  hrZone3Seconds: number;
  hrZone4Seconds: number;
  hrZone5Seconds: number;
}

export interface LocalSplit {
  id?: number;
  localActivityId: string;
  splitNumber: number;
  distanceMeters: number;
  durationSeconds: number;
  avgPaceSecKm: number;
  elevationDiff: number;
  avgHeartRate?: number;
}

export interface LocalSyncQueueItem {
  id?: number;
  entityType: 'ACTIVITY' | 'POST' | 'GOAL';
  localId: string;
  payload: string;
  uploadedChunkIndex: number;
  totalChunks: number;
  retryCount: number;
  lastAttempt?: number;
  status: 'PENDING' | 'UPLOADING' | 'FAILED';
  errorMessage?: string;
}

export interface TrackingTelemetrySnapshot {
  state: TrackingState;
  quality: LocationQualityState;
  localActivity: LocalActivity;
  metrics: LocalActivityMetrics;
  recentPoints: RawGpsPoint[];
  splits: LocalSplit[];
  lastPoint?: RawGpsPoint;
  isAutoPaused: boolean;
}
