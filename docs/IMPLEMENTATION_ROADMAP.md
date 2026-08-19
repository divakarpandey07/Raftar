# RAFTAR — Implementation Roadmap, Definition of Done & Milestone Gates

## 1. Milestone Gate Governance (Strict Enforcement)

Progressing across phases is strictly governed by **5 Sequential Milestone Gates**. If a gate fails its verification criteria, implementation cannot jump forward to subsequent gates.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ GATE 1: Architecture & Data Lineage                                         │
│ • Audit Approved • PostgreSQL+PostGIS Schema • Raw/Derived Decoupled        │
│ • Offline Map Spec • API Contracts (RFC 7807) • Security & Privacy Specs    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                     ▼ (Gate Passed)                         │
│ GATE 2: Core Tracking & Local Engine                                        │
│ • Location Intelligence (5 States) • Multi-Factor Outlier Rejector          │
│ • Local SQLite with WAL • In-Flight Crash Recovery • Split & Auto-Pause     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                     ▼ (Gate Passed)                         │
│ GATE 3: Resumable Synchronization Engine                                    │
│ • Chunked Upload Stream • Offset Recovery • Deterministic UUIDv7            │
│ • Idempotent Duplicate Prevention • Exponential Backoff with Jitter         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                     ▼ (Gate Passed)                         │
│ GATE 4: Athletic Intelligence & Social Subsystems                           │
│ • Stitch Visual Parity • Segments & PRs • Scalable Feed & Clubs             │
│ • Grounded AI Coach (Fitness Query Layer) • Medical Boundary Guardrails     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                     ▼ (Gate Passed)                         │
│ GATE 5: Production Readiness & Real-Device Validation                       │
│ • 2-Hour Battery Profile • Penetration Defense • 16 Real-Device Scenarios   │
│ • Zero Data Loss Validation • Final Production Readiness Sign-Off           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Universal "Definition of Done" (DoD)

A feature or phase is **DONE** only when all 9 dimensions are satisfied:

$$\text{FEATURE DONE} = \text{UI Visual Parity} + \text{State Machine} + \text{Backend Service} + \text{Database/Lineage} + \text{Offline Mode} + \text{Error Handling} + \text{Security} + \text{Automated Tests} + \text{Real-Device Verification}$$

### Comprehensive DoD Checklist for Every Major Module:
- [ ] **UI Visual Parity**: Matches approved Stitch design (typography, colors, tokens, spacing, component hierarchy, animations, icons).
- [ ] **State Model**: State transitions handled deterministically with no unhandled edge cases.
- [ ] **Backend Service**: Separation of Controller, Service, Repository, and Validation schemas (Zod).
- [ ] **Database & Lineage**: Migrations written with indexes, foreign keys, and raw/derived separation.
- [ ] **Offline Execution**: Operates without internet; changes persisted to local SQLite WAL database.
- [ ] **Error Handling**: Graceful degradation, informative user feedback, and structured logging.
- [ ] **Security & Privacy**: Server-side authorization, input sanitization, and coordinate privacy masking where applicable.
- [ ] **Automated Tests**: Unit and integration test coverage $\ge 85\%$ for critical business logic.
- [ ] **Real-Device Validation**: Verified under realistic device constraints (background execution, process restart, poor signal).

---

## 3. Detailed Phase Breakdown (Phases 1 — 34)

### Gate 1: Foundation, Database & Specifications (Phases 1–3)
- **Phase 1: Backend Foundation**: TypeScript, Node.js, REST API structure, Pino logger, validation middleware, Redis.
- **Phase 2: PostgreSQL + PostGIS Database**: 25 tables, spatial GIST indexes, immutable raw points vs derived metrics.
- **Phase 3: Authentication & Privacy**: JWT token family rotation in Redis, argon2id password hashing, 500m geofence exclusion.

