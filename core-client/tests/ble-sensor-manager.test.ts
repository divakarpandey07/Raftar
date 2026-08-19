import { BleSensorManager } from '../src/wearable/ble-sensor-manager';

describe('BleSensorManager (Wearable & HRV Engine)', () => {
  let manager: BleSensorManager;

  beforeEach(() => {
    manager = new BleSensorManager();
  });

  test('returns NO SENSOR PAIRED and null score when disconnected', () => {
    const readiness = manager.computeReadinessScore();
    expect(readiness.score).toBeNull();
    expect(readiness.stateLabel).toBe('NO SENSOR PAIRED');
    expect(readiness.advice).toContain('Pair a Bluetooth Smartwatch');
  });

  test('calculates accurate rMSSD HRV and readiness score from real RR intervals', () => {
    // Inject synthetic private RR intervals via prototype test reflection
    (manager as any).status = 'CONNECTED';
    (manager as any).recentRrIntervals = [850, 890, 840, 880, 860, 900, 850];

    const rmssd = manager.calculateHrvRmssd();
    expect(rmssd).not.toBeNull();
    expect(rmssd).toBeGreaterThan(30);

    const readiness = manager.computeReadinessScore();
    expect(readiness.score).not.toBeNull();
    expect(readiness.score).toBeGreaterThan(40);
    expect(readiness.stateLabel).toBeDefined();
  });
});
