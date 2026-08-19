# RAFTAR — Data Provenance & Deduplication Architecture

## 1. The Multi-Source Overlap Problem

An athlete may simultaneously wear a Garmin chest strap (live BLE) while wearing a Samsung Galaxy Watch syncing through Health Connect, while their phone pedometer logs steps.

Without deduplication, heart rates and steps would be double-counted, distorting TSS and caloric burn.

---

## 2. Source Priority Hierarchy

When overlapping data arrives for the same millisecond timestamp range ($t \pm 2000\text{ms}$), the Deduplication Engine retains the highest-ranking canonical source:

| Rank | Source Class | Description | Rationale |
| :---: | :--- | :--- | :--- |
| **1 (Highest)** | `DIRECT_BLE_STREAM` | Real-time 1 Hz hardware telemetry from paired BLE sensor | Highest temporal resolution and precision |
| **2** | `NATIVE_OS_WORKOUT` | Active recorded workout session from HealthKit / Health Connect | Verified continuous session data |
| **3** | `BACKGROUND_PLATFORM_SYNC` | Aggregated 1-minute / 5-minute health samples | Lower resolution snapshot |
| **4 (Lowest)** | `PHONE_SENSOR_ESTIMATE` | Phone accelerometer / GPS speed estimation | Fallback estimation |

---

## 3. Canonical Record Normalization

Every measurement ingested into RAFTAR's database contains explicit provenance tags:

```typescript
export interface CanonicalHealthSample {
  id: string;
  metricType: 'HEART_RATE' | 'RR_INTERVAL' | 'CADENCE' | 'POWER' | 'STEPS' | 'SLEEP';
  value: number;
  unit: string;
  timestamp: number;
  provenance: {
    source: 'BLE' | 'HEALTH_CONNECT' | 'HEALTH_KIT' | 'VENDOR_CLOUD' | 'PHONE';
    provider: 'garmin' | 'samsung' | 'apple' | 'polar' | 'xiaomi' | 'generic';
    deviceType: 'CHEST_STRAP' | 'WATCH' | 'BAND' | 'RING' | 'PHONE';
    priorityRank: number;
  };
}
```
