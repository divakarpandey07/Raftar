import {
  ConnectedDevice,
  DeviceCapabilities,
  NormalizedSensorSample,
  NormalizedSleepRecord,
  ReadinessAssessment
} from '../types/device.types';
import { BleHeartRateAdapter } from './adapters/ble-heart-rate-adapter';
import { HealthConnectAdapter } from './adapters/health-connect-adapter';
import { HealthKitAdapter } from './adapters/health-kit-adapter';

export type DeviceTelemetryListener = (sample: NormalizedSensorSample) => void;
export type DeviceStateListener = (devices: ConnectedDevice[]) => void;

export class DeviceManager {
  private bleAdapter: BleHeartRateAdapter;
  private healthConnectAdapter: HealthConnectAdapter;
  private healthKitAdapter: HealthKitAdapter;

  private activeDevice: ConnectedDevice | null = null;
  private recentRrIntervals: number[] = [];
  private latestRestingHr: number | null = null;
  private latestSleepRecord: NormalizedSleepRecord | null = null;
  private weeklyTssLoad: number = 0;

  private telemetryListeners: Set<DeviceTelemetryListener> = new Set();
  private stateListeners: Set<DeviceStateListener> = new Set();

  constructor(
    bleAdapter?: BleHeartRateAdapter,
    healthConnectAdapter?: HealthConnectAdapter,
    healthKitAdapter?: HealthKitAdapter
  ) {
    this.bleAdapter = bleAdapter || new BleHeartRateAdapter();
    this.healthConnectAdapter = healthConnectAdapter || new HealthConnectAdapter();
    this.healthKitAdapter = healthKitAdapter || new HealthKitAdapter();

    this.setupListeners();
  }

  private setupListeners(): void {
    this.bleAdapter.onSample((sample) => {
      if (sample.rrIntervalsMs && sample.rrIntervalsMs.length > 0) {
        this.recentRrIntervals.push(...sample.rrIntervalsMs);
        if (this.recentRrIntervals.length > 100) {
          this.recentRrIntervals = this.recentRrIntervals.slice(-100);
        }
      }
      this.notifyTelemetry(sample);
    });

    this.bleAdapter.onStateChange((device) => {
      this.activeDevice = device.connectionState === 'CONNECTED' ? device : null;
      this.notifyState();
    });
  }

  getBleAdapter(): BleHeartRateAdapter {
    return this.bleAdapter;
  }

  getHealthConnectAdapter(): HealthConnectAdapter {
    return this.healthConnectAdapter;
  }

  getHealthKitAdapter(): HealthKitAdapter {
    return this.healthKitAdapter;
  }

  getActiveDevice(): ConnectedDevice | null {
    return this.activeDevice;
  }

  getConnectedDevices(): ConnectedDevice[] {
    const list: ConnectedDevice[] = [];
    if (this.bleAdapter.getConnectedDevice()?.connectionState === 'CONNECTED') {
      list.push(this.bleAdapter.getConnectedDevice()!);
    }
    if (this.healthConnectAdapter.getConnectedDevice()?.connectionState === 'CONNECTED') {
      list.push(this.healthConnectAdapter.getConnectedDevice()!);
    }
    if (this.healthKitAdapter.getConnectedDevice()?.connectionState === 'CONNECTED') {
      list.push(this.healthKitAdapter.getConnectedDevice()!);
    }
    return list;
  }

  setWeeklyTssLoad(tss: number): void {
    this.weeklyTssLoad = tss;
  }

  setNocturnalData(restingHr: number | null, sleep: NormalizedSleepRecord | null): void {
    this.latestRestingHr = restingHr;
    this.latestSleepRecord = sleep;
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

  computeReadiness(): ReadinessAssessment {
    // 1. Check if any device is connected
    if (!this.activeDevice || this.activeDevice.connectionState !== 'CONNECTED') {
      return {
        score: null,
        stateLabel: 'NO SENSOR PAIRED',
        explanation: 'Connect a compatible smartwatch or HR sensor to compute physiological recovery.',
        usedInputs: { hrv: false, restingHeartRate: false, sleep: false, trainingLoad: false }
      };
    }

    // 2. Check RR / HRV availability
    const rmssd = this.calculateHrvRmssd();
    if (!rmssd) {
      if (!this.activeDevice.capabilities.rrInterval) {
        return {
          score: null,
          stateLabel: 'INSUFFICIENT SENSOR DATA',
          explanation: 'This sensor provides heart rate but does not expose microsecond RR intervals needed for HRV.',
          usedInputs: { hrv: false, restingHeartRate: false, sleep: false, trainingLoad: false }
        };
      }
      return {
        score: null,
        stateLabel: 'CALIBRATING HRV...',
        explanation: 'Collecting real-time RR intervals from your paired sensor to compute neuromuscular readiness...',
        usedInputs: { hrv: false, restingHeartRate: false, sleep: false, trainingLoad: false }
      };
    }

    // 3. Multi-factor transparent computation
    const usedInputs = {
      hrv: true,
      restingHeartRate: Boolean(this.latestRestingHr),
      sleep: Boolean(this.latestSleepRecord),
      trainingLoad: this.weeklyTssLoad > 0
    };

    let score = Math.min(100, Math.max(20, Math.round((rmssd / 75) * 100)));

    if (usedInputs.sleep && this.latestSleepRecord) {
      const sleepHours = this.latestSleepRecord.durationMinutes / 60;
      if (sleepHours >= 7.5) score = Math.min(100, score + 4);
      else if (sleepHours < 6.0) score = Math.max(20, score - 8);
    }

    let stateLabel = 'Prime State';
    let explanation = `Optimal conditions for threshold effort. Based on ${rmssd}ms rMSSD HRV`;

    if (usedInputs.sleep) {
      explanation += ` and ${Math.round((this.latestSleepRecord!.durationMinutes / 60) * 10) / 10}h sleep`;
    }
    if (usedInputs.trainingLoad) {
      explanation += ` (${this.weeklyTssLoad} TSS load)`;
    }

    if (score < 50) {
      stateLabel = 'Fatigued';
      explanation = `Low HRV (${rmssd}ms) detected. Recommend active recovery or light zone 1 work.`;
    } else if (score < 75) {
      stateLabel = 'Moderate';
      explanation = `Moderate recovery balance (${rmssd}ms HRV). Steady endurance pacing recommended.`;
    }

    return {
      score,
      stateLabel,
      explanation,
      usedInputs,
      rmssdMs: rmssd,
      restingHrBpm: this.latestRestingHr ?? undefined
    };
  }

  onTelemetry(listener: DeviceTelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  onStateChange(listener: DeviceStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private notifyTelemetry(sample: NormalizedSensorSample): void {
    for (const l of this.telemetryListeners) {
      l(sample);
    }
  }

  private notifyState(): void {
    const devices = this.getConnectedDevices();
    for (const l of this.stateListeners) {
      l(devices);
    }
  }
}
