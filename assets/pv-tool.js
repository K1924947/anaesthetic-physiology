/* Tool-first PV loop. Teaching text is shortened from pv-loop-core; no new claims.
   Scenario coordinates are teaching schematics, not measured values. */
const PHASES = [
  { id: "filling", label: "① Filling (diastole)", highlight: "EDPVR: volume rises along the diastolic compliance curve", description: "The mitral valve is open. Early filling is relatively compliant (a large volume change for a small pressure rise). Later the ventricle stiffens toward EDV. This lower border traces the EDPVR. EDV is the usual teaching surrogate for preload." },
  { id: "isocontraction", label: "② Isovolumetric contraction", highlight: "Vertical only if both valves are closed", description: "The mitral valve has closed and the aortic valve is still closed. In a competent heart, volume cannot change, so the limb is vertical, until LV pressure exceeds aortic diastolic pressure (about 80 mmHg in Guyton) and the aortic valve opens. If the mitral valve leaks, volume falls as pressure rises and the limb slants." },
  { id: "ejection", label: "③ Ejection (systole)", highlight: "Width of this phase is the ejected volume", description: "The aortic valve is open. Volume falls from EDV toward ESV (or from a lower starting volume if there has already been regurgitant loss). Pressure typically rises to a peak and then falls to end-systolic pressure, where the aortic valve closes. SV = EDV − ESV." },
  { id: "isorelaxation", label: "④ Isovolumetric relaxation", highlight: "Vertical only if both valves are closed", description: "The aortic valve has closed at end-systole. The ventricle relaxes and pressure falls. Volume stays fixed if the aortic valve is competent. If the aortic valve leaks, volume rises as pressure falls and the limb slants, until the mitral valve opens." }
];

const SCENARIO_GROUPS = [
  { label: "Physiological", key: "phys", ids: ["normal", "preload_up", "preload_down", "afterload_up", "contractility_up", "exercise"] },
  { label: "Valve lesions", key: "valve", ids: ["as", "mr", "ar", "ms"] },
  { label: "Ventricular failure", key: "failure", ids: ["systolic", "diastolic"] }
];

