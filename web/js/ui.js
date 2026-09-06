// DOM rendering for the overlay: the two rails, the clock, and the detail card.
//
// Everything is built with createElement rather than innerHTML — satellite
// names arrive from Celestrak/SatNOGS and are not ours to trust.
//
// The HUD refreshes twice a second, so nothing here throws DOM away that it
// can update in place: replacing a button mid-click swallows the click, and
// on a kiosk that reads as an unresponsive display.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function setClass(node, className) {
  if (node.className !== className) node.className = className;
}

function networkTagClass(network) {
  if (network === 'DSN') return 'tag tag-accent';
  if (network === 'NEN') return 'tag tag-accent-2';
  return 'tag tag-neutral';
}

export function linkTagClass(link) {
  if (link === 'BOTH') return 'tag tag-accent';
  if (link === 'TX') return 'tag tag-outline';
  return 'tag tag-neutral';
}

export function formatCountdown(seconds) {
  if (seconds == null) return 'no pass in the next 6 hours';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h) return `in ${h}h ${m.toString().padStart(2, '0')}m`;
  return `in ${m}m ${s.toString().padStart(2, '0')}s`;
}

/**
 * Reconcile a rail against its items, keyed by id: existing buttons are
 * updated, and the DOM is only rebuilt when the set of ids changes.
 */
function syncRail(container, items, fill) {
  let nodes = container._nodes;
  const sameKeys = nodes
    && nodes.size === items.length
    && items.every((item, i) => container.children[i]?.dataset.id === item.id);

  if (!sameKeys) {
    nodes = new Map();
    container.replaceChildren(...items.map((item) => {
      const btn = el('button', 'rail-item');
      btn.type = 'button';
      btn.dataset.id = item.id;
      const row = el('div', 'rail-item-row');
      const name = el('span', 'rail-item-name');
      const badge = el('span', 'tag');
      const sub = el('div', 'rail-item-sub');
      row.append(name, badge);
      btn.append(row, sub);
      nodes.set(item.id, { btn, name, badge, sub });
      return btn;
    }));
    container._nodes = nodes;
  }

  items.forEach((item) => {
    const node = nodes.get(item.id);
    if (node) fill(node, item);
  });
}

/** @param {{id,name,network,statusText,selected}[]} items */
export function renderStations(container, items) {
  syncRail(container, items, (node, item) => {
    setClass(node.btn, `rail-item${item.selected ? ' is-selected' : ''}`);
    setText(node.name, item.name);
    node.name.title = item.name;
    setClass(node.badge, networkTagClass(item.network));
    setText(node.badge, item.network);
    setText(node.sub, item.statusText);
  });
}

/** @param {{id,name,altLabel,subLabel,selected}[]} items */
export function renderSatellites(container, items) {
  syncRail(container, items, (node, item) => {
    setClass(node.btn, `rail-item${item.selected ? ' is-selected' : ''}`);
    setText(node.name, item.name);
    node.name.title = item.name;
    setClass(node.badge, 'rail-item-alt');
    setText(node.badge, item.altLabel);
    setText(node.sub, item.subLabel);
  });
}

// — detail card —

function buildStationCard() {
  const body = el('div', 'detail-body');
  const meta = el('div', 'card-meta');
  const badge = el('span', 'tag');
  const coords = el('span');
  meta.append(badge, coords);
  const contacts = el('div', 'detail-contacts');
  const note = el('div', 'detail-note');
  body.append(meta, contacts, note);
  return { body, refs: { badge, coords, contacts, note } };
}

function buildSatelliteCard() {
  const body = el('div', 'detail-body');
  const summary = el('p', 'card-body');
  const grid = el('div', 'detail-grid');

  const elevBox = el('div', 'detail-metric');
  const elevLabel = el('div', 'detail-metric-label');
  const elevValue = el('div', 'detail-metric-value');
  elevBox.append(elevLabel, elevValue);

  const linkBox = el('div', 'detail-metric');
  const linkValue = el('div', 'detail-metric-value');
  const linkBadge = el('span', 'tag');
  linkValue.append(linkBadge);
  linkBox.append(el('div', 'detail-metric-label', 'Link state'), linkValue);

  grid.append(elevBox, linkBox);
  const note = el('div', 'detail-note');
  body.append(summary, grid, note);
  return { body, refs: { summary, elevLabel, elevValue, linkBadge, note } };
}

function syncContactRows(container, contacts) {
  if (container.children.length !== contacts.length) {
    container.replaceChildren(...contacts.map(() => {
      const row = el('div', 'contact-row');
      row.append(el('span'), el('span', 'contact-elev'), el('span', 'tag'));
      return row;
    }));
  }
  contacts.forEach((c, i) => {
    const [name, elev, badge] = container.children[i].children;
    setText(name, c.name);
    setText(elev, c.elevLabel);
    setClass(badge, linkTagClass(c.link));
    setText(badge, c.linkLabel);
  });
}

/**
 * @param {HTMLElement} root the detail card
 * @param {Object|null} vm   view model, or null to hide the card
 */
export function renderDetail(root, vm) {
  if (!vm) {
    root.hidden = true;
    root._card = null;
    root.replaceChildren();
    return;
  }

  const key = `${vm.type}:${vm.title}`;
  if (!root._card || root._card.key !== key) {
    const head = el('div', 'detail-head');
    const titles = el('div');
    const kicker = el('div', 'card-kicker');
    const title = el('div', 'card-title');
    titles.append(kicker, title);
    const close = el('button', 'btn btn-icon btn-ghost', '✕');
    close.type = 'button';
    close.dataset.action = 'close';
    close.setAttribute('aria-label', 'Close');
    head.append(titles, close);

    const card = vm.type === 'station' ? buildStationCard() : buildSatelliteCard();
    root.replaceChildren(head, card.body);
    root._card = { key, kicker, title, refs: card.refs };
  }

  const { kicker, title, refs } = root._card;
  setText(kicker, vm.kicker);
  setText(title, vm.title);

  if (vm.type === 'station') {
    setClass(refs.badge, networkTagClass(vm.network));
    setText(refs.badge, vm.network);
    setText(refs.coords, vm.coords);
    syncContactRows(refs.contacts, vm.contacts);
    refs.note.hidden = vm.contacts.length > 0;
    setText(refs.note, vm.nextContactLabel);
  } else {
    setText(refs.summary, vm.summary);
    setText(refs.elevLabel, `Elevation / Az · ${vm.refStationName}`);
    setText(refs.elevValue, vm.elevAzLabel);
    setClass(refs.linkBadge, linkTagClass(vm.link));
    setText(refs.linkBadge, vm.linkLabel);
    setText(refs.note, vm.nextPassLabel);
  }

  root.hidden = false;
}

/** The nav-bar feed badge: LIVE against the bridge, DEMO on built-in data. */
export function renderFeedTag(node, { live, detail }) {
  setClass(node, live ? 'tag tag-accent' : 'tag tag-outline');
  setText(node, live ? 'LIVE' : 'DEMO');
  node.title = detail;
}
