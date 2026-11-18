/* ECG Basics in 3D (prototype).
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
  vAtrial: 0.018, vHis: 0.04, vVent: 0.007, vPurkinje: 0.08, purkinjeJunction: 3, purkinjeTopY: -0.28,
  segments: [
    { id: 'his', label: 'Bundle of His', parent: 'avn', v: 0.012, r: 0.06, pts: [[-0.10, 0.06, -0.02], [-0.05, -0.08, 0.0], [0.0, -0.32, 0.02]] },
    { id: 'rbb', label: 'Right bundle branch', parent: 'his', r: 0.045, purk: 'RV', purkFromY: -0.95,
      pts: [[0.0, -0.32, 0.02], [-0.19, -0.6, 0.05], [-0.2, -1.2, 0.08], [-0.26, -1.58, 0.1], [-0.72, -1.42, 0.28]] },
    { id: 'lbb', label: 'Left bundle branch', parent: 'his', r: 0.05, purk: 'LV', purkFromY: -0.35,
      pts: [[0.0, -0.32, 0.02], [0.18, -0.46, 0.0], [0.19, -0.62, 0.0]] },
    { id: 'laf', label: 'Left anterior fascicle', parent: 'lbb', r: 0.035, purk: 'LV', purkFromY: -0.35,
      pts: [[0.19, -0.62, 0.0], [0.24, -0.95, 0.3], [0.6, -1.3, 0.42]] },
    { id: 'lpf', label: 'Left posterior fascicle', parent: 'lbb', r: 0.035, purk: 'LV', purkFromY: -0.35,
      pts: [[0.19, -0.62, 0.0], [0.27, -1.05, -0.3], [0.64, -1.5, -0.38]] }
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
  orientation: { rotY: 35, rotZ: 15, rotX: -10 },
  conduction: CONDUCTION,
  repolarisation: { apd0: 300, slope: 1.4, atrialApd: 170, anteriorShift: 3, apicalShift: 0 },
  smoothing: { p: 11, qrs: 7, t: 22 },
  calibration: { qrsIIpeak: 1.2, pIIpeak: 0.16, tIIpeak: 0.3, chestMaxR: 1.3 },
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
let MODEL = null, CAL = null;
function computeModel() {
  const C = CONDUCTION;
  const act = new Float64Array(NE).fill(Infinity);
  // 1. Atria: cell-to-cell spread from the SA node
  const atrialAct = act; propagate(atrialAct, [[SA_ELEM, C.saTime]], C.vAtrial);
  const tAV = atrialAct[AV_ELEM];
  // 2. AV node delay, then the His-Purkinje tree
  const tHis = (C.avBlocked ? Infinity : tAV + C.avDelay + (C.avExtra || 0));
  const seg = {};
  for (const s of C.segments) {
    const parentEnd = s.parent === 'avn' ? tHis : (seg[s.parent] ? seg[s.parent].end : Infinity);
    const start = s.blocked ? Infinity : parentEnd + (s.extraDelay || 0);
    const len = polyLen(s.pts);
    const v = s.v || C.vHis; seg[s.id] = { start, end: start + len / v, len, v };
  }
  // 3. Purkinje terminals on the endocardium: earliest arrival from any source point
  const seeds = [];
  const sources = { LV: [], RV: [] };
  for (const s of C.segments) {
    if (!s.purk) continue; const sg = seg[s.id]; if (!isFinite(sg.start)) continue;
    for (const q of polySample(s.pts, 0.05)) if (q.p[1] <= s.purkFromY) sources[s.purk].push([q.p, sg.start + q.s / sg.v]);
  }
  for (const [list, side] of [[endoLV, 'LV'], [endoRV, 'RV']]) {
    if (!sources[side].length) continue;
    for (const e of list) {
      const p = ELEM.pos[e]; if (p[1] > C.purkinjeTopY) continue; // the bases have few Purkinje fibres
      let best = Infinity;
      for (const [q, t] of sources[side]) { const tt = t + Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / C.vPurkinje; if (tt < best) best = tt; }
      seeds.push([e, best + C.purkinjeJunction]);
    }
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
function dipole(t) { const i = Math.max(0, Math.min(BEAT_MS, Math.round(t))) * 3; const D = MODEL.D; return [D[i], D[i + 1], D[i + 2]]; }

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
      text: 'The SA node, where the superior vena cava joins the right atrium, fires and the wave spreads through both atria. The arrow points down and to the left, so P is upright in II.' },
    { key: 'avd', step: 'AV node delay', at: Math.round((M.atrialEnd + 8 + M.tHis) / 2), from: M.atrialEnd + 8, to: M.tHis,
      title: 'PR segment: AV node delay',
      text: `The AV node, low in the interatrial septum, holds the impulse for about ${r(M.tHis - M.tAV)} ms. The line is flat while the atria finish contracting.` },
    { key: 'his', step: 'His and bundles', at: Math.round(hisMid), from: M.tHis, to: qrsOn,
      title: 'PR segment: His bundle and bundle branches',
      text: 'The white pulse runs down the His bundle on the septal crest and into the bundle branches. These fibres are too small to show on the ECG, so the line is still flat.' },
    { key: 'sep', step: 'Septum', at: Math.round(qrsOn + 8), from: qrsOn, to: qrsOn + 16,
      title: 'Start of QRS: the septum',
      text: 'The septum depolarises first, from left to right, so the small early arrow points right. Left-sided leads such as I and V6 show a small q wave.' },
    { key: 'main', step: 'Ventricles (QRS)', at: Math.round(qrsOn + 40), from: qrsOn + 16, to: qrsOff,
      title: 'QRS: the ventricles depolarise',
      text: 'The wave spreads from the inner wall outwards. The big arrow points down and left, towards II, and its shadow on the lead (striped bar) is long, so II shows a tall R wave.' },
    { key: 'ST', step: 'ST segment', at: Math.round((qrsOff + tOn) / 2), from: qrsOff, to: tOn,
      title: 'ST segment',
      text: 'All ventricular muscle is depolarised (dotted magenta), so there is no arrow and the line is flat.' },
    { key: 'T', step: 'T wave', at: Math.round((M.recMin + M.recMax) / 2 - 10), from: tOn, to: tOff,
      title: 'T wave: the ventricles repolarise',
      text: 'The hatched band shows muscle recovering, outside first. Recovery moving away from a lead gives an upright T, so T is upright in II.' },
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
function phaseAt(t) { return PHASES.find(p => t >= p.from && t < p.to) || PHASES[PHASES.length - 1]; }

/* ======================= State ======================= */
const state = { t: 250, playing: false, speed: 0.25, sel: 'II', view: 'frontal', beat: 0 };
const scrub = $('scrub'), timeOut = $('timeOut'), playBtn = $('playBtn'), speedSel = $('speed');

