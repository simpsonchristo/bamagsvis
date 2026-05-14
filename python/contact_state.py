"""Contact state aggregator.

Pulls from SatNOGS, DSN, and NEN; emits a unified list of
(station, satellite, link) tuples where link is one of TX, RX, BOTH.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from enum import Enum

from . import dsn, nen, satnogs

log = logging.getLogger(__name__)


class Link(str, Enum):
    TX = "TX"
    RX = "RX"
    BOTH = "BOTH"
    IDLE = "IDLE"


@dataclass
class Contact:
    station: str
    network: str
    spacecraft: str
    norad_id: int | None
    link: Link
    timestamp: str  # ISO-8601 UTC


def _link_from(uplink: bool, downlink: bool) -> Link:
    if uplink and downlink:
        return Link.BOTH
    if uplink:
        return Link.TX
    if downlink:
        return Link.RX
    return Link.IDLE


def collect(
    enable_satnogs: bool = True,
    enable_dsn: bool = True,
    enable_nen: bool = False,
) -> list[Contact]:
    now_iso = datetime.now(timezone.utc).isoformat()
    contacts: list[Contact] = []

    if enable_dsn:
        for dish in dsn.fetch_dsn_now():
            station_label = f"{dish.station}/{dish.name}"
            for tgt in dish.targets:
                link = _link_from(tgt.uplink, tgt.downlink)
                if link is Link.IDLE:
                    continue
                contacts.append(
                    Contact(
                        station=station_label,
                        network="DSN",
                        spacecraft=tgt.spacecraft,
                        norad_id=None,
                        link=link,
                        timestamp=now_iso,
                    )
                )

    if enable_satnogs:
        stations = {s.id: s for s in satnogs.fetch_online_stations()}
        for obs in satnogs.fetch_active_observations():
            st = stations.get(obs.station_id)
            station_label = st.name if st else f"satnogs-{obs.station_id}"
            contacts.append(
                Contact(
                    station=station_label,
                    network="SatNOGS",
                    spacecraft=f"NORAD-{obs.norad_cat_id}",
                    norad_id=obs.norad_cat_id,
                    link=Link.RX,  # SatNOGS observations are receive-only
                    timestamp=now_iso,
                )
            )

    if enable_nen:
        snap = nen.fetch_nen_now()
        for c in snap.contacts:
            link = _link_from(c.uplink, c.downlink)
            if link is Link.IDLE:
                continue
            contacts.append(
                Contact(
                    station=c.station,
                    network="NEN",
                    spacecraft=c.spacecraft,
                    norad_id=None,
                    link=link,
                    timestamp=now_iso,
                )
            )

    log.info("aggregated %d active contacts", len(contacts))
    return contacts


def to_dicts(contacts: list[Contact]) -> list[dict]:
    return [asdict(c) | {"link": c.link.value} for c in contacts]
