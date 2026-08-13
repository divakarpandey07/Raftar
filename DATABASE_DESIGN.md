# RAFTAR — Database Design & Data Lineage Specification

## 1. Architectural Principle: Raw vs. Derived Separation

A foundational design rule of RAFTAR is the **strict decoupling of Raw Telemetry from Derived Athletic Metrics**:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           IMMUTABLE RAW TELEMETRY                           │
│  • Raw GNSS Coordinates (Lat, Lon, Alt) • Raw Hardware Timestamps (Epoch)   │
│  • Sensor Accuracy (HDOP, VDOP)         • Instantaneous Sensor Samples      │
│  • Heart Rate Samples (R-R Intervals)   • Raw Cadence & Power Stream        │
│  • IMU Acceleration & Gyro Samples      • Raw Barometric Pressure           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼ (Deterministic Processing Pipeline)
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DERIVED ATHLETIC METRICS                          │
│  • Total & Moving Distance              • Elapsed & Moving Duration         │
│  • Rolling Average Pace / Speed         • Filtered Elevation Gain / Loss    │
│  • 1 km / 1 Mile Split Intervals        • Training Stress Score (TSS)       │
│  • Heart Rate Zones (Z1 - Z5)           • Calories Burned Estimate          │
│  • Personal Records (PRs)               • Matched Segment Efforts           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Separation is Mandatory:
1. **Non-Destructive Algorithm Evolution**: If pace smoothing or elevation filtering algorithms are updated in future versions, existing workouts can be reprocessed from pristine raw points without telemetry loss.
2. **Auditability & Anti-Cheat**: Leaderboard validations and segment PRs can always be re-verified against raw GNSS physics.
3. **Storage Tiering**: Raw high-frequency coordinate streams (1 Hz) can be archived to cold storage / compressed chunks after 90 days, while derived summary metrics remain permanently indexed in fast PostgreSQL relational storage.

---

## 2. PostgreSQL + PostGIS Server Schema

### 2.1 Complete Relational & Spatial Schema

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 1. USERS & PROFILES
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    apple_id VARCHAR(255) UNIQUE,
    email_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100) NOT NULL,
    handle VARCHAR(50) UNIQUE NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    level_tier VARCHAR(20) DEFAULT 'L1 // ROOKIE',
    weight_kg NUMERIC(5,2),
    height_cm NUMERIC(5,2),
    resting_hr INT,
    max_hr INT,
    vo2_max NUMERIC(4,1),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PRIVACY & SAFETY
CREATE TABLE privacy_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_activity_privacy VARCHAR(20) DEFAULT 'PUBLIC' CHECK (default_activity_privacy IN ('PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE')),
    hide_heart_rate BOOLEAN DEFAULT FALSE,
    hide_power BOOLEAN DEFAULT FALSE,
    privacy_zones_enabled BOOLEAN DEFAULT TRUE,
    home_zone_center GEOMETRY(Point, 4326),
    home_zone_radius_meters INT DEFAULT 500,
    work_zone_center GEOMETRY(Point, 4326),
    work_zone_radius_meters INT DEFAULT 500,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE safety_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    notify_on_start BOOLEAN DEFAULT TRUE,
    notify_on_sos BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ACTIVITIES (Metadata Root)
CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_local_id VARCHAR(100) NOT NULL,
    sport_type VARCHAR(30) NOT NULL CHECK (sport_type IN ('RUNNING', 'CYCLING', 'WALKING', 'HIKING', 'GENERAL_FITNESS')),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    privacy VARCHAR(20) DEFAULT 'PUBLIC' CHECK (privacy IN ('PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE')),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    route_geom GEOMETRY(LineStringM, 4326), -- PostGIS Spatial Line (M = epoch seconds)
    start_point GEOMETRY(Point, 4326),
    end_point GEOMETRY(Point, 4326),
    device_info JSONB,
    weather_snapshot JSONB,
    sync_status VARCHAR(20) DEFAULT 'SYNCED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_user_client_activity UNIQUE (user_id, client_local_id)
);

