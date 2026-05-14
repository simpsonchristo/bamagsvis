"""bamagsvis TV display — Dash + Plotly Scattergeo globe.

Run:
    python3 -m viz.app [--port 8050] [--offline]

The page is designed to fill a TV in a browser set to fullscreen (F11).
Auto-refreshes TLE positions every 30 s; refreshes TLE catalog every hour.
"""

from __future__ import annotations

import argparse
import logging
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import dash
import plotly.graph_objects as go
from dash import dcc, html
from dash.dependencies import Input, Output

# ── project imports ──────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from python.celestrak import fetch_with_fallback, load_offline
from python.dsn import DSNDish, fetch_dsn_now
from python.tle import TLE, validate_age
from viz.propagator import SatPosition, build_satellites, propagate

log = logging.getLogger(__name__)

# ── Observer (UA Tuscaloosa) ─────────────────────────────────────────────────
OBSERVER_NAME = "UA Tuscaloosa"
OBSERVER_LAT = 33.2098
OBSERVER_LON = -87.5692
OBSERVER_ALT_M = 71.0

# ── DSN complex locations (lat, lon, label) ───────────────────────────────────
DSN_COMPLEXES = [
    (35.431, -116.793, "Goldstone"),
    (40.431,   -4.248, "Madrid"),
    (-35.402,  148.981, "Canberra"),
]

# ── Shared state (updated by background threads) ─────────────────────────────
_lock = threading.Lock()
_tles: list[TLE] = []
_sats = []          # list[EarthSatellite]
_dsn_dishes: list[DSNDish] = []

# ── TV color palette ─────────────────────────────────────────────────────────
BG_PAGE   = "#060b14"
BG_GLOBE  = "#0d1b2a"
LAND      = "#1a2940"
OCEAN     = "#060e1a"
COLOR_ALL = "rgba(120,180,255,0.45)"   # not overhead
COLOR_OVR = "rgba(255,220,60,0.85)"    # overhead (above horizon)
COLOR_VIS = "rgba(60,255,120,1.0)"     # visible (>5° elevation)
COLOR_OBS = "#ff4455"                  # observer ground station
COLOR_DSN = "#ff9900"                  # DSN complex

# ── Background TLE refresh ────────────────────────────────────────────────────
def _tle_refresh_loop(offline: bool, stop: threading.Event) -> None:
    global _tles, _sats
    while not stop.is_set():
        try:
            if offline:
                # Skip age validation on the offline snapshot; it is intentionally old.
                raw = load_offline("satnogs.txt")
                valid = raw
            else:
                raw = fetch_with_fallback("active", "satnogs.txt")
                valid = list(validate_age(raw, warn_days=7, reject_days=14))
            built = build_satellites(valid)
            with _lock:
                _tles = valid
                _sats = built
            log.info("TLE refresh: %d satellites loaded", len(valid))
        except Exception as exc:
            log.warning("TLE refresh failed: %s", exc)
        stop.wait(3600)


def _dsn_refresh_loop(stop: threading.Event) -> None:
    global _dsn_dishes
    while not stop.is_set():
        try:
            dishes = fetch_dsn_now()
            with _lock:
                _dsn_dishes = dishes
        except Exception as exc:
            log.warning("DSN refresh failed: %s", exc)
        stop.wait(60)


