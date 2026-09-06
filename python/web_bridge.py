"""HTTP bridge for the browser visualizer.

The FreeFlyer/Blender consumers read the line-delimited TCP protocol in
`server.py`; a browser cannot speak that, so this module puts the same
`ServerState` behind a small JSON API and serves `web/` alongside it.

Endpoints:
  GET /api/health    -> {"status", "tles", "contacts"}
  GET /api/stations  -> {"stations": [{id, name, network, lat, lon, altM,
                                       minElevationDeg}]}
  GET /api/tles      -> {"generated", "count", "records": [{name, line1, line2}]}
  GET /api/contacts  -> {"generated", "contacts": [Contact...]}

Everything else is served from the web root as a static file.

Bind stays on 127.0.0.1 unless the config says otherwise: this serves public
tracking data, but it is a display feed, not a public service.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .config import Config, GroundStation
from .server import ServerState

log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WEB_ROOT = REPO_ROOT / "web"

#: Reference stations the display shows when the config names none of its own.
#: Coordinates are the published complex locations for DSN and NEN; the UA
#: entry is the SatNOGS-side ground station this project is built around.
DEFAULT_STATIONS: list[GroundStation] = [
    GroundStation("UA Station (Tuscaloosa)", 33.21, -87.55, network="SatNOGS"),
    GroundStation("Goldstone", 35.43, -116.89, network="DSN"),
    GroundStation("Madrid", 40.43, -4.25, network="DSN"),
    GroundStation("Canberra", -35.40, 148.98, network="DSN"),
    GroundStation("Wallops", 37.94, -75.47, network="NEN"),
    GroundStation("McMurdo", -77.85, 166.67, network="NEN"),
]

#: NORAD ids drawn when the config does not pin a watchlist of its own.
DEFAULT_WATCHLIST: list[int] = [
    25544,  # ISS (ZARYA)
    33591,  # NOAA-19
    25994,  # TERRA
    49260,  # LANDSAT-9
    41866,  # GOES-16
    40697,  # SENTINEL-2A
]

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def station_id(name: str) -> str:
    return _SLUG_RE.sub("-", name.lower()).strip("-") or "station"


def stations_payload(cfg: Config) -> list[dict]:
    """Config stations first (they are the local ones), then the references."""
    stations = list(cfg.stations) + [
        s for s in DEFAULT_STATIONS
        if station_id(s.name) not in {station_id(c.name) for c in cfg.stations}
    ]
    return [
        {
            "id": station_id(s.name),
            "name": s.name,
            "network": s.network,
            "lat": s.lat_deg,
            "lon": s.lon_deg,
            "altM": s.alt_m,
            "minElevationDeg": s.min_elevation_deg,
        }
        for s in stations
    ]


def _contact_norad_ids(contacts: list[dict]) -> list[int]:
    out = []
    for c in contacts:
        norad = c.get("norad_id")
        if isinstance(norad, int) and norad not in out:
            out.append(norad)
    return out


def tles_payload(cfg: Config, state: ServerState) -> dict:
    """The watchlist, plus whatever the networks are actively working."""
    tles = state.snapshot_tles()
    contacts = state.snapshot_contacts()
    watchlist = cfg.web_watchlist or DEFAULT_WATCHLIST
    wanted = list(dict.fromkeys(list(watchlist) + _contact_norad_ids(contacts)))

    by_id: dict[int, object] = {}
    for t in tles:
        try:
            by_id[t.norad_id] = t
        except (ValueError, IndexError):  # malformed line 1
            continue

    selected = [by_id[n] for n in wanted if n in by_id]
    if not selected:  # nothing on the watchlist is in the catalogue yet
        selected = tles[: cfg.web_max_satellites]
    selected = selected[: cfg.web_max_satellites]

    return {
        "generated": datetime.now(timezone.utc).isoformat(),
        "count": len(selected),
        "catalogue": len(tles),
        "records": [{"name": t.name, "line1": t.line1, "line2": t.line2} for t in selected],
    }


def contacts_payload(state: ServerState) -> dict:
    return {
        "generated": datetime.now(timezone.utc).isoformat(),
        "contacts": state.snapshot_contacts(),
    }


class BridgeHandler(SimpleHTTPRequestHandler):
    """Static files from the web root, JSON under /api/."""

    protocol_version = "HTTP/1.1"

    def __init__(self, *args, cfg: Config, state: ServerState, web_root: Path, **kwargs):
        self.cfg = cfg
        self.state = state
        super().__init__(*args, directory=str(web_root), **kwargs)

    # -- routing --

    def do_GET(self) -> None:  # noqa: N802 (http.server naming)
        route = self.path.split("?", 1)[0].rstrip("/") or "/"
        if route == "/api/health":
            self._send_json({
                "status": "ok",
                "tles": len(self.state.snapshot_tles()),
                "contacts": len(self.state.snapshot_contacts()),
            })
        elif route == "/api/stations":
            self._send_json({"stations": stations_payload(self.cfg)})
        elif route == "/api/tles":
            self._send_json(tles_payload(self.cfg, self.state))
        elif route == "/api/contacts":
            self._send_json(contacts_payload(self.state))
        elif route.startswith("/api"):
            self._send_json({"error": "unknown endpoint"}, status=404)
        else:
            super().do_GET()

    # -- helpers --

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        # Static assets change whenever the display is redeployed; never let a
        # kiosk browser hold a stale bundle.
        if not self.path.startswith("/api"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        log.debug("%s - %s", self.address_string(), fmt % args)


def make_server(
    cfg: Config,
    state: ServerState,
    web_root: Path | None = None,
) -> ThreadingHTTPServer:
    root = Path(web_root or cfg.web_root or DEFAULT_WEB_ROOT)
    if not root.is_absolute():
        root = REPO_ROOT / root
    handler = partial(BridgeHandler, cfg=cfg, state=state, web_root=root)
    httpd = ThreadingHTTPServer((cfg.web_host, cfg.web_port), handler)
    httpd.daemon_threads = True
    return httpd


def serve_forever(cfg: Config, state: ServerState, web_root: Path | None = None) -> None:
    httpd = make_server(cfg, state, web_root)
    host, port = httpd.server_address[:2]
    log.info("web bridge on http://%s:%d/", host, port)
    httpd.serve_forever()


def start_in_thread(
    cfg: Config,
    state: ServerState,
    web_root: Path | None = None,
) -> tuple[ThreadingHTTPServer, threading.Thread]:
    """Start the bridge on a daemon thread; returns the server so callers can stop it."""
    httpd = make_server(cfg, state, web_root)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True, name="web-bridge")
    thread.start()
    host, port = httpd.server_address[:2]
    log.info("web bridge on http://%s:%d/", host, port)
    return httpd, thread