const SCENARIOS = {
  normal: {
    label: "Normal",
    loop: "A schematic normal LV loop: roughly rectangular, with a curved diastolic border, vertical isovolumetric limbs, and an arched ejection border.",
    why: "The mitral and aortic valves close in turn, so volume is fixed during isovolumetric contraction and relaxation (Guyton, Ch. 9). The lower border follows diastolic compliance (EDPVR). End-systolic points of differently loaded beats would fall on a common ESPVR if contractility were unchanged.",
    haem: "Teaching beat consistent with Guyton’s ranges: EDV 120 mL, ESV 50 mL, SV 70 mL, EF 58%, LVEDP 8 mmHg (within Levick’s ‘a few mmHg’), AV opening 80 mmHg. These are not a named measurement.",
    params: { esv: 50, edv: 120, esp: 118, peakP: 132, edp: 8, avOpen: 80, isoConLeak: 0, isoRelGain: 0, espvrSlope: 2.0, edpvrSteep: 1 }
  },
  preload_up: {
    label: "Increased preload",
    loop: "The loop shifts right and usually widens. EDV rises. ESPVR is unchanged, so the end-systolic point stays on the same line. ESV changes little compared with EDV, so the loop gets wider.",
    why: "Greater venous return fills the ventricle more. By the Frank-Starling mechanism, stretch toward a more nearly optimal actin-myosin overlap increases force, so the extra volume is ejected (Guyton, Ch. 9). Contractility (ESPVR slope) is not itself changed.",
    haem: "SV rises because EDV rises more than ESV. EF usually rises modestly. LVEDP is higher because the ventricle is further along the EDPVR.",
    predict: [
      { q: "What happens to stroke volume?", options: ["It rises", "It falls", "It is unchanged"], answer: 0 },
      { q: "What happens to LVEDP?", options: ["It is higher", "It is lower", "It is unchanged"], answer: 0 }
    ],
    params: { esv: 52, edv: 155, esp: 115, peakP: 130, edp: 12, avOpen: 80, isoConLeak: 0, isoRelGain: 0, espvrSlope: 2.0, edpvrSteep: 1 }
  },
  preload_down: {
    label: "Reduced preload / volume loss",
    loop: "The loop shifts left and narrows. EDV falls, SV falls, and filling pressure is lower. Isovolumetric limbs stay vertical. ESPVR is unchanged if contractility is preserved.",
    why: "Less venous return means less ventricular filling. The fibres start at a shorter length, so Frank-Starling force falls and stroke volume falls. This is the isolated preload-down pattern.",
    haem: "SV falls. EF may fall only modestly, because both EDV and SV are smaller. LVEDP is lower.",
    predict: [
      { q: "What happens to stroke volume?", options: ["It rises", "It falls", "It is unchanged"], answer: 1 },
      { q: "What happens to LVEDP?", options: ["It is higher", "It is lower", "It is unchanged"], answer: 1 }
    ],
    params: { esv: 42, edv: 85, esp: 110, peakP: 122, edp: 5, avOpen: 80, isoConLeak: 0, isoRelGain: 0, espvrSlope: 2.0, edpvrSteep: 1 }
  },
  afterload_up: {
    label: "Increased afterload",
    loop: "The loop becomes taller and narrower. The aortic valve opens later (higher pressure), ESV rises, and SV falls. ESPVR is unchanged: the end-systolic point slides up and right along the same line.",
    why: "Guyton defines ventricular afterload as the pressure in the aorta leading from the ventricle (sometimes loosely thought of as resistance). A higher opposing pressure means the ventricle ejects less completely, so ESV rises. End-systolic points still lie on the same ESPVR if contractility is constant.",
    haem: "SV falls (ESV up, EDV held constant in this isolated schematic). EF falls. LVEDP is unchanged on the first beat of a pure afterload step; in life, the retained volume can raise the next EDV and EDP.",
    predict: [
      { q: "What happens to ESV and SV?", options: ["ESV rises and SV falls", "ESV falls and SV rises", "Both are unchanged"], answer: 0 },
      { q: "In this first-beat schematic, LVEDP is:", options: ["Higher", "Lower", "Unchanged"], answer: 2 }
    ],
    params: { esv: 80, edv: 120, esp: 148, peakP: 158, edp: 8, avOpen: 95, isoConLeak: 0, isoRelGain: 0, espvrSlope: 2.0, edpvrSteep: 1 }
  },
  contractility_up: {
    label: "Increased contractility",
    loop: "ESPVR steepens. ESV falls, SV and EF rise, and the loop often sits a little taller. Preload is held constant in this schematic so the contractility effect can be seen on its own.",
    why: "Sympathetic stimulation increases the force of contraction (Guyton, Ch. 9: force can as much as double, with a higher ejection pressure and a larger pumped volume). On the diagram this is a steeper Ees: end-systolic points move left onto a steeper ESPVR (Bastos et al.).",
    haem: "SV rises because ESV falls. EF rises. LVEDP is unchanged in this isolated schematic.",
    predict: [
      { q: "What happens to ESV and SV?", options: ["ESV rises and SV falls", "ESV falls and SV rises", "Both fall"], answer: 1 },
      { q: "What happens to the ESPVR?", options: ["It steepens", "It flattens", "It is unchanged"], answer: 0 }
    ],
    params: { esv: 28, edv: 120, esp: 132, peakP: 148, edp: 8, avOpen: 80, isoConLeak: 0, isoRelGain: 0, espvrSlope: 3.0, edpvrSteep: 1 }
  },
  exercise: {
    label: "Exercise",
    loop: "A schematic combination, not a measured exercise tracing: ESPVR is steeper, ESV is smaller, EDV is a little larger, and SV widens. Peak pressure may rise. The dashed normal remains for comparison.",
    why: "Guyton states that sympathetic stimulation increases contractile force (up to about double) and ejection pressure, and can raise heart rate from about 70 to 180 to 200 beats/min in young adults, increasing cardiac output as much as two- to threefold in addition to Frank-Starling. The modest EDV rise drawn here represents a possible increase in venous return; it is a teaching combination of those mechanisms, not a catheter data set.",
    haem: "SV and EF rise (ESV down, EDV a little up). LVEDP may rise slightly if EDV rises. A very high heart rate would shorten filling time and could limit EDV; that limit is not separately modelled here.",
    predict: [
      { q: "What happens to SV and EF in this schematic?", options: ["Both rise", "Both fall", "SV rises but EF falls"], answer: 0 },
      { q: "What happens to ESV?", options: ["It falls", "It rises", "It is unchanged"], answer: 0 }
    ],
    params: { esv: 32, edv: 130, esp: 140, peakP: 155, edp: 10, avOpen: 85, isoConLeak: 0, isoRelGain: 0, espvrSlope: 2.8, edpvrSteep: 1 }
  },
  as: {
    label: "Aortic stenosis",
    loop: "Tall, narrow loop. Peak LV pressure is high, ESV is higher, and SV is smaller. Isovolumetric limbs stay vertical. A steeper EDPVR is shown because a hypertrophied ventricle is often less compliant.",
    why: "The obstruction raises the pressure the LV must generate to eject. That is a severe afterload, even if aortic systolic pressure itself is not high. Over time the LV typically hypertrophies, which can stiffen diastole and raise filling pressure.",
    haem: "SV falls. EF falls if ESV rises more than EDV. LVEDP is often higher if the chamber is stiffer. The arterial pressure measured downstream can under-represent the LV pressure generated inside the chamber.",
    predict: [
      { q: "How does the loop change?", options: ["Taller and narrower, with a higher peak LV pressure", "Shorter and wider, with a lower peak LV pressure", "Left-shifted with a lower EDV only"], answer: 0 },
      { q: "Do the isovolumetric limbs stay vertical?", options: ["Yes, if the mitral valve still closes and the aortic valve still opens against aortic pressure", "No, both limbs slant", "Only the relaxation limb slants"], answer: 0 }
    ],
    params: { esv: 85, edv: 125, esp: 185, peakP: 205, edp: 16, avOpen: 80, isoConLeak: 0, isoRelGain: 0, espvrSlope: 2.2, edpvrSteep: 1.6 }
  },
  mr: {
    label: "Mitral regurgitation",
    loop: "The left-hand limb is not vertical: volume falls while pressure is still rising, because blood leaves into the atrium as soon as ventricular pressure exceeds atrial pressure. EDV is large, total SV (forward plus regurgitant) is large, and peak pressure may be lower.",
    why: "There is no true isovolumetric contraction if the mitral valve is incompetent. The LV ejects into a low-impedance left atrium as well as into the aorta, so total stroke volume can be large while forward (aortic) stroke volume is reduced.",
    haem: "Total SV (the loop width) is large, so the calculated EF can look high even when forward output is reduced. LVEDP (and left-atrial pressure) tend to be higher because of the volume load. Forward SV is not the same as the loop width.",
    predict: [
      { q: "What happens to the left-hand (contraction) limb?", options: ["It stays vertical", "It slants: volume falls as pressure rises", "It slants: volume rises as pressure falls"], answer: 1 },
      { q: "The width of the loop is:", options: ["Forward (aortic) SV only", "Total SV (forward plus regurgitant), so EF can look high", "Always smaller than normal"], answer: 1 }
    ],
    params: { esv: 45, edv: 165, esp: 100, peakP: 112, edp: 16, avOpen: 80, isoConLeak: 35, isoRelGain: 0, espvrSlope: 2.0, edpvrSteep: 1 }
  },
  ar: {
    label: "Aortic regurgitation",
    loop: "The right-hand limb is not vertical: volume rises as pressure falls, because blood returns from the aorta while both valves should, in a competent heart, be closed. EDV and total SV are large. The aortic valve opens at a lower pressure, reflecting a low aortic diastolic pressure.",
    why: "There is no true isovolumetric relaxation if the aortic valve leaks. The LV is volume-overloaded. A wide aortic pulse pressure (higher systolic, lower diastolic) is the arterial counterpart of that diastolic runoff.",
    haem: "Total SV (loop width) is large and EF may look well preserved. LVEDP tends to rise with the volume load. AV opening pressure is lower than the normal 80 mmHg schematic.",
    predict: [
      { q: "What happens to the right-hand (relaxation) limb?", options: ["It stays vertical", "It slants: volume rises as pressure falls", "It slants: volume falls as pressure rises"], answer: 1 },
      { q: "Aortic valve opening pressure is:", options: ["Higher than normal", "Lower than the normal 80 mmHg schematic", "Unchanged"], answer: 1 }
    ],
    params: { esv: 50, edv: 175, esp: 130, peakP: 150, edp: 18, avOpen: 50, isoConLeak: 0, isoRelGain: 40, espvrSlope: 2.0, edpvrSteep: 1 }
  },
  ms: {
    label: "Mitral stenosis",
    loop: "The loop keeps a normal rectangular shape (isovolumetric limbs stay vertical) but is smaller and left-shifted: EDV is reduced, so width (SV) is reduced. This is a filling problem, not a change in ESPVR.",
    why: "A narrow mitral valve limits LV filling, so EDV falls, much as in a reduced-preload state. The high pressure needed to drive blood through the stenosis is in the left atrium, not necessarily in the LV. The LV chamber itself can remain a normal shape on the diagram.",
    haem: "SV falls because EDV is low. EF may be relatively preserved if ESV is also smaller. LVEDP is not raised in this schematic (the gradient is upstream of the LV). Left-atrial pressure is not plotted here.",
    predict: [
      { q: "How does the LV loop change?", options: ["Normal shape, but smaller and left-shifted (low EDV and SV)", "The contraction limb slants", "The loop becomes tall and narrow with a very high peak LV pressure"], answer: 0 },
      { q: "In this schematic, LVEDP is:", options: ["Raised", "Not raised (the gradient is upstream of the LV)", "The main finding, with a large EDV"], answer: 1 }
    ],
    params: { esv: 40, edv: 80, esp: 110, peakP: 120, edp: 6, avOpen: 80, isoConLeak: 0, isoRelGain: 0, espvrSlope: 2.0, edpvrSteep: 1 }
  },
  systolic: {
    label: "Systolic failure",
    loop: "The ventricle is dilated: both EDV and ESV are large. ESPVR is flatter. Stroke volume and ejection fraction are reduced, and filling pressure is high at a large end-diastolic volume.",
    why: "Impaired contractility reduces Ees, so the ventricle empties poorly (high ESV) and operates at a larger volume. Guyton notes that when the ventricle is abnormally dilated, muscle tension during contraction is proportional to pressure times chamber diameter, so more chemical energy is needed for a given work output. NICE NG106 uses the clinical label HFrEF for symptomatic heart failure with LVEF of 40% or less.",
    haem: "SV is reduced. EF is clearly reduced (here about 33%). LVEDP is high at a large EDV.",
    predict: [
      { q: "What happens to ESPVR and EF?", options: ["ESPVR flattens and EF is reduced", "ESPVR steepens and EF is preserved", "ESPVR is unchanged and EF rises"], answer: 0 },
      { q: "Chamber size and LVEDP?", options: ["The chamber is not dilated and LVEDP is low", "The chamber is dilated and LVEDP is high at a large EDV", "EDV falls and LVEDP is unchanged"], answer: 1 }
    ],
    params: { esv: 120, edv: 185, esp: 88, peakP: 98, edp: 24, avOpen: 70, isoConLeak: 0, isoRelGain: 0, espvrSlope: 0.85, edpvrSteep: 0.85 }
  },
  diastolic: {
    label: "Diastolic dysfunction",
    loop: "The chamber is not dilated. EF is preserved. EDPVR is steeper, so LVEDP is high at a normal or even modest EDV. The loop can be narrower if filling is limited. ESPVR is relatively preserved.",
    why: "Diastolic stiffness means a larger pressure change for a given volume change (a leftward or upward EDPVR). Power and Kam note that a higher diastolic pressure at a given volume indicates reduced distensibility. NICE NG106 uses the clinical label HFpEF for symptomatic heart failure with LVEF of 50% or more plus specified structural or Doppler features.",
    haem: "SV may be reduced if EDV is limited. EF is preserved (here 55%). LVEDP is high despite a modest EDV. Levick notes that atrial systole contributes more to filling with age (up to 46% by 80 years), so loss of that atrial contribution would drop EDV further in a stiff ventricle.",
    predict: [
      { q: "What happens to EF and ESPVR?", options: ["EF is reduced and ESPVR is flat", "EF is preserved and ESPVR is relatively preserved", "EF rises because ESPVR steepens markedly"], answer: 1 },
      { q: "What happens to LVEDP?", options: ["It is high despite a modest EDV (steeper EDPVR)", "It is low", "It is unchanged and EDV is large"], answer: 0 }
    ],
    params: { esv: 45, edv: 100, esp: 130, peakP: 145, edp: 22, avOpen: 80, isoConLeak: 0, isoRelGain: 0, espvrSlope: 2.2, edpvrSteep: 2.2 }
  }
};

