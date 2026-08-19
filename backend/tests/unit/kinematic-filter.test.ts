import { evaluateGpsPoint, SPORT_LIMITS } from '../../src/utils/kinematic-filter';

describe('Kinematic Outlier Filter', () => {
  test('accepts valid running telemetry point', () => {
    const p1 = { latitude: 19.0760, longitude: 72.8777, timestamp: 10000, accuracy: 5.0, speed: 3.5 };
    const p2 = { latitude: 19.07603, longitude: 72.8777, timestamp: 11000, accuracy: 4.8, speed: 3.5 };

    const evalRes = evaluateGpsPoint(p2, p1, 'RUNNING');
    expect(evalRes.accepted).toBe(true);
    expect(evalRes.calculatedVelocityMps).toBeLessThan(12.0);
  });

  test('rejects degraded GPS accuracy exceeding threshold', () => {
    const candidate = { latitude: 19.0760, longitude: 72.8777, timestamp: 10000, accuracy: 45.0 };
    const evalRes = evaluateGpsPoint(candidate, undefined, 'RUNNING');
    expect(evalRes.accepted).toBe(false);
    expect(evalRes.reason).toContain('Accuracy degraded');
  });

  test('rejects physically impossible velocity spike in running (>12 m/s)', () => {
    const p1 = { latitude: 19.0760, longitude: 72.8777, timestamp: 10000, accuracy: 5.0, speed: 3.0 };
    // 500m jump in 1 second = 500 m/s
    const p2 = { latitude: 19.0805, longitude: 72.8777, timestamp: 11000, accuracy: 5.0, speed: 3.0 };

    const evalRes = evaluateGpsPoint(p2, p1, 'RUNNING');
    expect(evalRes.accepted).toBe(false);
    expect(evalRes.reason).toContain('Velocity');
  });

  test('accepts high velocity in cycling that would be rejected in running', () => {
    const p1 = { latitude: 19.0760, longitude: 72.8777, timestamp: 10000, accuracy: 5.0, speed: 18.0 };
    // 20 m/s (72 km/h) cycling downhill sprint
    const p2 = { latitude: 19.07618, longitude: 72.8777, timestamp: 11000, accuracy: 5.0, speed: 20.0 };

    const runningEval = evaluateGpsPoint(p2, p1, 'RUNNING');
    const cyclingEval = evaluateGpsPoint(p2, p1, 'CYCLING');

    expect(runningEval.accepted).toBe(false);
    expect(cyclingEval.accepted).toBe(true);
  });
});
