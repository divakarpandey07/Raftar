import { SportType } from '../types';

export type DataQualityGrade = 'EXCELLENT' | 'GOOD' | 'DEGRADED' | 'INSUFFICIENT';
export type MetricConfidence = 'HIGH' | 'MODERATE' | 'LOW' | 'INSUFFICIENT_DATA';

export type SportLoadModelType =
  | 'rTSS_PACE'           // Running: Pace-based Training Stress Score (Normalized Graded Pace vs Threshold Pace)
  | 'POWER_FTP_TSS'       // Cycling: Coggan Power-based TSS (Normalized Power vs FTP)
  | 'sTSS_CSS_PACE'       // Swimming: Swim TSS based on Critical Swim Speed (CSS)
  | 'hrTSS_HEARTRATE'     // Heart Rate TSS / TRIMP (Fallback for all aerobic sports)
  | 'NOT_APPLICABLE';

export type AcwrStatus =
  | 'INSUFFICIENT_HISTORY'
  | 'BELOW_CONFIGURED_REFERENCE'
  | 'WITHIN_CONFIGURED_REFERENCE'
  | 'ABOVE_CONFIGURED_REFERENCE'
  | 'FAR_ABOVE_CONFIGURED_REFERENCE'
  | 'NOT_APPLICABLE_FOR_SPORT';

export type DecouplingStatus =
  | 'LOW_DECOUPLING'
  | 'ELEVATED_DECOUPLING'
  | 'NOT_APPLICABLE_NON_STEADY_STATE'
  | 'INSUFFICIENT_DATA'
  | 'NOT_APPLICABLE_FOR_SPORT';

export type RecommendedNextSession =
  | 'REST_DAY'
  | 'RECOVERY_ZONE_1'
  | 'ENDURANCE_ZONE_2'
  | 'THRESHOLD_TEMPO'
  | 'VO2_MAX_INTERVALS';

export interface DataQualityReport {
  overallGrade: DataQualityGrade;
  gpsCoveragePct: number;
  hrCoveragePct: number;
  powerCoveragePct: number;
  sensorAuthority: string;
  samplingRateHz: number;
  qualityExplanation: string;
}

export interface SteadyStateQualificationHeuristics {
  minDurationSeconds: number;
  maxSpeedCvPct: number;
  maxClimbMetersPerKm: number;
}

export interface SportLoadConfiguration {
  sportType: SportType;
  configurationVersion: string;
  primaryWorkloadCoupling: 'PACE_HR' | 'POWER_HR' | 'SPEED_HR' | 'NOT_APPLICABLE';
  sportLoadModel: SportLoadModelType;
  fallbackLoadModel: SportLoadModelType;
  configuredReferenceBandMin: number;
  configuredReferenceBandMax: number;
  configuredFarAboveThreshold: number;
  qualificationHeuristics: SteadyStateQualificationHeuristics;
  minHistoryDays: number;
  minValidSessions: number;
  supportsLoadMonitoring: boolean;
  supportsAerobicDecoupling: boolean;
}

export interface AerobicDecouplingMetrics {
  modelVersion: string;
  rulesetVersion: string;
  configurationVersion: string;
  inputSnapshotId: string;
  calculatedAt: number;
  status: DecouplingStatus;
  firstHalfCouplingRatio: number;
  secondHalfCouplingRatio: number;
  decouplingPercentage: number;
  confidence: MetricConfidence;
  confidenceExplanation: string;
  observedFacts: string[];
  derivedFindings: string[];
  interpretivePossibilities: string[];
}

export interface SportWorkoutLoad {
  loadScore: number;
  loadModel: SportLoadModelType;
  timestamp: number;
}

export interface TrainingLoadAssessment {
  modelVersion: string;
  rulesetVersion: string;
  configurationVersion: string;
  sportLoadModelUsed: SportLoadModelType;
  inputSnapshotId: string;
  calculatedAt: number;
  status: AcwrStatus;
  acuteWorkload7DaysTss: number;
  chronicWorkload28DaysTss: number;
  acwrRatio: number;
  loadTrend: 'INCREASING' | 'STEADY' | 'DECREASING' | 'INSUFFICIENT_DATA';
  confidence: MetricConfidence;
  confidenceExplanation: string;
  explanation: string;
}

export interface ProvenanceClaim {
  claim: string;
  sourceMetric: string;
  inputSnapshotId: string;
  calculationModel: string;
  modelVersion: string;
  rulesetVersion: string;
  configurationVersion: string;
  confidence: MetricConfidence; // Backward-compatible unified confidence
  evidenceConfidence?: MetricConfidence; // Data/metric integrity confidence
  recommendationConfidence?: MetricConfidence; // Action/recommendation confidence
  claimType: 'OBSERVED' | 'DERIVED' | 'INTERPRETIVE';
  evidenceClass: 'TELEMETRY' | 'DERIVED_METRIC' | 'EXTERNAL_RESEARCH' | 'USER_CONTEXT';
}

export interface GroundedWorkoutInsights {
  activityId: string;
  athleteName: string;
  sportType: SportType;
  distanceKm: number;
  durationFormatted: string;
  averagePaceFormatted: string;
  averageHeartRate?: number;
  averagePowerWatts?: number;
  hasNegativeSplit: boolean;
  splitDeltaSeconds: number;
  dataQuality: DataQualityReport;
  aerobicDecoupling?: AerobicDecouplingMetrics;
  trainingLoad: TrainingLoadAssessment;
  provenanceClaims: ProvenanceClaim[];
  coachingNarrative: string;
  nextSessionRecommendation: RecommendedNextSession;
  medicalDisclaimer: string;
}
