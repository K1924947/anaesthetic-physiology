/* ECG in 3D (prototype).
   Body axes: +x = patient's left, +y = head, +z = anterior (towards you in the frontal view).
   Pipeline:  conduction config -> activation times (atria, AV node, His-Purkinje, ventricles)
              -> mean electrical vector D(t) from every muscle element's wavefront
              -> lead voltage = gain x (D . lead unit vector) -> 3D animation and 12-lead ECG.
   Pathology-ready: every conduction segment in CONDUCTION.segments has `blocked` and
   `extraDelay`; CONDUCTION.avDelay sets the AV node delay; CONDUCTION.accessory can hold
   extra atrium-to-ventricle connections (e.g. a WPW pathway). Call rebuildModel() after a change. */
import * as THREE from './vendor/three/three.module.min.js';

const BEAT_MS = 800, STRIP_BEATS = 12;
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEG = Math.PI / 180;
const COL = { blue: 0x184A63, paleBlue: 0x9DB8C8, orange: 0xB34700, black: 0x111111, grey: 0x595959, leadGrey: 0x8a8a8a };
const PAPER = { minor: '#F7D9D3', major: '#E9A49B', trace: '#111111', cursor: '#184A63', shade: 'rgba(24, 74, 99, 0.10)' };
// Default 3D palette, and the site's colour-blind tokens (one colour per family: blue = fast route and still depolarised,
// orange = slow cell-to-cell front, grey = resting or recovering, black = the vector arrow), as on the 2D ECG Conduction page.
const THEMES = {
  default: {
    rest: 0xDCDAD6, front: 0xE0701E, dep: 0xC9D9E8, dot: 0x005A9E,
    condIdle: 0x7B8189, condDone: 0x4F84A8, pulse: 0x005A9E, node: 0x184A63,
    cursor: 0x184A63, black: 0x111111, grey: 0x595959, leadGrey: 0x8a8a8a
  },
  'colour-blind': {
    rest: 0xDCDAD6, front: 0xD95F02, dep: 0xC6D8EA, dot: 0x005A9E,
    condIdle: 0x6B7075, condDone: 0x5B8FC4, pulse: 0x005A9E, node: 0x005A9E,
    cursor: 0x005A9E, black: 0x111111, grey: 0x595959, leadGrey: 0x8a8a8a
  }
};
function hex6(n) { return '#' + n.toString(16).padStart(6, '0'); }
function isColourBlindTheme() {
  return !!(window.PhysioTheme ? window.PhysioTheme.isColourBlind() : (document.documentElement.getAttribute('data-theme') === 'colour-blind' || window.__physioColourBlind));
}

function unit(x, y, z) { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
const $ = id => document.getElementById(id);

/* ======================= Heart geometry (heart-local units) ======================= */
// Ventricles below y = 0 (the valve plane / AV groove); atria sit directly on top (y >= ATRIA_Y0 = 0).
// The fibrous AV ring insulates them electrically: atrial and ventricular elements never conduct to each other.
// Interventricular septum: |x| < SEPT. Interatrial septum: the plane ASEPT (RA in front and to the right, LA behind).
const SEPT = 0.15, ATRIA_Y0 = 0.0;
const TL = 0.4, TR = 0.35, WA = 0.35; // apex taper of the left and right ventricles; waist of the atria at the AV groove
const SHAPES = {
  LV:  { c: [0.25, -1.0, -0.05], r: [0.85, 1.25, 0.80], t: TL },
  LVc: { c: [0.30, -0.92, -0.05], r: [0.50, 0.98, 0.47], t: TL },
  RV:  { c: [-0.35, -0.85, 0.12], r: [0.70, 1.05, 0.72], t: TR },
  RVc: { c: [-0.40, -0.80, 0.12], r: [0.56, 0.90, 0.59], t: TR },
  S:   { c: [0.0, -0.85, 0.04],  r: [SEPT, 1.05, 0.62] },
  RA:  { c: [-0.40, 0.0, 0.22],  r: [0.62, 0.66, 0.55], w: WA },
  LA:  { c: [0.30, 0.02, -0.26], r: [0.60, 0.58, 0.52], w: WA }
};
const ASEPT = { p: [-0.05, 0, 0.0], n: unit(0.85, 0, -0.53) };
function atrialSide(p) { return (p[0] - ASEPT.p[0]) * ASEPT.n[0] + (p[2] - ASEPT.p[2]) * ASEPT.n[2]; } // < 0: RA side
// taper (t): below its centre a ventricle narrows towards the apex, so the heart has a clear point rather than a round end
// waist (w): the atria narrow where they meet the ventricles (the AV groove), so they sit on the base instead of overhanging it
function taperOf(S, y) {
  let f = 1;
  if (S.t && y < S.c[1]) { const u = Math.min(1, (S.c[1] - y) / S.r[1]); f *= 1 - S.t * u * u; }
  if (S.w) { const u = Math.max(0, 1 - (y - ATRIA_Y0) / 0.4); f *= 1 - S.w * u * u; }
  return f;
}
function inE(p, s) { const S = SHAPES[s], c = S.c, r = S.r, f = taperOf(S, p[1]); const a = (p[0] - c[0]) / (r[0] * f), b = (p[1] - c[1]) / r[1], d = (p[2] - c[2]) / (r[2] * f); return a * a + b * b + d * d <= 1; }
function inYZ(p, s) { const c = SHAPES[s].c, r = SHAPES[s].r; const b = (p[1] - c[1]) / r[1], d = (p[2] - c[2]) / r[2]; return b * b + d * d <= 1; }
// Region of a point: 'S' septum, 'LV', 'RV' (walls), 'LVc'/'RVc' cavities, 'RA', 'LA', or null.
function regionOf(p) {
  if (p[1] >= ATRIA_Y0) { const side = atrialSide(p); if (side < 0 && inE(p, 'RA')) return 'RA'; if (side >= 0 && inE(p, 'LA')) return 'LA'; return null; }
  if (Math.abs(p[0]) < SEPT && inYZ(p, 'S')) return 'S';
  if (p[0] >= -SEPT && inE(p, 'LV')) return (p[0] >= SEPT && inE(p, 'LVc')) ? 'LVc' : 'LV';
  if (p[0] <= -SEPT && inE(p, 'RV')) return inE(p, 'RVc') ? 'RVc' : 'RV';
  return null;
}

/* ======================= Conduction system ======================= */
// Speeds in heart units per ms. Ratios follow Klabunde (atrial muscle ~0.5 m/s, AV node ~0.05,
// His and bundle branches ~2, Purkinje ~4). Ventricular muscle speed is a model choice.
// The His bundle segment has its own slower speed (v below): a model choice, because this heart is
// smaller than a real one, so it gives a normal His-to-ventricle time (about 40 ms) and PR (about 155 ms).
const CONDUCTION = {
  saTime: 50,
  sa: [-0.40, 0.60, 0.05],
  av: [-0.10, 0.06, -0.02],
  avDelay: 88,
  vAtrial: 0.018, vHis: 0.06, vVent: 0.015, vPurkinje: 0.08, vNetwork: 0.08, purkinjeJunction: 3, purkinjeTopY: -0.3,
  // Bachmann's bundle: a fast band from the RA, near the SA node, across the top of the interatrial groove to the LA
  vBachmann: 0.036,
  bachmann: { id: 'bach', label: "Bachmann's bundle", r: 0.03, pts: [[-0.36, 0.5, 0.3], [-0.12, 0.47, 0.32], [0.1, 0.44, 0.2], [0.35, 0.38, -0.05]] },
  // Internodal routes (anterior, middle and posterior; Guyton & Hall) from the SA node, through the right atrial wall and the
  // interatrial septum, to the AV node. Klabunde: only "some functional evidence" for them, and the atria conduct mainly
  // cell to cell. So they are drawn for anatomy, but timed by the atrial muscle around them (no extra speed): they do
  // not change the P wave or the PR interval.
  internodal: [
    { id: 'inA', label: 'Anterior internodal route', pts: [[-0.40, 0.60, 0.05], [-0.36, 0.50, 0.30], [-0.20, 0.34, 0.24], [-0.13, 0.18, 0.08], [-0.10, 0.06, -0.02]] },
    { id: 'inM', label: 'Middle internodal route', pts: [[-0.40, 0.60, 0.05], [-0.27, 0.46, -0.04], [-0.15, 0.26, -0.07], [-0.10, 0.06, -0.02]] },
    { id: 'inP', label: 'Posterior internodal route', pts: [[-0.40, 0.60, 0.05], [-0.58, 0.36, -0.02], [-0.46, 0.14, -0.12], [-0.24, 0.07, -0.09], [-0.10, 0.06, -0.02]] }
  ],
  // Landmarks (drawn only, not electrical). The AV node lies in Koch's triangle, near the opening
  // of the coronary sinus (Kurian et al. 2010). The fibrous AV ring at the valve plane (y = 0) insulates atria from
  // ventricles, so the only way through is the AV node and His bundle (Guyton & Hall); the element model already
  // never connects atrial and ventricular elements.
  csOstium: [-0.22, 0.03, -0.15],
  // His-Purkinje tree (heart-local units). The His bundle divides at the top of the muscular septum. The right and left
  // bundles then run close together down each side of the septum (about a septal wall's thickness apart) until about
  // two-thirds of the way to the apex. Only then does the right bundle reach the apex and the moderator band, and the
  // left anterior and posterior fascicles leave towards the papillary muscles. seedPts, when present, are the
  // subendocardial terminals used for activation (kept at the previous validated baseline); pts are what is drawn.
  // purkFromY: the segment feeds the muscle only below this level (the upper bundles are insulated).
  segments: [
    { id: 'his', label: 'Bundle of His', parent: 'avn', v: 0.009, r: 0.045, pts: [[-0.10, 0.06, -0.02], [-0.05, -0.04, 0.07], [0.0, -0.15, 0.15]] },
    { id: 'rbb', label: 'Right bundle branch', parent: 'his', r: 0.028, purk: 'RV', purkFromY: -0.95,
      seedPts: [[0.0, -0.15, 0.15], [-0.19, -0.27, 0.17], [-0.19, -0.75, 0.2], [-0.19, -1.15, 0.2]],
      pts: [[0.0, -0.15, 0.15], [-0.06, -0.24, 0.15], [-0.10, -0.40, 0.15], [-0.11, -0.80, 0.14], [-0.12, -1.20, 0.14]] },
    { id: 'rbbApex', label: 'Right bundle branch', parent: 'rbb', r: 0.026, purk: 'RV', purkFromY: 0, nolabel: true,
      seedPts: [[-0.19, -1.15, 0.2], [-0.21, -1.45, 0.16], [-0.338, -1.653, 0.12]],
      pts: [[-0.12, -1.20, 0.14], [-0.18, -1.45, 0.14], [-0.338, -1.653, 0.12]] },
    { id: 'mod', label: 'Moderator band', parent: 'rbb', r: 0.03, purk: 'RV', purkFromY: 0,
      seedPts: [[-0.19, -1.15, 0.2], [-0.45, -1.17, 0.29], [-0.77, -1.191, 0.377]],
      pts: [[-0.12, -1.20, 0.14], [-0.45, -1.20, 0.29], [-0.77, -1.191, 0.377]] },
    { id: 'lbb', label: 'Left bundle branch', parent: 'his', r: 0.05, purk: 'LV', purkFromY: -0.6,
      seedPts: [[0.0, -0.15, 0.15], [0.19, -0.26, 0.12], [0.19, -0.48, 0.08]],
      pts: [[0.0, -0.15, 0.15], [0.06, -0.24, 0.145], [0.10, -0.40, 0.14], [0.11, -0.48, 0.13]] },
    { id: 'lbb2', label: 'Left bundle branch', parent: 'lbb', r: 0.05, purk: 'LV', purkFromY: -1.10, nolabel: true,
      pts: [[0.11, -0.48, 0.13], [0.11, -0.80, 0.11], [0.12, -1.15, 0.10]] },
    { id: 'laf', label: 'Left anterior fascicle', parent: 'lbb', r: 0.03, purk: 'LV', purkFromY: -0.85,
      seedPts: [[0.19, -0.48, 0.08], [0.19, -0.78, 0.3], [0.434, -0.994, 0.423], [0.694, -1.133, 0.296]],
      pts: [[0.12, -1.15, 0.10], [0.25, -1.16, 0.30], [0.50, -1.15, 0.40], [0.694, -1.133, 0.296]] },
    { id: 'lpf', label: 'Left posterior fascicle', parent: 'lbb', r: 0.03, purk: 'LV', purkFromY: -0.85,
      seedPts: [[0.19, -0.48, 0.08], [0.19, -0.8, -0.25], [0.26, -1.063, -0.465], [0.438, -1.268, -0.393]],
      pts: [[0.12, -1.15, 0.10], [0.22, -1.20, -0.22], [0.32, -1.24, -0.38], [0.438, -1.268, -0.393]] },
    { id: 'lsf', label: 'Septal fibres', parent: 'lbb', r: 0.024, purk: 'LV', purkFromY: 0, nolabel: true, fibre: true,
      seedPts: [[0.19, -0.48, 0.08], [0.19, -1.0, 0.03], [0.19, -1.5, 0.0], [0.308, -1.861, -0.031]],
      pts: [[0.11, -0.48, 0.13], [0.16, -0.85, 0.08], [0.18, -1.35, 0.02], [0.308, -1.861, -0.031]] },
    // Purkinje fibres: from the apex and the fascicle ends, up the free walls towards the base (v = vPurkinje)
    { id: 'pLapex', parent: 'lsf', purk: 'LV', purkFromY: 0, fibre: true, pts: [[0.308, -1.861, -0.031], [0.552, -1.669, -0.027], [0.752, -1.267, -0.024]] },
    { id: 'pLapexP', parent: 'lsf', purk: 'LV', purkFromY: 0, fibre: true, pts: [[0.308, -1.861, -0.031], [0.37, -1.601, -0.33]] },
    { id: 'pLlat', parent: 'laf', purk: 'LV', purkFromY: 0, fibre: true, pts: [[0.694, -1.133, 0.296], [0.752, -0.792, 0.107], [0.754, -0.454, 0.036]] },
    { id: 'pLant', parent: 'laf', purk: 'LV', purkFromY: 0, fibre: true, pts: [[0.694, -1.133, 0.296], [0.432, -0.727, 0.424], [0.37, -0.384, 0.353]] },
    { id: 'pLpost', parent: 'lpf', purk: 'LV', purkFromY: 0, fibre: true, pts: [[0.438, -1.268, -0.393], [0.563, -0.792, -0.398], [0.436, -0.383, -0.394]] },
    { id: 'pRfw', parent: 'mod', purk: 'RV', purkFromY: 0, fibre: true, pts: [[-0.77, -1.191, 0.377], [-0.901, -0.725, 0.251], [-0.833, -0.317, 0.184]] },
    { id: 'pRant', parent: 'mod', purk: 'RV', purkFromY: 0, fibre: true, pts: [[-0.77, -1.191, 0.377], [-0.584, -0.721, 0.633], [-0.457, -0.317, 0.563]] },
    { id: 'pRapex', parent: 'rbbApex', purk: 'RV', purkFromY: 0, fibre: true, pts: [[-0.338, -1.653, 0.12], [-0.572, -1.527, -0.065]] }
  ],
  accessory: [] // e.g. { id: 'kent', atrial: [x,y,z], ventricular: [x,y,z], delay: 5 } (not used yet)
};
for (const s of CONDUCTION.segments) { s.blocked = false; s.extraDelay = 0; }

/* ======================= BASELINE: the one place to tune or break the normal heart =======================
   Every number that shapes the normal ECG lives here (or in SHAPES / CONDUCTION, which it references).
   Pathology modes should copy BASELINE, change a few fields, then call rebuildModel().
   orientation   rotY: twist about the long axis (LV behind, RV in front);
                 rotZ: degrees the long axis is swung towards the patient's left (frontal axis);
                 rotX: degrees the apex is tilted forwards (negative = apex anterior).
   conduction    CONDUCTION above: SA timing, AV delay, speeds, and the His-Purkinje segments
                 (each with blocked / extraDelay), plus accessory pathways.
   repolarisation  ventricular APD = apd0 - slope x (activation time - earliest activation);
                 slope > 1 means the last cells to depolarise are the first to repolarise;
                 anteriorShift / apicalShift shorten APD (ms per unit) towards the front / apex.
   smoothing     Gaussian widths (ms) applied to the P, QRS and T vector series.
   calibration   lead II peak targets (mV) used once, on the baseline, to scale the vector.
                 The scale factors are then frozen, so pathologies change amplitudes naturally.
   chestElectrodes  electrode positions for V1 to V6 (near-field model, see below).
   calibration.chestMaxR  target for the tallest chest-lead R wave (mV), set once on the baseline. */
const BASELINE = {
  shapes: SHAPES,
  orientation: { rotY: 35, rotZ: 15, rotX: -15 },
  conduction: CONDUCTION,
  repolarisation: { apd0: 300, slope: 1.4, atrialApd: 170, anteriorShift: 5, apicalShift: 0 },
  smoothing: { p: 16, qrs: 11, t: 22 },
  // Uniform 0.75 scale of the previous targets keeps axis and morphology, and brings
  // Sokolow-Lyon (SV1 + max(RV5, RV6)) into a clearly normal 20 to 25 mm range.
  calibration: { qrsIIpeak: 0.9, pIIpeak: 0.12, tIIpeak: 0.225, chestMaxR: 0.975 },
  // Chest electrodes (body coordinates, heart centre = origin, about 4 cm per unit). They see the
  // heart from close up, so V1 to V6 are computed from every element's local dipole at the
  // electrode (near field), not from the single mean vector. Positions are schematic.
  chestElectrodes: {
    V1: [-1.1, 0.45, 2.8], V2: [0.45, 0.4, 2.5], V3: [1.3, -0.1, 2.05],
    V4: [1.9, -0.6, 1.75], V5: [2.5, -0.6, 1.05], V6: [3.2, -0.6, -0.1]
  }
};

/* ======================= Heart placement in the body ======================= */
const HEART_M = new THREE.Matrix4();
(function () {
  const rz = new THREE.Matrix4().makeRotationZ(BASELINE.orientation.rotZ * DEG);   // apex swings to the patient's left
  const rx = new THREE.Matrix4().makeRotationX(BASELINE.orientation.rotX * DEG);  // and forwards
  const ry = new THREE.Matrix4().makeRotationY((BASELINE.orientation.rotY || 0) * DEG); // twist about the long axis: LV behind, RV in front
  HEART_M.multiplyMatrices(rx, rz).multiply(ry);
  const c = new THREE.Vector3(0, -0.7, 0).applyMatrix4(HEART_M);
  HEART_M.setPosition(-c.x, -c.y, -c.z);
})();
const HEART_R = new THREE.Matrix3().setFromMatrix4(HEART_M);
function toBody(p) { const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(HEART_M); return [v.x, v.y, v.z]; }
function dirToBody(d) { const v = new THREE.Vector3(d[0], d[1], d[2]).applyMatrix3(HEART_R); return [v.x, v.y, v.z]; }

/* ======================= Muscle elements (voxels) ======================= */
const H = 0.07, GX0 = -1.3, GY0 = -2.4, GZ0 = -1.0, NX = 37, NY = 50, NZ = 29;
const gridIdx = (i, j, k) => (k * NY + j) * NX + i;
const cellRegion = new Array(NX * NY * NZ);
const elemOfCell = new Int32Array(NX * NY * NZ).fill(-1);
const ELEM = { pos: [], cell: [], region: [], domain: [] }; // domain 0 atria, 1 ventricles
for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const p = [GX0 + i * H, GY0 + j * H, GZ0 + k * H];
  const r = regionOf(p); const g = gridIdx(i, j, k); cellRegion[g] = r;
  if (r === 'S' || r === 'LV' || r === 'RV' || r === 'RA' || r === 'LA') {
    elemOfCell[g] = ELEM.pos.length; ELEM.pos.push(p); ELEM.cell.push([i, j, k]); ELEM.region.push(r);
    ELEM.domain.push(r === 'RA' || r === 'LA' ? 0 : 1);
  }
}
const NE = ELEM.pos.length;
const ELEM_BODY = ELEM.pos.map(toBody);
const NEIGH = []; // [elementIndex, distance]
const endoLV = [], endoRV = [];
for (let e = 0; e < NE; e++) {
  const [i, j, k] = ELEM.cell[e]; const list = []; let nearLVc = false, nearRVc = false;
  for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (!di && !dj && !dk) continue;
    const a = i + di, b = j + dj, c = k + dk; if (a < 0 || b < 0 || c < 0 || a >= NX || b >= NY || c >= NZ) continue;
    const g = gridIdx(a, b, c); const n = elemOfCell[g];
    if (cellRegion[g] === 'LVc') nearLVc = true; if (cellRegion[g] === 'RVc') nearRVc = true;
    if (n >= 0 && ELEM.domain[n] === ELEM.domain[e]) list.push([n, H * Math.hypot(di, dj, dk)]);
  }
  NEIGH.push(list);
  if (ELEM.domain[e] === 1 && nearLVc) endoLV.push(e);
  if (ELEM.domain[e] === 1 && nearRVc) endoRV.push(e);
}
function nearestElem(p, domain) {
  let best = -1, bd = 1e9;
  for (let e = 0; e < NE; e++) { if (ELEM.domain[e] !== domain) continue; const q = ELEM.pos[e]; const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}

/* Binary-heap Dijkstra over elements */
function propagate(act, seeds, speed) {
  const heap = []; const push = (t, e) => { heap.push([t, e]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const [e, t] of seeds) if (t < act[e]) { act[e] = t; push(t, e); }
  while (heap.length) {
    const [t, e] = pop(); if (t > act[e]) continue;
    for (const [n, d] of NEIGH[e]) { const tn = t + d / speed; if (tn < act[n]) { act[n] = tn; push(tn, n); } }
  }
}

const IS_ENDO_LV = new Uint8Array(NE), IS_ENDO_RV = new Uint8Array(NE);
for (const e of endoLV) IS_ENDO_LV[e] = 1; for (const e of endoRV) IS_ENDO_RV[e] = 1;
function nearestIn(p, list) { let best = -1, bd = 1e9; for (const e of list) { const q = ELEM.pos[e]; const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2; if (d < bd) { bd = d; best = e; } } return best; }
/* Dijkstra restricted to one surface (mask) and below a height: the Purkinje network on the endocardium */
function propagateOn(act, seeds, speed, mask, topY) {
  const heap = []; const push = (t, e) => { heap.push([t, e]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const [e, t] of seeds) if (t < act[e]) { act[e] = t; push(t, e); }
  while (heap.length) {
    const [t, e] = pop(); if (t > act[e]) continue;
    for (const [n, d] of NEIGH[e]) { if (!mask[n] || ELEM.pos[n][1] > topY) continue; const tn = t + d / speed; if (tn < act[n]) { act[n] = tn; push(tn, n); } }
  }
}
/* Polyline helpers */
function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); return L; }
function polySample(pts, step) { // [{p, s}] with arc length s
  const out = []; let s0 = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const n = Math.max(1, Math.ceil(L / step));
    for (let k = (i === 1 ? 0 : 1); k <= n; k++) { const f = k / n; out.push({ p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], s: s0 + L * f }); }
    s0 += L;
  }
  return out;
}

/* ======================= Activation model ======================= */
const SA_ELEM = nearestElem(CONDUCTION.sa, 0), AV_ELEM = nearestElem(CONDUCTION.av, 0);
const BACH = CONDUCTION.bachmann ? { a: nearestElem(CONDUCTION.bachmann.pts[0], 0), b: nearestElem(CONDUCTION.bachmann.pts[CONDUCTION.bachmann.pts.length - 1], 0), len: polyLen(CONDUCTION.bachmann.pts) } : null;
let MODEL = null, CAL = null;
function computeModel() {
  const C = CONDUCTION;
  const act = new Float64Array(NE).fill(Infinity);
  // 1. Atria: cell-to-cell spread from the SA node
  const atrialAct = act; propagate(atrialAct, [[SA_ELEM, C.saTime]], C.vAtrial);
  // Bachmann's bundle: picks up the impulse in the RA and delivers it to the LA early; the atria then finish cell to cell
  const seg = {};
  if (BACH && !C.bachmann.blocked) { const t0 = atrialAct[BACH.a]; seg.bach = { start: t0, end: t0 + BACH.len / C.vBachmann, len: BACH.len, v: C.vBachmann }; propagate(atrialAct, [[BACH.b, seg.bach.end]], C.vAtrial); }
  const tAV = atrialAct[AV_ELEM];
  // 2. AV node delay, then the His-Purkinje tree
  const tHis = (C.avBlocked ? Infinity : tAV + C.avDelay + (C.avExtra || 0));
  for (const s of C.segments) {
    const parentEnd = s.parent === 'avn' ? tHis : (seg[s.parent] ? seg[s.parent].end : Infinity);
    const start = s.blocked ? Infinity : parentEnd + (s.extraDelay || 0);
    const len = polyLen(s.seedPts || s.pts);
    const v = s.v || (s.fibre ? C.vPurkinje : C.vHis); seg[s.id] = { start, end: start + len / v, len, v };
  }
  // 3. Purkinje terminals on the endocardium: earliest arrival from any source point
  const seeds = [];
  const sources = { LV: [], RV: [] };
  for (const s of C.segments) {
    if (!s.purk) continue; const sg = seg[s.id]; if (!isFinite(sg.start)) continue;
    const path = s.seedPts || s.pts;
    for (const q of polySample(path, 0.05)) if (q.p[1] <= s.purkFromY) sources[s.purk].push([q.p, sg.start + q.s / sg.v]);
  }
  // The Purkinje network spreads over the endocardial surface (never across a cavity) from the drawn fibres,
  // only below purkinjeTopY (the bases have few Purkinje fibres). Muscle then activates from these terminals.
  for (const [list, side] of [[endoLV, 'LV'], [endoRV, 'RV']]) {
    if (!sources[side].length) continue;
    const net = new Float64Array(NE).fill(Infinity), netSeeds = [];
    for (const [q, t] of sources[side]) { const e = nearestIn(q, list); if (e >= 0) netSeeds.push([e, t + Math.hypot(...ELEM.pos[e].map((v, i) => v - q[i])) / C.vPurkinje]); }
    propagateOn(net, netSeeds, C.vNetwork || C.vPurkinje, side === 'LV' ? IS_ENDO_LV : IS_ENDO_RV, C.purkinjeTopY);
    for (const e of list) if (isFinite(net[e])) seeds.push([e, net[e] + C.purkinjeJunction]);
  }
  for (const a of C.accessory) { if (a.blocked) continue; const ea = nearestElem(a.atrial, 0), ev = nearestElem(a.ventricular, 1); seeds.push([ev, atrialAct[ea] + (a.delay || 0)]); }
  // 4. Ventricular muscle: cell-to-cell from the Purkinje terminals (endocardium to epicardium)
  propagate(act, seeds, C.vVent);
  // 5. Recovery: last to depolarise are first to repolarise (APD shortens with later activation)
  let vMin = Infinity, vMax = -Infinity, aMax = -Infinity;
  for (let e = 0; e < NE; e++) { const a = act[e]; if (!isFinite(a)) continue; if (ELEM.domain[e]) { vMin = Math.min(vMin, a); vMax = Math.max(vMax, a); } else aMax = Math.max(aMax, a); }
  const rec = new Float64Array(NE);
  for (let e = 0; e < NE; e++) {
    const a = act[e]; if (!isFinite(a)) { rec[e] = Infinity; continue; }
    const RP = BASELINE.repolarisation; rec[e] = ELEM.domain[e] ? a + RP.apd0 - RP.slope * (a - vMin) - (RP.anteriorShift || 0) * ELEM_BODY[e][2] - (RP.apicalShift || 0) * (-ELEM_BODY[e][1]) : a + RP.atrialApd;
  }
  // 6. Mean electrical vector: each element adds its wavefront direction as the front passes
  const N = BEAT_MS + 1; const Dq = new Float64Array(N * 3), Dp = new Float64Array(N * 3), Dt = new Float64Array(N * 3);
  const CH = Object.entries(BASELINE.chestElectrodes);
  const Cq = CH.map(() => new Float64Array(N)), Cp = CH.map(() => new Float64Array(N)), Ct = CH.map(() => new Float64Array(N));
  const addS = (arr, t, v) => { if (!isFinite(t) || t < 0 || t >= BEAT_MS) return; const i = Math.floor(t), f = t - i; arr[i] += v * (1 - f); arr[i + 1] += v * f; };
  const near = (dirB, pb, E) => { const r = [E[0] - pb[0], E[1] - pb[1], E[2] - pb[2]]; const L = Math.hypot(...r); return dot(dirB, r) / (L * L * L); };
  const addBin = (arr, t, v) => { if (!isFinite(t) || t < 0 || t >= BEAT_MS) return; const i = Math.floor(t), f = t - i; for (let c = 0; c < 3; c++) { arr[i * 3 + c] += v[c] * (1 - f); arr[(i + 1) * 3 + c] += v[c] * f; } };
  for (let e = 0; e < NE; e++) {
    if (!isFinite(act[e])) continue; const p = ELEM.pos[e];
    let g = [0, 0, 0], r = [0, 0, 0];
    for (const [n, d] of NEIGH[e]) {
      if (!isFinite(act[n])) continue; const q = ELEM.pos[n]; const w = 1 / (d * d);
      for (let c = 0; c < 3; c++) { g[c] += (act[n] - act[e]) * (q[c] - p[c]) * w; r[c] += (rec[n] - rec[e]) * (q[c] - p[c]) * w; }
    }
    const gl = Math.hypot(...g), rl = Math.hypot(...r);
    const pb = ELEM_BODY[e];
    if (gl > 1e-9) { const gb = dirToBody([g[0] / gl, g[1] / gl, g[2] / gl]); addBin(ELEM.domain[e] ? Dq : Dp, act[e], gb);
      CH.forEach(([, E], k) => addS((ELEM.domain[e] ? Cq : Cp)[k], act[e], near(gb, pb, E))); }
    if (ELEM.domain[e] && rl > 1e-9) { const rb = dirToBody([-r[0] / rl, -r[1] / rl, -r[2] / rl]); addBin(Dt, rec[e], rb);
      CH.forEach(([, E], k) => addS(Ct[k], rec[e], near(rb, pb, E))); }
  }
  const smoothArr = (arr, sigma) => {
    const out = new Float64Array(arr.length); const R = Math.ceil(sigma * 3); const k = []; let ks = 0;
    for (let i = -R; i <= R; i++) { const v = Math.exp(-0.5 * (i / sigma) ** 2); k.push(v); ks += v; }
    for (let t = 0; t < N; t++) for (let c = 0; c < 3; c++) { let s = 0; for (let i = -R; i <= R; i++) { const tt = t + i; if (tt >= 0 && tt < N) s += arr[tt * 3 + c] * k[i + R]; } out[t * 3 + c] = s / ks; }
    return out;
  };
  const SM = BASELINE.smoothing; const Sq = smoothArr(Dq, SM.qrs), Sp = smoothArr(Dp, SM.p), St = smoothArr(Dt, SM.t);
  const smooth1 = (arr, sigma) => { const tmp = new Float64Array(arr.length * 3); for (let i = 0; i < arr.length; i++) tmp[i * 3] = arr[i]; const o = smoothArr(tmp, sigma); const out = new Float64Array(arr.length); for (let i = 0; i < arr.length; i++) out[i] = o[i * 3]; return out; };
  const SCq = Cq.map(a => smooth1(a, SM.qrs)), SCp = Cp.map(a => smooth1(a, SM.p)), SCt = Ct.map(a => smooth1(a, SM.t));
  const leadII = LEADS.find(l => l.id === 'II');
  const peak = (arr, a, b) => { let m = 0; for (let t = Math.max(0, Math.floor(a)); t < Math.min(N, b); t++) m = Math.max(m, dot([arr[t * 3], arr[t * 3 + 1], arr[t * 3 + 2]], leadII.dir)); return m || 1; };
  const CB = BASELINE.calibration; if (!CAL) CAL = { q: CB.qrsIIpeak / peak(Sq, vMin - 5, vMax + 15), p: CB.pIIpeak / peak(Sp, 0, aMax + 20), t: CB.tIIpeak / peak(St, vMax, BEAT_MS) };
  if (!CAL.c) { // chest scale: tallest chest R wave and the same P, QRS and T balance as the limb leads
    let m = 0; for (const a of SCq) for (let t = 0; t < N; t++) m = Math.max(m, a[t]);
    const pr = (S, a, b) => { let x = 0; for (let t = Math.floor(a); t < b; t++) x = Math.max(x, dot([S[t * 3], S[t * 3 + 1], S[t * 3 + 2]], LEADS.find(l => l.id === 'II').dir)); return x || 1; };
    CAL.c = CB.chestMaxR / m; CAL.cp = CAL.c * (CAL.p * pr(Sp, 0, aMax + 20)) / (CAL.q * pr(Sq, vMin - 5, vMax + 15)); CAL.ct = CAL.c * (CAL.t * pr(St, vMax, BEAT_MS)) / (CAL.q * pr(Sq, vMin - 5, vMax + 15));
  }
  const chest = {}; CH.forEach(([id], k) => { const a = new Float32Array(N); for (let t = 0; t < N; t++) a[t] = CAL.c * SCq[k][t] + CAL.cp * SCp[k][t] + CAL.ct * SCt[k][t]; chest[id] = a; });
  const D = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) D[i] = CAL.q * Sq[i] + CAL.p * Sp[i] + CAL.t * St[i];
  let recMin = Infinity, recMax = -Infinity; for (let e = 0; e < NE; e++) if (ELEM.domain[e] && isFinite(rec[e])) { recMin = Math.min(recMin, rec[e]); recMax = Math.max(recMax, rec[e]); }
  return { act, rec, seg, tAV, tHis, atrialEnd: aMax, vMin, vMax, recMin, recMax, D, chest };
}
function dipole(t) { // linear interpolation between 1 ms samples, so very slow playback moves smoothly
  const tc = Math.max(0, Math.min(BEAT_MS, t)), i0 = Math.min(BEAT_MS - 1, Math.floor(tc)), f = tc - i0, D = MODEL.D, a = i0 * 3, b = a + 3;
  return [D[a] + (D[b] - D[a]) * f, D[a + 1] + (D[b + 1] - D[a + 1]) * f, D[a + 2] + (D[b + 2] - D[a + 2]) * f]; }

