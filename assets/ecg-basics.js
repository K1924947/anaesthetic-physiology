/* ECG Basics: interactive labelled lead II beat, normal values and hands-on drills. */
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
  function iconTick() {
    return "<svg class='btn-icon' viewBox='0 0 16 16' width='16' height='16' aria-hidden='true'><path d='M2.5 8.5 L6.5 12.5 L13.5 4' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg>";
  }
  function iconRedo() {
    return "<svg class='btn-icon' viewBox='0 0 16 16' width='16' height='16' aria-hidden='true'><path d='M13 8 A5 5 0 1 1 11.8 4.7' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'/><path d='M13 2.4 v3.3 h-3.3' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>";
  }
  function primaryBtn(id, label) {
    return "<button type='button' class='t-btn t-btn-primary' id='" + id + "'>" + iconTick() + "<span>" + esc(label) + "</span></button>";
  }
  function secondaryBtn(id, label) {
    return "<button type='button' class='t-btn t-btn-secondary' id='" + id + "'>" + iconRedo() + "<span>" + esc(label) + "</span></button>";
  }
  function actionRow(inner) {
    return "<div class='action-row quiz-nav'>" + inner + "</div>";
  }
  function caliperNudgeHtml() {
    return (
      "<div class='caliper-nudges'>" +
        "<div class='caliper-nudge-group' role='group' aria-label='Start marker'>" +
          "<p class='caliper-nudge-label'><span class='cal-icon cal-icon-start' aria-hidden='true'>▲</span> Start marker</p>" +
          "<button type='button' class='t-btn' data-cal='A' data-dir='-1' aria-label='Move start marker left 1 small square'>◀ Move left</button>" +
          "<button type='button' class='t-btn' data-cal='A' data-dir='1' aria-label='Move start marker right 1 small square'>Move right ▶</button>" +
        "</div>" +
        "<div class='caliper-nudge-group' role='group' aria-label='End marker'>" +
          "<p class='caliper-nudge-label'><span class='cal-icon cal-icon-end' aria-hidden='true'>△</span> End marker</p>" +
          "<button type='button' class='t-btn' data-cal='B' data-dir='-1' aria-label='Move end marker left 1 small square'>◀ Move left</button>" +
          "<button type='button' class='t-btn' data-cal='B' data-dir='1' aria-label='Move end marker right 1 small square'>Move right ▶</button>" +
        "</div>" +
        "<p class='caliper-nudge-hint'>Each press moves 1 small square. You can also drag the markers.</p>" +
      "</div>"
    );
  }
  function flashStrip(svg) {
    if (!svg) return;
    svg.classList.remove("is-fresh");
    void svg.getBoundingClientRect();
    svg.classList.add("is-fresh");
  }
  function setStripLabel(id, n) {
    var node = $(id);
    if (node) node.textContent = "Strip " + n;
  }
  function pickAvoid(list, avoid) {
    var rest = list.filter(function (x) { return avoid == null || x !== avoid; });
    var src = rest.length ? rest : list;
    return src[Math.floor(Math.random() * src.length)];
  }
  function interleaveByType(items) {
    var buckets = {}, types = [], i, t, out = [], guard = 0;
    for (i = 0; i < items.length; i++) {
      t = items[i].type;
      if (!buckets[t]) { buckets[t] = []; types.push(t); }
      buckets[t].push(items[i]);
    }
    types = shuffle(types);
    function leftover() {
      return types.some(function (u) { return buckets[u].length; });
    }
    function canSkip(tp) {
      return out.length && out[out.length - 1].type === tp && types.some(function (u) { return u !== tp && buckets[u].length; });
    }
    while (leftover() && guard < 200) {
      guard += 1;
      var placed = false;
      for (i = 0; i < types.length; i++) {
        t = types[i];
        if (!buckets[t].length || canSkip(t)) continue;
        out.push(buckets[t].shift());
        placed = true;
        break;
      }
      if (!placed) {
        for (i = 0; i < types.length; i++) {
          if (buckets[types[i]].length) { out.push(buckets[types[i]].shift()); break; }
        }
      }
    }
    return out;
  }
  function rTimesInWindow(beat, rr, tStart, tEnd) {
    var peak = timesFrom(beat).rPeak, times = [], n, tt;
    var n0 = Math.floor((tStart - peak) / rr) - 1;
    var n1 = Math.ceil((tEnd - peak) / rr) + 1;
    for (n = n0; n <= n1; n++) {
      tt = peak + n * rr;
      if (tt >= tStart - 1e-9 && tt <= tEnd + 1e-9) times.push(tt);
    }
    return times;
  }
  function rMarkFontSize(svg, vbW) {
    if (!svg && !vbW) return 22;
    var cssW = (svg && svg.clientWidth) || 0;
    var w = vbW || (svg && svgViewBox(svg).w) || 0;
    var scale = (cssW > 40 && w) ? cssW / w : 1;
    return Math.max(18, Math.round(15 / Math.max(scale, 0.2)));
  }

  function rMarkBand(svg, vbW) {
    return rMarkFontSize(svg, vbW) + 16;
  }

  function drawRMarks(g, xOf, marks, yTop, revealed, tok, fam, opts) {
    opts = opts || {};
    var yNum = opts.yNum;
    var fs = opts.fontSize || 22;
    marks.forEach(function (mt, i) {
      var x = xOf(mt);
      var pinTop = (yNum != null) ? Math.max(2, yNum - fs - 10) : yTop;
      if (!revealed) {
        el("polygon", {
          points: x + "," + (pinTop + 16) + " " + (x - 9) + "," + pinTop + " " + (x + 9) + "," + pinTop,
          fill: tok.a, stroke: tok.a, "stroke-width": 1.8, class: "r-mark"
        }, g);
        el("path", {
          d: "M" + x + " " + (pinTop + 16) + "V" + (pinTop + 28),
          stroke: tok.a, "stroke-width": 2.2, "stroke-linecap": "round", class: "r-mark-stem"
        }, g);
      }
      if (revealed) {
        var label = String(i + 1);
        var bh = fs + 8;
        var bw = Math.max(bh, label.length * fs * 0.72 + 10);
        var ny = (yNum != null) ? yNum : (yTop - 2);
        var by = ny - bh;
        if (by < 2) by = 2;
        el("rect", {
          x: x - bw / 2, y: by, width: bw, height: bh, rx: 4,
          fill: tok.surface, stroke: tok.a, "stroke-width": 1.8,
          class: "r-mark-num-bg"
        }, g);
        el("text", {
          x: x, y: by + bh - Math.round(fs * 0.28), "text-anchor": "middle", fill: tok.a,
          "font-family": fam, "font-size": fs, "font-weight": 700,
          class: "r-mark-num"
        }, g, label);
      }
    });
  }
  function formatCaliperSpan(span) {
    var smallN = Math.round((Math.abs(Number(span) || 0) / 0.04) * 10) / 10;
    var largeN = Math.round((smallN / 5) * 10) / 10;
    function qty(n, singular, plural) {
      return n.toFixed(1) + " " + (Math.abs(n - 1) < 0.05 ? singular : plural);
    }
    return qty(largeN, "large square", "large squares") + " (" + qty(smallN, "small square", "small squares") + ")";
  }

  function wrapAxis(deg) {
    var d = ((Number(deg) + 180) % 360) - 180;
    if (isNaN(d)) return 0;
    if (d === -180) d = 180;
    return d;
  }
  function axisDelta(a, b) {
    return Math.abs(wrapAxis(a - b));
  }
  function formatAxisDeg(deg) {
    var d = Math.round(wrapAxis(deg));
    if (d === -180) d = 180;
    return (d > 0 ? "+" : "") + d + "°";
  }
  function caliperLabelFont(svg, vbW) {
    var cssW = (svg && svg.clientWidth) ? svg.clientWidth : 0;
    if (cssW < 40) cssW = vbW > 900 ? 1200 : 720;
    var px = 13.5 * (vbW / cssW);
    if (px < 13) px = 13;
    if (px > 44) px = 44;
    return px;
  }
  function caliperHeadRoom(svg, vbW) {
    var fs = caliperLabelFont(svg, vbW);
    return Math.max(46, Math.ceil(fs + 26));
  }
  function measureSvgText(g, text, fam, fs) {
    var tg = el("text", {
      x: -4000, y: -4000, "font-family": fam, "font-size": String(fs),
      "font-weight": "800", class: "cal-label"
    }, g, text);
    var w = 0, h = 0;
    try {
      var b = tg.getBBox();
      w = b.width;
      h = b.height;
    } catch (err) {}
    g.removeChild(tg);
    if (!(w > 1)) w = fs * 0.62 * text.length;
    if (!(h > 1)) h = fs * 0.95;
    return { w: w, h: h };
  }
  function drawCaliperCaptions(g, xA, xB, tok, fam, svg, xMin, xMax, yTop) {
    var vbW = Math.max(40, xMax - xMin);
    var fs = caliperLabelFont(svg, vbW);
    var mA = measureSvgText(g, "Start", fam, fs);
    var mB = measureSvgText(g, "End", fam, fs);
    var padX = Math.max(4, fs * 0.32);
    var padY = Math.max(2, fs * 0.18);
    var wA = mA.w + padX * 2, hA = mA.h + padY * 2;
    var wB = mB.w + padX * 2, hB = mB.h + padY * 2;
    var y = yTop != null ? yTop : 2;
    function clampX(gx, w) {
      if (gx < xMin + 2) gx = xMin + 2;
      if (gx + w > xMax - 2) gx = xMax - 2 - w;
      return gx;
    }
    function overlaps(a, wa, b, wb) {
      return a < b + wb + 2 && b < a + wa + 2;
    }
    function outerX(x, w, toLeft) {
      return clampX(toLeft ? (x - 11 - w) : (x + 11), w);
    }
    var aLeft = xA <= xB;
    var gxA = outerX(xA, wA, aLeft);
    var gxB = outerX(xB, wB, !aLeft);
    if (overlaps(gxA, wA, gxB, wB)) {
      var leftX = Math.min(xA, xB), rightX = Math.max(xA, xB);
      var leftW = aLeft ? wA : wB, rightW = aLeft ? wB : wA;
      var leftGx = clampX(leftX - 11 - leftW, leftW);
      var rightGx = clampX(rightX + 11, rightW);
      if (overlaps(leftGx, leftW, rightGx, rightW)) {
        leftGx = clampX(xMin + 2, leftW);
        rightGx = clampX(Math.max(leftGx + leftW + 4, rightX + 11), rightW);
      }
      if (aLeft) { gxA = leftGx; gxB = rightGx; }
      else { gxB = leftGx; gxA = rightGx; }
    }
    function paint(gx, w, h, midX, text, which) {
      var bg = el("rect", {
        x: gx, y: y, width: w, height: h, rx: Math.min(6, h / 2),
        fill: tok.surface, stroke: tok.a, "stroke-width": 1.6,
        class: "cal-label-bg", "data-cal-label-bg": which
      }, g);
      var tx = gx + w / 2;
      var ty = y + h / 2 + mA.h * 0.35;
      el("text", {
        x: tx, y: ty, "text-anchor": "middle", fill: tok.a,
        "font-family": fam, "font-size": String(fs), "font-weight": "800",
        class: "cal-label", "data-cal-label": which
      }, g, text);
    }
    paint(gxA, wA, hA, xA, "Start", "start");
    paint(gxB, wB, hB, xB, "End", "end");
    return Math.ceil(y + Math.max(hA, hB) + 3);
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
  function leadDir(deg) { return [Math.cos(deg * DEG), Math.sin(deg * DEG), 0]; }
  function leadII() { return leadDir(60); }

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
  function beatV(bumps, t, dir) {
    var d = dir || leadII(), v = 0, i, bm;
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
    nsr: "https://litfl.com/normal-sinus-rhythm-ecg-library/",
    axis: "https://litfl.com/ecg-axis-interpretation/",
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
      event: "From the start of the QRS to the end of the T wave: the whole of ventricular depolarisation and repolarisation. It shortens as the heart rate rises, so it is usually quoted as a rate-corrected value (QTc). Assume a machine-reported QT is the corrected QTc; you are not expected to calculate it.",
      normal: "QTc under 440 ms in men and under 460 ms in women. Over 500 ms carries a high risk of torsades de pointes. On this trace the rate is 60 /min, so the QT of 0.40 s is also the QTc.",
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

  var WAVE_HITS = [
    { key: "P", t0: 0.0, t1: 0.105 },
    { key: "PRs", t0: 0.105, t1: 0.16 },
    { key: "QRS", t0: 0.16, t1: 0.25 },
    { key: "ST", t0: 0.25, t1: 0.34 },
    { key: "T", t0: 0.34, t1: 0.575 },
    { key: "U", t0: 0.575, t1: 0.76 }
  ];
  var WAVE_CENTRES = { P: 0.052, PRs: 0.132, QRS: 0.205, ST: 0.295, T: 0.455, U: 0.655 };
  var BRACKET_CENTRES = { PRi: 0.08, QT: 0.36, RR: 0.705 };

  function waveAtTime(t) {
    var h = hitAtTime(t, BEAT_P, RR, null);
    return h.key === "baseline" ? null : h.key;
  }

  function beatClientToT(ev, svg) {
    svg = svg || $("beatSvg");
    if (!svg) return null;
    return clientToTime(svg, ev, beatGeom());
  }

  function beatSvgPoint(t, band) {
    var svg = $("beatSvg");
    if (!svg) return null;
    var gy = 16, gh = 20 * BG.u, paperBottom = gy + gh;
    var y;
    if (band === "PRi") y = paperBottom + 32;
    else if (band === "QT") y = paperBottom + 64;
    else if (band === "RR") y = paperBottom + 100;
    else y = gy + gh * 0.55;
    var off = svgUserToOffset(svg, bx(t), y);
    return { x: off.x, y: off.y, t: t, band: band || "paper" };
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
    hg.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      clickPart(k);
    });
    hg.addEventListener("pointerenter", function (ev) {
      previewPart(k);
      showHitTip(ev, { key: k, name: PARTS[k].name }, $("beatSvg"));
    });
    hg.addEventListener("pointermove", function (ev) { showHitTip(ev, { key: k, name: PARTS[k].name }, $("beatSvg")); });
    hg.addEventListener("pointerleave", function () { previewPart(null); hideHitTip(); });
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

    /* Intervals are only selectable from their brackets under the paper.
       Waves and segments are selected from the trace itself, with non-overlapping time windows. */
    addHit(g, { x: bx(0), y: prY - 28, width: Math.max(bx(0.16) - bx(0), 8), height: 36 }, "PRi");
    addHit(g, { x: bx(0.16), y: qtY - 28, width: Math.max(bx(0.56) - bx(0.16), 8), height: 36 }, "QT");
    addHit(g, { x: bx(0.205), y: rrY - 16, width: Math.max(bx(1.205) - bx(0.205), 8), height: 40 }, "RR");

    var paperHit = el("g", { class: "hit hit-paper", "aria-hidden": "true", style: "cursor:pointer" }, g);
    el("rect", {
      x: bx(BG.tStart), y: gy,
      width: Math.max(bx(BG.tEnd) - bx(BG.tStart), 8),
      height: gh,
      fill: "transparent"
    }, paperHit);
    function paperPart(ev) {
      var tt = beatClientToT(ev, svg);
      if (tt == null) return null;
      return waveAtTime(tt);
    }
    paperHit.addEventListener("pointermove", function (ev) {
      var k = paperPart(ev);
      previewPart(k);
      if (k) showHitTip(ev, { key: k, name: PARTS[k].name }, $("beatSvg"));
      else hideHitTip();
    });
    paperHit.addEventListener("pointerleave", function () { previewPart(null); hideHitTip(); });
    paperHit.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      var k = paperPart(ev);
      if (k) clickPart(k);
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
    bindHitTipDismiss();
    var beatSvg = $("beatSvg");
    if (beatSvg && !beatSvg.dataset.tipBound) {
      beatSvg.dataset.tipBound = "1";
      beatSvg.addEventListener("pointerleave", function () { previewPart(null); hideHitTip(); });
      beatSvg.addEventListener("mouseleave", function () { previewPart(null); hideHitTip(); });
    }
  }

  var DRILL_N = 8;
  var QZ = {
    on: false,
    i: 0,
    score: 0,
    items: [],
    answered: false,
    ok: false,
    pick: null,
    classify: null,
    rateInput: "",
    calA: 0.04,
    calB: 0.24,
    focus: "A",
    dragging: null,
    hover: null
  };
  var QG = { x0: 12, y0: 0, u: 10, tStart: -0.08, tEnd: 1.2, gy: 8, gh: 0, paperBottom: 0 };

  var CLICK_PARTS = [
    { key: "P", name: "P wave" },
    { key: "PRs", name: "PR segment" },
    { key: "QRS", name: "QRS complex" },
    { key: "J", name: "J point" },
    { key: "ST", name: "ST segment" },
    { key: "T", name: "T wave" },
    { key: "U", name: "U wave" }
  ];
  var TYPE_LABEL = {
    click: "Click the part",
    calipers: "Calipers",
    rate: "Rate",
    axis: "Axis",
    spot: "Spot the abnormality"
  };

  function voltageSeries(bumps, t, rr) {
    var v = 0, n, n0, n1;
    if (!rr || rr <= 0) return beatV(bumps, t);
    n0 = Math.floor((t - 0.9) / rr) - 1;
    n1 = Math.ceil((t + 0.3) / rr) + 1;
    for (n = n0; n <= n1; n++) v += beatV(bumps, t - n * rr);
    return v;
  }

  function timesFrom(p) {
    var k = p.qrs / 0.09;
    var q0 = p.pr;
    var q1 = p.pr + p.qrs;
    var qt1 = p.pr + p.qt;
    var tC = q0 + p.qt - 0.105;
    var t0 = tC - 0.121;
    var t1 = tC + 0.075;
    if (t0 < q1 + 0.02) t0 = q1 + 0.02;
    var p1 = Math.min(0.105, q0 - 0.015);
    if (p1 < 0.06) p1 = Math.max(0.05, q0 - 0.02);
    return {
      P: [0, p1],
      PRs: [p1, q0],
      PRi: [0, q0],
      QRS: [q0, q1],
      J: [q1 - 0.012, q1 + 0.012],
      ST: [q1, t0],
      T: [t0, Math.max(t1, qt1)],
      U: [qt1 + 0.03, qt1 + 0.16],
      QT: [q0, qt1],
      rPeak: q0 + 0.040 * k,
      q0: q0,
      q1: q1,
      qt1: qt1,
      j: q1
    };
  }

  function foldToCycle(t, rr) {
    rr = rr || RR;
    if (!isFinite(t) || !rr) return t;
    var x = t - rr * Math.floor(t / rr);
    if (x < 0) x += rr;
    if (x >= rr) x -= rr;
    return x;
  }

  function waveWindows(beat) {
    var tm = timesFrom(beat);
    var list = [
      { key: "P", t0: tm.P[0], t1: tm.P[1] },
      { key: "PRs", t0: tm.PRs[0], t1: tm.PRs[1] },
      { key: "QRS", t0: tm.QRS[0], t1: tm.QRS[1] },
      { key: "ST", t0: tm.ST[0], t1: tm.ST[1] },
      { key: "T", t0: tm.T[0], t1: tm.T[1] }
    ];
    if (beat && beat.u) list.push({ key: "U", t0: tm.U[0], t1: tm.U[1] });
    return list;
  }

  function preferKeyForItem(item) {
    if (!item) return null;
    if (item.type === "spot" && item.abnormality && item.abnormality !== "normal") return item.abnormality;
    if (item.type === "click" && (item.target === "PRi" || item.target === "QT" || item.target === "J")) return item.target;
    return null;
  }

  function partLabel(key) {
    if (key === "baseline") return "Baseline (T-P segment)";
    if (key === "normal") return "This beat is normal";
    if (key === "J") return "J point";
    if (PARTS[key] && PARTS[key].name) return PARTS[key].name;
    var i;
    if (typeof CLICK_PARTS !== "undefined") {
      for (i = 0; i < CLICK_PARTS.length; i++) if (CLICK_PARTS[i].key === key) return CLICK_PARTS[i].name;
    }
    return key;
  }

  /* Single hit-test used for hover highlight and click scoring, on the
     labelled beat and on every drill, with that beat's actual timings. */
  function hitAtTime(t, beat, rr, prefer) {
    beat = beat || BEAT_P;
    rr = rr || RR;
    var x = foldToCycle(t, rr);
    var n = Math.round((t - x) / rr);
    var tm = timesFrom(beat);
    var key = null, range = null, i, w, d, best = null, bestD = 0.04;
    if (prefer === "PRi" && x >= tm.PRi[0] && x <= tm.PRi[1]) {
      key = "PRi";
      range = tm.PRi;
    } else if (prefer === "QT" && x >= tm.QT[0] && x <= tm.QT[1]) {
      key = "QT";
      range = tm.QT;
    } else if (prefer === "QRS" && x >= tm.QRS[0] && x <= tm.QRS[1]) {
      key = "QRS";
      range = tm.QRS;
    } else if (prefer === "J" && Math.abs(x - tm.j) <= 0.02) {
      key = "J";
      range = tm.J;
    } else {
      var wins = waveWindows(beat);
      for (i = 0; i < wins.length; i++) {
        w = wins[i];
        if (x >= w.t0 && x < w.t1) {
          key = w.key;
          range = [w.t0, w.t1];
          bestD = 0;
          break;
        }
        d = x < w.t0 ? w.t0 - x : x - w.t1;
        if (d < bestD) {
          bestD = d;
          best = w;
        }
      }
      if (!key && best) {
        key = best.key;
        range = [best.t0, best.t1];
      }
    }
    if (!key) {
      return { key: "baseline", name: partLabel("baseline"), t0: null, t1: null, cycle: x, beatIndex: n };
    }
    return {
      key: key,
      name: partLabel(key),
      t0: range[0] + n * rr,
      t1: range[1] + n * rr,
      cycle: x,
      beatIndex: n
    };
  }

  function svgViewBox(svg) {
    var vb = svg.viewBox && svg.viewBox.baseVal;
    if (vb && vb.width && vb.height) return { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
    return { x: 0, y: 0, w: svg.clientWidth || 1, h: svg.clientHeight || 1 };
  }

  /* Map a pointer event to SVG user space. Uses the element's box and
     viewBox (xMidYMid meet) so CSS scale, browser zoom and devicePixelRatio
     stay consistent for hover and click. */
  function svgEventToUser(svg, ev) {
    var rect = svg.getBoundingClientRect();
    var cx = ev.clientX, cy = ev.clientY;
    if (rect.width > 0 && rect.height > 0) {
      var vb = svgViewBox(svg);
      var sx = rect.width / vb.w, sy = rect.height / vb.h;
      var s = Math.min(sx, sy);
      var ox = (rect.width - vb.w * s) / 2;
      var oy = (rect.height - vb.h * s) / 2;
      return { x: vb.x + (cx - rect.left - ox) / s, y: vb.y + (cy - rect.top - oy) / s };
    }
    if (svg.getScreenCTM) {
      var pt = svg.createSVGPoint();
      pt.x = cx;
      pt.y = cy;
      var loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      return { x: loc.x, y: loc.y };
    }
    return null;
  }

  function svgUserToOffset(svg, x, y) {
    var rect = svg.getBoundingClientRect();
    var vb = svgViewBox(svg);
    var sx = rect.width / vb.w, sy = rect.height / vb.h;
    var s = Math.min(sx, sy);
    var ox = (rect.width - vb.w * s) / 2;
    var oy = (rect.height - vb.h * s) / 2;
    return { x: ox + (x - vb.x) * s, y: oy + (y - vb.y) * s, left: rect.left, top: rect.top };
  }

  function geomX0(G) { return G.paperX0 != null ? G.paperX0 : G.x0; }

  function timeFromSvgX(G, x) {
    return G.tStart + (x - geomX0(G)) / (25 * G.u);
  }

  function svgXFromTime(G, t) {
    return geomX0(G) + (t - G.tStart) * 25 * G.u;
  }

  function clientToTime(svg, ev, G) {
    var loc = svgEventToUser(svg, ev);
    if (!loc || !G) return null;
    return timeFromSvgX(G, loc.x);
  }

  function beatGeom() {
    return { x0: BG.x0, paperX0: BG.x0 + 8 * BG.u, tStart: BG.tStart, u: BG.u };
  }

  function quizGeom() {
    return { x0: QG.x0, tStart: QG.tStart, u: QG.u };
  }

  function hitFromEvent(svg, ev, beat, rr, prefer, G) {
    var t = clientToTime(svg, ev, G);
    if (t == null) return { key: "baseline", name: partLabel("baseline"), t0: null, t1: null };
    return hitAtTime(t, beat, rr, prefer);
  }

  var HIT_TIP = { host: null, observer: null, bound: false };

  function tipEl() {
    var n = $("ecgHitTip");
    if (!n) {
      n = document.createElement("div");
      n.id = "ecgHitTip";
      n.className = "ecg-hit-tip";
      n.hidden = true;
      n.setAttribute("role", "status");
      document.body.appendChild(n);
    }
    return n;
  }

  function bindHitTipDismiss() {
    if (HIT_TIP.bound) return;
    HIT_TIP.bound = true;
    var hide = function () { hideHitTip(); };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("wheel", hide, { capture: true, passive: true });
    window.addEventListener("touchend", hide, true);
    window.addEventListener("pointercancel", hide, true);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) hideHitTip();
    });
    HIT_TIP.observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) hideHitTip();
      });
    }, { threshold: 0 });
  }

  function showHitTip(ev, hit, host) {
    bindHitTipDismiss();
    var n = tipEl();
    if (!hit) {
      hideHitTip();
      return;
    }
    n.hidden = false;
    n.textContent = hit.name || partLabel(hit.key);
    n.style.left = Math.round(ev.clientX) + "px";
    n.style.top = Math.round(ev.clientY) + "px";
    var elHost = host || (ev && ev.currentTarget && ev.currentTarget.ownerSVGElement) || $("beatSvg");
    if (elHost && elHost.ownerSVGElement) elHost = elHost.ownerSVGElement;
    HIT_TIP.host = elHost || null;
    if (HIT_TIP.observer && HIT_TIP.host) {
      HIT_TIP.observer.disconnect();
      HIT_TIP.observer.observe(HIT_TIP.host);
    }
  }

  function hideHitTip() {
    var n = $("ecgHitTip");
    if (n) {
      n.hidden = true;
      n.textContent = "";
    }
    HIT_TIP.host = null;
    if (HIT_TIP.observer) HIT_TIP.observer.disconnect();
  }

  function defaultBeat(extra) {
    var p = { pr: 0.16, qrs: 0.08, qt: 0.40, axis: 60, u: true };
    if (extra) {
      for (var k in extra) p[k] = extra[k];
    }
    return p;
  }

  function squaresOf(sec) {
    var sq = sec / 0.04;
    var r = Math.round(sq * 10) / 10;
    return (Math.abs(r - Math.round(r)) < 0.05) ? String(Math.round(r)) : r.toFixed(1);
  }

  function msOf(sec) {
    return String(Math.round(sec * 1000));
  }

  function fmtSec(sec) {
    return (Math.round(sec * 100) / 100).toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  }

  function shuffle(arr) {
    var i, j, t;
    for (i = arr.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function beatWindow(p, rr, kind) {
    var tm = timesFrom(p);
    var tStart, tEnd;
    if (kind === "rate") {
      tStart = tm.rPeak - 0.4;
      tEnd = tm.rPeak + rr + 0.4;
      if (tEnd - tStart < 1.8) {
        var extra = (1.8 - (tEnd - tStart)) / 2;
        tStart -= extra;
        tEnd += extra;
      }
    } else {
      tStart = -0.12;
      tEnd = Math.max(1.72, tm.qt1 + rr + 0.2);
    }
    return { tStart: tStart, tEnd: tEnd, rr: rr };
  }

  function bazettQtcMs(qtSec, rate) {
    var rr = 60 / rate;
    return Math.round((qtSec / Math.sqrt(rr)) * 1000);
  }
  function qtcCutoff(sex) { return sex === "woman" ? 460 : 440; }
  function qtcIsBorderline(qtcMs, sex) {
    return Math.abs(qtcMs - qtcCutoff(sex)) <= 10 || Math.abs(qtcMs - 500) <= 10;
  }
  function qtcVerdict(qtcMs, sex) {
    return qtcMs >= qtcCutoff(sex) ? "long" : "normal";
  }
  function rateTolerance(trueRate) {
    return Math.max(5, 0.10 * trueRate);
  }
  function rateVoltageFn(item) {
    var rPeak = item.beat.pr + 0.040 * ((item.beat.qrs || 0.08) / 0.09);
    var list;
    if (item.kind === "irregular") {
      list = item.times.map(function (rt) {
        var b = defaultBeat({ pr: 0, qrs: 0.08, qt: 0.32, u: false });
        var bm = beatBumps(b).filter(function (x) { return x.part === "QRS" || x.part === "T"; });
        return { t0: rt - (0.040 * (b.qrs / 0.09)), bumps: bm };
      });
      return function (tt) { return irregVoltage(list, tt) + afWobble(tt); };
    }
    var bumps = beatBumps(item.beat);
    list = item.times.map(function (rt) { return { t0: rt - rPeak, bumps: bumps }; });
    return function (tt) { return irregVoltage(list, tt); };
  }
  function drawNeutralMarker(g, x, tok) {
    if (x == null || isNaN(x)) return;
    el("path", {
      d: "M" + x + " " + QG.gy + "V" + (QG.gy + QG.gh),
      fill: "none", stroke: tok.text, "stroke-width": 1.2, "stroke-dasharray": "3 3",
      "pointer-events": "none", opacity: "0.55", class: "quiz-crosshair"
    }, g);
    var y = QG.y0;
    el("path", {
      d: "M" + (x - 9) + " " + y + "H" + (x + 9) + "M" + x + " " + (y - 9) + "V" + (y + 9),
      fill: "none", stroke: tok.text, "stroke-width": 1.6, "stroke-linecap": "square",
      "pointer-events": "none", class: "quiz-crosshair"
    }, g);
  }
  function labelQuizPart(g, item, key, tok) {
    if (!key || key === "baseline" || key === "normal") return;
    var tm = timesFrom(item.beat), mid, name = partLabel(key);
    if (key === "J") mid = tm.j;
    else if (tm[key]) mid = (tm[key][0] + tm[key][1]) / 2;
    else return;
    el("text", {
      x: quizTtoX(mid), y: QG.gy + 14, "text-anchor": "middle",
      fill: tok.text, "font-family": fontSans(), class: "lab-small"
    }, g, name);
  }

  function makeClick(targetKey) {
    var part = null, i;
    if (targetKey) {
      for (i = 0; i < CLICK_PARTS.length; i++) if (CLICK_PARTS[i].key === targetKey) part = CLICK_PARTS[i];
    }
    if (!part) part = pickOne(CLICK_PARTS);
    var beat = defaultBeat({ u: true });
    var win = beatWindow(beat, 1.0, "click");
    return {
      type: "click",
      target: part.key,
      targetName: part.name,
      q: "Click the " + part.name + " on this strip.",
      help: "Click the part on the trace. You can also focus the strip, move the marker with the arrow keys, and press Enter to choose. Nothing is labelled until you answer.",
      beat: beat,
      rr: 1.0,
      tStart: win.tStart,
      tEnd: win.tEnd
    };
  }

  function makeCalipers(preset) {
    if (preset && preset.measure === "QT") return makeQTCalipers(preset);
    var pool = [
      { measure: "PRi", pr: 0.10, qrs: 0.08, qt: 0.40, verdict: "short", name: "PR interval" },
      { measure: "PRi", pr: 0.14, qrs: 0.08, qt: 0.40, verdict: "normal", name: "PR interval" },
      { measure: "PRi", pr: 0.16, qrs: 0.08, qt: 0.40, verdict: "normal", name: "PR interval" },
      { measure: "PRi", pr: 0.18, qrs: 0.08, qt: 0.40, verdict: "normal", name: "PR interval" },
      { measure: "PRi", pr: 0.20, qrs: 0.08, qt: 0.40, verdict: "normal", name: "PR interval" },
      { measure: "PRi", pr: 0.24, qrs: 0.08, qt: 0.40, verdict: "long", name: "PR interval" },
      { measure: "PRi", pr: 0.28, qrs: 0.08, qt: 0.40, verdict: "long", name: "PR interval" },
      { measure: "QRS", pr: 0.16, qrs: 0.08, qt: 0.40, verdict: "normal", name: "QRS complex" },
      { measure: "QRS", pr: 0.16, qrs: 0.10, qt: 0.40, verdict: "normal", name: "QRS complex" },
      { measure: "QRS", pr: 0.16, qrs: 0.14, qt: 0.42, verdict: "long", name: "QRS complex" },
      { measure: "QRS", pr: 0.16, qrs: 0.16, qt: 0.44, verdict: "long", name: "QRS complex" }
    ];
    var spec = preset || null;
    if (spec && spec.measure && (spec.pr == null)) {
      var matched = pool.filter(function (x) {
        return x.measure === spec.measure && (!spec.verdict || x.verdict === spec.verdict);
      });
      spec = matched.length ? pickOne(matched) : pickOne(pool);
    }
    if (!spec) spec = pickOne(pool);
    if (spec.measure === "QT") return makeQTCalipers(spec);
    if (!spec.name) {
      spec.name = spec.measure === "PRi" ? "PR interval" : "QRS complex";
    }
    var beat = defaultBeat({ pr: spec.pr, qrs: spec.qrs, qt: spec.qt, u: false });
    var tm = timesFrom(beat);
    var t0, t1;
    if (spec.measure === "PRi") { t0 = tm.PRi[0]; t1 = tm.PRi[1]; }
    else { t0 = tm.QRS[0]; t1 = tm.QRS[1]; }
    var win = beatWindow(beat, 1.0, "calipers");
    var options = (spec.measure === "PRi")
      ? [{ id: "short", label: "Too short" }, { id: "normal", label: "Normal" }, { id: "long", label: "Too long" }]
      : [{ id: "normal", label: "Normal" }, { id: "long", label: "Too long" }];
    return {
      type: "calipers",
      measure: spec.measure,
      measureName: spec.name,
      t0: t0,
      t1: t1,
      verdict: spec.verdict,
      options: options,
      q: "Measure the " + spec.name + " with the calipers, then say whether it is normal.",
      help: "Drag the start and end markers, or use the buttons. Each press moves 1 small square. Focus the strip and use the arrow keys if you prefer.",
      beat: beat,
      rr: 1.0,
      tStart: win.tStart,
      tEnd: win.tEnd
    };
  }

  function makeQTCalipers(preset) {
    var pool = [
      { sex: "man", rate: 60, qt: 0.36 },
      { sex: "woman", rate: 60, qt: 0.40 },
      { sex: "man", rate: 60, qt: 0.48 },
      { sex: "woman", rate: 60, qt: 0.52 },
      { sex: "man", rate: 75, qt: 0.32 },
      { sex: "woman", rate: 75, qt: 0.36 },
      { sex: "man", rate: 75, qt: 0.46 },
      { sex: "woman", rate: 75, qt: 0.43 },
      { sex: "woman", rate: 75, qt: 0.46 },
      { sex: "woman", rate: 75, qt: 0.34 },
      { sex: "man", rate: 80, qt: 0.32 },
      { sex: "woman", rate: 80, qt: 0.36 },
      { sex: "man", rate: 80, qt: 0.42 },
      { sex: "woman", rate: 80, qt: 0.46 },
      { sex: "man", rate: 50, qt: 0.40 },
      { sex: "woman", rate: 50, qt: 0.44 },
      { sex: "man", rate: 50, qt: 0.52 },
      { sex: "woman", rate: 50, qt: 0.56 },
      { sex: "man", rate: 100, qt: 0.28 },
      { sex: "woman", rate: 100, qt: 0.30 },
      { sex: "man", rate: 100, qt: 0.36 },
      { sex: "woman", rate: 100, qt: 0.40 }
    ];
    var safe = pool.filter(function (c) {
      var qtc = bazettQtcMs(c.qt, c.rate);
      return !qtcIsBorderline(qtc, c.sex);
    });
    if (preset && (preset.sex || preset.rate || preset.qt || preset.verdict)) {
      var filtered = safe.filter(function (c) {
        if (preset.sex && c.sex !== preset.sex) return false;
        if (preset.rate && c.rate !== preset.rate) return false;
        if (preset.qt && Math.abs(c.qt - preset.qt) > 0.005) return false;
        if (preset.verdict && qtcVerdict(bazettQtcMs(c.qt, c.rate), c.sex) !== preset.verdict) return false;
        return true;
      });
      if (filtered.length) safe = filtered;
    }
    var chosen = pickOne(safe);
    var rate = chosen.rate, sex = chosen.sex, qt = chosen.qt;
    var qtcMs = bazettQtcMs(qt, rate);
    var verdict = qtcVerdict(qtcMs, sex);
    var rr = 60 / rate;
    var beat = defaultBeat({ pr: 0.16, qrs: 0.08, qt: qt, u: false });
    var tm = timesFrom(beat);
    var winStart = tm.rPeak - 0.36;
    var winEnd = tm.rPeak + rr + 0.36;
    var sexLab = sex === "woman" ? "Woman" : "Man";
    return {
      type: "calipers",
      measure: "QT",
      measureName: "QT interval",
      t0: tm.QT[0],
      t1: tm.QT[1],
      verdict: verdict,
      qtcMs: qtcMs,
      rate: rate,
      sex: sex,
      risk: qtcMs > 500,
      options: [{ id: "normal", label: "Normal" }, { id: "long", label: "Prolonged" }],
      q: sexLab + ". The machine reports a QTc of " + qtcMs + " ms. Is this QTc normal or prolonged?",
      help: "Assume the machine-reported QT is the corrected QTc. You do not need to calculate it. Usual upper limits are 440 ms in men and 460 ms in women. Over 500 ms carries a high risk of torsades de pointes.",
      skipMeasure: true,
      machineQtc: true,
      beat: beat,
      rr: rr,
      tStart: winStart,
      tEnd: winEnd
    };
  }


  function makeAxis(preset) {
    var c = makeAxisCase(preset || {});
    return {
      type: "axis",
      trueAxis: c.deg,
      category: c.category,
      isoLead: c.isoLead,
      guess: c.startGuess,
      startGuess: c.startGuess,
      q: "These are leads I, II and aVF. What is the QRS axis?",
      help: "Drag the arrow on the hexaxial wheel to the category you think is present (normal, left axis deviation, right axis deviation, or extreme), or use the arrow keys (hold Shift for 5° steps). Then press Check. The traces stay still while you move the arrow. The exact degree is shown after you check."
    };
  }

  function makeRate(spec) {
    if (typeof spec === "number") spec = { kind: "regular", largeSq: spec };
    spec = spec || {};
    var kind = spec.kind || pickOne(["regular", "irregular"]);
    var caseSpec = { kind: kind };
    if (kind === "regular") {
      caseSpec.largeSq = spec.largeSq != null ? spec.largeSq : pickOne([2.5, 3, 3.5, 4, 4.5, 5, 6]);
    } else {
      caseSpec.mean = spec.mean != null ? spec.mean : pickOne([0.50, 0.72, 0.95]);
    }
    if (spec.seed != null) caseSpec.seed = spec.seed;
    var c = makeRateCase(caseSpec);
    return {
      type: "rate",
      kind: c.kind,
      largeSq: c.largeSq,
      mean: c.mean,
      rate: c.rate,
      duration: 10,
      times: c.times,
      marks: [],
      beat: c.beat,
      rr: c.rr,
      tStart: 0,
      tEnd: 10,
      q: "This is a 10-second lead II strip. What is the heart rate?",
      help: "Type the rate in /min. For a regular rhythm, rate = 300 / large squares between R waves (or 1500 / small squares). For an irregular rhythm, count the QRS complexes in 10 s and multiply by 6. Calipers are only a measuring aid; they do not enter the rate for you."
    };
  }

  function makeSpot(kind) {
    var pool = ["normal", "PRi", "QRS", "QT"];
    var ab = kind || pickOne(pool);
    var beat, why, qExtra, rate = 60, sex = null, qtcMs = null, rr = 1.0, qtCase = null;
    if (ab === "PRi") {
      beat = defaultBeat({ pr: 0.28, u: false });
      why = "The PR interval is 0.28 s (7 small squares, 280 ms). The usual range is 0.12 to 0.20 s, so this PR interval is long.";
      qExtra = "If something is abnormal, click that part.";
    } else if (ab === "QRS") {
      beat = defaultBeat({ qrs: 0.16, qt: 0.44, u: false });
      why = "The QRS is 0.16 s (4 small squares, 160 ms). A usual normal duration is under 0.12 s, so this QRS is broad.";
      qExtra = "If something is abnormal, click that part.";
    } else if (ab === "QT") {
      qtCase = makeQTCalipers({ verdict: "long" });
      beat = qtCase.beat;
      rate = qtCase.rate;
      sex = qtCase.sex;
      qtcMs = qtCase.qtcMs;
      rr = qtCase.rr;
      why = "The machine reports a QTc of " + qtcMs + " ms. Assume this is the rate-corrected value; you do not need to calculate it. For a " + sex + " the usual upper limit is " + qtcCutoff(sex) + " ms" + (qtcMs > 500 ? ", and over 500 ms carries a high risk of torsades de pointes" : "") + ", so this QTc is prolonged.";
      qExtra = "If something is abnormal, click that part.";
    } else {
      beat = defaultBeat({ u: false });
      why = "This beat is within the usual values: PR 0.16 s, QRS under 0.12 s, and QTc 400 ms (under 440 ms in men and under 460 ms in women).";
      qExtra = "If the beat is normal, use the button below the strip.";
      ab = "normal";
    }
    var win = beatWindow(beat, rr, "spot");
    var q = "Is this beat abnormal? " + qExtra;
    if (ab === "QT" && sex && qtcMs != null) {
      q = (sex === "woman" ? "Woman" : "Man") + ". The machine reports a QTc of " + qtcMs + " ms. " + q;
    }
    return {
      type: "spot",
      abnormality: ab,
      q: q,
      help: "Click the abnormal part on the trace. Parts are not labelled until you answer. Choose \"This beat is normal\" if nothing is out of range. You can also move the marker with the arrow keys and press Enter.",
      why: why,
      beat: beat,
      rr: rr,
      rate: rate,
      sex: sex,
      qtcMs: qtcMs,
      tStart: ab === "QT" && qtCase ? qtCase.tStart : win.tStart,
      tEnd: ab === "QT" && qtCase ? qtCase.tEnd : win.tEnd
    };
  }

  function buildRound() {
    var clicks = shuffle(CLICK_PARTS.slice());
    var calA = makeCalipers(pickOne([{ measure: "PRi" }, { measure: "QRS" }]));
    var calB = makeQTCalipers();
    var spots = shuffle(["normal", "PRi", "QRS", "QT"]);
    var axA = makeAxis();
    var axB = makeAxis({ avoid: axA.category });
    var items = [
      makeClick(clicks[0].key),
      makeClick(clicks[1].key),
      calA,
      calB,
      makeRate({ kind: "regular" }),
      makeRate({ kind: "irregular" }),
      axA,
      axB,
      makeSpot(spots[0]),
      makeSpot(spots[1])
    ];
    return interleaveByType(items);
  }

  function currentItem() {
    return QZ.items[QZ.i] || null;
  }

  function quizTtoX(t) {
    return svgXFromTime(QG, t);
  }
  function quizXtoT(x) {
    return timeFromSvgX(QG, x);
  }
  function quizClientToT(svg, evOrX, evY) {
    var ev = (evOrX && typeof evOrX === "object") ? evOrX : { clientX: evOrX, clientY: evY || 0 };
    var t = clientToTime(svg, ev, quizGeom());
    return t == null ? 0 : t;
  }

  function partAtTime(item, t) {
    return hitAtTime(t, item.beat, item.rr || 1, preferKeyForItem(item)).key;
  }

  function partName(key) {
    if (key === "baseline") return "the baseline (the T-P segment)";
    return partLabel(key);
  }

  function clickMatches(item, key) {
    if (!key || key === "baseline") return false;
    if (item.type === "click") {
      if (item.target === key) return true;
      if (item.target === "PRi" && (key === "P" || key === "PRs")) return true;
      if (item.target === "QT" && (key === "QRS" || key === "J" || key === "ST" || key === "T")) return true;
      if (item.target === "QRS" && key === "J") return true;
      return false;
    }
    if (item.type === "spot") {
      if (item.abnormality === "normal") return key === "normal";
      if (key === "normal") return false;
      if (item.abnormality === "PRi") return key === "PRi" || key === "P" || key === "PRs";
      if (item.abnormality === "QRS") return key === "QRS" || key === "J";
      if (item.abnormality === "QT") return key === "QT" || key === "ST" || key === "T" || key === "QRS" || key === "J";
      return false;
    }
    return false;
  }

  function caliperSpan() {
    return Math.abs(QZ.calB - QZ.calA);
  }

  function caliperPlacement(item) {
    var a = Math.min(QZ.calA, QZ.calB);
    var b = Math.max(QZ.calA, QZ.calB);
    var endsOk = Math.abs(a - item.t0) <= 0.04 && Math.abs(b - item.t1) <= 0.04;
    var spanOk = Math.abs((b - a) - (item.t1 - item.t0)) <= 0.04;
    return { a: a, b: b, endsOk: endsOk, spanOk: spanOk, ok: endsOk || spanOk, span: b - a };
  }
  function calipersPlacedWell(item) {
    return caliperPlacement(item).ok;
  }

  function rateFromCalipers() {
    var span = caliperSpan();
    if (span < 0.12) return null;
    var sq = span / 0.20;
    return Math.round(300 / sq);
  }

  function rateEntered() {
    var typed = parseInt(QZ.rateInput, 10);
    if (!isNaN(typed) && typed > 0) return typed;
    return null;
  }

  function rateIsClose(guess, trueRate) {
    if (guess == null || isNaN(guess)) return false;
    return Math.abs(guess - trueRate) <= rateTolerance(trueRate);
  }

  function classifyCorrect(item) {
    return QZ.classify === item.verdict;
  }

  function speakQuiz(msg) {
    var live = $("quizLive");
    if (live) live.textContent = msg;
  }

  function setScore() {
    var text = QZ.on ? ("Score " + QZ.score + " / " + QZ.items.length) : "";
    document.querySelectorAll(".test-banner-score-sync").forEach(function (s) {
      s.hidden = !QZ.on;
      s.textContent = text;
    });
  }

  function setupQuizGeometry(item, svg) {
    if (item.type === "rate") {
      var G = setupStripGeom(item.duration || 10, svg);
      QG.x0 = G.x0;
      QG.u = G.u;
      QG.tStart = 0;
      QG.tEnd = item.duration || 10;
      QG.gy = G.gy;
      QG.gh = G.gh;
      QG.y0 = G.y0;
      QG.paperBottom = G.gy + G.gh;
      QG.gw = G.gw;
      QG.head = G.gy;
      QG.markBand = G.markBand;
      return;
    }
    var u = 10;
    var span = item.tEnd - item.tStart;
    var gwTmp = span * 25 * u;
    var head = item.type === "calipers" ? caliperHeadRoom(svg, 10 + gwTmp + 10) : 8;
    var gy = head;
    var gh = 20 * u;
    QG.x0 = 10;
    QG.u = u;
    QG.tStart = item.tStart;
    QG.tEnd = item.tEnd;
    QG.gy = gy;
    QG.gh = gh;
    QG.y0 = gy + 14 * u;
    QG.paperBottom = gy + gh;
    QG.gw = span * 25 * u;
    QG.head = head;
  }

  function markGuess(g, item, key) {
    var tm = timesFrom(item.beat);
    var ink = cssVar("--ecg-ink") || "#111";
    if (key === "J") {
      var jx = quizTtoX(tm.j);
      el("path", {
        d: "M" + (jx - 8) + " " + (QG.y0 - 8) + "L" + (jx + 8) + " " + (QG.y0 + 8) + "M" + (jx + 8) + " " + (QG.y0 - 8) + "L" + (jx - 8) + " " + (QG.y0 + 8),
        stroke: ink, "stroke-width": 2.4, fill: "none", "stroke-linecap": "square", class: "hl-guess"
      }, g);
      return;
    }
    if (!tm[key]) return;
    var x0 = quizTtoX(Math.max(tm[key][0], QG.tStart));
    var x1 = quizTtoX(Math.min(tm[key][1], QG.tEnd));
    el("rect", {
      x: x0, y: QG.gy, width: Math.max(x1 - x0, 2), height: QG.gh,
      fill: "none", stroke: ink, "stroke-width": 2, "stroke-dasharray": "3 3", class: "hl-guess"
    }, g);
  }

  function eachCopyRange(item, key, t0, t1, fn) {
    var rr = item.rr || 1;
    var a, b, n, n0, n1, tm;
    if (t0 != null && t1 != null) {
      fn(t0, t1);
      return;
    }
    tm = timesFrom(item.beat);
    if (key === "J") {
      n0 = Math.floor((item.tStart - tm.j) / rr) - 1;
      n1 = Math.ceil((item.tEnd - tm.j) / rr) + 1;
      for (n = n0; n <= n1; n++) {
        a = tm.j + n * rr;
        if (a >= item.tStart && a <= item.tEnd) fn(a, a);
      }
      return;
    }
    if (!tm[key]) return;
    a = tm[key][0];
    b = tm[key][1];
    n0 = Math.floor((item.tStart - b) / rr) - 1;
    n1 = Math.ceil((item.tEnd - a) / rr) + 1;
    for (n = n0; n <= n1; n++) {
      if (b + n * rr > item.tStart && a + n * rr < item.tEnd) fn(a + n * rr, b + n * rr);
    }
  }

  function highlightRange(g, item, key, cls, t0, t1) {
    var tok = T();
    var bumps, f;
    if (key === "normal" || key === "baseline" || !key) return;
    bumps = beatBumps(item.beat);
    f = function (tt) { return voltageSeries(bumps, tt, item.rr); };
    eachCopyRange(item, key, t0, t1, function (a, b) {
      if (key === "J") {
        el("circle", {
          cx: quizTtoX(a), cy: QG.y0, r: 7, fill: "none", stroke: tok.a, "stroke-width": 2.5,
          "stroke-dasharray": "3 2", class: cls || "hl-mark", "data-hit": "J"
        }, g);
        return;
      }
      var x0 = quizTtoX(Math.max(a, QG.tStart));
      var x1 = quizTtoX(Math.min(b, QG.tEnd));
      el("rect", {
        x: x0, y: QG.gy, width: Math.max(x1 - x0, 2), height: QG.gh,
        fill: "url(#qz-hatch)", stroke: tok.a, "stroke-width": 1.5, "stroke-dasharray": "5 3",
        class: cls || "hl-band", "data-hit": key, "pointer-events": "none"
      }, g);
      if (key !== "PRi" && key !== "QT") {
        el("path", {
          d: fnPath(f, a, b, quizTtoX(a), QG.y0, 25 * QG.u, 10 * QG.u, 0.002),
          fill: "none", stroke: tok.a, "stroke-width": 5.5, "stroke-linejoin": "round", "stroke-linecap": "round",
          class: cls || "hl-trace", "pointer-events": "none"
        }, g);
      }
    });
  }

  function updateQuizHover(hit) {
    var svg = $("quizSvg");
    var item = currentItem();
    if (!svg || !item) return;
    var g = svg.querySelector("#quizHoverLayer");
    if (!g) {
      g = el("g", { id: "quizHoverLayer", "aria-hidden": "true" }, svg);
    }
    while (g.firstChild) g.removeChild(g.firstChild);
    if (hit && hit.key && hit.key !== "baseline") {
      highlightRange(g, item, hit.key, "hl-hover", hit.t0, hit.t1);
    }
  }

  function drawCaliperLine(g, tVal, which, y0, y1, focused, style) {
    var x = quizTtoX(tVal);
    var tok = T();
    var ink = cssVar("--ecg-ink") || "#111";
    var fam = fontSans();
    var isTrue = style === "true";
    var col = isTrue ? ink : tok.a;
    var sw = focused && !isTrue ? 3.4 : 2.2;
    var d = isTrue
      ? ("M" + x + " " + y0 + "V" + y1)
      : ("M" + x + " " + (y0 + 14) + "V" + y1);
    el("path", {
      d: d,
      fill: "none",
      stroke: col,
      "stroke-width": sw,
      "stroke-dasharray": isTrue ? "5 3" : "none",
      "stroke-linecap": "square",
      class: "cal-line",
      "data-which": which
    }, g);
    if (isTrue) {
      el("rect", { x: x - 8, y: y0, width: 16, height: 16, fill: tok.surface, stroke: ink, "stroke-width": 2 }, g);
      el("text", { x: x, y: y0 + 13, "text-anchor": "middle", fill: ink, "font-family": fam, class: "lab-small" }, g, which === "A" ? "A" : "B");
    } else {
      var pts = x + "," + y0 + " " + (x - 11) + "," + (y0 + 16) + " " + (x + 11) + "," + (y0 + 16);
      var isStart = which === "A";
      el("polygon", {
        points: pts,
        fill: isStart ? col : tok.surface,
        stroke: col,
        "stroke-width": focused ? 3.2 : 2.2,
        class: "cal-head",
        "data-which": which
      }, g);
    }
  }

  function drawQuizTrace() {
    var item = currentItem();
    if (!item) return;
    if (item.type === "axis") {
      renderQuizAxis();
      return;
    }
    var svg = $("quizSvg");
    if (!svg) return;
    setupQuizGeometry(item, svg);
    var t = T(), ink = cssVar("--ecg-ink") || "#111";
    var fam = fontSans();
    var u = QG.u;
    var vbW = QG.x0 + QG.gw + 10;
    var calY = QG.paperBottom + 8;
    var vbH = (item.type === "calipers" || item.type === "rate") ? calY + 36 : QG.paperBottom + 10;
    clearSvg(svg);
    svg.setAttribute("viewBox", "0 0 " + Math.ceil(vbW) + " " + Math.ceil(vbH));
    patterns(svg, "qz");
    var g = el("g", null, svg);
    paper(g, QG.x0, QG.gy, QG.gw, QG.gh, u);
    var f = (item.type === "rate" && item.times)
      ? rateVoltageFn(item)
      : (function () {
          var bumps = beatBumps(item.beat);
          return function (tt) { return voltageSeries(bumps, tt, item.rr); };
        }());
    el("path", {
      d: fnPath(f, QG.tStart, QG.tEnd, quizTtoX(QG.tStart), QG.y0, 25 * u, 10 * u, 0.002),
      fill: "none", stroke: ink, "stroke-width": 2.6, "stroke-linejoin": "round", "stroke-linecap": "round"
    }, g);

    if (QZ.answered) {
      if (item.type === "click") {
        highlightRange(g, item, item.target, "hl-true");
        labelQuizPart(g, item, item.target, t);
      }
      if (item.type === "spot" && item.abnormality !== "normal") {
        highlightRange(g, item, item.abnormality, "hl-true");
        labelQuizPart(g, item, item.abnormality, t);
      }
      if ((item.type === "click" || item.type === "spot") && QZ.pick && !QZ.ok && QZ.pick !== "baseline" && QZ.pick !== "normal") {
        markGuess(g, item, QZ.pick);
      }
    } else if (item.type === "click" || item.type === "spot") {
      var cx = null;
      if (QZ.markerT != null) cx = quizTtoX(QZ.markerT);
      else if (QZ.pointerT != null) cx = quizTtoX(QZ.pointerT);
      if (cx != null) drawNeutralMarker(g, cx, t);
    }

    if (item.type === "rate" && item.marks && item.marks.length) {
      drawRMarks(g, quizTtoX, item.marks, 18, QZ.answered, t, fam, { yNum: (QG.markBand || 32) - 2, fontSize: rMarkFontSize(svg, QG.x0 + QG.gw + 8) });
    }

    if ((item.type === "calipers" && !item.skipMeasure) || item.type === "rate") {
      var capBottom = drawCaliperCaptions(
        g, quizTtoX(QZ.calA), quizTtoX(QZ.calB), t, fam, svg, 0, vbW,
        item.type === "rate" ? (QG.markBand || 0) : 0
      );
      var yTop = capBottom;
      var yBot = QG.paperBottom;
      drawCaliperLine(g, QZ.calA, "A", yTop, yBot, QZ.focus === "A", "user");
      drawCaliperLine(g, QZ.calB, "B", yTop, yBot, QZ.focus === "B", "user");
      var ax = quizTtoX(Math.min(QZ.calA, QZ.calB));
      var bxv = quizTtoX(Math.max(QZ.calA, QZ.calB));
      el("path", {
        d: "M" + ax + " " + (calY + 8) + "H" + bxv,
        fill: "none", stroke: t.a, "stroke-width": 2
      }, g);
      if (QZ.answered && item.type === "calipers") {
        drawCaliperLine(g, item.t0, "A", yTop, yBot, false, "true");
        drawCaliperLine(g, item.t1, "B", yTop, yBot, false, "true");
      }
    }
    updateQuizReadout();
  }

  function updateQuizReadout() {
    var elr = $("quizReadout");
    var item = currentItem();
    if (!elr || !item) return;
    if ((item.type === "calipers" && !item.skipMeasure) || item.type === "rate") {
      var span = caliperSpan();
      var parts = ["Calipers: " + formatCaliperSpan(span) + "."];
      if (item.type === "rate") parts.push("R waves marked: " + (item.marks ? item.marks.length : 0) + ".");
      elr.textContent = parts.join(" ");
    } else if (item.type === "axis") {
      if (QZ.answered) {
        elr.textContent = "Your estimate: " + formatAxisDeg(item.guess) + ". True axis: " + formatAxisDeg(item.trueAxis) + " (" + axisLabel(item.trueAxis).name + ").";
      } else {
        elr.textContent = "Your estimate: " + formatAxisDeg(item.guess) + ".";
      }
    } else {
      elr.textContent = "";
    }
  }

  function feedbackHtml(item) {
    var ok = QZ.ok;
    var head = ok ? "Correct." : "Not quite.";
    var cls = ok ? "quiz-feedback" : "quiz-feedback is-wrong";
    var body = "";
    var guessName;
    if (item.type === "click") {
      guessName = partName(QZ.pick);
      if (ok) body = "That is the " + item.targetName + ".";
      else body = "You clicked " + guessName + ". The " + item.targetName + " is marked on the strip.";
    } else if (item.type === "calipers") {
      var judged = classifyCorrect(item);
      if (item.skipMeasure || item.machineQtc) {
        body = caliperFeedbackRule(item) + " ";
        if (!judged && QZ.classify) {
          body += "This QTc is " + verdictPhrase(item.verdict, item) + ", not " + verdictPhrase(QZ.classify, item) + ".";
        } else if (!QZ.classify) {
          body += "You still needed to say whether it is normal or prolonged.";
        }
      } else {
        var span = caliperSpan();
        var place = caliperPlacement(item);
        body = "The " + item.measureName + " is " + msOf(item.t1 - item.t0) + " ms (" + squaresOf(item.t1 - item.t0) + " small squares). ";
        body += caliperFeedbackRule(item) + " ";
        body += "Calipers are accepted if each end is within 1 small square of the true start and end, or if the measured duration is within 40 ms of the true interval. ";
        if (!place.ok) {
          body += "Your calipers span " + msOf(place.span) + " ms (" + squaresOf(place.span) + " small squares) and do not meet either rule. ";
        } else if (!ok) {
          body += "Your calipers were well placed. ";
        }
        if (!judged && QZ.classify) {
          body += "The interval is " + verdictPhrase(item.verdict, item) + ", not " + verdictPhrase(QZ.classify, item) + ".";
        } else if (!QZ.classify) {
          body += "You still needed to say whether it is " + (item.measure === "QT" ? "normal or prolonged" : "normal") + ".";
        }
      }
    } else if (item.type === "rate") {
      var guess = rateEntered();
      var nQrs = item.times ? item.times.length : 0;
      if (item.kind === "irregular") {
        body = "The rhythm is irregular, so the 300 / large-squares method is not reliable. There are " + nQrs + " QRS complexes in this 10-second strip, so the rate is " + nQrs + " × 6 = " + item.rate + " /min.";
      } else {
        var large = item.largeSq;
        var small = Math.round(large * 5 * 10) / 10;
        var exact = 300 / large;
        body = "The rhythm is regular. There are " + large.toFixed(1) + " large squares (" + small.toFixed(1) + " small squares) between consecutive R waves, so the rate is 300 / " + large.toFixed(1) + " = " + (Math.round(exact * 10) / 10);
        if (Math.abs(exact - item.rate) > 0.05) body += ", which rounds to " + item.rate;
        body += " /min. Equivalently, 1500 / " + small.toFixed(1) + " small squares gives the same result. The 10-second count is " + nQrs + " × 6 = " + (nQrs * 6) + " /min";
        body += (Math.abs(nQrs * 6 - item.rate) <= rateTolerance(item.rate))
          ? ", which agrees for a regular rhythm."
          : ". For a regular rhythm the 300 / large-squares method is the one to use.";
      }
      if (!ok && guess != null) body += " You entered " + guess + " /min.";
      if (!ok && guess == null) body += " Type the rate in /min, then check.";
    } else if (item.type === "axis") {
      var axFb = axisFeedbackText(item.trueAxis, item.guess, ok);
      return "<div class='" + cls + "'><p><strong>" + esc(axFb.head) + "</strong> " + esc(axFb.body) + "</p></div>";
    } else if (item.type === "spot") {
      body = item.why;
      if (!ok) {
        if (item.abnormality === "normal") body += " This beat is normal; no part needed to be marked.";
        else if (QZ.pick === "normal") body += " A part of this beat is out of the usual range; it is marked on the strip.";
        else if (QZ.pick) body += " You clicked " + partName(QZ.pick) + ".";
      }
    }
    return "<div class='" + cls + "'><p><strong>" + head + "</strong> " + esc(body.trim()) + "</p></div>";
  }

  function verdictPhrase(v, item) {
    if (v === "short") return "too short";
    if (v === "long") return (item && item.measure === "QT") ? "prolonged" : "too long";
    return "normal";
  }

  function caliperFeedbackRule(item) {
    if (item.measure === "PRi") {
      return "The usual PR interval is 0.12 to 0.20 s (3 to 5 small squares), so this one is " + verdictPhrase(item.verdict, item) + ".";
    }
    if (item.measure === "QRS") {
      return "A usual normal QRS is under 0.12 s (3 small squares), so this one is " + verdictPhrase(item.verdict, item) + ".";
    }
    var cut = qtcCutoff(item.sex);
    var sexWord = item.sex === "woman" ? "woman" : "man";
    var msg = "The machine reports a QTc of " + item.qtcMs + " ms. Assume this is the rate-corrected value; you do not need to calculate it. For a " + sexWord + " the usual upper limit is " + cut + " ms";
    if (item.qtcMs > 500) msg += ", and over 500 ms carries a high risk of torsades de pointes";
    msg += ", so this QTc is " + verdictPhrase(item.verdict, item) + ".";
    return msg;
  }

  function caliperHeadY(G) {
    /* The start and end triangles sit on, or slightly into, the paper top.
       A 2-unit band missed most of the cap, so a click on the Start line was
       treated as an R-wave mark when Start was within markSnapTol of an R. */
    return (G && G.gy != null ? G.gy : 0) + 18;
  }
  function caliperWhich(t, pt, G, times, svg, stateA, stateB, timeTol) {
    var dA = Math.abs(t - stateA), dB = Math.abs(t - stateB);
    var tol = timeTol != null ? timeTol : 0.16;
    if (Math.min(dA, dB) > tol) return null;
    var inHead = pt && pt.y < caliperHeadY(G);
    var nR = (times && times.length) ? nearestR(times, t) : { dist: 1e9 };
    var snap = (times && svg && G) ? markSnapTol(svg, G) : 0;
    var nearR = nR.t != null && nR.dist <= snap;
    if (inHead || !nearR || Math.min(dA, dB) <= nR.dist + 0.001) return dA <= dB ? "A" : "B";
    return null;
  }

  function bindQuizSvg(svg, item) {
    svg.addEventListener("pointerdown", function (ev) {
      var it = currentItem() || item;
      if (!it || QZ.answered) return;
      if ((it.type === "calipers" && !it.skipMeasure) || it.type === "rate") {
        var t = clampT(quizClientToT(svg, ev));
        var pt = svgEventToUser(svg, ev);
        var times = (it.type === "rate" && it.times) ? it.times : null;
        var which = caliperWhich(t, pt, QG, times, svg, QZ.calA, QZ.calB, 0.16);
        if (which || (it.type === "calipers" && caliperWhich(t, pt, QG, null, svg, QZ.calA, QZ.calB, 0.16))) {
          if (!which) which = Math.abs(t - QZ.calA) <= Math.abs(t - QZ.calB) ? "A" : "B";
          QZ.dragging = which;
          QZ.focus = QZ.dragging;
          try { svg.setPointerCapture(ev.pointerId); } catch (err) {}
          ev.preventDefault();
          drawQuizTrace();
        }
        return;
      }
      if (it.type === "click" || it.type === "spot") {
        var tClick = clampT(quizClientToT(svg, ev));
        var hit = hitFromEvent(svg, ev, it.beat, it.rr || 1, preferKeyForItem(it), quizGeom());
        ev.preventDefault();
        hideHitTip();
        QZ.pointerT = tClick;
        submitClick(hit.key);
      }
    });
    svg.addEventListener("pointermove", function (ev) {
      var it = currentItem() || item;
      if (!it || QZ.answered) {
        hideHitTip();
        return;
      }
      hideHitTip();
      if ((it.type === "click" || it.type === "spot") && !QZ.dragging) {
        QZ.pointerT = clampT(quizClientToT(svg, ev));
        QZ.markerT = null;
        drawQuizTrace();
        return;
      }
      if (!QZ.dragging) return;
      var t = clampT(quizClientToT(svg, ev));
      if (QZ.dragging === "A") QZ.calA = t;
      else QZ.calB = t;
      ev.preventDefault();
      drawQuizTrace();
    });
    svg.addEventListener("pointerup", function () {
      QZ._skipClick = !!QZ.dragging;
      QZ.dragging = null;
    });
    svg.addEventListener("pointercancel", function () { QZ.dragging = null; });
    svg.addEventListener("click", function (ev) {
      var it = currentItem() || item;
      if (!it || QZ.answered || it.type !== "rate") return;
      if (QZ._skipClick) { QZ._skipClick = false; return; }
      toggleMark(it, quizClientToT(svg, ev));
      drawQuizTrace();
    });
    svg.addEventListener("pointerleave", function () {
      if (QZ.dragging) return;
      hideHitTip();
      if (QZ.hover) {
        QZ.hover = null;
        updateQuizHover(null);
      }
    });
    svg.addEventListener("keydown", function (ev) {
      if (QZ.answered) return;
      var it = currentItem() || item;
      if (it.type === "calipers" || it.type === "rate") {
        if (ev.key === "1") { QZ.focus = "A"; ev.preventDefault(); drawQuizTrace(); return; }
        if (ev.key === "2") { QZ.focus = "B"; ev.preventDefault(); drawQuizTrace(); return; }
        var step = ev.shiftKey ? 0.02 : 0.04;
        if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
          var dir = ev.key === "ArrowLeft" ? -step : step;
          if (QZ.focus === "A") QZ.calA = clampT(QZ.calA + dir);
          else QZ.calB = clampT(QZ.calB + dir);
          ev.preventDefault();
          drawQuizTrace();
          return;
        }
        if (it.type === "rate" && (ev.key === "Enter" || ev.key === " ")) {
          ev.preventDefault();
          toggleMark(it, QZ.focus === "B" ? QZ.calB : QZ.calA, svg, QG);
          drawQuizTrace();
        }
        return;
      }
      if (it.type === "click" || it.type === "spot") {
        if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
          var stepK = ev.shiftKey ? 0.02 : 0.04;
          if (QZ.markerT == null) QZ.markerT = (QG.tStart + QG.tEnd) / 2;
          QZ.markerT = clampT(QZ.markerT + (ev.key === "ArrowLeft" ? -stepK : stepK));
          QZ.pointerT = null;
          ev.preventDefault();
          drawQuizTrace();
        }
        if (ev.key === "Enter") {
          var tEnter = QZ.markerT != null ? QZ.markerT : (QZ.pointerT != null ? QZ.pointerT : (QG.tStart + QG.tEnd) / 2);
          var chosen = hitAtTime(tEnter, it.beat, it.rr || 1, preferKeyForItem(it));
          ev.preventDefault();
          hideHitTip();
          submitClick(chosen.key);
        }
      }
    });
  }

  function clampT(t) {
    var lo = QG.tStart, hi = QG.tEnd;
    if (t < lo) return lo;
    if (t > hi) return hi;
    return t;
  }

  function moveCaliper(which, dir) {
    if (QZ.answered) return;
    QZ.focus = which;
    var step = 0.04 * dir;
    if (which === "A") QZ.calA = clampT(QZ.calA + step);
    else QZ.calB = clampT(QZ.calB + step);
    var item = currentItem();
    drawQuizTrace();
  }

  function resetInteraction(item) {
    QZ.answered = false;
    QZ.ok = false;
    QZ.pick = null;
    QZ.classify = null;
    QZ.rateInput = "";
    QZ.dragging = null;
    QZ.hover = null;
    QZ.pointerT = null;
    QZ.markerT = null;
    QZ.focus = "A";
    hideHitTip();
    if (item && (item.type === "calipers" || item.type === "rate")) {
      QZ.calA = item.tStart + 0.04;
      QZ.calB = item.tStart + 0.24;
      if (QZ.calB > item.tEnd) QZ.calB = (item.tStart + item.tEnd) / 2;
    }
    if (item && item.type === "rate") item.marks = [];
    if (item && item.type === "axis") item.guess = item.startGuess;
  }

  function submitClick(key) {
    var item = currentItem();
    if (!item || QZ.answered) return;
    if (item.type !== "click" && item.type !== "spot") return;
    QZ.pick = key;
    QZ.answered = true;
    QZ.ok = clickMatches(item, key);
    if (QZ.ok) QZ.score += 1;
    setScore();
    renderQuiz();
    speakQuiz((QZ.ok ? "Correct. " : "Not quite. ") + (item.type === "spot" ? item.why : ("The answer is the " + item.targetName + ".")));
  }

  function submitCheck() {
    var item = currentItem();
    if (!item || QZ.answered) return;
    if (item.type === "calipers") {
      if (!QZ.classify) {
        speakQuiz("Say whether the interval is normal before checking.");
        var box = $("quizClassifyHint");
        if (box) {
          box.textContent = item.measure === "QT"
            ? "Choose normal or prolonged first."
            : "Choose too short, normal or too long first.";
        }
        return;
      }
      QZ.ok = (item.skipMeasure || item.machineQtc) ? classifyCorrect(item) : (calipersPlacedWell(item) && classifyCorrect(item));
    } else if (item.type === "rate") {
      var g = rateEntered();
      if (g == null) {
        speakQuiz("Type the rate in /min before checking.");
        var rateBox = $("quizRate");
        if (rateBox) rateBox.focus();
        return;
      }
      QZ.ok = rateIsClose(g, item.rate);
    } else if (item.type === "axis") {
      QZ.ok = axisCategoryCorrect(item.guess, item.trueAxis);
    } else {
      return;
    }
    QZ.answered = true;
    if (QZ.ok) QZ.score += 1;
    setScore();
    renderQuiz();
    speakQuiz(QZ.ok ? "Correct." : "Not quite.");
  }

  function nextDrill() {
    QZ.i += 1;
    if (QZ.i < QZ.items.length) resetInteraction(QZ.items[QZ.i]);
    renderQuiz();
    var q = $("quizQ");
    if (q) q.focus();
  }

  function startRound(forcedItems) {
    QZ.items = forcedItems && forcedItems.length ? forcedItems : buildRound();
    QZ.i = 0;
    QZ.score = 0;
    resetInteraction(QZ.items[0]);
  }


  function renderQuizAxis() {
    var item = currentItem();
    if (!item || item.type !== "axis") return;
    renderAxisWheelOn($("quizAxisSvg"), {
      axis: item.guess,
      trueAxis: item.trueAxis,
      showTrue: !!QZ.answered,
      prefix: "axq",
      highlight: QZ.answered ? item.category : null,
      teach: false,
      store: "_quizAxisWheel"
    });
    renderAxisLeadsOn($("quizAxisLeadsSvg"), item.trueAxis, { showSigns: !!QZ.answered });
    updateQuizReadout();
  }

  function setQuizAxisGuess(deg) {
    var item = currentItem();
    if (!item || item.type !== "axis" || QZ.answered) return;
    item.guess = wrapAxis(deg);
    renderQuizAxis();
  }

  function bindQuizAxis() {
    var svg = $("quizAxisSvg");
    if (!svg) return;
    delete svg.dataset.bound;
    bindAxisPointer(svg, "_quizAxisWheel", function () {
      var it = currentItem();
      return it && it.type === "axis" ? it.guess : 0;
    }, function (d) { setQuizAxisGuess(d); }, function () { return QZ.answered; });
    var minus = $("quizAxisMinus"), plus = $("quizAxisPlus");
    if (minus) minus.addEventListener("click", function () { setQuizAxisGuess((currentItem() || {}).guess - 15); });
    if (plus) plus.addEventListener("click", function () { setQuizAxisGuess((currentItem() || {}).guess + 15); });
  }

  function renderQuiz() {
    var root = $("quizBody");
    if (!root) return;
    if (QZ.i >= QZ.items.length) {
      root.innerHTML =
        "<p class='quiz-end'><strong>Finished.</strong> You scored " + QZ.score + " out of " + QZ.items.length + ".</p>" +
        actionRow(secondaryBtn('quizAgain', 'Try again'));
      var again = $("quizAgain");
      if (again) again.addEventListener("click", function () {
        startRound();
        setScore();
        renderQuiz();
      });
      return;
    }
    var item = currentItem();
    var typeLab = (item.skipMeasure || item.machineQtc) ? "QTc" : TYPE_LABEL[item.type];
    var html = "<p class='quiz-progress'><span class='quiz-type'>" + esc(typeLab) + "</span> · Drill " + (QZ.i + 1) + " of " + QZ.items.length + "</p>";
    html += "<h3 class='quiz-q' id='quizQ' tabindex='-1'>" + esc(item.q) + "</h3>";
    html += "<p class='quiz-help'>" + esc(item.help) + "</p>";
    if (item.type === "rate") html += "<p class='strip-indicator'>10 s strip</p>";
    if (item.type === "axis") {
      html += "<div class='axis-layout quiz-axis-layout'>";
      html += "<div class='axis-wheel-col'>";
      html += "<svg id='quizAxisSvg' class='axis-svg' viewBox='0 0 500 500' role='application' tabindex='0' aria-label='Hexaxial reference wheel. Drag the arrow to your estimate of the QRS axis.'></svg>";
      html += "</div>";
      html += "<div class='axis-leads-col'>";
      html += "<svg id='quizAxisLeadsSvg' class='read-svg axis-leads-svg' viewBox='0 0 400 280' role='img' aria-label='Leads I, II and aVF for this tracing'></svg>";
      html += "<p class='axis-caption'>Leads I, II and aVF share one amplitude scale, so a near-isoelectric lead looks small. Polarities are shown after you check.</p>";
      html += "</div></div>";
    } else {
      html += "<div class='strip-wrap quiz-strip-wrap'>";
      html += "<svg id='quizSvg' class='quiz-svg" + (item.type === "rate" ? " quiz-rate-svg" : "") + "' viewBox='0 0 800 200' role='application' tabindex='0' aria-label='" + (item.type === "rate" ? "Ten-second lead II rhythm strip" : "Teaching ECG strip for this drill") + "' aria-describedby='quizSvgDesc quizQ'>";
      html += "<desc id='quizSvgDesc'>" + esc(item.help) + "</desc></svg></div>";
      html += "<p class='quiz-help'>Standard paper at 25 mm/s and 10 mm/mV. One small square is 0.04 s; one large square is 0.20 s." + (item.type === "rate" ? "<span class='strip-hint'> Scroll sideways to see the whole 10 seconds.</span>" : "") + "</p>";
    }
    html += "<p class='quiz-readout' id='quizReadout'></p>";

    if ((item.type === "calipers" && !item.skipMeasure) || item.type === "rate") {
      html += "<div class='quiz-controls' role='group' aria-label='Move calipers'>";
      html += caliperNudgeHtml();
      html += "</div>";
    }
    if (item.type === "rate") {
      html += "<div class='quiz-rate-field'>";
      html += "<label for='quizRate'>Rate (/min)</label>";
      html += "<input id='quizRate' type='number' inputmode='numeric' min='30' max='220' step='1' value='" + esc(QZ.rateInput) + "'" + (QZ.answered ? " disabled" : "") + ">";
      html += "</div>";
    }
    if (item.type === "calipers") {
      var classLabel = item.measure === "QT" ? "Is this QTc normal or prolonged?" : "Is this interval normal?";
      html += "<div class='quiz-classify' role='group' aria-label='" + esc(classLabel) + "'>";
      html += "<p class='quiz-classify-label'>" + esc(classLabel) + "</p>";
      item.options.forEach(function (op) {
        var pressed = QZ.classify === op.id ? "true" : "false";
        html += "<button type='button' class='t-btn' data-class='" + op.id + "' aria-pressed='" + pressed + "'" + (QZ.answered ? " disabled" : "") + ">" + esc(op.label) + "</button>";
      });
      html += "<p class='quiz-help' id='quizClassifyHint'></p>";
      html += "</div>";
    }
    if (item.type === "axis" && !QZ.answered) {
      html += "<div class='quiz-controls' role='group' aria-label='Adjust axis estimate'>";
      html += "<button type='button' class='t-btn' id='quizAxisMinus' aria-label='Decrease estimate by 15 degrees'>-15°</button>";
      html += "<button type='button' class='t-btn' id='quizAxisPlus' aria-label='Increase estimate by 15 degrees'>+15°</button>";
      html += "</div>";
    }
    if (item.type === "spot") {
      html += "<div class='quiz-fallback' role='group' aria-label='This beat is normal'>";
      html += "<button type='button' class='t-btn' data-part='normal'" + (QZ.answered ? " disabled" : "") + ">This beat is normal</button>";
      html += "</div>";
    }
    if (!QZ.answered && (item.type === "calipers" || item.type === "rate" || item.type === "axis")) {
      html += actionRow(primaryBtn("quizCheck", "Check"));
    }
    if (QZ.answered) {
      html += feedbackHtml(item);
      html += actionRow(primaryBtn("quizNext", QZ.i === QZ.items.length - 1 ? "See score" : "Next drill"));
    }
    root.innerHTML = html;
    drawQuizTrace();
    var svg = $("quizSvg");
    if (svg) {
      bindQuizSvg(svg, item);
      flashStrip(svg);
    }
    if (item.type === "axis") {
      bindQuizAxis();
      flashStrip($("quizAxisLeadsSvg"));
    }
    root.querySelectorAll(".quiz-controls .t-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        moveCaliper(b.getAttribute("data-cal"), parseInt(b.getAttribute("data-dir"), 10));
      });
    });
    root.querySelectorAll(".quiz-fallback .t-btn").forEach(function (b) {
      b.addEventListener("click", function () { submitClick(b.getAttribute("data-part")); });
    });
    root.querySelectorAll(".quiz-classify .t-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        if (QZ.answered) return;
        QZ.classify = b.getAttribute("data-class");
        root.querySelectorAll(".quiz-classify .t-btn").forEach(function (x) {
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
      });
    });
    var rateInp = $("quizRate");
    if (rateInp) {
      rateInp.addEventListener("input", function () { QZ.rateInput = rateInp.value; });
    }
    var chk = $("quizCheck");
    if (chk) chk.addEventListener("click", submitCheck);
    var nxt = $("quizNext");
    if (nxt) nxt.addEventListener("click", nextDrill);
  }

  function setTest(on, forcedItems) {
    QZ.on = on;
    if (on) startRound(forcedItems);
    var banner = $("testBanner");
    var top = $("topTestBanner");
    var panel = $("quizPanel");
    if (banner) banner.classList.toggle("is-on", on);
    if (top) top.classList.toggle("is-on", on);
    if (panel) panel.hidden = !on;
    document.querySelectorAll(".test-toggle").forEach(function (btn) {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      var lab = btn.querySelector(".test-cta-label");
      if (lab) lab.textContent = on ? "Close" : "Start";
    });
    setScore();
    if (on) renderQuiz();
  }

  function initQuiz() {
    document.querySelectorAll(".test-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = !QZ.on;
        setTest(next);
        if (next) {
          var target = $("testBanner") || $("quizPanel");
          if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
        }
      });
    });
  }

  function quizState() {
    var item = currentItem();
    return {
      on: QZ.on,
      i: QZ.i,
      score: QZ.score,
      n: QZ.items.length,
      type: item ? item.type : null,
      answered: QZ.answered,
      ok: QZ.ok,
      pick: QZ.pick,
      classify: QZ.classify,
      calA: QZ.calA,
      calB: QZ.calB,
      rateInput: QZ.rateInput,
      item: item ? {
        type: item.type,
        target: item.target || null,
        measure: item.measure || null,
        t0: item.t0,
        t1: item.t1,
        verdict: item.verdict || null,
        rate: item.rate != null ? item.rate : null,
        largeSq: item.largeSq != null ? item.largeSq : null,
        kind: item.kind || null,
        times: item.times ? item.times.slice() : null,
        marks: item.marks ? item.marks.slice() : null,
        sex: item.sex || null,
        trueAxis: item.trueAxis != null ? item.trueAxis : null,
        guess: item.guess != null ? item.guess : null,
        category: item.category || null,
        isoLead: item.isoLead || null,
        qtcMs: item.qtcMs != null ? item.qtcMs : null,
        abnormality: item.abnormality || null
      } : null
    };
  }


  /* ---------- Read an ECG step by step: rate, rhythm, axis ---------- */

  function seeded(seed) {
    var a = seed | 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function voltageLead(bumps, t, rr, dir) {
    var v = 0, n, n0, n1;
    if (!rr || rr <= 0) return beatV(bumps, t, dir);
    n0 = Math.floor((t - 0.9) / rr) - 1;
    n1 = Math.ceil((t + 0.3) / rr) + 1;
    for (n = n0; n <= n1; n++) v += beatV(bumps, t - n * rr, dir);
    return v;
  }

  function irregVoltage(bumpsList, t) {
    var v = 0, i;
    for (i = 0; i < bumpsList.length; i++) v += beatV(bumpsList[i].bumps, t - bumpsList[i].t0);
    return v;
  }

  function afWobble(t) {
    return 0.025 * Math.sin(t * 37.3) + 0.02 * Math.sin(t * 51.1) + 0.012 * Math.sin(t * 23.9);
  }

  var RS = {
    rate: null,
    rhythm: null,
    axis: 60,
    axisDragging: false
  };

  function rateTimesRegular(rr, duration) {
    var times = [], t = 0.20;
    while (t < duration - 0.02) {
      times.push(t);
      t += rr;
    }
    return times;
  }

  function rateTimesIrregular(rng, duration, mean) {
    var times = [], t = 0.16 + rng() * 0.1;
    while (t < duration - 0.05) {
      times.push(+t.toFixed(3));
      t += Math.max(0.36, Math.min(1.15, mean + (rng() - 0.5) * 0.7));
    }
    return times;
  }

  function makeRateCase(spec) {
    spec = spec || {};
    var kind = spec.kind || (Math.random() < 0.5 ? "regular" : "irregular");
    var duration = 10;
    var times, rr = null, largeSq = null, rate, seed = spec.seed != null ? spec.seed : Math.floor(Math.random() * 1e9);
    var rng = seeded(seed);
    var beat = defaultBeat({ u: false });
    if (kind === "regular") {
      largeSq = spec.largeSq || [3, 4, 5][Math.floor(rng() * 3)];
      rr = largeSq * 0.20;
      beat.qt = Math.max(0.28, Math.min(0.44, 0.40 * Math.sqrt(rr)));
      times = rateTimesRegular(rr, duration);
      rate = Math.round(300 / largeSq);
    } else {
      var mean = spec.mean || 0.72;
      times = rateTimesIrregular(rng, duration, mean);
      rate = times.length * 6;
      beat = defaultBeat({ u: false });
      beat.pr = 0.16;
    }
    return {
      kind: kind,
      duration: duration,
      times: times,
      rr: rr,
      largeSq: largeSq,
      mean: kind === "irregular" ? mean : null,
      rate: rate,
      beat: beat,
      seed: seed,
      calA: 0.08,
      calB: 0.48,
      focus: "A",
      marks: [],
      classified: null,
      entered: ""
    };
  }

  function makeRhythmCase(spec) {
    spec = spec || {};
    var kind = spec.kind || (Math.random() < 0.5 ? "sinus" : "af");
    var duration = 6;
    var seed = spec.seed != null ? spec.seed : Math.floor(Math.random() * 1e9);
    var rng = seeded(seed);
    var times, beat, rr = null, rate, largeSq = null, mean = null;
    if (kind === "sinus") {
      largeSq = spec.largeSq || 4;
      rr = largeSq * 0.20;
      beat = defaultBeat({ u: false, qt: Math.max(0.28, 0.40 * Math.sqrt(rr)) });
      times = rateTimesRegular(rr, duration);
      rate = Math.round(300 / largeSq);
    } else {
      kind = "af";
      mean = spec.mean || 0.68;
      beat = defaultBeat({ u: false, qt: 0.32 });
      times = rateTimesIrregular(rng, duration, mean);
      rate = Math.round((times.length / duration) * 60);
    }
    return {
      kind: kind,
      duration: duration,
      times: times,
      rr: rr,
      largeSq: largeSq,
      mean: mean,
      rate: rate,
      beat: beat,
      seed: seed,
      calA: 0.08,
      calB: 0.48,
      focus: "A",
      marks: [],
      marched: false,
      regularGuess: null,
      pGuess: null
    };
  }

  function setupStripGeom(duration, svg) {
    var u = 8;
    var gw = duration * 25 * u;
    var vbW = 8 + gw + 8;
    var markBand = rMarkBand(svg, vbW);
    var head = caliperHeadRoom(svg, vbW) + markBand;
    return {
      x0: 8, gy: head, u: u, tStart: 0, tEnd: duration,
      gh: 20 * u, y0: head + 14 * u,
      gw: gw,
      markBand: markBand
    };
  }

  function stripTtoX(G, t) { return G.x0 + (t - G.tStart) * 25 * G.u; }
  function stripXtoT(G, x) { return G.tStart + (x - G.x0) / (25 * G.u); }
  function stripClientToT(svg, G, evOrX, evY) {
    var ev = (evOrX && typeof evOrX === "object") ? evOrX : { clientX: evOrX, clientY: evY || 0 };
    var t = clientToTime(svg, ev, G);
    return t == null ? 0 : t;
  }

  function nearestR(times, t) {
    var i, best = null, d = 1e9;
    for (i = 0; i < times.length; i++) {
      var dd = Math.abs(times[i] - t);
      if (dd < d) { d = dd; best = times[i]; }
    }
    return { t: best, dist: d, i: times.indexOf(best) };
  }

  function drawStripCalipers(g, G, a, b, focus, tok, fam, svg) {
    var yBot = G.gy + G.gh, col = tok.a;
    var vbW = (G.x0 + G.gw + 8);
    var capBottom = drawCaliperCaptions(
      g, stripTtoX(G, a), stripTtoX(G, b), tok, fam, svg, 0, vbW, G.markBand || 0
    );
    var yTop = capBottom;
    function one(tVal, which, focused) {
      var x = stripTtoX(G, tVal);
      var isStart = which === "A";
      el("path", { d: "M" + x + " " + (yTop + 14) + "V" + yBot, fill: "none", stroke: col, "stroke-width": focused ? 3.2 : 2.2 }, g);
      el("polygon", {
        points: x + "," + yTop + " " + (x - 10) + "," + (yTop + 14) + " " + (x + 10) + "," + (yTop + 14),
        fill: isStart ? col : tok.surface, stroke: col, "stroke-width": focused ? 3.2 : 2
      }, g);
    }
    one(a, "A", focus === "A");
    one(b, "B", focus === "B");
    var x0 = stripTtoX(G, Math.min(a, b)), x1 = stripTtoX(G, Math.max(a, b));
    el("path", { d: "M" + x0 + " " + (yBot + 6) + "H" + x1, fill: "none", stroke: col, "stroke-width": 2 }, g);
  }

  function bindStripCalipers(svg, G, getState, setState, onChange) {
    var st;
    svg.addEventListener("pointerdown", function (ev) {
      st = getState();
      if (!st) return;
      var t = Math.max(G.tStart, Math.min(G.tEnd, stripClientToT(svg, G, ev)));
      var dA = Math.abs(t - st.calA), dB = Math.abs(t - st.calB);
      var which = null;
      if (dA <= 0.10 || dB <= 0.10) which = dA <= dB ? "A" : "B";
      if (!which) return;
      st.dragging = which;
      st.focus = which;
      try { svg.setPointerCapture(ev.pointerId); } catch (err) {}
      ev.preventDefault();
      onChange();
    });
    svg.addEventListener("pointermove", function (ev) {
      st = getState();
      if (!st || !st.dragging) return;
      var t = Math.max(G.tStart, Math.min(G.tEnd, stripClientToT(svg, G, ev)));
      if (st.dragging === "A") st.calA = t; else st.calB = t;
      ev.preventDefault();
      onChange();
    });
    svg.addEventListener("pointerup", function () { st = getState(); if (st) st.dragging = null; });
    svg.addEventListener("pointercancel", function () { st = getState(); if (st) st.dragging = null; });
    svg.addEventListener("keydown", function (ev) {
      st = getState();
      if (!st) return;
      if (ev.key === "1") { st.focus = "A"; ev.preventDefault(); onChange(); return; }
      if (ev.key === "2") { st.focus = "B"; ev.preventDefault(); onChange(); return; }
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        var step = ev.shiftKey ? 0.02 : 0.04;
        var dir = ev.key === "ArrowLeft" ? -step : step;
        if (st.focus === "A") st.calA = Math.max(G.tStart, Math.min(G.tEnd, st.calA + dir));
        else st.calB = Math.max(G.tStart, Math.min(G.tEnd, st.calB + dir));
        ev.preventDefault();
        onChange();
      }
    });
  }

  function renderRate() {
    var svg = $("rateSvg"), item = RS.rate, tok = T(), ink = cssVar("--ecg-ink") || "#111", fam = fontSans();
    if (!svg || !item) return;
    var G = setupStripGeom(item.duration, svg);
    G.calRoom = 28;
    var vbW = G.x0 + G.gw + 8, vbH = G.gy + G.gh + G.calRoom;
    clearSvg(svg);
    svg.setAttribute("viewBox", "0 0 " + Math.ceil(vbW) + " " + Math.ceil(vbH));
    var g = el("g", null, svg);
    paper(g, G.x0, G.gy, G.gw, G.gh, G.u);
    var bumps = beatBumps(item.beat);
    var f;
    if (item.kind === "regular") {
      f = function (tt) { return voltageLead(bumps, tt - item.times[0] + item.beat.pr + 0.045 * (item.beat.qrs / 0.09), item.rr, leadII()); };
      /* Align first R with times[0]: rPeak relative to beat start is pr+0.040*k */
    } else {
      /* Build one QRS-centred bump set per R, no P wave. */
      var list = item.times.map(function (rt) {
        var b = defaultBeat({ pr: 0, qrs: 0.08, qt: 0.32, u: false });
        var bm = beatBumps(b).filter(function (x) { return x.part === "QRS" || x.part === "T"; });
        return { t0: rt - (0.040 * (b.qrs / 0.09)), bumps: bm };
      });
      f = function (tt) { return irregVoltage(list, tt) + afWobble(tt); };
    }
    /* For regular, easier: place beat so rPeak lands on each time by using voltage of a beat starting at rt - rPeak */
    if (item.kind === "regular") {
      var rPeak = item.beat.pr + 0.040 * (item.beat.qrs / 0.09);
      var listR = item.times.map(function (rt) {
        return { t0: rt - rPeak, bumps: bumps };
      });
      f = function (tt) { return irregVoltage(listR, tt); };
    }
    el("path", {
      d: fnPath(f, 0, item.duration, stripTtoX(G, 0), G.y0, 25 * G.u, 10 * G.u, 0.003),
      fill: "none", stroke: ink, "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-linecap": "round"
    }, g);
    /* Learning section: marks and 1, 2, 3… numbers appear as soon as an R is clicked. */
    drawRMarks(g, function (mt) { return stripTtoX(G, mt); }, item.marks, 18, true, tok, fam, { yNum: (G.markBand || 32) - 2, fontSize: rMarkFontSize(svg, G.x0 + G.gw + 8) });
    drawStripCalipers(g, G, item.calA, item.calB, item.focus, tok, fam, svg);
    RS._rateG = G;
    updateRateReadout();
  }

  function updateRateReadout() {
    var elr = $("rateReadout"), item = RS.rate;
    if (!elr || !item) return;
    var span = Math.abs(item.calB - item.calA);
    var parts = ["Calipers: " + formatCaliperSpan(span) + "."];
    parts.push("R waves marked: " + item.marks.length + ".");
    elr.textContent = parts.join(" ");
  }

  function rateTaskHtml(item) {
    if (item.kind === "regular") {
      return "This 10-second strip is a regular rhythm. Measure one R-R interval with the calipers, or click two consecutive R waves, then check the rate. <strong>Rate = 300 / large squares</strong> (or 1500 / small squares).";
    }
    return "This 10-second strip is irregular. Click every R wave to mark it, then read the rate as <strong>number of QRS complexes in 10 s × 6</strong>.";
  }

  function bindRateSvg() {
    var svg = $("rateSvg");
    if (!svg || svg.dataset.bound) return;
    svg.dataset.bound = "1";
    bindStripCalipers(svg, { /* G filled live */ tStart: 0, tEnd: 10, x0: 8, u: 8, gy: 8, gh: 128, y0: 96, gw: 2000 }, function () { return RS.rate; }, null, function () { renderRate(); });
    /* bindStripCalipers captured G at bind time. Re-bind using RS._rateG instead. */
  }

  /* The G object in bindStripCalipers is copied by field use of stripClientToT(svg, G, ...).
     We'll pass a live getter by wrapping a proxy object later if needed. For simplicity,
     rebuild listeners each render is messy. Use RS._rateG in a custom bind once. */

  function bindLiveStrip(svg, getG, getState, onChange, onMark) {
    if (!svg || svg.dataset.bound) return;
    svg.dataset.bound = "1";
    var st;
    svg.addEventListener("pointerdown", function (ev) {
      var G = getG(), state = getState();
      if (!G || !state) return;
      var t = Math.max(G.tStart, Math.min(G.tEnd, stripClientToT(svg, G, ev)));
      var pt = svgEventToUser(svg, ev);
      var times = (state.times && onMark) ? state.times : null;
      var which = caliperWhich(t, pt, G, times, svg, state.calA, state.calB, 0.16);
      if (which) {
        state.dragging = which;
        state.focus = state.dragging;
        try { svg.setPointerCapture(ev.pointerId); } catch (err) {}
        ev.preventDefault();
        onChange();
        return;
      }
    });
    svg.addEventListener("pointermove", function (ev) {
      st = getState();
      var G = getG();
      if (!st || !st.dragging || !G) return;
      var t = Math.max(G.tStart, Math.min(G.tEnd, stripClientToT(svg, G, ev)));
      if (st.dragging === "A") st.calA = t; else st.calB = t;
      ev.preventDefault();
      onChange();
    });
    svg.addEventListener("pointerup", function (ev) {
      st = getState();
      if (st) {
        st._skipClick = !!st.dragging;
        st.dragging = null;
      }
    });
    svg.addEventListener("click", function (ev) {
      if (!onMark) return;
      var G = getG(), state = getState();
      if (!G || !state) return;
      if (state._skipClick) { state._skipClick = false; return; }
      var t = stripClientToT(svg, G, ev);
      onMark(t);
    });
    svg.addEventListener("keydown", function (ev) {
      st = getState();
      var G = getG();
      if (!st || !G) return;
      if (ev.key === "1") { st.focus = "A"; ev.preventDefault(); onChange(); return; }
      if (ev.key === "2") { st.focus = "B"; ev.preventDefault(); onChange(); return; }
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        var step = ev.shiftKey ? 0.02 : 0.04;
        var dir = ev.key === "ArrowLeft" ? -step : step;
        if (st.focus === "A") st.calA = Math.max(G.tStart, Math.min(G.tEnd, st.calA + dir));
        else st.calB = Math.max(G.tStart, Math.min(G.tEnd, st.calB + dir));
        ev.preventDefault();
        onChange();
        return;
      }
      if (onMark && (ev.key === "Enter" || ev.key === " ")) {
        ev.preventDefault();
        onMark(st.focus === "B" ? st.calB : st.calA);
      }
    });
  }

  function markSnapTol(svg, G) {
    var cssW = (svg && svg.clientWidth) || 0;
    var vbW = G ? (G.x0 + G.gw + 8) : 0;
    var pxPerSec = (cssW > 40 && vbW > 0) ? (cssW / vbW) * 25 * ((G && G.u) || 8) : 200;
    return Math.max(0.12, 16 / Math.max(pxPerSec, 1));
  }

  function toggleMark(item, t, svg, G) {
    if (!item || !item.times) return;
    if (!svg) {
      if (item === RS.rate) svg = $("rateSvg");
      else if (item === RS.rhythm) svg = $("rhythmSvg");
      else svg = $("quizSvg");
    }
    if (!G) {
      if (item === RS.rate) G = RS._rateG;
      else if (item === RS.rhythm) G = RS._rhythmG;
      else G = QG;
    }
    var n = nearestR(item.times, t);
    if (!n.t || n.dist > markSnapTol(svg, G)) return;
    var i = item.marks.indexOf(n.t);
    if (i >= 0) item.marks.splice(i, 1);
    else {
      item.marks.push(n.t);
      item.marks.sort(function (a, b) { return a - b; });
      if (item.kind === "regular" && item.marks.length === 2) {
        item.calA = item.marks[0];
        item.calB = item.marks[1];
      }
    }
  }

  function fillRateControls() {
    var box = $("rateControls"), item = RS.rate, task = $("rateTask");
    if (!box || !item) return;
    if (task) task.innerHTML = rateTaskHtml(item);
    box.innerHTML =
      caliperNudgeHtml() +
      "<button type='button' class='t-btn' id='rateMarkAll'>Mark all R waves</button>" +
      "<button type='button' class='t-btn' id='rateClear'>Clear marks</button>" +
      "<label for='rateInput'>Rate (/min)</label>" +
      "<input id='rateInput' type='number' inputmode='numeric' min='20' max='250' step='1' value='" + esc(item.entered) + "'>" +
      "<p class='quiz-feedback' id='rateFeedback' hidden></p>" +
      actionRow(primaryBtn("rateCheck", "Check") + secondaryBtn("rateAnother", "Try another strip"));
    box.querySelectorAll("[data-cal]").forEach(function (b) {
      b.addEventListener("click", function () {
        var G = RS._rateG, st = RS.rate;
        if (!G || !st) return;
        st.focus = b.getAttribute("data-cal");
        var dir = parseInt(b.getAttribute("data-dir"), 10) * 0.04;
        if (st.focus === "A") st.calA = Math.max(0, Math.min(st.duration, st.calA + dir));
        else st.calB = Math.max(0, Math.min(st.duration, st.calB + dir));
        renderRate();
      });
    });
    if ($("rateMarkAll")) {
      $("rateMarkAll").addEventListener("click", function () {
        RS.rate.marks = RS.rate.times.slice();
        renderRate();
      });
    }
    $("rateClear").addEventListener("click", function () {
      RS.rate.marks = [];
      renderRate();
    });
    $("rateInput").addEventListener("input", function () { RS.rate.entered = $("rateInput").value; });
    $("rateCheck").addEventListener("click", checkRate);
    $("rateAnother").addEventListener("click", function () { startRate(); });
  }

  function rateGuess(item) {
    var typed = parseInt(item.entered, 10);
    if (!isNaN(typed) && typed > 0) return typed;
    return null;
  }

  function checkRate() {
    var item = RS.rate, fb = $("rateFeedback"), live = $("rateLive");
    if (!item || !fb) return;
    var guess = rateGuess(item);
    if (guess == null) {
      fb.hidden = false;
      fb.className = "quiz-feedback is-wrong";
      fb.innerHTML = "<p>Type the rate in /min before checking.</p>";
      if (live) live.textContent = "Type the rate in /min before checking.";
      var inp = $("rateInput");
      if (inp) inp.focus();
      return;
    }
    var ok = Math.abs(guess - item.rate) <= rateTolerance(item.rate);
    var msg, msgHtml;
    if (item.kind === "regular") {
      msg = "There are " + item.largeSq + " large squares between consecutive R waves, so the rate is 300 / " + item.largeSq + " = " + item.rate + " /min. The 10-second count is " + item.times.length + " × 6 = " + (item.times.length * 6) + " /min, which agrees for a regular rhythm.";
      msgHtml = "There are " + item.largeSq + " large squares between consecutive R waves, so the rate is <strong>300 / " + item.largeSq + " = " + item.rate + " /min</strong>. The 10-second count is <strong>" + item.times.length + " × 6 = " + (item.times.length * 6) + " /min</strong>, which agrees for a regular rhythm.";
    } else {
      msg = "There are " + item.times.length + " QRS complexes in this 10-second strip, so the rate is " + item.times.length + " × 6 = " + item.rate + " /min. The 300 / large-squares method is not reliable here because the R-R intervals vary.";
      msgHtml = "There are " + item.times.length + " QRS complexes in this 10-second strip, so the rate is <strong>" + item.times.length + " × 6 = " + item.rate + " /min</strong>. The 300 / large-squares method is not reliable here because the R-R intervals vary.";
    }
    fb.hidden = false;
    fb.className = "quiz-feedback" + (ok ? "" : " is-wrong");
    fb.innerHTML = "<p><strong>" + (ok ? "Correct." : "Not quite.") + "</strong> " + msgHtml + (!ok ? " You entered " + guess + " /min." : "") + "</p>";
    if (live) live.textContent = (ok ? "Correct. " : "Not quite. ") + msg;
    item.revealed = true;
    renderRate();
  }

  function nextRateSpec(prev) {
    var kind = prev && prev.kind === "regular" ? "irregular" : "regular";
    if (!prev) kind = Math.random() < 0.5 ? "regular" : "irregular";
    var spec = { kind: kind };
    if (kind === "regular") {
      spec.largeSq = pickAvoid([3, 4, 5], RS.lastRateSq);
      RS.lastRateSq = spec.largeSq;
    } else {
      spec.mean = pickAvoid([0.50, 0.72, 0.95], RS.lastRateMean);
      RS.lastRateMean = spec.mean;
    }
    return spec;
  }

  function startRate(spec) {
    var another = !spec;
    if (another) {
      spec = nextRateSpec(RS.rate);
      RS.rateStrip = (RS.rateStrip || 1) + 1;
    } else {
      RS.rateStrip = 1;
      if (spec.kind === "regular" && spec.largeSq) RS.lastRateSq = spec.largeSq;
      if (spec.kind === "irregular" && spec.mean) RS.lastRateMean = spec.mean;
    }
    RS.rate = makeRateCase(spec);
    RS.rate.revealed = false;
    var task = $("rateTask");
    if (task) task.innerHTML = rateTaskHtml(RS.rate);
    setStripLabel("rateStripLabel", RS.rateStrip);
    fillRateControls();
    renderRate();
    flashStrip($("rateSvg"));
    bindLiveStrip($("rateSvg"), function () { return RS._rateG; }, function () { return RS.rate; }, function () { renderRate(); }, function (t) {
      toggleMark(RS.rate, t);
      renderRate();
    });
  }

  /* ---- Rhythm ---- */

  function renderRhythm() {
    var svg = $("rhythmSvg"), item = RS.rhythm, tok = T(), ink = cssVar("--ecg-ink") || "#111", fam = fontSans();
    if (!svg || !item) return;
    var G = setupStripGeom(item.duration, svg);
    G.calRoom = 28;
    var vbW = G.x0 + G.gw + 8, vbH = G.gy + G.gh + G.calRoom;
    clearSvg(svg);
    svg.setAttribute("viewBox", "0 0 " + Math.ceil(vbW) + " " + Math.ceil(vbH));
    var g = el("g", null, svg);
    paper(g, G.x0, G.gy, G.gw, G.gh, G.u);
    var rPeak = item.beat.pr + 0.040 * (item.beat.qrs / 0.09);
    var list, f;
    if (item.kind === "sinus") {
      var bumps = beatBumps(item.beat);
      list = item.times.map(function (rt) { return { t0: rt - rPeak, bumps: bumps }; });
      f = function (tt) { return irregVoltage(list, tt); };
    } else {
      list = item.times.map(function (rt) {
        var b = defaultBeat({ pr: 0, qrs: 0.08, qt: 0.30, u: false });
        var bm = beatBumps(b).filter(function (x) { return x.part === "QRS" || x.part === "T"; });
        return { t0: rt - (0.040 * (b.qrs / 0.09)), bumps: bm };
      });
      f = function (tt) { return irregVoltage(list, tt) + afWobble(tt); };
    }
    el("path", {
      d: fnPath(f, 0, item.duration, stripTtoX(G, 0), G.y0, 25 * G.u, 10 * G.u, 0.003),
      fill: "none", stroke: ink, "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-linecap": "round"
    }, g);
    if (item.marched) {
      var w = Math.abs(item.calB - item.calA);
      var start = Math.min(item.calA, item.calB);
      if (w >= 0.28) {
        var k, x, yBot = G.gy + G.gh;
        for (k = 0; start + k * w <= item.duration + 0.01; k++) {
          x = stripTtoX(G, start + k * w);
          el("path", {
            d: "M" + x + " " + G.gy + "V" + yBot,
            fill: "none", stroke: tok.a, "stroke-width": 1.8, "stroke-dasharray": "5 4"
          }, g);
          el("text", { x: x, y: G.gy + 14, "text-anchor": "middle", fill: tok.a, "font-family": fam, class: "lab-small" }, g, String(k + 1));
        }
      }
    }
    drawRMarks(g, function (mt) { return stripTtoX(G, mt); }, item.marks || [], 18, !!item.revealed, tok, fam, { yNum: (G.markBand || 32) - 2, fontSize: rMarkFontSize(svg, G.x0 + G.gw + 8) });
    drawStripCalipers(g, G, item.calA, item.calB, item.focus, tok, fam, svg);
    RS._rhythmG = G;
    updateRhythmReadout();
  }

  function updateRhythmReadout() {
    var elr = $("rhythmReadout"), item = RS.rhythm;
    if (!elr || !item) return;
    var span = Math.abs(item.calB - item.calA);
    var parts = ["Calipers: " + formatCaliperSpan(span) + "."];
    parts.push("R waves marked: " + ((item.marks && item.marks.length) || 0) + ".");
    elr.textContent = parts.join(" ");
  }

  function fillRhythmControls() {
    var box = $("rhythmControls"), item = RS.rhythm, task = $("rhythmTask");
    if (!box || !item) return;
    if (task) task.textContent = "Set the calipers on one R-R interval, press March the calipers, then decide if the rhythm is regular and whether a P wave precedes every QRS.";
    function pressed(val, cur) { return val === cur ? "true" : "false"; }
    box.innerHTML =
      caliperNudgeHtml() +
      "<button type='button' class='t-btn' id='rhythmSnap'>Snap to two R waves</button>" +
      "<button type='button' class='t-btn' id='rhythmMarch' aria-pressed='" + (item.marched ? "true" : "false") + "'>March the calipers</button>" +
      "<span class='quiz-controls-label'>Is the rhythm regular?</span>" +
      "<button type='button' class='t-btn' data-reg='regular' aria-pressed='" + pressed("regular", item.regularGuess) + "'>Regular</button>" +
      "<button type='button' class='t-btn' data-reg='irregular' aria-pressed='" + pressed("irregular", item.regularGuess) + "'>Irregular</button>" +
      "<span class='quiz-controls-label'>Is there a P wave before every QRS?</span>" +
      "<button type='button' class='t-btn' data-p='yes' aria-pressed='" + pressed("yes", item.pGuess) + "'>Yes, a P before every QRS</button>" +
      "<button type='button' class='t-btn' data-p='no' aria-pressed='" + pressed("no", item.pGuess) + "'>No P waves</button>" +
      "<p class='quiz-feedback' id='rhythmFeedback' hidden></p>" +
      actionRow(primaryBtn("rhythmCheck", "Check") + secondaryBtn("rhythmAnother", "Try another strip"));
    box.querySelectorAll("[data-cal]").forEach(function (b) {
      b.addEventListener("click", function () {
        var st = RS.rhythm;
        st.focus = b.getAttribute("data-cal");
        var dir = parseInt(b.getAttribute("data-dir"), 10) * 0.04;
        if (st.focus === "A") st.calA = Math.max(0, Math.min(st.duration, st.calA + dir));
        else st.calB = Math.max(0, Math.min(st.duration, st.calB + dir));
        renderRhythm();
      });
    });
    $("rhythmSnap").addEventListener("click", function () {
      if (RS.rhythm.times.length >= 2) {
        RS.rhythm.calA = RS.rhythm.times[0];
        RS.rhythm.calB = RS.rhythm.times[1];
        renderRhythm();
      }
    });
    $("rhythmMarch").addEventListener("click", function () {
      RS.rhythm.marched = !RS.rhythm.marched;
      renderRhythm();
      fillRhythmControls();
    });
    box.querySelectorAll("[data-reg]").forEach(function (b) {
      b.addEventListener("click", function () {
        RS.rhythm.regularGuess = b.getAttribute("data-reg");
        fillRhythmControls();
      });
    });
    box.querySelectorAll("[data-p]").forEach(function (b) {
      b.addEventListener("click", function () {
        RS.rhythm.pGuess = b.getAttribute("data-p");
        fillRhythmControls();
      });
    });
    $("rhythmCheck").addEventListener("click", checkRhythm);
    $("rhythmAnother").addEventListener("click", function () { startRhythm(); });
  }

  function checkRhythm() {
    var item = RS.rhythm, fb = $("rhythmFeedback"), live = $("rhythmLive");
    if (!item || !fb) return;
    var isRegular = item.kind === "sinus";
    var hasP = item.kind === "sinus";
    var okReg = item.regularGuess === (isRegular ? "regular" : "irregular");
    var okP = item.pGuess === (hasP ? "yes" : "no");
    var ok = okReg && okP;
    var msg;
    if (item.kind === "sinus") {
      msg = "The R-R intervals are the same, so the rhythm is regular, and a P wave precedes every QRS. That is consistent with sinus rhythm (here at " + item.rate + " /min).";
    } else {
      msg = "The R-R intervals vary, so the rhythm is irregularly irregular, and there are no P waves. That is atrial fibrillation.";
    }
    if (!item.regularGuess || !item.pGuess) {
      msg = "Decide whether the rhythm is regular, and whether a P wave precedes every QRS, then check again. " + msg;
      ok = false;
    }
    fb.hidden = false;
    fb.className = "quiz-feedback" + (ok ? "" : " is-wrong");
    fb.innerHTML = "<p><strong>" + (ok ? "Correct." : "Not quite.") + "</strong> " + esc(msg) + "</p>";
    if (live) live.textContent = (ok ? "Correct. " : "Not quite. ") + msg;
    item.revealed = true;
    renderRhythm();
  }

  function nextRhythmSpec(prev) {
    var kind = prev && prev.kind === "sinus" ? "af" : "sinus";
    if (!prev) kind = Math.random() < 0.5 ? "sinus" : "af";
    var spec = { kind: kind };
    if (kind === "sinus") {
      spec.largeSq = pickAvoid([3, 4, 5], RS.lastRhythmSq);
      RS.lastRhythmSq = spec.largeSq;
    } else {
      spec.mean = pickAvoid([0.50, 0.68, 0.90], RS.lastRhythmMean);
      RS.lastRhythmMean = spec.mean;
    }
    return spec;
  }

  function startRhythm(spec) {
    var another = !spec;
    if (another) {
      spec = nextRhythmSpec(RS.rhythm);
      RS.rhythmStrip = (RS.rhythmStrip || 1) + 1;
    } else {
      RS.rhythmStrip = 1;
      if (spec.kind === "sinus" && spec.largeSq) RS.lastRhythmSq = spec.largeSq;
      if (spec.kind === "af" && spec.mean) RS.lastRhythmMean = spec.mean;
    }
    RS.rhythm = makeRhythmCase(spec);
    RS.rhythm.revealed = false;
    setStripLabel("rhythmStripLabel", RS.rhythmStrip);
    fillRhythmControls();
    renderRhythm();
    flashStrip($("rhythmSvg"));
    bindLiveStrip($("rhythmSvg"), function () { return RS._rhythmG; }, function () { return RS.rhythm; }, function () { renderRhythm(); }, function (t) {
      toggleMark(RS.rhythm, t);
      renderRhythm();
    });
  }


  var AXIS_CASES = {
    normal: [
      { deg: 60 }, { deg: 45 }, { deg: 30 }, { deg: 15 }, { deg: 75 }, { deg: -15 },
      { deg: 0, iso: "aVF" }
    ],
    lad: [
      { deg: -45 }, { deg: -60 }, { deg: -75 }, { deg: -50 }
    ],
    rad: [
      { deg: 105 }, { deg: 120 }, { deg: 135 }, { deg: 165 },
      { deg: 150, iso: "II" }
    ],
    extreme: [
      { deg: -120 }, { deg: -135 }, { deg: -150 }, { deg: -165 }
    ]
  };
  var AXIS_BOUNDARIES = [-30, 90, 180, -180, -90];
  var AXIS_CATS = ["normal", "lad", "rad", "extreme"];

  function makeAxisCase(spec) {
    spec = spec || {};
    var avoid = spec.avoid || spec.category === undefined && RS.lastAxisCat;
    var cat;
    if (spec.category && (!avoid || spec.category !== avoid || spec.deg != null)) {
      cat = spec.category;
    } else if (spec.deg != null) {
      cat = axisRegionKey(spec.deg);
    } else {
      cat = pickAvoid(AXIS_CATS, avoid);
    }
    var pool = AXIS_CASES[cat] || AXIS_CASES.normal;
    var chosen;
    if (spec.deg != null) {
      chosen = { deg: wrapAxis(spec.deg) };
      var i;
      for (i = 0; i < pool.length; i++) {
        if (Math.abs(wrapAxis(pool[i].deg) - chosen.deg) < 0.5) { chosen = pool[i]; break; }
      }
    } else if (spec.iso) {
      var isoPool = pool.filter(function (c) { return c.iso; });
      chosen = (isoPool.length ? pickOne(isoPool) : pickOne(pool));
    } else {
      var safe = pool.filter(function (c) { return !axisNearBoundary(c.deg); });
      chosen = pickOne(safe.length ? safe : pool);
    }
    var deg = wrapAxis(chosen.deg);
    cat = axisRegionKey(deg);
    var startGuess = (cat === "normal") ? 180 : 60;
    if (axisRegionKey(startGuess) === cat) startGuess = wrapAxis(startGuess + 120);
    return {
      deg: deg,
      category: cat,
      isoLead: chosen.iso || null,
      startGuess: startGuess
    };
  }

  function axisReasoning(deg) {
    var info = axisLabel(deg);
    var sI = leadSign(info.deg, 0), sII = leadSign(info.deg, 60), sAVF = leadSign(info.deg, 90);
    var q = "Lead I is " + sI + ", lead aVF is " + sAVF + ", and lead II is " + sII + ".";
    if (sI === "positive" && sAVF === "positive") q += " Both I and aVF are positive, so the quadrant is 0° to +90° (normal).";
    else if (sI === "positive" && sAVF === "negative") {
      if (sII !== "negative") q += " Lead I is positive and aVF is negative, but lead II is not negative, so the axis is still in the usual range (about -30° to 0°).";
      else q += " Lead I is positive and both aVF and lead II are negative, so this is left axis deviation (less than -30°).";
    } else if (sI === "negative" && sAVF === "positive") q += " Lead I is negative and aVF is positive, so this is right axis deviation (greater than +90°).";
    else if (sI === "isoelectric" || sAVF === "isoelectric") q += " Use the isoelectric lead to refine the quadrant.";
    else q += " Leads I and aVF are both negative, so this is an extreme (northwest) axis.";
    var iso = null, isoDeg = null;
    if (sI === "isoelectric") { iso = "I"; isoDeg = 0; }
    else if (sAVF === "isoelectric") { iso = "aVF"; isoDeg = 90; }
    else if (sII === "isoelectric") { iso = "II"; isoDeg = 60; }
    if (iso) {
      var c1 = formatAxisDeg(isoDeg + 90), c2 = formatAxisDeg(isoDeg - 90);
      q += " The QRS in lead " + iso + " is near-isoelectric, so the axis is roughly at right angles to that lead, at about " + c1 + " or " + c2 + ". The polarity of the other leads points to " + formatAxisDeg(info.deg) + ".";
    }
    return q;
  }

  /* ---- Axis ---- */

  function axisNearBoundary(deg) {
    var d = wrapAxis(deg), i;
    for (i = 0; i < AXIS_BOUNDARIES.length; i++) {
      if (axisDelta(d, AXIS_BOUNDARIES[i]) <= 10) return true;
    }
    return false;
  }

  /* Boundaries follow the usual ranges already taught on this page:
     -30° and +90° are normal; -90° and ±180° are extreme. */
  function axisLabel(deg) {
    var d = ((deg + 180) % 360) - 180;
    if (d === -180) d = 180;
    var name;
    if (d >= -30 && d <= 90) name = "normal axis";
    else if (d < -30 && d > -90) name = "left axis deviation";
    else if (d > 90 && d < 180) name = "right axis deviation";
    else name = "extreme (northwest) axis";
    return { deg: d, name: name };
  }

  function axisCategoryCorrect(guess, trueDeg) {
    return axisRegionKey(guess) === axisRegionKey(trueDeg);
  }

  function leadSign(axisDeg, leadDeg) {
    var net = Math.cos((axisDeg - leadDeg) * DEG);
    if (Math.abs(net) < 0.12) return "isoelectric";
    return net > 0 ? "positive" : "negative";
  }

  function axisRegionKey(deg) {
    var info = axisLabel(deg);
    if (info.name === "normal axis") return "normal";
    if (info.name === "left axis deviation") return "lad";
    if (info.name === "right axis deviation") return "rad";
    return "extreme";
  }

  function axisPatterns(svg, prefix) {
    prefix = prefix || "ax";
    var tok = T(), ink = cssVar("--ecg-ink") || "#111";
    var rust = cssVar("--btn-secondary") || tok.c || "#9A3412";
    var defs = el("defs", null, svg);
    var h = el("pattern", { id: prefix + "-hatch", patternUnits: "userSpaceOnUse", width: 8, height: 8 }, defs);
    el("rect", { width: 8, height: 8, fill: tok.a, "fill-opacity": 0.10 }, h);
    el("path", { d: "M0 8 L8 0 M-2 2 L2 -2 M6 10 L10 6", stroke: tok.a, "stroke-width": 1.2, fill: "none" }, h);
    var d = el("pattern", { id: prefix + "-dots", patternUnits: "userSpaceOnUse", width: 8, height: 8 }, defs);
    el("rect", { width: 8, height: 8, fill: rust, "fill-opacity": 0.08 }, d);
    el("circle", { cx: 4, cy: 4, r: 1.45, fill: rust }, d);
    var xh = el("pattern", { id: prefix + "-cross", patternUnits: "userSpaceOnUse", width: 8, height: 8 }, defs);
    el("rect", { width: 8, height: 8, fill: ink, "fill-opacity": 0.05 }, xh);
    el("path", { d: "M0 8 L8 0 M0 0 L8 8 M-2 2 L2 -2 M6 10 L10 6 M-2 6 L2 10 M6 -2 L10 2", stroke: ink, "stroke-width": 1.1, fill: "none" }, xh);
    var pl = el("pattern", { id: prefix + "-plain", patternUnits: "userSpaceOnUse", width: 8, height: 8 }, defs);
    el("rect", { width: 8, height: 8, fill: tok.e || "#595959", "fill-opacity": 0.18 }, pl);
    el("path", { d: "M0 4 H8", stroke: tok.e || "#595959", "stroke-width": 1.1, fill: "none" }, pl);
  }

  function drawAxisArrow(g, cx, cy, r, deg, style, tok, ink, fam, caption, capShift) {
    function polar(d, rad) {
      return [cx + rad * Math.cos(d * DEG), cy + rad * Math.sin(d * DEG)];
    }
    var isTrue = style === "true";
    var col = isTrue ? ink : tok.a;
    var tip = polar(deg, r - 18), tail = polar(deg + 180, 22);
    el("path", {
      d: "M" + tail[0] + " " + tail[1] + "L" + tip[0] + " " + tip[1],
      stroke: col, "stroke-width": isTrue ? 4 : 5, "stroke-linecap": "round",
      "stroke-dasharray": isTrue ? "7 5" : "none",
      class: isTrue ? "axis-shaft axis-shaft-true" : "axis-shaft",
      "pointer-events": isTrue ? "none" : "none"
    }, g);
    var ah1 = [tip[0] - 16 * Math.cos((deg + 25) * DEG), tip[1] - 16 * Math.sin((deg + 25) * DEG)];
    var ah2 = [tip[0] - 16 * Math.cos((deg - 25) * DEG), tip[1] - 16 * Math.sin((deg - 25) * DEG)];
    el("polygon", {
      points: tip[0] + "," + tip[1] + " " + ah1[0] + "," + ah1[1] + " " + ah2[0] + "," + ah2[1],
      fill: isTrue ? "none" : col, stroke: col, "stroke-width": isTrue ? 2.4 : 1,
      class: isTrue ? "axis-head axis-head-true" : "axis-head"
    }, g);
    if (isTrue) {
      el("rect", {
        x: tip[0] - 13, y: tip[1] - 13, width: 26, height: 26,
        fill: tok.surface, stroke: ink, "stroke-width": 3, "transform": "rotate(45 " + tip[0] + " " + tip[1] + ")",
        class: "axis-handle axis-handle-true"
      }, g);
      el("text", {
        x: tip[0], y: tip[1] + 4, "text-anchor": "middle", fill: ink,
        "font-family": fam, class: "lab-small"
      }, g, "T");
    } else {
      el("circle", {
        cx: tip[0], cy: tip[1], r: 16, fill: tok.surface, stroke: col,
        "stroke-width": 3, class: "axis-handle"
      }, g);
      if (style === "teach") {
        el("text", {
          x: tip[0], y: tip[1] + 5, "text-anchor": "middle", fill: col,
          "font-family": fam, class: "lab-small"
        }, g, "A");
      }
    }
    if (caption) {
      var outward = polar(deg + (capShift || 0), r + 14);
      var fs = 13;
      var tw = caption.length * fs * 0.62 + 10;
      var th = 18;
      var lx = outward[0] - tw / 2;
      var ly = outward[1] - th / 2;
      if (lx < 8) lx = 8;
      if (lx + tw > 492) lx = 492 - tw;
      if (ly < 8) ly = 8;
      if (ly + th > 492) ly = 492 - th;
      el("rect", {
        x: lx, y: ly, width: tw, height: th, rx: 4,
        fill: tok.surface, stroke: col, "stroke-width": 1.6,
        "pointer-events": "none"
      }, g);
      el("text", {
        x: lx + tw / 2, y: ly + th * 0.72, "text-anchor": "middle", fill: col,
        "font-family": fam, "font-size": "13", "font-weight": "800",
        class: "lab-small", "pointer-events": "none"
      }, g, caption);
    }
  }

  function renderAxisWheelOn(svg, opts) {
    if (!svg) return;
    opts = opts || {};
    var tok = T(), ink = cssVar("--ecg-ink") || "#111", fam = fontSans();
    var cx = 250, cy = 250, r = 200;
    var prefix = opts.prefix || "ax";
    var axis = wrapAxis(opts.axis == null ? 60 : opts.axis);
    var highlight = opts.highlight || null;
    svg.setAttribute("viewBox", "0 0 500 500");
    clearSvg(svg);
    var g = el("g", null, svg);
    axisPatterns(svg, prefix);
    el("circle", { cx: cx, cy: cy, r: r, fill: tok.surface, stroke: tok.border || ink, "stroke-width": 1.5 }, g);
    function polar(deg, rad) {
      return [cx + rad * Math.cos(deg * DEG), cy + rad * Math.sin(deg * DEG)];
    }
    function arcPath(a0, a1, rad) {
      var p0 = polar(a0, rad), p1 = polar(a1, rad);
      var dlt = a1 - a0;
      while (dlt < 0) dlt += 360;
      while (dlt >= 360) dlt -= 360;
      var large = dlt > 180 ? 1 : 0;
      return "M" + cx + " " + cy + "L" + p0[0] + " " + p0[1] + "A" + rad + " " + rad + " 0 " + large + " 1 " + p1[0] + " " + p1[1] + "Z";
    }
    var regions = [
      { key: "normal", a0: -30, a1: 90, fill: "url(#" + prefix + "-hatch)", mid: 30, lines: ["Normal", "-30° to +90°"] },
      { key: "rad", a0: 90, a1: 180, fill: "url(#" + prefix + "-cross)", mid: 135, lines: ["RAD", "+90° to 180°"] },
      { key: "extreme", a0: 180, a1: -90, fill: "url(#" + prefix + "-plain)", mid: 225, lines: ["Extreme", "-90° to 180°"] },
      { key: "lad", a0: -90, a1: -30, fill: "url(#" + prefix + "-dots)", mid: -60, lines: ["LAD", "-30° to -90°"] }
    ];
    regions.forEach(function (rg) {
      el("path", {
        d: arcPath(rg.a0, rg.a1, r - 2),
        fill: rg.fill,
        stroke: ink,
        "stroke-width": rg.key === highlight ? 3.4 : 0.8,
        class: rg.key === highlight ? "axis-region is-current" : "axis-region",
        "data-region": rg.key
      }, g);
    });
    function sectorLabel(rg, rad) {
      var pt = polar(rg.mid, rad);
      var grp = el("g", { class: "axis-region-label", "data-region-label": rg.key, "pointer-events": "none" }, g);
      var tg = el("text", {
        x: pt[0], y: pt[1], "text-anchor": "middle", fill: tok.text,
        "font-family": fam, class: "lab-axis-region"
      }, grp);
      rg.lines.forEach(function (ln, i) {
        var dy = (i === 0 ? -((rg.lines.length - 1) * 0.58) : 1.2) + "em";
        el("tspan", { x: pt[0], dy: dy }, tg, ln);
      });
      var bbox = tg.getBBox();
      var padX = 5, padY = 3;
      var rect = el("rect", {
        x: bbox.x - padX,
        y: bbox.y - padY,
        width: bbox.width + padX * 2,
        height: bbox.height + padY * 2,
        rx: 4,
        fill: tok.surface,
        "fill-opacity": 0.94,
        stroke: tok.border || ink,
        "stroke-width": 0.6
      });
      grp.insertBefore(rect, tg);
    }
    regions.forEach(function (rg) {
      sectorLabel(rg, 0.52 * r);
    });
    var leads = [
      { name: "I", deg: 0 },
      { name: "II", deg: 60 },
      { name: "III", deg: 120 },
      { name: "aVR", deg: -150 },
      { name: "aVL", deg: -30 },
      { name: "aVF", deg: 90 }
    ];
    leads.forEach(function (ld) {
      var a = polar(ld.deg, r), b = polar(ld.deg, 22);
      el("path", { d: "M" + b[0] + " " + b[1] + "L" + a[0] + " " + a[1], stroke: ink, "stroke-width": 1.2, "stroke-dasharray": "3 3" }, g);
      var lab = polar(ld.deg, r + 30);
      el("text", {
        x: lab[0], y: lab[1] + 5, "text-anchor": "middle", fill: tok.text,
        "font-family": fam, class: "lab-axis-lead"
      }, g, ld.name);
    });
    var tdeg;
    for (tdeg = -180; tdeg < 180; tdeg += 30) {
      var p0 = polar(tdeg, r - 8), p1 = polar(tdeg, r);
      el("path", { d: "M" + p0[0] + " " + p0[1] + "L" + p1[0] + " " + p1[1], stroke: ink, "stroke-width": 1.4 }, g);
    }
    [{ deg: 0, lab: "0°" }, { deg: 90, lab: "+90°" }, { deg: 180, lab: "180°" }, { deg: -90, lab: "-90°" }].forEach(function (tk) {
      var p = polar(tk.deg, r - 22);
      el("text", { x: p[0], y: p[1] + 4, "text-anchor": "middle", fill: tok.text, "font-family": fam, class: "lab-small" }, g, tk.lab);
    });
    var trueDeg = opts.showTrue && opts.trueAxis != null ? wrapAxis(opts.trueAxis) : null;
    var close = trueDeg != null && axisDelta(axis, trueDeg) < 40;
    var shift = close ? 22 : 0;
    if (trueDeg != null) {
      drawAxisArrow(g, cx, cy, r, trueDeg, "true", tok, ink, fam, "True", shift);
    }
    drawAxisArrow(g, cx, cy, r, axis, opts.teach ? "teach" : "guess", tok, ink, fam, opts.showTrue ? "Yours" : null, -shift);
    el("circle", { cx: cx, cy: cy, r: 5, fill: ink }, g);
    var store = opts.store || "_axisWheel";
    RS[store] = { cx: cx, cy: cy, r: r, svg: svg };
    return RS[store];
  }

  function renderAxisLeadsOn(svg, axisDeg, opts) {
    if (!svg) return;
    opts = opts || {};
    var tok = T(), ink = cssVar("--ecg-ink") || "#111", fam = fontSans();
    var bumps = beatBumps(defaultBeat({ axis: axisDeg, u: false }));
    clearSvg(svg);
    var u = 8, t0 = -0.15, t1 = 1.88, x0 = 96, gw = 25 * u * (t1 - t0);
    var gh = 14 * u, gap = 8, top = 8;
    var scale = axisCommonScale(gh, u);
    var sy = scale.sy, margin = scale.margin;
    var leads = [
      { name: "I", deg: 0 },
      { name: "II", deg: 60 },
      { name: "aVF", deg: 90 }
    ];
    leads.forEach(function (ld, i) {
      ld.gy = top + i * (gh + gap);
    });
    var vbW = x0 + gw + 10, vbH = top + 3 * gh + 2 * gap + 8;
    svg.setAttribute("viewBox", "0 0 " + Math.ceil(vbW) + " " + Math.ceil(vbH));
    var g = el("g", null, svg);
    var fit = [];
    leads.forEach(function (ld) {
      paper(g, x0, ld.gy, gw, gh, u);
      var f = function (tt) { return voltageLead(bumps, tt, 1.0, leadDir(ld.deg)); };
      var mn = 0, mx = 0, tt, v;
      for (tt = t0; tt <= t1 + 1e-12; tt += 0.002) {
        v = f(tt);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      var y0 = ld.gy + gh / 2;
      el("path", {
        d: fnPath(f, t0, t1, x0, y0, 25 * u, sy, 0.002),
        fill: "none", stroke: ink, "stroke-width": 2.2, "stroke-linejoin": "round",
        "data-lead": ld.name
      }, g);
      var sign = leadSign(axisDeg, ld.deg);
      el("text", { x: 6, y: ld.gy + 14, "text-anchor": "start", fill: tok.text, "font-family": fam, class: "lab-int" }, g, ld.name);
      if (opts.showSigns) {
        el("text", { x: 6, y: ld.gy + 30, "text-anchor": "start", fill: tok.muted, "font-family": fam, class: "lab-small", "data-lead-sign": ld.name }, g, sign);
      }
      fit.push({ name: ld.name, gy: ld.gy, gh: gh, y0: y0, sy: sy, min: mn, max: mx, peak: scale.peak, top: ld.gy + margin, bot: ld.gy + gh - margin });
    });
    return fit;
  }

  function renderAxisWheel() {
    var svg = $("axisSvg");
    if (!svg) return;
    renderAxisWheelOn(svg, {
      axis: RS.axis,
      prefix: "ax",
      highlight: axisRegionKey(RS.axis),
      teach: true,
      store: "_axisWheel"
    });
    updateAxisReadout();
    fillAxisLegend();
  }

  function fillAxisLegend() {
    var box = $("axisLegend");
    if (!box) return;
    var current = axisRegionKey(RS.axis);
    var items = [
      { key: "normal", sw: "ax-swatch-normal", name: "Normal", range: "-30° to +90°" },
      { key: "lad", sw: "ax-swatch-lad", name: "Left axis deviation", range: "-30° to -90°" },
      { key: "rad", sw: "ax-swatch-rad", name: "Right axis deviation", range: "+90° to 180°" },
      { key: "extreme", sw: "ax-swatch-extreme", name: "Extreme / northwest", range: "-90° to 180°" }
    ];
    box.innerHTML = items.map(function (it) {
      var cur = it.key === current ? " is-current" : "";
      return "<li class=\"" + it.key + cur + "\"><span class=\"ax-swatch " + it.sw + "\" aria-hidden=\"true\"></span><span><strong>" + it.name + "</strong> <span class=\"axis-legend-range\">" + it.range + "</span></span></li>";
    }).join("");
  }

  function axisCommonScale(gh, u) {
    if (RS._axisScale && RS._axisScale.gh === gh && RS._axisScale.u === u) return RS._axisScale;
    var t0 = -0.15, t1 = 1.88, peak = 0;
    var leadDegs = [0, 60, 90];
    var axis, i, tt, v, bumps, dir;
    for (axis = -180; axis <= 180; axis += 5) {
      bumps = beatBumps(defaultBeat({ axis: axis, u: false }));
      for (i = 0; i < leadDegs.length; i++) {
        dir = leadDir(leadDegs[i]);
        for (tt = t0; tt <= t1 + 1e-12; tt += 0.004) {
          v = Math.abs(voltageLead(bumps, tt, 1.0, dir));
          if (v > peak) peak = v;
        }
      }
    }
    var margin = 1 * u;
    var sy = (gh / 2 - margin) / Math.max(peak, 0.5);
    RS._axisScale = { peak: peak, sy: sy, margin: margin, gh: gh, u: u };
    return RS._axisScale;
  }

  function renderAxisLeads() {
    var svg = $("axisLeadsSvg");
    if (!svg) return;
    RS._leadFit = renderAxisLeadsOn(svg, RS.axis, { showSigns: true });
  }

  function leadFitReport(deg) {
    var prev = RS.axis;
    if (deg != null) setAxis(deg);
    var out = (RS._leadFit || []).map(function (row) {
      var overflow = [];
      /* top/bot already include 1 small-square margin; compare extrema in user units */
      var yTop = row.y0 - row.max * row.sy;
      var yBot = row.y0 - row.min * row.sy;
      if (yTop < row.gy + 0.5) overflow.push("top");
      if (yBot > row.gy + row.gh - 0.5) overflow.push("bottom");
      return { name: row.name, overflow: overflow, yTop: yTop, yBot: yBot, gy: row.gy, gh: row.gh, sy: row.sy, min: row.min, max: row.max, y0: row.y0, peak: row.peak };
    });
    if (deg != null && prev !== RS.axis) { /* already at deg */ }
    return out;
  }

  function updateAxisReadout() {
    var info = axisLabel(RS.axis);
    var sI = leadSign(info.deg, 0), sII = leadSign(info.deg, 60), sAVF = leadSign(info.deg, 90);
    var elr = $("axisReadout"), leadR = $("axisLeadReadout"), live = $("axisLive");
    var shown = (info.deg > 0 ? "+" : "") + Math.round(info.deg) + "°";
    if (elr) elr.textContent = "Axis " + shown + " (" + info.name + ").";
    var q = "Lead I is " + sI + ", lead aVF is " + sAVF + ", and lead II is " + sII + ".";
    if (sI === "positive" && sAVF === "positive") q += " Both I and aVF are positive, so the quadrant is 0° to +90° (normal).";
    else if (sI === "positive" && sAVF === "negative") {
      if (sII !== "negative") q += " Lead I is positive and aVF is negative, but lead II is not negative, so the axis is still in the usual range (about -30° to 0°).";
      else q += " Lead I is positive and both aVF and lead II are negative, so this is left axis deviation (less than -30°).";
    } else if (sI === "negative" && sAVF === "positive") q += " Lead I is negative and aVF is positive, so this is right axis deviation (greater than +90°).";
    else q += " Leads I and aVF are both negative, so this is an extreme (northwest) axis.";
    if (leadR) leadR.textContent = q;
    if (live) live.textContent = "Axis " + shown + ", " + info.name + ". " + q;
    var inp = $("axisDeg");
    if (inp && document.activeElement !== inp) inp.value = String(Math.round(info.deg));
  }

  function setAxis(deg) {
    var d = ((Number(deg) + 180) % 360) - 180;
    if (isNaN(d)) return;
    if (d === -180) d = 180;
    RS.axis = d;
    renderAxisWheel();
    renderAxisLeads();
  }

  function bindAxisWheel() {
    var svg = $("axisSvg");
    if (!svg || svg.dataset.bound) return;
    svg.dataset.bound = "1";
    function degFromEvent(ev) {
      var w = RS._axisWheel;
      if (!w) return RS.axis;
      var loc = svgEventToUser(svg, ev);
      if (!loc) return RS.axis;
      return Math.atan2(loc.y - w.cy, loc.x - w.cx) / DEG;
    }
    svg.addEventListener("pointerdown", function (ev) {
      RS.axisDragging = true;
      try { svg.setPointerCapture(ev.pointerId); } catch (err) {}
      setAxis(degFromEvent(ev));
      ev.preventDefault();
    });
    svg.addEventListener("pointermove", function (ev) {
      if (!RS.axisDragging) return;
      setAxis(degFromEvent(ev));
      ev.preventDefault();
    });
    svg.addEventListener("pointerup", function () { RS.axisDragging = false; });
    svg.addEventListener("pointercancel", function () { RS.axisDragging = false; });
    svg.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") {
        setAxis(RS.axis - (ev.shiftKey ? 5 : 15));
        ev.preventDefault();
      } else if (ev.key === "ArrowRight" || ev.key === "ArrowUp") {
        setAxis(RS.axis + (ev.shiftKey ? 5 : 15));
        ev.preventDefault();
      } else if (ev.key === "Home") { setAxis(60); ev.preventDefault(); }
    });
  }

  function fillAxisControls() {
    var box = $("axisControls");
    if (!box) return;
    box.innerHTML =
      "<button type='button' class='t-btn' data-ax='60'>Normal +60°</button>" +
      "<button type='button' class='t-btn' data-ax='-45'>LAD -45°</button>" +
      "<button type='button' class='t-btn' data-ax='120'>RAD +120°</button>" +
      "<button type='button' class='t-btn' data-ax='-120'>Extreme -120°</button>" +
      "<label for='axisDeg'>Axis (degrees)</label>" +
      "<input id='axisDeg' type='number' min='-180' max='180' step='5' value='" + Math.round(RS.axis) + "'>" +
      "<button type='button' class='t-btn' id='axisMinus' aria-label='Decrease axis by 15 degrees'>-15°</button>" +
      "<button type='button' class='t-btn' id='axisPlus' aria-label='Increase axis by 15 degrees'>+15°</button>";
    box.querySelectorAll("[data-ax]").forEach(function (b) {
      b.addEventListener("click", function () { setAxis(parseFloat(b.getAttribute("data-ax"))); });
    });
    $("axisDeg").addEventListener("change", function () { setAxis($("axisDeg").value); });
    $("axisMinus").addEventListener("click", function () { setAxis(RS.axis - 15); });
    $("axisPlus").addEventListener("click", function () { setAxis(RS.axis + 15); });
  }

  function startAxis(deg) {
    RS.axis = deg != null ? deg : 60;
    fillAxisControls();
    renderAxisWheel();
    renderAxisLeads();
    bindAxisWheel();
  }


  function bindAxisPointer(svg, storeKey, getDeg, setDeg, isLocked) {
    if (!svg || svg.dataset.bound) return;
    svg.dataset.bound = "1";
    var dragFlag = storeKey + "Dragging";
    function degFromEvent(ev) {
      var w = RS[storeKey];
      if (!w) return getDeg();
      var loc = svgEventToUser(svg, ev);
      if (!loc) return getDeg();
      return Math.atan2(loc.y - w.cy, loc.x - w.cx) / DEG;
    }
    svg.addEventListener("pointerdown", function (ev) {
      if (isLocked && isLocked()) return;
      RS[dragFlag] = true;
      try { svg.setPointerCapture(ev.pointerId); } catch (err) {}
      setDeg(degFromEvent(ev));
      ev.preventDefault();
    });
    svg.addEventListener("pointermove", function (ev) {
      if (!RS[dragFlag]) return;
      if (isLocked && isLocked()) return;
      setDeg(degFromEvent(ev));
      ev.preventDefault();
    });
    svg.addEventListener("pointerup", function () { RS[dragFlag] = false; });
    svg.addEventListener("pointercancel", function () { RS[dragFlag] = false; });
    svg.addEventListener("keydown", function (ev) {
      if (isLocked && isLocked()) return;
      var step = ev.shiftKey ? 5 : 15;
      if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") {
        setDeg(getDeg() - step);
        ev.preventDefault();
      } else if (ev.key === "ArrowRight" || ev.key === "ArrowUp") {
        setDeg(getDeg() + step);
        ev.preventDefault();
      }
    });
  }

  function renderAxisPractice() {
    var st = RS.axisPractice;
    if (!st) return;
    var wheel = $("axisPracticeSvg");
    var leads = $("axisPracticeLeadsSvg");
    renderAxisWheelOn(wheel, {
      axis: st.guess,
      trueAxis: st.trueAxis,
      showTrue: !!st.answered,
      prefix: "axp",
      highlight: st.answered ? st.category : null,
      teach: false,
      store: "_axisPracticeWheel"
    });
    renderAxisLeadsOn(leads, st.trueAxis, { showSigns: !!st.answered });
    var elr = $("axisPracticeReadout");
    if (elr) {
      if (st.answered) {
        elr.textContent = "Your estimate: " + formatAxisDeg(st.guess) + ". True axis: " + formatAxisDeg(st.trueAxis) + " (" + axisLabel(st.trueAxis).name + ").";
      } else {
        elr.textContent = "Your estimate: " + formatAxisDeg(st.guess) + ".";
      }
    }
  }

  function fillAxisPracticeControls() {
    var box = $("axisPracticeControls");
    var st = RS.axisPractice;
    if (!box || !st) return;
    var html = "";
    if (!st.answered) {
      html += "<button type='button' class='t-btn' id='axisPMinus' aria-label='Decrease estimate by 15 degrees'>-15°</button>";
      html += "<button type='button' class='t-btn' id='axisPPlus' aria-label='Increase estimate by 15 degrees'>+15°</button>";
      html += actionRow(primaryBtn("axisPCheck", "Check") + secondaryBtn("axisPAnother", "Try another strip"));
    } else {
      html += "<div class='quiz-feedback" + (st.ok ? "" : " is-wrong") + "' id='axisPFeedback'><p><strong>" + esc(st.feedback.head) + "</strong> " + esc(st.feedback.body) + "</p></div>";
      html += actionRow(secondaryBtn("axisPAnother", "Try another strip"));
    }
    box.innerHTML = html;
    if ($("axisPMinus")) $("axisPMinus").addEventListener("click", function () { setAxisPracticeGuess(st.guess - 15); });
    if ($("axisPPlus")) $("axisPPlus").addEventListener("click", function () { setAxisPracticeGuess(st.guess + 15); });
    if ($("axisPCheck")) $("axisPCheck").addEventListener("click", checkAxisPractice);
    if ($("axisPAnother")) $("axisPAnother").addEventListener("click", function () { startAxisPractice(); });
  }

  function setAxisPracticeGuess(deg) {
    var st = RS.axisPractice;
    if (!st || st.answered) return;
    st.guess = wrapAxis(deg);
    renderAxisPractice();
  }

  function axisFeedbackText(trueDeg, guess, ok) {
    var trueInfo = axisLabel(trueDeg);
    var guessInfo = axisLabel(guess);
    var head = ok
      ? ("Correct: " + trueInfo.name + ".")
      : ("Not quite: this is " + trueInfo.name + ", not " + guessInfo.name + ".");
    var body = "The exact axis is " + formatAxisDeg(trueDeg) + "; you set " + formatAxisDeg(guess) + ".";
    body += " " + axisReasoning(trueDeg);
    return { head: head, body: body, text: head + " " + body };
  }

  function checkAxisPractice() {
    var st = RS.axisPractice;
    if (!st || st.answered) return;
    st.ok = axisCategoryCorrect(st.guess, st.trueAxis);
    st.answered = true;
    st.feedback = axisFeedbackText(st.trueAxis, st.guess, st.ok);
    var live = $("axisPracticeLive");
    if (live) live.textContent = st.feedback.text;
    fillAxisPracticeControls();
    renderAxisPractice();
    flashStrip($("axisPracticeLeadsSvg"));
  }

  function startAxisPractice(spec) {
    var another = !spec;
    if (another) {
      RS.axisStrip = (RS.axisStrip || 1) + 1;
    } else {
      RS.axisStrip = 1;
    }
    var c = makeAxisCase(spec || { avoid: RS.lastAxisCat });
    RS.lastAxisCat = c.category;
    RS.axisPractice = {
      trueAxis: c.deg,
      category: c.category,
      isoLead: c.isoLead,
      guess: c.startGuess,
      answered: false,
      ok: false,
      feedback: ""
    };
    setStripLabel("axisStripLabel", RS.axisStrip);
    fillAxisPracticeControls();
    renderAxisPractice();
    bindAxisPointer($("axisPracticeSvg"), "_axisPracticeWheel", function () {
      return RS.axisPractice ? RS.axisPractice.guess : 0;
    }, function (d) { setAxisPracticeGuess(d); }, function () {
      return !!(RS.axisPractice && RS.axisPractice.answered);
    });
    flashStrip($("axisPracticeLeadsSvg"));
  }


  function initRead() {
    startRate({ kind: "regular", largeSq: 4, seed: 1 });
    startRhythm({ kind: "sinus", largeSq: 4, seed: 2 });
    startAxis(60);
    startAxisPractice({ category: "normal", deg: 0 });
  }

  function redrawRead() {
    if (RS.rate) renderRate();
    if (RS.rhythm) renderRhythm();
    renderAxisWheel();
    renderAxisLeads();
    if (RS.axisPractice) renderAxisPractice();
  }


  function redraw() {
    render();
    if (QZ.on && QZ.i < QZ.items.length) drawQuizTrace();
    redrawRead();
  }

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
    },
    waveAtTime: waveAtTime,
    hitAtTime: hitAtTime,
    svgPoint: beatSvgPoint,
    clickAtTime: function (t) {
      var k = waveAtTime(t);
      if (k) clickPart(k);
      return k;
    },
    clickBracket: function (key) { clickPart(key); },
    read: {
      startRate: startRate,
      setRateCalipers: function (a, b) {
        if (!RS.rate) return;
        if (a != null) RS.rate.calA = a;
        if (b != null) RS.rate.calB = b;
        renderRate();
      },
      startRhythm: startRhythm,
      setAxis: setAxis,
      startAxisPractice: startAxisPractice,
      checkAxisPractice: checkAxisPractice,
      setAxisPracticeGuess: setAxisPracticeGuess,
      state: function () {
        return {
          rate: RS.rate ? { kind: RS.rate.kind, rate: RS.rate.rate, largeSq: RS.rate.largeSq, n: RS.rate.times.length, times: RS.rate.times.slice(), marks: RS.rate.marks.slice(), calA: RS.rate.calA, calB: RS.rate.calB, entered: RS.rate.entered } : null,
          rhythm: RS.rhythm ? { kind: RS.rhythm.kind, rate: RS.rhythm.rate, marched: RS.rhythm.marched, regularGuess: RS.rhythm.regularGuess, pGuess: RS.rhythm.pGuess, times: RS.rhythm.times.slice(), calA: RS.rhythm.calA, calB: RS.rhythm.calB } : null,
          axis: RS.axis,
          axisInfo: axisLabel(RS.axis),
          leadI: leadSign(axisLabel(RS.axis).deg, 0),
          leadII: leadSign(axisLabel(RS.axis).deg, 60),
          leadAVF: leadSign(axisLabel(RS.axis).deg, 90),
          practice: RS.axisPractice ? {
            trueAxis: RS.axisPractice.trueAxis,
            guess: RS.axisPractice.guess,
            category: RS.axisPractice.category,
            isoLead: RS.axisPractice.isoLead,
            answered: RS.axisPractice.answered,
            ok: RS.axisPractice.ok,
            strip: RS.axisStrip || 1
          } : null
        };
      },
      markRateAt: function (t) { if (RS.rate) { toggleMark(RS.rate, t); renderRate(); } },
      markRhythmAt: function (t) { if (RS.rhythm) { toggleMark(RS.rhythm, t); renderRhythm(); } },
      ratePoint: function (t) {
        var svg = $("rateSvg"), G = RS._rateG;
        if (!svg || !G) return null;
        var off = svgUserToOffset(svg, stripTtoX(G, t), G.y0 - 6 * G.u);
        if (!off) return null;
        return { x: off.x, y: off.y, t: t, clientX: off.left + off.x, clientY: off.top + off.y };
      },
      caliperPoint: function (which, band) {
        var svg = $("rateSvg"), G = RS._rateG, item = RS.rate;
        if (!svg || !G || !item) return null;
        var t = which === "B" ? item.calB : item.calA;
        var y = band === "head" ? (G.gy - 8) : (G.gy + G.gh * 0.55);
        var off = svgUserToOffset(svg, stripTtoX(G, t), y);
        if (!off) return null;
        return { x: off.x, y: off.y, t: t, clientX: off.left + off.x, clientY: off.top + off.y };
      },
      leadFitReport: leadFitReport,
      formatCaliperSpan: formatCaliperSpan,
      checkRate: checkRate,
      checkRhythm: checkRhythm,
      march: function () { if (RS.rhythm) { RS.rhythm.marched = true; renderRhythm(); } },
      snapRhythm: function () {
        if (RS.rhythm && RS.rhythm.times.length >= 2) {
          RS.rhythm.calA = RS.rhythm.times[0];
          RS.rhythm.calB = RS.rhythm.times[1];
          renderRhythm();
        }
      },
      guessRhythm: function (reg, p) {
        if (!RS.rhythm) return;
        RS.rhythm.regularGuess = reg;
        RS.rhythm.pGuess = p;
      }
    },
    quiz: {
      hitAtTime: function (t, item) {
        item = item || currentItem();
        if (!item) return null;
        return hitAtTime(t, item.beat, item.rr || 1, preferKeyForItem(item));
      },
      svgPoint: function (t, band) {
        var svg = $("quizSvg");
        if (!svg) return null;
        var y = (band === "paper" || !band) ? (QG.gy + QG.gh * 0.55) : (QG.gy + QG.gh * 0.55);
        var off = svgUserToOffset(svg, quizTtoX(t), y);
        return { x: off.x, y: off.y, t: t, clientX: off.left + off.x, clientY: off.top + off.y };
      },
      caliperPoint: function (which, band) {
        var svg = $("quizSvg");
        if (!svg || QZ.calA == null) return null;
        var t = which === "B" ? QZ.calB : QZ.calA;
        var y = band === "head" ? (QG.gy - 8) : (QG.gy + QG.gh * 0.55);
        var off = svgUserToOffset(svg, quizTtoX(t), y);
        if (!off) return null;
        return { x: off.x, y: off.y, t: t, clientX: off.left + off.x, clientY: off.top + off.y };
      },
      hover: function () { return QZ.hover; },
      prefer: function (item) { return preferKeyForItem(item || currentItem()); },
      specToItem: function (it) {
        if (!it) return null;
        if (it.type === "click" && (it.target === "PRi" || it.target === "QT")) return makeCalipers({ measure: it.target });
        if (it.type === "click") return makeClick(it.target);
        if (it.type === "calipers") return makeCalipers(it.measure ? it : null);
        if (it.type === "rate") return makeRate({ kind: it.kind, largeSq: it.largeSq, mean: it.mean, seed: it.seed });
        if (it.type === "spot") return makeSpot(it.abnormality);
        if (it.type === "axis") return makeAxis(it);
        return it;
      },
      open: function (itemOrItems) {
        var list = null;
        if (!itemOrItems) list = null;
        else if (Object.prototype.toString.call(itemOrItems) === "[object Array]") list = itemOrItems;
        else list = [itemOrItems];
        if (list) list = list.map(window.__ecgBasics.quiz.specToItem);
        setTest(true, list);
      },
      openFirst: function (spec) {
        var first = window.__ecgBasics.quiz.specToItem(spec);
        var rest = buildRound().filter(function (it) { return it.type !== first.type; });
        /* Keep 2 of other types, 1 more of this type if available, total 8. */
        var same = buildRound().filter(function (it) { return it.type === first.type; }).slice(0, 1);
        var items = [first].concat(same, rest).slice(0, 8);
        setTest(true, items);
      },
      close: function () { setTest(false); },
      state: quizState,
      click: submitClick,
      check: submitCheck,
      next: nextDrill,
      setCalipers: function (a, b) {
        QZ.calA = clampT(a);
        QZ.calB = clampT(b);
        drawQuizTrace();
      },
      setRate: function (n) {
        QZ.rateInput = String(n);
        var inp = $("quizRate");
        if (inp) inp.value = QZ.rateInput;
      },
      classify: function (v) {
        QZ.classify = v;
        document.querySelectorAll(".quiz-classify .t-btn").forEach(function (x) {
          x.setAttribute("aria-pressed", x.getAttribute("data-class") === v ? "true" : "false");
        });
      },
      move: moveCaliper,
      markAt: function (t) {
        var it = currentItem();
        if (!it || it.type !== "rate") return;
        toggleMark(it, t);
        drawQuizTrace();
      },
      setAxisGuess: setQuizAxisGuess
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    initBeat();
    initQuiz();
    initRead();
    window.addEventListener("themechange", redraw);
    window.addEventListener("resize", redraw);
  });
})();
