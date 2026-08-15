import { SportType } from '../types';

export type GpsTrackingState =
  | 'INITIALIZING'
  | 'GPS_LOCKED'
  | 'TRACKING'
  | 'GPS_DEGRADED'
  | 'GPS_LOST'
  | 'SENSOR_ESTIMATION'
  | 'GPS_REACQUIRED'
  | 'RECONCILIATION';

export type GpsPointRejectionReason =
  | 'INSTANTANEOUS_TELEPORTATION'
  | 'IMPOSSIBLE_VELOCITY'
  | 'IMPOSSIBLE_ACCELERATION'
  | 'DEGRADED_ACCURACY'
  | 'MOCKED_PROVIDER';

export interface LocationReading {
  latitude: number;
  longitude: number;
  altitudeMeters?: number;
  accuracyMeters: number;
  speedMps?: number;
  timestamp: number;
  isMocked?: boolean;
}

export interface EstimatedTrackPoint {
  latitude: number;
  longitude: number;
  altitudeMeters?: number;
  timestamp: number;
  trackingMode: 'GNSS_HIGH_CONFIDENCE' | 'GNSS_DEGRADED' | 'SENSOR_ESTIMATED';
  confidenceScore: number; // Uncalibrated heuristic index (0.0 to 1.0), NOT a probability of correctness
  estimatedErrorMeters: number; // Estimated bounds, e.g. ± 15m
  isReconciled?: boolean;
}

export class GpsStateMachine {
  private currentState: GpsTrackingState = 'INITIALIZING';
  private lastValidGpsPoint?: LocationReading;
  private consecutiveDegradedCount = 0;
  private lastUpdateTimestamp = 0;
  private sportType: SportType = 'RUNNING';

  constructor(sportType: SportType = 'RUNNING') {
    this.sportType = sportType;
  }

  getState(): GpsTrackingState {
    return this.currentState;
  }

  processReading(reading: LocationReading): {
    state: GpsTrackingState;
    point: EstimatedTrackPoint | null;
    reconciliationPerformed: boolean;
    rejectionReason?: GpsPointRejectionReason;
  } {
    const now = reading.timestamp;
    this.lastUpdateTimestamp = now;
    let reconciliationPerformed = false;

    if (reading.isMocked) {
      return {
        state: this.currentState,
        point: null,
        reconciliationPerformed: false,
        rejectionReason: 'MOCKED_PROVIDER'
      };
    }

    // Kinematic outlier & Teleportation check based on sport speed ceilings
    if (this.lastValidGpsPoint) {
      const timeDiffSec = (now - this.lastValidGpsPoint.timestamp) / 1000;
      if (timeDiffSec > 0 && timeDiffSec < 2.0) {
        const dist = this.haversineDistance(
          this.lastValidGpsPoint.latitude,
          this.lastValidGpsPoint.longitude,
          reading.latitude,
          reading.longitude
        );

        const calculatedSpeed = dist / timeDiffSec;
        const maxSportSpeed = this.sportType === 'CYCLING' ? 35.0 : 12.5; // m/s

        if (dist > 500.0) {
          return {
            state: this.currentState,
            point: null,
            reconciliationPerformed: false,
            rejectionReason: 'INSTANTANEOUS_TELEPORTATION'
          };
        }

        if (calculatedSpeed > maxSportSpeed) {
          return {
            state: this.currentState,
            point: null,
            reconciliationPerformed: false,
            rejectionReason: 'IMPOSSIBLE_VELOCITY'
          };
        }
      }
    }

    if (reading.accuracyMeters <= 12.0) {
      if (this.currentState === 'GPS_LOST' || this.currentState === 'SENSOR_ESTIMATION') {
        this.currentState = 'GPS_REACQUIRED';
        reconciliationPerformed = true;
      } else {
        this.currentState = 'TRACKING';
      }
      this.consecutiveDegradedCount = 0;
      this.lastValidGpsPoint = reading;

      return {
        state: this.currentState,
        point: {
          latitude: reading.latitude,
          longitude: reading.longitude,
          altitudeMeters: reading.altitudeMeters,
          timestamp: reading.timestamp,
          trackingMode: 'GNSS_HIGH_CONFIDENCE',
          confidenceScore: 0.98,
          estimatedErrorMeters: reading.accuracyMeters,
          isReconciled: reconciliationPerformed
        },
        reconciliationPerformed
      };
    } else if (reading.accuracyMeters <= 30.0) {
      this.currentState = 'GPS_DEGRADED';
      this.lastValidGpsPoint = reading;
      return {
        state: this.currentState,
        point: {
          latitude: reading.latitude,
          longitude: reading.longitude,
          altitudeMeters: reading.altitudeMeters,
          timestamp: reading.timestamp,
          trackingMode: 'GNSS_DEGRADED',
          confidenceScore: 0.65,
          estimatedErrorMeters: reading.accuracyMeters
        },
        reconciliationPerformed: false
      };
    } else {
      this.consecutiveDegradedCount++;
      if (this.consecutiveDegradedCount >= 3) {
        this.currentState = 'GPS_LOST';
      }
      return {
        state: this.currentState,
        point: null,
        reconciliationPerformed: false,
        rejectionReason: 'DEGRADED_ACCURACY'
      };
    }
  }