/* ======================= Leads ======================= */
function frontal(th) { return [Math.cos(th * DEG), -Math.sin(th * DEG), 0]; }   // hexaxial: +90 points down
function transverse(ph) { return [Math.cos(ph * DEG), 0, Math.sin(ph * DEG)]; } // 0 = left, 90 = anterior
const LEADS = [
  { id: 'I',   type: 'limb',  dir: frontal(0),    gain: 1,     angle: '0°',    region: 'lateral',  view: 'Lateral' },
  { id: 'II',  type: 'limb',  dir: frontal(60),   gain: 1,     angle: '+60°',  region: 'inferior', view: 'Inferior' },
  { id: 'III', type: 'limb',  dir: frontal(120),  gain: 1,     angle: '+120°', region: 'inferior', view: 'Inferior' },
  { id: 'aVR', type: 'limb',  dir: frontal(-150), gain: 0.866, angle: '-150°', region: null,       view: 'None' },
  { id: 'aVL', type: 'limb',  dir: frontal(-30),  gain: 0.866, angle: '-30°',  region: 'lateral',  view: 'Lateral' },
  { id: 'aVF', type: 'limb',  dir: frontal(90),   gain: 0.866, angle: '+90°',  region: 'inferior', view: 'Inferior' },
  { id: 'V1',  type: 'chest', dir: unit(...BASELINE.chestElectrodes.V1), gain: 1, region: 'septal',   view: 'Septal',   pos: '4th intercostal space, right sternal edge' },
  { id: 'V2',  type: 'chest', dir: unit(...BASELINE.chestElectrodes.V2),  gain: 1, region: 'septal',   view: 'Septal',   pos: '4th intercostal space, left sternal edge' },
  { id: 'V3',  type: 'chest', dir: unit(...BASELINE.chestElectrodes.V3),  gain: 1, region: 'anterior', view: 'Anterior', pos: 'midway between V2 and V4' },
  { id: 'V4',  type: 'chest', dir: unit(...BASELINE.chestElectrodes.V4),  gain: 1, region: 'anterior', view: 'Anterior', pos: '5th intercostal space, mid-clavicular line' },
  { id: 'V5',  type: 'chest', dir: unit(...BASELINE.chestElectrodes.V5),  gain: 1, region: 'lateral',  view: 'Lateral',  pos: '5th intercostal space, anterior axillary line' },
  { id: 'V6',  type: 'chest', dir: unit(...BASELINE.chestElectrodes.V6),   gain: 1, region: 'lateral',  view: 'Lateral',  pos: '5th intercostal space, mid-axillary line' }
];
const LEAD = Object.fromEntries(LEADS.map(l => [l.id, l]));
const REGION_TEXT = {
  inferior: 'the inferior wall', lateral: 'the lateral wall of the left ventricle', septal: 'the interventricular septum', anterior: 'the anterior wall',
  null: 'no wall group in this model: aVR is not in the inferior, lateral or anterior lead groups'
};
let TRACE = {};
function buildTraces() {
  TRACE = {};
  for (const L of LEADS) { const a = new Float32Array(BEAT_MS + 1); for (let t = 0; t <= BEAT_MS; t++) a[t] = L.type === 'chest' ? MODEL.chest[L.id][t] : L.gain * dot(dipole(t), L.dir); TRACE[L.id] = a; }
  INTERVALS = measureIntervals();
}
/* Intervals from the global activity in all 12 leads (the same rule as the validation script) */
let INTERVALS = null;
function measureIntervals() {
  const act = t => { let m = 0; for (const L of LEADS) m = Math.max(m, Math.abs(TRACE[L.id][t])); return m; };
  let pOn = 0; for (let t = 0; t < 300; t++) if (act(t) > 0.02) { pOn = t; break; }
  let pOff = pOn; for (let t = pOn; t < Math.min(MODEL.vMin - 5, MODEL.atrialEnd + 30); t++) if (act(t) > 0.02) pOff = t;
  let qOn = Math.round(MODEL.vMin); for (let t = pOff + 5; t < MODEL.vMax; t++) if (act(t) > 0.03) { qOn = t; break; }
  let qOff = qOn; for (let t = qOn; t < qOn + 200; t++) if (act(t) > 0.04) qOff = t; else if (t > MODEL.vMax + 3) break;
  let tEnd = qOff; for (let t = BEAT_MS - 1; t > qOff; t--) if (act(t) > 0.02) { tEnd = t; break; }
  return { pOn, pOff, qOn, qOff, tEnd, P: pOff - pOn, PR: qOn - pOn, QRS: qOff - qOn, QT: tEnd - qOn };
}

/* ======================= Phases (from the computed timings) ======================= */
let PHASES = [], STEPS = [];
function buildPhases() {
  const M = MODEL, C = CONDUCTION; const r = Math.round;
  const qrsOn = M.vMin, qrsOff = M.vMax + 6, tOn = M.recMin - 40, tOff = Math.min(BEAT_MS - 20, M.recMax + 50);
  // Guided steps: each phase with a `step` is a chip; `at` is the moment the step jumps to. Text: one or two sentences.
  const hisMid = (M.seg.his.start + M.seg.his.end) / 2;
  PHASES = [
    { key: 'rest', from: 0, to: C.saTime, title: 'Resting',
      text: 'All muscle is at rest, so there is no arrow and every lead is flat.' },
    { key: 'P', step: 'SA node and atria', at: Math.round((C.saTime + M.atrialEnd) / 2), from: C.saTime, to: M.atrialEnd + 8,
      title: 'P wave: the atria depolarise',
      text: 'The SA node, where the superior vena cava joins the right atrium, fires. The wave spreads slowly through both atria, cell to cell (orange hatching), past the internodal routes to the AV node, and a faster band (Bachmann\'s bundle, blue) carries it across to the left atrium. The arrow points down and to the left, so P is upright in II.' },
    { key: 'avd', step: 'AV node delay', at: Math.round((M.atrialEnd + 8 + M.tHis) / 2), from: M.atrialEnd + 8, to: M.tHis,
      title: 'PR segment: AV node delay',
      text: `The AV node, low in the interatrial septum near the opening of the coronary sinus, holds the impulse for about ${r(M.tHis - M.tAV)} ms (the filling ring). The line is flat while the atria finish contracting.` },
    { key: 'his', step: 'His and bundles', at: Math.round(hisMid), from: M.tHis, to: qrsOn,
      title: 'PR segment: His bundle and bundle branches',
      text: 'The fast route: a blue streak with a white head runs along the His bundle, the only way through the fibrous AV ring, then down the bundle branches on each side of the septum. These fibres are too small to show on the ECG, so the line is still flat.' },
    { key: 'sep', step: 'Septum', at: Math.round(qrsOn + 8), from: qrsOn, to: qrsOn + 16,
      title: 'Start of QRS: the septum',
      text: 'The septum depolarises first, from left to right, so the small early arrow points right. Left-sided leads such as I and V6 show a small q wave.' },
    { key: 'main', step: 'Ventricles (QRS)', at: Math.round(qrsOn + 40), from: qrsOn + 16, to: qrsOff,
      title: 'QRS: the ventricles depolarise',
      text: 'Purkinje fibres (blue) carry the impulse fast over the inner walls; the muscle then depolarises slowly, cell to cell, from the inner wall outwards (orange hatching). The big arrow points down and left, towards II, and its shadow on the lead (striped bar) is long, so II shows a tall R wave.' },
    { key: 'ST', step: 'ST segment', at: Math.round((qrsOff + tOn) / 2), from: qrsOff, to: tOn,
      title: 'ST segment',
      text: 'All ventricular muscle is depolarised (blue dots), so there is no arrow and the line is flat.' },
    { key: 'T', step: 'T wave', at: Math.round((M.recMin + M.recMax) / 2 - 10), from: tOn, to: tOff,
      title: 'T wave: the ventricles repolarise',
      text: 'The grey dashes show muscle recovering, outside first. Recovery moving away from a lead gives an upright T, so T is upright in II.' },
    { key: 'TP', from: tOff, to: BEAT_MS + 1, title: 'Diastole',
      text: 'The heart is at rest until the SA node fires again.' }
  ];
  STEPS = PHASES.filter(p => p.step);
  const box = $('stepChips'); box.innerHTML = '';
  STEPS.forEach((p, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 't-btn step-chip'; b.dataset.step = i;
    b.innerHTML = `<span class="step-n" aria-hidden="true">${i + 1}</span> ${p.step}`; b.setAttribute('aria-label', `Step ${i + 1}: ${p.step}`);
    b.addEventListener('click', () => goStep(i)); box.appendChild(b);
  });
  // timeline bands
  const strip = $('phaseStrip'); strip.innerHTML = '';
  for (const [a, b, l] of [[C.saTime, M.atrialEnd + 8, 'P'], [M.tHis, M.tHis + 0.01, ''], [qrsOn, qrsOff, 'QRS'], [tOn, tOff, 'T']]) {
    if (!l) continue; const s = document.createElement('span'); s.className = 'ps-seg';
    s.style.left = (a / 8) + '%'; s.style.width = ((b - a) / 8) + '%'; s.textContent = l; strip.appendChild(s);
  }
  const avs = document.createElement('span'); avs.className = 'ps-seg ps-av';
  avs.style.left = (M.tAV / 8) + '%'; avs.style.width = ((M.tHis - M.tAV) / 8) + '%'; avs.textContent = 'AV'; avs.title = 'AV node delay'; strip.appendChild(avs);
}
function phaseAt(t) {
  const tUse = Math.max(0, Math.min(BEAT_MS, t));
  return PHASES.find(p => tUse >= p.from && tUse < p.to) || PHASES[PHASES.length - 1];
}

/* ======================= State ======================= */
const state = { t: 250, playing: false, speed: 0.1, sel: 'II', sels: ['II'], view: 'frontal', beat: 0, simTime: 250 };
const scrub = $('scrub'), timeOut = $('timeOut'), playBtn = $('playBtn'), speedSel = $('speed');

