import { GpsStateMachine, LocationReading } from '../src/location/gps-state-machine';

describe('GPS Signal Loss, Dead-Reckoning & Reacquisition State Machine', () => {
  test('1. Full Lifecycle: INITIALIZING -> TRACKING -> GPS_LOST -> SENSOR_ESTIMATION -> GPS_REACQUIRED', () => {
    const sm = new GpsStateMachine('RUNNING');
    expect(sm.getState()).toBe('INITIALIZING');

    // High confidence reading
    const read1: LocationReading = {
      latitude: 18.9430,
      longitude: 72.8230,
      accuracyMeters: 4.5,
      timestamp: 1000
    };
    const res1 = sm.processReading(read1);
    expect(res1.state).toBe('TRACKING');
    expect(res1.point?.trackingMode).toBe('GNSS_HIGH_CONFIDENCE');
    expect(res1.point?.confidenceScore).toBe(0.98);

    // 3 consecutive bad/lost readings (> 30m accuracy)
    sm.processReading({ latitude: 18.9430, longitude: 72.8230, accuracyMeters: 45.0, timestamp: 2000 });
    sm.processReading({ latitude: 18.9430, longitude: 72.8230, accuracyMeters: 55.0, timestamp: 3000 });
    const resLost = sm.processReading({ latitude: 18.9430, longitude: 72.8230, accuracyMeters: 60.0, timestamp: 4000 });
    expect(resLost.state).toBe('GPS_LOST');
    expect(resLost.rejectionReason).toBe('DEGRADED_ACCURACY');

    // Running Dead Reckoning estimation
    const deadReckoned = sm.estimateDeadReckoning(15, {
      cadenceRpm: 160,
      headingDegrees: 90
    });
    expect(deadReckoned).toBeDefined();
    expect(deadReckoned?.trackingMode).toBe('SENSOR_ESTIMATED');
    expect(deadReckoned?.estimatedErrorMeters).toBeGreaterThan(15);
    expect(deadReckoned?.confidenceScore).toBeLessThan(0.9);
    expect(sm.getState()).toBe('SENSOR_ESTIMATION');

    // GNSS Signal Reacquired
    const readReacquired: LocationReading = {
      latitude: 18.9430,
      longitude: 72.8238,
      accuracyMeters: 5.0,
      timestamp: 20000
    };
    const resReacquired = sm.processReading(readReacquired);
    expect(resReacquired.state).toBe('GPS_REACQUIRED');
    expect(resReacquired.reconciliationPerformed).toBe(true);
    expect(resReacquired.point?.isReconciled).toBe(true);
  });

  test('2. Anti-Teleportation & Structured Rejection Reasons', () => {
    const sm = new GpsStateMachine('RUNNING');
    sm.processReading({ latitude: 18.9430, longitude: 72.8230, accuracyMeters: 5.0, timestamp: 1000 });

    // 5 km jump in 1 second
    const glitchReading: LocationReading = {
      latitude: 18.9900,
      longitude: 72.8800,
      accuracyMeters: 5.0,
      timestamp: 2000
    };
    const glitchRes = sm.processReading(glitchReading);
    expect(glitchRes.point).toBeNull();
    expect(glitchRes.rejectionReason).toBe('INSTANTANEOUS_TELEPORTATION');

    // Impossible running speed (100m in 1s = 100 m/s > 12.5 m/s)
    const speedReading: LocationReading = {
      latitude: 18.9439,
      longitude: 72.8230,
      accuracyMeters: 5.0,
      timestamp: 2000
    };
    const speedRes = sm.processReading(speedReading);
    expect(speedRes.point).toBeNull();
    expect(speedRes.rejectionReason).toBe('IMPOSSIBLE_VELOCITY');
  });

  test('3. Cycling Dead Reckoning: Uses wheel speed sensor evidence', () => {
    const bikeSm = new GpsStateMachine('CYCLING');
    bikeSm.processReading({ latitude: 18.9430, longitude: 72.8230, accuracyMeters: 5.0, timestamp: 1000 });

    const bikeDeadReckoned = bikeSm.estimateDeadReckoning(10, {
      wheelSpeedMps: 8.5, // 30.6 km/h
      headingDegrees: 180
    });

    expect(bikeDeadReckoned).toBeDefined();
    expect(bikeDeadReckoned?.trackingMode).toBe('SENSOR_ESTIMATED');
  });
});
