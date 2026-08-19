import { SportType } from '../types';
import { SportLoadConfiguration } from './types';

export const SPORT_LOAD_PROFILES: Record<SportType, SportLoadConfiguration> = {
  RUNNING: {
    sportType: 'RUNNING',
    configurationVersion: 'config-run-v1.2',
    primaryWorkloadCoupling: 'PACE_HR',
    sportLoadModel: 'rTSS_PACE',
    fallbackLoadModel: 'hrTSS_HEARTRATE',
    configuredReferenceBandMin: 0.8,
    configuredReferenceBandMax: 1.3,
    configuredFarAboveThreshold: 1.5,
    qualificationHeuristics: {
      minDurationSeconds: 1200,
      maxSpeedCvPct: 25.0,
      maxClimbMetersPerKm: 15.0
    },
    minHistoryDays: 14,
    minValidSessions: 4,
    supportsLoadMonitoring: true,
    supportsAerobicDecoupling: true
  },
  CYCLING: {
    sportType: 'CYCLING',
    configurationVersion: 'config-bike-v1.2',
    primaryWorkloadCoupling: 'POWER_HR',
    sportLoadModel: 'POWER_FTP_TSS',
    fallbackLoadModel: 'hrTSS_HEARTRATE',
    configuredReferenceBandMin: 0.75,
    configuredReferenceBandMax: 1.35,
    configuredFarAboveThreshold: 1.55,
    qualificationHeuristics: {
      minDurationSeconds: 1800,
      maxSpeedCvPct: 35.0,
      maxClimbMetersPerKm: 25.0
    },
    minHistoryDays: 14,
    minValidSessions: 4,
    supportsLoadMonitoring: true,
    supportsAerobicDecoupling: true
  },
  WALKING: {
    sportType: 'WALKING',
    configurationVersion: 'config-walk-v1.1',
    primaryWorkloadCoupling: 'SPEED_HR',
    sportLoadModel: 'hrTSS_HEARTRATE',
    fallbackLoadModel: 'hrTSS_HEARTRATE',
    configuredReferenceBandMin: 0.8,
    configuredReferenceBandMax: 1.3,
    configuredFarAboveThreshold: 1.45,
    qualificationHeuristics: {
      minDurationSeconds: 1200,
      maxSpeedCvPct: 20.0,
      maxClimbMetersPerKm: 20.0
    },
    minHistoryDays: 14,
    minValidSessions: 4,
    supportsLoadMonitoring: true,
    supportsAerobicDecoupling: true
  },
  HIKING: {
    sportType: 'HIKING',
    configurationVersion: 'config-hike-v1.1',
    primaryWorkloadCoupling: 'SPEED_HR',
    sportLoadModel: 'hrTSS_HEARTRATE',
    fallbackLoadModel: 'hrTSS_HEARTRATE',
    configuredReferenceBandMin: 0.75,
    configuredReferenceBandMax: 1.35,
    configuredFarAboveThreshold: 1.5,
    qualificationHeuristics: {
      minDurationSeconds: 1800,
      maxSpeedCvPct: 40.0,
      maxClimbMetersPerKm: 60.0
    },
    minHistoryDays: 14,
    minValidSessions: 4,
    supportsLoadMonitoring: true,
    supportsAerobicDecoupling: false
  },
  SWIMMING: {
    sportType: 'SWIMMING',
    configurationVersion: 'config-swim-v1.0',
    primaryWorkloadCoupling: 'NOT_APPLICABLE',
    sportLoadModel: 'sTSS_CSS_PACE',
    fallbackLoadModel: 'hrTSS_HEARTRATE',
    configuredReferenceBandMin: 0.8,
    configuredReferenceBandMax: 1.3,
    configuredFarAboveThreshold: 1.5,
    qualificationHeuristics: {
      minDurationSeconds: 900,
      maxSpeedCvPct: 20.0,
      maxClimbMetersPerKm: 0.0
    },
    minHistoryDays: 14,
    minValidSessions: 4,
    supportsLoadMonitoring: true,
    supportsAerobicDecoupling: false
  },
  GENERAL_FITNESS: {
    sportType: 'GENERAL_FITNESS',
    configurationVersion: 'config-gen-v1.0',
    primaryWorkloadCoupling: 'NOT_APPLICABLE',
    sportLoadModel: 'hrTSS_HEARTRATE',
    fallbackLoadModel: 'hrTSS_HEARTRATE',
    configuredReferenceBandMin: 0.8,
    configuredReferenceBandMax: 1.3,
    configuredFarAboveThreshold: 1.5,
    qualificationHeuristics: {
      minDurationSeconds: 600,
      maxSpeedCvPct: 50.0,
      maxClimbMetersPerKm: 0.0
    },
    minHistoryDays: 14,
    minValidSessions: 4,
    supportsLoadMonitoring: true,
    supportsAerobicDecoupling: false
  }
};
