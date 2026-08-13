# RAFTAR — Network-Independent Offline Core & Location Intelligence

## 1. Core Principle & Architectural Boundaries

> **Network-Independent Offline Core**: The RAFTAR recording engine functions with complete independence from internet connectivity. An athlete can start, track, pause, resume, compute splits, view real-time HUD telemetry, and finalize an activity entirely without cellular data or Wi-Fi.

### 1.1 Critical Dependency & Availability Matrix

The system distinguishes strictly between network availability and hardware location services:

```text
┌───────────────────────────────────────┬─────────────────────────────────────────────────────────────┐
│ SCENARIO                              │ SYSTEM BEHAVIOR & TRACKING QUALITY                          │
├───────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 1. Internet OFF + GNSS Lock ON        │ 🟢 100% Tracking Fidelity. Live pace, distance, elevation,  │
│                                       │    and splits compute and persist locally to SQLite.         │
├───────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 2. Internet ON + GNSS Lock ON         │ 🟢 Full Fidelity + Real-time Weather/AQI & Beacon Sharing.  │
├───────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 3. Internet ON + GNSS Lost            │ 🟡 Network-assisted rough positioning (15–50m accuracy).    │
│    (Urban canyon / under canopy)      │    Flagged as MODERATE_ACCURACY / DEGRADED.                 │
├───────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 4. Internet OFF + GNSS Lost           │ 🟠 Sensor/IMU Dead-Reckoning (Pedometer / Accelerometer).   │
│    (Tunnel / Indoor corridor)         │    Strictly labeled ESTIMATED; NEVER masqueraded as GNSS.   │
├───────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 5. Location Services Disabled /       │ 🔴 UNAVAILABLE. UI halts recording clock timer; displays    │
│    Permission Denied by OS            │    explicit "Enable Location Services" warning modal.       │
└───────────────────────────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## 2. Location Intelligence Architecture & Quality States

```text
               ┌──────────────────────────────────────────┐
               │         HARDWARE & SENSOR INPUTS         │
               │  GNSS (GPS/Galileo/GLONASS) • Cell/Wi-Fi │
               │  IMU (Accelerometer / Gyro) • Pedometer  │
               └────────────────────┬─────────────────────┘
                                    │
                                    ▼
               ┌──────────────────────────────────────────┐
               │        LOCATION QUALITY ARBITRATOR       │
               └────────────────────┬─────────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
🟢 HIGH_ACCURACY            🟡 MODERATE_ACCURACY          🟠 DEGRADED / ESTIMATED
  GNSS Lock                   GNSS / Cell Wi-Fi             Dead-Reckoning IMU
  HDOP < 2.0, Acc < 10m       Acc 10m – 25m                 Acc > 25m / Tunnel
  (Real Raw Track)            (Raw Track Marked)            (Flag: is_estimated=true)
```

### 2.1 Quality Indicator UI Mapping
The athlete is always transparently informed of current tracking quality via the TopAppBar indicator:
- 🟢 **High Accuracy**: Full satellite constellation lock ($\le 10\text{m}$).
- 🟡 **Moderate Accuracy**: Secondary satellite lock / Network assistance ($10\text{m} - 25\text{m}$).
- 🟠 **Estimated (Degraded)**: Tunnel/Dead-reckoning ($>25\text{m}$). Points stored with `is_estimated = true`.
- 🔴 **Unavailable**: Location hardware disabled or permission revoked.

---

## 3. Multi-Factor Geospatial Outlier Detection Strategy

Raw GNSS samples frequently suffer from multipath reflections, satellite geometry shifts, and clock drifts. Rather than a naive single-variable speed threshold, RAFTAR evaluates each candidate coordinate $P_t = (\text{lat}_t, \text{lon}_t, \text{alt}_t, \text{acc}_t, t_t)$ using a **multi-factor physical validation model**:

```text
Candidate Coordinate P_t
   │
   ├── 1. Accuracy Check: Is reported acc_t <= 30m?
   │
   ├── 2. Temporal Validity: Is delta_t >= 0.5s and <= 10s?
   │
   ├── 3. Geodesic Distance: Compute Vincenty / Haversine delta_d from P_{t-1}
   │
   ├── 4. Instantaneous Velocity: v = delta_d / delta_t <= Sport_Max_Velocity
   │
   ├── 5. Physical Acceleration: a = |v_t - v_{t-1}| / delta_t <= Sport_Max_Accel
   │
   ├── 6. Angular Heading Deflection: Is acute heading change realistic given speed?
   │
   └── 7. Trajectory Kalman Consistency: Residual distance from predicted state vector
   │
   ▼
