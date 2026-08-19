import { MetricRecord, MetricType } from '../types/provenance.types';

export interface ReconciliationResult {
  activityId: string;
  totalRawRecords: number;
  finalCanonicalRecords: MetricRecord[];
  reconciledCount: number;
  supersededRecordsCount: number;
}

export class PostWorkoutReconciliationEngine {
  /**
   * Reconciles live recorded samples with late-arriving buffered samples to produce the Final Canonical timeline.
   */
  static reconcileActivityTimeline(
    activityId: string,
    rawRecords: MetricRecord[],
    lateBufferedRecords: MetricRecord[] = []
  ): ReconciliationResult {
    const allRecords = [...rawRecords, ...lateBufferedRecords];
    allRecords.sort((a, b) => a.timestamp - b.timestamp);

    // Group records by 1-second interval slots (1000ms buckets)
    const metricBuckets: Map<string, MetricRecord[]> = new Map();

    for (const rec of allRecords) {
      const bucketKey = `${rec.metricType}_${Math.floor(rec.timestamp / 1000) * 1000}`;
      const bucket = metricBuckets.get(bucketKey) || [];
      bucket.push(rec);
      metricBuckets.set(bucketKey, bucket);
    }

    const finalCanonical: MetricRecord[] = [];
    let supersededCount = 0;

    for (const [bucketKey, candidates] of metricBuckets.entries()) {
      // Sort candidates in bucket by: Validity > Quality Score > Confidence Score > Measurement Mode
      candidates.sort((a, b) => {
        if (a.validityStatus === 'VALID' && b.validityStatus !== 'VALID') return -1;
        if (b.validityStatus === 'VALID' && a.validityStatus !== 'VALID') return 1;

        if (a.measurementMode === 'MEASURED' && b.measurementMode === 'ESTIMATED') return -1;
        if (b.measurementMode === 'MEASURED' && a.measurementMode === 'ESTIMATED') return 1;

        const scoreA = (a.qualityScore * 0.5) + (a.confidenceScore * 0.5);
        const scoreB = (b.qualityScore * 0.5) + (b.confidenceScore * 0.5);
        return scoreB - scoreA;
      });

      const winner = { ...candidates[0], isCanonical: true, isSuppressed: false };
      finalCanonical.push(winner);

      // Mark others as suppressed
      for (let i = 1; i < candidates.length; i++) {
        candidates[i].isCanonical = false;
        candidates[i].isSuppressed = true;
        supersededCount++;
      }
    }

    finalCanonical.sort((a, b) => a.timestamp - b.timestamp);

    return {
      activityId,
      totalRawRecords: allRecords.length,
      finalCanonicalRecords: finalCanonical,
      reconciledCount: finalCanonical.length,
      supersededRecordsCount: supersededCount
    };
  }
}
