# bamagsvis — UA Ground Station Satellite Visualizer

Real-time TV display showing which satellites are currently overhead and visible from a ground station, with TX/RX link visualization when a ground station is actively coupled.

## What It Does

- Renders a live 3D scene on a display (TV/monitor) showing satellites currently overhead
- Highlights satellites visible above the horizon from a configured ground station
- When a ground station is coupled, draws the uplink (TX) and downlink (RX) vectors between the station and the satellite it is tracking
- Pulls live TLE data from Celestrak and SatNOGS to keep orbital elements current
- Supports DSN, NEN, and SatNOGS ground networks out of the box

## Tech Stack

| Layer | Tool | Role |
|-------|------|------|
| Simulation | FreeFlyer (Engineer tier) | Orbit propagation, visibility windows, ground station contacts (prototype) |
| Propagation | Skyfield + SGP4 | Python-native SGP4/SDP4 propagation, subpoint and topocentric geometry |
| Processing | Python | Real-time TLE ingestion, observation state, SatNOGS and DSN polling |
| TV Display | Plotly Dash | Web-served orthographic globe; satellite tiers, TX/RX links, 30-second refresh |
| 3D Assets | DSN 34 model (.blend / .3ds / .stl) | High-fidelity dish model for ground station representation |

## External Data Sources

- **Celestrak** — TLE catalog (polled via socket in `CelestrakSocketwithtlecheck.MissionPlan`)
- **SatNOGS Network** — community ground station observations: https://network.satnogs.org/
- **DSN / NEN Real-Time** — NASA tracking network status: https://scan-now.gsfc.nasa.gov/scan

## Repository Layout

```
bamagsvis/
├── trackingVisualization.MissionPlan       # Primary FreeFlyer scene: satellite tracking display
├── CelestrakSocketwithtlecheck.MissionPlan # Live TLE fetch + validation via Celestrak socket
├── animationExample.MissionPlan            # Reference animation patterns (DSN dish, vectors)
├── satnogs.txt                             # Cached TLE snapshot from SatNOGS catalog
├── Models/
│   └── DSN 34/                             # 34 m dish 3D model (Blender, 3DS, STL, textures)
├── python/                                 # Real-time data layer
│   ├── tle.py celestrak.py satnogs.py dsn.py nen.py
│   ├── contact_state.py server.py main.py config.py
│   └── tests/                              # Offline smoke tests (no network)
├── viz/                                    # Dash + Skyfield TV display (Phase 3)
│   ├── app.py                              # Dash app: orthographic globe, callbacks, layout
│   └── propagator.py                       # Skyfield wrapper: EarthSatellite positions + visibility
├── README.md
├── ARCHITECTURE.md
├── TODO.md
└── WORKLOG.md
```

## Running the TV Display (Phase 3 — Dash globe)

```bash
# Live mode — requires internet for Celestrak + DSN Now
python3 -m viz.app --port 8050

# Offline demo — uses satnogs.txt snapshot, no network required
python3 -m viz.app --offline --port 8050
```

Open `http://localhost:8050` and press F11 for fullscreen.  The globe
auto-refreshes satellite positions every 30 seconds.  Satellites are
color-coded in three tiers: blue (below horizon), yellow (above
horizon), green with label (visible > 5° elevation from UA Tuscaloosa).
DSN complexes are marked; when a DSN contact matches a known satellite,
a TX/RX line is drawn from the dish to the satellite's current subpoint.

## Running the Real-Time Data Layer (Phase 2 — TCP socket server)

```bash
python3 -m python.main                    # defaults: localhost:5005, all networks except NEN
python3 -m python.main --config cfg.json  # see python/config.py for fields
python3 -m unittest python.tests.test_smoke -v   # offline test suite
```

The server speaks a line-delimited TCP protocol on `127.0.0.1:5005`:
- `TLES\n` → 3-line TLE records, terminated by a single `.\n`
- `CONTACTS\n` → JSON array of `{station, network, spacecraft, norad_id, link, timestamp}`

## Development Roadmap

1. **FreeFlyer prototype** — rapid visibility prototype using built-in DSN/NEN stations *(complete)*
2. **Python real-time layer** — live TLE updates, SatNOGS polling, DSN Now, contact aggregation, socket server *(complete; NEN feed pending)*
3. **Dash + Skyfield TV display** — Python-only orthographic globe with real-time satellite tiers, DSN contact overlays, 30-second refresh *(complete)*
4. **Blender final display** — polished 3D render with animated dish model, TX/RX link vectors *(planned)*

See [TODO.md](TODO.md) for the detailed task list and [ARCHITECTURE.md](ARCHITECTURE.md) for system design.

## Background

FreeFlyer is flight dynamics software from [a.i. solutions, Inc.](https://ai-solutions.com/) used operationally at NASA Goddard's Flight Dynamics Facility for the [Conjunction Assessment Risk Analysis (CARA)](https://satellitesafety.gsfc.nasa.gov/cara.html) program. The Engineer (student) tier is used here for rapid prototyping before the final Blender visualization is built.
