# RAFTAR — Multi-Sensor Metric Arbitration & Stream-Level Fusion

## 1. Metric-Specific Source Arbitration Engine

RAFTAR strictly rejects a single global provider priority. In real athletic environments, different devices excel at different metrics.

RAFTAR evaluates source authority on a **per-metric basis**:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              METRIC-SPECIFIC ARBITRATION                               │
├─────────────────┬──────────────────────────────────────────────────────────────────────┤
│ Metric Type     │ Priority Hierarchy (Authority Rank)                                  │
├─────────────────┼──────────────────────────────────────────────────────────────────────┤
│ HEART RATE      │ 1. Direct ECG Chest Strap (Polar H10, Garmin HRM-Pro) [Conf: 0.99]   │
│                 │ 2. Optical Armband (Wahoo TICKR FIT, Scosche)        [Conf: 0.92]    │
│                 │ 3. Smartwatch Optical Sensor (Galaxy/Apple/Garmin)   [Conf: 0.85]    │
│                 │ 4. Smart Ring (Oura, Ultrahuman)                     [Conf: 0.80]    │
├─────────────────┼──────────────────────────────────────────────────────────────────────┤
│ GPS / LOCATION  │ 1. High-Accuracy Phone Dual-Band GNSS (Accuracy < 5m) [Conf: 0.98]   │
│                 │ 2. Smartwatch Dedicated GNSS (Accuracy < 10m)        [Conf: 0.90]    │
│                 │ 3. Network/Cell Assisted Location                    [Conf: 0.50]    │
├─────────────────┼──────────────────────────────────────────────────────────────────────┤
│ CYCLING POWER   │ 1. Direct Dual-Sided Pedal/Crank Power Meter         [Conf: 0.99]    │
│                 │ 2. Single-Sided Power Meter                          [Conf: 0.94]    │
│                 │ 3. Smart Trainer BLE Stream                          [Conf: 0.90]    │
│                 │ 4. Estimated Power (from Velocity & Gradient)        [Conf: 0.65]    │
├─────────────────┼──────────────────────────────────────────────────────────────────────┤
│ CADENCE         │ 1. Dedicated Footpod / Crank Cadence Sensor (BLE)    [Conf: 0.98]    │
│                 │ 2. Smartwatch Wrist IMU Pacing                       [Conf: 0.88]    │
│                 │ 3. Phone Pedometer Stride Estimation                 [Conf: 0.70]    │
├─────────────────┼──────────────────────────────────────────────────────────────────────┤
│ ELEVATION       │ 1. Barometric Pressure Altimeter Sensor              [Conf: 0.95]    │
│                 │ 2. GNSS Geoid Altitude                               [Conf: 0.75]    │
│                 │ 3. Topographical DEM Map Interpolation               [Conf: 0.70]    │
└─────────────────┴──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Stream-Level Deduplication & Automatic Secondary Fallback

Instead of independently filtering point-by-point samples, RAFTAR models continuous **Telemetry Streams**:

```text
  [ ACTIVE ACTIVITY SESSION ]
              │
      ┌───────┴───────┐
      │               │
  Stream 1:        Stream 2:
  Polar H10        Samsung Watch
  (Primary)        (Secondary)
      │               │
  [ STREAM HEALTH MONITOR ]
      │
      ├── Primary active? ──> Use Polar H10 HR (Tag: isPrimary = true)
      │                       Retain Samsung HR in Provenance Store (Tag: isSecondary = true)
      │
      └── Polar drops? ─────> Instant fallback to Samsung Watch HR!
                              Notify: "Heart-rate strap disconnected — using Watch sensor"
```

---

## 3. Preservation of Raw Provenance Store

RAFTAR **NEVER** permanently destroys lower-priority streams. 
- The **Canonical Stream** drives real-time HUD dials, Training Load (TSS), and AI Coach insights.
- The **Provenance Store** preserves all secondary and shadow streams for sensor calibration, signal dropout analysis, and deep sports science research.
