# TODO

Items are ordered by phase. Complete items are marked ~~struck~~.

---

## Phase 1 — FreeFlyer Prototype

- [x] Initial commit of FreeFlyer mission plans and Blender DSN 34 model
- [x] Formation updater: propagate a formation of satellites simultaneously
- [x] Template for output layout (ground track display)
- [x] DSN dish animation example (`animationExample.MissionPlan`)
- [x] Correct ground station animation timing and orientation
- [x] Add TX/RX vector objects to the GSView scene
- [ ] Tune minimum elevation angle cutoff for "visible" classification
- [ ] Confirm SatNOGS station lat/lon entries match current SatNOGS API data
- [ ] Validate TLE age check threshold (current vs. acceptable staleness)

## Phase 2 — Python Real-Time Layer

- [x] Script to poll Celestrak for latest TLE catalog on a configurable interval (`python/celestrak.py`)
- [x] Script to query SatNOGS API for active station observations (`python/satnogs.py`)
- [x] SatNOGS station status filter: only include `online` stations
- [x] TLE age validator: flag elements older than 7 days, reject > 14 days (`python/tle.py`)
- [x] Contact state module: output list of `(station, satellite, TX|RX|both)` each epoch (`python/contact_state.py`)
- [x] Socket interface to feed live data into FreeFlyer or Blender (`python/server.py`)
- [x] Offline fallback: use `satnogs.txt` snapshot when network is unavailable
- [x] DSN Now scraper / API integration for real-time DSN contact data (`python/dsn.py`)
- [x] DSN Now: cache-bust query parameter + no-cache headers so CDN never serves stale contact state
- [x] McDowell GCAT metadata client (`python/gcat.py`) — daily-cached `currentcat.tsv`; NORAD-keyed owner/state/orbit dict; hover-text enrichment in Dash
- [ ] Space-Track.org primary TLE source (`python/spacetrack.py`) — session login, `/gp` query for active catalog, credentials via env vars; Celestrak becomes fallback
- [ ] NEN contact query — stub in place (`python/nen.py`); awaiting a stable public SCAN-NOW machine-readable feed

## Phase 3 — Dash + Skyfield TV Display

- [x] Skyfield propagator: load EarthSatellites, compute subpoints + topocentric geometry (`viz/propagator.py`)
- [x] Overhead set: satellites with elevation ≥ 0° from observer
- [x] Visibility set: satellites with elevation ≥ 5° from observer (labeled on globe)
- [x] Orthographic globe centered on observer, dark space theme (`viz/app.py`)
- [x] Three satellite tiers: blue (below horizon), yellow (overhead), green + name label (visible)
- [x] Observer ground station marker (red star)
- [x] DSN complex markers: Goldstone, Madrid, Canberra (orange triangles)
- [x] TX/RX link lines from DSN dish to satellite subpoint when contact name matches catalog
- [x] Header stats: UTC time, total tracked, overhead count, visible count
- [x] Footer: live DSN contact list with TX/RX/TX+RX annotation
- [x] 30-second auto-refresh via `dcc.Interval`; TLE refresh hourly; DSN refresh each 60 s
- [x] `--offline` flag for demo operation without internet
- [ ] Configurable minimum elevation angle (currently hard-coded 5°)
- [ ] Next AOS/LOS prediction for visible satellites
- [ ] Test output on target TV resolution (4K/1080p) and verify text readability at distance

## Phase 3.5 — Operator Aids (Dash extensions)

- [x] **Sky chart from the ground station** — az/el polar plot showing satellites currently above the horizon, oriented N/E/S/W; color-coded 0–5° vs visible (>5°); side-by-side with globe in Sky View tab.
- [x] **GCAT hover-text enrichment** — owner + operational state (active/decayed) shown on hover on both globe and sky chart when GCAT has a match by NORAD id.
- [ ] **Ground station visualization** — render the local antenna as a prominent on-globe asset with a current pointing indicator; when actively tracking, show dish azimuth/elevation widget next to the sky chart.
- [ ] **Link budget / link health panel** — for each visible satellite show slant range, free-space path loss (FSPL = 20·log₁₀(4πd/λ)), Doppler shift, and a simple link-margin estimate. Frequencies come from SatNOGS `/api/transmitters/` keyed by NORAD ID.
- [ ] **SatNOGS recent observations panel** — call `network.satnogs.org/api/observations/?ground_station=<id>` for one or more configured stations; show last N observations with spacecraft, frequency, time, vetting status (good/bad/failed), and a link to the waterfall. Doubles as a proxy for "is the station healthy / receiving signals at all."

## Phase 4 — Blender Final Display

- [ ] Import DSN 34 model into final scene; apply AO textures
- [ ] Build Earth sphere with up-to-date texture (cloud layer optional)
- [ ] Satellite point cloud: position empties at propagated ECI coordinates each frame
- [ ] TX beam: animated curve from dish to tracked satellite (uplink color)
- [ ] RX beam: animated curve from satellite back to dish (downlink color)
- [ ] Kiosk mode: fullscreen, no window chrome, continuous loop, auto-restart on crash

## Phase 5 — Polish & Operations

- [ ] Automated TLE refresh cron/service (system service or Python scheduler)
- [ ] Config file for: ground station location, min elevation, update interval, display resolution
- [ ] Logging: record contact events with timestamps for post-analysis
- [ ] Error recovery: graceful handling of Celestrak/SatNOGS API downtime
- [ ] Documentation: installation and setup guide for new machines
- [ ] Package as a deployable container or install script
