// Orbit-math checks: node --test js/   (from web/)

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EARTH_RADIUS_KM, altitudeKm, deg2rad, elementsFromCircular, elementsFromTle,
  eciToScene, gmst, len, lookAngles, nextPassSeconds, parseTleBundle, periodSeconds,
  propagate, rad2deg, stationEci, stationSceneFixed, visibleFrom,
} from './orbits.js';

const ISS_L1 = '1 25544U 98067A   26134.50000000  .00010000  00000-0  18000-3 0  9999';
const ISS_L2 = '2 25544  51.6400  30.0000 0001000  45.0000 100.0000 15.50000000000000';

test('gmst matches the J2000 reference value', () => {
  // 2000-01-01 12:00 UTC: GMST = 280.46061837 deg (Vallado, Table 3-5).
  const g = rad2deg(gmst(new Date(Date.UTC(2000, 0, 1, 12, 0, 0))));
  assert.ok(Math.abs(g - 280.46061837) < 0.01, `gmst was ${g}`);
});

test('gmst advances one sidereal day per solar day plus the drift', () => {
  const t0 = new Date(Date.UTC(2026, 4, 14, 0, 0, 0));
  const t1 = new Date(t0.getTime() + 86400000);
  const delta = rad2deg(gmst(t1)) - rad2deg(gmst(t0));
  assert.ok(Math.abs(delta - 0.9856) < 0.01, `drift was ${delta} deg/day`);
});

test('a TLE decodes into the elements the card shows', () => {
  const el = elementsFromTle('ISS (ZARYA)', ISS_L1, ISS_L2);
  assert.equal(el.norad, 25544);
  assert.equal(el.name, 'ISS (ZARYA)');
  assert.ok(Math.abs(rad2deg(el.i) - 51.64) < 1e-6);
  assert.ok(Math.abs(rad2deg(el.raan) - 30) < 1e-6);
  assert.ok(Math.abs(el.e - 0.0001) < 1e-9);
  assert.equal(el.epoch.toISOString(), '2026-05-14T12:00:00.000Z');
  const alt = altitudeKm(el, el.epoch);
  assert.ok(alt > 350 && alt < 470, `ISS altitude came out ${alt} km`);
});

test('malformed lines are rejected rather than drawn', () => {
  assert.equal(elementsFromTle('X', 'not a tle', ISS_L2), null);
  assert.equal(elementsFromTle('X', ISS_L1, 'still not a tle'), null);
  assert.equal(elementsFromTle('X', null, null), null);
});

test('a bundle parses in both 2-line and 3-line form', () => {
  const bundle = `ISS (ZARYA)\n${ISS_L1}\n${ISS_L2}\n${ISS_L1}\n${ISS_L2}\n`;
  const els = parseTleBundle(bundle);
  assert.equal(els.length, 2);
  assert.equal(els[0].name, 'ISS (ZARYA)');
  assert.equal(els[1].name, 'NORAD-25544');
});

test('a circular orbit closes on itself after one period', () => {
  const epoch = new Date(Date.UTC(2026, 4, 14));
  const el = elementsFromCircular(
    { id: 'a', name: 'A', norad: 1, altKm: 700, inclDeg: 98, raanDeg: 40, phaseDeg: 10 },
    epoch,
  );
  const p0 = propagate(el, epoch);
  const p1 = propagate(el, new Date(epoch.getTime() + periodSeconds(el.a) * 1000));
  // Not an exact closure: over one revolution J2 drags the node and shifts the
  // mean anomaly, which is tens of km of along-track offset for a 700 km SSO.
  assert.ok(Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z) < 60);
  assert.ok(Math.abs(len(p0) - (EARTH_RADIUS_KM + 700)) < 1e-6);
});

test('an eccentric orbit hits perigee at M=0 and apogee at M=pi', () => {
  const epoch = new Date(Date.UTC(2026, 4, 14));
  const el = {
    id: 'molniya', name: 'M', norad: null, a: 26562, e: 0.7,
    i: deg2rad(63.4), raan: 0, argp: deg2rad(270), m0: 0, epoch, source: 'demo',
  };
  const perigee = len(propagate(el, epoch));
  const apogee = len(propagate(el, new Date(epoch.getTime() + (periodSeconds(el.a) / 2) * 1000)));
  assert.ok(Math.abs(perigee - el.a * (1 - el.e)) < 1);
  assert.ok(Math.abs(apogee - el.a * (1 + el.e)) < 1);
});

test('scene mapping puts longitude 0 on +X and longitude 90E on -Z', () => {
  const p0 = stationSceneFixed({ lat: 0, lon: 0 }, 1);
  assert.ok(Math.abs(p0.x - EARTH_RADIUS_KM) < 1e-6 && Math.abs(p0.z) < 1e-6);
  const p90 = stationSceneFixed({ lat: 0, lon: 90 }, 1);
  assert.ok(Math.abs(p90.x) < 1e-6 && Math.abs(p90.z + EARTH_RADIUS_KM) < 1e-6);
  const north = eciToScene({ x: 0, y: 0, z: 1 });
  assert.deepEqual(north, { x: 0, y: 1, z: -0 });
});

