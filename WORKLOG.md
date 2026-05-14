# Work Log

Chronological record of work sessions and significant changes.

---

## 2019-04-01

**Initial commit — FreeFlyer mission plans and Blender DSN 34 model**

- Added three FreeFlyer `.MissionPlan` files establishing the project skeleton
- Committed Blender project (`34M_17.blend`) for the DSN 34-meter dish along with `.3ds` and `.stl` exports and ambient occlusion texture maps
- Established repo structure: mission plans at root, 3D assets under `Models/DSN 34/`

---

## 2019-04-03

**Formation updater, output layout template, README**

- `Formation Updater Complete`: FreeFlyer script that propagates a formation of satellites simultaneously and updates their positions each epoch — foundational piece for the multi-satellite overhead display
- `Template of OutputLayout`: initial ground track view layout defining the display regions (globe, satellite list, station panel) that the TV output will be built on
- `Create README.md`: project description, motivation, and three-phase plan of attack documented

---

## 2019-04-05

**DSN animation example**

- `Example of DSN animation`: working reference implementation showing a DSN 34-meter dish animated in FreeFlyer — dish azimuth/elevation drive demonstrated, used as the pattern for the live tracking scene

---

## 2019-04-07

**Correct ground station animation — PR #5 merged**

- `Correct animation of ground station`: fixed timing and orientation errors in the dish animation; dish now correctly slews to satellite azimuth/elevation at each propagation epoch
- `Merge pull request #5 from simpsonchristo/3dmodelmovement`: branch `3dmodelmovement` integrated into master after review

---

## 2019-04-15

**TX/RX vectors added to GSView; bug fixes**

- `Added Vectors to GSView`: uplink (TX) and downlink (RX) vector objects added to the FreeFlyer ground station view scene — first representation of the active link between ground station and satellite; vectors update with satellite position
- `Fixing Drew's Mistakes`: corrected errors introduced in a prior commit (exact changes recorded in git diff `4a7e7db`)

---

## 2026-05-13

**Documentation pass**

- Reformatted `README.md`: clearer project goal statement, tech stack table, repo layout, and development roadmap
- Created `ARCHITECTURE.md`: full system design — data flow diagram, component breakdown, TX/RX link visualization spec, ground network support table, deployment target
- Created `TODO.md`: phase-by-phase task list with completed items marked
- Created `WORKLOG.md`: this file, backfilled from git history

---

## 2026-05-14

**Phase 2 — Python real-time layer**

Built the Python data layer end-to-end. All modules under `python/`.

- `python/tle.py`: `TLE` dataclass with epoch decoder, `parse_tle_text()` accepting both 2-line and 3-line records, `validate_age()` with warn (>7d) / reject (>14d) thresholds
- `python/celestrak.py`: `fetch_celestrak()` against `gp.php?GROUP=...&FORMAT=tle`, `load_offline()` reading `satnogs.txt`, `fetch_with_fallback()` that swaps to offline on any network error
- `python/satnogs.py`: SatNOGS Network API client — `fetch_online_stations()` (status filter = 2/online) and `fetch_active_observations()` filtered to observations whose window contains the current epoch
- `python/dsn.py`: parses NASA Eyes' DSN Now XML feed into `DSNDish` and `DSNTarget` records with explicit `uplink`/`downlink` flags
- `python/nen.py`: stub for SCAN-NOW; structure is in place so the aggregator does not change when a stable feed lands
- `python/contact_state.py`: aggregates DSN + SatNOGS (+ NEN when enabled) into `Contact(station, network, spacecraft, norad_id, link, timestamp)` with `link ∈ {TX, RX, BOTH, IDLE}`
- `python/server.py`: line-delimited TCP server on `127.0.0.1:5005`; `TLES` returns a 3-line bundle terminated by `.`, `CONTACTS` returns a JSON array — protocol chosen for FreeFlyer's `Socket` reader compatibility
- `python/config.py`: dataclass-backed `Config` with JSON loader; defines `GroundStation` for "local" stations
- `python/main.py`: spawns the TLE refresher, contact refresher, and socket server as daemons

**Tests:** `python/tests/test_smoke.py` — 6 offline tests covering TLE parsing of `satnogs.txt`, age-validator filtering, link classification, contact serialization, and a full socket round-trip on an ephemeral port. All passing.

Updated `TODO.md` (Phase 2 items checked, NEN noted as stub) and `ARCHITECTURE.md` (TLE Ingestion / Contact Resolver / Socket Server sections rewritten to reflect the real implementation).

---

## 2026-05-14 (continued)

**Phase 3 — Dash + Skyfield TV display**

Built the Python-only visualization layer. All code under `viz/`.

- `viz/propagator.py`: wraps Skyfield's `EarthSatellite` and `wgs84` API
  - `build_satellites(tles)` converts `TLE` records into `EarthSatellite` objects; uses `builtin=True` timescale (no IERS download required)
  - `propagate(sats, lat, lon, alt_m)` computes each satellite's geodetic subpoint plus topocentric elevation/azimuth/distance from the observer at the current epoch; returns `SatPosition` dataclasses with `overhead` and `visible` boolean properties
  - Per-satellite exceptions are caught silently so a single bad TLE does not abort the refresh

- `viz/app.py`: Plotly Dash web app
  - Three background daemon threads: TLE refresh (1-hour cycle), DSN Now refresh (60-second cycle), and the Dash/Flask server itself
  - `_build_figure()` constructs a `go.Scattergeo` orthographic globe centered on the observer with three satellite tiers (blue / yellow / green+label), red-star observer marker, orange-triangle DSN complex markers, and colored TX/RX lines when a DSN contact name matches a satellite in the propagated catalog
  - Header shows UTC timestamp, satellite count, overhead count, visible count; footer lists all active DSN contacts with TX/RX/TX+RX annotation
  - `dcc.Interval` at 30 seconds re-runs `propagate()` and redraws the figure without a page reload
  - `--offline` flag skips TLE age validation and reads `satnogs.txt` directly (allows demo without internet access)
  - `--port` flag (default 8050); designed for browser fullscreen (F11) on a TV

Verified end-to-end with 247 satellites from the offline snapshot: 11 overhead, 8 visible from UA Tuscaloosa; all DSN markers rendered; TX/RX lines drawn when contacts match.

Updated `README.md` (tech stack, repo layout, running instructions, roadmap), `ARCHITECTURE.md` (data flow diagram, Skyfield propagator section 2b, Dash visualization section 4b), and `TODO.md` (Phase 3 items checked; Blender split into Phase 4).
