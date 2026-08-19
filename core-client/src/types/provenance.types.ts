import { DataSourceType } from './device.types';
import { SportType } from './index';

export type MetricType =
  | 'HEART_RATE'
  | 'RR_INTERVAL'
  | 'GPS_LOCATION'
  | 'POWER'
  | 'CADENCE'
  | 'SPEED'
  | 'DISTANCE'
  | 'STEPS'
  | 'ELEVATION'
  | 'SLEEP';

export type DeviceClassType =
  | 'CHEST_STRAP'
  | 'OPTICAL_ARMBAND'
  | 'WATCH'
  | 'BAND'
  | 'RING'
  | 'PHONE'
  | 'POWER_METER'
  | 'CRANK_SENSOR'
  | 'FOOTPOD'
  | 'BIKE_COMPUTER';

export type MeasurementMode = 'MEASURED' | 'ESTIMATED' | 'DERIVED';

export type ValidityStatus = 'VALID' | 'SUSPICIOUS' | 'INVALID' | 'MISSING';

export interface MetricRecord {
  recordId: string;
  activityId: string;
  sessionId: string;
  metricType: MetricType;
  value: number;
  unit: string;

  // Temporal & Clock Alignment
  timestamp: number;
  receivedAt: number;
  clockOffsetMs: number;
  sequenceNumber: number;

  // Hardware & Origin Provenance
  deviceId: string;
  deviceName: string;
  deviceClass: DeviceClassType;
  provider: string;
  source: DataSourceType;
  streamId: string;
  sampleRateHz?: number;

  // Physics & Measurement Characteristics
  measurementMode: MeasurementMode;
  qualityScore: number;
  confidenceScore: number;
  validityStatus: ValidityStatus;

  // Arbitration & Deduplication Metadata
  isCanonical: boolean;
  isSuppressed: boolean;
  overlapGroupId: string;

  // Traceability & Versioning
  calibrationVersion?: string;
  firmwareVersion?: string;
  processingVersion: string;
  rawPayloadRef?: string;
}

// Backward-compatible type alias for older module references
export type CanonicalHealthSample = MetricRecord;

export type StreamStatus =
  | 'DISCOVERED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'DROPPED'
  | 'FALLBACK'
  | 'RECONNECTING'
  | 'RECONNECTED'
  | 'DISCONNECTED';

export interface TelemetryStreamState {
  streamId: string;
  activityId: string;
  sessionId: string;
  metricType: MetricType;
  deviceId: string;
  deviceName: string;
  deviceClass: DeviceClassType;
  provider: string;
  source: DataSourceType;
  measurementMode: MeasurementMode;
  status: StreamStatus;
  isPrimary: boolean;
  priorityScore: number;
  lastSampleTimestamp: number;
  lastSequenceNumber: number;
  sampleCount: number;
  consecutiveValidSamples: number;
  dropoutCount: number;
}

// Backward-compatible alias
export type TelemetryStream = TelemetryStreamState;
