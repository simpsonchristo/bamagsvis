"""Jonathan McDowell's GCAT — satellite metadata catalog.

GCAT (General Catalog of Artificial Space Objects) is metadata-only —
it complements a TLE source with owner, country, status, and orbit
class fields that the raw TLE stream does not carry.

Source:  https://planet4589.org/space/gcat/tsv/derived/currentcat.tsv
Updated: daily by Jonathan McDowell

We fetch once per day, cache the raw TSV to disk, and expose a
`dict[int, SatMeta]` keyed by NORAD catalog number for O(1) enrichment
of propagated satellite records.
"""

from __future__ import annotations

import csv
import io
import logging
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

GCAT_URL = "https://planet4589.org/space/gcat/tsv/derived/currentcat.tsv"
DEFAULT_CACHE = Path("gcat_currentcat.tsv")
CACHE_MAX_AGE_SEC = 24 * 3600  # refetch if cache is older than 24h


@dataclass
class SatMeta:
    """Metadata for a single tracked object, keyed by NORAD catalog id."""
    norad_id: int
    name: str = ""
    owner: str = ""        # operator organization code (e.g. NASA, ESA, CMA)
    state: str = ""        # A = active, D = decayed, R = reentered, etc.
    launch_date: str = ""  # ISO-ish YYYY MMM DD or YYYY-MM-DD
    perigee_km: float | None = None
    apogee_km: float | None = None
    inclination_deg: float | None = None


def _parse_float(s: str | None) -> float | None:
    if s is None:
        return None
    s = s.strip()
    if not s or s in {"-", "?", "N/A"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_int(s: str | None) -> int | None:
    if s is None:
        return None
    s = s.strip()
    if not s or s in {"-", "?"}:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def parse_gcat_tsv(text: str) -> dict[int, SatMeta]:
    """Parse a GCAT `currentcat.tsv` file into a dict keyed by NORAD id.

    GCAT files are tab-separated with a header row. Column names vary
    slightly between GCAT snapshots, so we look up each field by name
    (case-insensitive) and tolerate missing columns.
    """
    # GCAT sometimes prepends a units row after the header ("-" / "#" markers)
    # — DictReader handles it as an ordinary row we filter later on Satcat parse.
    reader = csv.DictReader(io.StringIO(text), delimiter="\t")
    if not reader.fieldnames:
        log.warning("GCAT: empty file or no header row")
        return {}

    # Case-insensitive field lookup so a rename doesn't silently break us.
    fmap = {name.strip().lower(): name for name in reader.fieldnames}

    def col(row: dict, *candidates: str) -> str | None:
        for c in candidates:
            key = fmap.get(c.lower())
            if key is not None:
                v = row.get(key)
                if v is not None:
                    return v.strip()
        return None

    out: dict[int, SatMeta] = {}
    for row in reader:
        norad = _parse_int(col(row, "Satcat", "NORAD", "NORAD_CAT_ID"))
        if norad is None:
            continue
        meta = SatMeta(
            norad_id=norad,
            name=col(row, "Name") or "",
            owner=col(row, "Owner", "Operator") or "",
            state=col(row, "State", "Status") or "",
            launch_date=col(row, "LDate", "LaunchDate") or "",
            perigee_km=_parse_float(col(row, "Perigee")),
            apogee_km=_parse_float(col(row, "Apogee")),
            inclination_deg=_parse_float(col(row, "Inc", "Inclination")),
        )
        out[norad] = meta
    log.info("GCAT: parsed %d records", len(out))
    return out


def _fetch_raw(timeout: float = 60.0) -> str:
    req = urllib.request.Request(GCAT_URL, headers={"User-Agent": "bamagsvis/0.2"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_with_cache(cache_path: str | Path = DEFAULT_CACHE,
                     max_age_sec: int = CACHE_MAX_AGE_SEC) -> dict[int, SatMeta]:
    """Return the GCAT catalog, using an on-disk cache to avoid re-downloading.

    - If the cache is younger than `max_age_sec`, parse and return it (no network).
    - Otherwise try to fetch, write the cache, and parse the fresh copy.
    - If the fetch fails and a stale cache exists, use it anyway.
    - If everything fails, return an empty dict (caller should degrade gracefully).
    """
    cache = Path(cache_path)
    cache_fresh = cache.exists() and (time.time() - cache.stat().st_mtime) < max_age_sec

    if cache_fresh:
        try:
            return parse_gcat_tsv(cache.read_text(encoding="utf-8", errors="replace"))
        except Exception as exc:
            log.warning("GCAT cache parse failed (%s); refetching", exc)

    try:
        text = _fetch_raw()
        cache.write_text(text, encoding="utf-8")
        return parse_gcat_tsv(text)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        log.warning("GCAT fetch failed (%s)", exc)
        if cache.exists():
            log.warning("GCAT: falling back to stale cache %s", cache)
            try:
                return parse_gcat_tsv(cache.read_text(encoding="utf-8", errors="replace"))
            except Exception as exc2:
                log.warning("GCAT stale cache parse failed (%s)", exc2)
        return {}
