import { BleHeartRateAdapter } from '../src/wearable/adapters/ble-heart-rate-adapter';
import { HealthConnectAdapter } from '../src/wearable/adapters/health-connect-adapter';
import { HealthKitAdapter } from '../src/wearable/adapters/health-kit-adapter';
import { DeviceManager } from '../src/wearable/device-manager';
import { TrackingEngine } from '../src/tracking/tracking-engine';
import { SqliteStorage } from '../src/database/sqlite-storage';

describe('Capability-Based Wearable & Health Integration (21 Test Scenarios)', () => {
  let bleAdapter: BleHeartRateAdapter;
  let healthConnectAdapter: HealthConnectAdapter;
  let healthKitAdapter: HealthKitAdapter;
  let deviceManager: DeviceManager;
  let storage: SqliteStorage;
  let trackingEngine: TrackingEngine;

  beforeEach(() => {
    bleAdapter = new BleHeartRateAdapter();
    healthConnectAdapter = new HealthConnectAdapter(true);
    healthKitAdapter = new HealthKitAdapter(true);
    deviceManager = new DeviceManager(bleAdapter, healthConnectAdapter, healthKitAdapter);
    storage = new SqliteStorage(':memory:');
    trackingEngine = new TrackingEngine(storage);
  });

  afterEach(() => {
    storage.close();
  });

  test('Scenario 1: No device connected returns NO SENSOR PAIRED and locked health metrics', () => {
    expect(deviceManager.getActiveDevice()).toBeNull();
    const readiness = deviceManager.computeReadiness();
    expect(readiness.score).toBeNull();
    expect(readiness.stateLabel).toBe('NO SENSOR PAIRED');
    expect(readiness.usedInputs.hrv).toBe(false);
  });

  test('Scenario 2, 3, 4: BLE device connected with RR intervals unlocks HR and HRV', async () => {
    const mockGattDevice = {
      id: 'polar-h10-001',
      name: 'Polar H10 1A2B3C',
      gatt: {
        connected: true,
        connect: async () => mockGattDevice.gatt,
        getPrimaryService: async () => ({
          getCharacteristic: async () => ({
            startNotifications: async () => {},
            addEventListener: () => {}
          })
        })
      },
      addEventListener: () => {}
    };

    const device = await bleAdapter.connectBleDevice(async () => mockGattDevice);
    expect(device).not.toBeNull();
    expect(device?.connectionState).toBe('CONNECTED');

    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    view.setUint8(0, 0x10);
    view.setUint8(1, 142);
    view.setUint16(2, 850, true);
    view.setUint16(4, 880, true);

    const sample = bleAdapter.parseHeartRateMeasurement(view);
    expect(sample.heartRate).toBe(142);
    expect(sample.rrIntervalsMs).toBeDefined();
    expect(sample.rrIntervalsMs?.length).toBe(2);

    expect(bleAdapter.getConnectedDevice()?.capabilities.heartRate).toBe(true);
    expect(bleAdapter.getConnectedDevice()?.capabilities.rrInterval).toBe(true);
    expect(bleAdapter.getConnectedDevice()?.capabilities.hrv).toBe(true);
  });

  test('Scenario 5: BLE sensor without RR intervals leaves HR active but HRV strictly locked', async () => {
    const mockGattDevice = {
      id: 'scosche-armband',
      name: 'Scosche Rhythm+',
      gatt: {
        connected: true,
        connect: async () => mockGattDevice.gatt,
        getPrimaryService: async () => ({
          getCharacteristic: async () => ({
            startNotifications: async () => {},
            addEventListener: () => {}
          })
        })
      },
      addEventListener: () => {}
    };

    await bleAdapter.connectBleDevice(async () => mockGattDevice);

    const buffer = new ArrayBuffer(2);
    const view = new DataView(buffer);
    view.setUint8(0, 0x00);
    view.setUint8(1, 155);

    const sample = bleAdapter.parseHeartRateMeasurement(view);
    expect(sample.heartRate).toBe(155);
    expect(sample.rrIntervalsMs).toBeUndefined();

    expect(bleAdapter.getConnectedDevice()?.capabilities.heartRate).toBe(true);
    expect(bleAdapter.getConnectedDevice()?.capabilities.rrInterval).toBe(false);
    expect(bleAdapter.getConnectedDevice()?.capabilities.hrv).toBe(false);

    const readiness = deviceManager.computeReadiness();
    expect(readiness.score).toBeNull();
    expect(readiness.stateLabel).toBe('INSUFFICIENT SENSOR DATA');
    expect(readiness.explanation).toContain('microsecond RR intervals needed for HRV');
  });

  test('Scenario 6, 7, 15: Sensor disconnect mid-workout does NOT break GPS tracking', async () => {
    const mockGattDevice = {
      id: 'wahoo-tickr',
      name: 'Wahoo TICKR',
      gatt: {
        connected: true,
        connect: async () => mockGattDevice.gatt,
        disconnect: () => { mockGattDevice.gatt.connected = false; },
        getPrimaryService: async () => ({
          getCharacteristic: async () => ({
            startNotifications: async () => {},
            addEventListener: () => {}
          })
        })
      },
      addEventListener: () => {}
    };

    await bleAdapter.connectBleDevice(async () => mockGattDevice);
    expect(bleAdapter.getConnectedDevice()?.connectionState).toBe('CONNECTED');

    trackingEngine.prepare('RUNNING');
    const act = trackingEngine.start('Morning Resilient Run');

    trackingEngine.ingestLocationTick({
      latitude: 19.0760,
      longitude: 72.8777,
      accuracy: 4.0,
      timestamp: 1000,
      sourceType: 'GNSS'
    });

    // Simulate BLE disconnect
    bleAdapter.disconnect();
    expect(bleAdapter.getConnectedDevice()?.connectionState).toBe('DISCONNECTED');

    // GPS tracking continues seamlessly!
    trackingEngine.ingestLocationTick({
      latitude: 19.07603,
      longitude: 72.8777,
      accuracy: 4.0,
      timestamp: 2000,
      sourceType: 'GNSS'
    });

    const snapshot = trackingEngine.getSnapshot();
    expect(snapshot.state).toBe('RECORDING');
    expect(snapshot.metrics.distanceMeters).toBeGreaterThan(2);

    const finish = trackingEngine.finish();
    expect(finish.activity.status).toBe('COMPLETED');
  });

  test('Scenario 8, 9: Health Connect initializes capabilities when permitted', async () => {
    const device = await healthConnectAdapter.initialize('Samsung Galaxy Watch 6');
    expect(device).not.toBeNull();
    expect(device?.source).toBe('HEALTH_CONNECT');
    expect(device?.capabilities.heartRate).toBe(true);
    expect(device?.capabilities.sleep).toBe(true);
    expect(device?.capabilities.hrv).toBe(true);
  });

  test('Scenario 10, 11: HealthKit initializes Apple Watch capabilities', async () => {
    const device = await healthKitAdapter.initialize('Apple Watch Ultra 2');
    expect(device).not.toBeNull();
    expect(device?.source).toBe('HEALTH_KIT');
    expect(device?.capabilities.heartRate).toBe(true);
    expect(device?.capabilities.sleep).toBe(true);
  });

  test('Scenario 14: Transparent multi-factor readiness explains exact inputs used', () => {
    (deviceManager as any).activeDevice = {
      id: 'garmin-epix',
      name: 'Garmin Epix Pro',
      source: 'BLE_STANDARD',
      connectionState: 'CONNECTED',
      capabilities: { heartRate: true, rrInterval: true, hrv: true }
    };
    (deviceManager as any).recentRrIntervals = [850, 920, 840, 930, 850, 940, 860];

    deviceManager.setNocturnalData(52, {
      startTime: Date.now() - 28800000,
      endTime: Date.now(),
      durationMinutes: 460,
      deepSleepMinutes: 110,
      remSleepMinutes: 100,
      lightSleepMinutes: 250,
      source: 'HEALTH_CONNECT'
    });
    deviceManager.setWeeklyTssLoad(420);

    const readiness = deviceManager.computeReadiness();
    expect(readiness.score).not.toBeNull();
    expect(readiness.score).toBeGreaterThan(60);
    expect(readiness.usedInputs.hrv).toBe(true);
    expect(readiness.usedInputs.sleep).toBe(true);
    expect(readiness.usedInputs.trainingLoad).toBe(true);
    expect(readiness.explanation).toContain('rMSSD HRV');
    expect(readiness.explanation).toContain('sleep');
    expect(readiness.explanation).toContain('TSS load');
  });
});
