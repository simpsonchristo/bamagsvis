# Architecture

## System Goal

Display on a TV, in near-real-time, which satellites are currently overhead and which are visible above the horizon from one or more ground stations. When a ground station is actively tracking a satellite, render the TX (uplink) and RX (downlink) link vectors between them.

---

## High-Level Data Flow

```
External TLE Sources                Ground Station Network APIs
 (Celestrak, SatNOGS)                (DSN, NEN, SatNOGS)
         │                                    │
         ▼                                    ▼
  TLE Ingestion Layer  ◄──────────────────────┘
  (python/celestrak.py + tle.py)
         │
         ├──► Socket Server (python/server.py)
         │    Protocol: TLES / CONTACTS → FreeFlyer or Blender consumer
         │
         └──► Skyfield Propagator (viz/propagator.py)
                    │
                    ├──► Subpoint (lat/lon) for every satellite
                    ├──► Overhead set: elevation > 0° from observer
                    └──► Visibility set: elevation > 5° from observer
                                │
                                ▼
                     Ground Station Contact Resolver
                     (is a DSN/SatNOGS station tracking? TX/RX active?)
                                │
                                ▼
                     Plotly Dash Globe (viz/app.py)
                     — orthographic projection, satellite tiers,
                       DSN dish markers, TX/RX link lines
                                │
                                ▼
                          TV / Display Output
                         (browser fullscreen, port 8050)
```

---

## Component Breakdown

### 1. TLE Ingestion

**Files:** `python/celestrak.py`, `python/tle.py`, `CelestrakSocketwithtlecheck.MissionPlan`, `satnogs.txt`

- `celestrak.fetch_with_fallback()` pulls a configurable Celestrak group (default `active`) on the configured interval
- `tle.validate_age()` warns at >7 days, rejects at >14 days (configurable)
- `satnogs.txt` serves as the offline fallback (~370 satellites); used automatically on network failure
- The legacy FreeFlyer mission plan (`CelestrakSocketwithtlecheck.MissionPlan`) remains for the in-FreeFlyer prototype path

### 2a. Orbit Propagation — FreeFlyer (prototype)

**Files:** `trackingVisualization.MissionPlan`, `CelestrakSocketwithtlecheck.MissionPlan`

- Propagates TLEs using SGP4/SDP4 inside FreeFlyer
- Computes ECI/ECEF positions at the current epoch
- Resolves visibility windows: elevation angle > threshold, line-of-sight not blocked
- DSN and NEN stations are built into FreeFlyer's ground station library
- SatNOGS stations require custom entries (lat/lon/alt from the SatNOGS API)

### 2b. Orbit Propagation — Skyfield (production)

**Files:** `viz/propagator.py`

- `build_satellites(tles)` wraps each `TLE` record in a Skyfield `EarthSatellite`; uses `builtin=True` timescale so no network fetch is required on startup
- `propagate(sats, lat, lon, alt_m)` computes, for each satellite at the current epoch:
  - **Subpoint**: geodetic latitude/longitude and altitude via `wgs84.subpoint_of()`
  - **Topocentric**: elevation, azimuth, and slant range from the observer via `EarthSatellite.at(t) - observer`
- Returns `SatPosition` dataclasses with `overhead` (elevation ≥ 0°) and `visible` (elevation ≥ 5°) boolean properties
- Malformed or decayed TLEs are silently skipped; all exceptions are caught per satellite

### 3. Ground Station Contact Resolver

**Files:** `python/contact_state.py`, `python/dsn.py`, `python/satnogs.py`, `python/nen.py`, `trackingVisualization.MissionPlan`

- `dsn.fetch_dsn_now()` parses the public DSN Now XML feed and yields per-dish target uplink/downlink state
- `satnogs.fetch_online_stations()` filters the SatNOGS station catalog to status `online`; `fetch_active_observations()` returns observations whose window contains the current epoch
- `nen.fetch_nen_now()` is a stub awaiting a stable machine-readable SCAN-NOW feed
- `contact_state.collect()` aggregates all enabled sources into a single list of `Contact(station, network, spacecraft, norad_id, link, timestamp)` where `link ∈ {TX, RX, BOTH, IDLE}`

