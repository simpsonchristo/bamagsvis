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
  (Python / FreeFlyer socket)
         │
         ▼
  Orbit Propagator (FreeFlyer SGP4/SDP4)
         │
         ├──► Overhead set: all sats above local horizon
         │
         └──► Visibility set: sats above min elevation + in view
                    │
                    ▼
             Ground Station Contact Resolver
             (is a station currently tracking? TX/RX active?)
                    │
                    ▼
             Scene State (satellite positions, link vectors, timestamps)
                    │
                    ├──► HTTP bridge (python/web_bridge.py)
                    │         │
                    │         ▼
                    │    Browser display (web/, three.js)  ◄── primary
                    │
                    └──► TCP feed (python/server.py)
                              │
                              ▼
                         FreeFlyer View / Blender
                              │
                              ▼
                        TV / Display Output
```

The browser display propagates its own positions from the TLEs the bridge
hands it, so it does not depend on FreeFlyer being open; FreeFlyer and Blender
read the same state over the TCP feed when they are used.

---

## Component Breakdown

### 1. TLE Ingestion

**Files:** `python/celestrak.py`, `python/tle.py`, `CelestrakSocketwithtlecheck.MissionPlan`, `satnogs.txt`

- `celestrak.fetch_with_fallback()` pulls a configurable Celestrak group (default `active`) on the configured interval
- `tle.validate_age()` warns at >7 days, rejects at >14 days (configurable)
- `satnogs.txt` serves as the offline fallback (~370 satellites); used automatically on network failure
- The legacy FreeFlyer mission plan (`CelestrakSocketwithtlecheck.MissionPlan`) remains for the in-FreeFlyer prototype path

### 2. Orbit Propagation — FreeFlyer

**Files:** `trackingVisualization.MissionPlan`, `CelestrakSocketwithtlecheck.MissionPlan`

- Propagates TLEs using SGP4/SDP4 inside FreeFlyer
- Computes ECI/ECEF positions at the current epoch
- Resolves visibility windows: elevation angle > threshold, line-of-sight not blocked
- DSN and NEN stations are built into FreeFlyer's ground station library
- SatNOGS stations require custom entries (lat/lon/alt from the SatNOGS API)

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

### 3b. HTTP Bridge

**Files:** `python/web_bridge.py`, `python/main.py`

- Serves `web/` and a small JSON API off the same `ServerState` the TCP server reads, on `127.0.0.1:8080` (configurable; `--no-web` or `enable_web: false` skips it)
- `GET /api/stations` — config stations first (they are the local ones), then the DSN/NEN/SatNOGS reference set; each carries `minElevationDeg`, which the display uses as its visibility cutoff
- `GET /api/tles` — the `web_watchlist` NORAD ids plus any satellite the networks are currently working, capped at `web_max_satellites`
- `GET /api/contacts` — the current `Contact` list, verbatim
- `GET /api/health` — feed sizes, for a kiosk watchdog

### 4. Visualization Layer

**Files:** `trackingVisualization.MissionPlan`, `animationExample.MissionPlan`, `Models/DSN 34/`

Three rendering paths exist; the browser display is the one that drives the TV.

#### 4a. Browser display (primary)

**Files:** `web/`, design source in `design/`

- three.js globe: textured Earth on a starfield, station pins, satellite dots with orbit rings and a fading trail on the selected satellite
- TX (amber) and RX (green) beams pulse between a selected station and its highest satellite; `IDLE` draws nothing
- `web/js/orbits.js` propagates mean elements with secular J2 drift and computes look angles and pass times in the page — the scene never waits on the data layer for a frame
- Frames: ECI with +Z north, mapped at draw time into three.js's +Y-up world; the globe spins on GMST, so stations sit under the map where they belong
- Layout and design system come from the Claude Design canvas in `design/`; `web/styles/nocturne.css` is that system vendored verbatim
- Degrades in three steps: bridge → last good state → built-in demo constellation, with the header badge showing which

#### 4b. FreeFlyer View (prototype)
- Built-in 3D globe with satellite tracks and ground station icons
- Ground station view vectors added (`Added Vectors to GSView` commit)
- Fast to iterate; used to validate logic before the display was built

#### 4c. Blender (deferred)
- Full 3D scene: textured Earth sphere, satellite point-cloud, animated dish model
- Kept for pre-rendered sequences using the DSN 34 dish; no longer the plan for the live TV

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
- In the browser display these are two `THREE.Line` segments between the station and satellite positions, their opacity pulsing each frame; `link` decides which of the pair is drawn
- Link state comes from the contact feed when a station/satellite pair can be matched to it, and from geometry otherwise (SatNOGS receives only; other networks transmit above 40° elevation). Below the station's minimum elevation nothing is drawn, whatever the feed reports
- In the FreeFlyer prototype this is implemented as a `Vector` object in the GSView scene
- In Blender it would use a Geometry Nodes or driver-animated curve between the dish bone and the satellite empty

---

## Ground Networks Supported

| Network | Integration Method | Stations |
|---------|-------------------|----------|
| DSN | Built into FreeFlyer station library | Goldstone, Madrid, Canberra |
| NEN | Built into FreeFlyer station library | Multiple NASA stations |
| SatNOGS | REST API polling (`python/satnogs.py`) | 1000+ community stations |

The browser display's station list comes from `/api/stations`: the `stations`
entries in your config first (network `LOCAL`, and the first of them is the
reference station for satellite look angles), then the reference complexes in
`web_bridge.DEFAULT_STATIONS`.

---

## Deployment Target

- Single machine running `python3 -m python.main` and a browser in kiosk mode on `http://127.0.0.1:8080/`
- Display output to HDMI TV
- No user interaction required during operation; the globe auto-rotates until something is selected
- Internet connection required for live TLE and contact data; offline fallback uses `satnogs.txt`, and `web/vendor/` plus `web/assets/` remove the page's own CDN dependencies (see `web/README.md`)
