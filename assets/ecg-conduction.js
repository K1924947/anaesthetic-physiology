/* Why the ECG looks like that: conduction mock-up.
   One master clock (state.t, ms after the SA node fires) drives the heart, arrow, traces, timeline and sentence.
   Traces are stored schematic morphologies (textbook patterns), not calculated from the diagram. */
(function () {
  "use strict";

  var CYCLE = 800; // one beat at 75 per minute
  var NS = "http://www.w3.org/2000/svg";
  var LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduced = false; }

  /* ---------- Conditions ---------- */
  // One source of truth: the heart vector. Each component is [centre ms, width ms, x, y, z] in mV,
  // with x = towards the patient's left, y = inferior, z = anterior. Every lead trace is the projection
  // of the summed vector on that lead's axis (a single idealised dipole), so lead polarity always matches the arrow.
  var P_WAVE = [[35, 14, .03, .12, .07], [65, 14, .10, .06, -.06]];           // RA (inferior, anterior) then LA (left, posterior)
  var VEC = {
    normal: P_WAVE.concat([
      [172, 6, -.15, .05, .25],      // septum, left to right: q in I, aVL, V6; r in V1
      [186, 8, .3, .4, .5],          // apex and anterior wall
      [200, 10, .9, .75, -.3],       // LV free wall dominates: leftward, inferior, posterior
      [227, 8, -.1, -.2, -.25],      // basal and posterior LV last: superior, posterior
      [435, 42, .25, .2, .15]        // T: concordant with the QRS
    ]),
    rbbb: P_WAVE.concat([
      [172, 6, -.15, .05, .25],      // septum still left to right (left bundle intact)
      [186, 8, .3, .4, .5],
      [200, 10, .85, .65, -.35],     // LV through its own Purkinje fibres
      [255, 17, -.45, .05, .35],     // late RV, cell to cell: terminal rightward, anterior vector
      [470, 42, .3, .2, -.15]        // secondary T, opposite the terminal QRS
    ]),
    lbbb: P_WAVE.concat([
      [178, 6, 0, 0, .12],           // RV free wall via the right bundle: small r in V1 at most
      [180, 10, .35, .1, -.05],      // septum right to left: no septal q in I, aVL, V6
      [210, 16, .7, .25, -.5],       // slow cell-to-cell LV activation, leftward and posterior
      [258, 17, .8, .1, -.6],        // lateral LV last: second hump of the notched R
      [350, 20, -.08, 0, .12],       // secondary ST shift, opposite the QRS
      [470, 42, -.3, -.05, .35]      // secondary T, discordant
    ])
  };
  var FRONTAL_AX = { I: 0, II: 60, III: 120, aVF: 90, aVL: -30, aVR: -150 };
  var HORIZ_AX = { V1: 115, V2: 94, V3: 75, V4: 60, V5: 30, V6: 0 }; // positive = anterior
  var CHEST_GAIN = 1.3; // chest electrodes sit closer to the heart, so they read larger
  function vectorAt(c, t) {
    var v = { x: 0, y: 0, z: 0 }, k = VEC[c];
    for (var i = 0; i < k.length; i++) { var d = (t - k[i][0]) / k[i][1], g = Math.exp(-0.5 * d * d); v.x += g * k[i][2]; v.y += g * k[i][3]; v.z += g * k[i][4]; }
    return v;
  }
  function project(v, L) {
    if (FRONTAL_AX[L] !== undefined) { var a = FRONTAL_AX[L] * Math.PI / 180; return v.x * Math.cos(a) + v.y * Math.sin(a); }
    var h = HORIZ_AX[L] * Math.PI / 180; return CHEST_GAIN * (v.x * Math.cos(h) + v.z * Math.sin(h));
  }

  var SHARED_START = [
    [0, 12, "The SA node fires. It is too small to show on the ECG, so the trace is still flat."],
    [12, 100, "The impulse spreads through the right atrium, then along Bachmann's bundle to the left atrium: the P wave. Its vector points down and to the left (about +60°), so P is upright in II, inverted in aVR and biphasic in V1."],
    [100, 145, "The AV node slows the impulse so the atria can finish contracting first. Too little tissue is active to show, so the trace is flat: the PR segment."]
  ];
  var REST = "The heart is at rest, waiting for the SA node to fire again.";

  var COND = {
    normal: {
      name: "Normal sinus",
      segs: [["P", 0, 100], ["PR", 100, 160], ["QRS", 160, 245], ["ST", 245, 350], ["T", 350, 520], ["Rest", 520, 800]],
      path: { sa: [0, 10], intern: [5, 45], bach: [5, 40], avn: [50, 75], his: [125, 20], rb: [145, 25], lb: [145, 10], laf: [155, 20], lpf: [155, 22], purkR: [170, 25], purkL: [177, 25] },
      region: { RA: [5, 70], LA: [25, 65], SEP: [160, 40], RV: [180, 45], LV: [180, 60] },
      sepDir: "lr",
      blocked: [],
      text: [
        [145, 160, "The impulse leaves the AV node and races down the His bundle into the right and left bundle branches."],
        [160, 180, "The septum depolarises first, from left to right, because the left bundle reaches it first. That small wavefront heads towards V1 (small r) and away from I, aVL and V6 (small septal q)."],
        [180, 215, "Purkinje fibres carry the impulse to the apex, then out through both free walls, endocardium to epicardium. The thick left ventricle outweighs the right, so the wavefront points left and down: tall R in II and V6, deep S in V1."],
        [215, 245, "The base of the left ventricle, high and at the back, depolarises last, so the wavefront swings up and backwards: a small s in II and V6. The narrow QRS lasts about 85 ms."],
        [245, 350, "Every ventricular cell is in its plateau phase at a similar voltage, so no current flows between areas. The ST segment is isoelectric."],
        [350, 520, "Repolarisation is the reverse charge change, but it also runs the reverse way: epicardial cells have shorter action potentials, so the epicardium recovers first. The two reversals cancel, so the T wave points the same way as the QRS in most leads."]
      ]
    },
    rbbb: {
      name: "RBBB",
      segs: [["P", 0, 100], ["PR", 100, 160], ["QRS", 160, 300], ["ST", 300, 380], ["T", 380, 560], ["Rest", 560, 800]],
      path: { sa: [0, 10], intern: [5, 45], bach: [5, 40], avn: [50, 75], his: [125, 20], lb: [145, 10], laf: [155, 20], lpf: [155, 22], purkL: [177, 25] },
      region: { RA: [5, 70], LA: [25, 65], SEP: [160, 45], RV: [205, 95], LV: [180, 60] },
      sepDir: "lr",
      blocked: ["rb", "purkR"],
      blockAt: "rb",
      sweep: { RV: [250, 260, 130, 200] },
      late: "0,169 254,152 244,200 242,260 250,322 236,334 0,420",
      text: [
        [145, 160, "The impulse races down the His bundle. The right bundle is blocked, so only the left bundle carries it on."],
        [160, 185, "The left bundle still activates the septum from left to right, so the QRS starts normally: small r in V1, small q in V6."],
        [185, 232, "The apex and left ventricle depolarise normally through the left bundle's Purkinje fibres. The wavefront points left: S wave in V1, R wave in I and V6."],
        [232, 300, "The right ventricle is reached late, cell to cell from the septum, which is slow. This late wavefront points right and forwards: the R' in V1 and the wide, slurred S in I and V6. QRS 120 ms or more."],
        [300, 380, "All ventricular cells are depolarised, so the ST segment sits near the baseline."],
        [380, 560, "The right ventricle repolarises late and out of order too, so T waves are often inverted in V1 to V3. This is a secondary change."]
      ]
    },
    lbbb: {
      name: "LBBB",
      segs: [["P", 0, 100], ["PR", 100, 160], ["QRS", 160, 300], ["ST", 300, 380], ["T", 380, 560], ["Rest", 560, 800]],
      path: { sa: [0, 10], intern: [5, 45], bach: [5, 40], avn: [50, 75], his: [125, 20], rb: [145, 22], purkR: [165, 25] },
      region: { RA: [5, 70], LA: [25, 65], SEP: [165, 60], RV: [175, 50], LV: [205, 95] },
      sepDir: "rl",
      blocked: ["lb", "laf", "lpf", "purkL"],
      blockAt: "lb",
      sweep: { LV: [290, 260, 435, 230] },
      late: "385,143 540,132 540,420 330,420 372,330",
      text: [
        [145, 160, "The impulse races down the His bundle. The left bundle is blocked, so only the right bundle carries it on."],
        [160, 200, "The septum is activated from the right side, so it depolarises right to left. The wavefront heads towards V6 and away from V1: no septal q in I, aVL, V5 or V6, and at most a tiny r in V1."],
        [200, 260, "Without the fast Purkinje network, the impulse creeps cell to cell from the septum through the left ventricle, which is slow. The wavefront points left and backwards, away from V1: deep, broad S in V1, broad R in V6."],
        [260, 300, "The lateral wall of the left ventricle depolarises last, giving the broad, notched R in I, aVL, V5 and V6. QRS 120 ms or more."],
        [300, 380, "Abnormal depolarisation means abnormal repolarisation. The ST segment shifts opposite to the main QRS: up in V1 to V3, down in I, aVL and V6."],
        [380, 560, "T waves point opposite to the main QRS (discordant): upright in V1, inverted in I, aVL, V5 and V6. This is the expected secondary pattern in LBBB."]
      ]
    }
  };

  function seg(c, name) { var s = COND[c].segs; for (var i = 0; i < s.length; i++) if (s[i][0] === name) return s[i]; return null; }

  /* ---------- Trace samples (1 ms) ---------- */
  var SAMPLES = {};
  Object.keys(VEC).forEach(function (c) {
    SAMPLES[c] = {};
    LEADS.forEach(function (L) {
      var arr = new Float32Array(CYCLE);
      for (var t = 0; t < CYCLE; t++) arr[t] = project(vectorAt(c, t), L);
      SAMPLES[c][L] = arr;
    });
  });
  // Fixed vertical scale per lead (same for every condition so comparisons are fair).
  var LEAD_RANGE = {};
  LEADS.forEach(function (L) {
    var hi = .6, lo = -.6;
    Object.keys(SAMPLES).forEach(function (c) { var a = SAMPLES[c][L]; for (var i = 0; i < a.length; i++) { if (a[i] > hi) hi = a[i]; if (a[i] < lo) lo = a[i]; } });
    LEAD_RANGE[L] = [lo - .15, hi + .15];
  });

  /* ---------- State ---------- */
  var state = { t: 0, cond: "normal", playing: !reduced, speed: 0.25, leads: ["II", "V1", "V6"] };
  if (reduced) state.t = 205;

  /* ---------- Heart SVG: flat four-chamber cut-through ---------- */
  var svg = document.getElementById("ecgcSvg");
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(n);
    return n;
  }
  svg.setAttribute("viewBox", "0 4 540 404");
  var INK = "var(--ecgc-ink)", GREY = "var(--ecgc-grey)", SOFT = "var(--ecgc-grey-soft)";

  var defs = el("defs", {});
  var dep = el("pattern", { id: "ecgcDep", width: 7, height: 7, patternUnits: "userSpaceOnUse" }, defs);
  el("rect", { width: 7, height: 7, fill: "var(--ecgc-blue)", "fill-opacity": .22 }, dep);
  el("circle", { cx: 3.5, cy: 3.5, r: 1.3, fill: "var(--ecgc-blue)" }, dep);
  // Light, sparse hatch for blocked or late-activated areas.
  var hatch = el("pattern", { id: "ecgcHatch", width: 9, height: 9, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  el("line", { x1: 0, y1: 0, x2: 0, y2: 9, stroke: "var(--ecgc-orange)", "stroke-width": 1.6 }, hatch);
  var mk = el("marker", { id: "ecgcHead", viewBox: "0 0 10 10", refX: 6, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--ecgc-magenta)" }, mk);

  // Four-chamber view: one smooth silhouette; chambers are cut from it (cavities drawn over the muscle in white).
  // AV groove: one slightly oblique line, y = 160 - 0.069 (x - 130). Crux at about (266, 151).
  var SIL = "M176,46 C140,50 118,92 122,140 L122,161 C128,222 170,290 236,330 C268,352 300,394 338,399 " +
    "C392,392 430,322 432,240 C434,192 430,162 426,140 C422,96 402,56 362,46 C332,39 298,42 270,47 C250,40 226,38 206,44 Z";
  var VENT = SIL;
  var REGIONS = {
    RA: { d: SIL, clip: "0,0 263,0 266,151 0,169" },
    LA: { d: SIL, clip: "263,0 540,0 540,131.7 266,151" },
    RV: { d: SIL, clip: "0,169 254,152 244,200 242,260 250,322 236,334 0,420" },
    SEP: { d: SIL, clip: "254,152 284,150 276,215 288,300 320,366 300,380 250,322 242,260 244,200" },
    LV: { d: SIL, clip: "284,150 540,131.7 540,420 0,420 236,334 250,322 300,380 320,366 288,300 276,215" }
  };
  var CAVITY = {
    RA: "M140,157 C128,120 134,74 172,58 L208,56 C234,58 252,72 257,92 L257,148 Z",
    LA: "M273,147 L273,72 C286,58 320,54 356,60 C392,68 410,100 412,137 Z",
    RV: "M136,165 C142,225 180,284 240,318 C238,270 240,200 256,155 Z",
    LV: "M282,152 C266,215 270,300 312,366 C326,382 346,378 362,356 C396,312 402,230 398,143 Z"
  };
  // Direction of the activation sweep in each region: [x1, y1, x2, y2]. Conditions may override.
  var SWEEP = {
    RA: [178, 46, 250, 158], LA: [270, 50, 422, 142],
    RV: [245, 300, 140, 170], LV: [325, 395, 428, 150],
    SEP: { lr: [285, 255, 242, 245], rl: [242, 245, 285, 255] }
  };
  var PATHS = {
    intern: "M182,50 C225,62 248,100 250,142",
    intern2: "M174,54 C135,80 130,140 160,152 L244,146",
    bach: "M186,48 C225,36 290,38 360,54",
    avn: "M246,143 L256,149",
    his: "M256,149 L262,160 L267,176",
    rb: "M267,176 C254,215 249,275 254,315",
    lb: "M267,176 L274,190",
    laf: "M274,190 C305,198 350,196 392,178",
    lpf: "M274,190 C278,240 292,300 314,354",
    purkR: "M254,316 C230,312 205,300 190,282 C170,258 152,215 148,172",
    purkL: "M314,356 C326,380 348,376 364,354 C394,312 400,240 392,160"
  };
  var ATRIAL = { intern: 1, intern2: 1, bach: 1, avn: 1 };

  // SVC stub (drawn first so the right atrium sits on it).
  var gVes = el("g", { "aria-hidden": "true" });
  el("path", { d: "M178,58 L178,14 L206,14 L206,58", fill: SOFT, stroke: GREY, "stroke-width": 1.6 }, gVes);
  el("text", { x: 172, y: 26, "text-anchor": "end", "font-size": 12, "font-family": "var(--font-sans)", fill: INK }, gVes).textContent = "SVC";

  var gRegions = el("g", { "aria-hidden": "true" });
  var regionNodes = {};
  Object.keys(REGIONS).forEach(function (r) {
    var R = REGIONS[r], cp = null;
    if (R.clip) { var c = el("clipPath", { id: "ecgcC" + r }, defs); el("polygon", { points: R.clip }, c); cp = "url(#ecgcC" + r + ")"; }
    var base = el("path", { d: R.d, fill: SOFT, stroke: "none" }, gRegions);
    if (cp) base.setAttribute("clip-path", cp);
    var grad = el("linearGradient", { id: "ecgcG" + r, gradientUnits: "userSpaceOnUse" }, defs);
    el("stop", { offset: 0, "stop-color": "#fff" }, grad);
    var s1 = el("stop", { offset: 0, "stop-color": "#fff" }, grad);
    var s2 = el("stop", { offset: 0, "stop-color": "#000" }, grad);
    el("stop", { offset: 1, "stop-color": "#000" }, grad);
    var mask = el("mask", { id: "ecgcM" + r, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 540, height: 420 }, defs);
    el("rect", { x: 0, y: 0, width: 540, height: 420, fill: "url(#ecgcG" + r + ")" }, mask);
    var wrap = el("g", cp ? { "clip-path": cp } : {}, gRegions);
    var over = el("path", { d: R.d, fill: "url(#ecgcDep)", mask: "url(#ecgcM" + r + ")", opacity: 0 }, wrap);
    regionNodes[r] = { grad: grad, s1: s1, s2: s2, over: over };
  });
  // Subtle late-activated zone (hatched), set per condition.
  var lateClip = el("clipPath", { id: "ecgcLate" }, defs);
  var latePoly = el("polygon", { points: "0,0 0,0 0,0" }, lateClip);
  var lateZone = el("path", { d: VENT, fill: "url(#ecgcHatch)", "clip-path": "url(#ecgcLate)", opacity: 0 }, gRegions);
  // One continuous outline.
  el("path", { d: SIL, fill: "none", stroke: GREY, "stroke-width": 1.8 }, gRegions);
  // Cavities in white: thin atrial and RV walls, a thick LV wall, muscular septa meeting at the crux.
  Object.keys(CAVITY).forEach(function (k) {
    el("path", { d: CAVITY[k], fill: "#fff", stroke: GREY, "stroke-width": 1.4 }, gRegions);
  });
  // SVC opening into the right atrium.
  el("rect", { x: 179, y: 14, width: 26, height: 46, fill: "#fff" }, gRegions);
  el("path", { d: "M178,14 L178,57 M206,14 L206,57", stroke: GREY, "stroke-width": 1.6 }, gRegions);
  // Faint coronary sinus opening, the landmark for the AV node.
  el("ellipse", { cx: 234, cy: 140, rx: 7, ry: 4, fill: "#fff", stroke: GREY, "stroke-width": 1, "stroke-dasharray": "2 2" }, gRegions);

  // Fibrous AV ring along the groove: an electrical insulator; the only way through is the AV node and His bundle.
  el("path", { d: "M122,160.6 L426,139.6", stroke: "#6B7075", "stroke-width": 3.5, "stroke-linecap": "round" }, gRegions);
  // Tricuspid and mitral valves as simple flaps on the groove.
  var VALVES = [
    "M165,158 Q169,182 184,190 Q177,174 178,157 Z", "M235,153 Q231,177 216,186 Q223,170 222,154 Z",           // tricuspid
    "M300,148 Q304,174 320,182 Q312,166 313,147 Z", "M385,142 Q381,168 365,176 Q373,160 371,143 Z"            // mitral
  ];
  VALVES.forEach(function (d) { el("path", { d: d, fill: "#fff", stroke: "#6B7075", "stroke-width": 1.5, "stroke-linejoin": "round" }, gRegions); });

  [["RA", 198, 108], ["LA", 345, 104], ["RV", 195, 235], ["LV", 345, 322]].forEach(function (c) {
    el("text", { x: c[1], y: c[2], "text-anchor": "middle", "font-size": 18, "font-weight": 700, fill: INK, "font-family": "var(--font-sans)" }, gRegions).textContent = c[0];
  });

  var gBlock = el("g", { "aria-hidden": "true" });
  var gPaths = el("g", { "aria-hidden": "true" });
  var pathNodes = {};
  Object.keys(PATHS).forEach(function (p) {
    var w = p === "avn" ? 7 : 3.2;
    var base = el("path", { d: PATHS[p], fill: "none", stroke: GREY, "stroke-width": w, "stroke-linecap": "round" }, gPaths);
    var act = el("path", { d: PATHS[p], fill: "none", stroke: "var(--ecgc-blue)", "stroke-width": w + 1, "stroke-linecap": "round", opacity: 0 }, gPaths);
    var len = act.getTotalLength();
    act.setAttribute("stroke-dasharray", len + " " + len);
    pathNodes[p] = { base: base, act: act, len: len };
  });
  var saNode = el("ellipse", { cx: 177, cy: 50, rx: 8, ry: 5.5, fill: GREY, stroke: INK, "stroke-width": 1 }, gPaths);
  var gHeads = el("g", { "aria-hidden": "true" });
  var heads = {};
  Object.keys(PATHS).forEach(function (p) {
    var g = el("g", { opacity: 0 }, gHeads);
    if (!reduced) el("circle", { r: 10, fill: "var(--ecgc-blue)", "fill-opacity": .25 }, g);
    el("circle", { r: 5, fill: "var(--ecgc-blue)", stroke: "#fff", "stroke-width": 1.5 }, g);
    heads[p] = g;
  });

  // Fixed label columns with thin leader lines: [text, label x, label y, target x, target y, anchor].
  var LABELS = [
    ["SA node", 100, 42, 176, 50, "end"], ["Internodal paths", 100, 96, 141, 108, "end"], ["Coronary sinus", 100, 132, 230, 140, "end"],
    ["AV node", 100, 166, 250, 146, "end"], ["Tricuspid valve", 100, 204, 176, 180, "end"], ["Right bundle", 100, 270, 253, 260, "end"],
    ["Purkinje fibres", 100, 320, 190, 282, "end"],
    ["Bachmann's bundle", 430, 34, 280, 40, "start"], ["Interatrial septum", 430, 76, 265, 90, "start"], ["Mitral valve", 430, 120, 372, 158, "start"],
    ["Fibrous AV ring", 430, 150, 418, 140, "start"], ["His bundle", 430, 178, 263, 165, "start"], ["Left bundle", 430, 206, 271, 184, "start"],
    ["Anterior fascicle", 430, 234, 341, 192, "start"], ["Posterior fascicle", 430, 300, 294, 296, "start"], ["Septum", 430, 360, 261, 280, "start"]
  ];
  var gLab = el("g", { "class": "ecgc-labels", "aria-hidden": "true" });
  LABELS.forEach(function (l) {
    var lx = l[5] === "end" ? l[1] + 4 : l[1] - 4;
    el("line", { x1: lx, y1: l[2] - 4, x2: l[3], y2: l[4], stroke: INK, "stroke-width": .7, "stroke-opacity": .55 }, gLab);
    el("circle", { cx: l[3], cy: l[4], r: 1.7, fill: INK }, gLab);
    el("text", { x: l[1], y: l[2], "text-anchor": l[5], "font-size": 12.5, "font-family": "var(--font-sans)", fill: INK }, gLab).textContent = l[0];
  });
  var blockText = el("text", { "font-size": 12.5, "font-weight": 700, "font-family": "var(--font-sans)", fill: INK, stroke: "#fff", "stroke-width": 4, "paint-order": "stroke", opacity: 0 }, svg);
  var gMarks = el("g", { "aria-hidden": "true" });

  var gArrow = el("g", { "aria-hidden": "true" });
  var arrowLine = el("line", { stroke: "var(--ecgc-magenta)", "stroke-width": 7, "stroke-linecap": "round", "marker-end": "url(#ecgcHead)" }, gArrow);
  var arrowTail = el("circle", { r: 4, fill: "var(--ecgc-magenta)" }, gArrow);
  var arrowText = el("text", { "font-size": 13, "font-weight": 700, "font-family": "var(--font-sans)", fill: "var(--ecgc-magenta)", stroke: "#fff", "stroke-width": 4, "paint-order": "stroke" }, gArrow);

  /* ---------- Vector wheels ---------- */
  var SLOTS = ["A", "B", "C"];
  var FRONTAL = FRONTAL_AX;
  var HORIZ = HORIZ_AX; // approximate; positive = anterior (drawn downwards)
  function shape(s, g, size) {
    var k = size || 1;
    if (s === "A") el("circle", { r: 6 * k, fill: "#fff", stroke: INK, "stroke-width": 2 }, g);
    else if (s === "B") el("rect", { x: -5.5 * k, y: -5.5 * k, width: 11 * k, height: 11 * k, fill: "#fff", stroke: INK, "stroke-width": 2 }, g);
    else el("path", { d: "M0," + (-7 * k) + " L" + (6.5 * k) + "," + (5.5 * k) + " L" + (-6.5 * k) + "," + (5.5 * k) + " Z", fill: "#fff", stroke: INK, "stroke-width": 2, "stroke-linejoin": "round" }, g);
  }
  function makeWheel(svgEl, angles) {
    var W = { svg: svgEl, angles: angles, axes: {}, labels: {}, marks: {} };
    function add(name, attrs, parent) { var n = document.createElementNS(NS, name); for (var k in attrs) n.setAttribute(k, attrs[k]); (parent || svgEl).appendChild(n); return n; }
    add("circle", { cx: 0, cy: 0, r: 44, fill: "none", stroke: GREY, "stroke-width": 1 });
    Object.keys(angles).forEach(function (L) {
      var a = angles[L] * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      W.axes[L] = add("line", { x1: 0, y1: 0, x2: (44 * ca).toFixed(1), y2: (44 * sa).toFixed(1), stroke: GREY, "stroke-width": 1 });
      var t = add("text", { x: (57 * ca).toFixed(1), y: (57 * sa + 3.5).toFixed(1), "text-anchor": "middle", "font-size": 10, "font-family": "var(--font-sans)", fill: "var(--muted)" });
      t.textContent = L;
      W.labels[L] = t;
    });
    W.vec = add("line", { x1: 0, y1: 0, x2: 0, y2: 0, stroke: "var(--ecgc-magenta)", "stroke-width": 4, "stroke-linecap": "round", "marker-end": "url(#ecgcHead)" });
    W.markG = add("g", {});
    return W;
  }
  var wheelF = makeWheel(document.getElementById("ecgcWheelF"), FRONTAL);
  var wheelH = makeWheel(document.getElementById("ecgcWheelH"), HORIZ);
  var wheelMarks = SLOTS.map(function (s) {
    var g = document.createElementNS(NS, "g");
    g.setAttribute("id", "ecgcWheelMark-" + s);
    g.setAttribute("class", "ecgc-wheelmark");
    shape(s, g, 0.95);
    var tx = document.createElementNS(NS, "text");
    tx.setAttribute("y", 3.5); tx.setAttribute("text-anchor", "middle"); tx.setAttribute("font-size", 8.5); tx.setAttribute("font-weight", 700);
    tx.setAttribute("font-family", "var(--font-sans)"); tx.setAttribute("fill", "#111"); tx.textContent = s;
    g.appendChild(tx);
    return g;
  });

  /* ---------- Lead panels ---------- */
  var leadsBox = document.getElementById("ecgcLeads");
  var SHAPE_ICON = {
    A: '<circle cx="9" cy="9" r="7" fill="#fff" stroke="currentColor" stroke-width="2"/>',
    B: '<rect x="2.5" y="2.5" width="13" height="13" fill="#fff" stroke="currentColor" stroke-width="2"/>',
    C: '<path d="M9,1.5 L16.5,15.5 L1.5,15.5 Z" fill="#fff" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
  };
  var panels = SLOTS.map(function (s, i) {
    var wrap = document.createElement("section");
    wrap.className = "ecgc-lead";
    wrap.setAttribute("aria-label", "Trace " + s);
    var opts = LEADS.map(function (L) { return '<option value="' + L + '">' + L + "</option>"; }).join("");
    wrap.innerHTML = '<div class="ecgc-lead-head"><svg viewBox="0 0 18 18" aria-hidden="true">' + SHAPE_ICON[s] + "</svg>" +
      "<span>" + s + '</span><label>Lead <select data-slot="' + i + '" aria-label="Lead shown in trace ' + s + '">' + opts + "</select></label>" +
      '<span class="ecgc-lead-note">' + s + " on the vector wheels</span></div>" +
      '<canvas role="img"></canvas>';
    leadsBox.appendChild(wrap);
    var sel = wrap.querySelector("select");
    sel.value = state.leads[i];
    sel.addEventListener("change", function () { state.leads[i] = sel.value; layoutElectrodes(); render(); });
    return { wrap: wrap, sel: sel, cv: wrap.querySelector("canvas") };
  });

  function layoutElectrodes() {
    [wheelF, wheelH].forEach(function (W) {
      Object.keys(W.angles).forEach(function (L) {
        W.axes[L].setAttribute("stroke", GREY); W.axes[L].setAttribute("stroke-width", 1);
        W.labels[L].setAttribute("fill", "var(--muted)"); W.labels[L].setAttribute("font-weight", 400);
      });
    });
    wheelMarks.forEach(function (g, i) {
      var L = state.leads[i], W = FRONTAL[L] !== undefined ? wheelF : wheelH, a = W.angles[L] * Math.PI / 180;
      W.axes[L].setAttribute("stroke", INK); W.axes[L].setAttribute("stroke-width", 2);
      W.labels[L].setAttribute("fill", INK); W.labels[L].setAttribute("font-weight", 700);
      // Two slots on the same lead: nudge so both shapes show.
      var dup = 0; for (var j = 0; j < i; j++) if (state.leads[j] === L) dup++;
      var r = 44 - dup * 14;
      g.setAttribute("transform", "translate(" + (r * Math.cos(a)).toFixed(1) + "," + (r * Math.sin(a)).toFixed(1) + ")");
      g.setAttribute("data-lead", L);
      W.markG.appendChild(g);
      panels[i].cv.setAttribute("aria-label", "Lead " + L + " trace, " + COND[state.cond].name);
    });
    document.getElementById("ecgcWheels").setAttribute("aria-label", "Vector wheels. Selected leads: " +
      SLOTS.map(function (s, i) { return s + " " + state.leads[i]; }).join(", "));
  }

  /* ---------- Timeline ---------- */
  var segsBox = document.getElementById("ecgcSegs");
  var scrub = document.getElementById("ecgcScrub");
  var thumb = document.createElement("div");
  thumb.className = "ecgc-scrub-thumb";
  scrub.parentNode.appendChild(thumb);
  var segNodes = [];
  function buildSegs() {
    segsBox.innerHTML = "";
    segNodes = COND[state.cond].segs.map(function (s) {
      var d = document.createElement("div");
      d.className = "ecgc-seg";
      d.style.flex = String(s[2] - s[1]);
      d.textContent = s[0];
      segsBox.appendChild(d);
      return d;
    });
    var q = seg(state.cond, "QRS");
    var qrsEl = document.getElementById("ecgcQrs");
    qrsEl.textContent = "QRS " + (q[2] - q[1]) + " ms";
    qrsEl.setAttribute("data-qrs", q[2] - q[1]);
  }

  /* ---------- Rendering ---------- */
  function prog(win, t) { if (!win) return -1; return Math.max(0, Math.min(1, (t - win[0]) / win[1])); }
  function lerp(a, b, f) { return a + (b - a) * f; }
  function renderHeart(t) {
    var c = COND[state.cond], qrs = seg(state.cond, "QRS"), tw = seg(state.cond, "T");
    var ventFade = t < tw[1] ? 1 : Math.max(0, 1 - (t - tw[1]) / (tw[2] - tw[1]));
    var atrFade = t < 150 ? 1 : Math.max(0, 1 - (t - 150) / (qrs[2] - 150));
    Object.keys(regionNodes).forEach(function (r) {
      var n = regionNodes[r], f = prog(c.region[r], t);
      var sw = (c.sweep && c.sweep[r]) || (r === "SEP" ? SWEEP.SEP[c.sepDir] : SWEEP[r]);
      n.grad.setAttribute("x1", sw[0]); n.grad.setAttribute("y1", sw[1]); n.grad.setAttribute("x2", sw[2]); n.grad.setAttribute("y2", sw[3]);
      n.s1.setAttribute("offset", f); n.s2.setAttribute("offset", Math.min(1, f + 0.05));
      var fade = (r === "RA" || r === "LA") ? atrFade : ventFade;
      n.over.setAttribute("opacity", f > 0 ? fade : 0);
    });
    Object.keys(pathNodes).forEach(function (p) {
      var n = pathNodes[p], f = prog(c.path[p], t), isBlock = c.blockAt === p, unused = !c.path[p] && !isBlock;
      var fade = ATRIAL[p] ? (p === "avn" ? ventFade : atrFade) : ventFade;
      n.act.setAttribute("opacity", f > 0 ? fade : 0);
      n.act.setAttribute("stroke-dashoffset", (n.len * (1 - Math.max(0, f))).toFixed(1));
      n.base.setAttribute("stroke", isBlock ? "var(--ecgc-orange)" : GREY);
      n.base.setAttribute("stroke-dasharray", isBlock || unused ? "5 4" : "none");
      var h = heads[p];
      if (f > 0 && f < 1) {
        var pt = n.act.getPointAtLength(n.len * f);
        h.setAttribute("transform", "translate(" + pt.x.toFixed(1) + "," + pt.y.toFixed(1) + ")");
        h.setAttribute("opacity", 1);
      } else h.setAttribute("opacity", 0);
    });
    saNode.setAttribute("fill", t >= 0 && t < 14 ? "var(--ecgc-blue)" : GREY);

    // One live vector: frontal component on the heart and frontal wheel, horizontal component on the horizontal wheel.
    var v = vectorAt(state.cond, t), isT = t >= tw[1] && t <= tw[2], isST = t >= qrs[2] && t < tw[1];
    var o = t < 100 ? { x: 255, y: 100 } : { x: 312, y: 262 };
    var fm = Math.hypot(v.x, v.y), hm = Math.hypot(v.x, v.z), rad = Math.atan2(v.y, v.x);
    var dashed = isT || isST;
    [[wheelF, v.x, v.y, fm], [wheelH, v.x, v.z, hm]].forEach(function (w) {
      var on = w[3] >= 0.03, L = on ? Math.min(42, 8 + 28 * w[3]) / w[3] : 0;
      w[0].vec.setAttribute("x2", (w[1] * L).toFixed(1)); w[0].vec.setAttribute("y2", (w[2] * L).toFixed(1));
      w[0].vec.setAttribute("opacity", on ? 1 : 0);
      w[0].vec.setAttribute("stroke-dasharray", dashed ? "5 4" : "none");
    });
    var show = fm >= 0.03;
    gArrow.setAttribute("opacity", show ? 1 : 0);
    if (show) {
      var len = 22 + 60 * Math.min(fm, 1.3);
      var ex = o.x + len * Math.cos(rad), ey = o.y + len * Math.sin(rad);
      arrowLine.setAttribute("x1", o.x); arrowLine.setAttribute("y1", o.y);
      arrowLine.setAttribute("x2", ex.toFixed(1)); arrowLine.setAttribute("y2", ey.toFixed(1));
      arrowLine.setAttribute("stroke-dasharray", dashed ? "10 7" : "none");
      arrowTail.setAttribute("cx", o.x); arrowTail.setAttribute("cy", o.y);
      arrowText.setAttribute("x", o.x - 18 * Math.cos(rad));
      arrowText.setAttribute("y", o.y - 18 * Math.sin(rad) + 5);
      arrowText.setAttribute("text-anchor", Math.cos(rad) >= 0.3 ? "end" : Math.cos(rad) <= -0.3 ? "start" : "middle");
      arrowText.textContent = isT ? "T vector (dashed)" : isST ? "ST vector (dashed)" : "Wavefront";
    }
  }

  function renderBlock() {
    var c = COND[state.cond];
    while (gBlock.firstChild) gBlock.removeChild(gBlock.firstChild);
    while (gMarks.firstChild) gMarks.removeChild(gMarks.firstChild);
    lateZone.setAttribute("opacity", c.late ? .75 : 0);
    if (c.late) latePoly.setAttribute("points", c.late);
    if (!c.blockAt) { blockText.setAttribute("opacity", 0); return; }
    el("path", { d: PATHS[c.blockAt], fill: "none", stroke: "url(#ecgcHatch)", "stroke-width": 10, "stroke-linecap": "round", opacity: .8 }, gBlock);
    var n = pathNodes[c.blockAt], pt = n.act.getPointAtLength(n.len * (c.blockAt === "rb" ? 0.3 : 0.55));
    el("path", { d: "M-7,-7 L7,7 M7,-7 L-7,7", stroke: INK, "stroke-width": 3.5, "stroke-linecap": "round", transform: "translate(" + pt.x + "," + pt.y + ")" }, gMarks);
    var isR = c.blockAt === "rb";
    blockText.setAttribute("x", isR ? pt.x - 14 : pt.x + 22);
    blockText.setAttribute("y", isR ? pt.y + 4 : pt.y + 30);
    blockText.setAttribute("text-anchor", isR ? "end" : "start");
    blockText.innerHTML = "";
    var t1 = document.createElementNS(NS, "tspan"); t1.textContent = isR ? "Right bundle blocked" : "Left bundle blocked";
    var t2 = document.createElementNS(NS, "tspan"); t2.setAttribute("x", blockText.getAttribute("x")); t2.setAttribute("dy", 15);
    t2.setAttribute("font-weight", 400); t2.textContent = isR ? "RV activated late" : "LV activated late";
    blockText.appendChild(t1); blockText.appendChild(t2);
    blockText.setAttribute("opacity", 1);
  }

  function renderPanel(i, t) {
    var cv = panels[i].cv, dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var L = state.leads[i], rg = LEAD_RANGE[L], data = SAMPLES[state.cond][L];
    var left = 34, pw = w - left - 4;
    function X(ms) { return left + ms / CYCLE * pw; }
    function Y(mv) { return 4 + (rg[1] - mv) / (rg[1] - rg[0]) * (h - 8); }
    // Grid: 40 ms and 200 ms verticals, 0.5 mV horizontals.
    ctx.lineWidth = 1;
    for (var ms = 0; ms <= CYCLE; ms += 40) {
      ctx.strokeStyle = ms % 200 === 0 ? "#C9C5BE" : "#ECE9E4";
      ctx.beginPath(); ctx.moveTo(X(ms) + .5, 0); ctx.lineTo(X(ms) + .5, h); ctx.stroke();
    }
    for (var mv = Math.ceil(rg[0] * 2) / 2; mv <= rg[1]; mv += .5) {
      ctx.strokeStyle = mv === 0 ? "#B9B5AE" : "#DDD9D2";
      ctx.beginPath(); ctx.moveTo(left, Math.round(Y(mv)) + .5); ctx.lineTo(w, Math.round(Y(mv)) + .5); ctx.stroke();
    }
    // 1 mV calibration mark.
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(4, Y(0)); ctx.lineTo(10, Y(0)); ctx.lineTo(10, Y(1)); ctx.lineTo(18, Y(1)); ctx.lineTo(18, Y(0)); ctx.lineTo(24, Y(0)); ctx.stroke();
    ctx.fillStyle = "#111"; ctx.font = "11px 'Source Sans 3', sans-serif";
    ctx.fillText("1 mV", 2, Math.max(11, Y(1) - 3));
    // Trace: drawn so far in black, still to come in grey.
    var cut = Math.max(0, Math.min(CYCLE - 1, Math.floor(t)));
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#A3A8AE"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var k = cut; k < CYCLE; k++) { if (k === cut) ctx.moveTo(X(k), Y(data[k])); else ctx.lineTo(X(k), Y(data[k])); }
    ctx.stroke();
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (k = 0; k <= cut; k++) { if (k === 0) ctx.moveTo(X(k), Y(data[k])); else ctx.lineTo(X(k), Y(data[k])); }
    ctx.stroke();
    // Cursor.
    ctx.strokeStyle = "#005A9E"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(t), 0); ctx.lineTo(X(t), h); ctx.stroke();
    ctx.fillStyle = "#005A9E";
    ctx.beginPath(); ctx.arc(X(t), Y(data[cut]), 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111"; ctx.font = "700 13px 'Source Sans 3', sans-serif";
    ctx.fillText(L, w - 30, 14);
  }

  var lastSentence = "";
  function sentenceAt(t) {
    var lists = [SHARED_START, COND[state.cond].text];
    for (var j = 0; j < lists.length; j++) for (var i = 0; i < lists[j].length; i++) { var s = lists[j][i]; if (t >= s[0] && t < s[1]) return s[2]; }
    return REST;
  }

  function render() {
    var t = state.t;
    renderHeart(t);
    for (var i = 0; i < panels.length; i++) renderPanel(i, t);
    document.getElementById("ecgcMs").textContent = Math.round(t);
    scrub.value = Math.round(t);
    scrub.setAttribute("aria-valuetext", Math.round(t) + " ms after the SA node fires");
    thumb.style.left = (t / CYCLE * 100) + "%";
    var segs = COND[state.cond].segs;
    for (var j = 0; j < segs.length; j++) segNodes[j].classList.toggle("is-now", t >= segs[j][1] && t < segs[j][2]);
    var s = sentenceAt(t);
    if (s !== lastSentence) { document.getElementById("ecgcSentence").textContent = s; lastSentence = s; }
  }

  /* ---------- Clock and controls ---------- */
  var playBtn = document.getElementById("ecgcPlay");
  function setPlaying(p) {
    state.playing = p;
    playBtn.textContent = p ? "Pause" : "Play";
    playBtn.setAttribute("aria-pressed", p ? "false" : "true");
    playBtn.setAttribute("aria-label", p ? "Pause" : "Play");
  }
  var last = null;
  function tick(now) {
    if (last === null) last = now;
    var dt = Math.min(100, now - last); last = now;
    if (state.playing) { state.t = (state.t + dt * state.speed) % CYCLE; render(); }
    requestAnimationFrame(tick);
  }
  playBtn.addEventListener("click", function () { setPlaying(!state.playing); });
  document.getElementById("ecgcReplay").addEventListener("click", function () { state.t = 0; setPlaying(true); render(); });
  document.getElementById("ecgcSpeed").addEventListener("change", function (e) { state.speed = parseFloat(e.target.value) || 0.25; });
  scrub.addEventListener("input", function () { setPlaying(false); state.t = Math.max(0, Math.min(CYCLE - 1, +scrub.value)); render(); });

  var condBtns = Array.prototype.slice.call(document.querySelectorAll(".ecgc-cond-btn"));
  function setCondition(c) {
    if (!COND[c]) return;
    state.cond = c;
    condBtns.forEach(function (b) { var on = b.getAttribute("data-cond") === c; b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    buildSegs(); renderBlock(); layoutElectrodes(); lastSentence = ""; render();
  }
  condBtns.forEach(function (b, i) {
    b.addEventListener("click", function () { setCondition(b.getAttribute("data-cond")); });
    b.addEventListener("keydown", function (e) {
      var d = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1 : (e.key === "ArrowLeft" || e.key === "ArrowUp") ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var nb = condBtns[(i + d + condBtns.length) % condBtns.length];
      setCondition(nb.getAttribute("data-cond")); nb.focus();
    });
  });
  window.addEventListener("resize", render);

  setPlaying(state.playing);
  setCondition("normal");
  requestAnimationFrame(tick);

  // Small hook for automated checks.
  window.ECGConduction = {
    state: state,
    setTime: function (t) { setPlaying(false); state.t = Math.max(0, Math.min(CYCLE - 1, t)); render(); },
    setCondition: setCondition,
    vectorAt: vectorAt,
    sample: function (c, L, t) { return SAMPLES[c][L][t]; },
    axes: { frontal: FRONTAL_AX, horizontal: HORIZ_AX, chestGain: CHEST_GAIN },
    segs: function (c) { return COND[c].segs; },
    qrsWidth: function () { var q = seg(state.cond, "QRS"); return q[2] - q[1]; }
  };
})();
