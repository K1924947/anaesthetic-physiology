/* ECG Basics: interactive labelled lead II beat, normal values and a short quiz. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var DEG = Math.PI / 180;
  var BEAT_P = { pr: 0.16, qrs: 0.09, qt: 0.40, axis: 60, u: true };
  var RR = 1.0;
  var BS = { part: "P", hover: null };
  var BG = { x0: 20, y0: 242, u: 16, tStart: -0.08, tEnd: 1.30 };

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
      }
    }
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function T() {
    return window.PhysioTheme ? PhysioTheme.tokens() : {
      a: "#184A63", b: "#0B6B5F", c: "#9A3412", d: "#1A2330", e: "#5C4A2E",
      text: "#1A2330", muted: "#4E5968", surface: "#FFFFFF", border: "#D4D0C8", grid: "#E4DFD6"
    };
  }
  function cssVar(n) {
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  }
  function clearSvg(svg) {
    Array.prototype.slice.call(svg.childNodes).forEach(function (n) {
      if (n.nodeName !== "title" && n.nodeName !== "desc") svg.removeChild(n);
    });
  }
  function fontSans() {
    return cssVar("--font-sans") || "Source Sans 3, Helvetica, Arial, sans-serif";
  }

  function norm3(v) {
    var m = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / m, v[1] / m, v[2] / m];
  }
  function scale3(v, k) { return [v[0] * k, v[1] * k, v[2] * k]; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function leadII() { return [Math.cos(60 * DEG), Math.sin(60 * DEG), 0]; }

  /* Reused from the earlier Build a beat draft: a sum of Gaussian bumps whose
     lead II voltage is the dot product with the lead II axis. */
  function beatBumps(p) {
    var b = [], q0 = p.pr, k = p.qrs / 0.09, a = p.axis * DEG;
    b.push({ part: "P", c: 0.035, sl: 0.017, sr: 0.017, v: scale3(norm3([0.35, 0.75, 0.45]), 0.13) });
    b.push({ part: "P", c: 0.068, sl: 0.017, sr: 0.017, v: scale3(norm3([0.75, 0.45, -0.5]), 0.11) });
    b.push({ part: "QRS", c: q0 + 0.012 * k, sl: 0.006 * k, sr: 0.006 * k, v: scale3(norm3([-0.55, 0.3, 0.75]), 0.2) });
    b.push({ part: "QRS", c: q0 + 0.040 * k, sl: 0.0115 * k, sr: 0.0115 * k, v: scale3(norm3([Math.cos(a), Math.sin(a), -0.1]), 1.3) });
    b.push({ part: "QRS", c: q0 + 0.050 * k, sl: 0.009 * k, sr: 0.009 * k, v: scale3(norm3([0.35, 0.1, -1]), 0.36) });
    b.push({ part: "QRS", c: q0 + 0.068 * k, sl: 0.008 * k, sr: 0.008 * k, v: scale3(norm3([-0.35, -0.5, -0.75]), 0.28) });
    var tv = scale3(norm3([0.65, 0.55, 0.12]), 0.3 * (p.tScale || 1));
    b.push({ part: "T", c: q0 + p.qt - 0.105, sl: 0.055, sr: 0.034, v: tv });
    if (p.u) b.push({ part: "U", c: q0 + p.qt + 0.075, sl: 0.028, sr: 0.028, v: scale3(tv, 0.14) });
    return b;
  }
  function bumpVal(bm, t) {
    var d = t - bm.c, s = d < 0 ? bm.sl : bm.sr;
    return Math.exp(-0.5 * d * d / (s * s));
  }
  function beatV(bumps, t) {
    var d = leadII(), v = 0, i, bm;
    for (i = 0; i < bumps.length; i++) {
      bm = bumps[i];
      if (Math.abs(t - bm.c) < 5 * Math.max(bm.sl, bm.sr)) v += bumpVal(bm, t) * dot3(bm.v, d);
    }
    return v;
  }
  function voltage(bumps, t) {
    return beatV(bumps, t) + beatV(bumps, t - RR);
  }

  function patterns(svg, pre) {
    var t = T(), defs = el("defs", null, svg);
    var p = el("pattern", { id: pre + "-hatch", patternUnits: "userSpaceOnUse", width: 8, height: 8 }, defs);
    el("rect", { width: 8, height: 8, fill: t.a, "fill-opacity": 0.14 }, p);
    el("path", { d: "M0 8 L8 0 M-2 2 L2 -2 M6 10 L10 6", stroke: t.a, "stroke-width": 1.3, fill: "none" }, p);
    return defs;
  }
  function paper(g, x, y, w, h, u) {
    var minor = cssVar("--ecg-minor") || "#F3CDD0";
    var major = cssVar("--ecg-major") || "#DE9AA1";
    var bg = cssVar("--ecg-paper") || "#FFFDFC";
    el("rect", { x: x, y: y, width: w, height: h, fill: bg }, g);
    var d1 = "", d2 = "", i, n, xx, yy;
    for (i = 0, n = Math.round(w / u); i <= n; i++) {
      xx = (x + i * u).toFixed(2);
      if (i % 5) d1 += "M" + xx + " " + y + "V" + (y + h);
      else d2 += "M" + xx + " " + y + "V" + (y + h);
    }
    for (i = 0, n = Math.round(h / u); i <= n; i++) {
      yy = (y + i * u).toFixed(2);
      if (i % 5) d1 += "M" + x + " " + yy + "H" + (x + w);
      else d2 += "M" + x + " " + yy + "H" + (x + w);
    }
    el("path", { d: d1, stroke: minor, "stroke-width": u * 0.06, fill: "none" }, g);
    el("path", { d: d2, stroke: major, "stroke-width": u * 0.12, fill: "none" }, g);
  }
  function fnPath(f, t0, t1, x0, y0, sx, sy, dt) {
    dt = dt || 0.002;
    var d = "", t;
    for (t = t0; t <= t1 + 1e-9; t += dt) {
      d += (d ? "L" : "M") + (x0 + (t - t0) * sx).toFixed(2) + " " + (y0 - f(t) * sy).toFixed(2);
    }
    return d;
  }
  function bx(t) {
    return BG.x0 + 8 * BG.u + (t - BG.tStart) * 25 * BG.u;
  }

  var LINKS = {
    p: "https://litfl.com/p-wave-ecg-library/",
    pr: "https://litfl.com/pr-interval-ecg-library/",
    prs: "https://litfl.com/pr-segment-ecg-library/",
    qrs: "https://litfl.com/qrs-interval-ecg-library/",
    q: "https://litfl.com/q-wave-ecg-library/",
    st: "https://litfl.com/st-segment-ecg-library/",
    tw: "https://litfl.com/t-wave-ecg-library/",
    u: "https://litfl.com/u-wave-ecg-library/",
    qt: "https://litfl.com/qt-interval-ecg-library/",
    rate: "https://litfl.com/ecg-rate-interpretation/",
    klab: "https://cvphysiology.com/arrhythmias/a009"
  };

  var PARTS = {
    P: {
      name: "P wave",
      short: "P wave",
      t: [0.0, 0.105],
      event: "Atrial depolarisation. The impulse leaves the SA node and spreads through the right atrium, then the left.",
      normal: "LITFL: duration under 0.12 s (3 small squares); height under 2.5 mm (0.25 mV) in the limb leads. Upright in I and II, inverted in aVR; often biphasic in V1. Klabunde gives a usual duration of 0.08 to 0.10 s.",
      srcHtml: srcPair("LITFL, P wave", LINKS.p, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    PRs: {
      name: "PR segment",
      short: "PR seg",
      t: [0.105, 0.16],
      event: "The flat line after the P wave. The impulse is delayed in the AV node, then travels through the bundle of His and the bundle branches. Too little tissue depolarises to write a wave, so the line stays isoelectric. Atrial repolarisation is usually hidden in the QRS.",
      normal: "Flat and isoelectric, judged against the T-P segment (LITFL). Klabunde describes this brief isoelectric period as the time the impulse is travelling in the AV node and the bundle of His.",
      srcHtml: srcPair("LITFL, PR segment", LINKS.prs, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    PRi: {
      name: "PR interval",
      short: "PR int",
      t: [0.0, 0.16],
      bracket: true,
      event: "From the start of the P wave to the start of the QRS: atrial depolarisation plus the delay at the AV node (the P wave plus the PR segment).",
      normal: "0.12 to 0.20 s (3 to 5 small squares). Over 0.20 s: first degree AV block. Under 0.12 s: pre-excitation or a junctional rhythm. LITFL and Klabunde agree on this range.",
      srcHtml: srcPair("LITFL, PR interval", LINKS.pr, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    QRS: {
      name: "QRS complex",
      short: "QRS",
      t: [0.16, 0.25],
      event: "Ventricular depolarisation. The septum depolarises first, left to right (a small q in left-sided leads), then the main mass of both ventricles via the bundle branches and Purkinje fibres.",
      normal: "LITFL: 70 to 100 ms is normal; over 100 ms is abnormal; over 120 ms is required to diagnose bundle branch block or a ventricular rhythm. Klabunde: normally 0.06 to 0.10 s, and prolonged if over 0.10 s. A common UK teaching figure is under 0.12 s (Hampton, The ECG Made Easy).",
      srcHtml: srcTrio("LITFL, QRS interval", LINKS.qrs, "LITFL, Q wave", LINKS.q, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    ST: {
      name: "ST segment",
      short: "ST",
      t: [0.25, 0.34],
      event: "The ventricles are fully depolarised, so there is little voltage difference and the line is flat. It runs from the end of the QRS (the J point) to the start of the T wave. Klabunde notes that this roughly corresponds to the plateau (phase 2) of the ventricular action potential.",
      normal: "Isoelectric, level with the baseline. Elevation or depression is judged at the J point against the T-P segment (LITFL).",
      srcHtml: srcPair("LITFL, ST segment", LINKS.st, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    T: {
      name: "T wave",
      short: "T wave",
      t: [0.34, 0.56],
      event: "Ventricular repolarisation. It usually points the same way as the QRS because the last cells to depolarise (in the subepicardium) are the first to repolarise (Klabunde).",
      normal: "Upright in all leads except aVR and V1. Height under 5 mm in the limb leads and under 10 mm in the chest leads (LITFL; 10 mm in men and 8 mm in women in the precordial leads).",
      srcHtml: srcPair("LITFL, T wave", LINKS.tw, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    U: {
      name: "U wave",
      short: "U wave",
      t: [0.59, 0.72],
      event: "A small wave after the T wave. LITFL notes that its origin is uncertain. Klabunde describes it as the last remnants of ventricular repolarisation.",
      normal: "Small (about 0.5 mm), same direction as the T wave, best seen in V2 and V3, and usually visible only at slower rates (LITFL).",
      srcHtml: srcPair("LITFL, U wave", LINKS.u, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    QT: {
      name: "QT interval",
      short: "QT",
      t: [0.16, 0.56],
      bracket: true,
      event: "From the start of the QRS to the end of the T wave: the whole of ventricular depolarisation and repolarisation. It shortens as the heart rate rises, so it is usually quoted as a rate-corrected value (QTc).",
      normal: "LITFL: QTc is prolonged if over 440 ms in men or over 460 ms in women; over 500 ms is linked to torsades de pointes; under 350 ms is abnormally short. Klabunde: a normal QTc is 0.44 s or less (one cut-off, not split by sex). Rule of thumb: a normal QT is under half the preceding RR (LITFL). On this trace the rate is 60 /min and QT is 0.40 s, so Bazett QTc is 0.40 s.",
      srcHtml: srcPair("LITFL, QT interval", LINKS.qt, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    RR: {
      name: "RR interval and rate",
      short: "RR / rate",
      t: [0.205, 1.205],
      bracket: true,
      bracketY: "rr",
      event: "The RR interval is the time from one R wave to the next: the cycle length of the ventricular rhythm. It is how you work out the heart rate on paper.",
      normal: "LITFL (adults): a normal rate is 50 to 100 /min, bradycardia under 50 /min and tachycardia over 100 /min. Many textbooks still use 60 to 100 /min as the normal range. At 25 mm/s, rate = 300 divided by the number of large squares between consecutive R waves (or 1500 divided by the number of small squares). For an irregular rhythm, count the QRS complexes in 10 seconds and multiply by 6. On this trace RR is 1.00 s (5 large squares), so the rate is 60 /min.",
      srcHtml: srcPair("LITFL, ECG rate interpretation", LINKS.rate, "Klabunde, Electrocardiogram", LINKS.klab)
    }
  };
  var PART_ORDER = ["P", "PRs", "PRi", "QRS", "ST", "T", "U", "QT", "RR"];

  function srcPair(a, au, b, bu) {
    return '<a href="' + au + '" target="_blank" rel="noopener">' + esc(a) + '</a> · <a href="' + bu + '" target="_blank" rel="noopener">' + esc(b) + '</a>.';
  }
  function srcTrio(a, au, b, bu, c, cu) {
    return '<a href="' + au + '" target="_blank" rel="noopener">' + esc(a) + '</a> · <a href="' + bu + '" target="_blank" rel="noopener">' + esc(b) + '</a> · <a href="' + cu + '" target="_blank" rel="noopener">' + esc(c) + '</a>.';
  }

  function activeKey() { return BS.hover || BS.part; }

  function drawBeat() {
    var svg = $("beatSvg");
    if (!svg) return;
    var t = T(), ink = cssVar("--ecg-ink") || "#111";
    var fam = fontSans();
    var u = BG.u;
    var gx = BG.x0, gy = 16;
    var gw = 8 * u + (BG.tEnd - BG.tStart) * 25 * u, gh = 20 * u;
    var y0 = gy + 14 * u;
    BG.y0 = y0;
    var paperBottom = gy + gh;
    var prY = paperBottom + 32;
    var qtY = prY + 32;
    var rrY = qtY + 36;
    var vbW = gx + gw + 16;
    var vbH = rrY + 24;
    clearSvg(svg);
    svg.setAttribute("viewBox", "0 0 " + Math.ceil(vbW) + " " + Math.ceil(vbH));
    patterns(svg, "bt");
    var g = el("g", null, svg);
    paper(g, gx, gy, gw, gh, u);

    var cx = gx + u;
    el("path", {
      d: "M" + gx + " " + y0 + "H" + cx + "V" + (y0 - 10 * u) + "H" + (cx + 5 * u) + "V" + y0 + "H" + (cx + 7 * u),
      fill: "none", stroke: ink, "stroke-width": 2.4
    }, g);
    el("text", { x: cx + 2.5 * u, y: y0 - 10 * u - 8, "text-anchor": "middle", fill: t.muted, "font-family": fam, class: "lab-small" }, g, "1 mV");

    var key = activeKey(), P = PARTS[key];
    var hx0 = bx(P.t[0]), hx1 = bx(P.t[1]);
    if (P.bracket && P.bracketY !== "rr") {
      el("rect", { x: hx0, y: gy, width: hx1 - hx0, height: gh, fill: "url(#bt-hatch)", stroke: t.a, "stroke-width": 1.5, "stroke-dasharray": "5 3" }, g);
    } else if (!P.bracket) {
      el("rect", { x: hx0, y: gy, width: Math.max(hx1 - hx0, 2), height: gh, fill: "url(#bt-hatch)", stroke: t.a, "stroke-width": 1.5, "stroke-dasharray": "5 3" }, g);
    }

    var bumps = beatBumps(BEAT_P);
    var f = function (tt) { return voltage(bumps, tt); };
    el("path", {
      d: fnPath(f, BG.tStart, BG.tEnd, bx(BG.tStart), y0, 25 * u, 10 * u, 0.002),
      fill: "none", stroke: ink, "stroke-width": 2.8, "stroke-linejoin": "round", "stroke-linecap": "round"
    }, g);
    if (!P.bracket) {
      el("path", {
        d: fnPath(f, P.t[0], P.t[1], hx0, y0, 25 * u, 10 * u, 0.002),
        fill: "none", stroke: t.a, "stroke-width": 6.5, "stroke-linejoin": "round", "stroke-linecap": "round"
      }, g);
    }

    var lab = [
      ["P", 0.05, 0.2],
      ["Q", 0.168, -0.16],
      ["R", 0.205, 1.32],
      ["S", 0.240, -0.16],
      ["T", 0.455, 0.42],
      ["U", 0.635, 0.16],
      ["R", 1.205, 1.32]
    ];
    lab.forEach(function (l) {
      el("text", {
        x: bx(l[1]),
        y: y0 - l[2] * 10 * u + (l[2] < 0 ? 16 : -8),
        "text-anchor": "middle",
        fill: t.text,
        "font-family": fam,
        class: "lab-wave"
      }, g, l[0]);
    });
    el("text", { x: bx(0.33), y: y0 - 12, "text-anchor": "middle", fill: t.muted, "font-family": fam, class: "lab-small" }, g, "ST");
    el("text", { x: bx(0.25) + 28, y: y0 + 28, "text-anchor": "start", fill: t.muted, "font-family": fam, class: "lab-small" }, g, "J point");
    el("circle", { cx: bx(0.25), cy: y0, r: 3.5, fill: t.text }, g);

    function bracket(t0, t1, y, text, partKey, labelSide) {
      var x0 = bx(t0), x1 = bx(t1), on = key === partKey;
      var tick = 12;
      el("path", {
        d: "M" + x0 + " " + (y - tick) + "V" + y + "H" + x1 + "V" + (y - tick),
        fill: "none",
        stroke: on ? t.a : t.text,
        "stroke-width": on ? 3.6 : 2,
        "stroke-linecap": "square",
        "stroke-linejoin": "miter"
      }, g);
      var labelY, anchor, lx;
      if (labelSide === "below") {
        labelY = y + 18; anchor = "middle"; lx = (x0 + x1) / 2;
      } else {
        labelY = y - tick - 4; anchor = "middle"; lx = (x0 + x1) / 2;
      }
      el("text", {
        x: lx, y: labelY, "text-anchor": anchor,
        fill: on ? t.a : t.text, "font-family": fam, class: "lab-int"
      }, g, text);
    }
    bracket(0, 0.16, prY, "PR interval", "PRi");
    bracket(0.16, 0.56, qtY, "QT interval", "QT");
    bracket(0.205, 1.205, rrY, "RR interval (1.00 s)", "RR", "below");

    PART_ORDER.forEach(function (k) {
      var p = PARTS[k], x0 = bx(p.t[0]), x1 = bx(p.t[1]);
      var r;
      if (k === "RR") r = { x: x0, y: rrY - 16, width: x1 - x0, height: 40 };
      else if (k === "PRi") r = { x: x0, y: prY - 28, width: Math.max(x1 - x0, 8), height: 36 };
      else if (k === "QT") r = { x: x0, y: qtY - 28, width: Math.max(x1 - x0, 8), height: 36 };
      else r = { x: x0, y: gy, width: Math.max(x1 - x0, 8), height: gh };
      var hg = el("g", { class: "hit", "aria-hidden": "true", style: "cursor:pointer" }, g);
      el("rect", Object.assign({ fill: "transparent" }, r), hg);
      hg.addEventListener("click", function (ev) {
        ev.preventDefault();
        selectPart(k);
      });
      hg.addEventListener("pointerenter", function () { previewPart(k); });
      hg.addEventListener("pointerleave", function () { previewPart(null); });
    });
  }

  function beatPanel(key, preview) {
    var P = PARTS[key];
    var box = $("beatPanel");
    if (!box) return;
    var kicker = (preview ? "Preview · " : "") + (P.bracket ? "Interval" : "Part of the beat");
    box.innerHTML =
      "<p class='kicker'>" + esc(kicker) + "</p>" +
      "<h3 class='explain-title tool-title'>" + esc(P.name) + "</h3>" +
      "<div class='panel-block'><h3>What it represents</h3><p>" + esc(P.event) + "</p></div>" +
      "<div class='panel-block'><h3>Normal values</h3><p>" + esc(P.normal) + "</p></div>" +
      "<p class='src-line'>Sources: " + P.srcHtml + "</p>";
  }

  function syncBtns() {
    document.querySelectorAll("#partBtns .t-btn").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.part === BS.part ? "true" : "false");
    });
  }

  function selectPart(k) {
    BS.part = k;
    BS.hover = null;
    syncBtns();
    drawBeat();
    beatPanel(k, false);
    var live = $("beatLive");
    if (live) live.textContent = PARTS[k].name + " selected.";
  }

  function previewPart(k) {
    if (window.matchMedia && window.matchMedia("(hover: none)").matches && k) return;
    BS.hover = k;
    drawBeat();
    beatPanel(k || BS.part, !!k && k !== BS.part);
  }

  function initBeat() {
    var box = $("partBtns");
    PART_ORDER.forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "t-btn";
      b.dataset.part = k;
      b.textContent = PARTS[k].short;
      b.setAttribute("aria-label", PARTS[k].name);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { selectPart(k); });
      box.appendChild(b);
    });
    box.addEventListener("keydown", function (ev) {
      var keys = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" };
      if (!(ev.key in keys)) return;
      ev.preventDefault();
      var i = PART_ORDER.indexOf(BS.part);
      if (keys[ev.key] === "first") i = 0;
      else if (keys[ev.key] === "last") i = PART_ORDER.length - 1;
      else i = (i + keys[ev.key] + PART_ORDER.length) % PART_ORDER.length;
      selectPart(PART_ORDER[i]);
      var next = box.querySelector('[data-part="' + PART_ORDER[i] + '"]');
      if (next) next.focus();
    });
    selectPart("P");
  }

  var QUIZ = [
    {
      q: "The P wave represents:",
      o: ["Atrial depolarisation", "Ventricular depolarisation", "Ventricular repolarisation", "AV node delay only"],
      a: 0,
      why: "The P wave is the wave of depolarisation spreading from the SA node through the atria.",
      src: srcPair("LITFL, P wave", LINKS.p, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    {
      q: "The normal PR interval is:",
      o: ["0.12 to 0.20 s", "0.06 to 0.10 s", "0.20 to 0.30 s", "Under 0.08 s"],
      a: 0,
      why: "From the start of the P wave to the start of the QRS: 3 to 5 small squares. Over 0.20 s is first degree AV block.",
      src: srcPair("LITFL, PR interval", LINKS.pr, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    {
      q: "The QRS complex represents:",
      o: ["Ventricular depolarisation", "Atrial depolarisation", "Ventricular repolarisation", "The action potential plateau"],
      a: 0,
      why: "The QRS is ventricular depolarisation. Sources disagree slightly on the exact upper limit of a normal duration: see the table above.",
      src: srcPair("LITFL, QRS interval", LINKS.qrs, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    {
      q: "The ST segment is normally:",
      o: [
        "Isoelectric, because the ventricles are fully depolarised",
        "A sharp upward spike",
        "Inverted in lead II",
        "The same thing as the QT interval"
      ],
      a: 0,
      why: "It is the flat line from the J point to the start of the T wave. Klabunde notes that it roughly corresponds to the plateau (phase 2) of the ventricular action potential.",
      src: srcPair("LITFL, ST segment", LINKS.st, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    {
      q: "According to LITFL, QTc is usually regarded as prolonged above:",
      o: ["440 ms in men and 460 ms in women", "400 ms in everyone", "500 ms in men and 520 ms in women", "350 ms"],
      a: 0,
      why: "LITFL uses those sex-specific cut-offs. Over 500 ms is linked to torsades de pointes; under 350 ms is abnormally short. Klabunde uses a single normal of 0.44 s or less. Bazett's formula is QTc = QT divided by the square root of RR, with RR in seconds.",
      src: srcPair("LITFL, QT interval", LINKS.qt, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    {
      q: "At 25 mm/s, a regular rhythm with 4 large squares between consecutive R waves has a rate of:",
      o: ["75 /min", "60 /min", "100 /min", "150 /min"],
      a: 0,
      why: "Rate = 300 divided by the number of large squares between R waves. 300 divided by 4 is 75 /min. (LITFL also gives adult bradycardia as under 50 /min, not under 60 /min.)",
      src: '<a href="' + LINKS.rate + '" target="_blank" rel="noopener">LITFL, ECG rate interpretation</a>.'
    }
  ];

  var QZ = { on: false, i: 0, score: 0, answered: false, picked: null };

  function setScore() {
    var s = $("testBannerScore");
    if (!s) return;
    s.hidden = !QZ.on;
    s.textContent = QZ.on ? ("Score " + QZ.score + " / " + QUIZ.length) : "";
  }

  function renderQuiz() {
    var root = $("quizBody");
    if (!root) return;
    if (QZ.i >= QUIZ.length) {
      root.innerHTML =
        "<p class='quiz-end'><strong>Finished.</strong> You scored " + QZ.score + " out of " + QUIZ.length + ".</p>" +
        "<div class='quiz-nav'><button type='button' class='t-btn' id='quizAgain'>Try again</button></div>";
      var again = $("quizAgain");
      if (again) again.addEventListener("click", function () {
        QZ.i = 0; QZ.score = 0; QZ.answered = false; QZ.picked = null;
        setScore();
        renderQuiz();
      });
      return;
    }
    var item = QUIZ[QZ.i];
    var html = "<p class='quiz-progress'>Question " + (QZ.i + 1) + " of " + QUIZ.length + "</p>";
    html += "<h3 class='quiz-q' id='quizQ'>" + esc(item.q) + "</h3>";
    html += "<ul class='quiz-opts' role='list'>";
    item.o.forEach(function (opt, idx) {
      var cls = "t-btn";
      var extra = "";
      if (QZ.answered) {
        if (idx === item.a) cls += " is-correct";
        if (QZ.picked === idx && idx !== item.a) cls += " is-wrong";
        extra = " disabled";
      }
      html += "<li><button type='button' class='" + cls + "' data-i='" + idx + "'" + extra + ">" + esc(opt) + "</button></li>";
    });
    html += "</ul>";
    if (QZ.answered) {
      var ok = QZ.picked === item.a;
      html += "<div class='quiz-feedback'><p><strong>" + (ok ? "Correct." : "Not quite.") + "</strong> " + esc(item.why) + "</p>";
      html += "<p class='src-line'>Sources: " + item.src + "</p></div>";
      html += "<div class='quiz-nav'><button type='button' class='t-btn' id='quizNext'>" + (QZ.i === QUIZ.length - 1 ? "See score" : "Next question") + "</button></div>";
    }
    root.innerHTML = html;
    root.querySelectorAll(".quiz-opts .t-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        if (QZ.answered) return;
        QZ.picked = parseInt(b.getAttribute("data-i"), 10);
        QZ.answered = true;
        if (QZ.picked === item.a) QZ.score += 1;
        setScore();
        renderQuiz();
      });
    });
    var nxt = $("quizNext");
    if (nxt) nxt.addEventListener("click", function () {
      QZ.i += 1;
      QZ.answered = false;
      QZ.picked = null;
      renderQuiz();
    });
  }

  function setTest(on) {
    QZ.on = on;
    if (on) {
      QZ.i = 0;
      QZ.score = 0;
      QZ.answered = false;
      QZ.picked = null;
    }
    var banner = $("testBanner");
    var panel = $("quizPanel");
    var btn = $("testToggle");
    if (banner) banner.classList.toggle("is-on", on);
    if (panel) panel.hidden = !on;
    if (btn) {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      var lab = btn.querySelector(".test-cta-label");
      if (lab) lab.textContent = on ? "Close" : "Start";
    }
    setScore();
    if (on) renderQuiz();
  }

  function initQuiz() {
    var btn = $("testToggle");
    if (btn) btn.addEventListener("click", function () { setTest(!QZ.on); });
  }

  function redraw() {
    drawBeat();
    beatPanel(activeKey(), !!BS.hover && BS.hover !== BS.part);
  }

  document.addEventListener("DOMContentLoaded", function () {
    initBeat();
    initQuiz();
    window.addEventListener("themechange", redraw);
    var lastCompact = window.matchMedia("(max-width: 639px)").matches;
    window.addEventListener("resize", function () {
      var c = window.matchMedia("(max-width: 639px)").matches;
      if (c !== lastCompact) { lastCompact = c; redraw(); }
    });
  });
})();
