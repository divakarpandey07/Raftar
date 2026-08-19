import { PrivacyZone, MaskedTrackResult, DiscontinuousTrackSegment } from './types';
import { RawGpsPoint } from '../types';

export class PrivacyTransformationLayer {
  /**
   * Transforms raw GPS coordinates into privacy-safe discontinuous track segments.
   * Suppresses coordinates inside privacy zones and introduces explicit visual & geometric
   * discontinuities (GAPs) to prevent straight-line interpolation leaks towards private locations.
   */
  static transformTrackForPublicView(
    points: RawGpsPoint[],
    privacyZones: PrivacyZone[]
  ): MaskedTrackResult {
    const activeZones = privacyZones.filter((z) => z.isActive);
    if (activeZones.length === 0 || points.length === 0) {
      return {
        originalPointCount: points.length,
        publicPointCount: points.length,
        maskedSegments: points.length > 0 ? [{ segmentIndex: 0, points: [...points] }] : [],
        hasMaskedPoints: false,
        privacyZonesApplied: [],
        svgPathString: this.buildDiscontinuousSvgPath(points.length > 0 ? [{ segmentIndex: 0, points: [...points] }] : [])
      };
    }

    const appliedZoneIds = new Set<string>();
    const segments: DiscontinuousTrackSegment[] = [];
    let currentSegmentPoints: RawGpsPoint[] = [];

    for (const pt of points) {
      let isInsidePrivacyZone = false;

      for (const zone of activeZones) {
        const dist = this.haversineDistanceMeters(
          pt.latitude,
          pt.longitude,
          zone.centerLatitude,
          zone.centerLongitude
        );

        if (dist <= zone.radiusMeters) {
          isInsidePrivacyZone = true;
          appliedZoneIds.add(zone.id);
          break;
        }
      }

      if (isInsidePrivacyZone) {
        // Break current segment to create a geometric GAP
        if (currentSegmentPoints.length > 0) {
          segments.push({
            segmentIndex: segments.length,
            points: currentSegmentPoints
          });
          currentSegmentPoints = [];
        }
      } else {
        currentSegmentPoints.push(pt);
      }
    }

    // Flush trailing segment
    if (currentSegmentPoints.length > 0) {
      segments.push({
        segmentIndex: segments.length,
        points: currentSegmentPoints
      });
    }

    const totalPublicPoints = segments.reduce((sum, s) => sum + s.points.length, 0);

    return {
      originalPointCount: points.length,
      publicPointCount: totalPublicPoints,
      maskedSegments: segments,
      hasMaskedPoints: totalPublicPoints < points.length,
      privacyZonesApplied: Array.from(appliedZoneIds),
      svgPathString: this.buildDiscontinuousSvgPath(segments)
    };
  }

  private static buildDiscontinuousSvgPath(segments: DiscontinuousTrackSegment[]): string {
    if (segments.length === 0) return '';

    const pathChunks: string[] = [];

    for (const seg of segments) {
      if (seg.points.length === 0) continue;
      const first = seg.points[0];
      let chunk = `M ${first.longitude.toFixed(5)} ${first.latitude.toFixed(5)}`;
      for (let i = 1; i < seg.points.length; i++) {
        const pt = seg.points[i];
        chunk += ` L ${pt.longitude.toFixed(5)} ${pt.latitude.toFixed(5)}`;
      }
      pathChunks.push(chunk);
    }

    return pathChunks.join(' ');
  }

  private static haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
