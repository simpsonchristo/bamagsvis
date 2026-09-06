"""Entry point.

Spawns:
  - a TLE refresher (Celestrak, with offline fallback)
  - a contact state refresher (DSN, SatNOGS, NEN)
  - an HTTP bridge serving web/ and the JSON feeds the browser display reads
  - a TCP server feeding both to FreeFlyer/Blender consumers

Usage:
  python -m python.main [--config path/to/config.json] [--no-web]
"""

from __future__ import annotations

import argparse
import logging
import threading
import time

from . import celestrak, contact_state, web_bridge
from .config import Config
from .server import ServerState, serve_forever
from .tle import validate_age


def _tle_loop(cfg: Config, state: ServerState, stop: threading.Event) -> None:
    while not stop.is_set():
        if cfg.enable_celestrak:
            tles = celestrak.fetch_with_fallback(cfg.celestrak_group, cfg.offline_tle_path)
        else:
            tles = celestrak.load_offline(cfg.offline_tle_path)
        validated = list(
            validate_age(
                tles,
                warn_days=cfg.tle_warn_age_days,
                reject_days=cfg.tle_reject_age_days,
            )
        )
        state.set_tles(validated)
        stop.wait(cfg.tle_refresh_seconds)


def _contact_loop(cfg: Config, state: ServerState, stop: threading.Event) -> None:
    while not stop.is_set():
        contacts = contact_state.collect(
            enable_satnogs=cfg.enable_satnogs,
            enable_dsn=cfg.enable_dsn,
            enable_nen=cfg.enable_nen,
        )
        state.set_contacts(contact_state.to_dicts(contacts))
        stop.wait(cfg.contact_refresh_seconds)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="bamagsvis real-time data layer")
    parser.add_argument("--config", help="path to config.json")
    parser.add_argument("--log-level", default="INFO")
    parser.add_argument(
        "--no-web",
        action="store_true",
        help="skip the HTTP bridge and browser display; TCP feed only",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    cfg = Config.load(args.config) if args.config else Config()
    state = ServerState()
    stop = threading.Event()

    tle_thread = threading.Thread(target=_tle_loop, args=(cfg, state, stop), daemon=True)
    contact_thread = threading.Thread(target=_contact_loop, args=(cfg, state, stop), daemon=True)
    tle_thread.start()
    contact_thread.start()

    httpd = None
    if cfg.enable_web and not args.no_web:
        httpd, _ = web_bridge.start_in_thread(cfg, state)

    try:
        serve_forever(state, host=cfg.socket_host, port=cfg.socket_port)
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        if httpd is not None:
            httpd.shutdown()
        time.sleep(0.1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
