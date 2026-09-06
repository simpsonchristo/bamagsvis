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

## 2026-09-06

**Phase 3 — browser display, ported from the Claude Design canvas**

The visualization built in Claude Design became the display of record, so the
canvas was ported into the repo as a real page and wired to the Phase 2 data
layer. Blender stays available for a rendered-video path but is no longer the
plan for the live TV.

- `design/`: the canvas kept as the design source — `*.dc.html` (editable
  source), `*.standalone.html` (self-contained export that runs in a browser),
  and the Nocturne design system (`styles.css`, `readme.md`)
- `web/`: the port — plain ES modules, no build step
  - `js/orbits.js`: ECI↔scene frames, GMST (IAU 1982), TLE decoding, Kepler
    propagation of mean elements with secular J2 drift, look angles, pass
    search
  - `js/scene.js`: three.js globe, starfield, station pins, satellite dots with
    orbit rings and trails, pulsing TX/RX beams
  - `js/data.js`: bridge client with the design's demo constellation as the
    offline fallback, plus contact matching by NORAD id and station name
  - `js/ui.js`: overlay DOM, reconciled in place rather than rebuilt (the
    canvas's twice-a-second rebuild swallowed clicks)
  - `js/app.js`: selection, time warp (1x/10x/60x/300x off the wall clock),
    refresh timers, frame loop
- `python/web_bridge.py`: HTTP bridge serving `web/` plus `/api/stations`,
  `/api/tles` (watchlist + whatever the networks are actively working), and
  `/api/contacts`, all off the same `ServerState` the TCP server reads
- `python/main.py`: starts the bridge alongside the TCP server; `--no-web`
  skips it. `python/config.py` gained `enable_web`, `web_host`, `web_port`,
  `web_root`, `web_watchlist`, `web_max_satellites`

Fixed in the port: the canvas mirrored longitude (stations landed on the wrong
side of the globe) and ran its scene from `t = 0` while its clock read wall
time; both now derive from GMST.

**Tests:** `web/js/orbits.test.js` — 14 Node tests (GMST against the J2000
reference, TLE decode, orbit closure, perigee/apogee, frame mapping, station
right ascension, GEO longitude hold, look angles, pass search).
`python/tests/test_smoke.py` gained 9 bridge tests. All 15 Python and 14 JS
tests pass. Verified end to end in Chromium against the bridge: live TLEs from
the `satnogs.txt` snapshot, station and satellite panels, and an RX beam during
a NOAA-19 pass.
