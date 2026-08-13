# RAFTAR — System Architecture Specification

## 1. Architectural Philosophy & Principles

1. **Network-Independent Offline Core**: Core activity recording (GNSS ingestion, elapsed/moving time, pace, distance, elevation gain/loss, heart rate sampling, split generation, and SQLite persistence) is completely self-contained on the client device. Internet connectivity is never a prerequisite for workout integrity.
2. **Grounded Intelligence with Strict Fitness Query Layer**: AI features (Coach Insights, Weekly/Monthly Analytics, Training Guidance) operate through a deterministic data retrieval layer. The LLM is strictly an analytical explainer, never an authoritative calculation engine.
3. **Medical & Health Safety Boundary**: RAFTAR provides athletic and fitness performance intelligence, not clinical medical diagnoses. The AI assistant strictly observes medical boundaries.
4. **Deterministic Geolocation & Decoupled Telemetry**: Raw sensor coordinate streams are immutable and cleanly decoupled from derived metrics, enabling retrospective metric recalculation when smoothing algorithms evolve.
5. **Resumable Outbox Synchronization**: Sync operations support chunked streaming, deterministic client UUIDv7 keys, and idempotent transfer recovery.

---

## 2. High-Level System Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT DEVICE (MOBILE / PWA)                       │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                STITCH PRESENTATION LAYER (React / Native)             │  │
│  │   Home Dashboard  •  Performance Analytics  •  Profile  •  Live HUD   │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│  ┌───────────────────────────────────▼───────────────────────────────────┐  │
│  │                 STATE MACHINE & SENSOR INGESTION LAYER                │  │
│  │   Location Engine: GNSS • Cell/Wi-Fi • IMU/Pedometer (Quality States) │  │
│  │   Multi-Factor Outlier Filter  •  Auto-Pause  •  Split Calculator     │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│  ┌───────────────────────────────────▼───────────────────────────────────┐  │
│  │                     OFFLINE STORAGE ENGINE (SQLite)                   │  │
│  │   Raw Points • Metrics • Splits • Offline Map Regions • Outbox        │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │ (Background Worker)                  │
│  ┌───────────────────────────────────▼───────────────────────────────────┐  │
│  │                   RESUMABLE IDEMPOTENT SYNC ENGINE                    │  │
│  │   Chunked Uploader • Network State Monitor • Conflict Resolver        │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │ HTTPS / WSS (When Online)
                                       │ (REST API + Chunked Telemetry)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                            CLOUD BACKEND SERVICES                           │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     API GATEWAY & SECURITY LAYER                      │  │
│  │   Rate Limiter  •  JWT Auth Middleware  •  Input Validation (Zod)     │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│  ┌───────────────────────────────────▼───────────────────────────────────┐  │
│  │                        MODULAR SERVICE DOMAINS                        │  │
│  │   Auth Service      •  Activity Service   •  Segment & PR Engine      │  │
│  │   Social & Clubs    •  Challenge Service  •  Weather / AQI            │  │
│  │   Safety Beacon     •  Notifications      •  Grounded AI Coach        │  │
│  └───────────────────┬───────────────────────┬───────────────────────────┘  │
│                      │                       │                              │
│  ┌───────────────────▼────────────┐     ┌────▼───────────────────────────┐  │
│  │    CACHING & TRANSIENT DATA    │     │   OBJECT STORAGE (S3 / GCS)    │  │
│  │    Redis (Tokens, Feed Cache,  │     │   User Avatars, Activity Map   │  │
│  │    Leaderboards, Rate Limits)  │     │   Thumbnails, Route Snapshots  │  │
│  └───────────────────┬────────────┘     └────────────────────────────────┘  │
│                      │                                                      │
│  ┌───────────────────▼───────────────────────────────────────────────────┐  │
│  │                   PRIMARY DATABASE: PostgreSQL + PostGIS              │  │
│  │   [Raw Points] • [Derived Metrics] • [Spatial Geometries & Indexes]   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Grounded AI Coach Architecture & Safety Boundary

### 3.1 Tiered Intelligence Pipeline
The LLM does **not** query raw tables directly, nor does it perform mathematical aggregations:

```text
User Question (e.g. "How was my August training compared to July?")
      │
      ▼
[ 1. INTENT DETECTION & PARAMETER EXTRACTION ]
      │ (Intent: COMPARE_PERIODS, Range: 2026-08 vs 2026-07)
      ▼
[ 2. DETERMINISTIC FITNESS QUERY LAYER ]
      │ (Executes verified SQL / TS aggregations over derived metrics)
      │ Returns structured JSON:
      │ {
      │   "august": { "distance_km": 112.4, "activities": 18, "avg_pace": "6:14/km", "tss": 482 },
      │   "july":   { "distance_km": 96.2,  "activities": 15, "avg_pace": "6:22/km", "tss": 410 },
      │   "delta":  { "distance_pct": +16.8, "pace_gain_sec": -8 }
      │ }
      ▼
[ 3. CONTEXT INJECTION & SYSTEM PROMPT ENFORCEMENT ]
      │ Injects validated metrics + athlete profile + medical boundary rules
      ▼
[ 4. LLM REASONING & NATURAL EXPLANATION ]
      │ Synthesizes insights, highlights progress, recommends rest periods
      ▼
[ 5. GROUNDED RESPONSE TO ATHLETE ]
```

### 3.2 Medical & Health Safety Policy
1. **Explicit Role**: The assistant acts as an athletic coach analyzing training load, recovery, and pacing.
2. **Prohibited Outputs**:
   - ❌ Diagnosing medical conditions (e.g. cardiac arrhythmia, asthma, stress fractures).
   - ❌ Prescribing medication, clinical diets, or rehabilitation programs.
3. **Mandatory Guardrail**: If abnormal physiological patterns are detected (e.g. extreme heart rate spike $>210\text{ bpm}$ or severe acute fatigue index):
   - ✅ *"Your heart rate pattern during Thursday's threshold run exhibited an unusual spike compared to your historical baseline. Consider reducing training intensity, taking adequate rest, and consulting a qualified medical professional if you experience symptoms like dizziness or chest discomfort."*
