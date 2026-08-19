-- ============================================================================
-- RAFTAR PRODUCTION DATABASE SCHEMA (POSTGRESQL 16+ WITH POSTGIS 3.4+)
-- Strict Raw Telemetry vs. Derived Metrics Decoupling
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
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

-- 2. PROFILES
CREATE TABLE IF NOT EXISTS profiles (
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

-- 3. PRIVACY SETTINGS
CREATE TABLE IF NOT EXISTS privacy_settings (
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

-- 4. SAFETY CONTACTS
CREATE TABLE IF NOT EXISTS safety_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    notify_on_start BOOLEAN DEFAULT TRUE,
    notify_on_sos BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ACTIVITIES (Root Activity Session Metadata)
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_local_id VARCHAR(100) NOT NULL,
    sport_type VARCHAR(30) NOT NULL CHECK (sport_type IN ('RUNNING', 'CYCLING', 'WALKING', 'HIKING', 'GENERAL_FITNESS')),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    privacy VARCHAR(20) DEFAULT 'PUBLIC' CHECK (privacy IN ('PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE')),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    route_geom GEOMETRY(LineStringM, 4326),
    start_point GEOMETRY(Point, 4326),
    end_point GEOMETRY(Point, 4326),
    device_info JSONB,
    weather_snapshot JSONB,
    sync_status VARCHAR(20) DEFAULT 'SYNCED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_user_client_activity UNIQUE (user_id, client_local_id)
);

-- 6. [RAW] TIME-SERIES GPS TELEMETRY POINTS (Pristine Hardware Stream)
CREATE TABLE IF NOT EXISTS activity_raw_points (
    id BIGSERIAL PRIMARY KEY,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    point_index INT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    coordinate GEOMETRY(PointZ, 4326) NOT NULL,
    speed_mps NUMERIC(6,2),
    accuracy_meters NUMERIC(5,2),
    heart_rate INT,
    cadence INT,
    power_watts INT,
    is_estimated BOOLEAN DEFAULT FALSE
);

-- 7. [DERIVED] ACTIVITY METRICS (Computed Summaries & Load)
CREATE TABLE IF NOT EXISTS activity_metrics (
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

-- 8. [DERIVED] ACTIVITY SPLITS
CREATE TABLE IF NOT EXISTS activity_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    split_number INT NOT NULL,
    distance_meters NUMERIC(8,2) NOT NULL,
    duration_seconds INT NOT NULL,
    avg_pace_sec_km INT NOT NULL,
    elevation_change_meters NUMERIC(6,2),
    avg_heart_rate INT
);

-- 9. ROUTES & SAVED ROUTES
CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    sport_type VARCHAR(30) NOT NULL,
    distance_meters NUMERIC(10,2) NOT NULL,
    elevation_gain_meters NUMERIC(8,2),
    estimated_duration_seconds INT,
    difficulty VARCHAR(20) CHECK (difficulty IN ('EASY', 'MODERATE', 'HARD', 'EXTREME')),
    surface_type VARCHAR(30),
    geom GEOMETRY(LineString, 4326) NOT NULL,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_routes (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, route_id)
);

-- 10. SEGMENTS & SEGMENT EFFORTS
CREATE TABLE IF NOT EXISTS segments (
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

CREATE TABLE IF NOT EXISTS segment_efforts (
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

-- 11. GOALS & ACHIEVEMENTS
CREATE TABLE IF NOT EXISTS goals (
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

CREATE TABLE IF NOT EXISTS achievements (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(30) NOT NULL,
    badge_icon VARCHAR(50) NOT NULL,
    criteria JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(50) NOT NULL REFERENCES achievements(id),
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    trigger_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    CONSTRAINT uq_user_achievement UNIQUE (user_id, achievement_id)
);

-- 12. SOCIAL GRAPH: FOLLOWERS, POSTS, COMMENTS, REACTIONS
CREATE TABLE IF NOT EXISTS followers (
    follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'ACCEPTED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    content TEXT,
    media_urls TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reactions (
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reaction_type VARCHAR(30) DEFAULT 'KUDOS',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

-- 13. CLUBS & CHALLENGES
CREATE TABLE IF NOT EXISTS clubs (
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

CREATE TABLE IF NOT EXISTS club_members (
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS challenges (
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

CREATE TABLE IF NOT EXISTS challenge_members (
    challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    current_progress NUMERIC(10,2) DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (challenge_id, user_id)
);

-- 14. GEAR
CREATE TABLE IF NOT EXISTS gear (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    gear_type VARCHAR(30) NOT NULL CHECK (gear_type IN ('SHOES', 'BIKE', 'WATCH', 'OTHER')),
    brand VARCHAR(50),
    model VARCHAR(50),
    total_distance_meters NUMERIC(10,2) DEFAULT 0,
    max_distance_meters NUMERIC(10,2) DEFAULT 400000,
    is_retired BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. AI CONVERSATIONS & MEMORY
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_title VARCHAR(100) DEFAULT 'AI Coach Consultation',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    sender VARCHAR(10) NOT NULL CHECK (sender IN ('USER', 'ASSISTANT', 'SYSTEM')),
    content TEXT NOT NULL,
    grounding_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
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

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_activities_user_start ON activities(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_activities_geom ON activities USING GIST(route_geom);
CREATE INDEX IF NOT EXISTS idx_activities_start_point ON activities USING GIST(start_point);
CREATE INDEX IF NOT EXISTS idx_raw_points_act_idx ON activity_raw_points(activity_id, point_index ASC);
CREATE INDEX IF NOT EXISTS idx_segments_geom ON segments USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_segment_time ON segment_efforts(segment_id, elapsed_time_seconds ASC);
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
