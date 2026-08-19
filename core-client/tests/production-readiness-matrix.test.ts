import { IdempotencyManager } from '../src/infrastructure/idempotency-manager';
import { SafetyBeaconService } from '../src/safety/safety-beacon-service';
import { EventStreamConsumer } from '../src/infrastructure/event-stream-consumer';
import { PublicDataSerializer } from '../src/privacy/public-data-serializer';
import { DerivedDataRebuilder } from '../src/processing/derived-data-rebuilder';
import { MetricsTelemetryCollector } from '../src/infrastructure/metrics-telemetry-collector';
import { TrackingEngine } from '../src/tracking/tracking-engine';
import { SqliteStorage } from '../src/database/sqlite-storage';
import { RawGpsPoint } from '../src/types';
import { PrivacyZone } from '../src/privacy/types';
import { Goal } from '../src/goals/types';
import { Club, ClubChallenge } from '../src/clubs/types';
import { ValidatedActivityRecord } from '../src/goals/goals-engine';

describe('Production Readiness Matrix (Concurrency, Fingerprints, Recovery, Reconciliation, Security & Safety)', () => {
  test('1. CONCURRENCY & FINGERPRINTS: Duplicate sync requests execute once; different payload with same key is rejected', async () => {
    const idemp = new IdempotencyManager();
    let sideEffectCount = 0;

    const performSync = async () => {
      sideEffectCount++;
      return { syncedActivityId: 'act-concurrent-100', status: 'SUCCESS' };
    };

    const payloadA = { distance: 5000, athleteId: 'ath-1' };
    const payloadB = { distance: 10000, athleteId: 'ath-2' }; // Different payload!

    // Simultaneous requests with identical payload
    const promises = Array(4)
      .fill(0)
      .map(() => idemp.executeIdempotent('sync-key-unique-999', performSync, payloadA));

    const results = await Promise.all(promises);

    expect(sideEffectCount).toBe(1);
    expect(results.every((r) => r.result.syncedActivityId === 'act-concurrent-100')).toBe(true);

    // Reusing same key with different payload MUST throw IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_REQUEST
    await expect(
      idemp.executeIdempotent('sync-key-unique-999', performSync, payloadB)
    ).rejects.toThrow(/IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_REQUEST/);
  });

  test('2. OFFLINE & RECOVERY: Local tracking session interrupted mid-workout recovers cleanly from SQLite', () => {
    const storage = new SqliteStorage(':memory:');
    const engine1 = new TrackingEngine(storage);

    engine1.prepare('RUNNING');
    const act = engine1.start('Offline Workout');

    const baseTime = Date.now();
    for (let i = 0; i < 3; i++) {
      engine1.ingestLocationTick({
        latitude: 19.0550 + (i * 0.0001),
        longitude: 72.8300,
        altitude: 10,
        accuracy: 4.0,
        speed: 3.5,
        timestamp: baseTime + (i * 1000),
        sourceType: 'GNSS'
      });
    }

    expect(engine1.getState()).toBe('RECORDING');

    // Simulate crash & restart with new engine pointing to same storage
    const engine2 = new TrackingEngine(storage);
    const recoveryResult = engine2.recoverInFlightSession();
    expect(recoveryResult.recovered).toBe(true);
    expect(recoveryResult.activity?.localId).toBe(act.localId);
    expect(engine2.getState()).toBe('PAUSED');

    const snapshot = engine2.getSnapshot();
    expect(snapshot.metrics.distanceMeters).toBeGreaterThan(10);
    storage.close();
  });

  test('3. RECONCILIATION: Invalidation of an activity converges all derived systems', () => {
    const canonicalActs: (ValidatedActivityRecord & { athleteId: string })[] = [
      {
        id: 'act-valid-1',
        athleteId: 'ath-1',
        sportType: 'RUNNING',
        status: 'COMPLETED',
        validityStatus: 'VALID',
        startTime: new Date('2026-08-10T06:00:00Z').getTime(),
        durationSeconds: 1140, // Sub-20 5K
        distanceMeters: 5000,
        elevationGainMeters: 20
      },
      {
        id: 'act-corrupt-2',
        athleteId: 'ath-1',
        sportType: 'RUNNING',
        status: 'COMPLETED',
        validityStatus: 'INVALID', // Flawed GPS / Vehicle
        startTime: new Date('2026-08-11T06:00:00Z').getTime(),
        durationSeconds: 300,
        distanceMeters: 50000, // 50km in 5 mins
        elevationGainMeters: 0
      }
    ];

    const goals: Goal[] = [
      {
        id: 'goal-weekly-dist',
        athleteId: 'ath-1',
        goalType: 'DISTANCE_METERS',
        sportType: 'RUNNING',
        period: 'WEEKLY',
        targetValue: 10000,
        currentValue: 0,
        startDate: '2026-08-10',
        endDate: '2026-08-16',
        status: 'ACTIVE',
        progressPercentage: 0,
        isAchieved: false,
        createdAt: 1000
      }
    ];

    const rebuilt = DerivedDataRebuilder.rebuildAll(canonicalActs, goals, [], []);

    expect(rebuilt.updatedGoals[0].currentValue).toBe(5000);
    expect(rebuilt.updatedGoals[0].isAchieved).toBe(false);
    expect(rebuilt.unlockedAchievements.some((b) => b.id === 'SUB_20_5K')).toBe(true);
    expect(rebuilt.unlockedAchievements.some((b) => b.id === 'MARATHON_HERO')).toBe(false);
  });

  test('4. SPATIAL PRIVACY: Public serializer applies endpoint suppression and spatial quantization', () => {
    const rawTrack: RawGpsPoint[] = [
      { localActivityId: 'act-1', pointIndex: 0, accuracy: 3, isEstimated: false, latitude: 19.055123, longitude: 72.830456, timestamp: 1000 },
      { localActivityId: 'act-1', pointIndex: 1, accuracy: 3, isEstimated: false, latitude: 19.056789, longitude: 72.831123, timestamp: 10000 },
      { localActivityId: 'act-1', pointIndex: 2, accuracy: 3, isEstimated: false, latitude: 19.058456, longitude: 72.832789, timestamp: 20000 },
      { localActivityId: 'act-1', pointIndex: 3, accuracy: 3, isEstimated: false, latitude: 19.060123, longitude: 72.834456, timestamp: 30000 },
      { localActivityId: 'act-1', pointIndex: 4, accuracy: 3, isEstimated: false, latitude: 19.061789, longitude: 72.836123, timestamp: 40000 },
      { localActivityId: 'act-1', pointIndex: 5, accuracy: 3, isEstimated: false, latitude: 19.063456, longitude: 72.837789, timestamp: 50000 }
    ];

    const publicDto = PublicDataSerializer.serializeForPublicFeed(
      {
        id: 'act-1',
        athleteId: 'ath-1',
        athleteName: 'Athlete Name',
        title: 'Run',
        sportType: 'RUNNING',
        distanceMeters: 5000,
        durationSeconds: 1500,
        elevationGainMeters: 30,
        averageSpeedMps: 3.33
      },
      rawTrack,
      []
    );

    // Guaranteed Endpoint Suppression + Zero Raw Points
    expect((publicDto as any).rawPoints).toBeUndefined();
    expect(publicDto.endpointSuppressionApplied).toBe(true);
    expect(publicDto.isPrivacyMasked).toBe(true);
    expect(publicDto.svgPolylineString).toBeDefined();
  });

  test('5. SECURITY: Beacon service rejects packet replay attack and maintains sequence monotonicity', () => {
    const service = new SafetyBeaconService();
    const session = service.startSession('ath-solo', ['+919876543210']);

    const p1 = {
      sessionId: session.sessionId,
      sequenceNumber: 1,
      latitude: 19.0760,
      longitude: 72.8777,
      speedMps: 4.5,
      batteryPercentage: 95,
      timestamp: 1000
    };

    const p2 = {
      sessionId: session.sessionId,
      sequenceNumber: 2,
      latitude: 19.0765,
      longitude: 72.8780,
      speedMps: 4.8,
      batteryPercentage: 94,
      timestamp: 2000
    };

    service.ingestHeartbeat(p1);
    service.ingestHeartbeat(p2);

    expect(() => service.ingestHeartbeat(p1)).toThrow(/Replay attack or out-of-order packet detected/);
  });

  test('6. OBSERVABILITY: Collector correctly alerts on SLA violations (> 1000ms breach)', () => {
    const collector = new MetricsTelemetryCollector();

    // 1. Normal fast SOS delivery (120ms) -> No alert
    collector.recordSosLifecycle({
      sosDetectedAt: 1000,
      apiAcceptedAt: 1010,
      dispatchInitiatedAt: 1030,
      providerAcceptedAt: 1070,
      contactNotifiedAt: 1120 // 120ms
    });

    expect(collector.getAlerts().length).toBe(0);

    // 2. Slow SOS delivery violating SLA (1400ms > 1000ms SLA limit) -> Critical Alert!
    collector.recordSosLifecycle({
      sosDetectedAt: 5000,
      contactNotifiedAt: 6400 // 1400ms SLA breach
    });

    const alerts = collector.getAlerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toContain('CRITICAL SLA BREACH: SOS Dispatch Latency 1400ms exceeds SLA limit of 1000ms');
  });
});
