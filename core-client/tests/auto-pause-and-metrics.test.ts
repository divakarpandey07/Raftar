import { AutoPauseEngine } from '../src/tracking/auto-pause-engine';
import { MetricsCalculator } from '../src/processing/metrics-calculator';

describe('Auto-Pause & Metrics Calculator', () => {
  test('AutoPauseEngine triggers pause after consecutive low-speed ticks', () => {
    const engine = new AutoPauseEngine('RUNNING');

    expect(engine.evaluateSpeed(0.2).isAutoPaused).toBe(false);
    expect(engine.evaluateSpeed(0.2).isAutoPaused).toBe(false);
    expect(engine.evaluateSpeed(0.2).isAutoPaused).toBe(false);
    // 4th consecutive tick below 0.6 m/s
    const fourth = engine.evaluateSpeed(0.2);
    expect(fourth.isAutoPaused).toBe(true);
    expect(fourth.stateChanged).toBe(true);

    // Resumes after 2 ticks above 0.8 m/s
    expect(engine.evaluateSpeed(2.5).isAutoPaused).toBe(true);
    const resume = engine.evaluateSpeed(2.5);
    expect(resume.isAutoPaused).toBe(false);
    expect(resume.stateChanged).toBe(true);
  });

  test('MetricsCalculator computes split when crossing 1km distance threshold', () => {
    const calc = new MetricsCalculator('act-split-test', 1000000, 1000);
    const baseLat = 19.0760;

    let splitTriggered = null;

    for (let i = 0; i <= 12; i++) {
      const p = {
        localActivityId: 'act-split-test',
        pointIndex: i,
        latitude: baseLat + (i * 0.0009), // ~100m steps
        longitude: 72.8777,
        altitude: 10 + i,
        accuracy: 4.5,
        speed: 3.0,
        timestamp: 1000000 + (i * 30 * 1000), // 30s steps
        isEstimated: false
      };

      const prev = i > 0 ? {
        localActivityId: 'act-split-test',
        pointIndex: i - 1,
        latitude: baseLat + ((i - 1) * 0.0009),
        longitude: 72.8777,
        altitude: 10 + (i - 1),
        accuracy: 4.5,
        speed: 3.0,
        timestamp: 1000000 + ((i - 1) * 30 * 1000),
        isEstimated: false
      } : undefined;

      const res = calc.processNewPoint(p, prev, true);
      if (res.triggeredSplit) {
        splitTriggered = res.triggeredSplit;
      }
    }

    expect(splitTriggered).not.toBeNull();
    expect(splitTriggered!.splitNumber).toBe(1);
    expect(splitTriggered!.distanceMeters).toBeGreaterThanOrEqual(950);
  });
});
