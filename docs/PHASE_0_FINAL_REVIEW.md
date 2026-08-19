# RAFTAR — Phase 0 Final Review & Architectural Audit Sign-Off

## 1. Executive Summary & Review Verdict

Phase 0 Architectural Audit has been updated with all 12 critical engineering corrections. The system architecture is now **production-grade, resilient, and grounded in real-world physical and hardware constraints**.

---

## 2. Summary of Architectural Corrections Made

| # | Item / Correction | Previous Plan | Updated Architectural Specification |
| :- | :--- | :--- | :--- |
| **1** | **Offline Core Wording** | "Zero-Dependency Offline Core" | **"Network-Independent Offline Core"**: Acknowledges OS hardware, GNSS, sensor, and SQLite dependencies while remaining 100% network-independent. |
| **2** | **Location Availability Distinctions** | Generic GPS ON/OFF | **5 Distinct Location Scenarios**: (1) Internet OFF + GNSS Lock ON, (2) Internet ON + GNSS Lock ON, (3) Internet ON + GNSS Lost, (4) Internet OFF + GNSS Lost, (5) Location Services Disabled. |
| **3** | **Location Intelligence Quality States** | Binary GPS status | **5 Location Quality States**: `HIGH_ACCURACY` (🟢), `MODERATE_ACCURACY` (🟡), `DEGRADED` (🟠), `ESTIMATED` (🟠), `UNAVAILABLE` (🔴). Estimated points are strictly flagged `is_estimated = true` and never masqueraded as real GNSS points. |
| **4** | **GPS Outlier Detection** | Simplistic `>15 m/s jump rejection` | **Multi-Factor Physical Validation Model**: Evaluates accuracy ($\sigma$), $\Delta t$, $\Delta d$, calculated speed, acceleration ($a_{\max}$), heading change ($\Delta \theta$), and sport-specific physical limits (Running vs Cycling vs Walking vs Hiking). |
| **5** | **Design Verification Criteria** | "CSS byte-for-byte matching" | **"Visual Parity with Approved Stitch Design"**: Validates typography (`Sora`, `JetBrains Mono`, `Hanken Grotesk`), colors, tokens, spacing, component hierarchy, animations, and icons across native platforms. |
| **6** | **Offline Map Architecture** | Brief mention | **Dedicated Specification (`OFFLINE_MAP_ARCHITECTURE.md`)**: Vector tile formats (MBTiles/MVT), zoom levels 10–16, bounding box metadata, eviction quotas, and the **Isolation Rule** (missing map tile never fails an active workout). |
| **7** | **Sync Engine Resumability** | Whole-payload outbox sync | **Resumable Chunked Telemetry Streaming**: Workouts are partitioned into chunks (500–1000 pts). If network fails midway, upload resumes from chunk index $K$ without re-uploading previous points. |
| **8** | **Data Decoupling & Lineage** | Mixed activity metrics | **Strict Raw vs Derived Data Separation**: Immutable raw points (`activity_raw_points`) stored separately from computed metrics (`activity_metrics`, `activity_splits`), enabling retrospective recomputation when algorithms improve. |
| **9** | **AI Grounding & Fitness Query Layer** | Generic DB grounding | **Tiered Fitness Query Pipeline**: User Query $\rightarrow$ Intent Detection $\rightarrow$ Deterministic Fitness Query Layer $\rightarrow$ Validated Metrics $\rightarrow$ Context Injection $\rightarrow$ LLM Reasoning. LLM never performs mathematical aggregations from raw data. |
| **10** | **Medical / Health Boundary** | Unspecified | **Explicit Medical Disclaimer & Safety Boundary**: AI provides athletic pacing/recovery intelligence, never medical diagnostics. Abnormal physiological markers trigger standard advice to rest and consult medical professionals. |
| **11** | **Definition of Done (DoD)** | Informal completion | **9-Dimension Universal Definition of Done**: UI Visual Parity + State Machine + Backend Service + Database/Lineage + Offline Mode + Error Handling + Security + Automated Tests + Real-Device Validation. |
| **12** | **Milestone Gates** | Continuous rollout | **5 Strict Sequential Milestone Gates**: Gate 1 (Architecture) $\rightarrow$ Gate 2 (Tracking & SQLite) $\rightarrow$ Gate 3 (Resumable Sync) $\rightarrow$ Gate 4 (Athletic Intel & Social) $\rightarrow$ Gate 5 (Production & Real-Device Validation). |

---

## 3. Key Architectural Decisions (Summary of Record)

1. **Stitch UI as Uncompromised Visual Truth**: All screens, typography classes, and color tokens from Google Stitch are preserved.
2. **Network-Independent Local Persistence**: SQLite with Write-Ahead Logging (WAL) guarantees zero workout data loss and in-flight crash recovery upon app restart.
3. **Pristine Raw Data Preservation**: GPS coordinates, R-R heart rate intervals, and sensor timestamps are stored in immutable raw tables.
4. **Idempotent Resumable Sync**: Chunked uploading with deterministic UUIDv7 eliminates duplicate workouts and reduces mobile battery/data strain.
5. **Geospatial Privacy by Default**: 500m home and work privacy zones automatically clip public polylines server-side via PostGIS.

---

## 4. Remaining Risks & Mitigation Strategies

| Risk Factor | Impact | Engineered Mitigation |
| :--- | :--- | :--- |
| **OS Background Process Termination** | Android/iOS OEM battery managers kill long background workouts | Foreground service with persistent notification + wake-lock + SQLite WAL streaming on every 1 Hz GPS tick for immediate recovery. |
| **GPS Multipath Reflection / Urban Jitter** | False spikes in distance and pace in dense city blocks | Multi-factor kinematic filter + rolling Kalman filter + sport-specific acceleration ceilings. |
| **High Battery Drain during Multi-Hour Workouts** | Device shuts down mid-marathon | Adaptive GPS sampling rates when stationary + WebGL vertex buffer reuse for map polyline rendering. |
| **Network Interruption during Large Sync** | Large activity sync fails repeatedly | Resumable chunked upload with offset tracking in SQLite `local_sync_queue`. |

---

## 5. Milestone Gates & Phase 1 Prerequisites

### The 5 Milestone Gates
- **GATE 1: Architecture & Data Lineage (PASSED)** — Audit, PostgreSQL+PostGIS schema, Raw/Derived separation, Offline Map spec, API contracts, Security specs.
- **GATE 2: Core Tracking & Local Engine** — Location arbitrator (5 Quality states), multi-factor outlier rejector, SQLite WAL, in-flight recovery, auto-pause.
- **GATE 3: Resumable Synchronization Engine** — Chunked upload stream, offset recovery, UUIDv7 idempotency, retry backoff with jitter.
- **GATE 4: Athletic Intelligence & Social Subsystems** — Visual parity, Segments/PRs, Feed, Grounded AI Coach with Fitness Query Layer.
- **GATE 5: Production Readiness & Real-Device Validation** — 2-hour workout battery profiling, penetration defense, 16 real-device scenarios.

### Phase 1 Prerequisites (Ready for Execution)
1. Node.js & TypeScript development environment with strict typing.
2. PostgreSQL database with PostGIS 3.4+ extension enabled.
3. Redis instance for session token rotation and rate limiting.
4. Zod schema validation & Pino structured logging library configured.
