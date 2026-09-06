# Design source

The visualization in [`web/`](../web/) came out of a Claude Design canvas. This
directory keeps that canvas as the design of record, so the look can be
re-derived or re-edited without going back through chat history.

| File | What it is |
|------|------------|
| `satellite-orbital-tracking-visualization.dc.html` | the canvas source — markup plus the component logic, in Claude Design's own runtime format |
| `satellite-orbital-tracking-visualization.standalone.html` | the self-contained export: open it in a browser and the original runs, fonts and all, with no server |
| `nocturne/styles.css` | the Nocturne design system token sheet and component classes |
| `nocturne/readme.md` | how Nocturne is meant to be used — color, type, components, states |

`nocturne/styles.css` is vendored verbatim as `web/styles/nocturne.css`; keep
the two in step, and change the tokens there rather than overriding colors in
`web/styles/app.css`.

## What changed in the port

`web/` is a hand port to plain ES modules, not a copy: the canvas format needs
Claude Design's runtime, which is not something to ship on a kiosk. Layout,
color, interaction and the scene are the same. What differs:

- **Real data.** The canvas ran a fixed seven-satellite constellation from
  `t = 0`; the port reads live TLEs, stations and contacts from the Python
  bridge and keeps the demo constellation only as its offline fallback.
- **Real time and real geography.** The canvas's clock and its scene were
  independent — the clock read wall-clock UTC while the globe spun from zero.
  The port drives both from GMST, so a station sits under the map where it
  belongs and the clock is the time the scene is showing.
- **Frames.** ECI with +Z north, mapped to three.js's +Y-up world at the point
  of drawing. The canvas mirrored longitude, which put stations on the wrong
  side of the globe.
- **Elliptical orbits and J2.** Circular-only propagation became mean elements
  with a Kepler solve and secular J2 drift, so real TLEs propagate sensibly.
- **In-place HUD updates.** The canvas rebuilt its lists every refresh; at
  twice a second that swallows clicks, so the port reconciles the DOM instead.
