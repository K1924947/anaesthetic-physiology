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
      arrow: [[0, 55, 0], [20, 55, .3], [50, 55, .4], [85, 55, .2], [100, 55, 0],
        [160, 170, 0], [168, 170, .3], [180, 170, .3], [192, 45, .8], [205, 40, 1], [222, -60, .35], [238, -90, .12], [245, -90, 0],
        [350, 40, 0], [435, 40, .35], [520, 40, 0]],
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
      arrow: [[0, 55, 0], [20, 55, .3], [50, 55, .4], [85, 55, .2], [100, 55, 0],
        [160, 170, 0], [168, 170, .3], [182, 170, .3], [195, 40, .75], [215, 35, .85], [235, 190, .3], [250, 190, .5], [275, 190, .55], [293, 190, .2], [300, 190, 0],
        [380, 20, 0], [470, 20, .3], [560, 20, 0]],
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
      arrow: [[0, 55, 0], [20, 55, .3], [50, 55, .4], [85, 55, .2], [100, 55, 0],
        [160, 0, 0], [172, 5, .3], [200, 15, .6], [230, 10, .9], [260, 0, .8], [290, -10, .4], [300, -10, 0],
        [380, 195, 0], [470, 195, .35], [560, 195, 0]],
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

  /* ---------- Heart SVG ---------- */
  var svg = document.getElementById("ecgcSvg");
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(n);
    return n;
  }
  svg.setAttribute("viewBox", "-60 20 640 450");

  var defs = el("defs", {});
  var dep = el("pattern", { id: "ecgcDep", width: 8, height: 8, patternUnits: "userSpaceOnUse" }, defs);
  el("rect", { width: 8, height: 8, fill: "var(--ecgc-blue)", "fill-opacity": .22 }, dep);
  el("circle", { cx: 4, cy: 4, r: 1.5, fill: "var(--ecgc-blue)" }, dep);
  var hatch = el("pattern", { id: "ecgcHatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  el("rect", { width: 6, height: 6, fill: "#fff" }, hatch);
  el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "var(--ecgc-orange)", "stroke-width": 3 }, hatch);
  var mk = el("marker", { id: "ecgcHead", viewBox: "0 0 10 10", refX: 6, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--ecgc-magenta)" }, mk);

  var REGIONS = {
    RA: "M150,95 C118,102 108,150 124,186 L216,190 L220,112 C200,96 176,90 150,95 Z",
    LA: "M236,96 C270,80 330,84 350,110 C366,136 360,170 346,186 L240,190 Z",
    RV: "M124,196 L220,198 L268,362 C230,374 186,354 160,324 C134,292 120,242 124,196 Z",
    SEP: "M220,198 L242,198 L290,392 C282,380 275,370 268,362 Z",
    LV: "M242,198 L350,192 C392,226 398,300 372,348 C352,386 318,400 290,392 Z"
  };
  // Direction of the activation sweep in each region: [x1, y1, x2, y2].
  var SWEEP = {
    RA: [160, 95, 215, 190], LA: [235, 95, 355, 175],
    RV: [250, 300, 120, 220], LV: [265, 375, 365, 195],
    SEP: { lr: [262, 290, 232, 290], rl: [232, 290, 262, 290] }
  };
  var PATHS = {
    intern: "M165,100 C180,130 200,160 224,186",
    bach: "M168,98 C200,85 250,82 300,100",
    avn: "M220,182 L230,198",
    his: "M230,198 L234,222",
    rb: "M234,222 C238,260 250,310 262,350",
    lb: "M234,222 L250,232",
    laf: "M250,232 C280,238 315,240 345,232",
    lpf: "M250,232 C262,280 272,330 282,372",
    purkR: "M262,352 C230,362 190,352 165,325 C145,300 135,260 137,215",
    purkL: "M282,375 C310,388 350,375 372,340 C390,305 392,260 378,215"
  };
  var ATRIAL = { intern: 1, bach: 1, avn: 1 };

  var gRegions = el("g", { "aria-hidden": "true" });
  var regionNodes = {};
  Object.keys(REGIONS).forEach(function (r) {
    el("path", { d: REGIONS[r], fill: "var(--ecgc-grey-soft)", stroke: "var(--ecgc-grey)", "stroke-width": 1.5 }, gRegions);
    var grad = el("linearGradient", { id: "ecgcG" + r, gradientUnits: "userSpaceOnUse" }, defs);
    var s0 = el("stop", { offset: 0, "stop-color": "#fff" }, grad);
    var s1 = el("stop", { offset: 0, "stop-color": "#fff" }, grad);
    var s2 = el("stop", { offset: 0, "stop-color": "#000" }, grad);
    el("stop", { offset: 1, "stop-color": "#000" }, grad);
    var mask = el("mask", { id: "ecgcM" + r, maskUnits: "userSpaceOnUse", x: -60, y: 0, width: 640, height: 470 }, defs);
    el("rect", { x: -60, y: 0, width: 640, height: 470, fill: "url(#ecgcG" + r + ")" }, mask);
    var over = el("path", { d: REGIONS[r], fill: "url(#ecgcDep)", mask: "url(#ecgcM" + r + ")", opacity: 0 }, gRegions);
    regionNodes[r] = { grad: grad, s1: s1, s2: s2, over: over };
  });
  // Chamber names inside the chambers.
  [["RA", 160, 160], ["LA", 298, 145], ["RV", 178, 280], ["LV", 342, 352]].forEach(function (c) {
    el("text", { x: c[1], y: c[2], "text-anchor": "middle", "class": "ecgc-chamber", "font-size": 18, "font-weight": 700, fill: "var(--ecgc-ink)", "font-family": "var(--font-sans)" }, gRegions).textContent = c[0];
  });

  var gBlock = el("g", { "aria-hidden": "true" });
  var gPaths = el("g", { "aria-hidden": "true" });
  var pathNodes = {};
  Object.keys(PATHS).forEach(function (p) {
    var w = p === "avn" ? 8 : 3.5;
    var base = el("path", { d: PATHS[p], fill: "none", stroke: "var(--ecgc-grey)", "stroke-width": w, "stroke-linecap": "round" }, gPaths);
    var act = el("path", { d: PATHS[p], fill: "none", stroke: "var(--ecgc-blue)", "stroke-width": w + 1, "stroke-linecap": "round", opacity: 0 }, gPaths);
    var len = act.getTotalLength();
    act.setAttribute("stroke-dasharray", len + " " + len);
    pathNodes[p] = { base: base, act: act, len: len };
  });
  var saNode = el("ellipse", { cx: 165, cy: 100, rx: 9, ry: 6, fill: "var(--ecgc-grey)", stroke: "var(--ecgc-ink)", "stroke-width": 1 }, gPaths);
  var gHeads = el("g", { "aria-hidden": "true" });
  var heads = {};
  Object.keys(PATHS).forEach(function (p) {
    var g = el("g", { opacity: 0 }, gHeads);
    if (!reduced) el("circle", { r: 11, fill: "var(--ecgc-blue)", "fill-opacity": .25 }, g);
    el("circle", { r: 5.5, fill: "var(--ecgc-blue)", stroke: "#fff", "stroke-width": 1.5 }, g);
    heads[p] = g;
  });

  // Fixed labels outside the heart, with thin leader lines.
  var LABELS = [
    ["SA node", 50, 62, 160, 98, "end"], ["Internodal paths", 50, 140, 188, 145, "end"], ["AV node", 50, 196, 220, 188, "end"],
    ["Right bundle", 50, 262, 244, 290, "end"], ["Purkinje fibres", 50, 352, 168, 330, "end"],
    ["Bachmann's bundle", 470, 62, 282, 90, "start"], ["His bundle", 470, 152, 233, 208, "start"], ["Left bundle", 470, 200, 244, 228, "start"],
    ["Anterior fascicle", 470, 236, 330, 238, "start"], ["Posterior fascicle", 470, 318, 272, 330, "start"], ["Septum", 470, 398, 279, 372, "start"]
  ];
  var gLab = el("g", { "class": "ecgc-labels" });
  LABELS.forEach(function (l) {
    var lx = l[5] === "end" ? l[1] + 4 : l[1] - 4;
    el("line", { x1: lx, y1: l[2] - 4, x2: l[3], y2: l[4], stroke: "var(--ecgc-ink)", "stroke-width": .8, "stroke-opacity": .6 }, gLab);
    el("circle", { cx: l[3], cy: l[4], r: 1.8, fill: "var(--ecgc-ink)" }, gLab);
    el("text", { x: l[1], y: l[2], "text-anchor": l[5], "font-size": 13, "font-family": "var(--font-sans)", fill: "var(--ecgc-ink)" }, gLab).textContent = l[0];
  });
  var blockText = el("text", { "font-size": 13, "font-weight": 700, "font-family": "var(--font-sans)", fill: "var(--ecgc-ink)", stroke: "#fff", "stroke-width": 4, "paint-order": "stroke", opacity: 0 }, svg);

  // Electrodes: limb leads at their frontal angles; chest leads on an inner arc (projected, see review note).
  var C = { x: 262, y: 255 };
  var ANG = { I: 0, II: 60, III: 120, aVF: 90, aVL: -30, aVR: -150, V1: 160, V2: 130, V3: 105, V4: 80, V5: 45, V6: 15 };
  function elecPos(L) { var r = L.charAt(0) === "V" ? 180 : 205, a = ANG[L] * Math.PI / 180; return { x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a), a: a }; }
  var SLOTS = ["A", "B", "C"];
  var SHAPES = {
    A: function (g) { el("circle", { r: 9, fill: "#fff", stroke: "var(--ecgc-ink)", "stroke-width": 2.5 }, g); },
    B: function (g) { el("rect", { x: -8.5, y: -8.5, width: 17, height: 17, fill: "#fff", stroke: "var(--ecgc-ink)", "stroke-width": 2.5 }, g); },
    C: function (g) { el("path", { d: "M0,-10 L10,8 L-10,8 Z", fill: "#fff", stroke: "var(--ecgc-ink)", "stroke-width": 2.5, "stroke-linejoin": "round" }, g); }
  };
  var gElec = el("g", {});
  var elecNodes = SLOTS.map(function (s) {
    var g = el("g", { id: "ecgcElec-" + s, "class": "ecgc-elec", role: "img" }, gElec);
    var line = el("line", { stroke: "var(--ecgc-ink)", "stroke-width": 1.2, "stroke-dasharray": "4 4", "stroke-opacity": .7 }, g);
    var m = el("g", {}, g);
    SHAPES[s](m);
    el("text", { y: 4.5, "text-anchor": "middle", "font-size": 11, "font-weight": 700, "font-family": "var(--font-sans)", fill: "var(--ecgc-ink)" }, m).textContent = s;
    var tx = el("text", { "font-size": 13, "font-weight": 700, "font-family": "var(--font-sans)", fill: "var(--ecgc-ink)", stroke: "#fff", "stroke-width": 4, "paint-order": "stroke" }, g);
    return { g: g, line: line, m: m, tx: tx };
  });

  var gArrow = el("g", { "aria-hidden": "true" });
  var arrowLine = el("line", { stroke: "var(--ecgc-magenta)", "stroke-width": 7, "stroke-linecap": "round", "marker-end": "url(#ecgcHead)" }, gArrow);
  var arrowTail = el("circle", { r: 4, fill: "var(--ecgc-magenta)" }, gArrow);
  var arrowText = el("text", { "font-size": 13, "font-weight": 700, "font-family": "var(--font-sans)", fill: "var(--ecgc-magenta)", stroke: "#fff", "stroke-width": 4, "paint-order": "stroke" }, gArrow);

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
      '<span class="ecgc-lead-note">Electrode ' + s + " on the heart</span></div>" +
      '<canvas role="img"></canvas>';
    leadsBox.appendChild(wrap);
    var sel = wrap.querySelector("select");
    sel.value = state.leads[i];
    sel.addEventListener("change", function () { state.leads[i] = sel.value; layoutElectrodes(); render(); });
    return { wrap: wrap, sel: sel, cv: wrap.querySelector("canvas") };
  });

  function layoutElectrodes() {
    elecNodes.forEach(function (n, i) {
      var L = state.leads[i], p = elecPos(L);
      var near = { x: C.x + 118 * Math.cos(p.a), y: C.y + 118 * Math.sin(p.a) };
      n.line.setAttribute("x1", p.x); n.line.setAttribute("y1", p.y);
      n.line.setAttribute("x2", near.x); n.line.setAttribute("y2", near.y);
      n.m.setAttribute("transform", "translate(" + p.x.toFixed(1) + "," + p.y.toFixed(1) + ")");
      var right = Math.cos(p.a) >= -0.2;
      n.tx.setAttribute("x", (p.x + (right ? 14 : -14)).toFixed(1));
      n.tx.setAttribute("y", (p.y + (Math.sin(p.a) > 0.5 ? 18 : 5)).toFixed(1));
      n.tx.setAttribute("text-anchor", right ? "start" : "end");
      n.tx.textContent = L;
      n.g.setAttribute("data-lead", L);
      n.g.setAttribute("aria-label", "Electrode " + SLOTS[i] + ", lead " + L);
      panels[i].cv.setAttribute("aria-label", "Lead " + L + " trace, " + COND[state.cond].name);
    });
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
        return { ang: lerp(k[i][1], k[i + 1][1], f), mag: lerp(k[i][2], k[i + 1][2], f) };
      }
    }
    return { ang: 0, mag: 0 };
  }

  function renderHeart(t) {
    var c = COND[state.cond], qrs = seg(state.cond, "QRS"), tw = seg(state.cond, "T");
    var ventFade = t < tw[1] ? 1 : Math.max(0, 1 - (t - tw[1]) / (tw[2] - tw[1]));
    var atrFade = t < 150 ? 1 : Math.max(0, 1 - (t - 150) / (qrs[2] - 150));
    Object.keys(regionNodes).forEach(function (r) {
      var n = regionNodes[r], f = prog(c.region[r], t), sw = r === "SEP" ? SWEEP.SEP[c.sepDir] : SWEEP[r];
      n.grad.setAttribute("x1", sw[0]); n.grad.setAttribute("y1", sw[1]); n.grad.setAttribute("x2", sw[2]); n.grad.setAttribute("y2", sw[3]);
      n.s1.setAttribute("offset", f); n.s2.setAttribute("offset", Math.min(1, f + 0.05));
      var fade = (r === "RA" || r === "LA") ? atrFade : ventFade;
      n.over.setAttribute("opacity", f > 0 ? fade : 0);
    });
    Object.keys(pathNodes).forEach(function (p) {
      var n = pathNodes[p], f = prog(c.path[p], t), blocked = c.blocked.indexOf(p) >= 0;
      var fade = ATRIAL[p] ? (p === "avn" ? ventFade : atrFade) : ventFade;
      n.act.setAttribute("opacity", f > 0 ? fade : 0);
      n.act.setAttribute("stroke-dashoffset", (n.len * (1 - Math.max(0, f))).toFixed(1));
      n.base.setAttribute("stroke", blocked ? "var(--ecgc-orange)" : "var(--ecgc-grey)");
      n.base.setAttribute("stroke-dasharray", blocked ? "5 4" : "none");
      var h = heads[p];
      if (f > 0 && f < 1) {
        var pt = n.act.getPointAtLength(n.len * f);
        h.setAttribute("transform", "translate(" + pt.x.toFixed(1) + "," + pt.y.toFixed(1) + ")");
        h.setAttribute("opacity", 1);
      } else h.setAttribute("opacity", 0);
    });
    var saOn = t >= 0 && t < 14;
    saNode.setAttribute("fill", saOn ? "var(--ecgc-blue)" : "var(--ecgc-grey)");

    // Arrow
    var a = arrowAt(state.cond, t), isT = t >= tw[1] && t <= tw[2];
    var isP = t < 100;
    var o = isP ? { x: 235, y: 140 } : { x: 275, y: 285 };
    if (a.mag < 0.06) {
      gArrow.setAttribute("opacity", 0);
    } else {
      var len = 28 + 72 * a.mag, rad = a.ang * Math.PI / 180;
      var ex = o.x + len * Math.cos(rad), ey = o.y + len * Math.sin(rad);
      gArrow.setAttribute("opacity", 1);
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
    var g = svg.querySelectorAll(".ecgc-blockmark");
    for (var i = 0; i < g.length; i++) g[i].parentNode.removeChild(g[i]);
    if (!c.blockAt) { blockText.setAttribute("opacity", 0); return; }
    c.blocked.forEach(function (p) {
      el("path", { d: PATHS[p], fill: "none", stroke: "url(#ecgcHatch)", "stroke-width": 14, "stroke-linecap": "round", "class": "ecgc-blockmark", opacity: .9 }, gBlock);
    });
    var n = pathNodes[c.blockAt], pt = n.act.getPointAtLength(n.len * (c.blockAt === "rb" ? 0.35 : 0.55));
    var x = el("path", { d: "M-8,-8 L8,8 M8,-8 L-8,8", stroke: "var(--ecgc-ink)", "stroke-width": 4, "stroke-linecap": "round", transform: "translate(" + pt.x + "," + pt.y + ")", "class": "ecgc-blockmark" }, svg);
    svg.insertBefore(x, gElec);
    var isR = c.blockAt === "rb";
    blockText.setAttribute("x", isR ? pt.x - 14 : pt.x + 4);
    blockText.setAttribute("y", isR ? pt.y + 5 : pt.y + 26);
    blockText.setAttribute("text-anchor", isR ? "end" : "start");
    blockText.textContent = isR ? "Right bundle blocked" : "Left bundle blocked";
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
