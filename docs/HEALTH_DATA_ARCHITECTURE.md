# RAFTAR — Health Data Architecture & Transparent Readiness

## 1. Normalized Health Data Model

All incoming telemetry from BLE, Health Connect, or HealthKit is normalized into structured domain records:

```typescript
export type DataSourceType = 'BLE_STANDARD' | 'HEALTH_CONNECT' | 'HEALTH_KIT' | 'VENDOR_ADAPTER';

export interface NormalizedSensorSample {
  id: string;
  localActivityId?: string;
  timestamp: number;
  source: DataSourceType;
  deviceId: string;
  deviceName: string;
  heartRate?: number;
  rrIntervalsMs?: number[];
  cadenceRpm?: number;
  powerWatts?: number;
  isEstimated: boolean;
}

export interface NormalizedSleepRecord {
  startTime: number;
  endTime: number;
  deepSleepMinutes: number;
  remSleepMinutes: number;
  lightSleepMinutes: number;
  awakeMinutes: number;
  source: DataSourceType;
}

export interface NormalizedHrvRecord {
  timestamp: number;
  rmssdMs: number;
  sdnnMs?: number;
  source: DataSourceType;
  confidence: number;
}
```

---

## 2. Transparent Multi-Factor Readiness Model

Readiness in RAFTAR is never a black-box fake score. The engine explicitly tracks which inputs are available:

$$\text{Readiness Inputs} \subseteq \{\text{rMSSD HRV}, \text{Resting HR}, \text{Sleep Duration/Stages}, \text{7-Day TSS Load}, \text{Personal Baseline}\}$$

### Transparent UI States:
1. **Zero Data**:
   - `READINESS --% (NO SENSOR PAIRED)`
   - Explanation: *"Connect a compatible smartwatch or HR sensor to compute physiological recovery."*
2. **HR Only (No RR intervals)**:
   - `HRV -- (RR INTERVALS UNAVAILABLE FROM THIS DEVICE)`
   - `READINESS -- (INSUFFICIENT SENSOR DATA)`
   - Explanation: *"This sensor provides heart rate but does not expose microsecond RR intervals needed for HRV."*
3. **HRV + Training Load (Standard BLE Strap)**:
   - `READINESS 84% (PRIME STATE)`
   - Explanation: *"Based on live 68ms rMSSD and 482 TSS weekly training load."*
4. **Full Ecosystem (Health Connect / HealthKit with Sleep + Nocturnal HRV + Resting HR)**:
   - `READINESS 92% (PEAK ADAPTATION)`
   - Explanation: *"Based on 7h 42m sleep (1h 50m deep), nocturnal 74ms HRV, and 52 BPM resting heart rate."*