const CLICK_INFO = {
  espvr: {
    title: "ESPVR",
    kicker: "End-systolic pressure-volume relationship",
    loop: "The line joining end-systolic points from loops recorded at different loads but the same contractile state. Its slope is end-systolic elastance (Ees), in mmHg/mL.",
    why: "Increased contractility steepens ESPVR and usually shifts it up and left; reduced contractility flattens it and often shifts it right.",
    haem: "Ees is a relatively load-independent index of chamber contractility, not a perfectly load-independent one. It can lose linearity in extreme conditions (Bastos et al., 2020)."
  },
  edpvr: {
    title: "EDPVR",
    kicker: "End-diastolic pressure-volume relationship",
    loop: "The passive filling curve of the relaxed ventricle. It is not linear: the chamber is more compliant at low volume and stiffer as it fills.",
    why: "Its slope (dP/dV) is chamber stiffness; compliance is the inverse (dV/dP).",
    haem: "A higher diastolic pressure at a given volume means reduced distensibility, and shifts the diastolic relationship upward (Power and Kam, Ch. 26). That pattern is the usual diagram for diastolic dysfunction."
  },
  mvopens: {
    title: "Mitral valve opens",
    kicker: "Start of filling",
    loop: "The bottom-left corner of a normal loop: start of filling, at ESV.",
    why: "The mitral valve opens when LV pressure falls below left-atrial pressure, ending isovolumetric relaxation.",
    haem: "Volume then rises along the EDPVR toward EDV."
  },
  mvcloses: {
    title: "Mitral valve closes",
    kicker: "End-diastole",
    loop: "The bottom-right corner: EDV, and the start of isovolumetric contraction.",
    why: "The mitral valve has closed. The aortic valve is still closed, so volume is fixed while pressure rises, if the mitral valve is competent.",
    haem: "EDV is the usual teaching surrogate for preload."
  },
  avopens: {
    title: "Aortic valve opens",
    kicker: "Start of ejection",
    loop: "The right-hand corner of a normal loop: the end of isovolumetric contraction.",
    why: "The aortic valve opens when LV pressure rises slightly above aortic diastolic pressure (about 80 mmHg in Guyton).",
    haem: "Ejection then begins, and volume falls toward ESV."
  },
  avcloses: {
    title: "Aortic valve closes (ESP)",
    kicker: "End-systole",
    loop: "The top-left corner: end-systolic pressure and ESV, and the start of isovolumetric relaxation.",
    why: "This point lies on the ESPVR. At a given contractile state, end-systolic points from differently loaded beats fall on the same line.",
    haem: "SV = EDV − ESV. The pressure here is end-systolic pressure."
  },
  peakP: {
    title: "Peak pressure",
    kicker: "During ejection",
    loop: "Pressure typically rises to a peak and then falls to end-systolic pressure, where the aortic valve closes.",
    why: "This is the arched ejection border of the loop, not a separate phase.",
    haem: "In the schematic normal, the peak sits near the usual arterial systolic value of about 120 mmHg (Guyton, Ch. 9)."
  }
};

const DEFAULT_KEYS = ["esv", "edv", "esp", "peakP", "edp", "avOpen", "isoConLeak", "isoRelGain", "espvrSlope", "edpvrSteep"];

function getParams(id) {
  const p = SCENARIOS[id] ? SCENARIOS[id].params : SCENARIOS.normal.params;
  return Object.assign({}, p);
}

const W = 420, H = 355, volMin = 10, volMax = 210, presMin = 0, presMax = 220;
const cx = v => ((v - volMin) / (volMax - volMin)) * W;
const cy = p => H - ((p - presMin) / (presMax - presMin)) * H;

const EJ_SAMPLES = 96;
const r2 = v => Math.round(v * 100) / 100;
// Points along a cubic Bezier at evenly spaced t, rounded to the precision written into the path.
function sampleCubic(p0, p1, p2, p3, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    pts.push([r2(a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0]), r2(a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])]);
  }
  return pts;
}

function buildPaths(p) {
  const { esv, edv, esp, peakP, edp, avOpen, isoConLeak, isoRelGain } = p;
  const fillStart = esv + isoRelGain;
  const ejStart = edv - isoConLeak;
  const x_esv = cx(esv), x_edv = cx(edv);
  const x_fill = cx(fillStart), x_ej = cx(ejStart);
  const y_esp = cy(esp), y_edp = cy(edp);
  const y_aov = cy(avOpen), y_base = cy(Math.max(3, Math.min(edp, 6)));
  // Ejection arc: one cubic Bezier, sampled once. The same sampled points draw the arc
  // and locate the Peak P marker, so the marker always sits on the drawn curve.
  const y_ctrl = cy(peakP);
  const ejPts = sampleCubic(
    [x_ej, y_aov],
    [cx(ejStart - (ejStart - esv) * 0.15), y_ctrl],
    [cx(esv + (ejStart - esv) * 0.25), y_ctrl],
    [x_esv, y_esp],
    EJ_SAMPLES
  );
  let peakPt = ejPts[0];
  ejPts.forEach(pt => { if (pt[1] < peakPt[1]) peakPt = pt; });
  const x_peak = peakPt[0], y_peak = peakPt[1];
  const ejLine = ejPts.slice(1).map(pt => "L " + r2(pt[0]) + " " + r2(pt[1])).join(" ");
  const fillPath = `M ${x_fill} ${y_base} C ${cx(fillStart + (edv - fillStart) * 0.65)} ${y_base}, ${x_edv} ${cy(edp * 0.3)}, ${x_edv} ${y_edp}`;
  const isoConPath = `M ${x_edv} ${y_edp} L ${x_ej} ${y_aov}`;
  const ejPath = `M ${x_ej} ${y_aov} ${ejLine}`;
  const isoRelPath = `M ${x_esv} ${y_esp} L ${x_fill} ${y_base}`;
  const fullPath = `${fillPath} L ${x_ej} ${y_aov} ${ejLine} L ${x_fill} ${y_base}`;
  return {
    fillPath, isoConPath, ejPath, isoRelPath, fullPath,
    x_esv, x_edv, x_fill, x_ej, y_esp, y_edp, y_aov, y_base, y_peak, x_peak, ejPts
  };
}

let activePhase = null;
let modifier = "normal";
let animFrom = Object.assign({}, getParams("normal"));
let animTo = Object.assign({}, getParams("normal"));
let animT = 1.0;
let animRAF = null;
let animStart = null;
const ANIM_MS = 500;

function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

function animParams() {
  if (animT >= 1.0) return Object.assign({}, animTo);
  const e = easeInOut(animT);
  const out = {};
  DEFAULT_KEYS.forEach(k => { out[k] = animFrom[k] + (animTo[k] - animFrom[k]) * e; });
  ["esv", "edv", "esp", "peakP", "edp", "avOpen", "isoConLeak", "isoRelGain"].forEach(k => { out[k] = Math.round(out[k]); });
  return out;
}

function triggerAnim(id) {
  animFrom = animParams();
  modifier = id;
  animTo = getParams(id);
  animT = 0;
  animStart = null;
  if (animRAF) cancelAnimationFrame(animRAF);
  if (window.PhysioTheme && PhysioTheme.prefersReducedMotion()) { animT = 1; renderSVG(); return; }
  function tick(ts) {
    if (!animStart) animStart = ts;
    animT = Math.min((ts - animStart) / ANIM_MS, 1.0);
    renderSVG();
    if (animT < 1.0) animRAF = requestAnimationFrame(tick);
    else animT = 1.0;
  }
  animRAF = requestAnimationFrame(tick);
}

const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function txt(tag, attrs, text, parent) {
  const e = el(tag, attrs, parent);
  e.textContent = text;
  return e;
}
function cueMark(color, dash) {
  const s = document.createElement("span");
  s.className = "cue-swatch";
  s.setAttribute("aria-hidden", "true");
  s.style.borderColor = color;
  if (dash) {
    s.style.backgroundColor = "transparent";
    s.style.backgroundImage = "repeating-linear-gradient(90deg, " + color + " 0 5px, transparent 5px 8px)";
  } else {
    s.style.backgroundColor = color;
  }
  return s;
}

