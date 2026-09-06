# Browser display

The visualizer that runs on the TV: a three.js globe with the ground stations,
the satellites currently overhead, and the TX/RX beams for an active contact.
This is a port of the Claude Design canvas kept in
[`design/`](../design/) — same layout, same Nocturne design system, same
interaction — rewritten as plain ES modules so it can run on real data with no
build step and no design-tool runtime.

## Running it

```bash
python3 -m python.main          # data layer + bridge, then open http://127.0.0.1:8080/
python3 -m python.main --no-web # TCP feed only, for the FreeFlyer/Blender path
```

Without the data layer, any static server works and the page falls back to its
built-in demo constellation:

```bash
cd web && python3 -m http.server 8000
```

`file://` will not work: the page is made of ES modules, which browsers refuse
to load from the filesystem.

## What talks to what

```
python/main.py ── ServerState ──┬── server.py      TCP 5005  → FreeFlyer / Blender
                                └── web_bridge.py  HTTP 8080 → this page
                                                     /api/stations
                                                     /api/tles
                                                     /api/contacts
```

`js/data.js` polls those three endpoints — stations and TLEs every five
minutes, contacts every fifteen seconds — and holds its last good state when a
request fails. If none of them answer, the badge in the header reads `DEMO`
instead of `LIVE` and the page runs the seven-satellite demo constellation from
the design. Hover the badge for the current source of each feed.

| File | Role |
|------|------|
| `index.html` | markup, three.js loader (vendor first, CDN fallback) |
| `js/orbits.js` | frames, GMST, TLE parsing, propagation, look angles, pass search |
| `js/data.js` | bridge client, demo constellation, contact matching |
| `js/scene.js` | three.js scene: globe, stations, satellites, TX/RX beams |
| `js/ui.js` | overlay DOM — rails, detail card, badges |
| `js/app.js` | state, selection, refresh timers, frame loop |
| `styles/nocturne.css` | the design system, vendored from the design canvas |
| `styles/app.css` | layout for this page, tokens only |

## Reading the display

- **Left rail** — ground stations. The line underneath is how many tracked
  satellites are above that station's minimum elevation right now.
- **Right rail** — the satellites being drawn, with current altitude.
- **Click** anything, in a rail or in the scene, to select it. Selecting a
  station draws the TX/RX beam to its highest satellite and lists what is
  overhead; selecting a satellite lights its orbit, draws a trail, and gives
  look angles from the reference station. `Esc` clears.
- **REAL-TIME / 10x / 60x / 300x** runs the clock ahead of the wall clock;
  REAL-TIME snaps back to it. The clock in the header is always the time the
  scene is showing, in UTC.
- **LIVE / DEMO** is the data source, not the link state.

The reference station for satellite look angles is the first station whose
network is `LOCAL` — that is, the first entry in `stations` in your config —
falling back to the UA station.

## Accuracy

`orbits.js` propagates mean elements with J2 secular drift on RAAN, argument of
perigee and mean anomaly. It is not SGP4: expect a few km of along-track error
a day past the TLE epoch for LEO, growing with age, and no drag model. Passes
land within a few seconds of the right time, which is what the display needs,
but do not point a dish with it.

Upgrading to real SGP4 means dropping in
[satellite.js](https://github.com/shashwatak/satellite-js) and replacing
`propagate()` and `elementsFromTle()`; everything else — frames, look angles,
pass search, the scene — works off those two functions and would not change.

## Tests

```bash
cd web && node --test "js/*.test.js"   # orbit math: GMST, TLE decode, passes, frames
python3 -m unittest python.tests.test_smoke -v   # includes the bridge endpoints
```

## Offline kiosks

Two things reach the internet at load: three.js (see
[`vendor/README.md`](vendor/README.md)) and the Earth texture, which the scene
tries at `web/assets/earth_atmos_2048.jpg` before falling back to
`threejs.org`. Drop any 2:1 equirectangular Earth image at that path and the
page stops needing the network for it — for example
`https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg`, which is
what the design canvas used. With neither, the globe renders as a plain dark
sphere and everything else still works.