/* ======================= ECG paper (12-lead and selected-lead strip) ======================= */
// 25 mm/s and 10 mm/mV: 1 small square = 1 mm = 40 ms = 0.1 mV.
const MM_PER_MS = 25 / 1000, MM_PER_MV = 10;
const ONE_SCREEN = window.matchMedia('(min-width: 960px) and (min-height: 600px)');
const ECG = { calW: 8, colMs: 2400, rowH: 30, base: 17, top: 2 };
const PAGE_MS = 9600; // 9.6 s rhythm strip (12 beats = 4 x 2.4 s columns); exact beat multiples so traces never jump
const MINI_MS = 5000;
const CLOSEUP_MS = 4 * BEAT_MS; // 3.2 s (4 beats) shared across every close-up strip
const CLOSEUP_LEFT_MM = 2, CLOSEUP_RIGHT_MM = 1;
const CLOSEUP_WMM = CLOSEUP_LEFT_MM + CLOSEUP_MS * MM_PER_MS + CLOSEUP_RIGHT_MM;
const SWEEP_GAP_MM = 2.0; // unused: printed laps draw only behind the cursor, with no erase gap
const ZOOM_MS = 2 * BEAT_MS;
const LAYOUT = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];
function wrapPeriod(t, period) {
  let x = t % period;
  if (x < 0) x += period;
  return x;
}
function windowStart(tAbs, windowMs) { return Math.floor(tAbs / windowMs) * windowMs; }
function pageTime() { return state.simTime; }
const ecgCanvas = $('ecg12'), miniCanvas = $('miniStrip');
function prepCanvas(cv, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) { cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return g;
}
function drawPaper(g, wmm, hmm, px) {
  g.fillStyle = '#FFFDFC'; g.fillRect(0, 0, wmm * px, hmm * px);
  for (const [step, col, lw] of [[1, PAPER.minor, 0.6], [5, PAPER.major, 1]]) {
    g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
    for (let x = 0; x <= wmm + 0.01; x += step) { const X = Math.round(x * px) + 0.5; g.moveTo(X, 0); g.lineTo(X, hmm * px); }
    for (let y = 0; y <= hmm + 0.01; y += step) { const Y = Math.round(y * px) + 0.5; g.moveTo(0, Y); g.lineTo(wmm * px, Y); }
    g.stroke();
  }
}
// Chest columns stay at half gain unless a later check shows a full 10 mm/mV sheet fits without row overlap.
const SHEET_CHEST_MM = 5;
function sheetMmPerMv(id) {
  const key = id === 'II-rhythm' ? 'II' : id;
  return (LEAD[key] && LEAD[key].type === 'chest') ? SHEET_CHEST_MM : MM_PER_MV;
}
function drawCal(g, x0mm, basemm, px, heightMm) { // 1 mV, 200 ms pulse; height 10 mm at 10 mm/mV, 5 mm at half gain
  const h = heightMm == null ? 10 : heightMm;
  g.strokeStyle = PAPER.trace; g.lineWidth = 1.4; g.beginPath();
  g.moveTo(x0mm * px, basemm * px); g.lineTo((x0mm + 1) * px, basemm * px); g.lineTo((x0mm + 1) * px, (basemm - h) * px);
  g.lineTo((x0mm + 6) * px, (basemm - h) * px); g.lineTo((x0mm + 6) * px, basemm * px); g.lineTo((x0mm + 7) * px, basemm * px); g.stroke();
}
function morphAt(id, tBeat) {
  const T = TRACE[id];
  if (!T || !T.length) return 0;
  const tc = Math.max(0, Math.min(BEAT_MS, tBeat));
  const i = Math.min(BEAT_MS - 1, Math.floor(tc));
  const f = tc - i;
  return T[i] + (T[i + 1] - T[i]) * f;
}
/* One shared recording for every view: 12 leads on one clock, seeded and deterministic. */
const REC = {
  seed: 439001,
  rr0: BEAT_MS,
  rsaAmp: 0.04,
  rsaMs: 4000,
  wanderMv: 0.03,
  wanderMs: 11000,
  jitter: 0.005,
  starts: [0],
  ready: false
};
function recRand(beatIndex) {
  let a = (REC.seed + Math.imul(beatIndex, 1013904223)) | 0;
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function nextRR(t0, beatIndex) {
  const rsa = REC.rsaAmp * Math.sin(2 * Math.PI * t0 / REC.rsaMs);
  const jit = (recRand(beatIndex) - 0.5) * 2 * REC.jitter;
  return Math.max(600, Math.min(1000, REC.rr0 * (1 + rsa + jit)));
}
function ensureBeatsUntil(tMs) {
  const until = Math.max(0, tMs) + 4000;
  while (REC.starts[REC.starts.length - 1] <= until) {
    const i = REC.starts.length - 1;
    REC.starts.push(REC.starts[i] + nextRR(REC.starts[i], i));
  }
}
function beatIndexAt(tMs) {
  const t = Math.max(0, tMs);
  ensureBeatsUntil(t);
  let lo = 0, hi = REC.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (REC.starts[mid] <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}
function wanderAt(id, tMs) {
  const L = LEAD[id === 'II-rhythm' ? 'II' : id];
  const scale = L && L.type === 'chest' ? 0.8 : 1;
  const phase = (REC.seed % 360) * Math.PI / 180;
  return REC.wanderMv * scale * Math.sin(2 * Math.PI * tMs / REC.wanderMs + phase);
}
function sampleRecording(id, tMs) {
  const key = id === 'II-rhythm' ? 'II' : id;
  if (tMs < 0) return wanderAt(key, tMs);
  const i = beatIndexAt(tMs);
  const tRel = tMs - REC.starts[i];
  let v = 0;
  if (tRel >= 0 && tRel <= BEAT_MS) v = morphAt(key, tRel);
  return v + wanderAt(key, tMs);
}
function sampleLead(id, tMs) { return sampleRecording(id, tMs); }
function initRecording() {
  REC.starts = [0];
  ensureBeatsUntil(PAGE_MS * 8);
  REC.ready = true;
}
function drawSeg(g, id, t0, t1, xStartMm, basemm, px, bold, lw, mmPerMv) {
  if (t1 <= t0) return;
  const mm = mmPerMv == null ? MM_PER_MV : mmPerMv;
  g.strokeStyle = PAPER.trace; g.lineWidth = lw || (bold ? 2.3 : 1.3); g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
  const xAt = t => (xStartMm + (t - t0) * MM_PER_MS) * px;
  const yAt = t => (basemm - sampleRecording(id, t) * mm) * px;
  g.moveTo(xAt(t0), yAt(t0));
  const firstInt = Math.floor(t0) + 1;
  for (let t = firstInt; t < t1; t += 1) {
    g.lineTo(xAt(t), yAt(t));
  }
  g.lineTo(xAt(t1), yAt(t1));
  g.stroke();
}
function drawSweepSeg(g, id, tWin0, winMs, tAbs, xStartMm, basemm, px, bold, lw, mmPerMv) {
  // Printed-style lap: blank paper, then the trace draws in behind the cursor. No erase gap, no leftover from the previous lap.
  const tInWin = Math.max(0, Math.min(winMs, tAbs - tWin0));
  if (tInWin > 0) drawSeg(g, id, tWin0, tWin0 + tInWin, xStartMm, basemm, px, bold, lw, mmPerMv);
}
function drawPageCol(g, id, tCol0, tAbs, xStartMm, basemm, px, bold, lw, mmPerMv) {
  drawSweepSeg(g, id, tCol0, ECG.colMs, tAbs, xStartMm, basemm, px, bold, lw, mmPerMv);
}
function traceAt(id, t) { return sampleRecording(id, t); }
function cursorAt(g, id, tAbs, xStartMm, tStart, basemm, topmm, hmm, px, mmPerMv, dotClamp) {
  const x = (xStartMm + (tAbs - tStart) * MM_PER_MS) * px;
  const y0 = topmm * px, y1 = (topmm + hmm) * px;
  const mm = mmPerMv == null ? MM_PER_MV : mmPerMv;
  g.lineCap = 'butt';
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
  g.strokeStyle = PAPER.cursor; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
  const ts = Math.max(6, Math.min(9, 1.8 * px));
  g.fillStyle = PAPER.cursor;
  g.beginPath();
  g.moveTo(x, y0 + ts);
  g.lineTo(x - ts, y0);
  g.lineTo(x + ts, y0);
  g.closePath();
  g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
  const v = sampleRecording(id, tAbs);
  let y = (basemm - v * mm) * px;
  // Follow the wave so a deep peak is not pinned to a flat clip edge.
  if (dotClamp && dotClamp.unclamped) {
    if (dotClamp.top != null) y = Math.max(dotClamp.top, y);
    if (dotClamp.bot != null) y = Math.min(dotClamp.bot, y);
  } else {
    const loY = dotClamp ? dotClamp.top : (y0 + ts);
    const hiY = dotClamp ? dotClamp.bot : (y1 - 2);
    y = Math.max(loY, Math.min(hiY, y));
  }
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 4.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = PAPER.cursor; g.beginPath(); g.arc(x, y, 2.8, 0, Math.PI * 2); g.fill();
}
function label(g, text, xmm, ymm, px, selected) {
  g.font = `${selected ? 800 : 700} ${Math.max(11, 3.6 * px)}px "Source Sans 3", Arial, sans-serif`;
  const w = g.measureText(text).width;
  const fs = Math.max(11, 3.6 * px);
  if (selected) { g.fillStyle = '#111'; g.fillRect(xmm * px - 3, ymm * px - fs, w + 6, fs + 3); g.fillStyle = '#fff'; }
  else g.fillStyle = '#111';
  g.fillText(text, xmm * px, ymm * px);
}
function sheetWavePad(rowH) {
  let overUp = 0, overDown = 0;
  for (const L of LEADS) {
    const baseOff = cellBaseline(L.id, rowH);
    const mm = sheetMmPerMv(L.id);
    const e = leadExtrema(L.id);
    overUp = Math.max(overUp, e.hi * mm - baseOff);
    overDown = Math.max(overDown, Math.max(0, -e.lo) * mm - (rowH - baseOff));
  }
  const rhy = cellBaseline('II', rowH);
  const eII = leadExtrema('II');
  overDown = Math.max(overDown, Math.max(0, -eII.lo) * 10 - (rowH - rhy));
  return { overUp: Math.max(0, overUp) + 0.6, overDown: Math.max(0, overDown) + 0.6 };
}
function ecgHmm(rowH, compact) { return ECG.top + 4 * rowH + (compact ? 5.5 : 7) + (ECG.botPad || 0); }
let ECG_DRAW = null, LAST_CLIPS = [], LAST_CURSORS = [], LAST_SHEET_TEXTS = [];
function leadExtrema(id) {
  const key = id === 'II-rhythm' ? 'II' : id;
  const tr = TRACE[key]; let hi = 0, lo = 0;
  if (tr) for (let t = 0; t < BEAT_MS; t++) { if (tr[t] > hi) hi = tr[t]; if (tr[t] < lo) lo = tr[t]; }
  const w = Math.abs(REC.wanderMv) * ((LEAD[key] && LEAD[key].type === 'chest') ? 0.8 : 1);
  return { hi: hi + w, lo: lo - w };
}
function allLeadExtrema() {
  let hi = 1, lo = 0;
  for (const L of LEADS) {
    const e = leadExtrema(L.id);
    if (e.hi > hi) hi = e.hi;
    if (e.lo < lo) lo = e.lo;
  }
  return { hi, lo };
}
function cellBaseline(id, rowH) {
  const mm = sheetMmPerMv(id);
  const e = leadExtrema(id === 'II-rhythm' ? 'II' : id);
  const up = e.hi * mm, down = Math.max(0, -e.lo) * mm;
  const pad = 0.5;
  const inner = Math.max(5, rowH - pad * 2);
  let base;
  if (up + down <= inner) {
    const slack = inner - up - down;
    const topBias = Math.min(2.4, slack * 0.4);
    base = pad + up + topBias;
  } else {
    const share = up + down > 0 ? up / (up + down) : 0.5;
    base = pad + share * inner;
  }
  return Math.round(Math.max(pad + 0.4, Math.min(rowH - pad - 0.4, base)) * 10) / 10;
}
function rowBaseline(ids, rowH) { // kept for any caller; the sheet uses per-cell baselines
  return cellBaseline(ids[0], rowH);
}
function clipReport(id, rowH, baseOff) {
  const mm = sheetMmPerMv(id);
  const e = leadExtrema(id === 'II-rhythm' ? 'II' : id);
  const upNeed = e.hi * mm, downNeed = Math.max(0, -e.lo) * mm;
  const upClip = Math.max(0, upNeed - (baseOff - 0.4));
  const downClip = Math.max(0, downNeed - (rowH - baseOff - 0.4));
  return {
    id, hi: +e.hi.toFixed(3), lo: +e.lo.toFixed(3), mmPerMv: mm,
    rowH: +rowH.toFixed(2), base: +baseOff.toFixed(2),
    upClipMm: +upClip.toFixed(2), downClipMm: +downClip.toFixed(2),
    upClipMv: +(upClip / mm).toFixed(3), downClipMv: +(downClip / mm).toFixed(3)
  };
}
function ecgSheetSize() {
  const frame = ecgCanvas.parentElement;
  const compact = ONE_SCREEN.matches;
  const wmm = ECG.calW + PAGE_MS * MM_PER_MS + 2;
  let px, hmm;
  if (compact) {
    const card = frame.closest('.ecg12-card') || frame.parentElement;
    // Use the frame's position at scroll 0, so a later click or a scrolled page cannot enlarge the sheet past the viewport.
    const top = frame.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0);
    const pad = 8; // keep the 12-lead card inside the viewport
    const availH = Math.max(160, window.innerHeight - top - pad);
    const frameW = Math.max(200, (frame.clientWidth || card.clientWidth * 0.74) - 2);
    const pxW = frameW / wmm;
    // Tightest row spacing that still lets the sheet fill the wide frame under the remaining height.
    // Squares stay 25 mm/s. Limb leads are 10 mm/mV; chest leads on this sheet are 5 mm/mV.
    let rh = 28;
    while (rh > 12 && pxW * ecgHmm(rh, true) > availH + 0.5) rh -= 0.25;
    ECG.rowH = rh;
    ECG.base = Math.round(Math.max(7, Math.min(rh - 3.5, rh * 0.62)) * 10) / 10;
    const padC = sheetWavePad(rh);
    ECG.top = 2 + padC.overUp;
    ECG.botPad = padC.overDown;
    hmm = ecgHmm(rh, true);
    px = Math.min(pxW, availH / hmm);
  } else {
    ECG.rowH = 30; ECG.base = 17;
    const padN = sheetWavePad(30);
    ECG.top = 2 + padN.overUp;
    ECG.botPad = padN.overDown;
    hmm = ecgHmm(30, false);
    px = Math.max((frame.clientWidth || 280) - 2, 200) / wmm;
  }
  return { frame, compact, wmm, hmm, px, cssW: wmm * px, cssH: Math.round(hmm * px) };
}
function drawECG() {
  const frame = ecgCanvas.parentElement;
  // One-screen layout: the sheet fills the height left under the 3D model. Traces may overlap neighbouring rows, as on a printed ECG, and are not clipped into square waves. On small screens the sheet may scroll sideways.
  const { compact, wmm, hmm, px, cssW, cssH } = ecgSheetSize();
  frame.style.width = '';
  frame.style.overflow = 'hidden';
  frame.style.removeProperty('--ecg-w');
  if (ecgCanvas.dataset) {
    ecgCanvas.dataset.px = px.toFixed(3);
    ecgCanvas.dataset.wmm = String(wmm);
    ecgCanvas.dataset.hmm = String(hmm);
    ecgCanvas.dataset.rowH = String(ECG.rowH);
    ecgCanvas.dataset.top = String(ECG.top);
    ecgCanvas.dataset.botPad = String(ECG.botPad || 0);
  }
  ECG_DRAW = { px, wmm, hmm, rowH: ECG.rowH, top: ECG.top, calW: ECG.calW, colMm: ECG.colMs * MM_PER_MS, cssW, cssH };
  const g = prepCanvas(ecgCanvas, cssW, cssH); drawPaper(g, wmm, hmm, px);
  const clips = [];
  LAST_CURSORS = [];
  const tAbs = pageTime();
  // Standard 12-lead page: four simultaneous 2.4 s columns (same window, four in-step cursors) and a 9.6 s rhythm strip, all views of one recording. Printed laps: trace draws in behind the cursors, then the paper clears.
  const tPage0 = windowStart(tAbs, PAGE_MS);
  const tInPage = tAbs - tPage0;
  const tCol0 = windowStart(tAbs, ECG.colMs);
  const tInCol = tAbs - tCol0;
  const tWin0 = tCol0;
  const pxPerMs = MM_PER_MS * px;
  if (ecgCanvas.dataset) {
    ecgCanvas.dataset.tAbs = String(Math.round(tAbs));
    ecgCanvas.dataset.tWin0 = String(tWin0);
    ecgCanvas.dataset.tPage0 = String(tPage0);
    ecgCanvas.dataset.colMs = String(ECG.colMs);
    ecgCanvas.dataset.pageMs = String(PAGE_MS);
    ecgCanvas.dataset.pxPerMs = String(pxPerMs);
    ecgCanvas.dataset.activeCol = 'all';
    ecgCanvas.dataset.tCol0 = String(tCol0);
    ecgCanvas.dataset.tInCol = String(tInCol);
  }
  const sheetTopPx = 0;
  const sheetBotPx = hmm * px;
  const waveClamp = { unclamped: true, top: sheetTopPx + 1, bot: sheetBotPx - 2 };
  const cells = [];
  for (let r = 0; r < 4; r++) {
    const top = ECG.top + r * ECG.rowH;
    if (r < 3) {
      const limbOff = cellBaseline(LAYOUT[r][0], ECG.rowH);
      drawCal(g, 0.5, top + limbOff, px, 10);
      for (let c = 0; c < 4; c++) {
        const id = LAYOUT[r][c], t0 = tCol0, x0 = ECG.calW + c * ECG.colMs * MM_PER_MS, sel = id === state.sel;
        const mm = sheetMmPerMv(id);
        const baseOff = cellBaseline(id, ECG.rowH);
        const base = top + baseOff;
        const cell = { x: x0 * px, y: top * px, w: ECG.colMs * MM_PER_MS * px, h: ECG.rowH * px };
        if (SHEET_CHEST_MM < MM_PER_MV && c >= 2 && r === 0) {
          // Half-height 1 mV pulse for the chest-lead columns only; gain is named in the caption, not on the trace.
          const calBase = top + Math.max(7, Math.min(11, ECG.rowH - 1.2));
          drawCal(g, x0 + 0.3, calBase, px, 5);
        }
        if (sel) { g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(x0 * px + 1, (top + 0.5) * px, ECG.colMs * MM_PER_MS * px - 2, (ECG.rowH - 1) * px); }
        cells.push({ r, c, id, t0, x0, sel, mm, baseOff, base, top, cell });
        clips.push(clipReport(id, ECG.rowH, baseOff));
      }
    } else {
      const baseOff = cellBaseline('II', ECG.rowH);
      const base = top + baseOff;
      drawCal(g, 0.5, base, px, 10);
      const sel = state.sel === 'II', x0 = ECG.calW;
      cells.push({ r, c: 0, id: 'II-rhythm', t0: tPage0, x0, sel, mm: 10, baseOff, base, top, cell: { x: x0 * px, y: top * px, w: PAGE_MS * MM_PER_MS * px, h: ECG.rowH * px } });
      clips.push(clipReport('II-rhythm', ECG.rowH, baseOff));
    }
  }
  // Draw traces after the highlight box so deep waves can overlap neighbouring rows and the box border, never flattening into a square.
  for (const cell of cells) {
    g.save();
    g.beginPath();
    g.rect(cell.cell.x, sheetTopPx, cell.cell.w, sheetBotPx - sheetTopPx);
    g.clip();
    if (cell.id === 'II-rhythm') {
      drawSweepSeg(g, 'II', tPage0, PAGE_MS, tAbs, cell.x0, cell.base, px, cell.sel, null, 10);
    } else {
      drawPageCol(g, cell.id, tCol0, tAbs, cell.x0, cell.base, px, cell.sel, null, cell.mm);
    }
    g.restore();
  }
  for (const cell of cells) {
    if (cell.id !== 'II-rhythm' && cell.c) {
      g.strokeStyle = '#111'; g.lineWidth = 1.4; g.beginPath();
      g.moveTo(cell.x0 * px, (cell.base - 3) * px); g.lineTo(cell.x0 * px, (cell.base + 3) * px); g.stroke();
    }
    if (cell.id === 'II-rhythm') label(g, 'II  (rhythm strip)', cell.x0 + 1.5, cell.top + 5, px, cell.sel);
    else label(g, cell.id, cell.x0 + 1.5, cell.top + 5, px, cell.sel);
  }
  // Four in-step column cursors (each spans the three leads in that column) plus the rhythm-strip cursor on the 9.6 s clock.
  const sheetTopMm = ECG.top;
  const colBotMm = ECG.top + 3 * ECG.rowH;
  for (let c = 0; c < 4; c++) {
    const colCells = cells.filter(cell => cell.id !== 'II-rhythm' && cell.c === c);
    if (!colCells.length) continue;
    const x0 = colCells[0].x0;
    cursorAt(g, colCells[0].id, tAbs, x0, tCol0, colCells[0].base, sheetTopMm + 1, colBotMm - sheetTopMm - 2, px, colCells[0].mm, waveClamp);
    for (const cell of colCells) {
      const v = sampleRecording(cell.id, tAbs);
      let y = (cell.base - v * cell.mm) * px;
      if (waveClamp && waveClamp.unclamped) {
        if (waveClamp.top != null) y = Math.max(waveClamp.top, y);
        if (waveClamp.bot != null) y = Math.min(waveClamp.bot, y);
      }
      const x = (x0 + tInCol * MM_PER_MS) * px;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 4.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = PAPER.cursor; g.beginPath(); g.arc(x, y, 2.8, 0, Math.PI * 2); g.fill();
    }
    LAST_CURSORS.push({
      id: 'col-' + c,
      leads: colCells.map(cell => cell.id),
      tAbs, t0: tCol0, col: c, row: 0,
      x: (x0 + tInCol * MM_PER_MS) * px,
      relX: tInCol * MM_PER_MS * px,
      pxPerMs
    });
  }
  const rhy = cells.find(cell => cell.id === 'II-rhythm');
  if (rhy) {
    cursorAt(g, 'II', tAbs, rhy.x0, tPage0, rhy.base, rhy.top + 1, ECG.rowH - 2, px, 10, waveClamp);
    LAST_CURSORS.push({
      id: 'II-rhythm', tAbs, t0: tPage0, col: -1, row: 3,
      x: (rhy.x0 + tInPage * MM_PER_MS) * px,
      relX: tInPage * MM_PER_MS * px,
      pxPerMs
    });
  }
  LAST_CLIPS = clips;
  g.font = `600 ${Math.max(10, compact ? 2.7 * px : 3.2 * px)}px "Source Sans 3", Arial, sans-serif`; g.fillStyle = '#111';
  const yb = (ECG.top + 4 * ECG.rowH + (compact ? 3.8 : 5)) * px;
  const footer = cssW < 520
    ? ('All 12 leads recorded from one clock.  25 mm/s    ' + (SHEET_CHEST_MM < MM_PER_MV ? 'Limb 10 mm/mV, chest 5 mm/mV' : '10 mm/mV'))
    : ('All 12 leads recorded from one clock.    25 mm/s    ' + (SHEET_CHEST_MM < MM_PER_MV ? 'Limb leads 10 mm/mV, chest leads 5 mm/mV    ' : 'All leads 10 mm/mV    ') + 'Rate 75/min');
  g.fillText(footer, ECG.calW * px, yb);
  LAST_SHEET_TEXTS = [{ text: footer, role: 'footer' }];
  syncSheetHits();
}
function drawMini() {
  const frame = miniCanvas.parentElement; const wmm = ECG.calW + 125 + 1, hmm = 26; const cssW = frame.clientWidth - 2; if (cssW < 50) return;
  const px = cssW / wmm; const g = prepCanvas(miniCanvas, cssW, Math.round(hmm * px)); drawPaper(g, wmm, hmm, px);
  const base = 15, id = state.sel; drawCal(g, 0.5, base, px);
  const tAbs = pageTime(), t0 = windowStart(tAbs, MINI_MS);
  cursorAt(g, id, tAbs, ECG.calW, t0, base, 0.5, hmm - 1, px);
  drawSeg(g, id, t0, t0 + MINI_MS, ECG.calW, base, px, true);
  label(g, id, ECG.calW + 1, 5, px, false);
}
/* Close-up of the selected lead: two beats, same 25 mm/s and 10 mm/mV paper, drawn large */
const zoomCanvas = $('zoomECG');
function drawZoomOn(canvas, large) {
  if (!canvas) return;
  const frame = canvas.parentElement; if (!frame) return;
  const id = state.sel, tr = TRACE[id], I = INTERVALS;
  const wmm = ECG.calW + 2 * BEAT_MS * MM_PER_MS + 2;
  let vHi = 1, vLo = 0; // at least the 1 mV calibration pulse above the baseline
  if (tr) for (let t = 0; t < BEAT_MS; t++) { if (tr[t] > vHi) vHi = tr[t]; if (tr[t] < vLo) vLo = tr[t]; }
  const upMm = vHi * MM_PER_MV, downMm = Math.max(0.25, -vLo) * MM_PER_MV;
  const tagFontOf = px => Math.round(Math.max(12, Math.min(20, 8 + 0.6 * px)));
  const brFontOf = px => Math.round(Math.max(11, Math.min(17, 7 + 0.5 * px)));
  const bands = px => {
    const tf = tagFontOf(px), bf = brFontOf(px);
    const tagBox = (tf + 10) / px;
    return { tf, bf, tagBox, tagClear: Math.max(tagBox + 1.2, 3.2), brRow: Math.max(3.15, (bf + 16) / px) };
  };
  const availW = Math.max(200, frame.clientWidth - 2), availH = 10000;
  const topPad = 0.8, gapBelow = 1.5;
  const layoutAt = px => {
    const B = bands(px);
    const hmm = topPad + B.tagClear + upMm + downMm + gapBelow + B.brRow * 4 + 0.6;
    const base = topPad + B.tagClear + upMm;
    return { B, hmm, base };
  };
  let px = Math.min(32, availW / wmm);
  let L = layoutAt(px);
  if (L.hmm * px > availH) { px = Math.max(4.5, availH / L.hmm); L = layoutAt(px); px = Math.max(4.5, Math.min(px, availH / L.hmm, availW / wmm)); L = layoutAt(px); }
  else px = Math.max(10, Math.min(px, 15));
  const { B, hmm, base } = L;
  const cssW = Math.round(wmm * px), cssH = Math.round(hmm * px);
  const g = prepCanvas(canvas, cssW, cssH); drawPaper(g, wmm, hmm, px);
  const x0 = ECG.calW; drawCal(g, 0.5, base, px);
  const tAbs = pageTime(), tWin0 = windowStart(tAbs, ZOOM_MS);
  cursorAt(g, id, tAbs, x0, tWin0, base, 0.5, hmm - 1, px);
  drawSeg(g, id, tWin0, tWin0 + ZOOM_MS, x0, base, px, true, 2.6);
  // lead name, modest size, top-left of the paper so it does not fight the wave tags
  const nameFs = Math.round(Math.max(13, Math.min(22, 9 + 0.55 * px)));
  g.font = `800 ${nameFs}px "Source Sans 3", Arial, sans-serif`;
  const nameW = g.measureText(id).width;
  g.fillStyle = '#111'; g.fillRect(3, 3, nameW + 8, nameFs + 5);
  g.fillStyle = '#fff'; g.fillText(id, 7, 3 + nameFs);
  if (!I || !tr) return;
  const X = t => (x0 + (t - tWin0) * MM_PER_MS) * px;
  const Yv = t => (base - sampleLead(id, t) * MM_PER_MV) * px;
  const peakAt = (a, b, mode) => {
    let k = a, best = tr[a] || 0;
    for (let t = a; t <= b; t++) {
      const v = tr[t], score = mode === 'min' ? -v : mode === 'abs' ? Math.abs(v) : v;
      const cur = mode === 'min' ? -best : mode === 'abs' ? Math.abs(best) : best;
      if (score > cur) { best = v; k = t; }
    }
    return k;
  };
  const pPk = peakAt(I.pOn, I.pOff, 'abs');
  let rPk = I.qOn, rMax = tr[I.qOn], qPk = I.qOn, qMin = tr[I.qOn];
  for (let t = I.qOn; t <= I.qOff; t++) { if (tr[t] > rMax) { rMax = tr[t]; rPk = t; } if (tr[t] < qMin) { qMin = tr[t]; qPk = t; } }
  const qrsPk = rMax >= 0.05 ? rPk : qPk; // R peak, or the QS nadir when there is no R
  const tPk = peakAt(I.qOff + 40, I.tEnd, 'abs');
  let stMid = I.qOff + 40, stBest = 99;
  for (let t = I.qOff + 16; t < tPk - 12; t++) { const a = Math.abs(tr[t]); if (a < stBest) { stBest = a; stMid = t; } }
  const b0 = REC.starts[beatIndexAt(tAbs)];
  const features = [
    { txt: 'QRS', t: b0 + qrsPk, row: 0, nudge: 'both' },
    { txt: 'P wave', t: b0 + pPk, row: 0, nudge: 'both' },
    { txt: 'T wave', t: b0 + tPk, row: 0, nudge: 'both' },
    { txt: 'ST segment', t: b0 + stMid, row: 1, nudge: 'right', short: 'ST' }
  ];
  const font = B.tf, boxH = font + 6, gap = Math.max(8, 0.45 * px);
  const paperW = cssW, paperH = cssH;
  const boxes = [{ x0: 3, y0: 3, x1: 3 + nameW + 8, y1: 3 + nameFs + 5 }]; // keep clear of the lead name
  const overlaps = b => boxes.some(p => b.x0 < p.x1 + 6 && b.x1 > p.x0 - 6 && b.y0 < p.y1 + 4 && b.y1 > p.y0 - 4);
  const boxAt = (txt, cx, cy) => {
    g.font = `700 ${font}px "Source Sans 3", Arial, sans-serif`;
    const w = g.measureText(txt).width + 8;
    return { x0: cx - w / 2, y0: cy - font, x1: cx + w / 2, y1: cy + 6, w, cy };
  };
  const clampX = (featX, tw) => Math.max(tw / 2 + 2, Math.min(paperW - tw / 2 - 2, featX));
  const placed = [];
  for (const f of features) {
    const featX = X(f.t), featY = Yv(f.t);
    const row0 = topPad * px + font + 1;
    const row1 = row0 + boxH + Math.max(4, 0.35 * px);
    const ys = f.row === 1 ? [row1, row1 + boxH * 0.4, row0] : [Math.min(featY - gap, row0), row0, row1];
    const dxs = f.nudge === 'right' ? [22, 32, 44, 56, 72, 12, 0] : [0, 10, -10, 20, -20, 32, -32, 44, -44];
    let hit = null, used = f.txt;
    const attempt = txt => {
      g.font = `700 ${font}px "Source Sans 3", Arial, sans-serif`;
      const tw = g.measureText(txt).width + 8;
      for (const y of ys) {
        if (y < font + 2 || y > featY - 6) continue;
        for (const dx of dxs) {
          const cand = boxAt(txt, clampX(featX + dx, tw), y);
          if (!overlaps(cand) && cand.y1 < featY - 3) return cand;
        }
      }
      return null;
    };
    hit = attempt(f.txt);
    if (!hit && f.short) { used = f.short; hit = attempt(f.short); }
    if (!hit) {
      used = f.short || f.txt;
      g.font = `700 ${font}px "Source Sans 3", Arial, sans-serif`;
      const tw = g.measureText(used).width + 8;
      hit = boxAt(used, clampX(featX, tw), Math.max(row0, Math.min(row1, featY - gap)));
    }
    f.txt = used;
    placed.push({ f, featX, featY, b: hit });
    boxes.push(hit);
  }
  // leaders first (under the tag boxes), then boxes, so the line meets the exact feature
  g.lineCap = 'round';
  for (const p of placed) {
    const { b, featX, featY } = p;
    const lx = Math.max(b.x0, Math.min(b.x1, featX));
    const ly = b.y1; // leave the box from its bottom edge
    g.strokeStyle = '#111'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(lx, ly); g.lineTo(featX, featY); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.arc(featX, featY, 1.6, 0, Math.PI * 2); g.fill();
  }
  for (const p of placed) {
    const { f, b } = p;
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    g.strokeStyle = '#111'; g.lineWidth = 1; g.strokeRect(b.x0 + 0.5, b.y0 + 0.5, b.x1 - b.x0 - 1, b.y1 - b.y0 - 1);
    g.fillStyle = '#111'; g.font = `700 ${font}px "Source Sans 3", Arial, sans-serif`;
    g.fillText(f.txt, b.x0 + 4, b.y0 + font);
  }
  // Interval brackets under the first beat only, in four neat rows below the lowest part of the trace
  const brY0 = base + downMm + gapBelow;
  const bracket = (a, b, row, txt) => {
    const ymm = brY0 + row * B.brRow, y = ymm * px, xA = X(a), xB = X(b);
    g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath();
    g.moveTo(xA, y - 3); g.lineTo(xA, y + 3); g.moveTo(xA, y); g.lineTo(xB, y); g.moveTo(xB, y - 3); g.lineTo(xB, y + 3); g.stroke();
    const baseY = (base + Math.max(0.6, downMm * 0.05)) * px;
    g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath();
    g.moveTo(xA, y - 3); g.lineTo(xA, Math.min(baseY, y - 3));
    g.moveTo(xB, y - 3); g.lineTo(xB, Math.min(baseY, y - 3));
    g.stroke(); g.setLineDash([]);
    g.font = `700 ${B.bf}px "Source Sans 3", Arial, sans-serif`;
    const tw = g.measureText(txt).width, th = B.bf + 6;
    let cx = (xA + xB) / 2; cx = Math.max(tw / 2 + 3, Math.min(paperW - tw / 2 - 3, cx));
    const ty = y + B.bf + 3;
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(cx - tw / 2 - 3, ty - B.bf, tw + 6, th);
    g.strokeStyle = '#111'; g.lineWidth = 1; g.strokeRect(cx - tw / 2 - 3 + 0.5, ty - B.bf + 0.5, tw + 5, th - 1);
    g.fillStyle = '#111'; g.fillText(txt, cx - tw / 2, ty);
  };
  // Closest to the trace first: P duration, then PR, QRS, QT (on the beat under the cursor)
  bracket(b0 + I.pOn, b0 + I.pOff, 0, `P wave ${I.P} ms`);
  bracket(b0 + I.pOn, b0 + I.qOn, 1, `PR ${I.PR} ms`);
  bracket(b0 + I.qOn, b0 + I.qOff, 2, `QRS ${I.QRS} ms`);
  bracket(b0 + I.qOn, b0 + I.tEnd, 3, `QT ${I.QT} ms`);
}
/* Single-lead close-up: shared 4-beat (3.2 s) window at 25 mm/s and 10 mm/mV (square boxes), regardless of lead or amplitude. */
function paintAnnotatedLead(canvas, cssW, cssH, leadId, sharedPx) {
  if (!canvas) return;
  const id = leadId || state.sel, tr = TRACE[id], I = INTERVALS;
  cssW = Math.max(120, Math.round(cssW || 0));
  cssH = Math.max(80, Math.round(cssH || 0));
  const ext = allLeadExtrema();
  const vHi = Math.max(1, ext.hi), vLo = Math.min(0, ext.lo);
  const upMm = vHi * MM_PER_MV, downMm = Math.max(0.25, -vLo) * MM_PER_MV;
  const tagF = 11, rowF = 11, nameFs = 12, marginMm = 0.8;
  const labelTopPx = nameFs + 6, boxH = tagF + 4, rowGap = 2;
  // Every close-up strip uses the same px-per-mm (from the shared width, never from per-lead wave height)
  // and the exact same 4-beat (3200 ms) monitor window so beats and cursors align vertically.
  const px = sharedPx || (cssW / CLOSEUP_WMM);
  const wmm = cssW / px;
  let hmm = cssH / px;
  const x0 = CLOSEUP_LEFT_MM;
  const tVis = CLOSEUP_MS;
  const tAbs = pageTime();
  const tWin0 = windowStart(tAbs, tVis);
  const tWin1 = tWin0 + tVis;
  const nBeats = tVis / BEAT_MS;
  const spanMm = upMm + downMm;
  const slim = hmm < 27.5;
  const minLabelPx = nameFs + 6, minIntervalPx = rowF + 10;
  const nLabelRows = slim ? 0 : 3;
  // Give the waveform the millimetres it needs at 10 mm/mV first; shrink label and interval bands rather than flatten peaks.
  const waveNeedMm = spanMm + marginMm * 2;
  const preferLabelPx = slim ? minLabelPx : (labelTopPx + nLabelRows * (boxH + rowGap) + 1);
  const preferIntervalPx = slim ? 4 : minIntervalPx;
  let labelBandPx = preferLabelPx, intervalBandPx = preferIntervalPx;
  if (waveNeedMm * px + labelBandPx + intervalBandPx > cssH) {
    const leftover = Math.max(0, cssH - waveNeedMm * px);
    if (leftover <= 0) { labelBandPx = 0; intervalBandPx = 0; }
    else {
      const labelShare = preferLabelPx / Math.max(1, preferLabelPx + preferIntervalPx);
      labelBandPx = Math.floor(leftover * labelShare);
      intervalBandPx = Math.max(0, Math.floor(leftover - labelBandPx));
    }
  }
  const labelBandMm = labelBandPx / px, intervalBandMm = intervalBandPx / px;
  // Paint only to the visible frame height. Growing the canvas here used to hide clipping
  // behind a taller bitmap that overflow:hidden then cropped.
  const traceTopMm = labelBandMm;
  const traceHmm = Math.max(waveNeedMm, hmm - labelBandMm - intervalBandMm);
  const base = traceTopMm + marginMm + upMm;
  const pxPerMs = MM_PER_MS * px;
  const cursorX = (x0 + (tAbs - tWin0) * MM_PER_MS) * px;
  canvas.dataset.lead = id;
  canvas.dataset.beats = nBeats.toFixed(2);
  canvas.dataset.px = px.toFixed(4);
  canvas.dataset.pxPerMs = pxPerMs.toFixed(6);
  canvas.dataset.t0 = String(Math.round(tWin0));
  canvas.dataset.t1 = String(Math.round(tWin1));
  canvas.dataset.tAbs = String(Math.round(tAbs));
  canvas.dataset.cursorX = cursorX.toFixed(2);
  canvas.dataset.x0Px = (x0 * px).toFixed(2);
  canvas.dataset.cssW = String(cssW);
  canvas.dataset.cssH = String(cssH);
  canvas.dataset.baseMm = base.toFixed(3);
  canvas.dataset.upMm = upMm.toFixed(3);
  canvas.dataset.downMm = downMm.toFixed(3);
  canvas.dataset.yMin = ((base - vHi * MM_PER_MV) * px).toFixed(2);
  canvas.dataset.yMax = ((base - vLo * MM_PER_MV) * px).toFixed(2);
  const g = prepCanvas(canvas, cssW, cssH);
  drawPaper(g, wmm, hmm, px);
  // Do not clip the waveform; a deep S or tall R must keep its shape. Labels sit in leftover bands, or overlay if the strip is tight.
  drawSweepSeg(g, id, tWin0, tVis, tAbs, x0, base, px, true, Math.max(2.2, Math.min(3.2, 0.16 * px)));
  cursorAt(g, id, tAbs, x0, tWin0, base, 0.4, hmm - 0.8, px, MM_PER_MV, {
    unclamped: true,
    top: 2,
    bot: cssH - 2
  });
  g.font = `800 ${nameFs}px "Source Sans 3", Arial, sans-serif`;
  const nameW = g.measureText(id).width;
  g.fillStyle = '#111'; g.fillRect(3, 3, nameW + 8, nameFs + 5);
  g.fillStyle = '#fff'; g.fillText(id, 7, 3 + nameFs);
  if (slim || !I || !tr) {
    canvas.dataset.annots = JSON.stringify({ lead: id, cursorX, tAbs, labels: [], bar: null });
    return;
  }
  const X = t => (x0 + (t - tWin0) * MM_PER_MS) * px;
  const yTrace = t => (base - sampleLead(id, t) * MM_PER_MV) * px;
  const Yv = t => Math.max(traceTopMm * px + 2, Math.min((traceTopMm + traceHmm) * px - 2, yTrace(t)));
  const peakAt = (a0, b0, mode) => {
    let k = a0, best = sampleLead(id, a0);
    for (let t = a0; t <= b0; t++) {
      const v = sampleLead(id, t), score = mode === 'abs' ? Math.abs(v) : v;
      const cur = mode === 'abs' ? Math.abs(best) : best;
      if (score > cur) { best = v; k = t; }
    }
    return k;
  };
  const pPk = peakAt(I.pOn, I.pOff, 'abs');
  let rPk = I.qOn, rMax = sampleLead(id, I.qOn), qPk = I.qOn, qMin = rMax;
  for (let t = I.qOn; t <= I.qOff; t++) {
    const v = sampleLead(id, t);
    if (v > rMax) { rMax = v; rPk = t; }
    if (v < qMin) { qMin = v; qPk = t; }
  }
  const qrsPk = rMax >= 0.05 ? rPk : qPk;
  const tPk = peakAt(I.qOff + 40, I.tEnd, 'abs');
  let stMid = I.qOff + 40, stBest = 99;
  for (let t = I.qOff + 16; t < tPk - 12; t++) { const a1 = Math.abs(sampleLead(id, t)); if (a1 < stBest) { stBest = a1; stMid = t; } }
  // Label the beat that contains the cursor, using the shared recording's beat start.
  // A callout and its leader appear only once that segment has started to be drawn,
  // and the leader dot is clamped to already-printed ink, never ahead of the cursor.
  const b0 = REC.starts[beatIndexAt(tAbs)];
  let tWaveOn = tPk;
  for (let t = stMid + 8; t < tPk; t++) {
    if (Math.abs(sampleLead(id, t)) > 0.04) { tWaveOn = t; break; }
  }
  const features = [
    { txt: 'P wave', t: b0 + pPk, start: b0 + I.pOn },
    { txt: 'QRS', t: b0 + qrsPk, start: b0 + I.qOn },
    { txt: 'ST', t: b0 + stMid, start: b0 + I.qOff },
    { txt: 'T wave', t: b0 + tPk, start: b0 + tWaveOn }
  ].filter(f => tAbs >= f.start).sort((a, b) => a.t - b.t);
  const font = tagF;
  const paperW = cssW;
  const boxes = [{ x0: 3, y0: 3, x1: 3 + nameW + 8, y1: 3 + nameFs + 5 }];
  const overlaps = b => boxes.some(p2 => b.x0 < p2.x1 + 4 && b.x1 > p2.x0 - 4 && b.y0 < p2.y1 + 2 && b.y1 > p2.y0 - 2);
  const boxAt = (txt, cx, cy) => {
    g.font = `700 ${font}px "Source Sans 3", Arial, sans-serif`;
    const w = g.measureText(txt).width + 8;
    return { x0: cx - w / 2, y0: cy - font, x1: cx + w / 2, y1: cy + 5, w, cy };
  };
  // Keep the reserved band at two rows so the waveform scale does not change.
  // If that band was squeezed away, overlay rows at the top of the paper.
  // Use a third row when there is height, so P, QRS, ST and T can all sit
  // on a finished beat instead of spilling onto blank paper to find space.
  const overlayLabels = !slim && labelBandPx < boxH + 4;
  const rowYs = [];
  for (let i = 0; i < nLabelRows; i++) rowYs.push(labelTopPx + i * (boxH + rowGap) + font);
  const placed = [];
  const cursorPad = 0.75;
  const topBandY = cssH * 0.2;
  for (const f of features) {
    const tDot = Math.min(f.t, tAbs);
    const featX = X(tDot), featY = Yv(tDot);
    if (featX < 8 || featX > paperW - 8) continue;
    if (featX > cursorX + cursorPad) continue;
    g.font = `700 ${font}px "Source Sans 3", Arial, sans-serif`;
    const tw = g.measureText(f.txt).width + 8;
    const dxs = [0, -14, 14, -28, 28, -42, 42, -56, 56];
    const candidates = [];
    for (const y of rowYs) {
      for (const dx of dxs) {
        const cx = Math.max(tw / 2 + 2, Math.min(paperW - tw / 2 - 2, featX + dx));
        const cand = boxAt(f.txt, cx, y);
        if (cand.y0 < 2 || cand.y1 > cssH - 4) continue;
        if (!overlayLabels && cand.y1 > traceTopMm * px - 1) continue;
        if (cand.x0 > cursorX + cursorPad) continue;
        const fullyLeft = cand.x1 <= cursorX + cursorPad;
        const inTopBand = cand.y1 <= topBandY + 1;
        // A box may straddle the cursor only in the top band, so blank paper
        // to the right of the sweep stays clear of ink in the wave area.
        if (!fullyLeft && !inTopBand) continue;
        if (overlaps(cand)) continue;
        candidates.push({ cand, fullyLeft, dx: Math.abs(dx) });
      }
    }
    candidates.sort((a, b) => (a.fullyLeft === b.fullyLeft ? a.dx - b.dx : (a.fullyLeft ? -1 : 1)));
    const hit = candidates.length ? candidates[0].cand : null;
    if (!hit) continue;
    f.featX = featX; f.featY = featY;
    placed.push({ f, featX, featY, b: hit });
    boxes.push(hit);
  }
  g.lineCap = 'round';
  for (const p2 of placed) {
    const { b, featX, featY } = p2;
    const lx = Math.max(b.x0 + 2, Math.min(b.x1 - 2, featX));
    g.strokeStyle = '#111'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(lx, b.y1); g.lineTo(featX, featY); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.arc(featX, featY, 1.8, 0, Math.PI * 2); g.fill();
  }
  for (const p2 of placed) {
    const { f, b } = p2;
    g.fillStyle = 'rgba(255,255,255,0.96)'; g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    g.strokeStyle = '#111'; g.lineWidth = 1; g.strokeRect(b.x0 + 0.5, b.y0 + 0.5, b.x1 - b.x0 - 1, b.y1 - b.y0 - 1);
    g.fillStyle = '#111'; g.font = `700 ${font}px "Source Sans 3", Arial, sans-serif`;
    g.fillText(f.txt, b.x0 + 4, b.y0 + font);
  }
  const yTick = Math.min(cssH - rowF - 10, (traceTopMm + traceHmm + 0.4) * px);
  const yText = Math.min(cssH - 4, yTick + rowF + 6);
  const tBar0 = b0 + I.pOn;
  const tBar1 = Math.min(b0 + I.tEnd, tAbs);
  const xA = X(tBar0), xB = Math.min(X(tBar1), cursorX);
  const barInView = tAbs >= tBar0 && xB > xA + 1 && xA < paperW - 8 && xB > 8;
  let bar = null;
  if (barInView) {
    g.strokeStyle = '#111'; g.lineWidth = 1.2;
    const marks = [b0 + I.pOn, b0 + I.pOff, b0 + I.qOn, b0 + I.qOff, b0 + I.tEnd].filter(t => t <= tAbs + 0.5);
    g.beginPath();
    g.moveTo(xA, yTick); g.lineTo(xB, yTick);
    for (const t of marks) {
      const x = X(t);
      if (x > cursorX + 0.75) continue;
      g.moveTo(x, yTick - 4); g.lineTo(x, yTick + 4);
    }
    g.stroke();
    const parts = [];
    if (tAbs >= b0 + I.pOff) parts.push(`P ${I.P} ms`);
    if (tAbs >= b0 + I.qOn) parts.push(`PR ${I.PR} ms`);
    if (tAbs >= b0 + I.qOff) parts.push(`QRS ${I.QRS} ms`);
    if (tAbs >= b0 + I.tEnd) parts.push(`QT ${I.QT} ms`);
    let text = '', textX0 = null, textX1 = null;
    if (parts.length) {
      const rowTxt = parts.join('    ');
      g.font = `700 ${rowF}px "Source Sans 3", Arial, sans-serif`;
      const tw = g.measureText(rowTxt).width;
      const pad = 4;
      let left = (xA + xB) / 2 - tw / 2 - pad;
      const boxW = tw + pad * 2;
      // Keep the readout with the drawn bar, never starting on blank paper to the right of the cursor.
      if (left + boxW > cursorX) left = cursorX - boxW;
      if (left < 2) left = 2;
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(left, yText - rowF, boxW, rowF + 6);
      g.fillStyle = '#111'; g.fillText(rowTxt, left + pad, yText);
      text = rowTxt;
      textX0 = left;
      textX1 = left + boxW;
    }
    bar = { x0: xA, x1: xB, y: yTick, marks: marks.map(t => X(t)), text, textX0, textX1 };
  }
  canvas.dataset.annots = JSON.stringify({
    lead: id, cursorX, tAbs,
    labels: placed.map(p2 => ({
      txt: p2.f.txt, t: Math.min(p2.f.t, tAbs), featX: p2.featX, featY: p2.featY,
      x0: p2.b.x0, x1: p2.b.x1, y0: p2.b.y0, y1: p2.b.y1
    })),
    bar
  });
}

function closeupLeadList() {
  const list = (state.sels && state.sels.length) ? state.sels.slice() : [state.sel || 'II'];
  return list.filter(id => LEAD[id]);
}
function visibleCssBox(el) {
  const r = el.getBoundingClientRect();
  let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
  let p = el.parentElement;
  while (p && p !== document.documentElement) {
    const st = getComputedStyle(p);
    if (/(hidden|auto|scroll|clip)/.test(st.overflowY) || /(hidden|auto|scroll|clip)/.test(st.overflowX)) {
      const pr = p.getBoundingClientRect();
      x0 = Math.max(x0, pr.left); y0 = Math.max(y0, pr.top);
      x1 = Math.min(x1, pr.right); y1 = Math.min(y1, pr.bottom);
    }
    p = p.parentElement;
  }
  return { width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0), left: x0, top: y0 };
}
function paintCloseupCanvas(canvas, nameEl, gainEl, leadId, sharedCssW, sharedPx) {
  if (!canvas || !leadId) return;
  if (nameEl) nameEl.textContent = leadId;
  const frame = canvas.parentElement;
  if (!frame) return;
  const cssW = sharedCssW || Math.max(120, Math.floor(frame.clientWidth - 2));
  // Size the bitmap to the visible frame, not to a wished-for height the parent then clips.
  const vis = visibleCssBox(frame);
  const cssH = Math.max(40, Math.floor((vis.height || frame.clientHeight || 160) - 2));
  paintAnnotatedLead(canvas, cssW, cssH, leadId, sharedPx);
  if (gainEl) gainEl.textContent = '10 mm/mV (full gain), 25 mm/s';
  canvas.setAttribute('aria-label', `Close-up of lead ${leadId} on standard ECG paper at full gain, 25 millimetres per second and 10 millimetres per millivolt. The cursor sweeps left to right and the trace draws in behind it on blank paper.`);
}
function drawZoom() {
  const leads = closeupLeadList();
  const primary = state.sel || leads[0] || 'II';
  const c1 = $('leadCloseup'), fr1 = c1 && c1.parentElement;
  const card2 = $('leadCloseupCard2'), c2 = $('leadCloseup2'), fr2 = c2 && c2.parentElement;
  const second = leads[1];
  const show2 = !!(card2 && typeof isFullscreen === 'function' && isFullscreen() && second);
  if (card2) card2.hidden = !show2;
  const w1 = fr1 ? Math.max(120, Math.floor(fr1.clientWidth - 2)) : 320;
  const w2 = (show2 && fr2) ? Math.max(120, Math.floor(fr2.clientWidth - 2)) : w1;
  const sharedCssW = show2 ? Math.min(w1, w2) : w1;
  const sharedPx = sharedCssW / CLOSEUP_WMM;
  paintCloseupCanvas(c1, $('leadCloseupName'), $('leadCloseupGain'), leads[0] || primary, sharedCssW, sharedPx);
  if (show2) paintCloseupCanvas(c2, $('leadCloseupName2'), $('leadCloseupGain2'), second, sharedCssW, sharedPx);
  const z = $('zoomLead'); if (z) z.textContent = primary;
  if (zoomCanvas && zoomCanvas.offsetParent) drawZoomOn(zoomCanvas, false);
}
if (typeof ResizeObserver === 'function') {
  const lastCloseup = {};
  const closeupRo = new ResizeObserver(entries => {
    let changed = false;
    for (const entry of entries) {
      const r = entry.contentRect;
      const key = Math.round(r.width) + 'x' + Math.round(r.height);
      const id = entry.target.id || 'frame';
      if (lastCloseup[id] === key) continue;
      lastCloseup[id] = key;
      changed = true;
    }
    if (changed) drawZoom();
  });
  for (const id of ['leadCloseup', 'leadCloseup2']) {
    const el = $(id);
    const fr = el && el.parentElement;
    if (fr) closeupRo.observe(fr);
  }
}
function leadAtEvent(e) {
  const geo = ECG_DRAW; if (!geo || !geo.px) return null;
  const r = ecgCanvas.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  // Map the click through the displayed CSS size, then the millimetre geometry used to draw the sheet.
  const xmm = (e.clientX - r.left) * (geo.cssW / r.width) / geo.px;
  const ymm = (e.clientY - r.top) * (geo.cssH / r.height) / geo.px;
  const row = Math.floor((ymm - geo.top) / geo.rowH); if (row < 0 || row > 3) return null;
  if (row === 3) return 'II';
  const col = Math.floor((xmm - geo.calW) / geo.colMm); if (col < 0 || col > 3) return null;
  return LAYOUT[row][col];
}
function cellPoint(row, col, u, v) {
  // u,v in 0..1 within the cell (or the rhythm strip if row===3). Returns CSS viewport coordinates.
  const geo = ECG_DRAW; if (!geo) return null;
  const r = ecgCanvas.getBoundingClientRect();
  const xmm = row === 3
    ? geo.calW + Math.max(0.02, Math.min(0.98, u)) * (geo.wmm - geo.calW)
    : geo.calW + (col + Math.max(0.02, Math.min(0.98, u))) * geo.colMm;
  const ymm = geo.top + (row + Math.max(0.02, Math.min(0.98, v))) * geo.rowH;
  return {
    x: r.left + (xmm * geo.px) * (r.width / geo.cssW),
    y: r.top + (ymm * geo.px) * (r.height / geo.cssH)
  };
}
const ECG12_HINT = 'Click a lead to see it close up on the right.';
function ecgClick(e) { const id = leadAtEvent(e); if (id) select(id, true); }
ecgCanvas.addEventListener('click', ecgClick);
function syncSheetHits() {
  const layer = $('ecg12Hits'), geo = ECG_DRAW;
  if (!layer || !geo || !ecgCanvas) return;
  const frame = layer.parentElement;
  const cr = ecgCanvas.getBoundingClientRect(), fr = frame.getBoundingClientRect();
  const sx = cr.width / geo.cssW, sy = cr.height / geo.cssH;
  layer.style.left = (cr.left - fr.left + frame.scrollLeft) + 'px';
  layer.style.top = (cr.top - fr.top + frame.scrollTop) + 'px';
  layer.style.width = cr.width + 'px';
  layer.style.height = cr.height + 'px';
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) cells.push({ r, c, id: LAYOUT[r][c] });
  cells.push({ r: 3, c: 0, id: 'II' });
  if (!layer.childElementCount) {
    for (const cell of cells) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ecg12-hit';
      b.dataset.lead = cell.id;
      b.setAttribute('aria-label', 'Focus lead ' + cell.id);
      b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); select(cell.id, true); });
      layer.appendChild(b);
    }
  }
  const set = selectedSet();
  layer.querySelectorAll('.ecg12-hit').forEach((b, i) => {
    const cell = cells[i]; if (!cell) return;
    const xmm0 = geo.calW + (cell.r === 3 ? 0 : cell.c * geo.colMm);
    const ymm0 = geo.top + cell.r * geo.rowH;
    const wmm = cell.r === 3 ? (geo.wmm - geo.calW) : geo.colMm;
    b.style.left = (xmm0 * geo.px * sx) + 'px';
    b.style.top = (ymm0 * geo.px * sy) + 'px';
    b.style.width = (wmm * geo.px * sx) + 'px';
    b.style.height = (geo.rowH * geo.px * sy) + 'px';
    b.setAttribute('aria-pressed', String(set.includes(cell.id)));
  });
}
(function leadButtons() {
  const box = $('leadBtns');
  for (const L of LEADS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 't-btn lead-btn'; b.dataset.lead = L.id; b.textContent = L.id;
    b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', `Lead ${L.id}, ${L.type === 'limb' ? 'limb lead at ' + L.angle.replace('-', 'minus ') : 'chest lead'}, ${L.view.toLowerCase()}`);
    b.addEventListener('click', () => select(L.id, true));
    box.appendChild(b);
  }
})();
(function keyDialog() {
  const btn = $('keyOpenBtn'), dialog = $('keyDialog'), panel = $('keyPanel'), closeBtn = $('keyCloseBtn'), backdrop = $('keyBackdrop');
  if (!btn || !dialog || !panel || !closeBtn) return;
  let lastFocus = null;
  const focusables = () => [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
  const place = () => {
    if (dialog.hidden) return;
    const vw = innerWidth, vh = innerHeight;
    const side = document.querySelector('.tool-side');
    const stageCard = document.querySelector('.stage-card');
    const br = btn.getBoundingClientRect();
    const sr = side ? side.getBoundingClientRect() : null;
    const hr = stageCard ? stageCard.getBoundingClientRect() : null;
    // Prefer the right column so the dialog does not sit on the heart.
    let left, top, width;
    if (sr && sr.width > 160 && sr.left > 40) {
      left = sr.left;
      width = Math.min(520, Math.max(260, sr.width));
      top = Math.max(8, Math.min(sr.top, vh - 8));
    } else {
      width = Math.min(520, vw - 24);
      left = Math.max(12, Math.min(br.left, vw - width - 12));
      top = Math.min(br.bottom + 6, vh - 8);
    }
    // If the panel would cover the 3D stage, shift it to the right of the stage.
    if (hr && left < hr.right - 8 && left + width > hr.left + 8) {
      const toRight = hr.right + 8;
      if (toRight + width <= vw - 8) left = toRight;
      else left = Math.max(12, vw - width - 12);
    }
    panel.style.width = width + 'px';
    panel.style.left = left + 'px';
    // Measure after width is set, then clamp vertically. Desktop: no inner scroll (CSS overflow visible).
    panel.style.top = '8px';
    const ph = panel.getBoundingClientRect().height;
    const maxTop = Math.max(8, vh - ph - 8);
    top = Math.max(8, Math.min(top, maxTop));
    panel.style.top = top + 'px';
    dialog.dataset.overflows = (ph > vh - 16) ? '1' : '0';
  };
  const setOpen = on => {
    dialog.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    if (on) {
      lastFocus = document.activeElement;
      place();
      requestAnimationFrame(() => { place(); (closeBtn || panel).focus(); });
    } else if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus();
    } else btn.focus();
  };
  btn.addEventListener('click', e => { e.stopPropagation(); setOpen(dialog.hidden); });
  closeBtn.addEventListener('click', () => setOpen(false));
  if (backdrop) backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', e => {
    if (dialog.hidden) return;
    if (e.key === 'Escape') {
      if ($('showPanel') && !$('showPanel').hidden) return;
      e.preventDefault(); setOpen(false); return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables(); if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  addEventListener('resize', () => { if (!dialog.hidden) place(); });
  window.__ecgKeyDialog = { open: () => setOpen(true), close: () => setOpen(false), isOpen: () => !dialog.hidden };
})();

/* ======================= 3D scene ======================= */
// The heart is drawn enlarged (VIS_SCALE) so the conduction system is readable; lead lines and chest
// electrodes are drawn to the same enlarged scale. The electrical model itself is unchanged.
const VIS_SCALE = 1.7;
// Visual-only shift: slightly down and to the patient's left, so the apex sits under V4
// (5th intercostal space, midclavicular line) and V1/V2 sit over the RV and septum.
// HEART_M, toBody, the dipole and the traces do not use this offset.
const VIS_SHIFT = new THREE.Vector3(0.42, -0.52, 0.06);
const HEART_VIS = new THREE.Matrix4().makeTranslation(VIS_SHIFT.x, VIS_SHIFT.y, VIS_SHIFT.z)
  .multiply(new THREE.Matrix4().makeScale(VIS_SCALE, VIS_SCALE, VIS_SCALE))
  .multiply(HEART_M);
let renderer = null, scene, camera, needsRender = true;
const stage = $('stage'), canvas = $('scene'), labelLayer = $('labels');
function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch (e) { return false; }
}
try { if (webglAvailable()) renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true }); } catch (e) { renderer = null; }
if (!renderer || !renderer.getContext()) {
  $('fallback').hidden = false; canvas.hidden = true; renderer = null;
  document.querySelectorAll('.view-btn, #resetView, #toggleCut, #toggleLeads, #showBtn, #toggleLoop').forEach(b => { b.disabled = true; });
  $('sceneHelp').textContent = '3D is unavailable here, but the timeline, phase buttons and the 12-lead ECG still work.';
  const hint = $('stageHint'); if (hint) hint.textContent = '3D is unavailable here.';
}
if (renderer) renderer.localClippingEnabled = true;

