"""DSN Now client.

Parses the public DSN status XML feed used by NASA Eyes on the DSN.
Each <dish> element lists its currently tracked spacecraft and per-target
uplink/downlink state, which maps directly to TX/RX visualization.
"""

from __future__ import annotations

import logging
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

# NASA Eyes' DSN Now dashboard uses a cache-busting ?r=<epoch> query on every
# request. Without it, an intermediate CDN can return a stale copy for minutes.
DSN_NOW_URL = "https://eyes.nasa.gov/dsn/data/dsn.xml?r={ts}"


@dataclass
class DSNTarget:
    spacecraft: str
    uplink: bool
    downlink: bool


@dataclass
class DSNDish:
    name: str
    station: str
    azimuth_deg: float | None = None
    elevation_deg: float | None = None
    targets: list[DSNTarget] = field(default_factory=list)


def fetch_dsn_now(timeout: float = 30.0) -> list[DSNDish]:
    """Fetch and parse the DSN Now XML feed."""
    url = DSN_NOW_URL.format(ts=int(time.time()))
    req = urllib.request.Request(url, headers={
        "User-Agent": "bamagsvis/0.2",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        log.warning("DSN Now fetch failed: %s", exc)
        return []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        log.warning("DSN Now XML parse failed: %s", exc)
        return []

    dishes: list[DSNDish] = []
    for station_el in root.findall("station"):
        station_name = station_el.get("name", "?")
        for dish_el in station_el.findall("dish"):
            dish = DSNDish(
                name=dish_el.get("name", "?"),
                station=station_name,
                azimuth_deg=_maybe_float(dish_el.get("azimuthAngle")),
                elevation_deg=_maybe_float(dish_el.get("elevationAngle")),
            )
            for tgt in dish_el.findall("target"):
                dish.targets.append(
                    DSNTarget(
                        spacecraft=tgt.get("name", "?"),
                        uplink=_truthy(tgt.get("uplink")),
                        downlink=_truthy(tgt.get("downlink")),
                    )
                )
            for ul in dish_el.findall("upSignal"):
                _ensure_target(dish, ul.get("spacecraft", "?")).uplink = True
            for dl in dish_el.findall("downSignal"):
                _ensure_target(dish, dl.get("spacecraft", "?")).downlink = True
            dishes.append(dish)
    log.info("DSN: %d dishes parsed (%d active)", len(dishes), sum(1 for d in dishes if d.targets))
    return dishes


def _maybe_float(s: str | None) -> float | None:
    if s is None or s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _truthy(s: str | None) -> bool:
    return str(s).lower() in {"true", "1", "yes", "on"}


def _ensure_target(dish: DSNDish, spacecraft: str) -> DSNTarget:
    for t in dish.targets:
        if t.spacecraft == spacecraft:
            return t
    t = DSNTarget(spacecraft=spacecraft, uplink=False, downlink=False)
    dish.targets.append(t)
    return t
