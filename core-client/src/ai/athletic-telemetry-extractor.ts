import { SportType } from '../types';
import {
  AerobicDecouplingMetrics,
  TrainingLoadAssessment,
  AcwrStatus,
  MetricConfidence,
  DecouplingStatus,
  SportWorkoutLoad,
  SportLoadModelType
} from './types';
import { SPORT_LOAD_PROFILES } from './sport-profiles';

export class AthleticTelemetryExtractor {
  static readonly DECOUPLING_MODEL_VERSION = 'decoupling-v1.2';
  static readonly ACWR_MODEL_VERSION = 'acwr-v1.1';
  static readonly ACWR_RULESET_VERSION = 'acwr-methodology-v1.1';

  /**
   * Computes Aerobic Decoupling (External:Internal Load Coupling Drift).
   */
  static calculateAerobicDecoupling(
    sportType: SportType,
    points: { speedMps: number; heartRate?: number; power?: number; timestamp: number }[],
    distanceMeters = 0,
    elevationGainMeters = 0,
    inputSnapshotId = `snap_${Date.now()}`
  ): AerobicDecouplingMetrics {
    const calculatedAt = Date.now();
    const config = SPORT_LOAD_PROFILES[sportType] || SPORT_LOAD_PROFILES.RUNNING;

    if (!config.supportsAerobicDecoupling || config.primaryWorkloadCoupling === 'NOT_APPLICABLE') {
      return {
        modelVersion: this.DECOUPLING_MODEL_VERSION,
        rulesetVersion: 'aerobic-coupling-v1.2',
        configurationVersion: config.configurationVersion,
        inputSnapshotId,
        calculatedAt,
        status: 'NOT_APPLICABLE_FOR_SPORT',
        firstHalfCouplingRatio: 0,
        secondHalfCouplingRatio: 0,
        decouplingPercentage: 0,
        confidence: 'INSUFFICIENT_DATA',
        confidenceExplanation: `Aerobic decoupling is not configured for ${sportType}`,
        observedFacts: [],
        derivedFindings: [],
        interpretivePossibilities: []
      };
    }

    if (points.length < 20) {
      return {
        modelVersion: this.DECOUPLING_MODEL_VERSION,
        rulesetVersion: 'aerobic-coupling-v1.2',
        configurationVersion: config.configurationVersion,
        inputSnapshotId,
        calculatedAt,
        status: 'INSUFFICIENT_DATA',
        firstHalfCouplingRatio: 0,
        secondHalfCouplingRatio: 0,
        decouplingPercentage: 0,
        confidence: 'INSUFFICIENT_DATA',
        confidenceExplanation: 'Insufficient sample count (< 20 samples)',
        observedFacts: [`Recorded ${points.length} samples`],
        derivedFindings: [],
        interpretivePossibilities: []
      };
    }

    const durationSec = (points[points.length - 1].timestamp - points[0].timestamp) / 1000;
    if (durationSec < config.qualificationHeuristics.minDurationSeconds) {
      return {
        modelVersion: this.DECOUPLING_MODEL_VERSION,
        rulesetVersion: 'aerobic-coupling-v1.2',
        configurationVersion: config.configurationVersion,
        inputSnapshotId,
        calculatedAt,
        status: 'NOT_APPLICABLE_NON_STEADY_STATE',
        firstHalfCouplingRatio: 0,
        secondHalfCouplingRatio: 0,
        decouplingPercentage: 0,
        confidence: 'INSUFFICIENT_DATA',
        confidenceExplanation: `Duration (${Math.round(durationSec)}s) is below steady-state qualification heuristic (${config.qualificationHeuristics.minDurationSeconds}s)`,
        observedFacts: [`Duration: ${Math.round(durationSec / 60)} minutes`],
        derivedFindings: [],
        interpretivePossibilities: ['Session too brief to establish aerobic steady-state equilibrium']
      };
    }

    const validHrPoints = points.filter((p) => p.heartRate && p.heartRate > 40 && p.speedMps > 0.5);
    const hrCoveragePct = (validHrPoints.length / points.length) * 100;
    if (hrCoveragePct < 70) {
      return {
        modelVersion: this.DECOUPLING_MODEL_VERSION,
        rulesetVersion: 'aerobic-coupling-v1.2',
        configurationVersion: config.configurationVersion,
        inputSnapshotId,
        calculatedAt,
        status: 'INSUFFICIENT_DATA',
        firstHalfCouplingRatio: 0,
        secondHalfCouplingRatio: 0,
        decouplingPercentage: 0,
        confidence: 'LOW',
        confidenceExplanation: `Heart rate coverage (${Math.round(hrCoveragePct)}%) below 70% requirement`,
        observedFacts: [`HR coverage: ${Math.round(hrCoveragePct)}%`],
        derivedFindings: [],
        interpretivePossibilities: []
      };
    }

    const distKm = distanceMeters > 0 ? distanceMeters / 1000 : (durationSec * 3) / 1000;
    const climbPerKm = distKm > 0 ? elevationGainMeters / distKm : 0;

    const speeds = validHrPoints.map((p) => p.speedMps);
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const variance = speeds.reduce((a, b) => a + Math.pow(b - avgSpeed, 2), 0) / speeds.length;
    const speedCv = (Math.sqrt(variance) / avgSpeed) * 100;

    if (
      speedCv > config.qualificationHeuristics.maxSpeedCvPct ||
      climbPerKm > config.qualificationHeuristics.maxClimbMetersPerKm
    ) {
      return {
        modelVersion: this.DECOUPLING_MODEL_VERSION,
        rulesetVersion: 'aerobic-coupling-v1.2',
        configurationVersion: config.configurationVersion,
        inputSnapshotId,
        calculatedAt,
        status: 'NOT_APPLICABLE_NON_STEADY_STATE',
        firstHalfCouplingRatio: 0,
        secondHalfCouplingRatio: 0,
        decouplingPercentage: 0,
        confidence: 'INSUFFICIENT_DATA',
        confidenceExplanation: `Variability exceeds steady-state qualification heuristics (Speed CV ${speedCv.toFixed(1)}% > ${config.qualificationHeuristics.maxSpeedCvPct}%, Climb ${climbPerKm.toFixed(1)}m/km > ${config.qualificationHeuristics.maxClimbMetersPerKm}m/km)`,
        observedFacts: [
          `Speed CV: ${speedCv.toFixed(1)}%`,
          `Climbing gradient: ${climbPerKm.toFixed(1)} m/km`
        ],
        derivedFindings: ['Non-steady state effort identified under configured qualification heuristics'],
        interpretivePossibilities: ['Pace/HR drift is influenced by terrain and pacing shifts rather than purely aerobic decoupling']
      };
    }

    const midpoint = Math.floor(validHrPoints.length / 2);
    const firstHalf = validHrPoints.slice(0, midpoint);
    const secondHalf = validHrPoints.slice(midpoint);

    const firstAvgHr = firstHalf.reduce((a, p) => a + p.heartRate!, 0) / firstHalf.length;
    const secondAvgHr = secondHalf.reduce((a, p) => a + p.heartRate!, 0) / secondHalf.length;

    const hasPower = sportType === 'CYCLING' && validHrPoints.some((p) => p.power && p.power > 0);

    let firstRatio = 0;
    let secondRatio = 0;

    if (hasPower) {
      const firstAvgPower = firstHalf.reduce((a, p) => a + (p.power || 0), 0) / firstHalf.length;
      const secondAvgPower = secondHalf.reduce((a, p) => a + (p.power || 0), 0) / secondHalf.length;
      firstRatio = firstAvgPower / firstAvgHr;
      secondRatio = secondAvgPower / secondAvgHr;
    } else {
      const firstAvgSpd = firstHalf.reduce((a, p) => a + p.speedMps, 0) / firstHalf.length;
      const secondAvgSpd = secondHalf.reduce((a, p) => a + p.speedMps, 0) / secondHalf.length;
      firstRatio = firstAvgSpd / firstAvgHr;
      secondRatio = secondAvgSpd / secondAvgHr;
    }

    const rawDecoupling = firstRatio > 0 ? ((firstRatio - secondRatio) / firstRatio) * 100 : 0;
    const decouplingPct = Math.round(rawDecoupling * 10) / 10;
    const status: DecouplingStatus = decouplingPct <= 5.0 ? 'LOW_DECOUPLING' : 'ELEVATED_DECOUPLING';

    const confidence: MetricConfidence = hrCoveragePct >= 90 && durationSec >= 1200 ? 'HIGH' : 'MODERATE';
    const confidenceExplanation = `${confidence} — HR coverage ${Math.round(hrCoveragePct)}%, duration ${Math.round(durationSec / 60)} min, steady speed CV ${speedCv.toFixed(1)}%`;

    const couplingName = hasPower ? 'Power-to-Heart-Rate Coupling' : 'Speed-to-Heart-Rate Coupling';

    const observedFacts = [
      `1st Half Avg HR: ${Math.round(firstAvgHr)} BPM, 2nd Half Avg HR: ${Math.round(secondAvgHr)} BPM`,
      hasPower ? 'External load evaluated via direct strain-gauge Power Meter' : 'External load evaluated via GPS velocity'
    ];

    const derivedFindings = [
      `${couplingName} shifted from ${firstRatio.toFixed(3)} to ${secondRatio.toFixed(3)}`,
      `Coupling change rate: ${decouplingPct}% (${status.replace(/_/g, ' ')})`
    ];

    const interpretivePossibilities: string[] = [];
    if (status === 'ELEVATED_DECOUPLING') {
      interpretivePossibilities.push('Potential contextual factor: Environmental heat or humidity variations');
      interpretivePossibilities.push('Potential contextual factor: Pacing variation across workout progression');
      interpretivePossibilities.push('Potential contextual factor: Possible hydration-related factors');
      interpretivePossibilities.push('Potential contextual factor: Training-state differences');
      interpretivePossibilities.push('Note: Independent physiological fatigue cannot be established from this single telemetry record alone.');
    } else {
      interpretivePossibilities.push('Observed pattern indicates consistent speed-to-heart-rate coupling throughout the session.');
    }

    return {
      modelVersion: this.DECOUPLING_MODEL_VERSION,
      rulesetVersion: 'aerobic-coupling-v1.2',
      configurationVersion: config.configurationVersion,
      inputSnapshotId,
      calculatedAt,
      status,
      firstHalfCouplingRatio: Math.round(firstRatio * 1000) / 1000,
      secondHalfCouplingRatio: Math.round(secondRatio * 1000) / 1000,
      decouplingPercentage: decouplingPct,
      confidence,
      confidenceExplanation,
      observedFacts,
      derivedFindings,
      interpretivePossibilities
    };
  }

