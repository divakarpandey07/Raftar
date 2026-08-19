export type MovementState =
  | 'STATIONARY'
  | 'LOW_SPEED_WALK'
  | 'STEADY_RUNNING'
  | 'HIGH_SPEED_CYCLING'
  | 'CRITICAL_BATTERY_CONSERVE';

export interface PollingConfiguration {
  updateIntervalMs: number;
  fastestIntervalMs: number;
  smallestDisplacementMeters: number;
  priority: 'HIGH_ACCURACY' | 'BALANCED_POWER' | 'NO_POWER';
  powerProfileName: string;
}

export class AdaptiveGpsPollingEngine {
  private currentMovementState: MovementState = 'STATIONARY';
  private consecutiveLowSpeedTicks = 0;

  /**
   * Evaluates the optimal GPS polling interval and power profile based on current speed and battery level.
   */
  evaluateOptimalPolling(
    currentSpeedMps: number,
    batteryPercentage: number,
    isAutoPaused: boolean
  ): PollingConfiguration {
    // 1. Critical Battery Conservation Gate (< 15% battery)
    if (batteryPercentage < 15) {
      this.currentMovementState = 'CRITICAL_BATTERY_CONSERVE';
      return {
        updateIntervalMs: 5000,
        fastestIntervalMs: 3000,
        smallestDisplacementMeters: 5,
        priority: 'BALANCED_POWER',
        powerProfileName: 'CRITICAL_BATTERY_CONSERVE'
      };
    }

    // 2. Stationary / Auto-Paused Gate
    if (isAutoPaused || currentSpeedMps < 0.6) {
      this.consecutiveLowSpeedTicks++;
      if (this.consecutiveLowSpeedTicks >= 3) {
        this.currentMovementState = 'STATIONARY';
        return {
          updateIntervalMs: 4000,
          fastestIntervalMs: 2000,
          smallestDisplacementMeters: 3,
          priority: 'BALANCED_POWER',
          powerProfileName: 'STATIONARY_ECO'
        };
      }
    } else {
      this.consecutiveLowSpeedTicks = 0;
    }

    // 3. High Speed Cycling (> 7.0 m/s = 25.2 km/h)
    if (currentSpeedMps > 7.0) {
      this.currentMovementState = 'HIGH_SPEED_CYCLING';
      return {
        updateIntervalMs: 1000,
        fastestIntervalMs: 1000,
        smallestDisplacementMeters: 0,
        priority: 'HIGH_ACCURACY',
        powerProfileName: 'HIGH_SPEED_HIGH_ACCURACY'
      };
    }

    // 4. Steady Running (1.5 m/s to 7.0 m/s)
    if (currentSpeedMps >= 1.5) {
      this.currentMovementState = 'STEADY_RUNNING';
      return {
        updateIntervalMs: 1000,
        fastestIntervalMs: 1000,
        smallestDisplacementMeters: 0,
        priority: 'HIGH_ACCURACY',
        powerProfileName: 'STEADY_RUNNING_STANDARD'
      };
    }

    // 5. Low Speed Walk (0.6 m/s to 1.5 m/s)
    this.currentMovementState = 'LOW_SPEED_WALK';
    return {
      updateIntervalMs: 2000,
      fastestIntervalMs: 1000,
      smallestDisplacementMeters: 1,
      priority: 'BALANCED_POWER',
      powerProfileName: 'WALK_BALANCED'
    };
  }

  getCurrentMovementState(): MovementState {
    return this.currentMovementState;
  }
}