const labels = [];
function addLabel(text, cls, getPos, prio, opts) {
  const leadId = opts && opts.leadId;
  const el = leadId ? document.createElement('button') : document.createElement('div');
  el.className = 'lbl ' + cls; el.textContent = text;
  if (leadId) {
    el.type = 'button';
    el.setAttribute('aria-label', 'Select lead ' + leadId);
    el.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); select(leadId, true); });
  } else {
    el.setAttribute('aria-hidden', 'true');
  }
  labelLayer.appendChild(el);
  const L = { el, getPos, visible: true, cls, prio: prio != null ? prio : ({ proj: 1, vec: 2, node: 2, region: 3, lead: 4, cond: 5, heart: 6 }[cls] || 5), leadId: leadId || null };
  labels.push(L); return L;
}

const orbit = { az: 0, el: 0, r: 17, target: new THREE.Vector3(0, 0.2, 0) };
const SECTION_N = dirToBody([0, 0, 1]);
const VIEWS = {
  // turned towards the patient's left until the cut-away faces you (level camera, so lead I stays horizontal)
  frontal:    { az: Math.atan2(SECTION_N[0], SECTION_N[2]), el: 0, r: 16, note: '' },
  section:    { az: Math.atan2(SECTION_N[0], SECTION_N[2]), el: Math.asin(SECTION_N[1]), r: 13, note: 'Face-on to the cut-away: the four chambers and the conduction system.' },
  oblique:    { az: 35 * DEG, el: 14 * DEG, r: 24, note: '3D view. Drag to rotate.' },
  transverse: { az: 0, el: 89.4 * DEG, r: 22, note: "Transverse view from above: front of the chest at the bottom, patient's left on your right." }
};
const ui = { cut: true, allLeads: true, loop: false, labelMode: 'none', guided: false, anatomyLabels: false, labelGroups: { chambers: false, conduction: false, leads: false, vectors: false, walls: false, orientation: false }, labelItems: {} };
VIEWS.frontal.note = `Front view, turned ${Math.round(VIEWS.frontal.az / DEG)}\u00b0 towards the patient's left so the cut-away faces you. Limb leads (hexaxial); the patient's left is on your right.`;
const HINT = 'Drag to rotate, scroll or pinch to zoom. Click a lead name to see it close up on the right.';
function lookingFromText(az, el) {
  const elD = el / DEG;
  let azD = az / DEG;
  azD = ((azD + 540) % 360) - 180; // -180..180, 0 = front of the patient
  const absA = Math.abs(azD);
  let around;
  if (absA <= 22) around = 'front';
  else if (absA >= 158) around = 'back';
  else if (azD > 0) around = absA < 70 ? "front, slightly from the patient's left" : absA < 110 ? "the patient's left" : "back, slightly from the patient's left";
  else around = absA < 70 ? "front, slightly from the patient's right" : absA < 110 ? "the patient's right" : "back, slightly from the patient's right";
  if (elD > 70) around = absA < 25 || absA > 155 ? 'above' : ('above, towards ' + around);
  else if (elD < -70) around = absA < 25 || absA > 155 ? 'below' : ('below, towards ' + around);
  else if (elD > 25) around += ', and slightly above';
  else if (elD < -25) around += ', and slightly below';
  return 'Looking from: ' + around;
}
function setViewCaption(name, v) {
  const from = lookingFromText(orbit.az, orbit.el);
  const note = v && v.note != null ? v.note : (name === 'custom' ? 'Custom 3D view. Use Reset view to return to the frontal view.' : '');
  const line = $('viewNote'); if (line) line.textContent = from;
  const info = $('stageInfoText');
  if (info) info.textContent = (note ? note + ' ' : '') + from + ' Drag to rotate, or use Reset view to return to the front.';
  const hint = $('stageHint'); if (hint && hint.textContent.indexOf('unavailable') < 0) hint.textContent = HINT;
}
(function stageInfo() {
  const btn = $('stageInfoBtn'), panel = $('stageInfo');
  if (!btn || !panel) return;
  const setOpen = on => {
    panel.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
  };
  btn.addEventListener('click', e => { e.stopPropagation(); setOpen(panel.hidden); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || panel.hidden) return;
    if ($('keyDialog') && !$('keyDialog').hidden) return;
    if ($('showPanel') && !$('showPanel').hidden) return;
    e.preventDefault(); setOpen(false); btn.focus();
  });
  document.addEventListener('pointerdown', e => {
    if (panel.hidden) return;
    if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) setOpen(false);
  });
})();


function rod(from, to, radius, mat) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10, 1), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
function dashedRod(from, to, radius, mat, n) {
  const grp = new THREE.Group();
  for (let i = 0; i < n; i++) { const f0 = i / n, f1 = (i + 0.55) / n; grp.add(rod(from.map((v, k) => v + (to[k] - v) * f0), from.map((v, k) => v + (to[k] - v) * f1), radius, mat)); }
  return grp;
}

/* ---------- Shaders: muscle state by activation (act) and recovery (rec) times ----------
   The same flat look as the 2D ECG Conduction page. One colour family per meaning, each with its own pattern
   (Ed is red-green colour blind, so colour is never the only cue):
   resting: flat pale grey;
   depolarisation front in muscle (slow, cell to cell): bold orange hatching (as the 2D page's orange hatch);
   depolarised: pale blue wash with small blue dots ("still depolarised");
   repolarising: thin dark grey dashes on grey.
   The fast route (His bundle, bundle branches, Purkinje fibres) is drawn on the tubes, not the muscle (see TUBE_FS).
   Patterns are in screen space and antialiased; vertex times are smoothed so the band is one clean line. */
const U = {
  uT: { value: 0 }, uPx: { value: 1 }, uFront: { value: 16 }, uRepol: { value: 45 },
  cRest: { value: new THREE.Color(0xDCDAD6) }, cFront: { value: new THREE.Color(0xE0701E) },
  cDep: { value: new THREE.Color(0xC9D9E8) }, cDot: { value: new THREE.Color(0x005A9E) },
  cCav: { value: new THREE.Color(0xFFFFFF) }, cEdge: { value: new THREE.Color(0x6B7075) }
};
const STATE_GLSL = `
uniform float uT; uniform float uPx; uniform float uFront; uniform float uRepol;
uniform vec3 cRest; uniform vec3 cFront; uniform vec3 cDep; uniform vec3 cDot;
// w = how much act changes per screen pixel (fwidth, computed by the caller in uniform control flow)
vec3 stateCol(float act, float rec, float w) {
  vec2 fc = gl_FragCoord.xy / uPx;
  if (uT < act) return cRest;                                   // resting: flat pale grey
  if (uT < act + uFront) {                                      // slow front: bold orange hatching on a light orange wash
    float h = mod(fc.x + fc.y, 9.0);                            // '////' lines, 9 px apart (the 2D page's orange hatch)
    float line = smoothstep(0.0, 0.9, h) * (1.0 - smoothstep(2.6, 3.5, h));
    vec3 base = mix(cRest, cFront, 0.30);
    float e = min(uT - act, act + uFront - uT) / w;             // thin orange edge lines (about 1.5 px)
    return mix(cFront, mix(base, cFront, line), smoothstep(0.6, 1.6, e));
  }
  if (uT < rec) {                                               // still depolarised: pale blue wash with small blue dots
    vec2 c = mod(fc + vec2(0.0, 5.0) * step(10.0, mod(fc.x, 20.0)), 10.0) - 5.0;
    return mix(cDep, cDot, 1.0 - smoothstep(1.4, 2.2, length(c)));
  }
  if (uT < rec + uRepol) {                                      // repolarising: thin dark grey dashes
    float s = mod(fc.x - fc.y, 12.0);                           // '\\\\' dashes, the other way from the front's hatching
    float t = mod(fc.x + fc.y, 18.0);
    float dash = smoothstep(0.0, 0.9, s) * (1.0 - smoothstep(2.0, 2.9, s)) * step(5.0, t);
    return mix(cRest, vec3(0.039, 0.047, 0.058), dash);
  }
  return cRest;
}`;
const MUSCLE_VS = `
attribute float aAct; attribute float aRec;
varying float vAct; varying float vRec; varying vec3 vView;
#include <clipping_planes_pars_vertex>
void main() {
  vAct = aAct; vRec = aRec;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vView = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const MUSCLE_FS = `
varying float vAct; varying float vRec; varying vec3 vView;
${STATE_GLSL}
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  float sh = 0.84 + 0.16 * max(dot(n, normalize(vec3(0.35, 0.55, 1.0))), 0.0); // gentle shading: flat, like the 2D page
  if (!gl_FrontFacing) sh *= 0.8;
  float w = max(fwidth(vAct), 1e-3);
  float isFront = (uT >= vAct && uT < vAct + uFront) ? 1.0 : 0.0;
  float effSh = mix(sh, 1.0, isFront); // slow cell-to-cell front stays unlit so orange matches the colour key
  gl_FragColor = vec4(stateCol(vAct, vRec, w) * effSh, 1.0);
  #include <colorspace_fragment>
}`;
const SECTION_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SECTION_FS = `
varying vec2 vUv; uniform sampler2D uMask; uniform sampler2D uTimes; uniform vec2 uTSize; uniform vec3 cCav; uniform vec3 cEdge;
uniform float uRingV; uniform float uRingHalf;
${STATE_GLSL}
vec2 times(vec2 uv) { // manual bilinear blend of activation / recovery on the voxel grid (values are dilated outside the muscle)
  vec2 p = uv * uTSize - 0.5; vec2 f = fract(p); vec2 b = (floor(p) + 0.5) / uTSize;
  vec2 dx = vec2(1.0 / uTSize.x, 0.0), dy = vec2(0.0, 1.0 / uTSize.y);
  vec2 a = texture2D(uTimes, b).rg, c = texture2D(uTimes, b + dx).rg, d = texture2D(uTimes, b + dy).rg, e = texture2D(uTimes, b + dx + dy).rg;
  return mix(mix(a, c, f.x), mix(d, e, f.x), f.y);
}
void main() {
  vec2 m = texture2D(uMask, vUv).rg;              // r: inside the heart outline, g: muscle (linear filtered, so edges are smooth)
  vec2 ar = times(vUv);
  float w = max(fwidth(ar.x), 1e-3);
  float fr = max(fwidth(m.r), 1e-4), fg = max(fwidth(m.g), 1e-4);
  float fv = max(fwidth(vUv.y), 1e-6);
  if (m.r < 0.5 - fr) discard;
  vec3 col = mix(cCav, stateCol(ar.x, ar.y, w), smoothstep(0.5 - fg, 0.5 + fg, m.g));
  // fibrous AV ring: a white insulating band with grey hatching at the valve plane (no muscle conducts across it)
  float dv = abs(vUv.y - uRingV) - uRingHalf;
  float ring = 1.0 - smoothstep(-fv, fv, dv);
  float hatch = step(mod(gl_FragCoord.x / uPx + gl_FragCoord.y / uPx, 6.0), 1.6);
  vec3 ringCol = mix(vec3(1.0), cEdge, hatch * 0.8);
  float ringLine = 1.0 - smoothstep(0.5, 1.4, abs(dv) / fv);
  col = mix(col, ringCol, ring * step(0.5, m.r));
  col = mix(col, cEdge, ringLine * step(0.5, m.r));
  float line = 1.0 - smoothstep(0.6, 1.6, min(abs(m.r - 0.5) / fr, abs(m.g - 0.5) / fg));
  gl_FragColor = vec4(mix(col, cEdge, line), 1.0);
  #include <colorspace_fragment>
}`;
/* Conduction tubes (the fast route). Idle: slim slate grey. The impulse: a fat blue streak with a white head that
   points the way it travels. Once conducted: blue. Routes timed with the atrial muscle around them (the internodal
   routes) use the slow, orange family instead, so fast and slow never share a colour. */
const TUBE_VS = `
attribute float aT; attribute float aW; uniform float uT; uniform float uOut; uniform float uBulge;
varying float vT; varying float vW;
void main() {
  vT = aT; vW = aW;
  float p = (uT >= aT && uT < aT + aW) ? 1.0 : 0.0;
  vec3 pos = position + normal * (uBulge * p + uOut);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
const TUBE_FS = `
varying float vT; varying float vW; uniform float uT; uniform float uOut; uniform vec3 cIdle; uniform vec3 cDone; uniform vec3 cPulse;
void main() {
  if (uOut > 0.0) {
    gl_FragColor = vec4(0.0056, 0.0056, 0.0056, 1.0);
  } else {
    vec3 c = cIdle;
    if (uT >= vT && uT < vT + vW) c = (uT - vT) < 0.22 * vW ? vec3(1.0) : cPulse; // white head, then the coloured streak
    else if (uT >= vT + vW) c = cDone;
    gl_FragColor = vec4(c, 1.0);
  }
  #include <colorspace_fragment>
}`;
const CIDLE = new THREE.Color(0x7B8189), CDONE = new THREE.Color(0x4F84A8), CPULSE = new THREE.Color(0x005A9E);
const SIDLE = new THREE.Color(0xA3A8AE), SDONE = new THREE.Color(0xEDB497), SPULSE = new THREE.Color(0xE0701E); // slow (cell-to-cell) routes
function tubeMats(radius, slow) {
  const mk = (out) => new THREE.ShaderMaterial({
    uniforms: { uT: U.uT, uOut: { value: out }, uBulge: { value: radius * 0.8 }, cIdle: { value: slow ? SIDLE : CIDLE }, cDone: { value: slow ? SDONE : CDONE }, cPulse: { value: slow ? SPULSE : CPULSE } },
    vertexShader: TUBE_VS, fragmentShader: TUBE_FS, depthTest: false, depthWrite: false, side: out > 0 ? THREE.BackSide : THREE.FrontSide
  });
  return [mk(0), mk(Math.max(0.010, radius * 0.3))];
}
/* Apply the site colour-blind (or default) palette to the 3D materials, colour key and ECG cursor, live. */
function applyColourTheme() {
  const T = THEMES[isColourBlindTheme() ? 'colour-blind' : 'default'];
  U.cRest.value.setHex(T.rest); U.cFront.value.setHex(T.front); U.cDep.value.setHex(T.dep); U.cDot.value.setHex(T.dot);
  CIDLE.setHex(T.condIdle); CDONE.setHex(T.condDone); CPULSE.setHex(T.pulse); SPULSE.setHex(T.front);
  COL.blue = T.node; COL.paleBlue = T.condIdle; COL.orange = T.front; COL.leadGrey = T.leadGrey; COL.grey = T.grey;
  PAPER.cursor = hex6(T.cursor);
  const r = (T.cursor >> 16) & 255, g = (T.cursor >> 8) & 255, b = T.cursor & 255;
  PAPER.shade = `rgba(${r}, ${g}, ${b}, 0.10)`;
  const root = document.documentElement;
  root.style.setProperty('--ecg3d-rest', hex6(T.rest));
  root.style.setProperty('--ecg3d-front', hex6(T.front));
  root.style.setProperty('--ecg3d-dep', hex6(T.dep));
  root.style.setProperty('--ecg3d-dot', hex6(T.dot));
  root.style.setProperty('--ecg3d-cond-idle', hex6(T.condIdle));
  root.style.setProperty('--ecg3d-cond-done', hex6(T.condDone));
  root.style.setProperty('--ecg3d-pulse', hex6(T.pulse));
  root.style.setProperty('--ecg3d-node', hex6(T.node));
  root.style.setProperty('--ecg3d-cursor', hex6(T.cursor));
  // the tube materials share CIDLE, CDONE, CPULSE and SPULSE, so they follow the theme without a loop
  if (avRing && avRing.material && avRing.material.color) avRing.material.color.setHex(T.node);
  if (typeof setLeadStyles === 'function' && renderer) setLeadStyles();
  if (typeof updateScene === 'function' && MODEL && renderer) updateScene();
  if (typeof TRACE === 'object' && TRACE && Object.keys(TRACE).length) { drawECG(); drawMini(); drawZoom(); }
  needsRender = true;
}


/* ---------- Heart: four opaque chambers, septum, cut-away section ---------- */
let svcMesh = null, heart, shells = [], sectionMesh = null, sectionTex = null, CUT_PLANE = null;
const SECTION_Z = 0.05; // heart-local z of the cut-away (a four-chamber section)
const REGION_ELEMS = {}; ['S', 'LV', 'RV', 'RA', 'LA'].forEach(r => { REGION_ELEMS[r] = []; });
for (let e = 0; e < NE; e++) REGION_ELEMS[ELEM.region[e]].push(e);
const FIN = v => (isFinite(v) ? v : 1e6);
function shellGeometry(name, clamp, w = 56, h = 36) {
  const s = SHAPES[name]; const g = new THREE.SphereGeometry(1, w, h); const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = s.c[1] + s.r[1] * pos.getY(i), f = taperOf(s, y);
    const p = [s.c[0] + s.r[0] * f * pos.getX(i), y, s.c[2] + s.r[2] * f * pos.getZ(i)];
    clamp(p); pos.setXYZ(i, p[0], p[1], p[2]);
  }
  g.computeVertexNormals(); return g;
}
function septumGeometry() {
  const s = SHAPES.S; const g = new THREE.CylinderGeometry(1, 1, 2 * SEPT, 40, 1); const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { // cylinder axis y -> heart x; circle in (x, z) -> heart (y, z)
    const p = [pos.getY(i), s.c[1] + s.r[1] * pos.getX(i), s.c[2] + s.r[2] * pos.getZ(i)];
    p[1] = Math.min(p[1], 0); pos.setXYZ(i, p[0], p[1], p[2]);
  }
  g.computeVertexNormals(); return g;
}
function toSeptum(p, side) { // clamp a vertex onto the interatrial septum plane if it lies on the other atrium's side
  const d = atrialSide(p); if (d * side < 0) { p[0] -= ASEPT.n[0] * d; p[2] -= ASEPT.n[2] * d; }
}
function outlineGeometry(g, w) { // inverted hull: push every vertex out along its normal
  const o = g.clone(); const pos = o.attributes.position, nor = o.attributes.normal;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * w, pos.getY(i) + nor.getY(i) * w, pos.getZ(i) + nor.getZ(i) * w);
  return o;
}
function muscleMaterial() {
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: MUSCLE_VS, fragmentShader: MUSCLE_FS, side: THREE.DoubleSide, clipping: true, clippingPlanes: ui.cut ? [CUT_PLANE] : [] });
}
function buildHeart() {
  heart = new THREE.Group(); heart.matrixAutoUpdate = false; heart.matrix.copy(HEART_VIS); scene.add(heart);
  CUT_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, -1), SECTION_Z).applyMatrix4(HEART_VIS); // keep heart-local z <= SECTION_Z
  const defs = [
    { name: 'LV', region: 'LV', geo: shellGeometry('LV', p => { p[1] = Math.min(p[1], -0.004); p[0] = Math.max(p[0], -SEPT + 0.004); }) },
    { name: 'RV', region: 'RV', geo: shellGeometry('RV', p => { p[1] = Math.min(p[1], -0.004); p[0] = Math.min(p[0], -SEPT - 0.004); }), off: 1 },
    { name: 'S', region: 'S', geo: septumGeometry(), off: 2 },
    { name: 'RA', region: 'RA', geo: shellGeometry('RA', p => { p[1] = Math.max(p[1], ATRIA_Y0); toSeptum(p, -1); }, 48, 32), off: 1 },
    { name: 'LA', region: 'LA', geo: shellGeometry('LA', p => { p[1] = Math.max(p[1], ATRIA_Y0); toSeptum(p, 1); }, 48, 32) }
  ];
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x4E5968, side: THREE.BackSide, clippingPlanes: ui.cut ? [CUT_PLANE] : [] });
  for (const d of defs) {
    const n = d.geo.attributes.position.count;
    d.geo.setAttribute('aAct', new THREE.BufferAttribute(new Float32Array(n), 1));
    d.geo.setAttribute('aRec', new THREE.BufferAttribute(new Float32Array(n), 1));
    const near = new Int32Array(n); const v = d.geo.attributes.position;
    for (let i = 0; i < n; i++) near[i] = nearestIn([v.getX(i), v.getY(i), v.getZ(i)], REGION_ELEMS[d.region]);
    const mesh = new THREE.Mesh(d.geo, muscleMaterial());
    if (d.off) { mesh.material.polygonOffset = true; mesh.material.polygonOffsetFactor = d.off; mesh.material.polygonOffsetUnits = d.off * 2; }
    const outline = new THREE.Mesh(outlineGeometry(d.geo, 0.016), outlineMat); // slim slate outline, like the 2D page
    heart.add(mesh, outline);
    shells.push({ ...d, mesh, outline, near });
  }
  // cut-away section: a smooth mask from the analytic shapes (4 texels per voxel) and the activation and recovery
  // times on the voxel grid, blended bilinearly, so the cut face reads as clean flat fills with a thin outline
  const MS = 6, TW = NX * MS, TH = NY * MS, x0 = GX0, y0 = GY0, W = (NX - 1) * H, Hh = (NY - 1) * H;
  const mask = new Uint8Array(TW * TH * 4);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    let cin = 0, cmu = 0; const k = (j * TW + i) * 4; // 4 x 4 supersampled coverage, so the filtered edge is a smooth curve
    for (let sj = 0; sj < 4; sj++) for (let si = 0; si < 4; si++) {
      const r = regionOf([x0 + (i + (si + 0.5) / 4) * W / TW, y0 + (j + (sj + 0.5) / 4) * Hh / TH, SECTION_Z]);
      if (r) { cin++; if (r !== 'LVc' && r !== 'RVc') cmu++; } }
    mask[k] = Math.round(cin / 16 * 255); mask[k + 1] = Math.round(cmu / 16 * 255); mask[k + 3] = 255;
  }
  const maskTex = new THREE.DataTexture(mask, TW, TH, THREE.RGBAFormat, THREE.UnsignedByteType);
  maskTex.magFilter = THREE.LinearFilter; maskTex.minFilter = THREE.LinearFilter; maskTex.needsUpdate = true;
  sectionTex = new THREE.DataTexture(new Float32Array(NX * NY * 4), NX, NY, THREE.RGBAFormat, THREE.FloatType);
  sectionTex.magFilter = THREE.NearestFilter; sectionTex.minFilter = THREE.NearestFilter;
  const kz = Math.round((SECTION_Z - GZ0) / H), cellEl = new Int32Array(NX * NY).fill(-1);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) for (const dk of [0, -1, 1]) { const e = elemOfCell[gridIdx(i, j, kz + dk)]; if (e >= 0) { cellEl[j * NX + i] = e; break; } }
  for (let it = 0; it < 6; it++) { const prev = cellEl.slice(); // dilate so that blending at the muscle edge never pulls in empty cells
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { if (prev[j * NX + i] >= 0) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < NX && b < NY && prev[b * NX + a] >= 0) { cellEl[j * NX + i] = prev[b * NX + a]; break; } } } }
  sectionTex.userData = { cellEl };
  const smat = new THREE.ShaderMaterial({
    uniforms: { ...U, uMask: { value: maskTex }, uTimes: { value: sectionTex }, uTSize: { value: new THREE.Vector2(NX, NY) }, uRingV: { value: (ATRIA_Y0 - y0) / Hh }, uRingHalf: { value: 0.022 / Hh } }, vertexShader: SECTION_VS, fragmentShader: SECTION_FS, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 // the cut face always wins over the clipped walls behind it
  });
  smat.extensions = { derivatives: true };
  sectionMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), smat);
  sectionMesh.position.set(x0 + W / 2, y0 + Hh / 2, SECTION_Z); sectionMesh.visible = ui.cut;
  heart.add(sectionMesh);
  const toWorld = (x, y, z) => () => new THREE.Vector3(x, y, z).applyMatrix4(HEART_VIS);
  // Anchors come from the model: chamber centroids, or a point 0.6 of the way from the
  // centroid to the ellipsoid surface along an anatomical direction (not a screen offset).
  const shapeAnchor = (name, dir) => {
    const S = SHAPES[name];
    let p = S.c;
    if (dir) {
      const d = unit(dir[0], dir[1], dir[2]);
      const f = taperOf(S, S.c[1]);
      const rx = S.r[0] * f, ry = S.r[1], rz = S.r[2] * f;
      const t = 0.6 / Math.sqrt((d[0] / rx) * (d[0] / rx) + (d[1] / ry) * (d[1] / ry) + (d[2] / rz) * (d[2] / rz));
      p = [S.c[0] + d[0] * t, S.c[1] + d[1] * t, S.c[2] + d[2] * t];
    }
    return toWorld(p[0], p[1], p[2]);
  };
  addLabel('Left ventricle', 'heart', shapeAnchor('LV', [1, -0.5, -0.2])).tag = 'LV';
  addLabel('Right ventricle', 'heart', shapeAnchor('RV', [-1, -0.25, 0.7])).tag = 'RV';
  addLabel('Right atrium', 'heart', shapeAnchor('RA', [-0.7, 0.15, 0.7])).tag = 'RA';
  addLabel('Left atrium', 'heart', shapeAnchor('LA', [0.7, 0.35, -0.8])).tag = 'LA';
  addLabel('Septum', 'heart', shapeAnchor('S')).tag = 'S';
  // superior vena cava (drawn only, not electrical): the SA node sits where it joins the right atrium
  const svcPts = [[-0.40, 0.45, 0.05], [-0.40, 0.95, 0.02], [-0.40, 1.25, 0.0]];
  const svcGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(svcPts.map(p => new THREE.Vector3(...p))), 12, 0.17, 20, false);
  const svc = new THREE.Mesh(svcGeo, new THREE.MeshLambertMaterial({ color: 0xE6E4E0 }));
  const svcOut = new THREE.Mesh(outlineGeometry(svcGeo, 0.016), new THREE.MeshBasicMaterial({ color: 0x4E5968, side: THREE.BackSide }));
  heart.add(svc, svcOut); svcMesh = svc;
  addLabel('Superior vena cava', 'heart', toWorld(-0.40, 0.95, 0.02)).tag = 'svc';
  addLabel('Fibrous AV ring', 'heart', toWorld(0.62, ATRIA_Y0, SECTION_Z)).tag = 'ring';
}
function nearestInGrid(p, region) { // nearest element of a region, searching the voxel grid near p
  const i0 = Math.round((p[0] - GX0) / H), j0 = Math.round((p[1] - GY0) / H), k0 = Math.round((p[2] - GZ0) / H);
  let best = -1, bd = Infinity;
  for (let rr = 1; rr <= 4 && best < 0; rr++) for (let dk = -rr; dk <= rr; dk++) for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
    const a = i0 + di, b = j0 + dj, c = k0 + dk; if (a < 0 || b < 0 || c < 0 || a >= NX || b >= NY || c >= NZ) continue;
    const e = elemOfCell[gridIdx(a, b, c)]; if (e < 0 || ELEM.region[e] !== region) continue;
    const q = ELEM.pos[e]; const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2; if (d < bd) { bd = d; best = e; }
  }
  return best >= 0 ? best : nearestIn(p, REGION_ELEMS[region]);
}
function smoothVertexTimes(sh, arr, iters = 4) { // average each vertex with its mesh neighbours: removes voxel speckle in the front band
  if (!sh.adj) {
    const n = arr.length, idx = sh.geo.index.array, pos = sh.geo.attributes.position, key = i => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const weld = new Int32Array(n), first = new Map(); for (let i = 0; i < n; i++) { const k = key(i); if (!first.has(k)) first.set(k, i); weld[i] = first.get(k); }
    const nb = Array.from({ length: n }, () => new Set());
    for (let t = 0; t < idx.length; t += 3) { const a = weld[idx[t]], b = weld[idx[t + 1]], c = weld[idx[t + 2]]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
    sh.adj = { weld, nb: nb.map(x => [...x]) };
  }
  const { weld, nb } = sh.adj; let cur = Float32Array.from(arr);
  for (let it = 0; it < iters; it++) { const nx = cur.slice();
    for (let i = 0; i < cur.length; i++) { if (weld[i] !== i || !nb[i].length) continue; let sum = cur[i] * 2, c = 2; for (const j of nb[i]) { sum += cur[j]; c++; } nx[i] = sum / c; }
    for (let i = 0; i < cur.length; i++) nx[i] = nx[weld[i]]; cur = nx; }
  arr.set(cur);
}
function applyMuscleTimes() { // after rebuildModel(): copy activation and recovery times to the 3D muscle
  if (!renderer) return;
  for (const s of shells) {
    const A = s.geo.attributes.aAct, R = s.geo.attributes.aRec;
    for (let i = 0; i < s.near.length; i++) { A.array[i] = Math.min(5000, FIN(MODEL.act[s.near[i]])); R.array[i] = Math.min(5000, FIN(MODEL.rec[s.near[i]])); }
    smoothVertexTimes(s, A.array); smoothVertexTimes(s, R.array);
    A.needsUpdate = true; R.needsUpdate = true;
  }
  const { cellEl } = sectionTex.userData; const d = sectionTex.image.data; const CAP = 5000;
  for (let k = 0; k < cellEl.length; k++) { const e = cellEl[k]; d[k * 4] = e >= 0 ? Math.min(CAP, FIN(MODEL.act[e])) : CAP; d[k * 4 + 1] = e >= 0 ? Math.min(CAP, FIN(MODEL.rec[e])) : CAP; d[k * 4 + 2] = 1; d[k * 4 + 3] = 1; }
  for (let pass = 0; pass < 2; pass++) { const src = d.slice(); // light 3 x 3 blur: the lattice times have small plateaus that show as steps
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { if (cellEl[j * NX + i] < 0) continue;
      for (const ch of [0, 1]) { let sum = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NY || cellEl[b * NX + a] < 0) continue; const v = src[(b * NX + a) * 4 + ch]; if (v >= CAP) continue; sum += v; n++; }
        if (n) d[(j * NX + i) * 4 + ch] = sum / n; } } }
  sectionTex.needsUpdate = true;
}
function setCut(on) {
  ui.cut = on; if ($('toggleCut')) $('toggleCut').setAttribute('aria-pressed', String(on));
  if (typeof syncShowUi === 'function') syncShowUi();
  if (!renderer) return;
  for (const s of shells) { s.mesh.material.clippingPlanes = on ? [CUT_PLANE] : []; s.mesh.material.needsUpdate = true; }
  shells[0].outline.material.clippingPlanes = on ? [CUT_PLANE] : []; shells[0].outline.material.needsUpdate = true;
  sectionMesh.visible = on; needsRender = true;
}

