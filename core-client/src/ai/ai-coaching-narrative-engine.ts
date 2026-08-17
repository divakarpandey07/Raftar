import { SportType } from '../types';
import { AthleticTelemetryExtractor } from './athletic-telemetry-extractor';
import { DataQualityEngine } from './data-quality-engine';
import { GroundedWorkoutInsights, RecommendedNextSession, ProvenanceClaim } from './types';

export class AiCoachingNarrativeEngine {
  private static readonly MEDICAL_SAFETY_DISCLAIMER =
    'RAFTAR Athletic Intelligence provides training workload analysis for fitness tracking only. It does not provide medical diagnosis, injury prognosis, or health treatment prescriptions. If you experience persistent pain, abnormal fatigue, or musculoskeletal symptoms, consult a licensed healthcare professional.';

  /**
   * Synthesizes a context-grounded narrative strictly bounded by a 3-layer architecture:
   * OBSERVED -> DERIVED -> INTERPRETIVE, maintaining explicit provenance chains for all claims.
   */
  static generateInsights(
    activity: {
      id: string;
      athleteName: string;
      sportType: SportType;
      distanceMeters: number;
      durationSeconds: number;
      elevationGainMeters: number;
      averageSpeedMps: number;
      averageHeartRate?: number;
      averagePowerWatts?: number;
    },
    splits: { splitIndex: number; distanceMeters: number; durationSeconds: number; averageHeartRate?: number }[] = [],
    pointsWithHr: { speedMps: number; heartRate?: number; power?: number; timestamp: number }[] = [],
    pastWorkoutsForAcwr: { tss: number; timestamp: number }[] = []
  ): GroundedWorkoutInsights {
    const inputSnapshotId = `snap_${activity.id}_${Date.now()}`;
    const distanceKm = Math.round((activity.distanceMeters / 1000) * 100) / 100;
    const durationMins = Math.floor(activity.durationSeconds / 60);
    const durationSecs = activity.durationSeconds % 60;
    const durationFormatted = `${durationMins}:${durationSecs.toString().padStart(2, '0')}`;

    const paceSecPerKm = activity.averageSpeedMps > 0 ? Math.round(1000 / activity.averageSpeedMps) : 0;
    const paceMin = Math.floor(paceSecPerKm / 60);
    const paceSec = paceSecPerKm % 60;
    const averagePaceFormatted = `${paceMin}:${paceSec.toString().padStart(2, '0')}/km`;

    // 1. Data Quality Assessment (Raw Telemetry Quality)
    const hrCount = pointsWithHr.filter((p) => p.heartRate && p.heartRate > 0).length;
    const powerCount = pointsWithHr.filter((p) => p.power && p.power > 0).length;
    const dataQuality = DataQualityEngine.assessQuality(
      activity.durationSeconds,
      pointsWithHr.length,
      hrCount,
      powerCount
    );

    // 2. Pacing & Split Progression
    let hasNegativeSplit = false;
    let splitDeltaSeconds = 0;
    if (splits.length >= 2) {
      const mid = Math.floor(splits.length / 2);
      const firstHalfTime = splits.slice(0, mid).reduce((a, s) => a + s.durationSeconds, 0);
      const secondHalfTime = splits.slice(mid).reduce((a, s) => a + s.durationSeconds, 0);
      splitDeltaSeconds = Math.round(secondHalfTime - firstHalfTime);
      hasNegativeSplit = splitDeltaSeconds < 0;
    }

    // 3. Sport-Specific Aerobic Decoupling
    const aerobicDecoupling = AthleticTelemetryExtractor.calculateAerobicDecoupling(
      activity.sportType,
      pointsWithHr,
      activity.distanceMeters,
      activity.elevationGainMeters,
      inputSnapshotId
    );

    // 4. Multi-Factor Training Load Assessment
    const trainingLoad = AthleticTelemetryExtractor.calculateAcwr(
      activity.sportType,
      pastWorkoutsForAcwr,
      inputSnapshotId
    );

    // 5. Build Provenance Chain for Every Statement
    const provenanceClaims: ProvenanceClaim[] = [
      {
        claim: `Completed ${distanceKm} km in ${durationFormatted} (${averagePaceFormatted})`,
        sourceMetric: 'GPS_DISTANCE_DURATION',
        inputSnapshotId,
        calculationModel: 'canonical-aggregation-v1.0',
        modelVersion: 'core-v1.0',
        rulesetVersion: 'agg-v1.0',
        configurationVersion: 'default-v1.0',
        confidence: 'HIGH',
        claimType: 'OBSERVED',
        evidenceClass: 'TELEMETRY'
      }
    ];

    if (hasNegativeSplit) {
      provenanceClaims.push({
        claim: `Second half was ${Math.abs(splitDeltaSeconds)}s faster than first half`,
        sourceMetric: 'KM_SPLITS',
        inputSnapshotId,
        calculationModel: 'split-delta-v1.0',
        modelVersion: 'splits-v1.0',
        rulesetVersion: 'split-math-v1.0',
        configurationVersion: 'default-v1.0',
        confidence: 'HIGH',
        claimType: 'DERIVED',
        evidenceClass: 'DERIVED_METRIC'
      });
    }

    if (aerobicDecoupling && aerobicDecoupling.status === 'LOW_DECOUPLING') {
      provenanceClaims.push({
        claim: `Speed-to-heart-rate coupling ratio remained stable (${aerobicDecoupling.decouplingPercentage}% drift)`,
        sourceMetric: 'SPEED_HR_TIMESERIES',
        inputSnapshotId,
        calculationModel: 'aerobic-coupling-v1.2',
        modelVersion: aerobicDecoupling.modelVersion,
        rulesetVersion: aerobicDecoupling.rulesetVersion,
        configurationVersion: aerobicDecoupling.configurationVersion,
        confidence: aerobicDecoupling.confidence,
        claimType: 'DERIVED',
        evidenceClass: 'DERIVED_METRIC'
      });
    }

    // 6. Next Session Recommendation
    let nextSessionRecommendation: RecommendedNextSession = 'ENDURANCE_ZONE_2';
    if (trainingLoad.status === 'FAR_ABOVE_CONFIGURED_REFERENCE') {
      nextSessionRecommendation = 'REST_DAY';
    } else if (trainingLoad.status === 'ABOVE_CONFIGURED_REFERENCE') {
      nextSessionRecommendation = 'RECOVERY_ZONE_1';
    } else if (hasNegativeSplit && aerobicDecoupling?.status === 'LOW_DECOUPLING') {
      nextSessionRecommendation = 'THRESHOLD_TEMPO';
    }

    // 7. Guarded Narrative Synthesis
    const coachingNarrative = this.synthesizeGuardedNarrative(
      activity.athleteName || 'Athlete',
      activity.sportType,
      distanceKm,
      averagePaceFormatted,
      activity.averageHeartRate,
      hasNegativeSplit,
      aerobicDecoupling,
      trainingLoad,
      nextSessionRecommendation
    );

    return {
      activityId: activity.id,
      athleteName: activity.athleteName,
      sportType: activity.sportType,
      distanceKm,
      durationFormatted,
      averagePaceFormatted,
      averageHeartRate: activity.averageHeartRate,
      averagePowerWatts: activity.averagePowerWatts,
      hasNegativeSplit,
      splitDeltaSeconds,
      dataQuality,
      aerobicDecoupling,
      trainingLoad,
      provenanceClaims,
      coachingNarrative,
      nextSessionRecommendation,
      medicalDisclaimer: this.MEDICAL_SAFETY_DISCLAIMER
    };
  }

