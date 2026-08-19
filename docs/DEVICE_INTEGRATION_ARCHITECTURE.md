# RAFTAR — Final Production Wearable & Telemetry Arbitration Architecture

## 1. Core Paradigm: Contextual Evidence-Based Arbitration

> **"For this metric, during this activity, at this exact moment, which valid measurement has the highest evidence of correctness — and can we explain why?"**

```text
                               RAFTAR UNIVERSAL DATA LAYER
                                           │
         ┌─────────────────────────────────┴─────────────────────────────────┐
         │                                                                   │
  LIVE INGESTION LAYER                                            HISTORICAL IMPORT LAYER
  - Standard BLE 0x180D/0x1814/0x1816/0x1818                     - Android Health Connect Historical
  - Dual-Band Device GNSS                                        - Apple HealthKit Workout Import
  - Native Sensor IMU / Barometer                                 - Vendor Cloud Sync (Garmin/Zepp)
         │                                                                   │
         └─────────────────────────────────┬─────────────────────────────────┘
                                           │
                                           ▼
                                 NORMALIZATION LAYER
                      (Generates Canonical MetricRecords with
                        sequenceNumber, clockOffset, provenance)
                                           │
                                           ▼
                                RAW PROVENANCE STORE
                         (100% Immutable Raw Telemetry)
                                           │
                                           ▼
                              QUALITY & PLAUSIBILITY ENGINE
                         - Freshness & Signal Quality (0–100)
                         - Range & Plausibility Validation
                         - Validity: VALID | SUSPICIOUS | INVALID
                                           │
                                           ▼
                            PRODUCTION ARBITRATION ENGINE
                         - Metric-Specific Authority Models
                         - Activity Context (Running vs Cycling)
                         - Measurement Mode (MEASURED vs ESTIMATED)
                         - Hysteresis & Debounce (Flap Prevention)
                                           │
                                           ▼
                                 LIVE CANONICAL STREAM
                            (Drives Real-Time HUD & TSS)
                                           │
                                           ▼
                             POST-WORKOUT RECONCILIATION
                         (Merges buffered late-arriving records
                            into Final Canonical Timeline)
                                           │
                                           ▼
                                 FINAL CANONICAL STORE
                            (Drives Analytics, PRs & AI Coach)
```

---

## 2. Dynamic Metric Arbitration Score Formula

$$\text{Score} = \text{AuthorityBase}(\text{Metric}, \text{DeviceClass}, \text{Activity}) \times \text{MeasurementWeight} \times \text{Quality} \times \text{FreshnessPenalty} \times \text{ContinuityMultiplier}$$

Where:
- **`MeasurementWeight`**: $1.0$ for `MEASURED` (ECG strap, crank strain gauge) vs $0.65$ for `ESTIMATED` (optical estimate, wrist cadence).
- **`Activity Compatibility`**: Running Cadence favors `FOOTPOD` ($1.0$), while Cycling Cadence strictly requires `CRANK_SENSOR` / `BIKE_COMPUTER` ($1.0$).
- **`FreshnessPenalty`**: $1.0$ for $\Delta t \le 1.0\text{s}$; drops linearly to $0.2$ at $\Delta t = 5.0\text{s}$; $0.0$ (Stale/Dropped) at $\Delta t > 6.0\text{s}$.
- **`Hysteresis Threshold`**: Primary source switch requires $\ge 3$ consecutive high-quality samples and $\Delta \text{Score} \ge +15\%$ to prevent flapping.

---

## 3. Location Fusion & Authority

- **GNSS vs Network Honesty**: The system never masquerades cell/Wi-Fi positioning as high-accuracy GNSS.
- **Dynamic Sky Visibility**: If phone is pocketed (multipath error $\pm 20\text{m}$, HDOP $> 3.5$) and wrist smartwatch has open sky lock ($\pm 4\text{m}$, HDOP $1.1$), the watch is dynamically awarded GPS primary authority.