/* ---------- Conduction system: tubes, nodes, Purkinje fibres, travelling pulses ---------- */
let condParts = [], purkParts = [], beads = [], csMark = null, saNode, avNode, avRing, avRingBack, avLabel, saLabel;
function polyAt(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (s <= L || i === pts.length - 1) { const f = Math.min(1, Math.max(0, s / L)); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
    s -= L;
  }
  return pts[pts.length - 1];
}
function tubeFor(pts, radius, n) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, n, radius, 10, false);
  const cnt = g.attributes.position.count;
  g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(cnt), 1));
  g.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(cnt), 1));
  return { g, n, len: curve.getLength() };
}
function setTubeTimes(tube, t0, t1, wMs) { // the drawn tube spans exactly the model segment's start and end times
  const A = tube.g.attributes.aT, Wt = tube.g.attributes.aW; const ring = 11;
  for (let i = 0; i <= tube.n; i++) for (let k = 0; k < ring; k++) { const idx = i * ring + k; A.array[idx] = FIN(t0 + (i / tube.n) * (t1 - t0)); Wt.array[idx] = wMs; }
  A.needsUpdate = true; Wt.needsUpdate = true;
}
function setTubeTimesAt(tube, times, wMs) { // one time per ring (routes timed by the muscle around them)
  const A = tube.g.attributes.aT, Wt = tube.g.attributes.aW; const ring = 11;
  for (let i = 0; i <= tube.n; i++) for (let k = 0; k < ring; k++) { const idx = i * ring + k; A.array[idx] = FIN(times[i]); Wt.array[idx] = wMs; }
  A.needsUpdate = true; Wt.needsUpdate = true;
}
function nodeMesh(geo, scale) {
  const mat = new THREE.MeshBasicMaterial({ color: CIDLE, depthTest: false, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 22;
  const o = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide, depthTest: false, depthWrite: false }));
  o.scale.setScalar(scale); o.renderOrder = 21; m.add(o);
  return m;
}
function buildConduction() {
  const C = CONDUCTION;
  for (const s of [...(C.bachmann ? [C.bachmann] : []), ...C.segments]) {
    const r = s.fibre ? 0.009 : s.r * 0.75; // slim lines, like the 2D page (the model's own radius is unchanged)
    const tube = tubeFor(s.pts, r, s.fibre ? 24 : 48); const [mat, outMat] = tubeMats(r);
    const mesh = new THREE.Mesh(tube.g, mat), out = new THREE.Mesh(tube.g, outMat);
    mesh.renderOrder = s.fibre ? 18 : 20; out.renderOrder = s.fibre ? 17 : 19; heart.add(out, mesh);
    if (s.fibre) { condParts.push({ s, tube, mesh, out }); continue; } // Purkinje fibres: thin, no label or bead
    const mid0 = polyAt(s.pts, polyLen(s.pts) * (s.id === 'rbb' ? 0.55 : s.id === 'his' ? 0.4 : s.id === 'lbb' ? 0.75 : 0.6));
    const mid = mid0; // the label is placed beside this point with a leader line
    let lbl = null; if (!s.nolabel) { lbl = addLabel(s.label, 'cond', () => new THREE.Vector3(...mid).applyMatrix4(HEART_VIS)); lbl.tag = s.id; }
    const bead = nodeMesh(new THREE.SphereGeometry(Math.max(0.05, s.r * 1.7), 16, 12), 1.3); bead.material.color.set(0xffffff); heart.add(bead);
    condParts.push({ s, tube, mesh, out, lbl }); beads.push({ s, bead });
  }
  // Internodal routes: thin, in the slow (orange) family, because the model times them with the atrial muscle around them
  for (const s of (C.internodal || [])) {
    const r = 0.014, tube = tubeFor(s.pts, r, 48); const [mat, outMat] = tubeMats(r, true);
    const mesh = new THREE.Mesh(tube.g, mat), out = new THREE.Mesh(tube.g, outMat);
    mesh.renderOrder = 18; out.renderOrder = 17; heart.add(out, mesh);
    let lbl = null;
    if (s.id === 'inM') { const mid = polyAt(s.pts, polyLen(s.pts) * 0.45); lbl = addLabel('Internodal routes', 'cond', () => new THREE.Vector3(...mid).applyMatrix4(HEART_VIS)); lbl.tag = 'inter'; }
    condParts.push({ s, tube, mesh, out, lbl, internodal: true });
  }
  // Coronary sinus opening (landmark only): a small white disc with a dashed-looking slate rim, always facing the viewer
  if (C.csOstium) {
    csMark = new THREE.Mesh(new THREE.CircleGeometry(0.07, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false }));
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.092, 28, 1), new THREE.MeshBasicMaterial({ color: 0x4E5968, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    csMark.renderOrder = 21; rim.renderOrder = 21; csMark.add(rim); scene.add(csMark);
    addLabel('Coronary sinus (opening)', 'heart', () => new THREE.Vector3(...C.csOstium).applyMatrix4(HEART_VIS)).tag = 'cs';
  }
  saNode = nodeMesh(new THREE.OctahedronGeometry(0.11), 1.3); saNode.position.set(...C.sa); heart.add(saNode);
  avNode = nodeMesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), 1.3); avNode.position.set(...C.av); heart.add(avNode);
  saLabel = addLabel('SA node', 'node', () => new THREE.Vector3(...C.sa).applyMatrix4(HEART_VIS)); saLabel.tag = 'sa';
  avLabel = addLabel('AV node', 'node', () => new THREE.Vector3(...C.av).applyMatrix4(HEART_VIS)); avLabel.tag = 'av';
  // AV delay gauge: a ring that fills while the impulse is held in the AV node
  avRingBack = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.46, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  avRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.44, 48, 1, Math.PI / 2, 0.01), new THREE.MeshBasicMaterial({ color: COL.blue, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  avRingBack.renderOrder = 23; avRing.renderOrder = 24; scene.add(avRingBack, avRing);
  const edge = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.49, 48), new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  edge.renderOrder = 23; avRingBack.add(edge);
  // Representative subendocardial point: mid-path of the LV apical Purkinje fibre (pLapex) in the model.
  const purkPts = CONDUCTION.segments.find(s => s.id === 'pLapex').pts;
  const purkMid = polyAt(purkPts, polyLen(purkPts) * 0.5);
  const pl = addLabel('Purkinje fibres', 'cond', () => new THREE.Vector3(...purkMid).applyMatrix4(HEART_VIS)); pl.tag = 'purk';
  condParts.push({ lbl: pl });
  buildPurkinje();
}
// Internodal route times: the activation time of the atrial muscle under each ring (never earlier than the ring before)
function internodalTimes(s, n) {
  const len = polyLen(s.pts), out = []; let prev = -Infinity;
  for (let i = 0; i <= n; i++) { const e = nearestElem(polyAt(s.pts, len * i / n), 0); const t = Math.max(prev, MODEL.act[e]); out.push(t); prev = t; }
  return out;
}
function buildPurkinje() {} // the Purkinje fibres are drawn segments of CONDUCTION (fibre: true), timed like the bundles
function applyConductionTimes() {
  if (!renderer) return;
  for (const c of condParts) {
    if (!c.s) continue;
    if (c.internodal) { const t = internodalTimes(c.s, c.tube.n); setTubeTimesAt(c.tube, t, 14); continue; }
    const sg = MODEL.seg[c.s.id]; setTubeTimes(c.tube, sg.start, sg.end, 0.18 / sg.v);
  }
  buildPurkinje();
}
/* Which structures are active at time t (for 'labels only for the active structure') */
let ACTIVE_RANGES = null;
function buildActiveRanges() {
  const R = {}; const M = MODEL;
  for (const r of ['RA', 'LA', 'S', 'LV', 'RV']) {
    let a0 = Infinity, a1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (const e of REGION_ELEMS[r]) { const a = M.act[e], q = M.rec[e]; if (!isFinite(a)) continue; a0 = Math.min(a0, a); a1 = Math.max(a1, a); r0 = Math.min(r0, q); r1 = Math.max(r1, q); }
    R[r] = (r === 'RA' || r === 'LA' || r === 'S') ? [[a0, a1 + 4]] : [[a0, a1 + 4], [r0, r1 + 20]];
  }
  R.sa = [[CONDUCTION.saTime - 2, CONDUCTION.saTime + 22]]; R.svc = R.sa;
  R.av = [[M.tAV, M.tHis]];
  let p0 = Infinity, p1 = -Infinity; for (const s of CONDUCTION.segments) { const sg = M.seg[s.id]; R[s.id] = [[sg.start, sg.end + 4]]; if (s.fibre) { p0 = Math.min(p0, sg.start); p1 = Math.max(p1, sg.end); } }
  if (M.seg.bach) R.bach = [[M.seg.bach.start, M.seg.bach.end + 4]];
  R.inter = [[CONDUCTION.saTime, M.tAV + 4]]; R.cs = R.av; R.ring = [[M.tAV, M.tHis + 4]];
  R.purk = [[p0, p1 + 6]];
  ACTIVE_RANGES = R;
}
function isActive(tag, t) { const r = ACTIVE_RANGES && ACTIVE_RANGES[tag]; return !!r && r.some(([a, b]) => t >= a && t <= b); }
function labelGroupOf(L) {
  if (L.cls === 'lead' || L === frontLabel) return 'leads';
  if (L.cls === 'vec' || L.cls === 'proj') return 'vectors';
  if (L.cls === 'region') return 'walls';
  if (L.cls === 'cond' || L.cls === 'node') return 'conduction';
  if (L.cls === 'heart') return 'chambers';
  return null;
}
function groupOn(name) { return ui.labelMode === 'custom' && !!ui.labelGroups[name]; }
function itemOn(id) {
  if (!id) return true;
  if (!ui.labelItems || ui.labelItems[id] === undefined) return true;
  return !!ui.labelItems[id];
}
function labelItemId(L) {
  if (!L) return null;
  if (L.leadId) return 'lead-' + L.leadId;
  if (L.tag === 'laf' || L.tag === 'lpf') return 'fascicles';
  if (L.tag) return L.tag;
  if (L.cls === 'landmark') {
    const t = (L.el && L.el.textContent) || '';
    if (t === 'Apex') return 'apex';
    if (t === 'Base') return 'base';
    if (t === 'Anterior') return 'anterior';
    if (t === 'Aorta') return 'aorta';
  }
  if (L.cls === 'region') return 'wall';
  if (L.cls === 'vec') return 'vec';
  return null;
}
function orientationOn() {
  // Guided mode uses the compass caption for "anterior"; landmark pills are only for the custom orientation group.
  if (ui.labelMode === 'custom') return groupOn('orientation');
  return false;
}
const GUIDED_TAGS = {
  rest: [],
  P: ['sa', 'inter', 'bach'],
  avd: ['av', 'cs'],
  his: ['his', 'ring', 'rbb', 'lbb'],
  sep: ['S'],
  main: ['vec'],
  ST: [],
  T: ['vec'],
  TP: []
};
function guidedTags() { return GUIDED_TAGS[phaseAt(state.t).key] || []; }
function applyLabelVisibility() {
  const t = modelPhase();
  const custom = ui.labelMode === 'custom';
  const guided = ui.labelMode === 'guided';
  const showOrient = orientationOn();
  const tags = guided ? guidedTags() : null;
  for (const L of labels) {
    if (L === frontLabel || L.cls === 'lead' || L.cls === 'proj') continue; // those are set in setLeadStyles / updateScene
    if (L.cls === 'vec' || L.cls === 'proj') continue;
    if (L.cls === 'landmark') {
      const iid = labelItemId(L);
      L.visible = showOrient && itemOn(iid);
      continue;
    }
    const g = labelGroupOf(L);
    if (custom) L.visible = groupOn(g) && itemOn(labelItemId(L));
    else if (guided) L.visible = !!(L.tag && tags.includes(L.tag));
    else if (L.tag) L.visible = isActive(L.tag, t);
    const live = !guided && !!(L.tag && isActive(L.tag, t) && (L.cls === 'cond' || L.cls === 'node'));
    L.el.classList.toggle('active', live);
  }
  const walls = groupOn('walls') && itemOn('wall');
  if (regionLabel) regionLabel.visible = walls && regionMeshes.length > 0;
  for (const m of regionMeshes) m.visible = walls;
  if (trail) trail.visible = ui.loop;
  if (chestArc) chestArc.visible = false;
  if (sternumLine) sternumLine.visible = false;
  if (aortaMesh) aortaMesh.visible = false;
  if (torso) torso.visible = true;
}

/* ---------- Torso, leads, vector, projection ---------- */
const TORSO_C = new THREE.Vector3(-0.45, 1.1, -0.3), TORSO_R = new THREE.Vector3(5.0, 6.3, 4.2);
let torso, frontLabel, leadObjs = {}, arrow, trail, projBars = [], projBar, projOut, projLine, projLabel, vecLabel, regionMeshes = [], regionLabel, chestArc, sternumLine, aortaMesh, apexLabel, baseLabel, anteriorLabel;
const arrowTip = new THREE.Vector3();
const VEC_SCALE = 4.0;
const VEC_MIN_LEN = 1.7;   // visible minimum while the vector is non-zero
const VEC_SHAFT_R = 0.08;
const VEC_HEAD_R = 0.20;
const VEC_HEAD_H = 0.72;
const VEC_HIDE = 0.045;    // hide the arrow when the instantaneous magnitude is about zero
const CHEST_IDS = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
function chestPole(id) {
  const p = BASELINE.chestElectrodes[id];
  return new THREE.Vector3(...p).multiplyScalar(VIS_SCALE * 0.85);
}
function chestLeadAnchor(id) {
  if (CHEST_IDS.indexOf(id) < 0) return null;
  const i = CHEST_IDS.indexOf(id);
  const p = chestPole(id);
  const prev = chestPole(CHEST_IDS[Math.max(0, i - 1)]);
  const next = chestPole(CHEST_IDS[Math.min(CHEST_IDS.length - 1, i + 1)]);
  const tangent = next.clone().sub(prev).normalize();
  // Spread V1 and V2 apart along the arc, and push every tag slightly outward from the heart.
  const spread = (i === 0 ? -0.42 : i === 1 ? 0.36 : 0);
  const outward = p.clone().normalize().multiplyScalar(0.38);
  return p.clone().add(outward).addScaledVector(tangent, spread);
}
function letterSprite(ch) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.font = '800 44px "Source Sans 3", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(247,244,238,0.95)'; g.strokeText(ch, 32, 34);
  g.fillStyle = '#222'; g.fillText(ch, 32, 34);
  const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const spr = new THREE.Sprite(mat); spr.scale.set(0.9, 0.9, 0.9); spr.renderOrder = 40;
  return spr;
}

function torsoLine(pts, dashed, opacity) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color: 0x4a4a4a, dashSize: 0.16, gapSize: 0.1, transparent: true, opacity: opacity, depthWrite: false })
    : new THREE.LineBasicMaterial({ color: 0x6a6a6a, transparent: true, opacity: opacity, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  if (dashed) line.computeLineDistances();
  line.renderOrder = 3;
  return line;
}

function ellipsePts(cx, cy, cz, rx, rz, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(cx + rx * Math.cos(a), cy, cz + rz * Math.sin(a)));
  }
  return pts;
}

function buildTorso() {
  torso = new THREE.Group(); torso.name = 'torso';
  // Body coordinates: +x patient's left, +y head, +z anterior. Fitted so V1-V6 sit on the chest wall.
  const cx = 0.35, cz = 0.45;
  const profile = [
    [4.15, 1.02], [3.55, 1.12], [3.15, 1.32],
    [2.85, 2.55], [2.55, 4.85], [2.25, 5.15],
    [1.7, 4.55], [1.0, 4.35], [0.35, 4.4],
    [-0.4, 4.35], [-0.9, 4.28], [-1.6, 4.05],
    [-2.5, 3.7], [-3.4, 3.35], [-4.2, 3.15]
  ];
  const lathe = new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(r, y)), 72);
  const skin = new THREE.Mesh(lathe, new THREE.MeshLambertMaterial({
    color: 0x8d8d8d, transparent: true, opacity: 0.11, side: THREE.DoubleSide,
    depthWrite: false, emissive: 0x9a9a9a, emissiveIntensity: 0.04
  }));
  skin.scale.z = 0.86;
  skin.position.set(cx, 0, cz);
  skin.renderOrder = 1;
  torso.add(skin);
  // A thin outline of the same envelope, so the body still reads when the fill is faint.
  const outline = new THREE.LineSegments(new THREE.WireframeGeometry(lathe), new THREE.LineBasicMaterial({
    color: 0x6a6a6a, transparent: true, opacity: 0.18, depthWrite: false
  }));
  outline.scale.copy(skin.scale); outline.position.copy(skin.position); outline.renderOrder = 2;
  // too dense as a full wireframe; keep only a few meridians later if needed. Skip the wireframe.
  outline.visible = false; torso.add(outline);

  const ribMatOp = 0.08;
  const ribYs = [1.55, 1.05, 0.55, 0.05, -0.45, -0.95, -1.5];
  const ribR =   [4.15, 4.28, 4.35, 4.38, 4.32, 4.22, 4.00];
  for (let i = 0; i < ribYs.length; i++) {
    const rx = ribR[i], rz = ribR[i] * 0.86;
    torso.add(torsoLine(ellipsePts(cx, ribYs[i], cz, rx, rz, 72), false, ribMatOp));
  }
  // Sternum: manubrium and body, between V1 and V2 at the front of the chest.
  const sx = (chestPole('V1').x + chestPole('V2').x) / 2;
  const sz = Math.max(chestPole('V1').z, chestPole('V2').z) + 0.02;
  const sternum = torsoLine([
    new THREE.Vector3(sx, 2.15, sz - 0.15),
    new THREE.Vector3(sx, 1.85, sz),
    new THREE.Vector3(sx, 0.6, sz + 0.05),
    new THREE.Vector3(sx, -0.35, sz),
    new THREE.Vector3(sx, -1.15, sz - 0.08)
  ], false, 0.85);
  sternum.material.color.setHex(0x2a2a2a);
  torso.add(sternum);
  // Manubrium as a short cross-bar at the sternal notch.
  torso.add(torsoLine([
    new THREE.Vector3(sx - 0.45, 1.95, sz - 0.02),
    new THREE.Vector3(sx + 0.45, 1.95, sz - 0.02)
  ], false, 0.8));

  // Clavicles, from the sternal notch out to each shoulder.
  torso.add(torsoLine([
    new THREE.Vector3(sx, 2.15, sz - 0.15),
    new THREE.Vector3(sx - 1.4, 2.45, sz - 0.6),
    new THREE.Vector3(sx - 2.6, 2.55, sz - 1.3),
    new THREE.Vector3(-4.6, 2.5, 0.3)
  ], false, 0.7));
  torso.add(torsoLine([
    new THREE.Vector3(sx, 2.15, sz - 0.15),
    new THREE.Vector3(sx + 1.5, 2.45, sz - 0.5),
    new THREE.Vector3(sx + 2.8, 2.55, sz - 1.2),
    new THREE.Vector3(5.3, 2.5, 0.2)
  ], false, 0.7));

  // Shoulder ovals, faintly.
  torso.add(torsoLine(ellipsePts(-4.55, 2.35, 0.15, 0.85, 0.7, 28), false, 0.45));
  torso.add(torsoLine(ellipsePts(5.2, 2.35, 0.1, 0.85, 0.7, 28), false, 0.45));

  // Nipple line: a dashed curve at the 4th intercostal space (V1/V2 level) across the anterior chest.
  const ny = (chestPole('V1').y + chestPole('V2').y) / 2;
  const nipple = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, x = cx - 3.4 + t * 6.8;
    const xr = x - cx;
    const rz = 4.35 * 0.86;
    const inside = 1 - (xr * xr) / (4.35 * 4.35);
    const z = cz + rz * Math.sqrt(Math.max(0, inside));
    nipple.push(new THREE.Vector3(x, ny, z + 0.04));
  }
  torso.add(torsoLine(nipple, true, 0.7));

  // Patient's right and left marks on the shoulders (letters, not colour).
  const rPos = new THREE.Vector3(-4.7, 2.55, 2.35);
  const lPos = new THREE.Vector3(5.15, 2.55, 2.25);
  torso.userData.rPos = rPos; torso.userData.lPos = lPos;
  const env = [];
  for (let i = 0; i < ribYs.length; i++) {
    const rx = ribR[i], rz = ribR[i] * 0.86, y = ribYs[i];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      env.push(new THREE.Vector3(cx + rx * Math.cos(a), y, cz + rz * Math.sin(a)));
    }
  }
  env.push(rPos.clone(), lPos.clone(), new THREE.Vector3(cx, 3.7, cz));
  torso.userData.envelope = env;
  const rSpr = letterSprite('R'); rSpr.position.copy(rPos); rSpr.visible = false; torso.add(rSpr);
  const lSpr = letterSprite('L'); lSpr.position.copy(lPos); lSpr.visible = false; torso.add(lSpr);

  scene.add(torso);
}

function buildOrientationCues() {
  const pts = CHEST_IDS.map(id => chestPole(id));
  // Extend a little past V1 and V6 so the arc reads as a chest wall, not just the electrodes.
  const v1 = pts[0], v6 = pts[5];
  const pre = v1.clone().add(v1.clone().sub(pts[1]).setY(0).multiplyScalar(0.4));
  const post = v6.clone().add(v6.clone().sub(pts[4]).setY(0).multiplyScalar(0.35));
  const curve = new THREE.CatmullRomCurve3([pre, ...pts, post], false, 'catmullrom', 0.2);
  const arcGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(64));
  chestArc = new THREE.Line(arcGeo, new THREE.LineDashedMaterial({ color: 0x444444, dashSize: 0.18, gapSize: 0.1, transparent: true, opacity: 0.85 }));
  chestArc.computeLineDistances();
  chestArc.renderOrder = 4;
  scene.add(chestArc);
  const midSternum = v1.clone().add(pts[1]).multiplyScalar(0.5);
  midSternum.x *= 0.15; // sit near the midline
  const sternumTop = midSternum.clone().setY(midSternum.y + 1.1);
  const sternumBot = midSternum.clone().setY(midSternum.y - 0.7);
  sternumLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([sternumTop, sternumBot]),
    new THREE.LineDashedMaterial({ color: 0x555555, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.8 }));
  sternumLine.computeLineDistances();
  scene.add(sternumLine);
  // A short, schematic ascending aorta so the base of the heart has a landmark (SVC is already drawn).
  const aoPts = [[0.12, 0.35, 0.12], [0.18, 0.85, 0.08], [0.35, 1.15, -0.05]].map(p => new THREE.Vector3(...p));
  const aoGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(aoPts), 16, 0.14, 12, false);
  aortaMesh = new THREE.Mesh(aoGeo, new THREE.MeshLambertMaterial({ color: 0xC8C8C8 }));
  const aoOut = new THREE.Mesh(aoGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide }));
  // slightly larger outline
  aoOut.scale.setScalar(1.08);
  const aoGrp = new THREE.Group(); aoGrp.add(aortaMesh, aoOut);
  aoGrp.applyMatrix4(HEART_VIS);
  scene.add(aoGrp);
  aortaMesh = aoGrp;
  const toWorld = (x, y, z) => () => new THREE.Vector3(x, y, z).applyMatrix4(HEART_VIS);
  const apexWorld = () => {
    const pts = heartPoints();
    let best = null, minY = Infinity;
    for (const q of pts) { if (q.y < minY) { minY = q.y; best = q; } }
    return (best || new THREE.Vector3(0.32, -2.02, 0.05).applyMatrix4(HEART_VIS)).clone();
  };
  apexLabel = addLabel('Apex', 'landmark', apexWorld, 3);
  baseLabel = addLabel('Base', 'landmark', toWorld(0.05, 0.62, 0.05), 3);
  anteriorLabel = addLabel('Anterior', 'landmark', toWorld(0, 0, 1), 3);
  anteriorLabel.visible = false;
  addLabel('Aorta', 'landmark', toWorld(0.28, 1.05, 0.02), 4);
}