/* ======================= ECG paper (12-lead and selected-lead strip) ======================= */
// 25 mm/s and 10 mm/mV: 1 small square = 1 mm = 40 ms = 0.1 mV.
const MM_PER_MS = 25 / 1000, MM_PER_MV = 10;
const ECG = { calW: 8, colMs: 2500, rowH: 30, base: 17, top: 2 };
const LAYOUT = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];
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
function drawCal(g, x0mm, basemm, px) { // 1 mV, 200 ms calibration pulse
  g.strokeStyle = PAPER.trace; g.lineWidth = 1.4; g.beginPath();
  g.moveTo(x0mm * px, basemm * px); g.lineTo((x0mm + 1) * px, basemm * px); g.lineTo((x0mm + 1) * px, (basemm - 10) * px);
  g.lineTo((x0mm + 6) * px, (basemm - 10) * px); g.lineTo((x0mm + 6) * px, basemm * px); g.lineTo((x0mm + 7) * px, basemm * px); g.stroke();
}
function drawSeg(g, id, t0, t1, xStartMm, basemm, px, bold, lw) {
  const tr = TRACE[id]; g.strokeStyle = PAPER.trace; g.lineWidth = lw || (bold ? 2.3 : 1.3); g.lineJoin = 'round'; g.beginPath();
  for (let t = t0; t <= t1; t += 1) { const v = tr[t % BEAT_MS]; const x = (xStartMm + (t - t0) * MM_PER_MS) * px, y = (basemm - v * MM_PER_MV) * px; t === t0 ? g.moveTo(x, y) : g.lineTo(x, y); }
  g.stroke();
}
function cursorAt(g, id, tAbs, xStartMm, tStart, basemm, topmm, hmm, px) {
  const beat0 = Math.floor(tAbs / BEAT_MS) * BEAT_MS;
  const xb = (xStartMm + (beat0 - tStart) * MM_PER_MS) * px;
  const x = (xStartMm + (tAbs - tStart) * MM_PER_MS) * px;
  g.strokeStyle = PAPER.cursor; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, topmm * px); g.lineTo(x, (topmm + hmm) * px); g.stroke();
  const v = TRACE[id][Math.round(tAbs) % BEAT_MS];
  g.fillStyle = PAPER.trace; g.beginPath(); g.arc(x, (basemm - v * MM_PER_MV) * px, 3, 0, Math.PI * 2); g.fill();
}
function label(g, text, xmm, ymm, px, selected) {
  g.font = `${selected ? 800 : 700} ${Math.max(11, 3.6 * px)}px "Source Sans 3", Arial, sans-serif`;
  const w = g.measureText(text).width;
  if (selected) { g.fillStyle = '#111'; g.fillRect(xmm * px - 3, ymm * px - 3.6 * px, w + 6, 4.6 * px); g.fillStyle = '#fff'; }
  else g.fillStyle = '#111';
  g.fillText(text, xmm * px, ymm * px);
}
let ecgPx = 4;
function drawECG() {
  const frame = ecgCanvas.parentElement; const wmm = ECG.calW + 250 + 2, hmm = ECG.top + 4 * ECG.rowH + 7;
  const cssW = Math.max(frame.clientWidth, 940); const px = cssW / wmm; ecgPx = px;
  const g = prepCanvas(ecgCanvas, cssW, Math.round(hmm * px)); drawPaper(g, wmm, hmm, px);
  const tLocal = Math.round(state.t);
  for (let r = 0; r < 4; r++) {
    const top = ECG.top + r * ECG.rowH, base = top + ECG.base;
    drawCal(g, 0.5, base, px);
    if (r < 3) {
      for (let c = 0; c < 4; c++) {
        const id = LAYOUT[r][c], t0 = c * ECG.colMs, x0 = ECG.calW + c * ECG.colMs * MM_PER_MS, sel = id === state.sel;
        const kFirst = Math.ceil(t0 / BEAT_MS) * BEAT_MS; // first whole beat in this column
        cursorAt(g, id, kFirst + tLocal, x0, t0, base, top + 1, ECG.rowH - 2, px);
        drawSeg(g, id, t0, t0 + ECG.colMs, x0, base, px, sel);
        if (c) { g.strokeStyle = '#111'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x0 * px, (base - 3) * px); g.lineTo(x0 * px, (base + 3) * px); g.stroke(); }
        label(g, id, x0 + 1.5, top + 5, px, sel);
        if (sel) { g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(x0 * px + 1, (top + 0.5) * px, ECG.colMs * MM_PER_MS * px - 2, (ECG.rowH - 1) * px); }
      }
    } else {
      const sel = state.sel === 'II', x0 = ECG.calW;
      cursorAt(g, 'II', (state.beat % STRIP_BEATS) * BEAT_MS + tLocal, x0, 0, base, top + 1, ECG.rowH - 2, px);
      drawSeg(g, 'II', 0, 10000, x0, base, px, sel);
      label(g, 'II  (rhythm strip)', x0 + 1.5, top + 5, px, sel);
    }
  }
  g.font = `600 ${Math.max(11, 3.2 * px)}px "Source Sans 3", Arial, sans-serif`; g.fillStyle = '#111';
  const yb = (ECG.top + 4 * ECG.rowH + 5) * px;
  g.fillText('25 mm/s    10 mm/mV    Rate 75/min    Computed by the teaching model, not a patient recording', ECG.calW * px, yb);
}
function drawMini() {
  const frame = miniCanvas.parentElement; const wmm = ECG.calW + 125 + 1, hmm = 26; const cssW = frame.clientWidth - 2; if (cssW < 50) return;
  const px = cssW / wmm; const g = prepCanvas(miniCanvas, cssW, Math.round(hmm * px)); drawPaper(g, wmm, hmm, px);
  const base = 15, id = state.sel; drawCal(g, 0.5, base, px);
  cursorAt(g, id, (state.beat % 6) * BEAT_MS + Math.round(state.t), ECG.calW, 0, base, 0.5, hmm - 1, px);
  drawSeg(g, id, 0, 5000, ECG.calW, base, px, true);
  label(g, id, ECG.calW + 1, 5, px, false);
}
/* Close-up of the selected lead: two beats, same 25 mm/s and 10 mm/mV paper, drawn large */
const zoomCanvas = $('zoomECG');
function drawZoom() {
  if (!zoomCanvas) return;
  const frame = zoomCanvas.parentElement; const wmm = ECG.calW + 2 * BEAT_MS * MM_PER_MS + 2, hmm = 49, base = 19;
  const px = Math.max(10, Math.min(15, (frame.clientWidth - 2) / wmm));
  const g = prepCanvas(zoomCanvas, Math.round(wmm * px), Math.round(hmm * px)); drawPaper(g, wmm, hmm, px);
  const id = state.sel, x0 = ECG.calW; drawCal(g, 0.5, base, px);
  cursorAt(g, id, (state.beat % 2) * BEAT_MS + Math.round(state.t), x0, 0, base, 0.5, hmm - 1, px);
  drawSeg(g, id, 0, 2 * BEAT_MS, x0, base, px, true, 2.6);
  label(g, id, x0 + 1, 4.5, px, true);
  const I = INTERVALS; if (!I) return;
  const X = t => (x0 + t * MM_PER_MS) * px, tr = TRACE[id];
  const font = (w, mm) => `${w} ${Math.round(mm * px)}px "Source Sans 3", Arial, sans-serif`;
  const tag = (txt, xm, ymm) => { g.font = '700 15px "Source Sans 3", Arial, sans-serif'; const w = g.measureText(txt).width; const y = ymm * px;
    g.fillStyle = 'rgba(255,255,255,0.94)'; g.fillRect(xm - w / 2 - 4, y - 15, w + 8, 20); g.strokeStyle = '#111'; g.lineWidth = 1; g.strokeRect(xm - w / 2 - 4, y - 15, w + 8, 20);
    g.fillStyle = '#111'; g.fillText(txt, xm - w / 2, y); };
  const peakAt = (a, b) => { let k = a; for (let t = a; t <= b; t++) if (Math.abs(tr[t]) > Math.abs(tr[k])) k = t; return k; };
  // wave names above the first beat, placed clear of the trace
  const top = (a, b) => { let m = 0; for (let t = a; t <= b; t++) m = Math.max(m, tr[t]); return base - m * MM_PER_MV - 2.2; };
  tag('P', X(peakAt(I.pOn, I.pOff)), Math.min(base - 4, top(I.pOn, I.pOff)));
  tag('QRS', X((I.qOn + I.qOff) / 2), Math.max(6, Math.min(base - 4, top(I.qOn, I.qOff))));
  const tPk = peakAt(I.qOff + 40, I.tEnd); tag('T', X(tPk), Math.min(base - 4, top(I.qOff + 40, I.tEnd)));
  // interval brackets under the trace (from the model's measured intervals, the same in every lead)
  const bracket = (a, b, ymm, txt) => {
    const y = ymm * px; g.strokeStyle = '#111'; g.lineWidth = 1.6; g.beginPath();
    g.moveTo(X(a), y - 4); g.lineTo(X(a), y + 4); g.moveTo(X(a), y); g.lineTo(X(b), y); g.moveTo(X(b), y - 4); g.lineTo(X(b), y + 4); g.stroke();
    g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(X(a), y - 4); g.lineTo(X(a), (base - 1) * px); g.moveTo(X(b), y - 4); g.lineTo(X(b), (base - 1) * px); g.stroke(); g.setLineDash([]);
    tag(txt, (X(a) + X(b)) / 2, ymm + 24 / px);
  };
  bracket(I.pOn, I.qOn, 37, `PR ${I.PR} ms`); bracket(I.qOn, I.qOff, 42, `QRS ${I.QRS} ms`);
  bracket(BEAT_MS + I.qOn, BEAT_MS + I.tEnd, 42, `QT ${I.QT} ms`); bracket(BEAT_MS + I.pOn, BEAT_MS + I.pOff, 37, `P ${I.P} ms`);
  $('zoomLead').textContent = id;
}
function ecgClick(e) {
  const r = ecgCanvas.getBoundingClientRect(); const xmm = (e.clientX - r.left) / ecgPx, ymm = (e.clientY - r.top) / ecgPx;
  const row = Math.floor((ymm - ECG.top) / ECG.rowH); if (row < 0 || row > 3) return;
  if (row === 3) { select('II'); return; }
  const col = Math.floor((xmm - ECG.calW) / (ECG.colMs * MM_PER_MS)); if (col < 0 || col > 3) return;
  select(LAYOUT[row][col]);
}
ecgCanvas.addEventListener('click', ecgClick);
(function leadButtons() {
  const box = $('leadBtns');
  for (const L of LEADS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 't-btn lead-btn'; b.dataset.lead = L.id; b.textContent = L.id;
    b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', `Lead ${L.id}, ${L.type === 'limb' ? 'limb lead at ' + L.angle.replace('-', 'minus ') : 'chest lead'}, ${L.view.toLowerCase()}`);
    b.addEventListener('click', () => select(L.id)); box.appendChild(b);
  }
})();

