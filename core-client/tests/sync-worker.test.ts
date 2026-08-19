import { SqliteStorage } from '../src/database/sqlite-storage';
import { SyncWorker } from '../src/sync/sync-worker';

describe('SyncWorker (Resumable Outbox Upload)', () => {
  let storage: SqliteStorage;
  let worker: SyncWorker;

  beforeEach(() => {
    storage = new SqliteStorage(':memory:');
    worker = new SyncWorker(storage, {
      backendBaseUrl: 'http://test-mode',
      chunkSizePoints: 10
    });
  });

  afterEach(() => {
    storage.close();
  });

  test('processes SQLite outbox and emits chunk upload events', async () => {
    const events: string[] = [];
    worker.subscribe((e) => events.push(e.type));

    // Enqueue an activity
    storage.createActivity({
      localId: 'sync-act-1',
      sportType: 'RUNNING',
      title: 'Morning Outbox Run',
      privacy: 'PUBLIC',
      status: 'COMPLETED',
      startTime: 1700000000000,
      endTime: 1700001000000,
      syncState: 'PENDING'
    }, {
      localActivityId: 'sync-act-1',
      elapsedSeconds: 1000,
      movingSeconds: 950,
      distanceMeters: 3000,
      avgSpeedMps: 3.1,
      maxSpeedMps: 4.2,
      avgPaceSecKm: 316,
      currentPaceSecKm: 310,
      elevationGainMeters: 20,
      elevationLossMeters: 5,
      calories: 195,
      avgHr: 155,
      maxHr: 172,
      tssScore: 65,
      hrZone1Seconds: 50,
      hrZone2Seconds: 100,
      hrZone3Seconds: 600,
      hrZone4Seconds: 200,
      hrZone5Seconds: 0
    });

    // Add 25 raw points (spread across 3 chunks of size 10)
    for (let i = 0; i < 25; i++) {
      storage.insertRawPoint({
        localActivityId: 'sync-act-1',
        pointIndex: i,
        latitude: 19.0760 + (i * 0.0001),
        longitude: 72.8777,
        accuracy: 4.0,
        timestamp: 1700000000000 + (i * 1000),
        isEstimated: false
      });
    }

    storage.enqueueSyncItem({
      entityType: 'ACTIVITY',
      localId: 'sync-act-1',
      payload: JSON.stringify({ activityId: 'sync-act-1' }),
      totalChunks: 3,
      uploadedChunkIndex: 0,
      retryCount: 0,
      status: 'PENDING'
    });

    const result = await worker.processOutboxQueue();
    expect(result.processedCount).toBe(1);
    expect(result.failedCount).toBe(0);

    expect(events).toContain('SYNC_STARTED');
    expect(events).toContain('CHUNK_UPLOADED');
    expect(events).toContain('SYNC_COMPLETED');

    const pending = storage.getPendingSyncItems();
    expect(pending.length).toBe(0);
  });
});
