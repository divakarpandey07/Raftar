import {
  haversineDistanceMeters,
  computeElevationProfile,
  computeSplits,
  encodePolyline,
  simplifyPolyline
} from '../../src/utils/geodesic';

describe('Geodesic Utilities', () => {
  test('haversineDistanceMeters accurately calculates 1 degree latitude difference', () => {
    const p1 = { latitude: 19.0760, longitude: 72.8777 }; // Mumbai
    const p2 = { latitude: 19.0850, longitude: 72.8777 }; // ~1.0 km North
    const distance = haversineDistanceMeters(p1, p2);
    expect(distance).toBeGreaterThan(990);
    expect(distance).toBeLessThan(1015);
  });

  test('computeElevationProfile filters small noise and accumulates meaningful climb', () => {
    const track = [
      { latitude: 0, longitude: 0, altitude: 100 },
      { latitude: 0, longitude: 0, altitude: 101 }, // +1m (filtered as noise)
      { latitude: 0, longitude: 0, altitude: 106 }, // +5m (counted)
      { latitude: 0, longitude: 0, altitude: 103 }, // -3m (counted)
      { latitude: 0, longitude: 0, altitude: 110 }  // +7m (counted)
    ];
    const profile = computeElevationProfile(track);
    expect(profile.gainMeters).toBe(12);
    expect(profile.lossMeters).toBe(3);
  });

  test('computeSplits correctly divides a 2.5km workout into 1km splits', () => {
    // Generate ~2500m track over 15 minutes (900 seconds)
    const points = [];
    const baseLat = 19.0760;
    const baseTime = 1700000000000;

    for (let i = 0; i <= 25; i++) {
      points.push({
        latitude: baseLat + (i * 0.0009), // ~100m step
        longitude: 72.8777,
        altitude: 10 + i,
        timestamp: baseTime + (i * 36 * 1000)
      });
    }

    const splits = computeSplits(points, 1000);
    expect(splits.length).toBeGreaterThanOrEqual(2);
    expect(splits[0].split_number).toBe(1);
    expect(splits[0].distance_meters).toBeGreaterThan(900);
    expect(splits[0].avg_pace_sec_km).toBeGreaterThan(0);
  });

  test('encodePolyline produces valid compressed polyline string', () => {
    const points = [
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 }
    ];
    const encoded = encodePolyline(points);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
  });

  test('simplifyPolyline reduces redundant points along a straight line', () => {
    const straightLine = [
      { latitude: 19.000, longitude: 72.000 },
      { latitude: 19.001, longitude: 72.000 },
      { latitude: 19.002, longitude: 72.000 },
      { latitude: 19.003, longitude: 72.000 },
      { latitude: 19.004, longitude: 72.000 }
    ];
    const simplified = simplifyPolyline(straightLine, 5.0);
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual(straightLine[0]);
    expect(simplified[1]).toEqual(straightLine[straightLine.length - 1]);
  });
});
