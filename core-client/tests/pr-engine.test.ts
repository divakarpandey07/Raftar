import { PersonalRecordEngine } from '../src/processing/pr-engine';
import { RawGpsPoint } from '../src/types';

describe('PersonalRecordEngine (Sliding Window Best Effort)', () => {
  test('finds the fastest 1km segment within a multi-speed 3km workout', () => {
    const points: RawGpsPoint[] = [];
    const baseTime = 1700000000000;
    let currentLat = 19.0760;

    // Km 1: Slow warm up (5 min/km = 300s) ~3.33 m/s -> ~30 points of 33.3m in 10s
    for (let i = 0; i <= 30; i++) {
      points.push({
        localActivityId: 'act-pr',
        pointIndex: points.length,
        latitude: currentLat,
        longitude: 72.8777,
        accuracy: 4.0,
        timestamp: baseTime + (points.length * 10 * 1000),
        isEstimated: false
      });
      currentLat += 0.0003; // ~33.3m step
    }

    // Km 2: Fast Surge / PR segment (3:30 min/km = 210s) ~4.76 m/s -> ~30 points of 33.3m in 7s
    for (let i = 0; i <= 30; i++) {
      const prevTime = points[points.length - 1].timestamp;
      points.push({
        localActivityId: 'act-pr',
        pointIndex: points.length,
        latitude: currentLat,
        longitude: 72.8777,
        accuracy: 4.0,
        timestamp: prevTime + 7000,
        isEstimated: false
      });
      currentLat += 0.0003;
    }

    const pr1k = PersonalRecordEngine.evaluateFastestSegment(points, 1000, '1km');
    expect(pr1k).not.toBeNull();
    expect(pr1k!.bestDurationSeconds).toBeLessThan(250);
    expect(pr1k!.bestPaceSecKm).toBeLessThan(250);
  });
});
