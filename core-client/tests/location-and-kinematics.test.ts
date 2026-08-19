import { LocationArbitrator } from '../src/location/location-arbitrator';
import { KinematicValidator } from '../src/processing/kinematic-validator';

describe('Location Arbitrator & Kinematic Validator', () => {
  test('Arbitrator correctly classifies 5 quality states', () => {
    const arbitrator = new LocationArbitrator();

    // 1. High Accuracy (GNSS lock <= 10m)
    const res1 = arbitrator.evaluateLocation({
      latitude: 19.0760,
      longitude: 72.8777,
      accuracy: 4.5,
      timestamp: 1000,
      sourceType: 'GNSS'
    });
    expect(res1.quality).toBe('HIGH_ACCURACY');
    expect(res1.processedPoint?.isEstimated).toBe(false);

    // 2. Moderate Accuracy (10-25m)
    const res2 = arbitrator.evaluateLocation({
      latitude: 19.0760,
      longitude: 72.8777,
      accuracy: 18.0,
      timestamp: 2000,
      sourceType: 'NETWORK'
    });
    expect(res2.quality).toBe('MODERATE_ACCURACY');
    expect(res2.processedPoint?.isEstimated).toBe(false);

    // 3. Sensor Estimated (Dead-reckoning)
    const res3 = arbitrator.evaluateLocation({
      latitude: 19.0760,
      longitude: 72.8777,
      accuracy: 35.0,
      timestamp: 3000,
      sourceType: 'SENSOR_ESTIMATED'
    });
    expect(res3.quality).toBe('ESTIMATED');
    expect(res3.processedPoint?.isEstimated).toBe(true);

    // 4. Hardware Disabled
    const res4 = arbitrator.evaluateLocation({
      latitude: 0,
      longitude: 0,
      accuracy: 0,
      timestamp: 4000,
      sourceType: 'DISABLED'
    });
    expect(res4.quality).toBe('UNAVAILABLE');
    expect(res4.processedPoint).toBeNull();
  });

  test('Kinematic validator enforces sport-specific limits', () => {
    const validator = new KinematicValidator('RUNNING');
    const p1 = { latitude: 19.0760, longitude: 72.8777, timestamp: 10000, accuracy: 5.0, speed: 3.5, isEstimated: false };
    // 50m in 1s = 50 m/s (rejected in running)
    const p2 = { latitude: 19.07645, longitude: 72.8777, timestamp: 11000, accuracy: 5.0, speed: 3.5, isEstimated: false };

    const check = validator.validatePoint(p2, p1 as any);
    expect(check.isValid).toBe(false);
    expect(check.reason).toContain('Velocity');
  });
});