/* ======================= 3D scene ======================= */
// The heart is drawn enlarged (VIS_SCALE) so the conduction system is readable; lead lines and chest
// electrodes are drawn to the same enlarged scale. The electrical model itself is unchanged.
const VIS_SCALE = 1.7;
const HEART_VIS = new THREE.Matrix4().makeScale(VIS_SCALE, VIS_SCALE, VIS_SCALE).multiply(HEART_M);
let renderer = null, scene, camera, needsRender = true;
const stage = $('stage'), canvas = $('scene'), labelLayer = $('labels');
function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch (e) { return false; }
}
try { if (webglAvailable()) renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true }); } catch (e) { renderer = null; }
if (!renderer || !renderer.getContext()) {
  $('fallback').hidden = false; canvas.hidden = true; renderer = null;
  document.querySelectorAll('.view-btn, #resetView, #toggleCut, #toggleLeads, #toggleLabelAll, #toggleLoop').forEach(b => { b.disabled = true; });
  $('sceneHelp').textContent = '3D is unavailable here, but the timeline, phase buttons and the 12-lead ECG still work.';
}
if (renderer) renderer.localClippingEnabled = true;

const labels = [];
function addLabel(text, cls, getPos, prio) {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.textContent = text;
  labelLayer.appendChild(el);
  const L = { el, getPos, visible: true, cls, prio: prio != null ? prio : ({ proj: 1, vec: 2, node: 2, region: 3, lead: 4, cond: 5, heart: 6 }[cls] || 5) };
  labels.push(L); return L;
}

const orbit = { az: 0, el: 0, r: 17, target: new THREE.Vector3(0, 0.2, 0) };
const SECTION_N = dirToBody([0, 0, 1]);
const VIEWS = {
  frontal:    { az: 0, el: 0, r: 16, note: "Frontal view: limb leads (hexaxial). The patient's left is on your right." },
  section:    { az: Math.atan2(SECTION_N[0], SECTION_N[2]), el: Math.asin(SECTION_N[1]), r: 13, note: 'Face-on to the cut-away: the four chambers and the conduction system.' },
  oblique:    { az: 35 * DEG, el: 14 * DEG, r: 24, note: '3D view. Drag to rotate.' },
  transverse: { az: 0, el: 89.4 * DEG, r: 22, note: "Transverse view from above: front of the chest at the bottom, patient's left on your right." }
};
const ui = { cut: false, labelAll: false, allLeads: false, loop: false };

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
   Each state has its own colour family plus a pattern (Ed is red-green colour blind):
   resting: flat grey; depolarisation front: orange band with dark edges;
   depolarised: magenta with a few large soft dots; repolarising: wide magenta and grey stripes.
   Patterns are in screen space and antialiased; vertex times are smoothed so the band is one clean line. */
