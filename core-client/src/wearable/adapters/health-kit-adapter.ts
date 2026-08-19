import { ConnectedDevice, DeviceCapabilities, NormalizedSensorSample } from '../../types/device.types';

export interface HealthKitPermissions {
  readHeartRate: boolean;
  readHrv: boolean;
  readRestingHeartRate: boolean;
  readSleep: boolean;
  readWorkouts: boolean;
}

export class HealthKitAdapter {
  private isAvailable: boolean = false;
  private currentDevice: ConnectedDevice | null = null;

  constructor(isAvailableOverride: boolean = false) {
    this.isAvailable = isAvailableOverride;
  }

  isPlatformSupported(): boolean {
    return this.isAvailable;
  }

  async checkPermissions(): Promise<HealthKitPermissions> {
    if (!this.isPlatformSupported()) {
      return {
        readHeartRate: false,
        readHrv: false,
        readRestingHeartRate: false,
        readSleep: false,
        readWorkouts: false
      };
    }

    return {
      readHeartRate: true,
      readHrv: true,
      readRestingHeartRate: true,
      readSleep: true,
      readWorkouts: true
    };
  }

  async initialize(deviceName: string = 'Apple HealthKit (Apple Watch)'): Promise<ConnectedDevice | null> {
    if (!this.isPlatformSupported()) {
      return null;
    }

    const perms = await this.checkPermissions();

    const capabilities: DeviceCapabilities = {
      heartRate: perms.readHeartRate,
      rrInterval: perms.readHrv,
      hrv: perms.readHrv,
      restingHeartRate: perms.readRestingHeartRate,
      sleep: perms.readSleep,
      steps: true,
      calories: true,
      gps: perms.readWorkouts,
      elevation: perms.readWorkouts,
      cadence: false,
      cyclingSpeed: false,
      cyclingPower: false,
      temperature: false
    };

    this.currentDevice = {
      id: 'apple-healthkit-root',
      name: deviceName,
      source: 'HEALTH_KIT',
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
