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
- [ ] NEN contact query — stub in place (`python/nen.py`); awaiting a stable public SCAN-NOW machine-readable feed

## Phase 3 — Browser TV Display

The display of record is the browser page in `web/`, ported from the Claude
Design canvas in `design/`. Blender is deferred to Phase 5.

- [x] Port the Claude Design canvas to plain ES modules (`web/`)
- [x] Earth sphere with texture, starfield, atmosphere glow
- [x] Satellite dots at propagated positions, orbit rings, trail on the selection
- [x] Station pins with per-network badges (DSN / NEN / SatNOGS)
- [x] TX beam: pulsing line from station to tracked satellite (uplink color)
- [x] RX beam: return beam in the downlink color
- [x] HUD: satellite name, NORAD id, altitude, elevation/azimuth, next AOS countdown
- [x] Station panel: what is overhead now, with per-contact link state
- [x] Time warp (1x / 10x / 60x / 300x) off the wall clock, UTC readout
- [x] HTTP bridge feeding the page live TLEs, stations and contacts (`python/web_bridge.py`)
- [x] Offline fallback to the demo constellation with a LIVE/DEMO badge
- [x] Orbit-math tests (`web/js/orbits.test.js`) and bridge tests
- [ ] Swap the Keplerian propagator for real SGP4 (satellite.js) — see `web/README.md`
- [ ] Visibility cone: shade the region visible from the selected station
- [ ] Multi-station mode: draw every active contact at once, not just the selection
- [ ] Camera: frame the selected station instead of only stopping the auto-rotate
- [ ] Kiosk mode: fullscreen browser, no chrome, auto-restart on crash, watchdog on `/api/health`
- [ ] Test output on target TV resolution (4K/1080p) and aspect ratio
- [ ] Vendor three.js and the Earth texture on the display machine (`web/vendor/`, `web/assets/`)

## Phase 4 — Polish & Operations

- [ ] Automated TLE refresh cron/service (system service or Python scheduler)
- [ ] Config file for: ground station location, min elevation, update interval, display resolution
- [ ] Logging: record contact events with timestamps for post-analysis
- [ ] Error recovery: graceful handling of Celestrak/SatNOGS API downtime
- [ ] Documentation: installation and setup guide for new machines
- [ ] Package as a deployable container or install script
- [ ] Serve the display over the LAN (bind `web_host`) if it should be viewable off the kiosk machine

## Phase 5 — Blender (deferred)

Kept for pre-rendered sequences; not the live TV path any more.

- [ ] Import DSN 34 model into a scene; apply AO textures
- [ ] Satellite empties driven from the TCP feed's propagated coordinates
- [ ] Dish animation driven by the tracked satellite's azimuth/elevation
