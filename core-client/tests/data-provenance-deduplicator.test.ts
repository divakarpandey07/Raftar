import { DataProvenanceAndDeduplicationEngine, SOURCE_PRIORITY_MAP } from '../src/wearable/data-provenance-deduplicator';
import { VendorCloudAdapter } from '../src/wearable/adapters/vendor-adapters';
import { NormalizedSensorSample } from '../src/types/device.types';

describe('DataProvenanceAndDeduplicationEngine & Vendor Normalization', () => {
  let deduplicator: DataProvenanceAndDeduplicationEngine;

  beforeEach(() => {
    deduplicator = new DataProvenanceAndDeduplicationEngine(2000);
  });

  test('prioritizes direct Live BLE sample over overlapping Health Connect sample', () => {
    const timestamp = 1700000000000;

    const bleSample: NormalizedSensorSample = {
      id: 'ble-hr-1',
      timestamp,
      source: 'BLE_STANDARD',
      deviceId: 'polar-h10',
      deviceName: 'Polar H10',
      heartRate: 152,
      isEstimated: false
    };

    const acceptedBle = deduplicator.processSample(bleSample, 'HEART_RATE', 'polar', 'CHEST_STRAP');
    expect(acceptedBle).not.toBeNull();
    expect(acceptedBle?.value).toBe(152);
    expect(acceptedBle?.source).toBe('BLE_STANDARD');

    const healthConnectSample: NormalizedSensorSample = {
      id: 'hc-hr-1',
      timestamp: timestamp + 500,
      source: 'HEALTH_CONNECT',
      deviceId: 'galaxy-watch',
      deviceName: 'Galaxy Watch 6',
      heartRate: 150,
      isEstimated: false
    };

    const duplicateCheck = deduplicator.processSample(healthConnectSample, 'HEART_RATE', 'samsung', 'WATCH');
    expect(duplicateCheck).toBeNull();
  });

  test('replaces lower-priority background sample when live BLE sample arrives', () => {
    const timestamp = 1700000000000;

    const vendorSample: NormalizedSensorSample = {
      id: 'vendor-hr-1',
      timestamp,
      source: 'VENDOR_ADAPTER',
      deviceId: 'garmin-cloud',
      deviceName: 'Garmin Forerunner',
      heartRate: 145,
      isEstimated: false
    };

    const firstAccepted = deduplicator.processSample(vendorSample, 'HEART_RATE', 'garmin', 'WATCH');
    expect(firstAccepted).not.toBeNull();
    expect(firstAccepted?.source).toBe('VENDOR_ADAPTER');

    const bleSample: NormalizedSensorSample = {
      id: 'ble-hr-2',
      timestamp: timestamp + 200,
      source: 'BLE_STANDARD',
      deviceId: 'garmin-hrm-pro',
      deviceName: 'Garmin HRM-Pro',
      heartRate: 148,
      isEstimated: false
    };

    const higherPrioritySample = deduplicator.processSample(bleSample, 'HEART_RATE', 'garmin', 'CHEST_STRAP');
    expect(higherPrioritySample).not.toBeNull();
    expect(higherPrioritySample?.value).toBe(148);
    expect(higherPrioritySample?.source).toBe('BLE_STANDARD');
  });

  test('normalizes vendor cloud payload into canonical health schema', async () => {
    const adapter = new VendorCloudAdapter({ vendor: 'GARMIN' });
    const device = await adapter.authenticateAndConnect('user-99');
    expect(device.capabilities.heartRate).toBe(true);
    expect(device.capabilities.cyclingPower).toBe(true);

    const normalizedSample = adapter.normalizeVendorHeartRate({
      timestamp: 1700000005000,
      bpm: 164,
      rrMsArray: [840, 850],
      deviceId: 'garmin-edge-840'
    });

    expect(normalizedSample.source).toBe('VENDOR_ADAPTER');
    expect(normalizedSample.heartRate).toBe(164);
    expect(normalizedSample.rrIntervalsMs?.length).toBe(2);
  });
});
