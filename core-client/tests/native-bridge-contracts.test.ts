import { NativeBridgeAdapter } from '../src/native/native-bridge-adapter';
import { RawGpsPoint } from '../src/types';

describe('Phase 18: Native Mobile OS Bridges & Hardware Lifecycle Specs', () => {
  test('1. Lifecycle Commands: Controls native foreground service state transitions', async () => {
    const adapter = new NativeBridgeAdapter('ANDROID');
    expect(adapter.getServiceState()).toBe('STOPPED');

    const startRes = await adapter.sendCommand({
      commandId: 'cmd-1',
      action: 'START_FOREGROUND_TRACKING',
      sportType: 'RUNNING',
      activityTitle: 'Morning 10k Run'
    });

    expect(startRes.success).toBe(true);
    expect(adapter.getServiceState()).toBe('RUNNING');

    const pauseRes = await adapter.sendCommand({
      commandId: 'cmd-2',
      action: 'PAUSE_TRACKING'
    });
    expect(pauseRes.success).toBe(true);
    expect(adapter.getServiceState()).toBe('PAUSED');

    const resumeRes = await adapter.sendCommand({
      commandId: 'cmd-3',
      action: 'RESUME_TRACKING'
    });
    expect(resumeRes.success).toBe(true);
    expect(adapter.getServiceState()).toBe('RUNNING');

    const stopRes = await adapter.sendCommand({
      commandId: 'cmd-4',
      action: 'STOP_FOREGROUND_TRACKING'
    });
    expect(stopRes.success).toBe(true);
    expect(adapter.getServiceState()).toBe('STOPPED');
  });

  test('2. Location Event Serialization: Dispatches native GPS events to subscribed JS listeners', () => {
    const adapter = new NativeBridgeAdapter('ANDROID');
    const receivedPoints: RawGpsPoint[] = [];

    const unsubscribe = adapter.onLocationReceived((pt) => {
      receivedPoints.push(pt);
    });

    adapter.dispatchNativeLocation(
      {
        latitude: 18.94302,
        longitude: 72.82301,
        altitudeMeters: 12.5,
        accuracyMeters: 4.2,
        speedMps: 3.65,
        bearingDegrees: 180,
        timestamp: 1724000000000,
        isMocked: false
      },
      'act-native-1',
      0
    );

    expect(receivedPoints.length).toBe(1);
    expect(receivedPoints[0].latitude).toBe(18.94302);
    expect(receivedPoints[0].speed).toBe(3.65);
    expect(receivedPoints[0].isEstimated).toBe(false);

    unsubscribe();
    adapter.dispatchNativeLocation(
      {
        latitude: 18.94402,
        longitude: 72.82401,
        accuracyMeters: 5.0,
        timestamp: 1724000001000,
        isMocked: false
      },
      'act-native-1',
      1
    );

    // After unsubscribe, no new points added
    expect(receivedPoints.length).toBe(1);
  });

  test('3. Health Connect / HealthKit Payload Formatting: Formats type-safe export payload', () => {
    const adapter = new NativeBridgeAdapter('ANDROID');
    const payload = adapter.formatHealthSyncPayload(
      'act-marine-drive',
      'RUNNING',
      1724000000000,
      1724003600000,
      10250.4,
      680.5,
      156.4,
      175.0,
      [
        { latitude: 18.94302, longitude: 72.82301, timestamp: 1724000000000 },
        { latitude: 18.95302, longitude: 72.83301, timestamp: 1724003600000 }
      ]
    );

    expect(payload.distanceMeters).toBe(10250);
    expect(payload.activeCaloriesBurned).toBe(681);
    expect(payload.averageHeartRate).toBe(156);
    expect(payload.routeCoordinates.length).toBe(2);
  });
});
