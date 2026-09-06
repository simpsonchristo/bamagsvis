"""Offline smoke tests.

No network calls. Verifies TLE parsing/validation, contact_state link
classification, and the socket server protocol end-to-end on localhost.
"""

from __future__ import annotations

import json
import socket
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

from python import web_bridge
from python.celestrak import load_offline
from python.config import Config, GroundStation
from python.contact_state import Contact, Link, _link_from, to_dicts
from python.server import ServerState
from python.tle import TLE, parse_tle_text, validate_age

REPO_ROOT = Path(__file__).resolve().parents[2]


def _make_tle(epoch: datetime, name: str = "TEST SAT") -> TLE:
    yy = epoch.year % 100
    doy = (epoch - datetime(epoch.year, 1, 1, tzinfo=timezone.utc)).total_seconds() / 86400.0 + 1
    line1 = f"1 99999U 24001A   {yy:02d}{doy:012.8f}  .00000000  00000-0  00000-0 0  9999"
    line2 = "2 99999  51.6400 000.0000 0000000 000.0000 000.0000 15.50000000000000"
    return TLE(name=name, line1=line1, line2=line2)


class TLETests(unittest.TestCase):
    def test_parse_offline_snapshot(self):
        tles = load_offline(REPO_ROOT / "satnogs.txt")
        self.assertGreater(len(tles), 50, "expected satnogs.txt to contain many TLEs")
        for t in tles[:5]:
            self.assertTrue(t.line1.startswith("1 "))
            self.assertTrue(t.line2.startswith("2 "))
            self.assertGreater(t.norad_id, 0)

    def test_age_validator_filters_old(self):
        now = datetime(2026, 5, 14, tzinfo=timezone.utc)
        fresh = _make_tle(now - timedelta(days=2), "FRESH")
        stale = _make_tle(now - timedelta(days=10), "STALE")
        ancient = _make_tle(now - timedelta(days=30), "ANCIENT")
        out = list(validate_age([fresh, stale, ancient], warn_days=7, reject_days=14, now=now))
        names = [t.name for t in out]
        self.assertIn("FRESH", names)
        self.assertIn("STALE", names)  # warn but keep
        self.assertNotIn("ANCIENT", names)  # rejected

    def test_parse_two_line_only_records(self):
        text = (
            "1 25544U 98067A   24050.50000000  .00010000  00000-0  18000-3 0  9999\n"
            "2 25544  51.6400 000.0000 0001000 000.0000 000.0000 15.50000000000000\n"
        )
        tles = parse_tle_text(text)
        self.assertEqual(len(tles), 1)
        self.assertEqual(tles[0].norad_id, 25544)


class ContactStateTests(unittest.TestCase):
    def test_link_classification(self):
        self.assertEqual(_link_from(True, True), Link.BOTH)
        self.assertEqual(_link_from(True, False), Link.TX)
        self.assertEqual(_link_from(False, True), Link.RX)
        self.assertEqual(_link_from(False, False), Link.IDLE)

    def test_to_dicts_serializes_link_value(self):
        c = Contact(
            station="DSS-14", network="DSN", spacecraft="VOYAGER 1",
            norad_id=None, link=Link.BOTH, timestamp="2026-05-14T00:00:00+00:00",
        )
        d = to_dicts([c])[0]
        self.assertEqual(d["link"], "BOTH")
        self.assertEqual(d["station"], "DSS-14")


class SocketServerTests(unittest.TestCase):
    def test_tles_and_contacts_round_trip(self):
        state = ServerState()
        now = datetime(2026, 5, 14, tzinfo=timezone.utc)
        state.set_tles([_make_tle(now, "ALPHA"), _make_tle(now, "BRAVO")])
        state.set_contacts([{
            "station": "DSS-14", "network": "DSN", "spacecraft": "VOYAGER 1",
            "norad_id": None, "link": "BOTH", "timestamp": now.isoformat(),
        }])

        ready = threading.Event()
        port_holder = {}

        def _run():
            # Bind to an ephemeral port via 0; resolve it before accepting.
            import socket as _s
            import json as _json
            srv = _s.socket(_s.AF_INET, _s.SOCK_STREAM)
            srv.setsockopt(_s.SOL_SOCKET, _s.SO_REUSEADDR, 1)
            srv.bind(("127.0.0.1", 0))
            srv.listen(2)
            port_holder["port"] = srv.getsockname()[1]
            ready.set()
            for _ in range(2):
                conn, _addr = srv.accept()
                with conn, conn.makefile("rwb") as stream:
                    raw = stream.readline().decode().strip().upper()
                    if raw == "TLES":
                        body = "".join(
                            f"{t.name}\n{t.line1}\n{t.line2}\n" for t in state.snapshot_tles()
                        ) + ".\n"
                        stream.write(body.encode())
                    elif raw == "CONTACTS":
                        stream.write((_json.dumps(state.snapshot_contacts()) + "\n").encode())
                    stream.flush()
            srv.close()

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        ready.wait(timeout=2)
        port = port_holder["port"]

        with socket.create_connection(("127.0.0.1", port), timeout=2) as s:
            s.sendall(b"TLES\n")
            data = b""
            while not data.endswith(b"\n.\n") and len(data) < 100_000:
                chunk = s.recv(4096)
                if not chunk:
                    break
                data += chunk
        text = data.decode()
        self.assertIn("ALPHA", text)
        self.assertIn("BRAVO", text)
        self.assertTrue(text.rstrip().endswith("."))

        with socket.create_connection(("127.0.0.1", port), timeout=2) as s:
            s.sendall(b"CONTACTS\n")
            line = s.makefile("rb").readline()
        import json
        rows = json.loads(line)
        self.assertEqual(rows[0]["link"], "BOTH")
        self.assertEqual(rows[0]["spacecraft"], "VOYAGER 1")

        t.join(timeout=2)