function buildScene() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0xF7F4EE);
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(3, 6, 8); scene.add(dl);
  buildTorso();
  frontLabel = addLabel('Front of chest', 'heart', () => new THREE.Vector3(-2.2, 0, TORSO_C.z + TORSO_R.z + 0.45));
  if (frontLabel) frontLabel.visible = false;

  buildHeart(); buildConduction();

  for (const L of LEADS) {
    const grp = new THREE.Group(); grp.userData.lead = L.id;
    const matPos = new THREE.MeshLambertMaterial({ color: COL.leadGrey }), matNeg = matPos.clone();
    const visO = [VIS_SHIFT.x, VIS_SHIFT.y, VIS_SHIFT.z];
    const pole = L.type === 'limb' ? L.dir.map(v => v * 3.7) : BASELINE.chestElectrodes[L.id].map(v => v * VIS_SCALE * 0.85);
    const neg = L.dir.map((v, i) => visO[i] + v * (L.type === 'limb' ? -3.7 : -3.0));
    const pos = rod(visO, pole, 0.035, matPos), negR = dashedRod(visO, neg, 0.025, matNeg, 9);
    const marker = L.type === 'limb' ? new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), matPos) : new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), matPos);
    marker.position.set(...pole);
    const pick = rod([0, 0, 0], pole, 0.22, new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData.lead = L.id; marker.userData.lead = L.id;
    grp.add(pos, negR, marker, pick); scene.add(grp);
    const lp = pole.map(v => v * 1.1);
    const lbl = addLabel(L.type === 'limb' ? `${L.id} (${L.angle.replace('-', '\u2212')})` : L.id, 'lead', () => chestLeadAnchor(L.id) || new THREE.Vector3(...lp).multiplyScalar(L.type === 'limb' ? limbScale : 1), undefined, { leadId: L.id });
    leadObjs[L.id] = { grp, matPos, matNeg, pos, negR, marker, pick, lbl, pole };
  }
  buildOrientationCues();
  // the arrow's shadow on each selected lead: thick black-and-white striped bar with a black outline
  makeProjBar();
  projLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: COL.black, dashSize: 0.12, gapSize: 0.08, depthTest: false }));
  projLine.renderOrder = 31; scene.add(projLine);
  projLabel = addLabel('', 'proj', () => projLabel.pos);

  arrow = new THREE.Group();
  const am = new THREE.MeshBasicMaterial({ color: COL.black, depthTest: false, depthWrite: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(VEC_SHAFT_R, VEC_SHAFT_R, 1, 16), am); shaft.name = 'shaft';
  const head = new THREE.Mesh(new THREE.ConeGeometry(VEC_HEAD_R, VEC_HEAD_H, 20), am); head.name = 'head';
  shaft.renderOrder = 52; head.renderOrder = 53; arrow.add(shaft, head); scene.add(arrow);
  const halo = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, depthTest: false, depthWrite: false });
  for (const m of [shaft, head]) { const h = new THREE.Mesh(m.geometry, halo); h.scale.set(1.75, m === head ? 1.28 : 1, 1.75); h.renderOrder = 51; m.add(h); }
  const dotS = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), am); dotS.name = 'vecOrigin'; dotS.renderOrder = 52; dotS.position.copy(VIS_SHIFT); scene.add(dotS);
  const dotHalo = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), halo); dotHalo.renderOrder = 51; dotS.add(dotHalo);
  // Fixed label near the origin; it does not travel with the arrow tip.
  vecLabel = addLabel("Heart's electrical vector", 'vec', () => VIS_SHIFT.clone());
  vecLabel.tag = 'vec';
  trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: COL.grey, dashSize: 0.06, gapSize: 0.05, depthTest: false }));
  trail.renderOrder = 29; scene.add(trail);
}

/* Wall the selected lead faces: black wire mesh plus a dashed label (pattern, not colour alone) */
let lastRegionBuilt = null;
function clearRegionMeshes() {
  for (const m of regionMeshes) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); }
  regionMeshes = []; lastRegionBuilt = null;
  if (regionLabel) regionLabel.visible = false;
}
function ensureRegion(region) {
  if (!region || !renderer) { clearRegionMeshes(); return; }
  if (lastRegionBuilt === region && regionMeshes.length) {
    for (const m of regionMeshes) m.visible = true;
    if (regionLabel) regionLabel.visible = true;
    return;
  }
  buildRegion(region);
}
function buildRegion(region) {
  clearRegionMeshes();
  if (!region || !renderer) return;
  const mat = new THREE.LineBasicMaterial({ color: 0x111111, depthTest: false, transparent: true, opacity: 0.22 });
  const centroid = new THREE.Vector3(); let cn = 0; const nm = new THREE.Matrix3().getNormalMatrix(HEART_VIS);
  for (const s of shells) {
    if (region === 'septal' ? s.name !== 'S' : (s.name !== 'LV' && s.name !== 'RV')) continue;
    if (region === 'lateral' && s.name !== 'LV') continue;
    const geo = s.geo, pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index.array;
    const keep = []; const a = new THREE.Vector3(), wn = new THREE.Vector3(), wp = new THREE.Vector3();
    for (let t = 0; t < idx.length / 3; t++) {
      const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
      wn.set(0, 0, 0); for (const ii of [i0, i1, i2]) wn.add(a.fromBufferAttribute(nor, ii)); wn.applyMatrix3(nm).normalize();
      wp.fromBufferAttribute(pos, i0).applyMatrix4(HEART_VIS);
      let ok = region === 'septal' ? Math.abs(pos.getX(i0)) < SEPT * 0.9 : false;
      if (region === 'inferior') ok = wn.y < -0.55;
      if (region === 'lateral') ok = wn.x > 0.6;
      if (region === 'anterior') ok = wn.z > 0.55 && wp.x > -0.4;
      if (ok) { keep.push(i0, i1, i2); centroid.add(wp); cn++; }
    }
    if (!keep.length) continue;
    const sub = new THREE.BufferGeometry(); sub.setAttribute('position', pos); sub.setIndex(keep);
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(sub), mat); wire.renderOrder = 15;
    heart.add(wire); regionMeshes.push(wire);
  }
  if (cn) {
    centroid.multiplyScalar(1 / cn);
    const txt = { inferior: 'Inferior wall', lateral: 'Lateral wall', septal: 'Septum', anterior: 'Anterior wall' }[region];
    if (!regionLabel) regionLabel = addLabel(txt, 'region', () => regionLabel.pos);
    regionLabel.el.textContent = txt;
    const push = { inferior: [0, -0.7, 0.3], lateral: [0.8, 0, 0], septal: [0, 0.2, 0.9], anterior: [0, 0.3, 0.9] }[region];
    regionLabel.pos = centroid.clone().add(new THREE.Vector3(...push)); regionLabel.visible = true;
    regionLabel._bw = regionLabel._bh = 0;
  }
  lastRegionBuilt = region;
}
function isPoleBehind(pole) {
  if (!camera || !pole) return false;
  const p = new THREE.Vector3(...pole);
  const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
  const dPole = p.clone().sub(camera.position).dot(camDir);
  const dCentre = orbit.target.clone().sub(camera.position).dot(camDir);
  return dPole > dCentre + 0.15;
}
function setLeadStyles() {
  if (!renderer) return;
  const view = state.view;
  // Front: limb pills only. Chest-leads view: chest pills only. Free rotate (and custom): both.
  const showLimbPills = view !== 'transverse';
  const showChestPills = view !== 'frontal' && view !== 'section';
  const showLimbRods = view !== 'transverse';
  const showChestRods = view !== 'frontal' && view !== 'section';
  for (const L of LEADS) {
    const o = leadObjs[L.id]; const sel = (state.sels || [state.sel]).includes(L.id);
    const inGroup = L.type === 'limb' ? showLimbRods : showChestRods;
    const showRod = sel || (ui.allLeads && inGroup);
    const inViewPills = L.type === 'limb' ? showLimbPills : showChestPills;
    const noneOn = ui.labelMode === 'custom' && LABEL_GROUPS.every(g => !ui.labelGroups[g]);
    const hideExtraTags = ui.labelMode === 'custom' && !ui.labelGroups.leads && !noneOn;
    const leadItem = itemOn('lead-' + L.id);
    const showPill = sel || (inViewPills && (ui.allLeads || groupOn('leads')) && !hideExtraTags && (!groupOn('leads') || leadItem));
    o.grp.visible = showRod || (L.type === 'chest');
    o.pos.visible = showRod;
    o.negR.visible = showRod && L.type === 'limb';
    o.marker.visible = L.type === 'chest' ? true : showRod;
    if (o.pick) o.pick.visible = showRod || L.type === 'chest';
    for (const m of [o.matPos, o.matNeg]) {
      m.color.setHex(sel ? COL.blue : COL.leadGrey);
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
      m.needsUpdate = true;
    }
    const sc = sel ? 2.6 : 1;
    o.pos.scale.set(sc, 1, sc);
    o.negR.children.forEach(c => c.scale.set(sc, 1, sc));
    o.marker.scale.setScalar(sel ? 1.45 : 1);
    const behind = isPoleBehind(o.pole);
    o.lbl.el.className = 'lbl lead' + (sel ? ' sel' : '') + (behind && !sel ? ' behind' : '');
    const ang = L.angle ? ' (' + L.angle.replace('-', '\u2212') + ')' : '';
    o.lbl.el.textContent = L.type === 'limb' ? (L.id + ang) : L.id;
    if (L.type === 'limb') o.lbl.el.title = L.id + ang;
    o.lbl.el.setAttribute('aria-label', 'Select lead ' + L.id);
    o.lbl.el.setAttribute('aria-pressed', String(!!sel));
    o.lbl.visible = showPill;
  }
  if (frontLabel) frontLabel.visible = false;
  needsRender = true;
}
const _q = new THREE.Vector3();
function makeProjBar() {
  const pg = new THREE.CylinderGeometry(0.07, 0.07, 1, 14);
  const bar = new THREE.Mesh(pg, new THREE.ShaderMaterial({ uniforms: { uLen: { value: 1 } },
    vertexShader: 'varying float vY; void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vY; uniform float uLen; void main() { float s = fract(vY * uLen / 0.3); gl_FragColor = vec4(vec3(s < 0.5 ? 0.07 : 1.0), 1.0); }' }));
  const outline = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide }));
  outline.scale.set(1.45, 1, 1.45);
  bar.material.depthTest = false; bar.material.depthWrite = false;
  outline.material.depthTest = false; outline.material.depthWrite = false;
  // Above the vector arrow (52/53), so a chest-lead shadow is not hidden under the shaft.
  bar.renderOrder = 60; outline.renderOrder = 59; bar.add(outline);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 14), new THREE.MeshBasicMaterial({ color: COL.black, depthTest: false, depthWrite: false }));
  head.name = 'projHead'; head.renderOrder = 61; bar.add(head);
  bar.visible = false; scene.add(bar);
  projBars.push(bar);
  if (!projBar) { projBar = bar; projOut = outline; }
  return bar;
}
function placeProjBar(bar, dir, signedLen) {
  const plen = Math.abs(signedLen);
  bar.visible = true;
  bar.userData.lead = dir._lead || null;
  bar.userData.signed = signedLen;
  bar.material.uniforms.uLen.value = plen;
  bar.scale.set(1, plen, 1);
  // From the heart centre along the lead rod, towards the electrode if the projection
  // is positive and away from it if negative. Same slim width as the limb-lead bars.
  bar.position.copy(VIS_SHIFT).add(dir.clone().multiplyScalar(signedLen * 0.5));
  bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().multiplyScalar(Math.sign(signedLen) || 1));
  const ph = bar.getObjectByName('projHead');
  if (ph) { ph.position.set(0, 0.5, 0); ph.scale.set(1, 1 / Math.max(0.001, plen), 1); }
}
function updateScene() {
  if (!renderer) return;
  const t = modelPhase(), M = MODEL, C = CONDUCTION; U.uT.value = t;
  // nodes
  const saOn = t >= C.saTime && t < C.saTime + 14; saNode.material.color.set(saOn ? 0xffffff : (t >= C.saTime ? CDONE : CIDLE));
  const avHold = t >= M.tAV && t < M.tHis;
  avNode.material.color.set(avHold ? 0xffffff : (t >= M.tHis ? CDONE : CIDLE));
  const avP = avHold ? (t - M.tAV) / (M.tHis - M.tAV) : 0;
  const avW = new THREE.Vector3(...C.av).applyMatrix4(HEART_VIS);
  avRing.visible = avRingBack.visible = avHold;
  if (avHold) {
    avRing.geometry.dispose(); avRing.geometry = new THREE.RingGeometry(0.32, 0.44, 48, 1, Math.PI / 2, -Math.max(0.01, avP * Math.PI * 2));
    for (const m of [avRing, avRingBack]) { m.position.copy(avW); m.quaternion.copy(camera.quaternion); }
  }
  const avTxt = (ui.labelMode !== 'guided' && avHold) ? `AV node: held ${Math.round(t - M.tAV)} of ${Math.round(M.tHis - M.tAV)} ms` : 'AV node';
  if (avLabel.el.textContent !== avTxt) { avLabel.el.textContent = avTxt; avLabel._bw = avLabel._bh = 0; }
  // travelling pulses
  for (const b of beads) {
    const sg = M.seg[b.s.id]; const on = t >= sg.start && t <= sg.end;
    b.bead.visible = on; if (on) b.bead.position.set(...polyAt(b.s.pts, polyLen(b.s.pts) * Math.min(1, (t - sg.start) / Math.max(1e-6, sg.end - sg.start))));
  }
  if (csMark) { csMark.position.copy(new THREE.Vector3(...C.csOstium).applyMatrix4(HEART_VIS)); csMark.quaternion.copy(camera.quaternion); }
  applyLabelVisibility();
  // Heart's electrical vector: always drawn on top, in every view.
  const D = dipole(t); const mag = Math.hypot(...D);
  const shaft = arrow.getObjectByName('shaft'), head = arrow.getObjectByName('head');
  const vecOn = mag > VEC_HIDE;
  arrow.visible = vecOn;
  const originDot = scene.getObjectByName('vecOrigin');
  if (originDot) originDot.visible = vecOn;
  let drawLen = 0;
  if (vecOn) {
    const dir = _q.set(...D).normalize();
    arrow.position.copy(VIS_SHIFT);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    drawLen = Math.max(VEC_MIN_LEN, mag * VEC_SCALE);
    const hl = VEC_HEAD_H;
    shaft.scale.set(1, Math.max(0.001, drawLen - hl), 1);
    shaft.position.set(0, (drawLen - hl) / 2, 0);
    head.scale.setScalar(1);
    head.position.set(0, drawLen - hl / 2, 0);
  }
  if (vecLabel) {
    let showLbl = true;
    if (ui.labelMode === 'guided') showLbl = guidedTags().includes('vec');
    else if (ui.labelMode === 'custom') showLbl = groupOn('vectors') && itemOn('vec');
    vecLabel.visible = vecOn && showLbl;
  }
  arrowTip.set(D[0], D[1], D[2]).multiplyScalar(vecOn ? drawLen / (mag || 1) : 0);
  const pts = []; for (let i = 0; i <= Math.round(t); i += 2) { const d = dipole(i); pts.push(VIS_SHIFT.clone().add(new THREE.Vector3(d[0], d[1], d[2]).multiplyScalar(VEC_SCALE))); }
  trail.geometry.dispose(); trail.geometry = new THREE.BufferGeometry().setFromPoints(pts.length > 1 ? pts : [new THREE.Vector3(), new THREE.Vector3()]); trail.computeLineDistances();
  // The vector's shadow on every selected lead, along that lead's rod (ties to each trace's height).
  // Same black-and-white striped bar for each; no extra labels, so the lead name pills stay readable.
  const shown = [];
  if (vecOn) {
    for (const id of selectedSet()) {
      const L = LEAD[id]; if (!L) continue;
      const u = new THREE.Vector3(...L.dir);
      const p = arrowTip.dot(u);
      u._lead = id;
      shown.push([u, p]);
    }
  }
  while (projBars.length < shown.length) makeProjBar();
  shown.forEach(([u, p], i) => placeProjBar(projBars[i], u, p));
  for (let i = shown.length; i < projBars.length; i++) { projBars[i].visible = false; projBars[i].userData.lead = null; }
  if (projLabel) projLabel.visible = false;
  if (projLine) projLine.visible = false;
  maybeRelayoutForPhase();
  needsRender = true;
}

/* ======================= Camera and interaction ======================= */
let camAnim = null;
function updateGizmo() {
  const g = $('orientAxes'); if (!g || !camera) return;
  camera.updateMatrixWorld();
  const inv = new THREE.Matrix4().copy(camera.matrixWorld).invert();
  const cx = 48, cy = 48, scale = 30;
  const axes = [
    { dir: new THREE.Vector3(0, 1, 0), pos: 'Head', neg: 'Feet', cls: 'axis-hf' },
    { dir: new THREE.Vector3(1, 0, 0), pos: 'L', neg: 'R', cls: 'axis-lr lab-lr' },
    { dir: new THREE.Vector3(0, 0, 1), pos: 'Front', neg: 'Back', cls: 'axis-fb' }
  ];
  const parts = [];
  // Depth-sort so nearer arrows are drawn last
  const drawn = axes.map(a => {
    const v = a.dir.clone().transformDirection(inv);
    return { a, v, depth: v.z };
  }).sort((p, q) => p.depth - q.depth);
  for (const { a, v } of drawn) {
    const x2 = cx + v.x * scale, y2 = cy - v.y * scale;
    const x0 = cx - v.x * scale, y0 = cy + v.y * scale;
    // Arrow along +dir to the positive label; a short tail to the opposite name
    const ang = Math.atan2(y2 - cy, x2 - cx);
    const ah = 6, aw = 3.6;
    const p1x = x2 - Math.cos(ang) * ah + Math.sin(ang) * aw;
    const p1y = y2 - Math.sin(ang) * ah - Math.cos(ang) * aw;
    const p2x = x2 - Math.cos(ang) * ah - Math.sin(ang) * aw;
    const p2y = y2 - Math.sin(ang) * ah + Math.cos(ang) * aw;
    parts.push(`<line class="orient-axis ${a.cls}" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
    parts.push(`<polygon class="orient-head" points="${x2.toFixed(1)},${y2.toFixed(1)} ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)}"/>`);
    const lx = cx + v.x * (scale + 11), ly = cy - v.y * (scale + 11);
    const rx = cx - v.x * (scale + 11), ry = cy + v.y * (scale + 11);
    const labCls = 'orient-lab' + (a.cls.indexOf('lr') >= 0 ? ' lab-lr' : '');
    parts.push(`<text class="${labCls}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${a.pos}</text>`);
    parts.push(`<text class="${labCls}" x="${rx.toFixed(1)}" y="${ry.toFixed(1)}">${a.neg}</text>`);
  }
  g.innerHTML = parts.join('');
}

function placeCamera() {
  const { az, el, r, target } = orbit;
  camera.position.set(target.x + r * Math.cos(el) * Math.sin(az), target.y + r * Math.sin(el), target.z + r * Math.cos(el) * Math.cos(az));
  camera.up.set(0, 1, 0); camera.lookAt(target); needsRender = true;
  if ($('viewNote')) setViewCaption(state.view, VIEWS[state.view]);
  updateGizmo();
  if (renderer && leadObjs && Object.keys(leadObjs).length) setLeadStyles();
  requestLabelLayout(0);
}
function setViewPressed(name) {
  document.querySelectorAll('.view-btn').forEach(b => {
    const on = !!name && b.dataset.view === name;
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('is-current', on);
  });
}
function goView(name, instant) {
  const v = VIEWS[name]; state.view = name;
  setViewPressed(name);
  setViewCaption(name, v); setLeadStyles();
  if (!renderer) return;
  if (name === 'section' && !ui.cut) setCut(true);
  const fit = fitView(v, name); const tgt = fit.target, r = fit.r;
  if (instant || REDUCED) {
    for (const L of labels) { L.px = null; L.py = null; L.colSide = null; }
    orbit.az = v.az; orbit.el = v.el; orbit.r = r; orbit.target.copy(tgt);
    placeCamera();
    if (renderer) updateLabels();
    return;
  }
  const daz = ((v.az - orbit.az) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  orbit.target.copy(tgt);
  camAnim = { t0: performance.now(), from: { az: orbit.az, el: orbit.el, r: orbit.r }, to: { az: orbit.az + daz, el: v.el, r } };
}
/* Frame the heart from its actual drawn outline, tightly, so it stays a similar on-screen size in the shorter stage.
   The look-at and zoom target is the centre of the heart, so the heart sits in the middle of the viewer and zoom moves towards that centre.
   The limb lead rods are then shortened, if needed, so their + ends and labels stay inside the frame. */
let HEART_PTS = null, limbScale = 1;
function heartPoints() {
  if (HEART_PTS) return HEART_PTS;
  scene.updateMatrixWorld(true); HEART_PTS = []; const v = new THREE.Vector3();
  for (const m of [...shells.map(s => s.mesh), svcMesh]) {
    const pos = m.geometry.attributes.position; const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) HEART_PTS.push(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone());
  }
  return HEART_PTS;
}
function heartCentre() {
  const P = heartPoints();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of P) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
  }
  return new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
function setLimbScale(sc) {
  limbScale = sc;
  for (const L of LEADS) { if (L.type !== 'limb') continue; const o = leadObjs[L.id]; o.grp.scale.setScalar(sc); o.marker.scale.setScalar(1 / sc); }
  needsRender = true;
}
function fitView(v, name) {
  const heartP = heartPoints().slice();
  const P = heartP.slice();
  if (name === 'transverse') {
    // Size the frame to the heart and V1-V6. R and L marks stay on screen as HTML overlays.
    for (const id of CHEST_IDS) P.push(chestPole(id).clone());
  }
  if (name === 'transverse') setLimbScale(1);
  const dir = new THREE.Vector3(Math.cos(v.el) * Math.sin(v.az), Math.sin(v.el), Math.cos(v.el) * Math.cos(v.az));
  const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(right).normalize();
  const tf = Math.tan(camera.fov / 2 * DEG), asp = camera.aspect || 1;
  // Tighter frame: about 76% of canvas height (72% in the 3D view).
  const frac = name === 'transverse' ? 0.84 : name === 'oblique' ? 0.72 : 0.76;
  const fracW = name === 'transverse' ? 0.86 : 0.84;
  // Always look at, and zoom towards, the heart's centre, not the torso or a shifted overlay target.
  const target = heartCentre(); let r = 12;
  const ext = (tg, rr, pts) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const q = new THREE.Vector3();
    for (const p of pts) { q.copy(p).sub(tg); const z = rr - q.dot(dir); const x = q.dot(right) / (z * tf * asp), y = q.dot(up) / (z * tf);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, x1, y0, y1 }; };
  for (let it = 0; it < 4; it++) {
    const e2 = ext(target, r, P);
    const k = Math.max((e2.y1 - e2.y0) / 2 / frac, (e2.x1 - e2.x0) / 2 / fracW);
    r = r * k;
  }
  // limb rods: keep each + end (and its label just beyond) inside the frame, except in the chest-leads view
  let sc = 1; const q = new THREE.Vector3();
  if (name !== 'transverse') {
    for (const L of LEADS) {
      if (L.type !== 'limb') continue;
      q.set(...leadObjs[L.id].pole).multiplyScalar(1.12).sub(target);
      const z = r - q.dot(dir); const x = Math.abs(q.dot(right) / (z * tf * asp)), y = Math.abs(q.dot(up) / (z * tf));
      const need = Math.max(x / 0.86, y / 0.86); if (need > 1) sc = Math.min(sc, 1 / need);
    }
  }
  setLimbScale(name === 'transverse' ? 1 : Math.max(0.55, sc));
  return { target, r };
}
function markCustom() {
  if (state.view !== 'custom') { state.view = 'custom'; setViewPressed(null); setViewCaption('custom'); setLeadStyles(); }
}
function initInteraction() {
  let drag = null; const pointers = new Map(); let pinch0 = null;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { x: e.clientX, y: e.clientY, moved: 0 }; camAnim = null;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), r: orbit.r }; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch0) { const [a, b] = [...pointers.values()]; orbit.r = Math.min(40, Math.max(6, pinch0.r * pinch0.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)))); placeCamera(); markCustom(); return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 3) { orbit.az -= dx * 0.008; orbit.el = Math.max(-89.4 * DEG, Math.min(89.4 * DEG, orbit.el + dy * 0.008)); placeCamera(); markCustom(); }
  });
  const end = e => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = null;
    if (drag && drag.moved <= 3 && e.type === 'pointerup') pickAt(e.clientX, e.clientY);
    if (!pointers.size) drag = null;
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { e.preventDefault(); orbit.r = Math.min(40, Math.max(6, orbit.r * (e.deltaY > 0 ? 1.08 : 0.926))); placeCamera(); markCustom(); }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const k = e.key; let used = true;
    if (k === 'ArrowLeft') orbit.az += 10 * DEG; else if (k === 'ArrowRight') orbit.az -= 10 * DEG;
    else if (k === 'ArrowUp') orbit.el = Math.min(89.4 * DEG, orbit.el + 10 * DEG); else if (k === 'ArrowDown') orbit.el = Math.max(-89.4 * DEG, orbit.el - 10 * DEG);
    else if (k === '+' || k === '=') orbit.r = Math.max(6, orbit.r * 0.9); else if (k === '-' || k === '_') orbit.r = Math.min(40, orbit.r * 1.1);
    else if (k === 'r' || k === 'R') { goView('frontal'); e.preventDefault(); return; }
    else used = false;
    if (used) { e.preventDefault(); camAnim = null; placeCamera(); markCustom(); }
  });
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function pickAt(cx, cy) {
    const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(LEADS.map(L => [leadObjs[L.id].pick, leadObjs[L.id].marker]).flat(), false)[0];
    if (hit) select(hit.object.userData.lead, true);
  }
}
function resize() {
  if (renderer) {
    const w = stage.clientWidth, h = stage.clientHeight; const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    U.uPx.value = dpr; needsRender = true;
  }
  drawECG(); drawMini(); syncCloseup();
  requestLabelLayout(0);
}

/* ======================= Labels in the 3D view (collision-avoiding) ======================= */
const OFFSETS = [[0, 0]]; // candidate positions: on the anchor, then rings further out (a leader line joins label and anchor)
for (const rad of [26, 44, 64, 86]) for (let k = 0; k < 12; k++) { const a = k / 12 * 2 * Math.PI; OFFSETS.push([Math.round(Math.cos(a) * rad * 1.5), Math.round(Math.sin(a) * rad)]); }
function effPrio(L) { return L.el.classList.contains('sel') || L.el.classList.contains('active') ? 0 : L.prio; }
const SVGNS = 'http://www.w3.org/2000/svg';
const leaderSvg = document.createElementNS(SVGNS, 'svg'); leaderSvg.setAttribute('class', 'leaders'); leaderSvg.setAttribute('aria-hidden', 'true');
labelLayer.prepend(leaderSvg);
let labelsDirty = true, labelLayoutTimer = 0, lastGuidedKey = null;
function requestLabelLayout(delay) {
  if (delay) {
    if (labelLayoutTimer) clearTimeout(labelLayoutTimer);
    labelLayoutTimer = setTimeout(() => { labelLayoutTimer = 0; labelsDirty = true; needsRender = true; }, delay);
    return;
  }
  if (labelLayoutTimer) { clearTimeout(labelLayoutTimer); labelLayoutTimer = 0; }
  labelsDirty = true;
  needsRender = true;
}
function maybeRelayoutForPhase() {
  const key = (ui.labelMode || '') + '|' + (ui.allLeads ? 'all' : 'one') + '|' + state.sel + '|' + phaseAt(state.t).key;
  if (key !== lastGuidedKey) { lastGuidedKey = key; requestLabelLayout(0); }
}
let _heartShape = null, _heartShapeKey = '';
function heartScreenShape() {
  const key = [orbit.az, orbit.el, orbit.r, orbit.target.x, orbit.target.y, orbit.target.z, stage.clientWidth, stage.clientHeight, !!ui.cut].join('|');
  if (_heartShape && _heartShapeKey === key) return _heartShape;
  const P = heartPoints();
  const v = new THREE.Vector3();
  const w = stage.clientWidth, h = stage.clientHeight;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, sx = 0, sy = 0, n = 0;
  for (const p of P) {
    v.copy(p).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.3 || Math.abs(v.y) > 1.3) continue;
    const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    sx += x; sy += y; n++;
  }
  const shape = !n
    ? { cx: w / 2, cy: h / 2, rx: w * 0.22, ry: h * 0.28 }
    : { cx: sx / n, cy: sy / n, rx: Math.max(18, (x1 - x0) / 2 + 6), ry: Math.max(18, (y1 - y0) / 2 + 6) };
  _heartShape = shape; _heartShapeKey = key;
  return shape;
}
function labelBoxSize(L) {
  const col = L.el.classList.contains('col');
  if (L._bw && L._sizeText === L.el.textContent && L._col === col) return { bw: L._bw, bh: L._bh };
  const bw = L.el.offsetWidth || 90, bh = L.el.offsetHeight || 18;
  L._bw = bw; L._bh = bh; L._sizeText = L.el.textContent; L._col = col;
  return { bw, bh };
}
let _torsoShape = null, _torsoShapeKey = '';
function torsoScreenShape() {
  const key = [orbit.az, orbit.el, orbit.r, orbit.target.x, orbit.target.y, orbit.target.z, stage.clientWidth, stage.clientHeight].join('|');
  if (_torsoShape && _torsoShapeKey === key) return _torsoShape;
  const w = stage.clientWidth, h = stage.clientHeight;
  const env = torso && torso.userData && torso.userData.envelope;
  if (!env || !env.length) {
    _torsoShape = { cx: w / 2, cy: h / 2, rx: w * 0.28, ry: h * 0.36, x0: w * 0.2, x1: w * 0.8 };
    _torsoShapeKey = key; return _torsoShape;
  }
  const v = new THREE.Vector3();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, sx = 0, sy = 0, n = 0;
  for (const p of env) {
    v.copy(p).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.4 || Math.abs(v.y) > 1.4) continue;
    const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    sx += x; sy += y; n++;
  }
  const shape = !n
    ? { cx: w / 2, cy: h / 2, rx: w * 0.28, ry: h * 0.36, x0: w * 0.2, x1: w * 0.8 }
    : { cx: sx / n, cy: sy / n, rx: Math.max(20, (x1 - x0) / 2 + 4), ry: Math.max(20, (y1 - y0) / 2 + 4), x0, x1 };
  _torsoShape = shape; _torsoShapeKey = key;
  return shape;
}
function easeLabelPos(L, x, y) {
  if (L.px == null || Math.hypot(x - L.px, y - (L.py || 0)) > 160) { L.px = x; L.py = y; }
  else {
    L.px += (x - L.px) * 0.38;
    L.py += (y - L.py) * 0.38;
    if (Math.hypot(x - L.px, y - L.py) < 0.4) { L.px = x; L.py = y; }
    else labelsDirty = true; // keep easing on later frames even when the camera has stopped
  }
  return { x: L.px, y: L.py };
}
const COL_ANATOMY = new Set(['cond', 'node', 'heart', 'landmark', 'region']);
const _occRay = new THREE.Raycaster();
function isAnchorOccluded(worldPos) {
  if (!camera || !worldPos || !orbit || !orbit.target) return false;
  const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
  const dPole = worldPos.clone().sub(camera.position).dot(camDir);
  const dCentre = orbit.target.clone().sub(camera.position).dot(camDir);
  return dPole > dCentre + 0.45;
}

