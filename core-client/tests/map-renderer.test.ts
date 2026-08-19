import { MapRenderer } from '../src/maps/map-renderer';

describe('MapRenderer (Vector Polyline Generator)', () => {
  test('calculates accurate bounds with padding', () => {
    const points = [
      { latitude: 19.00, longitude: 72.00 },
      { latitude: 19.10, longitude: 72.20 }
    ];

    const bounds = MapRenderer.calculateBounds(points, 0.1);
    expect(bounds.minLat).toBeLessThan(19.00);
    expect(bounds.maxLat).toBeGreaterThan(19.10);
  });

  test('projects GPS track into SVG coordinate string', () => {
    const points = [
      { latitude: 19.00, longitude: 72.00 },
      { latitude: 19.05, longitude: 72.10 },
      { latitude: 19.10, longitude: 72.20 }
    ];

    const svgPolyline = MapRenderer.generateSvgPolylinePoints(points, 100, 50);
    expect(svgPolyline).toBeDefined();
    expect(svgPolyline.split(' ').length).toBe(3);
  });

  test('simplifies redundant linear points via Douglas-Peucker', () => {
    const straightLine = [
      { latitude: 19.000, longitude: 72.000 },
      { latitude: 19.001, longitude: 72.001 },
      { latitude: 19.002, longitude: 72.002 },
      { latitude: 19.003, longitude: 72.003 },
      { latitude: 19.004, longitude: 72.004 }
    ];

    const simplified = MapRenderer.simplifyPoints(straightLine, 5.0);
    expect(simplified.length).toBeLessThan(straightLine.length);
    expect(simplified.length).toBe(2);
  });
});
