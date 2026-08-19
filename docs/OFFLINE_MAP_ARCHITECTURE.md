# RAFTAR — Offline Map Architecture Specification

## 1. Core Principle & Isolation Rule

> **Isolation Guarantee**: The map visualization layer is strictly an observational consumer of the tracking engine. If no internet connection exists and no offline map region has been downloaded, the core recording engine (GPS collection, distance, pace, splits, heart rate, elevation, auto-pause) **continues to function with 100% integrity**. A missing map tile will never fail, pause, or corrupt an active workout.

```text
                     [ GNSS HARDWARE / SENSORS ]
                                  │
                                  ▼
                    [ TRACKING ENGINE & SQLite ]
                                  │
                                  ▼
                ┌───────────────────────────────────┐
                │        MAP VIEWPORT RENDERER      │
                │                                   │
                │   Downloaded Region Available?    │
                │   ├── YES ──► Render Local Vector │
                │   │           Tiles + Live Route  │
                │   │                               │
                │   └── NO  ──► Render Tactical     │
                │               Grid Canvas +       │
                │               Live Route Polyline │
                └───────────────────────────────────┘
```

---

## 2. Map Technology & Tile Specification

### 2.1 Provider & Vector Format
- **Vector Engine**: MapLibre Native / Mapbox GL Native.
- **Tile Format**: Vector Tiles (`.mvt` / `.pbf` Protocol Buffers) packaged in local **MBTiles** (SQLite-based single file containers) or directory-structured caches.
- **Style Specification**: Custom RAFTAR Dark Tactical / High-Contrast Minimalist style matching the Stitch palette:
  - Background Land: `#fff8f6` (Light) / `#1a1c1e` (Dark)
  - Road Grid: `#e4beb4` / `#454749`
  - Route Polyline: `#FF5722` (Saffron Vibrant, 4px width, drop shadow `#FF8A65`)
  - Live Position Node: `#FF5722` kinetic pulse ring with directional heading cone.

---

## 3. Offline Region Management

### 3.1 Region Bounding Box & Zoom Levels
Users can download geographic bounds (e.g. City, National Park, Trail Route):
- **Zoom Range**: Levels 10 (City Overview) to 16 (Trail/Street level precision).
- **Size Bounds**: Average city region (25 km x 25 km, Zoom 10–15) $\approx 45\text{ MB} - 120\text{ MB}$.
- **Storage Limit**: Configurable user quota (e.g. Max 2 GB for offline maps).

### 3.2 Offline Map Metadata Schema (SQLite)

```sql
CREATE TABLE IF NOT EXISTS local_offline_map_regions (
    id TEXT PRIMARY KEY,               -- UUIDv7
    name TEXT NOT NULL,                -- e.g. "South Mumbai & Marine Drive"
    min_lat REAL NOT NULL,
    max_lat REAL NOT NULL,
    min_lon REAL NOT NULL,
    max_lon REAL NOT NULL,
    min_zoom INTEGER DEFAULT 10,
    max_zoom INTEGER DEFAULT 16,
    file_path TEXT NOT NULL,           -- Local absolute path to .mbtiles file
    size_bytes INTEGER NOT NULL,
    tile_count INTEGER NOT NULL,
    download_status TEXT NOT NULL,     -- 'DOWNLOADING', 'READY', 'FAILED', 'UPDATING'
    download_progress REAL DEFAULT 0,  -- 0.0 to 100.0%
    downloaded_at INTEGER NOT NULL,    -- Timestamp
    expires_at INTEGER                 -- 90-day refresh cycle
);

CREATE INDEX IF NOT EXISTS idx_map_regions_bounds 
ON local_offline_map_regions(min_lat, max_lat, min_lon, max_lon);
```

---

## 4. Tile Caching, Eviction & Lifecycle

1. **Active Tile Cache (LRU)**: In-memory tile cache of 100 MB for recently rendered tiles during panning/zooming.
2. **Persistent MBTiles Container**: Downloaded regions reside in app sandbox storage (`/data/user/0/app.raftar/files/maps/`).
3. **Region Deletion**: Athlete can delete downloaded maps at any time via Settings $\rightarrow$ Offline Storage, reclaiming disk space without affecting recorded activity histories.
4. **Tile Expiry & Versioning**: Vector tile sets carry schema versioning. When online and on Wi-Fi, background sync checks for updated road/trail vector diffs if the tile set is $>90\text{ days}$ old.

---

## 5. Live Polyline Optimization on Viewport

To maintain smooth 60/120 FPS rendering on workouts with $>10,000$ points:
- **Douglas-Peucker Simplification**: Applied dynamically based on current viewport zoom level:
  $$\epsilon = \frac{\text{Viewport Resolution}}{2^{\text{zoom}}}$$
- **Vertex Buffer Reuse**: WebGL/Metal vertex buffer streaming avoids recreating polyline geometry on every 1 Hz GPS tick; new points are appended to the active coordinate buffer.
