import { DataSourceType, NormalizedSensorSample } from '../types/device.types';
import { MetricRecord, DeviceClassType, MetricType } from '../types/provenance.types';

export const SOURCE_PRIORITY_MAP: Record<DataSourceType, number> = {
  BLE_STANDARD: 1,
  HEALTH_KIT: 2,
  HEALTH_CONNECT: 2,
  VENDOR_ADAPTER: 3
};

export class DataProvenanceAndDeduplicationEngine {
  private recentSamples: MetricRecord[] = [];
  private readonly windowMs: number;

  constructor(toleranceWindowMs: number = 2000) {
    this.windowMs = toleranceWindowMs;
  }

  processSample(
    sample: NormalizedSensorSample,
    metricType: 'HEART_RATE' | 'CADENCE' | 'POWER',
    providerName: string = 'generic',
    deviceType: DeviceClassType = 'WATCH'
  ): MetricRecord | null {
    const value = metricType === 'HEART_RATE'
      ? sample.heartRate
      : metricType === 'CADENCE'
      ? sample.cadenceRpm
      : sample.powerWatts;

    if (value === undefined || value === null) {
      return null;
    }

    const priorityRank = SOURCE_PRIORITY_MAP[sample.source] ?? 4;

    const candidate: MetricRecord = {
      recordId: sample.id,
      activityId: 'session_active',
      sessionId: 'session_active',
      metricType,
      value,
      unit: metricType === 'HEART_RATE' ? 'bpm' : metricType === 'CADENCE' ? 'rpm' : 'watts',
      timestamp: sample.timestamp,
      receivedAt: Date.now(),
      clockOffsetMs: 0,
      sequenceNumber: 1,
      deviceId: sample.deviceId,
      deviceName: sample.deviceName,
      deviceClass: deviceType,
      provider: providerName.toLowerCase(),
      source: sample.source,
      streamId: `stream_${sample.deviceId}_${metricType}`,
      measurementMode: sample.source === 'BLE_STANDARD' ? 'MEASURED' : 'ESTIMATED',
      qualityScore: 95,
      confidenceScore: sample.source === 'BLE_STANDARD' ? 99 : 85,
      validityStatus: 'VALID',
      isCanonical: true,
      isSuppressed: false,
      overlapGroupId: `overlap_${Math.floor(sample.timestamp / 2000)}`,
      processingVersion: 'v2.0'
    };

    const cutoffTime = sample.timestamp - 10000;
    this.recentSamples = this.recentSamples.filter((s) => s.timestamp >= cutoffTime);

    const conflictIndex = this.recentSamples.findIndex(
      (s) =>
        s.metricType === metricType &&
        Math.abs(s.timestamp - sample.timestamp) <= this.windowMs
    );

    if (conflictIndex !== -1) {
      const existing = this.recentSamples[conflictIndex];
      const existingRank = SOURCE_PRIORITY_MAP[existing.source] ?? 4;
      if (existingRank <= priorityRank) {
        return null;
      } else {
        this.recentSamples[conflictIndex] = candidate;
        return candidate;
      }
    }

    this.recentSamples.push(candidate);
    return candidate;
  }

  getRecentCanonicalSamples(): MetricRecord[] {
    return [...this.recentSamples];
  }
}