const U = {
  uT: { value: 0 }, uPx: { value: 1 }, uFront: { value: 16 }, uRepol: { value: 45 },
  cRest: { value: new THREE.Color(0xC4C4C4) }, cFront: { value: new THREE.Color(0xE0701E) },
  cDep: { value: new THREE.Color(0xB0287A) }, cDot: { value: new THREE.Color(0xF4D2E6) },
  cCav: { value: new THREE.Color(0xF6F1E8) }, cEdge: { value: new THREE.Color(0x1A1A1A) }
};
const STATE_GLSL = `
uniform float uT; uniform float uPx; uniform float uFront; uniform float uRepol;
uniform vec3 cRest; uniform vec3 cFront; uniform vec3 cDep; uniform vec3 cDot;
// w = how much act changes per screen pixel (fwidth, computed by the caller in uniform control flow)
vec3 stateCol(float act, float rec, float w) {
  vec2 fc = gl_FragCoord.xy / uPx;
  if (uT < act) return cRest;                                   // resting: flat grey
  if (uT < act + uFront) {                                      // front: one orange band with soft-edged dark borders (about 2 px)
    float e = min(uT - act, act + uFront - uT) / w;
    return mix(vec3(0.09), cFront, smoothstep(1.0, 2.4, e));
  }
  if (uT < rec) {                                               // depolarised: magenta with a few large soft dots
    vec2 g = mod(fc + vec2(0.0, 13.0) * step(13.0, mod(fc.x, 52.0)), 26.0) - 13.0;
    return mix(cDep, cDot, 0.45 * (1.0 - smoothstep(4.0, 5.6, length(g))));
  }
  if (uT < rec + uRepol) {                                      // repolarising: wide diagonal magenta and grey stripes
    float s = mod(fc.x - fc.y, 30.0);
    return mix(cRest, cDep, smoothstep(0.0, 1.4, s) * (1.0 - smoothstep(14.0, 15.4, s)));
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
  float sh = 0.70 + 0.30 * max(dot(n, normalize(vec3(0.35, 0.55, 1.0))), 0.0);
  if (!gl_FrontFacing) sh *= 0.62;
  float w = max(fwidth(vAct), 1e-3);
  gl_FragColor = vec4(stateCol(vAct, vRec, w) * sh, 1.0);
}`;
const SECTION_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SECTION_FS = `
varying vec2 vUv; uniform sampler2D uMask; uniform sampler2D uTimes; uniform vec2 uTSize; uniform vec3 cCav; uniform vec3 cEdge;
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
  if (m.r < 0.5 - fr) discard;
  vec3 col = mix(cCav, stateCol(ar.x, ar.y, w), smoothstep(0.5 - fg, 0.5 + fg, m.g));
  float line = 1.0 - smoothstep(0.6, 1.6, min(abs(m.r - 0.5) / fr, abs(m.g - 0.5) / fg));
  gl_FragColor = vec4(mix(col, cEdge, line), 1.0);
}`;
// conduction tubes: idle steel blue, bright white pulse (with a bulge), then dark blue once conducted
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
varying float vT; varying float vW; uniform float uT; uniform float uOut; uniform vec3 cIdle; uniform vec3 cDone;
void main() {
  if (uOut > 0.0) { gl_FragColor = vec4(0.07, 0.07, 0.07, 1.0); return; }
  vec3 c = uT < vT ? cIdle : (uT < vT + vW ? vec3(1.0) : cDone);
  gl_FragColor = vec4(c, 1.0);
}`;
const CIDLE = new THREE.Color(0xA9C3D2), CDONE = new THREE.Color(0x4F84A8); // conducted: mid steel blue (lighter than before so the tubes do not read as a black tangle)
function tubeMats(radius) {
  const mk = (out) => new THREE.ShaderMaterial({
    uniforms: { uT: U.uT, uOut: { value: out }, uBulge: { value: radius * 0.8 }, cIdle: { value: CIDLE }, cDone: { value: CDONE } },
    vertexShader: TUBE_VS, fragmentShader: TUBE_FS, depthTest: false, depthWrite: false, side: out > 0 ? THREE.BackSide : THREE.FrontSide
  });
  return [mk(0), mk(Math.max(0.012, radius * 0.35))];
}

/* ---------- Heart: four opaque chambers, septum, cut-away section ---------- */
let svcMesh = null, heart, shells = [], sectionMesh = null, sectionTex = null, CUT_PLANE = null;
const SECTION_Z = 0.05; // heart-local z of the cut-away (a four-chamber section)
const REGION_ELEMS = {}; ['S', 'LV', 'RV', 'RA', 'LA'].forEach(r => { REGION_ELEMS[r] = []; });
for (let e = 0; e < NE; e++) REGION_ELEMS[ELEM.region[e]].push(e);
function nearestIn(p, list) {
  let best = list[0], bd = Infinity;
  for (const e of list) { const q = ELEM.pos[e]; const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}
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
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide, clippingPlanes: ui.cut ? [CUT_PLANE] : [] });
  for (const d of defs) {
    const n = d.geo.attributes.position.count;
    d.geo.setAttribute('aAct', new THREE.BufferAttribute(new Float32Array(n), 1));
    d.geo.setAttribute('aRec', new THREE.BufferAttribute(new Float32Array(n), 1));
    const near = new Int32Array(n); const v = d.geo.attributes.position;
    for (let i = 0; i < n; i++) near[i] = nearestIn([v.getX(i), v.getY(i), v.getZ(i)], REGION_ELEMS[d.region]);
    const mesh = new THREE.Mesh(d.geo, muscleMaterial());
    if (d.off) { mesh.material.polygonOffset = true; mesh.material.polygonOffsetFactor = d.off; mesh.material.polygonOffsetUnits = d.off * 2; }
    const outline = new THREE.Mesh(outlineGeometry(d.geo, 0.022), outlineMat);
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
    uniforms: { ...U, uMask: { value: maskTex }, uTimes: { value: sectionTex }, uTSize: { value: new THREE.Vector2(NX, NY) } }, vertexShader: SECTION_VS, fragmentShader: SECTION_FS, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 // the cut face always wins over the clipped walls behind it
  });
  smat.extensions = { derivatives: true };
  sectionMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), smat);
  sectionMesh.position.set(x0 + W / 2, y0 + Hh / 2, SECTION_Z); sectionMesh.visible = ui.cut;
  heart.add(sectionMesh);
  const toWorld = (x, y, z) => () => new THREE.Vector3(x, y, z).applyMatrix4(HEART_VIS);
  addLabel('Left ventricle', 'heart', toWorld(0.85, -1.25, 0.35)).tag = 'LV';
  addLabel('Right ventricle', 'heart', toWorld(-0.7, -1.05, 0.55)).tag = 'RV';
  addLabel('Right atrium', 'heart', toWorld(-0.85, 0.3, 0.3)).tag = 'RA';
  addLabel('Left atrium', 'heart', toWorld(0.75, 0.35, -0.3)).tag = 'LA';
  addLabel('Septum', 'heart', toWorld(0.0, -1.5, 0.45)).tag = 'S';
  // superior vena cava (drawn only, not electrical): the SA node sits where it joins the right atrium
  const svcPts = [[-0.40, 0.45, 0.05], [-0.40, 0.95, 0.02], [-0.40, 1.25, 0.0]];
  const svcGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(svcPts.map(p => new THREE.Vector3(...p))), 12, 0.17, 20, false);
  const svc = new THREE.Mesh(svcGeo, new THREE.MeshLambertMaterial({ color: 0xD6D6D6 }));
  const svcOut = new THREE.Mesh(outlineGeometry(svcGeo, 0.022), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide }));
  heart.add(svc, svcOut); svcMesh = svc;
  addLabel('Superior vena cava', 'heart', toWorld(-0.40, 1.1, 0.12)).tag = 'svc';
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
  ui.cut = on; $('toggleCut').setAttribute('aria-pressed', String(on));
  if (!renderer) return;
  for (const s of shells) { s.mesh.material.clippingPlanes = on ? [CUT_PLANE] : []; s.mesh.material.needsUpdate = true; }
  shells[0].outline.material.clippingPlanes = on ? [CUT_PLANE] : []; shells[0].outline.material.needsUpdate = true;
  sectionMesh.visible = on; needsRender = true;
}

/* ---------- Conduction system: tubes, nodes, Purkinje fibres, travelling pulses ---------- */
let condParts = [], purkParts = [], beads = [], saNode, avNode, avRing, avRingBack, avLabel, saLabel;
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
function setTubeTimes(tube, t0, v, wMs) { // TubeGeometry rings are spaced by arc length
  const A = tube.g.attributes.aT, Wt = tube.g.attributes.aW; const ring = 11;
  for (let i = 0; i <= tube.n; i++) for (let k = 0; k < ring; k++) { const idx = i * ring + k; A.array[idx] = FIN(t0 + (i / tube.n) * tube.len / v); Wt.array[idx] = wMs; }
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
  for (const s of C.segments) {
    const tube = tubeFor(s.pts, s.r, 48); const [mat, outMat] = tubeMats(s.r);
    const mesh = new THREE.Mesh(tube.g, mat), out = new THREE.Mesh(tube.g, outMat);
    mesh.renderOrder = 20; out.renderOrder = 19; heart.add(out, mesh);
    const mid0 = polyAt(s.pts, polyLen(s.pts) * (s.id === 'rbb' ? 0.55 : s.id === 'his' ? 0.4 : 0.6));
    const mid = mid0; // the label is placed beside this point with a leader line
    const lbl = addLabel(s.label, 'cond', () => new THREE.Vector3(...mid).applyMatrix4(HEART_VIS)); lbl.tag = s.id;
    const bead = nodeMesh(new THREE.SphereGeometry(Math.max(0.05, s.r * 1.7), 16, 12), 1.3); bead.material.color.set(0xffffff); heart.add(bead);
    condParts.push({ s, tube, mesh, out, lbl }); beads.push({ s, bead });
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
  const pl = addLabel('Purkinje fibres', 'cond', () => new THREE.Vector3(0.75, -1.65, 0.2).applyMatrix4(HEART_VIS)); pl.tag = 'purk';
  condParts.push({ lbl: pl });
  buildPurkinje();
}
function buildPurkinje() { // thin fibres from the bundles to sample endocardial terminals (drawn for a few, all are modelled)
  for (const p of purkParts) { heart.remove(p.mesh, p.out); p.tube.g.dispose(); }
  purkParts = [];
  const C = CONDUCTION;
  for (const [list, side, count] of [[endoLV, 'LV', 4], [endoRV, 'RV', 2]]) {
    const cand = list.filter(e => ELEM.pos[e][1] <= C.purkinjeTopY && Math.abs(ELEM.pos[e][2] - SECTION_Z) < 0.5);
    const picked = []; // farthest-point sampling for an even spread
    if (!cand.length) continue; picked.push(cand[Math.floor(cand.length / 2)]);
    while (picked.length < Math.min(count, cand.length)) {
      let best = -1, bd = -1;
      for (const e of cand) { let dm = Infinity; for (const q of picked) { const a = ELEM.pos[e], b = ELEM.pos[q]; dm = Math.min(dm, (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2); } if (dm > bd) { bd = dm; best = e; } }
      picked.push(best);
    }
    for (const e of picked) {
      const p = ELEM.pos[e]; let bestQ = null, bt = Infinity, bq = 0;
      for (const s of C.segments) {
        if (s.purk !== side) continue; const sg = MODEL.seg[s.id]; if (!isFinite(sg.start)) continue;
        for (const q of polySample(s.pts, 0.05)) { if (q.p[1] > s.purkFromY) continue; const t = sg.start + q.s / sg.v; const tt = t + Math.hypot(p[0] - q.p[0], p[1] - q.p[1], p[2] - q.p[2]) / C.vPurkinje; if (tt < bt) { bt = tt; bestQ = q.p; bq = t; } }
      }
      if (!bestQ) continue;
      // route the fibre along the endocardial surface (nearest endocardial element to points on the chord)
      const route = [bestQ];
      for (const f of [0.3, 0.6, 0.85]) { const m = [bestQ[0] + (p[0] - bestQ[0]) * f, bestQ[1] + (p[1] - bestQ[1]) * f, bestQ[2] + (p[2] - bestQ[2]) * f]; route.push(ELEM.pos[nearestIn(m, list)]); }
      route.push(p);
      const tube = tubeFor(route, 0.013, 20);
      setTubeTimes(tube, bq, C.vPurkinje, 0.25 / C.vPurkinje);
      const [mat, outMat] = tubeMats(0.013);
      const mesh = new THREE.Mesh(tube.g, mat), out = new THREE.Mesh(tube.g, outMat); mesh.renderOrder = 18; out.renderOrder = 17;
      heart.add(out, mesh); purkParts.push({ tube, mesh, out });
    }
  }
}
function applyConductionTimes() {
  if (!renderer) return;
  for (const c of condParts) { if (!c.s) continue; const sg = MODEL.seg[c.s.id]; setTubeTimes(c.tube, sg.start, sg.v, 0.18 / sg.v); }
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
  let p0 = Infinity; for (const s of CONDUCTION.segments) { const sg = M.seg[s.id]; R[s.id] = [[sg.start, sg.end + 4]]; if (s.purk) p0 = Math.min(p0, sg.start); }
  R.purk = [[p0 + 8, M.vMin + 25]];
  ACTIVE_RANGES = R;
}
function isActive(tag, t) { const r = ACTIVE_RANGES && ACTIVE_RANGES[tag]; return !!r && r.some(([a, b]) => t >= a && t <= b); }
function applyLabelVisibility() {
  const t = state.t;
  for (const L of labels) {
    if (L.tag) { L.visible = ui.labelAll || isActive(L.tag, t); L.el.classList.toggle('active', isActive(L.tag, t) && (L.cls === 'cond' || L.cls === 'node')); }
  }
  if (regionLabel) regionLabel.visible = ui.labelAll && regionMeshes.length > 0;
  for (const m of regionMeshes) m.visible = ui.labelAll;
  if (trail) trail.visible = ui.loop;
}

/* ---------- Torso, leads, vector, projection ---------- */
const TORSO_C = new THREE.Vector3(-0.45, 1.1, -0.3), TORSO_R = new THREE.Vector3(5.0, 6.3, 4.2);
let torso, frontLabel, leadObjs = {}, arrow, trail, projBar, projOut, projLine, projLabel, vecLabel, regionMeshes = [], regionLabel;
const arrowTip = new THREE.Vector3();
const VEC_SCALE = 2.8;
function buildScene() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0xFBFAF7);
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(3, 6, 8); scene.add(dl);
  // no torso mesh: it cluttered the view behind the heart (the lead lines do not need it)
  frontLabel = addLabel('Front of chest', 'heart', () => new THREE.Vector3(-2.2, 0, TORSO_C.z + TORSO_R.z + 0.45));

  buildHeart(); buildConduction();

  for (const L of LEADS) {
    const grp = new THREE.Group(); grp.userData.lead = L.id;
    const matPos = new THREE.MeshLambertMaterial({ color: COL.leadGrey }), matNeg = matPos.clone();
    const pole = L.type === 'limb' ? L.dir.map(v => v * 3.7) : BASELINE.chestElectrodes[L.id].map(v => v * VIS_SCALE * 0.85);
    const neg = L.dir.map(v => v * (L.type === 'limb' ? -3.7 : -3.0));
    const pos = rod([0, 0, 0], pole, 0.035, matPos), negR = dashedRod([0, 0, 0], neg, 0.025, matNeg, 9);
    const marker = L.type === 'limb' ? new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), matPos) : new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), matPos);
    marker.position.set(...pole);
    const pick = rod([0, 0, 0], pole, 0.22, new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData.lead = L.id; marker.userData.lead = L.id;
    grp.add(pos, negR, marker, pick); scene.add(grp);
    const lp = pole.map(v => v * 1.1);
    const lbl = addLabel(L.type === 'limb' ? `${L.id} (${L.angle.replace('-', '\u2212')})` : L.id, 'lead', () => new THREE.Vector3(...lp));
    leadObjs[L.id] = { grp, matPos, matNeg, pos, negR, marker, pick, lbl, pole };
  }
  // the arrow's shadow on the selected lead: thick black-and-white striped bar with a black outline
  const pg = new THREE.CylinderGeometry(0.07, 0.07, 1, 14);
  projBar = new THREE.Mesh(pg, new THREE.ShaderMaterial({ uniforms: { uLen: { value: 1 } }, // depth-tested: hidden where it passes inside the heart
    vertexShader: 'varying float vY; void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vY; uniform float uLen; void main() { float s = fract(vY * uLen / 0.3); gl_FragColor = vec4(vec3(s < 0.5 ? 0.07 : 1.0), 1.0); }' }));
  projOut = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide }));
  projOut.scale.set(1.45, 1, 1.45); projBar.add(projOut); projBar.renderOrder = 31; projOut.renderOrder = 30; scene.add(projBar);
  projLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: COL.black, dashSize: 0.12, gapSize: 0.08, depthTest: false }));
  projLine.renderOrder = 31; scene.add(projLine);
  projLabel = addLabel('', 'proj', () => projLabel.pos);

  arrow = new THREE.Group();
  const am = new THREE.MeshBasicMaterial({ color: COL.black, depthTest: false, depthWrite: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 12), am); shaft.name = 'shaft';
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 16), am); head.name = 'head';
  shaft.renderOrder = 33; head.renderOrder = 33; arrow.add(shaft, head); scene.add(arrow);
  const halo = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, depthTest: false, depthWrite: false });
  for (const m of [shaft, head]) { const h = new THREE.Mesh(m.geometry, halo); h.scale.set(1.7, m === head ? 1.25 : 1, 1.7); h.renderOrder = 32; m.add(h); }
  const dotS = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), am); dotS.renderOrder = 32; scene.add(dotS);
  vecLabel = addLabel('Mean vector', 'vec', () => { const l = arrowTip.length(); return l < 0.4 ? null : arrowTip.clone().multiplyScalar((l + 0.7) / l); });
  trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: COL.grey, dashSize: 0.06, gapSize: 0.05, depthTest: false }));
  trail.renderOrder = 29; scene.add(trail);
}

/* Wall the selected lead faces: black wire mesh plus a dashed label (pattern, not colour alone) */
function buildRegion(region) {
  for (const m of regionMeshes) { m.parent.remove(m); m.geometry.dispose(); }
  regionMeshes = []; if (regionLabel) regionLabel.visible = false;
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
  }
}
function setLeadStyles() {
  if (!renderer) return;
  for (const L of LEADS) {
    const o = leadObjs[L.id]; const sel = L.id === state.sel;
    const dim = !sel && ((state.view === 'frontal' && L.type === 'chest') || (state.view === 'transverse' && L.type === 'limb'));
    o.grp.visible = sel || ui.allLeads; // default: only the selected lead is drawn
    for (const m of [o.matPos, o.matNeg]) { m.color.setHex(sel ? COL.black : COL.leadGrey); m.transparent = dim; m.opacity = dim ? 0.15 : 1; m.depthWrite = !dim; m.needsUpdate = true; }
    const s = sel ? 2.8 : 1; o.pos.scale.set(s, 1, s); o.negR.children.forEach(c => c.scale.set(s, 1, s)); o.marker.scale.setScalar(sel ? 1.5 : 1);
    o.lbl.el.className = 'lbl lead' + (sel ? ' sel' : dim ? ' dim' : ''); o.lbl.visible = sel || (ui.allLeads && !dim);
  }
  if (frontLabel) frontLabel.visible = state.view === 'transverse';
  needsRender = true;
}
const _q = new THREE.Vector3();
function updateScene() {
  if (!renderer) return;
  const t = state.t, M = MODEL, C = CONDUCTION; U.uT.value = t;
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
  avLabel.el.textContent = avHold ? `AV node: held ${Math.round(t - M.tAV)} of ${Math.round(M.tHis - M.tAV)} ms` : 'AV node';
  // travelling pulses
  for (const b of beads) {
    const sg = M.seg[b.s.id]; const on = t >= sg.start && t <= sg.end;
    b.bead.visible = on; if (on) b.bead.position.set(...polyAt(b.s.pts, (t - sg.start) * sg.v));
  }
  applyLabelVisibility();
  // mean vector
  const D = dipole(t); const mag = Math.hypot(...D); const len = mag * VEC_SCALE;
  const shaft = arrow.getObjectByName('shaft'), head = arrow.getObjectByName('head');
  arrow.visible = len > 0.03;
  if (arrow.visible) {
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _q.set(...D).normalize());
    const hl = Math.min(0.45, len * 0.45); head.scale.setScalar(hl / 0.45);
    shaft.scale.set(1, Math.max(0.001, len - hl), 1); shaft.position.set(0, (len - hl) / 2, 0); head.position.set(0, len - hl / 2, 0);
  }
  arrowTip.set(D[0], D[1], D[2]).multiplyScalar(VEC_SCALE);
  const pts = []; for (let i = 0; i <= Math.round(t); i += 2) { const d = dipole(i); pts.push(new THREE.Vector3(d[0], d[1], d[2]).multiplyScalar(VEC_SCALE)); }
  trail.geometry.dispose(); trail.geometry = new THREE.BufferGeometry().setFromPoints(pts.length > 1 ? pts : [new THREE.Vector3(), new THREE.Vector3()]); trail.computeLineDistances();
  // projection on the selected lead
  const L = LEAD[state.sel]; const u = new THREE.Vector3(...L.dir); const p = arrowTip.dot(u); const foot = u.clone().multiplyScalar(p);
  const showProj = ui.labelAll || phaseAt(t).key === 'main';
  projBar.visible = showProj && Math.abs(p) > 0.03;
  if (projBar.visible) { projBar.material.uniforms.uLen.value = Math.abs(p); projBar.scale.set(1, Math.abs(p), 1); projBar.position.copy(foot).multiplyScalar(0.5); projBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u.clone().multiplyScalar(Math.sign(p))); }
  const vNow = TRACE[L.id][Math.round(t)];
  projLabel.visible = showProj && Math.abs(p) > 0.3; projLabel.el.textContent = `${L.id}: ${(vNow >= 0 ? '+' : '\u2212') + Math.abs(vNow).toFixed(2)} mV`;
  projLabel.pos = foot.clone().add(u.clone().multiplyScalar(Math.sign(p) * 0.5));
  projLine.geometry.setFromPoints([arrowTip.clone(), foot]); projLine.computeLineDistances(); projLine.visible = showProj && arrow.visible;
  needsRender = true;
}

/* ======================= Camera and interaction ======================= */
let camAnim = null;
function placeCamera() {
  const { az, el, r, target } = orbit;
  camera.position.set(target.x + r * Math.cos(el) * Math.sin(az), target.y + r * Math.sin(el), target.z + r * Math.cos(el) * Math.cos(az));
  camera.up.set(0, 1, 0); camera.lookAt(target); needsRender = true;
}
function goView(name, instant) {
  const v = VIEWS[name]; state.view = name;
  document.querySelectorAll('.view-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  $('viewNote').textContent = v.note; setLeadStyles();
  if (!renderer) return;
  if (name === 'section' && !ui.cut) setCut(true);
  const fit = fitView(v, name); const tgt = fit.target, r = fit.r;
  if (instant || REDUCED) { orbit.az = v.az; orbit.el = v.el; orbit.r = r; orbit.target.copy(tgt); placeCamera(); return; }
  const daz = ((v.az - orbit.az) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  orbit.target.copy(tgt);
  camAnim = { t0: performance.now(), from: { az: orbit.az, el: orbit.el, r: orbit.r }, to: { az: orbit.az + daz, el: v.el, r } };
}
/* Frame the heart: it fills about 65% of the canvas height (60% in the 3D view), centred */
let HEART_BOX = null;
function fitView(v, name) {
  if (name === 'transverse') return { target: new THREE.Vector3(0, 0.3, 0), r: v.r };
  if (!HEART_BOX) { scene.updateMatrixWorld(true); HEART_BOX = new THREE.Box3(); for (const s of shells) HEART_BOX.expandByObject(s.mesh); HEART_BOX.expandByObject(svcMesh); }
  const c = HEART_BOX.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(Math.cos(v.el) * Math.sin(v.az), Math.sin(v.el), Math.cos(v.el) * Math.cos(v.az));
  const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(right).normalize();
  let hh = 0, hw = 0, hd = 0; const b = HEART_BOX;
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    const q = new THREE.Vector3(x, y, z).sub(c); hh = Math.max(hh, Math.abs(q.dot(up))); hw = Math.max(hw, Math.abs(q.dot(right))); hd = Math.max(hd, Math.abs(q.dot(dir)));
  }
  const frac = name === 'oblique' ? 0.6 : 0.66; const tf = Math.tan(camera.fov / 2 * DEG);
  // the box overestimates a rounded heart, so use 0.82 of its extent
  const r = Math.max(0.82 * hh / frac / tf, 0.82 * hw / (0.62 * camera.aspect) / tf) + 0.5 * hd;
  return { target: c, r };
}
function markCustom() {
  if (state.view !== 'custom') { state.view = 'custom'; document.querySelectorAll('.view-btn').forEach(b => b.setAttribute('aria-pressed', 'false')); $('viewNote').textContent = 'Custom 3D view. Use Reset view to return to the frontal view.'; setLeadStyles(); }
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
    if (hit) select(hit.object.userData.lead);
  }
}
function resize() {
  if (renderer) {
    const w = stage.clientWidth, h = stage.clientHeight; const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    U.uPx.value = dpr; needsRender = true;
  }
  drawECG(); drawMini(); drawZoom();
}

/* ======================= Labels in the 3D view (collision-avoiding) ======================= */
const OFFSETS = [[0, 0]]; // candidate positions: on the anchor, then rings further out (a leader line joins label and anchor)
for (const rad of [26, 44, 64, 86]) for (let k = 0; k < 12; k++) { const a = k / 12 * 2 * Math.PI; OFFSETS.push([Math.round(Math.cos(a) * rad * 1.5), Math.round(Math.sin(a) * rad)]); }
function effPrio(L) { return L.el.classList.contains('sel') || L.el.classList.contains('active') ? 0 : L.prio; }
const SVGNS = 'http://www.w3.org/2000/svg';
const leaderSvg = document.createElementNS(SVGNS, 'svg'); leaderSvg.setAttribute('class', 'leaders'); leaderSvg.setAttribute('aria-hidden', 'true');
labelLayer.prepend(leaderSvg);
function updateLabels() {
  const w = stage.clientWidth, h = stage.clientHeight; const v = new THREE.Vector3(); const placed = []; const lines = [];
  const sr = stage.getBoundingClientRect(), note = $('viewNote').getBoundingClientRect();
  if (note.width > 0) placed.push([note.left - sr.left - 4, note.top - sr.top - 4, note.right - sr.left + 4, note.bottom - sr.top + 4]); // never under the view note
  const hit = box => placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
  for (const L of labels.slice().sort((a, b) => effPrio(a) - effPrio(b))) {
    if (!L.visible) { L.el.classList.add('hidden'); continue; }
    const p = L.getPos(); if (!p) { L.el.classList.add('hidden'); continue; }
    v.copy(p).project(camera);
    if (v.z > 1 || ((Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) && !L.el.classList.contains('sel'))) { L.el.classList.add('hidden'); continue; } // the selected lead's label is kept, pinned to the edge
    L.el.classList.remove('hidden');
    const bw = L.el.offsetWidth + 6, bh = L.el.offsetHeight + 4; const x0 = ((v.x + 1) / 2) * w, y0 = ((1 - v.y) / 2) * h;
    let spot = null;
    const beside = L.cls === 'heart' || L.cls === 'cond' || L.cls === 'node' || L.cls === 'region';
    const cands = beside ? [] : OFFSETS; // 'beside' labels never cover their anchor: try boxes just off each side, then further out
    if (beside) for (const g of [10, 26, 46, 70, 96]) { const sx = bw / 2 + g, sy = bh / 2 + g * 0.6;
      cands.push([sx, 0], [-sx, 0], [0, -sy], [0, sy], [sx, -sy], [-sx, -sy], [sx, sy], [-sx, sy]); }
    for (const [dx, dy] of cands) {
      const x = Math.min(w - bw / 2, Math.max(bw / 2, x0 + dx)), y = Math.min(h - bh / 2, Math.max(bh / 2, y0 + dy));
      const box = [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2];
      if (!hit(box)) { spot = [x, y, box]; break; }
    }
    if (!spot) { if (effPrio(L) > 0) { L.el.classList.add('hidden'); continue; } spot = [x0, y0, [x0 - bw / 2, y0 - bh / 2, x0 + bw / 2, y0 + bh / 2]]; }
    placed.push(spot[2]); L.el.style.transform = `translate(${spot[0]}px, ${spot[1]}px) translate(-50%, -50%)`;
    // leader line from the anchor to the nearest point of the label box, when the label had to move away
    const bx = Math.max(spot[2][0] + 3, Math.min(spot[2][2] - 3, x0)), by = Math.max(spot[2][1] + 2, Math.min(spot[2][3] - 2, y0));
    if (Math.hypot(bx - x0, by - y0) > 8 && L.cls !== 'lead' && L.cls !== 'proj') lines.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"/><circle cx="${x0.toFixed(1)}" cy="${y0.toFixed(1)}" r="2.2"/>`);
  }
  leaderSvg.setAttribute('viewBox', `0 0 ${w} ${h}`); leaderSvg.innerHTML = lines.join('');
}

