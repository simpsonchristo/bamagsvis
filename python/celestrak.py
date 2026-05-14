"""Celestrak TLE poller with offline fallback."""

from __future__ import annotations

import logging
import urllib.error
import urllib.request
from pathlib import Path

from .tle import TLE, parse_tle_text

log = logging.getLogger(__name__)

CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle"


def fetch_celestrak(group: str = "active", timeout: float = 30.0) -> list[TLE]:
    """Fetch a TLE group from Celestrak. Raises urllib errors on failure."""
    url = CELESTRAK_GP_URL.format(group=group)
    log.info("fetching TLEs from %s", url)
    req = urllib.request.Request(url, headers={"User-Agent": "bamagsvis/0.2"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    tles = parse_tle_text(text)
    log.info("fetched %d TLEs from group=%s", len(tles), group)
    return tles


def load_offline(path: str | Path) -> list[TLE]:
    """Load the offline TLE snapshot (e.g., satnogs.txt)."""
    p = Path(path)
    if not p.exists():
        log.warning("offline TLE file not found: %s", p)
        return []
    tles = parse_tle_text(p.read_text(encoding="utf-8", errors="replace"))
    log.info("loaded %d TLEs from offline file %s", len(tles), p)
    return tles


def fetch_with_fallback(group: str, offline_path: str | Path) -> list[TLE]:
    """Try Celestrak; on any network error fall back to the offline snapshot."""
    try:
        return fetch_celestrak(group)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        log.warning("Celestrak fetch failed (%s); using offline fallback", exc)
        return load_offline(offline_path)
