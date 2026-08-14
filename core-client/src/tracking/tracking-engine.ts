import { v4 as uuidv4 } from 'uuid';
import {
  TrackingState,
  SportType,
  LocationQualityState,
  LocalActivity,
  LocalActivityMetrics,
  RawGpsPoint,
  LocalSplit,
  TrackingTelemetrySnapshot
} from '../types';
import { SqliteStorage } from '../database/sqlite-storage';
import { LocationArbitrator, LocationHardwareInput } from '../location/location-arbitrator';
import { KinematicValidator } from '../processing/kinematic-validator';
import { MetricsCalculator } from '../processing/metrics-calculator';
import { AutoPauseEngine } from './auto-pause-engine';

export type TelemetryListener = (snapshot: TrackingTelemetrySnapshot) => void;

export class TrackingEngine {
  private state: TrackingState = 'IDLE';
  private sportType: SportType = 'RUNNING';
  private currentActivity: LocalActivity | null = null;
  private currentMetrics: LocalActivityMetrics | null = null;

  private storage: SqliteStorage;
  private arbitrator: LocationArbitrator;
  private validator: KinematicValidator;
  private calculator: MetricsCalculator | null = null;
  private autoPauseEngine: AutoPauseEngine;

  private previousAcceptedPoint: RawGpsPoint | undefined = undefined;
  private pointIndexCounter = 0;
  private splits: LocalSplit[] = [];
  private recentPointsBuffer: RawGpsPoint[] = [];

  private listeners: Set<TelemetryListener> = new Set();
  private clockTimer: NodeJS.Timeout | null = null;

  constructor(storage?: SqliteStorage) {
    this.storage = storage || new SqliteStorage();
    this.arbitrator = new LocationArbitrator();
    this.validator = new KinematicValidator(this.sportType);
    this.autoPauseEngine = new AutoPauseEngine(this.sportType);
  }

  // --- STATE MACHINE TRANSITIONS ---

  prepare(sportType: SportType = 'RUNNING'): void {
    if (this.state !== 'IDLE' && this.state !== 'COMPLETED') {
      throw new Error(`Cannot prepare tracking from state ${this.state}`);
    }
    this.sportType = sportType;
    this.validator.setSportType(sportType);
    this.autoPauseEngine.setSportType(sportType);
    this.state = 'READY';
    this.notifyListeners();
  }

  start(title?: string): LocalActivity {
    if (this.state !== 'READY' && this.state !== 'IDLE') {
      throw new Error(`Cannot start activity from state ${this.state}`);
    }

    const localId = uuidv4();
    const startTime = Date.now();

    this.currentActivity = {
      localId,
      sportType: this.sportType,
      title: title || `Morning ${this.sportType.charAt(0) + this.sportType.slice(1).toLowerCase()}`,
      privacy: 'PUBLIC',
      status: 'RECORDING',
      startTime,
      syncState: 'PENDING'
    };

    this.calculator = new MetricsCalculator(localId, startTime);
    this.currentMetrics = this.calculator.getMetrics();
    this.pointIndexCounter = 0;
    this.splits = [];
    this.recentPointsBuffer = [];
    this.previousAcceptedPoint = undefined;
    this.autoPauseEngine.reset();

    // Persist session to local SQLite database
    this.storage.createActivity(this.currentActivity, this.currentMetrics);

    this.state = 'RECORDING';
    this.startClockTimer();
    this.notifyListeners();

    return this.currentActivity;
  }

  pause(): void {
    if (this.state !== 'RECORDING' && this.state !== 'GPS_DEGRADED') {
      return;
    }
    this.state = 'PAUSED';
    if (this.currentActivity) {
      this.currentActivity.status = 'PAUSED';
      this.storage.updateActivityStatus(this.currentActivity.localId, 'PAUSED');
    }
    this.notifyListeners();
  }

