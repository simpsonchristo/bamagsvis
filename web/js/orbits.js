// Orbital mechanics for the browser visualizer.
//
// Frames
//   ECI    right-handed, +X toward the vernal equinox, +Z along the north pole.
//   scene  three.js world space, +Y up. eciToScene() maps between them so a
//          station at longitude L lands on the equirectangular Earth texture
//          where the map says it should.
//
// Propagation is Keplerian from mean elements with J2 secular drift on RAAN,
// argument of perigee and mean anomaly. That is not SGP4: expect a few km of
// along-track error after a day for LEO. It is accurate enough to place a dot
// on a globe and to call a pass, and it keeps the page dependency-free. See
// web/README.md for the upgrade path.

export const EARTH_RADIUS_KM = 6378.137;
export const MU = 398600.4418; // km^3/s^2
export const J2 = 1.08262668e-3;
export const SIDEREAL_DAY = 86164.0905; // s
export const DEG = Math.PI / 180;

export function deg2rad(d) { return d * DEG; }
export function rad2deg(r) { return r / DEG; }

// — small vector helpers (plain objects; three.js types stay in scene.js) —
export function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
export function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
export function len(a) { return Math.sqrt(dot(a, a)); }
export function norm(a) { const l = len(a) || 1e-9; return { x: a.x / l, y: a.y / l, z: a.z / l }; }

/** ECI (Z = north) to three.js world space (Y = north). */
export function eciToScene(v, scale = 1) {
  return { x: v.x * scale, y: v.z * scale, z: -v.y * scale };
}

// — time —

/** Julian date from a JS Date. */
export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Greenwich mean sidereal time in radians (IAU 1982 series).
 * Drives both the Earth mesh's spin and every station's right ascension, so
 * the two can never disagree.
 */
export function gmst(date) {
  const T = (julianDate(date) - 2451545.0) / 36525.0;
  let sec = 67310.54841
    + (876600 * 3600 + 8640184.812866) * T
    + 0.093104 * T * T
    - 6.2e-6 * T * T * T;
  let rad = ((sec % 86400) / 240) * DEG; // 240 s of time = 1 degree
  rad %= Math.PI * 2;
  return rad < 0 ? rad + Math.PI * 2 : rad;
}

// — elements —

/**
 * @typedef {Object} Elements
 * @property {string} id
 * @property {string} name
 * @property {number|null} norad
 * @property {number} a          semi-major axis, km
 * @property {number} e          eccentricity
 * @property {number} i          inclination, rad
 * @property {number} raan       right ascension of the ascending node at epoch, rad
 * @property {number} argp       argument of perigee at epoch, rad
 * @property {number} m0         mean anomaly at epoch, rad
 * @property {Date}   epoch
 * @property {string} source     'demo' | 'tle'
 */

/** Mean motion (rad/s) for a semi-major axis in km. */
export function meanMotion(a) { return Math.sqrt(MU / (a * a * a)); }

/** Orbital period in seconds. */
export function periodSeconds(a) { return (Math.PI * 2) / meanMotion(a); }

/** Build elements from a near-circular altitude/inclination description. */
export function elementsFromCircular({ id, name, norad, altKm, inclDeg, raanDeg, phaseDeg }, epoch) {
  return {
    id,
    name,
    norad: norad ?? null,
    a: EARTH_RADIUS_KM + altKm,
    e: 0,
    i: deg2rad(inclDeg),
    raan: deg2rad(raanDeg),
    argp: 0,
    m0: deg2rad(phaseDeg),
    epoch,
    source: 'demo',
  };
}

const TLE_EPOCH_RE = /^\d/;

