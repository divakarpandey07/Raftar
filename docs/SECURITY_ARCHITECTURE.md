# RAFTAR — Security Architecture & Privacy Specification

## 1. Threat Model & Security Objectives

RAFTAR processes sensitive physical telemetry: precise geospatial location histories, heart rate rhythms, medical indicators (VO2 Max, HRV), and home/work starting points.

### Primary Security Objectives:
1. **Location Obfuscation**: Protect athlete home, school, and workplace locations from inadvertent exposure on public feeds.
2. **Strict Multi-Tier Authorization**: Enforce privacy rules (`PUBLIC`, `FOLLOWERS_ONLY`, `PRIVATE`) server-side in database queries.
3. **Cryptographic Integrity**: Protect authentication tokens, safety beacon links, and media uploads with industry-standard cryptography.

---

## 2. Geospatial Privacy Protection & Coordinate Masking

### 2.1 Privacy Exclusion Zones
Users can define privacy geofences (e.g. 500m radius around Home or Work).
- **Rule**: When an activity starts or terminates within a designated privacy zone, the server automatically clips the published geometry.
- **SQL Implementation**:
```sql
-- PostGIS: Clip route polyline outside user's 500m home privacy zone
SELECT ST_Difference(
    activity.route_geom,
    ST_Buffer(privacy.home_zone_center::geography, privacy.home_zone_radius_meters)::geometry
) AS sanitized_public_geom
FROM activities activity
JOIN privacy_settings privacy ON activity.user_id = privacy.user_id
WHERE activity.id = $1;
```
- The original unclipped geometry is encrypted and visible **only** to the activity creator on their private dashboard.

---

## 3. Authentication & Token Management

```text
Client Login Request ──► [API Auth Controller]
                                │
                                ▼
                       Argon2id Hash Verify
                                │
                                ▼
                  Generate Token Pair via Redis
                   ├── Access Token (JWT, 15-min lifetime)
                   └── Refresh Token (UUIDv4, 30-day lifetime, HttpOnly cookie)
```

- **Access Tokens**: Short-lived (15 minutes), signed with RS256 / Ed25519.
- **Refresh Token Rotation**: Each refresh exchange invalidates the previous refresh token in Redis; if a revoked token is used, the entire token family is immediately purged (detecting token theft).

---

## 4. Rate Limiting & Abuse Prevention

Implemented via Redis Token Bucket algorithm:
- **Public Endpoints (`/auth/login`, `/auth/register`)**: Max 5 requests / minute per IP.
- **Sync Endpoints (`/activities/sync`)**: Max 30 requests / minute per authenticated user.
- **General Read Endpoints (`/feed`, `/activities`)**: Max 120 requests / minute per user.
- **AI Coach Queries (`/ai/chat`)**: Max 15 queries / hour per user to manage LLM compute costs and prevent scraping.

---

## 5. OWASP Top 10 Safeguards

1. **SQL Injection (SQLi)**: 100% parameterized SQL queries via Kysely / TypeORM; zero raw string concatenation for PostGIS geometry filters.
2. **Cross-Site Scripting (XSS)**: Strict Content-Security-Policy headers; React sanitization on all user comments and bio fields.
3. **Cross-Site Request Forgery (CSRF)**: SameSite=Lax/Strict cookie policies on refresh tokens with Anti-CSRF token verification on state-modifying requests.
4. **Media Upload Security**: Activity photos and avatars pass through magic-byte inspection (verifying JPEG/PNG/WebP format), stripped of EXIF GPS metadata before persisting to Object Storage, and capped at 10 MB.