  resume(): void {
    if (this.state !== 'PAUSED') {
      return;
    }
    this.state = 'RECORDING';
    if (this.currentActivity) {
      this.currentActivity.status = 'RECORDING';
      this.storage.updateActivityStatus(this.currentActivity.localId, 'RECORDING');
    }
    this.notifyListeners();
  }

  finish(): { activity: LocalActivity; metrics: LocalActivityMetrics; splits: LocalSplit[] } {
    if (this.state === 'IDLE' || this.state === 'COMPLETED' || !this.currentActivity || !this.calculator) {
      throw new Error('No active tracking session to finish');
    }

    this.state = 'FINISHING';
    this.stopClockTimer();

    const endTime = Date.now();
    this.currentActivity.status = 'COMPLETED';
    this.currentActivity.endTime = endTime;

    const finalMetrics = this.calculator.getMetrics();
    this.currentMetrics = finalMetrics;

    // Finalize SQLite record
    this.storage.finalizeActivity(this.currentActivity.localId, endTime, finalMetrics);

    // Enqueue into Sync Queue for background uploading
    const syncPayload = JSON.stringify({
      activity: this.currentActivity,
      metrics: finalMetrics,
      splits: this.splits
    });

    this.storage.enqueueSyncItem({
      entityType: 'ACTIVITY',
      localId: this.currentActivity.localId,
      payload: syncPayload,
      uploadedChunkIndex: 0,
      totalChunks: Math.max(1, Math.ceil(this.pointIndexCounter / 500)),
      retryCount: 0,
      status: 'PENDING'
    });

    this.state = 'COMPLETED';
    this.notifyListeners();

    return {
      activity: this.currentActivity,
      metrics: finalMetrics,
      splits: this.splits
    };
  }

  // --- HARDWARE LOCATION INGESTION LOOP ---

  ingestLocationTick(rawInput: LocationHardwareInput): void {
    if (this.state !== 'RECORDING' && this.state !== 'GPS_DEGRADED' && this.state !== 'READY') {
      return;
    }

    // 1. Location Quality Arbitrator
    const { quality, processedPoint } = this.arbitrator.evaluateLocation(rawInput);

    if (this.state === 'READY') {
      this.notifyListeners();
      return;
    }

    if (quality === 'UNAVAILABLE' || !processedPoint) {
      this.state = 'GPS_DEGRADED';
      this.notifyListeners();
      return;
    }

    // 2. Multi-Factor Kinematic Validation
    const validation = this.validator.validatePoint(processedPoint, this.previousAcceptedPoint);
    if (!validation.isValid) {
      return; // Reject physical noise/spike
    }

    // 3. Auto-Pause Speed Evaluation
    const velocity = validation.calculatedVelocityMps ?? rawInput.speed ?? 0;
    const { isAutoPaused, stateChanged } = this.autoPauseEngine.evaluateSpeed(velocity);

    const fullPoint: RawGpsPoint = {
      localActivityId: this.currentActivity!.localId,
      pointIndex: this.pointIndexCounter++,
      latitude: processedPoint.latitude,
      longitude: processedPoint.longitude,
      altitude: processedPoint.altitude,
      speed: velocity,
      accuracy: processedPoint.accuracy,
      timestamp: processedPoint.timestamp,
      isEstimated: processedPoint.isEstimated
    };

    // 4. Update Metrics & Splits
    const { metrics, triggeredSplit } = this.calculator!.processNewPoint(
      fullPoint,
      this.previousAcceptedPoint,
      !isAutoPaused
    );

    this.currentMetrics = metrics;
    this.previousAcceptedPoint = fullPoint;

    this.recentPointsBuffer.push(fullPoint);
    if (this.recentPointsBuffer.length > 50) this.recentPointsBuffer.shift();

    // 5. Commit to Local SQLite Storage
    this.storage.insertRawPoint(fullPoint);
    this.storage.updateMetrics(metrics);

    if (triggeredSplit) {
      this.splits.push(triggeredSplit);
      this.storage.insertSplit(triggeredSplit);
    }

    // 6. Quality state sync
    if (quality === 'DEGRADED' || quality === 'ESTIMATED') {
      this.state = 'GPS_DEGRADED';
    } else if (this.state === 'GPS_DEGRADED' && (quality === 'HIGH_ACCURACY' || quality === 'MODERATE_ACCURACY')) {
      this.state = 'RECORDING';
    }

    this.notifyListeners();
  }

