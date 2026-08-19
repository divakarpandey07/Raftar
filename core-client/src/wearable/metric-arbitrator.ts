import {
  MetricRecord,
  DeviceClassType,
  MetricType,
  TelemetryStreamState,
  StreamStatus
} from '../types/provenance.types';
import { DataSourceType } from '../types/device.types';

export interface StreamEvent {
  type: 'STREAM_REGISTERED' | 'PRIMARY_STREAM_CHANGED' | 'STREAM_DROPOUT_FALLBACK' | 'STREAM_RECONNECTED';
  metricType: MetricType;
  streamId: string;
  deviceName: string;
  message: string;
}

export class MetricArbitrator {
  private activeStreams: Map<string, TelemetryStreamState> = new Map();
  private primaryStreamByMetric: Map<MetricType, string> = new Map();
  private listeners: Set<(event: StreamEvent) => void> = new Set();
  private rawProvenanceStore: MetricRecord[] = [];

  static calculatePriorityScore(
    metricType: MetricType,
    deviceClass: DeviceClassType,
    source: DataSourceType,
    confidenceHint: number = 0.9
  ): number {
    let baseScore = 50;

    switch (metricType) {
      case 'HEART_RATE':
      case 'RR_INTERVAL':
        if (deviceClass === 'CHEST_STRAP') baseScore = 100;
        else if (deviceClass === 'OPTICAL_ARMBAND') baseScore = 85;
        else if (deviceClass === 'WATCH') baseScore = 75;
        else if (deviceClass === 'RING') baseScore = 70;
        else baseScore = 40;
        break;

      case 'GPS_LOCATION':
        if (deviceClass === 'PHONE') baseScore = 95;
        else if (deviceClass === 'WATCH') baseScore = 90;
        else baseScore = 40;
        break;

      case 'POWER':
        if (deviceClass === 'POWER_METER') baseScore = 100;
        else if (deviceClass === 'WATCH') baseScore = 60;
        else baseScore = 30;
        break;

      case 'CADENCE':
        if (deviceClass === 'FOOTPOD') baseScore = 100;
        else if (deviceClass === 'WATCH') baseScore = 80;
        else baseScore = 50;
        break;

      case 'STEPS':
        if (deviceClass === 'WATCH' || deviceClass === 'BAND') baseScore = 95;
        else if (deviceClass === 'PHONE') baseScore = 70;
        break;

      default:
        baseScore = 60;
    }

    return Math.round(baseScore * confidenceHint);
  }