[ EVALUATION ] ──► ACCEPT / REJECT (Outlier) / MARK UNCERTAIN
```

### 3.1 Sport-Specific Physical Thresholds

| Metric | Running | Cycling | Walking | Hiking |
| :--- | :--- | :--- | :--- | :--- |
| **Max Plausible Velocity ($v_{\max}$)** | $12.0\text{ m/s}$ ($43.2\text{ km/h}$) | $32.0\text{ m/s}$ ($115.2\text{ km/h}$) | $3.5\text{ m/s}$ ($12.6\text{ km/h}$) | $4.0\text{ m/s}$ ($14.4\text{ km/h}$) |
| **Max Plausible Accel ($a_{\max}$)** | $4.5\text{ m/s}^2$ | $6.0\text{ m/s}^2$ | $2.5\text{ m/s}^2$ | $2.5\text{ m/s}^2$ |
| **Max Heading Shift ($\Delta \theta_{\max}$)** | $120^\circ\text{ at } >6\text{ m/s}$ | $90^\circ\text{ at } >15\text{ m/s}$ | $180^\circ$ | $180^\circ$ |
| **Auto-Pause Threshold** | $<0.6\text{ m/s}$ for $4\text{s}$ | $<1.0\text{ m/s}$ for $5\text{s}$ | $<0.4\text{ m/s}$ for $6\text{s}$ | $<0.4\text{ m/s}$ for $8\text{s}$ |

---

## 4. Activity State Machine & Crash Recovery

```text
               ┌───────────────┐
               │     IDLE      │
               └───────┬───────┘
                       │ User requests start (Permissions OK)
               ┌───────▼───────┐
               │     READY     │
               └───────┬───────┘
                       │ User taps "Start"
               ┌───────▼───────┐ ◄────────────────┐
        ┌─────►│   RECORDING   │                  │ GPS Signal Restored
        │      └───────┬───────┘                  │
        │ Auto-Pause/  │ Velocity < Threshold /   │
        │ User Resume  │ Manual Pause Tap         │
        │      ┌───────▼───────┐                  │
        │      │    PAUSED     │                  │
        │      └───────┬───────┘                  │
        │              │ Signal Lost              │
        │      ┌───────▼───────┐                  │
        └──────┤  GPS_DEGRADED ├──────────────────┘
               └───────┬───────┘
                       │ User taps "Finish"
               ┌───────▼───────┐
               │   FINISHING   │
               └───────┬───────┘
                       │ Finalize metrics & Commit SQLite Transaction
               ┌───────▼───────┐
               │   COMPLETED   │ ──► Pushed to Local Sync Outbox Queue
               └───────────────┘
```

### 4.1 Write-Ahead Logging (WAL) & Crash Recovery
- SQLite runs with `PRAGMA journal_mode = WAL;` and `PRAGMA synchronous = NORMAL;`.
- On unexpected process kill, OS crash, or battery exhaustion, the app boots into a startup audit:
  - If an active unclosed session exists in `local_activities` (`status IN ('RECORDING', 'PAUSED')`), all `local_gps_points` are replayed, moving metrics restored, and state transitioned safely to `PAUSED`.
  - The athlete is offered: **[Resume Activity]** or **[Save & Finish]**. Zero recorded points are lost.
