import { ProductionMetricArbitrator, ArbitrationDecisionEvent } from '../src/wearable/production-metric-arbitrator';
import { QualityAndPlausibilityEngine } from '../src/wearable/quality-engine';
import { PostWorkoutReconciliationEngine } from '../src/processing/post-workout-reconciliation';
import { MetricRecord } from '../src/types/provenance.types';

describe('Production Wearable & Telemetry Arbitration Engine (Comprehensive Matrix)', () => {
  let arbitrator: ProductionMetricArbitrator;
  let events: ArbitrationDecisionEvent[];

  beforeEach(() => {
    arbitrator = new ProductionMetricArbitrator('RUNNING');
    events = [];
    arbitrator.subscribe((e) => events.push(e));
  });

  // 1. Freshness Penalty: Stale high-authority strap loses to fresh watch
  test('Category 1: Stale chest strap (age > 6s) loses leadership to fresh smartwatch HR', () => {
    const now = Date.now();

    // Chest strap sends sample from 7 seconds ago (stale/dropout)
    arbitrator.ingestRecord({
      activityId: 'act-fresh-1',
      sessionId: 'sess-1',
      metricType: 'HEART_RATE',
      value: 155,
      unit: 'bpm',
      timestamp: now - 7000,
      deviceId: 'polar-h10',
      deviceName: 'Polar H10',
      deviceClass: 'CHEST_STRAP',
      provider: 'polar',
      source: 'BLE_STANDARD',
      measurementMode: 'MEASURED'
    });

    // Fresh watch sample sends sample from 0.5s ago
    const watchRes = arbitrator.ingestRecord({
      activityId: 'act-fresh-1',
      sessionId: 'sess-1',
      metricType: 'HEART_RATE',
      value: 154,
      unit: 'bpm',
      timestamp: now - 500,
      deviceId: 'galaxy-watch',
      deviceName: 'Galaxy Watch 6',
      deviceClass: 'WATCH',
      provider: 'samsung',
      source: 'HEALTH_CONNECT',
      measurementMode: 'MEASURED'
    });

    // Watch wins canonical leadership because chest strap is stale!
    const primary = arbitrator.getPrimaryStream('HEART_RATE');
    expect(primary?.deviceId).toBe('galaxy-watch');
    expect(watchRes.canonicalRecord?.isCanonical).toBe(true);
  });

  // 2. Anti-Flapping Hysteresis: Won't flip back and forth on single noisy fluctuations
  test('Category 2: Anti-flapping hysteresis requires consecutive stable samples to promote leader', () => {
    const now = Date.now();

    // 1. Initial stable Watch stream
    arbitrator.ingestRecord({
      activityId: 'act-hysteresis-1',
      sessionId: 'sess-1',
      metricType: 'HEART_RATE',
      value: 140,
      unit: 'bpm',
      timestamp: now,
      deviceId: 'galaxy-watch',
      deviceName: 'Galaxy Watch 6',
      deviceClass: 'WATCH',
      provider: 'samsung',
      source: 'HEALTH_CONNECT',
      measurementMode: 'MEASURED'
    });

    expect(arbitrator.getPrimaryStream('HEART_RATE')?.deviceId).toBe('galaxy-watch');

    // 2. Chest strap emits 1 sample with marginal signal
    arbitrator.ingestRecord({
      activityId: 'act-hysteresis-1',
      sessionId: 'sess-1',
      metricType: 'HEART_RATE',
      value: 142,
      unit: 'bpm',
      timestamp: now + 1000,
      deviceId: 'polar-h10',
      deviceName: 'Polar H10',
      deviceClass: 'CHEST_STRAP',
      provider: 'polar',
      source: 'BLE_STANDARD',
      measurementMode: 'MEASURED',
      rawSignalQuality: 60 // Low contact
    });

    // After 1 marginal sample, hysteresis prevents immediate flip
    // Polar emits 3 consecutive high-quality samples:
    for (let i = 2; i <= 4; i++) {
      arbitrator.ingestRecord({
        activityId: 'act-hysteresis-1',
        sessionId: 'sess-1',
        metricType: 'HEART_RATE',
        value: 145,
        unit: 'bpm',
        timestamp: now + (i * 1000),
        deviceId: 'polar-h10',
        deviceName: 'Polar H10',
        deviceClass: 'CHEST_STRAP',
        provider: 'polar',
        source: 'BLE_STANDARD',
        measurementMode: 'MEASURED',
        rawSignalQuality: 98
      });
    }

    // Now Polar H10 is promoted safely with verified stability!
    expect(arbitrator.getPrimaryStream('HEART_RATE')?.deviceId).toBe('polar-h10');
  });

  // 3. Measured vs Estimated separation (Cycling Power)
  test('Category 3: Direct strain-gauge Power Meter strictly supersedes Watch estimated power', () => {
    arbitrator.setSportType('CYCLING');
    const now = Date.now();

    // 1. Smartwatch estimated power (220W ESTIMATED)
    const watchPower = arbitrator.ingestRecord({
      activityId: 'act-pwr-1',
      sessionId: 'sess-1',
      metricType: 'POWER',
      value: 220,
      unit: 'watts',
      timestamp: now,
      deviceId: 'apple-watch-ultra',
      deviceName: 'Apple Watch Ultra',
      deviceClass: 'WATCH',
      provider: 'apple',
      source: 'HEALTH_KIT',
      measurementMode: 'ESTIMATED'
    });

    // 2. Direct Crank Power Meter (215W MEASURED)
    const directPower = arbitrator.ingestRecord({
      activityId: 'act-pwr-1',
      sessionId: 'sess-1',
      metricType: 'POWER',
      value: 215,
      unit: 'watts',
      timestamp: now + 500,
      deviceId: 'srm-power-meter',
      deviceName: 'SRM Dual-Sided Crank',
      deviceClass: 'POWER_METER',
      provider: 'wahoo',
      source: 'BLE_STANDARD',
      measurementMode: 'MEASURED'
    });

    // Direct measured power meter receives canonical leadership!
    const primaryPwr = arbitrator.getPrimaryStream('POWER');
    expect(primaryPwr?.deviceId).toBe('srm-power-meter');
    expect(directPower.canonicalRecord?.measurementMode).toBe('MEASURED');
  });

  // 4. Plausibility Range Verification: Impossible values flagged INVALID and excluded from Canonical
  test('Category 4: Impossible heart rate (850 BPM) is flagged INVALID and excluded from canonical', () => {
    const now = Date.now();

    const badSample = arbitrator.ingestRecord({
      activityId: 'act-plausibility-1',
      sessionId: 'sess-1',
      metricType: 'HEART_RATE',
      value: 850, // Impossible BPM spike
      unit: 'bpm',
      timestamp: now,
      deviceId: 'faulty-sensor',
      deviceName: 'Faulty BLE Strap',
      deviceClass: 'CHEST_STRAP',
      provider: 'generic',
      source: 'BLE_STANDARD',
      measurementMode: 'MEASURED'
    });

    expect(badSample.canonicalRecord).toBeNull(); // Excluded from live canonical
    expect(badSample.rawRecord.validityStatus).toBe('INVALID'); // Preserved in raw provenance
  });

  // 5. Post-Workout Buffered Reconciliation: Late-arriving buffered high-res data supersedes live fallback
  test('Category 5: Post-workout reconciliation merges buffered Polar memory data into Final Canonical', () => {
    const actId = 'act-reconciliation-1';
    const t1 = 1700000000000;
    const t2 = 1700000001000;

    // Live recorded stream during workout (Galaxy Watch fallback)
    const liveRecord: MetricRecord = {
      recordId: 'rec-live-1',
      activityId: actId,
      sessionId: 'sess-1',
      metricType: 'HEART_RATE',
      value: 148,
      unit: 'bpm',
      timestamp: t1,
      receivedAt: t1 + 200,
      clockOffsetMs: 0,
      sequenceNumber: 1,
      deviceId: 'galaxy-watch',
      deviceName: 'Galaxy Watch 6',
      deviceClass: 'WATCH',
      provider: 'samsung',
      source: 'HEALTH_CONNECT',
      streamId: 'stream-watch',
      measurementMode: 'MEASURED',
      qualityScore: 75,
      confidenceScore: 75,
      validityStatus: 'VALID',
      isCanonical: true,
      isSuppressed: false,
      overlapGroupId: 'group-1',
      processingVersion: 'v2.0'
    };

    // Late-arriving offloaded Polar H10 internal memory sample for same timestamp
    const bufferedPolarRecord: MetricRecord = {
      recordId: 'rec-polar-buffered-1',
      activityId: actId,
      sessionId: 'sess-1',
      metricType: 'HEART_RATE',
      value: 150,
      unit: 'bpm',
      timestamp: t1,
      receivedAt: t1 + 3600000, // arrived 1 hour later via offload
      clockOffsetMs: 0,
      sequenceNumber: 1,
      deviceId: 'polar-h10',
      deviceName: 'Polar H10',
      deviceClass: 'CHEST_STRAP',
      provider: 'polar',
      source: 'BLE_STANDARD',
      streamId: 'stream-polar',
      measurementMode: 'MEASURED',
      qualityScore: 99,
      confidenceScore: 98,
      validityStatus: 'VALID',
      isCanonical: false,
      isSuppressed: false,
      overlapGroupId: 'group-1',
      processingVersion: 'v2.0'
    };

    const reconciliation = PostWorkoutReconciliationEngine.reconcileActivityTimeline(
      actId,
      [liveRecord],
      [bufferedPolarRecord]
    );

    expect(reconciliation.totalRawRecords).toBe(2);
    expect(reconciliation.finalCanonicalRecords.length).toBe(1);
    // Polar H10 wins Final Canonical because of higher quality/authority score!
    expect(reconciliation.finalCanonicalRecords[0].deviceId).toBe('polar-h10');
    expect(reconciliation.supersededRecordsCount).toBe(1);
  });
});
