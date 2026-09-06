// Data sources: the Python bridge when it is reachable, the built-in demo
// constellation when it is not.
//
// The bridge (python/web_bridge.py) serves this page plus:
//   GET /api/stations  -> [{id, name, network, lat, lon, altM, minElevationDeg}]
//   GET /api/tles      -> {generated, count, records: [{name, line1, line2}]}
//   GET /api/contacts  -> {generated, contacts: [Contact...]}
// Opening web/index.html straight off disk skips all three and runs demo data.

import { elementsFromCircular, elementsFromTle } from './orbits.js';

export const DEMO_STATIONS = [
  { id: 'ua', name: 'UA Station (Tuscaloosa)', network: 'SatNOGS', lat: 33.21, lon: -87.55, minElevationDeg: 5 },
  { id: 'goldstone', name: 'Goldstone', network: 'DSN', lat: 35.43, lon: -116.89, minElevationDeg: 5 },
  { id: 'madrid', name: 'Madrid', network: 'DSN', lat: 40.43, lon: -4.25, minElevationDeg: 5 },
  { id: 'canberra', name: 'Canberra', network: 'DSN', lat: -35.40, lon: 148.98, minElevationDeg: 5 },
  { id: 'wallops', name: 'Wallops', network: 'NEN', lat: 37.94, lon: -75.47, minElevationDeg: 5 },
  { id: 'mcmurdo', name: 'McMurdo', network: 'NEN', lat: -77.85, lon: 166.67, minElevationDeg: 5 },
];

const DEMO_SATELLITES = [
  { id: 'iss', name: 'ISS (ZARYA)', norad: 25544, altKm: 408, inclDeg: 51.6, raanDeg: 120, phaseDeg: 0 },
  { id: 'noaa19', name: 'NOAA-19', norad: 33591, altKm: 870, inclDeg: 99.0, raanDeg: 10, phaseDeg: 60 },
  { id: 'terra', name: 'TERRA', norad: 25994, altKm: 705, inclDeg: 98.2, raanDeg: 200, phaseDeg: 140 },
  { id: 'landsat9', name: 'LANDSAT-9', norad: 49260, altKm: 705, inclDeg: 98.2, raanDeg: 260, phaseDeg: 220 },
  { id: 'goes16', name: 'GOES-16', norad: 41866, altKm: 35786, inclDeg: 0.3, raanDeg: 0, phaseDeg: 300 },
  { id: 'sentinel2a', name: 'SENTINEL-2A', norad: 40697, altKm: 786, inclDeg: 98.6, raanDeg: 340, phaseDeg: 20 },
  { id: 'starlink3021', name: 'STARLINK-3021', norad: 53252, altKm: 550, inclDeg: 53.0, raanDeg: 80, phaseDeg: 90 },
];

/** Demo elements, epoched at load so the constellation starts spread out. */
export function demoElements(epoch = new Date()) {
  return DEMO_SATELLITES.map((s) => elementsFromCircular(s, epoch));
}

async function getJson(url, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live feed against the Python bridge. Every method degrades to null rather
 * than throwing, so the caller can hold its last good state on a hiccup.
 */
export class BridgeFeed {
  constructor(base = '') {
    this.base = base.replace(/\/$/, '');
    this.online = false;
    this.lastError = null;
  }

  async stations() {
    try {
      const data = await getJson(`${this.base}/api/stations`);
      this.online = true;
      this.lastError = null;
      return data.stations.map((s) => ({
        id: s.id,
        name: s.name,
        network: s.network,
        lat: s.lat,
        lon: s.lon,
        altM: s.altM ?? 0,
        minElevationDeg: s.minElevationDeg ?? 5,
      }));
    } catch (err) {
      this.online = false;
      this.lastError = err.message;
      return null;
    }
  }

  async elements() {
    try {
      const data = await getJson(`${this.base}/api/tles`, 8000);
      const out = [];
      for (const rec of data.records) {
        const el = elementsFromTle(rec.name, rec.line1, rec.line2);
        if (el) out.push(el);
      }
      this.online = true;
      this.lastError = null;
      return out.length ? out : null;
    } catch (err) {
      this.online = false;
      this.lastError = err.message;
      return null;
    }
  }

  async contacts() {
    try {
      const data = await getJson(`${this.base}/api/contacts`);
      this.online = true;
      this.lastError = null;
      return data.contacts;
    } catch (err) {
      this.online = false;
      this.lastError = err.message;
      return null;
    }
  }
}

function normalizeStationName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Index of the reported (as opposed to geometric) link state.
 *
 * DSN reports "DSS-14/Goldstone" style labels and no NORAD id; SatNOGS
 * reports a NORAD id and a station name. Matching is therefore best-effort:
 * a NORAD id wins, then a station-name substring, and anything unmatched
 * falls through to the geometry in app.js.
 */
export class ContactIndex {
  constructor(contacts = []) {
    this.contacts = contacts;
    this.byNorad = new Map();
    this.byStation = new Map();
    for (const c of contacts) {
      if (c.norad_id != null) {
        const list = this.byNorad.get(c.norad_id) || [];
        list.push(c);
        this.byNorad.set(c.norad_id, list);
      }
      const key = normalizeStationName(c.station);
      const list = this.byStation.get(key) || [];
      list.push(c);
      this.byStation.set(key, list);
    }
  }

  get size() { return this.contacts.length; }

  /** Reported link for a station/satellite pair, or null if not reported. */
  linkFor(station, satellite) {
    if (satellite.norad != null) {
      for (const c of this.byNorad.get(satellite.norad) || []) {
        if (this._stationMatches(station, c.station)) return c.link;
      }
    }
    const satName = normalizeStationName(satellite.name);
    for (const [key, list] of this.byStation) {
      if (!this._keyMatches(station, key)) continue;
      for (const c of list) {
        const craft = normalizeStationName(c.spacecraft);
        if (craft && satName && (craft.includes(satName) || satName.includes(craft))) return c.link;
      }
    }
    return null;
  }

  /** Everything the networks report for this station, whatever it is tracking. */
  forStation(station) {
    const out = [];
    for (const [key, list] of this.byStation) {
      if (this._keyMatches(station, key)) out.push(...list);
    }
    return out;
  }

  _stationMatches(station, reportedName) {
    return this._keyMatches(station, normalizeStationName(reportedName));
  }

  _keyMatches(station, key) {
    const name = normalizeStationName(station.name);
    const id = normalizeStationName(station.id);
    return Boolean(key) && (key.includes(name) || name.includes(key) || key.includes(id));
  }
}
