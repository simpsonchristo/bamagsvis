"""TLE record, parser, and age validator."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Iterator

log = logging.getLogger(__name__)


@dataclass
class TLE:
    name: str
    line1: str
    line2: str

    @property
    def norad_id(self) -> int:
        return int(self.line1[2:7])

    @property
    def epoch(self) -> datetime:
        """Decode the TLE epoch field (line 1, columns 19-32, YYDDD.DDDDDD)."""
        year_2digit = int(self.line1[18:20])
        day_of_year = float(self.line1[20:32])
        year = 2000 + year_2digit if year_2digit < 57 else 1900 + year_2digit
        base = datetime(year, 1, 1, tzinfo=timezone.utc)
        return base + timedelta(days=day_of_year - 1)

    def age(self, now: datetime | None = None) -> timedelta:
        now = now or datetime.now(timezone.utc)
        return now - self.epoch


def parse_tle_text(text: str) -> list[TLE]:
    """Parse a 3-line-per-record TLE bundle (name, line1, line2)."""
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    out: list[TLE] = []
    i = 0
    while i + 2 < len(lines) + 1:
        if i + 1 >= len(lines):
            break
        if lines[i].startswith("1 ") and i + 1 < len(lines) and lines[i + 1].startswith("2 "):
            out.append(TLE(name=f"NORAD-{lines[i][2:7]}", line1=lines[i], line2=lines[i + 1]))
            i += 2
            continue
        if i + 2 >= len(lines):
            break
        name = lines[i]
        l1 = lines[i + 1]
        l2 = lines[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 "):
            out.append(TLE(name=name, line1=l1, line2=l2))
            i += 3
        else:
            i += 1
    return out


def validate_age(
    tles: Iterable[TLE],
    warn_days: float = 7.0,
    reject_days: float = 14.0,
    now: datetime | None = None,
) -> Iterator[TLE]:
    """Yield TLEs younger than reject_days; warn for those older than warn_days."""
    now = now or datetime.now(timezone.utc)
    warn = timedelta(days=warn_days)
    reject = timedelta(days=reject_days)
    for tle in tles:
        age = tle.age(now)
        if age > reject:
            log.warning("rejecting %s: TLE age %.1fd > %.1fd", tle.name, age.days, reject_days)
            continue
        if age > warn:
            log.warning("stale %s: TLE age %.1fd > %.1fd", tle.name, age.days, warn_days)
        yield tle