let CHROME = {};
function applySeriesColors() {
  const t = PhysioTheme.tokens();
  CHROME = {
    grid: t.grid, axis: t.axis, muted: t.muted, text: t.text, border: t.border,
    primary: t.primary, font: t.fontSans,
    halo: t.chartBg || t.surface || "#FFFFFF",
    edpvr: t.b, espvr: t.a, ghost: t.e,
    filling: t.a, isocontraction: t.c, ejection: t.d, isorelaxation: t.b
  };
  const phaseMap = { filling: t.a, isocontraction: t.c, ejection: t.d, isorelaxation: t.b };
  const phaseDash = { filling: "", isocontraction: "7 5", ejection: "2 3.5", isorelaxation: "10 3 2 3" };
  PHASES.forEach(p => { p.color = phaseMap[p.id]; p.dash = phaseDash[p.id]; });
}
window.addEventListener("themechange", () => { applySeriesColors(); renderAll(); });


let activeInfo = null;
let predictOn = false;
let pendingId = null;
let predictChoices = {};
let predictRevealed = false;
let predictLoopShown = false;
let quizComplete = false;
let sessionCorrect = 0;
let sessionAsked = 0;
let scoredPending = null;

function setInfo(id) {
  activeInfo = id;
  if (id && id.indexOf("phase:") === 0) {
    activePhase = id.slice(6);
  } else if (id && id.indexOf("phase:") !== 0) {
    /* keep phase highlight only when a phase is the topic */
    if (id !== "espvr" && id !== "edpvr" && !id.startsWith("phase:")) {
      /* valve clicks should not require a phase */
    }
  }
  renderAll();
}

const SCENARIO_ORDER = SCENARIO_GROUPS.flatMap(g => g.ids).filter(id => id !== "normal");

function snapToNormal() {
  if (animRAF) cancelAnimationFrame(animRAF);
  animRAF = null;
  animStart = null;
  modifier = "normal";
  animFrom = Object.assign({}, getParams("normal"));
  animTo = Object.assign({}, getParams("normal"));
  animT = 1.0;
}

function requestScenario(id) {
  if (predictOn && id !== "normal" && SCENARIOS[id] && SCENARIOS[id].predict) {
    if (pendingId === id && modifier === "normal" && !predictLoopShown) {
      activeInfo = "predict";
      renderAll();
      return;
    }
    pendingId = id;
    predictChoices = {};
    predictRevealed = false;
    predictLoopShown = false;
    activePhase = null;
    activeInfo = "predict";
    snapToNormal();
    renderAll();
    return;
  }
  pendingId = null;
  predictLoopShown = false;
  activeInfo = "scenario";
  activePhase = null;
  if (id !== modifier) triggerAnim(id);
  renderAll();
}

function finishPredict() {
  if (!pendingId) return;
  const id = pendingId;
  pendingId = null;
  predictRevealed = false;
  predictChoices = {};
  predictLoopShown = false;
  activeInfo = "scenario";
  activePhase = null;
  triggerAnim(id);
  renderAll();
}

function showPredictLoop() {
  if (!pendingId) return;
  predictLoopShown = true;
  triggerAnim(pendingId);
  renderAll();
}

function nextScenarioId(fromId) {
  const i = SCENARIO_ORDER.indexOf(fromId);
  if (i < 0) return SCENARIO_ORDER[0] || null;
  if (i >= SCENARIO_ORDER.length - 1) return null;
  return SCENARIO_ORDER[i + 1];
}

function goNextScenario() {
  const from = pendingId || modifier;
  const next = nextScenarioId(from);
  if (!next) {
    quizComplete = true;
    pendingId = null;
    predictLoopShown = false;
    activeInfo = "predict";
    renderAll();
    return;
  }
  pendingId = next;
  predictChoices = {};
  predictRevealed = false;
  predictLoopShown = false;
  quizComplete = false;
  activePhase = null;
  activeInfo = "predict";
  snapToNormal();
  renderAll();
}

function scoreCurrentIfNeeded() {
  if (!pendingId || scoredPending === pendingId) return;
  const s = SCENARIOS[pendingId];
  if (!s || !s.predict) return;
  s.predict.forEach((item, i) => {
    sessionAsked += 1;
    if (predictChoices[i] === item.answer) sessionCorrect += 1;
  });
  scoredPending = pendingId;
}


function clipToPlot(x1, y1, x2, y2) {
  let t0 = 0, t1 = 1, dx = x2 - x1, dy = y2 - y1;
  const test = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (test(-dx, x1) && test(dx, W - x1) && test(-dy, y1) && test(dy, H - y1)) {
    return { x1: x1 + t0 * dx, y1: y1 + t0 * dy, x2: x1 + t1 * dx, y2: y1 + t1 * dy };
  }
  return null;
}

const PLOT = { x: 72, y: 24, w: 420, h: 355, viewW: 528, viewH: 476 };
const FONT = "Source Sans 3, Helvetica Neue, sans-serif";

