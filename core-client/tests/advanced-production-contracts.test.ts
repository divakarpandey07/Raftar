import { SafetyBeaconService } from '../src/safety/safety-beacon-service';
import { EventStreamConsumer } from '../src/infrastructure/event-stream-consumer';
import { PublicDataSerializer } from '../src/privacy/public-data-serializer';
import { VisibilityPolicy } from '../src/social/visibility-policy';
import { DerivedDataRebuilder } from '../src/processing/derived-data-rebuilder';
import { MetricsTelemetryCollector } from '../src/infrastructure/metrics-telemetry-collector';
import { PrivacyZone } from '../src/privacy/types';
import { RawGpsPoint } from '../src/types';
import { FollowRelationship } from '../src/social/types';
import { Goal } from '../src/goals/types';
import { Club, ClubChallenge } from '../src/clubs/types';
import { ValidatedActivityRecord } from '../src/goals/goals-engine';

describe('Advanced Production Contracts & Cross-Cutting Invariants', () => {
  test('SafetyBeaconService rejects replay attack with stale sequence numbers and transitions to CANCELLED', () => {
    const service = new SafetyBeaconService();
    const session = service.startSession('ath-1', ['+919876543210']);

    // Valid Packet 1 (seq = 100)
    service.ingestHeartbeat({
      sessionId: session.sessionId,
      sequenceNumber: 100,
      latitude: 19.0760,
      longitude: 72.8777,
      speedMps: 5.0,
      batteryPercentage: 90,
      timestamp: Date.now()
    });

    // Replay attack packet (seq = 100 or 99) -> Rejection!
    expect(() => {
      service.ingestHeartbeat({
        sessionId: session.sessionId,
        sequenceNumber: 100,
        latitude: 19.0760,
        longitude: 72.8777,
        speedMps: 5.0,
        batteryPercentage: 90,
        timestamp: Date.now()
      });
    }).toThrow(/Replay attack or out-of-order packet detected/);

    // SOS Countdown and explicit CANCELLED state
    service.triggerSos(session.sessionId);
    const cancelState = service.cancelSos(session.sessionId);
    expect(cancelState).toBe('CANCELLED');
  });

  test('EventStreamConsumer rejects stale events and buffers version gaps', () => {
    const consumer = new EventStreamConsumer();
    const processedEvents: number[] = [];

    const handler = (e: any) => processedEvents.push(e.version);

    // 1. Ingest Version 1 -> PROCESSED
    const r1 = consumer.consumeEvent({
      eventId: 'evt-1',
      aggregateId: 'act-100',
      version: 1,
      eventType: 'ACTIVITY_RECORDED',
      payload: {},
      idempotencyKey: 'k-1',
      timestamp: 1000
    }, handler);
    expect(r1.status).toBe('PROCESSED');
    expect(consumer.getLastVersion('act-100')).toBe(1);

    // 2. Ingest Stale Version 1 again -> IGNORED_STALE
    const r2 = consumer.consumeEvent({
      eventId: 'evt-1-dup',
      aggregateId: 'act-100',
      version: 1,
      eventType: 'ACTIVITY_RECORDED',
      payload: {},
      idempotencyKey: 'k-1-dup',
      timestamp: 2000
    }, handler);
    expect(r2.status).toBe('IGNORED_STALE');

    // 3. Ingest Version 3 (Gap detected: v2 missing) -> BUFFERED_GAP
    const r3 = consumer.consumeEvent({
      eventId: 'evt-3',
      aggregateId: 'act-100',
      version: 3,
      eventType: 'ACTIVITY_VALIDATED',
      payload: {},
      idempotencyKey: 'k-3',
      timestamp: 3000
    }, handler);
    expect(r3.status).toBe('BUFFERED_GAP');
    expect(processedEvents).toEqual([1]);

    // 4. Ingest missing Version 2 -> PROCESSED and automatically drains buffered Version 3!
    const r4 = consumer.consumeEvent({
      eventId: 'evt-2',
      aggregateId: 'act-100',
      version: 2,
      eventType: 'ACTIVITY_SPLIT_CALCULATED',
      payload: {},
      idempotencyKey: 'k-2',
      timestamp: 2500
    }, handler);
    expect(r4.status).toBe('PROCESSED');
    expect(processedEvents).toEqual([1, 2, 3]);
    expect(consumer.getLastVersion('act-100')).toBe(3);
  });

  test('PublicDataSerializer guarantees zero raw GPS coordinates and applies endpoint suppression', () => {
    const rawTrack: RawGpsPoint[] = [
      { localActivityId: 'act-1', pointIndex: 0, accuracy: 3, isEstimated: false, latitude: 19.0550, longitude: 72.8300, timestamp: 1000 },
      { localActivityId: 'act-1', pointIndex: 1, accuracy: 3, isEstimated: false, latitude: 19.0700, longitude: 72.8500, timestamp: 60000 }
    ];

    const homeZone: PrivacyZone = {
      id: 'z-home',
      athleteId: 'ath-1',
      name: 'Home',
      centerLatitude: 19.0550,
      centerLongitude: 72.8300,
      radiusMeters: 300,
      isActive: true,
      createdAt: 1000
    };

    const publicDto = PublicDataSerializer.serializeForPublicFeed(
      {
        id: 'act-1',
        athleteId: 'ath-1',
        athleteName: 'John Doe',
        title: 'Morning 5K',
        sportType: 'RUNNING',
        distanceMeters: 5000,
        durationSeconds: 1500,
        elevationGainMeters: 20,
        averageSpeedMps: 3.33
      },
      rawTrack,
      [homeZone]
    );

    expect((publicDto as any).rawPoints).toBeUndefined();
    expect(publicDto.isPrivacyMasked).toBe(true);
    expect(publicDto.svgPolylineString).toContain('M ');
  });

  test('VisibilityPolicy centrally denies access across all surfaces when a user is blocked', () => {
    const relationships: FollowRelationship[] = [
      { followerId: 'user-a', followingId: 'user-b', status: 'BLOCKED', createdAt: 500 }
    ];

    const canViewFeed = VisibilityPolicy.canView('user-b', 'user-a', 'PUBLIC', relationships, 'FEED');
    const canViewLeaderboard = VisibilityPolicy.canView('user-b', 'user-a', 'PUBLIC', relationships, 'LEADERBOARD');
    const canViewComments = VisibilityPolicy.canView('user-b', 'user-a', 'PUBLIC', relationships, 'COMMENTS');

    expect(canViewFeed).toBe(false);
    expect(canViewLeaderboard).toBe(false);
    expect(canViewComments).toBe(false);
  });

  test('DerivedDataRebuilder reconstructs all goals, achievements, and challenges deterministically', () => {
    const canonicalActs: (ValidatedActivityRecord & { athleteId: string })[] = [
      {
        id: 'act-canonical-1',
        athleteId: 'ath-1',
        sportType: 'CYCLING',
        status: 'COMPLETED',
        validityStatus: 'VALID',
        startTime: new Date('2026-08-10T06:00:00Z').getTime(),
        durationSeconds: 12000,
        distanceMeters: 105000,
        elevationGainMeters: 800
      }
    ];

    const goals: Goal[] = [
      {
        id: 'goal-aug-100k',
        athleteId: 'ath-1',
        goalType: 'DISTANCE_METERS',
        sportType: 'CYCLING',
        period: 'MONTHLY',
        targetValue: 100000,
        currentValue: 0,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        status: 'ACTIVE',
        progressPercentage: 0,
        isAchieved: false,
        createdAt: 1000
      }
    ];

    const club: Club = {
      id: 'club-mumbai',
      name: 'Mumbai Cyclists',
      description: 'Club',
      sportType: 'CYCLING',
      privacy: 'PUBLIC',
      memberCount: 1,
      members: [{ athleteId: 'ath-1', athleteName: 'Athlete', role: 'OWNER', joinedAt: 1000 }],
      createdAt: 1000
    };

    const challenges: ClubChallenge[] = [
      {
        id: 'chal-aug-ride',
        clubId: 'club-mumbai',
        title: 'August Club Ride',
        description: 'Ride',
        challengeType: 'TOTAL_DISTANCE',
        targetValue: 100000,
        currentValue: 0,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        status: 'ACTIVE',
        isCompleted: false,
        participantCount: 0,
        createdAt: 1000
      }
    ];

    const result = DerivedDataRebuilder.rebuildAll(canonicalActs, goals, [club], challenges);

    expect(result.updatedGoals[0].currentValue).toBe(105000);
    expect(result.updatedGoals[0].isAchieved).toBe(true);
    expect(result.unlockedAchievements.some((b) => b.id === 'CENTURION_100K_RIDE')).toBe(true);
    expect(result.updatedChallenges[0].currentValue).toBe(105000);
    expect(result.updatedChallenges[0].isCompleted).toBe(true);
  });

  test('MetricsTelemetryCollector tracks SOS delivery stages and records heartbeat loss', () => {
    const collector = new MetricsTelemetryCollector();
    collector.recordSosLifecycle({
      sosDetectedAt: 1000,
      contactNotifiedAt: 1045
    });
    collector.recordHeartbeatLoss('sess-xyz');

    const metrics = collector.getSnapshot();
    const alerts = collector.getAlerts();

    expect(metrics.sosDispatchedCount).toBe(1);
    expect(metrics.heartbeatLossCount).toBe(1);
    expect(alerts[0]).toContain('SAFETY WARNING: Heartbeat lost');
  });
});
