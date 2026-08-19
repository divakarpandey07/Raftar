import {
  MetricRecord,
  MetricType,
  DeviceClassType,
  MeasurementMode,
  TelemetryStreamState,
  StreamStatus
} from '../types/provenance.types';
import { DataSourceType } from '../types/device.types';
import { SportType } from '../types';
import { QualityAndPlausibilityEngine } from './quality-engine';

export interface ArbitrationDecisionEvent {
  type: 'STREAM_REGISTERED' | 'PRIMARY_PROMOTED' | 'PRIMARY_DEMOTED' | 'FALLBACK_TRIGGERED' | 'STALE_WARNING';
  metricType: MetricType;
  streamId: string;
  deviceName: string;
  reason: string;
  timestamp: number;
}

export class ProductionMetricArbitrator {
  private activeStreams: Map<string, TelemetryStreamState> = new Map();
  private primaryStreamByMetric: Map<MetricType, string> = new Map();
  private sportType: SportType = 'RUNNING';
  private rawProvenanceStore: MetricRecord[] = [];
  private listeners: Set<(event: ArbitrationDecisionEvent) => void> = new Set();

  private readonly HYSTERESIS_SAMPLES = 3;
  private readonly HYSTERESIS_SCORE_MARGIN = 10;

  constructor(sportType: SportType = 'RUNNING') {
    this.sportType = sportType;
  }

  setSportType(sportType: SportType): void {
    this.sportType = sportType;
  }

  static getAuthorityWeight(
    metricType: MetricType,
    deviceClass: DeviceClassType,
    sportType: SportType
  ): number {
    switch (metricType) {
      case 'HEART_RATE':
      case 'RR_INTERVAL':
        if (deviceClass === 'CHEST_STRAP') return 100;
        if (deviceClass === 'OPTICAL_ARMBAND') return 85;
        if (deviceClass === 'WATCH') return 75;
        return 40;

      case 'POWER':
        if (deviceClass === 'POWER_METER') return 100;
        if (deviceClass === 'BIKE_COMPUTER') return 80;
        return 30;

      case 'CADENCE':
        if (sportType === 'CYCLING') {
          if (deviceClass === 'CRANK_SENSOR') return 100;
          if (deviceClass === 'BIKE_COMPUTER') return 85;
          if (deviceClass === 'WATCH') return 60;
        } else {
          if (deviceClass === 'FOOTPOD') return 100;
          if (deviceClass === 'WATCH') return 80;
        }
        return 50;

      case 'GPS_LOCATION':
      case 'SPEED':
      case 'DISTANCE':
        if (deviceClass === 'PHONE') return 95;
        if (deviceClass === 'WATCH') return 90;
        return 40;

      case 'STEPS':
        if (deviceClass === 'WATCH' || deviceClass === 'BAND') return 95;
        if (deviceClass === 'PHONE') return 70;
        return 50;

      default:
        return 60;
    }
  }

  ingestRecord(params: {
    activityId: string;
    sessionId: string;
    metricType: MetricType;
    value: number;
    unit: string;
    timestamp: number;
    deviceId: string;
    deviceName: string;
    deviceClass: DeviceClassType;
    provider: string;
    source: DataSourceType;
    measurementMode: MeasurementMode;
    rawSignalQuality?: number;
    sequenceNumber?: number;
    clockOffsetMs?: number;
  }): { canonicalRecord: MetricRecord | null; rawRecord: MetricRecord } {
    const streamId = `${params.activityId}_${params.metricType}_${params.deviceId}`;
    const receivedAt = Date.now();
    const ageMs = Math.max(0, receivedAt - params.timestamp);

    let stream = this.activeStreams.get(streamId);
    const lastSampleTime = stream?.lastSampleTimestamp;
    const deltaTMs = lastSampleTime ? params.timestamp - lastSampleTime : undefined;

    const qualityEval = QualityAndPlausibilityEngine.evaluateSample({
      metricType: params.metricType,
      value: params.value,
      measurementMode: params.measurementMode,
      ageMs,
      rawSignalQuality: params.rawSignalQuality,
      deltaTMs
    });

    const authorityBase = ProductionMetricArbitrator.getAuthorityWeight(
      params.metricType,
      params.deviceClass,
      this.sportType
    );

    const dynamicScore = Math.round(
      (authorityBase * 0.45) +
      (qualityEval.qualityScore * 0.25) +
      (qualityEval.confidenceScore * 0.30)
    );

    if (!stream) {
      stream = {
        streamId,
        activityId: params.activityId,
        sessionId: params.sessionId,
        metricType: params.metricType,
        deviceId: params.deviceId,
        deviceName: params.deviceName,
        deviceClass: params.deviceClass,
        provider: params.provider,
        source: params.source,
        measurementMode: params.measurementMode,
        status: 'ACTIVE',
        isPrimary: false,
        priorityScore: dynamicScore,
        lastSampleTimestamp: params.timestamp,
        lastSequenceNumber: params.sequenceNumber ?? 0,
        sampleCount: 1,
        consecutiveValidSamples: qualityEval.validityStatus === 'VALID' ? 1 : 0,
        dropoutCount: 0
      };
      this.activeStreams.set(streamId, stream);
    } else {
      stream.lastSampleTimestamp = params.timestamp;
      stream.sampleCount++;
      stream.priorityScore = dynamicScore;
      stream.status = ageMs > 5000 ? 'DEGRADED' : 'ACTIVE';
      if (qualityEval.validityStatus === 'VALID') {
        stream.consecutiveValidSamples++;
      } else {
        stream.consecutiveValidSamples = 0;
      }
    }

    this.evaluateArbitrationLeadership(params.metricType);

    const currentPrimaryStreamId = this.primaryStreamByMetric.get(params.metricType);
    const isPrimary = currentPrimaryStreamId === streamId && qualityEval.validityStatus !== 'INVALID';

    const overlapGroupId = `${params.activityId}_${params.metricType}_${Math.floor(params.timestamp / 2000)}`;

    const record: MetricRecord = {
      recordId: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      activityId: params.activityId,
      sessionId: params.sessionId,
      metricType: params.metricType,
      value: params.value,
      unit: params.unit,
      timestamp: params.timestamp,
      receivedAt,
      clockOffsetMs: params.clockOffsetMs ?? 0,
      sequenceNumber: params.sequenceNumber ?? stream.sampleCount,
      deviceId: params.deviceId,
      deviceName: params.deviceName,
      deviceClass: params.deviceClass,
      provider: params.provider,
      source: params.source,
      streamId,
      measurementMode: params.measurementMode,
      qualityScore: qualityEval.qualityScore,
      confidenceScore: qualityEval.confidenceScore,
      validityStatus: qualityEval.validityStatus,
      isCanonical: isPrimary,
      isSuppressed: !isPrimary,
      overlapGroupId,
      processingVersion: 'v2.0-production'
    };

    this.rawProvenanceStore.push(record);
    if (this.rawProvenanceStore.length > 10000) {
      this.rawProvenanceStore.shift();
    }

    return {
      canonicalRecord: isPrimary ? record : null,
      rawRecord: record
    };
  }

