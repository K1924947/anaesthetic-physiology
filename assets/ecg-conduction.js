/* Why the ECG looks like that: conduction teaching page.
   One master clock (state.t, ms after the SA node fires) drives everything.
   One source of truth for the ECG: a smooth, idealised heart vector per condition; every lead trace is that vector
   projected on the lead axis, so traces and arrow always agree. An activation-time map over the muscle, re-timed onto
   the vector's timeline, drives the picture only (blue dots, orange chevrons, bump-to-heart links, story moments). */
(function () {
  "use strict";

  var CYCLE = 800; // one beat at 75 per minute
  var NS = "http://www.w3.org/2000/svg";
  var LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduced = false; }

  var FRONTAL_AX = { I: 0, II: 60, III: 120, aVF: 90, aVL: -30, aVR: -150 };
  var HORIZ_AX = { V1: 115, V2: 94, V3: 75, V4: 60, V5: 30, V6: 0 }; // positive = anterior
  var CHEST_GAIN = 1.3; // chest electrodes sit closer to the heart, so they read larger
  function project(v, L) {
    if (FRONTAL_AX[L] !== undefined) { var a = FRONTAL_AX[L] * Math.PI / 180; return v.x * Math.cos(a) + v.y * Math.sin(a); }
    var h = HORIZ_AX[L] * Math.PI / 180; return CHEST_GAIN * (v.x * Math.cos(h) + v.z * Math.sin(h));
  }
  // Atria are not mapped: the P wave is two idealised components, right atrium then left atrium.
  var P_WAVE = [[35, 14, .04, .156, .09], [65, 14, .13, .078, -.078]]; // II peak about 0.17 mV
  // The heart vector. Each component is [centre ms, width ms, x, y, z] in mV (x = patient's left, y = inferior,
  // z = anterior), then the muscle region that makes it and whether it is reached slowly, cell to cell (1) or by the fast route (0).
  var VEC = {
    normal: [
      [172, 6, -.15, .05, .17, "SEP", 0],   // septum, left to right: q in I, aVL, V6; small r in V1
      [186, 8, .3, .4, .38, "LVA", 0],      // apex and anterior wall
      [200, 10, .9, .75, -.3, "LVW", 0],    // LV free wall dominates: leftward, inferior, posterior
      [227, 8, -.1, -.2, -.25, "LVB", 0],   // base last: superior, posterior
      [435, 42, .25, .2, .15]                // T: concordant with the QRS
    ],
    rbbb: [
      [172, 6, -.15, .05, .17, "SEP", 0],   // septum still left to right (left bundle intact)
      [186, 8, .3, .4, .38, "LVA", 0],
      [200, 10, .85, .65, -.35, "LVW", 0],  // LV through its own Purkinje fibres
      [255, 15, -.45, .05, .4, "RV", 1],    // late RV, cell to cell: terminal rightward, anterior vector
      [460, 42, .3, .2, -.15]                // secondary T, opposite the terminal QRS
    ],
    lbbb: [
      [173, 6, 0, 0, .12, "RV", 0],         // RV via the right bundle: small r in V1 at most
      [198, 13, .6, .15, -.25, "SEP", 1],   // septum right to left, cell to cell: no septal q; first hump of the R
      [230, 16, .3, .2, -.5, "LVA", 1],   // slow spread through the apex and anterior LV
      [262, 15, .85, .05, -.55, "LVW", 1],  // lateral LV last: second hump of the notched R
      [340, 20, -.08, 0, .12],               // secondary ST shift, opposite the QRS
      [470, 42, -.3, -.05, .35]              // secondary T, discordant
    ]
  };

  // Speeds from Klabunde: bundle branches about 2 m/s, Purkinje about 4 m/s, ventricular muscle about 0.3 to 0.5 m/s.
  var MM_PER_UNIT = 0.33;                 // drawing scale: the heart is about 12 cm long
  var V_BUNDLE = 2 / MM_PER_UNIT, V_PURK = 4 / MM_PER_UNIT, V_MYO = 0.5 / MM_PER_UNIT; // drawing units per ms
  var HIS_START = 128;                    // after the AV nodal delay; the first muscle is reached at 160 ms (PR 160 ms)

  var SHARED_START = [
    [0, 12, "The SA node fires. It is too small to show on the ECG, so the trace is still flat."],
    [12, 100, "The impulse spreads through the right atrium, then along Bachmann's bundle to the left atrium: the P wave. Its vector points down and to the left (about +60\u00b0), so P is upright in II, inverted in aVR and biphasic in V1."],
    [100, "his", "The AV node slows the impulse so the atria can finish contracting first. Too little tissue is active to show, so the trace is flat: the PR segment."]
  ];
  var REST = "The heart is at rest, waiting for the SA node to fire again.";

  var COND = {
    normal: {
      name: "Normal sinus", fast: ["his", "rb", "mod", "purkR", "purkR2", "lb", "laf", "lpf", "purkL", "purkLA"],
      qrs: [160, 245], st: [245, 350, 520], ev: [180, 215],
      text: [
        ["his", "qon", "The impulse runs down the His bundle into both bundle branches: the fast highway."],
        ["qon", "q1", "The left bundle reaches the septum first, so the septum depolarises from left to right. That small wavefront heads towards V1 (small r) and away from I, aVL and V6 (small septal q)."],
        ["q1", "q2", "Purkinje fibres carry the impulse to the apex, then out through both walls, endocardium to epicardium. The thick left ventricle outweighs the right, so the wavefront points left and down: tall R in II and V6, deep S in V1."],
        ["q2", "qend", "The base of the ventricles, high up, is reached last, so the wavefront swings upwards. Because the fast route reaches almost everywhere at once, the QRS stays narrow."],
        ["qend", "tS", "Every ventricular cell is in its plateau phase at a similar voltage, so no current flows between areas. The ST segment is isoelectric."],
        ["tS", "tE", "Repolarisation is the reverse charge change, but it also runs the reverse way: epicardial cells have shorter action potentials, so the epicardium recovers first. The two reversals cancel, so the T wave points the same way as the QRS in most leads."]
      ]
    },
    rbbb: {
      name: "RBBB", fast: ["his", "lb", "laf", "lpf", "purkL", "purkLA"], blockAt: "rb", blocked: ["rb", "mod", "purkR", "purkR2"],
      qrs: [160, 290], st: [290, 370, 550], ev: [185, 232],
      text: [
        ["his", "qon", "The impulse runs down the His bundle. The right bundle is blocked, so only the left bundle carries it on."],
        ["qon", "q1", "The left bundle still activates the septum from left to right, so the QRS starts normally: small r in V1, small q in V6."],
        ["q1", "q2", "The left ventricle depolarises normally through its own Purkinje fibres. The wavefront points left: S wave in V1, R wave in I and V6."],
        ["q2", "qend", "The right ventricle has no fast route, so it is reached late, cell to cell from the septum. That slow wavefront points right and forwards: the R' in V1 and the wide, slurred S in I and V6. QRS 120 ms or more."],
        ["qend", "tS", "All ventricular cells are depolarised, so the ST segment sits near the baseline."],
        ["tS", "tE", "The right ventricle repolarises late and out of order too, so T waves are often inverted in V1 to V3. This is a secondary change."]
      ]
    },
    lbbb: {
      name: "LBBB", fast: ["his", "rb", "mod", "purkR", "purkR2"], blockAt: "lb", blocked: ["lb", "laf", "lpf", "purkL", "purkLA"],
      qrs: [160, 300], st: [300, 380, 560], ev: [212, 245],
      text: [
        ["his", "qon", "The impulse runs down the His bundle. The left bundle is blocked, so only the right bundle carries it on."],
        ["qon", "q1", "The right bundle activates the right ventricle and the right side of the septum, so the septum depolarises right to left. The wavefront heads towards I, aVL and V6: no septal q there."],
        ["q1", "q2", "With no fast route on the left, the impulse crawls cell to cell through gap junctions, across the septum and on through the left ventricle. Slow, so the QRS is wide. The wavefront points left and back, away from V1: deep, broad S in V1."],
        ["q2", "qend", "The lateral wall of the left ventricle is reached last, still heading left: the broad, often notched R in I, aVL, V5 and V6. QRS 120 ms or more."],
        ["qend", "tS", "Abnormal depolarisation means abnormal repolarisation. The ST segment shifts opposite to the main QRS: up in V1 to V3, down in I, aVL and V6."],
        ["tS", "tE", "T waves point opposite to the main QRS (discordant): upright in V1, inverted in I, aVL and V6. This is the expected secondary pattern in LBBB."]
      ]
    }
  };
  function seg(c, name) { var s = COND[c].segs; for (var i = 0; i < s.length; i++) if (s[i][0] === name) return s[i]; return null; }

  /* ---------- State ---------- */
  var state = { t: 0, cond: "normal", playing: !reduced, speed: 0.25, leads: ["II", "V1", "V6"], focus: 0, step: false, stepIdx: 0 };

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
  var BLUE = "var(--ecgc-blue)", ORANGE = "var(--ecgc-orange)", DARK = "#4E5968";

  var defs = el("defs", {});
  var dep = el("pattern", { id: "ecgcDep", width: 7, height: 7, patternUnits: "userSpaceOnUse" }, defs);
  el("rect", { width: 7, height: 7, fill: BLUE, "fill-opacity": .22 }, dep);
  el("circle", { cx: 3.5, cy: 3.5, r: 1.3, fill: BLUE }, dep);
  var hatch = el("pattern", { id: "ecgcHatch", width: 9, height: 9, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  el("line", { x1: 0, y1: 0, x2: 0, y2: 9, stroke: ORANGE, "stroke-width": 1.6 }, hatch);
  var mk = el("marker", { id: "ecgcHead", viewBox: "0 0 10 10", refX: 6, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--ecgc-magenta)" }, mk);

  // AV groove: one slightly oblique line, y = 160 - 0.069 (x - 130). Crux at about (266, 151).
  function groove(x) { return 160 - 0.069 * (x - 130); }
  var SIL = "M176,46 C140,50 118,92 122,140 L122,161 C128,222 170,290 236,330 C268,352 300,394 338,399 " +
    "C392,392 430,322 432,240 C434,192 430,162 426,140 C422,96 402,56 362,46 C332,39 298,42 270,47 C250,40 226,38 206,44 Z";
  var CLIP = {
    RA: "0,0 263,0 266,151 0,169", LA: "263,0 540,0 540,131.7 266,151",
    RV: "0,169 254,152 244,200 242,260 250,322 236,334 0,420",
    SEP: "254,152 284,150 276,215 288,300 320,366 300,380 250,322 242,260 244,200",
    LV: "284,150 540,131.7 540,420 0,420 236,334 250,322 300,380 320,366 288,300 276,215"
  };
  var CAVITY = {
    RA: "M140,157 C128,120 134,74 172,58 L208,56 C234,58 252,72 257,92 L257,148 Z",
    LA: "M273,147 L273,72 C286,58 320,54 356,60 C392,68 410,100 412,137 Z",
    RV: "M136,165 C142,225 180,284 240,318 C238,270 240,200 256,155 Z",
    LV: "M282,152 C266,215 270,300 312,366 C326,382 346,378 362,356 C396,312 402,230 398,143 Z"
  };
  var ATRIAL_SWEEP = { RA: [178, 46, 250, 158], LA: [270, 50, 422, 142] };
  var ATRIAL_TIME = { RA: [5, 70], LA: [25, 65] };
  // Every route sits in or along a wall: SA node in the RA wall at the SVC junction; internodal routes and Bachmann's
  // bundle in the atrial walls and interatrial septum; AV node low in the interatrial septum; His bundle through the
  // fibrous ring to the top of the muscular septum; right bundle under the endocardium of the RV septal surface, then the
  // moderator band (the one route that crosses a cavity) to the anterior RV free wall; left bundle and posterior fascicle
  // under the endocardium of the LV septal surface; Purkinje fibres along the endocardium of both ventricles.
  // The anterior fascicle leaves this slice to run on the front (anterior) wall, so it is drawn as a stub with an
  // out-of-plane marker, and its Purkinje fibres reappear on the upper lateral wall.
  var PATHS = {
    intern: "M184,50 C214,49 246,54 261,72 L263,138",
    intern2: "M172,52 C142,58 127,96 128,138 L132,156 L141,158.6 L258,150",
    bach: "M188,51 C228,43 292,47 358,57",
    avn: "M261,140 L265,151",
    his: "M265,151 L266,163 L267,176",
    rb: "M267,176 C258,184 250,196 247,215 C244,240 243,270 245,300",
    mod: "M245,298 C224,292 200,282 179,270",
    purkR: "M179,270 C161,258 147,240 142,220 C138,202 134,186 133,170",
    purkR2: "M179,270 C195,287 211,302 232,320",
    lb: "M267,176 C268,192 269,208 270,226",
    laf: "M270,226 L273,238",
    lpf: "M270,226 C269,250 271,268 276,290 C281,312 290,334 300,352",
    purkL: "M300,352 C312,372 326,383 338,381 C352,381 364,369 371,356 C400,316 408,284 407,262",
    purkLA: "M406,212 C408,226 408,242 407,258"
  };
  var ATRIAL = { intern: 1, intern2: 1, bach: 1, avn: 1 };
  var BUNDLE = { his: 1, rb: 1, mod: 1, lb: 1, laf: 1, lpf: 1 };
  var ATRIAL_PATH_TIME = { sa: [0, 10], intern: [5, 45], intern2: [5, 45], bach: [5, 40], avn: [50, HIS_START - 50] };
  var FAST_ORDER = ["his", "rb", "mod", "purkR", "purkR2", "lb", "laf", "lpf", "purkL", "purkLA"];
  var PARENT = { his: null, rb: "his", mod: "rb", purkR: "mod", purkR2: "mod", lb: "his", laf: "lb", lpf: "lb", purkL: "lpf", purkLA: "laf" };
  var PARENT_AT = {};
  // Where along each path (fraction of its length) it starts exciting the muscle next to it. The His bundle and the upper
  // bundle branches are insulated; the right bundle reaches the septal surface low down; the moderator band only at its end.
  var COUPLED = { rb: .45, laf: 0, lpf: .3, purkR: 0, purkR2: 0, purkL: 0, purkLA: 0 };
  // Which muscle each path can excite: a bundle on the septal surface only excites the septum on its own side.
  var COUPLE_TO = { rb: { SEP: 1 }, laf: { SEP: 1 }, lpf: { SEP: 1, LVA: 1 }, purkR: { RV: 1 }, purkR2: { RV: 1, SEP: 1 }, purkL: { LVA: 1, LVW: 1 }, purkLA: { LVW: 1 } };
  var SPEED = { his: V_BUNDLE, rb: V_BUNDLE, mod: V_BUNDLE, lb: V_BUNDLE, laf: V_BUNDLE, lpf: V_BUNDLE, purkR: V_PURK, purkR2: V_PURK, purkL: V_PURK, purkLA: V_PURK };

  // SVC stub (drawn first so the right atrium sits on it).
  var gVes = el("g", { "aria-hidden": "true" });
  el("path", { d: "M178,58 L178,14 L206,14 L206,58", fill: SOFT, stroke: GREY, "stroke-width": 1.6 }, gVes);
  el("text", { x: 172, y: 26, "text-anchor": "end", "font-size": 12, "font-family": "var(--font-sans)", fill: INK }, gVes).textContent = "SVC";

  var gRegions = el("g", { "aria-hidden": "true" });
  var silPath = el("path", { d: SIL, fill: SOFT, stroke: "none" }, gRegions);
  var atrialNodes = {};
  ["RA", "LA"].forEach(function (r) {
    var c = el("clipPath", { id: "ecgcC" + r }, defs); el("polygon", { points: CLIP[r] }, c);
    var grad = el("linearGradient", { id: "ecgcG" + r, gradientUnits: "userSpaceOnUse", x1: ATRIAL_SWEEP[r][0], y1: ATRIAL_SWEEP[r][1], x2: ATRIAL_SWEEP[r][2], y2: ATRIAL_SWEEP[r][3] }, defs);
    el("stop", { offset: 0, "stop-color": "#fff" }, grad);
    var s1 = el("stop", { offset: 0, "stop-color": "#fff" }, grad);
    var s2 = el("stop", { offset: 0, "stop-color": "#000" }, grad);
    el("stop", { offset: 1, "stop-color": "#000" }, grad);
    var mask = el("mask", { id: "ecgcM" + r, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 540, height: 420 }, defs);
    el("rect", { x: 0, y: 0, width: 540, height: 420, fill: "url(#ecgcG" + r + ")" }, mask);
    var wrap = el("g", { "clip-path": "url(#ecgcC" + r + ")" }, gRegions);
    var over = el("path", { d: SIL, fill: "url(#ecgcDep)", mask: "url(#ecgcM" + r + ")", opacity: 0 }, wrap);
    atrialNodes[r] = { s1: s1, s2: s2, over: over };
  });
  el("path", { d: SIL, fill: "none", stroke: GREY, "stroke-width": 1.8 }, gRegions);
  var cavityNodes = Object.keys(CAVITY).map(function (k) {
    return el("path", { d: CAVITY[k], fill: "#fff", stroke: GREY, "stroke-width": 1.4 }, gRegions);
  });
  el("rect", { x: 179, y: 14, width: 26, height: 46, fill: "#fff" }, gRegions);
  el("path", { d: "M178,14 L178,57 M206,14 L206,57", stroke: GREY, "stroke-width": 1.6 }, gRegions);
  el("ellipse", { cx: 234, cy: 140, rx: 7, ry: 4, fill: "#fff", stroke: GREY, "stroke-width": 1, "stroke-dasharray": "2 2" }, gRegions);
  el("path", { d: "M122,160.6 L426,139.6", stroke: "#6B7075", "stroke-width": 3.5, "stroke-linecap": "round" }, gRegions);
  [
    "M165,158 Q169,182 184,190 Q177,174 178,157 Z", "M235,153 Q231,177 216,186 Q223,170 222,154 Z",
    "M300,148 Q304,174 320,182 Q312,166 313,147 Z", "M385,142 Q381,168 365,176 Q373,160 371,143 Z"
  ].forEach(function (d) { el("path", { d: d, fill: "#fff", stroke: "#6B7075", "stroke-width": 1.5, "stroke-linejoin": "round" }, gRegions); });
  [["RA", 198, 108], ["LA", 345, 104], ["RV", 195, 235], ["LV", 345, 322]].forEach(function (c) {
    el("text", { x: c[1], y: c[2], "text-anchor": "middle", "font-size": 18, "font-weight": 700, fill: INK, "font-family": "var(--font-sans)" }, gRegions).textContent = c[0];
  });

  // Frontal lead lines radiating from the centre of the heart, inside a faint circle.
  var LC = { x: 276, y: 232 }, LR = 158;
  var gLeadLines = el("g", { "aria-hidden": "true" });
  el("circle", { cx: LC.x, cy: LC.y, r: LR, fill: "none", stroke: GREY, "stroke-width": 1, "stroke-dasharray": "2 5", opacity: .8 }, gLeadLines);
  var leadLineNodes = {};
  Object.keys(FRONTAL_AX).forEach(function (L) {
    var a = FRONTAL_AX[L] * Math.PI / 180, ex = LC.x + LR * Math.cos(a), ey = LC.y + LR * Math.sin(a);
    var line = el("line", { x1: LC.x, y1: LC.y, x2: ex.toFixed(1), y2: ey.toFixed(1), stroke: GREY, "stroke-width": 1, "stroke-dasharray": "4 4", opacity: .75 }, gLeadLines);
    var deg = FRONTAL_AX[L] > 0 ? "+" + FRONTAL_AX[L] : String(FRONTAL_AX[L]).replace("-", "\u2212");
    // Upper and side lead names sit just inside the circle (clear of the label columns); lower ones just outside it.
    var rr = FRONTAL_AX[L] > 0 ? LR + 14 : LR - 28;
    var tx = el("text", { x: (LC.x + rr * Math.cos(a)).toFixed(1), y: (LC.y + rr * Math.sin(a) + 4).toFixed(1), "text-anchor": "middle", "font-size": 12, "font-family": "var(--font-sans)", fill: "var(--muted)", stroke: "#fff", "stroke-width": 3.5, "paint-order": "stroke" }, gLeadLines);
    tx.textContent = L + (L === "I" ? "\u2002" : " ") + deg + "\u00b0";
    if (L === "I") { tx.setAttribute("x", (ex - 52).toFixed(1)); tx.setAttribute("y", (ey + 16).toFixed(1)); } // clear of the lateral wall markers
    leadLineNodes[L] = { line: line, tx: tx, ex: ex, ey: ey };
  });

  // Myocardium sample points (filled in by the model): blue dots = fast route, orange chevrons = slow cell to cell.
  var gMyo = el("g", { "aria-hidden": "true" });

  var gBlock = el("g", { "aria-hidden": "true" });
  var gPaths = el("g", { "aria-hidden": "true" });
  var pathNodes = {};
  Object.keys(PATHS).forEach(function (p) {
    var w = p === "avn" ? 7 : BUNDLE[p] ? 3.6 : ATRIAL[p] ? 3.2 : 2.6, fastW = ATRIAL[p] ? w + 1 : 5;
    var base = el("path", { d: PATHS[p], fill: "none", stroke: BUNDLE[p] ? DARK : GREY, "stroke-width": w, "stroke-linecap": "round" }, gPaths);
    var act = el("path", { d: PATHS[p], fill: "none", stroke: BLUE, "stroke-width": fastW, "stroke-linecap": "round", opacity: 0 }, gPaths);
    var len = act.getTotalLength();
    act.setAttribute("stroke-dasharray", len + " " + len);
    pathNodes[p] = { base: base, act: act, len: len };
  });
  var saNode = el("ellipse", { cx: 177, cy: 50, rx: 8, ry: 5.5, fill: GREY, stroke: INK, "stroke-width": 1 }, gPaths);
  var gHeads = el("g", { "aria-hidden": "true" });
  var heads = {};
  Object.keys(PATHS).forEach(function (p) {
    var g = el("g", { opacity: 0 }, gHeads);
    if (!reduced) el("circle", { r: 10, fill: BLUE, "fill-opacity": .22 }, g);
    if (ATRIAL[p]) el("circle", { r: 5, fill: BLUE, stroke: "#fff", "stroke-width": 1.5 }, g);
    else el("path", { d: "M9,0 L-6,-7 L-3,0 L-6,7 Z", fill: BLUE, stroke: "#fff", "stroke-width": 1.2, "stroke-linejoin": "round" }, g); // fast route: bold arrowhead
    heads[p] = g;
  });

  // Out-of-plane markers (a dot in a circle = running towards the viewer): the anterior fascicle leaves this slice onto the
  // front wall, and its Purkinje fibres come back into the slice on the upper lateral wall.
  var gOut = el("g", { "aria-hidden": "true" });
  [[273, 238], [406, 212]].forEach(function (q) {
    el("circle", { cx: q[0], cy: q[1], r: 4.6, fill: "#fff", stroke: DARK, "stroke-width": 1.6 }, gOut);
    el("circle", { cx: q[0], cy: q[1], r: 1.5, fill: DARK }, gOut);
  });
  // Papillary muscles (the fascicles end near their bases): posteromedial low on the septal side, anterolateral on the lateral wall.
  ["M300,352 C308,340 318,334 326,338 C322,348 314,356 306,360 Z", "M398,292 C388,296 382,306 384,316 C392,314 400,306 402,298 Z"].forEach(function (d) {
    el("path", { d: d, fill: SOFT, stroke: GREY, "stroke-width": 1.2 }, gRegions);
  });

  var blockText = el("text", { "font-size": 12.5, "font-weight": 700, "font-family": "var(--font-sans)", fill: INK, stroke: "#fff", "stroke-width": 4, "paint-order": "stroke", opacity: 0 }, svg);
  var gMarks = el("g", { "aria-hidden": "true" });
  var gLeadMarks = el("g", {});

  var gArrow = el("g", { "aria-hidden": "true" });
  var arrowLine = el("line", { stroke: "var(--ecgc-magenta)", "stroke-width": 7, "stroke-linecap": "round", "marker-end": "url(#ecgcHead)" }, gArrow);
  var arrowTail = el("circle", { r: 4, fill: "var(--ecgc-magenta)" }, gArrow);
  var arrowText = el("text", { "font-size": 13, "font-weight": 700, "font-family": "var(--font-sans)", fill: "var(--ecgc-magenta)", stroke: "#fff", "stroke-width": 4, "paint-order": "stroke" }, gArrow);
  var gCluster = el("g", { "aria-hidden": "true" });
  var clusterRing = el("circle", { r: 22, fill: "none", "stroke-width": 2, opacity: 0 }, gCluster);
  svg.appendChild(gOut); // out-of-plane markers stay on top of the arrow

  // The whole drawing is scaled down a little inside the frame so the label columns get a clear gutter.
  var HS = 0.86, HC = { x: 277, y: 215 };
  var gHeart = document.createElementNS(NS, "g");
  gHeart.setAttribute("transform", "translate(" + (HC.x * (1 - HS)).toFixed(2) + "," + (HC.y * (1 - HS)).toFixed(2) + ") scale(" + HS + ")");
  Array.prototype.slice.call(svg.childNodes).forEach(function (n) { if (n !== defs) gHeart.appendChild(n); });
  svg.appendChild(gHeart);
  function T(x, y) { return [HC.x + HS * (x - HC.x), HC.y + HS * (y - HC.y)]; }

  // Two aligned label columns, evenly spaced, ordered by target height so leaders never cross. Each leader is a short
  // horizontal run into the gutter, then one straight segment to a small dot on the target (heart coordinates).
  var LAB_L = [["SA node", 177, 50], ["Internodal paths", 128, 112], ["Coronary sinus", 230, 140], ["AV node", 263, 146],
    ["Tricuspid valve", 172, 172], ["Right bundle", 245, 245], ["Moderator band", 212, 285, "crosses the RV cavity"], ["Purkinje fibres", 200, 292]];
  var LAB_R = [["Bachmann's bundle", 290, 47], ["Interatrial septum", 264, 100], ["Fibrous AV ring", 402, 141], ["Mitral valve", 372, 160],
    ["His bundle", 266, 166], ["Left bundle", 269, 212], ["Anterior fascicle", 274, 239, "onto the front wall \u2299"], ["Posterior fascicle", 271, 272],
    ["Purkinje fibres", 408, 300], ["Septum", 258, 330]];
  var COL = { L: { text: 114, elbow: 124, top: 40, bot: 372 }, R: { text: 442, elbow: 432, top: 34, bot: 386 } };
  var gLab = el("g", { "class": "ecgc-labels", "aria-hidden": "true" });
  [["L", LAB_L], ["R", LAB_R]].forEach(function (side) {
    var c = COL[side[0]], list = side[1], step = (c.bot - c.top) / (list.length - 1), isL = side[0] === "L";
    list.forEach(function (l, i) {
      var y = c.top + i * step, tg = T(l[1], l[2]), tx0 = isL ? c.text + 4 : c.text - 4;
      el("polyline", { points: tx0 + "," + (y - 4) + " " + c.elbow + "," + (y - 4) + " " + tg[0].toFixed(1) + "," + tg[1].toFixed(1), fill: "none", stroke: "#8A9097", "stroke-width": .8 }, gLab);
      el("circle", { cx: tg[0].toFixed(1), cy: tg[1].toFixed(1), r: 1.8, fill: INK }, gLab);
      el("text", { x: c.text, y: y, "text-anchor": isL ? "end" : "start", "font-size": 12, "font-family": "var(--font-sans)", fill: INK }, gLab).textContent = l[0];
      if (l[3]) el("text", { x: c.text, y: y + 12, "text-anchor": isL ? "end" : "start", "font-size": 10, "font-family": "var(--font-sans)", fill: "var(--muted)" }, gLab).textContent = l[3];
    });
  });

  /* ---------- Activation-time model ---------- */
  function parsePoly(str) { return str.split(" ").map(function (p) { var a = p.split(","); return [+a[0], +a[1]]; }); }
  function inPoly(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  var POLY = { RV: parsePoly(CLIP.RV), SEP: parsePoly(CLIP.SEP), LV: parsePoly(CLIP.LV) };
  var GROUP_NAME = { SEP: "septum", RV: "RV", LVA: "LV apex", LVW: "LV lateral wall", LVB: "LV base" };
  var SPACING = 7;
  var GRID = [];
  (function () {
    for (var y = 140; y <= 405; y += SPACING) for (var x = 118; x <= 440; x += SPACING) {
      if (y < groove(x) + 5) continue;
      var pt = new DOMPoint(x, y);
      if (!silPath.isPointInFill(pt)) continue;
      var inCav = false;
      for (var k = 0; k < cavityNodes.length; k++) if (cavityNodes[k].isPointInFill(pt)) { inCav = true; break; }
      if (inCav) continue;
      var g = inPoly(x, y, POLY.SEP) ? "SEP" : inPoly(x, y, POLY.RV) ? "RV" : "LV";
      if (g === "LV") g = y < groove(x) + 40 ? "LVB" : y > 345 ? "LVA" : "LVW";
      GRID.push({ x: x, y: y, g: g });
    }
  })();
  // How far a wavefront travels through muscle before we call it "slow cell to cell" rather than "fast route then through the wall".
  var WALL = { RV: 22, SEP: 42, LVA: 42, LVW: 42, LVB: 42 };

  // The activation map is a visual timing guide only (dots, chevrons, bump-to-heart links, story moments).
  // Its times are re-mapped onto the idealised vector's timeline, so the picture and the traces line up.
  var MODEL = {};
  function buildModel(c) {
    var C = COND[c], fast = {}, path = {};
    C.fast.forEach(function (p) { fast[p] = 1; });
    FAST_ORDER.forEach(function (p) {
      if (!fast[p]) return;
      var start = PARENT[p] ? path[PARENT[p]][0] + path[PARENT[p]][1] * (PARENT_AT[p] || 1) : HIS_START;
      path[p] = [start, pathNodes[p].len / SPEED[p]];
    });
    // Sources: muscle within reach of a branching (coupled) fast path is excited as the impulse passes.
    var n = GRID.length, ta = new Float64Array(n).fill(Infinity), md = new Float64Array(n), par = new Int32Array(n).fill(-1);
    var sx = new Float64Array(n), sy = new Float64Array(n), done = new Uint8Array(n);
    Object.keys(COUPLED).forEach(function (p) {
      if (!path[p]) return;
      var node = pathNodes[p].act, L = pathNodes[p].len;
      for (var s = COUPLED[p] * L; s <= L; s += 3) {
        var q = node.getPointAtLength(s), ts = path[p][0] + s / SPEED[p];
        for (var i = 0; i < n; i++) {
          var d = Math.hypot(GRID[i].x - q.x, GRID[i].y - q.y);
          if (d > 12 || !COUPLE_TO[p][GRID[i].g]) continue;
          if (p === "rb" && GRID[i].x < q.x) continue; // right bundle: septal muscle to its left only
          var tt = ts + d / V_MYO;
          if (tt < ta[i]) { ta[i] = tt; md[i] = d; par[i] = -1; sx[i] = q.x; sy[i] = q.y; }
        }
      }
    });
    // Cell-to-cell spread (Dijkstra over neighbouring points at one muscle speed).
    for (;;) {
      var best = -1, bt = Infinity;
      for (var i = 0; i < n; i++) if (!done[i] && ta[i] < bt) { bt = ta[i]; best = i; }
      if (best < 0) break;
      done[best] = 1;
      var b = GRID[best];
      for (var j = 0; j < n; j++) {
        if (done[j]) continue;
        var d = Math.hypot(GRID[j].x - b.x, GRID[j].y - b.y);
        if (d > SPACING * 1.5) continue;
        var tt = bt + d / V_MYO;
        if (tt < ta[j]) { ta[j] = tt; md[j] = md[best] + d; par[j] = best; }
      }
    }
    var pts = GRID.map(function (g, i) {
      var fx = par[i] >= 0 ? GRID[par[i]].x : sx[i], fy = par[i] >= 0 ? GRID[par[i]].y : sy[i];
      var dx = g.x - fx, dy = g.y - fy, m = Math.hypot(dx, dy) || 1;
      return { x: g.x, y: g.y, g: g.g, ta0: ta[i], ta: ta[i], slow: md[i] > WALL[g.g], d2: [dx / m, dy / m] };
    });
    // Re-time the map onto the vector. Each region's muscle keeps its own activation order but is fitted into the
    // window of the vector component it makes (centre +/- 1.6 widths); fast routes and regions with no component of
    // their own use one linear map from first to last muscle onto the QRS.
    var V = VEC[c], qon = C.qrs[0], qend = C.qrs[1];
    var tmin = Infinity, tmax = 0, rmin = {}, rmax = {};
    pts.forEach(function (p) {
      if (p.ta0 < tmin) tmin = p.ta0; if (p.ta0 > tmax) tmax = p.ta0;
      rmin[p.g] = Math.min(rmin[p.g] === undefined ? Infinity : rmin[p.g], p.ta0); rmax[p.g] = Math.max(rmax[p.g] || 0, p.ta0);
    });
    function lin(t) {
      if (t <= tmin) return HIS_START + (t - HIS_START) * (qon + 2 - HIS_START) / Math.max(1, tmin - HIS_START);
      return qon + 2 + (t - tmin) * (qend - 8 - qon) / Math.max(1, tmax - tmin);
    }
    var win = {};
    V.forEach(function (k) {
      if (!k[5]) return;
      var m = Math.hypot(k[2], k[3], k[4]);
      if (!win[k[5]] || m > win[k[5]].m) win[k[5]] = { m: m, a: Math.max(qon + 1, k[0] - 1.6 * k[1]), b: Math.min(qend - 4, k[0] + 1.6 * k[1]) };
    });
    // A region with no component of its own shares the window of the region activated at the most similar time.
    var rmed = {};
    Object.keys(rmin).forEach(function (g) { var a = pts.filter(function (p) { return p.g === g; }).map(function (p) { return p.ta0; }).sort(function (x, y) { return x - y; }); rmed[g] = a[a.length >> 1]; });
    Object.keys(rmin).forEach(function (g) {
      if (win[g]) return;
      var bestG = null; Object.keys(win).forEach(function (h) { if (rmed[h] !== undefined && (bestG === null || Math.abs(rmed[h] - rmed[g]) < Math.abs(rmed[bestG] - rmed[g]))) bestG = h; });
      if (bestG) win[g] = win[bestG];
    });
    pts.forEach(function (p) {
      var w = win[p.g];
      p.ta = w ? w.a + (p.ta0 - rmin[p.g]) / Math.max(1, rmax[p.g] - rmin[p.g]) * (w.b - w.a) : lin(p.ta0);
    });
    // Fast routes: from the His bundle to the first muscle at QRS onset, and the last fast route ends at the centre
    // of the strongest fast-route component.
    var lastEnd = 0, tFast = qon + 30, fm = -1;
    Object.keys(path).forEach(function (p) { lastEnd = Math.max(lastEnd, path[p][0] + path[p][1]); });
    V.forEach(function (k) { if (k[5] && !k[6]) { var m = Math.hypot(k[2], k[3], k[4]); if (m > fm) { fm = m; tFast = k[0]; } } });
    function plin(t) {
      if (t <= tmin) return HIS_START + (t - HIS_START) * (qon + 2 - HIS_START) / Math.max(1, tmin - HIS_START);
      return qon + 2 + (t - tmin) * (tFast - qon - 2) / Math.max(1, lastEnd - tmin);
    }
    Object.keys(path).forEach(function (p) { var s0 = plin(path[p][0]), s1 = plin(path[p][0] + path[p][1]); path[p] = [s0, Math.max(1, s1 - s0)]; });
    Object.keys(ATRIAL_PATH_TIME).forEach(function (p) { path[p] = ATRIAL_PATH_TIME[p]; });
    C.path = path;
    // The heart vector: smooth idealised components; groups keep each ventricular component's region and route.
    var groups = {}, total = { x: new Float32Array(CYCLE), y: new Float32Array(CYCLE), z: new Float32Array(CYCLE) };
    P_WAVE.concat(V).forEach(function (k) {
      var G = null;
      if (k[5]) { var key = k[5] + "|" + (k[6] ? "slow" : "fast"); G = groups[key] || (groups[key] = { g: k[5], slow: !!k[6], x: new Float32Array(CYCLE), y: new Float32Array(CYCLE), z: new Float32Array(CYCLE) }); }
      for (var t = 0; t < CYCLE; t++) {
        var e = (t - k[0]) / k[1], w = Math.exp(-0.5 * e * e);
        if (w < 1e-4) continue;
        total.x[t] += w * k[2]; total.y[t] += w * k[3]; total.z[t] += w * k[4];
        if (G) { G.x[t] += w * k[2]; G.y[t] += w * k[3]; G.z[t] += w * k[4]; }
      }
    });
    var tS = C.st[1], tE = C.st[2];
    C.segs = [["P", 0, 100], ["PR", 100, qon], ["QRS", qon, qend], ["ST", qend, tS], ["T", tS, tE], ["Rest", tE, CYCLE]];
    var M = { pts: pts, groups: groups, total: total, qon: qon, qend: qend, tS: tS, tE: tE };
    M.fracSlow = pts.filter(function (p) { return p.slow; }).length / pts.length;
    // Story moments come from the vector: the centre of the strongest matching component.
    M.med = function (regs, slow) {
      var best = null, bm = -1;
      V.forEach(function (k) { if (!k[5] || regs.indexOf(k[5]) < 0 || (slow !== undefined && !!k[6] !== slow)) return; var m = Math.hypot(k[2], k[3], k[4]); if (m > bm) { bm = m; best = k[0]; } });
      return best === null ? qon : best;
    };
    M.ev = { his: HIS_START, qon: qon, qend: qend, tS: tS, tE: tE, q1: C.ev[0], q2: C.ev[1] };
    return M;
  }
  ["normal", "rbbb", "lbbb"].forEach(function (c) { MODEL[c] = buildModel(c); });
  function vectorAt(c, t) { var M = MODEL[c], i = Math.max(0, Math.min(CYCLE - 1, Math.round(t))); return { x: M.total.x[i], y: M.total.y[i], z: M.total.z[i] }; }

  /* ---------- Trace samples (1 ms) ---------- */
  var SAMPLES = {};
  Object.keys(MODEL).forEach(function (c) {
    SAMPLES[c] = {};
    LEADS.forEach(function (L) {
      var arr = new Float32Array(CYCLE);
      for (var t = 0; t < CYCLE; t++) arr[t] = project(vectorAt(c, t), L);
      SAMPLES[c][L] = arr;
    });
  });
  // Vertical gain: about standard paper proportions for this time scale (10 mm/mV against 25 mm/s would be about 60 px/mV here).
  var GAIN = 56; // px per mV, same for the trace and the 1 mV calibration pulse
  var DATA_RANGE = {};
  function dataRange(c, L) {
    var k = c + "|" + L; if (DATA_RANGE[k]) return DATA_RANGE[k];
    var a = SAMPLES[c][L], lo = 0, hi = 0; for (var i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
    return (DATA_RANGE[k] = [lo, hi]);
  }
  var LEAD_RANGE = {};
  LEADS.forEach(function (L) {
    var hi = .6, lo = -.6;
    Object.keys(SAMPLES).forEach(function (c) { var a = SAMPLES[c][L]; for (var i = 0; i < a.length; i++) { if (a[i] > hi) hi = a[i]; if (a[i] < lo) lo = a[i]; } });
    LEAD_RANGE[L] = [lo - .25, hi + .3];
  });

  /* ---------- Bumps: each QRS deflection traced back to the muscle that made it ---------- */
  var BUMPS = {};
  function dirWords(v, L) {
    var chest = FRONTAL_AX[L] === undefined, a = chest ? v.z : v.y;
    if (Math.abs(v.x) >= Math.abs(a)) return v.x > 0 ? "right to left" : "left to right";
    return chest ? (a > 0 ? "forwards" : "backwards") : (a > 0 ? "downwards" : "upwards");
  }
  var ORD = ["1st", "2nd", "3rd", "4th", "5th"];
  function bumpsFor(c, L) {
    var key = c + "|" + L;
    if (BUMPS[key]) return BUMPS[key];
    var M = MODEL[c], arr = SAMPLES[c][L], a0 = M.qon - 4, a1 = M.qend + 4, TH = .06;
    // Lobes of one sign, then split a lobe where it is clearly notched.
    var lobes = [], cur = null;
    for (var t = a0; t <= a1; t++) {
      var s = Math.abs(arr[t]) > TH ? Math.sign(arr[t]) : 0;
      if (cur && s === cur.sign) { cur.end = t; continue; }
      if (cur) { lobes.push(cur); cur = null; }
      if (s) cur = { sign: s, start: t, end: t };
    }
    if (cur) lobes.push(cur);
    var merged = [];
    lobes.forEach(function (lb) {
      var pv = merged[merged.length - 1];
      if (pv && pv.sign === lb.sign && lb.start - pv.end <= 8) pv.end = lb.end; else merged.push(lb);
    });
    lobes = merged.filter(function (lb) { return lb.end - lb.start >= 5; });
    var bumps = [];
    lobes.forEach(function (lb) {
      var peaks = [];
      for (var t = lb.start; t <= lb.end; t++) {
        var v = lb.sign * arr[t];
        if (v >= lb.sign * arr[t - 1] && v > lb.sign * arr[t + 1]) peaks.push(t);
      }
      var keep = [];
      peaks.forEach(function (p) {
        if (!keep.length) { keep.push(p); return; }
        var q = keep[keep.length - 1], dip = Infinity;
        for (var t = q; t <= p; t++) dip = Math.min(dip, lb.sign * arr[t]);
        var a = lb.sign * arr[q], b = lb.sign * arr[p];
        if (Math.min(a, b) >= .25 && p - q >= 20 && dip <= .85 * Math.min(a, b)) keep.push(p);
        else if (b > a) keep[keep.length - 1] = p;
      });
      if (!keep.length) return;
      var bounds = [lb.start];
      for (var i = 1; i < keep.length; i++) {
        var lo = keep[i - 1], mt = lo;
        for (var t = keep[i - 1]; t <= keep[i]; t++) if (lb.sign * arr[t] < lb.sign * arr[mt]) mt = t;
        bounds.push(mt);
      }
      bounds.push(lb.end);
      keep.forEach(function (p, i) { bumps.push({ sign: lb.sign, start: bounds[i], end: bounds[i + 1], peak: p, amp: arr[p], notch: keep.length > 1 ? i + 1 : 0 }); });
    });
    var maxA = 0; bumps.forEach(function (b) { maxA = Math.max(maxA, Math.abs(b.amp)); });
    var seenPos = false, posCount = 0, prev = null;
    bumps.forEach(function (b) {
      var small = Math.abs(b.amp) < .3 * maxA, nm;
      if (b.sign > 0) {
        var after = posCount && prev && prev.sign < 0;
        if (b.notch) { if (b.notch === 1) b.base = after ? "R'" : "R"; nm = ORD[b.notch - 1] + " " + (b.base || (prev && prev.base) || "R"); b.base = b.base || (prev && prev.base); }
        else if (after) nm = small ? "r'" : "R'";
        else nm = small ? "r" : "R";
        posCount++; seenPos = true;
      } else {
        nm = seenPos ? (small ? "s" : "S") : (small ? "q" : "Q");
        if (!seenPos && !bumps.some(function (o) { return o.sign > 0; })) nm = "QS"; // no R anywhere in this QRS
        if (b.notch) nm = ORD[b.notch - 1] + " " + nm.toUpperCase();
      }
      b.name = nm; prev = b;
      // Which muscle made it: the groups whose own projection on this lead has the bump's sign, summed over the bump.
      var score = [];
      Object.keys(M.groups).forEach(function (k) {
        var G = M.groups[k], s = 0;
        for (var t = b.start; t <= b.end; t++) { var p = project({ x: G.x[t], y: G.y[t], z: G.z[t] }, L) * b.sign; if (p > 0) s += p; }
        if (s > 0) score.push({ k: k, g: G.g, slow: G.slow, s: s });
      });
      score.sort(function (a, b2) { return b2.s - a.s; });
      var top = score[0] || { g: "LVW", slow: false, k: "LVW|fast" }, names = [GROUP_NAME[top.g]], keys = [top.k];
      if (score[1] && score[1].slow === top.slow && score[1].s >= .6 * top.s && score[1].g !== top.g) { names.push(GROUP_NAME[score[1].g]); keys.push(score[1].k); }
      b.slow = top.slow;
      b.groups = names.join(" and ");
      var vs = { x: 0, y: 0, z: 0 }, cx = 0, cy = 0, cn = 0;
      keys.forEach(function (k) { var G = M.groups[k]; for (var t = b.start; t <= b.end; t++) { vs.x += G.x[t]; vs.y += G.y[t]; vs.z += G.z[t]; } });
      var regs = keys.map(function (k) { return k.split("|")[0]; });
      M.pts.forEach(function (p) { if (regs.indexOf(p.g) >= 0 && p.ta >= b.start - 10 && p.ta <= b.end) { cx += p.x; cy += p.y; cn++; } });
      if (!cn) M.pts.forEach(function (p) { if (regs.indexOf(p.g) >= 0) { cx += p.x; cy += p.y; cn++; } });
      b.cluster = { x: cx / (cn || 1), y: cy / (cn || 1) };
      b.dir = dirWords(vs, L);
      var tw = b.sign > 0 ? "towards " + L : "away from " + L;
      b.label = b.name + ": " + b.groups + ", " + (b.slow ? "slow cell to cell" : "fast route") + ", " + b.dir + ", heading " + tw;
      b.short = b.name + ": " + b.groups + ", " + (b.slow ? "slow cell to cell" : "fast route") + ", " + tw;
      b.sentence = "Watch " + L + ": this " + (b.sign > 0 ? "upward" : "downward") + " bump (" + b.name + ") is the " + b.groups + ", activated " +
        (b.slow ? "slowly, cell to cell through gap junctions" : "by the fast route (bundle branch and Purkinje fibres)") + ". That wavefront is heading " + tw + ", so the trace goes " + (b.sign > 0 ? "up." : "down.");
    });
    BUMPS[key] = bumps;
    return bumps;
  }

  /* ---------- Step-through story ---------- */
  function sideWord(c, L, t, keys) {
    var M = MODEL[c], v = { x: 0, y: 0, z: 0 };
    for (var k in M.groups) if (!keys || keys.indexOf(k) >= 0) { v.x += M.groups[k].x[t]; v.y += M.groups[k].y[t]; v.z += M.groups[k].z[t]; }
    var p = project(v, L);
    return Math.abs(p) < .03 ? "side-on to " + L + ", so it barely moves the trace" : p > 0 ? "towards " + L + ", so the trace goes up" : "away from " + L + ", so the trace goes down";
  }
  function stepsFor(c, L) {
    var M = MODEL[c], E = M.ev, arr = SAMPLES[c][L], steps = [];
    var pmax = 0, pmin = 0; for (var t = 0; t <= 100; t++) { pmax = Math.max(pmax, arr[t]); pmin = Math.min(pmin, arr[t]); }
    var pw = pmax > .02 && pmin < -.02 ? "biphasic (up then down)" : pmax >= -pmin ? "small upward" : "small downward";
    function add(id, t, text) { steps.push({ id: id, t: Math.max(0, Math.min(CYCLE - 1, Math.round(t))), text: text }); }
    add("sa", 4, "The SA node fires, high in the right atrium where the SVC joins. Too little tissue to show on the ECG yet.");
    add("atria", 50, "Watch " + L + ": the atria depolarise cell to cell, heading down and to the left, so " + L + " shows a " + pw + " P wave.");
    add("av", 125, "The AV node holds the impulse back so the atria can empty first. The fibrous ring blocks every other route, so the trace stays flat.");
    add("his", HIS_START + 3, "The impulse enters the His bundle, the only way through the fibrous ring: the start of the fast highway.");
    var K = function (g, s) { return g.map(function (x) { return x + "|" + s; }); };
    if (c === "normal") {
      add("bundles", E.qon - 2, "Fast highway: both bundle branches carry the impulse down either side of the septum (bold blue arrows).");
      var ts = M.med(["SEP"]); add("septum", ts, "The left bundle reaches the septum first, so it depolarises left to right. Watch " + L + ": that wavefront is " + sideWord(c, L, Math.round(ts), K(["SEP"], "fast")) + ".");
      var tw = M.med(["LVW", "LVA", "RV"]); add("walls", tw, "Purkinje fibres reach the apex and both walls almost at once (blue dots). The thick left ventricle wins. Watch " + L + ": the net wavefront is " + sideWord(c, L, Math.round(tw)) + ".");
      var tb = M.med(["LVB"]); add("base", tb, "The base of the ventricles is reached last. Watch " + L + ": that wavefront is " + sideWord(c, L, Math.round(tb), K(["LVB"], "fast").concat(K(["LVB"], "slow"))) + ".");
    } else if (c === "rbbb") {
      add("block", HIS_START + 8, "The right bundle is blocked (X): there is no fast route into the right ventricle.");
      var tl = M.med(["SEP", "LVW", "LVA"], false); add("fast-left", tl, "Fast highway: the left bundle and its Purkinje fibres activate the septum (left to right) and the left ventricle quickly. Watch " + L + ": the wavefront is " + sideWord(c, L, Math.round(tl)) + ".");
      var tr = M.med(["RV"], true); add("slow-rv", tr, "Slow route: the right ventricle is reached cell to cell through gap junctions from the septum (orange chevrons). Watch " + L + ": that wavefront heads " + sideWord(c, L, Math.round(tr), K(["RV"], "slow")) + ".");
    } else {
      add("block", HIS_START + 8, "The left bundle is blocked (X): there is no fast route into the left ventricle.");
      var tf = M.med(["RV", "SEP"], false); add("fast-rv", tf, "Fast highway: the right bundle and its Purkinje fibres activate the right ventricle quickly (bold blue arrow). Watch " + L + ": the wavefront is " + sideWord(c, L, Math.round(tf)) + ".");
      var tsp = M.med(["SEP"], true); add("slow-septum", tsp, "Slow route: the impulse crawls cell to cell through gap junctions, right to left across the septum (orange chevrons). Watch " + L + ": that wavefront is " + sideWord(c, L, Math.round(tsp), K(["SEP"], "slow")) + ".");
      var tlv = M.med(["LVW", "LVB", "LVA"], true); add("slow-lv", tlv, "Still slow, cell to cell: the wavefront crawls on through the left ventricular wall, round to the lateral wall. Watch " + L + ": it is heading " + sideWord(c, L, Math.round(tlv), K(["LVW", "LVB", "LVA"], "slow")) + ".");
    }
    bumpsFor(c, L).forEach(function (b, i) { add("bump" + (i + 1), b.peak, b.sentence); });
    var sv = arr[Math.round((M.qend + M.tS) / 2) + 5], tv = 0;
    for (var t2 = M.tS; t2 <= M.tE; t2++) if (Math.abs(arr[t2]) > Math.abs(tv)) tv = arr[t2];
    var qa = 0; for (var t3 = M.qon; t3 <= M.qend; t3++) qa += arr[t3];
    add("st", (M.qend + M.tS) / 2 + 5, c === "lbbb" ? "Watch " + L + ": repolarisation is abnormal too, so the ST segment shifts opposite to the main QRS: " + (sv > .03 ? "up" : sv < -.03 ? "down" : "about flat") + " here." :
      "Watch " + L + ": every cell is in its plateau phase, so no current flows and the ST segment stays " + (Math.abs(sv) < .04 ? "flat." : sv > 0 ? "slightly up." : "slightly down."));
    add("t", (M.tS + M.tE) / 2, "Watch " + L + ": the T wave is " + (tv > 0 ? "upright" : "inverted") + ", " + ((tv > 0) === (qa > 0) ? "the same way as" : "opposite to") + " the main QRS. " +
      (c === "normal" ? "The epicardium recovers first, so the reversed charge and reversed direction cancel." : "Slowly activated muscle recovers out of order: a secondary change."));
    return steps;
  }

  /* ---------- Muscle points on the heart ---------- */
  var myoNodes = GRID.map(function (g) {
    var dot = el("circle", { cx: g.x, cy: g.y, r: 1.7, fill: BLUE, opacity: 0 }, gMyo);
    var chev = el("path", { d: "M-2.5,-3 L1.5,0 L-2.5,3", fill: "none", stroke: ORANGE, "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0 }, gMyo);
    return { dot: dot, chev: chev, on: -1 };
  });
  function layoutMyo() {
    var M = MODEL[state.cond];
    M.pts.forEach(function (p, i) {
      var a = Math.atan2(p.d2[1], p.d2[0]) * 180 / Math.PI;
      myoNodes[i].chev.setAttribute("transform", "translate(" + p.x + "," + p.y + ") rotate(" + a.toFixed(0) + ")");
      myoNodes[i].on = -1;
    });
  }

  /* ---------- Horizontal-plane wheel and lead markers ---------- */
  var SLOTS = ["A", "B", "C"];
  function shape(s, g, k) {
    k = k || 1;
    if (s === "A") el("circle", { r: 6 * k, fill: "#fff", stroke: INK, "stroke-width": 2 }, g);
    else if (s === "B") el("rect", { x: -5.5 * k, y: -5.5 * k, width: 11 * k, height: 11 * k, fill: "#fff", stroke: INK, "stroke-width": 2 }, g);
    else el("path", { d: "M0," + (-7 * k) + " L" + (6.5 * k) + "," + (5.5 * k) + " L" + (-6.5 * k) + "," + (5.5 * k) + " Z", fill: "#fff", stroke: INK, "stroke-width": 2, "stroke-linejoin": "round" }, g);
  }
  var wheelSvg = document.getElementById("ecgcWheelH");
  var wheelH = (function () {
    var W = { angles: HORIZ_AX, axes: {}, labels: {} };
    el("circle", { cx: 0, cy: 0, r: 44, fill: "none", stroke: GREY, "stroke-width": 1 }, wheelSvg);
    Object.keys(HORIZ_AX).forEach(function (L) {
      var a = HORIZ_AX[L] * Math.PI / 180;
      W.axes[L] = el("line", { x1: 0, y1: 0, x2: (44 * Math.cos(a)).toFixed(1), y2: (44 * Math.sin(a)).toFixed(1), stroke: GREY, "stroke-width": 1 }, wheelSvg);
      var t = el("text", { x: (57 * Math.cos(a)).toFixed(1), y: (57 * Math.sin(a) + 3.5).toFixed(1), "text-anchor": "middle", "font-size": 10, "font-family": "var(--font-sans)", fill: "var(--muted)" }, wheelSvg);
      t.textContent = L; W.labels[L] = t;
    });
    W.vec = el("line", { x1: 0, y1: 0, x2: 0, y2: 0, stroke: "var(--ecgc-magenta)", "stroke-width": 4, "stroke-linecap": "round", "marker-end": "url(#ecgcHead)" }, wheelSvg);
    W.markG = el("g", {}, wheelSvg);
    return W;
  })();
  var leadMarks = SLOTS.map(function (s) {
    var g = document.createElementNS(NS, "g");
    g.setAttribute("id", "ecgcWheelMark-" + s);
    shape(s, g, .95);
    var tx = el("text", { y: 3.5, "text-anchor": "middle", "font-size": 8.5, "font-weight": 700, "font-family": "var(--font-sans)", fill: "#111" }, g);
    tx.textContent = s;
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
      '<button type="button" class="ecgc-focus" data-slot="' + i + '" aria-pressed="false" aria-label="Make trace ' + s + ' the focus lead">Focus</button>' +
      '<span class="ecgc-lead-note" aria-live="polite"></span></div>' +
      '<canvas role="img"></canvas>';
    leadsBox.appendChild(wrap);
    var sel = wrap.querySelector("select");
    sel.value = state.leads[i];
    sel.addEventListener("change", function () { state.leads[i] = sel.value; leadsChanged(); });
    wrap.querySelector(".ecgc-focus").addEventListener("click", function () { state.focus = i; leadsChanged(); });
    var cv = wrap.querySelector("canvas");
    cv.addEventListener("click", function (e) {
      var r = cv.getBoundingClientRect(), left = 34, pw = r.width - left - 4;
      var tc = Math.max(0, Math.min(CYCLE - 1, (e.clientX - r.left - left) / pw * CYCLE));
      if (state.focus !== i) { state.focus = i; leadsChanged(); }
      var bs = bumpsFor(state.cond, state.leads[i]), hit = null;
      bs.forEach(function (b) { if (tc >= b.start - 6 && tc <= b.end + 6 && (!hit || Math.abs(b.peak - tc) < Math.abs(hit.peak - tc))) hit = b; });
      setStepMode(false);
      setPlaying(false);
      state.t = hit ? hit.peak : tc;
      render();
    });
    return { wrap: wrap, sel: sel, cv: cv, note: wrap.querySelector(".ecgc-lead-note"), btn: wrap.querySelector(".ecgc-focus") };
  });

  function layoutLeads() {
    Object.keys(leadLineNodes).forEach(function (L) {
      var n = leadLineNodes[L]; n.line.setAttribute("stroke", GREY); n.line.setAttribute("stroke-width", 1); n.line.setAttribute("stroke-dasharray", "4 4");
      n.tx.setAttribute("fill", "var(--muted)"); n.tx.setAttribute("font-weight", 400);
    });
    Object.keys(HORIZ_AX).forEach(function (L) {
      wheelH.axes[L].setAttribute("stroke", GREY); wheelH.axes[L].setAttribute("stroke-width", 1);
      wheelH.labels[L].setAttribute("fill", "var(--muted)"); wheelH.labels[L].setAttribute("font-weight", 400);
    });
    leadMarks.forEach(function (g, i) {
      var L = state.leads[i], dup = 0;
      for (var j = 0; j < i; j++) if (state.leads[j] === L) dup++;
      if (FRONTAL_AX[L] !== undefined) {
        var n = leadLineNodes[L], a = FRONTAL_AX[L] * Math.PI / 180, r = FRONTAL_AX[L] > 0 ? LR - dup * 16 : LR + dup * 14;
        n.line.setAttribute("stroke", INK); n.line.setAttribute("stroke-width", i === state.focus ? 2.2 : 1.5); n.line.setAttribute("stroke-dasharray", "none");
        n.tx.setAttribute("fill", INK); n.tx.setAttribute("font-weight", 700);
        g.setAttribute("transform", "translate(" + (LC.x + r * Math.cos(a)).toFixed(1) + "," + (LC.y + r * Math.sin(a)).toFixed(1) + ")");
        gLeadMarks.appendChild(g);
      } else {
        var b = HORIZ_AX[L] * Math.PI / 180, r2 = 44 - dup * 14;
        wheelH.axes[L].setAttribute("stroke", INK); wheelH.axes[L].setAttribute("stroke-width", 2);
        wheelH.labels[L].setAttribute("fill", INK); wheelH.labels[L].setAttribute("font-weight", 700);
        g.setAttribute("transform", "translate(" + (r2 * Math.cos(b)).toFixed(1) + "," + (r2 * Math.sin(b)).toFixed(1) + ")");
        wheelH.markG.appendChild(g);
      }
      g.setAttribute("data-lead", L);
      panels[i].cv.setAttribute("aria-label", "Lead " + L + " trace, " + COND[state.cond].name + (i === state.focus ? ". Focus lead: tap a bump to jump to the moment that made it." : ""));
      panels[i].wrap.classList.toggle("is-focus", i === state.focus);
      panels[i].btn.setAttribute("aria-pressed", i === state.focus ? "true" : "false");
      panels[i].note.textContent = i === state.focus ? "" : s0(i);
    });
    document.getElementById("ecgcWheels").setAttribute("aria-label", "Chest lead wheel. Selected leads: " + SLOTS.map(function (s, i) { return s + " " + state.leads[i]; }).join(", "));
  }
  function s0(i) { return SLOTS[i] + (FRONTAL_AX[state.leads[i]] !== undefined ? " on the heart" : " on the chest wheel"); }

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
    var q = seg(state.cond, "QRS"), qrsEl = document.getElementById("ecgcQrs");
    qrsEl.textContent = "QRS " + (q[2] - q[1]) + " ms";
    qrsEl.setAttribute("data-qrs", q[2] - q[1]);
  }

  /* ---------- Rendering ---------- */
  function prog(win, t) { if (!win) return -1; return Math.max(0, Math.min(1, (t - win[0]) / win[1])); }
  var linkSvg = document.getElementById("ecgcLink"), stage = document.querySelector(".ecgc-stage");
  var linkLine = el("line", { "stroke-width": 1.6, opacity: 0 }, linkSvg);
  var linkDot = el("circle", { r: 3.5, opacity: 0 }, linkSvg);
  var currentBump = null;

  function renderHeart(t) {
    var c = COND[state.cond], M = MODEL[state.cond];
    var ventFade = t < M.tS ? 1 : Math.max(0, 1 - (t - M.tS) / (M.tE - M.tS));
    var atrFade = t < 150 ? 1 : Math.max(0, 1 - (t - 150) / (M.qend - 150));
    ["RA", "LA"].forEach(function (r) {
      var n = atrialNodes[r], f = prog(ATRIAL_TIME[r], t);
      n.s1.setAttribute("offset", f); n.s2.setAttribute("offset", Math.min(1, f + 0.05));
      n.over.setAttribute("opacity", f > 0 ? atrFade : 0);
    });
    M.pts.forEach(function (p, i) {
      var on = t >= p.ta ? (p.slow ? 2 : 1) : 0, n = myoNodes[i];
      if (on !== n.on) { n.dot.setAttribute("opacity", on === 1 ? 1 : 0); n.chev.setAttribute("opacity", on === 2 ? 1 : 0); n.on = on; }
    });
    gMyo.setAttribute("opacity", ventFade.toFixed(2));
    Object.keys(pathNodes).forEach(function (p) {
      var n = pathNodes[p], f = prog(c.path[p], t), isBlock = c.blockAt === p, unused = !c.path[p] && !isBlock;
      var fade = ATRIAL[p] ? (p === "avn" ? ventFade : atrFade) : ventFade;
      n.act.setAttribute("opacity", f > 0 ? fade : 0);
      n.act.setAttribute("stroke-dashoffset", (n.len * (1 - Math.max(0, f))).toFixed(1));
      var h = heads[p];
      if (f > 0 && f < 1) {
        var l = n.len * f, pt = n.act.getPointAtLength(l), p2 = n.act.getPointAtLength(Math.min(n.len, l + 1)), p1 = n.act.getPointAtLength(Math.max(0, l - 1));
        var ang = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
        h.setAttribute("transform", "translate(" + pt.x.toFixed(1) + "," + pt.y.toFixed(1) + ") rotate(" + ang.toFixed(0) + ")");
        h.setAttribute("opacity", 1);
      } else h.setAttribute("opacity", 0);
    });
    saNode.setAttribute("fill", t >= 0 && t < 14 ? BLUE : GREY);

    // The heart vector: frontal part on the heart (from the centre of the lead lines), horizontal part on the chest wheel.
    var v = vectorAt(state.cond, t), isT = t >= M.tS && t <= M.tE, isST = t >= M.qend && t < M.tS, dashed = isT || isST;
    var o = t < 100 ? { x: 240, y: 100 } : LC;
    var fm = Math.hypot(v.x, v.y), hm = Math.hypot(v.x, v.z), rad = Math.atan2(v.y, v.x);
    var onH = hm >= .03, LH = onH ? Math.min(42, 8 + 28 * hm) / hm : 0;
    wheelH.vec.setAttribute("x2", (v.x * LH).toFixed(1)); wheelH.vec.setAttribute("y2", (v.z * LH).toFixed(1));
    wheelH.vec.setAttribute("opacity", onH ? 1 : 0); wheelH.vec.setAttribute("stroke-dasharray", dashed ? "5 4" : "none");
    var show = fm >= 0.03;
    gArrow.setAttribute("opacity", show ? 1 : 0);
    if (show) {
      var len = 22 + 60 * Math.min(fm, 1.3), ex = o.x + len * Math.cos(rad), ey = o.y + len * Math.sin(rad);
      arrowLine.setAttribute("x1", o.x); arrowLine.setAttribute("y1", o.y);
      arrowLine.setAttribute("x2", ex.toFixed(1)); arrowLine.setAttribute("y2", ey.toFixed(1));
      arrowLine.setAttribute("stroke-dasharray", dashed ? "10 7" : "none");
      arrowTail.setAttribute("cx", o.x); arrowTail.setAttribute("cy", o.y);
      arrowText.setAttribute("x", (ex + 16 * Math.cos(rad)).toFixed(1));
      arrowText.setAttribute("y", (ey + 16 * Math.sin(rad) + 5).toFixed(1));
      arrowText.setAttribute("text-anchor", Math.cos(rad) >= 0.3 ? "start" : Math.cos(rad) <= -0.3 ? "end" : "middle");
      arrowText.textContent = isT ? "T vector" : isST ? "ST vector" : "";
    }
  }

  // Solid up to `from`, then dashes: a blocked route stays clearly drawn, but the part the impulse never travels is dashed.
  function dashAfter(len, from) {
    var a = [from.toFixed(1)], pos = from;
    while (pos < len) { a.push(4, 6); pos += 10; }
    a.push(0, 1000);
    return a.join(" ");
  }
  function renderBlock() {
    var c = COND[state.cond];
    while (gBlock.firstChild) gBlock.removeChild(gBlock.firstChild);
    while (gMarks.firstChild) gMarks.removeChild(gMarks.firstChild);
    Object.keys(pathNodes).forEach(function (p) { pathNodes[p].base.setAttribute("stroke-dasharray", "none"); });
    if (!c.blockAt) { blockText.setAttribute("opacity", 0); return; }
    var bn = pathNodes[c.blockAt], at = bn.len * (c.blockAt === "rb" ? 0.3 : 0.5), pt = bn.act.getPointAtLength(at);
    // Orange hatching under every stretch the impulse cannot travel; dark dashed line on top.
    c.blocked.forEach(function (p) {
      var n = pathNodes[p], from = p === c.blockAt ? at : 0;
      el("path", { d: PATHS[p], fill: "none", stroke: "url(#ecgcHatch)", "stroke-width": 9, "stroke-linecap": "butt", opacity: .6,
        "stroke-dasharray": "0 " + from.toFixed(1) + " " + n.len.toFixed(1) + " 0" }, gBlock);
      n.base.setAttribute("stroke-dasharray", p === c.blockAt ? dashAfter(n.len, at) : "6 4");
    });
    el("path", { d: "M-7,-7 L7,7 M7,-7 L-7,7", stroke: INK, "stroke-width": 3.5, "stroke-linecap": "round", transform: "translate(" + pt.x + "," + pt.y + ")" }, gMarks);
    var isR = c.blockAt === "rb";
    blockText.setAttribute("x", isR ? pt.x - 12 : pt.x + 10);
    blockText.setAttribute("y", isR ? pt.y - 9 : pt.y + 4);
    blockText.setAttribute("text-anchor", isR ? "end" : "start");
    blockText.textContent = "blocked";
    blockText.setAttribute("opacity", 1);
  }

  var FAST_C = "#005A9E", SLOW_C = "#C85A00";
  function renderPanel(i, t) {
    var cv = panels[i].cv, dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return null;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var L = state.leads[i], data = SAMPLES[state.cond][L], isFocus = i === state.focus;
    var left = 34, pw = w - left - 4;
    function X(ms) { return left + ms / CYCLE * pw; }
    // Fixed gain; the baseline is placed per lead so this beat's tallest R and deepest S both fit (centred if it is tight).
    var top = isFocus ? 25 : 3, dr = dataRange(state.cond, L), span = (dr[1] - dr[0]) * GAIN;
    if (isFocus && span > h - top - 3) top = 3; // a very tall beat may run up behind the bump tags rather than be clipped
    var avail = h - top - 3;
    var y0 = span <= avail ? top + dr[1] * GAIN + (avail - span) / 2 : top + avail / 2 + (dr[1] + dr[0]) / 2 * GAIN;
    function Y(mv) { return y0 - mv * GAIN; }
    var rg = [(y0 - h) / GAIN, (y0 - top) / GAIN];
    ctx.lineWidth = 1;
    for (var ms = 0; ms <= CYCLE; ms += 40) {
      ctx.strokeStyle = ms % 200 === 0 ? "#C9C5BE" : "#ECE9E4";
      ctx.beginPath(); ctx.moveTo(X(ms) + .5, 0); ctx.lineTo(X(ms) + .5, h); ctx.stroke();
    }
    for (var mv = Math.ceil(rg[0] * 2) / 2; mv <= rg[1]; mv += .5) {
      ctx.strokeStyle = mv === 0 ? "#B9B5AE" : "#DDD9D2";
      ctx.beginPath(); ctx.moveTo(left, Math.round(Y(mv)) + .5); ctx.lineTo(w, Math.round(Y(mv)) + .5); ctx.stroke();
    }
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5;
    // 1 mV calibration pulse at the trace gain, on the baseline (moved down only if the baseline is too high to fit it).
    var cb = Math.min(h - 3, Math.max(Y(0), top + GAIN + 2)), ct = cb - GAIN;
    ctx.beginPath(); ctx.moveTo(4, cb); ctx.lineTo(10, cb); ctx.lineTo(10, ct); ctx.lineTo(18, ct); ctx.lineTo(18, cb); ctx.lineTo(24, cb); ctx.stroke();
    ctx.fillStyle = "#111"; ctx.font = "11px 'Source Sans 3', sans-serif";
    ctx.fillText("1 mV", 2, Math.max(isFocus ? top + 9 : 11, ct - 3));
    ctx.save(); ctx.beginPath(); ctx.rect(0, top - 2, w, h - top + 2); ctx.clip();
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
    ctx.restore();
    var link = null;
    if (isFocus) {
      // Each bump drawn so far, styled by its cause: blue + solid arrowhead = fast route; orange + chevrons = slow cell to cell.
      var bs = bumpsFor(state.cond, L), lastB = null, rowEnd = [-1e9, -1e9];
      ctx.font = "700 11px 'Source Sans 3', sans-serif";
      bs.forEach(function (b, bi) {
        if (b.start > cut) return;
        var col = b.slow ? SLOW_C : FAST_C, e = Math.min(b.end, cut);
        ctx.strokeStyle = col; ctx.lineWidth = 3.2; ctx.setLineDash(b.slow ? [6, 3] : []);
        ctx.beginPath();
        for (var t2 = b.start; t2 <= e; t2++) { if (t2 === b.start) ctx.moveTo(X(t2), Y(data[t2])); else ctx.lineTo(X(t2), Y(data[t2])); }
        ctx.stroke(); ctx.setLineDash([]);
        // Tag in the band above the trace (two staggered rows), with a thin leader down to the bump's peak.
        var tag = b.name + (b.slow ? " \u00bb slow" : " \u25b6 fast");
        var tw = ctx.measureText(tag).width, px = X(b.peak);
        var tx0 = Math.max(left, Math.min(w - tw - 34, px - tw / 2));
        var c0 = Math.max(tx0, rowEnd[0] + 6), c1 = Math.max(tx0, rowEnd[1] + 6), row = c0 <= c1 ? 0 : 1, tx = row ? c1 : c0;
        rowEnd[row] = tx + tw;
        var ty = row ? 22 : 10;
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash(b.slow ? [2, 2] : []);
        ctx.beginPath(); ctx.moveTo(px, ty + 2); ctx.lineTo(px, Y(b.amp) + (b.sign > 0 ? -3 : 3)); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(tx - 2, ty - 10, tw + 4, 13);
        ctx.fillStyle = col; ctx.fillText(tag, tx, ty);
        lastB = b;
      });
      var inB = null;
      bs.forEach(function (b) { if (t >= b.start && t <= b.end + 12) inB = b; });
      currentBump = inB;
      panels[i].note.textContent = inB ? inB.short : lastB && t < MODEL[state.cond].tS ? lastB.short : "Focus lead: tap a bump";
      if (inB) link = { x: X(inB.peak), y: Y(inB.amp), b: inB };
    }
    ctx.strokeStyle = "#4E5968"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(t), 0); ctx.lineTo(X(t), h); ctx.stroke();
    ctx.fillStyle = "#4E5968";
    ctx.beginPath(); ctx.arc(X(t), Y(data[cut]), 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111"; ctx.font = "700 13px 'Source Sans 3', sans-serif";
    ctx.fillText(L, w - 30, isFocus ? 44 : 14);
    return link;
  }

  function renderLink(link, i) {
    var on = !!link;
    [linkLine, linkDot].forEach(function (n) { n.setAttribute("opacity", on ? 1 : 0); });
    clusterRing.setAttribute("opacity", on ? 1 : 0);
    if (!on) return;
    var sr = stage.getBoundingClientRect(), cr = panels[i].cv.getBoundingClientRect(), col = link.b.slow ? SLOW_C : FAST_C;
    var m = gHeart.getScreenCTM(), cp = new DOMPoint(link.b.cluster.x, link.b.cluster.y).matrixTransform(m);
    var x1 = cr.left - sr.left + link.x, y1 = cr.top - sr.top + link.y, x2 = cp.x - sr.left, y2 = cp.y - sr.top;
    var ringR = 22 * m.a, dx = x1 - x2, dy = y1 - y2, dl = Math.hypot(dx, dy) || 1;
    linkLine.setAttribute("x1", x1.toFixed(1)); linkLine.setAttribute("y1", y1.toFixed(1));
    linkLine.setAttribute("x2", (x2 + dx / dl * ringR).toFixed(1)); linkLine.setAttribute("y2", (y2 + dy / dl * ringR).toFixed(1));
    linkLine.setAttribute("stroke", col); linkLine.setAttribute("stroke-dasharray", link.b.slow ? "6 4" : "none");
    linkDot.setAttribute("cx", x1.toFixed(1)); linkDot.setAttribute("cy", y1.toFixed(1)); linkDot.setAttribute("fill", col);
    clusterRing.setAttribute("cx", link.b.cluster.x.toFixed(1)); clusterRing.setAttribute("cy", link.b.cluster.y.toFixed(1));
    clusterRing.setAttribute("stroke", col); clusterRing.setAttribute("stroke-dasharray", link.b.slow ? "5 3" : "none");
  }

  var lastSentence = "";
  function evT(c, e) { return typeof e === "number" ? e : MODEL[c].ev[e]; }
  function sentenceAt(t) {
    if (state.step) { var st = curSteps(); var s = st[state.stepIdx]; return "Step " + (state.stepIdx + 1) + " of " + st.length + ": " + s.text; }
    var lists = [SHARED_START, COND[state.cond].text];
    for (var j = 0; j < lists.length; j++) for (var i = 0; i < lists[j].length; i++) {
      var s2 = lists[j][i]; if (t >= evT(state.cond, s2[0]) && t < evT(state.cond, s2[1])) return s2[2];
    }
    return REST;
  }

  function render() {
    var t = state.t;
    renderHeart(t);
    var link = null;
    for (var i = 0; i < panels.length; i++) { var l = renderPanel(i, t); if (l) link = l; }
    renderLink(link, state.focus);
    document.getElementById("ecgcMs").textContent = Math.round(t);
    scrub.value = Math.round(t);
    scrub.setAttribute("aria-valuetext", Math.round(t) + " ms after the SA node fires");
    thumb.style.left = (t / CYCLE * 100) + "%";
    var segs = COND[state.cond].segs;
    for (var j = 0; j < segs.length; j++) segNodes[j].classList.toggle("is-now", t >= segs[j][1] && t < segs[j][2]);
    // Paused on a bump of the focus lead: explain that bump.
    var s = !state.step && !state.playing && link && t >= link.b.start && t <= link.b.end ? link.b.sentence : sentenceAt(t);
    if (s !== lastSentence) { document.getElementById("ecgcSentence").textContent = s; lastSentence = s; }
  }

  /* ---------- Clock and controls ---------- */
  var playBtn = document.getElementById("ecgcPlay"), stepBtn = document.getElementById("ecgcStep");
  var backBtn = document.getElementById("ecgcBack"), nextBtn = document.getElementById("ecgcNext");
  function setPlaying(p) {
    if (p && state.step) setStepMode(false);
    state.playing = p;
    playBtn.textContent = p ? "Pause" : "Play";
    playBtn.setAttribute("aria-pressed", p ? "false" : "true");
    playBtn.setAttribute("aria-label", p ? "Pause" : "Play");
  }
  var STEPS = {};
  function curSteps() { var L = state.leads[state.focus], k = state.cond + "|" + L; return STEPS[k] || (STEPS[k] = stepsFor(state.cond, L)); }
  function goStep(i) {
    var st = curSteps();
    state.stepIdx = Math.max(0, Math.min(st.length - 1, i));
    state.t = st[state.stepIdx].t;
    backBtn.disabled = state.stepIdx === 0; nextBtn.disabled = state.stepIdx === st.length - 1;
    lastSentence = ""; render();
  }
  function setStepMode(on) {
    if (state.step === on) return;
    state.step = on;
    stepBtn.setAttribute("aria-pressed", on ? "true" : "false");
    backBtn.hidden = nextBtn.hidden = !on;
    if (on) { state.playing = false; playBtn.textContent = "Play"; playBtn.setAttribute("aria-label", "Play"); goStep(0); }
    else { lastSentence = ""; }
  }
  stepBtn.addEventListener("click", function () { setStepMode(!state.step); if (!state.step) render(); });
  backBtn.addEventListener("click", function () { goStep(state.stepIdx - 1); });
  nextBtn.addEventListener("click", function () { goStep(state.stepIdx + 1); });
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
  scrub.addEventListener("input", function () { setStepMode(false); setPlaying(false); state.t = Math.max(0, Math.min(CYCLE - 1, +scrub.value)); render(); });

  function leadsChanged() {
    layoutLeads();
    if (state.step) goStep(Math.min(state.stepIdx, curSteps().length - 1)); else { lastSentence = ""; render(); }
  }
  var condBtns = Array.prototype.slice.call(document.querySelectorAll(".ecgc-cond-btn"));
  function setCondition(c) {
    if (!COND[c]) return;
    state.cond = c;
    condBtns.forEach(function (b) { var on = b.getAttribute("data-cond") === c; b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    buildSegs(); renderBlock(); layoutMyo(); layoutLeads(); lastSentence = "";
    if (state.step) goStep(0); else render();
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

  if (reduced) state.t = MODEL.normal.ev.q1 + 15;
  setPlaying(state.playing);
  setCondition("normal");
  requestAnimationFrame(tick);

  // Small hook for automated checks.
  window.ECGConduction = {
    state: state,
    setTime: function (t) { setStepMode(false); setPlaying(false); state.t = Math.max(0, Math.min(CYCLE - 1, t)); render(); },
    setCondition: setCondition,
    setLead: function (i, L) { panels[i].sel.value = L; state.leads[i] = L; leadsChanged(); },
    setFocus: function (i) { state.focus = i; leadsChanged(); },
    vectorAt: vectorAt,
    sample: function (c, L, t) { return SAMPLES[c][L][t]; },
    axes: { frontal: FRONTAL_AX, horizontal: HORIZ_AX, chestGain: CHEST_GAIN },
    segs: function (c) { return COND[c].segs; },
    bumps: function (c, L) { return bumpsFor(c, L).map(function (b) { return { name: b.name, start: b.start, end: b.end, peak: b.peak, amp: b.amp, slow: b.slow, label: b.label }; }); },
    steps: function (c, L) { return stepsFor(c, L || state.leads[state.focus]).map(function (s) { return { id: s.id, t: s.t, text: s.text }; }); },
    stepMode: setStepMode,
    goStep: function (id) { var st = curSteps(); for (var i = 0; i < st.length; i++) if (st[i].id === id) { goStep(i); return true; } return false; },
    // Anatomy check: samples of each drawn conduction route that fall inside a chamber cavity (the moderator band is allowed to).
    cavityHits: function () {
      var out = {};
      Object.keys(PATHS).forEach(function (p) {
        var n = pathNodes[p], hits = 0;
        var outside = 0;
        for (var s = 0; s <= n.len; s += 2) {
          var q = n.base.getPointAtLength(s), pt = new DOMPoint(q.x, q.y);
          if (!silPath.isPointInFill(pt)) outside++;
          for (var k = 0; k < cavityNodes.length; k++) if (cavityNodes[k].isPointInFill(pt)) { hits++; break; }
        }
        out[p] = hits;
        if (outside) out[p + ":outsideHeart"] = outside;
      });
      return out;
    },
    bundleStyle: function (p) { var b = pathNodes[p].base; return { stroke: b.getAttribute("stroke"), width: +b.getAttribute("stroke-width"), dash: b.getAttribute("stroke-dasharray") || "none" }; },
    model: function (c) { var M = MODEL[c]; return { qon: M.qon, qend: M.qend, fracSlow: M.fracSlow, points: M.pts.length, slowPoints: M.pts.filter(function (p) { return p.slow; }).length }; },
    qrsWidth: function () { var q = seg(state.cond, "QRS"); return q[2] - q[1]; }
  };
})();