-- 4. [RAW] TIME-SERIES TELEMETRY POINTS (Immutable Hardware Data)
CREATE TABLE activity_raw_points (
    id BIGSERIAL PRIMARY KEY,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    point_index INT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    coordinate GEOMETRY(PointZ, 4326) NOT NULL, -- Lat, Lon, Raw Altitude
    speed_mps NUMERIC(6,2),
    accuracy_meters NUMERIC(5,2),
    heart_rate INT,
    cadence INT,
    power_watts INT,
    is_estimated BOOLEAN DEFAULT FALSE -- Flagged true if dead-reckoned
);

-- 5. [DERIVED] ACTIVITY METRICS (Computed Summaries)
CREATE TABLE activity_metrics (
    activity_id UUID PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
    elapsed_duration_seconds INT NOT NULL,
    moving_duration_seconds INT NOT NULL,
    distance_meters NUMERIC(10,2) NOT NULL,
    avg_speed_mps NUMERIC(6,2) NOT NULL,
    max_speed_mps NUMERIC(6,2) NOT NULL,
    avg_pace_sec_km INT NOT NULL,
    elevation_gain_meters NUMERIC(8,2) DEFAULT 0,
    elevation_loss_meters NUMERIC(8,2) DEFAULT 0,
    calories_burned INT,
    avg_hr INT,
    max_hr INT,
    hr_zone_1_seconds INT DEFAULT 0,
    hr_zone_2_seconds INT DEFAULT 0,
    hr_zone_3_seconds INT DEFAULT 0,
    hr_zone_4_seconds INT DEFAULT 0,
    hr_zone_5_seconds INT DEFAULT 0,
    avg_cadence INT,
    avg_power_watts INT,
    tss_score INT,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    algorithm_version VARCHAR(20) DEFAULT 'v1.0'
);

-- 6. [DERIVED] ACTIVITY SPLITS (Kilometer / Mile intervals)
CREATE TABLE activity_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    split_number INT NOT NULL,
    distance_meters NUMERIC(8,2) NOT NULL,
    duration_seconds INT NOT NULL,
    avg_pace_sec_km INT NOT NULL,
    elevation_change_meters NUMERIC(6,2),
    avg_heart_rate INT
);

-- 7. SEGMENTS & [DERIVED] SEGMENT EFFORTS
CREATE TABLE segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    sport_type VARCHAR(30) NOT NULL,
    distance_meters NUMERIC(10,2) NOT NULL,
    avg_grade_pct NUMERIC(5,2),
    geom GEOMETRY(LineString, 4326) NOT NULL,
    start_point GEOMETRY(Point, 4326) NOT NULL,
    end_point GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE segment_efforts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    elapsed_time_seconds INT NOT NULL,
    avg_speed_mps NUMERIC(6,2) NOT NULL,
    avg_hr INT,
    avg_power_watts INT,
    is_pr BOOLEAN DEFAULT FALSE,
    rank_overall INT,
    recorded_at TIMESTAMPTZ NOT NULL
);

-- 8. GOALS & ACHIEVEMENTS
CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_type VARCHAR(30) NOT NULL,
    sport_type VARCHAR(30),
    target_value NUMERIC(10,2) NOT NULL,
    current_value NUMERIC(10,2) DEFAULT 0,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_achieved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE achievements (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(30) NOT NULL,
    badge_icon VARCHAR(50) NOT NULL,
    criteria JSONB NOT NULL
);

CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(50) NOT NULL REFERENCES achievements(id),
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    trigger_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    CONSTRAINT uq_user_achievement UNIQUE (user_id, achievement_id)
);

