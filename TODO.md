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

- [ ] Script to poll Celestrak for latest TLE catalog on a configurable interval
- [ ] Script to query SatNOGS API for active station observations
- [ ] SatNOGS station status filter: only include `online` stations
- [ ] TLE age validator: flag elements older than 7 days, reject > 14 days
- [ ] Contact state module: output list of `(station, satellite, TX|RX|both)` each epoch
- [ ] Socket interface to feed live data into FreeFlyer or Blender
- [ ] Offline fallback: use `satnogs.txt` snapshot when network is unavailable
- [ ] DSN Now scraper / API integration for real-time DSN contact data
- [ ] NEN contact query (if API is available or via SCAN-NOW feed)

## Phase 3 — Blender TV Display

- [ ] Import DSN 34 model into final scene; apply AO textures
- [ ] Build Earth sphere with up-to-date texture (cloud layer optional)
- [ ] Satellite point cloud: position empties at propagated ECI coordinates each frame
- [ ] Overhead ring: highlight satellites within X° of zenith
- [ ] Visibility cone: shade region visible from the configured ground station
- [ ] TX beam: animated curve from dish to tracked satellite (uplink color)
- [ ] RX beam: animated curve from satellite back to dish (downlink color)
- [ ] HUD overlay: satellite name, elevation, azimuth, next AOS/LOS times
- [ ] Kiosk mode: fullscreen, no window chrome, continuous loop, auto-restart on crash
- [ ] Multi-station mode: render multiple active contacts simultaneously
- [ ] Test output on target TV resolution (4K/1080p) and aspect ratio

## Phase 4 — Polish & Operations

- [ ] Automated TLE refresh cron/service (system service or Python scheduler)
- [ ] Config file for: ground station location, min elevation, update interval, display resolution
- [ ] Logging: record contact events with timestamps for post-analysis
- [ ] Error recovery: graceful handling of Celestrak/SatNOGS API downtime
- [ ] Documentation: installation and setup guide for new machines
- [ ] Package as a deployable container or install script
