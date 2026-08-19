import { PrivacyTransformationLayer } from '../src/privacy/privacy-zone-engine';
import { PrivacyZone } from '../src/privacy/types';
import { RawGpsPoint } from '../src/types';

describe('PrivacyTransformationLayer (Discontinuous GAPs & Full Boundary Traversal)', () => {
  const homeZone: PrivacyZone = {
    id: 'zone-home',
    athleteId: 'ath-1',
    name: 'Home Zone',
    centerLatitude: 19.0550,
    centerLongitude: 72.8300,
    radiusMeters: 300,
    isActive: true,
    createdAt: 1000
  };

  const officeZone: PrivacyZone = {
    id: 'zone-office',
    athleteId: 'ath-1',
    name: 'Office Zone',
    centerLatitude: 19.0800,
    centerLongitude: 72.8800,
    radiusMeters: 400,
    isActive: true,
    createdAt: 1000
  };

  test('creates discontinuous sub-track segments with explicit GAPs preventing straight-line interpolation leak', () => {
    const track: RawGpsPoint[] = [
      // Start near Home (Inside zone)
      { localActivityId: 'act-1', pointIndex: 0, accuracy: 3, isEstimated: false, latitude: 19.0550, longitude: 72.8300, timestamp: 1000 },
      // Segment 1 (Outside zones)
      { localActivityId: 'act-1', pointIndex: 1, accuracy: 3, isEstimated: false, latitude: 19.0600, longitude: 72.8400, timestamp: 20000 },
      { localActivityId: 'act-1', pointIndex: 2, accuracy: 3, isEstimated: false, latitude: 19.0650, longitude: 72.8500, timestamp: 40000 },
      // Cross Office (Inside zone)
      { localActivityId: 'act-1', pointIndex: 3, accuracy: 3, isEstimated: false, latitude: 19.0800, longitude: 72.8800, timestamp: 60000 },
      // Segment 2 (Outside zones)
      { localActivityId: 'act-1', pointIndex: 4, accuracy: 3, isEstimated: false, latitude: 19.0900, longitude: 72.9000, timestamp: 80000 },
      { localActivityId: 'act-1', pointIndex: 5, accuracy: 3, isEstimated: false, latitude: 19.0950, longitude: 72.9100, timestamp: 100000 }
    ];

    const result = PrivacyTransformationLayer.transformTrackForPublicView(track, [homeZone, officeZone]);

    expect(result.originalPointCount).toBe(6);
    expect(result.publicPointCount).toBe(4);
    expect(result.hasMaskedPoints).toBe(true);
    expect(result.maskedSegments.length).toBe(2); // 2 disjoint segments separated by a GAP
    expect(result.maskedSegments[0].points.length).toBe(2);
    expect(result.maskedSegments[1].points.length).toBe(2);
    expect(result.privacyZonesApplied).toContain('zone-home');
    expect(result.privacyZonesApplied).toContain('zone-office');

    // Verify discontinuous SVG path contains two separate 'M' move commands (preventing straight-line interpolation)
    const mCount = (result.svgPathString.match(/M /g) || []).length;
    expect(mCount).toBe(2);
  });
});
