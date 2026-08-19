import { MetricType, MeasurementMode, ValidityStatus } from '../types/provenance.types';

export interface QualityEvaluationResult {
  qualityScore: number;
  confidenceScore: number;
  validityStatus: ValidityStatus;
  rejectionReason?: string;
}

export class QualityAndPlausibilityEngine {
  /**
   * Evaluates raw sensor measurement for physical plausibility and signal quality.
   */
  static evaluateSample(params: {
    metricType: MetricType;
    value: number;
    measurementMode: MeasurementMode;
    ageMs: number;
    rawSignalQuality?: number; // 0-100 if reported by device (e.g. ECG contact quality, HDOP)
    previousValue?: number;
    deltaTMs?: number;
  }): QualityEvaluationResult {
    const rawQuality = params.rawSignalQuality ?? 95;

    // 1. Freshness Penalty
    let freshnessMultiplier = 1.0;
    if (params.ageMs > 5000) freshnessMultiplier = 0.2;
    else if (params.ageMs > 2000) freshnessMultiplier = 0.6;
    else if (params.ageMs > 1000) freshnessMultiplier = 0.85;

    const baseQuality = Math.round(rawQuality * freshnessMultiplier);

    // 2. Plausibility Range Verification
    let validity: ValidityStatus = 'VALID';
    let reason: string | undefined = undefined;

    switch (params.metricType) {
      case 'HEART_RATE':
        if (params.value < 30 || params.value > 250) {
          validity = 'INVALID';
          reason = `HR value ${params.value} BPM is outside physiological human limits (30-250)`;
        } else if (params.previousValue && params.deltaTMs && params.deltaTMs < 2000) {
          const deltaBpm = Math.abs(params.value - params.previousValue);
          if (deltaBpm > 50) {
            validity = 'SUSPICIOUS';
            reason = `Sudden HR spike of ${deltaBpm} BPM in ${params.deltaTMs}ms`;
          }
        }
        break;

      case 'POWER':
        if (params.value < 0 || params.value > 2800) {
          validity = 'INVALID';
          reason = `Power ${params.value}W is outside physical bicycle limits`;
        }
        break;

      case 'CADENCE':
        if (params.value < 0 || params.value > 260) {
          validity = 'INVALID';
          reason = `Cadence ${params.value} RPM is invalid`;
        }
        break;

      case 'SPEED':
        if (params.value < 0 || params.value > 45) { // 45 m/s = 162 km/h
          validity = 'INVALID';
          reason = `Speed ${params.value} m/s is physically impossible for human athletic activity`;
        }
        break;

      case 'GPS_LOCATION':
        if (params.value < -180 || params.value > 180) {
          validity = 'INVALID';
          reason = `Coordinate ${params.value} is out of geographic bounds`;
        }
        break;
    }

    // 3. Confidence Calculation
    // MEASURED mode = 1.0 weight, ESTIMATED mode = 0.65 weight
    const modeWeight = params.measurementMode === 'MEASURED' ? 1.0 : params.measurementMode === 'ESTIMATED' ? 0.65 : 0.80;
    const validityPenalty = validity === 'VALID' ? 1.0 : validity === 'SUSPICIOUS' ? 0.4 : 0.0;

    const confidenceScore = Math.round(baseQuality * modeWeight * validityPenalty);

    return {
      qualityScore: baseQuality,
      confidenceScore,
      validityStatus: validity,
      rejectionReason: reason
    };
  }
}
