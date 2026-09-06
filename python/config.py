"""Configuration loader for the real-time layer."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class GroundStation:
    """A ground station the visualizer should treat as 'local'."""

    name: str
    lat_deg: float
    lon_deg: float
    alt_m: float = 0.0
    min_elevation_deg: float = 5.0
    network: str = "LOCAL"


@dataclass
class Config:
    """Runtime configuration for the data layer."""

    celestrak_group: str = "active"
    tle_refresh_seconds: int = 3600
    contact_refresh_seconds: int = 30
    tle_warn_age_days: float = 7.0
    tle_reject_age_days: float = 14.0
    socket_host: str = "127.0.0.1"
    socket_port: int = 5005
    web_host: str = "127.0.0.1"
    web_port: int = 8080
    web_root: str = ""  # empty: the repo's own web/ directory
    web_watchlist: list[int] = field(default_factory=list)  # NORAD ids; empty: bridge default
    web_max_satellites: int = 60
    offline_tle_path: str = "satnogs.txt"
    enable_celestrak: bool = True
    enable_satnogs: bool = True
    enable_dsn: bool = True
    enable_nen: bool = False
    enable_web: bool = True
    stations: list[GroundStation] = field(default_factory=list)

    @classmethod
    def load(cls, path: str | os.PathLike[str] | None = None) -> "Config":
        if path is None:
            return cls()
        data = json.loads(Path(path).read_text())
        stations = [GroundStation(**s) for s in data.pop("stations", [])]
        return cls(stations=stations, **data)

    def to_json(self) -> str:
        d = asdict(self)
        return json.dumps(d, indent=2)
