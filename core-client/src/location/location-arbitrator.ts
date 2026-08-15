import { LocationQualityState, RawGpsPoint, Coordinate } from '../types';

export interface LocationHardwareInput {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy: number; // meters (horizontal error)
  speed?: number; // m/s
  heading?: number;
  timestamp: number;
  sourceType: 'GNSS' | 'NETWORK' | 'SENSOR_ESTIMATED' | 'DISABLED';
}

export class LocationArbitrator {
  private currentQuality: LocationQualityState = 'UNAVAILABLE';
  private consecutiveDegradedCount = 0;

  evaluateLocation(input: LocationHardwareInput): {
    quality: LocationQualityState;
    processedPoint: Omit<RawGpsPoint, 'localActivityId' | 'pointIndex'> | null;
  } {
    // 1. Check if location hardware is disabled
    if (input.sourceType === 'DISABLED') {
      this.currentQuality = 'UNAVAILABLE';
      return { quality: 'UNAVAILABLE', processedPoint: null };
    }

    // 2. Dead-Reckoning Sensor Fallback
    if (input.sourceType === 'SENSOR_ESTIMATED') {
      this.currentQuality = 'ESTIMATED';
      return {
        quality: 'ESTIMATED',
        processedPoint: {
          latitude: input.latitude,
          longitude: input.longitude,
          altitude: input.altitude,
          accuracy: Math.max(input.accuracy, 30.0),
          speed: input.speed,
          timestamp: input.timestamp,
          isEstimated: true // Strictly labeled as estimated
        }
      };
    }

    // 3. GNSS & Network Accuracy Evaluation
    if (input.accuracy <= 10.0 && input.sourceType === 'GNSS') {
      this.currentQuality = 'HIGH_ACCURACY';
      this.consecutiveDegradedCount = 0;
      return {
        quality: 'HIGH_ACCURACY',
        processedPoint: {
          latitude: input.latitude,
          longitude: input.longitude,
          altitude: input.altitude,
          accuracy: input.accuracy,
          speed: input.speed,
          timestamp: input.timestamp,
          isEstimated: false
        }
      };
    }

    if (input.accuracy <= 25.0) {
      this.currentQuality = 'MODERATE_ACCURACY';
      this.consecutiveDegradedCount = 0;
      return {
        quality: 'MODERATE_ACCURACY',
        processedPoint: {
          latitude: input.latitude,
          longitude: input.longitude,
          altitude: input.altitude,
          accuracy: input.accuracy,
          speed: input.speed,
          timestamp: input.timestamp,
          isEstimated: false
        }
      };
    }

    // 4. Degraded state (>25m accuracy)
    this.currentQuality = 'DEGRADED';
    this.consecutiveDegradedCount++;
    return {
      quality: 'DEGRADED',
      processedPoint: {
        latitude: input.latitude,
        longitude: input.longitude,
        altitude: input.altitude,
        accuracy: input.accuracy,
        speed: input.speed,
        timestamp: input.timestamp,
        isEstimated: true // Degraded points flagged for tracking sanity
      }
    };
  }

  getCurrentQuality(): LocationQualityState {
    return this.currentQuality;
  }
}