function svgScale() {
  const svg = document.getElementById("pvSvg");
  const box = svg ? svg.getBoundingClientRect() : null;
  const h = box && box.height > 0 ? box.height : 0;
  return h ? h / PLOT.viewH : 1;
}
function fsFor(minPx) {
  const s = svgScale() || 1;
  const needed = minPx / s;
  return Math.round(Math.max(minPx, needed) * 10) / 10;
}
function haloWidth() {
  const s = svgScale() || 1;
  return Math.max(3.5, 4.5 / s);
}
function asLines(text) {
  return Array.isArray(text) ? text : [String(text)];
}
function haloText(attrs, text, parent) {
  const fs = Number(attrs["font-size"]) || 14;
  const lines = asLines(text);
  const lh = fs * 1.15;
  const baseY = Number(attrs.y);
  const startY = lines.length === 1 ? baseY : baseY - (lines.length - 1) * lh / 2;
  const e = el("text", Object.assign({
    "font-family": FONT,
    "paint-order": "stroke fill",
    stroke: CHROME.halo || "#FFFFFF",
    "stroke-width": String(haloWidth()),
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
    "dominant-baseline": "central"
  }, attrs, { y: startY }), parent);
  if (lines.length === 1) {
    e.textContent = lines[0];
  } else {
    lines.forEach((line, i) => {
      const ts = el("tspan", { x: attrs.x, dy: i === 0 ? 0 : lh }, e);
      ts.textContent = line;
    });
  }
  return e;
}
function measureLabel(svg, text, fs, weight, italic) {
  const tmp = el("g", { visibility: "hidden" }, svg);
  const t = el("text", {
    x: 0, y: 0,
    "font-family": FONT,
    "font-size": fs,
    "font-weight": weight || "700",
    "font-style": italic ? "italic" : "normal",
    "dominant-baseline": "central",
    "text-anchor": "start"
  }, tmp);
  const lines = asLines(text);
  if (lines.length === 1) t.textContent = lines[0];
  else {
    const lh = fs * 1.15;
    lines.forEach((line, i) => {
      const ts = el("tspan", { x: 0, dy: i === 0 ? 0 : lh }, t);
      ts.textContent = line;
    });
  }
  const b = t.getBBox();
  tmp.remove();
  const w = Math.max(b.width, Math.max.apply(null, lines.map(ln => ln.length * fs * 0.52)));
  const h = Math.max(b.height, lines.length * fs * 1.15);
  return { w: w + 2, h: h + 2 };
}
function boxAt(cx, cy, w, h) {
  return { x: cx - w / 2, y: cy - h / 2, w: w, h: h, cx: cx, cy: cy };
}
function overlapArea(a, b, pad) {
  const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (xOverlap > 0 && yOverlap > 0) return xOverlap * yOverlap;
  const gapX = xOverlap >= 0 ? 0 : -xOverlap;
  const gapY = yOverlap >= 0 ? 0 : -yOverlap;
  if (gapX < pad && gapY < pad) return (pad - gapX) * (pad - gapY);
  return 0;
}
function inView(r, view) {
  return r.x >= view.x && r.y >= view.y && r.x + r.w <= view.x + view.w && r.y + r.h <= view.y + view.h;
}
function around(px, py, w, h, names, gap) {
  const g = gap == null ? 11 : gap;
  const slots = {
    left: [px - g - w / 2, py],
    right: [px + g + w / 2, py],
    above: [px, py - g - h / 2],
    below: [px, py + g + h / 2],
    "above-left": [px - g - w / 2, py - g * 0.7 - h / 2],
    "above-right": [px + g + w / 2, py - g * 0.7 - h / 2],
    "below-left": [px - g - w / 2, py + g * 0.7 + h / 2],
    "below-right": [px + g + w / 2, py + g * 0.7 + h / 2],
    "far-left": [px - g * 1.85 - w / 2, py],
    "far-right": [px + g * 1.85 + w / 2, py],
    "far-above": [px, py - g * 1.85 - h / 2],
    "far-below": [px, py + g * 1.85 + h / 2],
    "above-left-far": [px - g * 1.6 - w / 2, py - g * 1.2 - h / 2],
    "above-right-far": [px + g * 1.6 + w / 2, py - g * 1.2 - h / 2],
    "below-left-far": [px - g * 1.6 - w / 2, py + g * 1.2 + h / 2],
    "below-right-far": [px + g * 1.6 + w / 2, py + g * 1.2 + h / 2]
  };
  return names.map((n, i) => {
    const s = slots[n];
    return { cx: s[0], cy: s[1], slot: n, i: i };
  });
}
function pickPlacement(w, h, candidates, occupied, view, extraScore) {
  const pad = 6;
  let best = null, bestScore = Infinity;
  candidates.forEach((c, i) => {
    const r = boxAt(c.cx, c.cy, w, h);
    const clipped = !inView(r, view);
    let score = (clipped ? 8000 : 0) + i * 0.5;
    occupied.forEach(o => { score += overlapArea(r, o, pad) * 4; });
    if (extraScore) score += extraScore(r);
    if (score < bestScore) {
      bestScore = score;
      best = { cx: r.cx, cy: r.cy, box: r, slot: c.slot, score: score };
    }
  });
  return best;
}
function attachOnBox(box, px, py) {
  const x = Math.max(box.x, Math.min(px, box.x + box.w));
  const y = Math.max(box.y, Math.min(py, box.y + box.h));
  if (x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h) {
    const dl = x - box.x, dr = box.x + box.w - x, dt = y - box.y, db = box.y + box.h - y;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) return { x: box.x, y: y };
    if (m === dr) return { x: box.x + box.w, y: y };
    if (m === dt) return { x: x, y: box.y };
    return { x: x, y: box.y + box.h };
  }
  return { x: x, y: y };
}
// Shortest distance from point (px, py) to segment a-b.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// Leader line from a dot to a label box, starting just outside the dot.
function leaderFor(box, anchor) {
  const att = attachOnBox(box, anchor.x, anchor.y);
  const dx = att.x - anchor.x, dy = att.y - anchor.y, dist = Math.hypot(dx, dy);
  if (dist <= 10) return null;
  return { x1: anchor.x + dx / dist * 5, y1: anchor.y + dy / dist * 5, x2: att.x, y2: att.y };
}
// Closest approach of a leader line to a set of polylines (sampled along the leader).
function leaderClearance(ln, polylines) {
  let m = Infinity;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, x = ln.x1 + (ln.x2 - ln.x1) * t, y = ln.y1 + (ln.y2 - ln.y1) * t;
    polylines.forEach(pl => { for (let k = 1; k < pl.length; k++) m = Math.min(m, segDist(x, y, pl[k - 1][0], pl[k - 1][1], pl[k][0], pl[k][1])); });
  }
  return m;
}
const LEADER_CLEAR = 3; // user units: clears the 2.6 curve stroke and the 1 px leader

function placeAndDraw(g, occupied, view, spec) {
  // spec.avoid: polylines the leader line must not touch (candidates that would are heavily penalised)
  const extra = (spec.anchor && spec.avoid) ? (r => { const ln = leaderFor(r, spec.anchor); return ln && leaderClearance(ln, spec.avoid) < LEADER_CLEAR ? 20000 : 0; }) : null;
  const chosen = pickPlacement(spec.w, spec.h, spec.cands, occupied, view, extra);
  if (!chosen) return null;
  occupied.push(chosen.box);
  if (spec.anchor) {
    let ln = leaderFor(chosen.box, spec.anchor);
    // In a cramped loop no slot may give a clear leader: trim its start until it clears the curve,
    // and drop it if what is left is too short to read.
    if (ln && spec.avoid && leaderClearance(ln, spec.avoid) < LEADER_CLEAR) {
      let t0 = 1;
      for (let i = 23; i >= 0; i--) {
        const t = i / 24, x = ln.x1 + (ln.x2 - ln.x1) * t, y = ln.y1 + (ln.y2 - ln.y1) * t;
        if (leaderClearance({ x1: x, y1: y, x2: ln.x2, y2: ln.y2 }, spec.avoid) < LEADER_CLEAR) break;
        t0 = t;
      }
      const nx = ln.x1 + (ln.x2 - ln.x1) * t0, ny = ln.y1 + (ln.y2 - ln.y1) * t0;
      ln = Math.hypot(ln.x2 - nx, ln.y2 - ny) >= 4 ? { x1: nx, y1: ny, x2: ln.x2, y2: ln.y2 } : null;
    }
    if (ln) {
      el("line", {
        x1: ln.x1, y1: ln.y1,
        x2: ln.x2, y2: ln.y2,
        stroke: spec.fill, "stroke-width": 1, "stroke-linecap": "round",
        opacity: "0.9", "pointer-events": "none"
      }, g);
    }
  }
  const node = haloText({
    x: chosen.cx, y: chosen.cy,
    fill: spec.fill,
    "font-size": spec.fs,
    "font-weight": spec.weight || "700",
    "font-style": spec.italic ? "italic" : "normal",
    "text-anchor": "middle",
    style: spec.onClick ? "cursor:pointer" : undefined
  }, spec.text, g);
  if (spec.onClick) node.addEventListener("click", ev => { ev.stopPropagation(); spec.onClick(); });
  return chosen;
}

