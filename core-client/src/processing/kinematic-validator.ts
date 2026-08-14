import { Coordinate, RawGpsPoint, SportType } from '../types';

export interface SportKinematicThresholds {
  maxVelocityMps: number;
  maxAccelMps2: number;
  maxAccuracyMeters: number;
}

export const SPORT_THRESHOLDS: Record<SportType, SportKinematicThresholds> = {
  RUNNING: { maxVelocityMps: 12.0, maxAccelMps2: 4.5, maxAccuracyMeters: 30.0 },
  CYCLING: { maxVelocityMps: 32.0, maxAccelMps2: 6.0, maxAccuracyMeters: 35.0 },
  WALKING: { maxVelocityMps: 3.5, maxAccelMps2: 2.5, maxAccuracyMeters: 25.0 },
  HIKING: { maxVelocityMps: 4.0, maxAccelMps2: 2.5, maxAccuracyMeters: 35.0 },
  SWIMMING: { maxVelocityMps: 3.0, maxAccelMps2: 2.0, maxAccuracyMeters: 40.0 },
  GENERAL_FITNESS: { maxVelocityMps: 15.0, maxAccelMps2: 5.0, maxAccuracyMeters: 30.0 }
};

const EARTH_RADIUS_METERS = 6371000;

export function calculateHaversineMeters(p1: Coordinate, p2: Coordinate): number {
  const lat1Rad = (p1.latitude * Math.PI) / 180;
  const lat2Rad = (p2.latitude * Math.PI) / 180;
  const deltaLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const deltaLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export class KinematicValidator {
  private thresholds: SportKinematicThresholds;

  constructor(sportType: SportType = 'RUNNING') {
    this.thresholds = SPORT_THRESHOLDS[sportType] || SPORT_THRESHOLDS.RUNNING;
  }

  setSportType(sportType: SportType): void {
    this.thresholds = SPORT_THRESHOLDS[sportType] || SPORT_THRESHOLDS.RUNNING;
  }

  validatePoint(
    candidate: Omit<RawGpsPoint, 'localActivityId' | 'pointIndex'>,
    previousPoint?: RawGpsPoint
  ): { isValid: boolean; calculatedVelocityMps?: number; reason?: string } {
    // 1. Accuracy Check
    if (candidate.accuracy > this.thresholds.maxAccuracyMeters) {
      return { isValid: false, reason: `Accuracy ${candidate.accuracy}m exceeds limit ${this.thresholds.maxAccuracyMeters}m` };
    }

    if (!previousPoint) {
      return { isValid: true };
    }

    // 2. Temporal Interval Check
    const deltaTSeconds = (candidate.timestamp - previousPoint.timestamp) / 1000;
    if (deltaTSeconds < 0.2) {
      return { isValid: false, reason: 'Duplicate or sub-200ms sample interval' };
    }
    if (deltaTSeconds > 300) {
      // Long gap (e.g. app backgrounded or paused) - accept as valid restart point
      return { isValid: true };
    }

    // 3. Geodesic Distance Delta
    const deltaDMeters = calculateHaversineMeters(previousPoint, candidate);

    // 4. Velocity Check
    const velocityMps = deltaDMeters / deltaTSeconds;
    if (velocityMps > this.thresholds.maxVelocityMps) {
      return {
        isValid: false,
        calculatedVelocityMps: velocityMps,
        reason: `Velocity ${velocityMps.toFixed(1)} m/s exceeds physical limit ${this.thresholds.maxVelocityMps} m/s`
      };
    }

    // 5. Acceleration Check
    if (previousPoint.speed !== undefined && previousPoint.speed !== null) {
      const accelMps2 = Math.abs(velocityMps - previousPoint.speed) / deltaTSeconds;
      if (accelMps2 > this.thresholds.maxAccelMps2 && velocityMps > 3.0) {
        return {
          isValid: false,
          calculatedVelocityMps: velocityMps,
          reason: `Acceleration ${accelMps2.toFixed(1)} m/s² exceeds physical limit`
        };
      }
    }

    return {
      isValid: true,
      calculatedVelocityMps: velocityMps
    };
  }
}
