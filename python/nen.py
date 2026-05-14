"""NEN (Near Earth Network) client.

NASA SCaN's SCAN-NOW feed is the public source for NEN contact data.
Public, machine-readable endpoints for NEN come and go; this module
provides the structure and a single integration point so the rest of the
pipeline does not need to change when a stable feed becomes available.

Contributions / reverse-engineering of the feed format welcome — see TODO.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

SCAN_NOW_URL = "https://scan-now.gsfc.nasa.gov/scan"


@dataclass
class NENContact:
    station: str
    spacecraft: str
    uplink: bool = False
    downlink: bool = False


@dataclass
class NENSnapshot:
    contacts: list[NENContact] = field(default_factory=list)
    available: bool = False


def fetch_nen_now() -> NENSnapshot:
    """Placeholder: returns an empty snapshot until a stable feed is wired up."""
    log.debug("NEN feed integration not yet implemented")
    return NENSnapshot(contacts=[], available=False)