-- 9. SOCIAL GRAPH, POSTS, CLUBS, CHALLENGES
CREATE TABLE followers (
    follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'ACCEPTED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    content TEXT,
    media_urls TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reactions (
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reaction_type VARCHAR(30) DEFAULT 'KUDOS',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE clubs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    avatar_url TEXT,
    cover_photo_url TEXT,
    sport_type VARCHAR(30) NOT NULL,
    is_private BOOLEAN DEFAULT FALSE,
    owner_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE club_members (
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    user_id REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (club_id, user_id)
);

CREATE TABLE challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    challenge_type VARCHAR(30) NOT NULL,
    target_value NUMERIC(10,2) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    badge_id VARCHAR(50) REFERENCES achievements(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE challenge_members (
    challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    current_progress NUMERIC(10,2) DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (challenge_id, user_id)
);

-- 10. AI CONVERSATIONS & FITNESS METRIC AUDIT LOG
CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_title VARCHAR(100) DEFAULT 'AI Coach Consultation',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    sender VARCHAR(10) NOT NULL CHECK (sender IN ('USER', 'ASSISTANT', 'SYSTEM')),
    content TEXT NOT NULL,
    grounding_data JSONB, -- Validated metrics injected into context
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notification_type VARCHAR(40) NOT NULL,
    entity_id UUID,
    entity_type VARCHAR(30),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SPATIAL & PERFORMANCE INDEXES
CREATE INDEX idx_activities_user_start ON activities(user_id, start_time DESC);
CREATE INDEX idx_activities_geom ON activities USING GIST(route_geom);
CREATE INDEX idx_activities_start_point ON activities USING GIST(start_point);
CREATE INDEX idx_raw_points_act_idx ON activity_raw_points(activity_id, point_index ASC);
CREATE INDEX idx_segments_geom ON segments USING GIST(geom);
CREATE INDEX idx_segment_efforts_segment_time ON segment_efforts(segment_id, elapsed_time_seconds ASC);
CREATE INDEX idx_posts_user_created ON posts(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
```

---

## 3. Client-Side SQLite Schema (Offline Database)

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Local Activities Root
CREATE TABLE IF NOT EXISTS local_activities (
    local_id TEXT PRIMARY KEY,          -- Client UUIDv7
    server_id TEXT,                    -- Set once synced
    sport_type TEXT NOT NULL,
    title TEXT NOT NULL,
    privacy TEXT DEFAULT 'PUBLIC',
    status TEXT NOT NULL,              -- 'RECORDING', 'PAUSED', 'COMPLETED'
    start_time INTEGER NOT NULL,       -- Epoch ms
    end_time INTEGER,
    sync_state TEXT DEFAULT 'PENDING'  -- 'PENDING', 'SYNCING', 'SYNCED', 'FAILED'
);

-- [RAW] Local Time-series Points
CREATE TABLE IF NOT EXISTS local_raw_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_activity_id TEXT NOT NULL,
    point_index INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude REAL,
    speed REAL,
    accuracy REAL,
    heart_rate INTEGER,
    is_estimated INTEGER DEFAULT 0,
    FOREIGN KEY(local_activity_id) REFERENCES local_activities(local_id) ON DELETE CASCADE
);

-- [DERIVED] Local Summary Metrics
CREATE TABLE IF NOT EXISTS local_activity_metrics (
    local_activity_id TEXT PRIMARY KEY,
    elapsed_seconds INTEGER DEFAULT 0,
    moving_seconds INTEGER DEFAULT 0,
    distance_meters REAL DEFAULT 0,
    avg_speed_mps REAL DEFAULT 0,
    max_speed_mps REAL DEFAULT 0,
    avg_pace_sec_km INTEGER DEFAULT 0,
    elevation_gain_meters REAL DEFAULT 0,
    elevation_loss_meters REAL DEFAULT 0,
    calories INTEGER DEFAULT 0,
    avg_hr INTEGER DEFAULT 0,
    max_hr INTEGER DEFAULT 0,
    FOREIGN KEY(local_activity_id) REFERENCES local_activities(local_id) ON DELETE CASCADE
);

-- [DERIVED] Local Splits
CREATE TABLE IF NOT EXISTS local_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_activity_id TEXT NOT NULL,
    split_number INTEGER NOT NULL,
    distance_meters REAL NOT NULL,
    duration_seconds INTEGER NOT NULL,
    avg_pace_sec_km INTEGER NOT NULL,
    elevation_diff REAL,
    FOREIGN KEY(local_activity_id) REFERENCES local_activities(local_id) ON DELETE CASCADE
);

-- Resumable Sync Outbox Queue
CREATE TABLE IF NOT EXISTS local_sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,         -- 'ACTIVITY', 'POST', 'GOAL'
    local_id TEXT NOT NULL UNIQUE,
    payload TEXT NOT NULL,             -- JSON encoded payload
    uploaded_chunk_index INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 1,
    retry_count INTEGER DEFAULT 0,
    last_attempt INTEGER,
    status TEXT DEFAULT 'PENDING',     -- 'PENDING', 'UPLOADING', 'FAILED'
    error_message TEXT
);
```