function renderSVG() {
  const svg = document.getElementById("pvSvg");
  svg.setAttribute("viewBox", "0 0 " + PLOT.viewW + " " + PLOT.viewH);
  svg.innerHTML = "";
  const g = el("g", { transform: "translate(" + PLOT.x + "," + PLOT.y + ")" }, svg);
  const params = animParams();
  const paths = buildPaths(params);
  const normalPaths = buildPaths(getParams("normal"));
  const showGhost = modifier !== "normal";
  const sv = params.edv - params.esv;
  const ef = Math.round((sv / params.edv) * 100);
  const infoOn = (key) => activeInfo === key;
  const fsTick = fsFor(12);
  const fsLabel = fsFor(12.5);
  const fsAxis = fsFor(12.5);
  const fsSv = fsFor(13);
  const view = {
    x: 4 - PLOT.x,
    y: 4 - PLOT.y,
    w: PLOT.viewW - 8,
    h: PLOT.viewH - 8
  };
  const occupied = [];

  [0, 25, 50, 75, 100, 125, 150, 175, 200].forEach(p => {
    const y = cy(p);
    el("line", { x1: 0, y1: y, x2: W, y2: y, stroke: CHROME.grid, "stroke-width": 1 }, g);
    if (p !== 0) {
      const m = measureLabel(svg, String(p), fsTick, "600", false);
      haloText({
        x: -8, y: y, fill: CHROME.muted, "font-size": fsTick, "font-weight": "600",
        "text-anchor": "end"
      }, String(p), g);
      occupied.push({ x: -8 - m.w, y: y - m.h / 2, w: m.w, h: m.h });
    }
  });
  [40, 80, 120, 160, 200].forEach(v => {
    const x = cx(v);
    el("line", { x1: x, y1: 0, x2: x, y2: H, stroke: CHROME.grid, "stroke-width": 1 }, g);
    const m = measureLabel(svg, String(v), fsTick, "600", false);
    const y = H + 16;
    haloText({
      x: x, y: y, fill: CHROME.muted, "font-size": fsTick, "font-weight": "600",
      "text-anchor": "middle"
    }, String(v), g);
    occupied.push({ x: x - m.w / 2, y: y - m.h / 2, w: m.w, h: m.h });
  });
  const volY = H + 74;
  haloText({
    x: W / 2, y: volY, fill: CHROME.muted, "font-size": fsAxis, "font-weight": "600",
    "text-anchor": "middle"
  }, "Volume (mL)", g);
  const volM = measureLabel(svg, "Volume (mL)", fsAxis, "600", false);
  occupied.push({ x: W / 2 - volM.w / 2, y: volY - volM.h / 2, w: volM.w, h: volM.h });
  const pressX = -58, pressY = H / 2;
  const press = el("text", {
    x: 0, y: 0, fill: CHROME.muted, "font-size": fsAxis, "font-weight": "600",
    "text-anchor": "middle",
    transform: "translate(" + pressX + "," + pressY + ") rotate(-90)",
    "font-family": FONT,
    "paint-order": "stroke fill",
    stroke: CHROME.halo || "#FFFFFF",
    "stroke-width": String(haloWidth()),
    "stroke-linejoin": "round",
    "dominant-baseline": "central"
  }, g);
  press.textContent = "Pressure (mmHg)";
  occupied.push({ x: pressX - fsAxis, y: pressY - 80, w: fsAxis * 2, h: 160 });
  /* Keep later labels off the y-axis tick corridor and the x-axis legend band. */
  occupied.push({ x: view.x, y: 0, w: 8 - view.x, h: H });


  const steep = params.edpvrSteep || 1;
  const edpvrMidVol = params.edv * (steep > 1.4 ? 0.40 : 0.55);
  const edpvrMidP = params.edp * (steep > 1.4 ? 0.45 : 0.15);
  const edpvrEndP = params.edp + (steep > 1.4 ? 10 : (params.edv > 140 ? 14 : 8));
  const edpvrPath = `M ${cx(20)} ${cy(1)} C ${cx(edpvrMidVol)} ${cy(edpvrMidP)}, ${cx(params.edv * 0.85)} ${cy(params.edp * (0.3 + 0.2 * Math.max(0, steep - 1)))}, ${cx(params.edv + 16)} ${cy(edpvrEndP)}`;
  el("path", { d: edpvrPath, fill: "none", stroke: CHROME.edpvr, "stroke-width": infoOn("edpvr") ? 3 : 1.2, "stroke-dasharray": "4,3", class: "clickable" }, g);
  const edpHit = el("path", { d: edpvrPath, fill: "none", stroke: "transparent", "stroke-width": 14, class: "clickable", style: "cursor:pointer" }, g);
  edpHit.addEventListener("click", ev => { ev.stopPropagation(); activePhase = null; activeInfo = "edpvr"; renderAll(); });

  const slope = params.espvrSlope;
  let ex1 = cx(params.esv - 18), ey1 = cy(params.esp - slope * 18);
  let ex2 = cx(params.esv + 22), ey2 = cy(params.esp + slope * 22);
  const clipped = clipToPlot(ex1, ey1, ex2, ey2);
  if (clipped) { ex1 = clipped.x1; ey1 = clipped.y1; ex2 = clipped.x2; ey2 = clipped.y2; }
  el("line", { x1: ex1, y1: ey1, x2: ex2, y2: ey2, stroke: CHROME.espvr, "stroke-width": infoOn("espvr") ? 3 : 1.2, "stroke-dasharray": "4,3" }, g);
  const espHit = el("line", { x1: ex1, y1: ey1, x2: ex2, y2: ey2, stroke: "transparent", "stroke-width": 14, style: "cursor:pointer" }, g);
  espHit.addEventListener("click", ev => { ev.stopPropagation(); activePhase = null; activeInfo = "espvr"; renderAll(); });

  if (showGhost) {
    el("path", { d: normalPaths.fullPath, fill: "none", stroke: CHROME.ghost, "stroke-width": 1.5, "stroke-dasharray": "5,3", opacity: "0.7" }, g);
  }

  const phaseColors = { filling: CHROME.filling, isocontraction: CHROME.isocontraction, ejection: CHROME.ejection, isorelaxation: CHROME.isorelaxation };
  const phasePaths = { filling: paths.fillPath, isocontraction: paths.isoConPath, ejection: paths.ejPath, isorelaxation: paths.isoRelPath };
  PHASES.forEach(phase => {
    const isActive = activePhase === phase.id;
    const pathEl = el("path", {
      d: phasePaths[phase.id], fill: "none", stroke: phaseColors[phase.id],
      "stroke-width": isActive ? 4.5 : 2.6, "stroke-linecap": "round",
      "stroke-dasharray": phase.dash || "",
      opacity: isActive ? 1 : (activePhase ? 0.18 : 0.9),
      style: "cursor:pointer"
    }, g);
    pathEl.addEventListener("click", ev => {
      ev.stopPropagation();
      activePhase = activePhase === phase.id ? null : phase.id;
      activeInfo = activePhase ? "phase:" + activePhase : "scenario";
      renderAll();
    });
  });

  const valveDots = [
    { key: "mvopens", x: paths.x_fill, y: paths.y_base, r: 3.5, fill: CHROME.filling, text: "MV opens",
      slots: ["left", "above-left", "far-left", "above-left-far", "below-left", "above"] },
    { key: "mvcloses", x: paths.x_edv, y: paths.y_edp, r: 3.5, fill: CHROME.isocontraction, text: "MV closes",
      slots: ["below-right", "right", "below", "above-right", "below-right-far", "far-right", "above-right-far"] },
    { key: "avopens", x: paths.x_ej, y: paths.y_aov, r: 3.5, fill: CHROME.ejection, text: "AV opens",
      slots: ["right", "above-right", "below-right", "far-right", "above", "above-right-far", "below-right-far"] },
    { key: "avcloses", x: paths.x_esv, y: paths.y_esp, r: 4, fill: CHROME.espvr, text: ["AV closes", "(ESP)"],
      slots: params.esv < 60
        ? ["left", "above-left", "above", "above-right", "far-left", "above-left-far", "right"]
        : ["left", "above-left", "below-left", "above", "far-left", "above-left-far", "below-left-far"] },
    { key: "peakP", x: paths.x_peak, y: paths.y_peak, r: 3.5, fill: CHROME.ejection, text: "Peak P",
      slots: ["above", "far-above", "above-right", "above-left", "above-right-far", "above-left-far", "right", "left"] }
  ];
  valveDots.forEach(d => {
    const hit = el("circle", { cx: d.x, cy: d.y, r: 12, fill: "transparent", style: "cursor:pointer" }, g);
    hit.addEventListener("click", ev => { ev.stopPropagation(); activePhase = null; activeInfo = d.key; renderAll(); });
    el("circle", { cx: d.x, cy: d.y, r: infoOn(d.key) ? 6 : d.r, fill: d.fill }, g);
    occupied.push({ x: d.x - 8, y: d.y - 8, w: 16, h: 16 });
  });

  const setInfoClick = (key) => () => { activePhase = null; activeInfo = key; renderAll(); };

  const esvM = measureLabel(svg, "ESV", fsLabel, "700", false);
  const edvM = measureLabel(svg, "EDV", fsLabel, "700", false);
  const markerY = H + 44;
  let esvX = paths.x_esv, edvX = paths.x_edv;
  if (overlapArea(boxAt(esvX, markerY, esvM.w, esvM.h), boxAt(edvX, markerY, edvM.w, edvM.h), 6) > 0) {
    const mid = (esvX + edvX) / 2;
    esvX = mid - esvM.w / 2 - 4;
    edvX = mid + edvM.w / 2 + 4;
  }
  haloText({ x: esvX, y: markerY, fill: CHROME.text, "font-size": fsLabel, "font-weight": "700", "text-anchor": "middle" }, "ESV", g);
  haloText({ x: edvX, y: markerY, fill: CHROME.text, "font-size": fsLabel, "font-weight": "700", "text-anchor": "middle" }, "EDV", g);
  occupied.push(boxAt(esvX, markerY, esvM.w, esvM.h));
  occupied.push(boxAt(edvX, markerY, edvM.w, edvM.h));
  occupied.push({ x: 0, y: H + 6, w: W, h: view.y + view.h - (H + 6) });

  const loopLines = [paths.ejPts, [[paths.x_edv, paths.y_edp], [paths.x_ej, paths.y_aov]], [[paths.x_esv, paths.y_esp], [paths.x_fill, paths.y_base]]];
  valveDots.forEach(d => {
    const m = measureLabel(svg, d.text, fsLabel, "700", false);
    placeAndDraw(g, occupied, view, {
      avoid: d.key === "peakP" ? loopLines : null,
      w: m.w, h: m.h, fs: fsLabel, fill: d.fill, text: d.text, weight: "700",
      cands: around(d.x, d.y, m.w, m.h, d.slots, 12),
      anchor: { x: d.x, y: d.y },
      onClick: setInfoClick(d.key)
    });
  });

  const espvrM = measureLabel(svg, "ESPVR", fsLabel, "700", true);
  const espMidX = (ex1 + ex2) / 2, espMidY = (ey1 + ey2) / 2;
  const espN = Math.hypot(ex2 - ex1, ey2 - ey1) || 1;
  const nX = -(ey2 - ey1) / espN, nY = (ex2 - ex1) / espN;
  const outside = nY < 0 ? 1 : -1;
  const espCands = [
    { cx: ex2 + nX * outside * 14, cy: ey2 + nY * outside * 14, slot: "end-out", i: 0 },
    { cx: espMidX + nX * outside * 14, cy: espMidY + nY * outside * 14, slot: "mid-out", i: 1 },
    { cx: ex2 + 16, cy: ey2 - 10, slot: "end-ne", i: 2 },
    { cx: ex1 - 8, cy: ey1 - 12, slot: "start-n", i: 3 },
    { cx: ex2 + 10, cy: ey2 + 14, slot: "end-se", i: 4 }
  ];
  placeAndDraw(g, occupied, view, {
    w: espvrM.w, h: espvrM.h, fs: fsLabel, fill: CHROME.espvr, text: "ESPVR",
    weight: "700", italic: true,
    cands: espCands.concat(around(ex2, ey2, espvrM.w, espvrM.h, ["above-right", "above", "left", "above-left", "right"], 12)),
    onClick: setInfoClick("espvr")
  });

  const edpvrM = measureLabel(svg, "EDPVR", fsLabel, "700", true);
  const edpX = cx(params.edv + 16), edpY = cy(edpvrEndP);
  placeAndDraw(g, occupied, view, {
    w: edpvrM.w, h: edpvrM.h, fs: fsLabel, fill: CHROME.edpvr, text: "EDPVR",
    weight: "700", italic: true,
    cands: (Math.abs(paths.y_aov - paths.y_edp) < 55
      ? [{ cx: Math.min(edpX, paths.x_ej) - edpvrM.w / 2 - 12, cy: (paths.y_aov + paths.y_edp) / 2, slot: "pocket", i: 0 }]
      : [{ cx: edpX + edpvrM.w / 2 + 12, cy: (paths.y_aov + paths.y_edp) / 2, slot: "mid-right", i: 0 },
         { cx: edpX + edpvrM.w / 2 + 8, cy: paths.y_edp - edpvrM.h / 2 - 14, slot: "above-end", i: 1 }]
    ).concat(around(edpX, edpY, edpvrM.w, edpvrM.h, ["above-right-far", "far-right", "above-right", "above", "right", "below-right"], 18)),
    onClick: setInfoClick("edpvr")
  });

  if (!activePhase) {
    const svText = "SV " + sv + " mL";
    const svM = measureLabel(svg, svText, fsSv, "700", false);
    const svMidX = (paths.x_esv + paths.x_edv) / 2;
    const svMidY = (Math.min(paths.y_esp, paths.y_peak) + paths.y_base) / 2;
    const loopW = Math.abs(paths.x_edv - paths.x_esv);
    const preferInside = loopW > svM.w + 16;
    const svSlots = preferInside
      ? ["below", "above", "right", "left", "below-right", "below-left"]
      : ["far-right", "right", "far-left", "left", "below", "above"];
    const svCands = around(svMidX, svMidY, svM.w, svM.h, svSlots, preferInside ? 0 : 16);
    if (preferInside) svCands.unshift({ cx: svMidX, cy: svMidY, slot: "centre", i: -1 });
    placeAndDraw(g, occupied, view, {
      w: svM.w, h: svM.h, fs: fsSv, fill: CHROME.primary, text: svText, weight: "700",
      cands: svCands
    });
  }

  if (showGhost) {
    const ghostText = "Normal (dashed)";
    const gm = measureLabel(svg, ghostText, fsTick, "700", false);
    const ghostCands = [
      { cx: 8 + gm.w / 2, cy: 12 + gm.h / 2, slot: "top-left", i: 0 },
      { cx: W - 10 - gm.w / 2, cy: 12 + gm.h / 2, slot: "top-right", i: 1 },
      { cx: W - 10 - gm.w / 2, cy: 16 + gm.h + 14, slot: "top-right-down", i: 2 },
      { cx: 8 + gm.w / 2, cy: 16 + gm.h + 14, slot: "top-left-2", i: 3 },
      { cx: W * 0.72, cy: 12 + gm.h / 2, slot: "top-midright", i: 4 },
      { cx: W * 0.55, cy: 16 + gm.h + 14, slot: "top-mid-down", i: 5 }
    ];
    placeAndDraw(g, occupied, view, {
      w: gm.w, h: gm.h, fs: fsTick, fill: CHROME.ghost, text: ghostText, weight: "700",
      cands: ghostCands
    });
  }

  const stats = document.getElementById("statsStrip");
  stats.innerHTML = "";
  [
    { label: "EDV", val: params.edv + " mL" },
    { label: "ESV", val: params.esv + " mL" },
    { label: "SV", val: sv + " mL" },
    { label: "EF", val: ef + "%" },
    { label: "EDP", val: params.edp + " mmHg" }
  ].forEach(s => {
    const d = document.createElement("div");
    d.className = "stat";
    d.innerHTML = '<div class="stat-val">' + s.val + '</div><div class="stat-label">' + s.label + "</div>";
    stats.appendChild(d);
  });
}

