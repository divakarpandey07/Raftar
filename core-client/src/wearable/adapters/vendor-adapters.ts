import { ConnectedDevice, DeviceCapabilities, NormalizedSensorSample, NormalizedSleepRecord } from '../../types/device.types';

export interface VendorCloudConfig {
  vendor: 'GARMIN' | 'ZEPP_AMAZFIT' | 'HUAWEI' | 'FITBIT';
  apiKey?: string;
  accessToken?: string;
}

export class VendorCloudAdapter {
  private config: VendorCloudConfig;
  private currentDevice: ConnectedDevice | null = null;

  constructor(config: VendorCloudConfig) {
    this.config = config;
  }

  getVendor(): string {
    return this.config.vendor;
  }

  async authenticateAndConnect(userId: string): Promise<ConnectedDevice> {
    const capabilities: DeviceCapabilities = {
      heartRate: true,
      rrInterval: this.config.vendor === 'GARMIN' || this.config.vendor === 'ZEPP_AMAZFIT',
      hrv: this.config.vendor === 'GARMIN' || this.config.vendor === 'ZEPP_AMAZFIT',
      restingHeartRate: true,
      sleep: true,
      steps: true,
      calories: true,
      gps: true,
      elevation: true,
      cadence: true,
      cyclingSpeed: true,
      cyclingPower: this.config.vendor === 'GARMIN',
      temperature: false
    };

    this.currentDevice = {
      id: `${this.config.vendor.toLowerCase()}-cloud-${userId}`,
      name: `${this.config.vendor} Cloud Integration`,
      source: 'VENDOR_ADAPTER',
      connectionState: 'CONNECTED',
      capabilities,
      lastDataTimestamp: Date.now()
    };

    return this.currentDevice;
  }

  normalizeVendorHeartRate(vendorPayload: {
    timestamp: number;
    bpm: number;
    rrMsArray?: number[];
    deviceId: string;
  }): NormalizedSensorSample {
    return {
      id: `sample-${this.config.vendor}-${vendorPayload.timestamp}`,
      timestamp: vendorPayload.timestamp,
      source: 'VENDOR_ADAPTER',
      deviceId: vendorPayload.deviceId,
      deviceName: `${this.config.vendor} Device`,
      heartRate: vendorPayload.bpm,
      rrIntervalsMs: vendorPayload.rrMsArray,
      isEstimated: false
    };
  }

  normalizeVendorSleep(vendorPayload: {
    startTime: number;
    endTime: number;
    deepMinutes: number;
    remMinutes: number;
    lightMinutes: number;
  }): NormalizedSleepRecord {
    return {
      startTime: vendorPayload.startTime,
      endTime: vendorPayload.endTime,
      durationMinutes: Math.round((vendorPayload.endTime - vendorPayload.startTime) / 60000),
      deepSleepMinutes: vendorPayload.deepMinutes,
      remSleepMinutes: vendorPayload.remMinutes,
      lightSleepMinutes: vendorPayload.lightMinutes,
      source: 'VENDOR_ADAPTER'
    };
  }

  getConnectedDevice(): ConnectedDevice | null {
    return this.currentDevice;
  }
}