# ── Plot builder ──────────────────────────────────────────────────────────────
def _build_figure(positions: list[SatPosition], dishes: list[DSNDish]) -> go.Figure:
    # Bucket satellites by visibility tier
    all_lats, all_lons, all_names = [], [], []
    ovr_lats, ovr_lons, ovr_names = [], [], []
    vis_lats, vis_lons, vis_names = [], [], []

    for p in positions:
        hover = f"{p.name}<br>El: {p.elevation_deg:.1f}° Az: {p.azimuth_deg:.1f}°<br>Alt: {p.alt_km:.0f} km"
        if p.visible:
            vis_lats.append(p.lat); vis_lons.append(p.lon); vis_names.append(hover)
        elif p.overhead:
            ovr_lats.append(p.lat); ovr_lons.append(p.lon); ovr_names.append(hover)
        else:
            all_lats.append(p.lat); all_lons.append(p.lon); all_names.append(hover)

    traces = []

    # Not overhead
    if all_lats:
        traces.append(go.Scattergeo(
            lat=all_lats, lon=all_lons,
            mode="markers",
            marker=dict(size=3, color=COLOR_ALL, symbol="circle"),
            hovertext=all_names, hoverinfo="text",
            name="In orbit",
            showlegend=True,
        ))

    # Overhead (above horizon)
    if ovr_lats:
        traces.append(go.Scattergeo(
            lat=ovr_lats, lon=ovr_lons,
            mode="markers",
            marker=dict(size=6, color=COLOR_OVR, symbol="circle",
                        line=dict(width=0)),
            hovertext=ovr_names, hoverinfo="text",
            name="Overhead",
            showlegend=True,
        ))

    # Visible (>5° elevation)
    if vis_lats:
        traces.append(go.Scattergeo(
            lat=vis_lats, lon=vis_lons,
            mode="markers+text",
            marker=dict(size=9, color=COLOR_VIS, symbol="circle",
                        line=dict(color="white", width=0.5)),
            text=[n.split("<br>")[0] for n in vis_names],
            textposition="top center",
            textfont=dict(size=8, color=COLOR_VIS),
            hovertext=vis_names, hoverinfo="text",
            name="Visible (>5°)",
            showlegend=True,
        ))

    # Observer ground station
    traces.append(go.Scattergeo(
        lat=[OBSERVER_LAT], lon=[OBSERVER_LON],
        mode="markers+text",
        marker=dict(size=14, color=COLOR_OBS, symbol="star",
                    line=dict(color="white", width=1)),
        text=[OBSERVER_NAME],
        textposition="bottom right",
        textfont=dict(size=11, color=COLOR_OBS),
        hoverinfo="text", hovertext=[OBSERVER_NAME],
        name=OBSERVER_NAME, showlegend=True,
    ))

    # DSN complexes + active contact labels
    active_by_complex: dict[str, list[str]] = {}
    for dish in dishes:
        for tgt in dish.targets:
            active_by_complex.setdefault(dish.station, []).append(
                f"{tgt.spacecraft} ({'↑' if tgt.uplink else ''}{'↓' if tgt.downlink else ''})"
            )

    for lat, lon, label in DSN_COMPLEXES:
        contacts = active_by_complex.get(label, [])
        hover = f"{label} DSN<br>" + ("<br>".join(contacts) if contacts else "idle")
        badge = f"{label} {'●' if contacts else ''}"
        traces.append(go.Scattergeo(
            lat=[lat], lon=[lon],
            mode="markers+text",
            marker=dict(size=10, color=COLOR_DSN, symbol="triangle-up",
                        line=dict(color="white", width=1)),
            text=[badge], textposition="top right",
            textfont=dict(size=9, color=COLOR_DSN),
            hovertext=[hover], hoverinfo="text",
            name=f"{label} DSN", showlegend=False,
        ))

        # Draw TX/RX lines from DSN dish to tracked satellite subpoints
        for dish in dishes:
            if dish.station != label:
                continue
            for tgt in dish.targets:
                match = next((p for p in positions if tgt.spacecraft.lower() in p.name.lower()), None)
                if match is None:
                    continue
                link_color = "#ff6600" if tgt.uplink and tgt.downlink else ("#ff3300" if tgt.uplink else "#00ccff")
                traces.append(go.Scattergeo(
                    lat=[lat, match.lat], lon=[lon, match.lon],
                    mode="lines",
                    line=dict(width=2, color=link_color),
                    hoverinfo="skip",
                    showlegend=False,
                ))

    fig = go.Figure(data=traces)
    fig.update_geos(
        projection_type="orthographic",
        projection_rotation=dict(lon=OBSERVER_LON, lat=OBSERVER_LAT, roll=0),
        showland=True, landcolor=LAND,
        showocean=True, oceancolor=OCEAN,
        showlakes=False,
        showcountries=True, countrycolor="rgba(60,90,120,0.6)",
        showcoastlines=True, coastlinecolor="rgba(60,90,120,0.5)",
        bgcolor=BG_GLOBE,
        lataxis_showgrid=False, lonaxis_showgrid=False,
    )
    fig.update_layout(
        paper_bgcolor=BG_PAGE,
        plot_bgcolor=BG_PAGE,
        margin=dict(l=0, r=0, t=0, b=0),
        legend=dict(
            bgcolor="rgba(6,11,20,0.85)",
            bordercolor="rgba(120,180,255,0.3)",
            borderwidth=1,
            font=dict(color="white", size=12),
            x=0.01, y=0.99,
        ),
        geo=dict(bgcolor=BG_GLOBE),
    )
    return fig


