# bamagsvis — UA Ground Station Satellite Visualizer

Real-time TV display showing which satellites are currently overhead and visible from a ground station, with TX/RX link visualization when a ground station is actively coupled.

The live display is a browser page: a three.js globe in [`web/`](web/), ported from the Claude Design canvas kept in [`design/`](design/) and fed by the Python data layer.

## What It Does

- Renders a live 3D scene on a display (TV/monitor) showing satellites currently overhead
- Highlights satellites visible above the horizon from a configured ground station
- When a ground station is coupled, draws the uplink (TX) and downlink (RX) vectors between the station and the satellite it is tracking
- Pulls live TLE data from Celestrak and SatNOGS to keep orbital elements current
- Supports DSN, NEN, and SatNOGS ground networks out of the box

## Tech Stack

| Layer | Tool | Role |
|-------|------|------|
| Simulation | FreeFlyer (Engineer tier) | Orbit propagation, visibility windows, ground station contacts |
| Processing | Python | Real-time TLE ingestion, observation state, SatNOGS polling, HTTP/TCP feeds |
| Visualization | three.js in the browser (`web/`) | The live display — globe, orbits, overhead sets, TX/RX beams |
| Design | Claude Design canvas (`design/`) | Source of the display's layout and the Nocturne design system |
| Offline render | Blender | Optional pre-rendered scenes; the DSN 34 dish model lives here |
| 3D Assets | DSN 34 model (.blend / .3ds / .stl) | High-fidelity dish model for ground station representation |

## External Data Sources

- **Celestrak** — TLE catalog (polled via socket in `CelestrakSocketwithtlecheck.MissionPlan`)
- **SatNOGS Network** — community ground station observations: https://network.satnogs.org/
- **DSN / NEN Real-Time** — NASA tracking network status: https://scan-now.gsfc.nasa.gov/scan

## Repository Layout

```
bamagsvis/
├── web/                                    # The live display (three.js, no build step)
│   ├── index.html
│   ├── js/orbits.js scene.js data.js ui.js app.js
│   ├── js/orbits.test.js                   # node --test "js/*.test.js"
│   ├── styles/nocturne.css styles/app.css
│   └── README.md                           # how to run it, what it reads, accuracy notes
├── design/                                 # Claude Design canvas + Nocturne design system
├── trackingVisualization.MissionPlan       # Primary FreeFlyer scene: satellite tracking display
├── CelestrakSocketwithtlecheck.MissionPlan # Live TLE fetch + validation via Celestrak socket
├── animationExample.MissionPlan            # Reference animation patterns (DSN dish, vectors)
├── satnogs.txt                             # Cached TLE snapshot from SatNOGS catalog
├── Models/
│   └── DSN 34/                             # 34 m dish 3D model (Blender, 3DS, STL, textures)
├── python/                                 # Real-time data layer
│   ├── tle.py celestrak.py satnogs.py dsn.py nen.py
│   ├── contact_state.py server.py web_bridge.py main.py config.py
│   └── tests/                              # Offline smoke tests (no network)
├── README.md
├── ARCHITECTURE.md
├── TODO.md
└── WORKLOG.md
```

## Running It

```bash
python3 -m python.main                    # data layer + display, then open http://127.0.0.1:8080/
python3 -m python.main --config cfg.json  # see python/config.py for fields
python3 -m python.main --no-web           # TCP feed only, for the FreeFlyer/Blender path
```

One process serves both consumers off the same state:

**TCP, `127.0.0.1:5005`** — line-delimited, for FreeFlyer and Blender:
- `TLES\n` → 3-line TLE records, terminated by a single `.\n`
- `CONTACTS\n` → JSON array of `{station, network, spacecraft, norad_id, link, timestamp}`

**HTTP, `127.0.0.1:8080`** — the browser display and its JSON:
- `/` → the page in `web/`
- `/api/stations`, `/api/tles`, `/api/contacts`, `/api/health`

The display runs without the data layer too — serve `web/` from any static
server and it falls back to a demo constellation, with the header badge reading
`DEMO` instead of `LIVE`. See [`web/README.md`](web/README.md).

### Tests

```bash
python3 -m unittest python.tests.test_smoke -v   # data layer + HTTP bridge, no network
cd web && node --test "js/*.test.js"             # orbit math
```

## Development Roadmap

1. **FreeFlyer prototype** — rapid visibility prototype using built-in DSN/NEN stations *(complete)*
2. **Python real-time layer** — live TLE updates, SatNOGS polling, DSN Now, contact aggregation, socket server *(complete; NEN feed pending)*
3. **Browser display** — the three.js globe in `web/`, live off the data layer *(working; kiosk hardening and SGP4 pending)*
4. **Blender** — optional pre-rendered scenes using the DSN 34 dish, no longer the plan for the live TV *(deferred)*

See [TODO.md](TODO.md) for the detailed task list and [ARCHITECTURE.md](ARCHITECTURE.md) for system design.

## Background

FreeFlyer is flight dynamics software from [a.i. solutions, Inc.](https://ai-solutions.com/) used operationally at NASA Goddard's Flight Dynamics Facility for the [Conjunction Assessment Risk Analysis (CARA)](https://satellitesafety.gsfc.nasa.gov/cara.html) program. The Engineer (student) tier is used here for rapid prototyping before the final Blender visualization is built.
