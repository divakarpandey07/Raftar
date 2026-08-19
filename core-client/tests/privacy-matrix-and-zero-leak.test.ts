import { PublicDataSerializer } from '../src/privacy/public-data-serializer';
import { PrivacyTransformationLayer } from '../src/privacy/privacy-zone-engine';
import { VisibilityPolicy } from '../src/social/visibility-policy';
import { FollowRelationship } from '../src/social/types';
import { PrivacyZone } from '../src/privacy/types';
import { RawGpsPoint } from '../src/types';

describe('Production Privacy Matrix & Zero-Leak Verification', () => {
  const homeZone: PrivacyZone = {
    id: 'pz-home',
    athleteId: 'ath-1',
    name: 'Home Zone',
    centerLatitude: 18.9430,
    centerLongitude: 72.8230,
    radiusMeters: 500,
    isActive: true,
    createdAt: Date.now()
  };

  const rawTrack: RawGpsPoint[] = [
    { localActivityId: 'act-1', pointIndex: 0, accuracy: 3, isEstimated: false, latitude: 18.94302, longitude: 72.82301, timestamp: 1000 },
    { localActivityId: 'act-1', pointIndex: 1, accuracy: 3, isEstimated: false, latitude: 18.94500, longitude: 72.82400, timestamp: 2000 },
    { localActivityId: 'act-1', pointIndex: 2, accuracy: 3, isEstimated: false, latitude: 18.95500, longitude: 72.83500, timestamp: 3000 },
    { localActivityId: 'act-1', pointIndex: 3, accuracy: 3, isEstimated: false, latitude: 18.96500, longitude: 72.84500, timestamp: 4000 },
    { localActivityId: 'act-1', pointIndex: 4, accuracy: 3, isEstimated: false, latitude: 18.97500, longitude: 72.85500, timestamp: 5000 }
  ];

  test('1. Zero Raw GPS Leak: Public serialization never exposes raw coordinates array', () => {
    const publicDto = PublicDataSerializer.serializeForPublicFeed(
      {
        id: 'act-1',
        athleteId: 'ath-1',
        athleteName: 'Arjun',
        title: 'Morning 5K',
        sportType: 'RUNNING',
        distanceMeters: 5000,
        durationSeconds: 1500,
        averageSpeedMps: 3.33,
        averageHeartRate: 150,
        elevationGainMeters: 40
      },
      rawTrack,
      [homeZone]
    );

    expect((publicDto as any).rawGpsPoints).toBeUndefined();
    expect((publicDto as any).coordinates).toBeUndefined();
    expect(publicDto.svgPolylineString).toBeDefined();
    expect(publicDto.svgPolylineString).toContain('M');
    expect(publicDto.endpointSuppressionApplied).toBe(true);
  });

  test('2. Private Activity Isolation: Completely suppresses third party access across all surfaces', () => {
    const isVisibleToStranger = VisibilityPolicy.canView(
      'stranger-user',
      'ath-author',
      'PRIVATE',
      [],
      'FEED'
    );
    expect(isVisibleToStranger).toBe(false);

    const isVisibleToFollower = VisibilityPolicy.canView(
      'follower-user',
      'ath-author',
      'PRIVATE',
      [{ followerId: 'follower-user', followingId: 'ath-author', status: 'ACCEPTED', createdAt: Date.now() }],
      'FEED'
    );
    expect(isVisibleToFollower).toBe(false);
  });

  test('3. Follower-Only Activity Access: Strictly visible to confirmed followers, hidden from public', () => {
    const publicView = VisibilityPolicy.canView(
      'stranger-user',
      'ath-author',
      'FOLLOWERS_ONLY',
      [],
      'FEED'
    );
    expect(publicView).toBe(false);

    const followerView = VisibilityPolicy.canView(
      'follower-user',
      'ath-author',
      'FOLLOWERS_ONLY',
      [{ followerId: 'follower-user', followingId: 'ath-author', status: 'ACCEPTED', createdAt: Date.now() }],
      'FEED'
    );
    expect(followerView).toBe(true);
  });

  test('4. Block Matrix Enforces Mutual Social Isolation Across All Surfaces', () => {
    const blockedRels: FollowRelationship[] = [
      { followerId: 'ath-1', followingId: 'blocked-user', status: 'BLOCKED', createdAt: Date.now() }
    ];

    const canViewFeed = VisibilityPolicy.canView('blocked-user', 'ath-1', 'PUBLIC', blockedRels, 'FEED');
    const canViewComments = VisibilityPolicy.canView('blocked-user', 'ath-1', 'PUBLIC', blockedRels, 'COMMENTS');
    const canViewLeaderboard = VisibilityPolicy.canView('blocked-user', 'ath-1', 'PUBLIC', blockedRels, 'LEADERBOARD');

    expect(canViewFeed).toBe(false);
    expect(canViewComments).toBe(false);
    expect(canViewLeaderboard).toBe(false);
  });

  test('5. Home Zone Boundary Traversal creates explicit Discontinuous GAPs', () => {
    const maskedResult = PrivacyTransformationLayer.transformTrackForPublicView(rawTrack, [homeZone]);
    expect(maskedResult.hasMaskedPoints).toBe(true);
    expect(maskedResult.maskedSegments.length).toBeGreaterThan(0);
    expect(maskedResult.svgPathString).toContain('M');

    for (const segment of maskedResult.maskedSegments) {
      for (const pt of segment.points) {
        expect(pt.latitude).not.toBe(18.94302);
      }
    }
  });
});
