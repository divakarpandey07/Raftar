import { MetricArbitrator, StreamEvent } from '../src/wearable/metric-arbitrator';

describe('MetricArbitrator (Metric-Specific Source Authority & Stream Fallback)', () => {
  let arbitrator: MetricArbitrator;
  let events: StreamEvent[];

  beforeEach(() => {
    arbitrator = new MetricArbitrator();
    events = [];
    arbitrator.subscribe((e) => events.push(e));
  });

  test('elects metric-specific authorities independently (Chest strap for HR, Phone for GPS)', () => {
    const actId = 'act-arbitration-1';
    const now = 1700000000000;

    arbitrator.ingestSample({
      activityId: actId,
      metricType: 'HEART_RATE',
      value: 148,
      unit: 'bpm',
      timestamp: now,
      deviceId: 'galaxy-watch-6',
      deviceName: 'Galaxy Watch 6',
      deviceClass: 'WATCH',
      provider: 'samsung',
      source: 'HEALTH_CONNECT'
    });

    arbitrator.ingestSample({
      activityId: actId,
      metricType: 'GPS_LOCATION',
      value: 19.0760,
      unit: 'deg',
      timestamp: now,
      deviceId: 'galaxy-watch-6',
      deviceName: 'Galaxy Watch 6',
      deviceClass: 'WATCH',
      provider: 'samsung',
      source: 'HEALTH_CONNECT'
    });

    arbitrator.ingestSample({
      activityId: actId,
      metricType: 'HEART_RATE',
      value: 150,
      unit: 'bpm',
      timestamp: now,
      deviceId: 'polar-h10',
      deviceName: 'Polar H10',
      deviceClass: 'CHEST_STRAP',
      provider: 'polar',
      source: 'BLE_STANDARD'
    });

    arbitrator.ingestSample({
      activityId: actId,
      metricType: 'GPS_LOCATION',
      value: 19.0761,
      unit: 'deg',
      timestamp: now,
      deviceId: 'pixel-phone-gnss',
      deviceName: 'Pixel Dual-Band GNSS',
      deviceClass: 'PHONE',
      provider: 'pixel',
      source: 'BLE_STANDARD'
    });

    const primaryHr = arbitrator.getActivePrimaryStream('HEART_RATE');
    expect(primaryHr?.deviceId).toBe('polar-h10');

    const primaryGps = arbitrator.getActivePrimaryStream('GPS_LOCATION');
    expect(primaryGps?.deviceId).toBe('pixel-phone-gnss');
  });

  test('preserves secondary raw samples in provenance store without deletion', () => {
    const actId = 'act-provenance-test';
    const now = 1700000000000;

    const res1 = arbitrator.ingestSample({
      activityId: actId,
      metricType: 'HEART_RATE',
      value: 155,
      unit: 'bpm',
      timestamp: now,
      deviceId: 'polar-h10',
      deviceName: 'Polar H10',
      deviceClass: 'CHEST_STRAP',
      provider: 'polar',
      source: 'BLE_STANDARD'
    });
    expect(res1.canonicalSample).not.toBeNull();
    expect(res1.canonicalSample?.isCanonical).toBe(true);

    const res2 = arbitrator.ingestSample({
      activityId: actId,
      metricType: 'HEART_RATE',
      value: 153,
      unit: 'bpm',
      timestamp: now,
      deviceId: 'galaxy-watch-6',
      deviceName: 'Galaxy Watch 6',
      deviceClass: 'WATCH',
      provider: 'samsung',
      source: 'HEALTH_CONNECT'
    });

    expect(res2.canonicalSample).toBeNull();
    expect(res2.rawSample).toBeDefined();
    expect(res2.rawSample.isCanonical).toBe(false);
    expect(res2.rawSample.isSuppressed).toBe(true);

    const store = arbitrator.getRawProvenanceStore();
    expect(store.length).toBe(2);
  });

  test('seamless fallback to secondary stream when primary strap disconnects', () => {
    const actId = 'act-fallback-test';
    const now = 1700000000000;

    arbitrator.ingestSample({
      activityId: actId,
      metricType: 'HEART_RATE',
      value: 160,
      unit: 'bpm',
      timestamp: now,
      deviceId: 'polar-h10',
      deviceName: 'Polar H10',
      deviceClass: 'CHEST_STRAP',
      provider: 'polar',
      source: 'BLE_STANDARD'
    });

    arbitrator.ingestSample({
      activityId: actId,
      metricType: 'HEART_RATE',
      value: 159,
      unit: 'bpm',
      timestamp: now,
      deviceId: 'galaxy-watch-6',
      deviceName: 'Galaxy Watch 6',
      deviceClass: 'WATCH',
      provider: 'samsung',
      source: 'HEALTH_CONNECT'
    });

    expect(arbitrator.getActivePrimaryStream('HEART_RATE')?.deviceId).toBe('polar-h10');

    arbitrator.handleStreamDisconnect('polar-h10');

    const newPrimary = arbitrator.getActivePrimaryStream('HEART_RATE');
    expect(newPrimary?.deviceId).toBe('galaxy-watch-6');

    const fallbackEvent = events.find((e) => e.type === 'STREAM_DROPOUT_FALLBACK');
    expect(fallbackEvent).toBeDefined();
    expect(fallbackEvent?.message).toContain('seamlessly using Galaxy Watch 6');
  });
});
