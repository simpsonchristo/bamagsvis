// Application shell: clock, selection state, data refresh, frame loop.

import {
  EARTH_RADIUS_KM, altitudeKm, lookAngles, nextPassSeconds, propagate,
  rad2deg, stationEci, visibleFrom,
} from './orbits.js';
import { BridgeFeed, ContactIndex, DEMO_STATIONS, demoElements } from './data.js';
import { GlobeScene } from './scene.js';
import {
  formatCountdown, renderDetail, renderFeedTag, renderSatellites, renderStations,
} from './ui.js';

const HUD_INTERVAL_MS = 500;
const CONTACT_REFRESH_MS = 15000;
const TLE_REFRESH_MS = 5 * 60 * 1000;
const STATION_REFRESH_MS = 5 * 60 * 1000;
const MAX_TRACKED = 60; // keep the rails and the raycast list sane on a TV

const state = {
  selection: { type: null, id: null },
  speed: 1,
  simOffsetSeconds: 0,
  stations: DEMO_STATIONS,
  elements: demoElements(),
  contacts: new ContactIndex([]),
  live: { stations: false, tles: false, contacts: false },
  feedDetail: 'Built-in demo constellation — the bridge at /api is not answering.',
};

const dom = {
  canvas: document.getElementById('globe'),
  stationList: document.getElementById('station-list'),
  satelliteList: document.getElementById('satellite-list'),
  detail: document.getElementById('detail'),
  clock: document.getElementById('clock'),
  feedTag: document.getElementById('feed-tag'),
  speedGroup: document.getElementById('speed-group'),
  reset: document.getElementById('reset-view'),
};

const feed = new BridgeFeed('');
const scene = new GlobeScene(dom.canvas);

function simNow() {
  return new Date(Date.now() + state.simOffsetSeconds * 1000);
}

function stationById(id) {
  return state.stations.find((s) => s.id === id) || null;
}

function elementById(id) {
  return state.elements.find((e) => e.id === id) || null;
}

function refStation() {
  return state.stations.find((s) => s.network === 'LOCAL')
    || state.stations.find((s) => s.id === 'ua')
    || state.stations[0];
}

function minElev(station) {
  return station?.minElevationDeg ?? 5;
}

/**
 * Link state for a station/satellite pair: what the networks report if they
 * report anything, otherwise the geometric rule the design canvas used —
 * SatNOGS receives only, everything else transmits once the pass is high.
 */
function linkState(station, el, elevDeg) {
  // Below the horizon nothing is linked, whatever a feed says: a reported
  // contact we cannot see is a station/name mismatch, not a live pass.
  if (elevDeg < minElev(station)) return 'IDLE';
  const reported = state.contacts.linkFor(station, el);
  if (reported && reported !== 'IDLE') return reported;
  if (station.network === 'SatNOGS') return 'RX';
  return elevDeg > 40 ? 'BOTH' : 'RX';
}

// — selection —

function select(type, id) {
  const same = state.selection.type === type && state.selection.id === id;
  state.selection = same ? { type: null, id: null } : { type, id };
  renderHud();
}

function clearSelection() {
  state.selection = { type: null, id: null };
  renderHud();
}

// — HUD —

function renderHud() {
  const now = simNow();
  dom.clock.textContent = `${now.toISOString().substring(11, 19)} UTC`;
  renderFeedTag(dom.feedTag, {
    live: state.live.tles || state.live.contacts,
    detail: state.feedDetail,
  });

  renderStations(dom.stationList, state.stations.map((st) => {
    const visible = visibleFrom(st, state.elements, now, minElev(st));
    const reported = state.contacts.forStation(st).length;
    let statusText;
    if (visible.length) statusText = `${visible.length} overhead now`;
    else if (reported) statusText = `feed: ${reported} contact${reported > 1 ? 's' : ''}`;
    else statusText = 'none overhead';
    return {
      id: st.id,
      name: st.name,
      network: st.network,
      statusText,
      selected: state.selection.type === 'station' && state.selection.id === st.id,
    };
  }));

  renderSatellites(dom.satelliteList, state.elements.map((el) => ({
    id: el.id,
    name: el.name,
    altLabel: `${Math.round(altitudeKm(el, now)).toLocaleString()} km`,
    subLabel: el.norad != null ? `NORAD ${el.norad}` : 'no catalog id',
    selected: state.selection.type === 'satellite' && state.selection.id === el.id,
  })));

  renderDetail(dom.detail, detailViewModel(now));
}

function detailViewModel(now) {
  if (state.selection.type === 'station') return stationViewModel(now);
  if (state.selection.type === 'satellite') return satelliteViewModel(now);
  return null;
}

function stationViewModel(now) {
  const st = stationById(state.selection.id);
  if (!st) return null;
  const visible = visibleFrom(st, state.elements, now, minElev(st));
  const contacts = visible.map((c) => {
    const link = linkState(st, c.el, c.elevDeg);
    return {
      name: c.el.name,
      elevLabel: `${c.elevDeg.toFixed(1)}°`,
      link,
      linkLabel: link,
    };
  });

  let nextContactLabel = 'No passes in the next 6 hours';
  if (!contacts.length) {
    let soonest = null;
    for (const el of state.elements) {
      const dt = nextPassSeconds(st, el, now, minElev(st));
      if (dt != null && (soonest == null || dt < soonest.dt)) soonest = { dt, el };
    }
    if (soonest) nextContactLabel = `Next contact: ${soonest.el.name} ${formatCountdown(soonest.dt)}`;
  }

  return {
    type: 'station',
    kicker: 'GROUND STATION',
    title: st.name,
    network: st.network,
    coords: `${st.lat.toFixed(2)}°, ${st.lon.toFixed(2)}°`,
    contacts,
    nextContactLabel,
  };
}

