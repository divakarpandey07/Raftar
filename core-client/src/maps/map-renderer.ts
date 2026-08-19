export interface LatLngPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface ViewportBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export class MapRenderer {
  static calculateBounds(points: LatLngPoint[], paddingFraction: number = 0.1): ViewportBounds {
    if (points.length === 0) {
      return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
    }

    let minLat = points[0].latitude;
    let maxLat = points[0].latitude;
    let minLon = points[0].longitude;
    let maxLon = points[0].longitude;

    for (const p of points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLon) minLon = p.longitude;
      if (p.longitude > maxLon) maxLon = p.longitude;
    }

    const latSpan = Math.max(0.0001, maxLat - minLat);
    const lonSpan = Math.max(0.0001, maxLon - minLon);

    return {
      minLat: minLat - latSpan * paddingFraction,
      maxLat: maxLat + latSpan * paddingFraction,
      minLon: minLon - lonSpan * paddingFraction,
      maxLon: maxLon + lonSpan * paddingFraction
    };
  }

  static projectToSvg(
    points: LatLngPoint[],
    width: number = 100,
    height: number = 50,
    bounds?: ViewportBounds
  ): { x: number; y: number }[] {
    if (points.length === 0) return [];
    const b = bounds || this.calculateBounds(points);

    const latRange = b.maxLat - b.minLat;
    const lonRange = b.maxLon - b.minLon;

    return points.map((p) => {
      const normX = (p.longitude - b.minLon) / lonRange;
      const normY = 1.0 - (p.latitude - b.minLat) / latRange;

      return {
        x: Math.round(normX * width * 10) / 10,
        y: Math.round(normY * height * 10) / 10
      };
    });
  }

  static generateSvgPolylinePoints(
    points: LatLngPoint[],
    width: number = 100,
    height: number = 50
  ): string {
    const projected = this.projectToSvg(points, width, height);
    return projected.map((pt) => `${pt.x},${pt.y}`).join(' ');
  }

  static simplifyPoints<T extends LatLngPoint>(points: T[], toleranceMeters: number = 2.0): T[] {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let maxIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.perpendicularDistance(points[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > toleranceMeters) {
      const left = this.simplifyPoints(points.slice(0, maxIndex + 1), toleranceMeters);
      const right = this.simplifyPoints(points.slice(maxIndex), toleranceMeters);
      return left.slice(0, left.length - 1).concat(right);
    } else {
      return [first, last];
    }
  }

  private static perpendicularDistance(p: LatLngPoint, lineStart: LatLngPoint, lineEnd: LatLngPoint): number {
    const dx = lineEnd.longitude - lineStart.longitude;
    const dy = lineEnd.latitude - lineStart.latitude;

    if (dx === 0 && dy === 0) {
      const dLat = (p.latitude - lineStart.latitude) * 111000;
      const dLon = (p.longitude - lineStart.longitude) * 111000;
      return Math.sqrt(dLat * dLat + dLon * dLon);
    }

    const numerator = Math.abs(dy * p.longitude - dx * p.latitude + lineEnd.longitude * lineStart.latitude - lineEnd.latitude * lineStart.longitude);
    const denominator = Math.sqrt(dx * dx + dy * dy);

    return (numerator / denominator) * 111000;
  }
}