/** Decode the TLE epoch field (line 1, columns 19-32, YYDDD.DDDDDDDD). */
export function tleEpoch(line1) {
  const yy = parseInt(line1.substring(18, 20), 10);
  const doy = parseFloat(line1.substring(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const base = Date.UTC(year, 0, 1);
  return new Date(base + (doy - 1) * 86400000);
}

/**
 * Parse one 3-line TLE record into mean elements.
 * Returns null when the lines do not look like a TLE.
 */
export function elementsFromTle(name, line1, line2) {
  if (!line1 || !line2 || line1[0] !== '1' || line2[0] !== '2') return null;
  if (!TLE_EPOCH_RE.test(line1.substring(18, 19))) return null;
  const norad = parseInt(line2.substring(2, 7), 10);
  const i = deg2rad(parseFloat(line2.substring(8, 16)));
  const raan = deg2rad(parseFloat(line2.substring(17, 25)));
  const e = parseFloat(`0.${line2.substring(26, 33).trim()}`);
  const argp = deg2rad(parseFloat(line2.substring(34, 42)));
  const m0 = deg2rad(parseFloat(line2.substring(43, 51)));
  const revsPerDay = parseFloat(line2.substring(52, 63));
  if (![i, raan, e, argp, m0, revsPerDay].every(Number.isFinite) || revsPerDay <= 0) return null;
  const n = (revsPerDay * Math.PI * 2) / 86400; // rad/s
  const a = Math.cbrt(MU / (n * n));
  return {
    id: `norad-${norad}`,
    name: (name || `NORAD-${norad}`).trim(),
    norad,
    a,
    e,
    i,
    raan,
    argp,
    m0,
    epoch: tleEpoch(line1),
    source: 'tle',
  };
}

/** Parse a 3-line-per-record TLE bundle. Tolerates 2-line records. */
export function parseTleBundle(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim().length);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('1 ') && lines[i + 1]?.startsWith('2 ')) {
      const el = elementsFromTle(null, lines[i], lines[i + 1]);
      if (el) out.push(el);
      i += 2;
    } else if (lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 ')) {
      const el = elementsFromTle(lines[i], lines[i + 1], lines[i + 2]);
      if (el) out.push(el);
      i += 3;
    } else {
      i += 1;
    }
  }
  return out;
}

// — propagation —

/** Solve Kepler's equation M = E - e sin E for the eccentric anomaly. */
function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 12; k++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/** J2 secular rates (rad/s) for RAAN, argument of perigee and mean anomaly. */
function secularRates(el) {
  const n = meanMotion(el.a);
  const p = el.a * (1 - el.e * el.e);
  const k = 1.5 * J2 * n * (EARTH_RADIUS_KM / p) ** 2;
  const cosI = Math.cos(el.i);
  return {
    raanDot: -k * cosI,
    argpDot: k * (2 - 2.5 * Math.sin(el.i) ** 2),
    mDot: n + k * Math.sqrt(1 - el.e * el.e) * (1 - 1.5 * Math.sin(el.i) ** 2),
  };
}