  private evaluateArbitrationLeadership(metricType: MetricType): void {
    const candidateStreams: TelemetryStreamState[] = [];
    for (const stream of this.activeStreams.values()) {
      if (stream.metricType === metricType && stream.status !== 'DISCONNECTED') {
        candidateStreams.push(stream);
      }
    }

    if (candidateStreams.length === 0) {
      this.primaryStreamByMetric.delete(metricType);
      return;
    }

    candidateStreams.sort((a, b) => b.priorityScore - a.priorityScore);
    const currentLeader = candidateStreams[0];
    const previousPrimaryId = this.primaryStreamByMetric.get(metricType);

    if (!previousPrimaryId) {
      currentLeader.isPrimary = true;
      this.primaryStreamByMetric.set(metricType, currentLeader.streamId);
      this.notify({
        type: 'STREAM_REGISTERED',
        metricType,
        streamId: currentLeader.streamId,
        deviceName: currentLeader.deviceName,
        reason: `Initial ${metricType} stream established`,
        timestamp: Date.now()
      });
      return;
    }

    if (previousPrimaryId !== currentLeader.streamId) {
      const prevStream = this.activeStreams.get(previousPrimaryId);

      if (!prevStream || prevStream.status === 'DISCONNECTED' || (Date.now() - prevStream.lastSampleTimestamp > 6000)) {
        if (prevStream) prevStream.isPrimary = false;
        currentLeader.isPrimary = true;
        this.primaryStreamByMetric.set(metricType, currentLeader.streamId);

        this.notify({
          type: 'FALLBACK_TRIGGERED',
          metricType,
          streamId: currentLeader.streamId,
          deviceName: currentLeader.deviceName,
          reason: `Previous stream ${prevStream?.deviceName || 'unknown'} lost signal — fallback promoted ${currentLeader.deviceName}`,
          timestamp: Date.now()
        });
        return;
      }

      const scoreDiff = currentLeader.priorityScore - prevStream.priorityScore;

      // Overwhelming authority differential (e.g. Direct Power Meter vs Watch estimate) promotes immediately
      const requiresHysteresisSamples = scoreDiff < 25;

      if (
        scoreDiff >= this.HYSTERESIS_SCORE_MARGIN &&
        (!requiresHysteresisSamples || currentLeader.consecutiveValidSamples >= this.HYSTERESIS_SAMPLES)
      ) {
        prevStream.isPrimary = false;
        currentLeader.isPrimary = true;
        this.primaryStreamByMetric.set(metricType, currentLeader.streamId);

        this.notify({
          type: 'PRIMARY_PROMOTED',
          metricType,
          streamId: currentLeader.streamId,
          deviceName: currentLeader.deviceName,
          reason: `Promoted due to superior authority/quality (+${scoreDiff} score over ${prevStream.deviceName})`,
          timestamp: Date.now()
        });
      }
    }
  }

  handleDeviceDisconnect(deviceId: string): void {
    for (const stream of this.activeStreams.values()) {
      if (stream.deviceId === deviceId) {
        stream.status = 'DISCONNECTED';
        stream.isPrimary = false;
        this.evaluateArbitrationLeadership(stream.metricType);
      }
    }
  }

  getPrimaryStream(metricType: MetricType): TelemetryStreamState | null {
    const id = this.primaryStreamByMetric.get(metricType);
    return id ? this.activeStreams.get(id) || null : null;
  }

  getRawProvenanceStore(): MetricRecord[] {
    return [...this.rawProvenanceStore];
  }

  subscribe(listener: (event: ArbitrationDecisionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: ArbitrationDecisionEvent): void {
    for (const l of this.listeners) {
      l(event);
    }
  }
}