# ── Dash app ──────────────────────────────────────────────────────────────────
app = dash.Dash(__name__, title="UA Satellite Tracker")
app.layout = html.Div(
    style={"backgroundColor": BG_PAGE, "height": "100vh",
           "display": "flex", "flexDirection": "column", "fontFamily": "monospace"},
    children=[
        # ── header ──────────────────────────────────────────────────────────
        html.Div(
            style={"display": "flex", "justifyContent": "space-between",
                   "alignItems": "center", "padding": "6px 18px",
                   "borderBottom": "1px solid rgba(120,180,255,0.2)"},
            children=[
                html.H2("UA Ground Station — Satellite Tracker",
                        style={"color": "#7ab4ff", "margin": 0, "fontSize": "1.2rem"}),
                html.Div(id="header-stats",
                         style={"color": "#aaa", "fontSize": "0.9rem"}),
            ],
        ),

        # ── globe ─────────────────────────────────────────────────────────
        dcc.Graph(
            id="globe",
            style={"flex": "1", "minHeight": 0},
            config={"displayModeBar": False, "scrollZoom": False},
        ),

        # ── footer: DSN contacts ─────────────────────────────────────────
        html.Div(
            id="dsn-panel",
            style={"borderTop": "1px solid rgba(255,153,0,0.3)",
                   "padding": "4px 18px", "color": COLOR_DSN, "fontSize": "0.85rem",
                   "minHeight": "28px"},
        ),

        # ── auto-refresh every 30 s ───────────────────────────────────────
        dcc.Interval(id="interval", interval=30_000, n_intervals=0),
    ],
)


@app.callback(
    Output("globe", "figure"),
    Output("header-stats", "children"),
    Output("dsn-panel", "children"),
    Input("interval", "n_intervals"),
)
def refresh(_):
    with _lock:
        sats = list(_sats)
        dishes = list(_dsn_dishes)

    positions = propagate(sats, OBSERVER_LAT, OBSERVER_LON, OBSERVER_ALT_M)
    n_overhead = sum(1 for p in positions if p.overhead)
    n_visible  = sum(1 for p in positions if p.visible)
    now_str    = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    stats = f"{now_str}  |  {len(positions)} tracked  |  {n_overhead} overhead  |  {n_visible} visible (>5°)"

    # DSN footer
    dsn_items = []
    for dish in dishes:
        for tgt in dish.targets:
            link = ("TX+RX" if tgt.uplink and tgt.downlink
                    else "TX" if tgt.uplink else "RX")
            dsn_items.append(f"[{dish.station}/{dish.name}] {tgt.spacecraft} — {link}")
    dsn_text = "  ·  ".join(dsn_items) if dsn_items else "DSN — no active contacts"

    fig = _build_figure(positions, dishes)
    return fig, stats, dsn_text


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8050)
    parser.add_argument("--offline", action="store_true",
                        help="use satnogs.txt instead of Celestrak")
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()
    logging.basicConfig(level=args.log_level,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    stop = threading.Event()
    threading.Thread(target=_tle_refresh_loop,  args=(args.offline, stop), daemon=True).start()
    threading.Thread(target=_dsn_refresh_loop,  args=(stop,),              daemon=True).start()

    # Give the TLE thread a moment to populate before the first request
    time.sleep(2)

    app.run(host="0.0.0.0", port=args.port, debug=False)


if __name__ == "__main__":
    main()
