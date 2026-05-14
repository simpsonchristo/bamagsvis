"""TCP socket server.

Each line a client sends is a request; the server replies with one JSON
document per line.

Requests:
  TLES        — current TLE bundle (3-line records, terminated by a single '.')
  CONTACTS    — JSON list of active contacts
  SHUTDOWN    — closes the connection

This protocol is FreeFlyer-friendly: FreeFlyer's Socket interface reads
line-delimited text, which matches both response formats.
"""

from __future__ import annotations

import json
import logging
import socket
import threading
from dataclasses import dataclass, field
from typing import Callable

from .tle import TLE

log = logging.getLogger(__name__)


@dataclass
class ServerState:
    tles: list[TLE] = field(default_factory=list)
    contacts: list[dict] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def set_tles(self, tles: list[TLE]) -> None:
        with self.lock:
            self.tles = list(tles)

    def set_contacts(self, contacts: list[dict]) -> None:
        with self.lock:
            self.contacts = list(contacts)

    def snapshot_tles(self) -> list[TLE]:
        with self.lock:
            return list(self.tles)

    def snapshot_contacts(self) -> list[dict]:
        with self.lock:
            return list(self.contacts)


def _serve_client(conn: socket.socket, state: ServerState) -> None:
    try:
        with conn, conn.makefile("rwb") as stream:
            for raw in stream:
                cmd = raw.decode("utf-8", errors="replace").strip().upper()
                if not cmd:
                    continue
                if cmd == "TLES":
                    body = "".join(
                        f"{t.name}\n{t.line1}\n{t.line2}\n" for t in state.snapshot_tles()
                    ) + ".\n"
                    stream.write(body.encode("utf-8"))
                elif cmd == "CONTACTS":
                    payload = json.dumps(state.snapshot_contacts())
                    stream.write((payload + "\n").encode("utf-8"))
                elif cmd == "SHUTDOWN":
                    return
                else:
                    stream.write(b'{"error":"unknown command"}\n')
                stream.flush()
    except (OSError, ConnectionError) as exc:
        log.debug("client disconnected: %s", exc)


def serve_forever(
    state: ServerState,
    host: str = "127.0.0.1",
    port: int = 5005,
    on_ready: Callable[[], None] | None = None,
) -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((host, port))
    sock.listen(8)
    log.info("listening on %s:%d", host, port)
    if on_ready:
        on_ready()
    try:
        while True:
            conn, addr = sock.accept()
            log.debug("client connected: %s", addr)
            threading.Thread(target=_serve_client, args=(conn, state), daemon=True).start()
    finally:
        sock.close()
