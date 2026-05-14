"""bamagsvis real-time data layer.

Fetches TLEs and ground station contact state from Celestrak, SatNOGS, DSN,
and NEN, aggregates them into a unified contact state, and serves the result
over a TCP socket for FreeFlyer or Blender to consume.
"""

__version__ = "0.2.0"
