// three.js scene: globe, starfield, station pins, satellites, TX/RX beams.
//
// The look — colors, glow sprites, trail fade, beam pulse — comes from the
// Claude Design canvas in design/satellite-orbital-tracking-visualization.dc.html.
// Positions come from orbits.js, so everything drawn here is in ECI mapped
// through eciToScene().

import {
  EARTH_RADIUS_KM, eciToScene, gmst, propagate, sampleOrbit,
  stationEci, stationSceneFixed,
} from './orbits.js';

const EARTH_RADIUS_SCENE = 1.7;
export const SCALE = EARTH_RADIUS_SCENE / EARTH_RADIUS_KM;

const COLOR_BG = 0x0b0c14;
const COLOR_ACCENT = 0x9184d9;
const COLOR_SAT = 0xd6d8ea;
const COLOR_PIN = 0x9aa2c8;
const COLOR_RING = 0x555b78;
const COLOR_TX = 0xd9a15c;
const COLOR_RX = 0x7cbf8e;
const TRAIL_LEN = 60;

const EARTH_TEXTURES = [
  'assets/earth_atmos_2048.jpg', // drop a local copy here for offline kiosks
  'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
];

function glowTexture(hex) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `${hex}ff`);
  g.addColorStop(0.4, `${hex}55`);
  g.addColorStop(1, `${hex}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function loadEarthTexture(material) {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const tryAt = (index) => {
    if (index >= EARTH_TEXTURES.length) return; // keep the flat blue-grey ball
    loader.load(
      EARTH_TEXTURES[index],
      (tex) => {
        material.map = tex;
        material.color.set(0xffffff);
        material.needsUpdate = true;
      },
      undefined,
      () => tryAt(index + 1),
    );
  };
  tryAt(0);
}

export class GlobeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.pickables = [];
    this.satObjs = new Map();
    this.stationObjs = new Map();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLOR_BG);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(3.4, 2.0, 3.6);

    this.controls = new THREE.OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 9;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.4;

    scene.add(new THREE.AmbientLight(0x8890b0, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 2, 3);
    scene.add(sun);
    this.sun = sun;

    this._addStars();
    this._addEarth();

    this.neutralGlow = glowTexture('#8890b0');
    this.accentGlow = glowTexture('#9184d9');

    this.txLine = this._makeBeam(COLOR_TX);
    this.rxLine = this._makeBeam(COLOR_RX);

    this.raycaster = new THREE.Raycaster();
    this.resize();
  }

  _addStars() {
    const geo = new THREE.BufferGeometry();
    const count = 1600;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 30 + Math.random() * 20;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xaab0d0, size: 0.05, transparent: true, opacity: 0.7,
    })));
  }

  _addEarth() {
    this.earthGroup = new THREE.Group();
    this.scene.add(this.earthGroup);

    // The flat color is what a texture-less kiosk sees; it is deliberately
    // dark, because the sun light that reads well over the map blows out a
    // mid-tone sphere.
    const material = new THREE.MeshPhongMaterial({ color: 0x1b2140, shininess: 6, specular: 0x223344 });
    loadEarthTexture(material);
    this.earthGroup.add(new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS_SCENE, 64, 64), material));

    const glow = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(COLOR_ACCENT) } },
      vertexShader: `varying vec3 vN;
        void main(){ vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vN; uniform vec3 glowColor;
        void main(){ float i = pow(0.65 - dot(vN, vec3(0,0,1)), 2.2);
        gl_FragColor = vec4(glowColor, clamp(i,0.0,1.0) * 0.55); }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS_SCENE * 1.045, 48, 48), glow));
  }

  _makeBeam(color) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    this.scene.add(line);
    return line;
  }

  // — stations —

  setStations(stations) {
    this.stationObjs.forEach((obj) => {
      this.earthGroup.remove(obj.group);
      obj.pin.geometry.dispose();
      obj.pin.material.dispose();
    });
    this.stationObjs.clear();
    this.pickables = this.pickables.filter((p) => p.userData.type !== 'station');

    stations.forEach((st) => {
      const p = stationSceneFixed(st, SCALE);
      const group = new THREE.Group();
      group.position.set(p.x, p.y, p.z);
      group.lookAt(p.x * 2, p.y * 2, p.z * 2);

      const pin = new THREE.Mesh(
        new THREE.ConeGeometry(0.028, 0.09, 10),
        new THREE.MeshBasicMaterial({ color: COLOR_PIN }),
      );
      pin.rotation.x = Math.PI / 2;
      pin.position.z = 0.045;
      group.add(pin);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.neutralGlow, transparent: true, depthWrite: false, opacity: 0.85,
      }));
      sprite.scale.set(0.16, 0.16, 1);
      group.add(sprite);

      const userData = { type: 'station', id: st.id };
      group.userData = userData;
      pin.userData = userData;
      sprite.userData = userData;

      this.earthGroup.add(group);
      this.pickables.push(pin, sprite);
      this.stationObjs.set(st.id, { group, pin, sprite });
    });
  }

  // — satellites —

  setSatellites(elements, date) {
    this.satObjs.forEach((obj) => {
      this.scene.remove(obj.mesh, obj.sprite, obj.ring, obj.trail);
      obj.mesh.geometry.dispose();
      obj.ring.geometry.dispose();
      obj.trail.geometry.dispose();
    });
    this.satObjs.clear();
    this.pickables = this.pickables.filter((p) => p.userData.type !== 'satellite');

    elements.forEach((el) => {
      const ringGeo = new THREE.BufferGeometry().setFromPoints(
        sampleOrbit(el, date).map((v) => {
          const s = eciToScene(v, SCALE);
          return new THREE.Vector3(s.x, s.y, s.z);
        }),
      );
      const ringMat = new THREE.LineBasicMaterial({ color: COLOR_RING, transparent: true, opacity: 0.22 });
      const ring = new THREE.Line(ringGeo, ringMat);
      this.scene.add(ring);

      const userData = { type: 'satellite', id: el.id };
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 16, 16),
        new THREE.MeshBasicMaterial({ color: COLOR_SAT }),
      );
      mesh.userData = userData;
      this.scene.add(mesh);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.neutralGlow, transparent: true, depthWrite: false, opacity: 0.8,
      }));
      sprite.scale.set(0.15, 0.15, 1);
      sprite.userData = userData;
      this.scene.add(sprite);

      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
      trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9,
      }));
      trail.visible = false;
      trail.frustumCulled = false;
      this.scene.add(trail);

      this.pickables.push(mesh, sprite);
      this.satObjs.set(el.id, { el, mesh, sprite, ring, ringMat, trail, trailGeo, trailBuf: [] });
    });
  }

  /** Redraw an orbit ring — call after the elements behind it are refreshed. */
  refreshOrbitRing(id, el, date) {
    const obj = this.satObjs.get(id);
    if (!obj) return;
    obj.el = el;
    obj.ring.geometry.dispose();
    obj.ring.geometry = new THREE.BufferGeometry().setFromPoints(
      sampleOrbit(el, date).map((v) => {
        const s = eciToScene(v, SCALE);
        return new THREE.Vector3(s.x, s.y, s.z);
      }),
    );
  }

  // — per-frame update —

  /**
   * @param {Date}   date        simulated wall-clock time
   * @param {Object} selection   { type, id } or { type: null }
   * @param {Object|null} beam   { station, satellite, link } for the active contact
   * @param {number} nowMs       performance.now(), drives the beam pulse
   */
  update(date, selection, beam, nowMs) {
    this.earthGroup.rotation.y = gmst(date);

    this.satObjs.forEach((obj, id) => {
      const s = eciToScene(propagate(obj.el, date), SCALE);
      obj.mesh.position.set(s.x, s.y, s.z);
      obj.sprite.position.set(s.x, s.y, s.z);

      const selected = selection.type === 'satellite' && selection.id === id;
      obj.mesh.material.color.set(selected ? COLOR_ACCENT : COLOR_SAT);
      obj.ringMat.color.set(selected ? COLOR_ACCENT : COLOR_RING);
      obj.ringMat.opacity = selected ? 0.85 : 0.22;
      obj.sprite.material.map = selected ? this.accentGlow : this.neutralGlow;
      obj.sprite.scale.setScalar(selected ? 0.22 : 0.15);
      obj.sprite.scale.z = 1;

      obj.trailBuf.push(s);
      if (obj.trailBuf.length > TRAIL_LEN) obj.trailBuf.shift();
      obj.trail.visible = selected && obj.trailBuf.length > 1;
      if (obj.trail.visible) this._writeTrail(obj);
    });

    this.stationObjs.forEach((obj, id) => {
      const selected = selection.type === 'station' && selection.id === id;
      obj.pin.material.color.set(selected ? COLOR_ACCENT : COLOR_PIN);
      obj.sprite.material.map = selected ? this.accentGlow : this.neutralGlow;
      obj.sprite.scale.setScalar(selected ? 0.24 : 0.16);
      obj.sprite.scale.z = 1;
    });

    this._updateBeams(date, beam, nowMs);

    this.controls.autoRotate = !selection.type;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _writeTrail(obj) {
    const pos = obj.trailGeo.attributes.position;
    const col = obj.trailGeo.attributes.color;
    const n = obj.trailBuf.length;
    for (let i = 0; i < n; i++) {
      const src = obj.trailBuf[i];
      pos.array[i * 3] = src.x;
      pos.array[i * 3 + 1] = src.y;
      pos.array[i * 3 + 2] = src.z;
      const a = i / (n - 1 || 1);
      col.array[i * 3] = 0.57 * a + 0.1;
      col.array[i * 3 + 1] = 0.51 * a + 0.1;
      col.array[i * 3 + 2] = 0.85 * a + 0.12;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    obj.trailGeo.setDrawRange(0, n);
  }

  _updateBeams(date, beam, nowMs) {
    if (!beam) {
      this.txLine.material.opacity = 0;
      this.rxLine.material.opacity = 0;
      return;
    }
    const st = eciToScene(stationEci(beam.station, date), SCALE);
    const sat = eciToScene(propagate(beam.satellite, date), SCALE);
    const pts = [new THREE.Vector3(st.x, st.y, st.z), new THREE.Vector3(sat.x, sat.y, sat.z)];
    this.txLine.geometry.setFromPoints(pts);
    this.rxLine.geometry.setFromPoints(pts);
    const pulse = 0.55 + 0.35 * Math.sin(nowMs / 260);
    const showTx = beam.link === 'TX' || beam.link === 'BOTH';
    const showRx = beam.link === 'RX' || beam.link === 'BOTH';
    this.txLine.material.opacity = showTx ? pulse : 0;
    this.rxLine.material.opacity = showRx ? pulse * 0.8 : 0;
  }

  // — interaction —

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    return hits.length ? hits[0].object.userData : null;
  }

  resetView() {
    this.camera.position.set(3.4, 2.0, 3.6);
    this.controls.target.set(0, 0, 0);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