/* ======================= Text ======================= */
let lastPhase = null;
const fmt = v => (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(2);
function describeLead() {
  const L = LEAD[state.sel]; const v = TRACE[L.id][Math.round(state.t)]; const D = dipole(state.t); const mag = Math.hypot(...D);
  let rel;
  if (Math.abs(v) < 0.03) rel = 'At this moment the trace is on the baseline.';
  else if (L.type === 'limb') {
    const ang = Math.round(Math.acos(Math.max(-1, Math.min(1, dot(D, L.dir) / (mag || 1)))) / DEG);
    rel = ang < 60 ? `The arrow points towards the + pole (${ang}° from it), so the trace goes up.` : ang > 120 ? `The arrow points away from the + pole (${ang}° from it), so the trace goes down.` : `The arrow is nearly at right angles to this lead (${ang}°), so the deflection is small.`;
  } else rel = v > 0 ? 'Activity is heading towards this electrode overall, so the trace goes up.' : 'Activity is heading away from this electrode overall, so the trace goes down.';
  const where = L.type === 'limb' ? `a limb lead at ${L.angle}` : `a chest lead (${L.pos})`;
  $('leadExplain').innerHTML = `<p class="le-head">Lead ${L.id}: ${fmt(v)} mV</p><p>${rel}</p>`;
  $('leadExplain').title = `${L.id} is ${where}. It mainly faces ${REGION_TEXT[L.region]}.`;
  $('ecgCaption').textContent = `Lead ${L.id} selected (bold box). The line in every lead marks the same moment, ${Math.round(state.t)} ms into the beat.`;
  $('miniLabel').textContent = `Lead ${L.id}, 5 s at 25 mm/s`;
}
/* Guided steps */
function stepIndexAt(t) { let k = -1; STEPS.forEach((p, i) => { if (t >= p.from) k = i; }); return k; }
function goStep(i) {
  i = Math.max(0, Math.min(STEPS.length - 1, i)); setPlaying(false); setT(STEPS[i].at, true);
}
function updateSteps() {
  const k = stepIndexAt(state.t); const ph = phaseAt(state.t); const onStep = !!ph.step;
  document.querySelectorAll('.step-chip').forEach((b, i) => b.setAttribute('aria-pressed', String(onStep && i === k)));
  $('stepCount').textContent = onStep ? `Step ${k + 1} of ${STEPS.length}` : '';
  $('stepBack').disabled = k <= 0 && onStep; $('stepNext').disabled = k >= STEPS.length - 1 && onStep;
}
function updateText(announce) {
  const ph = phaseAt(state.t);
  if (ph !== lastPhase) { $('phaseTitle').textContent = ph.title; $('phaseText').textContent = ph.text; lastPhase = ph; }
  updateSteps();
  describeLead();
  if (announce) $('live').textContent = `${Math.round(state.t)} milliseconds. ${ph.title}. ${ph.text}`;
}
function setT(t, announce) {
  state.t = Math.max(0, Math.min(BEAT_MS, t));
  scrub.value = Math.round(state.t);
  const ph = phaseAt(state.t);
  scrub.setAttribute('aria-valuetext', `${Math.round(state.t)} milliseconds, ${ph.title}`);
  timeOut.textContent = `${Math.round(state.t)} ms`;
  updateScene(); drawECG(); drawMini(); drawZoom(); updateText(announce);
}
function select(id) {
  state.sel = id;
  document.querySelectorAll('.lead-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lead === id)));
  setLeadStyles(); buildRegion(LEAD[id].region);
  updateScene(); drawECG(); drawMini(); drawZoom(); updateText(false);
  $('live').textContent = `Lead ${id} selected.`;
}
function setPlaying(on) {
  state.playing = on; playBtn.setAttribute('aria-pressed', String(on));
  playBtn.querySelector('.play-label').textContent = on ? 'Pause' : 'Play';
  playBtn.setAttribute('aria-label', on ? 'Pause the beat' : 'Play the beat');
  if (!on) updateText(true);
}

/* Recompute everything after a change to BASELINE / CONDUCTION (hook for later pathology modes) */
function rebuildModel() {
  MODEL = computeModel(); buildTraces(); buildPhases(); buildActiveRanges(); lastPhase = null;
  applyMuscleTimes(); applyConductionTimes(); setT(state.t);
}

/* ======================= Wiring and start-up ======================= */
scrub.addEventListener('input', () => { setPlaying(false); setT(+scrub.value, true); });
playBtn.addEventListener('click', () => setPlaying(!state.playing));
speedSel.addEventListener('change', () => { state.speed = +speedSel.value; });
document.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => goView(b.dataset.view)));
$('resetView').addEventListener('click', () => goView('frontal'));
function refit() { if (renderer && VIEWS[state.view]) { const f = fitView(VIEWS[state.view], state.view); orbit.r = f.r; orbit.target.copy(f.target); placeCamera(); } }
$('toggleCut').addEventListener('click', () => setCut(!ui.cut));
function setToggle(id, key, on) { ui[key] = on; $(id).setAttribute('aria-pressed', String(on)); setLeadStyles(); if (state.sel) buildRegion(LEAD[state.sel].region); updateScene(); }
$('toggleLeads').addEventListener('click', () => setToggle('toggleLeads', 'allLeads', !ui.allLeads));
$('toggleLabelAll').addEventListener('click', () => setToggle('toggleLabelAll', 'labelAll', !ui.labelAll));
$('toggleLoop').addEventListener('click', () => setToggle('toggleLoop', 'loop', !ui.loop));
$('stepBack').addEventListener('click', () => { const k = stepIndexAt(state.t); goStep(phaseAt(state.t).step ? k - 1 : k); });
$('stepNext').addEventListener('click', () => goStep(stepIndexAt(state.t) + 1));
// close the 'More' menu after choosing an item
document.querySelectorAll('#moreMenu .menu-item').forEach(b => b.addEventListener('click', () => { if (!b.classList.contains('toggle-btn')) $('moreMenu').open = false; }));
let rzT = null; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { resize(); refit(); }, 60); });

