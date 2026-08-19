import { ConnectedDevice, DeviceCapabilities, NormalizedSensorSample } from '../../types/device.types';

export type SensorSampleCallback = (sample: NormalizedSensorSample) => void;
export type DeviceStateCallback = (device: ConnectedDevice) => void;

export class BleHeartRateAdapter {
  private device: any = null;
  private server: any = null;
  private hrCharacteristic: any = null;
  private currentDevice: ConnectedDevice | null = null;
  private onSampleCallbacks: Set<SensorSampleCallback> = new Set();
  private onStateCallbacks: Set<DeviceStateCallback> = new Set();

  getConnectedDevice(): ConnectedDevice | null {
    return this.currentDevice;
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async connectBleDevice(customRequestDeviceFn?: () => Promise<any>): Promise<ConnectedDevice | null> {
    if (!this.isSupported() && !customRequestDeviceFn) {
      return null;
    }

    try {
      this.device = customRequestDeviceFn
        ? await customRequestDeviceFn()
        : await (navigator as any).bluetooth.requestDevice({
            filters: [{ services: ['heart_rate'] }],
            optionalServices: ['battery_service', 'device_information']
          });

      const initialCapabilities: DeviceCapabilities = {
        heartRate: true,
        rrInterval: false, // Initially false until verified by characteristic flags
        hrv: false,
        restingHeartRate: false,
        sleep: false,
        steps: false,
        calories: false,
        gps: false,
        elevation: false,
        cadence: false,
        cyclingSpeed: false,
        cyclingPower: false,
        temperature: false
      };

      this.currentDevice = {
        id: this.device.id || 'ble-hr-' + Date.now(),
        name: this.device.name || 'Standard Bluetooth Heart Rate Sensor',
        source: 'BLE_STANDARD',
        connectionState: 'CONNECTING',
        capabilities: initialCapabilities
      };
      this.notifyState();

      // Handle spontaneous disconnect
      this.device.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnect();
      });

      if (this.device.gatt) {
        this.server = await this.device.gatt.connect();
        const hrService = await this.server.getPrimaryService('heart_rate');
        this.hrCharacteristic = await hrService.getCharacteristic('heart_rate_measurement');

        await this.hrCharacteristic.startNotifications();
        this.hrCharacteristic.addEventListener('characteristicvaluechanged', (event: any) => {
          this.parseHeartRateMeasurement(event.target.value);
        });

        this.currentDevice.connectionState = 'CONNECTED';
        this.notifyState();
      }

      return this.currentDevice;
    } catch (err) {
      console.warn('BLE Heart Rate connection failed:', err);
      this.handleDisconnect();
      return null;
    }
  }

  disconnect(): void {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.handleDisconnect();
  }

  private handleDisconnect(): void {
    if (this.currentDevice) {
      this.currentDevice.connectionState = 'DISCONNECTED';
      this.notifyState();
    }
    this.hrCharacteristic = null;
  }

  parseHeartRateMeasurement(value: DataView): NormalizedSensorSample {
    const flags = value.getUint8(0);
    const is16Bit = (flags & 0x01) !== 0;
    const rrIntervalsPresent = (flags & 0x10) !== 0; // Bit 4: RR-Interval flag

    let offset = 1;
    let heartRate = 0;

    if (is16Bit) {
      heartRate = value.getUint16(offset, true);
      offset += 2;
    } else {
      heartRate = value.getUint8(offset);
      offset += 1;
    }

    let rrIntervalsMs: number[] | undefined = undefined;

    if (rrIntervalsPresent) {
      rrIntervalsMs = [];
      while (offset + 1 < value.byteLength) {
        const rrRaw = value.getUint16(offset, true);
        const rrMs = (rrRaw / 1024) * 1000;
        rrIntervalsMs.push(Math.round(rrMs));
        offset += 2;
      }

      // Unlock RR & HRV capabilities dynamically
      if (this.currentDevice && !this.currentDevice.capabilities.rrInterval) {
        this.currentDevice.capabilities.rrInterval = true;
        this.currentDevice.capabilities.hrv = true;
        this.notifyState();
      }
    } else {
      // Strictly enforce false: No fabricated RR intervals!
      if (this.currentDevice && this.currentDevice.capabilities.rrInterval) {
        this.currentDevice.capabilities.rrInterval = false;
        this.currentDevice.capabilities.hrv = false;
        this.notifyState();
      }
    }

    const sample: NormalizedSensorSample = {
      id: 'sample-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now(),
      source: 'BLE_STANDARD',
      deviceId: this.currentDevice?.id || 'unknown',
      deviceName: this.currentDevice?.name || 'BLE Heart Rate Sensor',
      heartRate,
      rrIntervalsMs,
      isEstimated: false
    };

    if (this.currentDevice) {
      this.currentDevice.lastDataTimestamp = sample.timestamp;
    }

    for (const cb of this.onSampleCallbacks) {
      cb(sample);
    }

    return sample;
  }

  onSample(cb: SensorSampleCallback): () => void {
    this.onSampleCallbacks.add(cb);
    return () => this.onSampleCallbacks.delete(cb);
  }

  onStateChange(cb: DeviceStateCallback): () => void {
    this.onStateCallbacks.add(cb);
    return () => this.onStateCallbacks.delete(cb);
  }

  private notifyState(): void {
    if (this.currentDevice) {
      for (const cb of this.onStateCallbacks) {
        cb({ ...this.currentDevice });
      }
    }
  }
}