  /**
   * Computes Acute:Chronic Workload Ratio (ACWR) strictly respecting sport-specific load models.
   * Running -> rTSS (Pace/Grade-based)
   * Cycling -> POWER_FTP_TSS (Power-based Coggan TSS)
   * Swimming -> sTSS_CSS_PACE (Critical Swim Speed)
   * Fallback -> hrTSS_HEARTRATE (HR TRIMP)
   */
  static calculateAcwr(
    sportType: SportType,
    past28DaysWorkouts: (SportWorkoutLoad | { tss: number; timestamp: number })[],
    inputSnapshotId = `snap_${Date.now()}`
  ): TrainingLoadAssessment {
    const calculatedAt = Date.now();
    const config = SPORT_LOAD_PROFILES[sportType] || SPORT_LOAD_PROFILES.RUNNING;
    const now = Date.now();
    const ms7Days = 7 * 24 * 3600 * 1000;
    const ms28Days = 28 * 24 * 3600 * 1000;

    // Normalize workouts to SportWorkoutLoad
    const normalizedWorkouts: SportWorkoutLoad[] = past28DaysWorkouts.map((w) => {
      if ('loadScore' in w) {
        return w;
      }
      return {
        loadScore: (w as any).tss || 0,
        loadModel: config.sportLoadModel,
        timestamp: w.timestamp
      };
    });

    const chronicWorkouts = normalizedWorkouts.filter((w) => now - w.timestamp <= ms28Days);
    const oldestTimestamp = chronicWorkouts.reduce((min, w) => Math.min(min, w.timestamp), now);
    const historySpanDays = (now - oldestTimestamp) / (24 * 3600 * 1000);

    if (historySpanDays < config.minHistoryDays - 1 || chronicWorkouts.length < config.minValidSessions) {
      return {
        modelVersion: this.ACWR_MODEL_VERSION,
        rulesetVersion: this.ACWR_RULESET_VERSION,
        configurationVersion: config.configurationVersion,
        sportLoadModelUsed: config.sportLoadModel,
        inputSnapshotId,
        calculatedAt,
        status: 'INSUFFICIENT_HISTORY',
        acuteWorkload7DaysTss: 0,
        chronicWorkload28DaysTss: 0,
        acwrRatio: 1.0,
        loadTrend: 'INSUFFICIENT_DATA',
        confidence: 'INSUFFICIENT_DATA',
        confidenceExplanation: `Insufficient history (${Math.round(historySpanDays)} days < ${config.minHistoryDays} days, ${chronicWorkouts.length} sessions < ${config.minValidSessions})`,
        explanation: `Insufficient historical baseline for ${sportType} (${config.sportLoadModel}). Log consistent workouts over 2-4 weeks to calculate a reliable load deviation ratio.`
      };
    }

    const acuteWorkouts = normalizedWorkouts.filter((w) => now - w.timestamp <= ms7Days);
    const acuteTssTotal = acuteWorkouts.reduce((acc, w) => acc + w.loadScore, 0);
    const chronicTssTotal = chronicWorkouts.reduce((acc, w) => acc + w.loadScore, 0);

    const acuteWeeklyAvg = acuteTssTotal;
    const chronicWeeklyAvg = (chronicTssTotal / 28) * 7;

    const acwr = chronicWeeklyAvg > 0 ? Math.round((acuteWeeklyAvg / chronicWeeklyAvg) * 100) / 100 : 1.0;

    let status: AcwrStatus = 'WITHIN_CONFIGURED_REFERENCE';
    let explanation = `Recent 7-day ${config.sportLoadModel} workload is within the configured reference band (${config.configuredReferenceBandMin} - ${config.configuredReferenceBandMax}) relative to your 28-day baseline.`;

    if (acwr < config.configuredReferenceBandMin) {
      status = 'BELOW_CONFIGURED_REFERENCE';
      explanation = `Recent workload is below your configured reference band (< ${config.configuredReferenceBandMin}). Workload is tapering or descending.`;
    } else if (acwr > config.configuredFarAboveThreshold) {
      status = 'FAR_ABOVE_CONFIGURED_REFERENCE';
      explanation = `Recent workload is substantially elevated above your configured reference band (> ${config.configuredFarAboveThreshold}). Consider monitoring recovery and overall volume.`;
    } else if (acwr > config.configuredReferenceBandMax) {
      status = 'ABOVE_CONFIGURED_REFERENCE';
      explanation = `Recent workload is above your configured reference band (${config.configuredReferenceBandMax} - ${config.configuredFarAboveThreshold}).`;
    }

    const loadTrend = acuteWeeklyAvg > chronicWeeklyAvg * 1.1 ? 'INCREASING' : acuteWeeklyAvg < chronicWeeklyAvg * 0.9 ? 'DECREASING' : 'STEADY';
    const confidence: MetricConfidence = chronicWorkouts.length >= 8 ? 'HIGH' : 'MODERATE';
    const confidenceExplanation = `${confidence} — Based on ${chronicWorkouts.length} validated ${config.sportLoadModel} sessions across ${Math.round(historySpanDays)} days.`;

    return {
      modelVersion: this.ACWR_MODEL_VERSION,
      rulesetVersion: this.ACWR_RULESET_VERSION,
      configurationVersion: config.configurationVersion,
      sportLoadModelUsed: config.sportLoadModel,
      inputSnapshotId,
      calculatedAt,
      status,
      acuteWorkload7DaysTss: Math.round(acuteWeeklyAvg),
      chronicWorkload28DaysTss: Math.round(chronicWeeklyAvg),
      acwrRatio: acwr,
      loadTrend,
      confidence,
      confidenceExplanation,
      explanation
    };
  }
}
