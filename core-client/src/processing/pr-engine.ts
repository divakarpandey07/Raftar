import { RawGpsPoint, SportType } from '../types';
import { calculateHaversineMeters } from './kinematic-validator';

export interface PersonalRecordBenchmark {
  name: string;
  targetDistanceMeters: number;
  sportType: SportType;
}

export const STANDARD_RUNNING_BENCHMARKS: PersonalRecordBenchmark[] = [
  { name: '400m', targetDistanceMeters: 400, sportType: 'RUNNING' },
  { name: '1km', targetDistanceMeters: 1000, sportType: 'RUNNING' },
  { name: '1mi', targetDistanceMeters: 1609.34, sportType: 'RUNNING' },
  { name: '5km', targetDistanceMeters: 5000, sportType: 'RUNNING' },
  { name: '10km', targetDistanceMeters: 10000, sportType: 'RUNNING' },
  { name: 'Half Marathon', targetDistanceMeters: 21097.5, sportType: 'RUNNING' }
];

export interface DetectedPersonalRecord {
  benchmarkName: string;
  targetDistanceMeters: number;
  bestDurationSeconds: number;
  bestPaceSecKm: number;
  startIndex: number;
  endIndex: number;
  elevationDiffMeters: number;
}

export class PersonalRecordEngine {
  /**
   * Scans a series of raw GPS points with a sliding window to find the fastest sub-segment for a given target distance.
   */
  static evaluateFastestSegment(
    points: RawGpsPoint[],
    targetDistanceMeters: number,
    benchmarkName: string
  ): DetectedPersonalRecord | null {
    if (points.length < 2) return null;

    // 1. Precompute cumulative distances
    const cumulativeDist: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      const segDist = calculateHaversineMeters(points[i - 1], points[i]);
      cumulativeDist.push(cumulativeDist[i - 1] + segDist);
    }

    const totalDistance = cumulativeDist[cumulativeDist.length - 1];
    if (totalDistance < targetDistanceMeters) {
      return null; // Activity was shorter than the target benchmark
    }

    let minDurationSeconds = Infinity;
    let bestStart = 0;
    let bestEnd = 0;

    let right = 0;
    for (let left = 0; left < points.length; left++) {
      while (right < points.length && (cumulativeDist[right] - cumulativeDist[left]) < targetDistanceMeters) {
        right++;
      }

      if (right < points.length) {
        const segDist = cumulativeDist[right] - cumulativeDist[left];
        const segDurationSec = (points[right].timestamp - points[left].timestamp) / 1000;

        // Normalize time to exact target distance
        const normalizedDuration = (segDurationSec / segDist) * targetDistanceMeters;

        if (normalizedDuration < minDurationSeconds && normalizedDuration > 0) {
          minDurationSeconds = normalizedDuration;
          bestStart = left;
          bestEnd = right;
        }
      }
    }

    if (minDurationSeconds === Infinity) return null;

    const roundedDuration = Math.round(minDurationSeconds);
    const avgPace = Math.round((roundedDuration / targetDistanceMeters) * 1000);
    const elevDiff = (points[bestEnd].altitude ?? 0) - (points[bestStart].altitude ?? 0);

    return {
      benchmarkName,
      targetDistanceMeters,
      bestDurationSeconds: roundedDuration,
      bestPaceSecKm: avgPace,
      startIndex: bestStart,
      endIndex: bestEnd,
      elevationDiffMeters: Math.round(elevDiff * 10) / 10
    };
  }

  /**
   * Scans an activity for all standard running benchmarks.
   */
  static scanAllRunningRecords(points: RawGpsPoint[]): DetectedPersonalRecord[] {
    const results: DetectedPersonalRecord[] = [];
    for (const b of STANDARD_RUNNING_BENCHMARKS) {
      const pr = this.evaluateFastestSegment(points, b.targetDistanceMeters, b.name);
      if (pr) results.push(pr);
    }
    return results;
  }
}