function clipLeaderToHeart(x1, y1, x2, y2, H, pad) {
  const rx = H.rx + (pad || 8), ry = H.ry + (pad || 8);
  const fx = (x, y) => {
    const dx = (x - H.cx) / rx, dy = (y - H.cy) / ry;
    return dx * dx + dy * dy;
  };
  const v1 = fx(x1, y1), v2 = fx(x2, y2);
  if (v1 <= 1) return null;
  if (v2 > 1) {
    for (let t = 0.12; t <= 0.88; t += 0.08) {
      if (fx(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t) < 1) return null;
    }
    return { x: x2, y: y2 };
  }
  let lo = 0, hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (fx(x1 + (x2 - x1) * mid, y1 + (y2 - y1) * mid) > 1) lo = mid; else hi = mid;
  }
  return { x: x1 + (x2 - x1) * hi, y: y1 + (y2 - y1) * hi };
}
function layoutColumnLabels(items, w, h, lines, H, chromeBottom) {
  // Columns sit in the blank space outside the torso, at the far left and right of the viewport.
  // Leaders run to the exact model anchor. Labels are sorted by projected anchor y so leaders do not cross.
  const gap = 5, padX = 8, hyst = 36;
  const T = torsoScreenShape();
  const gizmo = $('orientGizmo');
  const gizmoH = gizmo ? Math.max(80, gizmo.getBoundingClientRect().height + 6) : 100;
  const minY = 18, maxY = h - 12;
  if (!(chromeBottom > 0)) chromeBottom = h - 28;
  const mid = T.cx || w / 2;
  const left = [], right = [];
  for (const it of items) {
    if (it.L.colSide == null) it.L.colSide = it.ax < mid ? 'left' : 'right';
    else if (it.ax < mid - hyst) it.L.colSide = 'left';
    else if (it.ax > mid + hyst) it.L.colSide = 'right';
    (it.L.colSide === 'left' ? left : right).push(it);
  }
  const place = (list, side) => {
    list.sort((a, b) => a.ay - b.ay);
    const boxes = [];
    const topMin0 = (side === 'right' ? Math.max(minY, gizmoH + 6) : minY);
    const botMax0 = Math.min(maxY, chromeBottom);
    const sized = list.map(it => {
      it.L.el.classList.add('col');
      it.L.el.classList.remove('hidden');
      it.L._bw = 0;
      const { bw, bh } = labelBoxSize(it.L);
      const torsoEdge = side === 'left' ? T.x0 : T.x1;
      let x;
      if (side === 'left') x = Math.min(padX + bw / 2, torsoEdge - 10 - bw / 2);
      else x = Math.max(w - padX - bw / 2, torsoEdge + 10 + bw / 2);
      x = Math.max(bw / 2 + 4, Math.min(w - bw / 2 - 4, x));
      return { it, bw, bh, x };
    });
    const n = sized.length;
    const sumH = sized.reduce((a, s) => a + s.bh, 0);
    const needed = sumH + (n > 1 ? gap * (n - 1) : 0);
    // Prefer to sit below the gizmo on the right, but if the stack cannot fit above the
    // caption / Info button, encroach the gizmo rather than running off the bottom.
    let top = topMin0, bot = botMax0;
    if (n && needed > bot - top) top = Math.max(minY, bot - needed);
    const ys = sized.map(s => Math.min(bot - s.bh / 2, Math.max(top + s.bh / 2, s.it.ay)));
    for (let i = 1; i < n; i++) {
      const minYi = ys[i - 1] + (sized[i - 1].bh + sized[i].bh) / 2 + gap;
      if (ys[i] < minYi) ys[i] = minYi;
    }
    if (n && ys[n - 1] + sized[n - 1].bh / 2 > bot) {
      const overflow = ys[n - 1] + sized[n - 1].bh / 2 - bot;
      for (let i = 0; i < n; i++) ys[i] -= overflow;
    }
    if (n && ys[0] - sized[0].bh / 2 < top) {
      const avail = Math.max(1, bot - top);
      const g = n > 1 ? Math.max(1, Math.min(gap, (avail - sumH) / (n - 1))) : gap;
      ys[0] = top + sized[0].bh / 2;
      for (let i = 1; i < n; i++) ys[i] = ys[i - 1] + (sized[i - 1].bh + sized[i].bh) / 2 + g;
    }
    let gizmoBox = null;
    if (side === 'right' && gizmo) {
      const gb = gizmo.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      if (gb.width > 0) gizmoBox = { x0: gb.left - sr.left - 6, y0: gb.top - sr.top - 6, y1: gb.bottom - sr.top + 6 };
    }
    for (let i = 0; i < n; i++) {
      const s = sized[i], it = s.it, el = it.L.el;
      el.classList.add('col');
      el.classList.toggle('faded', !!it.occluded);
      el.classList.remove('hidden');
      const y = ys[i];
      let x = s.x;
      // If this row would sit on the orientation gizmo, slide it left of the gizmo, still outside the torso.
      if (gizmoBox && y + s.bh / 2 > gizmoBox.y0 && y - s.bh / 2 < gizmoBox.y1) {
        const leftOf = gizmoBox.x0 - s.bw / 2;
        if (leftOf > s.bw / 2 + 4) x = Math.min(x, leftOf);
      }
      const e = easeLabelPos(it.L, x, y);
      el.style.transform = `translate(${e.x}px, ${e.y}px) translate(-50%, -50%)`;
      boxes.push({ x, y, h: s.bh, w: s.bw, L: it.L, ax: it.ax, ay: it.ay, occluded: it.occluded });
    }
    // Leaders: label edge to the exact anchor, thin dark line and a small dot. Skip if the line would
    // pass through another label box on this side (y-sort almost always prevents this).
    for (const b of boxes) {
      const edgeX = side === 'left' ? b.x + b.w / 2 : b.x - b.w / 2;
      const fade = b.occluded ? ' faded' : '';
      let crosses = false;
      for (const o of boxes) {
        if (o === b) continue;
        const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = o.y - o.h / 2, y1 = o.y + o.h / 2;
        // segment (edgeX,b.y) -> (b.ax,b.ay) vs box
        const hits = (px, py, qx, qy) => {
          const minx = Math.min(px, qx), maxx = Math.max(px, qx), miny = Math.min(py, qy), maxy = Math.max(py, qy);
          if (maxx < x0 || minx > x1 || maxy < y0 || miny > y1) return false;
          // if the segment crosses the interior of the other box
          for (let t = 0.08; t <= 0.92; t += 0.08) {
            const x = px + (qx - px) * t, y = py + (qy - py) * t;
            if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
          }
          return false;
        };
        if (hits(edgeX, b.y, b.ax, b.ay)) { crosses = true; break; }
      }
      if (!crosses) {
        lines.push(`<line class="col-leader${fade}" x1="${edgeX.toFixed(1)}" y1="${b.y.toFixed(1)}" x2="${b.ax.toFixed(1)}" y2="${b.ay.toFixed(1)}"/><circle class="col-dot${fade}" cx="${b.ax.toFixed(1)}" cy="${b.ay.toFixed(1)}" r="2.2"/>`);
      } else {
        lines.push(`<circle class="col-dot${fade}" cx="${b.ax.toFixed(1)}" cy="${b.ay.toFixed(1)}" r="2.2"/>`);
      }
    }
  };
  place(left, 'left');
  place(right, 'right');
}
function updateLabels() {
  const w = stage.clientWidth, h = stage.clientHeight; const v = new THREE.Vector3(); const placed = []; const lines = [];
  const sr = stage.getBoundingClientRect();
  // Reserve the caption and Info button as boxes, and a full-width bottom strip of that height so
  // aVF and II stay on their rays but above the chrome (not clipped at the viewport edge).
  // Do not use #stageInfo (the panel) for the bottom inset: when closed it can still have a tall
  // box and would push chromeBottom negative.
  const inset = { top: 8, right: 8, bottom: 32, left: 8 };
  for (const id of ['viewNote', 'stageInfoBtn']) {
    const el = $(id);
    if (!el || el.hidden || el.getAttribute('aria-hidden') === 'true') continue;
    const nb = el.getBoundingClientRect();
    if (nb.width > 0 && nb.height > 0 && nb.bottom > sr.top && nb.top < sr.bottom) {
      placed.push([nb.left - sr.left - 4, nb.top - sr.top - 4, nb.right - sr.left + 4, nb.bottom - sr.top + 4]);
      const fromBottom = sr.bottom - nb.top + 8;
      if (fromBottom > 0 && fromBottom < h * 0.45) inset.bottom = Math.max(inset.bottom, fromBottom);
    }
  }
  const infoPanel = $('stageInfo');
  if (infoPanel && !infoPanel.hidden && infoPanel.getAttribute('aria-hidden') !== 'true') {
    const nb = infoPanel.getBoundingClientRect();
    if (nb.width > 0 && nb.height > 0 && nb.bottom > sr.top && nb.top < sr.bottom) {
      placed.push([nb.left - sr.left - 4, nb.top - sr.top - 4, nb.right - sr.left + 4, nb.bottom - sr.top + 4]);
    }
  }
  const gizmo = $('orientGizmo');
  if (gizmo) {
    const gb = gizmo.getBoundingClientRect();
    if (gb.width > 0) placed.push([gb.left - sr.left - 6, gb.top - sr.top - 6, gb.right - sr.left + 6, gb.bottom - sr.top + 6]);
  }
  const H = heartScreenShape();
  const inHeart = (x, y, pad) => {
    const dx = (x - H.cx) / (H.rx + (pad || 8)), dy = (y - H.cy) / (H.ry + (pad || 8));
    return dx * dx + dy * dy < 1;
  };
  const hit = box => placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
  for (const L of labels) { if (!L.visible) { L.el.classList.add('hidden'); L.el.classList.remove('col', 'faded'); } }
  const vis = labels.filter(L => L.visible);
  const projectWorld = (wx, wy, wz) => {
    v.set(wx, wy, wz).project(camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z };
  };
  const ellipseT = (ox, oy, vx, vy, pad) => {
    const rx = H.rx + pad, ry = H.ry + pad;
    const dx = ox - H.cx, dy = oy - H.cy;
    const A = (vx * vx) / (rx * rx) + (vy * vy) / (ry * ry);
    const B = 2 * (dx * vx) / (rx * rx) + 2 * (dy * vy) / (ry * ry);
    const C = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) - 1;
    if (A < 1e-12) return C < 0 ? 0 : 0;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return C < 0 ? 0 : 0;
    const root = Math.sqrt(disc);
    return Math.max((-B - root) / (2 * A), (-B + root) / (2 * A), 0);
  };
  const maxRayT = (ox, oy, vx, vy, hw, hh) => {
    let t = 1e6;
    if (vx > 1e-6) t = Math.min(t, (w - inset.right - hw - ox) / vx);
    else if (vx < -1e-6) t = Math.min(t, (inset.left + hw - ox) / vx);
    if (vy > 1e-6) t = Math.min(t, (h - inset.bottom - hh - oy) / vy);
    else if (vy < -1e-6) t = Math.min(t, (inset.top + hh - oy) / vy);
    return Math.max(0, t);
  };
  const placeOnRay = (L, ax, ay, bw, bh) => {
    const hw = bw / 2, hh = bh / 2;
    const lead = L.leadId && LEAD[L.leadId];
    const origin = projectWorld(0, 0, 0);
    let fx, fy;
    if (lead && lead.type === 'limb') {
      const f = projectWorld(lead.dir[0] * 20, lead.dir[1] * 20, lead.dir[2] * 20);
      fx = f.x; fy = f.y;
    } else if (lead && leadObjs[lead.id]) {
      const po = leadObjs[lead.id].pole;
      const len = Math.hypot(po[0], po[1], po[2]) || 1;
      const f = projectWorld(po[0] / len * 20, po[1] / len * 20, po[2] / len * 20);
      fx = f.x; fy = f.y;
    } else { fx = ax; fy = ay; }
    let vx = fx - origin.x, vy = fy - origin.y, vlen = Math.hypot(vx, vy);
    if (vlen < 2) { vx = ax - origin.x; vy = ay - origin.y; vlen = Math.hypot(vx, vy); }
    if (vlen < 2) { vx = ax - H.cx; vy = ay - H.cy; vlen = Math.hypot(vx, vy); }
    if (vlen < 1e-3) return null;
    vx /= vlen; vy /= vlen;
    const ox = origin.x, oy = origin.y;
    const tPole = (ax - ox) * vx + (ay - oy) * vy;
    const tExit = ellipseT(ox, oy, vx, vy, lead && lead.type === 'chest' ? 6 : 8);
    const tPad = Math.max(hw, hh) * 0.65 + 8;
    // Limb pills sit just outside the heart, on the + ray, not at the viewport edge.
    const tWant = (lead && lead.type === 'chest')
      ? Math.max(tExit + tPad, tPole + Math.max(hw, hh) * 0.5 + 2)
      : tExit + tPad;
    const tLimit = maxRayT(ox, oy, vx, vy, hw + 2, hh + 2);
    const t0 = Math.min(tWant, tLimit);
    const tryT = t => {
      if (t < 0 || t > tLimit + 0.5) return null;
      const x = ox + vx * t, y = oy + vy * t;
      const box = [x - hw, y - hh, x + hw, y + hh];
      if (hit(box)) return null;
      return [x, y, box];
    };
    let spot = null;
    for (const d of [0, 8, 16, 24, 32, 44, 56, -8, -16, -24, -32]) { spot = tryT(t0 + d); if (spot) break; }
    if (!spot) {
      const t = Math.max(4, Math.min(t0, tLimit));
      const x = ox + vx * t, y = oy + vy * t;
      spot = [x, y, [x - hw, y - hh, x + hw, y + hh]];
    }
    return spot;
  };

  // Lead pills first, each kept on its own positive-axis ray, so de-overlap cannot steal another lead's place.
  const leadItems = vis.filter(L => L.cls === 'lead').sort((a, b) => (b.el.classList.contains('sel') ? 1 : 0) - (a.el.classList.contains('sel') ? 1 : 0));
  for (const L of leadItems) {
    const p = L.getPos(); if (!p) { L.el.classList.add('hidden'); continue; }
    v.copy(p).project(camera);
    L.el.classList.remove('hidden', 'col', 'faded');
    const { bw: rawW, bh: rawH } = labelBoxSize(L);
    const bw = rawW + 6, bh = rawH + 4;
    const ax = ((v.x + 1) / 2) * w, ay = ((1 - v.y) / 2) * h;
    let spot = placeOnRay(L, ax, ay, bw, bh);
    if (!spot) {
      const xx = Math.min(w - bw / 2, Math.max(bw / 2, ax));
      const yy = Math.min(h - bh / 2, Math.max(bh / 2, ay));
      spot = [xx, yy, [xx - bw / 2, yy - bh / 2, xx + bw / 2, yy + bh / 2]];
    }
    placed.push(spot[2]);
    L.el.style.transform = `translate(${spot[0]}px, ${spot[1]}px) translate(-50%, -50%)`;
  }

  const colItems = [];
  for (const L of vis) {
    if (!COL_ANATOMY.has(L.cls)) continue;
    const p = L.getPos();
    if (!p) { L.el.classList.add('hidden'); continue; }
    v.copy(p).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.25 || Math.abs(v.y) > 1.25) { L.el.classList.add('hidden'); continue; }
    const ax = ((v.x + 1) / 2) * w, ay = ((1 - v.y) / 2) * h;
    const occluded = isAnchorOccluded(p);
    colItems.push({ L, ax, ay, occluded });
  }
  if (colItems.length) {
    layoutColumnLabels(colItems, w, h, lines, H, h - inset.bottom);
    const T = torsoScreenShape();
    placed.push([0, 0, Math.max(8, T.x0 - 8), h], [Math.min(w, T.x1 + 8), 0, w, h]);
  }
  if (vecLabel && vecLabel.visible && vis.includes(vecLabel)) {
    const origin = projectWorld(0, 0, 0);
    vecLabel.el.classList.remove('hidden', 'col', 'faded');
    const { bw, bh } = labelBoxSize(vecLabel);
    let x = origin.x + bw / 2 + 16;
    let y = origin.y - bh / 2 - 10;
    if (x + bw / 2 > w - 8) x = origin.x - bw / 2 - 16;
    if (y - bh / 2 < 8) y = origin.y + bh / 2 + 14;
    x = Math.max(bw / 2 + 6, Math.min(w - bw / 2 - 6, x));
    y = Math.max(bh / 2 + 6, Math.min(h - bh / 2 - 6, y));
    const e = easeLabelPos(vecLabel, x, y);
    vecLabel.el.style.transform = `translate(${e.x}px, ${e.y}px) translate(-50%, -50%)`;
    placed.push([e.x - bw / 2, e.y - bh / 2, e.x + bw / 2, e.y + bh / 2]);
  }
  const floating = vis.filter(L => !COL_ANATOMY.has(L.cls) && L.cls !== 'lead' && L.cls !== 'vec').sort((a, b) => {
    const ra = a.el.classList.contains('sel') ? 0 : 2 + effPrio(a);
    const rb = b.el.classList.contains('sel') ? 0 : 2 + effPrio(b);
    return ra - rb;
  });
  for (const L of floating) {
    const p = L.getPos(); if (!p) { L.el.classList.add('hidden'); continue; }
    v.copy(p).project(camera);
    const mustShow = (ui.labelMode === 'guided' && L.tag && guidedTags().includes(L.tag));
    const pin = mustShow;
    if (v.z > 1 && !pin) { L.el.classList.add('hidden'); continue; }
    if ((Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) && !pin) { L.el.classList.add('hidden'); continue; }
    L.el.classList.remove('hidden');
    const { bw: rawW, bh: rawH } = labelBoxSize(L);
    const bw = rawW + 6, bh = rawH + 4;
    const ax = ((v.x + 1) / 2) * w, ay = ((1 - v.y) / 2) * h;
    let spot = null;
    const isLandmark = L.cls === 'landmark';
    const needOutside = isLandmark || L.cls === 'vec' || L.cls === 'region';
    const trySpot = (x, y, pad) => {
      const xx = Math.min(w - bw / 2, Math.max(bw / 2, x));
      const yy = Math.min(h - bh / 2, Math.max(bh / 2, y));
      const box = [xx - bw / 2, yy - bh / 2, xx + bw / 2, yy + bh / 2];
      if (needOutside && inHeart(xx, yy, pad != null ? pad : 6)) return null;
      if (hit(box)) return null;
      return [xx, yy, box];
    };
    if (needOutside) {
      const ang = (L === apexLabel) ? Math.PI / 2 : Math.atan2(ay - H.cy, ax - H.cx);
      const dists = [14, 22, 30, 40, 48];
      const angles = (L === apexLabel)
        ? [Math.PI / 2, 1.2, 1.9, 0.85, 2.3, 0.5, 2.6]
        : [ang, ang + 0.3, ang - 0.3, ang + 0.6, ang - 0.6, ang + 1, ang - 1, ang + 1.5, ang - 1.5];
      for (const dist of dists) {
        for (const a of angles) { spot = trySpot(ax + Math.cos(a) * dist, ay + Math.sin(a) * dist); if (spot) break; }
        if (spot) break;
      }
    } else {
      for (const [dx, dy] of OFFSETS) { spot = trySpot(ax + dx, ay + dy, 0); if (spot) break; }
    }
    if (!spot) {
      if (effPrio(L) > 0 && !mustShow) { L.el.classList.add('hidden'); continue; }
      const ang = Math.atan2(ay - H.cy, ax - H.cx);
      const ring = Math.max(H.rx, H.ry) + 24;
      for (const extra of [0, 14, 28, 44, 62, 80]) {
        for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, Math.PI]) {
          const x = Math.min(w - bw / 2, Math.max(bw / 2, H.cx + Math.cos(ang + da) * (ring + extra)));
          const y = Math.min(h - bh / 2, Math.max(bh / 2, H.cy + Math.sin(ang + da) * (ring + extra)));
          const box = [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2];
          if (!hit(box) || extra >= 62) { spot = [x, y, box]; break; }
        }
        if (spot) break;
      }
    }
    if (!spot) continue;
    placed.push(spot[2]);
    L.el.style.transform = `translate(${spot[0]}px, ${spot[1]}px) translate(-50%, -50%)`;
    const bx = Math.max(spot[2][0] + 3, Math.min(spot[2][2] - 3, ax));
    const by = Math.max(spot[2][1] + 2, Math.min(spot[2][3] - 2, ay));
    const d = Math.hypot(bx - ax, by - ay);
    if (d > 8 && d <= 56 && L.cls !== 'proj') {
      lines.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.2"/>`);
    }
  }
  leaderSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  leaderSvg.innerHTML = lines.join('');
  updateBodyMarks();
}
function updateBodyMarks() {
  const rEl = $('markR'), lEl = $('markL');
  if (!rEl || !lEl || !camera) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  const v = new THREE.Vector3();
  const place = (el, world) => {
    if (!world) { el.hidden = true; return; }
    v.copy(world).project(camera);
    let x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
    const vx = x - w / 2, vy = y - h / 2, len = Math.hypot(vx, vy) || 1;
    x += (vx / len) * 20;
    y += (vy / len) * 8;
    x = Math.max(18, Math.min(w - 18, x));
    y = Math.max(16, Math.min(h - 16, y));
    el.hidden = false;
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    el.style.opacity = (v.z > 1) ? '0.7' : '1';
  };
  const rp = torso && torso.userData && torso.userData.rPos;
  const lp = torso && torso.userData && torso.userData.lPos;
  place(rEl, rp); place(lEl, lp);
}

/* ======================= Text ======================= */
let lastPhase = null;
const fmt = v => { const s = Math.abs(v).toFixed(2); return (s === '0.00' ? '' : v >= 0 ? '+' : '\u2212') + s; };
function describeLead() {
  const L = LEAD[state.sel]; const v = traceAt(L.id, state.t); const D = dipole(state.t); const mag = Math.hypot(...D);
  let rel;
  if (mag <= VEC_HIDE) rel = "The heart's electrical vector is about zero at this moment, so the arrow is hidden.";
  else if (L.type === 'limb') {
    const ang = Math.round(Math.acos(Math.max(-1, Math.min(1, dot(D, L.dir) / (mag || 1)))) / DEG);
    rel = ang < 60 ? "The heart's electrical vector points towards the + pole (" + ang + "\u00b0), so the trace goes up." : ang > 120 ? "The heart's electrical vector points away from the + pole (" + ang + "\u00b0), so the trace goes down." : "The heart's electrical vector is nearly at right angles to this lead (" + ang + "\u00b0), so the deflection is small.";
  } else rel = v > 0 ? 'Activity is heading towards this electrode, so the trace goes up.' : 'Activity is heading away from this electrode, so the trace goes down.';
  const where = L.type === 'limb' ? `a limb lead at ${L.angle}` : `a chest lead (${L.pos})`;
  if ($('leadExplain')) {
    $('leadExplain').innerHTML = `<p class="le-line">Lead ${L.id}: ${fmt(v)} mV. ${rel}</p>`;
    $('leadExplain').title = `${L.id} is ${where}. It mainly faces ${REGION_TEXT[L.region]}.`;
  }
  if ($('ecgCaption')) {
    const tAbs = pageTime();
    const tPage0 = windowStart(tAbs, PAGE_MS);
    $('ecgCaption').textContent = `Lead ${L.id} selected. All 12 leads share one clock at ${(tAbs / 1000).toFixed(1)} s, on the ${(tPage0 / 1000).toFixed(1)} to ${((tPage0 + PAGE_MS) / 1000).toFixed(1)} s page.`;
  }
  if ($('miniLabel')) $('miniLabel').textContent = `Lead ${L.id}, 5 s at 25 mm/s`;
}
let closeupChosen = false;
function syncCloseup() {
  const card = $('leadCloseupCard');
  if (!card) return;
  card.hidden = false;
  closeupChosen = true;
  drawZoom();
}
/* Guided steps */
function stepIndexAt(t) { let k = -1; STEPS.forEach((p, i) => { if (t >= p.from) k = i; }); return k; }
function goStep(i) {
  i = Math.max(0, Math.min(STEPS.length - 1, i)); setPlaying(false); setT(STEPS[i].at, true);
}
function updateSteps() {
  const k = stepIndexAt(state.t); const ph = phaseAt(state.t); const onStep = !!ph.step;
  document.querySelectorAll('.step-chip').forEach((b, i) => b.setAttribute('aria-pressed', String(onStep && i === k)));
  if ($('stepCount')) $('stepCount').textContent = onStep ? `Step ${k + 1} of ${STEPS.length}` : '';
  if ($('stepBack')) $('stepBack').disabled = k <= 0 && onStep;
  if ($('stepNext')) $('stepNext').disabled = k >= STEPS.length - 1 && onStep;
  const fsName = $('fsStepName');
  if (fsName) fsName.textContent = onStep && STEPS[k] ? (STEPS[k].title || '') : '';
  if ($('fsStepBack')) $('fsStepBack').disabled = k <= 0 && onStep;
  if ($('fsStepNext')) $('fsStepNext').disabled = k >= STEPS.length - 1 && onStep;
}

function updateText(announce) {
  const ph = phaseAt(state.t);
  if (ph !== lastPhase) { $('phaseTitle').textContent = ph.title; $('phaseText').textContent = ph.text; lastPhase = ph; }
  updateSteps();
  describeLead();
  if (announce) $('live').textContent = `${Math.round(state.t)} milliseconds. ${ph.title}. ${ph.text}`;
}
function currentBeatDuration(i) {
  const k = i == null ? beatIndexAt(state.simTime) : i;
  ensureBeatsUntil(REC.starts[k] + 2000);
  return REC.starts[k + 1] - REC.starts[k];
}
function applySimDerived() {
  const T = Math.max(0, state.simTime);
  const i = beatIndexAt(T);
  state.beat = i;
  state.t = T - REC.starts[i];
  if (state.t < 0) state.t = 0;
}
function modelPhase() {
  return Math.max(0, Math.min(BEAT_MS - 1e-6, state.t));
}
function applyTime(announce) {
  applySimDerived();
  if (scrub) {
    const dur = currentBeatDuration();
    scrub.max = String(Math.max(BEAT_MS, Math.round(dur)));
    scrub.value = Math.round(Math.min(state.t, dur - 1e-6));
    const ph = phaseAt(modelPhase());
    scrub.setAttribute('aria-valuetext', `${Math.round(state.t)} milliseconds, ${ph.title}`);
  }
  if (timeOut) timeOut.textContent = `${Math.round(state.t)} ms`;
  updateScene(); drawECG(); drawMini(); drawZoom(); updateText(announce);
}
function setSimTime(ms, announce) {
  const T = Number(ms);
  state.simTime = Number.isFinite(T) ? Math.max(0, T) : 0;
  applyTime(announce);
}
function advanceSim(deltaMs, announce, quiet) {
  const d = Number(deltaMs);
  const T = state.simTime + (Number.isFinite(d) ? d : 0);
  state.simTime = Number.isFinite(T) ? Math.max(0, T) : 0;
  if (quiet) { applySimDerived(); return; }
  applyTime(announce);
}
function setT(t, announce) {
  const beat = Math.max(0, beatIndexAt(Number.isFinite(state.simTime) ? state.simTime : 0));
  const dur = currentBeatDuration(beat);
  let phase = Number(t);
  if (!Number.isFinite(phase)) phase = 0;
  phase = Math.max(0, Math.min(dur, phase));
  // Keep the last tick of this beat from jumping to the start of the next.
  if (phase >= dur) phase = dur - 1e-6;
  setSimTime(REC.starts[beat] + phase, announce);
}
function selectedSet() {
  return (state.sels && state.sels.length) ? state.sels.slice() : [state.sel || 'II'];
}
function syncLeadButtons() {
  const set = selectedSet();
  document.querySelectorAll('.lead-btn').forEach(b => b.setAttribute('aria-pressed', String(set.includes(b.dataset.lead))));
}
function select(id, fromUser) {
  if (!LEAD[id]) return;
  if (fromUser) closeupChosen = true;
  if (typeof isFullscreen === 'function' && isFullscreen()) {
    const list = selectedSet();
    const idx = list.indexOf(id);
    if (idx >= 0) {
      if (list.length > 1) list.splice(idx, 1);
    } else {
      list.push(id);
      if (list.length > 2) list.shift();
    }
    state.sels = list;
    state.sel = list.includes(id) ? id : list[list.length - 1];
  } else {
    state.sel = id;
    state.sels = [id];
  }
  syncLeadButtons();
  setLeadStyles(); buildRegion(LEAD[state.sel].region);
  updateScene(); drawECG(); drawMini(); updateText(false);
  syncCloseup();
  const shown = closeupChosen && !(ONE_SCREEN.matches && !closeupChosen);
  const names = selectedSet().join(' and ');
  $('live').textContent = shown
    ? (selectedSet().length > 1 ? `Leads ${names} selected. Close-ups are on the right.` : `Lead ${state.sel} selected. Close-up is on the right.`)
    : `Lead ${state.sel} selected.`;
}
let lastClock = performance.now();
function syncClock(now) { lastClock = now == null ? performance.now() : now; }
document.addEventListener('visibilitychange', () => { syncClock(); });

function setPlaying(on) {
  state.playing = on; playBtn.setAttribute('aria-pressed', String(on));
  playBtn.querySelector('.play-label').textContent = on ? 'Pause' : 'Play';
  playBtn.setAttribute('aria-label', on ? 'Pause the beat' : 'Play the beat');
  syncClock();
  if (!on) updateText(true);
}

/* Recompute everything after a change to BASELINE / CONDUCTION (hook for later pathology modes) */
function rebuildModel() {
  MODEL = computeModel(); buildTraces(); initRecording(); buildPhases(); buildActiveRanges(); lastPhase = null;
  applyMuscleTimes(); applyConductionTimes(); setT(state.t);
}

/* ======================= Wiring and start-up ======================= */
scrub.addEventListener('input', () => { setPlaying(false); setT(+scrub.value, true); });
playBtn.addEventListener('click', () => setPlaying(!state.playing));
speedSel.addEventListener('change', () => { state.speed = +speedSel.value; syncClock(); });
document.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => goView(b.dataset.view)));
$('resetView').addEventListener('click', () => goView('frontal'));
function refit() { if (renderer && VIEWS[state.view]) { const f = fitView(VIEWS[state.view], state.view); orbit.r = f.r; orbit.target.copy(f.target); placeCamera(); } }
$('toggleCut').addEventListener('click', () => setCut(!ui.cut));
function setToggle(id, key, on) { ui[key] = on; const el = id && $(id); if (el) el.setAttribute('aria-pressed', String(on)); setLeadStyles(); if (state.sel) buildRegion(LEAD[state.sel].region); updateScene(); if (typeof syncShowUi === 'function') syncShowUi(); }
$('toggleLeads').addEventListener('click', () => setToggle('toggleLeads', 'allLeads', !ui.allLeads));
$('toggleLoop').addEventListener('click', () => setToggle('toggleLoop', 'loop', !ui.loop));

