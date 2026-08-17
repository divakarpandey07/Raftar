import { RawGpsPoint, SportType } from '../types';
import { IntegrityVerdict, IntegrityAssessmentResult, IntegrityReasonCode } from './types';

export interface IntegrityAssessment {
  activityId: string;
  verdict: IntegrityVerdict;
  evidenceScore: number; // 0 to 100
  reasons: string[];
  anomaliesCount: number;
}

export class ActivityIntegrityEngine {
  private static haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static evaluateTrack(
    activityId: string,
    sportType: SportType,
    points: RawGpsPoint[]
  ): IntegrityAssessment {
    if (points.length < 5) {
      return {
        activityId,
        verdict: 'INVALID',
        evidenceScore: 10,
        reasons: ['Track has insufficient GPS points'],
        anomaliesCount: 1
      };
    }

    let anomalies = 0;
    const reasons: string[] = [];

    // Max physical athletic speeds (m/s): Running = 12.5 m/s, Cycling = 35.0 m/s
    const maxSpeedThreshold = sportType === 'CYCLING' ? 35.0 : 12.5;

    let maxObservedSpeed = 0;
    let highAccuracyPointCount = 0;

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (pt.accuracy <= 10) highAccuracyPointCount++;

      let calculatedSpeed = pt.speed;
      if (calculatedSpeed === undefined && i > 0) {
        const dist = this.haversineMeters(points[i - 1].latitude, points[i - 1].longitude, pt.latitude, pt.longitude);
        const dt = Math.max(0.001, (pt.timestamp - points[i - 1].timestamp) / 1000);
        calculatedSpeed = dist / dt;
      }

      const spd = calculatedSpeed || 0;
      if (spd > maxObservedSpeed) maxObservedSpeed = spd;

      if (spd > maxSpeedThreshold) {
        anomalies++;
      }
    }

    if (maxObservedSpeed > maxSpeedThreshold) {
      reasons.push(`Instantaneous velocity (${maxObservedSpeed.toFixed(1)} m/s) exceeds physical sport limit of ${maxSpeedThreshold} m/s`);
    }

    const accuracyRatio = highAccuracyPointCount / points.length;
    let evidenceScore = Math.round(accuracyRatio * 80 + 20);

    if (anomalies > 0) {
      evidenceScore = Math.max(0, evidenceScore - anomalies * 30);
    }

    let verdict: IntegrityVerdict = 'VALID';
    if (evidenceScore === 0 || anomalies > 2 || maxObservedSpeed > 100) {
      verdict = 'INVALID';
      evidenceScore = 0;
    } else if (evidenceScore < 70 || anomalies > 0) {
      verdict = 'SUSPICIOUS';
    }

    return {
      activityId,
      verdict,
      evidenceScore,
      reasons,
      anomaliesCount: anomalies
    };
  }
}