function renderPanel() {
  const panel = document.getElementById("scenarioPanel");
  if (predictOn && (pendingId || quizComplete)) {
    panel.innerHTML = renderPredictHTML();
    wirePredict();
    return;
  }
  if (predictOn && !pendingId) {
    panel.innerHTML = '<p class="explain-kicker">Test yourself!</p><h2 class="explain-title">Pick a scenario</h2><p>Choose a scenario above, then guess how the loop will change.</p>';
    return;
  }
  if (activeInfo && CLICK_INFO[activeInfo]) {
    const s = CLICK_INFO[activeInfo];
    panel.innerHTML = blockHTML(s.title, s.kicker, s.loop, s.why, s.haem);
    return;
  }
  if (activePhase) {
    const p = PHASES.find(x => x.id === activePhase);
    panel.innerHTML = blockHTML(p.label, p.highlight, p.description, "", "");
    return;
  }
  const s = SCENARIOS[modifier];
  panel.innerHTML = blockHTML(s.label, "Physiological state", s.loop, s.why, s.haem);
}

function blockHTML(title, kicker, loop, why, haem) {
  let html = (kicker ? '<p class="explain-kicker">' + kicker + "</p>" : "") + '<h2 class="explain-title">' + title + "</h2>";
  if (loop) html += '<div class="panel-block"><h3>What changes</h3><p>' + loop + "</p></div>";
  if (why) html += '<div class="panel-block"><h3>Why</h3><p>' + why + "</p></div>";
  if (haem) html += '<div class="panel-block"><h3>Consequence</h3><p>' + haem + "</p></div>";
  return html;
}

