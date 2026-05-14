"""Skyfield-based propagator.

Loads TLEs into EarthSatellite objects and computes each satellite's current
subpoint plus elevation/azimuth from a fixed ground observer.
"""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass

from skyfield.api import EarthSatellite, Topos, load, wgs84

from python.tle import TLE

log = logging.getLogger(__name__)

# builtin=True avoids a network fetch for the IERS timescale file.
_ts = load.timescale(builtin=True)


@dataclass
class SatPosition:
    name: str
    norad_id: int
    lat: float
    lon: float
    alt_km: float
    elevation_deg: float  # from observer; < 0 means below horizon
    azimuth_deg: float
    distance_km: float

    @property
    def overhead(self) -> bool:
        return self.elevation_deg >= 0

    @property
    def visible(self) -> bool:
        return self.elevation_deg >= 5.0


def build_satellites(tles: list[TLE]) -> list[EarthSatellite]:
    sats = []
    for tle in tles:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                sats.append(EarthSatellite(tle.line1, tle.line2, tle.name, _ts))
        except Exception as exc:
            log.debug("skipping %s: %s", tle.name, exc)
    return sats


def propagate(sats: list[EarthSatellite], observer_lat: float, observer_lon: float, observer_alt_m: float = 0.0) -> list[SatPosition]:
    t = _ts.now()
    observer = wgs84.latlon(observer_lat, observer_lon, observer_alt_m / 1000.0)
    positions: list[SatPosition] = []
    for sat in sats:
        try:
            geocentric = sat.at(t)
            sub = wgs84.subpoint_of(geocentric)
            diff = sat - observer
            topo = diff.at(t)
            alt, az, dist = topo.altaz()
            positions.append(SatPosition(
                name=sat.name,
                norad_id=int(sat.model.satnum),
                lat=sub.latitude.degrees,
                lon=sub.longitude.degrees,
                alt_km=sub.elevation.km,
                elevation_deg=alt.degrees,
                azimuth_deg=az.degrees,
                distance_km=dist.km,
            ))
        except Exception as exc:
            log.debug("propagation error for %s: %s", sat.name, exc)
    return positions
