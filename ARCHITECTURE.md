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
                    ▼
             3D Renderer (Blender / FreeFlyer View)
                    │
                    ▼
              TV / Display Output
```

---

## Component Breakdown

### 1. TLE Ingestion

**Files:** `CelestrakSocketwithtlecheck.MissionPlan`, `satnogs.txt`

- Connects to Celestrak via socket to fetch current TLE catalog
- Validates TLE age; rejects elements older than a configurable threshold
- `satnogs.txt` serves as a fallback offline snapshot (~370 satellites)
- Python layer (planned) will add SatNOGS polling for community ground stations

### 2. Orbit Propagation — FreeFlyer

**Files:** `trackingVisualization.MissionPlan`, `CelestrakSocketwithtlecheck.MissionPlan`

- Propagates TLEs using SGP4/SDP4 inside FreeFlyer
- Computes ECI/ECEF positions at the current epoch
- Resolves visibility windows: elevation angle > threshold, line-of-sight not blocked
- DSN and NEN stations are built into FreeFlyer's ground station library
- SatNOGS stations require custom entries (lat/lon/alt from the SatNOGS API)

### 3. Ground Station Contact Resolver

**Files:** `trackingVisualization.MissionPlan`

- Queries DSN Now / SatNOGS API for active contacts
- Determines which station–satellite pairs are in active TX or RX
- Produces a list of `(station, satellite, link_type)` tuples passed to the renderer

### 4. Visualization Layer

**Files:** `trackingVisualization.MissionPlan`, `animationExample.MissionPlan`, `Models/DSN 34/`

Two rendering backends exist (one per project phase):

#### 4a. FreeFlyer View (prototype)
- Built-in 3D globe with satellite tracks and ground station icons
- Ground station view vectors added (`Added Vectors to GSView` commit)
- Fast to iterate; used to validate logic before the Blender build

#### 4b. Blender (final TV display)
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
