# RAFTAR — Project Audit & Visual Design Source of Truth

## 1. Executive Summary

**RAFTAR** is an athletic intelligence and social fitness platform engineered for high-performance runners, cyclists, and outdoor athletes. The visual interface and frontend styling have been crafted and provided via **Google Stitch**.

### Fundamental Principles:
- **Visual Parity with Approved Stitch Design**: The Google Stitch frontend is the uncompromised source of truth for visual design. The implementation target achieves complete visual parity (typography, tokens, colors, layout, component hierarchy, animations, and icons).
- **Network-Independent Offline Core**: Core activity recording (GNSS location ingestion, real-time pace/speed/elevation/splits calculation, auto-pause, local SQLite persistence, crash recovery) operates independently of cellular/Wi-Fi connectivity.
- **Observational Map Isolation**: Map rendering consumes tracking data; if offline maps are not downloaded, tracking continues with 100% data integrity on a tactical grid canvas.

---

## 2. Visual Identity & Design System Audit

### 2.1 Color Palette & Theme Tokens
| Token Name | Hex Code | Semantic Role |
| :--- | :--- | :--- |
| `primary` | `#b02f00` | Deep Rust / Primary brand accent |
| `primary-container` | `#ff5722` | Saffron Vibrant / Active state highlights / Key CTAs |
| `saffron-vibrant` | `#FF5722` | Live telemetry, high-strain markers, dynamic metrics |
| `saffron-glow` | `#FF8A65` | Pulse glow effect on peaks and active bars |
| `background` / `surface` | `#fff8f6` | Warm off-white background canvas |
| `surface-container-lowest`| `#ffffff` | Elevated cards, HUD container backgrounds |
| `surface-container` | `#ffe9e4` | Secondary container backdrop |
| `surface-variant` | `#fadcd4` | Border lines, inactive gauge tracks, subtle fills |
| `outline` | `#907067` | Secondary labels, micro-metric captions |
| `outline-variant` | `#e4beb4` | Card borders, dividing rules, technical grid lines |
| `on-surface` | `#271813` | High-contrast technical text & large numbers |
| `on-surface-variant` | `#5b4039` | Secondary content body, timestamps |
| `error` | `#ba1a1a` | Heart Rate Zone 4/5, critical warnings |

### 2.2 Typography System
| Style Token | Font Family | Size / Line Height | Tracking | Weight / Usage |
| :--- | :--- | :--- | :--- | :--- |
| `display-xl` | **Sora** | 48px / 52px (Mobile: 36px/40px) | `-0.04em` | 800 (Major HUD stats, Hero values) |
| `display-lg` | **Sora** | 32px / 36px | `-0.02em` | 800 (TopBar brand header, Section titles) |
| `headline-md` | **Sora** | 24px / 32px | Normal | 700 (Section headers, sub-metrics) |
| `data-num` | **Sora** | 20px / 20px | Normal | 700 (Numerical measurements, timestamps) |
| `label-caps` | **JetBrains Mono** | 12px / 16px | `+0.15em` | 600 (Technical labels, status badges, units) |
| `body-lg` | **Hanken Grotesk** | 18px / 28px | Normal | 500 (Insight cards, key summaries) |
| `body-md` | **Hanken Grotesk** | 16px / 24px | Normal | 400 (Body copy, social feed commentary) |

---

## 3. Screen Inventory & Component Breakdown

### 3.1 Screen 1: Home Dashboard (`home.html`)
- **TopAppBar**: Athlete profile avatar (left), RAFTAR uppercase wordmark (center), live sensor status badge (right).
- **The Pulse Widget**: Precision SVG circular gauge displaying readiness percentage (e.g. `88% Prime State`) with HRV-backed neuromuscular recovery diagnosis.
- **Today's Status Grid**: Step counter with 7-segment micro-bar graph, Kcal burn progress indicator with marker, Active duration card with technical dot scatter plot.
- **Current Streak Indicator**: Fire icon badge with day count tracker.
- **Network Telemetry (Social Feed Teaser)**: Activity preview card featuring user avatar, timestamp, sport tag, stylized dark-mode map snippet with overlaid SVG route polyline, and 3-metric bottom bar (Distance, Pace, Strain).
- **Floating Action Button (FAB)**: Saffron quick-start workout button with play icon.
- **Bottom Navigation Bar**: 5-slot navigation bar (Analytics, Explore, Record Center Target, Coach/Psychology, Person/Profile).

### 3.2 Screen 2: Performance Analytics (`analytics.html`)
- **Header**: High-contrast title and section indicator.
- **Training Load Visualization**: Total TSS score (`482 tss`), trend indicator (`OPTIMAL`), custom bar-grid chart with highlighted saffron peaks representing daily workout intensities (Mon–Sun).
- **Secondary Metrics 2-Column Grid**: HRV Status Card (68ms score, 270° radial arc gauge labeled `BALANCED`), VO2 Max Card (54.2 score, coordinate scatter plot with ascending trend line).
- **AI Coach Insight Card**: Saffron left-bordered banner highlighting fatigue warnings and recovery recommendations.

### 3.3 Screen 3: Athlete Profile (`profile.html`)
- **Hero Header**: Athlete cover photo with gradient overlay, live readiness badge (`STATUS: OPTIMAL`), athlete name (`ALEX VANCE`), and classification level (`L7 // ENDURANCE SPECIALIST`).
- **Summary Stats 3-Grid**: Lifetime Distance (`12,450 KM`), Total Hours (`842 HOURS`), Elevation Gain (`145K METERS`).
- **Fitness Index Progression**: 87.4 ascending score with 17-bar quarterly progression graph (Q1 -> Current).
- **The Vault (Achievements & PRs)**: 4-slot grid highlighting Personal Records (10K PR, Longest Ride) and Badges (Centurion 100-Day Streak, Peak Power 1200W).
- **The Kit (Gear Tracking)**: Footwear and bicycle mileage wear trackers with max lifespan thresholds (`ALPHA PRO X`: 240/400 km; `TERRA-V1`: 1,240 km).

### 3.4 Screen 4: Live Activity Recording HUD (`record.html`)
- **Top Status Bar**: Live Location Lock / Quality status (`🟢 HIGH_ACCURACY`), Offline Ready indicator, Battery percentage with level icon.
- **Primary Telemetry HUD**: Large carved numbers for Pace (`4'12"` min/km) and Distance (`8.42 KM`).
- **Heart Rate Zone Widget**: Real-time BPM display (`168 BPM`), active heart icon pulse, multi-column dynamic zone histogram highlighting Zone 4 (Vigorous).
- **Live Map Polyline Snippet**: Mini route track with kinetic pulsing live head node.
- **Action Controls (Fixed Bottom Dock)**: Dual mechanical buttons — `Pause` (Surface container) and `Finish` (Saffron vibrant with stop icon).

---

## 4. Visual Parity Verification Standards

Rather than string-matching CSS classes, verification is based on **Visual Parity**:
- **Typography Rendering**: Exact font families (`Sora`, `JetBrains Mono`, `Hanken Grotesk`), line heights, tracking, and font weights.
- **Color Accuracy**: Strict adherence to exact hex codes for rust `#b02f00`, saffron `#ff5722`, and surface fills.
- **Geometry & Dials**: 1:1 matching of SVG stroke-dasharrays, arc offsets, radial gauges, and micro-grid proportions.
- **Responsive Fluidity**: Pixel-perfect responsive behavior across standard mobile viewports (360px–430px width) and tablet/desktop breakouts.
