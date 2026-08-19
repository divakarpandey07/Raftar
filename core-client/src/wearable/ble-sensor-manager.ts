export interface BleHeartRateTelemetry {
  heartRate: number;
  contactDetected?: boolean;
  energyExpendedJoules?: number;
  rrIntervalsMs?: number[];
  timestamp: number;
}

export type BleSensorStatus = 'DISCONNECTED' | 'SCANNING' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export class BleSensorManager {
  private device: any = null;
  private server: any = null;
  private hrCharacteristic: any = null;
  private status: BleSensorStatus = 'DISCONNECTED';
  private deviceName: string = '';
  private recentRrIntervals: number[] = [];

  private onTelemetryCallbacks: Set<(data: BleHeartRateTelemetry) => void> = new Set();
  private onStatusChangeCallbacks: Set<(status: BleSensorStatus, deviceName?: string) => void> = new Set();

  getStatus(): { status: BleSensorStatus; deviceName: string } {
    return { status: this.status, deviceName: this.deviceName };
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async pairHeartRateSensor(): Promise<boolean> {
    if (!this.isSupported()) {
      console.warn('Web Bluetooth API is not supported in this browser environment.');
      this.updateStatus('ERROR');
      return false;
    }

    try {
      this.updateStatus('SCANNING');
      this.device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
        optionalServices: ['battery_service', 'device_information']
      });

      this.deviceName = this.device.name || 'Bluetooth Heart Rate Monitor';
      this.updateStatus('CONNECTING', this.deviceName);

      this.device.addEventListener('gattserverdisconnected', () => {
        this.updateStatus('DISCONNECTED');
        this.hrCharacteristic = null;
      });

      this.server = await this.device.gatt.connect();
      const hrService = await this.server.getPrimaryService('heart_rate');
      this.hrCharacteristic = await hrService.getCharacteristic('heart_rate_measurement');

      await this.hrCharacteristic.startNotifications();
      this.hrCharacteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        this.parseHeartRateMeasurement(event.target.value);
      });

      this.updateStatus('CONNECTED', this.deviceName);
      return true;
    } catch (err) {
      console.error('BLE sensor pairing failed:', err);
      this.updateStatus('DISCONNECTED');
      return false;
    }
  }

  disconnect(): void {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.updateStatus('DISCONNECTED');
  }

  private parseHeartRateMeasurement(value: DataView): void {
    const flags = value.getUint8(0);
    const is16Bit = (flags & 0x01) !== 0;
    const contactDetected = (flags & 0x06) === 0x06;
    const energyExpendedPresent = (flags & 0x08) !== 0;
    const rrIntervalsPresent = (flags & 0x10) !== 0;

    let offset = 1;
    let heartRate = 0;

    if (is16Bit) {
      heartRate = value.getUint16(offset, true);
      offset += 2;
    } else {
      heartRate = value.getUint8(offset);
      offset += 1;
    }

    let energyExpendedJoules: number | undefined;
    if (energyExpendedPresent) {
      energyExpendedJoules = value.getUint16(offset, true);
      offset += 2;
    }

    const rrIntervalsMs: number[] = [];
    if (rrIntervalsPresent) {
      while (offset + 1 < value.byteLength) {
        const rrRaw = value.getUint16(offset, true);
        const rrMs = (rrRaw / 1024) * 1000;
        rrIntervalsMs.push(Math.round(rrMs));
        this.recentRrIntervals.push(Math.round(rrMs));
        if (this.recentRrIntervals.length > 60) this.recentRrIntervals.shift();
        offset += 2;
      }
    }

    const telemetry: BleHeartRateTelemetry = {
      heartRate,
      contactDetected,
      energyExpendedJoules,
      rrIntervalsMs,
      timestamp: Date.now()
    };

    for (const cb of this.onTelemetryCallbacks) {
      cb(telemetry);
    }
  }

  calculateHrvRmssd(): number | null {
    if (this.recentRrIntervals.length < 5) return null;
    let sumSquaredDiffs = 0;
    let count = 0;

    for (let i = 1; i < this.recentRrIntervals.length; i++) {
      const diff = this.recentRrIntervals[i] - this.recentRrIntervals[i - 1];
      sumSquaredDiffs += diff * diff;
      count++;
    }

    return Math.round(Math.sqrt(sumSquaredDiffs / count));
  }

  computeReadinessScore(): { score: number | null; stateLabel: string; advice: string } {
    if (this.status !== 'CONNECTED') {
      return {
        score: null,
        stateLabel: 'NO SENSOR PAIRED',
        advice: 'Pair a Bluetooth Smartwatch or Heart Rate Monitor to track HRV, nocturnal recovery, and neuromuscular readiness.'
      };
    }

    const rmssd = this.calculateHrvRmssd();
    if (!rmssd) {
      return {
        score: null,
        stateLabel: 'CALIBRATING HRV...',
        advice: 'Collecting real-time RR intervals from your paired sensor to compute neuromuscular readiness...'
      };
    }

    let score = Math.min(100, Math.max(20, Math.round((rmssd / 75) * 100)));
    let stateLabel = 'Optimal';
    let advice = 'Optimal conditions for a threshold run today. Neuromuscular readiness is peaking based on live sensor data.';

    if (score < 50) {
      stateLabel = 'Fatigued';
      advice = 'Low HRV detected. Parasympathetic system is under stress. Recommend active recovery or light zone 1 work.';
    } else if (score < 75) {
      stateLabel = 'Moderate';
      advice = 'Moderate recovery balance. Steady endurance aerobic pacing recommended.';
    } else {
      stateLabel = 'Prime State';
      advice = 'Optimal conditions for high-intensity or threshold workout today. Neuromuscular readiness is peaking.';
    }

    return { score, stateLabel, advice };
  }

  onTelemetry(cb: (data: BleHeartRateTelemetry) => void): () => void {
    this.onTelemetryCallbacks.add(cb);
    return () => this.onTelemetryCallbacks.delete(cb);
  }

  onStatusChange(cb: (status: BleSensorStatus, deviceName?: string) => void): () => void {
    this.onStatusChangeCallbacks.add(cb);
    return () => this.onStatusChangeCallbacks.delete(cb);
  }

  private updateStatus(status: BleSensorStatus, deviceName: string = ''): void {
    this.status = status;
    if (deviceName) this.deviceName = deviceName;
    for (const cb of this.onStatusChangeCallbacks) {
      cb(this.status, this.deviceName);
    }
  }
}
