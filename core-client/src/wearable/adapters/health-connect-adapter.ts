import { ConnectedDevice, DeviceCapabilities, NormalizedSensorSample, NormalizedSleepRecord } from '../../types/device.types';

export interface HealthConnectPermissions {
  readHeartRate: boolean;
  readHeartRateVariability: boolean;
  readRestingHeartRate: boolean;
  readSleep: boolean;
  readSteps: boolean;
}

export class HealthConnectAdapter {
  private isAvailable: boolean = false;
  private currentDevice: ConnectedDevice | null = null;

  constructor(isAvailableOverride: boolean = false) {
    this.isAvailable = isAvailableOverride;
  }

  isPlatformSupported(): boolean {
    return this.isAvailable;
  }

  async checkPermissions(): Promise<HealthConnectPermissions> {
    if (!this.isPlatformSupported()) {
      return {
        readHeartRate: false,
        readHeartRateVariability: false,
        readRestingHeartRate: false,
        readSleep: false,
        readSteps: false
      };
    }

    return {
      readHeartRate: true,
      readHeartRateVariability: true,
      readRestingHeartRate: true,
      readSleep: true,
      readSteps: true
    };
  }

  async initialize(deviceName: string = 'Android Health Connect (Galaxy/Pixel Watch)'): Promise<ConnectedDevice | null> {
    if (!this.isPlatformSupported()) {
      return null;
    }

    const perms = await this.checkPermissions();

    const capabilities: DeviceCapabilities = {
      heartRate: perms.readHeartRate,
      rrInterval: perms.readHeartRateVariability,
      hrv: perms.readHeartRateVariability,
      restingHeartRate: perms.readRestingHeartRate,
      sleep: perms.readSleep,
      steps: perms.readSteps,
      calories: true,
      gps: false,
      elevation: false,
      cadence: false,
      cyclingSpeed: false,
      cyclingPower: false,
      temperature: false
    };

    this.currentDevice = {
      id: 'health-connect-root',
      name: deviceName,
      source: 'HEALTH_CONNECT',
      connectionState: 'CONNECTED',
      capabilities,
      lastDataTimestamp: Date.now()
    };

    return this.currentDevice;
  }

  getConnectedDevice(): ConnectedDevice | null {
    return this.currentDevice;
  }
}
