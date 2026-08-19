# RAFTAR — Synchronization Architecture & Resumable Outbox Engine

## 1. Sync Philosophy & Data Integrity

The synchronization subsystem bridges the local offline SQLite database and the PostgreSQL cloud backend. It guarantees:
1. **Zero Data Loss**: Raw and derived local records remain intact until the cloud returns a verified `HTTP 200/201` acknowledgment.
2. **Resumable Chunked Telemetry Streaming**: Large activities (e.g. 2-hour workout with 8,000+ points) upload in chunks of 500–1,000 points. If network is interrupted at 70%, the upload resumes at chunk index $K$ without re-uploading from point 0.
3. **Idempotency via Deterministic UUIDv7**: Client generates an immutable UUIDv7 for each activity session; re-transmissions are deduplicated server-side via `uq_user_client_activity`.
4. **Resilient Backoff**: Failed requests back off exponentially with randomized jitter to prevent thundering herd spikes.

---

## 2. Resumable Upload Lifecycle

```text
[LOCAL_COMPLETED]
       │
       ▼
[PREPARE_CHUNKS] (e.g., 8,000 points partitioned into 8 chunks of 1,000 pts)
       │
       ▼
[INITIATE_SYNC] ──► POST /api/v1/activities/sync/initiate
       │            Server registers transfer session; returns `upload_id` & `last_chunk_index`
       ▼
 ┌─────► [STREAM_CHUNK] (Upload chunk N with header: `X-Chunk-Index: N`)
 │              │
 │              ├── IF SUCCESS (HTTP 200) ──► Update local SQLite `uploaded_chunk_index = N`
 │              │                             ├── IF N < total_chunks ──► Next Chunk (Loop ↺)
 │              │                             └── IF N == total_chunks ──► [FINALIZE_SYNC]
 │              │
 │              └── IF NETWORK DROPS ────────► [PAUSE_TRANSFER]
 │                                                    │
 │                                                    ▼
 │                                             [RETRY_BACKOFF]
 │                                                    │ (Network Restored)
 └────────────────────────────────────────────────────┘ (Resume from chunk N+1)
```

---

## 3. Resumable Sync API Contract

### 3.1 Step 1: Initiate Transfer
`POST /api/v1/activities/sync/initiate`
- **Request Body**:
```json
{
  "client_local_id": "018e3c50-71a2-7b81-a36c-9c3f0b2f5678",
  "sport_type": "CYCLING",
  "title": "Mountain Ridge Loop",
  "start_time": "2026-08-19T06:00:00.000Z",
  "end_time": "2026-08-19T08:30:00.000Z",
  "total_points": 8420,
  "total_chunks": 9,
  "metrics": {
    "elapsed_duration_seconds": 9000,
    "moving_duration_seconds": 8400,
    "distance_meters": 54200.0,
    "avg_speed_mps": 6.45,
    "max_speed_mps": 18.2,
    "elevation_gain_meters": 820.0,
    "calories_burned": 1640
  }
}
```
- **Response**: `{"upload_id": "upl_89af7c...", "next_chunk_index": 0}` (or `next_chunk_index: 6` if resuming an interrupted session).

### 3.2 Step 2: Stream Chunks
`POST /api/v1/activities/sync/chunks`
- **Headers**:
  - `X-Upload-Id: upl_89af7c...`
  - `X-Chunk-Index: 6`
  - `X-Total-Chunks: 9`
- **Payload**: Array of points $[6000 \dots 6999]$ (each with timestamp, lat, lon, alt, speed, hr, cadence, power, `is_estimated`).
- **Response**: `{"status": "CHUNK_ACCEPTED", "acknowledged_index": 6}`.

### 3.3 Step 3: Finalize Activity
`POST /api/v1/activities/sync/finalize`
- Server verifies all chunks $[0 \dots 8]$ received, constructs PostGIS `route_geom` LineString, computes segment efforts, updates goals/challenges, and marks status `SYNCED`.
- Client receives `HTTP 200 OK`, updates local SQLite activity to `sync_state = 'SYNCED'`, and purges the item from `local_sync_queue`.

---

## 4. Conflict Resolution Matrix

| Entity | Conflict Scenario | Resolution Strategy |
| :--- | :--- | :--- |
| **Activity Telemetry** | Local workout vs Cloud server record | **Client-Authoritative**: The client holds the physical hardware sensors. Server accepts validated client telemetry. |
| **Lifetime Aggregates**| Total distance, streak count, PRs | **Server-Reconciled**: Cloud recalculates aggregates across all devices atomically. |
| **Social / Comments** | Concurrent replies / Kudos | **Append-Only CRDT**: Deduplicated by unique `(post_id, user_id)` constraint. |
| **Challenges & Goals** | Offline progress vs Global Leaderboard | **Server-Computed**: Uploaded activity distance automatically updates challenge progress atomically in PostgreSQL. |

---

## 5. Exponential Backoff with Jitter
$$T_{\text{wait}} = \min\left(T_{\text{max}}, T_{\text{base}} \times 2^{\text{retry\_count}}\right) + \text{random\_jitter}(0, 1000\text{ms})$$
- $T_{\text{base}} = 2\text{ seconds}$, $T_{\text{max}} = 300\text{ seconds}$
- Local workout telemetry remains 100% readable and accessible offline during retries.
