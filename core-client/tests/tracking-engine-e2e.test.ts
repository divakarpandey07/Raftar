import { TrackingEngine } from '../src/tracking/tracking-engine';
import { SqliteStorage } from '../src/database/sqlite-storage';

describe('TrackingEngine Full Lifecycle & In-Flight Crash Recovery', () => {
  let storage: SqliteStorage;
  let engine: TrackingEngine;

  beforeEach(() => {
    storage = new SqliteStorage(':memory:');
    engine = new TrackingEngine(storage);
  });

  afterEach(() => {
    storage.close();
  });

  test('Full lifecycle: prepare -> start -> ingest points -> pause -> resume -> finish -> enqueue sync', () => {
    engine.prepare('RUNNING');
    expect(engine.getState()).toBe('READY');

    const activity = engine.start('Marine Drive Threshold');
    expect(engine.getState()).toBe('RECORDING');
    expect(activity.localId).toBeDefined();

    // Ingest 5 valid GNSS points (~3.3 m/s running pace)
    const baseLat = 19.0760;
    const baseTime = Date.now();

    for (let i = 0; i < 5; i++) {
      engine.ingestLocationTick({
        latitude: baseLat + (i * 0.00003),
        longitude: 72.8777,
        altitude: 12 + i,
        accuracy: 4.0,
        speed: 3.3,
        timestamp: baseTime + (i * 1000),
        sourceType: 'GNSS'
      });
    }

    const snapshot = engine.getSnapshot();
    expect(snapshot.metrics.distanceMeters).toBeGreaterThan(10);
    expect(snapshot.quality).toBe('HIGH_ACCURACY');

    // Pause
    engine.pause();
    expect(engine.getState()).toBe('PAUSED');

    // Resume
    engine.resume();
    expect(engine.getState()).toBe('RECORDING');

    // Finish
    const finishResult = engine.finish();
    expect(finishResult.activity.status).toBe('COMPLETED');
    expect(engine.getState()).toBe('COMPLETED');

    // Verify sync queue has enqueued task
    const pending = storage.getPendingSyncItems();
    expect(pending.length).toBe(1);
    expect(pending[0].localId).toBe(activity.localId);
  });

  test('In-Flight Crash Recovery: restores active unclosed session from SQLite', () => {
    // 1. First engine starts session and logs points (~3.3 m/s)
    engine.prepare('RUNNING');
    const act = engine.start('Morning Forest Run');
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      engine.ingestLocationTick({
        latitude: 19.0760 + (i * 0.00003),
        longitude: 72.8777,
        altitude: 20,
        accuracy: 4.5,
        speed: 3.3,
        timestamp: now + (i * 1000),
        sourceType: 'GNSS'
      });
    }

    // 2. Simulate sudden app termination (new TrackingEngine instance on same database)
    const recoveredEngine = new TrackingEngine(storage);
    const recoveryResult = recoveredEngine.recoverInFlightSession();

    expect(recoveryResult.recovered).toBe(true);
    expect(recoveryResult.activity?.localId).toBe(act.localId);
    expect(recoveredEngine.getState()).toBe('PAUSED');

    const recoveredSnapshot = recoveredEngine.getSnapshot();
    expect(recoveredSnapshot.metrics.distanceMeters).toBeGreaterThan(10);
    expect(recoveredSnapshot.recentPoints.length).toBe(5);
  });
});
