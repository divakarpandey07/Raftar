import { DataQualityGrade, DataQualityReport } from './types';

export class DataQualityEngine {
  /**
   * Formally evaluates sensor presence, coverage, and sampling continuity.
   */
  static assessQuality(
    totalDurationSeconds: number,
    pointCount: number,
    hrCount: number,
    powerCount: number,
    sensorAuthority = 'SMARTPHONE_GPS'
  ): DataQualityReport {
    const hrCoveragePct = pointCount > 0 ? Math.round((hrCount / pointCount) * 100) : 0;
    const powerCoveragePct = pointCount > 0 ? Math.round((powerCount / pointCount) * 100) : 0;
    const samplingRateHz = totalDurationSeconds > 0 ? Math.round((pointCount / totalDurationSeconds) * 10) / 10 : 0;

    let overallGrade: DataQualityGrade = 'EXCELLENT';
    let explanation = `High-resolution telemetry with ${hrCoveragePct}% HR coverage at ${samplingRateHz} Hz.`;

    if (pointCount < 10 || totalDurationSeconds < 60) {
      overallGrade = 'INSUFFICIENT';
      explanation = 'Insufficient activity duration or GPS sample count.';
    } else if (hrCoveragePct < 50 && hrCount > 0) {
      overallGrade = 'DEGRADED';
      explanation = `Degraded heart rate coverage (${hrCoveragePct}% of workout duration).`;
    } else if (hrCount === 0) {
      overallGrade = 'GOOD';
      explanation = 'Clean GPS kinematics without external physiological sensor telemetry.';
    }

    return {
      overallGrade,
      gpsCoveragePct: pointCount > 0 ? 100 : 0,
      hrCoveragePct,
      powerCoveragePct,
      sensorAuthority,
      samplingRateHz,
      qualityExplanation: explanation
    };
  }
}
