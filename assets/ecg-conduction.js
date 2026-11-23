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
  var P_WAVE = [[35, 14, .04, .156, .09], [65, 14, .10, .078, -.01]]; // II peak about 0.16 mV; V1 biphasic with similar halves (LITFL)
  // The heart vector. Each component is [centre ms, width ms, x, y, z] in mV (x = patient's left, y = inferior,
  // z = anterior), then the muscle region that makes it and whether it is reached slowly, cell to cell (1) or by the fast route (0).
  var VEC = {
    normal: [
      [172, 6, -.14, -.05, .1, "SEP", 0],   // septum, left to right: small q in I, aVL, V5, V6 (under 25% of R); small r in V1
      [186, 8, .3, .4, .3, "LVA", 0],       // apex and anterior wall
      [200, 10, .9, .65, -.45, "LVW", 0],  // LV free wall dominates: leftward, inferior, posterior
      [224, 10, -.1, -.2, -.28, "LVB", 0],  // base last: superior, posterior (blends into the S in V2, no notch)
      [435, 42, .25, .2, .08]                // T: concordant in most leads; slightly negative in V1, inverted in aVR (LITFL)
    ],
    rbbb: [
      [172, 6, -.14, -.05, .1, "SEP", 0],   // septum still left to right (left bundle intact)
      [186, 8, .3, .4, .3, "LVA", 0],       // apex as in Normal
      [200, 10, .85, .65, -.2, "LVW", 0],   // LV through its own Purkinje fibres (posterior pull partly offset by the early RV front)
      [224, 10, -.1, -.2, -.28, "LVB", 0],  // LV base on time, as in Normal: the S between R and R' in V1 to V3
      [255, 15, -.45, .05, .48, "RV", 1],   // late RV, cell to cell: terminal rightward, anterior vector (R' at least as big as S in V1)
      [460, 42, .3, .2, -.15]                // secondary T, opposite the terminal QRS
    ],
    // LAFB (LITFL): the LV is reached through the posterior fascicle, which inserts on the inferoseptal wall, so the first
    // vector points down and to the right (small r in II, III, aVF; small q in I, aVL); the main wave is delayed (about
    // 20 ms) and spreads up and to the left (tall R in I and aVL, deep S inferiorly): left axis deviation, QRS 80 to 110 ms.
    lafb: [
      [172, 6, -.14, -.05, .1, "SEP", 0],   // septum, left to right, as in Normal
      [182, 8, -.08, .3, .15, "LVA", 0],    // inferoseptal wall first, through the posterior fascicle: down and to the right
      [212, 14, .85, -1.1, -.35, "LVW", 1], // anterosuperior and lateral wall, late, from below: up and to the left
      [236, 10, -.1, -.25, -.28, "LVB", 1], // base last: superior, posterior
      [435, 42, .25, .2, .08]                // T as in Normal (hand-set; see the review list)
    ],
    // Bifascicular block (LITFL): RBBB plus LAFB. The left posterior fascicle is the only fast route left.
    bifasc: [
      [172, 6, -.14, -.05, .1, "SEP", 0],   // septum, left to right (left bundle intact)
      [182, 8, -.08, .3, .15, "LVA", 0],    // inferoseptal wall first, through the posterior fascicle
      [212, 14, .95, -1.1, -.3, "LVW", 1],    // anterosuperior and lateral wall, late, from below: up and to the left
      [236, 10, -.1, -.25, -.28, "LVB", 1], // base: superior, posterior
      [266, 15, -.45, .05, .48, "RV", 1],   // late RV, cell to cell: terminal R' in V1, slurred S in I and V6, as in RBBB
      [465, 42, .3, .2, -.15]                // secondary T as in RBBB (hand-set)
    ],
    lbbb: [
      [176, 6, 0, 0, .14, "RV", 0],         // RV via the right bundle (after the moderator band): small r in V1 at most
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
  var HIS_START = 148;                    // after the AV nodal delay; routes then run at their true speeds and the first muscle is reached at about 160 ms (PR 160 ms)

  var SHARED_START = [
    [0, 12, "The SA node fires. It is too small to show on the ECG, so the trace is still flat."],
    [12, 100, "The impulse spreads through the right atrium, then along Bachmann's bundle to the left atrium: the P wave. Its vector points down and to the left (about +60\u00b0), so P is upright in II, inverted in aVR and biphasic in V1."],
    [100, "his", "The AV node slows the impulse so the atria can finish contracting first. Too little tissue is active to show, so the trace is flat: the PR segment."]
  ];

  var COND = {
    normal: {
      name: "Normal sinus", fast: ["his", "rb", "mod", "purkR", "purkR2", "lb", "laf", "lafF", "lpf", "purkL", "purkLA"], slowAt: {},
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
      name: "RBBB", fast: ["his", "lb", "laf", "lafF", "lpf", "purkL", "purkLA"], blockAt: "rb", blocked: ["rb", "mod", "purkR", "purkR2"],
      slowAt: { RV: 0 }, leadIn: { RV: [184, .2] }, // the slow front leaves the septum as soon as it is depolarised
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
      name: "LBBB", fast: ["his", "rb", "mod", "purkR", "purkR2"], blockAt: "lb", blocked: ["lb", "laf", "lafF", "lpf", "purkL", "purkLA"],
      slowAt: { SEP: 8, LVA: 0, LVW: 0, LVB: 0 }, // only the right-side edge of the septum, next to the right bundle, is fast
      qrs: [160, 300], st: [300, 380, 560], ev: [214, 246, 190],
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
  COND.lafb = {
    name: "LAFB", fast: ["his", "rb", "mod", "purkR", "purkR2", "lb", "lpf", "purkL"], blockAt: "laf", blocked: ["laf", "lafF", "purkLA"],
    slowAt: { LVW: 14, LVB: 14 }, // only muscle beyond the posterior Purkinje fibres' own reach is drawn slow
    qrs: [160, 265], st: [265, 360, 530], ev: [190, 228]
  };
  COND.bifasc = {
    name: "Bifascicular block", fast: ["his", "lb", "lpf", "purkL"], blockAt: ["rb", "laf"], blocked: ["rb", "mod", "purkR", "purkR2", "laf", "lafF", "purkLA"],
    slowAt: { RV: 0, LVW: 14, LVB: 14 }, leadIn: { RV: [184, .2] },
    qrs: [160, 295], st: [295, 375, 555], ev: [190, 246]
  };
  function blocksOf(c) { return c.blockAt ? [].concat(c.blockAt) : []; }
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
  // out-of-plane marker, and its Purkinje fibres reappear on the upper lateral wall; a faint dotted line in front of the
  // slice (lafF) joins the two markers so the route can be followed.
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
    lafF: "M273,238 C312,214 362,204 406,212", // in front of the slice: the anterior fascicle on the front wall
    lpf: "M270,226 C269,250 271,268 276,290 C281,312 290,334 300,352",
    purkL: "M300,352 C312,372 326,383 338,381 C352,381 364,369 371,356 C400,316 408,284 407,262",
    purkLA: "M406,212 C408,226 408,242 407,258"
  };
  var ATRIAL = { intern: 1, intern2: 1, bach: 1, avn: 1 };
  var BUNDLE = { his: 1, rb: 1, mod: 1, lb: 1, laf: 1, lpf: 1 };
  var ATRIAL_PATH_TIME = { sa: [0, 10], intern: [5, 45], intern2: [5, 45], bach: [5, 40], avn: [50, HIS_START - 50] };
  var FAST_ORDER = ["his", "rb", "mod", "purkR", "purkR2", "lb", "laf", "lafF", "lpf", "purkL", "purkLA"];
  var PARENT = { his: null, rb: "his", mod: "rb", purkR: "mod", purkR2: "mod", lb: "his", laf: "lb", lafF: "laf", lpf: "lb", purkL: "lpf", purkLA: "lafF" };
  var FRONT = { lafF: 1 }; // drawn faint and dotted: it runs in front of the slice, so it touches no muscle in this picture
  var PARENT_AT = {};
  // Where along each path (fraction of its length) it starts exciting the muscle next to it. The His bundle and the upper
  // bundle branches are insulated; the right bundle reaches the septal surface low down; the moderator band only at its end.
  var COUPLED = { rb: .45, laf: 0, lpf: .3, purkR: 0, purkR2: 0, purkL: 0, purkLA: 0 };
  // Which muscle each path can excite: a bundle on the septal surface only excites the septum on its own side.
  var COUPLE_TO = { rb: { SEP: 1 }, laf: { SEP: 1 }, lpf: { SEP: 1, LVA: 1 }, purkR: { RV: 1 }, purkR2: { RV: 1, SEP: 1 }, purkL: { LVA: 1, LVW: 1 }, purkLA: { LVW: 1 } };
  var SPEED = { his: V_BUNDLE, rb: V_BUNDLE, mod: V_BUNDLE, lb: V_BUNDLE, laf: V_BUNDLE, lafF: V_BUNDLE, lpf: V_BUNDLE, purkR: V_PURK, purkR2: V_PURK, purkL: V_PURK, purkLA: V_PURK };

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

  // Only the focus lead's axis is drawn across the heart (faint, labelled at its positive end); the full limb-lead
  // hexaxial wheel sits beside the chest wheel.
  var LC = { x: 276, y: 232 }, LR = 158;
  var gFocusAx = el("g", { "aria-hidden": "true" });
  var focusAxLine = el("line", { stroke: "#7B8189", "stroke-width": 1.4, "stroke-dasharray": "6 5", opacity: 0 }, gFocusAx);
  var focusAxPlus = el("circle", { r: 3, fill: "#7B8189", opacity: 0 }, gFocusAx);
  var focusAxText = el("text", { "text-anchor": "middle", "font-size": 13, "font-weight": 600, "font-family": "var(--font-sans)", fill: INK, stroke: "#fff", "stroke-width": 4, "paint-order": "stroke", opacity: 0 }, gFocusAx);

  // Myocardium sample points (filled in by the model): blue dots = fast route, orange chevrons = slow cell to cell.
  var gMyo = el("g", { "aria-hidden": "true" });

  var BASE_DASH = { lafF: "1.2 3.2" };
  var gBlock = el("g", { "aria-hidden": "true" });
  var gPaths = el("g", { "aria-hidden": "true" });
  var pathNodes = {};
  Object.keys(PATHS).forEach(function (p) {
    var w = p === "avn" ? 7 : FRONT[p] ? 1.4 : BUNDLE[p] ? 3.6 : ATRIAL[p] ? 3.2 : 2.6, fastW = ATRIAL[p] ? w + 1 : FRONT[p] ? 2.4 : 5;
    var base = el("path", { d: PATHS[p], fill: "none", stroke: FRONT[p] ? "#8A9097" : BUNDLE[p] ? DARK : GREY, "stroke-width": w, "stroke-linecap": "round" }, gPaths);
    if (FRONT[p]) base.setAttribute("stroke-dasharray", BASE_DASH[p]);
    var act = el("path", { d: PATHS[p], fill: "none", stroke: BLUE, "stroke-width": fastW, "stroke-linecap": "round", "stroke-opacity": FRONT[p] ? .75 : 1, opacity: 0 }, gPaths);
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
  // Hover notes (wide invisible strokes) on the two parts of the anterior fascicle that leave or re-enter this slice.
  var gTips = el("g", {});
  [["lafF", "Anterior fascicle, on the front wall (in front of this slice): it joins the two \u2299 markers"],
    ["purkLA", "Purkinje fibres of the anterior fascicle, coming back into this slice on the upper lateral wall: the end of the same route, not a separate pathway"]].forEach(function (tp) {
    var h = el("path", { d: PATHS[tp[0]], fill: "none", stroke: "#000", "stroke-opacity": 0, "stroke-width": 12, "pointer-events": "stroke" }, gTips);
    el("title", {}, h).textContent = tp[1];
  });

  // The whole drawing is scaled down a little inside the frame so the label columns get a clear gutter.
  var HS = 0.86, HC = { x: 277, y: 215 };
  var gHeart = document.createElementNS(NS, "g");
  gHeart.setAttribute("transform", "translate(" + (HC.x * (1 - HS)).toFixed(2) + "," + (HC.y * (1 - HS)).toFixed(2) + ") scale(" + HS + ")");
  Array.prototype.slice.call(svg.childNodes).forEach(function (n) { if (n !== defs) gHeart.appendChild(n); });
  svg.appendChild(gHeart);
  function T(x, y) { return [HC.x + HS * (x - HC.x), HC.y + HS * (y - HC.y)]; }

  // Two aligned label columns, evenly spaced, ordered by target height so leaders never cross. Each leader is a short
  // horizontal run into the gutter, then one straight segment to a small dot on the target (heart coordinates).
  var LAB_L = [["SA node", 177, 50], ["Internodal routes", 128, 112], ["Coronary sinus", 230, 140], ["AV node", 263, 146],
    ["Tricuspid valve", 172, 172], ["Right bundle", 245, 245], ["Moderator band", 212, 285, "crosses the RV cavity"], ["Purkinje fibres", 200, 292]];
  var LAB_R = [["Bachmann's bundle", 290, 47], ["Interatrial septum", 264, 100], ["Fibrous AV ring", 402, 141], ["Mitral valve", 372, 160],
    ["His bundle", 266, 166], ["Left bundle", 269, 212], ["Anterior fascicle", 274, 239, "front wall, dotted \u2299"], ["Posterior fascicle", 271, 272],
    ["Purkinje fibres", 408, 300, "top \u2299: anterior fascicle's"], ["Septum", 258, 330]];
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
  // Depth through the wall for each point: 0 at the endocardium (cavity side), 1 at the epicardium (outer surface).
  (function () {
    var epi = [], endo = [];
    for (var y = 120; y <= 432; y += 3) for (var x = 96; x <= 466; x += 3) {
      var pt = new DOMPoint(x, y);
      if (!silPath.isPointInFill(pt)) { if (y > groove(x) + 2) epi.push([x, y]); continue; }
      for (var k = 0; k < cavityNodes.length; k++) if (cavityNodes[k].isPointInFill(pt)) { endo.push([x, y]); break; }
    }
    GRID.forEach(function (g) {
      var de = Infinity, dn = Infinity;
      epi.forEach(function (q) { var d = Math.hypot(q[0] - g.x, q[1] - g.y); if (d < de) de = d; });
      endo.forEach(function (q) { var d = Math.hypot(q[0] - g.x, q[1] - g.y); if (d < dn) dn = d; });
      g.depth = dn / Math.max(1, dn + de);
    });
  })();
  // Recovery (repolarisation) map, a teaching picture: recovery time = activation time + local action potential
  // duration (APD). APD belongs to the place, not the condition: it is shorter at the epicardium (Klabunde; Franz 1987:
  // epicardium recovers about 6% of QT, roughly 25 ms, before the endocardium) and shorter where normal activation is
  // later (Franz 1987: slope -1.32). In a bundle branch block the APDs stay put but activation changes, so recovery
  // follows the abnormal activation: the secondary T wave change.
  var APD_EPI = 25, APD_SLOPE = 1.32;

  // The activation map is a visual timing guide only (dots, chevrons, bump-to-heart links, story moments).
  // Its times are re-mapped onto the idealised vector's timeline, so the picture and the traces line up.
  var MODEL = {};
  // Standard normal CDF and its inverse (Acklam's approximation), for bell-shaped activation timing.
  function normCdf(z) { var t = 1 / (1 + .2316419 * Math.abs(z)), d = .3989423 * Math.exp(-z * z / 2), q = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - q : q; }
  function normInv(p) {
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239],
      b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
      c = [-.007784894002430293, -.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
      d = [.007784695709041462, .3224671290700398, 2.445134137142996, 3.754408661907416], q, r;
    if (p < .02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - .02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - .5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
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
      // Slow (orange chevrons) only where the block forces cell-to-cell spread; elsewhere the short hop from the
      // Purkinje ends through the wall is part of the normal fast activation and is drawn blue.
      var sa = C.slowAt[g.g];
      return { x: g.x, y: g.y, g: g.g, ta0: ta[i], ta: ta[i], slow: sa !== undefined && md[i] > sa, d2: [dx / m, dy / m] };
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
    // A region with no component of its own keeps its Normal window if the block does not affect it; otherwise it
    // shares the window of the region activated at the most similar time.
    if (c !== "normal") Object.keys(rmin).forEach(function (g) { if (!win[g] && C.slowAt[g] === undefined && MODEL.normal && MODEL.normal.win[g]) win[g] = MODEL.normal.win[g]; });
    var rmed = {};
    Object.keys(rmin).forEach(function (g) { var a = pts.filter(function (p) { return p.g === g; }).map(function (p) { return p.ta0; }).sort(function (x, y) { return x - y; }); rmed[g] = a[a.length >> 1]; });
    Object.keys(rmin).forEach(function (g) {
      if (win[g]) return;
      var bestG = null; Object.keys(win).forEach(function (h) { if (rmed[h] !== undefined && (bestG === null || Math.abs(rmed[h] - rmed[g]) < Math.abs(rmed[bestG] - rmed[g]))) bestG = h; });
      if (bestG) win[g] = win[bestG];
    });
    // Each region keeps its own activation order (rank), and its activation density follows the vector component's
    // bell shape, so the muscle lights up most at the moment its component peaks. A lead-in lets a slow front start
    // as soon as its neighbour is depolarised (RBBB: from the septum into the RV).
    var byReg = {};
    pts.forEach(function (p) { (byReg[p.g] = byReg[p.g] || []).push(p); });
    Object.keys(byReg).forEach(function (g) {
      var w = win[g], arr = byReg[g].slice().sort(function (a, b) { return a.ta0 - b.ta0; }), n = arr.length, li = C.leadIn && C.leadIn[g];
      if (!w) { arr.forEach(function (p) { p.ta = lin(p.ta0); }); return; }
      var cw = (w.a + w.b) / 2, hw = (w.b - w.a) / 2, z0 = 1.6, lo = normCdf(-z0), hi = normCdf(z0);
      arr.forEach(function (p, r) {
        var u = (r + .5) / n;
        if (li && u < li[1]) { p.ta = li[0] + u / li[1] * (w.a - li[0]); return; }
        if (li) u = (u - li[1]) / (1 - li[1]);
        p.ta = cw + hw / z0 * normInv(lo + u * (hi - lo));
      });
    });
    // Fast routes run at their true speeds (Klabunde: bundles about 2 m/s, Purkinje about 4 m/s) in every condition,
    // so a route takes the same time whichever condition is shown; only blocked and slow routes differ.
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
    var M = { pts: pts, groups: groups, total: total, qon: qon, qend: qend, tS: tS, tE: tE, win: win };
    M.fracSlow = pts.filter(function (p) { return p.slow; }).length / pts.length;
    // Story moments come from the vector: the centre of the strongest matching component.
    M.med = function (regs, slow) {
      var best = null, bm = -1;
      V.forEach(function (k) { if (!k[5] || regs.indexOf(k[5]) < 0 || (slow !== undefined && !!k[6] !== slow)) return; var m = Math.hypot(k[2], k[3], k[4]); if (m > bm) { bm = m; best = k[0]; } });
      return best === null ? qon : best;
    };
    // Recovery: order from activation time + APD; timed (bell-shaped, like activation) onto the T component, so the
    // middle of recovery falls at the T peak. ST stays fully depolarised.
    var TK = V.filter(function (k) { return !k[5]; }).sort(function (a, b) { return b[0] - a[0]; })[0];
    var ref = c === "normal" ? pts : MODEL.normal.pts, t0 = Infinity;
    ref.forEach(function (p) { t0 = Math.min(t0, p.ta); });
    pts.forEach(function (p, i) { p.depth = GRID[i].depth; p.apd = -APD_SLOPE * (ref[i].ta - t0) - APD_EPI * p.depth; p.tr0 = p.ta + p.apd; });
    (function () {
      var arr = pts.slice().sort(function (a, b) { return a.tr0 - b.tr0; }), n = arr.length, z0 = 1.6, lo = normCdf(-z0), hi = normCdf(z0);
      arr.forEach(function (p, r) { p.tr = Math.max(tS + 2, Math.min(tE - 2, TK[0] + TK[1] * normInv(lo + (r + .5) / n * (hi - lo)))); });
    })();
    // Direction the recovery front travels at each point (gradient of recovery time over neighbours).
    pts.forEach(function (p) {
      var gx = 0, gy = 0, sxx = 0, syy = 0, sxy = 0;
      pts.forEach(function (q) {
        var dx = q.x - p.x, dy = q.y - p.y; if (q === p || dx * dx + dy * dy > 2.3 * SPACING * SPACING) return;
        var dt = q.tr - p.tr; gx += dx * dt; gy += dy * dt; sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
      });
      var det = sxx * syy - sxy * sxy, ax = det ? (syy * gx - sxy * gy) / det : 0, ay = det ? (sxx * gy - sxy * gx) / det : 0, m = Math.hypot(ax, ay) || 1;
      p.rd = [ax / m, ay / m]; p.rg = [ax, ay];
    });
    var trs = pts.map(function (p) { return p.tr; }).sort(function (a, b) { return a - b; });
    M.rec = { first: trs[0], median: trs[trs.length >> 1], last: trs[trs.length - 1] };
    // Recovery dipole in the picture plane (x right = patient's left, y down = inferior): points towards the muscle
    // that recovers early, opposite to the way the recovery front travels.
    M.recDipole = (function () {
      var cx = 0, cy = 0, mt = 0; pts.forEach(function (p) { cx += p.x; cy += p.y; mt += p.tr; }); cx /= pts.length; cy /= pts.length; mt /= pts.length;
      var dx = 0, dy = 0; pts.forEach(function (p) { dx += (p.x - cx) * (mt - p.tr); dy += (p.y - cy) * (mt - p.tr); });
      return { x: dx, y: dy };
    })();
    M.ev = { his: HIS_START, hisEnd: Math.round(path.his[0] + path.his[1]), qon: qon, qend: qend, tS: tS, tE: tE, q1: C.ev[0], q2: C.ev[1], q1a: C.ev[2] || C.ev[0] };
    return M;
  }
  ["normal", "rbbb", "lbbb", "lafb", "bifasc"].forEach(function (c) { MODEL[c] = buildModel(c); });
  function vectorAt(c, t) {
    // Linear between whole milliseconds, so the vector glides at very slow speeds (0.01x) instead of stepping.
    var M = MODEL[c], u = Math.max(0, Math.min(CYCLE - 1, t)), i = Math.floor(u), j = Math.min(CYCLE - 1, i + 1), f = u - i, T = M.total;
    return { x: T.x[i] + (T.x[j] - T.x[i]) * f, y: T.y[i] + (T.y[j] - T.y[i]) * f, z: T.z[i] + (T.z[j] - T.z[i]) * f };
  }

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
      var top = score[0] || { g: "LVW", slow: false, k: "LVW|fast" };
      // Up to three contributors of the same kind (fast or slow), told in the order they were activated.
      var used = score.filter(function (o) { return o.slow === top.slow && o.s >= .35 * top.s; }).slice(0, 3);
      if (!used.length) used = [top];
      used.forEach(function (o) {
        var G = M.groups[o.k], w = 0, tw0 = 0;
        for (var t = b.start; t <= b.end; t++) { var p = Math.max(0, project({ x: G.x[t], y: G.y[t], z: G.z[t] }, L) * b.sign); w += p; tw0 += p * t; }
        o.tc = w ? tw0 / w : b.peak;
        var pk = project({ x: G.x[b.peak], y: G.y[b.peak], z: G.z[b.peak] }, L) * b.sign; o.pk = pk;
      });
      used.sort(function (a2, b2) { return a2.tc - b2.tc; });
      var keys = used.map(function (o) { return o.k; }), gtxt = GROUP_NAME[used[0].g];
      for (var u = 1; u < used.length; u++) gtxt += (used[u].tc - used[u - 1].tc >= 15 ? ", then " : " and ") + GROUP_NAME[used[u].g];
      var atPeak = used.slice().sort(function (a2, b2) { return b2.pk - a2.pk; })[0];
      b.slow = top.slow;
      b.groups = gtxt;
      var vs = { x: 0, y: 0, z: 0 }, cx = 0, cy = 0, cn = 0;
      keys.forEach(function (k) { var G = M.groups[k]; for (var t = b.start; t <= b.end; t++) { vs.x += G.x[t]; vs.y += G.y[t]; vs.z += G.z[t]; } });
      var regs = [atPeak.g]; // the ring marks the muscle making most of the bump at its peak
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
    add("his", (HIS_START + E.hisEnd) / 2, "The impulse enters the His bundle, the only way through the fibrous ring: the start of the fast highway.");
    var K = function (g, s) { return g.map(function (x) { return x + "|" + s; }); };
    if (c === "normal") {
      add("bundles", E.qon - 2, "Fast highway: both bundle branches carry the impulse down either side of the septum (bold blue arrows).");
      var ts = M.med(["SEP"]); add("septum", ts, "The left bundle reaches the septum first, so it depolarises left to right. Watch " + L + ": that wavefront is " + sideWord(c, L, Math.round(ts), K(["SEP"], "fast")) + ".");
      var tw = M.med(["LVW", "LVA", "RV"]); add("walls", tw, "Purkinje fibres reach the apex and both walls almost at once (blue dots). The thick left ventricle wins. Watch " + L + ": the net wavefront is " + sideWord(c, L, Math.round(tw)) + ".");
      var tb = M.med(["LVB"]); add("base", tb, "The base of the ventricles is reached last. Watch " + L + ": that wavefront is " + sideWord(c, L, Math.round(tb), K(["LVB"], "fast").concat(K(["LVB"], "slow"))) + ".");
    } else if (c === "rbbb") {
      add("block", E.hisEnd + 3, "The right bundle is blocked (X): there is no fast route into the right ventricle.");
      var tl = M.med(["SEP", "LVW", "LVA"], false); add("fast-left", tl, "Fast highway: the left bundle and its Purkinje fibres activate the septum (left to right) and the left ventricle quickly. Watch " + L + ": the wavefront is " + sideWord(c, L, Math.round(tl)) + ".");
      var tr = M.med(["RV"], true); add("slow-rv", tr, "Slow route: the right ventricle is reached cell to cell through gap junctions from the septum (orange chevrons). Watch " + L + ": that wavefront heads " + sideWord(c, L, Math.round(tr), K(["RV"], "slow")) + ".");
    } else if (c === "lafb" || c === "bifasc") {
      add("block", E.hisEnd + 3, c === "lafb" ? "The left anterior fascicle is blocked (X): no fast route to the front and upper left ventricular wall." :
        "The right bundle and the left anterior fascicle are blocked (X): the left posterior fascicle is the only fast route left.");
      var ti = M.med(["LVA"], false); add("fast-inferior", ti, "Fast highway: the posterior fascicle activates the septum and the inferior LV wall first. Watch " + L + ": that wavefront is " + sideWord(c, L, Math.round(ti), K(["SEP", "LVA"], "fast")) + ".");
      var tu = M.med(["LVW"], true); add("slow-lv-up", tu, "The front and upper LV wall is reached late, from below, partly cell to cell (orange chevrons). Watch " + L + ": that wavefront is " + sideWord(c, L, Math.round(tu), K(["LVW"], "slow")) + ".");
      if (c === "bifasc") { var tr2 = M.med(["RV"], true); add("slow-rv", tr2, "Slow route: the right ventricle is reached cell to cell from the septum, as in RBBB (orange chevrons). Watch " + L + ": that wavefront heads " + sideWord(c, L, Math.round(tr2), K(["RV"], "slow")) + "."); }
    } else {
      add("block", E.hisEnd + 3, "The left bundle is blocked (X): there is no fast route into the left ventricle.");
      var tf = M.med(["RV", "SEP"], false); add("fast-rv", tf, "Fast highway: the right bundle and its Purkinje fibres activate the right ventricle quickly (bold blue arrow). Watch " + L + ": the wavefront is " + sideWord(c, L, Math.round(tf)) + ".");
      var tsp = M.med(["SEP"], true); add("slow-septum", tsp, "Slow route: the impulse crawls cell to cell through gap junctions, right to left across the septum (orange chevrons). Watch " + L + ": that wavefront is " + sideWord(c, L, Math.round(tsp), K(["SEP"], "slow")) + ".");
      var tla = M.med(["LVA"], true); add("slow-lv-wall", tla, "Still slow, cell to cell: the wavefront crawls on through the left ventricular apex and anterior wall. Watch " + L + ": it is heading " + sideWord(c, L, Math.round(tla), K(["LVA"], "slow")) + ".");
      var tlv = M.med(["LVW"], true); add("slow-lv", tlv, "Last, the lateral wall of the left ventricle, still cell to cell. Watch " + L + ": it is heading " + sideWord(c, L, Math.round(tlv), K(["LVW"], "slow")) + ".");
    }
    bumpsFor(c, L).forEach(function (b, i) { add("bump" + (i + 1), b.peak, b.sentence); });
    var sv = arr[Math.round((M.qend + M.tS) / 2) + 5], tv = 0;
    for (var t2 = M.tS; t2 <= M.tE; t2++) if (Math.abs(arr[t2]) > Math.abs(tv)) tv = arr[t2];
    var qa = 0; for (var t3 = M.qon; t3 <= M.qend; t3++) qa += arr[t3];
    add("st", (M.qend + M.tS) / 2 + 5, c === "lbbb" ? "Watch " + L + ": repolarisation is abnormal too, so the ST segment shifts opposite to the main QRS: " + (sv > .03 ? "up" : sv < -.03 ? "down" : "about flat") + " here." :
      "Watch " + L + ": every cell is in its plateau phase, so no current flows and the ST segment stays " + (Math.abs(sv) < .04 ? "flat." : sv > 0 ? "slightly up." : "slightly down."));
    add("t", (M.tS + M.tE) / 2, "Watch " + L + ": the T wave is " + (tv > 0 ? "upright" : "inverted") + ", " + ((tv > 0) === (qa > 0) ? "the same way as" : "opposite to") + " the main QRS. " +
      (c === "normal" ? "The epicardium recovers first, so the reversed charge and reversed direction cancel." : c === "lafb" ? "Recovery follows the activation order, epicardium first." : "Slowly activated muscle recovers out of order: a secondary change."));
    // Time order, and one step for moments under 5 ms apart (the story step keeps its text; a bump's id is kept as an alias).
    steps.forEach(function (st, i) { st.n = i; });
    steps.sort(function (a, b) { return a.t - b.t || a.n - b.n; });
    var out = [];
    steps.forEach(function (st) {
      var pv = out[out.length - 1];
      if (pv && st.t - pv.t < 5) {
        var sb = /^bump/.test(st.id), pb = /^bump/.test(pv.id);
        if (sb && !pb) { pv.ids.push(st.id); pv.t = st.t; return; }
        if (pb && !sb) { out[out.length - 1] = { id: st.id, ids: [st.id].concat(pv.ids), t: pv.t, text: st.text }; return; }
        pv.ids.push(st.id); return;
      }
      out.push({ id: st.id, ids: [st.id], t: st.t, text: st.text });
    });
    return out;
  }

  /* ---------- Muscle points on the heart ---------- */
  // Recovery front: short dark dashes across the front, small arrowheads (every second point) in its direction of travel.
  var REC_C = "#383D44", gRec = el("g", { "aria-hidden": "true", "pointer-events": "none" });
  gPaths.parentNode.insertBefore(gRec, gPaths.nextSibling);
  var myoNodes = GRID.map(function (g, i) {
    var dot = el("circle", { cx: g.x, cy: g.y, r: 1.7, fill: BLUE, opacity: 0 }, gMyo);
    var chev = el("path", { d: "M-2.5,-3 L1.5,0 L-2.5,3", fill: "none", stroke: ORANGE, "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0 }, gMyo);
    var arrowed = ((g.x / SPACING | 0) + (g.y / SPACING | 0)) % 2 === 0;
    var rec = el("path", { d: "M0,-3.6 L0,3.6" + (arrowed ? " M2,-2.9 L5.2,0 L2,2.9" : ""), fill: "none", stroke: REC_C, "stroke-width": 2.3, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0 }, gRec);
    return { dot: dot, chev: chev, rec: rec, on: -1, ro: -1, op: -1 };
  });
  function layoutMyo() {
    var M = MODEL[state.cond];
    M.pts.forEach(function (p, i) {
      var a = Math.atan2(p.d2[1], p.d2[0]) * 180 / Math.PI;
      myoNodes[i].chev.setAttribute("transform", "translate(" + p.x + "," + p.y + ") rotate(" + a.toFixed(0) + ")");
      var ra = Math.atan2(p.rd[1], p.rd[0]) * 180 / Math.PI;
      myoNodes[i].rec.setAttribute("transform", "translate(" + p.x + "," + p.y + ") rotate(" + ra.toFixed(0) + ")");
      myoNodes[i].on = -1; myoNodes[i].ro = -1; myoNodes[i].op = -1;
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
  // Two wheels, same size: limb leads (frontal plane, hexaxial) and chest leads (horizontal plane, front at the bottom).
  function degTxt(d) { return (d > 0 ? "+" + d : String(d).replace("-", "\u2212")) + "\u00b0"; }
  function makeWheel(svgEl, AX, limb) {
    var W = { axes: {}, labels: {}, svg: svgEl };
    el("circle", { cx: 0, cy: 0, r: 40, fill: "none", stroke: GREY, "stroke-width": 1 }, svgEl);
    Object.keys(AX).forEach(function (L) {
      var a = AX[L] * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      if (limb) el("line", { x1: 0, y1: 0, x2: (-40 * c).toFixed(1), y2: (-40 * sn).toFixed(1), stroke: GREY, "stroke-width": .8, "stroke-dasharray": "2 3" }, svgEl);
      W.axes[L] = el("line", { x1: 0, y1: 0, x2: (40 * c).toFixed(1), y2: (40 * sn).toFixed(1), stroke: GREY, "stroke-width": 1 }, svgEl);
      // Label radii are staggered where neighbours would touch (aVF below II and III; V3 below V2 and V4).
      var r = limb ? (L === "aVF" ? 62 : 52) : (L === "V3" ? 63 : L === "V6" ? 53 : 52);
      var t = el("text", { x: (r * c).toFixed(1), y: (r * sn + 4).toFixed(1), "text-anchor": "middle", "font-size": 11, "font-family": "var(--font-sans)", fill: "var(--muted)" }, svgEl);
      t.textContent = limb ? L + " " + degTxt(AX[L]) : L; W.labels[L] = t;
    });
    W.vec = el("line", { x1: 0, y1: 0, x2: 0, y2: 0, stroke: "var(--ecgc-magenta)", "stroke-width": 4, "stroke-linecap": "round", "marker-end": "url(#ecgcHead)" }, svgEl);
    W.markG = el("g", {}, svgEl);
    return W;
  }
  var wheelF = makeWheel(document.getElementById("ecgcWheelF"), FRONTAL_AX, true);
  var wheelH = makeWheel(document.getElementById("ecgcWheelH"), HORIZ_AX, false);
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
      var r = cv.getBoundingClientRect();
      var tc = Math.max(0, Math.min(CYCLE - 1, stripGeom(r.width).toMs(e.clientX - r.left)));
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
    [[wheelF, FRONTAL_AX], [wheelH, HORIZ_AX]].forEach(function (w) {
      Object.keys(w[1]).forEach(function (L) {
        w[0].axes[L].setAttribute("stroke", GREY); w[0].axes[L].setAttribute("stroke-width", 1);
        w[0].labels[L].setAttribute("fill", "var(--muted)"); w[0].labels[L].setAttribute("font-weight", 400);
      });
    });
    var FL = state.leads[state.focus], fOn = FRONTAL_AX[FL] !== undefined;
    [focusAxLine, focusAxPlus, focusAxText].forEach(function (n) { n.setAttribute("opacity", fOn ? 1 : 0); });
    if (fOn) {
      var fa = FRONTAL_AX[FL] * Math.PI / 180, ux = Math.cos(fa), uy = Math.sin(fa), rr = 0;
      focusAxLine.setAttribute("x1", (LC.x - LR * ux).toFixed(1)); focusAxLine.setAttribute("y1", (LC.y - LR * uy).toFixed(1));
      focusAxLine.setAttribute("x2", (LC.x + LR * ux).toFixed(1)); focusAxLine.setAttribute("y2", (LC.y + LR * uy).toFixed(1));
      focusAxPlus.setAttribute("cx", (LC.x + LR * ux).toFixed(1)); focusAxPlus.setAttribute("cy", (LC.y + LR * uy).toFixed(1));
      // Label runs along the axis near its positive end, kept upright.
      var lx = LC.x + .76 * LR * ux, ly = LC.y + .76 * LR * uy, rot = FRONTAL_AX[FL], up = rot > 90 || rot < -90;
      if (up) rot += 180;
      var rr2 = rot * Math.PI / 180;
      lx -= 13 * Math.sin(rr2); ly += 13 * Math.cos(rr2); // just below the line
      focusAxText.setAttribute("x", lx.toFixed(1)); focusAxText.setAttribute("y", ly.toFixed(1));
      focusAxText.setAttribute("transform", "rotate(" + rot + " " + lx.toFixed(1) + " " + ly.toFixed(1) + ")");
      focusAxText.textContent = FL + " " + degTxt(FRONTAL_AX[FL]);
    }
    leadMarks.forEach(function (g, i) {
      var L = state.leads[i], dup = 0;
      for (var j = 0; j < i; j++) if (state.leads[j] === L) dup++;
      var W = FRONTAL_AX[L] !== undefined ? wheelF : wheelH, ax = (FRONTAL_AX[L] !== undefined ? FRONTAL_AX : HORIZ_AX)[L];
      var b = ax * Math.PI / 180, r2 = 29 - dup * 11; // inside the circle, clear of the lead names
      W.axes[L].setAttribute("stroke", INK); W.axes[L].setAttribute("stroke-width", i === state.focus ? 2.4 : 1.8);
      W.labels[L].setAttribute("fill", INK); W.labels[L].setAttribute("font-weight", 700);
      g.setAttribute("transform", "translate(" + (r2 * Math.cos(b)).toFixed(1) + "," + (r2 * Math.sin(b)).toFixed(1) + ")");
      W.markG.appendChild(g);
      g.setAttribute("data-lead", L);
      panels[i].cv.setAttribute("aria-label", "Lead " + L + " trace, " + COND[state.cond].name + (i === state.focus ? ". Focus lead: tap a bump to jump to the moment that made it." : ""));
      panels[i].wrap.classList.toggle("is-focus", i === state.focus);
      panels[i].btn.setAttribute("aria-pressed", i === state.focus ? "true" : "false");
      panels[i].note.textContent = i === state.focus ? "" : s0(i);
    });
    document.getElementById("ecgcWheels").setAttribute("aria-label", "Limb and chest lead wheels. Selected leads: " + SLOTS.map(function (s, i) { return s + " " + state.leads[i]; }).join(", "));
  }
  function s0(i) { return SLOTS[i] + (FRONTAL_AX[state.leads[i]] !== undefined ? " on the limb wheel" : " on the chest wheel"); }

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
  // The link line passes beneath label text: a mask cuts a small gap wherever it would cross a word.
  var linkMask = el("mask", { id: "ecgcLinkMask", maskUnits: "userSpaceOnUse" }, el("defs", {}, linkSvg));
  var linkLine = el("line", { "stroke-width": 1.6, opacity: 0, mask: "url(#ecgcLinkMask)" }, linkSvg);
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
    // Each point stays lit through ST and fades back to grey at its own recovery time; the front is drawn where
    // recovery is happening now.
    M.pts.forEach(function (p, i) {
      var on = t >= p.ta ? (p.slow ? 2 : 1) : 0, n = myoNodes[i];
      var op = on ? Math.round(Math.max(0, Math.min(1, (p.tr - t) / 8)) * 50) / 50 : 0, dr = Math.abs(t - p.tr), ro = dr <= 6 ? 1 : dr < 7 ? Math.round((7 - dr) * 10) / 10 : 0;
      if (on !== n.on || op !== n.op) { n.dot.setAttribute("opacity", on === 1 ? op : 0); n.chev.setAttribute("opacity", on === 2 ? op : 0); n.on = on; n.op = op; }
      if (ro !== n.ro) { n.rec.setAttribute("opacity", ro); n.ro = ro; }
    });
    Object.keys(pathNodes).forEach(function (p) {
      var n = pathNodes[p], f = prog(c.path[p], t), isBlock = blocksOf(c).indexOf(p) >= 0, unused = !c.path[p] && !isBlock;
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
    var onH = hm >= .03, LH = onH ? Math.min(38, 8 + 26 * hm) / hm : 0;
    wheelH.vec.setAttribute("x2", (v.x * LH).toFixed(1)); wheelH.vec.setAttribute("y2", (v.z * LH).toFixed(1));
    wheelH.vec.setAttribute("opacity", onH ? 1 : 0); wheelH.vec.setAttribute("stroke-dasharray", dashed ? "5 4" : "none");
    var onF = fm >= .03, LF = onF ? Math.min(38, 8 + 26 * fm) / fm : 0;
    wheelF.vec.setAttribute("x2", (v.x * LF).toFixed(1)); wheelF.vec.setAttribute("y2", (v.y * LF).toFixed(1));
    wheelF.vec.setAttribute("opacity", onF ? 1 : 0); wheelF.vec.setAttribute("stroke-dasharray", dashed ? "5 4" : "none");
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
    Object.keys(pathNodes).forEach(function (p) { pathNodes[p].base.setAttribute("stroke-dasharray", BASE_DASH[p] || "none"); });
    var bl = blocksOf(c);
    if (!bl.length) { blockText.setAttribute("opacity", 0); return; }
    // Where the X sits on each blocked route (fraction of its length).
    var AT = { rb: 0.3, laf: 0.45 }, at = {}, BLOCK_TEXT = { rb: [-12, -9, "end"], lb: [10, 4, "start"], laf: [-12, 24, "end"] };
    bl.forEach(function (b) { at[b] = pathNodes[b].len * (AT[b] || 0.5); });
    // Orange hatching under every stretch the impulse cannot travel; dark dashed line on top (the front-wall route stays dotted).
    c.blocked.forEach(function (p) {
      var n = pathNodes[p], from = at[p] || 0;
      el("path", { d: PATHS[p], fill: "none", stroke: "url(#ecgcHatch)", "stroke-width": FRONT[p] ? 6 : 9, "stroke-linecap": "butt", opacity: FRONT[p] ? .45 : .6,
        "stroke-dasharray": "0 " + from.toFixed(1) + " " + n.len.toFixed(1) + " 0" }, gBlock);
      n.base.setAttribute("stroke-dasharray", at[p] !== undefined ? dashAfter(n.len, at[p]) : BASE_DASH[p] || "6 4");
    });
    bl.forEach(function (b, i) {
      var pt = pathNodes[b].act.getPointAtLength(at[b]);
      el("path", { d: "M-7,-7 L7,7 M7,-7 L-7,7", stroke: INK, "stroke-width": 3.5, "stroke-linecap": "round", transform: "translate(" + pt.x + "," + pt.y + ")" }, gMarks);
      var tx = i === 0 ? blockText : el("text", { "font-size": 12.5, "font-weight": 700, "font-family": "var(--font-sans)", fill: INK, stroke: "#fff", "stroke-width": 4, "paint-order": "stroke" }, gMarks);
      var o = BLOCK_TEXT[b] || BLOCK_TEXT.lb;
      tx.setAttribute("x", pt.x + o[0]); tx.setAttribute("y", pt.y + o[1]); tx.setAttribute("text-anchor", o[2]);
      tx.textContent = "blocked";
      tx.setAttribute("opacity", 1);
    });
  }

  var FAST_C = "#005A9E", SLOW_C = "#C85A00";
  // Standard ECG paper: 25 mm/s and 10 mm/mV, so at 56 px/mV one 1 mm box is 5.6 px each way (40 ms by 0.1 mV).
  // The strip is a rhythm strip at 75 per minute: earlier beats to the left, the beat being explained drawn last.
  var PX_MS = GAIN / 10 / 40, STRIP_LEFT = 50;
  function stripGeom(w) {
    var stripMs = (w - STRIP_LEFT - 4) / PX_MS, A = Math.max(0, Math.floor((stripMs - CYCLE - 60) / 200) * 200 + 40);
    return { left: STRIP_LEFT, A: A, stripMs: stripMs, X: function (ms) { return STRIP_LEFT + (A + ms) * PX_MS; }, XS: function (sm) { return STRIP_LEFT + sm * PX_MS; },
      toMs: function (x) { return (x - STRIP_LEFT) / PX_MS - A; } };
  }
  function renderPanel(i, t) {
    var cv = panels[i].cv, dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return null;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var L = state.leads[i], data = SAMPLES[state.cond][L], isFocus = i === state.focus;
    var G = stripGeom(w), left = G.left, X = G.X, XS = G.XS;
    // Fixed gain; the baseline is placed per lead so this beat's tallest R and deepest S both fit (centred if it is tight).
    var top = isFocus ? 25 : 3, dr = dataRange(state.cond, L), span = (dr[1] - dr[0]) * GAIN;
    if (isFocus && span > h - top - 3) top = 3; // a very tall beat may run up behind the bump tags rather than be clipped
    var avail = h - top - 3;
    var y0 = span <= avail ? top + dr[1] * GAIN + (avail - span) / 2 : top + avail / 2 + (dr[1] + dr[0]) / 2 * GAIN;
    function Y(mv) { return y0 - mv * GAIN; }
    var rg = [(y0 - h) / GAIN, y0 / GAIN];
    var segP = COND[state.cond].segs[0], segT = COND[state.cond].segs[4];
    // Classic paper: pale background, salmon grid (one orange family), 1 mm minor lines fainter than 5 mm major lines.
    ctx.fillStyle = "#FFF9F5"; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1;
    var gx = [], gy = [], mmPx = GAIN / 10;
    for (var n = Math.ceil(-left / mmPx); left + n * mmPx <= w; n++) gx.push([Math.round(left + n * mmPx) + .5, n % 5 === 0]);
    for (var mm = Math.ceil(rg[0] * 10); mm <= rg[1] * 10; mm++) gy.push([Math.round(Y(mm / 10)) + .5, mm % 5 === 0]);
    [false, true].forEach(function (major) {
      ctx.strokeStyle = major ? "#EDB497" : "#F8DFD2";
      ctx.beginPath();
      gx.forEach(function (g) { if (g[1] === major) { ctx.moveTo(g[0], 0); ctx.lineTo(g[0], h); } });
      gy.forEach(function (g) { if (g[1] === major) { ctx.moveTo(0, g[0]); ctx.lineTo(w, g[0]); } });
      ctx.stroke();
    });
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.lineJoin = "miter";
    // Standard 1 mV calibration pulse: 10 mm tall, 200 ms (5 mm) wide, on the baseline (moved down only if needed to fit).
    var cb = Math.min(h - 3, Math.max(Y(0), top + GAIN + 2)), ct = cb - GAIN, c0 = left - 6 - 40 * PX_MS * 5;
    ctx.beginPath(); ctx.moveTo(c0 - 4, cb); ctx.lineTo(c0, cb); ctx.lineTo(c0, ct); ctx.lineTo(c0 + 200 * PX_MS, ct); ctx.lineTo(c0 + 200 * PX_MS, cb); ctx.lineTo(c0 + 200 * PX_MS + 4, cb); ctx.stroke();
    // "1 mV" reads up the left side of the pulse, centred on it, so it never touches the pulse top.
    ctx.fillStyle = "#111"; ctx.font = "11px 'Source Sans 3', sans-serif";
    ctx.save(); ctx.translate(c0 - 7, (cb + ct) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("1 mV", 0, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(0, top - 2, w, h - top + 2); ctx.clip();
    var cut = Math.max(0, Math.min(CYCLE - 1, Math.floor(t)));
    // The pen sits between whole milliseconds (linear), so trace, dot and cursor move together at very slow speeds.
    var tp = Math.max(0, Math.min(CYCLE - 1, t)), yp = data[cut] + ((data[Math.min(CYCLE - 1, cut + 1)] - data[cut]) * (tp - cut));
    ctx.lineJoin = "round";
    // Earlier beats of the strip (already recorded), then this beat: black up to the cursor, faint grey after it.
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.8;
    for (var b0 = G.A - CYCLE; b0 + CYCLE > -left / PX_MS; b0 -= CYCLE) {
      ctx.beginPath();
      for (var k0 = 0, on0 = false; k0 < CYCLE; k0++) { var xs = XS(b0 + k0); if (xs < left) continue; if (!on0) { ctx.moveTo(xs, Y(data[k0])); on0 = true; } else ctx.lineTo(xs, Y(data[k0])); }
      ctx.stroke();
    }
    ctx.strokeStyle = "#A3A8AE"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X(tp), Y(yp));
    for (var k = cut + 1; k < CYCLE; k++) ctx.lineTo(X(k), Y(data[k]));
    ctx.stroke();
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (k = 0; k <= cut; k++) { if (k === 0) ctx.moveTo(X(k), Y(data[k])); else ctx.lineTo(X(k), Y(data[k])); }
    ctx.lineTo(X(tp), Y(yp));
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
        ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.setLineDash(b.slow ? [4, 2] : []);
        ctx.beginPath();
        for (var t2 = b.start; t2 <= e; t2++) { if (t2 === b.start) ctx.moveTo(X(t2), Y(data[t2])); else ctx.lineTo(X(t2), Y(data[t2])); }
        if (tp < b.end && tp > e) ctx.lineTo(X(tp), Y(yp));
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
    ctx.beginPath(); ctx.arc(X(t), Y(yp), 3.5, 0, Math.PI * 2); ctx.fill();
    // "P" and "T" above each wave, at its largest deflection in this lead (above the baseline when the wave is inverted).
    ctx.font = "700 12px 'Source Sans 3', sans-serif"; ctx.textAlign = "center";
    [["P", segP], ["T", segT]].forEach(function (wv) {
      var pk = wv[1][1], big = 0, hi = 0;
      for (var u = wv[1][1]; u < wv[1][2]; u++) { if (Math.abs(data[u]) > Math.abs(big)) { big = data[u]; pk = u; } hi = Math.max(hi, data[u]); }
      if (Math.abs(big) < .015) return;
      var ly = Math.max(top + 10, Y(hi) - 6), lx = X(pk);
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(lx - 5, ly - 10, 10, 12);
      ctx.fillStyle = "#222"; ctx.fillText(wv[0], lx, ly);
    });
    ctx.textAlign = "start";
    ctx.fillStyle = "#111"; ctx.font = "700 13px 'Source Sans 3', sans-serif";
    ctx.fillText(L, w - 30, isFocus ? 44 : 14);
    return link;
  }

  function textRects() {
    var out = [];
    document.querySelectorAll("#ecgcSvg text, #ecgcWheelH text").forEach(function (n) {
      if (n.textContent && +(n.getAttribute("opacity") || 1) > 0) out.push(n.getBoundingClientRect());
    });
    var w = document.createTreeWalker(document.getElementById("ecgcWheels"), NodeFilter.SHOW_TEXT), tn, rg = document.createRange();
    while ((tn = w.nextNode())) {
      if (!tn.textContent.trim() || tn.parentNode.closest("svg")) continue;
      rg.selectNodeContents(tn); Array.prototype.forEach.call(rg.getClientRects(), function (r) { out.push(r); });
    }
    return out;
  }
  function maskText(x1, y1, x2, y2, sr) {
    while (linkMask.firstChild) linkMask.removeChild(linkMask.firstChild);
    el("rect", { x: -2000, y: -2000, width: 6000, height: 6000, fill: "#fff" }, linkMask);
    var lx = Math.min(x1, x2) - 4, hx = Math.max(x1, x2) + 4, ly = Math.min(y1, y2) - 4, hy = Math.max(y1, y2) + 4;
    textRects().forEach(function (r) {
      var x = r.left - sr.left - 3, y = r.top - sr.top - 2, ww = r.width + 6, hh = r.height + 4;
      if (r.width && x < hx && x + ww > lx && y < hy && y + hh > ly) el("rect", { x: x.toFixed(1), y: y.toFixed(1), width: ww.toFixed(1), height: hh.toFixed(1), fill: "#000" }, linkMask);
    });
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
    maskText(x1, y1, x2, y2, sr);
    linkLine.setAttribute("stroke", col); linkLine.setAttribute("stroke-dasharray", link.b.slow ? "6 4" : "none");
    linkDot.setAttribute("cx", x1.toFixed(1)); linkDot.setAttribute("cy", y1.toFixed(1)); linkDot.setAttribute("fill", col);
    clusterRing.setAttribute("cx", link.b.cluster.x.toFixed(1)); clusterRing.setAttribute("cy", link.b.cluster.y.toFixed(1));
    clusterRing.setAttribute("stroke", col); clusterRing.setAttribute("stroke-dasharray", link.b.slow ? "5 3" : "none");
  }

  var lastSentence = "";
  function evT(c, e) { return typeof e === "number" ? e : MODEL[c].ev[e]; }


  /* ---------- Narration: Where, How, what the focus lead sees, the result on the trace (and, in a block, what differs) ---------- */
  // Moments are [from, to, title, where, how, different from normal]; times are ms or model events.
  var N_SHARED = [
    [0, 12, "The SA node fires", "SA node, in the wall of the right atrium where the superior vena cava joins.",
      "Pacemaker cells drift up to threshold on their own and fire. The impulse starts to spread into the atrial muscle around them."],
    [12, 100, "The atria depolarise", "Right atrium first, then the left atrium through Bachmann's bundle, on to the AV node.",
      "Mainly cell to cell through atrial muscle; faster internodal routes are described but debated. The atria have little muscle mass, so the P wave is small."],
    [100, "his", "The AV node holds the impulse", "AV node, low in the interatrial septum near the opening of the coronary sinus.",
      "The slowest conduction in the heart. The delay lets the atria finish emptying; the fibrous ring blocks every other route."],
    ["his", "hisEnd", "Through the His bundle", "His bundle, the only route through the fibrous ring.",
      "Fast: insulated fibres carry the impulse at about 2 m/s. Too little tissue to show on the ECG.",
      "Same as normal so far: the block is further down, in one bundle branch."]
  ];
  var N_REST = ["rest", CYCLE, "At rest", "The whole heart has recovered.", "Nothing changes charge until the SA node fires again."];
  var N_COND = {
    normal: [
      ["hisEnd", "qon", "Down the bundle branches", "Right and left bundle branches, down either side of the septum.",
        "Fast: insulated bundle fibres carry the impulse at about 2 m/s without exciting the muscle around them yet."],
      ["qon", "q1", "Septum, left to right", "The middle of the interventricular septum.",
        "The left bundle sends fibres into the septum early, so the septum depolarises from its left side to its right."],
      ["q1", "q2", "Apex and free walls", "Apex, then the free walls of both ventricles, endocardium to epicardium.",
        "Fast: Purkinje fibres (about 4 m/s) reach most muscle almost at once. The thick left ventricle wins: the net wavefront points left and down."],
      ["q2", "qend", "The base, last", "Base of the ventricles and the top of the septum.",
        "Still reached through the fast network, so the whole of both ventricles is activated quickly and the QRS stays narrow."],
      ["qend", "tS", "Plateau: no current flows", "All ventricular muscle is depolarised.",
        "Every cell sits in its plateau phase at a similar voltage, so no current flows between regions."],
      ["tS", "tE", "Repolarisation", "Ventricular muscle, recovering from the outside (epicardium) in.",
        "Epicardial action potentials are shorter, so recovery runs outside in (dark dashed front). Reversed charge and direction cancel: T usually matches the main QRS (inverted in aVR, often V1)."]
    ],
    rbbb: [
      ["hisEnd", "qon", "Right bundle blocked", "His bundle, then only the left bundle branch. The right bundle is blocked (X).",
        "Fast down the left bundle only: there is no fast route into the right ventricle.", "Normally both bundle branches conduct together."],
      ["qon", "q1", "Septum, still left to right", "The middle of the interventricular septum.",
        "The septal fibres come from the left bundle, which still works, so the septum depolarises left to right as usual.", "Nothing yet: the start of the QRS is normal in RBBB."],
      ["q1", "q2", "Left ventricle, on time", "Apex and the left ventricular free wall.",
        "Fast, through the left bundle and its Purkinje fibres. A slow front starts creeping from the septum into the RV (orange chevrons).", "The left ventricle is activated normally, but most of the right ventricle has not started yet."],
      ["q2", "qend", "Right ventricle, late and slow", "Right ventricular free wall, reached from the septum.",
        "Slow, cell to cell through gap junctions (muscle conducts at about 0.3 to 0.5 m/s), because the right bundle is blocked.",
        "Normally the RV is activated with the LV and hidden by it. Here it comes last, unopposed, heading right and forwards: R' in V1, wide slurred S in I and V6, QRS 120 ms or more."],
      ["qend", "tS", "Plateau", "All ventricular muscle is depolarised.",
        "Every cell sits in its plateau phase, so little current flows.", "Secondary ST depression in V1 to V3 is typical (appropriate discordance)."],
      ["tS", "tE", "Repolarisation, out of order", "Ventricular muscle, recovering.",
        "The RV, activated last, also recovers last (dark dashed front): a secondary change.", "Secondary T inversion in V1 to V3 is typical (appropriate discordance)."]
    ],
    lbbb: [
      ["hisEnd", "qon", "Left bundle blocked", "His bundle, then only the right bundle branch. The left bundle is blocked (X).",
        "Fast down the right bundle only: there is no fast route into the left ventricle.", "Normally both bundle branches conduct together."],
      ["qon", "q1a", "Right side first", "Right ventricle and the right side of the septum.",
        "Fast, through the right bundle and its Purkinje fibres; the septum is entered from the right.",
        "Normally the left side of the septum starts first. Here the right side starts first."],
      ["q1a", "q1", "Slow crawl across the septum", "Across the interventricular septum, right to left.",
        "Slow, cell to cell through gap junctions (muscle conducts at about 0.3 to 0.5 m/s), because the left bundle is blocked.",
        "Normally the septum depolarises left to right. Here it goes right to left, so the small septal q in I, aVL, V5 and V6 is lost."],
      ["q1", "q2", "Slow crawl through the LV wall", "Left ventricular apex and anterior wall.",
        "Still slow, cell to cell through gap junctions: there is no left Purkinje network to spread the impulse.",
        "Normally the left Purkinje fibres activate the left ventricle almost at once. Here it takes much longer, so the QRS widens to 120 ms or more."],
      ["q2", "qend", "Lateral wall, last", "Lateral wall of the left ventricle.",
        "Still slow, cell to cell; the wavefront keeps heading left and backwards.",
        "This late leftward wave makes a broad R in I, aVL, V5 and V6, often notched (M-shaped), and a deep, broad S (rS or QS) in V1."],
      ["qend", "tS", "Abnormal recovery begins", "All ventricular muscle is depolarised.",
        "Abnormal activation means abnormal recovery: a secondary change.",
        "ST shifts opposite to the main QRS (appropriate discordance): raised in V1 to V3, depressed in I, aVL, V5 and V6."],
      ["tS", "tE", "Repolarisation, discordant", "Ventricular muscle, recovering.",
        "Recovery follows the abnormal activation (dark dashed front): RV and septum first, lateral LV wall last.", "T points opposite to the main QRS (discordant): the expected secondary pattern in LBBB."]
    ]
  };
  // LAFB and bifascicular block (LITFL fascicular block and bifascicular block pages).
  N_COND.lafb = [
    ["hisEnd", "qon", "Anterior fascicle blocked", "His bundle, both bundle branches; the left bundle's anterior fascicle is blocked (X).",
      "Fast down the right bundle and the left posterior fascicle only: no fast route to the front and upper left ventricular wall.", "Normally both fascicles of the left bundle conduct together."],
    ["qon", "q1", "Septum and inferior wall first", "Septum, then the inferoseptal LV wall, where the posterior fascicle inserts.",
      "Fast, through the posterior fascicle, endocardium to epicardium: the first wavefront points down and to the right.",
      "Normally the early LV wavefront heads left and down. Here it heads down and right: small r in II, III and aVF, small q in I and aVL."],
    ["q1", "q2", "Up to the anterosuperior wall, late", "Anterior, upper and lateral left ventricular wall.",
      "Reached from below, partly cell to cell (orange chevrons), because the anterior fascicle is blocked. The main wavefront spreads up and to the left.",
      "Slightly late and heading up and left: tall R in I and aVL, deep S in II, III and aVF (left axis deviation, about \u221245\u00b0 to \u221290\u00b0); R wave peak time in aVL over 45 ms."],
    ["q2", "qend", "The base, last", "Base of the left ventricle.", "Still reached from below, cell to cell.",
      "The overall delay is only about 20 ms, so the QRS stays normal or slightly wide (about 80 to 110 ms)."],
    ["qend", "tS", "Plateau: no current flows", "All ventricular muscle is depolarised.", "Every cell sits in its plateau phase, so little current flows."],
    ["tS", "tE", "Repolarisation", "Ventricular muscle, recovering.", "Recovery follows the activation order, epicardium first (dark dashed front)."]
  ];
  N_COND.bifasc = [
    ["hisEnd", "qon", "Two of three fascicles blocked", "His bundle, then the left bundle and its posterior fascicle. The right bundle and the anterior fascicle are blocked (X).",
      "Fast down one fascicle only: the left posterior fascicle is the last fast route into the ventricles.",
      "Normally both bundle branches and both left fascicles conduct. Damage to the last fascicle can progress to complete heart block."],
    ["qon", "q1", "Septum and inferior wall first", "Septum (left to right), then the inferoseptal LV wall.",
      "Fast, through the left bundle and its posterior fascicle: the first LV wavefront points down and to the right.",
      "The septum starts normally; the early LV wavefront heads down and right, as in LAFB."],
    ["q1", "q2", "Up to the anterosuperior wall, late", "Anterior, upper and lateral left ventricular wall.",
      "Reached from below, partly cell to cell (orange chevrons), because the anterior fascicle is blocked.",
      "Up and to the left, as in LAFB: tall R in I and aVL, deep S in II, III and aVF (left axis deviation)."],
    ["q2", "qend", "Right ventricle, last and slow", "Right ventricular free wall, reached from the septum.",
      "Slow, cell to cell through gap junctions, because the right bundle is blocked.",
      "As in RBBB: R' in V1, wide slurred S in I and V6, QRS 120 ms or more."],
    ["qend", "tS", "Plateau", "All ventricular muscle is depolarised.", "Every cell sits in its plateau phase, so little current flows.",
      "Secondary ST depression in V1 to V3 is typical, as in RBBB."],
    ["tS", "tE", "Repolarisation, out of order", "Ventricular muscle, recovering.", "The RV, activated last, also recovers last (dark dashed front): a secondary change.",
      "Risk: progression to complete heart block, about 1 to 4% a year overall and higher after syncope (LITFL)."]
  ];
  var N_HIS_DIFF = { lafb: "Same as normal so far: the block is further down, in the anterior fascicle of the left bundle.",
    bifasc: "Same as normal so far: the blocks are further down, in the right bundle and the left anterior fascicle." };
  var LOOKS = {
    I: "from the left (0\u00b0)", II: "from below and to the left (+60\u00b0)", III: "from below and to the right (+120\u00b0)", aVF: "from directly below (+90\u00b0)",
    aVL: "from up and to the left (\u221230\u00b0)", aVR: "from up and to the right (\u2212150\u00b0)",
    V1: "from the front, just right of the sternum", V2: "from the front, just left of the sternum", V3: "from the front, between V2 and V4",
    V4: "from the front, over the apex", V5: "from the front of the left side", V6: "from the left side"
  };
  function momentAt(c, t) {
    var list = N_SHARED.concat(N_COND[c]);
    for (var i = 0; i < list.length; i++) if (t >= evT(c, list[i][0]) && t < evT(c, list[i][1])) {
      if (list[i][0] === "his" && N_HIS_DIFF[c]) { var m = list[i].slice(); m[5] = N_HIS_DIFF[c]; return m; }
      return list[i];
    }
    return N_REST;
  }
  function seesLine(c, L, t, isT) {
    var v = vectorAt(c, t), frontal = FRONTAL_AX[L] !== undefined, mag = frontal ? Math.hypot(v.x, v.y) : CHEST_GAIN * Math.hypot(v.x, v.z), p = project(v, L);
    var head = L + " looks " + LOOKS[L] + ". ";
    if (mag < .03) return head + "No wavefront is big enough to see, so the trace stays on the baseline.";
    var what = isT ? "The T vector (net direction of the recovery currents)" : "The net wavefront";
    if (Math.abs(p) < .3 * mag) return head + what + " runs nearly at right angles to " + L + ", so it barely moves the trace.";
    var tail = isT ? (c === "normal" ? " The recovery wave travels the other way, epicardium to endocardium." : "") : "";
    return head + what + " points " + (p > 0 ? "towards " + L + ", so the trace goes up." : "away from " + L + ", so the trace goes down.") + tail;
  }
  function traceLine(c, L, t) {
    var M = MODEL[c], arr = SAMPLES[c][L], sg = null, segs = COND[c].segs;
    for (var i = 0; i < segs.length; i++) if (t >= segs[i][1] && t < segs[i][2]) sg = segs[i][0];
    if (sg === "QRS") {
      var bs = bumpsFor(c, L), hit = null;
      bs.forEach(function (b) { if (t >= b.start && t <= b.end) hit = b; });
      var qw = seg(c, "QRS"); qw = qw[2] - qw[1];
      if (hit) return hit.name + " in " + L + ": " + (hit.sign > 0 ? "upward" : "downward") + ", made by the " + hit.groups + " (" + (hit.slow ? "slow, cell to cell" : "fast route") + "). QRS " + qw + " ms.";
      return "QRS in " + L + ", between deflections. QRS " + qw + " ms.";
    }
    if (sg === "P") {
      var pmax = 0, pmin = 0; for (var a = 0; a <= 100; a++) { pmax = Math.max(pmax, arr[a]); pmin = Math.min(pmin, arr[a]); }
      return "P wave in " + L + ": " + (pmax > .02 && pmin < -.02 ? "biphasic (up then down)" : pmax >= -pmin ? "upright" : "inverted") + ".";
    }
    if (sg === "PR") return "PR segment: flat. The PR interval is 160 ms here (normal 120 to 200 ms).";
    var qa = 0; for (var q = M.qon; q <= M.qend; q++) qa += arr[q];
    if (sg === "ST") { var sv = arr[Math.round((M.qend + M.tS) / 2) + 5]; return "ST segment in " + L + ": " + (Math.abs(sv) < .04 ? "on the baseline." : sv > 0 ? "raised." : "depressed.") + (Math.abs(sv) >= .04 ? " The main QRS here is " + (qa > 0 ? "upward." : "downward.") : ""); }
    if (sg === "T") { var tv = 0; for (var u = M.tS; u <= M.tE; u++) if (Math.abs(arr[u]) > Math.abs(tv)) tv = arr[u];
      return "T wave in " + L + ": " + (tv > 0 ? "upright" : "inverted") + ", " + ((tv > 0) === (qa > 0) ? "the same way as" : "opposite to") + " the main QRS."; }
    return "Back on the baseline until the next P wave.";
  }
  function narration(c, L, t) {
    t = Math.max(0, Math.min(CYCLE - 1, Math.round(t)));
    var m = momentAt(c, t), M = MODEL[c], isT = t >= M.tS && t <= M.tE, tr = traceLine(c, L, t);
    var title = m[2], bs = bumpsFor(c, L);
    bs.forEach(function (b) { if (t >= b.start && t <= b.end) title = m[2] + ": " + b.name + " in " + L; });
    return { title: title, where: m[3], how: m[4], sees: seesLine(c, L, t, isT), trace: tr, diff: c === "normal" ? "" : (m[5] || "") };
  }
  var narrNodes = { title: document.getElementById("ecgcSentence"), where: document.getElementById("ecgcNWhere"), how: document.getElementById("ecgcNHow"),
    sees: document.getElementById("ecgcNSees"), seesLab: document.getElementById("ecgcNSeesLab"), trace: document.getElementById("ecgcNTrace"),
    diff: document.getElementById("ecgcNDiff"), diffRow: document.getElementById("ecgcNDiffRow") };
  function renderNarration(t) {
    var L = state.leads[state.focus], n = narration(state.cond, L, t), head = n.title;
    if (state.step) { var st = curSteps(); head = "Step " + (state.stepIdx + 1) + " of " + st.length + ": " + n.title; }
    var key = head + "|" + n.sees + "|" + n.trace + "|" + L;
    if (key === lastSentence) return;
    lastSentence = key;
    narrNodes.title.textContent = head;
    narrNodes.where.textContent = n.where; narrNodes.how.textContent = n.how;
    narrNodes.seesLab.textContent = L + " sees"; narrNodes.sees.textContent = n.sees; narrNodes.trace.textContent = n.trace;
    narrNodes.diff.textContent = n.diff; narrNodes.diffRow.hidden = !n.diff;
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
    renderNarration(t);
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
  // Pressing the scrubber pauses even when the press lands on the moving thumb (which sends no input event).
  scrub.addEventListener("pointerdown", function () { setStepMode(false); setPlaying(false); render(); });
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
    narration: narration,
    wheels: function () { return { limb: Object.keys(wheelF.axes), chest: Object.keys(wheelH.axes), limbVec: wheelF.vec.getAttribute("opacity"), chestVec: wheelH.vec.getAttribute("opacity"),
      marks: leadMarks.map(function (g) { return { lead: g.dataset.lead, wheel: g.ownerSVGElement.id }; }) }; },
    steps: function (c, L) { return stepsFor(c, L || state.leads[state.focus]).map(function (s) { return { id: s.id, ids: s.ids.slice(), t: s.t, text: s.text }; }); },
    stepMode: setStepMode,
    goStep: function (id) { var st = curSteps(); for (var i = 0; i < st.length; i++) if (st[i].ids.indexOf(id) >= 0) { goStep(i); return true; } return false; },
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
    paths: function (c) { var o = {}, P = COND[c].path; Object.keys(P).forEach(function (k) { if (P[k] && pathNodes[k]) o[k] = { start: P[k][0], dur: P[k][1], len: pathNodes[k].len }; }); return o; },
    regions: function (c) {
      var o = {}; MODEL[c].pts.forEach(function (p) { (o[p.g] = o[p.g] || []).push(p); });
      Object.keys(o).forEach(function (g) {
        var a = o[g].map(function (p) { return p.ta; }).sort(function (x, y) { return x - y; });
        o[g] = { first: a[0], median: a[a.length >> 1], last: a[a.length - 1], slowFrac: o[g].filter(function (p) { return p.slow; }).length / a.length, n: a.length };
      });
      return o;
    },
    recovery: function (c) { var M = MODEL[c]; return { first: M.rec.first, median: M.rec.median, last: M.rec.last, dipole: { x: M.recDipole.x, y: M.recDipole.y }, tS: M.tS, tE: M.tE }; },
    recoveryShown: function () { var lit = 0, front = 0; myoNodes.forEach(function (n) { if (+n.dot.getAttribute("opacity") > 0 || +n.chev.getAttribute("opacity") > 0) lit++; if (n.rec.getAttribute("opacity") === "1") front++; }); return { lit: lit, front: front, total: myoNodes.length }; },
    traceX: function (i, ms) { var cv = panels[i].cv, r = cv.getBoundingClientRect(); return r.left + stripGeom(r.width).X(ms); },
    paper: function () { return { pxPerMs: PX_MS, pxPerMv: GAIN, mmPx: GAIN / 10, calWidthMs: 200, calHeightMv: 1 }; },
    activationGap: function (c) { var a = MODEL[c].pts.map(function (p) { return p.ta; }).sort(function (x, y) { return x - y; }), g = 0; for (var i = 1; i < a.length; i++) g = Math.max(g, a[i] - a[i - 1]); return g; },
    model: function (c) { var M = MODEL[c]; return { qon: M.qon, qend: M.qend, fracSlow: M.fracSlow, points: M.pts.length, slowPoints: M.pts.filter(function (p) { return p.slow; }).length }; },
    qrsWidth: function () { var q = seg(state.cond, "QRS"); return q[2] - q[1]; }
  };
})();
