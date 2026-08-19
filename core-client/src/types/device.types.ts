export type DataSourceType = 'BLE_STANDARD' | 'HEALTH_CONNECT' | 'HEALTH_KIT' | 'VENDOR_ADAPTER';

export interface DeviceCapabilities {
  heartRate: boolean;
  rrInterval: boolean;
  hrv: boolean;
  restingHeartRate: boolean;
  sleep: boolean;
  steps: boolean;
  calories: boolean;
  gps: boolean;
  elevation: boolean;
  cadence: boolean;
  cyclingSpeed: boolean;
  cyclingPower: boolean;
  temperature: boolean;
}

export type ConnectionState = 'DISCONNECTED' | 'SCANNING' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface ConnectedDevice {
  id: string;
  name: string;
  manufacturer?: string;
  source: DataSourceType;
  connectionState: ConnectionState;
  capabilities: DeviceCapabilities;
  lastDataTimestamp?: number;
  batteryLevelPct?: number;
}

export interface NormalizedSensorSample {
  id: string;
  timestamp: number;
  source: DataSourceType;
  deviceId: string;
  deviceName: string;
  heartRate?: number;
  rrIntervalsMs?: number[];
  cadenceRpm?: number;
  powerWatts?: number;
  isEstimated: boolean;
}

export interface NormalizedSleepRecord {
  startTime: number;
  endTime: number;
  durationMinutes: number;
  deepSleepMinutes: number;
  remSleepMinutes: number;
  lightSleepMinutes: number;
  source: DataSourceType;
}

export interface ReadinessAssessment {
  score: number | null; // null if insufficient data
  stateLabel: string;
  explanation: string;
  usedInputs: {
    hrv: boolean;
    restingHeartRate: boolean;
    sleep: boolean;
    trainingLoad: boolean;
  };
  rmssdMs?: number;
  restingHrBpm?: number;
}