/** Position in ECI (km) at an absolute time. */
export function propagate(el, date) {
  const dt = (date.getTime() - el.epoch.getTime()) / 1000;
  const { raanDot, argpDot, mDot } = secularRates(el);
  const raan = el.raan + raanDot * dt;
  const argp = el.argp + argpDot * dt;
  const M = el.m0 + mDot * dt;
  const E = solveKepler(((M % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), el.e);
  const nu = Math.atan2(Math.sqrt(1 - el.e * el.e) * Math.sin(E), Math.cos(E) - el.e);
  const r = el.a * (1 - el.e * Math.cos(E));
  const u = argp + nu;
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const cosO = Math.cos(raan);
  const sinO = Math.sin(raan);
  const cosI = Math.cos(el.i);
  const sinI = Math.sin(el.i);
  return {
    x: r * (cosO * cosU - sinO * sinU * cosI),
    y: r * (sinO * cosU + cosO * sinU * cosI),
    z: r * (sinU * sinI),
  };
}

/** One full revolution sampled in ECI, for drawing the orbit ring. */
export function sampleOrbit(el, date, segments = 160) {
  const period = periodSeconds(el.a);
  const pts = [];
  for (let k = 0; k <= segments; k++) {
    pts.push(propagate(el, new Date(date.getTime() + (k / segments) * period * 1000)));
  }
  return pts;
}

/** Altitude above the reference sphere, km, at the given time. */
export function altitudeKm(el, date) {
  return len(propagate(el, date)) - EARTH_RADIUS_KM;
}

// — stations —

/** Station position in ECI (km) at the given time (spherical Earth). */
export function stationEci(station, date) {
  const lat = deg2rad(station.lat);
  const ra = gmst(date) + deg2rad(station.lon);
  const r = EARTH_RADIUS_KM + (station.altM || 0) / 1000;
  return {
    x: r * Math.cos(lat) * Math.cos(ra),
    y: r * Math.cos(lat) * Math.sin(ra),
    z: r * Math.sin(lat),
  };
}

/** Station position in Earth-fixed scene coordinates (parented to the globe). */
export function stationSceneFixed(station, scale) {
  const lat = deg2rad(station.lat);
  const lon = deg2rad(station.lon);
  const r = EARTH_RADIUS_KM + (station.altM || 0) / 1000;
  return eciToScene({
    x: r * Math.cos(lat) * Math.cos(lon),
    y: r * Math.cos(lat) * Math.sin(lon),
    z: r * Math.sin(lat),
  }, scale);
}

/** Topocentric look angles from a station to a satellite, both in ECI km. */
export function lookAngles(stationPos, satPos) {
  const up = norm(stationPos);
  const d = sub(satPos, stationPos);
  const range = len(d);
  const dn = norm(d);
  const elevDeg = rad2deg(Math.asin(Math.max(-1, Math.min(1, dot(dn, up)))));
  let east = cross({ x: 0, y: 0, z: 1 }, up); // north pole × up
  if (len(east) < 1e-6) east = { x: 1, y: 0, z: 0 }; // station at a pole
  east = norm(east);
  const north = norm(cross(up, east));
  const vertical = dot(d, up);
  const horiz = sub(d, { x: up.x * vertical, y: up.y * vertical, z: up.z * vertical });
  let azRad = Math.atan2(dot(horiz, east), dot(horiz, north));
  if (azRad < 0) azRad += Math.PI * 2;
  return { elevDeg, azDeg: rad2deg(azRad), rangeKm: range };
}

/**
 * Time in seconds until the satellite next rises above minElevDeg, searched
 * coarsely then bisected. Returns null if it never rises within horizonSeconds.
 */
export function nextPassSeconds(station, el, from, minElevDeg, horizonSeconds = 6 * 3600) {
  const step = Math.min(60, Math.max(10, periodSeconds(el.a) / 400));
  let prev = null;
  for (let dt = 0; dt <= horizonSeconds; dt += step) {
    const t = new Date(from.getTime() + dt * 1000);
    const elev = lookAngles(stationEci(station, t), propagate(el, t)).elevDeg;
    if (prev !== null && prev.elev < minElevDeg && elev >= minElevDeg) {
      // bisect the crossing for a tidier countdown
      let lo = prev.dt;
      let hi = dt;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        const tm = new Date(from.getTime() + mid * 1000);
        const em = lookAngles(stationEci(station, tm), propagate(el, tm)).elevDeg;
        if (em >= minElevDeg) hi = mid; else lo = mid;
      }
      return hi;
    }
    prev = { dt, elev };
  }
  return null;
}

/** Satellites currently above minElevDeg from a station, highest first. */
export function visibleFrom(station, elements, date, minElevDeg) {
  const stPos = stationEci(station, date);
  return elements
    .map((el) => ({ el, ...lookAngles(stPos, propagate(el, date)) }))
    .filter((c) => c.elevDeg >= minElevDeg)
    .sort((a, b) => b.elevDeg - a.elevDeg);
}