test('a station sits at its own right ascension', () => {
  const date = new Date(Date.UTC(2026, 4, 14, 3, 21, 0));
  const st = { lat: 33.21, lon: -87.55 };
  const p = stationEci(st, date);
  const ra = Math.atan2(p.y, p.x);
  const expected = gmst(date) + deg2rad(st.lon);
  const diff = Math.abs(((ra - expected + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  assert.ok(diff < 1e-9, `ra off by ${diff}`);
  assert.ok(Math.abs(rad2deg(Math.asin(p.z / len(p))) - st.lat) < 1e-9);
});

test('a geostationary satellite holds its longitude', () => {
  const epoch = new Date(Date.UTC(2026, 4, 14));
  const n = 1.00273896; // rev/sidereal-matched day
  const line2 = `2 41866   0.0300 000.0000 0001000 000.0000 000.0000 ${n.toFixed(8)}000000`;
  const el = elementsFromTle('GOES-16', ISS_L1.replace('25544', '41866'), line2);
  const subLon = (date) => {
    const p = propagate(el, date);
    return rad2deg(Math.atan2(p.y, p.x)) - rad2deg(gmst(date));
  };
  const wrap = (d) => ((d % 360) + 540) % 360 - 180;
  const drift = Math.abs(wrap(subLon(new Date(epoch.getTime() + 6 * 3600e3)) - subLon(epoch)));
  assert.ok(drift < 0.5, `GEO drifted ${drift} deg in 6 h`);
});

test('look angles put a zenith satellite at 90 degrees elevation', () => {
  const date = new Date(Date.UTC(2026, 4, 14, 12, 0, 0));
  const st = { lat: 33.21, lon: -87.55 };
  const stPos = stationEci(st, date);
  const overhead = { x: stPos.x * 1.06, y: stPos.y * 1.06, z: stPos.z * 1.06 };
  const { elevDeg, rangeKm } = lookAngles(stPos, overhead);
  assert.ok(Math.abs(elevDeg - 90) < 1e-6, `elevation ${elevDeg}`);
  assert.ok(Math.abs(rangeKm - len(stPos) * 0.06) < 1e-6);
});

test('look angles read due north as azimuth 0 and due east as 90', () => {
  const date = new Date(Date.UTC(2026, 4, 14, 12, 0, 0));
  const st = { lat: 0, lon: 0 };
  const stPos = stationEci(st, date);
  const northward = { x: stPos.x, y: stPos.y, z: stPos.z + 500 };
  const eastPole = { x: 0, y: 0, z: 1 };
  const east = {
    x: eastPole.y * stPos.z - eastPole.z * stPos.y,
    y: eastPole.z * stPos.x - eastPole.x * stPos.z,
    z: eastPole.x * stPos.y - eastPole.y * stPos.x,
  };
  const scale = 500 / Math.hypot(east.x, east.y, east.z);
  const eastward = { x: stPos.x + east.x * scale, y: stPos.y + east.y * scale, z: stPos.z + east.z * scale };
  assert.ok(lookAngles(stPos, northward).azDeg < 1e-6);
  assert.ok(Math.abs(lookAngles(stPos, eastward).azDeg - 90) < 1e-6);
});

test('a LEO satellite gets a pass over a station under it within a few hours', () => {
  const epoch = new Date(Date.UTC(2026, 4, 14));
  const el = elementsFromTle('ISS (ZARYA)', ISS_L1, ISS_L2);
  const st = { lat: 33.21, lon: -87.55, minElevationDeg: 5 };
  const dt = nextPassSeconds(st, el, epoch, 5);
  assert.ok(dt != null && dt < 6 * 3600, `next pass ${dt}`);
  const at = new Date(epoch.getTime() + dt * 1000);
  const elev = lookAngles(stationEci(st, at), propagate(el, at)).elevDeg;
  assert.ok(Math.abs(elev - 5) < 0.5, `elevation at rise was ${elev}`);
});

test('visibleFrom returns only satellites above the cutoff, highest first', () => {
  const epoch = new Date(Date.UTC(2026, 4, 14));
  const st = { lat: 0, lon: 0, minElevationDeg: 5 };
  const stPos = stationEci(st, epoch);
  const ra = rad2deg(Math.atan2(stPos.y, stPos.x));
  const overhead = elementsFromCircular(
    { id: 'over', name: 'OVER', norad: 1, altKm: 500, inclDeg: 0, raanDeg: ra, phaseDeg: 0 },
    epoch,
  );
  const away = elementsFromCircular(
    { id: 'away', name: 'AWAY', norad: 2, altKm: 500, inclDeg: 0, raanDeg: ra + 180, phaseDeg: 0 },
    epoch,
  );
  const seen = visibleFrom(st, [away, overhead], epoch, 5);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].el.id, 'over');
  assert.ok(seen[0].elevDeg > 85);
});
