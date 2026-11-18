/* ECG Basics in 3D: prototype.
   Body axes used throughout: +x = patient's left, +y = superior (head),
   +z = anterior (towards the viewer in the frontal view).
   Lead voltage = gain x (mean electrical vector . lead unit vector). */
import * as THREE from './vendor/three/three.module.min.js';

const BEAT_MS = 800;
const COL = { blue: 0x184A63, orange: 0xB34700, magenta: 0xB01070, black: 0x111111, grey: 0x595959 };
const CSS = { magenta: '#B01070', black: '#111111', grey: '#8f8f8f', ghost: '#a9a9a9', grid: '#eee6dc', gridBold: '#e0d4c4' };
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEG = Math.PI / 180;

function unit(x, y, z) { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function smooth(e0, e1, x) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

/* ---------- Dipole model: sum of windowed Gaussian components (time in ms) ---------- */
const COMPONENTS = [
  { id: 'pRA',   c: 100, sl: 18, sr: 18, a: 0.17, d: unit(0.15, -0.75, 0.65) },   // right atrium: down, forwards
  { id: 'pLA',   c: 130, sl: 18, sr: 18, a: 0.16, d: unit(0.70, -0.50, -0.35) },  // left atrium: left, back
  { id: 'sep',   c: 222, sl: 8,  sr: 8,  a: 0.30, d: unit(-0.65, -0.15, 0.75) },  // septum: left to right, forwards
  { id: 'main',  c: 250, sl: 11, sr: 11, a: 1.45, d: unit(0.62, -0.62, -0.45) },  // main: down, left, back
  { id: 'basal', c: 279, sl: 9,  sr: 9,  a: 0.40, d: unit(-0.35, 0.55, -0.60) },  // bases: up, back
  { id: 'T',     c: 490, sl: 55, sr: 35, a: 0.32, d: unit(0.65, -0.60, -0.12) }   // repolarisation
];
const E3 = Math.exp(-4.5);
function comp(t, c) {
  const s = t < c.c ? c.sl : c.sr; const x = (t - c.c) / s;
  return c.a * Math.max(0, (Math.exp(-0.5 * x * x) - E3) / (1 - E3));
}
function dipole(t) {
  const v = [0, 0, 0];
  for (const c of COMPONENTS) { const a = comp(t, c); v[0] += a * c.d[0]; v[1] += a * c.d[1]; v[2] += a * c.d[2]; }
  return v;
}

/* ---------- Leads ---------- */
function frontal(th) { return [Math.cos(th * DEG), -Math.sin(th * DEG), 0]; }   // hexaxial: +90 points down
function transverse(ph) { return [Math.cos(ph * DEG), 0, Math.sin(ph * DEG)]; } // 0 = left, 90 = anterior
const LEADS = [
  { id: 'I',   type: 'limb',  dir: frontal(0),    gain: 1,     angle: '0°',    region: 'lateral',  view: 'Lateral' },
  { id: 'II',  type: 'limb',  dir: frontal(60),   gain: 1,     angle: '+60°',  region: 'inferior', view: 'Inferior' },
  { id: 'aVR', type: 'limb',  dir: frontal(-150), gain: 0.866, angle: '-150°', region: null,       view: 'None' },
  { id: 'aVF', type: 'limb',  dir: frontal(90),   gain: 0.866, angle: '+90°',  region: 'inferior', view: 'Inferior' },
  { id: 'V1',  type: 'chest', dir: transverse(115), gain: 1,   angle: 'chest', region: 'septal',   view: 'Septal' },
  { id: 'V6',  type: 'chest', dir: transverse(0),   gain: 1,   angle: 'chest', region: 'lateral',  view: 'Lateral' }
];
const REGION_TEXT = {
  inferior: 'the inferior wall',
  lateral: 'the lateral wall of the left ventricle',
  septal: 'the interventricular septum',
  null: 'no wall group in this model: aVR is not in the inferior, lateral or anterior lead groups'
};
function leadV(lead, t) { return lead.gain * dot(dipole(t), lead.dir); }

/* ---------- Phases ---------- */
const PHASES = [
  { from: 0, to: 60, key: 'rest', short: '', title: 'Resting (before the P wave)',
    text: 'All muscle is at rest, so there is no net electrical vector. Every lead sits on the isoelectric line.' },
  { from: 60, to: 175, key: 'P', short: 'P', title: 'Atrial depolarisation: P wave',
    text: 'The wave of depolarisation spreads from the sinoatrial node through the atria. The normal P axis is between 0° and +75°, so P is upright in I and II and inverted in aVR. In V1 the right atrium and then the left atrium give a biphasic P.' },
  { from: 175, to: 205, key: 'PR', short: 'PR', title: 'PR segment',
    text: 'The impulse is travelling through the atrioventricular node, where conduction is slowed, and the bundle of His. The line is isoelectric (flat).' },
  { from: 205, to: 236, key: 'sep', short: 'Q', title: 'Septal depolarisation: start of QRS',
    text: 'The septum depolarises first, from left to right, so the small early arrow points to the right. Left-sided leads (I, V6) see a small septal q wave; V1 normally has no q wave.' },
  { from: 236, to: 266, key: 'main', short: 'R', title: 'Main ventricular depolarisation',
    text: 'Depolarisation spreads towards the apex and then through the free walls. The arrow is large and points down and to the left, towards lead II, which records a tall R wave. aVR looks from the opposite direction, so it records a negative deflection.' },
  { from: 266, to: 305, key: 'basal', short: 'S', title: 'Late ventricular depolarisation',
    text: 'The last regions to depolarise, including the upper wall of the left ventricle, give a small arrow pointing upwards and away from the inferior leads, so II and aVF can show a small terminal s wave.' },
  { from: 305, to: 370, key: 'ST', short: 'ST', title: 'ST segment',
    text: 'The ST segment is isoelectric. It roughly matches the plateau phase of the ventricular action potentials, so there is no net arrow.' },
  { from: 370, to: 600, key: 'T', short: 'T', title: 'Ventricular repolarisation: T wave',
    text: 'In the ventricles the last cells to depolarise are the first to repolarise, so repolarisation runs roughly opposite to depolarisation. A repolarisation wave moving away from a + pole gives an upward deflection, so the T wave is upright in most leads. The normal T wave is inverted in aVR and V1.' },
  { from: 600, to: 801, key: 'TP', short: 'TP', title: 'Diastole: TP segment',
    text: 'The heart is electrically at rest until the next impulse from the sinoatrial node. All traces are flat.' }
];
function phaseAt(t) { return PHASES.find(p => t >= p.from && t < p.to) || PHASES[PHASES.length - 1]; }

/* ---------- State ---------- */
const state = { t: 250, playing: false, speed: 0.25, sel: 'II', view: 'oblique' };

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const scrub = $('scrub'), timeOut = $('timeOut'), playBtn = $('playBtn'), speedSel = $('speed');
const leadRows = $('leadRows');

/* Phase strip under the slider */
(function buildStrip() {
  const el = $('phaseStrip');
  for (const [a, b, l] of [[60, 175, 'P'], [205, 305, 'QRS'], [370, 600, 'T']]) {
    const seg = document.createElement('span'); seg.className = 'ps-seg';
    seg.style.left = (a / 8) + '%'; seg.style.width = ((b - a) / 8) + '%'; seg.textContent = l;
    el.appendChild(seg);
  }
})();

/* Lead rows */
const rowEls = {};
for (const L of LEADS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'lead-row'; b.dataset.lead = L.id;
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<span class="lead-name"><b>${L.id}</b><small>${L.type === 'limb' ? L.angle : 'Chest'}</small><small>${L.view}</small></span>` +
    `<canvas aria-hidden="true"></canvas><span class="lead-val" aria-hidden="true"></span>`;
  b.setAttribute('aria-label', `Lead ${L.id}, ${L.type === 'limb' ? 'limb lead at ' + L.angle.replace('-', 'minus ') : 'chest lead'}, views ${L.view.toLowerCase()}`);
  b.addEventListener('click', () => select(L.id));
  leadRows.appendChild(b);
  rowEls[L.id] = { btn: b, canvas: b.querySelector('canvas'), val: b.querySelector('.lead-val') };
}
/* Precompute traces */
const TRACE = {};
for (const L of LEADS) { const arr = new Float32Array(BEAT_MS + 1); for (let i = 0; i <= BEAT_MS; i++) arr[i] = leadV(L, i); TRACE[L.id] = arr; }

function drawTraces() {
  for (const L of LEADS) {
    const { canvas, val } = rowEls[L.id];
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) continue;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const mid = h * 0.55, ys = h * 0.33; // pixels per mV
    const xOf = t => (t / BEAT_MS) * w, yOf = v => mid - v * ys;
    // grid: 40 ms minor, 200 ms major
    for (let t = 0; t <= BEAT_MS; t += 40) {
      g.strokeStyle = t % 200 === 0 ? CSS.gridBold : CSS.grid; g.lineWidth = 1;
      g.beginPath(); g.moveTo(xOf(t) + 0.5, 0); g.lineTo(xOf(t) + 0.5, h); g.stroke();
    }
    g.strokeStyle = CSS.gridBold; g.beginPath(); g.moveTo(0, mid + 0.5); g.lineTo(w, mid + 0.5); g.stroke();
    const arr = TRACE[L.id];
    const sel = L.id === state.sel;
    // ghost of the whole beat
    g.setLineDash([3, 3]); g.strokeStyle = CSS.ghost; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i <= BEAT_MS; i += 2) { const x = xOf(i), y = yOf(arr[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.setLineDash([]);
    // live trace
    const tn = Math.round(state.t);
    g.strokeStyle = sel ? CSS.magenta : CSS.black; g.lineWidth = sel ? 2.6 : 1.8; g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i <= tn; i++) { const x = xOf(i), y = yOf(arr[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    // cursor
    g.strokeStyle = CSS.grey; g.lineWidth = 1; g.beginPath(); g.moveTo(xOf(tn) + 0.5, 0); g.lineTo(xOf(tn) + 0.5, h); g.stroke();
    g.fillStyle = sel ? CSS.magenta : CSS.black; g.beginPath(); g.arc(xOf(tn), yOf(arr[tn]), 3, 0, Math.PI * 2); g.fill();
    const v = arr[tn];
    val.textContent = (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(2) + ' mV';
  }
}

/* ---------- 3D scene ---------- */
let renderer = null, scene, camera, needsRender = true;
const stage = $('stage'), canvas = $('scene'), labelLayer = $('labels');
function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch (e) { return false; }
}
try {
  if (webglAvailable()) renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
} catch (e) { renderer = null; }
if (!renderer || !renderer.getContext()) {
  $('fallback').hidden = false; canvas.hidden = true; renderer = null;
  document.querySelectorAll('.view-btn, #resetView').forEach(b => { b.disabled = true; });
  $('sceneHelp').textContent = '3D is unavailable here, but the timeline, phase buttons and lead traces still work.';
}

const labels = [];
function addLabel(text, cls, getPos, prio) {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.textContent = text;
  labelLayer.appendChild(el); const L = { el, getPos, visible: true, prio: prio != null ? prio : ({ proj: 1, vec: 2, region: 3, lead: 4, heart: 6 }[cls] || 5) }; labels.push(L); return L;
}

let vecLabel, frontLabel, projLabel, heart, heartParts = [], arrow, trail, trailPts = [], projBar, projLine, leadObjs = {}, regionMeshes = [], regionLabel, torso;
const orbit = { az: 35 * DEG, el: 14 * DEG, r: 19, target: new THREE.Vector3(0, 0.4, 0) };
const VIEWS = {
  oblique:    { az: 35 * DEG, el: 14 * DEG, r: 19, note: '3D view. Drag to rotate.' },
  frontal:    { az: 0, el: 0, r: 19.5, note: "Frontal view: limb leads (hexaxial). The patient's left is on your right." },
  transverse: { az: 0, el: 89.4 * DEG, r: 16, note: "Transverse view from above: front of the chest at the bottom, patient's left on your right." }
};

function rod(from, to, radius, mat) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(radius, radius, len, 10, 1);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
function dashedRod(from, to, radius, mat, n) {
  const grp = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const f0 = i / n, f1 = (i + 0.55) / n;
    const p0 = from.map((v, k) => v + (to[k] - v) * f0), p1 = from.map((v, k) => v + (to[k] - v) * f1);
    grp.add(rod(p0, p1, radius, mat));
  }
  return grp;
}

/* Torso: ellipsoid, heart sits left of midline and anterior */
const TORSO_C = new THREE.Vector3(-0.55, 0.9, -0.4), TORSO_R = new THREE.Vector3(3.1, 4.0, 1.9);
function torsoHit(dir) { // ray from origin along dir to torso surface
  const d = new THREE.Vector3(...dir), o = TORSO_C.clone().negate();
  const dx = d.clone().divide(TORSO_R), ox = o.clone().divide(TORSO_R);
  const A = dx.dot(dx), B = 2 * ox.dot(dx), Cc = ox.dot(ox) - 1;
  const t = (-B + Math.sqrt(B * B - 4 * A * Cc)) / (2 * A);
  return d.multiplyScalar(t);
}

function buildScene() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0xFBFAF7);
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(3, 6, 8); scene.add(dl);

  // torso
  const tg = new THREE.SphereGeometry(1, 40, 28);
  torso = new THREE.Group();
  const tMesh = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ color: 0xd9d4cc, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  const tWire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 16, 10)), new THREE.LineBasicMaterial({ color: 0x9a948a, transparent: true, opacity: 0.16 }));
  torso.add(tMesh, tWire); torso.scale.copy(TORSO_R); torso.position.copy(TORSO_C); scene.add(torso);
  frontLabel = addLabel('Front of chest', 'heart', () => new THREE.Vector3(TORSO_C.x - 1.6, 0, TORSO_C.z + TORSO_R.z + 0.45));

  buildHeart();

  // leads
  const leadMat = new THREE.MeshLambertMaterial({ color: COL.blue });
  for (const L of LEADS) {
    const grp = new THREE.Group(); grp.userData.lead = L.id;
    const matPos = leadMat.clone(), matNeg = leadMat.clone();
    let pole;
    if (L.type === 'limb') pole = L.dir.map(v => v * 4.4);
    else { const h = torsoHit(L.dir); pole = [h.x, h.y, h.z]; }
    const neg = L.dir.map(v => v * (L.type === 'limb' ? -4.4 : -2.6));
    const pos = rod([0, 0, 0], pole, 0.035, matPos);
    const negR = dashedRod([0, 0, 0], neg, 0.025, matNeg, 9);
    const marker = L.type === 'limb'
      ? new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), matPos)
      : new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), matPos);
    marker.position.set(...pole);
    // fat invisible pick target
    const pick = rod([0, 0, 0], pole, 0.22, new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData.lead = L.id; marker.userData.lead = L.id; pos.userData.lead = L.id;
    grp.add(pos, negR, marker, pick);
    scene.add(grp);
    const lbl = addLabel(L.type === 'limb' ? `+ ${L.id} ${L.angle}` : `+ ${L.id}`, 'lead', () => new THREE.Vector3(...pole.map(v => v * 1.12)));
    leadObjs[L.id] = { grp, matPos, matNeg, pos, negR, marker, pick, lbl, pole };
  }

  // projection of the arrow onto the selected lead
  projBar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1, 14), new THREE.MeshLambertMaterial({ color: COL.magenta, depthTest: false }));
  projBar.renderOrder = 11; scene.add(projBar);
  projLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: COL.magenta, dashSize: 0.12, gapSize: 0.08, depthTest: false }));
  projLine.renderOrder = 11;
  scene.add(projLine);
  projLabel = addLabel('', 'proj', () => projLabel.pos);

  // mean vector arrow
  arrow = new THREE.Group();
  const am = new THREE.MeshLambertMaterial({ color: COL.black, depthTest: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 12), am); shaft.name = 'shaft';
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.4, 16), am); head.name = 'head';
  arrow.add(shaft, head); scene.add(arrow);
  shaft.renderOrder = 12; head.renderOrder = 12;
  const dotSphere = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), am); dotSphere.renderOrder = 12; scene.add(dotSphere);
  vecLabel = addLabel('Mean vector', 'vec', () => { const l = arrowTip.length(); return l < 0.06 ? new THREE.Vector3(0, 0.5, 0) : arrowTip.clone().multiplyScalar((l + 0.7) / l); });

  trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: COL.grey, dashSize: 0.06, gapSize: 0.05, depthTest: false }));
  trail.renderOrder = 10;
  scene.add(trail);
}

const arrowTip = new THREE.Vector3();
const VEC_SCALE = 2.0;
const HEART_SCALE = 1.45; // scene units per mV

/* Heart: stylised, ventricles as lathe teardrops, atria as spheres */
let heartMatrix;
function buildHeart() {
  heart = new THREE.Group();
  const apexDir = new THREE.Vector3(0.55, -0.62, 0.45).normalize();
  const Y = apexDir.clone().negate();
  const Z = new THREE.Vector3(0, 0, 1).sub(Y.clone().multiplyScalar(Y.z)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  heart.matrixAutoUpdate = false;
  heart.matrix.makeBasis(X, Y, Z);
  heart.matrix.scale(new THREE.Vector3(HEART_SCALE, HEART_SCALE, HEART_SCALE));
  heart.matrix.setPosition(apexDir.clone().multiplyScalar(-0.15));
  heartMatrix = heart.matrix;
  scene.add(heart);

  const prof = (rMax, y0, y1) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const s = i / 24; const y = y0 + (y1 - y0) * s;
      const r = rMax * Math.pow(Math.sin(Math.min(1, s * 1.1) * Math.PI * 0.55), 0.75);
      pts.push(new THREE.Vector2(Math.max(0.001, r), y));
    }
    return pts;
  };
  const mkMat = (opacity) => new THREE.MeshLambertMaterial({ vertexColors: true, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });

  const parts = [
    { name: 'LV', geo: new THREE.LatheGeometry(prof(0.72, -1.0, 0.95), 36), pos: [0.2, 0, -0.12], scl: [1, 1, 1], kind: 'vent', op: 0.8 },
    { name: 'RV', geo: new THREE.LatheGeometry(prof(0.62, -0.72, 0.95), 36), pos: [-0.42, 0.05, 0.25], scl: [1, 1, 0.72], kind: 'vent', op: 0.8 },
    { name: 'RA', geo: new THREE.SphereGeometry(0.5, 28, 18), pos: [-0.55, 1.3, 0.22], scl: [1, 0.95, 0.9], kind: 'atr', op: 1 },
    { name: 'LA', geo: new THREE.SphereGeometry(0.45, 28, 18), pos: [0.38, 1.32, -0.42], scl: [1, 0.9, 0.9], kind: 'atr', op: 1 },
    { name: 'Septum', geo: new THREE.CircleGeometry(1, 32), pos: [-0.12, 0.0, 0.1], scl: [0.38, 0.85, 1], kind: 'sep', op: 1 }
  ];
  const SA = new THREE.Vector3(-0.62, 1.72, 0.3);
  for (const p of parts) {
    const mat = mkMat(p.op); if (p.kind === 'sep') mat.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(p.geo, mat);
    mesh.position.set(...p.pos); mesh.scale.set(...p.scl);
    if (p.kind === 'sep') mesh.rotation.y = -Math.PI / 4;
    mesh.renderOrder = p.op < 1 ? 2 : 1;
    heart.add(mesh);
    mesh.updateMatrix();
    const pos = p.geo.attributes.position, n = pos.count;
    const colours = new Float32Array(n * 3); p.geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const tAct = new Float32Array(n), tRec = new Float32Array(n);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix); // heart-local
      if (p.kind === 'atr') { const d = v.distanceTo(SA); tAct[i] = 62 + 75 * d; tRec[i] = tAct[i] + 170; }
      else if (p.kind === 'sep') { tAct[i] = 205 + 14 * (v.y + 1) / 2; tRec[i] = 430 + 60 * (v.y + 1) / 2; }
      else { const s = Math.min(1, Math.max(0, (v.y + 1) / 1.95)); tAct[i] = 222 + 62 * Math.pow(s, 1.3); tRec[i] = 425 + 130 * s; }
    }
    heartParts.push({ mesh, name: p.name, kind: p.kind, tAct, tRec, colours });
  }
  // SA node marker
  const sa = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshLambertMaterial({ color: COL.black }));
  sa.position.copy(SA); heart.add(sa);
  const toWorld = (x, y, z) => () => new THREE.Vector3(x, y, z).applyMatrix4(heartMatrix);
  addLabel('LV', 'heart', toWorld(0.75, -0.2, -0.3));
  addLabel('RV', 'heart', toWorld(-0.95, -0.05, 0.55));
  addLabel('RA', 'heart', toWorld(-1.05, 1.45, 0.4));
  addLabel('LA', 'heart', toWorld(0.85, 1.6, -0.6));
  addLabel('SA node', 'heart', toWorld(-0.75, 2.05, 0.3));
}

const C_REST = new THREE.Color(0xd2cbc0), C_DEP = new THREE.Color(0xE0884A), C_TMP = new THREE.Color();
function colourHeart(t) {
  for (const p of heartParts) {
    const { tAct, tRec, colours } = p; const n = tAct.length;
    for (let i = 0; i < n; i++) {
      const f = smooth(tAct[i], tAct[i] + 10, t) * (1 - smooth(tRec[i], tRec[i] + 40, t));
      C_TMP.copy(C_REST).lerp(C_DEP, f);
      colours[i * 3] = C_TMP.r; colours[i * 3 + 1] = C_TMP.g; colours[i * 3 + 2] = C_TMP.b;
    }
    p.mesh.geometry.attributes.color.needsUpdate = true;
  }
}

/* Region the selected lead faces: magenta wire mesh over the relevant faces */
function buildRegion(region) {
  for (const m of regionMeshes) { m.parent.remove(m); m.geometry.dispose(); }
  regionMeshes = [];
  if (regionLabel) regionLabel.visible = false;
  if (!region || !renderer) return;
  const mat = new THREE.LineBasicMaterial({ color: COL.magenta, depthTest: false, transparent: true, opacity: 0.9 });
  const centroid = new THREE.Vector3(); let cn = 0;
  const nm = new THREE.Matrix3();
  for (const p of heartParts) {
    if (region === 'septal' ? p.kind !== 'sep' : p.kind !== 'vent') continue;
    if (region === 'lateral' && p.name !== 'LV') continue;
    const geo = p.mesh.geometry; const pos = geo.attributes.position, nor = geo.attributes.normal;
    const world = new THREE.Matrix4().multiplyMatrices(heartMatrix, p.mesh.matrix);
    nm.getNormalMatrix(world);
    const idx = geo.index ? geo.index.array : null; const triCount = idx ? idx.length / 3 : pos.count / 3;
    const keep = []; const a = new THREE.Vector3(), wn = new THREE.Vector3(), wp = new THREE.Vector3();
    for (let tIdx = 0; tIdx < triCount; tIdx++) {
      const i0 = idx ? idx[tIdx * 3] : tIdx * 3, i1 = idx ? idx[tIdx * 3 + 1] : tIdx * 3 + 1, i2 = idx ? idx[tIdx * 3 + 2] : tIdx * 3 + 2;
      wn.set(0, 0, 0);
      for (const ii of [i0, i1, i2]) wn.add(a.fromBufferAttribute(nor, ii));
      wn.applyMatrix3(nm).normalize();
      let ok = region === 'septal';
      if (region === 'inferior') ok = wn.y < -0.5;
      if (region === 'lateral') ok = wn.x > 0.55;
      if (ok) {
        keep.push(i0, i1, i2);
        wp.fromBufferAttribute(pos, i0).applyMatrix4(world); centroid.add(wp); cn++;
      }
    }
    if (!keep.length) continue;
    const sub = new THREE.BufferGeometry(); sub.setAttribute('position', pos); sub.setIndex(keep);
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(sub), mat);
    wire.renderOrder = 5;
    p.mesh.add(wire); regionMeshes.push(wire);
  }
  if (cn) {
    centroid.multiplyScalar(1 / cn);
    const txt = region === 'inferior' ? 'Inferior wall' : region === 'lateral' ? 'Lateral wall' : 'Septum';
    if (!regionLabel) regionLabel = addLabel(txt, 'region', () => regionLabel.pos);
    regionLabel.el.textContent = txt;
    const push = region === 'inferior' ? new THREE.Vector3(0, -0.6, 0.3) : region === 'lateral' ? new THREE.Vector3(0.7, 0, 0) : new THREE.Vector3(0, 0.0, 0.0);
    regionLabel.pos = centroid.clone().add(push); regionLabel.visible = true;
  }
}

function setLeadStyles() {
  if (!renderer) return;
  for (const L of LEADS) {
    const o = leadObjs[L.id]; const sel = L.id === state.sel;
    const dim = !sel && ((state.view === 'frontal' && L.type === 'chest') || (state.view === 'transverse' && L.type === 'limb'));
    for (const m of [o.matPos, o.matNeg]) { m.color.setHex(sel ? COL.magenta : COL.blue); m.transparent = dim; m.opacity = dim ? 0.15 : 1; m.depthWrite = !dim; m.needsUpdate = true; }
    const s = sel ? 1.4 : 1;
    o.pos.scale.set(s, 1, s);
    o.negR.children.forEach(c => c.scale.set(s, 1, s));
    o.marker.scale.setScalar(sel ? 1.35 : 1);
    o.lbl.el.className = 'lbl lead' + (sel ? ' sel' : dim ? ' dim' : '');
    o.lbl.visible = !dim;
  }
  if (frontLabel) frontLabel.visible = state.view === 'transverse';
  {
  }
}

/* Camera */
let camAnim = null;
function placeCamera() {
  const { az, el, r, target } = orbit;
  camera.position.set(target.x + r * Math.cos(el) * Math.sin(az), target.y + r * Math.sin(el), target.z + r * Math.cos(el) * Math.cos(az));
  camera.up.set(0, 1, 0); camera.lookAt(target);
  needsRender = true;
}
function goView(name, instant) {
  const v = VIEWS[name]; state.view = name;
  document.querySelectorAll('.view-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  $('viewNote').textContent = v.note;
  setLeadStyles();
  if (!renderer) return;
  if (instant || REDUCED) { orbit.az = v.az; orbit.el = v.el; orbit.r = v.r; placeCamera(); return; }
  // shortest azimuth path
  let daz = ((v.az - orbit.az) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  camAnim = { t0: performance.now(), from: { az: orbit.az, el: orbit.el, r: orbit.r }, to: { az: orbit.az + daz, el: v.el, r: v.r } };
}
function markCustom() {
  if (state.view !== 'custom') { state.view = 'custom'; document.querySelectorAll('.view-btn').forEach(b => b.setAttribute('aria-pressed', 'false')); $('viewNote').textContent = 'Custom 3D view. Use Reset view to return.'; setLeadStyles(); }
}

/* Interaction */
function initInteraction() {
  let drag = null; const pointers = new Map(); let pinch0 = null;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { x: e.clientX, y: e.clientY, moved: 0 }; camAnim = null;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), r: orbit.r }; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch0) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      orbit.r = Math.min(30, Math.max(8, pinch0.r * pinch0.d / Math.max(1, d))); placeCamera(); markCustom(); return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 3) { orbit.az -= dx * 0.008; orbit.el = Math.max(-89.4 * DEG, Math.min(89.4 * DEG, orbit.el + dy * 0.008)); placeCamera(); markCustom(); }
  });
  const end = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = null;
    if (drag && drag.moved <= 3 && e.type === 'pointerup') pickAt(e.clientX, e.clientY);
    if (!pointers.size) drag = null;
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { e.preventDefault(); orbit.r = Math.min(30, Math.max(8, orbit.r * (e.deltaY > 0 ? 1.08 : 0.926))); placeCamera(); markCustom(); }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const k = e.key; let used = true;
    if (k === 'ArrowLeft') orbit.az += 10 * DEG; else if (k === 'ArrowRight') orbit.az -= 10 * DEG;
    else if (k === 'ArrowUp') orbit.el = Math.min(89.4 * DEG, orbit.el + 10 * DEG); else if (k === 'ArrowDown') orbit.el = Math.max(-89.4 * DEG, orbit.el - 10 * DEG);
    else if (k === '+' || k === '=') orbit.r = Math.max(8, orbit.r * 0.9); else if (k === '-' || k === '_') orbit.r = Math.min(30, orbit.r * 1.1);
    else if (k === 'r' || k === 'R') { goView('oblique'); e.preventDefault(); return; }
    else used = false;
    if (used) { e.preventDefault(); camAnim = null; placeCamera(); markCustom(); }
  });
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function pickAt(cx, cy) {
    const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = LEADS.map(L => [leadObjs[L.id].pick, leadObjs[L.id].marker]).flat();
    const hit = ray.intersectObjects(targets, false)[0];
    if (hit) select(hit.object.userData.lead);
  }
}

function resize() {
  if (!renderer) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); needsRender = true;
}

function updateScene() {
  if (!renderer) return;
  const t = state.t; const D = dipole(t); const mag = Math.hypot(...D);
  const dir = new THREE.Vector3(...D);
  const shaft = arrow.getObjectByName('shaft'), head = arrow.getObjectByName('head');
  const len = mag * VEC_SCALE;
  arrow.visible = len > 0.03;
  if (arrow.visible) {
    dir.normalize();
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const headLen = Math.min(0.4, len * 0.45);
    head.scale.set(headLen / 0.4, headLen / 0.4, headLen / 0.4);
    shaft.scale.set(1, Math.max(0.001, len - headLen), 1); shaft.position.set(0, (len - headLen) / 2, 0);
    head.position.set(0, len - headLen / 2, 0);
  }
  arrowTip.set(D[0], D[1], D[2]).multiplyScalar(VEC_SCALE);
  // vector loop trail for the current beat
  const pts = [];
  for (let i = 0; i <= Math.round(t); i += 2) { const d = dipole(i); pts.push(new THREE.Vector3(d[0], d[1], d[2]).multiplyScalar(VEC_SCALE)); }
  trail.geometry.dispose(); trail.geometry = new THREE.BufferGeometry().setFromPoints(pts.length > 1 ? pts : [new THREE.Vector3(), new THREE.Vector3()]);
  trail.computeLineDistances();
  // projection on the selected lead
  const L = LEADS.find(l => l.id === state.sel); const u = new THREE.Vector3(...L.dir);
  const p = arrowTip.dot(u); const foot = u.clone().multiplyScalar(p);
  projBar.visible = Math.abs(p) > 0.03;
  if (projBar.visible) {
    projBar.scale.set(1, Math.abs(p), 1); projBar.position.copy(foot).multiplyScalar(0.5);
    projBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u.clone().multiplyScalar(Math.sign(p)));
  }
  const vNow = TRACE[L.id][Math.round(t)];
  projLabel.visible = projBar.visible;
  projLabel.el.textContent = `${L.id}: ${(vNow >= 0 ? '+' : '\u2212') + Math.abs(vNow).toFixed(2)} mV`;
  projLabel.pos = foot.clone().add(u.clone().multiplyScalar(Math.sign(p) * 0.45));
  projLine.geometry.setFromPoints([arrowTip.clone(), foot]); projLine.computeLineDistances(); projLine.visible = arrow.visible;
  colourHeart(t);
  needsRender = true;
}

const OFFSETS = [[0, 0], [0, -20], [0, 20], [-30, 0], [30, 0], [-26, -20], [26, -20], [-26, 20], [26, 20], [0, -38], [0, 38]];
function updateLabels() {
  const w = stage.clientWidth, h = stage.clientHeight; const v = new THREE.Vector3();
  const placed = [];
  const order = labels.slice().sort((a, b) => effPrio(a) - effPrio(b));
  for (const L of order) {
    if (!L.visible) { L.el.classList.add('hidden'); continue; }
    const p = L.getPos(); if (!p) { L.el.classList.add('hidden'); continue; }
    v.copy(p).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { L.el.classList.add('hidden'); continue; }
    L.el.classList.remove('hidden');
    const bw = L.el.offsetWidth + 4, bh = L.el.offsetHeight + 2;
    const x0 = ((v.x + 1) / 2) * w, y0 = ((1 - v.y) / 2) * h;
    let spot = null;
    for (const [dx, dy] of OFFSETS) {
      const x = Math.min(w - bw / 2, Math.max(bw / 2, x0 + dx)), y = Math.min(h - bh / 2, Math.max(bh / 2, y0 + dy));
      const box = [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2];
      if (!placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) { spot = [x, y, box]; break; }
    }
    if (!spot) { if (effPrio(L) > 2) { L.el.classList.add('hidden'); continue; } const x = x0, y = y0; spot = [x, y, [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2]]; }
    placed.push(spot[2]);
    L.el.style.transform = `translate(${spot[0]}px, ${spot[1]}px) translate(-50%, -50%)`;
  }
}
function effPrio(L) { return L.el.classList.contains('sel') ? 0 : L.prio; }

/* ---------- Text panels ---------- */
let lastPhase = null;
function describeLead() {
  const L = LEADS.find(l => l.id === state.sel); const D = dipole(state.t); const mag = Math.hypot(...D);
  const v = TRACE[L.id][Math.round(state.t)];
  let rel;
  if (mag < 0.02) rel = 'There is no net vector at this moment, so the trace is on the baseline.';
  else {
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(D, L.dir) / mag))) / DEG;
    const a = Math.round(ang);
    if (ang < 60) rel = `The arrow points towards the + pole (${a}° away from it), so the trace goes up.`;
    else if (ang > 120) rel = `The arrow points away from the + pole (${a}° from it), so the trace goes down.`;
    else rel = `The arrow is nearly at right angles to this lead (${a}°), so the deflection is small.`;
  }
  const where = L.type === 'limb' ? `a limb lead at ${L.angle}` : (L.id === 'V1' ? 'a chest lead at the 4th intercostal space, right sternal edge' : 'a chest lead at the 5th intercostal space, mid-axillary line');
  $('leadExplain').innerHTML = `<p class="le-head">Selected: lead ${L.id} (${L.view.toLowerCase()})</p>` +
    `<p>${L.id} is ${where}. It mainly faces ${REGION_TEXT[L.region]}.</p><p>${rel} Value now: ${(v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(2)} mV.</p>`;
}
function updateText(announce) {
  const ph = phaseAt(state.t);
  if (ph !== lastPhase) { $('phaseTitle').textContent = ph.title; $('phaseText').textContent = ph.text; lastPhase = ph; }
  describeLead();
  if (announce) $('live').textContent = `${Math.round(state.t)} milliseconds. ${ph.title}. ${ph.text}`;
}

function setT(t, announce) {
  state.t = Math.max(0, Math.min(BEAT_MS, t));
  scrub.value = Math.round(state.t);
  const ph = phaseAt(state.t);
  scrub.setAttribute('aria-valuetext', `${Math.round(state.t)} milliseconds, ${ph.title}`);
  timeOut.textContent = `${Math.round(state.t)} ms`;
  updateScene(); drawTraces(); updateText(announce);
}

function select(id) {
  state.sel = id;
  for (const L of LEADS) rowEls[L.id].btn.setAttribute('aria-pressed', String(L.id === id));
  setLeadStyles();
  buildRegion(LEADS.find(l => l.id === id).region);
  updateScene(); drawTraces(); updateText(false);
  $('live').textContent = `Lead ${id} selected.`;
}

function setPlaying(on) {
  state.playing = on; playBtn.setAttribute('aria-pressed', String(on));
  playBtn.querySelector('.play-label').textContent = on ? 'Pause' : 'Play';
  playBtn.setAttribute('aria-label', on ? 'Pause the beat' : 'Play the beat');
  if (!on) updateText(true);
}

/* ---------- Wiring ---------- */
scrub.addEventListener('input', () => { setPlaying(false); setT(+scrub.value, true); });
playBtn.addEventListener('click', () => { if (!state.playing && state.t >= BEAT_MS) setT(0); setPlaying(!state.playing); });
speedSel.addEventListener('change', () => { state.speed = +speedSel.value; });
document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => { setPlaying(false); setT(+b.dataset.jump, true); }));
document.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => goView(b.dataset.view)));
$('resetView').addEventListener('click', () => { orbit.target.set(0, 0.4, 0); goView('oblique'); });
window.addEventListener('resize', () => { resize(); drawTraces(); });

if (renderer) { buildScene(); initInteraction(); resize(); }
goView('oblique', true);
select('II');
setT(250);

let last = performance.now();
function frame(now) {
  const dt = Math.min(100, now - last); last = now;
  if (state.playing) {
    let t = state.t + dt * state.speed;
    if (t > BEAT_MS) t = 0;
    setT(t);
  }
  if (camAnim && renderer) {
    const k = Math.min(1, (now - camAnim.t0) / 600); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    for (const key of ['az', 'el', 'r']) orbit[key] = camAnim.from[key] + (camAnim.to[key] - camAnim.from[key]) * e;
    placeCamera(); if (k >= 1) camAnim = null;
  }
  if (renderer && needsRender) { renderer.render(scene, camera); updateLabels(); needsRender = false; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (!REDUCED) setPlaying(true);

/* Hooks for automated checks and screenshots */
window.ecg3d = {
  setT: t => { setPlaying(false); setT(t, true); }, select, view: v => goView(v, true), play: setPlaying,
  orbit: (az, el, r) => { camAnim = null; orbit.az = az * DEG; orbit.el = el * DEG; if (r) orbit.r = r; placeCamera(); markCustom(); },
  trace: id => Array.from(TRACE[id]), webgl: !!renderer
};