function satelliteViewModel(now) {
  const el = elementById(state.selection.id);
  if (!el) return null;
  const ref = refStation();
  const { elevDeg, azDeg, rangeKm } = lookAngles(stationEci(ref, now), propagate(el, now));
  const up = elevDeg >= minElev(ref);
  const link = linkState(ref, el, elevDeg);
  const inclLabel = `${rad2deg(el.i).toFixed(1)}°`;
  const altLabel = `${Math.round(altitudeKm(el, now)).toLocaleString()} km`;
  const noradLabel = el.norad != null ? `NORAD ${el.norad}` : 'uncatalogued';

  let nextPassLabel;
  if (up) {
    nextPassLabel = `Currently overhead ${ref.name} · ${Math.round(rangeKm).toLocaleString()} km slant range`;
  } else {
    nextPassLabel = `Next pass over ${ref.name} ${formatCountdown(nextPassSeconds(ref, el, now, minElev(ref)))}`;
  }

  return {
    type: 'satellite',
    kicker: el.source === 'tle' ? 'SPACECRAFT · LIVE TLE' : 'SPACECRAFT · DEMO',
    title: el.name,
    summary: `${noradLabel} · ${altLabel} altitude · ${inclLabel} inclination`,
    refStationName: ref.name,
    elevAzLabel: up
      ? `${elevDeg.toFixed(1)}° / ${azDeg.toFixed(0)}°`
      : `${elevDeg.toFixed(1)}° (below horizon) / ${azDeg.toFixed(0)}°`,
    link,
    linkLabel: link,
    nextPassLabel,
  };
}

/** The station/satellite pair the TX/RX beams should be drawn between. */
function activeBeam(now) {
  if (state.selection.type !== 'station') return null;
  const st = stationById(state.selection.id);
  if (!st) return null;
  const visible = visibleFrom(st, state.elements, now, minElev(st));
  if (!visible.length) return null;
  const top = visible[0];
  const link = linkState(st, top.el, top.elevDeg);
  if (link === 'IDLE') return null;
  return { station: st, satellite: top.el, link };
}

// — data refresh —

function describeFeed() {
  const parts = [];
  parts.push(state.live.tles ? 'TLEs: bridge' : 'TLEs: demo constellation');
  parts.push(state.live.contacts ? `contacts: bridge (${state.contacts.size})` : 'contacts: geometric');
  parts.push(state.live.stations ? 'stations: bridge' : 'stations: built-in');
  if (feed.lastError) parts.push(`last error: ${feed.lastError}`);
  state.feedDetail = parts.join(' · ');
}

async function refreshStations() {
  const stations = await feed.stations();
  if (stations && stations.length) {
    state.live.stations = true;
    state.stations = stations;
    scene.setStations(stations);
    if (state.selection.type === 'station' && !stationById(state.selection.id)) clearSelection();
  } else {
    state.live.stations = false;
  }
  describeFeed();
}

async function refreshElements() {
  const elements = await feed.elements();
  if (elements && elements.length) {
    state.live.tles = true;
    const kept = elements.slice(0, MAX_TRACKED);
    const changed = kept.length !== state.elements.length
      || kept.some((el, i) => el.id !== state.elements[i].id);
    state.elements = kept;
    if (changed) {
      scene.setSatellites(kept, simNow());
      if (state.selection.type === 'satellite' && !elementById(state.selection.id)) clearSelection();
    } else {
      // same catalogue, fresher elements: refresh rings in place
      kept.forEach((el) => scene.refreshOrbitRing(el.id, el, simNow()));
    }
  } else {
    state.live.tles = false;
  }
  describeFeed();
}

async function refreshContacts() {
  const contacts = await feed.contacts();
  if (contacts) {
    state.live.contacts = true;
    state.contacts = new ContactIndex(contacts);
  } else {
    state.live.contacts = false;
    state.contacts = new ContactIndex([]);
  }
  describeFeed();
}

// — event wiring —

dom.stationList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-id]');
  if (btn) select('station', btn.dataset.id);
});

dom.satelliteList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-id]');
  if (btn) select('satellite', btn.dataset.id);
});

dom.detail.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="close"]')) clearSelection();
});

dom.canvas.addEventListener('click', (e) => {
  const hit = scene.pick(e.clientX, e.clientY);
  if (hit) select(hit.type, hit.id);
  else clearSelection();
});

dom.speedGroup.addEventListener('change', (e) => {
  const value = Number(e.target.value);
  if (Number.isFinite(value)) state.speed = value;
});

dom.reset.addEventListener('click', () => scene.resetView());

window.addEventListener('resize', () => scene.resize());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') clearSelection();
});

// — boot —

scene.setStations(state.stations);
scene.setSatellites(state.elements, simNow());
renderHud();

let lastFrame = performance.now();
function frame(nowMs) {
  const dtReal = Math.min((nowMs - lastFrame) / 1000, 0.25);
  lastFrame = nowMs;
  // speed 1 tracks the wall clock exactly; anything faster runs the sim ahead
  state.simOffsetSeconds += dtReal * (state.speed - 1);
  const now = simNow();
  scene.update(now, state.selection, activeBeam(now), nowMs);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setInterval(renderHud, HUD_INTERVAL_MS);
setInterval(refreshContacts, CONTACT_REFRESH_MS);
setInterval(refreshElements, TLE_REFRESH_MS);
setInterval(refreshStations, STATION_REFRESH_MS);

refreshStations().then(refreshElements).then(refreshContacts).then(renderHud);

// Handy for kiosk debugging from the browser console.
window.bamagsvis = { state, scene, feed, refreshElements, refreshContacts, EARTH_RADIUS_KM };
