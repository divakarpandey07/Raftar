import { SqliteStorage } from '../src/database/sqlite-storage';
import { LocalActivity, LocalActivityMetrics } from '../src/types';

describe('SqliteStorage (Offline Database)', () => {
  let storage: SqliteStorage;

  beforeEach(() => {
    storage = new SqliteStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  test('creates activity and initial metrics, inserts raw points', () => {
    const activity: LocalActivity = {
      localId: 'act-001',
      sportType: 'RUNNING',
      title: 'Morning Run',
      privacy: 'PUBLIC',
      status: 'RECORDING',
      startTime: 1700000000000,
      syncState: 'PENDING'
    };

    const metrics: LocalActivityMetrics = {
      localActivityId: 'act-001',
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
    };

    storage.createActivity(activity, metrics);

    storage.insertRawPoint({
      localActivityId: 'act-001',
      pointIndex: 0,
      latitude: 19.0760,
      longitude: 72.8777,
      altitude: 15,
      accuracy: 5.0,
      timestamp: 1700000001000,
      isEstimated: false
    });

    const points = storage.getAllPointsForActivity('act-001');
    expect(points.length).toBe(1);
    expect(points[0].latitude).toBe(19.0760);
    expect(points[0].isEstimated).toBe(false);
  });

  test('detects unfinished activity for crash recovery', () => {
    const activity: LocalActivity = {
      localId: 'act-unclosed',
      sportType: 'CYCLING',
      title: 'Road Cycling Loop',
      privacy: 'PUBLIC',
      status: 'RECORDING',
      startTime: 1700000000000,
      syncState: 'PENDING'
    };

    storage.createActivity(activity, {
      localActivityId: 'act-unclosed',
      elapsedSeconds: 120,
      movingSeconds: 110,
      distanceMeters: 800,
      avgSpeedMps: 7.2,
      maxSpeedMps: 9.5,
      avgPaceSecKm: 138,
      currentPaceSecKm: 135,
      elevationGainMeters: 10,
      elevationLossMeters: 0,
      calories: 40,
      avgHr: 145,
      maxHr: 160,
      tssScore: 12,
      hrZone1Seconds: 10,
      hrZone2Seconds: 20,
      hrZone3Seconds: 80,
      hrZone4Seconds: 0,
      hrZone5Seconds: 0
    });

    const unfinished = storage.getUnfinishedActivity();
    expect(unfinished).not.toBeNull();
    expect(unfinished!.localId).toBe('act-unclosed');
    expect(unfinished!.sportType).toBe('CYCLING');
  });
});