function renderPredictHTML() {
  if (quizComplete) {
    let html = '<p class="explain-kicker">Test yourself!</p><h2 class="explain-title">You have finished every scenario</h2>';
    html += '<p class="predict-score">Session score: ' + sessionCorrect + " of " + sessionAsked + ".</p>";
    html += '<div class="predict-actions"><button type="button" id="predictRestart">Start again</button></div>';
    return html;
  }
  const s = SCENARIOS[pendingId];
  let html = '<p class="explain-kicker">Test yourself!</p><h2 class="explain-title">' + s.label + "</h2>";
  if (!predictLoopShown) {
    html += '<p class="predict-status">The graph shows the normal loop. Reveal or skip to see ' + s.label.toLowerCase() + ".</p>";
  } else {
    html += '<p class="predict-status">Showing ' + s.label.toLowerCase() + ".</p>";
  }
  html += "<p>Guess how the loop changes, then reveal. The questions use only the same teaching points as the explanation.</p>";
  s.predict.forEach((item, i) => {
    html += '<div class="predict-q" data-q="' + i + '"><p>' + (i + 1) + ". " + item.q + "</p><div class='predict-opts'>";
    item.options.forEach((opt, j) => {
      let cls = "";
      const pressed = predictChoices[i] === j;
      let mark = "";
      let verdict = "";
      let aria = opt;
      if (predictRevealed) {
        if (j === item.answer) {
          cls = " is-correct";
          mark = '<span class="predict-mark" aria-hidden="true">✓</span>';
          if (pressed) {
            verdict = '<span class="predict-verdict">Correct</span>';
            aria = opt + " (Correct)";
          } else {
            aria = opt + " (Correct answer)";
          }
        } else if (pressed) {
          cls = " is-wrong";
          mark = '<span class="predict-mark" aria-hidden="true">✗</span>';
          verdict = '<span class="predict-verdict">Not quite</span>';
          aria = opt + " (Not quite)";
        }
      }
      html += '<button type="button" data-q="' + i + '" data-opt="' + j + '" aria-pressed="' + (pressed ? "true" : "false") + '" aria-label="' + aria.replace(/"/g, "&quot;") + '" class="' + cls + '">' + mark + '<span class="predict-opt-text">' + opt + verdict + "</span></button>";
    });
    html += "</div></div>";
  });
  if (predictRevealed) {
    const qn = s.predict.length;
    const got = s.predict.filter((item, i) => predictChoices[i] === item.answer).length;
    html += '<p class="predict-score" aria-live="polite">Score: ' + got + " of " + qn;
    if (sessionAsked) html += " · Session: " + sessionCorrect + " of " + sessionAsked;
    html += "</p>";
  }
  html += '<div class="predict-actions">';
  if (predictRevealed) {
    if (!predictLoopShown) html += '<button type="button" id="predictReveal">Show the loop</button>';
    html += '<button type="button" id="predictNext">Next scenario</button>';
  } else {
    html += '<button type="button" id="predictReveal">Reveal answers</button>';
    html += '<button type="button" class="secondary" id="predictSkip">Skip and run</button>';
  }
  html += "</div>";
  return html;
}

function wirePredict() {
  document.querySelectorAll(".predict-opts button").forEach(btn => {
    btn.addEventListener("click", () => {
      if (predictRevealed) return;
      predictChoices[Number(btn.getAttribute("data-q"))] = Number(btn.getAttribute("data-opt"));
      renderPanel();
    });
  });
  const reveal = document.getElementById("predictReveal");
  const skip = document.getElementById("predictSkip");
  const next = document.getElementById("predictNext");
  const restart = document.getElementById("predictRestart");
  if (reveal) reveal.addEventListener("click", () => {
    if (!predictRevealed) {
      predictRevealed = true;
      scoreCurrentIfNeeded();
      renderPanel();
      syncTestBanner();
    } else {
      showPredictLoop();
    }
  });
  if (skip) skip.addEventListener("click", () => {
    predictRevealed = true;
    scoreCurrentIfNeeded();
    showPredictLoop();
  });
  if (next) next.addEventListener("click", goNextScenario);
  if (restart) restart.addEventListener("click", () => {
    sessionCorrect = 0;
    sessionAsked = 0;
    scoredPending = null;
    quizComplete = false;
    pendingId = SCENARIO_ORDER[0];
    predictChoices = {};
    predictRevealed = false;
    predictLoopShown = false;
    activeInfo = "predict";
    snapToNormal();
    renderAll();
  });
}

function renderScenarioButtons() {
  const root = document.getElementById("scenarioGroups");
  root.innerHTML = "";
  SCENARIO_GROUPS.forEach((group, gi) => {
    const wrap = document.createElement("div");
    wrap.className = "scen-subgroup scen-" + (group.key || "group");
    const hid = "scen-h-" + gi;
    const lab = document.createElement("h3");
    lab.className = "scen-group-label";
    lab.id = hid;
    lab.textContent = group.label;
    wrap.appendChild(lab);
    const row = document.createElement("div");
    row.className = "scen-row";
    row.setAttribute("role", "group");
    row.setAttribute("aria-labelledby", hid);
    group.ids.forEach(id => {
      const s = SCENARIOS[id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scen-btn";
      btn.textContent = s.label;
      const current = (pendingId || modifier) === id;
      btn.setAttribute("aria-pressed", current && !pendingId ? "true" : "false");
      if (pendingId === id) btn.setAttribute("aria-current", "true");
      btn.addEventListener("click", () => requestScenario(id));
      row.appendChild(btn);
    });
    wrap.appendChild(row);
    root.appendChild(wrap);
  });
}

function renderPhaseButtons() {
  const container = document.getElementById("phaseBtns");
  container.innerHTML = "";
  PHASES.forEach(p => {
    const btn = document.createElement("button");
    btn.className = "phase-btn btn-with-cue";
    btn.textContent = p.label;
    btn.type = "button";
    btn.setAttribute("aria-pressed", activePhase === p.id ? "true" : "false");
    btn.setAttribute("aria-label", p.label);
    btn.prepend(cueMark(p.color, p.dash));
    if (activePhase === p.id) {
      btn.style.borderColor = p.color;
      btn.style.background = p.color + "18";
      btn.style.color = p.color;
    }
    btn.addEventListener("click", () => {
      activePhase = activePhase === p.id ? null : p.id;
      activeInfo = activePhase ? "phase:" + activePhase : "scenario";
      renderAll();
    });
    container.appendChild(btn);
  });
}

function renderAll() {
  renderScenarioButtons();
  renderPanel();
  renderSVG();
  renderPhaseButtons();
}

function syncTestBanner() {
  const banner = document.getElementById("testBanner");
  const tog = document.getElementById("predictToggle");
  if (!banner || !tog) return;
  banner.classList.toggle("is-on", predictOn);
  tog.setAttribute("aria-checked", predictOn ? "true" : "false");
  tog.setAttribute("aria-pressed", predictOn ? "true" : "false");
  tog.removeAttribute("aria-labelledby");
  const lab = tog.querySelector(".test-cta-label");
  if (lab) lab.textContent = predictOn ? "Exit" : "Start";
  tog.setAttribute("aria-label", predictOn ? "Exit Test yourself" : "Start Test yourself");
  const score = document.getElementById("testBannerScore");
  if (score) {
    if (predictOn && sessionAsked) {
      score.hidden = false;
      score.textContent = "Session: " + sessionCorrect + " of " + sessionAsked;
    } else {
      score.hidden = true;
      score.textContent = "";
    }
  }
}

function updateLoopStatus() {
  const el = document.getElementById("loopStatus");
  if (!el) return;
  if (predictOn && pendingId && !predictLoopShown) {
    el.hidden = false;
    el.textContent = "Showing the normal loop. The questions are about " + SCENARIOS[pendingId].label.toLowerCase() + ".";
  } else if (predictOn && pendingId && predictLoopShown) {
    el.hidden = false;
    el.textContent = "Showing " + SCENARIOS[pendingId].label.toLowerCase() + ".";
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

function wireChrome() {
  const tog = document.getElementById("predictToggle");
  tog.addEventListener("click", () => {
    predictOn = !predictOn;
    if (!predictOn) {
      quizComplete = false;
      pendingId = null;
      predictRevealed = false;
      predictChoices = {};
      predictLoopShown = false;
      activeInfo = "scenario";
    }
    syncTestBanner();
    renderAll();
  });
  document.querySelectorAll(".try-btn").forEach(btn => {
    btn.addEventListener("click", () => requestScenario(btn.getAttribute("data-try")));
  });
}

function wireReviseTabs() {
  const list = document.querySelector(".revise-tabs");
  if (!list) return;
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  function activate(tab, focus) {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(tab => {
    tab.addEventListener("click", () => activate(tab, false));
    tab.addEventListener("keydown", e => {
      const i = tabs.indexOf(tab);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        activate(tabs[(i + 1) % tabs.length], true);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        activate(tabs[(i - 1 + tabs.length) % tabs.length], true);
      } else if (e.key === "Home") {
        e.preventDefault();
        activate(tabs[0], true);
      } else if (e.key === "End") {
        e.preventDefault();
        activate(tabs[tabs.length - 1], true);
      }
    });
  });
}

const _renderAll = renderAll;
renderAll = function () {
  renderScenarioButtons();
  renderPanel();
  renderSVG();
  renderPhaseButtons();
  updateLoopStatus();
  syncTestBanner();
};

applySeriesColors();
renderAll();
wireChrome();
wireReviseTabs();
