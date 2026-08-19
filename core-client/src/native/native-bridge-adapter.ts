import {
  NativePlatform,
  NativeServiceState,
  NativeLocationEvent,
  NativeSensorSample,
  HealthConnectSyncPayload,
  NativeBridgeCommand,
  NativeBridgeResponse
} from './types';
import { RawGpsPoint } from '../types';

export class NativeBridgeAdapter {
  private platform: NativePlatform;
  private serviceState: NativeServiceState = 'STOPPED';
  private locationListeners: ((point: RawGpsPoint) => void)[] = [];
  private sensorListeners: ((sample: NativeSensorSample) => void)[] = [];
  private pendingCommands: Map<string, (response: NativeBridgeResponse) => void> = new Map();

  constructor(platform: NativePlatform = 'ANDROID') {
    this.platform = platform;
  }

  getPlatform(): NativePlatform {
    return this.platform;
  }

  getServiceState(): NativeServiceState {
    return this.serviceState;
  }

  onLocationReceived(listener: (point: RawGpsPoint) => void): () => void {
    this.locationListeners.push(listener);
    return () => {
      this.locationListeners = this.locationListeners.filter((l) => l !== listener);
    };
  }

  onSensorSampleReceived(listener: (sample: NativeSensorSample) => void): () => void {
    this.sensorListeners.push(listener);
    return () => {
      this.sensorListeners = this.sensorListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Called by Native Mobile OS (Kotlin/Swift via JS Bridge) when raw GPS is acquired.
   */
  dispatchNativeLocation(event: NativeLocationEvent, localActivityId: string, pointIndex: number): void {
    const rawPoint: RawGpsPoint = {
      latitude: event.latitude,
      longitude: event.longitude,
      altitude: event.altitudeMeters,
      accuracy: event.accuracyMeters,
      speed: event.speedMps,
      timestamp: event.timestamp,
      localActivityId,
      pointIndex,
      isEstimated: event.isMocked || event.accuracyMeters > 30.0
    };

    for (const listener of this.locationListeners) {
      listener(rawPoint);
    }
  }

  /**
   * Called by Native Mobile OS when live BLE sensor packet arrives.
   */
  dispatchNativeSensor(sample: NativeSensorSample): void {
    for (const listener of this.sensorListeners) {
      listener(sample);
    }
  }

  /**
   * Dispatches a lifecycle command to native background service.
   */
  sendCommand(command: NativeBridgeCommand): Promise<NativeBridgeResponse> {
    return new Promise((resolve) => {
      this.pendingCommands.set(command.commandId, resolve);

      // Simulate native runtime response handling
      if (command.action === 'START_FOREGROUND_TRACKING') {
        this.serviceState = 'RUNNING';
        resolve({ commandId: command.commandId, success: true, state: 'RUNNING' });
      } else if (command.action === 'PAUSE_TRACKING') {
        this.serviceState = 'PAUSED';
        resolve({ commandId: command.commandId, success: true, state: 'PAUSED' });
      } else if (command.action === 'RESUME_TRACKING') {
        this.serviceState = 'RUNNING';
        resolve({ commandId: command.commandId, success: true, state: 'RUNNING' });
      } else if (command.action === 'STOP_FOREGROUND_TRACKING') {
        this.serviceState = 'STOPPED';
        resolve({ commandId: command.commandId, success: true, state: 'STOPPED' });
      } else {
        resolve({ commandId: command.commandId, success: true, state: this.serviceState });
      }
    });
  }

  /**
   * Prepares and validates Health Connect / HealthKit sync payload.
   */
  formatHealthSyncPayload(
    activityId: string,
    sportType: any,
    startTime: number,
    endTime: number,
    distanceMeters: number,
    calories: number,
    avgHr?: number,
    maxHr?: number,
    coords: { latitude: number; longitude: number; altitude?: number; timestamp: number }[] = []
  ): HealthConnectSyncPayload {
    return {
      startTime,
      endTime,
      sportType,
      distanceMeters: Math.round(distanceMeters),
      activeCaloriesBurned: Math.round(calories),
      averageHeartRate: avgHr ? Math.round(avgHr) : undefined,
      maxHeartRate: maxHr ? Math.round(maxHr) : undefined,
      routeCoordinates: coords
    };
  }
}