### Gate 2: Network-Independent Core & Local Persistence (Phases 4–8)
- **Phase 4: Offline SQLite Database**: WAL journaling, local raw points, derived metrics, splits, sync queue.
- **Phase 5: GNSS Geolocation Engine**: Location arbitrator (5 Quality states: `HIGH_ACCURACY` to `UNAVAILABLE`).
- **Phase 6: Multi-Factor Outlier Rejector**: Multi-factor physical validation ($v_{\max}$, $a_{\max}$, $\Delta \theta$, accuracy, sport thresholds).
- **Phase 7: Activity Processing Engine**: Haversine distance, rolling pace, elevation smoothing, R-R heart rate zones, TSS.
- **Phase 8: Intelligent Auto-Pause**: Rolling 3s speed thresholding per sport; auto-pause state reflection in HUD.

### Gate 3: Resumable Synchronization (Phase 25)
- **Phase 25: Resumable Sync Engine**: Chunked telemetry streaming (500–1000 pts/chunk), offset recovery, UUIDv7 deduplication.

### Gate 4: Athletic Intelligence, Maps & Community (Phases 9–24)
- **Phase 9: Activity Details Screen**: Stitch visual parity, interactive pace/elevation graphs, split breakdowns.
- **Phase 10: High-Performance Map Engine**: Vector tile rendering (MBTiles), offline map region downloads, route overlays.
- **Phase 11: Segments & Efforts Engine**: PostGIS spatial matching, leaderboards, personal best effort detection.
- **Phase 12: Personal Records (PR) Engine**: Sport-specific best times (1K, 5K, 10K, Half Marathon, Longest Ride).
- **Phase 13: Goals Engine**: Weekly/monthly/annual distance and duration trackers with local reconciliation.
- **Phase 14: Event-Driven Achievements**: Badge unlock triggers, Centurion streaks, milestone notifications.
- **Phase 15: Social Graph**: Follower/following relationships, privacy-filtered profile views.
- **Phase 16: Scalable Feed**: Cursor-paginated timeline, Kudos reactions, threaded comments.
- **Phase 17: Clubs**: Club roles (Owner, Admin, Member), group challenges, private activity streams.
- **Phase 18: Challenges**: Distance/elevation/streak challenges, real-time progress calculations.
- **Phase 19: Leaderboards**: Filtered rankings (Global, Friends, Age Category, Sport).
- **Phase 20–21: Grounded AI Coach & Memory**: Deterministic Fitness Query Layer, validated metrics context injection, medical safety guardrails.
- **Phase 22: Environmental Telemetry**: Weather conditions and AQI snapshotting at activity start/end coordinates.
- **Phase 23: Safety Beacon**: Ephemeral live tracking tokens, emergency contact SMS/push triggers.
- **Phase 24: Notifications Subsystem**: In-app and push notification delivery.

### Gate 5: Production Hardening, Real-Device Testing & Launch (Phases 26–34)
- **Phase 26: Battery Optimization**: Adaptive GPS polling, WebGL vertex buffer reuse, background thread tuning.
- **Phase 27: Performance Profiling**: SQLite query optimization, startup time $<800\text{ms}$, 60/120 FPS polyline rendering.
- **Phase 28: Security Hardening**: OWASP Top 10 review, rate limiting, EXIF stripping on media uploads.
- **Phase 29: Automated Testing Suite**: End-to-end integration tests (Offline $\rightarrow$ Record $\rightarrow$ Crash $\rightarrow$ Sync $\rightarrow$ Cloud).
- **Phase 30: Real-Device 16-Scenario Testing**: Airplane mode, GPS drops, incoming phone call, backgrounding, low battery, 2-hour workout.
- **Phase 31: Stitch UI End-to-End Integration**: Real state stores attached across all screens with loading, empty, offline, error states.
- **Phase 32: Branding & Assets**: App icon, splash graphics, vector assets integrated.
- **Phase 33: Non-Blocking Launch**: Startup session check and local DB read without network blocking.
- **Phase 34: Final Production QA**: Comprehensive audit report (`FINAL_IMPLEMENTATION_AUDIT.md`) and deployment sign-off.
