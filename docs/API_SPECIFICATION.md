# RAFTAR — API Specification (REST v1)

## 1. Overview & Conventions

- **Base URL**: `https://api.raftar.app/v1`
- **Protocol**: HTTPS / JSON (RFC 8259)
- **Authentication**: Bearer Token (`Authorization: Bearer <JWT_ACCESS_TOKEN>`) + Refresh Token via HTTP-Only SameSite Cookie.
- **Idempotency**: All mutating operations (`POST`, `PUT`) support the `Idempotency-Key` header.
- **Error Standard**: RFC 7807 Problem Details for HTTP APIs.

---

## 2. API Endpoints by Domain (25 Modules)

### 2.1 Authentication & Profile
- `POST /auth/register` — Create account with email/password.
- `POST /auth/login` — Authenticate and receive JWT access/refresh pair.
- `POST /auth/google` — OAuth2 exchange for Google identity token.
- `POST /auth/apple` — Sign in with Apple token verification.
- `POST /auth/refresh` — Issue fresh access token using HTTP-only refresh cookie.
- `POST /auth/logout` — Revoke active token family in Redis.
- `GET /users/me` — Retrieve current authenticated user record.
- `PATCH /users/me/profile` — Update display name, bio, height, weight, resting HR.
- `GET /users/:id/profile` — Fetch public athlete profile (Vault, PRs, Gear).

### 2.2 Activities & GPS Tracks
- `POST /activities/sync` — Bulk idempotent sync endpoint for offline activities.
- `GET /activities/me` — Paginated list of user activities (cursor-based: `?limit=20&cursor=...`).
- `GET /activities/:id` — Full activity details (splits, elevation curve, polyline, weather).
- `GET /activities/:id/points` — Detailed GPS coordinate stream (or GeoJSON stream).
- `PATCH /activities/:id` — Update activity title, description, gear tag, or privacy setting.
- `DELETE /activities/:id` — Soft-delete activity.

### 2.3 Segments, Efforts & Personal Records
- `GET /segments/nearby?lat=...&lon=...&radius=5000` — Discover nearby running/cycling segments.
- `GET /segments/:id` — Segment details, elevation profile, overall leaderboard.
- `GET /segments/:id/efforts/me` — User personal effort history and PR badge on segment.
- `GET /athletes/:id/records` — Athlete Personal Records (1K, 5K, 10K, Half Marathon, Longest Ride).

### 2.4 Social, Clubs & Challenges
- `GET /feed` — Paginated timeline feed of activities from followed athletes.
- `POST /posts` — Publish community post with attached workout telemetry.
- `POST /posts/:id/reactions` — Toggle Kudos / Flame reaction.
- `POST /posts/:id/comments` — Add comment or reply.
- `POST /users/:id/follow` — Follow athlete.
- `DELETE /users/:id/follow` — Unfollow athlete.
- `GET /clubs` & `POST /clubs` — List and create athlete clubs.
- `POST /clubs/:id/join` — Join club.
- `GET /challenges` — Active global/brand challenges.
- `POST /challenges/:id/join` — Join challenge.

### 2.5 Grounded AI Fitness Assistant
- `POST /ai/conversations` — Start or retrieve conversational session.
- `POST /ai/chat` — Send query to AI Coach.
  - *Request*: `{"conversation_id": "...", "message": "Why was my pace slower on Thursday?"}`
  - *Response*: `{"reply": "On Thursday your average pace dropped 14s/km due to a 320m elevation gain in Zone 4...", "grounding_metrics": {...}}`

### 2.6 Environmental, Safety Beacon & Notifications
- `GET /environmental/snapshot?lat=...&lon=...` — Real-time weather, temperature, humidity, wind, and AQI.
- `POST /safety/beacon/start` — Generate secure ephemeral live tracking token URL for emergency contacts.
- `GET /safety/beacon/live/:token` — Public live tracking stream (GeoJSON updates) for authorized contacts.
- `GET /notifications` — List unread notifications (Kudos, comments, follower requests).
- `PATCH /notifications/:id/read` — Mark notification as read.

---

## 3. Standard Response & Error Formats

### 3.1 Standard Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "cursor": "eyJpZCI6IjAxOGUzYzUwIn0=",
    "has_more": true
  }
}
```

### 3.2 Error Format (RFC 7807)
```json
{
  "type": "https://api.raftar.app/errors/INVALID_PAYLOAD",
  "title": "Validation Error",
  "status": 422,
  "detail": "Heart rate value 320 is outside acceptable physiological range [30, 250]",
  "instance": "/v1/activities/sync",
  "invalid_params": [
    { "field": "avg_hr", "message": "Must be <= 250" }
  ]
}
```