  private static synthesizeGuardedNarrative(
    athleteName: string,
    sport: SportType,
    distanceKm: number,
    pace: string,
    avgHr: number | undefined,
    hasNegativeSplit: boolean,
    decoupling: any,
    load: any,
    nextSession: RecommendedNextSession
  ): string {
    const hrText = avgHr ? ` at an average heart rate of ${avgHr} BPM` : '';
    const pacingText = hasNegativeSplit
      ? 'Pacing was disciplined with a negative split observed in the latter half.'
      : 'Pace remained consistent across the session.';

    let loadText = '';
    if (load.status === 'WITHIN_CONFIGURED_REFERENCE') {
      loadText = `Your recent training load is within your configured reference band (ACWR ${load.acwrRatio}).`;
    } else if (load.status === 'FAR_ABOVE_CONFIGURED_REFERENCE') {
      loadText = `Your recent 7-day workload is substantially elevated above your reference baseline (ACWR ${load.acwrRatio}); consider prioritizing rest.`;
    } else if (load.status === 'ABOVE_CONFIGURED_REFERENCE') {
      loadText = `Your recent workload is above your configured reference band (ACWR ${load.acwrRatio}).`;
    }

    return `Good session, ${athleteName}! You logged a ${distanceKm} km ${sport.toLowerCase()} workout at ${pace}${hrText}. ${pacingText} ${loadText} A suitable option for your next scheduled session is: ${nextSession.replace(/_/g, ' ')}.`;
  }
}
