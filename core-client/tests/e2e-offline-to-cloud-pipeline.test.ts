import { TrackingEngine } from '../src/tracking/tracking-engine';
import { SqliteStorage } from '../src/database/sqlite-storage';
import { PublicDataSerializer } from '../src/privacy/public-data-serializer';
import { EnvironmentalTelemetryEngine } from '../src/environmental/environmental-telemetry-engine';
import { AiCoachingNarrativeEngine } from '../src/ai/ai-coaching-narrative-engine';
import { AchievementEngine } from '../src/achievements/achievement-engine';
import { GoalsEngine, ValidatedActivityRecord } from '../src/goals/goals-engine';
import { ActivityIntegrityEngine } from '../src/integrity/activity-integrity-engine';
import { RawGpsPoint } from '../src/types';
import { Goal } from '../src/goals/types';

describe('Phase 29: End-to-End Pipeline (Offline Recording -> Outbox -> AI & Privacy)', () => {
  let db: SqliteStorage;

  beforeEach(() => {
    db = new SqliteStorage(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  test('Complete End-to-End Athletic Lifecycle Pipeline', async () => {
    // 1. Initial Athlete Startup & Local Database Initialization
    const engine = new TrackingEngine(db);
    engine.prepare('RUNNING');

    // 2. Start Recording & Ingest Valid Telemetry Track
    const initialActivity = engine.start('Morning Marina 5K');
    const activityId = initialActivity.localId;
    expect(activityId).toBeDefined();

    const startTime = Date.now();
    const rawGpsPoints: RawGpsPoint[] = [];

    // Simulate steady run (60 points, 0.000025 deg delta per second = ~2.8 m/s = 10 km/h)
    for (let i = 0; i < 60; i++) {
      const lat = 18.9430 + (i * 0.000025);
      const lon = 72.8230;
      const pt: RawGpsPoint = {
        localActivityId: activityId,
        pointIndex: i,
        latitude: lat,
        longitude: lon,
        altitude: 15.0 + (i * 0.05),
        speed: 2.8,
        accuracy: 4.0,
        timestamp: startTime + (i * 1000),
        isEstimated: false
      };
      rawGpsPoints.push(pt);
      engine.ingestLocationTick({
        latitude: lat,
        longitude: lon,
        altitude: 15.0 + (i * 0.05),
        speed: 2.8,
        accuracy: 4.0,
        timestamp: startTime + (i * 1000),
        sourceType: 'GNSS'
      });
    }

    // 3. Environmental Telemetry Snapshotting
    const envSnapshot = EnvironmentalTelemetryEngine.createSnapshot(
      activityId,
      {
        temperatureCelsius: 26.0,
        apparentTemperatureCelsius: 27.0,
        relativeHumidityPercent: 65,
        windSpeedMps: 2.5,
        windDirectionDegrees: 180,
        aqiUsEpa: 42,
        weatherCode: 'CLEAR'
      }
    );
    expect(envSnapshot.environmentalStrain).toBe('OPTIMAL');

    // 4. Activity Completion & SQLite Local Commit
    const finishedResult = engine.finish();
    expect(finishedResult).toBeDefined();
    expect(finishedResult.activity.status).toBe('COMPLETED');
    expect(finishedResult.metrics.distanceMeters).toBeGreaterThan(100);

    // 5. Activity Integrity Verification (Tri-State Engine)
    const integrityVerdict = ActivityIntegrityEngine.evaluateTrack(
      activityId,
      'RUNNING',
      rawGpsPoints
    );
    expect(integrityVerdict.verdict).toBe('VALID');
    expect(integrityVerdict.evidenceScore).toBeGreaterThanOrEqual(90);

    // 6. Goals & Achievements Subsystem Integration
    const validatedRecord: ValidatedActivityRecord = {
      id: activityId,
      sportType: 'RUNNING',
      status: 'COMPLETED',
      validityStatus: 'VALID',
      isManual: false,
      startTime,
      durationSeconds: finishedResult.metrics.movingSeconds,
      distanceMeters: finishedResult.metrics.distanceMeters,
      elevationGainMeters: finishedResult.metrics.elevationGainMeters,
      timezone: 'Asia/Kolkata'
    };

    const achievementEngine = new AchievementEngine();
    const newBadges = achievementEngine.evaluateActivity(validatedRecord, [validatedRecord]);
    expect(Array.isArray(newBadges)).toBe(true);

    const todayIso = new Date().toISOString().slice(0, 10);
    const testGoal: Goal = {
      id: 'goal-1',
      athleteId: 'ath-champion-1',
      goalType: 'DISTANCE_METERS',
      sportType: 'RUNNING',
      period: 'WEEKLY',
      targetValue: 5000,
      currentValue: 0,
      startDate: todayIso,
      endDate: todayIso,
      status: 'ACTIVE',
      progressPercentage: 0,
      isAchieved: false,
      createdAt: startTime
    };

    const evaluatedGoal = GoalsEngine.evaluateGoalProgress(testGoal, [validatedRecord]);
    expect(evaluatedGoal.currentValue).toBeGreaterThan(100);

    // 7. Grounded AI Athletic Intelligence & Decoupling
    const insights = AiCoachingNarrativeEngine.generateInsights(
      {
        id: activityId,
        athleteName: 'Arjun',
        sportType: 'RUNNING',
        distanceMeters: finishedResult.metrics.distanceMeters,
        durationSeconds: finishedResult.metrics.movingSeconds,
        averageSpeedMps: finishedResult.metrics.avgSpeedMps,
        elevationGainMeters: finishedResult.metrics.elevationGainMeters,
        averageHeartRate: 152
      },
      [],
      rawGpsPoints.map(p => ({ speedMps: p.speed || 2.8, heartRate: 152, timestamp: p.timestamp })),
      [
        { tss: 45, timestamp: startTime - 86400000 },
        { tss: 50, timestamp: startTime - 172800000 },
        { tss: 55, timestamp: startTime - 259200000 },
        { tss: 40, timestamp: startTime - 345600000 }
      ]
    );

    expect(insights.provenanceClaims.length).toBeGreaterThan(0);
    expect(insights.coachingNarrative).toBeDefined();
    expect(insights.nextSessionRecommendation).toBeDefined();

    // 8. Public Data Serialization & Zero Raw GPS Coordinate Leak
    const publicDto = PublicDataSerializer.serializeForPublicFeed(
      {
        id: activityId,
        athleteId: 'ath-champion-1',
        athleteName: 'Arjun',
        title: 'Morning Marina 5K',
        sportType: 'RUNNING',
        distanceMeters: finishedResult.metrics.distanceMeters,
        durationSeconds: finishedResult.metrics.movingSeconds,
        averageSpeedMps: finishedResult.metrics.avgSpeedMps,
        averageHeartRate: 152,
        elevationGainMeters: finishedResult.metrics.elevationGainMeters
      },
      rawGpsPoints,
      []
    );

    expect((publicDto as any).rawGpsPoints).toBeUndefined();
    expect((publicDto as any).coordinates).toBeUndefined();
    expect(publicDto.svgPolylineString).toBeDefined();
  });
});
