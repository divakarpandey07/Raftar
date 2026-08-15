import { Segment, SegmentEffort, SegmentMatchResult, SegmentMatchReasonCode, GeoPoint } from './types';
import { RawGpsPoint } from '../types';

export class SegmentMatchingEngine {
  private static haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static minDistanceToPolylineSegment(
    p: RawGpsPoint,
    a: GeoPoint,
    b: GeoPoint
  ): number {
    const latP = p.latitude;
    const lonP = p.longitude;
    const latA = a.latitude;
    const lonA = a.longitude;
    const latB = b.latitude;
    const lonB = b.longitude;

    const dx = lonB - lonA;
    const dy = latB - latA;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return this.haversineDistanceMeters(latP, lonP, latA, lonA);
    }

    const t = Math.max(0, Math.min(1, ((lonP - lonA) * dx + (latP - latA) * dy) / lenSq));
    const projLat = latA + t * dy;
    const projLon = lonA + t * dx;

    return this.haversineDistanceMeters(latP, lonP, projLat, projLon);
  }

  private static calculateMinDistanceToRoute(p: RawGpsPoint, polyline: GeoPoint[]): number {
    let minD = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
      const d = this.minDistanceToPolylineSegment(p, polyline[i], polyline[i + 1]);
      if (d < minD) minD = d;
    }
    return minD;
  }

  static matchSegment(
    segment: Segment,
    activityPoints: RawGpsPoint[],
    activityId: string,
    athleteId: string
  ): SegmentMatchResult {
    return this.evaluateSegmentEffort(segment, activityPoints, athleteId, activityId);
  }

  static evaluateSegmentEffort(
    segment: Segment,
    activityPoints: RawGpsPoint[],
    athleteId: string,
    activityId: string
  ): SegmentMatchResult {
    if (activityPoints.length < 3 || segment.polylinePoints.length < 2) {
      return { matched: false, adherencePercentage: 0, reason: 'Insufficient activity or segment points' };
    }

    // 1. Gate Detection (Start Gate)
    let startIndex = -1;
    for (let i = 0; i < activityPoints.length; i++) {
      const distToStart = this.haversineDistanceMeters(
        activityPoints[i].latitude,
        activityPoints[i].longitude,
        segment.startCoordinate.latitude,
        segment.startCoordinate.longitude
      );
      if (distToStart <= segment.startGateRadiusMeters) {
        startIndex = i;
        break;
      }
    }

    if (startIndex === -1) {
      return { matched: false, adherencePercentage: 0, reason: 'Start gate not crossed' };
    }

    // 2. Gate Detection (End Gate)
    let endIndex = -1;
    for (let i = startIndex + 1; i < activityPoints.length; i++) {
      const distToEnd = this.haversineDistanceMeters(
        activityPoints[i].latitude,
        activityPoints[i].longitude,
        segment.endCoordinate.latitude,
        segment.endCoordinate.longitude
      );
      if (distToEnd <= segment.endGateRadiusMeters) {
        endIndex = i;
        break;
      }
    }

    if (endIndex === -1) {
      return { matched: false, adherencePercentage: 0, reason: 'End gate not crossed' };
    }

    // 3. Corridor Adherence & Kinematic Checks
    const candidatePoints = activityPoints.slice(startIndex, endIndex + 1);
    let pointsInCorridor = 0;
    let maxObservedSpeed = 0;
    let sumSpeed = 0;
    let totalHr = 0;
    let hrCount = 0;
    let totalWatts = 0;
    let wattsCount = 0;
    let hasGpsGap = false;

    for (let i = 0; i < candidatePoints.length; i++) {
      const pt = candidatePoints[i];
      const distToRoute = this.calculateMinDistanceToRoute(pt, segment.polylinePoints);
      if (distToRoute <= segment.maxCorridorOffsetMeters) {
        pointsInCorridor++;
      }

      if (i > 0) {
        const timeDiffSec = (pt.timestamp - candidatePoints[i - 1].timestamp) / 1000;
        if (timeDiffSec > 30) {
          hasGpsGap = true;
        }
      }

      let spd = pt.speed;
      if (spd === undefined && i > 0) {
        const d = this.haversineDistanceMeters(candidatePoints[i - 1].latitude, candidatePoints[i - 1].longitude, pt.latitude, pt.longitude);
        const dt = Math.max(0.001, (pt.timestamp - candidatePoints[i - 1].timestamp) / 1000);
        spd = d / dt;
      }

      const effectiveSpeed = spd || 0;
      if (effectiveSpeed > maxObservedSpeed) maxObservedSpeed = effectiveSpeed;
      sumSpeed += effectiveSpeed;

      if (pt.heartRate) {
        totalHr += pt.heartRate;
        hrCount++;
      }
      if (pt.power) {
        totalWatts += pt.power;
        wattsCount++;
      }
    }

    const adherencePercentage = Math.round((pointsInCorridor / candidatePoints.length) * 100);

    if (adherencePercentage < 70) {
      return {
        matched: false,
        adherencePercentage,
        reason: `Corridor adherence ${adherencePercentage}% is below 70% threshold`
      };
    }

    const startTime = candidatePoints[0].timestamp;
    const endTime = candidatePoints[candidatePoints.length - 1].timestamp;
    const elapsedTimeSeconds = Math.max(1, Math.round((endTime - startTime) / 1000));
    const avgSpeed = sumSpeed / candidatePoints.length;

    let validityStatus: 'VALID' | 'INVALID' | 'PENDING_REVIEW' = 'VALID';
    let reasonCode: SegmentMatchReasonCode | undefined = undefined;

    if (maxObservedSpeed >= segment.hardRejectionSpeedMpsThreshold || avgSpeed >= segment.hardRejectionSpeedMpsThreshold) {
      validityStatus = 'INVALID';
      reasonCode = 'IMPOSSIBLE_SPEED';
    } else if (hasGpsGap) {
      validityStatus = 'PENDING_REVIEW';
      reasonCode = 'GAP_REQUIRES_REVIEW';
    } else if (maxObservedSpeed >= segment.warningSpeedMpsThreshold || avgSpeed >= segment.warningSpeedMpsThreshold) {
      validityStatus = 'PENDING_REVIEW';
      reasonCode = 'IMPOSSIBLE_SPEED';
    }

    const effort: SegmentEffort = {
      id: `eff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      segmentId: segment.id,
      activityId,
      athleteId,
      elapsedTimeSeconds,
      movingTimeSeconds: elapsedTimeSeconds,
      startIndex,
      endIndex,
      averageSpeedMps: Math.round(avgSpeed * 100) / 100,
      maxSpeedMps: Math.round(maxObservedSpeed * 100) / 100,
      averageHeartRate: hrCount > 0 ? Math.round(totalHr / hrCount) : undefined,
      averagePowerWatts: wattsCount > 0 ? Math.round(totalWatts / wattsCount) : undefined,
      validityStatus,
      reasonCode
    };

    return {
      matched: validityStatus !== 'INVALID',
      effort,
      reasonCode,
      adherencePercentage
    };
  }
}