/* Show panel: Labels and Picture in one place. Choice is kept for the session. */
const LABEL_STORE = 'ecg3d-revamp-labels';
const LABEL_GROUPS = ['chambers', 'conduction', 'leads', 'vectors', 'walls', 'orientation'];
const LABEL_CATALOG = {
  chambers: [
    { id: 'RA', label: 'Right atrium' }, { id: 'LA', label: 'Left atrium' },
    { id: 'RV', label: 'Right ventricle' }, { id: 'LV', label: 'Left ventricle' },
    { id: 'S', label: 'Septum' }, { id: 'svc', label: 'Superior vena cava' },
    { id: 'cs', label: 'Coronary sinus opening' }, { id: 'ring', label: 'Fibrous AV ring' }
  ],
  conduction: [
    { id: 'sa', label: 'SA node' }, { id: 'inter', label: 'Internodal routes' },
    { id: 'bach', label: "Bachmann's bundle" }, { id: 'av', label: 'AV node' },
    { id: 'his', label: 'Bundle of His' }, { id: 'lbb', label: 'Left bundle' },
    { id: 'rbb', label: 'Right bundle' }, { id: 'fascicles', label: 'Fascicles' },
    { id: 'mod', label: 'Moderator band' }, { id: 'purk', label: 'Purkinje fibres' }
  ],
  leads: LEADS.map(L => ({ id: 'lead-' + L.id, label: L.id })),
  vectors: [{ id: 'vec', label: "Heart's electrical vector" }],
  walls: [{ id: 'wall', label: "Selected lead's wall" }],
  orientation: [
    { id: 'apex', label: 'Apex' }, { id: 'base', label: 'Base' },
    { id: 'anterior', label: 'Anterior' }, { id: 'aorta', label: 'Aorta' }
  ]
};
const GROUP_TITLES = { chambers: 'Chambers', conduction: 'Conduction system', leads: 'Lead names', vectors: 'Vectors', walls: 'Wall regions', orientation: 'Orientation' };
function allCatalogIds() {
  const ids = [];
  for (const g of LABEL_GROUPS) for (const it of LABEL_CATALOG[g]) ids.push(it.id);
  return ids;
}
function ensureLabelItems(fill) {
  if (!ui.labelItems) ui.labelItems = {};
  for (const id of allCatalogIds()) if (ui.labelItems[id] === undefined) ui.labelItems[id] = !!fill;
}
function setAllItems(on) { ensureLabelItems(false); for (const id of allCatalogIds()) ui.labelItems[id] = !!on; }
function groupItemState(name) {
  const items = LABEL_CATALOG[name] || [];
  let n = 0; for (const it of items) if (itemOn(it.id)) n++;
  if (!items.length || n === 0) return 'off';
  if (n === items.length) return 'on';
  return 'mixed';
}
function setGroupItems(name, on) {
  ensureLabelItems(false);
  for (const it of LABEL_CATALOG[name] || []) ui.labelItems[it.id] = !!on;
  ui.labelGroups[name] = !!on;
}
function labelsSectionState() {
  const states = LABEL_GROUPS.map(groupItemState);
  if (states.every(st => st === 'on')) return 'on';
  if (states.every(st => st === 'off')) return 'off';
  return 'mixed';
}
function pictureState() {
  const n = [ui.cut, ui.allLeads, ui.loop].filter(Boolean).length;
  return n === 3 ? 'on' : n === 0 ? 'off' : 'mixed';
}
function persistLabels() {
  try { sessionStorage.setItem(LABEL_STORE, JSON.stringify({ mode: ui.labelMode, groups: ui.labelGroups, items: ui.labelItems })); } catch (e) { /* ignore */ }
}
function anatomyOn() {
  return ui.labelMode === 'guided' || (ui.labelMode === 'custom' && LABEL_GROUPS.some(g => g !== 'leads' && ui.labelGroups[g]));
}
function applyLabelsChange() {
  const t0 = performance.now();
  ui.anatomyLabels = anatomyOn() && ui.labelMode === 'custom';
  syncShowUi(); persistLabels();
  if (groupOn('walls') && itemOn('wall') && state.sel) ensureRegion(LEAD[state.sel].region);
  else { for (const m of regionMeshes) m.visible = false; if (regionLabel) regionLabel.visible = false; }
  applyLabelVisibility(); setLeadStyles(); requestLabelLayout(0);
  if (renderer) { updateLabels(); labelsDirty = false; }
  needsRender = true;
  lastLabelToggleMs = performance.now() - t0;
}
let lastLabelToggleMs = 0;
function setLabelMode(mode, groups) {
  ensureLabelItems(false);
  if (mode !== 'guided' && ui.guided) {
    if (groups) for (const g of LABEL_GROUPS) setGroupItems(g, !!groups[g]);
    else if (mode === 'none') for (const g of LABEL_GROUPS) setGroupItems(g, false);
    else if (mode === 'all') for (const g of LABEL_GROUPS) setGroupItems(g, true);
    syncShowUi(); persistLabels();
    return;
  }
  ui.labelMode = mode;
  if (groups) for (const g of LABEL_GROUPS) setGroupItems(g, !!groups[g]);
  else if (mode === 'guided' || mode === 'none') for (const g of LABEL_GROUPS) setGroupItems(g, false);
  else if (mode === 'all') { ui.labelMode = 'custom'; for (const g of LABEL_GROUPS) setGroupItems(g, true); }
  if (mode === 'none') ui.labelMode = 'custom';
  applyLabelsChange();
}
function setLabelGroup(name, on) {
  setGroupItems(name, on);
  if (ui.guided) { syncShowUi(); persistLabels(); return; }
  ui.labelMode = 'custom';
  applyLabelsChange();
}
function setLabelItem(id, on) {
  ensureLabelItems(false);
  ui.labelItems[id] = !!on;
  for (const g of LABEL_GROUPS) {
    if ((LABEL_CATALOG[g] || []).some(it => it.id === id)) ui.labelGroups[g] = groupItemState(g) !== 'off';
  }
  if (ui.guided) { syncShowUi(); persistLabels(); return; }
  ui.labelMode = 'custom';
  applyLabelsChange();
}
function setSwitchState(btn, state) {
  if (!btn) return;
  btn.setAttribute('aria-checked', state === 'on' ? 'true' : state === 'mixed' ? 'mixed' : 'false');
  btn.dataset.state = state;
}
function labelsLocked() { return ui.labelMode === 'guided' || !!ui.guided; }
function syncShowUi() {
  const locked = labelsLocked();
  const showBtn = $('showBtn');
  if (showBtn) {
    const active = locked || labelsSectionState() !== 'off' || pictureState() !== 'off';
    showBtn.setAttribute('aria-pressed', String(active));
    showBtn.classList.toggle('is-active', active);
  }
  const beat = $('showDuringBeat');
  if (beat) { setSwitchState(beat, (ui.labelMode === 'guided' || ui.guided) ? 'on' : 'off'); beat.disabled = !!ui.guided; }
  const labAll = $('showLabelsAll');
  if (labAll) { setSwitchState(labAll, labelsSectionState()); labAll.disabled = locked; }
  const note = $('showLabelsNote'); if (note) note.hidden = !locked;
  for (const g of LABEL_GROUPS) {
    const sw = $('show-g-' + g);
    if (sw) { setSwitchState(sw, groupItemState(g)); sw.disabled = locked; }
    for (const it of LABEL_CATALOG[g]) {
      const b = $('show-i-' + it.id);
      if (b) { setSwitchState(b, itemOn(it.id) ? 'on' : 'off'); b.disabled = locked; }
    }
  }
  const pic = $('showPictureAll'); if (pic) setSwitchState(pic, pictureState());
  if ($('toggleCut')) $('toggleCut').setAttribute('aria-pressed', String(!!ui.cut));
  if ($('toggleLeads')) $('toggleLeads').setAttribute('aria-pressed', String(!!ui.allLeads));
  if ($('toggleLoop')) $('toggleLoop').setAttribute('aria-pressed', String(!!ui.loop));
  const gBtn = $('guidedBtn'); if (gBtn) gBtn.setAttribute('aria-pressed', String(!!ui.guided));
}
function syncLabelsUi() { syncShowUi(); }
function makeSwitch(id, label, aria) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'show-switch'; btn.id = id;
  btn.setAttribute('role', 'checkbox'); btn.setAttribute('aria-checked', 'false');
  btn.setAttribute('aria-label', aria || label);
  const tick = document.createElement('span'); tick.className = 'show-tick'; tick.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span'); text.textContent = label;
  btn.appendChild(tick); btn.appendChild(text);
  btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); btn.click(); } });
  return btn;
}
function buildShowPanel() {
  const body = $('showPanelBody');
  if (!body || body.dataset.ready) return;
  body.dataset.ready = '1';
  ensureLabelItems(false);
  const labSec = document.createElement('section');
  labSec.className = 'show-section';
  labSec.setAttribute('aria-labelledby', 'showLabelsTitle');
  const labHead = document.createElement('div'); labHead.className = 'show-section-head';
  const labTitle = document.createElement('h3'); labTitle.className = 'show-section-title'; labTitle.id = 'showLabelsTitle'; labTitle.textContent = 'Labels';
  labHead.appendChild(makeSwitch('showLabelsAll', 'All labels', 'All label groups'));
  labHead.appendChild(labTitle);
  labSec.appendChild(labHead);
  labSec.appendChild(makeSwitch('showDuringBeat', 'During the beat', 'During the beat: show a label when that structure is active'));
  const note = document.createElement('p'); note.className = 'show-note'; note.id = 'showLabelsNote'; note.hidden = true;
  note.textContent = 'Labels follow the beat while this is on, or while you walk through the beat.';
  labSec.appendChild(note);
  for (const g of LABEL_GROUPS) {
    const wrap = document.createElement('div'); wrap.className = 'show-group';
    const head = document.createElement('div'); head.className = 'show-group-head';
    head.appendChild(makeSwitch('show-g-' + g, GROUP_TITLES[g], GROUP_TITLES[g] + ' labels'));
    const exp = document.createElement('button');
    exp.type = 'button'; exp.className = 'show-expand'; exp.id = 'show-x-' + g;
    exp.setAttribute('aria-expanded', 'false'); exp.setAttribute('aria-controls', 'show-list-' + g);
    exp.textContent = 'Show items';
    head.appendChild(exp); wrap.appendChild(head);
    const list = document.createElement('div'); list.className = 'show-items'; list.id = 'show-list-' + g; list.hidden = true;
    for (const it of LABEL_CATALOG[g]) list.appendChild(makeSwitch('show-i-' + it.id, it.label, it.label));
    wrap.appendChild(list);
    exp.addEventListener('click', () => {
      const open = list.hidden; list.hidden = !open;
      exp.setAttribute('aria-expanded', String(open));
      exp.textContent = open ? 'Hide items' : 'Show items';
    });
    labSec.appendChild(wrap);
  }
  body.appendChild(labSec);
  $('showLabelsAll').addEventListener('click', () => {
    if (labelsLocked()) return;
    const on = labelsSectionState() !== 'on';
    for (const g of LABEL_GROUPS) setGroupItems(g, on);
    ui.labelMode = 'custom'; applyLabelsChange();
  });
  $('showDuringBeat').addEventListener('click', () => {
    if (ui.guided) return;
    if (ui.labelMode === 'guided') setLabelMode('none'); else setLabelMode('guided');
  });
  for (const g of LABEL_GROUPS) {
    $('show-g-' + g).addEventListener('click', () => { if (!labelsLocked()) setLabelGroup(g, groupItemState(g) !== 'on'); });
    for (const it of LABEL_CATALOG[g]) {
      $('show-i-' + it.id).addEventListener('click', () => { if (!labelsLocked()) setLabelItem(it.id, !itemOn(it.id)); });
    }
  }
  const picAll = $('showPictureAll');
  if (picAll) picAll.addEventListener('click', () => {
    const on = pictureState() !== 'on';
    setCut(on); setToggle('toggleLeads', 'allLeads', on); setToggle('toggleLoop', 'loop', on); syncShowUi();
  });
  const picExp = $('show-x-picture'), picList = $('show-list-picture');
  if (picExp && picList) picExp.addEventListener('click', () => {
    const open = picList.hidden; picList.hidden = !open;
    picExp.setAttribute('aria-expanded', String(open));
    picExp.textContent = open ? 'Hide items' : 'Show items';
  });
  if (!renderer) {
    document.querySelectorAll('#toggleCut, #toggleLeads, #toggleLoop, #resetView, .show-panel .view-btn').forEach(b => { b.disabled = true; });
  }
}
function openShowPanel() {
  const panel = $('showPanel'), btn = $('showBtn'); if (!panel || !btn) return;
  panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
  const first = $('showDuringBeat') || panel.querySelector('button'); if (first) first.focus();
}
function closeShowPanel() {
  const panel = $('showPanel'), btn = $('showBtn'); if (!panel || panel.hidden) return;
  panel.hidden = true; if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
}
function openLabelsPanel() { openShowPanel(); }
function closeLabelsPanel() { closeShowPanel(); }
function setAnatomyLabels(on) {
  ui.anatomyLabels = !!on;
  if (!ui.guided) {
    if (on) setLabelMode('custom', { chambers: true, conduction: true, leads: true, vectors: false, walls: false, orientation: false });
    else setLabelMode('none');
  } else { setLeadStyles(); updateScene(); }
}
function setGuided(on) {
  ui.guided = !!on;
  const btn = $('guidedBtn'); if (btn) btn.setAttribute('aria-pressed', String(!!on));
  const strip = $('guideStrip'); if (strip) strip.hidden = true;
  const row = $('stepRow'); if (row) row.hidden = false;
  if (on) setLabelMode('guided');
  else if (ui.anatomyLabels) setLabelMode('custom', { chambers: true, conduction: true, leads: true, vectors: false, walls: false, orientation: false });
  else setLabelMode('none');
  if (on) { const k = stepIndexAt(state.t); if (k < 0) goStep(0); }
  requestLabelLayout(0);
  requestAnimationFrame(() => { resize(); refit(); });
}
buildShowPanel();
if ($('showBtn')) $('showBtn').addEventListener('click', () => {
  const panel = $('showPanel');
  if (panel && !panel.hidden) closeShowPanel(); else openShowPanel();
});
if ($('guidedBtn')) $('guidedBtn').addEventListener('click', () => setGuided(!ui.guided));
if ($('showPanelClose')) $('showPanelClose').addEventListener('click', closeShowPanel);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('showPanel') && !$('showPanel').hidden) { e.preventDefault(); closeShowPanel(); }
});
document.addEventListener('pointerdown', e => {
  const panel = $('showPanel'), btn = $('showBtn'); if (!panel || panel.hidden) return;
  if (!panel.contains(e.target) && e.target !== btn && !(btn && btn.contains(e.target))) closeShowPanel();
});
try { sessionStorage.removeItem(LABEL_STORE); } catch (e) { /* ignore */ }
syncShowUi();
function stepBack() { const k = stepIndexAt(state.t); goStep(phaseAt(state.t).step ? k - 1 : k); }
function stepNext() { goStep(stepIndexAt(state.t) + 1); }
if ($('stepBack')) $('stepBack').addEventListener('click', stepBack);
if ($('stepNext')) $('stepNext').addEventListener('click', stepNext);
if ($('fsStepBack')) $('fsStepBack').addEventListener('click', stepBack);
if ($('fsStepNext')) $('fsStepNext').addEventListener('click', stepNext);
ONE_SCREEN.addEventListener && ONE_SCREEN.addEventListener('change', () => { resize(); refit(); });
let rzT = null; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { resize(); refit(); }, 60); });

MODEL = computeModel(); buildTraces(); initRecording(); buildPhases(); buildActiveRanges();
if (renderer) { buildScene(); applyMuscleTimes(); applyConductionTimes(); initInteraction(); }
resize();
goView('frontal', true);
setCut(true); // cut-away by default: the His bundle and bundle branches are seen on the septum
ui.allLeads = true; if ($('toggleLeads')) $('toggleLeads').setAttribute('aria-pressed', 'true');
setAnatomyLabels(false);
setGuided(false);
select('II', false); syncCloseup();
if (ONE_SCREEN.addEventListener) ONE_SCREEN.addEventListener('change', syncCloseup);
setT(250);
applyColourTheme();
window.addEventListener('themechange', applyColourTheme);

function frame(now) {
  const dt = Math.min(100, Math.max(0, now - lastClock)); lastClock = now;
  if (state.playing) setSimTime(state.simTime + dt * state.speed);
  if (camAnim && renderer) {
    const k = Math.min(1, (now - camAnim.t0) / 600); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    for (const key of ['az', 'el', 'r']) orbit[key] = camAnim.from[key] + (camAnim.to[key] - camAnim.from[key]) * e;
    placeCamera(); if (k >= 1) camAnim = null;
  }
  if (renderer && labelsDirty) { labelsDirty = false; updateLabels(); }
  if (renderer && needsRender) { renderer.render(scene, camera); needsRender = false; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (!REDUCED) setPlaying(true);

const fsRoot = $('tool');
const fsBtn = $('fsBtn');
const fsExitBtn = $('fsExitBtn');
function nativeFsEl() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}
function isFullscreen() {
  const root = document.getElementById('tool');
  return nativeFsEl() === root || document.body.classList.contains('ecg3d-fs-fallback');
}
function syncFsUi() {
  const on = isFullscreen();
  document.body.classList.toggle('ecg3d-fs', on);
  if (fsBtn) fsBtn.setAttribute('aria-pressed', String(on));
  if (fsExitBtn) fsExitBtn.hidden = !on;
  const box = $('leadBtns');
  if (box) box.setAttribute('aria-label', on ? 'Select up to two leads' : 'Select a lead');
  if (!on && state.sel) state.sels = [state.sel];
  if (on && (!state.sels || !state.sels.length) && state.sel) state.sels = [state.sel];
  syncLeadButtons();
  if (renderer && typeof resize === 'function') {
    try { resize(); } catch (e) {}
  }
  if (renderer && typeof refit === 'function' && VIEWS[state.view]) {
    try { refit(); } catch (e) {}
  }
  if (typeof drawZoom === 'function') drawZoom();
  if (typeof updateScene === 'function' && renderer) updateScene();
  if (typeof updateLabels === 'function' && renderer) updateLabels();
}
function enterFullscreen() {
  if (!fsRoot || isFullscreen()) return Promise.resolve(true);
  const startNative = fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen;
  if (startNative) {
    return Promise.resolve(startNative.call(fsRoot)).then(() => {
      syncFsUi();
      return true;
    }).catch(() => {
      document.body.classList.add('ecg3d-fs-fallback');
      syncFsUi();
      return true;
    });
  }
  document.body.classList.add('ecg3d-fs-fallback');
  syncFsUi();
  return Promise.resolve(true);
}
function exitFullscreen() {
  const el = nativeFsEl();
  const stopNative = document.exitFullscreen || document.webkitExitFullscreen;
  if (el && stopNative) {
    return Promise.resolve(stopNative.call(document)).then(() => {
      document.body.classList.remove('ecg3d-fs-fallback');
      syncFsUi();
      return false;
    }).catch(() => {
      document.body.classList.remove('ecg3d-fs-fallback');
      syncFsUi();
      return false;
    });
  }
  document.body.classList.remove('ecg3d-fs-fallback');
  syncFsUi();
  return Promise.resolve(false);
}
if (fsBtn) fsBtn.addEventListener('click', () => { enterFullscreen(); });
if (fsExitBtn) fsExitBtn.addEventListener('click', () => { exitFullscreen(); });
document.addEventListener('fullscreenchange', syncFsUi);
document.addEventListener('webkitfullscreenchange', syncFsUi);
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  if (document.body.classList.contains('ecg3d-fs-fallback')) {
    ev.preventDefault();
    exitFullscreen();
  }
});

/* Hooks for automated checks, screenshots and later pathology modes */
window.ecg3d = {
  setT: t => { setPlaying(false); setT(t, true); }, select: id => select(id, true), view: v => goView(v, true), play: setPlaying, cut: setCut, step: goStep, setGuided, setAnatomyLabels, guided: () => !!ui.guided,
  selectedLeads: () => selectedSet(),
  projections: () => {
    if (!renderer) return [];
    return selectedSet().map(id => {
      const L = LEAD[id];
      const bar = projBars.find(b => b.visible && b.userData.lead === id);
      const u = L ? new THREE.Vector3(...L.dir) : null;
      const signed = u ? arrowTip.dot(u) : 0;
      const along = bar ? bar.position.clone().sub(VIS_SHIFT).length() : 0;
      return { id, visible: !!bar, length: Math.abs(signed), signed, along, shouldShow: !!bar };
    });
  },

  arrowDims: () => ({ shaftRadius: VEC_SHAFT_R, headRadius: VEC_HEAD_R, headHeight: VEC_HEAD_H, vecScale: VEC_SCALE, minLen: VEC_MIN_LEN }),
  heartCentre: () => { const c = heartCentre(); return { x: c.x, y: c.y, z: c.z }; },
  visualShift: () => ({ x: VIS_SHIFT.x, y: VIS_SHIFT.y, z: VIS_SHIFT.z }),
  apexWorld: () => {
    const pts = (typeof heartPoints === 'function' && heartPoints()) || [];
    let best = null, minY = Infinity;
    for (const q of pts) { if (q.y < minY) { minY = q.y; best = q; } }
    const a = best || new THREE.Vector3(0.32, -2.02, 0.05).applyMatrix4(HEART_VIS);
    return { x: a.x, y: a.y, z: a.z };
  },
  electrodeWorld: id => {
    const o = leadObjs[id]; if (!o) return null;
    const sc = LEADS.find(L => L.id === id).type === 'limb' ? limbScale : 1;
    return { x: o.pole[0] * sc, y: o.pole[1] * sc, z: o.pole[2] * sc };
  },
  sheetChestMmPerMv: () => SHEET_CHEST_MM,
  sheetDrawnTexts: () => LAST_SHEET_TEXTS.slice(),
  dipoleAt: t => dipole(t).slice(),
  bodyPoint: p => toBody(p),
  visualPoint: p => { const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(HEART_VIS); return [v.x, v.y, v.z]; },
  visScale: () => VIS_SCALE,
  sheetHits: () => [...document.querySelectorAll('.ecg12-hit')].map(b => ({
    id: b.dataset.lead, label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'),
    tabIndex: b.tabIndex, tag: b.tagName, type: b.type
  })),
  orbitState: () => ({ az: orbit.az / DEG, el: orbit.el / DEG, r: orbit.r, target: { x: orbit.target.x, y: orbit.target.y, z: orbit.target.z } }),
  refitView: () => { refit(); return window.ecg3d.orbitState(); },
  leadLabel: id => leadObjs[id] && leadObjs[id].lbl && leadObjs[id].lbl.el,
  leadAt: (x, y) => leadAtEvent({ clientX: x, clientY: y }),
  sheetCell: cellPoint,
  sheetGeo: () => ECG_DRAW && { ...ECG_DRAW },
  sheetClips: () => LAST_CLIPS.slice(),
  closeupOpen: () => closeupChosen && !($('leadCloseupCard') && $('leadCloseupCard').hidden),
  toggle: (key, on) => { if (key === 'labelAll') { setLabelMode(on ? 'all' : 'guided'); return; } setToggle({ allLeads: 'toggleLeads', loop: 'toggleLoop' }[key], key, on); },
  openZoom: () => {}, closeZoom: () => {}, zoomOpen: () => false,
  singleLead: () => false, setSingleLead: () => {},
  setLabels: setLabelMode, setLabelGroup, setLabelItem,
  labels: () => ({ mode: ui.labelMode, groups: { ...ui.labelGroups }, items: { ...(ui.labelItems || {}) } }),
  openLabels: openShowPanel, closeLabels: closeShowPanel,
  openShow: openShowPanel, closeShow: closeShowPanel,
  openKey: () => window.__ecgKeyDialog && window.__ecgKeyDialog.open(),
  closeKey: () => window.__ecgKeyDialog && window.__ecgKeyDialog.close(),
  keyOpen: () => !!(window.__ecgKeyDialog && window.__ecgKeyDialog.isOpen()),
  lookingFrom: () => lookingFromText(orbit.az, orbit.el),

  applyTheme: applyColourTheme, isColourBlind: isColourBlindTheme, theme: () => (isColourBlindTheme() ? 'colour-blind' : 'default'),
  themeColors: () => ({
    rest: '#' + U.cRest.value.getHexString(),
    front: '#' + U.cFront.value.getHexString(),
    dep: '#' + U.cDep.value.getHexString(),
    dot: '#' + U.cDot.value.getHexString(),
    condIdle: '#' + CIDLE.getHexString(),
    condDone: '#' + CDONE.getHexString(),
    cursor: PAPER.cursor.toLowerCase()
  }),
  heartBox: () => { camera.updateMatrixWorld(); let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (const p of heartPoints()) { const v = p.clone().project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    return { top: (1 - y1) / 2, bottom: (1 - y0) / 2, left: (x0 + 1) / 2, right: (x1 + 1) / 2, height: (y1 - y0) / 2, limbScale }; },
  poleScreen: id => { const v = new THREE.Vector3(...leadObjs[id].pole).multiplyScalar(LEADS.find(L => L.id === id).type === 'limb' ? limbScale : 1).project(camera); const r = stage.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
  leadRodsShown: () => renderer ? Object.values(leadObjs).filter(o => o.grp.visible).length : 0,
  orbit: (az, el, r) => {
    camAnim = null;
    const naz = az * DEG, nel = el * DEG;
    if (Math.abs(naz - orbit.az) > 0.15 || Math.abs(nel - orbit.el) > 0.15) {
      for (const L of labels) { L.px = null; L.py = null; L.colSide = null; }
    }
    orbit.az = naz; orbit.el = nel; if (r) orbit.r = r; placeCamera(); markCustom();
    if (renderer) updateLabels();
  },
  conduction: () => {
    const M = MODEL, ventr = []; for (let e = 0; e < NE; e++) if (ELEM.domain[e] && isFinite(M.act[e])) ventr.push(M.act[e]);
    ventr.sort((a, b) => a - b);
    // endocardium (next to a cavity) versus epicardium (next to the outside), ventricles only
    let en = 0, ec = 0, pn = 0, pc = 0;
    for (let e = 0; e < NE; e++) { if (!ELEM.domain[e] || !isFinite(M.act[e])) continue; const [i, j, k] = ELEM.cell[e]; let outside = false;
      for (const [di, dj, dk] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) { const a = i + di, b = j + dj, c = k + dk; if (a < 0 || b < 0 || c < 0 || a >= NX || b >= NY || c >= NZ || !cellRegion[gridIdx(a, b, c)]) outside = true; }
      if (IS_ENDO_LV[e] || IS_ENDO_RV[e]) { en += M.act[e]; ec++; } else if (outside) { pn += M.act[e]; pc++; } }
    const tubes = {}; for (const c of condParts) { if (!c.s || !c.tube) continue; const A = c.tube.g.attributes.aT.array; tubes[c.s.id] = { t0: A[0], t1: A[A.length - 1], internodal: !!c.internodal }; }
    return { saTime: CONDUCTION.saTime, tAV: M.tAV, tHis: M.tHis, atrialEnd: M.atrialEnd, vMin: M.vMin, vMax: M.vMax, ventMedian: ventr[ventr.length >> 1],
      endoMean: en / ec, epiMean: pn / pc, seg: M.seg, tubes, internodal: (CONDUCTION.internodal || []).map(s => s.id),
      segments: CONDUCTION.segments.map(s => ({ id: s.id, parent: s.parent, fibre: !!s.fibre, label: s.label || null })) };
  },
  beadAt: (id, t) => { const b = beads.find(x => x.s.id === id); if (!b) return null; setPlaying(false); setT(t, false); updateScene(); return { visible: b.bead.visible, pos: b.bead.position.toArray(), end: CONDUCTION.segments.concat(CONDUCTION.bachmann ? [CONDUCTION.bachmann] : []).find(s => s.id === id).pts.slice(-1)[0] }; },
  trace: id => Array.from(TRACE[id]), timings: () => ({ tAV: MODEL.tAV, tHis: MODEL.tHis, seg: MODEL.seg, vMin: MODEL.vMin, vMax: MODEL.vMax, recMin: MODEL.recMin, recMax: MODEL.recMax }),
  now: () => ({ t: state.t, beat: state.beat, speed: state.speed, playing: state.playing, pageTime: pageTime(), simTime: state.simTime }),
  isFullscreen, enterFullscreen, exitFullscreen,
  setSpeed: v => { state.speed = +v; if (speedSel) speedSel.value = String(state.speed); syncClock(); return state.speed; },
  pageTime, simTime: () => state.simTime,
  setSimTime: (ms, announce) => { setPlaying(false); setSimTime(ms, announce !== false); return state.simTime; },
  advanceSim: (deltaMs, announce, quiet) => { advanceSim(deltaMs, announce, quiet); return state.simTime; },
  refresh: announce => { applyTime(announce); },
  syncClock, frameAt: now => frame(now),
  sheetCursors: () => LAST_CURSORS.slice(),
  sampleAt: (id, t) => sampleRecording(id, t),
  beatIndex: t => beatIndexAt(t),
  beatStart: i => { ensureBeatsUntil((i + 2) * 1000); return REC.starts[i]; },
  beatStartsUntil: t => { ensureBeatsUntil(t); return REC.starts.filter(st => st <= t).slice(); },
  recording: () => ({ seed: REC.seed, rr0: REC.rr0, rsaAmp: REC.rsaAmp, rsaMs: REC.rsaMs, wanderMv: REC.wanderMv, wanderMs: REC.wanderMs, jitter: REC.jitter, starts: REC.starts.slice() }),
  closeupMeta: (idx = 0) => { const c = idx === 1 ? $('leadCloseup2') : $('leadCloseup'); return c ? { ...c.dataset } : null; },
  closeupAnnots: (idx = 0) => {
    const c = idx === 1 ? $('leadCloseup2') : $('leadCloseup'); if (!c) return null;
    try { return JSON.parse(c.dataset.annots || 'null'); } catch (err) { return null; }
  },
  intervals: () => (INTERVALS ? { ...INTERVALS } : null),
  closeupWave: (idx = 0) => {
    const c = idx === 1 ? $('leadCloseup2') : $('leadCloseup'); if (!c) return null;
    const frame = c.parentElement;
    const vis = frame ? visibleCssBox(c) : { width: +c.dataset.cssW, height: +c.dataset.cssH, left: 0, top: 0 };
    const cr = c.getBoundingClientRect();
    return {
      lead: c.dataset.lead, cssW: +c.dataset.cssW, cssH: +c.dataset.cssH,
      px: +c.dataset.px, baseMm: +c.dataset.baseMm, yMin: +c.dataset.yMin, yMax: +c.dataset.yMax,
      upMm: +c.dataset.upMm, downMm: +c.dataset.downMm,
      visH: vis.height, visW: vis.width,
      canvasH: cr.height, canvasW: cr.width,
      visTopInCanvas: vis.top - cr.top,
      visBotInCanvas: vis.top - cr.top + vis.height
    };
  },
  phase: () => { const p = phaseAt(state.t); return { key: p.key, from: p.from, to: p.to, step: p.step || null, title: p.title }; },
  leadDecor: () => ({
    allLeads: !!ui.allLeads,
    arc: !!(chestArc && chestArc.visible),
    sternum: !!(sternumLine && sternumLine.visible),
    groups: Object.fromEntries(LEADS.map(L => {
      const o = leadObjs[L.id];
      return [L.id, { grp: !!(o && o.grp.visible), pos: !!(o && o.pos.visible), neg: !!(o && o.negR.visible), marker: !!(o && o.marker.visible), lbl: !!(o && o.lbl.visible && !o.lbl.el.classList.contains('hidden')) }];
    }))
  }),
  labelSnapshot: () => labels.filter(L => L.visible && !L.el.classList.contains('hidden')).map(L => ({
    text: L.el.textContent, cls: L.cls, tag: L.tag || null, leadId: L.leadId || null, transform: L.el.style.transform
  })),
  cursorScreen: () => {
    if (!ECG_DRAW) return [];
    const r = ecgCanvas.getBoundingClientRect();
    const scale = r.width / (ECG_DRAW.cssW || r.width);
    return LAST_CURSORS.map(c => ({ ...c, screenX: r.left + c.x * scale, screenY: r.top }));
  },
  closeupCursorScreen: (idx = 0) => {
    const c = idx === 1 ? $('leadCloseup2') : $('leadCloseup'); if (!c) return null;
    const r = c.getBoundingClientRect();
    const cssW = parseFloat(c.dataset.cssW || r.width);
    const x = parseFloat(c.dataset.cursorX || '0');
    return { x, screenX: r.left + x * (r.width / (cssW || r.width)), tAbs: +c.dataset.tAbs, t0: +c.dataset.t0 };
  },
  setPageTime: ms => {
    setPlaying(false);
    setSimTime(Number(ms), true);
    return state.simTime;
  },
  leadPillRays: () => {
    if (!camera || !stage) return [];
    const sr = stage.getBoundingClientRect();
    const origin = VIS_SHIFT.clone().project(camera);
    const ox = sr.left + (origin.x + 1) / 2 * sr.width;
    const oy = sr.top + (1 - origin.y) / 2 * sr.height;
    return LEADS.map(L => {
      const o = leadObjs[L.id];
      const el = o && o.lbl && o.lbl.el;
      const r = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
      const visible = !!(o && o.lbl && o.lbl.visible && el && !el.classList.contains('hidden') && r.width > 0);
      const dir = L.type === 'limb' ? new THREE.Vector3(...L.dir) : new THREE.Vector3(...(o ? o.pole : [1, 0, 0])).normalize();
      const far = dir.clone().multiplyScalar(20).project(camera);
      const fx = sr.left + (far.x + 1) / 2 * sr.width;
      const fy = sr.top + (1 - far.y) / 2 * sr.height;
      const px = r.left + r.width / 2, py = r.top + r.height / 2;
      const rayAng = Math.atan2(fy - oy, fx - ox);
      const pillAng = Math.atan2(py - oy, px - ox);
      let d = (pillAng - rayAng) * 180 / Math.PI;
      while (d > 180) d -= 360; while (d < -180) d += 360;
      return { id: L.id, type: L.type, visible, deltaDeg: d, origin: { x: ox, y: oy }, far: { x: fx, y: fy }, pill: { x: px, y: py } };
    });
  },
  lastLabelMs: () => lastLabelToggleMs,
  BASELINE, CONDUCTION, rebuildModel, webgl: !!renderer
};