MODEL = computeModel(); buildTraces(); buildPhases(); buildActiveRanges();
if (renderer) { buildScene(); applyMuscleTimes(); applyConductionTimes(); initInteraction(); }
resize();
goView('frontal', true);
setCut(false);
select('II');
setT(250);

let last = performance.now();
function frame(now) {
  const dt = Math.min(100, now - last); last = now;
  if (state.playing) { let t = state.t + dt * state.speed; if (t >= BEAT_MS) { t -= BEAT_MS; state.beat++; } setT(t); }
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

/* Hooks for automated checks, screenshots and later pathology modes */
window.ecg3d = {
  setT: t => { setPlaying(false); setT(t, true); }, select, view: v => goView(v, true), play: setPlaying, cut: setCut, step: goStep,
  toggle: (key, on) => setToggle({ allLeads: 'toggleLeads', labelAll: 'toggleLabelAll', loop: 'toggleLoop' }[key], key, on),
  poleScreen: id => { const v = new THREE.Vector3(...leadObjs[id].pole).project(camera); const r = stage.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
  leadRodsShown: () => renderer ? Object.values(leadObjs).filter(o => o.grp.visible).length : 0,
  orbit: (az, el, r) => { camAnim = null; orbit.az = az * DEG; orbit.el = el * DEG; if (r) orbit.r = r; placeCamera(); markCustom(); },
  trace: id => Array.from(TRACE[id]), timings: () => ({ tAV: MODEL.tAV, tHis: MODEL.tHis, seg: MODEL.seg, vMin: MODEL.vMin, vMax: MODEL.vMax, recMin: MODEL.recMin, recMax: MODEL.recMax }),
  BASELINE, CONDUCTION, rebuildModel, webgl: !!renderer
};
