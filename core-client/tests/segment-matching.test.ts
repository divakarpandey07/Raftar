import { SegmentMatchingEngine } from '../src/segments/segment-matching-engine';
import { Segment } from '../src/segments/types';
import { RawGpsPoint } from '../src/types';

describe('SegmentMatchingEngine (Production Kinematic & Gate Verification)', () => {
  const marineDriveSegment: Segment = {
    id: 'seg-marine-drive-1k',
    name: 'Marine Drive Promenade Sprint 1K',
    sportType: 'RUNNING',
    distanceMeters: 1000,
    elevationGainMeters: 2,
    startCoordinate: { latitude: 18.9430, longitude: 72.8230 },
    endCoordinate: { latitude: 18.9520, longitude: 72.8235 },
    polylinePoints: [
      { latitude: 18.9430, longitude: 72.8230 },
      { latitude: 18.9460, longitude: 72.8232 },
      { latitude: 18.9490, longitude: 72.8233 },
      { latitude: 18.9520, longitude: 72.8235 }
    ],
    climbCategory: 'FLAT',
    startGateRadiusMeters: 25,
    endGateRadiusMeters: 25,
    maxCorridorOffsetMeters: 30,
    warningSpeedMpsThreshold: 10.5,
    hardRejectionSpeedMpsThreshold: 15.0
  };

  test('successfully matches valid athletic effort in corridor', () => {
    // 1000m run with 10s point intervals (5.0 m/s average speed)
    const track: RawGpsPoint[] = [
      { localActivityId: 'act-1', pointIndex: 0, accuracy: 4, isEstimated: false, latitude: 18.9410, longitude: 72.8228, timestamp: 1000 },
      // Start Gate (t = 5000)
      { localActivityId: 'act-1', pointIndex: 1, accuracy: 4, isEstimated: false, latitude: 18.94302, longitude: 72.82301, timestamp: 5000, heartRate: 155, power: 240 },
      { localActivityId: 'act-1', pointIndex: 2, accuracy: 4, isEstimated: false, latitude: 18.94450, longitude: 72.82310, timestamp: 35000, heartRate: 158, power: 245 },
      { localActivityId: 'act-1', pointIndex: 3, accuracy: 4, isEstimated: false, latitude: 18.94601, longitude: 72.82321, timestamp: 65000, heartRate: 160, power: 250 },
      { localActivityId: 'act-1', pointIndex: 4, accuracy: 4, isEstimated: false, latitude: 18.94750, longitude: 72.82326, timestamp: 95000, heartRate: 162, power: 255 },
      { localActivityId: 'act-1', pointIndex: 5, accuracy: 4, isEstimated: false, latitude: 18.94901, longitude: 72.82332, timestamp: 125000, heartRate: 165, power: 260 },
      { localActivityId: 'act-1', pointIndex: 6, accuracy: 4, isEstimated: false, latitude: 18.95050, longitude: 72.82341, timestamp: 155000, heartRate: 168, power: 268 },
      // End Gate (t = 185000)
      { localActivityId: 'act-1', pointIndex: 7, accuracy: 4, isEstimated: false, latitude: 18.95201, longitude: 72.82351, timestamp: 185000, heartRate: 170, power: 275 },
      { localActivityId: 'act-1', pointIndex: 8, accuracy: 4, isEstimated: false, latitude: 18.9540, longitude: 72.8238, timestamp: 215000 }
    ];

    // Modify timestamps to ensure <= 20s interval between consecutive points
    track[2].timestamp = 25000;
    track[3].timestamp = 45000;
    track[4].timestamp = 65000;
    track[5].timestamp = 85000;
    track[6].timestamp = 105000;
    track[7].timestamp = 125000; // 125000 - 5000 = 120s (8.3 m/s < 10.5 m/s)

    const result = SegmentMatchingEngine.matchSegment(marineDriveSegment, track, 'act-valid', 'ath-1');
    expect(result.matched).toBe(true);
    expect(result.effort?.validityStatus).toBe('VALID');
    expect(result.effort?.elapsedTimeSeconds).toBe(120);
    expect(result.effort?.averageSpeedMps).toBeLessThan(10.5);
  });

  test('rejects suspicious vehicle effort exceeding kinematic speed ceiling', () => {
    const vehicleTrack: RawGpsPoint[] = [
      { localActivityId: 'act-car', pointIndex: 0, accuracy: 4, isEstimated: false, latitude: 18.94302, longitude: 72.82301, timestamp: 1000 },
      { localActivityId: 'act-car', pointIndex: 1, accuracy: 4, isEstimated: false, latitude: 18.94601, longitude: 72.82321, timestamp: 4000 },
      { localActivityId: 'act-car', pointIndex: 2, accuracy: 4, isEstimated: false, latitude: 18.94901, longitude: 72.82332, timestamp: 7000 },
      { localActivityId: 'act-car', pointIndex: 3, accuracy: 4, isEstimated: false, latitude: 18.95201, longitude: 72.82351, timestamp: 11000 }
    ];

    const result = SegmentMatchingEngine.matchSegment(marineDriveSegment, vehicleTrack, 'act-car', 'ath-1');
    expect(result.matched).toBe(false);
    expect(result.effort?.validityStatus).toBe('INVALID');
    expect(result.reasonCode).toBe('IMPOSSIBLE_SPEED');
  });

  test('flags track with GPS gap (> 30s) as PENDING_REVIEW rather than blind invalidation', () => {
    const gapTrack: RawGpsPoint[] = [
      { localActivityId: 'act-gap', pointIndex: 0, accuracy: 4, isEstimated: false, latitude: 18.94302, longitude: 72.82301, timestamp: 1000 },
      // 40-second tunnel gap (corridor preserved)
      { localActivityId: 'act-gap', pointIndex: 1, accuracy: 4, isEstimated: false, latitude: 18.94601, longitude: 72.82321, timestamp: 41000 },
      { localActivityId: 'act-gap', pointIndex: 2, accuracy: 4, isEstimated: false, latitude: 18.95201, longitude: 72.82351, timestamp: 95000 }
    ];

    const result = SegmentMatchingEngine.matchSegment(marineDriveSegment, gapTrack, 'act-gap', 'ath-1');
    expect(result.matched).toBe(true);
    expect(result.effort?.validityStatus).toBe('PENDING_REVIEW');
    expect(result.reasonCode).toBe('GAP_REQUIRES_REVIEW');
  });
});