class WebBridgeTests(unittest.TestCase):
    """The JSON/static bridge the browser display reads."""

    @classmethod
    def setUpClass(cls):
        now = datetime(2026, 5, 14, tzinfo=timezone.utc)
        cls.state = ServerState()
        cls.state.set_tles([
            TLE(
                name="ISS (ZARYA)",
                line1="1 25544U 98067A   26134.50000000  .00010000  00000-0  18000-3 0  9999",
                line2="2 25544  51.6400 000.0000 0001000 000.0000 000.0000 15.50000000000000",
            ),
            _make_tle(now, "UNWATCHED"),
        ])
        cls.state.set_contacts([{
            "station": "DSS-14/Goldstone", "network": "DSN", "spacecraft": "VOYAGER 1",
            "norad_id": None, "link": "BOTH", "timestamp": now.isoformat(),
        }])
        cls.cfg = Config(web_host="127.0.0.1", web_port=0)
        cls.httpd = web_bridge.make_server(cls.cfg, cls.state)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def _get(self, path: str):
        with urlopen(f"http://127.0.0.1:{self.port}{path}", timeout=3) as resp:
            return resp.status, resp.read(), resp.headers

    def _get_json(self, path: str):
        status, body, _ = self._get(path)
        self.assertEqual(status, 200)
        return json.loads(body)

    def test_health(self):
        data = self._get_json("/api/health")
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["tles"], 2)
        self.assertEqual(data["contacts"], 1)

    def test_stations_include_config_and_defaults(self):
        cfg = Config(stations=[GroundStation("UA Rooftop", 33.21, -87.55, network="LOCAL")])
        stations = web_bridge.stations_payload(cfg)
        self.assertEqual(stations[0]["id"], "ua-rooftop")
        self.assertEqual(stations[0]["network"], "LOCAL")
        networks = {s["network"] for s in stations}
        self.assertIn("DSN", networks)
        self.assertIn("NEN", networks)

    def test_stations_endpoint_shape(self):
        data = self._get_json("/api/stations")
        first = data["stations"][0]
        for key in ("id", "name", "network", "lat", "lon", "altM", "minElevationDeg"):
            self.assertIn(key, first)

    def test_tles_endpoint_filters_to_watchlist(self):
        data = self._get_json("/api/tles")
        names = [r["name"] for r in data["records"]]
        self.assertIn("ISS (ZARYA)", names)
        self.assertNotIn("UNWATCHED", names)
        self.assertEqual(data["catalogue"], 2)

    def test_tles_payload_adds_active_contact_satellites(self):
        state = ServerState()
        state.set_tles([_make_tle(datetime(2026, 5, 14, tzinfo=timezone.utc), "TEST SAT")])
        state.set_contacts([{
            "station": "UA", "network": "SatNOGS", "spacecraft": "NORAD-99999",
            "norad_id": 99999, "link": "RX", "timestamp": "2026-05-14T00:00:00+00:00",
        }])
        payload = web_bridge.tles_payload(Config(), state)
        self.assertEqual([r["name"] for r in payload["records"]], ["TEST SAT"])

    def test_contacts_endpoint(self):
        data = self._get_json("/api/contacts")
        self.assertEqual(data["contacts"][0]["link"], "BOTH")
        self.assertIn("generated", data)

    def test_unknown_api_route_is_404(self):
        with self.assertRaises(HTTPError) as ctx:
            self._get("/api/nope")
        self.assertEqual(ctx.exception.code, 404)

    def test_serves_the_visualizer_page(self):
        status, body, headers = self._get("/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["Content-Type"])
        self.assertIn(b"BAMA Ground Station Visualizer", body)

    def test_serves_static_modules(self):
        status, body, _ = self._get("/js/orbits.js")
        self.assertEqual(status, 200)
        self.assertIn(b"export function propagate", body)


if __name__ == "__main__":
    unittest.main()