### 3a. Socket Server

**Files:** `python/server.py`, `python/main.py`

- Line-delimited TCP protocol on `127.0.0.1:5005` (configurable)
- `TLES` returns the current 3-line TLE bundle terminated by a single `.` line — chosen to match FreeFlyer's `Socket` reader
- `CONTACTS` returns a single JSON line: a list of `Contact` records suitable for both FreeFlyer and Blender consumers
- Two background threads refresh TLEs (`tle_refresh_seconds`) and contact state (`contact_refresh_seconds`) independently

### 4. Visualization Layer

Three rendering backends span the project phases:

#### 4a. FreeFlyer View (prototype)

**Files:** `trackingVisualization.MissionPlan`, `animationExample.MissionPlan`

- Built-in 3D globe with satellite tracks and ground station icons
- Ground station view vectors added (`Added Vectors to GSView` commit)
- Fast to iterate; used to validate orbit logic before production builds

#### 4b. Plotly Dash Globe (Phase 3 — production)

**Files:** `viz/app.py`

- Dash web app served on `http://0.0.0.0:8050`; browser in fullscreen replaces a dedicated renderer
- `go.Scattergeo` orthographic projection centered on the observer (UA Tuscaloosa by default)
- Satellites plotted in three color-coded tiers: blue (below horizon), yellow (overhead), green + label (visible > 5°)
- Observer ground station rendered as a red star; three DSN complexes (Goldstone, Madrid, Canberra) as orange triangles
- When a DSN contact from `dsn.fetch_dsn_now()` matches a satellite name in the propagated catalog, a colored TX/RX line is drawn from the dish lat/lon to the satellite's current subpoint
- `dcc.Interval` triggers position re-propagation every 30 seconds; TLE catalog refreshes every hour; DSN contacts refresh every 60 seconds
- `--offline` flag loads `satnogs.txt` without age validation — allows demo operation with no internet
- `--port` flag to change the listen port

#### 4c. Blender (planned)

**Files:** `Models/DSN 34/`

- Full 3D scene: textured Earth sphere, satellite point-cloud, animated dish model
- TX vector rendered as an upward beam from the dish to the satellite position
- RX vector rendered as a return beam (different color/style)
- Designed for unattended TV output — no UI chrome, continuous loop

### 5. 3D Assets

**Path:** `Models/DSN 34/`

| File | Format | Use |
|------|--------|-----|
| `34M_17.blend` | Blender | Primary editable model |
| `34M_17.3ds` | 3DS Max | Import/export interchange |
| `34M_17.stl` | STL | Geometry-only reference |
| `texture/*.png/jpg` | Raster | Ambient occlusion bake maps |
| `texture/*.psd` | Photoshop | Editable texture source |

---

## TX/RX Link Visualization

When a ground station contact is active:

- **TX (uplink):** A vector or beam drawn from the ground station dish to the satellite, styled to indicate transmission (e.g., orange/yellow, animated pulse)
- **RX (downlink):** A vector drawn from the satellite back to the ground station, styled to indicate reception (e.g., green, animated)
- Both vectors are computed from real-time position data; they update each render frame
- In the FreeFlyer prototype this is implemented as a `Vector` object in the GSView scene
- In the Blender final build this will use a Geometry Nodes or driver-animated curve between the dish bone and the satellite empty

---

## Ground Networks Supported

| Network | Integration Method | Stations |
|---------|-------------------|----------|
| DSN | Built into FreeFlyer station library | Goldstone, Madrid, Canberra |
| NEN | Built into FreeFlyer station library | Multiple NASA stations |
| SatNOGS | REST API polling (Python, planned) | 1000+ community stations |

---

## Deployment Target

- Single machine running FreeFlyer or Blender in a kiosk/fullscreen mode
- Display output to HDMI TV
- No user interaction required during operation; the scene loops continuously
- Internet connection required for live TLE and contact data; offline fallback uses `satnogs.txt`