  ingestSample(params: {
    activityId: string;
    metricType: MetricType;
    value: number;
    unit: string;
    timestamp: number;
    deviceId: string;
    deviceName: string;
    deviceClass: DeviceClassType;
    provider: string;
    source: DataSourceType;
    confidence?: number;
    accuracy?: number;
  }): { canonicalSample: MetricRecord | null; rawSample: MetricRecord } {
    const streamId = `${params.activityId}_${params.metricType}_${params.deviceId}`;
    const confidence = params.confidence ?? (params.deviceClass === 'CHEST_STRAP' ? 0.99 : 0.88);
    const priorityScore = MetricArbitrator.calculatePriorityScore(
      params.metricType,
      params.deviceClass,
      params.source,
      confidence
    );

    let stream = this.activeStreams.get(streamId);

    if (!stream) {
      stream = {
        streamId,
        activityId: params.activityId,
        sessionId: 'session_active',
        metricType: params.metricType,
        deviceId: params.deviceId,
        deviceName: params.deviceName,
        deviceClass: params.deviceClass,
        provider: params.provider,
        source: params.source,
        measurementMode: params.deviceClass === 'CHEST_STRAP' || params.deviceClass === 'POWER_METER' ? 'MEASURED' : 'ESTIMATED',
        status: 'ACTIVE',
        isPrimary: false,
        priorityScore,
        lastSampleTimestamp: params.timestamp,
        lastSequenceNumber: 0,
        sampleCount: 0,
        consecutiveValidSamples: 1,
        dropoutCount: 0
      };
      this.activeStreams.set(streamId, stream);
      this.evaluatePrimaryStream(params.metricType);
    } else {
      stream.lastSampleTimestamp = params.timestamp;
      stream.sampleCount++;
      stream.status = 'ACTIVE';
    }

    const currentPrimaryStreamId = this.primaryStreamByMetric.get(params.metricType);
    const isPrimary = currentPrimaryStreamId === streamId;

    const sampleRecord: MetricRecord = {
      recordId: `prov_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      activityId: params.activityId,
      sessionId: 'session_active',
      metricType: params.metricType,
      value: params.value,
      unit: params.unit,
      timestamp: params.timestamp,
      receivedAt: Date.now(),
      clockOffsetMs: 0,
      sequenceNumber: stream.sampleCount,
      deviceId: params.deviceId,
      deviceName: params.deviceName,
      deviceClass: params.deviceClass,
      provider: params.provider,
      source: params.source,
      streamId,
      measurementMode: stream.measurementMode,
      qualityScore: 95,
      confidenceScore: Math.round(confidence * 100),
      validityStatus: 'VALID',
      isCanonical: isPrimary,
      isSuppressed: !isPrimary,
      overlapGroupId: `${params.activityId}_${params.metricType}_${Math.floor(params.timestamp / 2000)}`,
      processingVersion: 'v2.0'
    };

    this.rawProvenanceStore.push(sampleRecord);
    if (this.rawProvenanceStore.length > 5000) {
      this.rawProvenanceStore.shift();
    }

    return {
      canonicalSample: isPrimary ? sampleRecord : null,
      rawSample: sampleRecord
    };
  }

  private evaluatePrimaryStream(metricType: MetricType): void {
    const candidateStreams: TelemetryStreamState[] = [];
    for (const stream of this.activeStreams.values()) {
      if (stream.metricType === metricType && stream.status === 'ACTIVE') {
        candidateStreams.push(stream);
      }
    }

    if (candidateStreams.length === 0) {
      this.primaryStreamByMetric.delete(metricType);
      return;
    }

    candidateStreams.sort((a, b) => b.priorityScore - a.priorityScore);
    const bestStream = candidateStreams[0];
    const previousPrimaryId = this.primaryStreamByMetric.get(metricType);

    if (previousPrimaryId !== bestStream.streamId) {
      for (const s of candidateStreams) {
        s.isPrimary = (s.streamId === bestStream.streamId);
      }
      this.primaryStreamByMetric.set(metricType, bestStream.streamId);

      this.notify({
        type: previousPrimaryId ? 'PRIMARY_STREAM_CHANGED' : 'STREAM_REGISTERED',
        metricType,
        streamId: bestStream.streamId,
        deviceName: bestStream.deviceName,
        message: `Primary ${metricType} authority assigned to ${bestStream.deviceName}`
      });
    }
  }

  handleStreamDisconnect(deviceId: string): void {
    for (const stream of this.activeStreams.values()) {
      if (stream.deviceId === deviceId) {
        stream.status = 'DISCONNECTED';
        stream.isPrimary = false;

        const metricType = stream.metricType;
        const currentPrimaryId = this.primaryStreamByMetric.get(metricType);

        if (currentPrimaryId === stream.streamId) {
          this.evaluatePrimaryStream(metricType);
          const newPrimaryId = this.primaryStreamByMetric.get(metricType);
          const newPrimaryStream = newPrimaryId ? this.activeStreams.get(newPrimaryId) : null;

          this.notify({
            type: 'STREAM_DROPOUT_FALLBACK',
            metricType,
            streamId: stream.streamId,
            deviceName: stream.deviceName,
            message: newPrimaryStream
              ? `${stream.deviceName} disconnected — seamlessly using ${newPrimaryStream.deviceName}`
              : `${stream.deviceName} disconnected — ${metricType} stream unavailable`
          });
        }
      }
    }
  }

  getActivePrimaryStream(metricType: MetricType): TelemetryStreamState | null {
    const streamId = this.primaryStreamByMetric.get(metricType);
    return streamId ? this.activeStreams.get(streamId) || null : null;
  }

  getRawProvenanceStore(): MetricRecord[] {
    return [...this.rawProvenanceStore];
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: StreamEvent): void {
    for (const l of this.listeners) {
      l(event);
    }
  }
}
