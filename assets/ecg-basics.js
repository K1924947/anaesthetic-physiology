/* ECG Basics: interactive labelled lead II beat, normal values and a short quiz. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var DEG = Math.PI / 180;
  var BEAT_P = { pr: 0.16, qrs: 0.09, qt: 0.40, axis: 60, u: true };
  var RR = 1.0;
  var BS = { part: "P", hover: null, locked: false };
  var BG = { x0: 20, y0: 242, u: 16, tStart: -0.08, tEnd: 1.80 };

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
    rhythm: "https://litfl.com/ecg-rhythm-evaluation/",
    klab: "https://cvphysiology.com/arrhythmias/a009"
  };

  var PARTS = {
    P: {
      name: "P wave",
      short: "P wave",
      t: [0.0, 0.105],
      event: "Atrial depolarisation. The impulse leaves the SA node and spreads through the right atrium, then the left.",
      normal: "Duration under 0.12 s; height under 2.5 mm in the limb leads. Upright in I and II, inverted in aVR; often biphasic in V1.",
      clinical: [
        "Absent in atrial fibrillation.",
        "Peaked P waves in lead II (P pulmonale) in right atrial enlargement.",
        "Broad, notched P waves in lead II (P mitrale) in left atrial enlargement."
      ],
      srcHtml: srcTrio("LITFL, P wave", LINKS.p, "LITFL, rhythm evaluation", LINKS.rhythm, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    PRs: {
      name: "PR segment",
      short: "PR seg",
      t: [0.105, 0.16],
      event: "The flat line after the P wave. The impulse is delayed in the AV node, then travels through the bundle of His and the bundle branches. Too little tissue depolarises to write a wave, so the line stays isoelectric. Atrial repolarisation is usually hidden in the QRS.",
      normal: "Flat and isoelectric, judged against the T-P segment.",
      clinical: [
        "PR segment depression is a characteristic change in pericarditis.",
        "PR elevation or depression in infarction can indicate atrial ischaemia."
      ],
      srcHtml: srcPair("LITFL, PR segment", LINKS.prs, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    PRi: {
      name: "PR interval",
      short: "PR int",
      t: [0.0, 0.16],
      bracket: true,
      event: "From the start of the P wave to the start of the QRS: atrial depolarisation plus the delay at the AV node (the P wave plus the PR segment).",
      normal: "0.12 to 0.20 s (3 to 5 small squares).",
      clinical: [
        "A long PR interval (over 0.20 s) is first degree AV block.",
        "A short PR interval (under 0.12 s) suggests pre-excitation, including WPW, or a junctional rhythm."
      ],
      srcHtml: srcPair("LITFL, PR interval", LINKS.pr, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    QRS: {
      name: "QRS complex",
      short: "QRS",
      t: [0.16, 0.25],
      event: "Ventricular depolarisation. The septum depolarises first, left to right (a small q in left-sided leads), then the main mass of both ventricles via the bundle branches and Purkinje fibres.",
      normal: "Under 0.12 s (3 small squares).",
      clinical: [
        "A QRS over 0.12 s is used to diagnose bundle branch block or a ventricular rhythm.",
        "Broad complexes also occur in hyperkalaemia, tricyclic antidepressant poisoning, and pre-excitation."
      ],
      srcHtml: srcTrio("LITFL, QRS interval", LINKS.qrs, "LITFL, Q wave", LINKS.q, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    ST: {
      name: "ST segment",
      short: "ST",
      t: [0.25, 0.34],
      event: "The ventricles are fully depolarised, so there is little voltage difference and the line is flat. It runs from the end of the QRS (the J point) to the start of the T wave. This roughly corresponds to the plateau (phase 2) of the ventricular action potential.",
      normal: "Isoelectric at the J point, judged against the T-P segment.",
      clinical: [
        "The most important cause of ST elevation or depression is myocardial ischaemia or infarction.",
        "Pericarditis can cause widespread concave ST elevation, often with PR segment depression."
      ],
      srcHtml: srcPair("LITFL, ST segment", LINKS.st, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    T: {
      name: "T wave",
      short: "T wave",
      t: [0.34, 0.56],
      event: "Ventricular repolarisation. It usually points the same way as the QRS because the last cells to depolarise (in the subepicardium) are the first to repolarise.",
      normal: "Upright in all leads except aVR and V1. Height under 5 mm in the limb leads and under 10 mm in the chest leads.",
      clinical: [
        "Tall, narrow, peaked T waves are characteristic of hyperkalaemia.",
        "Inverted T waves in contiguous leads occur with myocardial ischaemia and infarction."
      ],
      srcHtml: srcPair("LITFL, T wave", LINKS.tw, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    U: {
      name: "U wave",
      short: "U wave",
      t: [0.59, 0.72],
      event: "A small wave after the T wave. Its origin is uncertain; it may represent the last remnants of ventricular repolarisation.",
      normal: "Small, same direction as the T wave, best seen in V2 and V3, and usually visible only at slower rates.",
      clinical: [
        "Prominent U waves are most often due to severe hypokalaemia.",
        "Digoxin is also associated with prominent U waves."
      ],
      srcHtml: srcPair("LITFL, U wave", LINKS.u, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    QT: {
      name: "QT interval",
      short: "QT",
      t: [0.16, 0.56],
      bracket: true,
      event: "From the start of the QRS to the end of the T wave: the whole of ventricular depolarisation and repolarisation. It shortens as the heart rate rises, so it is usually quoted as a rate-corrected value (QTc).",
      normal: "QTc under 440 ms in men and under 460 ms in women. Over 500 ms carries a high risk of torsades de pointes. On this trace the rate is 60 /min and QT is 0.40 s, so Bazett QTc is 0.40 s.",
      clinical: [
        "A prolonged QT is associated with an increased risk of torsades de pointes, especially if QTc is over 500 ms.",
        "Causes include low potassium, magnesium or calcium, and some drugs."
      ],
      srcHtml: srcPair("LITFL, QT interval", LINKS.qt, "Klabunde, Electrocardiogram", LINKS.klab)
    },
    RR: {
      name: "RR interval and rate",
      short: "RR / rate",
      t: [0.205, 1.205],
      bracket: true,
      bracketY: "rr",
      event: "The RR interval is the time from one R wave to the next: the cycle length of the ventricular rhythm. It is how you work out the heart rate on paper.",
      normal: "60 to 100 /min. At 25 mm/s, rate = 300 divided by the number of large squares between consecutive R waves. On this trace RR is 1.00 s (5 large squares), so the rate is 60 /min.",
      clinical: [
        "A rate under 60 /min is bradycardia; over 100 /min is tachycardia.",
        "Irregularly irregular RR intervals, with no P waves, occur in atrial fibrillation."
      ],
      srcHtml: srcTrio("LITFL, ECG rate interpretation", LINKS.rate, "LITFL, rhythm evaluation", LINKS.rhythm, "Klabunde, Electrocardiogram", LINKS.klab)
    }
  };

  var PART_ORDER = ["P", "PRs", "PRi", "QRS", "ST", "T", "U", "QT", "RR"];
  function displayedPart() {
    if (BS.locked) return BS.part;
    return BS.hover || BS.part;
  }
  function partRanges(p, key) {
    var ranges = [{ t0: p.t[0], t1: p.t[1], copy: 0 }];
    if (key !== "RR") ranges.push({ t0: p.t[0] + RR, t1: p.t[1] + RR, copy: 1 });
    return ranges.filter(function (r) { return r.t1 > BG.tStart && r.t0 < BG.tEnd; });
  }

  function srcPair(a, au, b, bu) {
    return '<a href="' + au + '" target="_blank" rel="noopener">' + esc(a) + '</a> · <a href="' + bu + '" target="_blank" rel="noopener">' + esc(b) + '</a>.';
  }
  function srcTrio(a, au, b, bu, c, cu) {
    return '<a href="' + au + '" target="_blank" rel="noopener">' + esc(a) + '</a> · <a href="' + bu + '" target="_blank" rel="noopener">' + esc(b) + '</a> · <a href="' + cu + '" target="_blank" rel="noopener">' + esc(c) + '</a>.';
  }

  function activeKey() { return displayedPart(); }

  function addHit(g, r, k) {
    var hg = el("g", { class: "hit", "aria-hidden": "true", style: "cursor:pointer" }, g);
    el("rect", Object.assign({ fill: "transparent" }, r), hg);
    hg.addEventListener("click", function (ev) {
      ev.preventDefault();
      clickPart(k);
    });
    hg.addEventListener("pointerenter", function () { previewPart(k); });
    hg.addEventListener("pointerleave", function () { previewPart(null); });
  }

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

    var key = displayedPart(), P = PARTS[key];
    var ranges = partRanges(P, key);
    ranges.forEach(function (rg) {
      var hx0 = bx(Math.max(rg.t0, BG.tStart));
      var hx1 = bx(Math.min(rg.t1, BG.tEnd));
      el("rect", {
        x: hx0, y: gy, width: Math.max(hx1 - hx0, 2), height: gh,
        fill: "url(#bt-hatch)", stroke: t.a, "stroke-width": 1.5, "stroke-dasharray": "5 3",
        class: "hl-band", "data-copy": String(rg.copy)
      }, g);
    });

    var bumps = beatBumps(BEAT_P);
    var f = function (tt) { return voltage(bumps, tt); };
    el("path", {
      d: fnPath(f, BG.tStart, BG.tEnd, bx(BG.tStart), y0, 25 * u, 10 * u, 0.002),
      fill: "none", stroke: ink, "stroke-width": 2.8, "stroke-linejoin": "round", "stroke-linecap": "round"
    }, g);
    if (!P.bracket) {
      ranges.forEach(function (rg) {
        var hx0 = bx(rg.t0);
        el("path", {
          d: fnPath(f, rg.t0, rg.t1, hx0, y0, 25 * u, 10 * u, 0.002),
          fill: "none", stroke: t.a, "stroke-width": 6.5, "stroke-linejoin": "round", "stroke-linecap": "round",
          class: "hl-trace", "data-copy": String(rg.copy)
        }, g);
      });
    }

    var lab = [
      ["P", 0.05, 0.2],
      ["Q", 0.168, -0.16],
      ["R", 0.205, 1.32],
      ["S", 0.240, -0.16],
      ["T", 0.455, 0.42],
      ["U", 0.635, 0.16],
      ["P", 1.05, 0.2],
      ["Q", 1.168, -0.16],
      ["R", 1.205, 1.32],
      ["S", 1.240, -0.16],
      ["T", 1.455, 0.42],
      ["U", 1.635, 0.16]
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
    el("text", { x: bx(1.33), y: y0 - 12, "text-anchor": "middle", fill: t.muted, "font-family": fam, class: "lab-small" }, g, "ST");
    el("text", { x: bx(0.25) + 28, y: y0 + 28, "text-anchor": "start", fill: t.muted, "font-family": fam, class: "lab-small" }, g, "J point");
    el("circle", { cx: bx(0.25), cy: y0, r: 3.5, fill: t.text }, g);
    el("circle", { cx: bx(1.25), cy: y0, r: 3.5, fill: t.text }, g);

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
      var p = PARTS[k];
      if (k === "RR") {
        addHit(g, { x: bx(p.t[0]), y: rrY - 16, width: bx(p.t[1]) - bx(p.t[0]), height: 40 }, k);
        return;
      }
      if (k === "PRi") {
        addHit(g, { x: bx(p.t[0]), y: prY - 28, width: Math.max(bx(p.t[1]) - bx(p.t[0]), 8), height: 36 }, k);
      } else if (k === "QT") {
        addHit(g, { x: bx(p.t[0]), y: qtY - 28, width: Math.max(bx(p.t[1]) - bx(p.t[0]), 8), height: 36 }, k);
      }
      partRanges(p, k).forEach(function (rg) {
        var x0 = bx(rg.t0), x1 = bx(rg.t1);
        addHit(g, { x: x0, y: gy, width: Math.max(x1 - x0, 8), height: gh }, k);
      });
    });
  }

  function beatPanel(key, preview) {
    var P = PARTS[key];
    var box = $("beatPanel");
    if (!box) return;
    var kicker = (preview ? "Preview · " : "") + (P.bracket ? "Interval" : "Part of the beat");
    var clinical = "";
    if (P.clinical && P.clinical.length) {
      clinical = "<div class='clinical'><h3>Why it matters clinically</h3><ul>" +
        P.clinical.map(function (line) { return "<li>" + esc(line) + "</li>"; }).join("") +
        "</ul></div>";
    }
    box.innerHTML =
      "<p class='kicker'>" + esc(kicker) + "</p>" +
      "<h3 class='explain-title tool-title'>" + esc(P.name) + "</h3>" +
      "<div class='panel-block'><h3>What it represents</h3><p>" + esc(P.event) + "</p></div>" +
      "<div class='panel-block'><h3>Normal values</h3><p>" + esc(P.normal) + "</p></div>" +
      clinical +
      "<p class='src-line'>Sources: " + P.srcHtml + "</p>";
  }

  function syncHint() {
    var hint = $("lockHint");
    if (!hint) return;
    if (BS.locked) {
      hint.hidden = false;
      hint.textContent = "Locked: " + PARTS[BS.part].name + " (click again to unlock)";
    } else {
      hint.hidden = true;
      hint.textContent = "";
    }
  }

  function syncBtns() {
    document.querySelectorAll("#partBtns .t-btn").forEach(function (b) {
      b.setAttribute("aria-pressed", (BS.locked && b.dataset.part === BS.part) ? "true" : "false");
    });
    syncHint();
  }

  function render() {
    syncBtns();
    drawBeat();
    var shown = displayedPart();
    beatPanel(shown, !BS.locked && !!BS.hover && BS.hover !== BS.part);
  }

  function clickPart(k) {
    if (BS.locked && BS.part === k) {
      BS.locked = false;
      BS.hover = null;
    } else {
      BS.part = k;
      BS.locked = true;
      BS.hover = null;
    }
    render();
    var live = $("beatLive");
    if (live) {
      live.textContent = BS.locked
        ? PARTS[k].name + " locked. Click again to unlock."
        : PARTS[k].name + " unlocked. Hover to preview other parts.";
    }
  }

  function previewPart(k) {
    if (BS.locked) return;
    if (window.matchMedia && window.matchMedia("(hover: none)").matches && k) return;
    BS.hover = k;
    render();
  }

  function showPart(k, locked) {
    BS.part = k;
    BS.locked = !!locked;
    BS.hover = null;
    render();
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
      b.addEventListener("click", function () { clickPart(k); });
      box.appendChild(b);
    });
    box.addEventListener("keydown", function (ev) {
      var keys = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" };
      if (!(ev.key in keys)) return;
      ev.preventDefault();
      var i = PART_ORDER.indexOf(displayedPart());
      if (i < 0) i = 0;
      if (keys[ev.key] === "first") i = 0;
      else if (keys[ev.key] === "last") i = PART_ORDER.length - 1;
      else i = (i + keys[ev.key] + PART_ORDER.length) % PART_ORDER.length;
      clickPart(PART_ORDER[i]);
      var next = box.querySelector('[data-part="' + PART_ORDER[i] + '"]');
      if (next) next.focus();
    });
    showPart("P", false);
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
      why: "The QRS is ventricular depolarisation. A usual normal duration is under 0.12 s.",
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
      why: "Rate = 300 divided by the number of large squares between R waves. 300 divided by 4 is 75 /min.",
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

  function redraw() { render(); }

  window.__ecgBasics = {
    state: function () {
      return { part: BS.part, hover: BS.hover, locked: BS.locked, shown: displayedPart() };
    },
    click: clickPart,
    preview: previewPart,
    show: showPart,
    highlightCopies: function () {
      return {
        bands: document.querySelectorAll("#beatSvg .hl-band").length,
        traces: document.querySelectorAll("#beatSvg .hl-trace").length
      };
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    initBeat();
    initQuiz();
    window.addEventListener("themechange", redraw);
    window.addEventListener("resize", redraw);
  });
})();
