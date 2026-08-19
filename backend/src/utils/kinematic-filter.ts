import { haversineDistanceMeters, Coordinate } from './geodesic';

export type SportType = 'RUNNING' | 'CYCLING' | 'WALKING' | 'HIKING' | 'GENERAL_FITNESS';

export interface RawGpsSample extends Coordinate {
  timestamp: number; // epoch ms
  accuracy: number;  // meters
  speed?: number;    // m/s
  altitude?: number;
}

export interface SportKinematicLimits {
  maxPlausibleVelocityMps: number;
  maxPlausibleAccelMps2: number;
  maxAccuracyThresholdMeters: number;
  maxHeadingChangeDegreesAtSpeed: number;
}

export const SPORT_LIMITS: Record<SportType, SportKinematicLimits> = {
  RUNNING: {
    maxPlausibleVelocityMps: 12.0, // 43.2 km/h
    maxPlausibleAccelMps2: 4.5,
    maxAccuracyThresholdMeters: 30.0,
    maxHeadingChangeDegreesAtSpeed: 120
  },
  CYCLING: {
    maxPlausibleVelocityMps: 32.0, // 115.2 km/h (descent)
    maxPlausibleAccelMps2: 6.0,
    maxAccuracyThresholdMeters: 35.0,
    maxHeadingChangeDegreesAtSpeed: 90
  },
  WALKING: {
    maxPlausibleVelocityMps: 3.5, // 12.6 km/h
    maxPlausibleAccelMps2: 2.5,
    maxAccuracyThresholdMeters: 25.0,
    maxHeadingChangeDegreesAtSpeed: 180
  },
  HIKING: {
    maxPlausibleVelocityMps: 4.0, // 14.4 km/h
    maxPlausibleAccelMps2: 2.5,
    maxAccuracyThresholdMeters: 35.0,
    maxHeadingChangeDegreesAtSpeed: 180
  },
  GENERAL_FITNESS: {
    maxPlausibleVelocityMps: 15.0,
    maxPlausibleAccelMps2: 5.0,
    maxAccuracyThresholdMeters: 30.0,
    maxHeadingChangeDegreesAtSpeed: 140
  }
};

export interface OutlierEvaluation {
  accepted: boolean;
  reason?: string;
  calculatedVelocityMps?: number;
  calculatedAccelMps2?: number;
}

/**
 * Multi-factor Kinematic Filter for GPS Points
 */
export function evaluateGpsPoint(
  candidate: RawGpsSample,
  previousAccepted?: RawGpsSample,
  sport: SportType = 'RUNNING'
): OutlierEvaluation {
  const limits = SPORT_LIMITS[sport] || SPORT_LIMITS.RUNNING;

  // 1. Accuracy Check
  if (candidate.accuracy > limits.maxAccuracyThresholdMeters) {
    return {
      accepted: false,
      reason: `Accuracy degraded: ${candidate.accuracy}m exceeds limit ${limits.maxAccuracyThresholdMeters}m`
    };
  }

  // If first point, accept as baseline
  if (!previousAccepted) {
    return { accepted: true };
  }

  // 2. Temporal Validity Check
  const deltaTSeconds = (candidate.timestamp - previousAccepted.timestamp) / 1000;
  if (deltaTSeconds < 0.2) {
    return { accepted: false, reason: 'Duplicate/sub-200ms sample interval' };
  }
  if (deltaTSeconds > 300) {
    // Large temporal gap (e.g. app paused) — accept as new track segment
    return { accepted: true };
  }

  // 3. Geodesic Distance
  const deltaDMeters = haversineDistanceMeters(previousAccepted, candidate);

  // 4. Instantaneous Velocity
  const velocityMps = deltaDMeters / deltaTSeconds;
  if (velocityMps > limits.maxPlausibleVelocityMps) {
    return {
      accepted: false,
      calculatedVelocityMps: velocityMps,
      reason: `Velocity ${velocityMps.toFixed(2)} m/s exceeds ${sport} limit ${limits.maxPlausibleVelocityMps} m/s`
    };
  }

  // 5. Acceleration Check
  if (previousAccepted.speed !== undefined) {
    const accelMps2 = Math.abs(velocityMps - previousAccepted.speed) / deltaTSeconds;
    if (accelMps2 > limits.maxPlausibleAccelMps2 && velocityMps > 3.0) {
      return {
        accepted: false,
        calculatedVelocityMps: velocityMps,
        calculatedAccelMps2: accelMps2,
        reason: `Acceleration ${accelMps2.toFixed(2)} m/s² exceeds plausible physical limit`
      };
    }
  }

  return {
    accepted: true,
    calculatedVelocityMps: velocityMps
  };
}
