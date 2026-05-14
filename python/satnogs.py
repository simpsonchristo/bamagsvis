"""SatNOGS Network API client.

Fetches active observations and online stations.
Docs: https://network.satnogs.org/api/
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

log = logging.getLogger(__name__)

SATNOGS_BASE = "https://network.satnogs.org/api"
STATION_STATUS_ONLINE = 2  # SatNOGS station status code: 2 = online


@dataclass
class SatNOGSStation:
    id: int
    name: str
    lat: float
    lng: float
    altitude: float
    status: int
    online: bool


@dataclass
class SatNOGSObservation:
    id: int
    station_id: int
    norad_cat_id: int
    start: datetime
    end: datetime
    status: str  # "good", "bad", "future", etc.

    def is_active(self, now: datetime | None = None) -> bool:
        now = now or datetime.now(timezone.utc)
        return self.start <= now <= self.end


def _get_json(url: str, timeout: float = 30.0):
    req = urllib.request.Request(url, headers={"User-Agent": "bamagsvis/0.2"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _parse_dt(s: str) -> datetime:
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


def fetch_online_stations() -> list[SatNOGSStation]:
    """Return only stations whose status is 'online'."""
    url = f"{SATNOGS_BASE}/stations/?status={STATION_STATUS_ONLINE}"
    try:
        rows = _get_json(url)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        log.warning("SatNOGS station fetch failed: %s", exc)
        return []
    stations = []
    for r in rows:
        stations.append(
            SatNOGSStation(
                id=r["id"],
                name=r.get("name", f"station-{r['id']}"),
                lat=float(r.get("lat", 0.0)),
                lng=float(r.get("lng", 0.0)),
                altitude=float(r.get("altitude", 0.0)),
                status=int(r.get("status", 0)),
                online=True,
            )
        )
    log.info("SatNOGS: %d online stations", len(stations))
    return stations


def fetch_active_observations(window_minutes: int = 30) -> list[SatNOGSObservation]:
    """Return observations whose window currently includes 'now'."""
    now = datetime.now(timezone.utc)
    start = (now - timedelta(minutes=window_minutes)).isoformat()
    end = (now + timedelta(minutes=window_minutes)).isoformat()
    qs = urllib.parse.urlencode({"start": start, "end": end})
    url = f"{SATNOGS_BASE}/observations/?{qs}"
    try:
        rows = _get_json(url)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        log.warning("SatNOGS observation fetch failed: %s", exc)
        return []
    obs: list[SatNOGSObservation] = []
    for r in rows:
        try:
            o = SatNOGSObservation(
                id=int(r["id"]),
                station_id=int(r["ground_station"]),
                norad_cat_id=int(r["norad_cat_id"]),
                start=_parse_dt(r["start"]),
                end=_parse_dt(r["end"]),
                status=str(r.get("status", "unknown")),
            )
        except (KeyError, ValueError) as exc:
            log.debug("skipping malformed observation: %s", exc)
            continue
        if o.is_active(now):
            obs.append(o)
    log.info("SatNOGS: %d currently active observations", len(obs))
    return obs