  // --- CRASH RECOVERY ROUTINE ---

  recoverInFlightSession(): { recovered: boolean; activity: LocalActivity | null } {
    const unfinished = this.storage.getUnfinishedActivity();
    if (!unfinished) {
      return { recovered: false, activity: null };
    }

    this.currentActivity = unfinished;
    this.sportType = unfinished.sportType;
    this.validator.setSportType(this.sportType);
    this.autoPauseEngine.setSportType(this.sportType);

    const points = this.storage.getAllPointsForActivity(unfinished.localId);
    const existingMetrics = this.storage.getMetricsForActivity(unfinished.localId);
    const existingSplits = this.storage.getSplitsForActivity(unfinished.localId);

    this.calculator = new MetricsCalculator(unfinished.localId, unfinished.startTime);
    this.splits = existingSplits;
    this.pointIndexCounter = points.length;

    if (existingMetrics) {
      this.currentMetrics = existingMetrics;
      this.calculator.setHydratedMetrics(existingMetrics, existingSplits.length);
    }

    if (points.length > 0) {
      this.previousAcceptedPoint = points[points.length - 1];
      this.recentPointsBuffer = points.slice(-30);
    }

    // Safely restore in PAUSED state so the user can choose to resume or finish
    this.state = 'PAUSED';
    this.startClockTimer();
    this.notifyListeners();

    return { recovered: true, activity: this.currentActivity };
  }

  // --- REACTIVE SUBSCRIPTIONS & CLOCK ---

  subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  getSnapshot(): TrackingTelemetrySnapshot {
    return {
      state: this.state,
      quality: this.arbitrator.getCurrentQuality(),
      localActivity: this.currentActivity || {
        localId: '',
        sportType: this.sportType,
        title: '',
        privacy: 'PUBLIC',
        status: 'RECORDING',
        startTime: Date.now(),
        syncState: 'PENDING'
      },
      metrics: this.currentMetrics || {
        localActivityId: '',
        elapsedSeconds: 0,
        movingSeconds: 0,
        distanceMeters: 0,
        avgSpeedMps: 0,
        maxSpeedMps: 0,
        avgPaceSecKm: 0,
        currentPaceSecKm: 0,
        elevationGainMeters: 0,
        elevationLossMeters: 0,
        calories: 0,
        avgHr: 0,
        maxHr: 0,
        tssScore: 0,
        hrZone1Seconds: 0,
        hrZone2Seconds: 0,
        hrZone3Seconds: 0,
        hrZone4Seconds: 0,
        hrZone5Seconds: 0
      },
      recentPoints: this.recentPointsBuffer,
      splits: this.splits,
      lastPoint: this.previousAcceptedPoint,
      isAutoPaused: this.autoPauseEngine.getIsAutoPaused()
    };
  }

  private startClockTimer(): void {
    if (this.clockTimer) return;
    this.clockTimer = setInterval(() => {
      if ((this.state === 'RECORDING' || this.state === 'PAUSED' || this.state === 'GPS_DEGRADED') && this.currentActivity && this.calculator) {
        const elapsed = Math.round((Date.now() - this.currentActivity.startTime) / 1000);
        this.currentMetrics = this.calculator.tickClock(elapsed);
        this.notifyListeners();
      }
    }, 1000);
  }

  private stopClockTimer(): void {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  getState(): TrackingState {
    return this.state;
  }
}
