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
| Simulation | FreeFlyer (Engineer tier) | Orbit propagation, visibility windows, ground station contacts |
| Processing | Python | Real-time TLE ingestion, observation state, SatNOGS polling |
| Visualization | Blender | 3D scene rendering — globe, satellite tracks, TX/RX vectors |
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
├── README.md
├── ARCHITECTURE.md
├── TODO.md
└── WORKLOG.md
```

## Development Roadmap

1. **FreeFlyer prototype** — rapid visibility prototype using built-in DSN/NEN stations *(complete)*
2. **Python real-time layer** — live TLE updates, SatNOGS polling, observation state *(in progress)*
3. **Blender final display** — polished 3D TV-ready render with TX/RX link visualization *(planned)*

See [TODO.md](TODO.md) for the detailed task list and [ARCHITECTURE.md](ARCHITECTURE.md) for system design.

## Background

FreeFlyer is flight dynamics software from [a.i. solutions, Inc.](https://ai-solutions.com/) used operationally at NASA Goddard's Flight Dynamics Facility for the [Conjunction Assessment Risk Analysis (CARA)](https://satellitesafety.gsfc.nasa.gov/cara.html) program. The Engineer (student) tier is used here for rapid prototyping before the final Blender visualization is built.
