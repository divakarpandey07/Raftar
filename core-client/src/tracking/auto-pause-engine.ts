import { SportType } from '../types';

export interface AutoPauseConfig {
  enabled: boolean;
  pauseSpeedThresholdMps: number; // e.g. < 0.6 m/s
  pauseConsecutiveSamples: number; // e.g. 4 consecutive seconds
  resumeSpeedThresholdMps: number; // e.g. > 0.8 m/s
  resumeConsecutiveSamples: number; // e.g. 2 samples
}

export const DEFAULT_AUTOPAUSE_CONFIGS: Record<SportType, AutoPauseConfig> = {
  RUNNING: { enabled: true, pauseSpeedThresholdMps: 0.6, pauseConsecutiveSamples: 4, resumeSpeedThresholdMps: 0.8, resumeConsecutiveSamples: 2 },
  CYCLING: { enabled: true, pauseSpeedThresholdMps: 1.0, pauseConsecutiveSamples: 4, resumeSpeedThresholdMps: 1.5, resumeConsecutiveSamples: 2 },
  WALKING: { enabled: true, pauseSpeedThresholdMps: 0.4, pauseConsecutiveSamples: 6, resumeSpeedThresholdMps: 0.6, resumeConsecutiveSamples: 2 },
  HIKING: { enabled: true, pauseSpeedThresholdMps: 0.3, pauseConsecutiveSamples: 8, resumeSpeedThresholdMps: 0.5, resumeConsecutiveSamples: 2 },
  SWIMMING: { enabled: false, pauseSpeedThresholdMps: 0.2, pauseConsecutiveSamples: 10, resumeSpeedThresholdMps: 0.4, resumeConsecutiveSamples: 2 },
  GENERAL_FITNESS: { enabled: true, pauseSpeedThresholdMps: 0.5, pauseConsecutiveSamples: 5, resumeSpeedThresholdMps: 0.8, resumeConsecutiveSamples: 2 }
};

export class AutoPauseEngine {
  private config: AutoPauseConfig;
  private isAutoPaused = false;
  private lowSpeedCounter = 0;
  private highSpeedCounter = 0;

  constructor(sportType: SportType = 'RUNNING') {
    this.config = DEFAULT_AUTOPAUSE_CONFIGS[sportType] || DEFAULT_AUTOPAUSE_CONFIGS.RUNNING;
  }

  setSportType(sportType: SportType): void {
    this.config = DEFAULT_AUTOPAUSE_CONFIGS[sportType] || DEFAULT_AUTOPAUSE_CONFIGS.RUNNING;
  }

  setConfig(config: Partial<AutoPauseConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Ingests calculated instantaneous velocity and evaluates auto-pause transition.
   * Returns true if active moving state, false if auto-paused.
   */
  evaluateSpeed(velocityMps: number): { isAutoPaused: boolean; stateChanged: boolean } {
    if (!this.config.enabled) {
      return { isAutoPaused: false, stateChanged: false };
    }

    let stateChanged = false;

    if (!this.isAutoPaused) {
      if (velocityMps < this.config.pauseSpeedThresholdMps) {
        this.lowSpeedCounter++;
        if (this.lowSpeedCounter >= this.config.pauseConsecutiveSamples) {
          this.isAutoPaused = true;
          this.lowSpeedCounter = 0;
          this.highSpeedCounter = 0;
          stateChanged = true;
        }
      } else {
        this.lowSpeedCounter = 0;
      }
    } else {
      // Currently auto-paused: check for resume trigger
      if (velocityMps >= this.config.resumeSpeedThresholdMps) {
        this.highSpeedCounter++;
        if (this.highSpeedCounter >= this.config.resumeConsecutiveSamples) {
          this.isAutoPaused = false;
          this.highSpeedCounter = 0;
          this.lowSpeedCounter = 0;
          stateChanged = true;
        }
      } else {
        this.highSpeedCounter = 0;
      }
    }

    return { isAutoPaused: this.isAutoPaused, stateChanged };
  }

  getIsAutoPaused(): boolean {
    return this.isAutoPaused;
  }

  reset(): void {
    this.isAutoPaused = false;
    this.lowSpeedCounter = 0;
    this.highSpeedCounter = 0;
  }
}
