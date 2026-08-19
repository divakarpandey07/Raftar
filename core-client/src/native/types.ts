import { Coordinate, RawGpsPoint, SportType } from '../types';

export type NativePlatform = 'ANDROID' | 'IOS' | 'WEB_SIMULATOR';

export type NativeServiceState = 'STOPPED' | 'STARTING' | 'RUNNING' | 'PAUSED' | 'ERROR';

export interface NativeLocationEvent {
  latitude: number;
  longitude: number;
  altitudeMeters?: number;
  accuracyMeters: number;
  speedMps?: number;
  bearingDegrees?: number;
  timestamp: number;
  isMocked: boolean;
  batteryLevelPct?: number;
}

export interface NativeSensorSample {
  sensorType: 'HEART_RATE' | 'POWER_WATTS' | 'CADENCE_RPM' | 'RR_INTERVAL_MS';
  value: number;
  unit: string;
  sourceDeviceName: string;
  timestamp: number;
}

export interface HealthConnectSyncPayload {
  startTime: number;
  endTime: number;
  sportType: SportType;
  distanceMeters: number;
  activeCaloriesBurned: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  routeCoordinates: Coordinate[];
}

export interface NativeBridgeCommand {
  commandId: string;
  action: 'START_FOREGROUND_TRACKING' | 'PAUSE_TRACKING' | 'RESUME_TRACKING' | 'STOP_FOREGROUND_TRACKING' | 'SYNC_HEALTH_CONNECT' | 'SYNC_HEALTHKIT';
  sportType?: SportType;
  activityTitle?: string;
  payload?: any;
}

export interface NativeBridgeResponse {
  commandId: string;
  success: boolean;
  state: NativeServiceState;
  error?: string;
  data?: any;
}
