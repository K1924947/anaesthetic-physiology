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
  // Waves: P and T are single bumps; qrs is a list of [centre ms, width ms, amplitude mV]; st is the ST level in mV.
  var MORPH = {
    normal: {
      I: { P: .1, T: .25, qrs: [[170, 5, -.08], [196, 10, .9], [226, 7, -.15]] },
      II: { P: .15, T: .35, qrs: [[170, 5, -.06], [197, 10, 1.2], [227, 7, -.2]] },
      III: { P: .05, T: .1, qrs: [[199, 10, .5], [227, 7, -.25]] },
      aVR: { P: -.12, T: -.3, qrs: [[172, 6, .12], [200, 12, -.95]] },
      aVL: { P: .03, T: .1, qrs: [[170, 5, -.1], [194, 10, .4], [223, 8, -.25]] },
      aVF: { P: .1, T: .25, qrs: [[199, 10, .8], [227, 7, -.2]] },
      V1: { P: .07, T: -.08, qrs: [[176, 7, .25], [205, 12, -1.0]] },
      V2: { P: .07, T: .45, qrs: [[178, 7, .4], [208, 12, -1.3]] },
      V3: { P: .08, T: .45, qrs: [[192, 10, .8], [217, 9, -.8]] },
      V4: { P: .1, T: .4, qrs: [[197, 10, 1.3], [222, 7, -.4]] },
      V5: { P: .1, T: .35, qrs: [[171, 5, -.1], [198, 10, 1.4], [224, 7, -.25]] },
      V6: { P: .1, T: .3, qrs: [[171, 5, -.12], [198, 10, 1.1], [224, 7, -.15]] }
    },
    rbbb: {
      I: { P: .1, T: .2, qrs: [[170, 5, -.08], [196, 10, .8], [262, 17, -.35]] },
      II: { P: .15, T: .3, qrs: [[170, 5, -.06], [197, 10, 1.0], [262, 17, -.25]] },
      III: { P: .05, T: .1, qrs: [[199, 10, .45], [258, 15, -.15]] },
      aVR: { P: -.12, T: -.25, qrs: [[172, 6, .1], [200, 12, -.85], [264, 16, .4]] },
      aVL: { P: .03, T: .1, qrs: [[170, 5, -.1], [194, 10, .4], [258, 15, -.25]] },
      aVF: { P: .1, T: .2, qrs: [[199, 10, .7], [260, 16, -.2]] },
      V1: { P: .07, T: -.25, st: -.05, qrs: [[176, 7, .3], [203, 8, -.5], [252, 16, .95]] },
      V2: { P: .07, T: -.1, qrs: [[178, 7, .4], [206, 9, -.8], [256, 16, .6]] },
      V3: { P: .08, T: .3, qrs: [[193, 10, .7], [218, 9, -.5], [258, 15, .3]] },
      V4: { P: .1, T: .4, qrs: [[197, 10, 1.2], [258, 16, -.45]] },
      V5: { P: .1, T: .35, qrs: [[171, 5, -.1], [198, 10, 1.3], [262, 17, -.45]] },
      V6: { P: .1, T: .3, qrs: [[171, 5, -.12], [198, 10, 1.0], [262, 17, -.45]] }
    },
    lbbb: {
      I: { P: .1, T: -.3, st: -.08, qrs: [[205, 16, .7], [252, 17, .8]] },
      II: { P: .15, T: -.1, qrs: [[222, 26, .6]] },
      III: { P: .05, T: .2, st: .05, qrs: [[182, 8, .2], [235, 24, -.4]] },
      aVR: { P: -.12, T: .25, st: .05, qrs: [[230, 28, -.7]] },
      aVL: { P: .03, T: -.3, st: -.08, qrs: [[205, 16, .7], [253, 17, .8]] },
      aVF: { P: .1, T: .05, qrs: [[215, 22, .3], [265, 12, -.12]] },
      V1: { P: .07, T: .45, st: .15, qrs: [[178, 6, .1], [230, 27, -1.6]] },
      V2: { P: .07, T: .55, st: .22, qrs: [[180, 6, .15], [232, 27, -2.0]] },
      V3: { P: .08, T: .45, st: .15, qrs: [[185, 7, .2], [235, 26, -1.6]] },
      V4: { P: .1, T: .1, qrs: [[205, 14, .5], [252, 16, -.6]] },
      V5: { P: .1, T: -.3, st: -.1, qrs: [[210, 16, .9], [255, 17, 1.0]] },
      V6: { P: .1, T: -.3, st: -.1, qrs: [[210, 16, .8], [255, 17, .9]] }
    }
  };

  var SHARED_START = [
    [0, 12, "The SA node fires. It is too small to show on the ECG, so the trace is still flat."],
    [12, 100, "The impulse spreads through the right atrium, and along Bachmann's bundle to the left atrium. Atrial depolarisation is the P wave."],
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
      arrow: [[0, 55, 20, 0], [20, 55, 20, .3], [50, 55, 20, .4], [85, 55, 20, .2], [100, 55, 20, 0],
        [160, 170, 120, 0], [168, 170, 120, .3], [180, 170, 120, .3], [192, 45, -10, .8], [205, 40, -20, 1], [222, -60, -80, .35], [238, -90, -110, .12], [245, -90, -110, 0],
        [350, 40, 30, 0], [435, 40, 30, .35], [520, 40, 30, 0]],
      text: [
        [145, 160, "The impulse leaves the AV node and races down the His bundle into the right and left bundle branches."],
        [160, 185, "The septum depolarises first, from left to right. That small wavefront heads towards V1 (small r wave) and away from V6 (small q wave)."],
        [185, 222, "Purkinje fibres spread the impulse through both ventricles at once. The thick left ventricle wins, so the wavefront points left: tall R in V6 and II, deep S in V1."],
        [222, 245, "The last areas to depolarise are high in the ventricles, near the valves. The narrow QRS ends at about 85 ms."],
        [245, 350, "Every ventricular cell is now in its plateau phase, so no current flows between areas. The ST segment sits on the baseline."],
        [350, 520, "The ventricles repolarise, epicardium first, so the T wave points the same way as the QRS in most leads."]
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
      arrow: [[0, 55, 20, 0], [20, 55, 20, .3], [50, 55, 20, .4], [85, 55, 20, .2], [100, 55, 20, 0],
        [160, 170, 120, 0], [168, 170, 120, .3], [182, 170, 120, .3], [195, 40, -15, .75], [215, 35, -20, .85], [235, 190, 150, .3], [250, 190, 150, .5], [275, 190, 150, .55], [293, 190, 150, .2], [300, 190, 150, 0],
        [380, 20, -30, 0], [470, 20, -30, .3], [560, 20, -30, 0]],
      sweep: { RV: [290, 300, 150, 240] },
      late: "0,190 244,190 300,392 280,420 0,420",
      text: [
        [145, 160, "The impulse races down the His bundle. The right bundle is blocked, so only the left bundle carries it on."],
        [160, 185, "The left bundle still activates the septum from left to right, so the QRS starts normally: small r in V1, small q in V6."],
        [185, 232, "The left ventricle depolarises through its own Purkinje fibres. The wavefront points left: S wave in V1, R wave in V6."],
        [232, 300, "The right ventricle is reached late, cell to cell across the septum, which is slow. This late rightward wavefront makes the R' in V1 and the wide, slurred S in I and V6. QRS 120 ms or more."],
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
      arrow: [[0, 55, 20, 0], [20, 55, 20, .3], [50, 55, 20, .4], [85, 55, 20, .2], [100, 55, 20, 0],
        [160, 0, -10, 0], [172, 5, -10, .3], [200, 15, -20, .6], [230, 10, -25, .9], [260, 0, -20, .8], [290, -10, -15, .4], [300, -10, -15, 0],
        [380, 195, 160, 0], [470, 195, 160, .35], [560, 195, 160, 0]],
      sweep: { LV: [285, 280, 430, 260] },
      late: "372,185 540,185 540,420 340,420 360,350",
      text: [
        [145, 160, "The impulse races down the His bundle. The left bundle is blocked, so only the right bundle carries it on."],
        [160, 200, "The septum is activated from the right side, so it depolarises right to left. The wavefront heads away from V1 and towards V6: no septal q in I, aVL, V5 or V6."],
        [200, 260, "The small right ventricle activates normally, then the impulse creeps cell to cell through the left ventricle. The wavefront points left, away from V1: deep, broad S in V1."],
        [260, 300, "The lateral wall of the left ventricle depolarises last, giving the broad, notched R in I, aVL, V5 and V6. QRS 120 ms or more."],
        [300, 380, "Abnormal depolarisation means abnormal repolarisation. The ST segment shifts opposite to the main QRS: up in V1 to V3, down in V5 and V6."],
        [380, 560, "T waves point opposite to the main QRS (discordant): upright in V1, inverted in I, aVL, V5 and V6. This is the expected secondary pattern in LBBB."]
      ]
    }
  };

  function seg(c, name) { var s = COND[c].segs; for (var i = 0; i < s.length; i++) if (s[i][0] === name) return s[i]; return null; }

  /* ---------- Trace samples (1 ms) ---------- */
  function gauss(t, c, w, a) { var d = (t - c) / w; return a * Math.exp(-0.5 * d * d); }
  function logistic(x) { return 1 / (1 + Math.exp(-x)); }
  var SAMPLES = {};
  Object.keys(MORPH).forEach(function (c) {
    SAMPLES[c] = {};
    var q = seg(c, "QRS"), tw = seg(c, "T"), tc = (tw[1] + tw[2]) / 2;
    LEADS.forEach(function (L) {
      var m = MORPH[c][L], arr = new Float32Array(CYCLE);
      for (var t = 0; t < CYCLE; t++) {
        var v = gauss(t, 50, 17, m.P) + gauss(t, tc, 42, m.T);
        for (var i = 0; i < m.qrs.length; i++) v += gauss(t, m.qrs[i][0], m.qrs[i][1], m.qrs[i][2]);
        if (m.st) v += m.st * logistic((t - (q[2] - 8)) / 5) * (1 - logistic((t - tc) / 22));
        arr[t] = v;
      }
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

  // Outer muscle shapes (cavities are drawn over them in white).
  var VENT = "M150,212 L404,188 C432,240 430,320 385,368 C360,392 335,402 318,398 C285,392 250,370 215,345 C170,312 146,265 150,212 Z";
  var REGIONS = {
    RA: { d: "M150,212 L120,212 C108,170 115,112 160,90 L176,82 L206,82 C232,92 248,116 252,150 L254,207 Z" },
    LA: { d: "M282,191 C276,150 282,114 305,104 L380,100 C405,110 412,150 404,188 Z" },
    RV: { d: VENT, clip: "0,190 244,190 300,392 280,420 0,420" },
    SEP: { d: VENT, clip: "244,190 274,190 334,392 300,392" },
    LV: { d: VENT, clip: "274,190 540,190 540,420 280,420 300,392 334,392" }
  };
  var CAVITY = {
    RA: "M150,206 L128,206 C120,170 126,120 166,100 L178,94 L204,94 C226,102 238,122 241,150 L243,203 Z",
    LA: "M292,189 C288,154 292,124 310,114 L376,110 C396,120 400,152 394,188 Z",
    RV: "M162,213 L246,206 C262,270 285,330 305,372 C280,372 250,356 222,336 C184,308 160,264 162,213 Z",
    LV: "M272,203 L382,194 C400,240 394,305 364,345 C350,362 336,370 326,366 C306,330 288,270 272,203 Z"
  };
  // Direction of the activation sweep in each region: [x1, y1, x2, y2]. Conditions may override.
  var SWEEP = {
    RA: [175, 88, 205, 212], LA: [290, 100, 404, 190],
    RV: [295, 365, 150, 215], LV: [322, 392, 418, 200],
    SEP: { lr: [298, 284, 266, 294], rl: [266, 294, 298, 284] }
  };
  var PATHS = {
    intern: "M180,90 C222,100 240,150 244,191",
    intern2: "M170,96 C138,136 150,192 238,198",
    bach: "M182,88 C225,78 280,90 330,106",
    avn: "M238,193 L249,199",
    his: "M249,199 L253,208 L259,224",
    rb: "M259,224 C266,265 284,320 302,362",
    lb: "M259,224 L272,240",
    laf: "M272,240 C305,250 345,248 380,232",
    lpf: "M272,240 C290,290 305,330 318,352",
    purkR: "M302,364 C262,362 216,340 186,305 C166,280 160,250 164,222",
    purkL: "M318,354 C330,372 350,362 366,340 C386,310 392,255 384,206"
  };
  var ATRIAL = { intern: 1, intern2: 1, bach: 1, avn: 1 };

  // Great vessels as short stubs (drawn first so the chambers sit on top).
  var gVes = el("g", { "aria-hidden": "true" });
  function tube(d, parent) { el("path", { d: d, fill: "#fff", stroke: GREY, "stroke-width": 1.6 }, parent || gVes); }
  tube("M290,100 L318,26 L344,32 L314,106 Z");                 // pulmonary trunk
  tube("M258,203 L258,22 L284,22 L284,201 Z");                 // aorta
  [["Aorta", 271, 16, "middle"], ["Pulmonary trunk", 334, 22, "start"], ["SVC", 191, 16, "middle"], ["IVC", 136, 268, "middle"]].forEach(function (v) {
    el("text", { x: v[1], y: v[2], "text-anchor": v[3], "font-size": 12, "font-family": "var(--font-sans)", fill: INK }, gVes).textContent = v[0];
  });

  var gRegions = el("g", { "aria-hidden": "true" });
  var regionNodes = {};
  Object.keys(REGIONS).forEach(function (r) {
    var R = REGIONS[r], cp = null;
    if (R.clip) { var c = el("clipPath", { id: "ecgcC" + r }, defs); el("polygon", { points: R.clip }, c); cp = "url(#ecgcC" + r + ")"; }
    var base = el("path", { d: R.d, fill: SOFT, stroke: GREY, "stroke-width": 1.6 }, gRegions);
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
  // Cavities in white over the muscle, which leaves thin atrial and RV walls, a thick LV wall and a muscular septum.
  Object.keys(CAVITY).forEach(function (k) {
    el("path", { d: CAVITY[k], fill: "#fff", stroke: GREY, "stroke-width": 1.4 }, gRegions);
  });
  // White openings where the SVC and IVC enter the right atrium.
  el("rect", { x: 179, y: 22, width: 24, height: 76, fill: "#fff" }, gRegions);
  el("path", { d: "M178,22 L178,94 M204,22 L204,94", stroke: GREY, "stroke-width": 1.6 }, gRegions);
  el("rect", { x: 125, y: 203, width: 22, height: 52, fill: "#fff" }, gRegions);
  el("path", { d: "M124,202 L124,255 M148,207 L148,255", stroke: GREY, "stroke-width": 1.6 }, gRegions);
  // Coronary sinus opening.
  el("ellipse", { cx: 226, cy: 197, rx: 7, ry: 4, fill: "#fff", stroke: GREY, "stroke-width": 1.4 }, gRegions);

  // Fibrous AV ring: an electrical insulator; the only way through is the AV node and His bundle.
  el("path", { d: "M120,212 L404,188", stroke: "#6B7075", "stroke-width": 3.5, "stroke-linecap": "round" }, gRegions);
  // Valves as simple flaps.
  var VALVES = [
    "M168,210 Q172,232 186,238 Q180,224 180,209 Z", "M232,204 Q228,226 214,234 Q220,220 220,205 Z",           // tricuspid
    "M296,198 Q300,222 316,230 Q308,214 310,197 Z", "M372,191 Q368,215 352,223 Q360,207 358,192 Z",           // mitral
    "M259,202 Q265,188 271,200 Z", "M271,200 Q277,187 283,200 Z",                                             // aortic
    "M298,88 Q304,77 308,91 Z", "M308,91 Q314,80 316,95 Z"                                                    // pulmonary
  ];
  VALVES.forEach(function (d) { el("path", { d: d, fill: "#fff", stroke: "#6B7075", "stroke-width": 1.5, "stroke-linejoin": "round" }, gRegions); });

  [["RA", 186, 150], ["LA", 346, 152], ["RV", 208, 285], ["LV", 340, 338]].forEach(function (c) {
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
  var saNode = el("ellipse", { cx: 176, cy: 90, rx: 8, ry: 5.5, fill: GREY, stroke: INK, "stroke-width": 1 }, gPaths);
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
    ["SA node", 100, 52, 172, 89, "end"], ["Internodal paths", 100, 112, 150, 140, "end"], ["Coronary sinus", 100, 170, 220, 197, "end"],
    ["AV node", 100, 200, 240, 194, "end"], ["Tricuspid valve", 100, 238, 172, 224, "end"], ["Right bundle", 100, 300, 280, 300, "end"],
    ["Purkinje fibres", 100, 352, 192, 312, "end"],
    ["Pulmonary valve", 430, 50, 312, 86, "start"], ["Bachmann's bundle", 430, 82, 300, 95, "start"], ["Aortic valve", 430, 128, 280, 196, "start"],
    ["Mitral valve", 430, 168, 362, 206, "start"], ["Fibrous AV ring", 430, 196, 400, 189, "start"], ["His bundle", 430, 222, 254, 212, "start"],
    ["Left bundle", 430, 250, 266, 232, "start"], ["Anterior fascicle", 430, 278, 360, 242, "start"], ["Posterior fascicle", 430, 316, 300, 312, "start"],
    ["Septum", 430, 372, 300, 352, "start"]
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
  var FRONTAL = { I: 0, II: 60, III: 120, aVF: 90, aVL: -30, aVR: -150 };
  var HORIZ = { V1: 115, V2: 94, V3: 75, V4: 60, V5: 30, V6: 0 }; // approximate; positive = anterior (drawn downwards)
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
  function arrowAt(c, t) {
    var k = COND[c].arrow;
    for (var i = 0; i < k.length - 1; i++) {
      if (t >= k[i][0] && t <= k[i + 1][0]) {
        var f = (t - k[i][0]) / ((k[i + 1][0] - k[i][0]) || 1);
        return { ang: lerp(k[i][1], k[i + 1][1], f), h: lerp(k[i][2], k[i + 1][2], f), mag: lerp(k[i][3], k[i + 1][3], f) };
      }
    }
    return { ang: 0, h: 0, mag: 0 };
  }

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
    var a = arrowAt(state.cond, t), isT = t >= tw[1] && t <= tw[2];
    var o = t < 100 ? { x: 262, y: 140 } : { x: 312, y: 288 };
    var show = a.mag >= 0.06, rad = a.ang * Math.PI / 180, hrad = a.h * Math.PI / 180;
    gArrow.setAttribute("opacity", show ? 1 : 0);
    [[wheelF, rad], [wheelH, hrad]].forEach(function (w) {
      var L = show ? 10 + 30 * a.mag : 0;
      w[0].vec.setAttribute("x2", (L * Math.cos(w[1])).toFixed(1)); w[0].vec.setAttribute("y2", (L * Math.sin(w[1])).toFixed(1));
      w[0].vec.setAttribute("opacity", show ? 1 : 0);
      w[0].vec.setAttribute("stroke-dasharray", isT ? "5 4" : "none");
    });
    if (show) {
      var len = 28 + 72 * a.mag;
      var ex = o.x + len * Math.cos(rad), ey = o.y + len * Math.sin(rad);
      arrowLine.setAttribute("x1", o.x); arrowLine.setAttribute("y1", o.y);
      arrowLine.setAttribute("x2", ex.toFixed(1)); arrowLine.setAttribute("y2", ey.toFixed(1));
      arrowLine.setAttribute("stroke-dasharray", isT ? "10 7" : "none");
      arrowTail.setAttribute("cx", o.x); arrowTail.setAttribute("cy", o.y);
      arrowText.setAttribute("x", o.x - 18 * Math.cos(rad));
      arrowText.setAttribute("y", o.y - 18 * Math.sin(rad) + 5);
      arrowText.setAttribute("text-anchor", Math.cos(rad) >= 0.3 ? "end" : Math.cos(rad) <= -0.3 ? "start" : "middle");
      arrowText.textContent = isT ? "T vector (dashed)" : "Wavefront";
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
    qrsWidth: function () { var q = seg(state.cond, "QRS"); return q[2] - q[1]; }
  };
})();