  /**
   * Generates sport-specific dead-reckoned track estimation from inertial sensors.
   */
  estimateDeadReckoning(
    elapsedSeconds: number,
    sensorData: {
      cadenceRpm?: number;
      headingDegrees: number;
      estimatedStrideMeters?: number;
      wheelSpeedMps?: number;
      strokeRateSpm?: number;
    }
  ): EstimatedTrackPoint | null {
    if (!this.lastValidGpsPoint) return null;

    let distanceMeters = 0;

    if (this.sportType === 'RUNNING' || this.sportType === 'WALKING') {
      const cadence = sensorData.cadenceRpm || 160;
      const stride = sensorData.estimatedStrideMeters || 1.15;
      const stepsPerSecond = (cadence * 2) / 60;
      distanceMeters = stepsPerSecond * stride * elapsedSeconds;
    } else if (this.sportType === 'CYCLING') {
      if (sensorData.wheelSpeedMps !== undefined && sensorData.wheelSpeedMps > 0) {
        distanceMeters = sensorData.wheelSpeedMps * elapsedSeconds;
      } else if (sensorData.cadenceRpm && sensorData.cadenceRpm > 0) {
        // Approximate gear ratio estimation fallback
        const estimatedSpeedMps = (sensorData.cadenceRpm / 60) * 5.2;
        distanceMeters = estimatedSpeedMps * elapsedSeconds;
      } else {
        return null; // Insufficient sensor evidence for cycling dead reckoning
      }
    } else {
      return null; // Dead reckoning not supported for sport
    }

    this.currentState = 'SENSOR_ESTIMATION';

    // Project forward along heading
    const R = 6371000;
    const radHeading = (sensorData.headingDegrees * Math.PI) / 180;
    const lat1 = (this.lastValidGpsPoint.latitude * Math.PI) / 180;
    const lon1 = (this.lastValidGpsPoint.longitude * Math.PI) / 180;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distanceMeters / R) +
        Math.cos(lat1) * Math.sin(distanceMeters / R) * Math.cos(radHeading)
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(radHeading) * Math.sin(distanceMeters / R) * Math.cos(lat1),
        Math.cos(distanceMeters / R) - Math.sin(lat1) * Math.sin(lat2)
      );

    const projectedLat = (lat2 * 180) / Math.PI;
    const projectedLon = (lon2 * 180) / Math.PI;

    const estimatedError = Math.round(15.0 + distanceMeters * 0.12);
    const confidence = Math.max(0.15, 0.7 - (distanceMeters / 1000) * 0.25);

    return {
      latitude: projectedLat,
      longitude: projectedLon,
      timestamp: Date.now(),
      trackingMode: 'SENSOR_ESTIMATED',
      confidenceScore: Math.round(confidence * 100) / 100,
      estimatedErrorMeters: estimatedError
    };
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
