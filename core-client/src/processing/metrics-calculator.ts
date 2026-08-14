import { LocalActivityMetrics, LocalSplit, RawGpsPoint } from '../types';
import { calculateHaversineMeters } from './kinematic-validator';

export class MetricsCalculator {
  private metrics: LocalActivityMetrics;
  private currentSplitDistance = 0;
  private currentSplitStartTime: number;
  private currentSplitStartAlt: number;
  private splitIndex = 1;
  private recentPointsWindow: RawGpsPoint[] = [];
  private readonly splitDistanceMeters: number;
  private readonly maxHr: number;

  constructor(
    localActivityId: string,
    startTime: number,
    splitDistanceMeters: number = 1000,
    maxHr: number = 190
  ) {
    this.splitDistanceMeters = splitDistanceMeters;
    this.maxHr = maxHr;
    this.currentSplitStartTime = startTime;
    this.currentSplitStartAlt = 0;

    this.metrics = {
      localActivityId,
      elapsedSeconds: 0,
      movingSeconds: 0,
      distanceMeters: 0,
      avgSpeedMps: 0,
      maxSpeedMps: 0,
      avgPaceSecKm: 0,
      currentPaceSecKm: 0,
      elevationGainMeters: 0,
      elevationLossMeters: 0,
      calories: 0,
      avgHr: 0,
      maxHr: 0,
      tssScore: 0,
      hrZone1Seconds: 0,
      hrZone2Seconds: 0,
      hrZone3Seconds: 0,
      hrZone4Seconds: 0,
      hrZone5Seconds: 0
    };
  }

  processNewPoint(
    point: RawGpsPoint,
    previousPoint?: RawGpsPoint,
    isMoving: boolean = true
  ): { metrics: LocalActivityMetrics; triggeredSplit: LocalSplit | null } {
    let triggeredSplit: LocalSplit | null = null;

    if (previousPoint) {
      const dist = calculateHaversineMeters(previousPoint, point);
      const deltaT = (point.timestamp - previousPoint.timestamp) / 1000;

      // 1. Distance & Moving Time Accumulator
      if (isMoving && deltaT > 0) {
        this.metrics.distanceMeters += dist;
        this.metrics.movingSeconds += Math.round(deltaT);
        this.currentSplitDistance += dist;

        // Instant & Max Speed
        const speed = dist / deltaT;
        if (speed > this.metrics.maxSpeedMps && speed < 35.0) {
          this.metrics.maxSpeedMps = Math.round(speed * 100) / 100;
        }

        // 2. Rolling Pace Window (last 5 samples)
        this.recentPointsWindow.push(point);
        if (this.recentPointsWindow.length > 5) this.recentPointsWindow.shift();

        if (this.recentPointsWindow.length >= 2) {
          const windowFirst = this.recentPointsWindow[0];
          const windowLast = this.recentPointsWindow[this.recentPointsWindow.length - 1];
          const windowDist = calculateHaversineMeters(windowFirst, windowLast);
          const windowTime = (windowLast.timestamp - windowFirst.timestamp) / 1000;

          if (windowDist > 5 && windowTime > 0) {
            const rollingSpeed = windowDist / windowTime;
            this.metrics.currentPaceSecKm = Math.round(1000 / rollingSpeed);
          }
        }
      }

      // 3. Filtered Elevation Profiling
      if (point.altitude !== undefined && previousPoint.altitude !== undefined) {
        const altDiff = point.altitude - previousPoint.altitude;
        if (Math.abs(altDiff) >= 1.5) { // Elevation noise gate
          if (altDiff > 0) this.metrics.elevationGainMeters += altDiff;
          else this.metrics.elevationLossMeters += Math.abs(altDiff);
        }
      }

      // 4. Heart Rate & Intensity Zones
      if (point.heartRate) {
        const hr = point.heartRate;
        if (this.metrics.avgHr === 0) this.metrics.avgHr = hr;
        else this.metrics.avgHr = Math.round((this.metrics.avgHr * 0.95) + (hr * 0.05));

        if (hr > this.metrics.maxHr) this.metrics.maxHr = hr;

        // Zones
        const hrPct = (hr / this.maxHr) * 100;
        const dt = Math.round(deltaT);
        if (hrPct < 60) this.metrics.hrZone1Seconds += dt;
        else if (hrPct < 70) this.metrics.hrZone2Seconds += dt;
        else if (hrPct < 80) this.metrics.hrZone3Seconds += dt;
        else if (hrPct < 90) this.metrics.hrZone4Seconds += dt;
        else this.metrics.hrZone5Seconds += dt;
      }
    } else {
      this.currentSplitStartAlt = point.altitude ?? 0;
    }

    // Overall Averages
    if (this.metrics.movingSeconds > 0) {
      this.metrics.avgSpeedMps = Math.round((this.metrics.distanceMeters / this.metrics.movingSeconds) * 100) / 100;
      if (this.metrics.distanceMeters > 0) {
        this.metrics.avgPaceSecKm = Math.round((this.metrics.movingSeconds / this.metrics.distanceMeters) * 1000);
      }
    }

    // Calories: Standard MET formulation (~1 kcal per kg per km)
    this.metrics.calories = Math.round((this.metrics.distanceMeters / 1000) * 65);

    // Training Stress Score (TSS) formula
    const intensityFactor = this.metrics.avgHr > 0 ? (this.metrics.avgHr / this.maxHr) : 0.7;
    const durationHours = this.metrics.movingSeconds / 3600;
    this.metrics.tssScore = Math.round(durationHours * Math.pow(intensityFactor, 2) * 100);

    // 5. Split Interval Trigger
    if (this.currentSplitDistance >= this.splitDistanceMeters) {
      const splitDuration = Math.max(1, Math.round((point.timestamp - this.currentSplitStartTime) / 1000));
      const splitPace = Math.round((splitDuration / this.currentSplitDistance) * 1000);
      const splitElev = (point.altitude ?? 0) - this.currentSplitStartAlt;

      triggeredSplit = {
        localActivityId: this.metrics.localActivityId,
        splitNumber: this.splitIndex++,
        distanceMeters: Math.round(this.currentSplitDistance),
        durationSeconds: splitDuration,
        avgPaceSecKm: splitPace,
        elevationDiff: Math.round(splitElev * 10) / 10,
        avgHeartRate: point.heartRate
      };

      this.currentSplitDistance = 0;
      this.currentSplitStartTime = point.timestamp;
      this.currentSplitStartAlt = point.altitude ?? 0;
    }

    return { metrics: { ...this.metrics }, triggeredSplit };
  }

  tickClock(elapsedSeconds: number): LocalActivityMetrics {
    this.metrics.elapsedSeconds = elapsedSeconds;
    return { ...this.metrics };
  }

  getMetrics(): LocalActivityMetrics {
    return { ...this.metrics };
  }

  setHydratedMetrics(metrics: LocalActivityMetrics, splitCount: number): void {
    this.metrics = { ...metrics };
    this.splitIndex = splitCount + 1;
  }
}
