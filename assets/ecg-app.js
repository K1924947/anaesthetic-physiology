
/* ===== ECG synthesis engine (synthetic, teaching approximations) ===== */
"use strict";

function shouldRedirectLegacyScenarioLink() {
  if (typeof $ === "function" && $("scnWrap")) return false;
  var h = location.hash || "";
  var s = location.search || "";
  var hl = h.toLowerCase();
  if (hl === "#scn" || hl === "#scenarios" || hl.indexOf("#scenario") === 0) return true;
  if (/[?&](mode=scenario|scenarios=1|scenario=1)(?=&|$)/i.test(s)) return true;
  if (/^#(s\d+|h\d+)(\b|$)/i.test(h)) return true;
  return false;
}
function redirectLegacyScenarioLink() {
  if (shouldRedirectLegacyScenarioLink()) {
    location.replace("Resus_Scenarios" + (location.search || "") + (location.hash || ""));
  }
}
redirectLegacyScenarioLink();
window.addEventListener("hashchange", redirectLegacyScenarioLink);

var FS = 500, DUR = 10, MMS = 25, GAIN = 10, PAD = 8, H = 40, BASE = 23;
var NS = "http://www.w3.org/2000/svg";
var uidN = 0;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeR(seed) {
  var f = mulberry32(seed);
  return {
    f: f,
    u: function (a, b) { return a + (b - a) * f(); },
    i: function (a, b) { return Math.floor(a + (b - a + 1) * f()); },
    pick: function (arr) { return arr[Math.floor(f() * arr.length)]; },
    n: function () { var u = 1 - f(), v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  };
}
function Sig() {
  this.w = []; this.spikes = []; this.cont = []; this.ann = []; this.spans = [];
  this.qrs = []; this.meta = {}; this.leads = null;
}
Sig.prototype.g = function (mu, a, sl, sr) { this.w.push([mu, a, sl, sr === undefined ? sl : sr]); };
Sig.prototype.a = function (t, label) { if (t > 0.15 && t < DUR - 0.15) this.ann.push({ t: t, label: label }); };
Sig.prototype.span = function (t1, t2, label) { if (t1 > 0.1 && t2 < DUR - 0.1) this.spans.push({ t1: t1, t2: t2, label: label }); };
Sig.prototype.spike = function (t, amp) { this.spikes.push({ t: t, a: amp }); };

function qtFor(rr) { return Math.max(0.26, Math.min(0.46, 0.40 * Math.sqrt(rr))); }

/* QRS morphologies in lead II (and V1/V6 for bundle branch block).
   Each returns onset/offset relative to time tR and T-wave settings. */
function qrsMorph(s, type, tR, sc) {
  sc = sc || 1;
  switch (type) {
    case "wpw":
      s.g(tR, 0.5 * sc, 0.042, 0.012); s.g(tR + 0.006, 0.62 * sc, 0.009); s.g(tR + 0.03, -0.16 * sc, 0.009);
      return { on: tR - 0.095, off: tR + 0.048, tA: 0.14, wide: 0.14 };
    case "lbbbII":
      s.g(tR - 0.024, 0.7 * sc, 0.018); s.g(tR + 0.024, 0.8 * sc, 0.019);
      return { on: tR - 0.068, off: tR + 0.07, tA: -0.22, wide: 0.14 };
    case "rbbbII":
      s.g(tR - 0.028, -0.08 * sc, 0.007); s.g(tR, 0.9 * sc, 0.0095); s.g(tR + 0.045, -0.3 * sc, 0.02);
      return { on: tR - 0.042, off: tR + 0.095, tA: 0.22, wide: 0.13 };
    case "veUp":
      s.g(tR, 1.35 * sc, 0.028, 0.04); s.g(tR + 0.085, -0.3 * sc, 0.025);
      return { on: tR - 0.075, off: tR + 0.11, tA: -0.45, wide: 0.16 };
    case "veDown":
      s.g(tR, -1.2 * sc, 0.03, 0.04); s.g(tR - 0.06, 0.18 * sc, 0.014);
      return { on: tR - 0.09, off: tR + 0.1, tA: 0.42, wide: 0.16 };
    case "pacedV":
      s.g(tR - 0.05, 0.12 * sc, 0.012); s.g(tR, -1.05 * sc, 0.03, 0.04);
      return { on: tR - 0.075, off: tR + 0.1, tA: 0.4, wide: 0.16 };
    case "hyperk":
      s.g(tR - 0.03, -0.1 * sc, 0.009); s.g(tR, 1.0 * sc, 0.013); s.g(tR + 0.032, -0.3 * sc, 0.011);
      return { on: tR - 0.055, off: tR + 0.058, tA: 0, wide: 0.11 };
    case "V1lbbb":
      s.g(tR - 0.045, 0.1 * sc, 0.008); s.g(tR + 0.02, -1.4 * sc, 0.032, 0.03);
      return { on: tR - 0.06, off: tR + 0.09, tA: 0.35, wide: 0.14 };
    case "V6lbbb":
      s.g(tR - 0.022, 0.85 * sc, 0.02); s.g(tR + 0.03, 0.95 * sc, 0.019);
      return { on: tR - 0.07, off: tR + 0.075, tA: -0.3, wide: 0.14 };
    case "V1rbbb":
      s.g(tR - 0.035, 0.35 * sc, 0.009); s.g(tR - 0.008, -0.45 * sc, 0.009); s.g(tR + 0.035, 0.85 * sc, 0.014);
      return { on: tR - 0.06, off: tR + 0.07, tA: -0.22, wide: 0.13 };
    case "V6rbbb":
      s.g(tR - 0.035, -0.08 * sc, 0.006); s.g(tR - 0.012, 1.1 * sc, 0.01); s.g(tR + 0.04, -0.38 * sc, 0.022);
      return { on: tR - 0.05, off: tR + 0.09, tA: 0.3, wide: 0.13 };
    case "V1n":
      s.g(tR - 0.012, 0.25 * sc, 0.008); s.g(tR + 0.018, -1.0 * sc, 0.012);
      return { on: tR - 0.035, off: tR + 0.045, tA: 0.1, wide: 0.08 };
    case "V6n":
      s.g(tR - 0.026, -0.1 * sc, 0.006); s.g(tR, 1.4 * sc, 0.01); s.g(tR + 0.026, -0.15 * sc, 0.008);
      return { on: tR - 0.04, off: tR + 0.04, tA: 0.35, wide: 0.08 };
    default: /* narrow */
      s.g(tR - 0.022, -0.11 * sc, 0.007); s.g(tR, 1.15 * sc, 0.0095); s.g(tR + 0.024, -0.27 * sc, 0.008);
      return { on: tR - 0.04, off: tR + 0.04, tA: 0.32, wide: 0.08 };
  }
}

/* Add one ventricular complex with its T wave. opts: type, rr, tAmp, qtExtra, tPeak (hyperK) */
function vBeat(s, tR, o) {
  o = o || {};
  var m = qrsMorph(s, o.type || "n", tR, o.sc);
  var rr = o.rr || 0.8;
  var qt = (o.qt || qtFor(rr)) + (m.wide - 0.08) * 0.8;
  var tp = m.on + qt - 0.085;
  var ta = (o.tAmp !== undefined) ? o.tAmp : m.tA;
  if (o.peaked) { s.g(m.on + qt - 0.11, 0.95, 0.03, 0.028); }
  else if (o.longQT) { s.g(tp, ta * 0.85, 0.09, 0.06); }
  else if (ta) { s.g(tp, ta, Math.abs(ta) > 0.38 ? 0.06 : 0.055, 0.04); }
  s.qrs.push(tR);
  return m;
}
function pWave(s, tc, amp, sig) { s.g(tc, amp === undefined ? 0.15 : amp, sig || 0.022); }

/* Conducted sinus-type beat: P then QRS. Returns QRS morph. */
function sBeat(s, tR, o) {
  o = o || {};
  var m;
  var tmp = new Sig(); var mm = qrsMorph(tmp, o.type || "n", tR, o.sc); /* onset for PR */
  var pc = mm.on - o.pr + 0.05;
  pWave(s, pc, o.pAmp, o.pSig);
  m = vBeat(s, tR, o);
  m.pOn = pc - 0.05;
  return m;
}

/* Continuous baselines */
function afBaseline(R, amp) {
  /* Fibrillatory (f) waves: band-limited irregular activity, about 350 to 600 /min (5.8 to 10 Hz).
     Many components with random frequency, phase and slowly drifting amplitude give an
     irregular baseline with no repeating, P-like deflection and no isoelectric segments. */
  var comps = [];
  for (var k = 0; k < 24; k++) comps.push({ f: R.u(5.8, 10), ph: R.u(0, 6.28), a: R.u(0.3, 1), mf: R.u(0.2, 1.4), mph: R.u(0, 6.28), fm: R.u(0.5, 2), fd: R.u(0.4, 1.2) });
  var norm = 0; comps.forEach(function (c) { norm += c.a * c.a; }); norm = Math.sqrt(norm / 2);
  return function (t) {
    var v = 0;
    for (var i = 0; i < comps.length; i++) { var c = comps[i]; v += c.a * (0.5 + 0.5 * Math.sin(2 * Math.PI * c.mf * t + c.mph)) * Math.sin(2 * Math.PI * (c.f * t + c.fd * Math.sin(c.fm * t)) + c.ph); }
    return amp * 0.45 * v / norm;
  };
}
function flutterWave(cycle, amp, t0) {
  return function (t) {
    var ph = ((t - t0) / cycle) % 1; if (ph < 0) ph += 1;
    /* inverted sawtooth: slow descent then quicker return, smoothed */
    var v = ph < 0.68 ? -ph / 0.68 : -1 + (ph - 0.68) / 0.32;
    return amp * (v + 0.5) * 1.0;
  };
}

/* Render a Sig to an array of [t, mV] points (with pacing spikes). */
function sample(s, R, dur, opt) {
  opt = opt || {};
  dur = dur || DUR;
  var w = s.w.slice().sort(function (a, b) { return a[0] - b[0]; });
  var pts = [], lo = 0;
  var wf = R.u(0.15, 0.3), wph = R.u(0, 6.28), wa = opt.noWander ? 0 : R.u(0.02, 0.05);
  var noise = opt.noise === undefined ? 0.008 : opt.noise;
  var sp = s.spikes.slice().sort(function (a, b) { return a.t - b.t; }), si = 0;
  var n = Math.round(dur * FS);
  for (var k = 0; k <= n; k++) {
    var t = k / FS, v = 0;
    while (lo < w.length && w[lo][0] < t - 0.45) lo++;
    for (var j = lo; j < w.length && w[j][0] < t + 0.45; j++) {
      var c = w[j], x = (t - c[0]) / (t < c[0] ? c[2] : c[3]);
      if (x > -6 && x < 6) v += c[1] * Math.exp(-0.5 * x * x);
    }
    for (var q = 0; q < s.cont.length; q++) v += s.cont[q](t);
    v += wa * Math.sin(2 * Math.PI * wf * t + wph) + noise * R.n();
    while (si < sp.length && sp[si].t <= t) {
      if (sp[si].t > 0) { var vb = pts.length ? pts[pts.length - 1][1] : v; pts.push([sp[si].t, vb]); pts.push([sp[si].t + 0.0005, vb + sp[si].a]); pts.push([sp[si].t + 0.0025, vb]); }
      si++;
    }
    pts.push([t, v]);
  }
  return pts;
}

/* ===== Rhythm generators ===== */
var GEN = {};
function sinusTrain(s, R, rate, o) {
  o = o || {};
  var rr = 60 / rate, t = R.u(0.1, rr), first = null;
  while (t < DUR + 0.6) {
    var jit = rr * (1 + R.u(-0.025, 0.025));
    var m = sBeat(s, t, { pr: o.pr, rr: rr, type: o.type, pAmp: o.pAmp, tAmp: o.tAmp, peaked: o.peaked, qt: o.qt, longQT: o.longQT });
    if (first === null && t > 0.6) first = { t: t, m: m };
    t += jit;
  }
  return first;
}
function rateOf(s) {
  var q = s.qrs.filter(function (t) { return t >= 0 && t <= DUR; }).sort(function (a, b) { return a - b; });
  if (q.length < 2) return { rate: null, n: q.length, irregular: false };
  var rrs = []; for (var i = 1; i < q.length; i++) rrs.push(q[i] - q[i - 1]);
  var mean = rrs.reduce(function (a, b) { return a + b; }, 0) / rrs.length;
  var sd = Math.sqrt(rrs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / rrs.length);
  return { rate: Math.round(60 / mean), n: q.length, irregular: sd / mean > 0.08, minRR: Math.min.apply(null, rrs), maxRR: Math.max.apply(null, rrs) };
}
function markPR(s, f, pr) { if (f) { s.span(f.m.pOn, f.m.on, "PR " + pr.toFixed(2) + " s"); s.span(f.m.on, f.m.off, "QRS " + f.m.wide.toFixed(2) + " s"); } }

GEN.sinus = function (s, R, o) {
  var rate = o.rate || R.u(62, 92), pr = R.u(0.14, 0.18);
  var f = sinusTrain(s, R, rate, o.longQT ? { pr: pr, qt: 0.56, longQT: true, tAmp: 0.34 } : { pr: pr });
  if (f) { s.a(f.m.pOn + 0.05, "P"); s.a(f.t, "QRS"); s.a(f.t + qtFor(60 / rate) - 0.1, "T"); }
  markPR(s, f, pr);
  s.meta = { pr: pr, qrs: 0.08 };
};
GEN.sinus_brady = function (s, R, o) {
  var rate = R.u(o.lo || 36, o.hi || 52), pr = R.u(0.14, 0.19);
  if (o.decel) {
    /* abrupt reflex slowing: rate falls during the strip */
    var t = R.u(0.1, 0.4), r0 = o.r0 || 100, r1 = rate, f = null;
    while (t < DUR + 0.6) {
      var frac = Math.max(0, Math.min(1, (t - 2.5) / 2.5));
      var rr = 60 / (r0 + (r1 - r0) * frac);
      var m = sBeat(s, t, { pr: pr, rr: rr });
      if (frac === 0 && !f && t > 0.5) f = { t: t, m: m };
      if (frac > 0.99 && !s._marked) { s._marked = 1; s.a(t, "Rate now slow"); }
      t += rr;
    }
    s.a(2.6, "Stimulus: rate falls");
    markPR(s, f, pr);
    s.meta = { pr: pr, qrs: 0.08, rateText: "falls from about " + Math.round(r0) + " to about " + Math.round(r1) + " /min during the strip" };
    return;
  } else {
    var f2 = sinusTrain(s, R, rate, { pr: pr });
    if (f2) s.a(f2.m.pOn + 0.05, "P before each QRS");
    markPR(s, f2, pr);
  }
  s.meta = { pr: pr, qrs: 0.08 };
};
GEN.sinus_tachy = function (s, R, o) {
  var rate = R.u(o.lo || 106, o.hi || 135), pr = R.u(0.12, 0.15);
  var f = sinusTrain(s, R, rate, { pr: pr, tAmp: 0.26 });
  if (f) s.a(f.m.pOn + 0.05, "P");
  markPR(s, f, pr);
  s.meta = { pr: pr, qrs: 0.08 };
};
GEN.pea = function (s, R, o) { GEN.sinus(s, R, { rate: R.u(o.lo || 70, o.hi || 110) }); s.ann = [{ t: 1.2, label: "Organised rhythm, but NO PULSE" }]; };
GEN.af = function (s, R, o) {
  var mean = 60 / R.u(o.lo || 100, o.hi || 145);
  s.cont.push(afBaseline(R, 0.09));
  var t = R.u(0.05, 0.4), first = null;
  while (t < DUR + 0.6) {
    var rr = mean * R.u(0.62, 1.38);
    vBeat(s, t, { rr: rr, tAmp: 0.18 });
    if (!first && t > 1) { first = t; }
    t += rr;
  }
  s.a(first + 0.25, "f waves, no P");
  s.meta = { qrs: 0.08, atrialText: "No P waves (f waves)" };
  s.a(first, "Irregular RR");
};
GEN.flutter = function (s, R, o) {
  var cycle = 60 / R.u(285, 315), t0 = R.u(0, cycle);
  s.cont.push(flutterWave(cycle, 0.3, t0));
  var ratios = o.variable ? [2, 4, 3, 2, 4, 2, 3, 4] : [2];
  /* QRS a fixed time after a flutter wave */
  var k = 0, t = t0 + 0.24, i = 0, first = null;
  while (t < DUR + 0.6) {
    var n = o.variable ? R.pick([2, 2, 3, 4, 4]) : 2;
    var rr = n * cycle;
    vBeat(s, t, { rr: rr, tAmp: 0.08 });
    if (!first && t > 1) first = t;
    t += rr; i++;
  }
  s.a(t0 + cycle * Math.ceil((1.3 - t0) / cycle) + cycle * 0.68, "F waves (sawtooth)");
  s.meta = { qrs: 0.08, atrial: Math.round(60 / cycle), block: o.variable ? "variable 2:1 to 4:1" : "2:1" };
};
GEN.svt = function (s, R, o) {
  var rate = R.u(165, 210), rr = 60 / rate, t = R.u(0.05, rr), f = null;
  while (t < DUR + 0.6) { vBeat(s, t, { rr: rr, tAmp: 0.18 }); if (!f && t > 1) f = t; t += rr * (1 + R.u(-0.006, 0.006)); }
  s.a(f, "Regular narrow, no visible P");
  s.meta = { qrs: 0.08 };
};
GEN.vt = function (s, R, o) {
  var rate = R.u(150, 190), rr = 60 / rate, t = R.u(0.05, rr), type = R.pick(["veUp", "veDown"]), f = null;
  while (t < DUR + 0.6) { var m = vBeat(s, t, { rr: rr, type: type }); if (!f && t > 1) f = { t: t, m: m }; t += rr * (1 + R.u(-0.01, 0.01)); }
  s.a(f.t, "Broad, regular, identical");
  s.span(f.m.on, f.m.off, "QRS " + f.m.wide.toFixed(2) + " s");
  s.meta = { qrs: 0.16 };
};
GEN.vf = function (s, R, o) {
  /* Chaotic: many components 3 to 8 Hz (about 180 to 480 /min) with drifting frequency and amplitude,
     so no two deflections repeat and no organised QRS or T can be identified. */
  var comps = [], amp = R.u(0.35, 0.65);
  for (var k = 0; k < 10; k++) comps.push({ f: R.u(3, 8), ph: R.u(0, 6.28), a: R.u(0.3, 1), mf: R.u(0.15, 0.9), mph: R.u(0, 6.28), df: R.u(0.3, 1.5), dd: R.u(0.3, 1.2) });
  var norm = 0; comps.forEach(function (c) { norm += c.a * c.a; }); norm = Math.sqrt(norm / 2);
  s.cont.push(function (t) {
    var v = 0;
    for (var i = 0; i < comps.length; i++) { var c = comps[i]; v += c.a * (0.4 + 0.6 * Math.sin(2 * Math.PI * c.mf * t + c.mph)) * Math.sin(2 * Math.PI * (c.f * t + c.dd * Math.sin(c.df * t)) + c.ph); }
    return amp * 0.6 * v / norm;
  });
  s.a(2, "Chaotic, no P, QRS or T");
  s.meta = { qrs: null };
};
GEN.asystole = function (s, R, o) { s.a(3, "No ventricular activity"); s.meta = { qrs: null }; };
GEN.first_degree = function (s, R, o) {
  var rate = R.u(58, 84), pr = R.u(0.25, 0.34);
  var f = sinusTrain(s, R, rate, { pr: pr });
  markPR(s, f, pr);
  if (f) s.a(f.m.pOn + 0.05, "P");
  s.meta = { pr: pr, qrs: 0.08 };
};
GEN.mobitz1 = function (s, R, o) {
  var pp = 60 / R.u(78, 98), pr0 = R.u(0.15, 0.19), grp = R.pick([3, 4]), incs = [0, 0.1, 0.15, 0.18];
  var tp = R.u(0.0, pp), i = 0, prs = [];
  var prev = null;
  while (tp < DUR + 0.6) {
    var pos = i % grp;
    pWave(s, tp + 0.05, 0.15);
    if (pos < grp - 1) {
      var pr = pr0 + incs[pos];
      var tR = tp + pr + 0.04;
      vBeat(s, tR, { rr: pp, tAmp: 0.28 });
      if (tp > 0.3 && tR < DUR - 0.3) { s.span(tp, tp + pr, "PR " + pr.toFixed(2)); prs.push(pr); }
    } else { s.a(tp + 0.05, "P not conducted"); }
    tp += pp * (1 + R.u(-0.01, 0.01)); i++;
  }
  s.meta = { prText: "lengthens " + pr0.toFixed(2) + " to " + (pr0 + incs[grp - 2]).toFixed(2) + " s, then a dropped beat", qrs: 0.08, atrial: Math.round(60 / pp), cycle: grp + ":" + (grp - 1) };
};
GEN.mobitz2 = function (s, R, o) {
  var pp = 60 / R.u(72, 92), pr = R.u(0.16, 0.2), grp = R.pick([3, 4]), type = R.f() < 0.5 ? "rbbbII" : "n";
  var tp = R.u(0, pp), i = 0, wide = 0.08;
  while (tp < DUR + 0.6) {
    pWave(s, tp + 0.05, 0.15);
    if (i % grp !== grp - 1) {
      var tmp = new Sig(), mm = qrsMorph(tmp, type, 0); var tR = tp + pr - mm.on;
      var m = vBeat(s, tR, { rr: pp, type: type }); wide = m.wide;
      if (i % grp === 0 && tp > 0.3 && tR < DUR - 0.5) s.span(tp, tp + pr, "PR " + pr.toFixed(2));
    } else s.a(tp + 0.05, "P not conducted");
    tp += pp * (1 + R.u(-0.01, 0.01)); i++;
  }
  s.meta = { pr: pr, prText: "constant " + pr.toFixed(2) + " s in conducted beats", qrs: wide, atrial: Math.round(60 / pp), cycle: grp + ":" + (grp - 1) };
};
GEN.chb = function (s, R, o) {
  var broad = o.broad === undefined ? R.f() < 0.6 : o.broad, vr = o.vr || (broad ? R.u(30, 40) : R.u(42, 52)), rr = 60 / vr, ar, ratio, tries = 0;
  /* Keep the atrial rate away from simple multiples of the ventricular rate (2:1, 3:2, 5:2),
     otherwise P waves sit at a near-fixed position and the strip mimics 2:1 AV block. */
  do { ar = R.u(72, 95); ratio = ar / vr; tries++; } while (tries < 50 && (Math.abs(ratio - Math.round(ratio)) < 0.15 || Math.abs(ratio * 2 - Math.round(ratio * 2)) < 0.12));
  var pp = 60 / ar;
  var tp = R.u(0, pp), k = 0;
  while (tp < DUR + 0.6) { pWave(s, tp + 0.05, 0.15); if (k === 1 || k === 4) s.a(tp + 0.05, "P"); tp += pp; k++; }
  var t = R.u(0.3, rr), f = null;
  while (t < DUR + 0.6) { var m = vBeat(s, t, { rr: rr, type: broad ? "veUp" : "n", sc: broad ? 0.85 : 1 }); if (!f && t > 0.5) { f = { t: t, m: m }; } t += rr * (1 + R.u(-0.01, 0.01)); }
  s.a(f.t, broad ? "Broad escape" : "Narrow escape");
  s.meta = { qrs: broad ? 0.16 : 0.08, atrial: Math.round(60 / pp), prText: "varies (no relationship)", escape: broad ? "broad ventricular escape" : "narrow junctional escape" };
};
GEN.ve = function (s, R, o) {
  var rate = R.u(66, 88), rr = 60 / rate, pr = R.u(0.14, 0.18);
  var pattern = o.couplet ? "couplet" : R.pick(["occasional", "occasional", "bigeminy"]);
  var t = R.u(0.2, rr), i = 0, type = R.pick(["veUp", "veDown"]), n = 0, ves = [];
  while (t < DUR + 0.6) {
    var makeVE = pattern === "bigeminy" ? (i % 2 === 1) : (i === 3 || i === 8);
    if (makeVE) {
      var tv = t - rr + rr * R.u(0.5, 0.58);
      /* ectopic replaces this sinus beat: sinus P falls inside it (not conducted) */
      vBeat(s, tv, { rr: rr, type: type }); ves.push(tv);
      if (pattern === "couplet" && i === 3) { var tv2 = tv + rr * 0.55; vBeat(s, tv2, { rr: rr, type: type }); ves.push(tv2); }
    } else sBeat(s, t, { pr: pr, rr: rr });
    t += rr; i++;
  }
  ves.forEach(function (tv, j) { if (j < 2 && pattern !== "couplet") s.a(tv, "VE"); });
  if (pattern === "occasional" && ves.length) s.a(ves[0] + rr * 0.9, "Full compensatory pause");
  if (pattern === "couplet" && ves.length > 1) s.a(ves[0], "Couplet");
  s.meta = { pr: pr, qrs: 0.08, pattern: pattern, veQrs: 0.16 };
};
GEN.torsades = function (s, R, o) {
  var rr = 60 / R.u(54, 62), pr = 0.16, t = R.u(0.3, 0.6);
  for (var i = 0; i < 2; i++) { sBeat(s, t, { pr: pr, rr: rr, qt: 0.6, longQT: true, tAmp: 0.34 }); t += rr; }
  s.span(t - 2 * rr - 0.04, t - 2 * rr - 0.04 + 0.64, "QT about 0.64 s");
  var ts = t - rr + 0.5; /* R on T */
  s.a(ts, "VE on T wave");
  var f = R.u(3.6, 4.3), tw = R.u(2.6, 3.4), ph = R.u(0, 1);
  s.cont.push(function (tt) {
    if (tt < ts) return 0;
    if (o.runLen && tt > ts + o.runLen) return 0;
    var ramp = Math.min(1, (tt - ts) / 0.15) * (o.runLen ? Math.min(1, (ts + o.runLen - tt) / 0.15) : 1);
    var env = Math.cos(2 * Math.PI * ((tt - ts) / tw + 0.03));
    var x = 2 * Math.PI * f * (tt - ts) + ph;
    return ramp * 1.25 * env * (Math.sin(x) + 0.25 * Math.sin(2 * x + 0.6));
  });
  s.a(ts + tw * 0.25 + 0.03, "Twisting point");
  if (o.runLen) { var t2 = ts + o.runLen + 0.9; while (t2 < DUR + 0.6) { sBeat(s, t2, { pr: pr, rr: rr, qt: 0.6, longQT: true, tAmp: 0.34 }); t2 += rr; } }
  s.meta = { qrs: 0.14, prText: "n/a during VT", polyRate: Math.round(f * 60) };
  /* Bug fix: only the 2 sinus beats are in s.qrs, so the generic counter reported about 57 /min and "regular". */
  s.meta.rateText = "about " + s.meta.polyRate + " /min in the polymorphic VT run (after 2 sinus beats)";
};
GEN.wpw = function (s, R, o) {
  var rate = R.u(62, 88), rr = 60 / rate, pr = R.u(0.08, 0.1);
  var f = sinusTrain(s, R, rate, { pr: pr, type: "wpw" });
  if (f) { s.a(f.m.on + 0.03, "Delta wave"); markPR(s, f, pr); }
  s.meta = { pr: pr, qrs: 0.14 };
};
GEN.pre_af = function (s, R, o) {
  s.cont.push(afBaseline(R, 0.08));
  var t = R.u(0.05, 0.3);
  while (t < DUR + 0.6) {
    var w = R.f(), sc = R.u(0.8, 1.5);
    if (w < 0.2) vBeat(s, t, { rr: 0.3, tAmp: 0.15 });
    else { s.g(t, sc * R.pick([1, 1, -0.8]), R.u(0.022, 0.04), R.u(0.02, 0.045)); s.g(t + 0.09, -0.3 * sc, 0.04); s.qrs.push(t); }
    t += R.u(0.2, 0.42);
  }
  s.a(2.2, "Irregular, very fast, varying broad QRS");
  s.meta = { qrs: "0.08 to 0.16 s (varies)", atrialText: "No P waves (f waves)" };
};
GEN.junctional = function (s, R, o) {
  var rate = R.u(o.lo || 42, o.hi || 58), rr = 60 / rate, mode = o.pMode || R.pick(["after", "before", "none"]);
  var t = R.u(0.2, rr), f = null;
  while (t < DUR + 0.6) {
    var m = vBeat(s, t, { rr: rr });
    if (mode === "before") s.g(t - 0.04 - 0.08 + 0.05, -0.12, 0.02);
    if (mode === "after") s.g(t + 0.13, -0.12, 0.018);
    if (!f && t > 0.6) f = { t: t, m: m };
    t += rr * (1 + R.u(-0.01, 0.01));
  }
  if (mode === "before") { s.a(f.t - 0.07, "Inverted P, short PR"); s.span(f.m.on - 0.08, f.m.on, "PR 0.08"); }
  else if (mode === "after") s.a(f.t + 0.13, "Retrograde P after QRS");
  else s.a(f.t, "No P waves, narrow QRS");
  s.meta = { qrs: 0.08, pMode: mode, atrialText: mode === "none" ? "No P waves" : "Retrograde P, same as QRS" };
};
GEN.pace_a = function (s, R, o) {
  var rate = R.pick([60, 70, 80]), rr = 60 / rate, t = R.u(0.3, rr), pr = 0.18, f = null;
  while (t < DUR + 0.6) {
    var m = sBeat(s, t, { pr: pr, rr: rr });
    s.spike(m.pOn - 0.01, 0.9);
    if (!f && t > 0.8) f = { t: t, m: m };
    t += rr;
  }
  s.a(f.m.pOn - 0.01, "Atrial spike then P");
  s.meta = { pr: pr, qrs: 0.08, paced: rate };
};
GEN.pace_v = function (s, R, o) {
  var rate = o.rate || R.pick([60, 70]), rr = 60 / rate, t = R.u(0.3, rr), f = null;
  if (o.pRate) { var pp = 60 / o.pRate, tp = R.u(0, pp); while (tp < DUR + 0.6) { pWave(s, tp, 0.15); tp += pp; } }
  else s.cont.push(afBaseline(R, 0.04));
  while (t < DUR + 0.6) {
    var m = vBeat(s, t, { rr: rr, type: "pacedV" }); s.spike(m.on - 0.004, 1.0);
    if (!f && t > 0.8) f = { t: t, m: m };
    t += rr;
  }
  s.a(f.m.on, "V spike, broad QRS");
  s.meta = { qrs: 0.16, paced: rate, atrialText: o.pRate ? o.pRate + " /min, independent" : "Underlying AF (no P waves)" };
};
GEN.pace_dual = function (s, R, o) {
  var rate = R.pick([60, 70, 75]), rr = 60 / rate, t = R.u(0.4, rr), av = R.pick([0.16, 0.18, 0.2]), f = null;
  while (t < DUR + 0.6) {
    var tmp = new Sig(), mm = qrsMorph(tmp, "pacedV", t);
    var tA = mm.on - av; s.spike(tA, 0.8); pWave(s, tA + 0.06, 0.12);
    var m = vBeat(s, t, { rr: rr, type: "pacedV" }); s.spike(m.on - 0.004, 1.0);
    if (!f && t > 0.8) f = { t: t, a: tA, m: m };
    t += rr;
  }
  s.a(f.a, "A spike"); s.a(f.m.on, "V spike"); s.span(f.a, f.m.on, "AV delay " + av.toFixed(2));
  s.meta = { qrs: 0.16, paced: rate, av: av };
};
GEN.pace_fail = function (s, R, o) {
  var rate = 70, rr = 60 / rate, t = R.u(0.3, 0.6), i = 0, fails = [2, 5, 6], marked = 0;
  while (t < DUR + 0.6) {
    var tmp = new Sig(), mm = qrsMorph(tmp, "pacedV", t);
    s.spike(mm.on - 0.004, 1.0);
    if (fails.indexOf(i) >= 0) { if (marked < 2) { s.a(mm.on, "Spike, no capture"); marked++; } }
    else vBeat(s, t, { rr: rr, type: "pacedV" });
    t += rr; i++;
  }
  s.meta = { qrs: 0.16, paced: rate };
};
GEN.lbbb = function (s, R, o) {
  var rate = R.u(62, 84), pr = R.u(0.15, 0.19);
  var f = sinusTrain(s, R, rate, { pr: pr, type: "lbbbII" });
  markPR(s, f, pr);
  s.leads = { kind: "lbbb", rate: rate, pr: pr };
  s.meta = { pr: pr, qrs: 0.14 };
};
GEN.rbbb = function (s, R, o) {
  var rate = R.u(62, 84), pr = R.u(0.15, 0.19);
  var f = sinusTrain(s, R, rate, { pr: pr, type: "rbbbII" });
  markPR(s, f, pr);
  s.leads = { kind: "rbbb", rate: rate, pr: pr };
  s.meta = { pr: pr, qrs: 0.13 };
};
GEN.hyperk = function (s, R, o) {
  var rate = R.u(68, 90), pr = R.u(0.19, 0.22);
  var f = sinusTrain(s, R, rate, { pr: pr, type: "hyperk", pAmp: 0.07, peaked: true });
  if (f) s.a(f.t + qtFor(60 / rate) - 0.09, "Tall, narrow-based peaked T");
  markPR(s, f, pr);
  s.meta = { pr: pr, qrs: 0.11 };
};

function generate(gen, seed, opts) {
  var R = makeR(seed), s = new Sig();
  GEN[gen](s, R, opts || {});
  s.pts = sample(s, R, DUR, { noise: gen === "asystole" ? 0.006 : 0.008 });
  s.measure = rateOf(s);
  if (s.leads) {
    var mk = function (type) {
      var ls = new Sig(), RR = makeR(seed + 17), rr = 60 / s.leads.rate, t = 0.35;
      while (t < 3.2) { sBeat(ls, t, { pr: s.leads.pr, rr: rr, type: type, pAmp: 0.1 }); t += rr; }
      ls.pts = sample(ls, RR, 3, { noise: 0.006 });
      return ls;
    };
    s.mini = s.leads.kind === "lbbb" ? [["V1", mk("V1lbbb"), "Deep broad S (QS/rS): the W of WiLLiaM"], ["V6", mk("V6lbbb"), "Broad notched R, no septal q: the M of WiLLiaM"]]
                                     : [["V1", mk("V1rbbb"), "RSR' (M shape): the M of MaRRoW"], ["V6", mk("V6rbbb"), "Wide slurred S: the W of MaRRoW"]];
  }
  return s;
}

/* ===== SVG rendering ===== */
function el(tag, attrs, parent) {
  var e = document.createElementNS(NS, tag);
  for (var k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function pathFrom(pts, x0) {
  var d = "";
  for (var i = 0; i < pts.length; i++) {
    var x = x0 + pts[i][0] * MMS, y = BASE - pts[i][1] * GAIN;
    d += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
  }
  return d;
}
function drawStrip(container, s, opts) {
  opts = opts || {};
  var dur = opts.dur || DUR, W = PAD + dur * MMS + 2, id = "g" + (++uidN);
  var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.label || "ECG rhythm strip", preserveAspectRatio: "xMinYMin meet" });
  var defs = el("defs", {}, svg);
  var p1 = el("pattern", { id: id + "m", width: 1, height: 1, patternUnits: "userSpaceOnUse" }, defs);
  el("path", { d: "M1 0 V1 M0 1 H1", stroke: "var(--ecg-minor)", "stroke-width": 0.09, fill: "none" }, p1);
  var p5 = el("pattern", { id: id + "M", width: 5, height: 5, patternUnits: "userSpaceOnUse" }, defs);
  el("rect", { width: 5, height: 5, fill: "url(#" + id + "m)" }, p5);
  el("path", { d: "M5 0 V5 M0 5 H5", stroke: "var(--ecg-major)", "stroke-width": 0.26, fill: "none" }, p5);
  el("rect", { x: 0, y: 0, width: W, height: H, fill: "var(--ecg-paper)" }, svg);
  el("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#" + id + "M)" }, svg);
  /* 1 mV calibration pulse */
  el("path", { class: "ecg-cal", d: "M1 " + BASE + " H2.5 V" + (BASE - 10) + " H7.5 V" + BASE + " H8" }, svg);
  el("path", { class: "ecg-trace", d: pathFrom(s.pts, PAD) }, svg);
  var annG = el("g", { class: "ann-layer", "aria-hidden": "true" }, svg);
  if (!opts.annotate) annG.style.display = "none";
  var lineG = el("g", {}, annG), textG = el("g", {}, annG);
  /* Collision-free placement: each label tries rows 0 to 2 to the right of its marker,
     then to the left; text is drawn after all leader lines so its halo sits on top. */
  var CH = 1.55, GAP = 1.2, ROWS = [4, 8.6, 13.2], placed = [];
  function clash(a, b, row) { return placed.some(function (p) { return p.row === row && !(b + GAP < p.a || a > p.b + GAP); }); }
  s.ann.slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (a) {
    var x = PAD + a.t * MMS, w = a.label.length * CH + 0.6, pick = null;
    for (var side = 0; side < 2 && !pick; side++) {
      for (var r = 0; r < ROWS.length && !pick; r++) {
        var lo = side === 0 ? x - 1 : x - 1.4 - w, hi = side === 0 ? x + 1.4 + w : x + 1;
        if (lo < 0.5 || hi > W - 0.5) continue;
        if (!clash(lo, hi, r)) pick = { row: r, side: side, a: lo, b: hi };
      }
    }
    if (!pick) { var lo2 = Math.max(0.5, Math.min(x - 1, W - 0.5 - w - 2.4)); pick = { row: ROWS.length - 1, side: 0, a: lo2, b: lo2 + w + 2.4, forced: true }; }
    placed.push(pick);
    var y = ROWS[pick.row];
    el("line", { class: "ann-line", x1: x, x2: x, y1: y + 1.6, y2: H - 6 }, lineG);
    el("path", { class: "ann-mark", d: "M" + (x - 1) + " " + (y + 0.6) + " L" + (x + 1) + " " + (y + 0.6) + " L" + x + " " + (y + 2) + " Z" }, lineG);
    var tx = pick.side === 0 ? el("text", { class: "ann-text", x: pick.forced ? pick.a + 2.4 : x + 1.4, y: y + 1.6 }, textG)
                             : el("text", { class: "ann-text", x: x - 1.4, y: y + 1.6, "text-anchor": "end" }, textG);
    tx.textContent = a.label;
  });
  var used = [];
  s.spans.slice(0, 8).forEach(function (sp) {
    var x1 = PAD + sp.t1 * MMS, x2 = PAD + sp.t2 * MMS;
    var lw = sp.label.length * 1.75 + 2, left = x2 + lw > W - 0.5;
    var lo = left ? x1 - lw : x1, hi = left ? x2 : x2 + lw;
    var lvl = 0; while (used.some(function (u) { return u[2] === lvl && !(hi + 1 < u[0] || lo > u[1] + 1); })) lvl++;
    used.push([lo, hi, lvl]);
    var y = H - 2.2 - lvl * 4.6;
    el("path", { class: "span-line", d: "M" + x1 + " " + (y - 1) + " V" + (y + 0.6) + " M" + x1 + " " + y + " H" + x2 + " M" + x2 + " " + (y - 1) + " V" + (y + 0.6) }, lineG);
    var tx = left ? el("text", { class: "ann-text", x: x1 - 1, y: y + 1, "text-anchor": "end" }, textG) : el("text", { class: "ann-text", x: x2 + 1, y: y + 1 }, textG);
    tx.textContent = sp.label;
  });
  svg.__strip = { W: W, dur: dur };
  container.appendChild(svg);
  return svg;
}
function stripBlock(host, s, opts) {
  host.innerHTML = "";
  var wrap = document.createElement("div");
  wrap.className = "strip-scroll"; wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", (opts.label || "Rhythm strip") + " (scrollable)");
  host.appendChild(wrap);
  var svg = drawStrip(wrap, s, opts);
  var hint = document.createElement("p"); hint.className = "scroll-hint"; hint.textContent = "Scroll the strip sideways to see all 10 seconds.";
  host.appendChild(hint);
  if (s.mini) {
    var row = document.createElement("div"); row.className = "mini-row"; host.appendChild(row);
    s.mini.forEach(function (m) {
      var box = document.createElement("div"); row.appendChild(box);
      var lab = document.createElement("p"); lab.className = "mini-label"; lab.textContent = m[0] + " (synthetic, 3 s)" + (opts.annotate ? ": " + m[2] : ""); box.appendChild(lab);
      lab.dataset.full = m[0] + " (synthetic, 3 s): " + m[2]; lab.dataset.short = m[0] + " (synthetic, 3 s)";
      var w2 = document.createElement("div"); w2.className = "strip-scroll mini"; box.appendChild(w2);
      drawStrip(w2, m[1], { dur: 3, label: "Synthetic lead " + m[0] + " strip" + (opts.idSuffix ? " " + opts.idSuffix : "") });
    });
  }
  return svg;
}
function setAnnotations(host, on) {
  host.querySelectorAll(".ann-layer").forEach(function (g) { g.style.display = on ? "" : "none"; });
  host.querySelectorAll(".mini-label").forEach(function (l) { l.textContent = on ? l.dataset.full : l.dataset.short; });
}

/* ===== Calipers ===== */
function Calipers(svg, readout, s) {
  var self = this; this.svg = svg;
  svg.setAttribute("role", "group"); this.readout = readout; this.on = false;
  var q = s.qrs.filter(function (t) { return t > 0.3 && t < DUR - 1.5; }).sort(function (a, b) { return a - b; });
  this.t = q.length >= 2 ? [q[0], q[1]] : [2, 3];
  this.g = el("g", { class: "cal-layer" }, svg); this.g.style.display = "none";
  this.line = []; this.h = [];
  var labels = ["Calliper A", "Calliper B"];
  for (var i = 0; i < 2; i++) {
    this.line.push(el("line", { class: "cal-line", y1: 2, y2: H - 1 }, this.g));
    var hg = el("g", { class: "cal-handle", tabindex: "0", role: "slider", "aria-label": labels[i], "aria-valuemin": "0", "aria-valuemax": String(DUR * 1000) }, this.g);
    el("path", { class: "knob", d: i === 0 ? "M-1.8 0 L1.8 0 L0 3 Z" : "M-1.6 0 H1.6 V3 H-1.6 Z" }, hg);
    el("rect", { x: -3, y: -1, width: 6, height: H, fill: "transparent" }, hg);
    this.h.push(hg);
    (function (idx) {
      hg.addEventListener("keydown", function (e) {
        var step = e.shiftKey ? 0.2 : 0.04, d = 0;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") d = step;
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") d = -step;
        else if (e.key === "Home") { self.t[idx] = 0; self.update(); e.preventDefault(); return; }
        else if (e.key === "End") { self.t[idx] = DUR; self.update(); e.preventDefault(); return; }
        if (d) { self.t[idx] = Math.max(0, Math.min(DUR, self.t[idx] + d)); self.update(); e.preventDefault(); }
      });
    })(i);
  }
  this.bar = el("line", { class: "cal-line", y1: 0.7, y2: 0.7 }, this.g);
  this.text = el("text", { class: "cal-text", y: 3.1 }, this.g);
  var drag = -1;
  function tAt(e) {
    var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    var p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return Math.max(0, Math.min(DUR, (p.x - PAD) / MMS));
  }
  svg.addEventListener("pointerdown", function (e) {
    if (!self.on) return;
    var t = tAt(e);
    drag = Math.abs(t - self.t[0]) <= Math.abs(t - self.t[1]) ? 0 : 1;
    self.t[drag] = t; self.update(); self.h[drag].classList.add("active");
    try { svg.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();
  });
  svg.addEventListener("pointermove", function (e) { if (drag < 0) return; self.t[drag] = tAt(e); self.update(); });
  function end() { if (drag >= 0) self.h[drag].classList.remove("active"); drag = -1; }
  svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
  this.update();
}
Calipers.prototype.update = function () {
  var a = this.t[0], b = this.t[1], x;
  for (var i = 0; i < 2; i++) {
    x = PAD + this.t[i] * MMS;
    this.line[i].setAttribute("x1", x); this.line[i].setAttribute("x2", x);
    this.h[i].setAttribute("transform", "translate(" + x + " 0)");
    this.h[i].setAttribute("aria-valuenow", String(Math.round(this.t[i] * 1000)));
    this.h[i].setAttribute("aria-valuetext", this.t[i].toFixed(2) + " s");
  }
  var x1 = PAD + Math.min(a, b) * MMS, x2 = PAD + Math.max(a, b) * MMS, dt = Math.abs(b - a);
  this.bar.setAttribute("x1", x1); this.bar.setAttribute("x2", x2);
  var msg = dt.toFixed(2) + " s (" + Math.round(dt * 1000) + " ms, " + (dt / 0.04).toFixed(1) + " small squares)" + (dt > 0.2 ? " · if RR: " + Math.round(60 / dt) + " /min" : "");
  this.text.setAttribute("x", Math.min(x2 + 1.5, PAD + DUR * MMS - 60)); this.text.textContent = msg;
  if (this.on && this.readout) this.readout.textContent = "Callipers: " + msg;
};
Calipers.prototype.toggle = function (on) {
  this.on = on; this.g.style.display = on ? "" : "none";
  this.svg.classList.toggle("calipers-on", on);
  if (this.readout) this.readout.textContent = on ? "" : "";
  if (on) this.update();
};
/* ===== Teaching content =====
   Management (one line per rhythm) is labelled with its source via VER in part-ver.js.
   In other lists, a leading "!" tags a drug or management statement. */

var RHYTHMS = {
  sinus: {
    name: "Sinus rhythm", gen: "sinus",
    features: ["Rate 60 to 100 /min, regular", "P wave before every QRS, upright in lead II", "PR 0.12 to 0.20 s (3 to 5 small squares), constant", "QRS under 0.12 s (under 3 small squares)"],
    mechanism: "Impulse starts in the SA node and travels through the atria, AV node and His-Purkinje system.",
    management: ["Normal rhythm: no treatment is needed for the rhythm itself."],
    trap: "Sinus arrhythmia (rate rising on inspiration, falling on expiration) is normal, especially in the young. It is not AF: every QRS still has an identical P wave in front of it.",
    distract: ["first_degree", "junctional", "sinus_brady", "pace_a"]
  },
  sinus_brady: {
    name: "Sinus bradycardia", gen: "sinus_brady",
    features: ["Rate under 60 /min, regular", "Normal P before every QRS, normal PR (0.12 to 0.20 s)", "Narrow QRS"],
    mechanism: "Slower SA node firing from raised vagal tone or reduced automaticity.",
    management: ["Identify and treat reversible causes; if there are life-threatening features, atropine 500 mcg IV, repeated to a maximum of 3 mg."],
    trap: "Treat adverse features, not the number. A resting rate of 45 in a fit athlete is normal; a rate of 50 with a BP of 70/40 is not.",
    distract: ["junctional", "chb", "mobitz1", "first_degree"]
  },
  sinus_tachy: {
    name: "Sinus tachycardia", gen: "sinus_tachy",
    features: ["Rate over 100 /min, regular", "Normal P before every QRS (may merge with the preceding T at high rates)", "Narrow QRS", "Gradual onset and offset; rate varies with stimulus"],
    mechanism: "Increased SA node automaticity from sympathetic drive or catecholamines, or reduced vagal tone. Almost always secondary.",
    management: ["Treat the underlying cause; do not try to normalise the heart rate with antiarrhythmic medication or synchronised cardioversion."],
    trap: "A regular narrow tachycardia at about 150 /min with no clear P waves is atrial flutter with 2:1 block until proven otherwise.",
    distract: ["flutter21", "svt", "af", "sinus"]
  },
  af: {
    name: "Atrial fibrillation", gen: "af",
    features: ["Irregularly irregular RR intervals", "No P waves; fibrillatory (f) baseline", "Atrial activity about 350 to 600 /min; ventricular rate set by AV node conduction (fast AF over 100 /min)", "QRS narrow unless bundle branch block or pre-excitation"],
    mechanism: "Chaotic multiple re-entrant wavelets, often triggered from the pulmonary veins. The AV node conducts irregularly. Loss of the atrial contribution to filling matters most in a stiff ventricle (AS, LVH, HFpEF).",
    management: ["Unstable: synchronised shock, up to 3 attempts (initial shock at maximum output is reasonable). Stable: EF over 40%, control rate with a beta-blocker, verapamil, diltiazem or digoxin; EF under 40%, consider a beta-blocker or digoxin; anticoagulate if the arrhythmia has lasted over 24 h."],
    trap: "Fast AF can look regular at a glance. Run the callipers across several RR intervals. AF with broad, bizarre complexes faster than 200 /min suggests pre-excited AF, where AV node blockers are dangerous.",
    distract: ["flutter_var", "sinus_tachy", "ve", "svt"]
  },
  flutter21: {
    name: "Atrial flutter with 2:1 block", gen: "flutter",
    features: ["Sawtooth flutter (F) waves at about 300 /min, best seen in II, III, aVF and V1", "Regular ventricular rate about 150 /min with 2:1 block (100 with 3:1, 75 with 4:1)", "No isoelectric baseline between F waves", "Narrow QRS; one F wave is often hidden in the QRS or T wave"],
    mechanism: "Macro re-entry circuit in the right atrium around the tricuspid annulus (typical flutter depends on the cavotricuspid isthmus).",
    management: ["Unstable: synchronised shock, initial 70 to 120 J, up to 3 attempts. Stable: regular narrow pathway: vagal manoeuvres, then adenosine, then verapamil or a beta-blocker."],
    trap: "Heart rate stuck at about 150 /min, regular and narrow: think flutter with 2:1 block. Turn the strip upside down or look at the baseline between complexes for the sawtooth.",
    distract: ["sinus_tachy", "svt", "af", "vt"]
  },
  flutter_var: {
    name: "Atrial flutter with variable block", gen: "flutter", genOpts: { variable: true },
    features: ["Sawtooth F waves at about 300 /min", "Variable AV block (2:1, 3:1, 4:1) gives an irregular ventricular rhythm", "RR intervals are multiples of the flutter cycle (about 0.20 s, one large square)", "Narrow QRS"],
    mechanism: "Right atrial macro re-entry with changing AV node conduction ratios.",
    management: ["Unstable: synchronised shock, initial 70 to 120 J. Stable: the algorithm's irregular narrow branch: rate control, and anticoagulate if the arrhythmia has lasted over 24 h."],
    trap: "Mistaken for AF because it is irregular. AF has no organised atrial activity; flutter has a repeating sawtooth with a fixed cycle length.",
    distract: ["af", "flutter21", "mobitz1", "sinus_tachy"]
  },
  svt: {
    name: "SVT (AV nodal re-entrant tachycardia)", gen: "svt",
    features: ["Regular narrow complex tachycardia, usually about 150 to 250 /min (this strip 165 to 210)", "P waves usually hidden in the QRS, or a pseudo r' in V1", "Abrupt onset and offset; rate fixed"],
    mechanism: "Re-entry within the AV node using slow and fast pathways (AVNRT). AVRT uses an accessory pathway instead.",
    management: ["Vagal manoeuvres, then adenosine 6 mg, 12 mg, 18 mg rapid IV (RCUK; the BNF lists 6, 12, 12 mg); synchronised shock if unstable."],
    trap: "SVT versus sinus tachycardia: SVT starts and stops abruptly and does not vary with stimulation or fluid. Never give adenosine for an irregular broad complex tachycardia (possible pre-excited AF).",
    distract: ["sinus_tachy", "flutter21", "vt", "af"]
  },
  vt: {
    name: "Monomorphic ventricular tachycardia", gen: "vt",
    features: ["Three or more consecutive broad complexes (QRS over 0.12 s) faster than 100 /min (this strip 150 to 190)", "Regular, every complex the same shape", "Supporting signs on a 12-lead: AV dissociation, capture and fusion beats, extreme axis, chest lead concordance"],
    mechanism: "Re-entry around ventricular scar (for example old MI) or abnormal automaticity. May degenerate into VF.",
    management: ["No pulse: shockable cardiac arrest. Pulse with life-threatening features: synchronised shock, up to 3 attempts. Stable: treat as VT (synchronised shock, or drugs if sedation or anaesthesia risk is too high)."],
    trap: "Treat any regular broad complex tachycardia as VT unless SVT with aberrant conduction is already known. A normal BP does not exclude VT.",
    distract: ["svt", "torsades", "vf", "lbbb"]
  },
  vf: {
    name: "Ventricular fibrillation", gen: "vf",
    features: ["Chaotic irregular deflections of varying shape and amplitude", "No identifiable P waves, QRS complexes or T waves", "Rate cannot be measured; coarse or fine"],
    mechanism: "Disorganised multiple re-entry in the ventricles. No cardiac output.",
    management: ["Cardiac arrest: CPR and a shock as early as possible; adrenaline 1 mg and amiodarone 300 mg after the 3rd shock."],
    trap: "RCUK 2025: attempt defibrillation for VF of any amplitude, even fine VF. If it looks like fine VF or asystole, check gain and leads.",
    distract: ["torsades", "vt", "asystole", "pre_af"]
  },
  asystole: {
    name: "Asystole", gen: "asystole",
    features: ["No ventricular activity; flat or slowly wandering baseline", "Look carefully for P waves (ventricular standstill)"],
    mechanism: "No electrical activity reaching or arising in the ventricles.",
    management: ["Cardiac arrest: CPR 30:2, adrenaline 1 mg IV as soon as possible, treat reversible causes."],
    trap: "A perfectly straight line suggests a lead off or the gain turned down. Check the leads, increase the gain, look at a second lead and check the patient.",
    distract: ["vf", "pea", "chb", "junctional"]
  },
  pea: {
    name: "Pulseless electrical activity (PEA)", gen: "pea",
    features: ["Organised electrical activity that should produce a pulse (here a sinus-type rhythm)", "No palpable central pulse: the diagnosis is clinical, not from the ECG"],
    mechanism: "Electrical activity without effective mechanical output, or output too low to palpate, usually from a reversible cause.",
    management: ["Cardiac arrest: CPR 30:2, adrenaline 1 mg IV as soon as possible, find and treat the 4 Hs and 4 Ts."],
    trap: "The monitor reading 'sinus rhythm' is not a pulse. Always look at the patient, the arterial line and the capnograph.",
    distract: ["sinus", "asystole", "sinus_tachy", "vf"], optNames: { sinus: "Sinus rhythm (no action needed)" }
  },
  first_degree: {
    name: "First degree AV block", gen: "first_degree",
    features: ["PR over 0.20 s (more than one large square), constant", "Every P wave is conducted", "QRS usually narrow"],
    mechanism: "Slowed conduction, usually through the AV node.",
    management: ["No algorithm step for the rhythm itself: it is not on the risk-of-asystole list. Follow the bradyarrhythmia algorithm only if there are life-threatening features."],
    trap: "Measure from the start of the P wave to the start of the QRS. A very long PR can hide the P wave in the preceding T wave.",
    distract: ["sinus", "mobitz1", "mobitz2", "wpw"]
  },
  mobitz1: {
    name: "Second degree AV block, Mobitz I (Wenckebach)", gen: "mobitz1",
    features: ["PR lengthens beat by beat until a P wave is not conducted", "Cycle repeats (for example 4:3 or 3:2), giving grouped beating", "PR is longest before the dropped beat and shortest after it", "QRS usually narrow"],
    mechanism: "Decremental conduction in the AV node. Usually benign and often vagal.",
    management: ["Bradyarrhythmia algorithm: treat if there are life-threatening features; Mobitz I is not on the risk-of-asystole list, so otherwise observe."],
    trap: "Compare the PR just before and just after the dropped beat. A non-conducted premature atrial ectopic can mimic a dropped beat: look for a P wave that arrives early.",
    distract: ["mobitz2", "first_degree", "chb", "sinus_brady"]
  },
  mobitz2: {
    name: "Second degree AV block, Mobitz II", gen: "mobitz2",
    features: ["PR constant (normal or long) in every conducted beat", "Sudden non-conducted P waves with no warning PR lengthening", "QRS often broad because the disease is below the AV node", "Atrial rate regular"],
    mechanism: "Intermittent conduction failure in the His-Purkinje system (infranodal).",
    management: ["Risk of asystole, even without life-threatening features: monitor, treat the underlying cause and consider transvenous pacing."],
    trap: "2:1 AV block cannot be labelled Mobitz I or II from one strip. A broad QRS points to infranodal (Mobitz II type) disease.",
    distract: ["mobitz1", "chb", "first_degree", "sinus_brady"]
  },
  chb: {
    name: "Complete (third degree) heart block", gen: "chb",
    features: ["Regular P waves and regular QRS complexes with no relationship between them (AV dissociation)", "Atrial rate faster than ventricular rate", "Escape: narrow junctional about 40 to 60 /min, or broad ventricular about 20 to 40 /min", "PR interval varies randomly; P waves 'march through' the QRS and T waves"],
    mechanism: "Complete failure of AV conduction. A pacemaker below the block takes over.",
    management: ["With a broad QRS it is a risk of asystole: seek expert help and consider transvenous pacing, with transcutaneous pacing or an isoprenaline or adrenaline infusion as a bridge. Teaching note: the 2025 Adult ALS guideline says: 'Do not give atropine to patients with high-degree atrioventricular block and wide QRS. It is ineffective and may worsen the block.' In the Resus Scenarios broad-complex complete heart block case, atropine is marked Partly right against that sentence."],
    trap: "Some P waves are hidden inside QRS complexes or T waves. Map the P waves with callipers: the P-P interval stays constant.",
    distract: ["mobitz2", "mobitz1", "junctional", "sinus_brady"]
  },
  ve: {
    name: "Sinus rhythm with ventricular ectopics", gen: "ve",
    features: ["Premature broad (over 0.12 s), bizarre QRS with no preceding P wave", "T wave in the opposite direction to the QRS", "Usually a full compensatory pause: the sinus P wave falls inside the ectopic and is not conducted", "Patterns: isolated, bigeminy, trigeminy, couplets"],
    mechanism: "Ectopic focus in the ventricular myocardium (enhanced automaticity or triggered activity).",
    management: ["No peri-arrest algorithm step for isolated ectopics; assess the patient and identify and treat reversible causes."],
    trap: "R on T (an ectopic landing on the T wave) can trigger VT or VF. An aberrantly conducted atrial ectopic has a P wave in front and usually no full compensatory pause.",
    distract: ["af", "sinus", "vt", "pace_v"]
  },
  torsades: {
    name: "Torsades de pointes", gen: "torsades",
    features: ["Polymorphic VT with the QRS axis twisting around the baseline (spindle shape)", "Rate about 200 to 250 /min", "Long QT on the beats before (QTc over 500 ms carries high risk)", "Often starts with a ventricular ectopic on a T wave, classically after a short-long-short sequence"],
    mechanism: "Early afterdepolarisations during prolonged repolarisation (triggered activity).",
    management: ["Magnesium 8 mmol IV over 10 min; consider isoprenaline or temporary pacing to increase heart rate; avoid amiodarone; treat reversible causes such as low potassium; defibrillate if pulseless."],
    trap: "Not all polymorphic VT is torsades: polymorphic VT with a normal QT is usually ischaemic. Amiodarone prolongs QT, so avoid it in torsades.",
    distract: ["vf", "vt", "pre_af", "flutter21"]
  },
  wpw: {
    name: "Wolff-Parkinson-White pattern (pre-excitation)", gen: "wpw",
    features: ["Short PR under 0.12 s", "Delta wave: slurred upstroke at the start of the QRS", "QRS widened (over 0.11 s) with secondary ST-T changes"],
    mechanism: "An accessory pathway (bundle of Kent) bypasses the AV node and pre-excites part of the ventricle. Risk of AVRT and pre-excited AF.",
    management: ["No algorithm step in sinus rhythm. During a tachycardia, adenosine is only for patients without pre-excitation, and verapamil and digoxin are contraindicated with an accessory pathway."],
    trap: "WPW pattern is the ECG appearance; WPW syndrome is the pattern plus tachyarrhythmias. The delta wave can be mistaken for bundle branch block.",
    distract: ["lbbb", "first_degree", "junctional", "sinus"]
  },
  pre_af: {
    name: "Pre-excited AF (AF with an accessory pathway)", gen: "pre_af",
    features: ["Irregularly irregular", "Very fast: rates can exceed 200 to 250 /min, with very short RR intervals", "Broad QRS complexes of varying width and shape (varying degrees of pre-excitation)"],
    mechanism: "AF impulses conduct down an accessory pathway that lacks the AV node's slowing, so the ventricles can be driven fast enough to degenerate into VF.",
    management: ["Procainamide or cardioversion. Adenosine is only for patients without pre-excitation; verapamil and digoxin are contraindicated with an accessory pathway."],
    trap: "Looks like 'irregular VT' or AF with bundle branch block. The clues are extreme rate, irregularity and QRS width that changes beat to beat.",
    distract: ["af_bbb", "vt", "torsades", "vf"]
  },
  junctional: {
    name: "Junctional rhythm", gen: "junctional",
    features: ["Narrow QRS, regular", "Rate 40 to 60 /min (junctional escape) or 60 to 100 /min (accelerated junctional)", "P waves absent, or inverted in II either just before the QRS (PR under 0.12 s) or just after it (retrograde)"],
    mechanism: "The AV junction takes over as pacemaker when the SA node slows, or junctional automaticity is enhanced.",
    management: ["Identify and treat reversible causes; if slow with life-threatening features, follow the bradyarrhythmia algorithm."],
    trap: "An inverted P with a short PR before the QRS can be mistaken for WPW, but there is no delta wave and the QRS is narrow.",
    distract: ["sinus_brady", "chb", "mobitz1", "pace_a"]
  },
  pace_a: {
    name: "Atrial paced rhythm", gen: "pace_a",
    features: ["Pacing spike before each P wave", "Then a normal PR and narrow QRS", "Fixed rate at the programmed lower rate (this strip 60, 70 or 80 /min)"],
    mechanism: "An atrial lead stimulates the right atrium; AV conduction must be intact (for example in sinus node disease). Mode such as AAI.",
    management: ["No algorithm step while pacing and capture are consistent; assess the patient with ABCDE."],
    trap: "Bipolar pacing spikes can be tiny and monitors may filter them out. Switch on the monitor's pacing detection.",
    distract: ["pace_v", "pace_dual", "sinus", "wpw"]
  },
  pace_v: {
    name: "Ventricular paced rhythm", gen: "pace_v",
    features: ["Pacing spike followed straight away by a broad QRS (LBBB-like with an RV lead; often negative in II)", "T wave opposite to the QRS", "Fixed rate; no relationship to atrial activity (VVI is common in permanent AF)"],
    mechanism: "RV lead pacing: the impulse spreads cell to cell rather than through the conducting system, so the QRS is broad.",
    management: ["No algorithm step while pacing and capture are consistent; assess the patient with ABCDE."],
    trap: "Broad and regular, so easy to call VT. Look for the spikes. ST segments cannot be used to judge ischaemia, as in LBBB.",
    distract: ["pace_dual", "vt", "lbbb", "ve"]
  },
  pace_dual: {
    name: "Dual chamber (AV sequential) paced rhythm", gen: "pace_dual",
    features: ["Atrial spike, P wave, AV delay (this strip 0.16 to 0.20 s), ventricular spike, broad QRS", "Fixed rate when both chambers are paced"],
    mechanism: "A DDD device senses and paces both chambers and can track the atrial rate.",
    management: ["No algorithm step while pacing and capture are consistent; assess the patient with ABCDE."],
    trap: "Two spikes per beat. A DDD device can track an atrial tachyarrhythmia up to its upper rate limit unless it mode switches.",
    distract: ["pace_v", "pace_a", "chb", "vt"]
  },
  pace_fail: {
    name: "Ventricular pacing with failure to capture", gen: "pace_fail",
    features: ["Pacing spikes at the expected time that are not followed by a QRS", "Pauses where capture fails", "Captured beats show a broad paced QRS"],
    mechanism: "The pacing output fails to depolarise the myocardium: lead displacement or fracture, raised capture threshold (hyperkalaemia, acidosis, ischaemia, some drugs) or battery depletion.",
    management: ["Treat as bradycardia using the bradyarrhythmia algorithm, including interim measures and expert help."],
    trap: "Failure to capture (spike, no QRS) is different from failure to sense (spikes firing regardless of the patient's own beats) and from oversensing (no spikes when they are needed).",
    distract: ["pace_v", "pace_sense", "mobitz2", "chb"]
  },
  lbbb: {
    name: "Left bundle branch block", gen: "lbbb",
    features: ["QRS 0.12 s or more", "V1: deep broad QS or rS; V6: broad, notched or monophasic R with no septal q ('WiLLiaM')", "ST-T changes opposite to the QRS (discordant)", "Lead II alone only shows a broad complex: you need V1 and V6"],
    mechanism: "Block in the left bundle: the septum depolarises right to left and the LV is activated late, cell to cell.",
    management: ["No algorithm step for the conduction pattern itself; interpret it with the clinical picture and seek expert advice."],
    trap: "A single limb lead cannot diagnose bundle branch block. ST segments are not reliable for ischaemia in LBBB.",
    distract: ["rbbb", "vt", "wpw", "pace_v"]
  },
  rbbb: {
    name: "Right bundle branch block", gen: "rbbb",
    features: ["QRS 0.12 s or more", "V1: RSR' ('M'); V6 and I: wide slurred S ('MaRRoW')", "Incomplete RBBB: same shape with QRS 0.10 to 0.12 s"],
    mechanism: "Block in the right bundle: the RV is activated late from the LV.",
    management: ["No algorithm step for the conduction pattern itself; interpret it with the clinical picture and seek expert advice."],
    trap: "Lead II only shows a slightly broad QRS with a terminal slurred S. Look at V1 for the RSR'.",
    distract: ["lbbb", "wpw", "sinus", "ve"]
  }
};
var LABEL_ONLY = {
  af_bbb: "AF with bundle branch block", pace_sense: "Ventricular pacing with failure to sense"
};

/* Quiz cases: core and advanced sets. */
var CASES = [
  { id: "c-sinus", r: "sinus", set: "core" },
  { id: "c-brady", r: "sinus_brady", set: "core" },
  { id: "c-tachy", r: "sinus_tachy", set: "core" },
  { id: "c-af", r: "af", set: "core" },
  { id: "c-fl21", r: "flutter21", set: "core" },
  { id: "c-flvar", r: "flutter_var", set: "core" },
  { id: "c-svt", r: "svt", set: "core" },
  { id: "c-vt", r: "vt", set: "core", stem: "Ward patient, 3 days after an MI, palpitations. Radial pulse present, BP 104/68." },
  { id: "c-vf", r: "vf", set: "core", stem: "Patient collapses on the ward; not breathing normally. Pads attached." },
  { id: "c-asys", r: "asystole", set: "core", stem: "Cardiac arrest call. Pads attached, gain checked, leads connected." },
  { id: "c-pea", r: "pea", set: "core", stem: "Ward patient found unresponsive and not breathing normally. No central pulse. Defibrillator shows:" },
  { id: "c-1st", r: "first_degree", set: "core" },
  { id: "c-mob1", r: "mobitz1", set: "core" },
  { id: "c-mob2", r: "mobitz2", set: "core" },
  { id: "c-chb", r: "chb", set: "core", stem: "78-year-old with dizzy spells and a fall." },
  { id: "c-ve", r: "ve", set: "core" },
  { id: "a-tdp", r: "torsades", set: "advanced", stem: "Inpatient on several QT-prolonging drugs, potassium 3.1 mmol/L, sudden syncope." },
  { id: "a-wpw", r: "wpw", set: "advanced", stem: "20-year-old with recurrent palpitations, currently asymptomatic." },
  { id: "a-preaf", r: "pre_af", set: "advanced", stem: "25-year-old with palpitations and light-headedness, known 'extra pathway'." },
  { id: "a-junc", r: "junctional", set: "advanced" },
  { id: "a-pa", r: "pace_a", set: "advanced" },
  { id: "a-pv", r: "pace_v", set: "advanced", stem: "Clinic review: permanent AF, pacemaker fitted years ago." },
  { id: "a-pd", r: "pace_dual", set: "advanced" },
  { id: "a-pfail", r: "pace_fail", set: "advanced", stem: "Pacemaker-dependent patient feels faint; potassium 7.0 mmol/L." },
  { id: "a-lbbb", r: "lbbb", set: "advanced" },
  { id: "a-rbbb", r: "rbbb", set: "advanced" }
];
var SET_LABEL = { core: "Core", advanced: "Advanced" };
/* ===== Source verification (checked live 17 Nov 2026; copies in sources/) =====
   VER[key] = [category, [quote ids], note]. Category: V verified, T physiology (textbook), S simulation simplification. */
var SOURCES = {
  alsG: { name: "RCUK 2025 Adult ALS guideline", url: "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-advanced-life-support-guidelines", file: "rcuk-als-guideline-2025.txt" },
  alsA: { name: "RCUK 2025 Adult ALS algorithm", url: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf", file: "rcuk-als-algorithm-2025.pdf" },
  bradyA: { name: "RCUK 2025 Adult bradyarrhythmia algorithm", url: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20bradyarrhythmia%202025.pdf", file: "rcuk-brady-algorithm-2025.pdf" },
  tachyA: { name: "RCUK Adult tachyarrhythmia algorithm V3 (March 2026)", url: "https://www.resus.org.uk/sites/default/files/2026-03/Adult%20tachyarrhythmia%20algorithm%20V3%20March%202026.pdf", file: "rcuk-tachy-algorithm-v3-mar2026.pdf" },
  bnfAdr: { name: "BNF: adrenaline", url: "https://bnf.nice.org.uk/drugs/adrenaline/", file: "bnf-adrenaline.txt" },
  bnfAmio: { name: "BNF: amiodarone hydrochloride", url: "https://bnf.nice.org.uk/drugs/amiodarone-hydrochloride/", file: "bnf-amiodarone-hydrochloride.txt" },
  bnfAtro: { name: "BNF: atropine sulfate", url: "https://bnf.nice.org.uk/drugs/atropine-sulfate/", file: "bnf-atropine-sulfate.txt" },
  bnfAden: { name: "BNF: adenosine", url: "https://bnf.nice.org.uk/drugs/adenosine/", file: "bnf-adenosine.txt" },
  bnfMg: { name: "BNF: magnesium sulfate", url: "https://bnf.nice.org.uk/drugs/magnesium-sulfate/", file: "bnf-magnesium-sulfate.txt" },
  bnfVera: { name: "BNF: verapamil hydrochloride", url: "https://bnf.nice.org.uk/drugs/verapamil-hydrochloride/", file: "bnf-verapamil-hydrochloride.txt" },
  bnfDig: { name: "BNF: digoxin", url: "https://bnf.nice.org.uk/drugs/digoxin/", file: "bnf-digoxin.txt" },
  bnfLido: { name: "BNF: lidocaine hydrochloride", url: "https://bnf.nice.org.uk/drugs/lidocaine-hydrochloride/", file: "bnf-lidocaine-hydrochloride.txt" },
  specG: { name: "RCUK 2025 Special circumstances guidelines", url: "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/special-circumstances-guidelines", file: "rcuk-special-circumstances-2025.txt" }
};
var VQ = {
  /* ALS guideline */
  gAdrNon: ["alsG", "Give adrenaline 1 mg as soon as possible for adult patients in cardiac arrest with a non-shockable rhythm."],
  gAdrSh: ["alsG", "Give adrenaline 1 mg after the third shock for adult patients in cardiac arrest with a shockable rhythm."],
  gAdrRep: ["alsG", "Repeat adrenaline 1 mg every 3-5 minutes whilst ALS continues."],
  gAmio300: ["alsG", "Give amiodarone 300 mg IV for adult patients in cardiac arrest who are in VF/pVT after a total of three shocks have been given."],
  gAmio150: ["alsG", "Give a further dose of amiodarone 150 mg IV for adult patients in cardiac arrest who are in VF/pVT after a total of five shocks have been given."],
  gSingle: ["alsG", "Use single shocks followed by a 2-minute cycle of chest compressions."],
  gStack: ["alsG", "The use of up to three stacked shocks may be considered only if initial ventricular fibrillation/pulseless ventricular tachycardia (VF/pVT) occurs during a witnessed, monitored cardiac arrest with a defibrillator immediately available"],
  g150: ["alsG", "For biphasic waveforms (rectilinear biphasic or truncated exponential biphasic, but not pulsed biphasic), defibrillation shock energy levels for the first shock should be at least 150 J."],
  gEsc: ["alsG", "If the first shock is not successful and the defibrillator is capable of delivering shocks of higher energy, it is reasonable to increase the energy for subsequent shocks."],
  gAsap: ["alsG", "Give a shock as early as possible when appropriate."],
  gResume: ["alsG", "Immediately resume chest compressions after shock delivery. If there is a combination of clinical and physiological signs of return of spontaneous circulation (ROSC) ... consider stopping chest compressions for rhythm analysis, and if appropriate, a pulse check."],
  gNoDefibCPR: ["alsG", "Do not defibrillate during manual chest compressions (even when wearing clinical gloves), as that practice is not safe to the rescuer."],
  gMinInt: ["alsG", "High-quality chest compressions with minimal interruption and early defibrillation remain priorities."],
  gAP: ["alsG", "After a failed third shock, prepare to place a fresh set of pads in the anterior-posterior position at the time of the following rhythm check."],
  gFluid: ["alsG", "Give fluids during CPR only if cardiac arrest is caused by hypovolaemia. Use either isotonic saline or balanced crystalloids for fluid infusion during CPR."],
  gNoRoutine: ["alsG", "Do not routinely give calcium, sodium bicarbonate or corticosteroids during cardiac arrest."],
  gCardiov: ["alsG", "Electrical cardioversion is the preferred treatment for tachyarrhythmia in the unstable patient displaying potentially life-threatening adverse signs or immediately after ROSC."],
  gSed: ["alsG", "Conscious patients require careful anaesthesia or sedation before attempting synchronised cardioversion"],
  gSyncR: ["alsG", "When cardioverting atrial or ventricular tachyarrhythmias, the shock must be synchronised to occur with the R wave of the ECG."],
  gAFmax: ["alsG", "An initial synchronised shock at maximum defibrillator output, rather than an escalating approach, is a reasonable strategy based on current data."],
  gFlutterJ: ["alsG", "For atrial flutter and paroxysmal supraventricular tachycardia: Give an initial shock of 70-120 J."],
  gVTJ: ["alsG", "For ventricular tachycardia with a pulse: Use energy levels of 120-150 J for the initial shock. Consider stepwise increases in energy if the first shock fails to achieve sinus rhythm."],
  gAtro: ["alsG", "If bradycardia is accompanied by adverse signs, give atropine 500 micrograms IV and, if necessary, repeat every 3–5 min to a total of 3 mg."],
  gSecond: ["alsG", "If treatment with atropine is ineffective, consider second-line drugs. These include isoprenaline (5 micrograms min−1 starting dose), and adrenaline (2–10 micrograms min−1)."],
  gGlucagon: ["alsG", "Consider giving glucagon if beta-blockers or calcium channel blockers are a potential cause of the bradycardia."],
  gWide: ["alsG", "Do not give atropine to patients with high-degree atrioventricular block and wide QRS. It is ineffective and may worsen the block."],
  gTV: ["alsG", "Establish early transvenous pacing in unstable patients with symptomatic bradycardia."],
  gTC: ["alsG", "Consider transthoracic (transcutaneous) pacing as a bridge to transvenous pacing or when transvenous pacing is not readily available."],
  gPwave: ["alsG", "Whenever a diagnosis of asystole is made, check the ECG carefully for the presence of P waves because, unlike true asystole, this is more likely to respond to cardiac pacing."],
  gExpert: ["alsG", "Rescuers should seek expert advice if the arrhythmia and/or life-threatening features persist."],
  /* ALS algorithm */
  aStart: ["alsA", "Unresponsive with absent or abnormal breathing / Call resuscitation team / CPR 30:2 / Attach defibrillator / Assess rhythm"],
  aShock: ["alsA", "SHOCKABLE VF/Pulseless VT: Shock; Immediately resume CPR for 2 min"],
  aNon: ["alsA", "NON-SHOCKABLE PEA/Asystole: Give adrenaline then every 3–5 min; Immediately resume CPR for 2 min"],
  aDrugs: ["alsA", "Give 1st adrenaline after 3 shocks, then every 3–5 minutes. Give amiodarone after 3 shocks."],
  aCauses: ["alsA", "Reversible causes: Hypoxia; Hypovolaemia; Hyper-hypokalaemia, -calcaemia, -magnesaemia, hypoglycaemia (metabolic); Hypo-hyperthermia; Thrombosis (coronary/pulmonary); Tension pneumothorax; Toxins; Tamponade (cardiac). Identify and treat reversible causes early."],
  aMinInt: ["alsA", "Minimise interruptions to chest compressions"],
  aRosc: ["alsA", "Immediately after ROSC: ABCDE assessment; Aim SpO2 94–98% and normal PaCO2; SBP > 100 mmHg; 12-lead ECG; Identify and treat cause; Temperature control"],
  aAP: ["alsA", "Consider: Changing pads to antero-posterior after 3 shocks"],
  /* bradyarrhythmia algorithm */
  bLTF: ["bradyA", "Life threatening features? 1. Shock 2. Syncope 3. Myocardial ischaemia 4. Severe heart failure 5. Immediately post-ROSC. YES: Give atropine 500 mcg IV. Assess response."],
  bInterim: ["bradyA", "UNSATISFACTORY. Interim measures: Atropine 500 mcg IV repeat to maximum of 3 mg; Isoprenaline 5 mcg min-1 IV; Adrenaline 2–10 mcg min-1 IV; Alternative drugs* and/or Transcutaneous pacing. Seek expert help. Monitor, treat underlying cause and consider transvenous pacing."],
  bRisk: ["bradyA", "Risk of asystole? Recent asystole; Mobitz II AV block; Complete heart block with broad QRS; Ventricular pause > 3 s. YES: Monitor, treat underlying cause and consider transvenous pacing. NO: Observe."],
  bABCDE: ["bradyA", "ABCDE assessment; Give oxygen if appropriate and obtain IV access; Monitor ECG, BP, SpO2, record 12-lead ECG; Identify and treat reversible causes e.g. electrolyte abnormalities"],
  /* tachyarrhythmia algorithm V3 */
  tUnstable: ["tachyA", "Life threatening features? 1. Shock 2. Syncope with severe or ongoing hypotension 3. Myocardial ischaemia 4. Severe heart failure with pulmonary oedema 5. Immediately post-ROSC. UNSTABLE: Synchronised shock up to 3 attempts. Consider sedation or anaesthesia if conscious. If unsuccessful: Amiodarone 300 mg IV over 10–20 min, OR procainamide 10–15 mg kg-1 (max 1 g) over 20 min. Repeat synchronised shock."],
  tNarrow: ["tachyA", "Vagal manoeuvres – if ineffective: adenosine (if no pre-excitation) 6 mg rapid IV bolus, if unsuccessful give 12 mg, if unsuccessful give 18 mg – if ineffective: verapamil or beta-blocker – if ineffective: synchronised shock"],
  tAF: ["tachyA", "Probable atrial fibrillation: EF > 40%: control rate with a beta-blocker, verapamil, diltiazem, or digoxin. EF < 40%: consider beta-blocker or digoxin. Anticoagulate if duration of the arrhythmia > 24 h"],
  tBroad: ["tachyA", "BROAD, REGULAR: Treat as VT – synchronised shock(s). If sedation/anaesthesia risk too high consider drug treatments ... Suspected SVT with aberrant conduction: IV adenosine – if ineffective treat as VT"],
  tPoly: ["tachyA", "Polymorphic VT with QT prolongation: Give Mg2+ 8 mmol IV over 10 min; Consider isoprenaline or temporary pacing to increase HR; Avoid amiodarone"],
  tPreAF: ["tachyA", "Atrial fibrillation with pre-excitation: procainamide or cardioversion"],
  tSinus: ["tachyA", "it is not for sinus tachycardia where the underlying cause should be treated; in sinus tachycardia do not try to normalise the heart rate with antiarrhythmic medication or synchronised cardioversion. Seek expert help if the tachyarrhythmia and/or life-threatening features persist."],
  tABCDE: ["tachyA", "ABCDE assessment: Monitor ECG, BP, SpO2, record 12-lead ECG; Give oxygen if SpO2 < 94%; Obtain IV access; Identify and treat reversible causes"],
  /* BNF */
  nAdr: ["bnfAdr", "Cardiopulmonary resuscitation (specialist use only) ... Adult 1 mg every 3–5 minutes as required"],
  nAdrInf: ["bnfAdr", "Control of bradycardia in patients with arrhythmias after myocardial infarction, if there is a risk of asystole, or if the patient is unstable and has failed to respond to atropine ... Adult 2–10 micrograms/minute"],
  nAmio: ["bnfAmio", "Ventricular fibrillation or pulseless ventricular tachycardia refractory to defibrillation ... Adult Initially 300 mg for 1 dose ... then 150 mg for 1 dose ... dose to be given if required"],
  nAtro: ["bnfAtro", "Bradycardia following myocardial infarction (particularly if complicated by hypotension) ... Adult 500 micrograms every 3–5 minutes; maximum 3 mg per course."],
  nAden: ["bnfAden", "Adult Initially 6 mg, administer into central or large peripheral vein and give over 2 seconds, cardiac monitoring required, followed by 12 mg after 1–2 minutes if required, then 12 mg after 1–2 minutes if required"],
  nAdenCI: ["bnfAden", "Contra-indications: ... second- or third-degree AV block and sick sinus syndrome (unless pacemaker fitted)"],
  nMg: ["bnfMg", "Emergency treatment of serious arrhythmias ... Adult 2 g, to be given over 10-15 minutes, dose may be repeated once if necessary. ... Magnesium sulfate heptahydrate 1 g equivalent to Mg2+ approx. 4 mmol."],
  nVera: ["bnfVera", "Contra-indications: ... atrial flutter or fibrillation associated with accessory conducting pathways (e.g. Wolff-Parkinson-White-syndrome)"],
  nDig: ["bnfDig", "Contra-indications: ... supraventricular arrhythmias associated with accessory conducting pathways e.g. Wolff-Parkinson-White syndrome"],
  /* Special circumstances (checked in rcuk-special-circumstances-2025.txt) */
  gHyperkArrest: ["specG", "hyperkalaemic cardiac arrest: administer 10 mL 10% calcium chloride IV and 50 mmol sodium bicarbonate IV, through separate lines or with a flush in between."],
  gDecomp: ["specG", "Early and aggressive management of reversible causes (e.g. haemorrhage control, airway management, chest decompression) is essential for survival."]
};
var VER = {
  /* Learn and Test: one management line per rhythm */
  "r:sinus": ["T", [], "Normal rhythm by definition; no guideline line needed."],
  "r:sinus_brady": ["V", ["bABCDE", "bLTF", "gAtro"]],
  "r:sinus_tachy": ["V", ["tSinus"]],
  "r:af": ["V", ["tUnstable", "gAFmax", "tAF"]],
  "r:flutter21": ["V", ["tUnstable", "gFlutterJ", "tNarrow"]],
  "r:flutter_var": ["V", ["tUnstable", "gFlutterJ", "tAF"], "The algorithm's irregular narrow branch is headed 'probable atrial fibrillation'; applying it to flutter with variable block is an interpretation."],
  "r:svt": ["V", ["tNarrow", "nAden", "tUnstable"]],
  "r:vt": ["V", ["aShock", "tUnstable", "tBroad"]],
  "r:vf": ["V", ["aShock", "aDrugs", "gAsap"]],
  "r:asystole": ["V", ["aStart", "gAdrNon", "aCauses"]],
  "r:pea": ["V", ["aStart", "gAdrNon", "aCauses"]],
  "r:first_degree": ["V", ["bABCDE", "bLTF", "bRisk"], "Verified by absence: first degree block is not on the risk-of-asystole list."],
  "r:mobitz1": ["V", ["bLTF", "bRisk"]],
  "r:mobitz2": ["V", ["bRisk"]],
  "r:chb": ["V", ["bRisk", "gWide"]],
  "r:ve": ["V", ["tABCDE"], "Verified by absence: no peri-arrest algorithm step exists for isolated ectopics."],
  "r:torsades": ["V", ["tPoly", "tABCDE", "aShock"]],
  "r:wpw": ["V", ["tNarrow", "nVera", "nDig"], "Verified by absence for sinus rhythm; adenosine is listed only 'if no pre-excitation'."],
  "r:pre_af": ["V", ["tPreAF", "tNarrow", "nVera", "nDig"]],
  "r:junctional": ["V", ["bABCDE", "bLTF"]],
  "r:pace_a": ["V", ["bABCDE"], "Verified by absence: a stable paced rhythm has no algorithm step."],
  "r:pace_v": ["V", ["bABCDE"], "Verified by absence: a stable paced rhythm has no algorithm step."],
  "r:pace_dual": ["V", ["bABCDE"], "Verified by absence: a stable paced rhythm has no algorithm step."],
  "r:pace_fail": ["V", ["bLTF", "bInterim"]],
  "r:lbbb": ["V", ["gExpert"], "Verified by absence: no algorithm step for a conduction pattern."],
  "r:rbbb": ["V", ["gExpert"], "Verified by absence: no algorithm step for a conduction pattern."],
  /* Scenarios: shared arrest texts */
  a_atro: ["V", ["aDrugs", "aNon"], "Verified by absence: atropine is not in the 2025 ALS algorithm."],
  a_aden: ["V", ["tNarrow", "tBroad"]],
  a_vagal: ["V", ["tNarrow"]],
  a_sync: ["V", ["aShock", "gSyncR"]],
  a_pace: ["V", ["gPwave", "bInterim"]],
  a_mg: ["V", ["aDrugs", "tPoly"]],
  a_bicarb: ["V", ["gNoRoutine"]],
  a_calcium: ["V", ["gNoRoutine"]],
  a_fluid: ["V", ["gFluid"]],
  a_observe: ["V", ["aStart"]],
  a_expert: ["V", ["aStart"]],
  a_causes: ["V", ["aCauses"]],
  a_amio150: ["V", ["gAmio150"]],
  a_amio300: ["V", ["gAmio300", "aNon"]],
  a_interrupt: ["V", ["aMinInt", "gResume"]],
  a_handsOff: ["V", ["gMinInt"]],
  a_shockMid: ["V", ["gNoDefibCPR", "aShock"]],
  a_charge: ["V", ["gNoDefibCPR", "gMinInt"]],
  a_chargeCpr: ["V", ["gNoDefibCPR", "gMinInt"]],
  a_clear: ["V", ["gNoDefibCPR", "gResume"]],
  a_shockNoSeq: ["V", ["gNoDefibCPR", "gMinInt", "gResume"]],
  a_chargePulse: ["V", ["gSyncR", "aShock"]],
  a_clearPulse: ["V", ["gSyncR", "aShock"]],
  a_shockTwice: ["V", ["aShock", "gStack"]],
  a_resumeFirst: ["V", ["gResume"]],
  a_adrSoon: ["V", ["gAdrRep", "nAdr"]],
  p_cpr: ["V", ["aStart"]],
  p_shock: ["V", ["gSyncR"]],
  p_adr: ["V", ["gSecond", "bInterim", "nAdrInf"]],
  p_amio: ["V", ["tUnstable", "aDrugs"]],
  p_atro: ["V", ["bLTF"]],
  p_aden: ["V", ["tNarrow", "tBroad"]],
  p_vagal: ["V", ["tNarrow"]],
  p_sync: ["V", ["tUnstable", "tNarrow"]],
  p_pace: ["V", ["bInterim"]],
  p_mg: ["V", ["tPoly"]],
  p_fluid: ["V", ["tABCDE", "bABCDE"], "Verified by absence."],
  p_bicarb: ["V", ["tABCDE", "bABCDE"], "Verified by absence."],
  p_calcium: ["V", ["tABCDE", "bABCDE"], "Verified by absence."],
  p_observe: ["V", ["tUnstable", "bLTF"]],
  p_expert: ["V", ["gExpert"]],
  p_causes: ["V", ["tABCDE"]],
  p_amio150: ["V", ["gAmio150"]],
  /* Scenario 1 */
  s1_assess: ["V", ["aShock", "gAsap"]],
  s1_cprFirst: ["V", ["gAsap", "aShock"]],
  s1_shock1: ["V", ["g150", "aShock"]],
  s1_shockN: ["V", ["gEsc", "aShock"]],
  s1_shock3: ["V", ["aDrugs", "gAP"]],
  s1_cpr: ["V", ["gResume", "aMinInt"]],
  s1_check: ["S", ["aShock"], "VF persisting at this check is scripted."],
  s1_checkNoDrugs: ["S", ["aDrugs"], "In the simulation VF only converts after shock 3 plus both drugs; real conversion is unpredictable."],
  s1_checkOrganised: ["S", ["gResume"], "Timing of the organised rhythm is scripted."],
  s1_adrEarly: ["V", ["gAdrSh"]],
  s1_adr: ["V", ["gAdrSh", "gAdrRep", "nAdr"]],
  s1_adrRepeat: ["V", ["gAdrRep"]],
  s1_amioEarly: ["V", ["gAmio300"]],
  s1_amio: ["V", ["gAmio300", "gAmio150", "nAmio"]],
  s1_amioTwice: ["V", ["gAmio150"]],
  s1_amio150: ["V", ["gAmio150", "nAmio"], "This further dose is in the 2025 Adult ALS guideline, not on the algorithm poster."],
  s1_rosc: ["S", ["aRosc"], "ROSC at this point is scripted; the post-ROSC steps are verified."],
  s1_roscCPR: ["V", ["gResume"]],
  s1_roscShock: ["V", ["aShock", "gResume"]],
  /* Scenario 2 */
  s2_assess: ["V", ["aNon", "gAdrNon", "aCauses"]],
  s2_cpr: ["V", ["aStart", "aNon"]],
  s2_shock: ["V", ["aNon"]],
  s2_adr: ["V", ["gAdrNon", "gAdrRep", "nAdr"]],
  s2_adrRepeat: ["V", ["gAdrRep"]],
  s2_adrSoon: ["V", ["gAdrRep"]],
  s2_causes: ["V", ["aCauses", "gFluid"]],
  s2_fluid: ["V", ["gFluid"]],
  s2_fluidEarly: ["S", ["aCauses"], "Scoring choice: fluid before naming the cause scores as partly right."],
  s2_expert: ["S", ["aCauses"], "Scenario-specific step (surgical control of bleeding); not an algorithm line."],
  s2_check: ["S", ["aNon"], "Persisting PEA at this check is scripted."],
  s2_checkAsys: ["S", ["aNon", "gAdrRep"], "Deterioration to asystole after two cycles without fluid is scripted."],
  s2_checkOrganised: ["S", ["gResume"], "ROSC only after adrenaline plus fluid is scripted."],
  s2_rosc: ["S", ["aRosc"], "ROSC at this point is scripted; post-ROSC ABCDE is verified."],
  /* Scenario 3 */
  s3_assess: ["V", ["bLTF"]],
  s3_atro1: ["S", ["bLTF"], "No response to atropine is scripted (narrow-complex CHB may respond in practice)."],
  s3_atroRepeat: ["V", ["gAtro", "bInterim", "nAtro"]],
  s3_atroMax: ["V", ["gAtro", "nAtro"]],
  s3_atroPaced: ["V", ["bInterim"]],
  s3_paceEarly: ["V", ["bLTF", "bInterim", "gTC"]],
  s3_adrInf: ["V", ["gSecond", "bInterim", "nAdrInf"]],
  s3_iso: ["V", ["bInterim"]],
  s3_pace: ["S", ["bInterim", "gTC"], "Immediate capture and BP rise are scripted."],
  s3_paceLateAfterAtropine: ["V", ["bInterim", "gTC"]],
  s3_atroSoon: ["V", ["gAtro", "nAtro"]],
  s3_atroLate: ["V", ["gAtro", "nAtro"]],
  s3_expert: ["V", ["bInterim", "gTV"]],
  s3_causes: ["V", ["bABCDE", "gGlucagon"]],
  s3_adr: ["V", ["gSecond", "bInterim", "nAdrInf"]],
  s3_aden: ["V", ["nAdenCI"]],
  s3_observe: ["V", ["bLTF", "bRisk"]],
  s3_widePoint: ["V", ["bInterim", "bRisk", "gWide"], "This narrow-complex case still marks atropine as first-line. The broad-complex complete heart block case marks atropine as Partly right against the ALS guideline caution."],
  s3_atroNuance: ["V", ["gAtro", "bLTF", "bInterim"]],
  h8_atro1: ["V", ["gWide", "bRisk"], "Atropine in broad-complex complete heart block is marked Partly right against the 2025 Adult ALS guideline."],
  h8_atroRepeat: ["V", ["gWide"], "Repeat atropine in this broad-complex complete heart block case remains Partly right."],
  h8_guideNote: ["V", ["gWide", "bRisk"], "Atropine in broad-complex complete heart block is marked Partly right against the 2025 Adult ALS guideline."],
  h3_amio150Note: ["V", ["gAmio300", "gAmio150"], "The algorithm poster says amiodarone after 3 shocks; 150 mg after five shocks is guideline text only."],
  /* Scenario 4 */
  s4_assess: ["V", ["tNarrow"]],
  s4_vagal: ["S", ["tNarrow"], "Failure of vagal manoeuvres is scripted."],
  s4_vagalAgain: ["V", ["tNarrow"]],
  s4_adenEarly: ["S", ["tNarrow"], "Scoring choice: adenosine before vagal manoeuvres scores as partly right."],
  s4_aden6: ["S", ["tNarrow", "nAden"], "Failure of the 6 mg dose is scripted."],
  s4_aden12: ["S", ["tNarrow", "nAden", "tABCDE"], "Conversion on 12 mg is scripted."],
  s4_sync: ["V", ["tNarrow", "tUnstable"]],
  s4_amio: ["V", ["tNarrow"]],
  s4_observe: ["V", ["tNarrow"]],
  /* Scenario 5 */
  s5_assess: ["V", ["tUnstable", "tBroad"]],
  s5_expert: ["V", ["gSed", "tUnstable"]],
  s5_noSed: ["V", ["gSed"]],
  s5_sync1: ["S", ["gVTJ", "tUnstable"], "Failure of the first shock is scripted."],
  s5_sync2: ["S", ["tUnstable", "tABCDE", "tSinus"], "Conversion on the second shock is scripted."],
  s5_unsync: ["S", ["gSyncR", "aShock"], "VF after an unsynchronised shock is a scripted consequence to teach synchronisation; it does not happen every time."],
  s5_arrestShock: ["S", ["aShock"], "Immediate ROSC after one shock is scripted."],
  s5_arrestCPR: ["V", ["gAsap", "gStack"]],
  s5_amio: ["V", ["gCardiov", "tUnstable"]],
  s5_aden: ["V", ["tBroad", "tUnstable"]],
  s5_mg: ["V", ["tPoly"]],
  /* Scenario 6 */
  s6_assess: ["V", ["tPoly"]],
  s6_mg: ["S", ["tPoly", "nMg"], "Runs stopping after one dose is scripted."],
  s6_mgAgain: ["V", ["nMg"]],
  s6_causes: ["V", ["tABCDE", "aCauses"], "Low potassium is a listed reversible cause; stopping QT-prolonging drugs is the scenario application of 'identify and treat reversible causes'."],
  s6_amio: ["S", ["tPoly"], "Loss of pulse after amiodarone is a scripted consequence."],
  s6_pace: ["V", ["tPoly"]],
  s6_paceAgain: ["V", ["tPoly"]],
  s6_iso: ["V", ["tPoly"]],
  s6_isoAgain: ["V", ["tPoly"]],
  s6_sync: ["V", ["tPoly", "tUnstable"]],
  s6_arrestShock: ["S", ["aShock"], "Immediate ROSC after one shock is scripted."],
  s6_arrestCPR: ["V", ["gAsap"]],
  /* Debrief key steps */
  "req:s1:0": ["V", ["gAsap"]], "req:s1:1": ["V", ["gResume"]], "req:s1:2": ["V", ["gAdrSh"]], "req:s1:3": ["V", ["gAmio300"]],
  "req:s2:0": ["V", ["aStart"]], "req:s2:1": ["V", ["gAdrNon"]], "req:s2:2": ["V", ["aCauses"]], "req:s2:3": ["V", ["gFluid"]],
  "req:s3:0": ["V", ["bLTF"]], "req:s3:1": ["V", ["bInterim", "gTC"]], "req:s3:2": ["V", ["bInterim", "gTV"]],
  "req:s4:0": ["V", ["tNarrow"]], "req:s4:1": ["V", ["tNarrow", "nAden"]],
  "req:s5:0": ["V", ["gSed"]], "req:s5:1": ["V", ["tUnstable"]],
  "req:s6:0": ["V", ["tPoly", "nMg"]], "req:s6:1": ["V", ["tABCDE", "aCauses"]],
  "req:h1:0": ["V", ["aStart"]], "req:h1:1": ["V", ["gAdrNon"]], "req:h1:2": ["V", ["aCauses"]], "req:h1:3": ["V", ["gHyperkArrest"]],
  "req:h2:0": ["V", ["aStart"]], "req:h2:1": ["V", ["gAdrNon"]], "req:h2:2": ["V", ["aCauses"]], "req:h2:3": ["V", ["gDecomp"]],
  "req:h3:0": ["V", ["gAsap"]], "req:h3:1": ["V", ["gResume"]], "req:h3:2": ["V", ["gAdrSh"]], "req:h3:3": ["V", ["gAmio300"]],
  "req:h4:0": ["V", ["gAsap"]], "req:h4:1": ["V", ["gResume"]], "req:h4:2": ["V", ["gAdrNon"]],
  "req:h5:0": ["V", ["tNarrow"]], "req:h5:1": ["V", ["tNarrow", "nAden"]],
  "req:h6:0": ["V", ["gSed"]], "req:h6:1": ["V", ["tUnstable", "gCardiov"]],
  "req:h7:0": ["V", ["tBroad", "tUnstable"]],
  "req:h8:0": ["V", ["bRisk", "gTV"]], "req:h8:1": ["V", ["bInterim", "gTC"]],
  "req:h9:0": ["V", ["gAsap", "aShock"]], "req:h9:1": ["V", ["gResume"]], "req:h9:2": ["V", ["tPoly", "nMg"]],
  "req:h10:0": ["V", ["gSed"]], "req:h10:1": ["V", ["gCardiov", "gVTJ", "tUnstable"]]
};
var CAT_LABEL = { V: "Source", T: "Physiology", S: "Simulation simplification" };
function srcIds(key) { var v = VER[key], seen = []; if (!v) return seen; v[1].forEach(function (q) { var s = VQ[q][0]; if (seen.indexOf(s) < 0) seen.push(s); }); return seen; }
/* Inline tag: category word plus short source names (links to the source list on this page) */
function verTag(key) {
  var v = VER[key]; if (!v) return "";
  var links = srcIds(key).map(function (s) { return "<a href='" + SOURCES[s].url + "' target='_blank' rel='noopener'>" + esc(SOURCES[s].name) + "</a>"; }).join("; ");
  var cls = v[0] === "V" ? "tag-src" : v[0] === "T" ? "tag-phys" : "tag-sim";
  return " <span class='vtag " + cls + "'><span class='vtag-k'>" + CAT_LABEL[v[0]] + (links ? ":" : "") + "</span>" + (links ? " " + links : "") + "</span>";
}
function verQuotes(key) {
  var v = VER[key]; if (!v) return "";
  return v[1].map(function (q) { return "<span class='vq'><strong>" + esc(SOURCES[VQ[q][0]].name) + ":</strong> \u201C" + esc(VQ[q][1]) + "\u201D</span>"; }).join("") + (v[2] ? "<span class='vq vq-note'><strong>Note:</strong> " + esc(v[2]) + "</span>" : "");
}
/* ===== Electrophysiology content and conduction diagrams =====
   Standard teaching (Hampton; Guyton and Hall; Levick; Power and Kam).
   Diagram is schematic: positions are not to scale. */
var EP_AP = {
  nodal: "Action potential link: SA and AV nodal cells have no stable resting potential. Phase 4 drifts upwards (funny current If through HCN channels, then T-type Ca2+), and the upstroke is carried by slow L-type Ca2+ current rather than fast Na+ current.",
  avnode: "Action potential link: AV nodal cells use slow, Ca2+-dependent upstrokes and recover excitability slowly, so conduction through the node is slow and slows further when impulses arrive early (decremental conduction).",
  myocyte: "Action potential link: atrial and ventricular myocytes and Purkinje fibres have fast Na+-dependent upstrokes (phase 0), a Ca2+ plateau (phase 2) and K+ repolarisation (phase 3). The QRS reflects ventricular phase 0, the ST segment the plateau and the T wave phase 3."
};
var EP = {
  sinus: { points: [
      "Origin: the SA node at the junction of the superior vena cava and right atrium, the fastest intrinsic pacemaker (about 60 to 100 /min at rest).",
      "Pathway: atrial myocardium (P wave), then the AV node, where conduction is slow; Guyton and Hall give a total delay of about 0.13 s in the AV node and penetrating bundle. This delay is most of the PR interval and lets the atria finish emptying.",
      "Then the His bundle, right and left bundle branches and Purkinje fibres conduct fast (Guyton and Hall: about 1.5 to 4 m/s), so both ventricles depolarise almost together: a narrow QRS.",
      "The fibrous AV ring insulates atria from ventricles, so the AV node and His bundle are normally the only route."
    ], ap: "nodal", d: { origin: [["SA", "Origin"]], active: ["sa_av", "sa_la", "his", "rbb", "lbb"] } },
  sinus_brady: { points: [
      "Origin and pathway are normal (SA node, AV node, His-Purkinje), so P, PR and QRS look normal; only the rate is slow.",
      "Vagal acetylcholine opens K+ channels (IK,ACh) and reduces If, so nodal cells start more negative and the phase 4 slope is flatter: it takes longer to reach threshold.",
      "Reduced automaticity (sinus node disease, hypothermia, hypothyroidism, beta-blockade) has the same end result."
    ], ap: "nodal", d: { origin: [["SA", "Slow SA firing"]], active: ["sa_av", "sa_la", "his", "rbb", "lbb"] } },
  sinus_tachy: { points: [
      "Origin and pathway are normal; the SA node simply fires faster.",
      "Sympathetic noradrenaline acting on beta-1 receptors increases If and L-type Ca2+ current, steepening phase 4 so threshold is reached sooner. Vagal withdrawal adds to this.",
      "At high rates diastole shortens most, so the P wave can merge into the preceding T wave."
    ], ap: "nodal", d: { origin: [["SA", "Fast SA firing"]], active: ["sa_av", "sa_la", "his", "rbb", "lbb"] } },
  af: { points: [
      "Origin: multiple wandering re-entrant wavelets in the atria, often triggered by ectopic foci in the pulmonary veins. Atrial activity is about 350 to 600 /min and disorganised, so there is no P wave, only a fibrillatory baseline.",
      "Pathway: the AV node receives far more impulses than it can conduct. Many arrive while it is still refractory and are blocked or only partly penetrate it (concealed conduction), so the ventricular response is irregularly irregular.",
      "Below the AV node conduction is normal (His-Purkinje), so the QRS is narrow unless there is bundle branch block or an accessory pathway."
    ], ap: "avnode", d: { wavelets: "atria", waveLabel: "Multiple atrial wavelets", inactive: ["sa_av", "sa_la"], avNote: "AV node filters irregularly", active: ["his", "rbb", "lbb"], saLabel: "SA node overridden" } },
  flutter21: { points: [
      "Origin: a single large (macro) re-entry circuit in the right atrium, typically running around the tricuspid annulus through the cavotricuspid isthmus. One lap takes about 0.2 s, giving atrial activity at about 300 /min.",
      "The atria are activated continuously around the circuit, so the baseline never returns to isoelectric: the sawtooth F waves, negative in II, III and aVF in typical flutter.",
      "Pathway: the AV node's refractory period stops it conducting every impulse. Commonly every second one conducts (2:1), giving a ventricular rate of about 150 /min with normal His-Purkinje conduction and a narrow QRS."
    ], ap: "avnode", d: { loop: "ra", loopLabel: "Re-entry circuit (RA)", inactive: ["sa_av", "sa_la"], avNote: "2:1 conduction", active: ["his", "rbb", "lbb"], saLabel: "SA node overridden" } },
  flutter_var: { points: [
      "Origin: the same right atrial macro re-entry circuit as typical flutter, about 300 /min.",
      "Pathway: the AV node conducts in changing ratios (2:1, 3:1, 4:1) as its refractoriness varies, so RR intervals jump between whole multiples of the flutter cycle.",
      "Below the AV node conduction is normal, so the QRS is narrow."
    ], ap: "avnode", d: { loop: "ra", loopLabel: "Re-entry circuit (RA)", inactive: ["sa_av", "sa_la"], avNote: "Variable 2:1 to 4:1", active: ["his", "rbb", "lbb"], saLabel: "SA node overridden" } },
  svt: { points: [
      "Re-entry needs two pathways with different properties, one-way block in one of them and conduction slow enough for the tissue ahead to recover.",
      "In AVNRT both limbs are in or next to the AV node: a fast pathway with a long refractory period and a slow pathway with a short one. In the typical form a premature beat blocks in the fast pathway, travels down the slow pathway and returns up the fast pathway, setting up a circuit.",
      "Each lap sends an impulse down the His-Purkinje system (narrow QRS) and back up into the atria at about the same moment, so the retrograde P wave is buried in or just after the QRS.",
      "Because the AV node is part of the circuit, blocking it (vagal manoeuvres, adenosine) can terminate the rhythm."
    ], ap: "avnode", d: { loop: "av", loopLabel: "AV nodal re-entry", inactive: ["sa_av", "sa_la"], retro: "Retrograde to atria", active: ["his", "rbb", "lbb"], saLabel: "SA node overridden" } },
  vt: { points: [
      "Origin: below the His bundle, most often re-entry around an area of scar (for example an old infarct), sometimes abnormal automaticity or triggered activity.",
      "Pathway: the impulse spreads from myocyte to myocyte instead of through the fast His-Purkinje network. Ventricular muscle conducts more slowly than Purkinje fibres (Guyton and Hall: about 0.3 to 0.5 m/s), so the QRS is broad and bizarre.",
      "Repolarisation follows the abnormal activation sequence, so the T wave is usually opposite to the QRS.",
      "The SA node may keep firing the atria independently (AV dissociation). An occasional sinus impulse that reaches the ventricles gives a capture or fusion beat."
    ], ap: "myocyte", d: { origin: [["LVF", "Origin (scar re-entry)"]], spread: [["vtSpread", "Cell-to-cell spread"]], active: ["sa_av", "sa_la"], inactive: ["his", "rbb", "lbb"], avNote: "Atria may beat independently" } },
  vf: { points: [
      "Origin: multiple chaotic re-entrant wavelets throughout the ventricles; no single focus or pathway.",
      "Different areas are depolarising and repolarising at different times, so there is no coordinated contraction and no cardiac output.",
      "The trace is irregular in timing, shape and amplitude, with no identifiable QRS or T wave. Amplitude tends to fall over time as the myocardium becomes ischaemic (fine VF)."
    ], ap: "myocyte", d: { wavelets: "ventricles", waveLabel: "Chaotic ventricular wavelets", inactive: ["sa_av", "sa_la", "his", "rbb", "lbb"] } },
  asystole: { points: [
      "No pacemaker is depolarising the ventricles: the SA node and every escape pacemaker below it have failed, or conduction to the ventricles is completely blocked.",
      "If P waves are still present without QRS complexes (ventricular standstill), the atria are still being activated but nothing reaches the ventricles; this is more likely to respond to pacing.",
      "With no ventricular depolarisation or repolarisation there is no QRS or T wave, just a slowly wandering baseline."
    ], ap: "nodal", none: "Left out: there is no origin or pathway to show, and a blank diagram could be misread as a lead or display fault." },
  pea: { points: [
      "Electrically there is organised activity: an impulse arises (often from the SA node) and is conducted, so a recognisable rhythm is displayed.",
      "The failure is mechanical or circulatory: depolarisation does not produce effective contraction or cardiac output (for example severe hypovolaemia, tamponade, tension pneumothorax, massive PE).",
      "Excitation-contraction coupling depends on Ca2+ entry during the plateau and Ca2+ release from the sarcoplasmic reticulum, so severe acidosis, hypoxia or electrolyte disturbance can uncouple electrical from mechanical activity."
    ], ap: "myocyte", none: "Left out: PEA is defined by the absent pulse, not by a conduction pattern. The rhythm can arise anywhere, so one diagram would mislead." },
  first_degree: { points: [
      "Origin: SA node, normal.",
      "Pathway: every impulse is conducted, but more slowly, usually through the AV node (sometimes lower), so the PR interval exceeds 0.20 s.",
      "Below the delay conduction is normal, so the QRS is narrow unless there is co-existing bundle branch disease.",
      "Vagal tone and AV nodal blocking drugs (beta-blockers, calcium channel blockers, digoxin) all slow AV nodal conduction."
    ], ap: "avnode", d: { origin: [["SA", "Origin"]], active: ["sa_av", "sa_la", "his", "rbb", "lbb"], avSlow: "Slowed AV conduction" } },
  mobitz1: { points: [
      "Origin: SA node at a regular rate.",
      "Pathway: AV nodal decremental conduction. Each impulse arrives earlier in the node's recovery period than the last, so it conducts more slowly and the PR lengthens.",
      "Eventually an impulse arrives while the node is still refractory and is blocked: a P wave with no QRS. The pause lets the node recover, so the next PR is short again.",
      "The PR increments get smaller with each beat, so the RR interval shortens before the dropped beat."
    ], ap: "avnode", d: { origin: [["SA", "Origin"]], active: ["sa_av", "sa_la", "his", "rbb", "lbb"], avSlow: "Progressive delay", block: [["AVB", "Then 1 dropped"]] } },
  mobitz2: { points: [
      "Origin: SA node at a regular rate.",
      "Pathway: the block is usually below the AV node, in the His bundle or bundle branches. His-Purkinje tissue conducts all-or-none with fast Na+-dependent action potentials and does not show decremental slowing.",
      "So the PR stays constant in conducted beats until an impulse suddenly fails to conduct.",
      "Because the disease is infranodal, the QRS is often broad from co-existing bundle branch block."
    ], ap: "myocyte", d: { origin: [["SA", "Origin"]], active: ["sa_av", "sa_la", "his", "rbb", "lbb"], block: [["HISB", "Intermittent block"]] } },
  chb: { points: [
      "No atrial impulse reaches the ventricles: the block is at the AV node or in the His-Purkinje system.",
      "The atria carry on at the sinus rate, while the ventricles are driven by the fastest surviving pacemaker below the block (escape pacemaker hierarchy).",
      "Hierarchy of intrinsic rates: SA node about 60 to 100 /min, AV junction about 40 to 60 /min (narrow QRS because it uses the His-Purkinje system), ventricular myocardium about 20 to 40 /min (broad QRS and less reliable).",
      "P waves and QRS complexes are each regular but unrelated, so the PR interval varies randomly."
    ], ap: "nodal", d: { origin: [["SA", "Atria at sinus rate"], ["JX", "Junctional escape"], ["LVF", "or ventricular escape"]], active: ["sa_av", "sa_la", "rbb", "lbb"], inactive: ["his"], block: [["AVB", "Complete block"]] } },
  ve: { points: [
      "Origin: a single focus in ventricular myocardium fires early (enhanced automaticity, triggered activity or micro re-entry).",
      "Pathway: activation spreads cell to cell from the focus rather than through the His-Purkinje system, so the QRS is broad and bizarre with a discordant T wave, and there is no preceding P wave.",
      "The ectopic impulse usually does not conduct back through the AV node to reset the SA node, which keeps firing on time. The next sinus P falls while the ventricles are refractory, so the next conducted beat arrives on schedule: a full compensatory pause."
    ], ap: "myocyte", d: { origin: [["SA", "Sinus beats"], ["LVF", "Ectopic focus"]], active: ["sa_av", "sa_la", "his", "rbb", "lbb"], spread: [["vtSpread", "Ectopic: cell to cell"]] } },
  torsades: { points: [
      "Substrate: prolonged ventricular repolarisation (long QT). Commonly IKr (hERG) K+ channels are blocked by drugs or K+ current is reduced by hypokalaemia, so phase 2 and 3 of the ventricular action potential last longer.",
      "Trigger: early afterdepolarisations (EADs), depolarising oscillations during phase 2 or 3 from reactivation of L-type Ca2+ channels. One that reaches threshold fires a ventricular ectopic, often on the T wave.",
      "Pathway: activation runs from myocyte to myocyte with a constantly changing path through the ventricles, so the QRS axis swings around the baseline (twisting of the points).",
      "Bradycardia and pauses lengthen the action potential further, which is why a short-long-short sequence classically starts it."
    ], ap: "myocyte", d: { origin: [["LVF", "EAD-triggered beat"]], wavelets: "ventricles", waveLabel: "Shifting activation", inactive: ["sa_av", "sa_la", "his", "rbb", "lbb"] } },
  wpw: { points: [
      "Origin: SA node, normal.",
      "Pathway: as well as the AV node, an accessory pathway (bundle of Kent) of ordinary myocardium crosses the fibrous AV ring. It has no nodal delay, so part of the ventricle is activated early: short PR (under 0.12 s).",
      "From the pathway's insertion the impulse spreads slowly through ventricular muscle, giving the slurred delta wave.",
      "Meanwhile the impulse through the AV node and His-Purkinje system activates the rest of the ventricles fast. The QRS is a fusion of the two fronts, so it is slightly widened with secondary ST-T changes."
    ], ap: "myocyte", d: { origin: [["SA", "Origin"]], active: ["sa_av", "sa_la", "his", "rbb", "lbb", "ap"], ap: true, spread: [["apSpread", "Pre-excitation (delta)"]] } },
  pre_af: { points: [
      "Origin: atrial fibrillation, with disorganised atrial activity at about 350 to 600 /min.",
      "Pathway: the AV node limits ventricular rate, but an accessory pathway of ordinary myocardium has no decremental property and can have a short refractory period, so it can conduct very rapidly.",
      "Each QRS is a different mix of pathway (broad, pre-excited) and AV nodal (narrow) activation, so width and shape vary beat to beat.",
      "Drugs that block the AV node remove its competition and can push more impulses down the accessory pathway, risking VF."
    ], ap: "myocyte", d: { wavelets: "atria", waveLabel: "Multiple atrial wavelets", inactive: ["sa_av", "sa_la"], active: ["his", "rbb", "lbb", "ap"], ap: true, spread: [["apSpread", "Rapid conduction"]], saLabel: "SA node overridden" } },
  junctional: { points: [
      "Origin: the AV junction (AV node and His bundle region). Its cells have slower phase 4 depolarisation than the SA node (intrinsic rate about 40 to 60 /min), so it takes over when the SA node slows or fails (escape) or is enhanced (accelerated junctional rhythm, 60 to 100 /min).",
      "Pathway downwards: normal His-Purkinje conduction, so the QRS is narrow.",
      "Pathway upwards: the atria are activated retrogradely from below, so the P wave is inverted in II. It falls just before, within or just after the QRS depending on the relative speed of upward and downward conduction."
    ], ap: "nodal", d: { origin: [["JX", "Junctional origin"]], active: ["his", "rbb", "lbb"], inactive: ["sa_av", "sa_la"], retro: "Retrograde to atria", saLabel: "SA node slow or failed" } },
  pace_a: { points: [
      "Origin: an atrial lead (usually in the right atrium) delivers the stimulus (spike). Local atrial myocardium depolarises and the wave spreads across the atria (P wave).",
      "Pathway: the patient's own AV node and His-Purkinje system then conduct normally, so the PR and QRS are normal.",
      "This only works if AV conduction is intact, which is why atrial-only pacing suits sinus node disease."
    ], ap: "myocyte", d: { leads: [["RAL", "Atrial lead"]], active: ["la_lead", "lead_av", "his", "rbb", "lbb"], inactive: ["sa_av", "sa_la"] } },
  pace_v: { points: [
      "Origin: a ventricular lead, classically at the right ventricular apex, depolarises the myocardium next to its tip.",
      "Pathway: activation spreads cell to cell from the RV apex, right ventricle first and left ventricle late, rather than through the His-Purkinje system. So the QRS is broad and LBBB-like, and RV apical pacing often gives a superior axis (negative in II).",
      "Repolarisation follows the abnormal activation, so the T wave is opposite to the QRS.",
      "In VVI mode the atria are not tracked. It is common in permanent AF, where there is no organised atrial activity to track."
    ], ap: "myocyte", d: { leads: [["RVL", "RV lead"]], spread: [["rvSpread", "Cell-to-cell spread"]], inactive: ["sa_av", "sa_la", "his", "rbb", "lbb"] } },
  pace_dual: { points: [
      "Origin: the atrial lead paces (or senses) the atria first.",
      "The device then times an AV delay, and the ventricular lead paces if no intrinsic beat has come through.",
      "Paced ventricular beats spread cell to cell from the lead tip, so the QRS is broad, as in ventricular pacing.",
      "Pacing both chambers in sequence keeps the atrial contribution to ventricular filling."
    ], ap: "myocyte", d: { leads: [["RAL", "Atrial lead"], ["RVL", "RV lead"]], active: ["la_lead"], spread: [["rvSpread", "Cell-to-cell spread"]], inactive: ["sa_av", "sa_la", "his", "rbb", "lbb"], avNote: "AV delay set by device" } },
  pace_fail: { points: [
      "The pacing stimulus is delivered (spike) but does not depolarise the myocardium, so no action potential spreads and no QRS follows.",
      "Capture needs a stimulus above the threshold of the tissue at the lead tip. Thresholds rise with fibrosis at the tip, ischaemia, hyperkalaemia, acidosis and some drugs. Lead displacement or fracture and battery depletion reduce the delivered output.",
      "Captured beats look like normal ventricular pacing: broad, with a discordant T wave."
    ], ap: "myocyte", d: { leads: [["RVL", "RV lead"]], block: [["RVLX", "No capture"]], inactive: ["sa_av", "sa_la", "his", "rbb", "lbb"] } },
  lbbb: { points: [
      "Origin: SA node; AV node, His bundle and right bundle conduct normally.",
      "Pathway: the left bundle is blocked. Normally the septum is activated left to right from the left bundle, giving the small septal q in V6 and r in V1. In LBBB the septum is activated right to left instead, so the septal q in V6 is lost.",
      "The left ventricle is then activated late and slowly, cell to cell across the septum, so the QRS is 0.12 s or more: deep broad S in V1 and a broad, notched R in V6.",
      "Abnormal activation causes abnormal repolarisation, so ST-T changes are opposite to the QRS."
    ], ap: "myocyte", d: { origin: [["SA", "Origin"]], active: ["sa_av", "sa_la", "his", "rbb"], inactive: ["lbb"], block: [["LBBX", "LBB block"]], spread: [["lbbbSpread", "Septum R to L, LV late"]] } },
  rbbb: { points: [
      "Origin: SA node; AV node, His bundle and left bundle conduct normally.",
      "Pathway: the right bundle is blocked. The septum is still activated left to right (r in V1) and the left ventricle on time (S in V1).",
      "The right ventricle is then activated late, cell to cell from the left side, adding a late rightward and anterior wave: the R' in V1 and the wide slurred S in I and V6. The QRS is 0.12 s or more.",
      "Early LV activation is unchanged, so RBBB distorts the QRS less than LBBB."
    ], ap: "myocyte", d: { origin: [["SA", "Origin"]], active: ["sa_av", "sa_la", "his", "lbb"], inactive: ["rbb"], block: [["RBBX", "RBB block"]], spread: [["rbbbSpread", "RV activated late"]] } }
};

/* Schematic conduction diagram (SVG string). */
var CD_PT = { SA: [82, 44], AV: [156, 104], JX: [161, 131], AVB: [156, 106], HISB: [160, 128], LVF: [258, 184], RAL: [62, 78], RVL: [112, 214], RVLX: [112, 214], LBBX: [186, 162], RBBX: [138, 160] };
var CD_SEG = {
  sa_av: "M84 48 Q118 74 150 100", sa_la: "M90 40 Q166 24 240 46", his: "M157 109 L161 134",
  rbb: "M158 138 Q134 170 114 208", lbb: "M164 138 Q198 168 220 204", ap: "M276 78 L276 122",
  la_lead: "M64 66 Q150 28 240 46", lead_av: "M66 72 Q110 84 150 100"
};
var CD_SPREAD = {
  vtSpread: "M250 190 Q204 214 158 212 Q132 210 116 198",
  apSpread: "M274 126 Q262 150 246 168",
  rvSpread: "M118 206 Q158 184 196 196 Q220 202 240 188",
  lbbbSpread: "M120 196 Q160 176 200 196 Q222 206 242 192",
  rbbbSpread: "M214 210 Q170 194 122 210"
};
var CD_LABELS = {
  SA: [70, 50, "end"], AV: [142, 118, "end"], JX: [150, 142, "end"], AVB: [174, 114, "start"], HISB: [188, 112, "start"], LVF: [258, 170, "middle"],
  RAL: [54, 96, "end"], RVL: [104, 236, "middle"], RVLX: [126, 230, "start"], LBBX: [198, 174, "start"], RBBX: [128, 156, "end"]
};
function star(x, y, r) {
  var p = []; for (var i = 0; i < 10; i++) { var a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push((x + rr * Math.cos(a)).toFixed(1) + "," + (y - rr * Math.sin(a)).toFixed(1)); }
  return "<polygon class='cd-origin' points='" + p.join(" ") + "'/>";
}
function cdText(x, y, t, anchor, cls) { return "<text class='" + (cls || "cd-note") + "' x='" + x + "' y='" + y + "' text-anchor='" + (anchor || "start") + "'>" + esc(t) + "</text>"; }
function conductionSVG(key) {
  var e = EP[key]; if (!e || !e.d) return "";
  var d = e.d, id = "cd" + (++uidN), o = [];
  o.push("<svg class='cd-svg' viewBox='-60 0 390 250' role='img' aria-labelledby='" + id + "t'><title id='" + id + "t'>" + esc("Conduction diagram: " + RHYTHMS[key].name) + "</title>");
  o.push("<defs><marker id='" + id + "a' viewBox='0 0 10 10' refX='8' refY='5' markerUnits='userSpaceOnUse' markerWidth='11' markerHeight='11' orient='auto-start-reverse'><path d='M0 0 L10 5 L0 10 z' class='cd-arrowhead'/></marker></defs>");
  /* heart outline, AV ring, chamber labels */
  o.push("<path class='cd-heart' d='M44 30 Q44 12 72 12 L262 12 Q292 12 292 40 L292 96 Q302 152 252 206 Q206 246 166 244 Q120 246 80 206 Q30 152 36 96 Z'/>");
  o.push("<path class='cd-ring' d='M36 95 H292 M36 99 H292'/>");
  o.push(cdText(296, 101, "AV ring", "start", "cd-small"));
  o.push(cdText(40, 68, "RA", "start", "cd-chamber") + cdText(272, 40, "LA", "end", "cd-chamber") + cdText(52, 126, "RV", "start", "cd-chamber") + cdText(284, 124, "LV", "end", "cd-chamber"));
  var inactive = d.inactive || [], active = d.active || [];
  ["sa_av", "sa_la", "his", "rbb", "lbb"].forEach(function (s) { if (active.indexOf(s) < 0) o.push("<path class='cd-off' d='" + CD_SEG[s] + "'/>"); });
  if (d.ap && active.indexOf("ap") < 0) o.push("<path class='cd-off' d='" + CD_SEG.ap + "'/>");
  active.forEach(function (s) { o.push("<path class='cd-on' d='" + CD_SEG[s] + "' marker-end='url(#" + id + "a)'/>"); });
  /* purkinje twigs */
  o.push("<path class='cd-twig' d='M114 208 l-12 6 M114 208 l3 13 M220 204 l13 4 M220 204 l-1 13'/>");
  /* nodes */
  o.push("<circle class='cd-node' cx='82' cy='44' r='6'/><ellipse class='cd-node' cx='156' cy='104' rx='8' ry='5'/>");
  o.push(cdText(CD_LABELS.SA[0], CD_LABELS.SA[1], d.saLabel || "SA node", "end", "cd-label"));
  o.push(cdText(142, 118, "AV node", "end", "cd-label"));
  o.push(cdText(166, 132, "His", "start", "cd-label"));
  o.push(cdText(124, 186, "Right bundle", "end", "cd-label") + cdText(196, 150, "Left bundle", "start", "cd-label"));
  if (d.ap) { o.push(cdText(268, 70, "Accessory pathway", "end", "cd-label")); }
  if (d.avSlow) { o.push("<ellipse class='cd-slow' cx='156' cy='104' rx='14' ry='10'/>"); o.push(cdText(176, 92, d.avSlow, "start", "cd-note")); }
  if (d.avNote) o.push(cdText(170, 92, d.avNote, "start", "cd-note"));
  if (d.loop === "ra") { o.push("<path class='cd-loop' d='M80 77 A28 11 0 1 1 100 78.5' marker-end='url(#" + id + "a)'/>"); o.push(cdText(94, 90, d.loopLabel, "middle", "cd-note")); }
  if (d.loop === "av") { o.push("<path class='cd-loop' d='M144 104 A12 8 0 1 1 156 112' marker-end='url(#" + id + "a)'/>"); o.push(cdText(176, 80, d.loopLabel, "start", "cd-note")); }
  if (d.retro) { o.push("<path class='cd-spread' d='M148 98 Q124 80 104 66' marker-end='url(#" + id + "a)'/>"); o.push(cdText(100, 88, d.retro, "end", "cd-note")); }
  if (d.wavelets) {
    var pts = d.wavelets === "atria" ? [[80, 76], [130, 58], [196, 50], [244, 72]] : [[110, 176], [160, 196], [212, 176], [186, 222]];
    pts.forEach(function (p) { o.push("<path class='cd-wave' d='M" + (p[0] - 9) + " " + p[1] + " a9 6 0 1 1 9 6' marker-end='url(#" + id + "a)'/>"); });
    o.push(cdText(d.wavelets === "atria" ? 200 : 176, d.wavelets === "atria" ? 24 : 240, d.waveLabel, "middle", "cd-note"));
  }
  (d.spread || []).forEach(function (s) { o.push("<path class='cd-spread' d='" + CD_SPREAD[s[0]] + "' marker-end='url(#" + id + "a)'/>"); });
  (d.spread || []).forEach(function (s) {
    var pos = { vtSpread: [176, 230, "middle"], apSpread: [306, 184, "end"], rvSpread: [176, 230, "middle"], lbbbSpread: [176, 230, "middle"], rbbbSpread: [176, 230, "middle"] }[s[0]];
    o.push(cdText(pos[0], pos[1], s[1], pos[2], "cd-note"));
  });
  (d.leads || []).forEach(function (l) {
    var p = CD_PT[l[0]];
    o.push("<path class='cd-lead' d='M" + (l[0] === "RAL" ? "20 4 Q40 40 " : "10 10 Q60 150 ") + p[0] + " " + p[1] + "'/>");
    o.push("<rect class='cd-origin' x='" + (p[0] - 5) + "' y='" + (p[1] - 5) + "' width='10' height='10'/>");
    var lb = CD_LABELS[l[0]]; o.push(cdText(lb[0], lb[1], l[1], lb[2], "cd-note"));
  });
  (d.origin || []).forEach(function (or) {
    var p = CD_PT[or[0]], lb = CD_LABELS[or[0]];
    o.push(star(p[0], p[1], 9));
    if (or[0] === "SA") o.push(cdText(70, 36, or[1], "end", "cd-note"));
    else o.push(cdText(lb[0], lb[1], or[1], lb[2], "cd-note"));
  });
  (d.block || []).forEach(function (b) {
    var p = CD_PT[b[0]], lb = CD_LABELS[b[0]];
    o.push("<path class='cd-block' d='M" + (p[0] - 7) + " " + (p[1] - 7) + " l14 14 M" + (p[0] + 7) + " " + (p[1] - 7) + " l-14 14'/>");
    o.push(cdText(lb[0], lb[1], b[1], lb[2], "cd-note"));
  });
  o.push("</svg>");
  return o.join("");
}
function legendHTML() {
  var sw = function (cls, extra) { return "<svg viewBox='0 0 36 12' aria-hidden='true' class='cd-sw'>" + (extra || "<path class='" + cls + "' d='M2 6 H34'/>") + "</svg>"; };
  return "<ul class='cd-legend' aria-label='Diagram key'>" +
    "<li>" + sw("", "<polygon class='cd-origin' points='18,1 20,5 25,5 21,8 23,12 18,9.5 13,12 15,8 11,5 16,5'/>") + "Star: origin</li>" +
    "<li>" + sw("", "<rect class='cd-origin' x='13' y='1' width='10' height='10'/>") + "Square: pacing lead tip</li>" +
    "<li>" + sw("cd-on") + "Thick solid: conducting</li>" +
    "<li>" + sw("cd-spread") + "Dash-dot: slow cell-to-cell spread</li>" +
    "<li>" + sw("cd-off") + "Thin dotted: not used</li>" +
    "<li>" + sw("", "<path class='cd-block' d='M12 1 l10 10 M22 1 l-10 10'/>") + "Cross: block</li>" +
    "<li>" + sw("", "<ellipse class='cd-slow' cx='18' cy='6' rx='12' ry='4.5'/>") + "Dashed ring: slowed conduction</li>" +
    "<li>" + sw("", "<path class='cd-loop' d='M8 9 A10 4 0 1 1 18 10'/>") + "Loop: re-entry or wavelets</li></ul>";
}
/* ===== App: tool-first layout matching the PV loop template ===== */
var FLAG = "";
function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function nameOf(key, rk) { var r = RHYTHMS[rk]; if (r && r.optNames && r.optNames[key]) return r.optNames[key]; return RHYTHMS[key] ? RHYTHMS[key].name : LABEL_ONLY[key]; }
function isFlag(t) { return t.charAt(0) === "!"; }
function clean(t) { return isFlag(t) ? t.slice(1) : t; }
function li(t, forceFlag) { var f = forceFlag || isFlag(t); return "<li>" + esc(clean(t)) + (f ? " " + FLAG : "") + "</li>"; }
function caseById(id) { for (var i = 0; i < CASES.length; i++) if (CASES[i].id === id) return CASES[i]; return null; }
function caseByRhythm(rk) { for (var i = 0; i < CASES.length; i++) if (CASES[i].r === rk) return CASES[i]; return null; }
function firstSentence(t) { var m = t.match(/^.*?\.(\s|$)/); return m ? m[0].trim() : t; }
var $ = function (id) { return document.getElementById(id); };
function shuffle(a, R) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function newSeed() { return Math.floor(Math.random() * 2147483647); }

/* Rhythm groups for the picker, the summary and the viva list */
var GROUPS = [
  { set: "core", label: "Core", subs: [
    ["Sinus", ["sinus", "sinus_brady", "sinus_tachy"]],
    ["Atrial and SVT", ["af", "flutter21", "flutter_var", "svt"]],
    ["AV blocks", ["first_degree", "mobitz1", "mobitz2", "chb"]],
    ["Ventricular", ["ve", "vt"]],
    ["Arrest rhythms", ["vf", "asystole", "pea"]]
  ] },
  { set: "advanced", label: "Advanced", subs: [
    ["Junctional and torsades", ["junctional", "torsades"]],
    ["Pre-excitation", ["wpw", "pre_af"]],
    ["Bundle branch blocks", ["lbbb", "rbbb"]],
    ["Paced", ["pace_a", "pace_v", "pace_dual", "pace_fail"]]
  ] }
];
var SHORT = {
  sinus: "Sinus rhythm", sinus_brady: "Bradycardia", sinus_tachy: "Tachycardia",
  af: "Atrial fibrillation", flutter21: "Flutter 2:1", flutter_var: "Flutter, variable", svt: "SVT (AVNRT)",
  first_degree: "First degree", mobitz1: "Mobitz I", mobitz2: "Mobitz II", chb: "Complete",
  ve: "Ectopics", vt: "Monomorphic VT", vf: "VF", asystole: "Asystole", pea: "PEA",
  junctional: "Junctional", torsades: "Torsades", wpw: "WPW pattern", pre_af: "Pre-excited AF",
  lbbb: "LBBB", rbbb: "RBBB", pace_a: "Atrial", pace_v: "Ventricular", pace_dual: "Dual chamber", pace_fail: "Failure to capture"
};
/* Longer names for the revision summary, where there is room */
var MID = {
  sinus_brady: "Sinus bradycardia", sinus_tachy: "Sinus tachycardia", chb: "Complete heart block", ve: "Ventricular ectopics",
  junctional: "Junctional rhythm", torsades: "Torsades de pointes", pace_a: "Atrial paced", pace_v: "Ventricular paced", pace_dual: "Dual chamber paced", flutter_var: "Flutter, variable block"
};
function midName(rk) { return MID[rk] || SHORT[rk]; }

/* Flag register */
var FLAGS = [];
(function () {
  var seen = {};
  function add(where, t, key) { var k = where + "|" + t; if (seen[k]) return; seen[k] = 1; FLAGS.push({ id: "F" + String(FLAGS.length + 1).padStart(2, "0"), where: where, text: clean(t), key: key }); }
  Object.keys(RHYTHMS).forEach(function (k) {
    var r = RHYTHMS[k];
    r.management.forEach(function (t) { add(r.name + " · management", t, "r:" + k); });
    if (isFlag(r.trap)) add(r.name + " · exam trap", r.trap);
  });
  window.__flagList = FLAGS;
})();

function qrsText(q) { return typeof q === "number" ? q.toFixed(2) + " s" : (/\bs\b/.test(q) ? q : q + " s"); }
function measuredLine(s, r) {
  var m = s.measure, meta = s.meta, bits = [];
  if (meta.rateText) bits.push("ventricular rate " + meta.rateText);
  else if (m.rate && r.gen !== "vf" && r.gen !== "asystole") bits.push("ventricular rate about " + m.rate + " /min (" + m.n + " QRS in 10 s, x6 = " + (m.n * 6) + ")");
  else bits.push("no measurable ventricular rate");
  if (meta.atrial) bits.push("atrial rate about " + meta.atrial + " /min");
  else if (meta.atrialText) bits.push("atrial activity: " + meta.atrialText.toLowerCase());
  if (meta.block) bits.push("conduction " + meta.block);
  if (meta.cycle) bits.push("conduction " + meta.cycle);
  if (meta.prText) bits.push("PR " + meta.prText);
  else if (meta.pr) bits.push("PR " + meta.pr.toFixed(2) + " s");
  if (meta.qrs) bits.push("QRS about " + qrsText(meta.qrs));
  if (meta.veQrs) bits.push("ectopic QRS about " + meta.veQrs.toFixed(2) + " s (" + meta.pattern + ")");
  if (meta.paced) bits.push("paced at " + meta.paced + " /min");
  if (meta.polyRate) bits.push("polymorphic VT about " + meta.polyRate + " /min");
  if (m.rate && !meta.rateText && r.gen !== "vf" && r.gen !== "asystole") bits.push(m.irregular ? "irregular" : "regular");
  return "<p class='measured'><strong>This strip:</strong> " + esc(bits.join("; ")) + ".</p>";
}

/* Compact readouts that sit under the strip */
function readoutHTML(s, r, hide) {
  var m = s.measure, meta = s.meta, noRate = r.gen === "vf" || r.gen === "asystole";
  function v(x) { return hide ? "?" : x; }
  var rate = meta.rateText ? meta.rateText.replace(/^about /, "") : (m.rate && !noRate ? m.rate + " /min" : "None");
  if (meta.polyRate) rate = meta.polyRate + " /min";
  var reg = noRate || !m.rate ? "None" : (m.irregular ? "Irregular" : "Regular");
  if (meta.rateText && /to|falls|slows/.test(meta.rateText)) reg = m.irregular ? "Irregular" : "Varies";
  if (meta.polyRate) reg = "Polymorphic run";
  var atr = meta.atrialText ? meta.atrialText : meta.atrial ? meta.atrial + " /min" : (meta.pr ? "Same as QRS" : "Not measured");
  var pr = meta.prText ? meta.prText : (meta.pr ? meta.pr.toFixed(2) + " s" : "None");
  var qrs = meta.qrs ? qrsText(meta.qrs) : "None";
  var cells = [["Ventricular rate", rate], ["Regularity", reg], ["Atrial rate", atr], ["PR", pr], ["QRS", qrs]];
  return cells.map(function (c) { return "<div class='stat'><div class='stat-val'>" + esc(v(c[1])) + "</div><div class='stat-label'>" + c[0] + "</div></div>"; }).join("");
}

function rkOf(r) { for (var k in RHYTHMS) if (RHYTHMS[k] === r) return k; return ""; }
function renderVerTable() {
  if (!$("flag-count") || !$("ver-counts") || !document.querySelector("#flag-table tbody")) return;
  var n = { V: 0, T: 0, S: 0 };
  FLAGS.forEach(function (f) { var v = VER[f.key]; if (v) n[v[0]]++; });
  $("flag-count").textContent = FLAGS.length;
  $("ver-counts").textContent = n.V + " verified against a quoted source line, " + n.T + " physiology, " + n.S + " simulation simplifications.";
  document.querySelector("#flag-table tbody").innerHTML = FLAGS.map(function (f) { var v = VER[f.key] || ["?", [], ""]; return "<tr><td>" + f.id + "</td><td>" + esc(f.where) + "</td><td>" + esc(f.text) + "</td><td>" + CAT_LABEL[v[0]] + "</td><td class='vq-cell'>" + verQuotes(f.key) + "</td></tr>"; }).join("");
}
function featuresHTML(r) {
  var html = "<div class='panel-block'><h3>Mechanism in one line</h3><p>" + esc(r.mechanism) + "</p></div>";
  html += "<div class='panel-block'><h3>Key ECG features</h3><ul>" + r.features.map(function (t) { return li(t); }).join("") + "</ul></div>";
  html += "<div class='panel-block'><h3>Immediate management (in brief)</h3><p>" + esc(clean(r.management[0])) + verTag("r:" + rkOf(r)) + "</p></div>";
  html += "<div class='panel-block trap'><h3>Common exam trap</h3><p>" + esc(clean(r.trap)) + (isFlag(r.trap) ? " " + FLAG : "") + "</p></div>";
  return html;
}
function epHTML(rk) {
  var ep = EP[rk], html = "<h2 class='explain-title'>Electrophysiology: how this trace is made</h2>";
  if (ep.d) html += "<figure class='cd-fig'>" + conductionSVG(rk) + "<figcaption>Schematic conduction system, not to scale.</figcaption>" + legendHTML() + "</figure>";
  else html += "<div class='cd-fig cd-none'><p><strong>No diagram.</strong> " + esc(ep.none.replace(/^Left out: /, "")) + "</p></div>";
  html += "<div class='panel-block' style='margin-top:8px'><h3>Origin and pathway</h3><ul class='ep-points'>" + ep.points.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
  html += "<p class='ap-link'>" + esc(EP_AP[ep.ap]) + "</p></div>";
  return html;
}

/* ===== State ===== */
var mode = "learn";            /* "learn", "test" or "scenario" */
var view = { c: caseByRhythm("sinus"), seed: 1000 };
var Q = null, cal = null, current = null, strip = null;
var calOn = false, annOn = true;

/* ===== Picker ===== */
function renderPicker() {
  var root = $("rhythmPicker"); root.innerHTML = "";
  GROUPS.forEach(function (g, gi) {
    var col = document.createElement("div"); col.className = "rp-set";
    col.innerHTML = "<h3 class='rp-set-title'>" + g.label + " <span class='chip'>" + g.subs.reduce(function (n, s) { return n + s[1].length; }, 0) + " rhythms</span></h3>";
    g.subs.forEach(function (sub, si) {
      var hid = "rp-h-" + gi + "-" + si;
      var wrap = document.createElement("div"); wrap.className = "rp-sub";
      wrap.innerHTML = "<h4 class='scen-group-label' id='" + hid + "'>" + esc(sub[0]) + "</h4>";
      var row = document.createElement("div"); row.className = "rp-row"; row.setAttribute("role", "group"); row.setAttribute("aria-labelledby", hid);
      sub[1].forEach(function (rk) {
        var b = document.createElement("button"); b.type = "button"; b.className = "scen-btn"; b.dataset.r = rk;
        b.textContent = SHORT[rk]; b.title = RHYTHMS[rk].name;
        if (RHYTHMS[rk].name.toLowerCase().indexOf(SHORT[rk].toLowerCase()) >= 0 && RHYTHMS[rk].name !== SHORT[rk]) b.setAttribute("aria-label", RHYTHMS[rk].name);
        b.setAttribute("aria-pressed", view.c.r === rk ? "true" : "false");
        b.addEventListener("click", function () { view = { c: caseByRhythm(rk), seed: newSeed() }; renderLearn(); });
        row.appendChild(b);
      });
      wrap.appendChild(row); col.appendChild(wrap);
    });
    root.appendChild(col);
  });
}
function syncPicker() {
  document.querySelectorAll("#rhythmPicker .scen-btn").forEach(function (b) { b.setAttribute("aria-pressed", mode === "learn" && view.c.r === b.dataset.r ? "true" : "false"); });
  var lock = mode === "test";
  $("rhythmPanel").parentNode.classList.toggle("hidden", lock);
}

/* ===== Strip ===== */
function showStrip(c, seed, label, hideAnswers) {
  var r = RHYTHMS[c.r];
  strip = generate(r.gen, seed, Object.assign({}, r.genOpts || {}, c.genOpts || {}));
  var svg = stripBlock($("q-strip"), strip, { annotate: annOn, label: label });
  cal = new Calipers(svg, $("q-cal-readout"), strip);
  cal.toggle(calOn);
  syncCalReadout();
  setAnnotations($("q-strip"), annOn);
  $("readout").innerHTML = readoutHTML(strip, r, hideAnswers);
  return strip;
}
function syncCalReadout() {
  var ro = $("q-cal-readout");
  ro.hidden = !calOn;
  if (calOn) ro.textContent = "Callipers on: drag on the strip, or Tab to calliper A or B and use the arrow keys (Shift for 0.20 s steps). " + (cal ? "Callipers: " + cal.text.textContent : "");
}
function setStem(c) { $("q-stem").innerHTML = c.stem ? "<p class='stem'><strong>Clinical stem</strong>" + esc(c.stem) + "</p>" : ""; }

/* ===== Learn mode ===== */
function renderLearn() {
  mode = "learn";
  var c = view.c, r = RHYTHMS[c.r];
  $("stripTitle").innerHTML = esc(r.name) + " <span class='chip'>" + SET_LABEL[c.set] + "</span>";
  setStem(c);
  annOn = $("ann-btn").getAttribute("aria-pressed") === "true";
  $("ann-btn").disabled = false; $("regen-btn").disabled = false;
  var s = showStrip(c, view.seed, "Annotated lead II strip: " + r.name, false);
  $("leftPanel").innerHTML = "<p class='explain-kicker'>Learn mode</p><h2 class='explain-title'>" + esc(r.name) + "</h2>" + measuredLine(s, r) + featuresHTML(r);
  $("epPanel").innerHTML = epHTML(c.r);
  syncPicker(); syncBanner();
}

/* ===== Test yourself ===== */
var ICON_OK = "<svg class='icon' viewBox='0 0 30 30' aria-hidden='true'><circle cx='15' cy='15' r='13' fill='none' stroke='currentColor' stroke-width='2.5'/><path d='M9 15.5 L13.5 20 L21.5 10.5' fill='none' stroke='currentColor' stroke-width='3'/></svg>";
var ICON_NO = "<svg class='icon' viewBox='0 0 30 30' aria-hidden='true'><rect x='2.5' y='2.5' width='25' height='25' rx='4' fill='none' stroke='currentColor' stroke-width='2.5' stroke-dasharray='4 2'/><path d='M10 10 L20 20 M20 10 L10 20' stroke='currentColor' stroke-width='3'/></svg>";
var ICON_LATE = "<svg class='icon' viewBox='0 0 30 30' aria-hidden='true'><polygon points='15,2 28,15 15,28 2,15' fill='none' stroke='currentColor' stroke-width='2.5'/><path d='M15 9 V16 L20 19' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/></svg>";

function startTest(caseIds) {
  var set = $("test-set").value, len = $("test-len").value, pool;
  if (caseIds) pool = caseIds.slice();
  else {
    pool = CASES.filter(function (c) { return set === "mixed" || c.set === set; }).map(function (c) { return c.id; });
    shuffle(pool, Math.random);
    var n = len === "all" ? pool.length : parseInt(len, 10);
    while (pool.length < n) pool = pool.concat(shuffle(pool.slice(0, n - pool.length), Math.random));
    pool = pool.slice(0, n);
  }
  Q = { items: pool.map(function (id) { return { id: id, seed: newSeed() }; }), idx: 0, score: 0, streak: 0, best: 0, wrong: [], done: false };
  mode = "test";
  showQuestion();
}
function showQuestion() {
  var it = Q.items[Q.idx], c = caseById(it.id), r = RHYTHMS[c.r];
  current = { item: it, c: c, answered: false, chose: null };
  $("stripTitle").textContent = "Question " + (Q.idx + 1) + " of " + Q.items.length + ": what is the rhythm?";
  setStem(c);
  annOn = false; $("ann-btn").setAttribute("aria-pressed", "false"); $("ann-btn").disabled = true; $("regen-btn").disabled = true;
  current.s = showStrip(c, it.seed, "Lead II rhythm strip, 10 seconds, for question " + (Q.idx + 1) + ". Use the callipers to measure intervals.", true);
  var R = mulberry32(it.seed + 3);
  var d = shuffle(r.distract.slice(), R).slice(0, 3);
  current.opts = shuffle([c.r].concat(d), R);
  renderQuestionPanel();
  $("epPanel").innerHTML = "<h2 class='explain-title'>Electrophysiology: how this trace is made</h2><p class='ep-wait'>Answer first. The origin, conduction pathway and a labelled conduction diagram appear here once you choose.</p>" +
    "<p class='kbd-hint'>Keyboard: <span class='kbd'>1</span> to <span class='kbd'>4</span> answer, <span class='kbd'>N</span> next rhythm, <span class='kbd'>M</span> callipers.</p>";
  syncPicker(); syncBanner();
}
function renderQuestionPanel() {
  var c = current.c, r = RHYTHMS[c.r], done = current.answered, html = "<p class='explain-kicker'>Test yourself!</p>";
  html += "<div class='predict-q'><p>What is the rhythm?</p><div class='predict-opts' role='group' aria-label='Answer options'>";
  current.opts.forEach(function (k, i) {
    var nm = nameOf(k, c.r), cls = "", mark = "<span class='predict-key' aria-hidden='true'>" + (i + 1) + "</span>", verdict = "", aria = "Option " + (i + 1) + ": " + nm;
    if (done) {
      if (k === c.r) {
        cls = "is-correct"; mark = "<span class='predict-mark' aria-hidden='true'>\u2713</span>";
        verdict = "<span class='predict-verdict'>" + (current.chose === k ? "Correct" : "Correct answer") + "</span>";
        aria += current.chose === k ? ". Your answer. Correct" : ". Correct answer";
      } else if (k === current.chose) {
        cls = "is-wrong"; mark = "<span class='predict-mark' aria-hidden='true'>\u2717</span>";
        verdict = "<span class='predict-verdict'>Not quite</span>"; aria += ". Your answer. Not quite";
      }
    }
    html += "<button type='button' data-key='" + k + "' class='" + cls + "' aria-pressed='" + (current.chose === k ? "true" : "false") + "' aria-label='" + esc(aria) + "'" + (done ? " disabled" : "") + ">" + mark + "<span class='predict-opt-text'>" + esc(nm) + verdict + "</span></button>";
  });
  html += "</div></div>";
  if (done) {
    var ok = current.chose === c.r;
    html += "<p class='verdict-line'>" + (ok ? ICON_OK + "Correct: " : ICON_NO + "Not quite. The answer is ") + esc(r.name) + "</p>";
    html += "<p class='predict-score'>Score: " + Q.score + " of " + (Q.idx + 1) + " · streak " + Q.streak + " · best " + Q.best + "</p>";
    html += "<div class='predict-actions'><button type='button' id='next-btn'>" + (Q.idx === Q.items.length - 1 ? "See results" : "Next rhythm") + "</button><button type='button' class='secondary' id='quit-btn'>End test</button></div>";
    html += "<div style='margin-top:12px'>" + measuredLine(current.s, r) + featuresHTML(r) + "</div>";
  } else {
    html += "<div class='predict-actions'><button type='button' class='secondary' id='quit-btn'>End test</button></div>";
  }
  $("leftPanel").innerHTML = html;
  $("leftPanel").querySelectorAll(".predict-opts button").forEach(function (b) { b.addEventListener("click", function () { answer(b.dataset.key); }); });
  if ($("next-btn")) $("next-btn").addEventListener("click", next);
  $("quit-btn").addEventListener("click", endTest);
}
function answer(k) {
  if (!current || current.answered) return;
  current.answered = true; current.chose = k;
  var c = current.c, ok = k === c.r;
  if (ok) { Q.score++; Q.streak++; Q.best = Math.max(Q.best, Q.streak); }
  else { Q.streak = 0; Q.wrong.push({ id: c.id, seed: current.item.seed, chose: k }); }
  renderQuestionPanel();
  $("epPanel").innerHTML = epHTML(c.r);
  annOn = true; $("ann-btn").disabled = false; $("ann-btn").setAttribute("aria-pressed", "true"); setAnnotations($("q-strip"), true);
  $("readout").innerHTML = readoutHTML(current.s, RHYTHMS[c.r], false);
  $("stripTitle").textContent = "Question " + (Q.idx + 1) + " of " + Q.items.length + ": " + RHYTHMS[c.r].name;
  $("live").textContent = (ok ? "Correct. " : "Not quite. The answer is ") + RHYTHMS[c.r].name + ".";
  syncBanner();
  $("next-btn").focus({ preventScroll: true });
}
function next() {
  if (!current || !current.answered) return;
  if (Q.idx < Q.items.length - 1) { Q.idx++; showQuestion(); $("stripTitle").focus({ preventScroll: true }); }
  else endTest();
}
function endTest() {
  if (!Q) return;
  Q.done = true;
  var answered = Q.idx + (current && current.answered ? 1 : 0);
  Q.answered = answered;
  var pct = answered ? Math.round(100 * Q.score / answered) : 0;
  var html = "<p class='explain-kicker'>Test yourself!</p><h2 class='explain-title' id='end-heading' tabindex='-1'>Test complete</h2>";
  html += "<p class='big-score'>" + Q.score + " of " + answered + " (" + pct + "%)</p><p>Best streak " + Q.best + ". " + (Q.wrong.length ? Q.wrong.length + " to review: each opens the exact strip you saw." : "No wrong answers to review.") + "</p>";
  if (Q.wrong.length) {
    html += "<ul class='review-list'>" + Q.wrong.map(function (w, i) { var c = caseById(w.id); return "<li><button type='button' class='tool-btn' data-i='" + i + "'>" + (i + 1) + ". " + esc(RHYTHMS[c.r].name) + " (you chose " + esc(nameOf(w.chose, c.r)) + ")</button></li>"; }).join("") + "</ul>";
  }
  html += "<div class='predict-actions'><button type='button' id='again-btn'>New test</button>" + (Q.wrong.length ? "<button type='button' class='secondary' id='retry-btn'>Retry the ones I got wrong</button>" : "") + "</div>";
  $("leftPanel").innerHTML = html;
  $("leftPanel").querySelectorAll(".review-list button").forEach(function (b) {
    b.addEventListener("click", function () {
      var w = Q.wrong[+b.dataset.i], c = caseById(w.id), r = RHYTHMS[c.r];
      $("leftPanel").querySelectorAll(".review-list button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      $("stripTitle").textContent = "Review: " + r.name;
      setStem(c);
      annOn = true; $("ann-btn").disabled = false; $("ann-btn").setAttribute("aria-pressed", "true");
      showStrip(c, w.seed, "Lead II strip for review: " + r.name, false);
      $("epPanel").innerHTML = "<p class='explain-kicker'>Review: " + esc(r.name) + "</p>" + featuresHTML(r) + "<div class='panel-block'>" + epHTML(c.r) + "</div>";
    });
  });
  $("again-btn").addEventListener("click", function () { startTest(); $("stripTitle").focus({ preventScroll: true }); });
  if ($("retry-btn")) $("retry-btn").addEventListener("click", function () { startTest(Q.wrong.map(function (w) { return w.id; })); $("stripTitle").focus({ preventScroll: true }); });
  $("epPanel").innerHTML = "<h2 class='explain-title'>Review</h2><p class='ep-wait'>" + (Q.wrong.length ? "Choose a rhythm from the review list to see its strip, features and electrophysiology." : "Start a new test, or press Exit to return to Learn mode.") + "</p>";
  syncBanner();
  $("end-heading").focus({ preventScroll: true });
}
function exitTest() { Q = null; current = null; renderLearn(); }

function syncBanner() {
  var on = mode === "test", b = $("testBanner"), t = $("testToggle"), sc = $("testBannerScore");
  b.classList.toggle("is-on", on);
  t.setAttribute("aria-pressed", on ? "true" : "false");
  t.querySelector(".test-cta-label").textContent = on ? "Exit" : "Start";
  t.setAttribute("aria-label", on ? "Exit Test yourself" : "Start Test yourself");
  if (on && Q) {
    sc.hidden = false;
    sc.textContent = Q.done ? "Final score: " + Q.score + " of " + Q.answered : "Question " + (Q.idx + 1) + " of " + Q.items.length + " · Score: " + Q.score;
  } else { sc.hidden = true; sc.textContent = ""; }
  $("testBannerTag").textContent = on ? "Name the rhythm, then read why. The rhythm list is hidden until you exit." : "Name the rhythm from a fresh strip, then check the explanation.";
}

/* ===== Wiring ===== */
if ($("testToggle")) $("testToggle").addEventListener("click", function () { if (mode === "test") exitTest(); else { if (mode === "scenario") exitScenarioMode(true); startTest(); $("stripTitle").focus({ preventScroll: true }); } });
if ($("cal-btn")) $("cal-btn").addEventListener("click", function () {
  calOn = !calOn; this.setAttribute("aria-pressed", calOn ? "true" : "false");
  if (cal) cal.toggle(calOn);
  syncCalReadout();
});
if ($("ann-btn")) $("ann-btn").addEventListener("click", function () {
  annOn = this.getAttribute("aria-pressed") !== "true"; this.setAttribute("aria-pressed", annOn ? "true" : "false");
  setAnnotations($("q-strip"), annOn);
});
if ($("regen-btn")) $("regen-btn").addEventListener("click", function () { if (mode === "learn") { view.seed = newSeed(); renderLearn(); } });
document.addEventListener("keydown", function (e) {
  var tg = e.target; if (tg && (tg.tagName === "INPUT" || tg.tagName === "SELECT" || tg.tagName === "TEXTAREA")) return;
  if (tg && tg.getAttribute && (tg.getAttribute("role") === "slider" || tg.getAttribute("role") === "tab")) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (mode === "test" && current && !Q.done) {
    if (/^[1-4]$/.test(e.key) && !current.answered) { var k = current.opts[parseInt(e.key, 10) - 1]; if (k) { e.preventDefault(); answer(k); } return; }
    if ((e.key === "n" || e.key === "N") && current.answered) { e.preventDefault(); next(); return; }
  }
  if ((e.key === "m" || e.key === "M") && mode !== "scenario") { e.preventDefault(); $("cal-btn").click(); }
});

/* ===== Revise this topic ===== */
var VIVA_Q = {
  sinus: "Is sinus arrhythmia a form of AF?",
  sinus_brady: "When does sinus bradycardia need treating?",
  sinus_tachy: "A regular narrow tachycardia at about 150 /min with no clear P waves: what should you suspect?",
  af: "Fast AF can look regular. How do you confirm it, and what does a very fast, broad, irregular rhythm suggest?",
  flutter21: "How do you find flutter waves when the rate is stuck at about 150 /min?",
  flutter_var: "How do you tell flutter with variable block from AF?",
  svt: "How do you tell SVT from sinus tachycardia, and when must adenosine never be given?",
  first_degree: "How do you measure the PR interval, and how can a very long PR mislead you?",
  mobitz1: "How do you confirm Wenckebach, and what can mimic a dropped beat?",
  mobitz2: "Can 2:1 AV block be labelled Mobitz I or II from one strip?",
  chb: "How do you prove AV dissociation when some P waves are hidden?",
  ve: "What is R on T, and how do you tell a ventricular ectopic from an aberrantly conducted atrial ectopic?",
  vt: "How should a regular broad complex tachycardia be treated if its origin is uncertain?",
  vf: "Should fine VF be shocked?",
  asystole: "What should you check before calling a flat line asystole?",
  pea: "Why is a monitor reading 'sinus rhythm' not reassuring in an unresponsive patient?",
  junctional: "How do you tell junctional rhythm with an inverted P wave and short PR from WPW?",
  torsades: "Is all polymorphic VT torsades, and why is amiodarone avoided in torsades?",
  wpw: "What is the difference between WPW pattern and WPW syndrome?",
  pre_af: "What are the clues that an irregular broad tachycardia is pre-excited AF?",
  lbbb: "Can lead II alone diagnose bundle branch block?",
  rbbb: "Where do you look to confirm RBBB?",
  pace_a: "Why might atrial pacing spikes be missed on a monitor?",
  pace_v: "Why is a ventricular paced rhythm easy to mistake for VT?",
  pace_dual: "How do you recognise dual chamber pacing, and what can it track?",
  pace_fail: "How do failure to capture, failure to sense and oversensing differ?"
};
function buildRevise() {
  var cards = [["Reading the strip", [
      "<strong>Paper:</strong> 25 mm/s and 10 mm/mV; small square 0.04 s, large square 0.20 s",
      "<strong>Rate:</strong> QRS complexes in a 10 s strip x6",
      "<strong>Normal PR</strong> 0.12 to 0.20 s (3 to 5 small squares); <strong>normal QRS</strong> under 0.12 s",
      "<strong>Bundle branch block</strong> needs V1 and V6: one limb lead cannot diagnose it"]]];
  GROUPS.forEach(function (g) { g.subs.forEach(function (sub) {
    cards.push([sub[0] + " <span class='chip'>" + g.label + "</span>", sub[1].map(function (rk) { return "<strong>" + esc(midName(rk)) + ":</strong> " + esc(firstSentence(RHYTHMS[rk].mechanism)); })]);
  }); });
  $("summaryGrid").innerHTML = cards.map(function (c) { return "<article class='card summary-card'><h3 class='card-title'>" + c[0] + "</h3><ul>" + c[1].map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul></article>"; }).join("");
  var vh = "", n = 0;
  GROUPS.forEach(function (g) { g.subs.forEach(function (sub) {
    vh += "<h3 class='viva-group'>" + esc(sub[0]) + " (" + g.label + ")</h3>";
    sub[1].forEach(function (rk) {
      var r = RHYTHMS[rk]; n++;
      vh += "<details class='hy-details'><summary><span class='viva-q'>" + n + ". " + esc(VIVA_Q[rk]) + "</span></summary><div class='details-body viva-a'><p>" + esc(clean(r.trap)) + (isFlag(r.trap) ? " " + FLAG : "") + "</p><p><strong>Mechanism (" + esc(r.name) + "):</strong> " + esc(r.mechanism) + "</p></div></details>";
    });
  }); });
  $("vivaList").innerHTML = vh;
  var rows = [
    ["Paper speed and gain", "25 mm/s; 10 mm/mV", "Every strip on this page"],
    ["Small and large squares", "0.04 s and 0.20 s", "Every strip on this page"],
    ["Rate from a 10 s strip", "Number of QRS complexes x6", "Every strip on this page"],
    ["Normal PR interval", "0.12 to 0.20 s (3 to 5 small squares), constant", "Sinus rhythm card (Hampton)"],
    ["Normal QRS duration", "Under 0.12 s (under 3 small squares)", "Sinus rhythm card (Hampton)"],
    ["AV node and penetrating bundle delay", "About 0.13 s in total; most of the PR interval", "Electrophysiology, sinus rhythm (Guyton and Hall)"],
    ["His-Purkinje conduction velocity", "About 1.5 to 4 m/s", "Electrophysiology, sinus rhythm (Guyton and Hall)"],
    ["Sinus rhythm", "60 to 100 /min", "Sinus rhythm card"],
    ["Sinus bradycardia and tachycardia", "Under 60 /min; over 100 /min", "Sinus bradycardia and tachycardia cards"],
    ["Atrial fibrillation", "Atrial activity about 350 to 600 /min; fast AF if ventricular rate over 100 /min", "Atrial fibrillation card"],
    ["Atrial flutter", "F waves about 300 /min (cycle about 0.20 s); 2:1 block gives about 150 /min, 3:1 about 100, 4:1 about 75", "Atrial flutter cards"],
    ["SVT (AVNRT)", "Usually about 150 to 250 /min", "SVT card"],
    ["First degree AV block", "PR over 0.20 s (more than one large square), constant", "First degree AV block card"],
    ["Complete heart block escape", "Narrow junctional about 40 to 60 /min; broad ventricular about 20 to 40 /min", "Complete heart block card"],
    ["Junctional rhythm", "40 to 60 /min (escape); 60 to 100 /min (accelerated); PR under 0.12 s if the P wave comes first", "Junctional rhythm card"],
    ["Ventricular ectopic", "Premature QRS over 0.12 s with no preceding P wave", "Ventricular ectopics card"],
    ["Ventricular tachycardia", "Three or more broad complexes (QRS over 0.12 s) faster than 100 /min", "Monomorphic VT card"],
    ["Torsades de pointes", "About 200 to 250 /min; QTc over 500 ms carries high risk", "Torsades card"],
    ["WPW pattern", "PR under 0.12 s; delta wave; QRS over 0.11 s", "WPW card"],
    ["Pre-excited AF", "Rates can exceed 200 to 250 /min", "Pre-excited AF card"],
    ["Bundle branch block", "QRS 0.12 s or more; incomplete RBBB 0.10 to 0.12 s", "LBBB and RBBB cards"]
  ];
  document.querySelector("#numsTable tbody").innerHTML = rows.map(function (r) { return "<tr><th scope='row'>" + esc(r[0]) + "</th><td><div class='val'>" + esc(r[1]) + "</div><div class='src'>" + esc(r[2]) + "</div></td></tr>"; }).join("");
  renderVerTable();
  /* Accessible tabs, as on the PV page */
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".revise-tabs [role=tab]"));
  function activate(tab, focus) {
    tabs.forEach(function (t) { var on = t === tab; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1; $(t.getAttribute("aria-controls")).hidden = !on; });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { activate(t); });
    t.addEventListener("keydown", function (e) {
      var j = null;
      if (e.key === "ArrowRight") j = (i + 1) % tabs.length; else if (e.key === "ArrowLeft") j = (i + tabs.length - 1) % tabs.length;
      else if (e.key === "Home") j = 0; else if (e.key === "End") j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); activate(tabs[j], true); }
    });
  });
}

if ($("rhythmPicker")) {
  renderPicker();
  buildRevise();
  renderLearn();
}
window.__app = { startTest: startTest, answer: answer, next: next, endTest: endTest, exitTest: exitTest, renderLearn: renderLearn,
  pick: function (rk, seed) { view = { c: caseByRhythm(rk), seed: seed || newSeed() }; renderLearn(); },
  get current() { return current; }, get Q() { return Q; }, get mode() { return mode; } };
/* ===== Scenarios: guideline text, sources and physiology =====
   Every management statement (flag: 1) is labelled by category and source via VER in part-ver.js and listed in flagged-items.md.
   Sources checked 17 Nov 2026: RCUK 2025 Adult ALS guideline (27 Oct 2025) and algorithm, Adult bradyarrhythmia algorithm 2025,
   Adult tachyarrhythmia algorithm V3 (updated March 2026), BNF online monographs. */
var SRC = {
  als: "RCUK 2025 Adult ALS algorithm: shockable (VF/pulseless VT): shock, immediately resume CPR for 2 min; non-shockable (PEA/asystole): give adrenaline, then every 3 to 5 min.",
  alsPriority: "RCUK 2025 Adult ALS guideline: 'High-quality chest compressions with minimal interruption and early defibrillation remain priorities.'",
  shock: "RCUK 2025 Adult ALS guideline: single shocks followed by a 2-minute cycle of chest compressions; first biphasic shock at least 150 J (pulsed biphasic 130 to 150 J); it is reasonable to increase energy for later shocks.",
  adrShock: "RCUK 2025 Adult ALS guideline: give adrenaline 1 mg after the third shock for a shockable rhythm; repeat 1 mg every 3 to 5 min whilst ALS continues. BNF adrenaline (cardiopulmonary resuscitation): adult 1 mg every 3 to 5 minutes.",
  adrNon: "RCUK 2025 Adult ALS guideline: give adrenaline 1 mg as soon as possible for a non-shockable rhythm; repeat 1 mg every 3 to 5 min. BNF adrenaline (cardiopulmonary resuscitation): adult 1 mg every 3 to 5 minutes.",
  amio: "RCUK 2025 Adult ALS guideline: amiodarone 300 mg IV after a total of three shocks; a further 150 mg after a total of five shocks. BNF amiodarone (VF or pulseless VT refractory to defibrillation): 300 mg, then 150 mg if required.",
  pads: "RCUK 2025 Adult ALS algorithm: consider changing pads to antero-posterior after 3 shocks.",
  causes: "RCUK 2025 Adult ALS algorithm: identify and treat reversible causes early: hypoxia; hypovolaemia; hyper/hypokalaemia, -calcaemia, -magnesaemia, hypoglycaemia; hypo/hyperthermia; thrombosis (coronary or pulmonary); tension pneumothorax; toxins; tamponade.",
  fluid: "RCUK 2025 Adult ALS guideline: 'Give fluids during CPR only if cardiac arrest is caused by hypovolaemia.' Use isotonic saline or balanced crystalloids.",
  noRoutine: "RCUK 2025 Adult ALS guideline: 'Do not routinely give calcium, sodium bicarbonate or corticosteroids during cardiac arrest.'",
  rosc: "RCUK 2025 Adult ALS algorithm: immediately after ROSC: ABCDE assessment, aim SpO2 94 to 98% and normal PaCO2, SBP over 100 mmHg, 12-lead ECG, identify and treat cause, temperature control.",
  noAtroArrest: "RCUK 2025 Adult ALS algorithm: atropine does not appear in the cardiac arrest algorithm.",
  brady: "RCUK 2025 Adult bradyarrhythmia algorithm: life-threatening features (shock, syncope, myocardial ischaemia, severe heart failure, immediately post-ROSC): atropine 500 mcg IV; if unsatisfactory, interim measures: atropine repeated to a maximum of 3 mg, isoprenaline 5 mcg/min IV, adrenaline 2 to 10 mcg/min IV, alternative drugs and/or transcutaneous pacing; seek expert help; consider transvenous pacing.",
  bradyWide: "RCUK 2025 Adult ALS guideline (peri-arrest): 'Do not give atropine to patients with high-degree atrioventricular block and wide QRS. It is ineffective and may worsen the block.' BNF atropine (bradycardia following myocardial infarction): 500 micrograms every 3 to 5 minutes, maximum 3 mg per course.",
  pacing: "RCUK 2025 Adult ALS guideline: establish early transvenous pacing in unstable patients with symptomatic bradycardia; consider transcutaneous pacing as a bridge to transvenous pacing or when transvenous pacing is not readily available.",
  tachy: "RCUK Adult tachyarrhythmia algorithm (updated March 2026): unstable (shock, syncope with severe or ongoing hypotension, myocardial ischaemia, severe heart failure with pulmonary oedema, immediately post-ROSC): synchronised shock up to 3 attempts, considering sedation or anaesthesia if conscious; if unsuccessful amiodarone 300 mg IV over 10 to 20 min (or procainamide) and repeat synchronised shock.",
  narrow: "RCUK Adult tachyarrhythmia algorithm (updated March 2026): stable, narrow and regular: vagal manoeuvres; if ineffective adenosine (if no pre-excitation) 6 mg rapid IV bolus, then 12 mg, then 18 mg; if ineffective verapamil or beta-blocker; if ineffective synchronised shock.",
  aden: "RCUK tachyarrhythmia algorithm (March 2026): adenosine 6 mg, then 12 mg, then 18 mg. BNF adenosine: initially 6 mg over 2 seconds, then 12 mg after 1 to 2 minutes if required, then 12 mg. The two sources differ on the third dose.",
  sync: "RCUK 2025 Adult ALS guideline (peri-arrest): the shock must be synchronised to occur with the R wave; VT with a pulse: 120 to 150 J initially, stepwise increases if it fails; conscious patients require careful anaesthesia or sedation.",
  broad: "RCUK Adult tachyarrhythmia algorithm (updated March 2026): broad and regular: treat as VT; suspected SVT with aberrant conduction: IV adenosine only in the stable patient.",
  tdp: "RCUK Adult tachyarrhythmia algorithm (updated March 2026): polymorphic VT with QT prolongation: give Mg2+ 8 mmol IV over 10 min; consider isoprenaline or temporary pacing to increase heart rate; avoid amiodarone. BNF magnesium sulfate (emergency treatment of serious arrhythmias): 2 g over 10 to 15 minutes, may be repeated once.",
  tdpCauses: "Existing torsades card on this page (flagged F17): correct potassium and stop QT-prolonging drugs; RCUK tachyarrhythmia algorithm: identify and treat reversible causes.",
  expert: "RCUK 2025 peri-arrest guidance and algorithms: seek expert help if the arrhythmia and/or life-threatening features persist."
};

/* Physiology for every rhythm change (core physiology, not flagged) */
var PHYS = {
  shockVF: "A shock depolarises a critical mass of myocardium at once, so the re-entrant wavefronts of VF have no excitable tissue left to enter. A natural pacemaker such as the SA node can then take over.",
  vfPersists: "VF persists: the wavelets were not all extinguished. Compressions generate some coronary perfusion between shocks, which is why CPR restarts immediately.",
  adr: "Adrenaline's alpha-1 vasoconstriction raises aortic diastolic pressure during CPR, and so coronary and cerebral perfusion pressure. That alpha effect is the main reason it is given in arrest.",
  amio: "Amiodarone mainly blocks K+ channels, prolonging the action potential and refractory period; it also blocks Na+ and Ca2+ channels and beta receptors. Longer refractoriness makes re-entry harder to sustain.",
  rosc: "An organised rhythm with a palpable pulse means the ventricles are again contracting effectively: return of spontaneous circulation (ROSC).",
  pea: "Pulseless electrical activity: depolarisation is still spreading normally, but the ventricles are not ejecting enough blood to produce a palpable pulse.",
  hypovol: "After major blood loss, venous return and end-diastolic volume collapse. By the Frank-Starling relationship stroke volume falls so far that no pulse can be felt, despite organised electrical activity.",
  roscHypovol: "Restoring circulating volume raises preload, so each beat ejects a palpable stroke volume again.",
  peaToAsys: "Without treatment of the cause, myocardial ischaemia deepens and pacemaker cells stop firing. In this simulation the rhythm degenerates to asystole.",
  atroCHB: "Atropine blocks muscarinic (M2) receptors, removing vagal slowing at the SA and AV nodes. It cannot restore conduction across a block that is not vagally mediated, and the escape pacemaker below the block is not driven by vagal tone, so the ventricular rate barely changes. P waves may speed up but still do not conduct.",
  pace: "External pacing depolarises the ventricles directly, bypassing the blocked AV conduction. Each spike is followed by a broad QRS because activation spreads cell to cell rather than through the His-Purkinje system. The P waves continue independently.",
  vagal: "Vagal stimulation releases acetylcholine at the AV node, slowing conduction and lengthening refractoriness. In AVNRT the circuit runs through the AV node, so slowing it can break the circuit.",
  adenFail: "Adenosine acts for only seconds. This dose did not block the AV node for long enough to break the circuit.",
  aden: "Adenosine acts on A1 receptors in the AV node, opening K+ channels and hyperpolarising nodal cells. Brief AV block interrupts the re-entry circuit through the node, and the SA node takes over again.",
  sync: "The shock is timed to the R wave, away from the vulnerable period near the T wave peak. It depolarises the whole re-entry circuit at once, leaving it refractory, so the circuit stops.",
  syncFail: "The circuit survived the first shock. A further synchronised shock, with a stepwise increase in energy, depolarises more of it.",
  ront: "An unsynchronised shock can land in the vulnerable period of repolarisation (the T wave), when some fibres have recovered and others have not. That dispersion lets the shock start multiple re-entrant wavefronts: VF, with no cardiac output.",
  mg: "Torsades is triggered activity: early afterdepolarisations arise during a prolonged plateau, largely through L-type Ca2+ channels. Magnesium is thought to suppress them, so the runs stop. The QT stays long until the cause is corrected.",
  amioQT: "Amiodarone blocks K+ channels and prolongs repolarisation further, making early afterdepolarisations more likely: the runs become sustained and output is lost.",
  rateQT: "A faster heart rate shortens the action potential and QT, and removes the pauses that tend to trigger torsades.",
  tdpArrest: "Sustained polymorphic VT at this rate gives too little filling time for any useful output: functionally a cardiac arrest, treated like VF."
};


/* Shorter physiology for live feedback when a full PHYS line would name the next action. The debrief always uses PHYS. */
var PHYS_LIVE = {
  vfPersists: "VF persists: the wavelets were not all extinguished.",
  syncFail: "The circuit survived the first shock.",
  peaToAsys: "Myocardial ischaemia has deepened and pacemaker cells have stopped firing. In this simulation the rhythm has degenerated to asystole.",
  tdpArrest: "Sustained polymorphic VT at this rate gives too little filling time for any useful output: functionally a cardiac arrest."
};


/* Shared atropine teaching lines, used in debrief feedback and the model path.
   Spacing and interim-measure wording follows the RCUK 2025 Adult ALS guideline
   and bradyarrhythmia algorithm text already cited in SRC and VER. The ALS
   course judgement line is marked for anaesthetist review. */
var ATROPINE_SPACING_TEACHING = "The RCUK 2025 Adult ALS guideline says to repeat atropine 500 micrograms every 3 to 5 minutes, if necessary, to a total of 3 mg. The bradyarrhythmia algorithm states the 3 mg maximum but does not print an interval. Repeat atropine, transcutaneous pacing, isoprenaline and adrenaline are interim measures and can be used alongside each other; pacing does not have to wait until the full 3 mg has been given.";
var ATROPINE_CHB_ALS_JUDGEMENT = "Teaching note: for anaesthetist review. ALS course judgement: in complete heart block atropine often fails, so starting or preparing pacing early, once the first dose has clearly not worked, is reasonable and what ALS assessors tend to expect. Working through all 6 doses (15 to 25 minutes) in an unstable patient before pacing is not strictly against the algorithm, but is poor practice.";

/* Feedback texts. full is shown with Hints on and in the debrief.
   Live feedback with Hints off uses outcome (what happened) and, for not-quite
   or partly-right actions, whyWrong (why this action was wrong now, without
   naming the correct next action). nextStep, guideline and sources stay hidden
   until Hints are on, or in the debrief. */
var TXT = {
  /* generic: cardiac arrest */
  a_atro: {
    full: "Atropine is not part of the cardiac arrest algorithm.",
    guideline: "ALS algorithm: drugs in arrest are adrenaline and, for VF/pVT, amiodarone",
    src: "noAtroArrest",
    flag: 1,
    outcome: "",
    whyWrong: "Atropine is not part of the cardiac arrest algorithm.",
    nextStep: ""
  },
  a_aden: {
    full: "Adenosine is for a tachycardia with a pulse (regular narrow, or suspected SVT with aberrancy in a stable patient), not cardiac arrest.",
    guideline: "Tachyarrhythmia algorithm, not ALS",
    src: "narrow",
    flag: 1,
    outcome: "",
    whyWrong: "Adenosine is for a tachycardia with a pulse (regular narrow, or suspected SVT with aberrancy in a stable patient), not cardiac arrest.",
    nextStep: ""
  },
  a_vagal: {
    full: "Vagal manoeuvres are for a stable regular narrow complex tachycardia with a pulse, not cardiac arrest.",
    guideline: "Tachyarrhythmia algorithm, not ALS",
    src: "narrow",
    flag: 1,
    outcome: "",
    whyWrong: "Vagal manoeuvres are for a stable regular narrow complex tachycardia with a pulse, not cardiac arrest.",
    nextStep: ""
  },
  a_sync: {
    full: "There is no pulse, so there is nothing to synchronise to. Synchronised cardioversion is for a tachyarrhythmia with a pulse. VF or pulseless VT is a shockable cardiac arrest: give an unsynchronised shock.",
    guideline: "ALS: shockable rhythm, unsynchronised shock",
    src: "sync",
    flag: 1,
    outcome: "",
    whyWrong: "There is no pulse, so there is nothing to synchronise to. Synchronised cardioversion is for a tachyarrhythmia with a pulse.",
    nextStep: "VF or pulseless VT is a shockable cardiac arrest: give an unsynchronised shock."
  },
  a_pace: {
    full: "Pacing is not a step in the cardiac arrest algorithm; the bradyarrhythmia algorithm uses it for bradycardia with a pulse. RCUK notes that asystole with P waves is more likely to respond to pacing than true asystole.",
    guideline: "Bradyarrhythmia algorithm, not ALS",
    src: "pacing",
    flag: 1,
    outcome: "",
    whyWrong: "Pacing is not a step in the cardiac arrest algorithm; the bradyarrhythmia algorithm uses it for bradycardia with a pulse.",
    nextStep: ""
  },
  a_mg: {
    full: "Magnesium is not a drug in the cardiac arrest algorithm. The tachyarrhythmia algorithm uses it for polymorphic VT with QT prolongation.",
    guideline: "Tachyarrhythmia algorithm, not ALS",
    src: "tdp",
    flag: 1,
    outcome: "",
    whyWrong: "Magnesium is not a drug in the cardiac arrest algorithm.",
    nextStep: ""
  },
  a_bicarb: {
    full: "Do not routinely give sodium bicarbonate in cardiac arrest.",
    guideline: "ALS: other drugs",
    src: "noRoutine",
    flag: 1,
    outcome: "",
    whyWrong: "Do not routinely give sodium bicarbonate in cardiac arrest.",
    nextStep: ""
  },
  a_calcium: {
    full: "Do not routinely give calcium in cardiac arrest.",
    guideline: "ALS: other drugs",
    src: "noRoutine",
    flag: 1,
    outcome: "",
    whyWrong: "Do not routinely give calcium in cardiac arrest.",
    nextStep: ""
  },
  a_fluid: {
    full: "Give fluids during CPR only if the arrest is caused by hypovolaemia. Nothing in this scene suggests that.",
    guideline: "ALS: fluids",
    src: "fluid",
    flag: 1,
    outcome: "",
    whyWrong: "Fluids during CPR are only indicated if the arrest is caused by hypovolaemia. Nothing in this scene suggests that.",
    nextStep: ""
  },
  a_observe: {
    full: "This is cardiac arrest: the algorithm is CPR 30:2, attach the defibrillator and assess the rhythm. Observation is not a step.",
    guideline: "ALS: CPR 30:2",
    src: "alsPriority",
    flag: 1,
    outcome: "",
    whyWrong: "This is cardiac arrest. Observation is not a step.",
    nextStep: "The algorithm is CPR 30:2, attach the defibrillator and assess the rhythm."
  },
  a_expert: {
    full: "Calling for help is the right reflex. The resuscitation team is already here.",
    guideline: "ALS: call resuscitation team",
    src: "als",
    flag: 1,
    outcome: "Calling for help is the right reflex. The resuscitation team is already here.",
    whyWrong: "",
    nextStep: ""
  },
  a_causes: {
    full: "Right to consider the 4 Hs and 4 Ts throughout. Nothing in this scene points to a specific cause yet.",
    guideline: "ALS: identify and treat reversible causes early",
    src: "causes",
    flag: 1,
    outcome: "Right to consider the 4 Hs and 4 Ts throughout. Nothing in this scene points to a specific cause yet.",
    whyWrong: "",
    nextStep: ""
  },
  a_amio150: {
    full: "A further 150 mg of amiodarone after five shocks is in the 2025 Adult ALS guideline text, not on the algorithm poster, and only for VF or pulseless VT after the 300 mg dose.",
    guideline: "RCUK 2025 Adult ALS guideline (not on the algorithm poster)",
    src: "amio",
    flag: 1,
    outcome: "",
    whyWrong: "Amiodarone 150 mg is not indicated now. A further 150 mg after five shocks is in the 2025 Adult ALS guideline, not on the algorithm poster, and only for VF or pulseless VT after the 300 mg dose.",
    nextStep: ""
  },
  a_amio300: {
    full: "Amiodarone 300 mg is for VF/pVT after a total of three shocks. It has no role in PEA or asystole.",
    guideline: "ALS: antiarrhythmic drugs",
    src: "amio",
    flag: 1,
    outcome: "",
    whyWrong: "Amiodarone 300 mg is not indicated for this rhythm, and even in VF or pulseless VT it is not given until a total of three shocks have been delivered.",
    nextStep: ""
  },
  a_interrupt: {
    full: "Minimise interruptions: complete the 2 minutes of CPR, then pause briefly for the rhythm check. Stop early only if there are clinical and physiological signs of ROSC.",
    guideline: "ALS: minimise interruptions; CPR for 2 min",
    src: "alsPriority",
    flag: 1,
    outcome: "",
    whyWrong: "Minimise interruptions to compressions. Stop the cycle early only if there are clinical and physiological signs of ROSC.",
    nextStep: "Complete the 2 minutes of CPR, then pause briefly for the rhythm check."
  },
  a_handsOff: {
    full: "Compressions were interrupted for 60 seconds or more. High-quality chest compressions with minimal interruption remain a priority. This 60-second limit is a teaching choice in this simulation and is pending anaesthetist review.",
    guideline: "ALS: minimise interruptions",
    src: "alsPriority",
    flag: 1,
    outcome: "",
    whyWrong: "Prolonged interruption to compressions. RCUK says high-quality chest compressions with minimal interruption remain a priority.",
    nextStep: "Restart CPR at once, and keep pauses as short as possible.",
    event: "Compressions were interrupted for 60 seconds or more."
  },
  a_shockMid: {
    full: "Do not defibrillate during manual chest compressions. Complete the 2-minute cycle, pause briefly to assess the rhythm, then shock if it is shockable.",
    guideline: "ALS: shock, then CPR for 2 min",
    src: "shock",
    flag: 1,
    outcome: "",
    whyWrong: "Do not defibrillate during manual chest compressions.",
    nextStep: "Complete the 2-minute cycle, pause briefly to assess the rhythm, then shock if it is shockable."
  },
  a_charge: {
    full: "The defibrillator is charging. If CPR is in progress, keep compressions going until you stop, check all is clear, and shock. Do not defibrillate during manual chest compressions.",
    guideline: "ALS: minimise interruptions; do not defibrillate during manual chest compressions",
    src: "alsPriority",
    flag: 1,
    outcome: "The defibrillator is charging.",
    whyWrong: "",
    nextStep: "Stop compressions, check all is clear, then shock.",
    event: "Defibrillator charging; CPR continues if it is already in progress."
  },
  a_chargeCpr: {
    full: "The defibrillator is charging. Continue CPR until you stop compressions, check all is clear, and shock. Do not defibrillate during manual chest compressions.",
    guideline: "ALS: minimise interruptions; do not defibrillate during manual chest compressions",
    src: "alsPriority",
    flag: 1,
    outcome: "The defibrillator is charging. CPR continues.",
    whyWrong: "",
    nextStep: "Stop compressions, check all is clear, then shock.",
    event: "Defibrillator charging; CPR continues."
  },
  a_clear: {
    full: "Compressions stopped and all clear. Give the unsynchronised shock now, then immediately resume CPR.",
    guideline: "ALS: do not defibrillate during manual chest compressions; immediately resume CPR after the shock",
    src: "als",
    flag: 1,
    outcome: "Compressions stopped and all clear.",
    whyWrong: "",
    nextStep: "Give the unsynchronised shock, then immediately resume CPR.",
    event: "Compressions stopped; all clear."
  },
  a_shockNoSeq: {
    full: "The shock was delivered, but the safe sequence is to charge the defibrillator first (continuing CPR if it is already in progress), then check all is clear, and shock. Do not defibrillate during manual chest compressions. If CPR is in progress, resume it immediately after an unsynchronised shock.",
    guideline: "ALS: do not defibrillate during manual chest compressions; immediately resume CPR after a defibrillation shock. Teaching choice: the same charge-then-all-clear sequence is used before a synchronised shock.",
    src: "alsPriority",
    flag: 1,
    outcome: "Shock delivered.",
    whyWrong: "Charge the defibrillator first (continue CPR if it is already in progress), then all clear, and then shock.",
    nextStep: "If CPR is in progress after an unsynchronised shock, resume it immediately for 2 minutes."
  },
  a_clearReady: {
    full: "All clear. Deliver the shock now.",
    guideline: "ALS: do not defibrillate during manual chest compressions",
    src: "als",
    flag: 0,
    outcome: "All clear.",
    whyWrong: "",
    nextStep: "Deliver the shock.",
    event: "All clear."
  },
  a_chargePulse: {
    full: "A shock is not the next step here. Charge the defibrillator when a shock is indicated: unsynchronised defibrillation for VF or pulseless VT, or synchronised cardioversion for an unstable tachycardia.",
    guideline: "ALS: shockable rhythms; tachyarrhythmia: synchronised shock if unstable",
    src: "harmShockPulse",
    flag: 1,
    outcome: "",
    whyWrong: "A shock is not the next step, so there is nothing to charge for.",
    nextStep: "Treat the rhythm in front of you; charge when a synchronised or unsynchronised shock is indicated."
  },
  a_clearPulse: {
    full: "A shock is not the next step here, so there is no all-clear for a shock. Use all clear when a synchronised or unsynchronised shock is indicated.",
    guideline: "ALS: shockable rhythms; tachyarrhythmia: synchronised shock if unstable",
    src: "harmShockPulse",
    flag: 1,
    outcome: "",
    whyWrong: "A shock is not the next step, so this all-clear is not used.",
    nextStep: "Treat the rhythm in front of you; check all is clear when a shock is indicated."
  },
  a_shockTwice: {
    full: "After a shock, immediately resume CPR for 2 minutes. Do not stack shocks unless the arrest was witnessed and monitored with the defibrillator already attached.",
    guideline: "ALS: shock, then immediately resume CPR",
    src: "shock",
    flag: 1,
    outcome: "",
    whyWrong: "Do not stack shocks unless the arrest was witnessed and monitored with the defibrillator already attached.",
    nextStep: "After a shock, immediately resume CPR for 2 minutes."
  },
  a_resumeFirst: {
    full: "After a shock, resume compressions immediately; other tasks happen during the 2-minute cycle.",
    guideline: "ALS: immediately resume CPR for 2 min",
    src: "als",
    flag: 1,
    outcome: "",
    whyWrong: "This task should wait until compressions have been restarted after the shock.",
    nextStep: "After a shock, resume compressions immediately; other tasks happen during the 2-minute cycle."
  },
  a_adrSoon: {
    full: "Too soon. Repeat adrenaline 1 mg every 3 to 5 minutes, which is roughly every other 2-minute cycle. About 30 seconds of grace is allowed around that window.",
    guideline: "ALS: adrenaline every 3 to 5 min",
    src: "adrShock",
    flag: 1,
    outcome: "",
    whyWrong: "Too soon to give another dose of adrenaline.",
    nextStep: "Repeat adrenaline 1 mg every 3 to 5 minutes, which is roughly every other 2-minute cycle."
  },
  a_adrLate: {
    full: "Correct but late. This dose still scores full marks. Repeat adrenaline 1 mg every 3 to 5 minutes. After one further 2-minute cycle beyond that window, a missed dose is marked as missed.",
    guideline: "ALS: adrenaline every 3 to 5 min",
    src: "adrShock",
    flag: 1,
    outcome: "Adrenaline 1 mg IV given later than the 3 to 5 minute window.",
    whyWrong: "",
    nextStep: "Aim to give the next dose every 3 to 5 minutes."
  },
  a_amioLate: {
    full: "Correct but late. After the third shock, amiodarone 300 mg is due in that cycle. A dose in the next cycle is late, and it is missed once that next cycle is completed.",
    guideline: "ALS: amiodarone after 3 shocks",
    src: "amio",
    flag: 1,
    outcome: "Amiodarone 300 mg IV given later than the cycle after the third shock.",
    whyWrong: "",
    nextStep: "Give amiodarone 300 mg during the cycle after the third shock."
  },
  s3_atroSoon: {
    full: "Too soon. If atropine is still needed, repeat 500 micrograms every 3 to 5 minutes, to a total of 3 mg.",
    guideline: "Bradyarrhythmia: life-threatening features, give atropine",
    src: "brady",
    flag: 1,
    outcome: "",
    whyWrong: "Too soon to give another dose of atropine.",
    nextStep: "If atropine is still needed, repeat 500 micrograms every 3 to 5 minutes, to a total of 3 mg."
  },
  s3_atroLate: {
    full: "Correct but late. This dose still scores full marks. Repeat atropine 500 micrograms every 3 to 5 minutes, to a total of 3 mg. The case does not end while that titration is still under way.",
    guideline: "Bradyarrhythmia: life-threatening features, give atropine",
    src: "brady",
    flag: 1,
    outcome: "Atropine 500 micrograms IV given later than the 3 to 5 minute spacing.",
    whyWrong: "",
    nextStep: "If more atropine is still needed, continue to a total of 3 mg, then use interim measures."
  },
  a_assessAgain: {
    full: "Already assessed. Act on what you found.",
    guideline: "ALS: assess rhythm",
    src: "als",
    flag: 0,
    outcome: "Already assessed.",
    whyWrong: "",
    nextStep: "Act on what you found."
  },
  a_cprRunning: {
    full: "CPR is already in progress.",
    guideline: "ALS: CPR",
    src: "als",
    flag: 0,
    outcome: "CPR is already in progress.",
    whyWrong: "",
    nextStep: ""
  },
  a_ffNoCPR: {
    full: "CPR is not running, so there is no 2-minute cycle to skip.",
    guideline: "ALS: CPR for 2 min",
    src: "als",
    flag: 0,
    outcome: "CPR is not running, so there is no 2-minute cycle to skip.",
    whyWrong: "",
    nextStep: ""
  },
  /* generic: pulse present */
  p_cpr: {
    full: "The patient has a pulse. CPR is for cardiac arrest.",
    guideline: "Peri-arrest assessment: ABCDE",
    src: "als",
    flag: 1,
    outcome: "",
    whyWrong: "The patient has a pulse. CPR is for cardiac arrest.",
    nextStep: ""
  },
  p_shock: {
    full: "When cardioverting a tachyarrhythmia, the shock must be synchronised to the R wave. Do not give an unsynchronised shock to a patient with a pulse.",
    guideline: "Tachyarrhythmia algorithm: synchronised shock",
    src: "sync",
    flag: 1,
    outcome: "",
    whyWrong: "The patient has a pulse, so an unsynchronised shock is not appropriate.",
    nextStep: "When cardioverting a tachyarrhythmia, the shock must be synchronised to the R wave."
  },
  p_adr: {
    full: "Adrenaline 1 mg IV bolus is the cardiac arrest dose. Outside arrest, the bradycardia algorithm lists adrenaline only as an infusion (2 to 10 mcg/min) after atropine fails.",
    guideline: "Bradyarrhythmia algorithm: interim measures",
    src: "brady",
    flag: 1,
    outcome: "",
    whyWrong: "Adrenaline 1 mg IV bolus is the cardiac arrest dose, not a peri-arrest bolus.",
    nextStep: "Outside arrest, the bradycardia algorithm lists adrenaline only as an infusion (2 to 10 mcg/min) after atropine fails."
  },
  p_amio: {
    full: "Amiodarone is not the step for this rhythm and presentation.",
    guideline: "Peri-arrest algorithms",
    src: "tachy",
    flag: 1,
    outcome: "",
    whyWrong: "Amiodarone is not the step for this rhythm and presentation.",
    nextStep: ""
  },
  p_atro: {
    full: "Atropine is for bradycardia with life-threatening features. It has no role in a tachyarrhythmia.",
    guideline: "Bradyarrhythmia algorithm",
    src: "brady",
    flag: 1,
    outcome: "",
    whyWrong: "Atropine is for bradycardia with life-threatening features. It has no role in a tachyarrhythmia.",
    nextStep: ""
  },
  p_aden: {
    full: "Adenosine is for a stable regular narrow complex tachycardia (or suspected SVT with aberrancy in a stable patient). It is not the step here.",
    guideline: "Tachyarrhythmia algorithm: narrow regular",
    src: "narrow",
    flag: 1,
    outcome: "",
    whyWrong: "Adenosine is not the step for this rhythm and presentation.",
    nextStep: ""
  },
  p_vagal: {
    full: "Vagal manoeuvres are for a stable regular narrow complex tachycardia. They are not the step here.",
    guideline: "Tachyarrhythmia algorithm: narrow regular",
    src: "narrow",
    flag: 1,
    outcome: "",
    whyWrong: "Vagal manoeuvres are not the step for this rhythm and presentation.",
    nextStep: ""
  },
  p_sync: {
    full: "Synchronised cardioversion is for an unstable tachyarrhythmia, or after drug treatment fails. It is not the step here.",
    guideline: "Tachyarrhythmia algorithm",
    src: "tachy",
    flag: 1,
    outcome: "",
    whyWrong: "Synchronised cardioversion is not the step for this presentation.",
    nextStep: "It is used for an unstable tachyarrhythmia, or after drug treatment fails."
  },
  p_pace: {
    full: "Pacing is for bradycardia with life-threatening features that does not respond to drugs. It is not the step here.",
    guideline: "Bradyarrhythmia algorithm",
    src: "brady",
    flag: 1,
    outcome: "",
    whyWrong: "Pacing is not the step for this presentation.",
    nextStep: "Pacing is for bradycardia with life-threatening features that does not respond to drugs."
  },
  p_mg: {
    full: "Magnesium 8 mmol is the algorithm step for polymorphic VT with QT prolongation, not this rhythm.",
    guideline: "Tachyarrhythmia algorithm: polymorphic VT",
    src: "tdp",
    flag: 1,
    outcome: "",
    whyWrong: "Magnesium is not the step for this rhythm.",
    nextStep: "Magnesium 8 mmol is the algorithm step for polymorphic VT with QT prolongation."
  },
  p_fluid: {
    full: "An IV fluid bolus is not a step in the peri-arrest arrhythmia algorithms.",
    guideline: "Peri-arrest algorithms",
    src: "tachy",
    flag: 1,
    outcome: "",
    whyWrong: "An IV fluid bolus is not a step in the peri-arrest arrhythmia algorithms.",
    nextStep: ""
  },
  p_bicarb: {
    full: "Sodium bicarbonate is not a step in the peri-arrest arrhythmia algorithms.",
    guideline: "Peri-arrest algorithms",
    src: "tachy",
    flag: 1,
    outcome: "",
    whyWrong: "Sodium bicarbonate is not a step in the peri-arrest arrhythmia algorithms.",
    nextStep: ""
  },
  p_calcium: {
    full: "Calcium is not a step in the peri-arrest arrhythmia algorithms.",
    guideline: "Peri-arrest algorithms",
    src: "tachy",
    flag: 1,
    outcome: "",
    whyWrong: "Calcium is not a step in the peri-arrest arrhythmia algorithms.",
    nextStep: ""
  },
  p_observe: {
    full: "This patient needs treatment on the algorithm now. Observation alone is not the step for this presentation.",
    guideline: "Peri-arrest algorithms",
    src: "tachy",
    flag: 1,
    outcome: "",
    whyWrong: "This patient needs treatment on the algorithm now. Observation alone is not the step for this presentation.",
    nextStep: ""
  },
  p_expert: {
    full: "Seeking expert help is appropriate whenever the arrhythmia or life-threatening features persist.",
    guideline: "Peri-arrest: seek expert help",
    src: "expert",
    flag: 1,
    outcome: "Seeking expert help is appropriate whenever the arrhythmia or life-threatening features persist.",
    whyWrong: "",
    nextStep: ""
  },
  p_causes: {
    full: "Right to look for and treat reversible causes (for example electrolytes and drugs) alongside rhythm treatment.",
    guideline: "Peri-arrest: identify and treat reversible causes",
    src: "tachy",
    flag: 1,
    outcome: "Right to look for and treat reversible causes (for example electrolytes and drugs) alongside rhythm treatment.",
    whyWrong: "",
    nextStep: ""
  },
  p_amio150: {
    full: "Amiodarone 150 mg is a cardiac arrest dose (after five shocks in VF/pVT). It is not used here.",
    guideline: "ALS: antiarrhythmic drugs",
    src: "amio",
    flag: 1,
    outcome: "",
    whyWrong: "Amiodarone 150 mg is a cardiac arrest dose (after five shocks in VF or pulseless VT). It is not used here.",
    nextStep: ""
  },
  /* Scenario 1: VF to ROSC */
  s1_assess: {
    full: "VF on the monitor in an unresponsive patient who is not breathing normally: shockable cardiac arrest. Charge and shock without delay.",
    guideline: "ALS: assess rhythm, shockable",
    src: "als",
    flag: 1,
    outcome: "VF on the monitor in an unresponsive patient who is not breathing normally: shockable cardiac arrest.",
    whyWrong: "",
    nextStep: "Charge and shock without delay."
  },
  s1_cprFirst: {
    full: "CPR has been started. For a shockable rhythm, charge the defibrillator while compressions continue, then stop compressions, check all is clear, and shock. Give a shock as early as possible, then immediately resume CPR for 2 minutes.",
    guideline: "ALS: high-quality CPR and early defibrillation",
    src: "alsPriority",
    flag: 1,
    outcome: "CPR has been started.",
    whyWrong: "",
    nextStep: "Charge the defibrillator while CPR continues, then stop compressions, all clear, and shock."
  },
  s1_shock1: {
    full: "Shock 1 delivered (biphasic, at least 150 J). Now immediately resume CPR for 2 minutes without a pulse check.",
    guideline: "ALS: shock, immediately resume CPR for 2 min",
    src: "shock",
    flag: 1,
    outcome: "Shock 1 delivered (biphasic, at least 150 J).",
    whyWrong: "",
    nextStep: "Now immediately resume CPR for 2 minutes without a pulse check."
  },
  s1_shockN: {
    full: "Shock delivered (consider a higher energy if the defibrillator allows). Immediately resume CPR for 2 minutes.",
    guideline: "ALS: shock, immediately resume CPR for 2 min",
    src: "shock",
    flag: 1,
    outcome: "Shock delivered (consider a higher energy if the defibrillator allows).",
    whyWrong: "",
    nextStep: "Immediately resume CPR for 2 minutes."
  },
  s1_shock3: {
    full: "Third shock delivered. Resume CPR now. Adrenaline 1 mg and amiodarone 300 mg are both due after three shocks; prepare antero-posterior pads for the next rhythm check.",
    guideline: "ALS: after 3 shocks give adrenaline and amiodarone",
    src: "pads",
    flag: 1,
    outcome: "Third shock delivered.",
    whyWrong: "",
    nextStep: "Resume CPR now. Adrenaline 1 mg and amiodarone 300 mg are both due after three shocks; prepare antero-posterior pads for the next rhythm check."
  },
  s1_cpr: {
    full: "CPR restarted immediately after the shock. High-quality compressions with minimal interruption.",
    guideline: "ALS: immediately resume CPR for 2 min",
    src: "als",
    flag: 1,
    outcome: "CPR restarted immediately after the shock. High-quality compressions with minimal interruption.",
    whyWrong: "",
    nextStep: ""
  },
  s1_check: {
    full: "Rhythm check at the end of the cycle: still VF, so shockable. Shock again.",
    guideline: "ALS: assess rhythm, shockable",
    src: "als",
    flag: 1,
    outcome: "Rhythm check at the end of the cycle: still VF, so shockable.",
    whyWrong: "",
    nextStep: "Shock again."
  },
  s1_checkNoDrugs: {
    full: "Still VF after three shocks. Adrenaline 1 mg and amiodarone 300 mg were due after the third shock. Shock again and give them during the next cycle.",
    guideline: "ALS: after 3 shocks give adrenaline and amiodarone",
    src: "amio",
    flag: 1,
    outcome: "Still VF after three shocks.",
    whyWrong: "",
    nextStep: "Adrenaline 1 mg and amiodarone 300 mg were due after the third shock. Shock again and give them during the next cycle."
  },
  s1_checkOrganised: {
    full: "Rhythm check: an organised rhythm has appeared. Check for a pulse and signs of life before restarting compressions.",
    guideline: "ALS: organised rhythm, check pulse",
    src: "als",
    flag: 1,
    outcome: "Rhythm check: an organised rhythm has appeared.",
    whyWrong: "",
    nextStep: "Check for a pulse and signs of life before restarting compressions."
  },
  s1_adrEarly: {
    full: "Too early. In a shockable arrest the first adrenaline 1 mg is given after the third shock.",
    guideline: "ALS: adrenaline after 3 shocks",
    src: "adrShock",
    flag: 1,
    outcome: "",
    whyWrong: "Too early for adrenaline in a shockable arrest: the first 1 mg dose is not due until after a total of three shocks.",
    nextStep: ""
  },
  s1_adr: {
    full: "Adrenaline 1 mg IV given after the third shock, during CPR. Repeat every 3 to 5 minutes while ALS continues.",
    guideline: "ALS: adrenaline after 3 shocks, then every 3 to 5 min",
    src: "adrShock",
    flag: 1,
    outcome: "Adrenaline 1 mg IV given after the third shock, during CPR.",
    whyWrong: "",
    nextStep: "Repeat every 3 to 5 minutes while ALS continues."
  },
  s1_adrRepeat: {
    full: "Repeat adrenaline 1 mg, at least 3 minutes after the previous dose.",
    guideline: "ALS: adrenaline every 3 to 5 min",
    src: "adrShock",
    flag: 1,
    outcome: "Repeat adrenaline 1 mg given, at least 3 minutes after the previous dose.",
    whyWrong: "",
    nextStep: ""
  },
  s1_amioEarly: {
    full: "Too early. Amiodarone 300 mg is given after a total of three shocks.",
    guideline: "ALS: amiodarone after 3 shocks",
    src: "amio",
    flag: 1,
    outcome: "",
    whyWrong: "Too early for amiodarone: the 300 mg dose is not due until after a total of three shocks.",
    nextStep: ""
  },
  s1_amio: {
    full: "Amiodarone 300 mg IV given after the third shock, as the ALS algorithm poster states. A further 150 mg after five shocks is in the 2025 Adult ALS guideline text, not on the poster, and is optional if VF or pulseless VT continues.",
    guideline: "ALS: amiodarone after 3 shocks",
    src: "amio",
    flag: 1,
    outcome: "Amiodarone 300 mg IV given after the third shock.",
    whyWrong: "",
    nextStep: ""
  },
  s1_amioTwice: {
    full: "Amiodarone 300 mg has already been given, so that dose should not be repeated. The algorithm poster does not list a further amiodarone dose; the 2025 Adult ALS guideline mentions 150 mg after five shocks.",
    guideline: "ALS: antiarrhythmic drugs",
    src: "amio",
    flag: 1,
    outcome: "",
    whyWrong: "Amiodarone 300 mg has already been given, so that dose should not be repeated.",
    nextStep: ""
  },
  s1_amio150: {
    full: "Amiodarone 150 mg IV given after a total of five shocks. This further dose is in the 2025 Adult ALS guideline text. The ALS algorithm poster says only to give amiodarone after 3 shocks, and does not mention 150 mg after five shocks.",
    guideline: "RCUK 2025 Adult ALS guideline (not on the algorithm poster)",
    src: "amio",
    flag: 1,
    outcome: "Amiodarone 150 mg IV given after a total of five shocks.",
    whyWrong: "",
    nextStep: ""
  },
  s1_rosc: {
    full: "Pulse present with an organised rhythm: ROSC. Move to post-ROSC care: ABCDE, SpO2 94 to 98%, normal PaCO2, SBP over 100 mmHg, 12-lead ECG, treat the cause.",
    guideline: "ALS: ROSC, immediate post-ROSC care",
    src: "rosc",
    flag: 1,
    outcome: "Pulse present with an organised rhythm: ROSC.",
    whyWrong: "",
    nextStep: "Move to post-ROSC care: ABCDE, SpO2 94 to 98%, normal PaCO2, SBP over 100 mmHg, 12-lead ECG, treat the cause."
  },
  s1_roscCPR: {
    full: "Check for a pulse first: an organised rhythm after shocks and drugs may mean ROSC.",
    guideline: "ALS: organised rhythm, check pulse",
    src: "als",
    flag: 1,
    outcome: "",
    whyWrong: "An organised rhythm after shocks and drugs may mean ROSC, so restarting CPR was not the next assessment.",
    nextStep: "Check for a pulse first."
  },
  s1_roscShock: {
    full: "Only VF and pulseless VT are shockable; an organised rhythm is not. Check for a pulse: this may be ROSC.",
    guideline: "ALS: organised rhythm, check pulse",
    src: "als",
    flag: 1,
    outcome: "",
    whyWrong: "Only VF and pulseless VT are shockable; an organised rhythm is not.",
    nextStep: "Check for a pulse: this may be ROSC."
  },
  /* Scenario 2: PEA from hypovolaemia */
  s2_assess: {
    full: "Organised electrical activity but no palpable central pulse: PEA, a non-shockable arrest. Restart CPR, give adrenaline as soon as possible and hunt for the cause.",
    guideline: "ALS: assess rhythm, non-shockable",
    src: "als",
    flag: 1,
    outcome: "Organised electrical activity but no palpable central pulse: PEA, a non-shockable arrest.",
    whyWrong: "",
    nextStep: "Restart CPR, give adrenaline as soon as possible and hunt for the cause."
  },
  s2_cpr: {
    full: "CPR 30:2 continues: the right first step in a non-shockable arrest.",
    guideline: "ALS: CPR 30:2, immediately resume CPR for 2 min",
    src: "als",
    flag: 1,
    outcome: "CPR 30:2 continues: the right first step in a non-shockable arrest.",
    whyWrong: "",
    nextStep: ""
  },
  s2_shock: {
    full: "PEA and asystole are non-shockable rhythms: no shock. Continue CPR and give adrenaline.",
    guideline: "ALS: non-shockable pathway",
    src: "als",
    flag: 1,
    outcome: "",
    whyWrong: "PEA and asystole are non-shockable rhythms, so a shock is not indicated.",
    nextStep: "Continue CPR and give adrenaline."
  },
  s2_adr: {
    full: "Adrenaline 1 mg IV given as soon as possible, as the algorithm advises for a non-shockable rhythm. Repeat every 3 to 5 minutes.",
    guideline: "ALS: non-shockable, adrenaline as soon as possible",
    src: "adrNon",
    flag: 1,
    outcome: "Adrenaline 1 mg IV given as soon as possible, as the algorithm advises for a non-shockable rhythm.",
    whyWrong: "",
    nextStep: "Repeat every 3 to 5 minutes."
  },
  s2_adrRepeat: {
    full: "Repeat adrenaline 1 mg, at least 3 minutes after the previous dose.",
    guideline: "ALS: adrenaline every 3 to 5 min",
    src: "adrNon",
    flag: 1,
    outcome: "Repeat adrenaline 1 mg given, at least 3 minutes after the previous dose.",
    whyWrong: "",
    nextStep: ""
  },
  s2_adrSoon: {
    full: "Too soon. Repeat adrenaline every 3 to 5 minutes.",
    guideline: "ALS: adrenaline every 3 to 5 min",
    src: "adrNon",
    flag: 1,
    outcome: "",
    whyWrong: "Too soon to give another dose of adrenaline.",
    nextStep: "Repeat adrenaline every 3 to 5 minutes."
  },
  s2_causes: {
    full: "Reversible cause identified: hypovolaemia, one of the 4 Hs. The drain has filled with fresh blood after surgery, so give IV fluid.",
    guideline: "ALS: identify and treat reversible causes (hypovolaemia)",
    src: "causes",
    flag: 1,
    outcome: "Reversible cause identified: hypovolaemia, one of the 4 Hs. The drain has filled with fresh blood after surgery.",
    whyWrong: "",
    nextStep: "Give IV fluid."
  },
  s2_fluid: {
    full: "IV fluid given during CPR because hypovolaemia is the likely cause: isotonic saline or a balanced crystalloid.",
    guideline: "ALS: fluids only if arrest caused by hypovolaemia",
    src: "fluid",
    flag: 1,
    outcome: "IV fluid given during CPR because hypovolaemia is the likely cause: isotonic saline or a balanced crystalloid.",
    whyWrong: "",
    nextStep: ""
  },
  s2_fluidEarly: {
    full: "Fluid is right here, but name the cause first: working through the 4 Hs and 4 Ts is how you justify it.",
    guideline: "ALS: identify and treat reversible causes",
    src: "fluid",
    flag: 1,
    outcome: "",
    whyWrong: "Fluid may be right here, but the reversible cause had not been named first. Working through the 4 Hs and 4 Ts is how you justify it.",
    nextStep: ""
  },
  s2_expert: {
    full: "Right: in this scene the bleeding also needs surgical control, so call the surgical team.",
    guideline: "ALS: identify and treat cause",
    src: "causes",
    flag: 1,
    outcome: "Right: in this scene the bleeding also needs surgical control, so the surgical team is called.",
    whyWrong: "",
    nextStep: ""
  },
  s2_check: {
    full: "Rhythm check: still PEA, no pulse. Resume CPR and keep treating the cause.",
    guideline: "ALS: non-shockable, resume CPR for 2 min",
    src: "als",
    flag: 1,
    outcome: "Rhythm check: still PEA, no pulse.",
    whyWrong: "",
    nextStep: "Resume CPR and keep treating the cause."
  },
  s2_checkAsys: {
    full: "Rhythm check: now asystole. Still non-shockable. Resume CPR, continue adrenaline every 3 to 5 minutes and treat the cause.",
    guideline: "ALS: non-shockable, resume CPR for 2 min",
    src: "als",
    flag: 1,
    outcome: "Rhythm check: now asystole. Still non-shockable.",
    whyWrong: "",
    nextStep: "Resume CPR, continue adrenaline every 3 to 5 minutes and treat the cause."
  },
  s2_checkOrganised: {
    full: "Rhythm check: organised rhythm, faster and stronger-looking. Check for a pulse.",
    guideline: "ALS: organised rhythm, check pulse",
    src: "als",
    flag: 1,
    outcome: "Rhythm check: organised rhythm, faster and stronger-looking.",
    whyWrong: "",
    nextStep: "Check for a pulse."
  },
  s2_rosc: {
    full: "Pulse present: ROSC. Post-ROSC ABCDE care, keep restoring volume and get the bleeding controlled.",
    guideline: "ALS: ROSC, immediate post-ROSC care",
    src: "rosc",
    flag: 1,
    outcome: "Pulse present: ROSC.",
    whyWrong: "",
    nextStep: "Post-ROSC ABCDE care, keep restoring volume and get the bleeding controlled."
  },
  /* Scenario 3: complete heart block, narrow escape */
  s3_assess: {
    full: "Complete heart block with a narrow escape rhythm, and life-threatening features (shock and syncope). Treat now: atropine 500 mcg IV first.",
    guideline: "Bradyarrhythmia: life-threatening features, give atropine",
    src: "brady",
    flag: 1,
    outcome: "Complete heart block with a narrow escape rhythm, and life-threatening features (shock and syncope).",
    whyWrong: "",
    nextStep: "Treat now: atropine 500 mcg IV first."
  },
  s3_atro1: {
    full: "Atropine 500 micrograms IV given. Assess the response after each dose: the ventricular rate has barely changed and BP is still low, so the response is unsatisfactory. " + ATROPINE_SPACING_TEACHING + " " + ATROPINE_CHB_ALS_JUDGEMENT,
    guideline: "Bradyarrhythmia: atropine 500 mcg, assess response",
    src: "brady",
    flag: 1,
    outcome: "Atropine 500 micrograms IV given. The ventricular rate has barely changed and BP is still low, so the response is unsatisfactory.",
    whyWrong: "",
    nextStep: ""
  },
  s3_atroRepeat: {
    full: "Further atropine 500 micrograms given. Assess the response after each dose: there is still no response. " + ATROPINE_SPACING_TEACHING + " " + ATROPINE_CHB_ALS_JUDGEMENT,
    guideline: "Bradyarrhythmia: atropine to a maximum of 3 mg; RCUK 2025 ALS guideline; BNF: atropine sulfate",
    src: "brady",
    flag: 1,
    outcome: "Further atropine 500 micrograms given (it can be repeated to a total of 3 mg). There is still no response.",
    whyWrong: "",
    nextStep: "Repeat atropine to a maximum of 3 mg, or move on to another interim measure such as transcutaneous pacing, isoprenaline or adrenaline, and seek expert help."
  },
  s3_atroMax: {
    full: "The maximum total atropine dose is 3 mg (RCUK bradyarrhythmia algorithm and BNF). No further atropine should be given. Move on to another interim measure: transcutaneous pacing, or an isoprenaline or adrenaline infusion, and seek expert help for transvenous pacing.",
    guideline: "Bradyarrhythmia: atropine to a maximum of 3 mg",
    src: "brady",
    flag: 1,
    outcome: "",
    whyWrong: "The maximum total atropine dose is 3 mg, so no further atropine should be given.",
    nextStep: "Move on to another interim measure such as transcutaneous pacing, and seek expert help."
  },
  s3_atroPaced: {
    full: "An interim measure is already in place. Seek expert help and consider transvenous pacing. Further atropine is not needed.",
    guideline: "Bradyarrhythmia: interim measures",
    src: "brady",
    flag: 1,
    outcome: "An interim measure is already in place, so further atropine is not needed.",
    whyWrong: "",
    nextStep: "Seek expert help and consider transvenous pacing."
  },
  s3_paceEarly: {
    full: "Transcutaneous pacing started: each spike is followed by a broad QRS (electrical capture) and a pulse (mechanical capture), and BP improves. " + ATROPINE_SPACING_TEACHING + " " + ATROPINE_CHB_ALS_JUDGEMENT + " Atropine 500 micrograms IV, repeated to a maximum of 3 mg, remains a valid interim measure if it has not already been given. Seek expert help and consider transvenous pacing.",
    guideline: "Bradyarrhythmia: interim measures, transcutaneous pacing",
    src: "pacing",
    flag: 1,
    outcome: "Transcutaneous pacing started: each spike is followed by a broad QRS (electrical capture) and a pulse (mechanical capture), and BP improves.",
    whyWrong: "",
    nextStep: "Seek expert help and consider transvenous pacing. Atropine remains a valid interim measure if it has not already been given."
  },
  s3_pace: {
    full: "Transcutaneous pacing started: each spike is followed by a broad QRS (electrical capture) and a pulse (mechanical capture), and BP improves. Use it as a bridge to transvenous pacing. " + ATROPINE_SPACING_TEACHING + " " + ATROPINE_CHB_ALS_JUDGEMENT,
    guideline: "Bradyarrhythmia: interim measures, transcutaneous pacing",
    src: "pacing",
    flag: 1,
    outcome: "Transcutaneous pacing started: each spike is followed by a broad QRS (electrical capture) and a pulse (mechanical capture), and BP improves.",
    whyWrong: "",
    nextStep: "Use it as a bridge to transvenous pacing."
  },
  s3_paceLateAfterAtropine: {
    full: "Partly right. Transcutaneous pacing started: each spike is followed by a broad QRS (electrical capture) and a pulse (mechanical capture), and BP improves. Consider pacing earlier when atropine fails, especially in complete heart block. " + ATROPINE_SPACING_TEACHING + " " + ATROPINE_CHB_ALS_JUDGEMENT,
    guideline: "Bradyarrhythmia: interim measures, transcutaneous pacing",
    src: "pacing",
    flag: 1,
    outcome: "Transcutaneous pacing started: each spike is followed by a broad QRS (electrical capture) and a pulse (mechanical capture), and BP improves.",
    whyWrong: "Consider pacing earlier when atropine fails, especially in complete heart block.",
    nextStep: "Use it as a bridge to transvenous pacing, and seek expert help."
  },
  s3_paceAgain: {
    full: "Pacing is already running with capture.",
    guideline: "Bradyarrhythmia: interim measures",
    src: "pacing",
    flag: 0,
    outcome: "Pacing is already running with capture.",
    whyWrong: "",
    nextStep: ""
  },
  s3_adrInf: {
    full: "Adrenaline infusion 2 to 10 micrograms/min started as an interim measure. The bradyarrhythmia algorithm lists this alongside repeat atropine to 3 mg, isoprenaline and transcutaneous pacing. Seek expert help and consider transvenous pacing.",
    guideline: "Bradyarrhythmia: interim measures, adrenaline 2 to 10 mcg/min",
    src: "brady",
    flag: 1,
    outcome: "Adrenaline infusion 2 to 10 micrograms/min started as an interim measure.",
    whyWrong: "",
    nextStep: "Seek expert help and consider transvenous pacing."
  },
  s3_adrInfAgain: {
    full: "An adrenaline infusion is already running.",
    guideline: "Bradyarrhythmia: interim measures",
    src: "brady",
    flag: 0,
    outcome: "An adrenaline infusion is already running.",
    whyWrong: "",
    nextStep: ""
  },
  s3_iso: {
    full: "Isoprenaline infusion 5 micrograms/min started as an interim measure. The bradyarrhythmia algorithm lists this alongside repeat atropine to 3 mg, adrenaline and transcutaneous pacing. Seek expert help and consider transvenous pacing.",
    guideline: "Bradyarrhythmia: interim measures, isoprenaline 5 mcg/min",
    src: "brady",
    flag: 1,
    outcome: "Isoprenaline infusion 5 micrograms/min started as an interim measure.",
    whyWrong: "",
    nextStep: "Seek expert help and consider transvenous pacing."
  },
  s3_isoAgain: {
    full: "An isoprenaline infusion is already running.",
    guideline: "Bradyarrhythmia: interim measures",
    src: "brady",
    flag: 0,
    outcome: "An isoprenaline infusion is already running.",
    whyWrong: "",
    nextStep: ""
  },
  s3_expert: {
    full: "Expert help sought: monitor, treat the underlying cause and consider transvenous pacing.",
    guideline: "Bradyarrhythmia: seek expert help, consider transvenous pacing",
    src: "brady",
    flag: 1,
    outcome: "Expert help sought.",
    whyWrong: "",
    nextStep: "Monitor, treat the underlying cause and consider transvenous pacing."
  },
  s3_causes: {
    full: "Right to identify the reversible causes, for example electrolyte abnormalities, or beta-blockers or calcium channel blockers as a cause.",
    guideline: "Bradyarrhythmia: identify and treat reversible causes",
    src: "brady",
    flag: 1,
    outcome: "Right to identify the reversible causes, for example electrolyte abnormalities, or beta-blockers or calcium channel blockers as a cause.",
    whyWrong: "",
    nextStep: ""
  },
  s3_adr: {
    full: "A 1 mg bolus is the cardiac arrest dose. In bradycardia, adrenaline is an infusion of 2 to 10 mcg/min, an interim measure after atropine fails.",
    guideline: "Bradyarrhythmia: interim measures",
    src: "brady",
    flag: 1,
    outcome: "",
    whyWrong: "A 1 mg bolus is the cardiac arrest dose, not the peri-arrest dose for bradycardia.",
    nextStep: "In bradycardia, adrenaline is an infusion of 2 to 10 mcg/min, an interim measure after atropine fails."
  },
  s3_aden: {
    full: "Adenosine is contraindicated in second- or third-degree AV block (BNF).",
    guideline: "Bradyarrhythmia algorithm",
    src: "brady",
    flag: 1,
    outcome: "",
    whyWrong: "Adenosine is contraindicated in second- or third-degree AV block (BNF).",
    nextStep: ""
  },
  s3_observe: {
    full: "Shock and syncope are life-threatening features. Observation is only for patients without them and without a risk of asystole.",
    guideline: "Bradyarrhythmia: life-threatening features",
    src: "brady",
    flag: 1,
    outcome: "",
    whyWrong: "Shock and syncope are life-threatening features, so observation alone is not appropriate.",
    nextStep: "Observation is only for patients without life-threatening features and without a risk of asystole."
  },
  s3_widePoint: {
    full: "Teaching note: complete heart block with a broad QRS is a risk of asystole. The 2025 Adult ALS guideline text says: 'Do not give atropine to patients with high-degree atrioventricular block and wide QRS. It is ineffective and may worsen the block.' In the broad-complex complete heart block case, atropine is marked Partly right against that sentence. This case is narrow-complex complete heart block, so atropine remains the first-line interim measure on the bradyarrhythmia algorithm.",
    guideline: "Bradyarrhythmia algorithm; RCUK 2025 Adult ALS guideline",
    src: "bradyWide",
    flag: 1,
    outcome: "",
    whyWrong: "",
    nextStep: ""
  },
  s3_atroNuance: {
    full: "Assess the response after each atropine dose. " + ATROPINE_SPACING_TEACHING + " " + ATROPINE_CHB_ALS_JUDGEMENT,
    guideline: "Bradyarrhythmia: atropine 500 mcg, assess response; interim measures",
    src: "brady",
    flag: 1,
    outcome: "",
    whyWrong: "",
    nextStep: ""
  },
  /* Scenario 4: stable regular narrow complex tachycardia */
  s4_assess: {
    full: "Regular narrow complex tachycardia with no life-threatening features: stable. Start with vagal manoeuvres.",
    guideline: "Tachyarrhythmia: stable, narrow, regular",
    src: "narrow",
    flag: 1,
    outcome: "Regular narrow complex tachycardia with no life-threatening features: stable.",
    whyWrong: "",
    nextStep: "Start with vagal manoeuvres."
  },
  s4_vagal: {
    full: "Vagal manoeuvre done with ECG monitoring. No change this time, so move on to adenosine.",
    guideline: "Tachyarrhythmia: vagal manoeuvres",
    src: "narrow",
    flag: 1,
    outcome: "Vagal manoeuvre done with ECG monitoring. No change this time.",
    whyWrong: "",
    nextStep: "Move on to adenosine."
  },
  s4_vagalAgain: {
    full: "Vagal manoeuvres have already failed; the next step is adenosine.",
    guideline: "Tachyarrhythmia: if ineffective, adenosine",
    src: "narrow",
    flag: 1,
    outcome: "Vagal manoeuvres have already failed.",
    whyWrong: "",
    nextStep: "The next step is adenosine."
  },
  s4_adenEarly: {
    full: "Adenosine works here, but the algorithm starts with vagal manoeuvres.",
    guideline: "Tachyarrhythmia: vagal manoeuvres first",
    src: "narrow",
    flag: 1,
    outcome: "",
    whyWrong: "Right drug, but vagal manoeuvres had not been tried first.",
    nextStep: "The algorithm starts with vagal manoeuvres."
  },
  s4_aden6: {
    full: "Adenosine 6 mg rapid IV bolus into a large vein over 2 seconds, with ECG monitoring. Brief slowing, then the tachycardia resumes. Next dose: 12 mg. The RCUK algorithm poster does not set a timed gap between adenosine doses. The BNF advises 1 to 2 minutes between increments. That interval is a teaching note only and is not marked.",
    guideline: "Tachyarrhythmia: adenosine 6 mg",
    src: "aden",
    flag: 1,
    outcome: "Adenosine 6 mg rapid IV bolus into a large vein over 2 seconds, with ECG monitoring. Brief slowing, then the tachycardia resumes.",
    whyWrong: "",
    nextStep: "Next dose: 12 mg."
  },
  s4_aden12: {
    full: "Adenosine 12 mg rapid IV bolus: brief AV block, then sinus rhythm. Record a 12-lead ECG. The RCUK algorithm poster does not set a timed gap between adenosine doses. The BNF advises 1 to 2 minutes between increments. That interval is a teaching note only and is not marked.",
    guideline: "Tachyarrhythmia: adenosine 12 mg",
    src: "aden",
    flag: 1,
    outcome: "Adenosine 12 mg rapid IV bolus: brief AV block, then sinus rhythm.",
    whyWrong: "",
    nextStep: "Record a 12-lead ECG."
  },
  s4_sync: {
    full: "The patient is stable. Synchronised cardioversion is for life-threatening features, or after vagal manoeuvres, adenosine and verapamil or a beta-blocker have failed.",
    guideline: "Tachyarrhythmia: stable, narrow, regular",
    src: "narrow",
    flag: 1,
    outcome: "",
    whyWrong: "The patient is stable, so synchronised cardioversion is not the step now.",
    nextStep: "Synchronised cardioversion is for life-threatening features, or after vagal manoeuvres, adenosine and verapamil or a beta-blocker have failed."
  },
  s4_amio: {
    full: "Amiodarone is not a step for a stable regular narrow complex tachycardia; the sequence is vagal manoeuvres, adenosine, then verapamil or a beta-blocker.",
    guideline: "Tachyarrhythmia: stable, narrow, regular",
    src: "narrow",
    flag: 1,
    outcome: "",
    whyWrong: "Amiodarone is not a step for a stable regular narrow complex tachycardia.",
    nextStep: "The sequence is vagal manoeuvres, adenosine, then verapamil or a beta-blocker."
  },
  s4_observe: {
    full: "Even when stable, the algorithm treats this rhythm: vagal manoeuvres first.",
    guideline: "Tachyarrhythmia: stable, narrow, regular",
    src: "narrow",
    flag: 1,
    outcome: "",
    whyWrong: "Even when stable, this rhythm is treated on the algorithm rather than observed alone.",
    nextStep: "Vagal manoeuvres first."
  },
  /* Scenario 5: unstable broad complex tachycardia */
  s5_assess: {
    full: "Regular broad complex tachycardia with life-threatening features (shock and myocardial ischaemia): treat as unstable VT. Synchronised shock, with sedation or anaesthesia as the patient is conscious.",
    guideline: "Tachyarrhythmia: unstable, synchronised shock",
    src: "tachy",
    flag: 1,
    outcome: "Regular broad complex tachycardia with life-threatening features (shock and myocardial ischaemia): treat as unstable VT.",
    whyWrong: "",
    nextStep: "Synchronised shock, with sedation or anaesthesia as the patient is conscious."
  },
  s5_expert: {
    full: "Help called to give careful sedation or anaesthesia before cardioversion, because the patient is conscious.",
    guideline: "Tachyarrhythmia: synchronised shock, consider sedation or anaesthesia",
    src: "sync",
    flag: 1,
    outcome: "Help called to give careful sedation or anaesthesia before cardioversion, because the patient is conscious.",
    whyWrong: "",
    nextStep: ""
  },
  s5_noSed: {
    full: "Right treatment, but this patient is conscious: RCUK says conscious patients need careful anaesthesia or sedation before synchronised cardioversion.",
    guideline: "Tachyarrhythmia: consider sedation or anaesthesia if conscious",
    src: "sync",
    flag: 1,
    outcome: "",
    whyWrong: "The electrical treatment is right, but this patient is conscious and had not had careful anaesthesia or sedation first.",
    nextStep: "RCUK says conscious patients need careful anaesthesia or sedation before synchronised cardioversion."
  },
  s5_sync1: {
    full: "Synchronised shock 1 (120 to 150 J): VT persists. Repeat the synchronised shock, considering a stepwise increase in energy (up to 3 attempts).",
    guideline: "Tachyarrhythmia: synchronised shock, up to 3 attempts",
    src: "sync",
    flag: 1,
    outcome: "Synchronised shock 1 (120 to 150 J): VT persists.",
    whyWrong: "",
    nextStep: "Repeat the synchronised shock, considering a stepwise increase in energy (up to 3 attempts)."
  },
  s5_sync2: {
    full: "Synchronised shock 2: sinus rhythm with a better BP. Continue the ABCDE assessment and record a 12-lead ECG; seek expert help if the tachyarrhythmia or life-threatening features persist.",
    guideline: "Tachyarrhythmia: synchronised shock, up to 3 attempts",
    src: "sync",
    flag: 1,
    outcome: "Synchronised shock 2: sinus rhythm with a better BP.",
    whyWrong: "",
    nextStep: "Continue the ABCDE assessment and record a 12-lead ECG; seek expert help if the tachyarrhythmia or life-threatening features persist."
  },
  s5_unsync: {
    full: "The patient had a pulse, so a synchronised shock was needed. An unsynchronised shock can land on the T wave and has caused VF.",
    guideline: "Tachyarrhythmia: shock must be synchronised",
    src: "sync",
    flag: 1,
    outcome: "",
    whyWrong: "The patient had a pulse, so a synchronised shock was needed. An unsynchronised shock can land on the T wave and has caused VF.",
    nextStep: "If the case continues, there is now no pulse: this is a shockable cardiac arrest, so the next shock should be unsynchronised."
  },
  s5_arrestShock: {
    full: "There is now no pulse, so unsynchronised defibrillation is correct. Shock delivered. Sinus rhythm with a pulse has returned.",
    guideline: "ALS: shockable, unsynchronised shock",
    src: "shock",
    flag: 1,
    outcome: "There is now no pulse, so unsynchronised defibrillation is correct. Shock delivered. Sinus rhythm with a pulse has returned.",
    whyWrong: "",
    nextStep: ""
  },
  s5_arrestCPR: {
    full: "Starting CPR is right in an arrest, but with VF just triggered on a monitored patient and pads already on, defibrillate first.",
    guideline: "ALS: early defibrillation",
    src: "alsPriority",
    flag: 1,
    outcome: "",
    whyWrong: "Starting CPR is right in an arrest, but this VF was just triggered on a monitored patient with the pads already on, so compressions were not the first action needed.",
    nextStep: "Defibrillate first."
  },
  s5_amio: {
    full: "With life-threatening features, electrical cardioversion comes first. Amiodarone 300 mg over 10 to 20 min is for when up to 3 synchronised shocks fail.",
    guideline: "Tachyarrhythmia: unstable, synchronised shock first",
    src: "tachy",
    flag: 1,
    outcome: "",
    whyWrong: "With life-threatening features, amiodarone is not the first treatment.",
    nextStep: "Electrical cardioversion comes first. Amiodarone 300 mg over 10 to 20 min is for when up to 3 synchronised shocks fail."
  },
  s5_aden: {
    full: "Regular broad complex tachycardia is treated as VT. Adenosine is considered only for suspected SVT with aberrancy in a stable patient; this patient is unstable.",
    guideline: "Tachyarrhythmia: broad regular, treat as VT",
    src: "broad",
    flag: 1,
    outcome: "",
    whyWrong: "Regular broad complex tachycardia is treated as VT. This patient is also unstable, so adenosine is not appropriate.",
    nextStep: ""
  },
  s5_mg: {
    full: "This is monomorphic VT. Magnesium is the step for polymorphic VT with QT prolongation.",
    guideline: "Tachyarrhythmia: polymorphic VT",
    src: "tdp",
    flag: 1,
    outcome: "",
    whyWrong: "This is monomorphic VT, so magnesium is not the step for this rhythm.",
    nextStep: "Magnesium is the step for polymorphic VT with QT prolongation."
  },
  /* Scenario 6: torsades de pointes */
  s6_assess: {
    full: "Recurrent self-terminating polymorphic VT with a long QT between runs: torsades de pointes. Give magnesium and treat the cause.",
    guideline: "Tachyarrhythmia: polymorphic VT with QT prolongation",
    src: "tdp",
    flag: 1,
    outcome: "Recurrent self-terminating polymorphic VT with a long QT between runs: torsades de pointes.",
    whyWrong: "",
    nextStep: "Give magnesium and treat the cause."
  },
  s6_mg: {
    full: "Magnesium 8 mmol IV over 10 min given (RCUK). BNF: magnesium sulfate 2 g over 10 to 15 min (about 8 mmol Mg2+), may be repeated once. The runs stop.",
    guideline: "Tachyarrhythmia: Mg2+ 8 mmol IV over 10 min",
    src: "tdp",
    flag: 1,
    outcome: "Magnesium 8 mmol IV over 10 min given (RCUK). BNF: magnesium sulfate 2 g over 10 to 15 min (about 8 mmol Mg2+). The runs stop.",
    whyWrong: "",
    nextStep: "The BNF allows the dose to be repeated once if needed."
  },
  s6_mgAgain: {
    full: "Magnesium already given. The BNF allows one repeat if needed; the runs have stopped, so it is not needed now.",
    guideline: "Tachyarrhythmia: Mg2+ 8 mmol IV over 10 min",
    src: "tdp",
    flag: 1,
    outcome: "Magnesium already given. The runs have stopped, so a further dose is not needed now.",
    whyWrong: "",
    nextStep: ""
  },
  s6_causes: {
    full: "Right: identify the reversible causes, here the low potassium and the QT-prolonging drugs.",
    guideline: "Tachyarrhythmia: identify and treat reversible causes",
    src: "tdpCauses",
    flag: 1,
    outcome: "Right: identify the reversible causes, here the low potassium and the QT-prolonging drugs.",
    whyWrong: "",
    nextStep: ""
  },
  s6_amio: {
    full: "Avoid amiodarone in polymorphic VT with QT prolongation (RCUK). In this simulation the runs become sustained and the patient loses their pulse.",
    guideline: "Tachyarrhythmia: polymorphic VT, avoid amiodarone",
    src: "tdp",
    flag: 1,
    outcome: "In this simulation the runs become sustained and the patient loses their pulse.",
    whyWrong: "Avoid amiodarone in polymorphic VT with QT prolongation (RCUK).",
    nextStep: ""
  },
  s6_pace: {
    full: "Temporary pacing to increase heart rate is a listed option on the tachyarrhythmia algorithm for polymorphic VT with QT prolongation, alongside magnesium and isoprenaline. The algorithm also says to avoid amiodarone.",
    guideline: "Tachyarrhythmia: consider isoprenaline or temporary pacing",
    src: "tdp",
    flag: 1,
    outcome: "Temporary pacing started to increase the heart rate, a listed option in torsades.",
    whyWrong: "",
    nextStep: ""
  },
  s6_paceAgain: {
    full: "Temporary pacing is already running.",
    guideline: "Tachyarrhythmia: consider isoprenaline or temporary pacing",
    src: "tdp",
    flag: 0,
    outcome: "Temporary pacing is already running.",
    whyWrong: "",
    nextStep: ""
  },
  s6_iso: {
    full: "Isoprenaline is a listed option on the tachyarrhythmia algorithm for polymorphic VT with QT prolongation, to increase heart rate, alongside magnesium and temporary pacing.",
    guideline: "Tachyarrhythmia: consider isoprenaline or temporary pacing",
    src: "tdp",
    flag: 1,
    outcome: "Isoprenaline started to increase the heart rate, a listed option in torsades.",
    whyWrong: "",
    nextStep: ""
  },
  s6_isoAgain: {
    full: "An isoprenaline infusion is already running.",
    guideline: "Tachyarrhythmia: consider isoprenaline or temporary pacing",
    src: "tdp",
    flag: 0,
    outcome: "An isoprenaline infusion is already running.",
    whyWrong: "",
    nextStep: ""
  },
  s6_sync: {
    full: "The runs are brief and self-terminating with a pulse between them. The algorithm step for polymorphic VT with long QT is magnesium, not cardioversion.",
    guideline: "Tachyarrhythmia: polymorphic VT with QT prolongation",
    src: "tdp",
    flag: 1,
    outcome: "",
    whyWrong: "The runs are brief and self-terminating with a pulse between them, so cardioversion is not the step for this rhythm now.",
    nextStep: "The algorithm step for polymorphic VT with long QT is magnesium, not cardioversion."
  },
  s6_arrestShock: {
    full: "Pulseless sustained torsades treated as VF: unsynchronised shock delivered. Sinus rhythm with a pulse returns, but the QT is still long: give magnesium.",
    guideline: "ALS: shockable, shock",
    src: "shock",
    flag: 1,
    outcome: "Pulseless sustained torsades treated as VF: unsynchronised shock delivered. Sinus rhythm with a pulse has returned.",
    whyWrong: "",
    nextStep: "The QT is still long: give magnesium."
  },
  s6_arrestCPR: {
    full: "CPR is right in arrest, but pulseless polymorphic VT on a monitored patient needs a shock first.",
    guideline: "ALS: early defibrillation",
    src: "alsPriority",
    flag: 1,
    outcome: "",
    whyWrong: "CPR is right in arrest, but this pulseless polymorphic VT occurred on a monitored patient, so compressions were not the first action needed.",
    nextStep: "A shock is needed first."
  },
  n_due1: {
    full: "Something in the algorithm is overdue. A key step has not been done yet.",
    guideline: "",
    src: "als",
    flag: 0,
    outcome: "Something in the algorithm is overdue.",
    whyWrong: "",
    nextStep: ""
  },
  n_due2: {
    full: "Something in the algorithm is still overdue. Review the category below, then act.",
    guideline: "",
    src: "als",
    flag: 0,
    outcome: "Something in the algorithm is still overdue.",
    whyWrong: "",
    nextStep: ""
  },
  n_dueEnd: {
    full: "Scenario ended: key step missed. The debrief names the missed step and quotes the guideline.",
    guideline: "",
    src: "als",
    flag: 0,
    outcome: "Scenario ended: key step missed.",
    whyWrong: "",
    nextStep: ""
  },
  n_capEnd: {
    full: "Scenario ended: too many cycles without a resolution. The debrief lists missed key steps and quotes the guideline.",
    guideline: "",
    src: "als",
    flag: 0,
    outcome: "Scenario ended: too many cycles without a resolution.",
    whyWrong: "",
    nextStep: ""
  },
  n_reg: {
    full: "The registrar has given a category-level hint.",
    guideline: "",
    src: "als",
    flag: 0,
    outcome: "",
    whyWrong: "",
    nextStep: ""
  }  ,
  n_skip: {
    full: "Two minutes of CPR completed. The rhythm is on the monitor. Interpret it and choose the next action. A pulse check is a separate step if an organised rhythm appears.",
    guideline: "ALS: minimise interruptions; CPR for 2 min",
    src: "alsPriority",
    flag: 1,
    outcome: "Two minutes of CPR completed. The rhythm is on the monitor.",
    whyWrong: "",
    nextStep: "If the rhythm is shockable, defibrillate without a pulse check. If an organised rhythm appears, check for a pulse and signs of life."
  },
  n_noPulse: {
    full: "No pulse is present.",
    guideline: "ALS: organised rhythm, check pulse",
    src: "als",
    flag: 0,
    outcome: "No pulse is present.",
    whyWrong: "",
    nextStep: ""
  }
};

/* ===== Additional scenarios (listed in the picker; listTitle is the non-spoiler card title) =====
   Sourced to RCUK 2025 ALS / special circumstances, tachy and brady algorithms
   (tachy V3 March 2026), and BNF monographs. Scripted shortcuts are tagged
   as simulation simplifications. */
Object.assign(SRC, {
  hyperkArrest: "RCUK 2025 Special circumstances guidelines (27 Oct 2025): in hyperkalaemic cardiac arrest, administer 10 mL 10% calcium chloride IV and 50 mmol sodium bicarbonate IV, through separate lines or with a flush in between. BNF calcium chloride (acute severe hyperkalaemia with ECG changes): 10 mL of calcium chloride 10%, repeat if no improvement in the ECG within 5 to 10 minutes.",
  chestDecomp: "RCUK 2025 Special circumstances guidelines: always address tension pneumothorax among the reversible causes; where appropriate, prioritise treating reversible causes, even if chest compressions are briefly interrupted. In traumatic cardiac arrest, early and aggressive management of reversible causes (for example haemorrhage control, airway management, chest decompression) is essential for survival.",
  afEnergy: "RCUK 2025 Adult ALS guideline (peri-arrest): for atrial fibrillation, an initial synchronised shock at maximum defibrillator output, rather than an escalating approach, is a reasonable strategy based on current data.",
  broadStable: "RCUK Adult tachyarrhythmia algorithm (updated March 2026): broad and regular: treat as VT; synchronised shock(s); if sedation or anaesthesia risk is too high consider drug treatments: procainamide 10 to 15 mg/kg over 20 min, or if procainamide is not available or contraindicated give amiodarone 300 mg IV over 10 to 60 min, then 900 mg IV over 24 h; if drugs are ineffective, synchronised shock(s) with expert advice.",
  bradyRisk: "RCUK 2025 Adult bradyarrhythmia algorithm: after a satisfactory response, or when there are no current life-threatening features, ask whether there is a risk of asystole (recent asystole; Mobitz II AV block; complete heart block with broad QRS; ventricular pause greater than 3 s). If yes: seek expert help; monitor, treat the underlying cause and consider transvenous pacing.",
  amioInf: "RCUK Adult tachyarrhythmia algorithm (updated March 2026): for stable broad and regular tachycardia, treat as VT: synchronised shock(s). If sedation or anaesthesia risk is too high consider drug treatments: give procainamide 10 to 15 mg/kg over 20 min; if procainamide is not available or contraindicated give amiodarone 300 mg IV over 10 to 60 min, then 900 mg IV over 24 h."
});
Object.assign(PHYS, {
  asys: "Asystole means no organised ventricular depolarisation, so there is no mechanical output.",
  hyperk: "High extracellular potassium reduces the resting membrane potential (it becomes less negative), inactivates fast sodium channels and slows conduction. Pacemaker cells can stop firing altogether: asystole. Calcium antagonises that membrane effect without immediately lowering the serum potassium.",
  roscHyperk: "Calcium has antagonised the membrane effect of high potassium, so depolarisation and contraction can resume. The potassium itself has not yet been shifted or removed.",
  tension: "A tension pneumothorax raises intrathoracic pressure, kinks great veins and collapses venous return. Preload falls so far that organised electrical activity produces no palpable pulse (PEA).",
  roscTension: "Decompressing the chest lets the lung re-expand, intrathoracic pressure falls and venous return is restored, so each beat again ejects a palpable stroke volume.",
  vfToAsys: "After a shock, the myocardium may have no organised activity left: asystole rather than a perfusing rhythm. This is now a non-shockable arrest.",
  aden18: "A larger adenosine bolus blocks the AV node for a little longer, so this time the re-entry circuit is interrupted and the SA node takes over.",
  aden12fail: "The 12 mg bolus still did not block the AV node for long enough to break the circuit.",
  afSync: "A synchronised shock timed to the R wave depolarises the atria and ventricles together, extinguishing the multiple wavelets of atrial fibrillation so that sinus rhythm can resume.",
  amioInf: "A slower intravenous load of amiodarone prolongs refractoriness in ventricular muscle and can terminate monomorphic VT, or make it less likely to continue, without using the cardiac-arrest bolus.",
  adrInf: "An adrenaline infusion at 2 to 10 mcg/min supports heart rate and blood pressure through beta-1 and some alpha-1 effects, as an interim measure while pacing is arranged.",
  iso: "Isoprenaline is a beta agonist that speeds the escape pacemaker and can raise the ventricular rate as an interim measure."
});
Object.assign(PHYS_LIVE, {
  vfToAsys: "After the shock there is no organised ventricular activity: the rhythm is now asystole.",
  hyperk: "High extracellular potassium inactivates fast sodium channels and can stop pacemaker cells firing: asystole.",
  tension: "High pressure in the chest has collapsed venous return, so organised electrical activity produces no pulse.",
  aden12fail: "This dose did not block the AV node for long enough to break the circuit."
});

function T(full, guideline, src, extra) {
  extra = extra || {};
  return {
    full: full,
    guideline: guideline,
    src: src,
    flag: extra.flag === 0 ? 0 : 1,
    outcome: extra.outcome != null ? extra.outcome : "",
    whyWrong: extra.whyWrong || "",
    nextStep: extra.nextStep || ""
  };
}

Object.assign(TXT, {
  a_decompress: T("Chest decompression is for tension pneumothorax. Nothing in this scene suggests that.", "ALS: reversible causes", "causes", { whyWrong: "Chest decompression is for tension pneumothorax. Nothing in this scene suggests that." }),
  a_amioInf: T("A slow amiodarone infusion is not a step in the cardiac arrest algorithm.", "ALS: antiarrhythmic drugs", "amio", { whyWrong: "A slow amiodarone infusion is not a step in the cardiac arrest algorithm." }),
  a_adrInf: T("An adrenaline infusion is not the arrest dose. In cardiac arrest, adrenaline is given as 1 mg IV.", "ALS: adrenaline", "adrNon", { whyWrong: "An adrenaline infusion is not the arrest dose used in cardiac arrest." }),
  a_iso: T("Isoprenaline is not part of the cardiac arrest algorithm.", "ALS algorithm: drugs in arrest", "noAtroArrest", { whyWrong: "Isoprenaline is not part of the cardiac arrest algorithm." }),
  p_decompress: T("Chest decompression is not a step in the peri-arrest arrhythmia algorithms.", "Peri-arrest algorithms", "tachy", { whyWrong: "Chest decompression is not a step in the peri-arrest arrhythmia algorithms." }),
  p_amioInf: T("A slow amiodarone infusion is not the step for this presentation.", "Tachyarrhythmia algorithm", "broadStable", { whyWrong: "A slow amiodarone infusion is not the step for this presentation." }),
  p_adrInf: T("An adrenaline infusion is an interim measure for bradycardia, not a step here.", "Bradyarrhythmia algorithm", "brady", { whyWrong: "An adrenaline infusion is not a step for this presentation." }),
  p_iso: T("Isoprenaline is an interim measure for bradycardia or for pulsed torsades, not a step here.", "Peri-arrest algorithms", "brady", { whyWrong: "Isoprenaline is not a step for this presentation." }),

  h1_assess: T("Asystole: a non-shockable arrest. Confirm the leads, the gain and that this is true asystole, then resume CPR and give adrenaline as soon as possible.", "ALS: non-shockable", "adrNon", { outcome: "Asystole: a non-shockable arrest. Confirm the leads, the gain and that this is true asystole.", nextStep: "Resume CPR and give adrenaline as soon as possible." }),
  h1_cpr: T("CPR 30:2 is under way. In a non-shockable arrest, adrenaline 1 mg is due as soon as possible, and reversible causes should be treated.", "ALS: non-shockable", "adrNon", { outcome: "CPR 30:2 is under way.", nextStep: "In a non-shockable arrest, adrenaline 1 mg is due as soon as possible, and reversible causes should be treated." }),
  h1_shock: T("Do not shock asystole. It is a non-shockable rhythm.", "ALS: non-shockable", "als", { whyWrong: "This is asystole, a non-shockable rhythm, so a shock will not help." }),
  h1_causes: T("The history (missed dialysis, a very high potassium) points to hyperkalaemia as the reversible cause.", "ALS: identify and treat reversible causes", "causes", { outcome: "The history (missed dialysis, a very high potassium) points to hyperkalaemia as the reversible cause." }),
  h1_calcium: T("Calcium chloride 10 mL of 10% IV given in hyperkalaemic cardiac arrest, to antagonise the membrane effect of high potassium. RCUK 2025 special circumstances also include 50 mmol sodium bicarbonate IV through a separate line. Insulin-glucose is used to shift potassium but is not modelled as a separate action here (simulation simplification).", "Special circumstances: hyperkalaemic cardiac arrest", "hyperkArrest", { outcome: "Calcium chloride 10 mL of 10% IV given in hyperkalaemic cardiac arrest, to antagonise the membrane effect of high potassium.", nextStep: "RCUK 2025 special circumstances also include 50 mmol sodium bicarbonate IV through a separate line. Continue ALS." }),
  h1_calciumEarly: T("Calcium chloride is the right drug if this arrest is caused by hyperkalaemia. Naming the reversible cause first keeps the team aligned, but the dose itself is still indicated.", "Special circumstances: hyperkalaemic cardiac arrest", "hyperkArrest", { outcome: "Calcium chloride given.", whyWrong: "The reversible cause had not yet been named, but calcium is still indicated if hyperkalaemia is the cause." }),
  h1_bicarb: T("Sodium bicarbonate 50 mmol is included with calcium in the RCUK 2025 special-circumstances treatment of hyperkalaemic cardiac arrest, through a separate line or with a flush in between. It is not required to complete this simulation (simulation simplification).", "Special circumstances: hyperkalaemic cardiac arrest", "hyperkArrest", { outcome: "Sodium bicarbonate given, which is included in the special-circumstances treatment of hyperkalaemic cardiac arrest.", nextStep: "It is not required to complete this simulation." }),
  h1_rosc: T("A pulse has returned. Immediately after ROSC: ABCDE assessment, aim SpO2 94 to 98% and a normal PaCO2, systolic blood pressure over 100 mmHg, a 12-lead ECG, identify and treat the cause, and temperature control. The potassium still needs to be shifted and removed.", "ALS: immediately after ROSC", "rosc", { outcome: "A pulse has returned.", nextStep: "Immediately after ROSC: ABCDE assessment, aim SpO2 94 to 98% and a normal PaCO2, systolic blood pressure over 100 mmHg, a 12-lead ECG, identify and treat the cause, and temperature control." }),

  h2_assess: T("Pulseless electrical activity: an organised rhythm but no pulse. This is a non-shockable arrest.", "ALS: non-shockable", "adrNon", { outcome: "Pulseless electrical activity: an organised rhythm but no pulse.", nextStep: "Resume CPR and give adrenaline as soon as possible, and treat the reversible cause." }),
  h2_causes: T("The sudden arrest after a central line, with a deviated trachea and no air entry on one side, is tension pneumothorax.", "ALS: identify and treat reversible causes", "causes", { outcome: "The sudden arrest after a central line, with a deviated trachea and no air entry on one side, is tension pneumothorax." }),
  h2_decomp: T("Chest decompression (needle or thoracostomy) is performed to relieve the tension. RCUK 2025 special circumstances list chest decompression among the time-critical treatments of reversible causes. The precise technique is a local-protocol decision (see flagged items).", "Special circumstances: chest decompression", "chestDecomp", { outcome: "Chest decompression is performed to relieve the tension." }),
  h2_decompEarly: T("Chest decompression is the right treatment if this is tension pneumothorax. Naming the reversible cause first keeps the team aligned, but decompression should not be delayed.", "Special circumstances: chest decompression", "chestDecomp", { outcome: "Chest decompression performed.", whyWrong: "The reversible cause had not yet been named, but decompression should not be delayed if tension pneumothorax is clear." }),
  h2_shock: T("Do not shock PEA. It is a non-shockable rhythm.", "ALS: non-shockable", "als", { whyWrong: "This is PEA, a non-shockable rhythm, so a shock will not help." }),
  h2_rosc: T("A pulse has returned after the chest was decompressed. Immediately after ROSC: ABCDE assessment and post-ROSC care, and complete the chest drainage as local practice requires.", "ALS: immediately after ROSC", "rosc", { outcome: "A pulse has returned after the chest was decompressed.", nextStep: "ABCDE assessment and post-ROSC care." })
});

Object.assign(TXT, {
  h3_checkLater: T("Still VF after five shocks. Continue the shockable algorithm: adrenaline every 3 to 5 minutes, and high-quality CPR with further shocks.", "ALS: shockable, adrenaline every 3 to 5 min", "adrShock", { outcome: "Still VF after five shocks.", nextStep: "Continue the shockable algorithm: adrenaline every 3 to 5 minutes, and high-quality CPR with further shocks." }),
  h3_amio150Note: T("Teaching note: the ALS algorithm poster says to give amiodarone after 3 shocks. It does not mention a further 150 mg after five shocks. That further dose is in the 2025 Adult ALS guideline text, and it remains a reasonable optional action in this case.", "RCUK 2025 Adult ALS algorithm; RCUK 2025 Adult ALS guideline", "amio", { outcome: "", nextStep: "" }),
  h3_rosc: T("A pulse has returned after a prolonged shockable arrest. Immediately after ROSC: ABCDE assessment, aim SpO2 94 to 98% and a normal PaCO2, systolic blood pressure over 100 mmHg, a 12-lead ECG, identify and treat the cause, and temperature control.", "ALS: immediately after ROSC", "rosc", { outcome: "A pulse has returned after a prolonged shockable arrest.", nextStep: "Immediately after ROSC: ABCDE assessment and the usual post-ROSC targets." }),
  h4_asys: T("Rhythm change: asystole, still no pulse. This is now a non-shockable arrest. Do not keep shocking. Give adrenaline 1 mg as soon as possible and continue CPR.", "ALS: non-shockable", "adrNon", { outcome: "Rhythm change: asystole, still no pulse.", nextStep: "This is now a non-shockable arrest. Give adrenaline 1 mg as soon as possible and continue CPR." }),
  h4_shockAsys: T("The rhythm is now asystole. Do not shock a non-shockable rhythm.", "ALS: non-shockable", "als", { whyWrong: "The rhythm is now asystole, so a further shock will not help." }),
  h4_rosc: T("A pulse has returned, now in an organised rhythm. Immediately after ROSC: ABCDE assessment and the usual post-ROSC targets.", "ALS: immediately after ROSC", "rosc", { outcome: "A pulse has returned, now in an organised rhythm.", nextStep: "ABCDE assessment and the usual post-ROSC targets." }),
  h5_assess: T("A regular narrow-complex tachycardia in a stable patient: no shock, syncope, ischaemia, heart failure or recent ROSC.", "Tachyarrhythmia: stable, narrow and regular", "narrow", { outcome: "A regular narrow-complex tachycardia in a stable patient: no life-threatening features." }),
  h5_aden18: T("Adenosine 18 mg (RCUK; the BNF third dose is 12 mg) given after 6 mg and 12 mg. The circuit breaks and sinus rhythm returns. The two sources differ on the third dose (already flagged). The RCUK algorithm poster does not set a timed gap between adenosine doses. The BNF advises 1 to 2 minutes between increments. That interval is a teaching note only and is not marked.", "Tachyarrhythmia: adenosine 18 mg", "aden", { outcome: "Adenosine 18 mg given after 6 mg and 12 mg. The circuit breaks and sinus rhythm returns." }),
  h5_aden12fail: T("Adenosine 12 mg given. The tachycardia continues. RCUK uses a third dose of 18 mg; the BNF repeats 12 mg. The RCUK algorithm poster does not set a timed gap between adenosine doses. The BNF advises 1 to 2 minutes between increments. That interval is a teaching note only and is not marked.", "Tachyarrhythmia: adenosine", "aden", { outcome: "Adenosine 12 mg given. The tachycardia continues.", nextStep: "RCUK uses a third dose of 18 mg; the BNF repeats 12 mg." }),
  h6_assess: T("Atrial fibrillation with a rapid ventricular rate, and life-threatening features (shock and myocardial ischaemia). This is an unstable tachyarrhythmia.", "Tachyarrhythmia: unstable", "tachy", { outcome: "Atrial fibrillation with a rapid ventricular rate, and life-threatening features (shock and myocardial ischaemia)." }),
  h6_sync1: T("Synchronised shock delivered. For atrial fibrillation, RCUK 2025 says an initial synchronised shock at maximum defibrillator output is a reasonable strategy. Energy selection is not modelled numerically here (simulation simplification). The rhythm has not yet changed.", "Tachyarrhythmia: unstable, synchronised shock; AF energy", "afEnergy", { outcome: "Synchronised shock delivered. The rhythm has not yet changed." }),
  h6_sync2: T("A further synchronised shock. Sinus rhythm is restored. Anticoagulation if the arrhythmia has lasted more than 24 hours is on the stable AF pathway and is not modelled as a separate action here (simulation simplification).", "Tachyarrhythmia: synchronised shock, up to 3 attempts", "tachy", { outcome: "A further synchronised shock. Sinus rhythm is restored." }),
  h6_aden: T("Adenosine is for a stable, regular narrow-complex tachycardia without pre-excitation. This is irregular, and the patient is unstable.", "Tachyarrhythmia: adenosine if no pre-excitation, regular narrow", "narrow", { whyWrong: "Adenosine is not the treatment for unstable, irregular narrow-complex tachycardia." }),
  h6_vagal: T("Vagal manoeuvres are for a stable regular narrow-complex tachycardia. This patient has life-threatening features, so electrical cardioversion is preferred.", "Tachyarrhythmia: unstable", "tachy", { whyWrong: "Vagal manoeuvres are not the treatment for an unstable tachyarrhythmia." }),
  h7_assess: T("A regular broad-complex tachycardia in a stable patient. Treat as VT unless a prior diagnosis of SVT with aberrancy is known.", "Tachyarrhythmia: broad and regular", "broadStable", { outcome: "A regular broad-complex tachycardia in a stable patient. Treat as VT unless a prior diagnosis of SVT with aberrancy is known." }),
  h7_amioInf: T("Partly right. The Adult tachyarrhythmia algorithm (V3 March 2026) says, for stable broad and regular tachycardia: treat as VT: synchronised shock(s). If sedation or anaesthesia risk is too high consider drug treatments: give procainamide 10 to 15 mg/kg over 20 min; if procainamide is not available or contraindicated give amiodarone 300 mg IV over 10 to 60 min, then 900 mg IV over 24 h. In this case sedation or anaesthesia risk is not described as too high, so synchronised cardioversion with careful sedation or anaesthesia is first-line. A 900 mg infusion over 24 hours would usually follow if amiodarone is used (simulation simplification: not modelled as a separate action). The tachycardia slows and then returns to sinus rhythm.", "Tachyarrhythmia: broad and regular, synchronised shock first", "broadStable", { outcome: "Amiodarone 300 mg IV over 10 to 60 min given. The tachycardia slows and then returns to sinus rhythm.", whyWrong: "Synchronised shock(s) come first on the stable broad-and-regular pathway. Drug treatment is only if sedation or anaesthesia risk is too high, and then procainamide is first; amiodarone is if procainamide is not available or contraindicated." }),
  h7_amioBolus: T("The cardiac-arrest bolus of amiodarone 300 mg is not the stable-pathway dose. For stable broad and regular tachycardia the load is 300 mg IV over 10 to 60 min.", "Tachyarrhythmia: amiodarone 300 mg IV over 10 to 60 min", "amioInf", { whyWrong: "The cardiac-arrest bolus of amiodarone 300 mg is not the dose or rate used on the stable broad-complex pathway." }),
  h7_sync: T("Synchronised cardioversion is the first-line treatment on the Adult tachyarrhythmia algorithm (V3 March 2026) for stable broad and regular tachycardia treated as VT: synchronised shock(s). Careful sedation or anaesthesia is used if the patient is conscious. Drug treatments are only considered if sedation or anaesthesia risk is too high.", "Tachyarrhythmia: broad and regular, synchronised shock", "broadStable", { outcome: "Synchronised cardioversion. Sinus rhythm is restored." }),
  h7_aden: T("IV adenosine is only for suspected SVT with aberrant conduction in a stable patient. This case should be treated as VT.", "Tachyarrhythmia: suspected SVT with aberrant conduction", "broad", { whyWrong: "Adenosine is only for suspected SVT with aberrancy. This case should be treated as VT." }),
  h8_assess: T("Complete heart block with a broad QRS. There are no current life-threatening features, but this is a risk of asystole on the bradyarrhythmia algorithm (complete heart block with broad QRS).", "Bradyarrhythmia: risk of asystole", "bradyRisk", { outcome: "Complete heart block with a broad QRS. There are no current life-threatening features, but this is a risk of asystole." }),
  h8_atro1: T("Atropine 500 micrograms IV given. The ventricular rate has barely changed. This is marked Partly right. The RCUK 2025 Adult ALS guideline says: 'Do not give atropine to patients with high-degree atrioventricular block and wide QRS. It is ineffective and may worsen the block.' Seek expert help and start transcutaneous pacing, or an adrenaline or isoprenaline infusion.", "Do not give atropine to patients with high-degree atrioventricular block and wide QRS. It is ineffective and may worsen the block.", "bradyWide", { outcome: "Atropine 500 micrograms IV given. The ventricular rate has barely changed.", whyWrong: "Do not give atropine to patients with high-degree atrioventricular block and wide QRS. It is ineffective and may worsen the block.", nextStep: "Seek expert help and start transcutaneous pacing, or an adrenaline or isoprenaline infusion." }),
  h8_atroRepeat: T("Further atropine 500 micrograms given. This is still marked Partly right. The RCUK 2025 Adult ALS guideline says: 'Do not give atropine to patients with high-degree atrioventricular block and wide QRS. It is ineffective and may worsen the block.' Seek expert help and start transcutaneous pacing, or an adrenaline or isoprenaline infusion.", "Do not give atropine to patients with high-degree atrioventricular block and wide QRS. It is ineffective and may worsen the block.", "bradyWide", { outcome: "Further atropine 500 micrograms given. There is still no useful response.", whyWrong: "Do not give atropine to patients with high-degree atrioventricular block and wide QRS. It is ineffective and may worsen the block.", nextStep: "Seek expert help and start transcutaneous pacing, or an adrenaline or isoprenaline infusion." }),
  h8_pace: T("Transcutaneous pacing started as a bridge to transvenous pacing. Seek expert help and consider transvenous pacing.", "Bradyarrhythmia: interim measures, transcutaneous pacing", "pacing", { outcome: "Transcutaneous pacing started as a bridge to transvenous pacing.", nextStep: "Seek expert help and consider transvenous pacing." }),
  h8_guideNote: T("Atropine in broad-complex complete heart block is marked Partly right. The RCUK 2025 Adult ALS guideline says: 'Do not give atropine to patients with high-degree atrioventricular block and wide QRS. It is ineffective and may worsen the block.' Pacing (or an adrenaline or isoprenaline infusion) and expert help are the required steps. The bradyarrhythmia algorithm still lists atropine as an interim measure, but this case follows the guideline when the two differ.", "RCUK 2025 Adult ALS guideline", "bradyWide", { outcome: "", nextStep: "" }),
  h8_adrInf: T("Adrenaline infusion 2 to 10 mcg/min started as an interim measure. Seek expert help and arrange pacing.", "Bradyarrhythmia: interim measures, adrenaline 2 to 10 mcg/min", "brady", { outcome: "Adrenaline infusion 2 to 10 mcg/min started as an interim measure.", nextStep: "Seek expert help and arrange pacing." }),
  h8_iso: T("Isoprenaline infusion 5 mcg/min started as an interim measure. Seek expert help and arrange pacing.", "Bradyarrhythmia: interim measures, isoprenaline 5 mcg/min", "brady", { outcome: "Isoprenaline infusion 5 mcg/min started as an interim measure.", nextStep: "Seek expert help and arrange pacing." }),
  h8_expert: T("Expert help sought. In a patient at risk of asystole, consider transvenous pacing and treat the underlying cause.", "Bradyarrhythmia: risk of asystole, seek expert help", "bradyRisk", { outcome: "Expert help sought.", nextStep: "Consider transvenous pacing and treat the underlying cause." }),
  h8_observe: T("Do not simply observe. Complete heart block with a broad QRS is a risk of asystole: seek expert help and arrange interim measures or pacing.", "Bradyarrhythmia: risk of asystole", "bradyRisk", { whyWrong: "This is a risk of asystole, so observation alone is not the step." }),
  h9_assess: T("Pulseless polymorphic VT (torsades de pointes): this is a cardiac arrest. Treat it as a shockable rhythm, and give magnesium.", "ALS: early defibrillation; tachyarrhythmia: Mg2+ 8 mmol", "tdp", { outcome: "Pulseless polymorphic VT (torsades de pointes): this is a cardiac arrest.", nextStep: "Treat it as a shockable rhythm, and give magnesium." }),
  h9_shock: T("Unsynchronised shock delivered for pulseless polymorphic VT. Resume CPR immediately. Magnesium 8 mmol (2 g) IV is the specific treatment for torsades with QT prolongation.", "ALS: shockable; tachyarrhythmia: Mg2+ 8 mmol", "tdp", { outcome: "Unsynchronised shock delivered for pulseless polymorphic VT. Resume CPR immediately.", nextStep: "Magnesium 8 mmol (2 g) IV is the specific treatment for torsades with QT prolongation." }),
  h9_mg: T("Magnesium 8 mmol (2 g) IV given for polymorphic VT with QT prolongation. Avoid amiodarone.", "Tachyarrhythmia: Mg2+ 8 mmol IV over 10 min; avoid amiodarone", "tdp", { outcome: "Magnesium 8 mmol (2 g) IV given for polymorphic VT with QT prolongation." }),
  h9_mgOnly: T("Magnesium is the right specific drug, but this patient has no pulse, so unsynchronised defibrillation is also needed.", "ALS: early defibrillation", "alsPriority", { outcome: "Magnesium given.", whyWrong: "The patient has no pulse, so defibrillation is also needed." }),
  h9_sync: T("Synchronise only when there is a pulse to time to. Pulseless polymorphic VT is treated with unsynchronised shocks, like VF.", "ALS: early defibrillation", "alsPriority", { whyWrong: "There is no pulse to synchronise to. Pulseless polymorphic VT is treated with unsynchronised shocks." }),
  h9_rosc: T("A pulse has returned, now in a slow sinus rhythm with a long QT. Identify and treat reversible causes (electrolytes, QT-prolonging drugs).", "ALS: immediately after ROSC", "rosc", { outcome: "A pulse has returned, now in a slow sinus rhythm with a long QT.", nextStep: "Identify and treat reversible causes (electrolytes, QT-prolonging drugs)." }),
  h10_assess: T("Immediately post-ROSC is itself a life-threatening feature on the tachyarrhythmia algorithm. The patient now has a regular broad-complex tachycardia and hypotension: this is unstable VT.", "Tachyarrhythmia: immediately post-ROSC; unstable", "tachy", { outcome: "Immediately post-ROSC is a life-threatening feature. The patient now has a regular broad-complex tachycardia and hypotension: this is unstable VT." }),
  h10_sync: T("Synchronised shock in an unstable patient immediately after ROSC. Sinus rhythm is restored. Continue ABCDE and the usual post-ROSC targets (SpO2 94 to 98%, systolic blood pressure over 100 mmHg, 12-lead ECG, treat the cause, temperature control).", "Tachyarrhythmia: unstable, synchronised shock; immediately after ROSC", "rosc", { outcome: "Synchronised shock in an unstable patient immediately after ROSC. Sinus rhythm is restored.", nextStep: "Continue ABCDE and the usual post-ROSC targets." }),
  h10_amio: T("Do not start with an anti-arrhythmic infusion while life-threatening features are present. Electrical cardioversion is preferred in the unstable patient, including immediately after ROSC.", "Tachyarrhythmia: unstable, synchronised shock", "tachy", { whyWrong: "Electrical cardioversion is preferred while life-threatening features are present, including immediately after ROSC." })
});

Object.assign(TXT, {
  aden_wrongDose: T("Partly right: check the adenosine sequence.", "Tachyarrhythmia: adenosine 6 mg, then 12 mg, then 18 mg", "aden", { outcome: "Adenosine given.", whyWrong: "Check the adenosine sequence." }),
  aden_after18: T("Further adenosine is not the next step once 6 mg, 12 mg and 18 mg have already been given.", "Tachyarrhythmia: adenosine 6 mg, then 12 mg, then 18 mg", "aden", { whyWrong: "The RCUK sequence has already been completed." }),
  h1_calciumSlow: T("In cardiac arrest the Resuscitation Council UK special-circumstances guidance is a 10 mL bolus of 10% calcium chloride. Giving the same dose over 5 minutes is not the arrest bolus.", "Special circumstances: hyperkalaemic cardiac arrest", "hyperkArrest", { outcome: "Calcium chloride 10 mL of 10% IV given over 5 minutes.", whyWrong: "In arrest, give 10 mL of 10% calcium chloride as a bolus." }),
  h7_procain: T("Procainamide can convert this rhythm, but in this case sedation or anaesthesia risk is not described as too high. The Adult tachyarrhythmia algorithm (V3 March 2026) lists synchronised shock(s) first for stable broad and regular tachycardia treated as VT. Drug treatments are only if sedation or anaesthesia risk is too high. Not stocked in many UK hospitals; follow local protocol.", "Tachyarrhythmia: broad and regular, synchronised shock first if sedation risk is not too high", "procain", { outcome: "Procainamide started.", whyWrong: "Sedation or anaesthesia risk is not too high here, so synchronised cardioversion is first." }),
  h9_kcl: T("Potassium chloride 20 mmol IV over 2 to 3 min, then 10 mmol over 2 min, is the Resuscitation Council UK hypokalaemic cardiac arrest bolus. This case already has a pulse-less polymorphic VT treated as a shockable arrest; magnesium remains the specific antiarrhythmic step, and this potassium bolus is an additional correct treatment of the underlying hypokalaemia.", "Special circumstances: hypokalaemic cardiac arrest", "special", { outcome: "Potassium chloride arrest bolus given." }),
  amio150_first: T("Partly right: amiodarone 150 mg is the further arrest dose after five shocks, once 300 mg has already been given.", "ALS: amiodarone 150 mg after five shocks", "amio", { outcome: "Amiodarone 150 mg IV given.", whyWrong: "Give 300 mg after three shocks first." }),
  lido_100: T("Lidocaine 100 mg IV may be used as an alternative if amiodarone is not available or a local decision has been made to use lidocaine instead of amiodarone.", "ALS: lidocaine as an alternative to amiodarone after three shocks", "lido", { outcome: "Lidocaine 100 mg IV given." }),
  lido_50: T("An additional bolus of lidocaine 50 mg can also be given after five defibrillation attempts.", "ALS: lidocaine 50 mg after five shocks", "lido", { outcome: "Lidocaine 50 mg IV given." }),
  lido_early: T("Lidocaine, like amiodarone, is given after a total of three shocks in a shockable arrest.", "ALS: antiarrhythmic drugs after three shocks", "lido", { whyWrong: "This antiarrhythmic is due after the third shock." }),
  lido_50early: T("The additional lidocaine 50 mg bolus is for after five defibrillation attempts, and after the 100 mg dose.", "ALS: lidocaine 50 mg after five shocks", "lido", { whyWrong: "The further lidocaine dose is after five shocks, once 100 mg has been given." }),
  lido_already: T("An antiarrhythmic has already been given for this arrest. Do not combine amiodarone and lidocaine.", "ALS: lidocaine as an alternative to amiodarone", "lido", { whyWrong: "Use lidocaine as an alternative to amiodarone, not in addition to it." }),
  padsAP_ok: T("After a failed third shock, prepare to place a fresh set of pads in the anterior-posterior position at the time of the following rhythm check.", "ALS: defibrillation vector change in refractory VF", "alsPriority", { outcome: "Pads changed to the antero-posterior position." }),
  padsAP_early: T("A defibrillation vector change is considered for refractory VF after three consecutive shocks, once antero-lateral pad position has been checked.", "ALS: defibrillation vector change in refractory VF", "alsPriority", { whyWrong: "This pad change is considered after a failed third shock." }),
  a_procain: T("Procainamide is not the next step in this arrest.", "Tachyarrhythmia algorithm: peri-arrest use", "procain", { whyWrong: "This is a cardiac arrest: use the ALS drug steps." }),
  p_procain: T("Procainamide is not the first treatment in this case.", "Tachyarrhythmia algorithm", "procain", { whyWrong: "Check the tachyarrhythmia algorithm for this rhythm and how stable the patient is." }),
  a_verap: T("Verapamil is not used in cardiac arrest.", "ALS: drugs in arrest", "alsPriority", { whyWrong: "Verapamil is not an ALS arrest drug." }),
  p_verap: T("Verapamil is not the treatment for this presentation.", "Tachyarrhythmia algorithm", "tachy", { whyWrong: "Check whether a calcium-channel blocker is indicated here." }),
  a_kcl: T("Potassium is not a routine cardiac arrest drug. The Resuscitation Council UK arrest bolus is for hypokalaemic cardiac arrest.", "ALS: do not routinely give other drugs; special circumstances for hypokalaemia", "special", { whyWrong: "Do not give a potassium bolus unless this is a hypokalaemic arrest." }),
  p_kcl: T("A potassium chloride arrest bolus is for hypokalaemic cardiac arrest only, not for a patient with a pulse.", "Special circumstances: hypokalaemic cardiac arrest", "special", { whyWrong: "A bolus is for cardiac arrest only." }),
  a_lido: T("Lidocaine is an alternative antiarrhythmic in a shockable arrest after the third shock, not a routine drug in this situation.", "ALS: lidocaine as an alternative to amiodarone", "lido", { whyWrong: "Lidocaine is not indicated here." }),
  p_lido: T("Lidocaine is not the treatment for this presentation.", "ALS and tachyarrhythmia algorithms", "lido", { whyWrong: "Lidocaine is not indicated here." }),
  a_fibrin: T("Fibrinolytic drugs are not routine in cardiac arrest. They are considered when pulmonary embolism is the suspected or confirmed cause.", "ALS: thrombolytic drugs", "special", { whyWrong: "Thrombolysis is not routine in cardiac arrest." }),
  p_fibrin: T("Fibrinolytic drugs are not the treatment for this presentation.", "ALS: thrombolytic drugs", "special", { whyWrong: "Thrombolysis is not indicated here." }),
  a_padsAP: T("Changing pad position is considered for refractory VF after three shocks, not in this situation.", "ALS: defibrillation vector change", "alsPriority", { whyWrong: "This pad change is not indicated here." }),
  p_padsAP: T("Changing pad position is not the treatment while this patient has a pulse.", "ALS: defibrillation vector change", "alsPriority", { whyWrong: "This pad change is for refractory shockable arrest." }),
  a_oxygen: T("Airway and oxygen matters in every arrest, but this action is scored as the specific treatment when hypoxia is the reversible cause.", "ALS: identify and treat reversible causes", "causes", { whyWrong: "Treat the reversible cause that fits this case." }),
  p_oxygen: T("This patient has a pulse; 100% oxygen and an airway check is not the scored next step here.", "ABCDE assessment", "alsPriority", { whyWrong: "This is not the next algorithm step here." }),
  a_pericardiocentesis: T("Pericardiocentesis is not the treatment for this arrest unless cardiac tamponade is the cause, and after recent cardiac surgery emergency re-sternotomy is the usual approach.", "Special circumstances: cardiac surgery; reversible causes", "special", { whyWrong: "This procedure is not indicated here." }),
  p_pericardiocentesis: T("Pericardiocentesis is not the treatment for this presentation.", "Special circumstances", "special", { whyWrong: "This procedure is not indicated here." }),
  a_resternotomy: T("Emergency re-sternotomy is for cardiac arrest after recent cardiac surgery, not for this arrest.", "Special circumstances: cardiac surgery", "special", { whyWrong: "Re-sternotomy is not indicated here." }),
  p_resternotomy: T("Emergency re-sternotomy is not the treatment for this presentation.", "Special circumstances: cardiac surgery", "special", { whyWrong: "Re-sternotomy is not indicated here." }),
  h11_assess: T("Narrow-complex complete heart block with life-threatening features (shock after syncope). The bradyarrhythmia algorithm starts with atropine 500 micrograms IV.", "Bradyarrhythmia: atropine for life-threatening features", "brady", { outcome: "Narrow-complex complete heart block with life-threatening features." }),
  h11_atro: T("Atropine 500 micrograms IV is given. In this case the ventricular rate rises and perfusion improves, so interim pacing is not required.", "Bradyarrhythmia: atropine 500 mcg IV", "brady", { outcome: "Atropine 500 micrograms IV given. The rate rises and perfusion improves." }),
  h11_pace: T("Transcutaneous pacing can be used as an interim measure, but in this narrow-complex complete heart block atropine is the first drug and it would have been expected to be tried first.", "Bradyarrhythmia: atropine first, then interim measures", "brady", { outcome: "Transcutaneous pacing started.", whyWrong: "Try atropine first in this narrow-complex complete heart block." }),
  h12_assess: T("Sinus bradycardia with life-threatening features. The bradyarrhythmia algorithm starts with atropine 500 micrograms IV.", "Bradyarrhythmia: atropine for life-threatening features", "brady", { outcome: "Sinus bradycardia with life-threatening features." }),
  h12_atro: T("Atropine 500 micrograms IV is given. In this case the sinus rate rises and perfusion improves.", "Bradyarrhythmia: atropine 500 mcg IV", "brady", { outcome: "Atropine 500 micrograms IV given. The sinus rate rises and perfusion improves." }),
  h12_pace: T("Transcutaneous pacing can be used as an interim measure, but atropine is the first drug in this sinus bradycardia and it would have been expected to be tried first.", "Bradyarrhythmia: atropine first, then interim measures", "brady", { outcome: "Transcutaneous pacing started.", whyWrong: "Try atropine first in this sinus bradycardia." }),
  h13_rosc: T("A pulse has returned after a prolonged shockable arrest. Continue ABCDE and the usual post-ROSC targets.", "ALS: immediately after ROSC", "rosc", { outcome: "A pulse has returned after a prolonged shockable arrest." }),
  h14_nowPea: T("The rhythm is now an organised narrow-complex rhythm with no pulse (PEA). Look for and treat a reversible cause.", "ALS: non-shockable, identify and treat reversible causes", "causes", { outcome: "The rhythm is now PEA." }),
  h14_rosc: T("A pulse has returned after treating hypovolaemia. Continue ABCDE and the usual post-ROSC targets.", "ALS: immediately after ROSC", "rosc", { outcome: "A pulse has returned after treating hypovolaemia." }),
  h14_shockPea: T("This is now PEA, a non-shockable rhythm. Do not shock it. Continue CPR and treat the reversible cause.", "ALS: shock only if the rhythm is shockable", "alsPriority", { whyWrong: "PEA is not a shockable rhythm." }),
  h15_causes: T("The sudden collapse after a long-haul flight, with breathlessness, points to thrombosis: pulmonary embolism, one of the 4 Ts.", "ALS: identify and treat reversible causes (thrombosis)", "causes", { outcome: "The sudden collapse after a long-haul flight, with breathlessness, points to thrombosis: pulmonary embolism." }),
  h16_causes: T("After recent cardiac surgery, with rising chest-drain output, cardiac tamponade is the reversible cause, one of the 4 Ts. Emergency re-sternotomy is the Resuscitation Council UK special-circumstances action.", "ALS: identify and treat reversible causes (tamponade); special circumstances: cardiac surgery", "causes", { outcome: "After recent cardiac surgery, with rising chest-drain output, cardiac tamponade is the reversible cause." }),
  h17_causes: T("The history of a difficult intubation, with deep cyanosis and poor chest movement, points to hypoxia, one of the 4 Hs. Confirm the tracheal tube and give 100% oxygen.", "ALS: identify and treat reversible causes (hypoxia)", "causes", { outcome: "The history of a difficult intubation, with deep cyanosis and poor chest movement, points to hypoxia." }),
  h18_causes: T("High-dose loop and thiazide diuretics with a potassium of 2.1 mmol/L point to hypokalaemia as the reversible cause, one of the 4 Hs.", "ALS: identify and treat reversible causes (hypokalaemia)", "causes", { outcome: "High-dose loop and thiazide diuretics with a potassium of 2.1 mmol/L point to hypokalaemia as the reversible cause." }),
  h15_fibrin: T("Use fibrinolytic drugs for cardiac arrest when pulmonary embolism is the suspected cause of cardiac arrest. No named agent or dose is modelled; follow local protocol.", "Special circumstances and ALS: thrombolytic drugs when PE is suspected", "special", { outcome: "Fibrinolytic or thrombolytic drug given, following local protocol." }),
  h15_fibrinEarly: T("Fibrinolytic drugs are the right idea if pulmonary embolism is suspected, but first name the reversible cause and continue ALS.", "Special circumstances: pulmonary embolism", "special", { outcome: "Fibrinolytic or thrombolytic drug given.", whyWrong: "Identify the suspected cause as well." }),
  h15_rosc: T("A pulse has returned after thrombolysis and further CPR. Teaching note: the guideline text is, in select patients with suspected pulmonary embolism, consider CPR for 60-90 min after administration of thrombolytic drugs. This simulation is compressed to a few further cycles, not a literal 60 minutes of play.", "ALS: thrombolytic drugs; immediately after ROSC", "special", { outcome: "A pulse has returned after thrombolysis and further CPR." }),
  h16_restern: T("Perform re-sternotomy up to 10 days post-surgery within 5 min. Provide internal cardiac massage once the chest is reopened.", "Special circumstances: cardiac surgery", "special", { outcome: "Return to theatre / emergency re-sternotomy started." }),
  h16_resternLate: T("Emergency re-sternotomy is the right procedure after recent cardiac surgery, but the special-circumstances guidance is to perform re-sternotomy up to 10 days post-surgery within 5 min.", "Special circumstances: cardiac surgery", "special", { outcome: "Return to theatre / emergency re-sternotomy started.", whyWrong: "Re-sternotomy is time-critical: within 5 minutes after recent cardiac surgery." }),
  h16_pericard: T("After recent cardiac surgery, emergency re-sternotomy is the Resuscitation Council UK action rather than needle pericardiocentesis.", "Special circumstances: cardiac surgery", "special", { outcome: "Pericardiocentesis performed.", whyWrong: "After recent cardiac surgery, perform emergency re-sternotomy." }),
  h16_rosc: T("A pulse has returned after emergency re-sternotomy. Continue resuscitation and expert care in theatre.", "Special circumstances: cardiac surgery; immediately after ROSC", "special", { outcome: "A pulse has returned after emergency re-sternotomy." }),
  h16_guideNote: T("Teaching note: RCUK special circumstances for cardiac surgery also say: Reduce IV adrenaline dose (0.05-0.1 mg). This simulation uses the standard 1 mg adrenaline option only. Consider ultrasound to identify reversible causes.", "Special circumstances: cardiac surgery", "special", { outcome: "Teaching note on post-cardiac-surgery ALS." }),
  h17_oxygen: T("Treat life-threatening hypoxia with 100% oxygen. Ensure the airway is secure, review the ETCO2 tracing, and deliver effective ventilation, administering 100% oxygen. Exclude unrecognised oesophageal intubation.", "Special circumstances: hypoxia and the airway", "special", { outcome: "100% oxygen given and the airway checked." }),
  h17_oxygenEarly: T("100% oxygen and an airway check are the right idea, but also name hypoxia as the reversible cause and continue ALS.", "ALS: identify and treat reversible causes", "causes", { outcome: "100% oxygen given and the airway checked.", whyWrong: "Identify the reversible cause as well." }),
  h17_rosc: T("A pulse has returned after the airway is corrected and 100% oxygen is given. Continue ABCDE and the usual post-ROSC targets.", "ALS: immediately after ROSC", "rosc", { outcome: "A pulse has returned after the airway is corrected." }),
  h18_kcl: T("Give 20 mmol potassium chloride IV/IO over 2-3 min, followed by 10 mmol over 2 min in hypokalaemic cardiac arrest, then monitor K+ level and adjust infusion rate accordingly.", "Special circumstances: hypokalaemic cardiac arrest", "special", { outcome: "Potassium chloride arrest bolus given." }),
  h18_kclEarly: T("This is the right arrest bolus for hypokalaemia, but also name the reversible cause and continue ALS.", "Special circumstances: hypokalaemic cardiac arrest", "special", { outcome: "Potassium chloride arrest bolus given.", whyWrong: "Identify the reversible cause as well." }),
  h18_rosc: T("A pulse has returned after the potassium arrest bolus. Continue ALS and monitor the potassium.", "Special circumstances: hypokalaemic cardiac arrest; immediately after ROSC", "special", { outcome: "A pulse has returned after the potassium arrest bolus." }),
  h19_assess: T("Stable regular broad-complex tachycardia, treated as VT. The team has judged that sedation or anaesthesia risk is too high, so drug treatment is considered: procainamide 10 to 15 mg/kg over 20 min (maximum 1 g). Not stocked in many UK hospitals; follow local protocol.", "Tachyarrhythmia: if sedation or anaesthesia risk is too high, procainamide", "procain", { outcome: "Stable regular broad-complex tachycardia; sedation or anaesthesia risk is too high." }),
  h19_procain: T("Procainamide 10 to 15 mg/kg IV over 20 min is started. The rhythm converts. Not stocked in many UK hospitals; follow local protocol.", "Tachyarrhythmia: procainamide when sedation risk is too high", "procain", { outcome: "Procainamide started. The rhythm converts." }),
  h19_amio: T("Amiodarone 300 mg IV over 10 to 60 min is listed if procainamide is not available or contraindicated. In this case procainamide is the first drug on the poster when sedation or anaesthesia risk is too high, so this is Partly right.", "Tachyarrhythmia: amiodarone if procainamide is not available", "tachy", { outcome: "Amiodarone infusion started.", whyWrong: "Procainamide is first when sedation or anaesthesia risk is too high, unless it is unavailable or contraindicated." }),
  h19_sync: T("Synchronised cardioversion is usual for stable broad regular tachycardia treated as VT, but in this case sedation or anaesthesia risk is too high, so drug treatment is considered first.", "Tachyarrhythmia: drugs if sedation or anaesthesia risk is too high", "tachy", { outcome: "Synchronised shock delivered.", whyWrong: "Sedation or anaesthesia risk is too high in this case." }),
  h20_assess: T("Unstable regular broad-complex tachycardia with life-threatening features. Electrical cardioversion is preferred: synchronised shock, up to three attempts, with careful sedation or anaesthesia if conscious.", "Tachyarrhythmia: unstable, synchronised shock up to 3 attempts", "tachy", { outcome: "Unstable regular broad-complex tachycardia with life-threatening features." }),
  h20_syncFail: T("The synchronised shock does not restore sinus rhythm. Up to three attempts may be used.", "Tachyarrhythmia: synchronised shock, up to 3 attempts", "sync", { outcome: "Synchronised shock delivered. The rhythm persists." }),
  h20_sync3: T("Three synchronised shocks have not restored sinus rhythm. If cardioversion fails to restore sinus rhythm and the patient remains unstable, give procainamide 10–15 mg kg-1 (maximum 1 g) over 20 min or amiodarone 300 mg intravenously over 10–20 min according to local availability and protocols, and re-attempt electrical cardioversion.", "ALS and tachyarrhythmia: after failed cardioversion, amiodarone 10 to 20 min or procainamide, then re-attempt", "tachy", { outcome: "The third synchronised shock has not restored sinus rhythm." }),
  h20_drug: T("Antiarrhythmic loading is started after three failed synchronised shocks. Re-attempt electrical cardioversion next.", "ALS: procainamide or amiodarone over 10 to 20 min, then re-attempt cardioversion", "tachy", { outcome: "Antiarrhythmic loading started. Re-attempt cardioversion." }),
  h20_syncEarly4: T("A further synchronised shock without the post-failure antiarrhythmic load still does not restore sinus rhythm. Give procainamide or amiodarone over 10 to 20 min, then re-attempt electrical cardioversion.", "ALS: after failed cardioversion, load then re-attempt", "tachy", { outcome: "Further synchronised shock delivered. The rhythm persists.", whyWrong: "Give the antiarrhythmic load, then re-attempt cardioversion." }),
  h20_syncOk: T("After the antiarrhythmic load, a further synchronised shock restores sinus rhythm.", "ALS: re-attempt electrical cardioversion after the load", "tachy", { outcome: "Further synchronised shock restores sinus rhythm." }),
  h21_assess: T("Irregular broad-complex tachycardia. The Adult tachyarrhythmia algorithm lists, for atrial fibrillation with pre-excitation: procainamide or cardioversion.", "Tachyarrhythmia: atrial fibrillation with pre-excitation, procainamide or cardioversion", "procain", { outcome: "Irregular broad-complex tachycardia, treated as pre-excited atrial fibrillation." }),
  h21_procain: T("Procainamide is started for atrial fibrillation with pre-excitation. The rate settles. Not stocked in many UK hospitals; follow local protocol.", "Tachyarrhythmia: AF with pre-excitation, procainamide or cardioversion", "procain", { outcome: "Procainamide started. The rate settles." }),
  h21_sync: T("Synchronised cardioversion is performed for atrial fibrillation with pre-excitation. Sinus rhythm is restored.", "Tachyarrhythmia: AF with pre-excitation, procainamide or cardioversion", "tachy", { outcome: "Synchronised cardioversion restores sinus rhythm." }),
  h21_aden: T("Adenosine is not the treatment for atrial fibrillation with pre-excitation. The poster lists procainamide or cardioversion, and adenosine is listed for regular narrow-complex tachycardia if there is no pre-excitation.", "Tachyarrhythmia: adenosine if no pre-excitation", "tachy", { whyWrong: "Do not give adenosine when pre-excitation is present." }),
  h21_verap: T("Verapamil is contraindicated in atrial flutter or fibrillation associated with accessory conducting pathways (for example Wolff-Parkinson-White syndrome).", "BNF: verapamil hydrochloride, contraindications", "tachy", { whyWrong: "Do not give verapamil in pre-excited atrial fibrillation." }),
  h22_assess: T("Regular broad-complex tachycardia in a patient with known SVT. Previous recordings during SVT showed the same wide complexes. The poster says: if known SVT with aberrant conduction, treat as for narrow complex regular tachycardia.", "Tachyarrhythmia: known SVT with aberrant conduction, treat as narrow regular", "narrow", { outcome: "Known SVT with aberrant conduction." }),
  h22_partVT: T("This is known SVT with aberrant conduction, so start with vagal manoeuvres and adenosine, as for regular narrow-complex tachycardia, rather than treating it as VT first.", "Tachyarrhythmia: known SVT with aberrant conduction", "narrow", { outcome: "Treatment given.", whyWrong: "Treat as for regular narrow-complex tachycardia." })
});
if (TXT.s3_iso) {
  TXT.s3_iso.full += " Teaching note: this is the Resuscitation Council UK and BNF starting rate of 5 micrograms per minute. Local protocols often start lower and titrate under expert supervision.";
  TXT.s3_iso.nextStep = (TXT.s3_iso.nextStep || "") + " Teaching note: follow local titration; the single option here is the 5 micrograms per minute starting rate.";
}
if (TXT.h8_iso) {
  TXT.h8_iso.full += " Teaching note: this is the Resuscitation Council UK and BNF starting rate of 5 micrograms per minute. Local protocols often start lower and titrate under expert supervision.";
}
if (TXT.s6_iso) {
  TXT.s6_iso.full += " Teaching note: this is the Resuscitation Council UK and BNF starting rate of 5 micrograms per minute. Local protocols often start lower and titrate under expert supervision.";
}

function hiddenDueArrestAdr(st, also) {
  var out = [];
  if (!st.did.adr && (st.cpr || st.checked || (st.reviews || 0) > 0 || (st.actionN || 0) >= 2)) {
    out.push(dueItem("adr", "Adrenaline 1 mg as soon as possible", "Review drug timing in this non-shockable arrest", "In a non-shockable arrest, have you thought about your drugs?", "adrNon", "ALS: non-shockable, adrenaline as soon as possible"));
  }
  if (st.did.adr && st.adrT.length && repeatIntervalWindow(st.clock - st.adrT[st.adrT.length - 1]) !== "soon") {
    out.push(dueItem("adrRepeat", "Repeat adrenaline 1 mg every 3 to 5 minutes", "Review drug timing later in the arrest", "Have you thought about whether any drugs are due again?", "adrNon", "ALS: adrenaline every 3 to 5 min"));
  }
  return out.concat(also || []);
}

/* Historical name only: every case here is listed in the picker (see LIST_ORDER). */
var HIDDEN_SCENARIOS = [];

HIDDEN_SCENARIOS.push(
  { id: "h1", group: "Cardiac arrest", title: "Asystole from hyperkalaemia",
    listTitle: "Non-shockable arrest: asystole",
    blurb: "A haemodialysis patient is unresponsive this morning.",
    scene: "A 61-year-old who usually has haemodialysis three times a week missed yesterday's session. The team was called to review them this morning. They are now unresponsive and not breathing normally. CPR 30:2 has been started and pads are on. Compressions are paused for the first rhythm check.",
    start: { rhythm: { gen: "asystole" }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["cpr", "CPR 30:2 without delay", "als"], ["adr", "Adrenaline 1 mg as soon as possible", "adrNon"], ["causes", "Identify the reversible cause (hyperkalaemia)", "causes"], ["calcium", "Calcium chloride 10 mL of 10% IV in hyperkalaemic cardiac arrest", "hyperkArrest"]],
    due: function (st) {
      var out = hiddenDueArrestAdr(st);
      if ((!st.did.causes || !st.did.calcium) && (st.cpr || st.checked || (st.actionN || 0) >= 2)) {
        out.push(dueItem(st.did.causes ? "calcium" : "causes", st.did.causes ? "Calcium chloride 10 mL of 10% IV in hyperkalaemic cardiac arrest" : "Identify the reversible cause (hyperkalaemia)", "Think about reversible causes", "Have you thought about reversible causes?", st.did.causes ? "hyperkArrest" : "causes", st.did.causes ? "Special circumstances: hyperkalaemic cardiac arrest" : "ALS: identify and treat reversible causes"));
      }
      return out;
    },
    step: function (a, st) {
      var roscVit = { pulse: "Present, weak", bp: "88/54 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" };
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "h1_rosc", { end: true, pulse: true, vit: roscVit, phys: "roscHyperk", rhythm: { gen: "hyperk" } });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.adr && st.did.calcium) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "hyperk" } }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "asystole" } });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "h1_rosc", { end: true, pulse: true, vit: roscVit, phys: "roscHyperk", rhythm: { gen: "hyperk" } });
          if (!st.checked) { st.checked = true; return O("ok", "h1_assess", { vit: { pulse: "Absent" }, phys: "asys" }); }
          if (st.monitorReady) { st.monitorReady = false; return O("ok", "n_noPulse", { vit: { pulse: "Absent" } }); }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.adr && st.did.calcium) return O("ok", "h1_rosc", { end: true, pulse: true, cprStop: true, rhythm: { gen: "hyperk" }, phys: "roscHyperk", vit: roscVit });
        return O("ok", "h1_assess", { cprStop: true, cycleCheck: true, vit: { pulse: "Absent" } });
      }
      if (a === "cpr") { if (st.cpr) return O("info", "a_cprRunning"); st.did.cpr = 1; return O("ok", "h1_cpr", { cprStart: true }); }
      if (a === "shock" || a === "sync") return O("bad", "h1_shock");
      if (a === "adr") {
        return takeAdr(st, "s2_adr", "s2_adrRepeat", { kind: "nonshock", soonKey: "s2_adrSoon", phys: "adr" });
      }
      if (a === "causes") { st.did.causes = 1; return O("ok", "h1_causes", { phys: "hyperk" }); }
      if (a === "calcium") {
        st.did.calcium = 1;
        var slow = st._act && st._act.opt === "calcium:slow";
        var keys = st.did.causes ? "h1_calcium" : ["h1_calciumEarly", "h1_calcium"];
        if (slow) {
          keys = Array.isArray(keys) ? keys.concat("h1_calciumSlow") : [keys, "h1_calciumSlow"];
          return O("part", keys, { phys: "hyperk" });
        }
        return O(st.did.causes ? "ok" : "part", keys, { phys: "hyperk" });
      }
      if (a === "bicarb") { st.did.bicarb = 1; return O("ok", "h1_bicarb"); }
      if (a === "expert") return O("ok", "a_expert");
      return null;
    } }
);

HIDDEN_SCENARIOS.push(
  { id: "h2", group: "Cardiac arrest", title: "PEA from tension pneumothorax",
    listTitle: "Non-shockable arrest: PEA on the high-dependency unit",
    blurb: "Unresponsive on the high-dependency unit shortly after a procedure.",
    scene: "A 58-year-old has just had a right internal jugular central line on the high-dependency unit. They suddenly become unresponsive and not breathing normally. The right chest is resonant, with no air entry, and the trachea is deviated to the left. CPR 30:2 is under way and pads are on. Compressions are paused for a rhythm check.",
    start: { rhythm: { gen: "pea", opts: { lo: 100, hi: 120 } }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["cpr", "CPR 30:2 without delay", "als"], ["adr", "Adrenaline 1 mg as soon as possible", "adrNon"], ["causes", "Identify the reversible cause (tension pneumothorax)", "causes"], ["decompress", "Chest decompression for tension pneumothorax", "chestDecomp"]],
    due: function (st) {
      var out = hiddenDueArrestAdr(st);
      if ((!st.did.causes || !st.did.decompress) && (st.cpr || st.checked || (st.actionN || 0) >= 2)) {
        out.push(dueItem(st.did.causes ? "decompress" : "causes", st.did.causes ? "Chest decompression for tension pneumothorax" : "Identify the reversible cause (tension pneumothorax)", "Think about reversible causes", "Have you thought about reversible causes?", st.did.causes ? "chestDecomp" : "causes", st.did.causes ? "Special circumstances: chest decompression" : "ALS: identify and treat reversible causes"));
      }
      return out;
    },
    step: function (a, st) {
      var roscVit = { pulse: "Present", bp: "96/60 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" };
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "h2_rosc", { end: true, pulse: true, vit: roscVit, phys: "roscTension", rhythm: R_SINUS_ROSC });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.adr && st.did.decompress) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: R_SINUS_ROSC }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "h2_rosc", { end: true, pulse: true, vit: roscVit, phys: "roscTension", rhythm: R_SINUS_ROSC });
          if (!st.checked) { st.checked = true; return O("ok", "h2_assess", { vit: { pulse: "Absent" }, phys: "tension" }); }
          if (st.monitorReady) { st.monitorReady = false; return O("ok", "n_noPulse", { vit: { pulse: "Absent" } }); }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.adr && st.did.decompress) return O("ok", "h2_rosc", { end: true, pulse: true, cprStop: true, rhythm: R_SINUS_ROSC, phys: "roscTension", vit: roscVit });
        return O("ok", "s2_check", { cprStop: true, cycleCheck: true, vit: { pulse: "Absent" } });
      }
      if (a === "cpr") { if (st.cpr) return O("info", "a_cprRunning"); st.did.cpr = 1; return O("ok", "s2_cpr", { cprStart: true }); }
      if (a === "shock" || a === "sync") return O("bad", "h2_shock");
      if (a === "adr") {
        return takeAdr(st, "s2_adr", "s2_adrRepeat", { kind: "nonshock", soonKey: "s2_adrSoon", phys: "adr" });
      }
      if (a === "causes") { st.did.causes = 1; return O("ok", "h2_causes", { phys: "tension" }); }
      if (a === "decompress") { st.did.decompress = 1; return O(st.did.causes ? "ok" : "part", st.did.causes ? "h2_decomp" : ["h2_decompEarly", "h2_decomp"], { phys: "tension" }); }
      if (a === "fluid") return O("bad", "a_fluid");
      if (a === "expert") return O("ok", "a_expert");
      return null;
    } }
);

HIDDEN_SCENARIOS.push(
  { id: "h3", group: "Cardiac arrest", title: "Refractory VF: a longer shockable arrest",
    listTitle: "Shockable arrest: a longer VF arrest",
    blurb: "Collapse in the emergency department waiting room. This arrest will not be brief.",
    scene: "A 72-year-old collapses in the emergency department waiting room. Unresponsive and not breathing normally. The resuscitation team is present, CPR 30:2 has been started and defibrillator pads are on. Compressions are paused for the first rhythm check. This arrest will not be brief.",
    start: { rhythm: { gen: "vf" }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["shock", "Shock VF without delay", "shock"], ["cpr", "Resume CPR immediately after each shock", "als"], ["adr", "Adrenaline 1 mg after the third shock", "adrShock"], ["amio300", "Amiodarone 300 mg after the third shock", "amio"]],
    extra: "h3_amio150Note",
    due: function (st) {
      var out = [];
      if (st.shocks === 0 && (st.cpr || (st.reviews || 0) > 0 || (st.actionN || 0) >= 2)) {
        out.push(dueItem("shock", "Shock VF without delay", "Reconsider how this rhythm is treated electrically", "Have you thought about how this rhythm is treated electrically?", "alsPriority", "ALS: shockable, shock first"));
      }
      if (st.shocks >= 3 && !st.adrAfter3) {
        out.push(dueItem("adr", "Adrenaline 1 mg after the third shock", "Review drug timing after the third shock", "Have you thought about your drugs after the third shock?", "adrShock", "ALS: adrenaline after 3 shocks"));
      }
      if (st.shocks >= 3 && !st.amio) {
        out.push(dueItem("amio300", "Amiodarone 300 mg after the third shock", "Review drug timing after the third shock", "Have you thought about your drugs after the third shock?", "amio", "ALS: amiodarone after 3 shocks"));
      }
      if (st.adrAfter3 && st.amio && st.adrT.length && repeatIntervalWindow(st.clock - st.adrT[st.adrT.length - 1]) !== "soon") {
        out.push(dueItem("adrRepeat", "Repeat adrenaline 1 mg every 3 to 5 minutes", "Review drug timing later in the arrest", "Have you thought about whether any drugs are due again?", "adrShock", "ALS: adrenaline every 3 to 5 min"));
      }
      return out;
    },
    step: function (a, st) {
      var ready = st.shocks >= 5 && st.adrAfter3 && st.amio;
      var roscVit = { pulse: "Present", bp: "94/58 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" };
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "h3_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc", rhythm: R_SINUS_ROSC });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "shock") {
        if (st.cpr) return O("bad", "a_shockMid");
        if (st.justShocked) return O("bad", "a_shockTwice");
        st.shocks++; st.justShocked = true; st.did.shock = 1;
        return O("ok", st.shocks === 1 ? "s1_shock1" : st.shocks === 3 ? "s1_shock3" : "s1_shockN", { shock: true, phys: st.shocks === 1 ? "shockVF" : "vfPersists" });
      }
      if (a === "cpr") {
        if (st.cpr) return O("info", "a_cprRunning");
        if (!st.justShocked && st.shocks === 0) return O("ok", "s1_cprFirst", { cprStart: true });
        st.justShocked = false; st.did.cpr = 1;
        return O("ok", "s1_cpr", { cprStart: true });
      }
      if (st.justShocked && a !== "expert" && a !== "causes") return O("bad", "a_resumeFirst");
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (ready) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: R_SINUS_ROSC }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "vf" }, phys: "vfPersists" });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "h3_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc", rhythm: R_SINUS_ROSC });
          if (!st.checked) { st.checked = true; return O("ok", "s1_assess", { vit: { pulse: "Absent" } }); }
          if (st.monitorReady) { st.monitorReady = false; return O("ok", "n_noPulse", { vit: { pulse: "Absent" } }); }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (ready) return O("ok", "h3_rosc", { end: true, pulse: true, cprStop: true, rhythm: R_SINUS_ROSC, phys: "rosc", vit: roscVit });
        var k = st.shocks >= 5 ? "h3_checkLater" : st.shocks >= 3 ? "s1_checkNoDrugs" : "s1_check";
        return O("ok", k, { cprStop: true, cycleCheck: true, rhythm: { gen: "vf" }, phys: "vfPersists", vit: { pulse: "Absent" } });
      }
      if (a === "adr") {
        if (st.shocks < 3) return O("bad", "s1_adrEarly");
        return takeAdr(st, "s1_adr", "s1_adrRepeat", { kind: "post3", soonKey: "a_adrSoon", phys: "adr" });
      }
      if (a === "amio300") {
        return takeAmio300(st, "s1_amio", { phys: "amio" });
      }
      if (a === "amio150") {
        if (st.shocks >= 5 && st.amio && !st.amio150) { st.amio150 = true; st.did.amio150 = 1; return O("ok", "s1_amio150"); }
        if (!st.amio) return O("part", "amio150_first");
        return O("bad", "a_amio150");
      }
      if (a === "lido100" || a === "lido50") return takeLido(st, a);
      if (a === "padsAP") {
        if ((st.shocks || 0) < 3) return O("bad", "padsAP_early");
        st.did.padsAP = 1;
        return O("ok", "padsAP_ok");
      }
      if (a === "sync") return O("bad", "a_sync");
      return null;
    } }
);

HIDDEN_SCENARIOS.push(
  { id: "h4", group: "Cardiac arrest", title: "VF converting to asystole",
    listTitle: "Cardiac arrest: the first rhythm may not last",
    blurb: "Found unresponsive in the hospital car park and brought in under CPR.",
    scene: "A 66-year-old is found unresponsive in the hospital car park and brought in under CPR. Pads are on. Compressions are paused for the first rhythm check. The first rhythm will not be the last.",
    start: { rhythm: { gen: "vf" }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["shock", "Shock VF without delay", "shock"], ["cpr", "Resume CPR immediately after the shock", "als"], ["adr", "Once the rhythm is asystole, adrenaline 1 mg as soon as possible", "adrNon"]],
    due: function (st) {
      var out = [];
      if (!st.asys && st.shocks === 0 && (st.cpr || (st.reviews || 0) > 0 || (st.actionN || 0) >= 2)) {
        out.push(dueItem("shock", "Shock VF without delay", "Reconsider how this rhythm is treated electrically", "Have you thought about how this rhythm is treated electrically?", "alsPriority", "ALS: shockable, shock first"));
      }
      if (st.asys) {
        if (!st.did.adr && (st.cpr || st.checked || (st.reviews || 0) > 0 || (st.actionN || 0) >= 2)) {
          out.push(dueItem("adr", "Adrenaline 1 mg as soon as possible", "Review drug timing in this non-shockable arrest", "In a non-shockable arrest, have you thought about your drugs?", "adrNon", "ALS: non-shockable, adrenaline as soon as possible"));
        }
        if (st.did.adr && st.adrT.length && repeatIntervalWindow(st.clock - st.adrT[st.adrT.length - 1]) !== "soon") {
          out.push(dueItem("adrRepeat", "Repeat adrenaline 1 mg every 3 to 5 minutes", "Review drug timing later in the arrest", "Have you thought about whether any drugs are due again?", "adrNon", "ALS: adrenaline every 3 to 5 min"));
        }
      }
      return out;
    },
    step: function (a, st) {
      var roscVit = { pulse: "Present", bp: "90/56 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" };
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "h4_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc", rhythm: R_SINUS_ROSC });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "shock") {
        if (st.asys) return O("bad", "h4_shockAsys");
        if (st.cpr) return O("bad", "a_shockMid");
        if (st.justShocked) return O("bad", "a_shockTwice");
        st.shocks++; st.justShocked = true; st.did.shock = 1;
        return O("ok", "s1_shock1", { shock: true });
      }
      if (a === "sync") return O("bad", st.asys ? "h4_shockAsys" : "a_sync");
      if (a === "cpr") {
        if (st.cpr) return O("info", "a_cprRunning");
        if (!st.asys && !st.justShocked && st.shocks === 0) return O("ok", "s1_cprFirst", { cprStart: true });
        st.justShocked = false; st.did.cpr = 1;
        return O("ok", "s1_cpr", { cprStart: true });
      }
      if (!st.asys && st.justShocked && a !== "expert" && a !== "causes") return O("bad", "a_resumeFirst");
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (!st.asys && st.shocks >= 1) {
          st.asys = true;
          return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "asystole" }, phys: "vfToAsys" });
        }
        if (st.asys && st.did.adr) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: R_SINUS_ROSC }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: st.asys ? { gen: "asystole" } : { gen: "vf" } });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "h4_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc", rhythm: R_SINUS_ROSC });
          if (!st.checked) { st.checked = true; return O("ok", "s1_assess", { vit: { pulse: "Absent" } }); }
          if (st.monitorReady) {
            st.monitorReady = false;
            if (st.asys) return O("ok", "h4_asys", { vit: { pulse: "Absent" }, phys: "vfToAsys", rhythm: { gen: "asystole" } });
            return O("ok", "n_noPulse", { vit: { pulse: "Absent" } });
          }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (!st.asys && st.shocks >= 1) {
          st.asys = true;
          return O("ok", "h4_asys", { cprStop: true, cycleCheck: true, rhythm: { gen: "asystole" }, phys: "vfToAsys", vit: { pulse: "Absent" } });
        }
        if (st.asys && st.did.adr) return O("ok", "h4_rosc", { end: true, pulse: true, cprStop: true, rhythm: R_SINUS_ROSC, phys: "rosc", vit: roscVit });
        return O("ok", st.asys ? "h4_asys" : "s1_check", { cprStop: true, cycleCheck: true, rhythm: st.asys ? { gen: "asystole" } : { gen: "vf" }, vit: { pulse: "Absent" } });
      }
      if (a === "adr") {
        if (!st.asys) return O("bad", "s1_adrEarly");
        return takeAdr(st, "s2_adr", "s2_adrRepeat", { kind: "nonshock", soonKey: "s2_adrSoon", phys: "adr" });
      }
      if (a === "causes") return O("ok", "a_causes");
      if (a === "expert") return O("ok", "a_expert");
      return null;
    } }
);

HIDDEN_SCENARIOS.push(
  { id: "h5", idleNudge: true, group: "Tachycardia", title: "Stable SVT needing a third adenosine dose",
    listTitle: "Stable SVT",
    blurb: "Sudden palpitations in a young adult who looks well, with a similar episode before.",
    scene: "A 28-year-old attends with sudden palpitations for 40 minutes. Alert and talking, no chest pain, no breathlessness, blood pressure is normal. Monitoring and a large IV cannula are in place. A previous identical episode stopped only after a third dose of adenosine.",
    start: { rhythm: { gen: "svt" }, pulse: true, vit: { pulse: "Present, regular", bp: "122/78 mmHg", consc: "Alert, talking", threats: "None" } },
    req: [["vagal", "Vagal manoeuvres first", "narrow"], ["aden", "Adenosine 6 mg, then 12 mg, then 18 mg (RCUK)", "aden"]],
    due: function (st) {
      var out = [], hadChance = (st.actionN || 0) >= 1 || st.checked;
      if (!st.vagal && st.aden === 0 && hadChance) {
        out.push(dueItem("vagal", "Vagal manoeuvres first", "Review the first manoeuvres on this algorithm", "Have you thought about the first manoeuvres on this algorithm?", "narrow", "Tachyarrhythmia: vagal manoeuvres first"));
      }
      if (st.vagal && st.aden === 0) {
        out.push(dueItem("aden", "Adenosine 6 mg, then 12 mg, then 18 mg (RCUK)", "The first manoeuvre has not worked. Review what the algorithm does next", "The first manoeuvre has not worked. Have you thought about what the algorithm does next?", "aden", "Tachyarrhythmia: if ineffective, adenosine"));
      }
      if (st.aden === 1 || st.aden === 2) {
        out.push(dueItem("adenNext", "Complete adenosine treatment with the next dose", "Review whether that drug treatment is complete", "Have you thought about whether that drug treatment is complete?", "aden", st.aden === 1 ? "Tachyarrhythmia: adenosine 12 mg" : "Tachyarrhythmia: adenosine 18 mg"));
      }
      return out;
    },
    step: function (a, st) {
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "h5_assess"); }
      if (a === "vagal") { if (st.vagal) return O("info", "s4_vagalAgain"); st.vagal = true; st.did.vagal = 1; return O("ok", "s4_vagal", { phys: "vagal" }); }
      if (a === "aden") {
        return takeAden(st, adenDoseOf(st._act && st._act.raw, st), {
          needVagal: true, earlyKey: "s4_adenEarly",
          doses: {
            6: { key: "s4_aden6", phys: "adenFail" },
            12: { key: "h5_aden12fail", phys: "aden12fail" },
            18: { key: "h5_aden18", phys: "aden18", end: true, rhythm: { gen: "sinus", opts: { rate: 80 } }, vit: { threats: "None; now in sinus rhythm" } }
          }
        });
      }
      if (a === "sync") return O("bad", "s4_sync");
      if (a === "amio300" || a === "amioInf") return O("bad", "s4_amio");
      if (a === "observe") return O("bad", "s4_observe");
      return null;
    } },

  { id: "h6", idleNudge: true, group: "Tachycardia", title: "Unstable atrial fibrillation",
    blurb: "Known atrial fibrillation, now breathless, clammy and very tachycardic.",
    scene: "A 74-year-old with known atrial fibrillation arrives with sudden breathlessness and chest tightness for 20 minutes. Conscious, pale and clammy. The ventricular rate is very rapid. Monitoring, oxygen and IV access are in place; defibrillator pads are on.",
    start: { rhythm: { gen: "af", opts: { lo: 150, hi: 175 } }, pulse: true, vit: { pulse: "Present, irregular, rapid", bp: "78/48 mmHg", consc: "Conscious, clammy, chest pain", threats: "Shock; myocardial ischaemia" } },
    req: [["expert", "Careful sedation or anaesthesia before cardioversion (conscious patient)", "sync"], ["sync", "Synchronised shock for unstable atrial fibrillation", "tachy"]],
    due: function (st) {
      var out = [], hadChance = (st.actionN || 0) >= 1 || st.checked;
      if (st.sync === 0 && hadChance) {
        out.push(dueItem("sync", "Synchronised shock for unstable atrial fibrillation", "Review urgent electrical treatment", "Have you thought about urgent electrical treatment?", "tachy", "Tachyarrhythmia: unstable, synchronised shock"));
      } else if (st.sync === 1) {
        out.push(dueItem("sync2", "A further synchronised shock (up to 3 attempts)", "The first electrical attempt has not worked. Review whether to try again", "The first electrical attempt has not worked. Have you thought about a further attempt?", "sync", "Tachyarrhythmia: synchronised shock, up to 3 attempts"));
      }
      return out;
    },
    step: function (a, st) {
      if (st.arrest) {
        if (a === "shock") { st.arrest = false; return O("ok", "s5_arrestShock", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 88 } }, phys: "shockVF", vit: { pulse: "Present", bp: "94/60 mmHg", consc: "Drowsy", threats: "Immediately post-ROSC" } }); }
        if (a === "sync") return O("bad", "a_sync");
        if (a === "cpr") return O("part", "s5_arrestCPR", { cprStart: true });
        return null;
      }
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "h6_assess"); }
      if (a === "expert") { st.expert = true; st.did.expert = 1; return O("ok", "s5_expert"); }
      if (a === "sync") {
        st.sync++; st.did.sync = 1;
        var k = st.sync === 1 ? "h6_sync1" : "h6_sync2", v = st.expert ? "ok" : "part", keys = st.expert ? k : ["s5_noSed", k];
        if (st.sync === 1) return O(v, keys, { phys: "syncFail" });
        return O(v, keys, { end: true, rhythm: { gen: "sinus", opts: { rate: 84 } }, phys: "afSync", vit: { pulse: "Present, regular", bp: "106/68 mmHg", consc: "Drowsy after sedation", threats: "None now" } });
      }
      if (a === "shock") { st.arrest = true; return O("bad", "s5_unsync", { pulse: false, rhythm: { gen: "vf" }, phys: "ront", vit: { pulse: "Absent", bp: "Not recordable", consc: "Unresponsive", threats: "Cardiac arrest" } }); }
      if (a === "aden") return O("bad", "h6_aden");
      if (a === "vagal") return O("bad", "h6_vagal");
      if (a === "amio300" || a === "amioInf") return O("bad", "h10_amio");
      return null;
    } },

  { id: "h7", idleNudge: true, group: "Tachycardia", title: "Stable broad-complex tachycardia",
    blurb: "Palpitations for two hours in a patient who looks well, with a previous myocardial infarction.",
    scene: "A 57-year-old with a previous myocardial infarction attends with palpitations for two hours. Alert, talking, no chest pain, no breathlessness, blood pressure is 118/74 mmHg. Monitoring and IV access are in place. The patient is stable and suitable for careful sedation or anaesthesia if synchronised cardioversion is used; sedation or anaesthesia risk is not described as too high.",
    start: { rhythm: { gen: "vt" }, pulse: true, vit: { pulse: "Present, regular", bp: "118/74 mmHg", consc: "Alert, talking", threats: "None" } },
    req: [["sync", "Synchronised cardioversion, with careful sedation or anaesthesia", "broadStable"]],
    due: function (st) {
      var out = [], hadChance = (st.actionN || 0) >= 1 || st.checked;
      if (st.arrest) {
        out.push(dueItem("shock", "Unsynchronised shock for this pulseless rhythm", "This is now a cardiac arrest. Review the immediate electrical treatment", "This is now a cardiac arrest. Have you thought about the immediate electrical treatment?", "alsPriority", "ALS: early defibrillation"));
      } else if (st.sync === 0 && hadChance) {
        out.push(dueItem("sync", "Synchronised cardioversion, with careful sedation or anaesthesia", "Review electrical treatment for this stable broad rhythm", "Have you thought about electrical treatment for this rhythm?", "broadStable", "Tachyarrhythmia: broad and regular, synchronised shock"));
      }
      return out;
    },
    step: function (a, st) {
      if (st.arrest) {
        if (a === "shock") { st.arrest = false; return O("ok", "s5_arrestShock", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 90 } }, phys: "shockVF", vit: { pulse: "Present", bp: "100/64 mmHg", consc: "Drowsy", threats: "Immediately post-ROSC" } }); }
        if (a === "sync") return O("bad", "a_sync");
        if (a === "cpr") return O("part", "s5_arrestCPR", { cprStart: true });
        return null;
      }
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "h7_assess"); }
      if (a === "expert") { st.expert = true; st.did.expert = 1; return O("ok", "s5_expert"); }
      if (a === "amioInf" || a === "amio1020" || a === "procain") {
        st.did.amioInf = 1;
        st.did.procain = a === "procain" ? 1 : st.did.procain;
        return O("part", a === "procain" ? "h7_procain" : "h7_amioInf", { end: true, rhythm: { gen: "sinus", opts: { rate: 86 } }, phys: "amioInf", vit: { pulse: "Present, regular", bp: "116/72 mmHg", threats: "None; now in sinus rhythm" } });
      }
      if (a === "amio300") return O("bad", "h7_amioBolus");
      if (a === "sync") {
        st.sync++; st.did.sync = 1;
        var v = st.expert ? "ok" : "part", keys = st.expert ? "h7_sync" : ["s5_noSed", "h7_sync"];
        return O(v, keys, { end: true, rhythm: { gen: "sinus", opts: { rate: 88 } }, phys: "sync", vit: { pulse: "Present, regular", bp: "110/70 mmHg", consc: "Drowsy after sedation", threats: "None now" } });
      }
      if (a === "shock") { st.arrest = true; return O("bad", "s5_unsync", { pulse: false, rhythm: { gen: "vf" }, phys: "ront", vit: { pulse: "Absent", bp: "Not recordable", consc: "Unresponsive", threats: "Cardiac arrest" } }); }
      if (a === "aden") return O("bad", "h7_aden");
      return null;
    } }
);

HIDDEN_SCENARIOS.push(
  { id: "h8", idleNudge: true, group: "Bradycardia", title: "Broad-complex complete heart block, risk of asystole",
    listTitle: "Broad-complex bradycardia",
    blurb: "A pause on telemetry, then a slow broad rhythm; awake and only a little light-headed.",
    scene: "A 81-year-old is found to have a ventricular pause of 4 seconds on telemetry, then a slow broad rhythm. They are awake, a little light-headed, but not shocked or confused. Blood pressure is 102/60 mmHg. Monitoring and IV access are in place.",
    start: { rhythm: { gen: "chb", opts: { broad: true, vr: 34 } }, pulse: true, vit: { pulse: "Present, regular, slow", bp: "102/60 mmHg", consc: "Awake, light-headed", threats: "None currently; recent ventricular pause greater than 3 s" } },
    req: [["expert", "Seek expert help; consider transvenous pacing", "bradyRisk"], ["pace", "Interim measure: transcutaneous pacing, or an adrenaline or isoprenaline infusion", "brady"]],
    extra: "h8_guideNote",
    due: function (st) {
      var out = [], hadChance = (st.actionN || 0) >= 1 || st.checked;
      var interim = st.paced || st.did.adrInf || st.did.iso;
      var atroOpen = st.atro >= 1 && st.atro < 6 && !interim;
      if (!interim && !atroOpen && hadChance) {
        out.push(dueItem("pace", "Interim measure: transcutaneous pacing, or an adrenaline or isoprenaline infusion", "Review interim measures for this risk of asystole", "Have you thought about interim measures?", "brady", "Bradyarrhythmia: interim measures"));
      }
      if (!interim && st.atro >= 6) {
        out.push(dueItem("pace", "Interim measures: transcutaneous pacing, or an isoprenaline or adrenaline infusion", "Atropine has reached the 3 mg maximum and has not changed things. Review other interim measures", "The first drug has not changed things. Have you thought about other interim measures?", "brady", "Bradyarrhythmia: interim measures"));
      }
      if (!st.did.expert && hadChance && !atroOpen) {
        out.push(dueItem("expert", "Seek expert help; consider transvenous pacing", "Think about who else needs to be involved", "Have you thought about who else needs to be involved?", "bradyRisk", "Bradyarrhythmia: risk of asystole, seek expert help"));
      }
      return out;
    },
    step: function (a, st) {
      var interim = function () { return !!(st.paced || st.did.adrInf || st.did.iso); };
      var done = function (o) { if (interim() && st.did.expert) o.end = true; return o; };
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "h8_assess"); }
      if (a === "atro") {
        if (interim()) return O("info", "s3_atroPaced");
        return takeAtro(st, "h8_atro1", "h8_atroRepeat", { phys: "atroCHB", verdict: "part" });
      }
      if (a === "pace") {
        if (st.paced) return O("info", "s3_paceAgain");
        st.paced = true; st.did.pace = 1;
        return done(O("ok", "h8_pace", { rhythm: { gen: "pace_v", opts: { rate: 70, pRate: 85 } }, phys: "pace", vit: { bp: "114/68 mmHg", consc: "Awake, less light-headed", threats: "Improving with pacing" } }));
      }
      if (a === "adrInf") {
        if (st.did.adrInf) return O("info", "h8_adrInf");
        st.did.adrInf = 1;
        return done(O("ok", "h8_adrInf", { phys: "adrInf", vit: { pulse: "Present, a little faster", bp: "110/64 mmHg", threats: "Interim drug support" } }));
      }
      if (a === "iso") {
        if (st.did.iso) return O("info", "h8_iso");
        st.did.iso = 1;
        return done(O("ok", "h8_iso", { phys: "iso", vit: { pulse: "Present, a little faster", bp: "110/64 mmHg", threats: "Interim drug support" } }));
      }
      if (a === "expert") { st.did.expert = 1; return done(O("ok", "h8_expert")); }
      if (a === "causes") return O("ok", "s3_causes");
      if (a === "adr") return O("bad", "s3_adr");
      if (a === "observe") return O("bad", "h8_observe");
      return null;
    } },

  { id: "h9", group: "Cardiac arrest", title: "Pulseless torsades de pointes",
    blurb: "An inpatient on several QT-prolonging drugs becomes unresponsive and pulseless.",
    scene: "A 69-year-old inpatient on several QT-prolonging drugs, with a potassium of 3.0 mmol/L this morning, becomes unresponsive and pulseless. CPR 30:2 has been started and pads are on. Compressions are paused for a rhythm check. The QT was already long on this morning's ECG.",
    start: { rhythm: { gen: "torsades", opts: {} }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["shock", "Unsynchronised shock for pulseless polymorphic VT", "alsPriority"], ["cpr", "Resume CPR immediately after the shock", "als"], ["mg", "Magnesium 8 mmol (2 g) IV", "tdp"]],
    due: function (st) {
      var out = [];
      if (st.shocks === 0 && (st.cpr || st.checked || (st.reviews || 0) > 0 || (st.actionN || 0) >= 2)) {
        out.push(dueItem("shock", "Unsynchronised shock for pulseless polymorphic VT", "Reconsider how this rhythm is treated electrically", "Have you thought about how this rhythm is treated electrically?", "alsPriority", "ALS: early defibrillation"));
      }
      if ((st.shocks >= 1 || st.cpr || st.checked) && !st.did.mg && (st.actionN || 0) >= 1) {
        out.push(dueItem("mg", "Magnesium 8 mmol (2 g) IV", "Review the specific treatment for this polymorphic rhythm", "Have you thought about the specific treatment for this rhythm?", "tdp", "Tachyarrhythmia: Mg2+ 8 mmol IV over 10 min"));
      }
      return out;
    },
    step: function (a, st) {
      var roscVit = { pulse: "Present", bp: "96/58 mmHg", consc: "Drowsy, breathing", threats: "Immediately post-ROSC" };
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "h9_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc", rhythm: { gen: "sinus", opts: { rate: 62, longQT: true } } });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "shock") {
        if (st.cpr) return O("bad", "a_shockMid");
        if (st.justShocked) return O("bad", "a_shockTwice");
        st.shocks++; st.justShocked = true; st.did.shock = 1;
        return O("ok", "h9_shock", { shock: true });
      }
      if (a === "sync") return O("bad", "h9_sync");
      if (a === "cpr") {
        if (st.cpr) return O("info", "a_cprRunning");
        if (!st.justShocked && st.shocks === 0) return O("ok", "s1_cprFirst", { cprStart: true });
        st.justShocked = false; st.did.cpr = 1;
        return O("ok", "s1_cpr", { cprStart: true });
      }
      if (st.justShocked && a !== "expert" && a !== "causes" && a !== "mg") return O("bad", "a_resumeFirst");
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.shocks >= 1 && st.did.mg) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "sinus", opts: { rate: 62, longQT: true } } }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "torsades" } });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "h9_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc", rhythm: { gen: "sinus", opts: { rate: 62, longQT: true } } });
          if (!st.checked) { st.checked = true; return O("ok", "h9_assess", { vit: { pulse: "Absent" }, phys: "tdpArrest" }); }
          if (st.monitorReady) { st.monitorReady = false; return O("ok", "n_noPulse", { vit: { pulse: "Absent" } }); }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.shocks >= 1 && st.did.mg) return O("ok", "h9_rosc", { end: true, pulse: true, cprStop: true, rhythm: { gen: "sinus", opts: { rate: 62, longQT: true } }, phys: "rosc", vit: roscVit });
        return O("ok", "h9_assess", { cprStop: true, cycleCheck: true, rhythm: { gen: "torsades" }, vit: { pulse: "Absent" } });
      }
      if (a === "mg") {
        if (st.did.mg) return O("info", "s6_mgAgain");
        st.did.mg = 1;
        return O(st.shocks ? "ok" : "part", st.shocks ? "h9_mg" : "h9_mgOnly", { phys: "mg" });
      }
      if (a === "amio300" || a === "amio150" || a === "amioInf") return O("bad", "s6_amio");
      if (a === "causes") { st.did.causes = 1; return O("ok", "s6_causes"); }
      if (a === "expert") return O("ok", "a_expert");
      if (a === "adr") {
        if (st.shocks < 3) return O("bad", "s1_adrEarly");
        return takeAdr(st, "s1_adr", "s1_adrRepeat", { kind: "post3", soonKey: "a_adrSoon", phys: "adr" });
      }
      if (a === "kcl") {
        st.did.kcl = 1;
        return O("ok", "h9_kcl");
      }
      return null;
    } },

  { id: "h10", idleNudge: true, group: "Peri-arrest", title: "Post-ROSC deterioration into unstable VT",
    listTitle: "Deterioration immediately after ROSC",
    blurb: "Immediately after ROSC, the monitor changes and the blood pressure falls.",
    scene: "A 64-year-old has just had return of spontaneous circulation after a shockable arrest on the ward. ABCDE is under way. They open their eyes to voice. A minute later the monitor changes and the blood pressure falls. Defibrillator pads are still on.",
    start: { rhythm: { gen: "vt" }, pulse: true, vit: { pulse: "Present, weak, regular", bp: "82/50 mmHg", consc: "Eyes open to voice, drowsy", threats: "Immediately post-ROSC; shock" } },
    req: [["expert", "Careful sedation or anaesthesia before cardioversion if needed", "sync"], ["sync", "Synchronised shock for unstable VT immediately after ROSC", "tachy"]],
    due: function (st) {
      var out = [], hadChance = (st.actionN || 0) >= 1 || st.checked;
      if (st.arrest) {
        out.push(dueItem("shock", "Unsynchronised shock for this pulseless rhythm", "This is now a cardiac arrest. Review the immediate electrical treatment", "This is now a cardiac arrest. Have you thought about the immediate electrical treatment?", "alsPriority", "ALS: early defibrillation"));
      } else if (st.sync === 0 && hadChance) {
        out.push(dueItem("sync", "Synchronised shock for unstable VT immediately after ROSC", "Review urgent electrical treatment", "Have you thought about urgent electrical treatment?", "tachy", "Tachyarrhythmia: unstable, synchronised shock"));
      }
      return out;
    },
    step: function (a, st) {
      if (st.arrest) {
        if (a === "shock") { st.arrest = false; return O("ok", "s5_arrestShock", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 96 } }, phys: "shockVF", vit: { pulse: "Present", bp: "96/60 mmHg", consc: "Drowsy", threats: "Immediately post-ROSC" } }); }
        if (a === "sync") return O("bad", "a_sync");
        if (a === "cpr") return O("part", "s5_arrestCPR", { cprStart: true });
        return null;
      }
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "h10_assess"); }
      if (a === "expert") { st.expert = true; st.did.expert = 1; return O("ok", "s5_expert"); }
      if (a === "sync") {
        st.sync++; st.did.sync = 1;
        var v = st.expert ? "ok" : "part", keys = st.expert ? "h10_sync" : ["s5_noSed", "h10_sync"];
        return O(v, keys, { end: true, rhythm: { gen: "sinus", opts: { rate: 98 } }, phys: "sync", vit: { pulse: "Present, regular", bp: "104/64 mmHg", consc: "Drowsy", threats: "Immediately post-ROSC; improving" } });
      }
      if (a === "shock") { st.arrest = true; return O("bad", "s5_unsync", { pulse: false, rhythm: { gen: "vf" }, phys: "ront", vit: { pulse: "Absent", bp: "Not recordable", consc: "Unresponsive", threats: "Cardiac arrest" } }); }
      if (a === "amio300" || a === "amioInf") return O("bad", "h10_amio");
      if (a === "cpr") return O("bad", "p_cpr");
      if (a === "observe") return O("bad", "p_observe");
      return null;
    } }
);
/* ===== Scenarios extras: causes list, ask/check, monitor, harm, sources modal ===== */
var ALG_LINKS = {
  als: { href: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf", label: "RCUK 2025 Adult ALS algorithm" },
  alsPriority: { href: "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-advanced-life-support-guidelines", label: "RCUK 2025 Adult ALS guideline" },
  brady: { href: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20bradyarrhythmia%202025.pdf", label: "RCUK 2025 Adult bradycardia algorithm" },
  tachy: { href: "https://www.resus.org.uk/sites/default/files/2026-03/Adult%20tachyarrhythmia%20algorithm%20V3%20March%202026.pdf", label: "RCUK 2025 Adult tachyarrhythmia algorithm" },
  special: { href: "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/special-circumstances-guidelines", label: "RCUK 2025 Special circumstances guidelines" },
  aden: { href: "https://bnf.nice.org.uk/", label: "BNF" },
  amio: { href: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf", label: "RCUK 2025 Adult ALS algorithm" },
  causes: { href: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf", label: "RCUK 2025 Adult ALS algorithm" },
  rosc: { href: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf", label: "RCUK 2025 Adult ALS algorithm" },
  tdp: { href: "https://www.resus.org.uk/sites/default/files/2026-03/Adult%20tachyarrhythmia%20algorithm%20V3%20March%202026.pdf", label: "RCUK 2025 Adult tachyarrhythmia algorithm" },
  tdpCauses: { href: "https://www.resus.org.uk/sites/default/files/2026-03/Adult%20tachyarrhythmia%20algorithm%20V3%20March%202026.pdf", label: "RCUK 2025 Adult tachyarrhythmia algorithm" },
  narrow: { href: "https://www.resus.org.uk/sites/default/files/2026-03/Adult%20tachyarrhythmia%20algorithm%20V3%20March%202026.pdf", label: "RCUK 2025 Adult tachyarrhythmia algorithm" },
  sync: { href: "https://www.resus.org.uk/sites/default/files/2026-03/Adult%20tachyarrhythmia%20algorithm%20V3%20March%202026.pdf", label: "RCUK 2025 Adult tachyarrhythmia algorithm" },
  fluid: { href: "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-advanced-life-support-guidelines", label: "RCUK 2025 Adult ALS guideline" },
  chestDecomp: { href: "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/special-circumstances-guidelines", label: "RCUK 2025 Special circumstances guidelines" },
  hyperkArrest: { href: "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/special-circumstances-guidelines", label: "RCUK 2025 Special circumstances guidelines" },
  lido: { href: "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-advanced-life-support-guidelines", label: "RCUK 2025 Adult ALS guideline" },
  procain: { href: "https://www.resus.org.uk/sites/default/files/2026-03/Adult%20tachyarrhythmia%20algorithm%20V3%20March%202026.pdf", label: "RCUK 2025 Adult tachyarrhythmia algorithm" },
  pacing: { href: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20bradyarrhythmia%202025.pdf", label: "RCUK 2025 Adult bradycardia algorithm" }
};

function algLinkForKey(k) {
  var src = TXT[k] && TXT[k].src, rec = src && (ALG_LINKS[src] || null);
  if (rec && rec.label && rec.label.indexOf("RCUK") === 0) return rec;
  if (SIM && SIM.scn) {
    var g = SIM.scn.group || "";
    if (/Bradycardia/i.test(g)) return ALG_LINKS.brady;
    if (/Tachycardia/i.test(g)) return ALG_LINKS.tachy;
    if (/arrest/i.test(g)) return ALG_LINKS.als;
  }
  return rec || ALG_LINKS.als;
}
function algLinkHTML(k) {
  var rec = algLinkForKey(k);
  if (!rec) return "";
  return "<p class='scn-alg-link'><a href='" + rec.href + "' target='_blank' rel='noopener' aria-label='" + rec.label + ", opens in a new tab'>" + rec.label + "</a></p>";
}

/* Arrest reversible causes, from the RCUK 2025 Adult ALS algorithm list. */
var CAUSE_ARREST = [
  { id: "hypoxia", label: "Hypoxia" },
  { id: "hypovolaemia", label: "Hypovolaemia" },
  { id: "hyperkalaemia", label: "Hyperkalaemia" },
  { id: "hypokalaemia", label: "Hypokalaemia" },
  { id: "metabolic", label: "Other metabolic (calcium, magnesium, hypoglycaemia)" },
  { id: "temperature", label: "Hypothermia or hyperthermia" },
  { id: "thrombosis", label: "Thrombosis (coronary or pulmonary)" },
  { id: "tension", label: "Tension pneumothorax" },
  { id: "toxins", label: "Toxins" },
  { id: "tamponade", label: "Cardiac tamponade" }
];
/* Brady: algorithm says identify and treat reversible causes, e.g. electrolyte abnormalities.
   Extra items below are common ALS teaching and are flagged where not printed on the 2025 algorithm. */
var CAUSE_BRADY = [
  { id: "electrolytes", label: "Electrolyte abnormalities (including hyperkalaemia)" },
  { id: "drugs", label: "Drugs (beta-blocker or calcium-channel blocker, or other rate-limiting drugs)" },
  { id: "ischaemia", label: "Myocardial ischaemia" },
  { id: "hypothermia", label: "Hypothermia", flag: 1 },
  { id: "hypothyroid", label: "Hypothyroidism", flag: 1 },
  { id: "icp", label: "Raised intracranial pressure", flag: 1 }
];
var CAUSE_TACHY = [
  { id: "drugs", label: "Drugs (including QT-prolonging medicines)" },
  { id: "hypokalaemia", label: "Electrolytes: hypokalaemia" },
  { id: "hypomag", label: "Electrolytes: hypomagnesaemia" },
  { id: "ischaemia", label: "Myocardial ischaemia" },
  { id: "hyperthyroidism", label: "Hyperthyroidism", flag: 1 },
  { id: "hypovolaemia", label: "Hypovolaemia or anaemia", flag: 1 },
  { id: "pain", label: "Pain, anxiety or another sinus-tachycardia cause", flag: 1 }
];

/* Per-scenario extras: correct cause ids, dangerous extra actions, labs, ask text, monitor ranges. */
var SCN_EXTRAS = {
  s1: { kind: "arrest", causes: [], harm: [], mon: { arrest: true } },
  s2: { kind: "arrest", causes: ["hypovolaemia"], harm: [], mon: { arrest: true },
        labs: { k: 4.2, na: 138, ica: 1.18, hb: 78, lactate: 8.4, ph: 7.18, pco2: 5.8, po2: 9.5, glu: 6.4, temp: 36.4 },
        ask: {
          gas: "pH 7.18, PaCO2 5.8 kPa, PaO2 9.5 kPa, lactate 8.4 mmol/L, K+ 4.2 mmol/L, Na+ 138 mmol/L, ionised Ca 1.18 mmol/L, Hb 78 g/L.",
          examine: "Cool, mottled peripheries. Abdomen tense and distended. Weak femoral pulses. Pupils mid-size and reactive.",
          history: "Theatre notes: major abdominal surgery today with ongoing blood loss into the drains.",
          airway: "Airway patent. High-flow oxygen is on. Chest is moving equally."
        } },
  s3: { kind: "brady", causes: [], harm: [], mon: { hr: 40, spo2: 94, rr: 18, sys: 78, dia: 44, trend: -1 } },
  s4: { kind: "tachy", causes: [], harm: [], mon: { hr: 180, spo2: 98, rr: 18, sys: 128, dia: 78, trend: 0 } },
  s5: { kind: "tachy", causes: ["ischaemia"], harm: ["aden"], mon: { hr: 190, spo2: 93, rr: 24, sys: 76, dia: 40, trend: -1 } },
  s6: { kind: "tachy", causes: ["drugs", "hypokalaemia"], harm: [], mon: { hr: 88, spo2: 97, rr: 16, sys: 104, dia: 62, trend: 0 },
        labs: { k: 3.1, mg: 0.7 },
        ask: {
          gas: "pH 7.41, PaCO2 5.1 kPa, PaO2 12.0 kPa, lactate 1.2 mmol/L, K+ 3.1 mmol/L, Na+ 138 mmol/L, ionised Ca 1.20 mmol/L, Hb 128 g/L.",
          history: "The drug chart includes two QT-prolonging medicines. Potassium this morning was 3.1 mmol/L."
        } },
  h1: { kind: "arrest", causes: ["hyperkalaemia"], harm: [], mon: { arrest: true },
        labs: { k: 7.8, na: 132, ica: 1.05, hb: 102, lactate: 3.6, ph: 7.22, pco2: 4.4, po2: 11.2, glu: 6.8, temp: 36.6 },
        ask: {
          gas: "pH 7.22, PaCO2 4.4 kPa, PaO2 11.2 kPa, lactate 3.6 mmol/L, K+ 7.8 mmol/L, Na+ 132 mmol/L, ionised Ca 1.05 mmol/L, Hb 102 g/L.",
          history: "Usual haemodialysis three times a week. Yesterday's session was missed. No other new medicines."
        } },
  h2: { kind: "arrest", causes: ["tension"], harm: [], mon: { arrest: true },
        ask: {
          examine: "Trachea deviated to the left. Right chest is resonant with reduced air entry. Distended neck veins. Pupils mid-size and reactive.",
          history: "A right internal jugular central line was just being placed.",
          airway: "Airway patent. High-flow oxygen is on. The right chest is not moving well."
        } },
  h3: { kind: "arrest", causes: [], harm: [], mon: { arrest: true } },
  h4: { kind: "arrest", causes: [], harm: [], mon: { arrest: true } },
  h5: { kind: "tachy", causes: [], harm: [], mon: { hr: 170, spo2: 99, rr: 16, sys: 124, dia: 76, trend: 0 } },
  h6: { kind: "tachy", causes: [], harm: ["aden"], mon: { hr: 160, spo2: 92, rr: 26, sys: 80, dia: 50, trend: -1 } },
  h7: { kind: "tachy", causes: ["ischaemia"], harm: [], mon: { hr: 150, spo2: 97, rr: 16, sys: 126, dia: 80, trend: 0 } },
  h8: { kind: "brady", causes: [], harm: [], mon: { hr: 32, spo2: 95, rr: 16, sys: 110, dia: 68, trend: 0 } },
  h9: { kind: "arrest", causes: ["hypokalaemia"], harm: [], mon: { arrest: true }, labs: { k: 2.8 } },
  h10: { kind: "tachy", causes: ["ischaemia"], harm: ["aden"], mon: { hr: 180, spo2: 91, rr: 22, sys: 82, dia: 48, trend: -1 } },
  h11: { kind: "brady", causes: [], harm: [], mon: { hr: 38, spo2: 94, rr: 18, sys: 76, dia: 42, trend: -1 } },
  h12: { kind: "brady", causes: [], harm: [], mon: { hr: 36, spo2: 95, rr: 16, sys: 74, dia: 40, trend: -1 } },
  h13: { kind: "arrest", causes: [], harm: [], mon: { arrest: true } },
  h14: { kind: "arrest", causes: ["hypovolaemia"], harm: [], mon: { arrest: true },
        labs: { k: 4.1, na: 138, ica: 1.16, hb: 72, lactate: 8.8, ph: 7.16, pco2: 5.9, po2: 9.2, glu: 6.2, temp: 36.3 },
        ask: {
          gas: "pH 7.16, PaCO2 5.9 kPa, PaO2 9.2 kPa, lactate 8.8 mmol/L, K+ 4.1 mmol/L, Na+ 138 mmol/L, ionised Ca 1.16 mmol/L, Hb 72 g/L.",
          examine: "Cool, mottled peripheries. The abdominal drain has filled with fresh blood. Weak femoral pulses.",
          history: "Major abdominal surgery yesterday, with ongoing blood loss into the drains.",
          airway: "Airway patent. High-flow oxygen is on. Chest is moving equally."
        } },
  h15: { kind: "arrest", causes: ["thrombosis"], harm: [], mon: { arrest: true },
        ask: {
          history: "Arrived yesterday after a long-haul flight. Sudden breathlessness, then collapse. No known heart or lung disease.",
          examine: "Markedly cyanosed. Neck veins may be full. Chest moving equally. No rash.",
          airway: "Airway patent. High-flow oxygen is on."
        } },
  h16: { kind: "arrest", causes: ["tamponade"], harm: [], mon: { arrest: true },
        ask: {
          history: "Day 2 after coronary artery bypass grafts. Chest drain output has increased.",
          examine: "The chest is closed with a sternotomy dressing. Drain output is heavy. Neck veins may be full.",
          airway: "Airway patent. High-flow oxygen is on."
        } },
  h17: { kind: "arrest", causes: ["hypoxia"], harm: [], mon: { arrest: true },
        ask: {
          history: "Difficult intubation on the ward immediately before the arrest.",
          examine: "Deeply cyanosed. Chest movement is poor. Look at the tracheal tube and ETCO2.",
          airway: "The tracheal tube position needs to be confirmed. Exclude unrecognised oesophageal intubation. Give 100% oxygen."
        } },
  h18: { kind: "arrest", causes: ["hypokalaemia"], harm: [], mon: { arrest: true }, labs: { k: 2.1, mg: 0.6 },
        ask: {
          gas: "pH 7.38, PaCO2 4.8 kPa, PaO2 11.0 kPa, lactate 2.4 mmol/L, K+ 2.1 mmol/L, Na+ 132 mmol/L, ionised Ca 1.18 mmol/L, Hb 118 g/L.",
          history: "High-dose loop and thiazide diuretics. No other new medicines recorded."
        } },
  h19: { kind: "tachy", causes: ["ischaemia"], harm: [], mon: { hr: 150, spo2: 97, rr: 16, sys: 124, dia: 72, trend: 0 } },
  h20: { kind: "tachy", causes: ["ischaemia"], harm: ["aden"], mon: { hr: 190, spo2: 92, rr: 24, sys: 78, dia: 42, trend: -1 } },
  h21: { kind: "tachy", causes: [], harm: [], mon: { hr: 200, spo2: 97, rr: 18, sys: 108, dia: 70, trend: 0 } },
  h22: { kind: "tachy", causes: [], harm: [], mon: { hr: 180, spo2: 99, rr: 16, sys: 122, dia: 76, trend: 0 } }
};

var ECG12_TEXTS = {
  s1: "A 12-lead is not completed during this shockable arrest. The monitor and pads show ventricular fibrillation, with no organised QRS complexes. Simulation simplification: this is a scripted description of the case rhythm.",
  s2: "If a 12-lead is obtained during the rhythm check, it shows an organised narrow-complex rhythm at about 110 to 125 /min, without ST elevation diagnostic of STEMI in this simulation. There is no pulse (PEA). Simulation simplification: this is a scripted 12-lead description for this case.",
  s3: "12-lead ECG: complete (third-degree) atrioventricular block. P waves and QRS complexes are dissociated. The escape rhythm is narrow-complex at about 40 /min. No ST elevation is reported in this simulation. Simulation simplification: this is a scripted 12-lead description of the case rhythm.",
  s4: "12-lead ECG: regular narrow-complex tachycardia at about 180 /min. No P waves, no sawtooth flutter waves, and no delta wave are seen. The QRS remains narrow throughout. Simulation simplification: this is a scripted 12-lead description for this case.",
  s5: "12-lead ECG: regular broad-complex tachycardia at about 190 /min, consistent with monomorphic ventricular tachycardia. The patient is unstable, so this is treated as VT. Q waves consistent with a previous myocardial infarction are described in this simulation. Simulation simplification: this is a scripted 12-lead description for this case.",
  s6: "Between self-terminating runs, the 12-lead shows sinus rhythm with a prolonged QTc. During a run, a polymorphic broad-complex tachycardia that twists about the baseline is seen (torsades de pointes). No delta wave is present. Simulation simplification: this is a scripted 12-lead description for this case. The prolonged QTc is consistent with the history; the exact interval is not quoted from a guideline source.",
  h1: "The 12-lead during this arrest shows asystole (no QRS complexes). A recording from earlier this morning is described as having a wide QRS and tall peaked T waves, consistent with severe hyperkalaemia. Simulation simplification: the earlier recording is scripted for this case. RCUK 2025 special circumstances mention ECG changes in severe hyperkalaemia but do not list peaked T waves or QRS broadening in the saved text.",
  h2: "If a 12-lead is obtained during the rhythm check, it shows an organised narrow-complex rhythm at about 100 to 120 /min, without ST elevation diagnostic of STEMI in this simulation. There is no pulse (PEA). Simulation simplification: this is a scripted 12-lead description for this case.",
  h3: "A 12-lead is not completed during this shockable arrest. The monitor and pads show ventricular fibrillation, with no organised QRS complexes. Simulation simplification: this is a scripted description of the case rhythm.",
  h4: "A 12-lead is not completed during this shockable arrest. The monitor and pads show ventricular fibrillation, with no organised QRS complexes. Simulation simplification: this is a scripted description of the case rhythm.",
  h5: "12-lead ECG: regular narrow-complex tachycardia at about 170 /min. No P waves, no sawtooth flutter waves, and no delta wave are seen. The QRS remains narrow throughout. Simulation simplification: this is a scripted 12-lead description for this case.",
  h6: "12-lead ECG: irregularly irregular narrow-complex tachycardia without visible P waves, consistent with atrial fibrillation with a rapid ventricular response. No sawtooth flutter waves and no delta wave are seen. Simulation simplification: this is a scripted 12-lead description for this case.",
  h7: "12-lead ECG: regular broad-complex tachycardia at about 150 /min, consistent with monomorphic ventricular tachycardia. The patient is stable. Q waves consistent with a previous myocardial infarction are described in this simulation. Simulation simplification: this is a scripted 12-lead description for this case.",
  h8: "12-lead ECG: complete (third-degree) atrioventricular block with a slow, broad QRS escape at about 34 /min (a ventricular escape). This rhythm carries a risk of asystole. No ST elevation is reported in this simulation. Simulation simplification: this is a scripted 12-lead description of the case rhythm.",
  h9: "The arrest rhythm is a polymorphic broad-complex tachycardia that twists about the baseline (torsades de pointes). A 12-lead from this morning is described as showing a prolonged QTc. Simulation simplification: this is a scripted 12-lead description for this case.",
  h10: "12-lead ECG: regular broad-complex tachycardia at about 180 /min, immediately after ROSC, consistent with monomorphic ventricular tachycardia. Simulation simplification: this is a scripted 12-lead description for this case.",
  h11: "12-lead ECG: complete (third-degree) atrioventricular block. P waves and QRS complexes are dissociated. The escape rhythm is narrow-complex at about 38 /min. No ST elevation is reported in this simulation. Simulation simplification: this is a scripted 12-lead description of the case rhythm.",
  h12: "12-lead ECG: sinus bradycardia at about 36 /min. P waves precede each QRS. No ST elevation is reported in this simulation. Simulation simplification: this is a scripted 12-lead description of the case rhythm.",
  h13: "A 12-lead is not completed during this shockable arrest. The monitor and pads show ventricular fibrillation, with no organised QRS complexes. Simulation simplification: this is a scripted description of the case rhythm.",
  h14: "The first 12-lead attempt during the shockable phase is not completed. After the rhythm changes, a recording at a rhythm check shows an organised narrow-complex rhythm at about 110 to 125 /min, without ST elevation diagnostic of STEMI in this simulation. There is no pulse (PEA). Simulation simplification: this is a scripted 12-lead description for this case.",
  h15: "If a 12-lead is obtained during the rhythm check, it shows an organised narrow-complex rhythm at about 120 to 140 /min, without ST elevation diagnostic of STEMI in this simulation. There is no pulse (PEA). Simulation simplification: this is a scripted 12-lead description for this case.",
  h16: "If a 12-lead is obtained during the rhythm check, it shows an organised narrow-complex rhythm at about 40 to 55 /min, without ST elevation diagnostic of STEMI in this simulation. There is no pulse (PEA). Simulation simplification: this is a scripted 12-lead description for this case.",
  h17: "If a 12-lead is obtained during the rhythm check, it shows an organised narrow-complex rhythm at about 40 to 50 /min, without ST elevation diagnostic of STEMI in this simulation. There is no pulse (PEA). Simulation simplification: this is a scripted 12-lead description for this case.",
  h18: "The 12-lead during this arrest shows asystole (no QRS complexes). Simulation simplification: this is a scripted description of the case rhythm.",
  h19: "12-lead ECG: regular broad-complex tachycardia at about 150 /min, consistent with monomorphic ventricular tachycardia. The patient is stable, but sedation or anaesthesia risk is too high. Simulation simplification: this is a scripted 12-lead description for this case.",
  h20: "12-lead ECG: regular broad-complex tachycardia at about 190 /min, consistent with monomorphic ventricular tachycardia. The patient is unstable, so this is treated as VT. Simulation simplification: this is a scripted 12-lead description for this case.",
  h21: "12-lead ECG: irregular broad-complex tachycardia at a very rapid rate. A delta-wave pattern is described in this simulation, and the case is treated as pre-excited atrial fibrillation. Simulation simplification: this is a scripted 12-lead description for this case.",
  h22: "12-lead ECG: regular broad-complex tachycardia at about 180 /min. Previous recordings during known SVT showed the same wide complexes, so this is treated as known SVT with aberrant conduction. Simulation simplification: this is a scripted 12-lead description for this case."
};

(function applyEcg12() {
  var texts = ECG12_TEXTS;
  Object.keys(texts).forEach(function (id) {
    if (!SCN_EXTRAS[id]) return;
    SCN_EXTRAS[id].ask = SCN_EXTRAS[id].ask || {};
    if (!SCN_EXTRAS[id].ask.ecg12) SCN_EXTRAS[id].ask.ecg12 = texts[id];
  });
})();

var ASK_DELAY_MS = { bm: 3000, temp: 3000, airway: 3000, examine: 5000, history: 5000, ecg12: 7000, gas: 10000, nibp: 5000 };
var ASK_ITEMS = [
  { id: "bm", label: "Capillary glucose (BM)", delay: 3000 },
  { id: "gas", label: "Blood gas (pH, PaCO2, PaO2, lactate, K+, Na+, ionised Ca, Hb)", delay: 10000 },
  { id: "temp", label: "Temperature", delay: 3000 },
  { id: "ecg12", label: "12-lead ECG description", delay: 7000 },
  { id: "examine", label: "Examine (airway, chest, pulses, pupils)", delay: 5000 },
  { id: "history", label: "Collateral history or drug chart", delay: 5000 },
  { id: "airway", label: "Airway check", delay: 3000 }
];

/* Reference ranges used in ask results. SpO2 94 to 98% is from the RCUK 2025 ALS algorithm (immediately after ROSC). Other numerical ranges are teaching defaults and are flagged. */
var REF_RANGE_NOTE = "Teaching reference ranges (flagged unless quoted from RCUK 2025): K+ 3.5 to 5.3 mmol/L; Na+ 135 to 145 mmol/L; ionised Ca 1.10 to 1.30 mmol/L; pH 7.35 to 7.45; PaCO2 4.7 to 6.0 kPa; PaO2 11 to 13 kPa on air; lactate less than 2.0 mmol/L; Hb about 120 to 170 g/L; glucose 4.0 to 7.8 mmol/L; temperature 36.0 to 37.5 C. Post-ROSC SpO2 target 94 to 98% and systolic blood pressure over 100 mmHg: RCUK 2025 Adult ALS algorithm.";

function extrasFor(st) {
  var id = st && st.scn && st.scn.id;
  return (id && SCN_EXTRAS[id]) || { kind: "arrest", causes: [], harm: [], mon: {} };
}
function causeSetFor(st) {
  var k = extrasFor(st).kind;
  if (k === "brady") return CAUSE_BRADY;
  if (k === "tachy") return CAUSE_TACHY;
  return CAUSE_ARREST;
}

function detectHarm(a, st) {
  if (!st) return null;
  var pulse = !!st.pulse;
  var gen = (st.rhythm && st.rhythm.gen) || "";
  var extra = extrasFor(st);
  if (pulse && a === "shock") return { id: "harm_shockPulse", label: "Unsynchronised shock in a patient with a pulse" };
  if (a === "shock" && st.cpr && !pulse) {
    var shockGen = (st.rhythm && st.rhythm.gen) || "";
    if (shockGen === "vf" || shockGen === "vt" || shockGen === "torsades") {
      return { id: "harm_shockDuringCpr", label: "Shock delivered during chest compressions" };
    }
  }
  if (pulse && a === "cpr") return { id: "harm_cprPulse", label: "CPR in a patient with a pulse" };
  if (!pulse && gen === "asystole" && (a === "shock" || a === "sync")) return { id: "harm_shockAsys", label: "Shock delivered for asystole" };
  if (extra.harm && extra.harm.indexOf(a) >= 0) {
    if (a === "aden") {
      var rgen = (st.rhythm && st.rhythm.gen) || "";
      if (rgen === "af" || rgen === "flutter_var" || rgen === "pre_af") {
        return { id: "harm_adenUnstableAF", label: "Adenosine in unstable atrial fibrillation" };
      }
      return { id: "harm_adenUnstable", label: "Adenosine in an unstable tachycardia" };
    }
    return { id: "harm_other", label: ACT[a] ? ACT[a].label : a };
  }
  return null;
}

function defaultEvent(a, label, resolved) {
  if (resolved && resolved.event) return resolved.event;
  if (a === "aden" && resolved && resolved.dose) return "Adenosine " + resolved.dose + " mg rapid IV given.";
  var ev = {
    assess: "Rhythm and pulse checked.",
    expert: "Expert help requested.",
    cpr: "CPR 30:2 started.",
    ff: "Two minutes of CPR completed. The rhythm is on the monitor.",
    skip: "Simulated time advanced by 1 minute.",
    charge: "Defibrillator charging; CPR continues if it is already in progress.",
    clear: "All clear.",
    shock: "Unsynchronised shock delivered.",
    sync: "Synchronised shock delivered.",
    pace: "Transcutaneous pacing started.",
    vagal: "Vagal manoeuvres performed.",
    adr: "Adrenaline 1 mg IV given.",
    amio300: "Amiodarone 300 mg IV given.",
    amio150: "Amiodarone 150 mg IV given.",
    atro: "Atropine 500 micrograms IV given.",
    aden: "Adenosine given.",
    mg: "Magnesium 8 mmol (2 g) IV given.",
    fluid: "IV fluid bolus given.",
    bicarb: "Sodium bicarbonate IV given.",
    calcium: "Calcium chloride IV given.",
    decompress: "Chest decompression performed.",
    amioInf: "Amiodarone 300 mg IV infusion started.",
    adrInf: "Adrenaline infusion started.",
    iso: "Isoprenaline infusion started.",
    observe: "Observe and reassess later chosen.",
    nibp: "NIBP cycled.",
    causes: "A reversible cause was named.",
    amio1020: "Amiodarone 300 mg IV over 10 to 20 min started.",
    procain: "Procainamide 10 to 15 mg/kg IV over 20 min started.",
    verap: "Verapamil 5 to 10 mg IV over 2 min given.",
    kcl: "Potassium chloride 20 mmol IV over 2 to 3 min, then 10 mmol over 2 min, given.",
    lido100: "Lidocaine 100 mg IV given.",
    lido50: "Lidocaine 50 mg IV given.",
    fibrin: "Fibrinolytic or thrombolytic drug given, following local protocol.",
    padsAP: "Pads changed to the antero-posterior position.",
    oxygen: "100% oxygen given and the airway checked.",
    pericardiocentesis: "Pericardiocentesis performed.",
    resternotomy: "Return to theatre / emergency re-sternotomy started."
  };
  if (ev[a]) return ev[a];
  return (label || a || "Action") + ".";
}

function initScenarioExtras(st) {
  var x = extrasFor(st);
  var m = x.mon || {};
  st.asked = {};
  st.found = {};
  st.mon = {
    arrest: !!m.arrest || !st.pulse,
    hr: m.hr || 0,
    hrBase: m.hr || 0,
    spo2: m.arrest ? null : (m.spo2 != null ? m.spo2 : 97),
    spo2Base: m.arrest ? null : (m.spo2 != null ? m.spo2 : 97),
    rr: m.arrest ? 0 : (m.rr != null ? m.rr : 16),
    rrBase: m.arrest ? 0 : (m.rr != null ? m.rr : 16),
    sys: m.sys != null ? m.sys : null,
    dia: m.dia != null ? m.dia : null,
    sysBase: m.sys != null ? m.sys : null,
    diaBase: m.dia != null ? m.dia : null,
    trend: m.trend || 0,
    interval: m.interval || 120,
    lastNIBP: null,
    nextDrift: prefersReduced() ? 15 : 4,
    labs: Object.assign({ k: 4.3, na: 140, ica: 1.20, hb: 134, lactate: 1.1, ph: 7.40, pco2: 5.3, po2: 12.4, glu: 5.6, temp: 36.8, mg: 0.85 }, x.labs || {})
  };
  if (typeof syncMonBpFromVit === "function") syncMonBpFromVit(st);
}

function tickMonitor(st) {
  if (!st || !st.mon || st.done) return;
  var m = st.mon;
  m.arrest = !st.pulse;
  if (st.pulse && st.sig && typeof st.sig.measure.rate === "number") {
    m.hrBase = st.sig.measure.rate;
  } else if (!st.pulse) {
    m.hrBase = 0;
  }
  if (m.arrest) {
    m.hr = 0;
    m.spo2 = null;
    m.rr = 0;
    if (m.lastNIBP) m.lastNIBP.unrecordable = true;
  }
  if (typeof maybeAutoNIBP === "function") maybeAutoNIBP(st);
  var every = prefersReduced() ? 15 : 4;
  if (prefersReduced() && every > 20) return;
  m.nextDrift = (m.nextDrift || every) - 1;
  if (m.nextDrift > 0) return;
  m.nextDrift = every;
  function drift(val, base, lo, hi, amt) {
    if (val == null || !base) return val;
    var t = m.trend || 0;
    var d = (Math.random() * 2 - 1) * amt + t * amt * 0.35;
    var n = Math.round((val + d) * 10) / 10;
    if (n < lo) n = lo;
    if (n > hi) n = hi;
    return n;
  }
  if (!m.arrest && m.hrBase) m.hr = drift(m.hr || m.hrBase, m.hrBase, m.hrBase - 4, m.hrBase + 4, prefersReduced() ? 1 : 3);
  if (!m.arrest && m.spo2Base != null) m.spo2 = Math.round(drift(m.spo2 != null ? m.spo2 : m.spo2Base, m.spo2Base, Math.max(84, m.spo2Base - 3), Math.min(100, m.spo2Base + 2), 1));
  if (!m.arrest) m.rr = Math.round(drift(m.rr || m.rrBase, m.rrBase, Math.max(8, m.rrBase - 3), m.rrBase + 4, 1));
}

function parseBpString(s) {
  var m = String(s || "").match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { sys: +m[1], dia: +m[2] } : null;
}
function syncMonBpFromVit(st) {
  if (!st || !st.mon || !st.vit) return;
  var bp = parseBpString(st.vit.bp);
  if (!bp) return;
  st.mon.sysBase = bp.sys;
  st.mon.diaBase = bp.dia;
  st.mon.sys = bp.sys;
  st.mon.dia = bp.dia;
}
function nibpAgeText(st, last) {
  if (!st || !last) return "";
  var dt = Math.max(0, (st.clock || 0) - (last.t || 0));
  if (dt <= 0) return "just now";
  var m = Math.floor(dt / 60), s = dt % 60;
  if (!m) return dt + " s ago";
  if (!s) return m + " min ago";
  return m + " min " + s + " s ago";
}
function maybeAutoNIBP(st) {
  if (!st || !st.mon || st.done) return;
  if (typeof MODEL_RUNNING !== "undefined" && MODEL_RUNNING) return;
  var m = st.mon;
  if (!m.lastNIBP || !m.interval) return;
  if (typeof isAskPending === "function" && isAskPending("nibp")) return;
  if ((st.clock || 0) - (m.lastNIBP.t || 0) < m.interval) return;
  /* Do not auto-cycle an unrecordable cuff during arrest: it would spam the log and is clinically meaningless. After ROSC, a due cycle records the current BP. */
  if (!st.pulse || m.arrest) return;
  var o = cycleNIBP(st, true);
  var no = O("info", (o && o.keys) || "n_nibp", { event: o.event, notAction: true, autoNibp: true });
  no.label = "NIBP auto-cycle";
  if (typeof logEvent === "function") logEvent(no, o.event, "nibp-auto");
}
function cycleNIBP(st, auto) {
  var reading = previewNIBP(st);
  if (auto) reading.auto = true;
  applyNIBPReading(st, reading);
  var ev = reading.event || (reading.unrecordable ? "NIBP cycled: unrecordable." : "NIBP cycled.");
  if (auto && ev && ev.charAt(ev.length - 1) === ".") ev = ev.slice(0, -1) + " (automatic cycle).";
  else if (auto) ev = ev + " (automatic cycle).";
  return { v: "info", keys: reading.keys || (reading.unrecordable ? ["n_nibpFail"] : ["n_nibp"]), event: ev };
}

function renderMonitor() {
  if (!SIM || !SIM.mon) { renderVitalsLegacy && renderVitalsLegacy(); return; }
  var m = SIM.mon, pulse = !!SIM.pulse;
  tickMonitor(SIM);
  function cell(label, val, note, aria) {
    var a = aria ? " aria-label='" + esc(aria) + "'" : "";
    return "<div class='stat'" + a + "><div class='stat-val'>" + esc(val) + "</div><div class='stat-label'>" + esc(label) + (note ? " <span class='stat-note'>" + esc(note) + "</span>" : "") + "</div></div>";
  }
  var hr = !pulse ? "No pulse" : (m.hr ? Math.round(m.hr) + " /min" : "Not yet checked");
  var spo2 = !pulse ? "No trace" : (m.spo2 != null ? Math.round(m.spo2) + " %" : "No trace");
  var rr = !pulse ? "Not breathing" : (m.rr != null ? Math.round(m.rr) + " /min" : "Not yet counted");
  var nibp, nibpNote = "", nibpAria = "";
  if (typeof isAskPending === "function" && isAskPending("nibp")) {
    nibp = "Cycling…";
    nibpNote = "Pending NIBP cycle";
    nibpAria = "NIBP cycling";
  } else if (!m.lastNIBP) {
    nibp = "--/--";
    nibpAria = "not yet measured";
  } else if (!pulse || m.lastNIBP.unrecordable) {
    nibp = "Unrecordable";
    nibpNote = "Last cycled " + mmss(m.lastNIBP.t) + " · " + nibpAgeText(SIM, m.lastNIBP);
    nibpAria = "NIBP unrecordable, last cycled " + mmss(m.lastNIBP.t) + ", " + nibpAgeText(SIM, m.lastNIBP);
  } else {
    nibp = m.lastNIBP.sys + "/" + m.lastNIBP.dia + " mmHg";
    nibpNote = "Last measured " + mmss(m.lastNIBP.t) + " (NIBP) · " + nibpAgeText(SIM, m.lastNIBP);
    nibpAria = "NIBP " + nibp + ", last measured " + mmss(m.lastNIBP.t) + ", " + nibpAgeText(SIM, m.lastNIBP);
  }
  var v = SIM.vit || {};
  var html = cell("Heart rate", hr) + cell("SpO2", spo2, !pulse ? "No pulse: no pulse oximeter trace" : "") + cell("Respiratory rate", rr) + cell("NIBP", nibp, nibpNote, nibpAria);
  html += cell("Conscious level", v.consc || "") + cell("Life-threatening features", v.threats || "");
  $("scnVitals").innerHTML = html;
}

if (typeof SRC === "object") {
  SRC.causesList = "RCUK 2025 Adult ALS algorithm, reversible causes: hypoxia; hypovolaemia; hyper-hypokalaemia, -calcaemia, -magnesaemia, hypoglycaemia (metabolic); hypo-hyperthermia; thrombosis (coronary/pulmonary); tension pneumothorax; toxins; tamponade (cardiac).";
  SRC.bradyCauses = "RCUK 2025 Adult bradyarrhythmia algorithm: identify and treat reversible causes, e.g. electrolyte abnormalities. RCUK 2025 Adult ALS guideline: consider glucagon if beta-blockers or calcium channel blockers are a potential cause of the bradycardia.";
  SRC.ecg12Sim = "Simulation simplification: 12-lead descriptions are scripted to match each case. Delta waves and flutter waves are mentioned only when they belong in that case. Peaked T waves and QRS broadening in hyperkalaemia are common teaching; the saved RCUK 2025 special circumstances text mentions ECG changes but does not list those morphologies.";
  SRC.refRanges = REF_RANGE_NOTE;
  SRC.harmAden = "RCUK Adult tachyarrhythmia algorithm (updated March 2026): life-threatening features (including shock and immediately post-ROSC) lead to synchronised shock, not adenosine. Adenosine is on the stable regular narrow (or selected regular monomorphic) pathway. Treating an unstable tachycardia with adenosine instead of cardioversion was treated as a dangerous error in this simulation.";
  SRC.harmShockPulse = "RCUK 2025 Adult ALS guideline and tachyarrhythmia algorithm: unsynchronised defibrillation is for VF or pulseless VT. A tachyarrhythmia with a pulse is treated with synchronised cardioversion when unstable. In this simulation an unsynchronised shock in a patient with a pulse ends the case, whether Show solution is on or off, because it would fail the ALS assessment.";
  SRC.harmShockDuringCpr = "RCUK 2025 Adult ALS guideline: 'Do not defibrillate during manual chest compressions (even when wearing clinical gloves), as that practice is not safe to the rescuer.' In this simulation a shock given while compressions are still ongoing ends the case, whether Show solution is on or off.";
  SRC.harmCprPulse = "RCUK 2025 Adult ALS guideline: CPR is for cardiac arrest (unresponsive, not breathing normally). Chest compressions in a patient with a pulse were treated as a dangerous error in this simulation.";
  SRC.harmAsys = "RCUK 2025 Adult ALS algorithm: asystole is a non-shockable rhythm. Do not shock asystole.";
  SRC.harmAdenAF = "RCUK Adult tachyarrhythmia algorithm (updated March 2026): life-threatening features lead to synchronised shock. Adenosine is for a stable, regular narrow-complex tachycardia without pre-excitation, not for unstable atrial fibrillation.";
  SRC.harmOther = "This simulation ends the case when Show solution is off if a listed dangerous error is made. The debrief explains why.";
}

function Tfb(full, guideline, src, extra) {
  extra = extra || {};
  return { full: full, guideline: guideline, src: src, flag: extra.flag || 0, outcome: extra.outcome || "", whyWrong: extra.whyWrong || "", nextStep: extra.nextStep || "", event: extra.event || "" };
}
if (typeof TXT === "object") {
  TXT.n_nibp = Tfb("NIBP cycled. Blood pressure is measured non-invasively, not continuously, unless an arterial line is in place (simulation: no arterial line by default).", "Monitor BP", "refRanges", { outcome: "", event: "NIBP cycled." });
  TXT.n_nibpFail = Tfb("NIBP cycled. No reading was obtained (unrecordable in cardiac arrest).", "Monitor BP", "als", { event: "NIBP cycled: unrecordable." });
  TXT.harm_shockPulse = Tfb("An unsynchronised shock was delivered in a patient who had a pulse. Unsynchronised defibrillation is for VF or pulseless VT. With a pulse, unstable tachyarrhythmias are treated with synchronised cardioversion.", "Tachyarrhythmia: synchronised shock if unstable", "harmShockPulse", { whyWrong: "Unsynchronised shock is not used in a patient with a pulse.", event: "Unsynchronised shock delivered." });
  TXT.harm_shockDuringCpr = Tfb("A shock was given while chest compressions were still ongoing. Do not defibrillate during chest compressions. Stop compressions and give an all clear first.", "ALS: do not defibrillate during manual chest compressions", "harmShockDuringCpr", { whyWrong: "Do not defibrillate during chest compressions. Stop and give an all clear first.", event: "Unsynchronised shock attempted during chest compressions." });
  TXT.harm_cprPulse = Tfb("CPR was started in a patient who had a pulse. Chest compressions are for cardiac arrest.", "ALS: CPR is for cardiac arrest", "harmCprPulse", { whyWrong: "The patient had a pulse, so CPR should not have been started.", event: "CPR 30:2 started." });
  TXT.harm_shockAsys = Tfb("A shock was delivered for asystole. Asystole is a non-shockable rhythm.", "ALS: non-shockable pathway", "harmAsys", { whyWrong: "Asystole is not a shockable rhythm.", event: "Shock delivered." });
  TXT.harm_adenUnstable = Tfb("Adenosine was given in an unstable tachycardia. The algorithm's unstable path is synchronised cardioversion, not adenosine.", "Tachyarrhythmia: unstable, synchronised shock", "harmAden", { whyWrong: "Adenosine is not the treatment for an unstable tachycardia.", event: "Adenosine given." });
  TXT.harm_adenUnstableAF = Tfb("Adenosine was given in unstable atrial fibrillation. This is an irregular narrow-complex tachycardia with life-threatening features. The algorithm's unstable path is synchronised cardioversion, not adenosine.", "Tachyarrhythmia: unstable, synchronised shock", "harmAdenAF", { whyWrong: "Adenosine is not the treatment for unstable, irregular atrial fibrillation.", event: "Adenosine given." });
  TXT.harm_other = Tfb("This action was treated as a dangerous error in this simulation.", "Simulation: dangerous error", "harmOther", { whyWrong: "This action was treated as a dangerous error in this simulation.", event: "A dangerous action was recorded." });
  TXT.cause_ok = Tfb("The cause named fits this case.", "Identify reversible causes", "causesList", { outcome: "The cause named fits this case.", event: "A reversible cause was named." });
  TXT.cause_bad = Tfb("Nothing in this scene supports that reversible cause.", "Identify reversible causes", "causesList", { whyWrong: "Nothing in this scene supports that reversible cause.", event: "A reversible cause was named." });
  TXT.n_skipTime = Tfb("Simulated time advanced by 1 minute. Skip time is not an algorithm action and does not count as performing CPR.", "Simulation clock", "alsPriority", { event: "Simulated time advanced by 1 minute." });
}

function popupForMenu(id) {
  if (id === "scnAskList") return $("scnAskPopup");
  if (id === "scnCauseList") return $("scnCausePopup");
  if (id === "scnDrugList") return $("scnDrugPopup");
  return $(id);
}
function openerForMenu(id) {
  if (id === "scnAskList") return document.querySelector("[data-a='ask']");
  if (id === "scnCauseList") return document.querySelector("[data-a='causes']");
  if (id === "scnDrugList") return document.querySelector("[data-a='drugs']");
  return null;
}
function isScnMenuOpen(id) {
  var pop = popupForMenu(id);
  return !!(pop && !pop.hidden);
}
function setMenuExpanded(id, open) {
  var btn = openerForMenu(id);
  if (btn) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-haspopup", "dialog");
  }
}
function positionScnPopup(panel, opener) {
  if (!panel) return;
  if (panel.classList && panel.classList.contains("scn-drug-panel")) {
    panel.style.top = "";
    panel.style.left = "";
    panel.style.right = "";
    panel.style.width = "";
    return;
  }
  if (window.matchMedia("(max-width: 699px)").matches) {
    panel.style.top = "";
    panel.style.left = "";
    panel.style.right = "";
    panel.style.width = "";
    return;
  }
  var r = (opener && opener.getBoundingClientRect) ? opener.getBoundingClientRect() : null;
  var card = document.querySelector(".scn-actions-card");
  var cr = card && card.getBoundingClientRect();
  var anchor = r || cr;
  if (!anchor) return;
  var gap = 8, margin = 16;
  var width = Math.min((panel && panel.classList && panel.classList.contains("scn-drug-panel") ? 36 : 28) * 16, window.innerWidth - margin * 2);
  var left = (cr ? cr.right + gap : anchor.right + gap);
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, (cr ? cr.left : anchor.left));
    if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin);
  }
  var top = anchor.top;
  var maxH = Math.min(window.innerHeight * 0.7, 36 * 16);
  if (top + Math.min(panel.offsetHeight || 280, maxH) > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - maxH - margin);
  }
  panel.style.top = Math.round(top) + "px";
  panel.style.left = Math.round(left) + "px";
  panel.style.width = Math.round(width) + "px";
}
function scnPopupKey(e) {
  var openId = isScnMenuOpen("scnDrugList") ? "scnDrugList" : (isScnMenuOpen("scnAskList") ? "scnAskList" : (isScnMenuOpen("scnCauseList") ? "scnCauseList" : null));
  if (!openId) return;
  if (openId === "scnDrugList" && typeof drugTypeahead === "function") drugTypeahead(e);
  if (e.key === "Escape") { e.preventDefault(); closeScnMenu(openId); return; }
  if (e.key !== "Tab") return;
  var panel = $(openId);
  var list = typeof getFocusable === "function" ? getFocusable(panel) : [];
  if (!list.length) return;
  var first = list[0], last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function closeScnMenu(id) {
  var pop = popupForMenu(id), panel = $(id);
  if (!pop || pop.hidden) {
    if (panel) { panel.setAttribute("aria-hidden", "true"); }
    return;
  }
  pop.hidden = true;
  if (panel) panel.setAttribute("aria-hidden", "true");
  setMenuExpanded(id, false);
  document.removeEventListener("keydown", scnPopupKey, true);
  document.body.classList.remove("scn-popup-open");
  var opener = (panel && panel._opener) || openerForMenu(id);
  if (opener && opener.focus && document.contains(opener)) opener.focus();
}
function openScnMenu(id, opener) {
  ["scnCauseList", "scnAskList", "scnDrugList"].forEach(function (other) { if (other !== id) closeScnMenu(other); });
  var pop = popupForMenu(id), panel = $(id);
  if (!pop || !panel) return;
  opener = opener || openerForMenu(id);
  panel._opener = opener;
  pop.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  setMenuExpanded(id, true);
  document.body.classList.add("scn-popup-open");
  positionScnPopup(panel, opener);
  document.addEventListener("keydown", scnPopupKey, true);
  var first = panel.querySelector(".scn-drug-btn") || panel.querySelector(".scn-popup-list button:not([disabled])") || panel.querySelector("button");
  if (first) first.focus();
}

function pickCause(cid) {
  if (!SIM || SIM.done) return;
  if (typeof snapshotDue === "function") snapshotDue();
  closeScnMenu("scnCauseList");
  var set = causeSetFor(SIM), item = null;
  set.forEach(function (c) { if (c.id === cid) item = c; });
  if (!item) return;
  var correct = extrasFor(SIM).causes || [];
  var ok = correct.indexOf(cid) !== -1;
  var o;
  if (ok) {
    SIM.did.causes = 1;
    SIM.cause = true;
    SIM.found = SIM.found || {};
    SIM.found[cid] = 1;
    o = O("ok", "cause_ok", { event: item.label + " named as a reversible cause." });
    if (typeof SIM.scn.step === "function") {
      var stepO = SIM.scn.step("causes", SIM);
      if (stepO) {
        if (stepO.end) o.end = true;
        if (stepO.endReason) o.endReason = stepO.endReason;
        if (stepO.phys) o.phys = stepO.phys;
        if (stepO.vit) o.vit = stepO.vit;
        if (stepO.rhythm) o.rhythm = stepO.rhythm;
        if (stepO.pulse !== undefined) o.pulse = stepO.pulse;
        if (stepO.keys) {
          stepO.keys.forEach(function (k) { if (o.keys.indexOf(k) < 0) o.keys.push(k); });
        }
      }
    }
  } else {
    o = O("bad", "cause_bad", { event: item.label + " named as a reversible cause." });
  }
  o.label = "Identify reversible causes: " + item.label;
  finishPickedAction("causes", o, 30);
}

function askItemById(aid) {
  var item = null;
  ASK_ITEMS.forEach(function (c) { if (c.id === aid) item = c; });
  return item;
}
function buildAskText(aid) {
  var item = askItemById(aid);
  var x = extrasFor(SIM), custom = (x.ask || {})[aid];
  var m = SIM.mon, labs = (m && m.labs) || {};
  var text = custom;
  if (!text) {
    if (aid === "bm") text = "Capillary glucose " + labs.glu + " mmol/L.";
    else if (aid === "gas") text = "pH " + labs.ph + ", PaCO2 " + labs.pco2 + " kPa, PaO2 " + labs.po2 + " kPa, lactate " + labs.lactate + " mmol/L, K+ " + labs.k + " mmol/L, Na+ " + labs.na + " mmol/L, ionised Ca " + labs.ica + " mmol/L, Hb " + labs.hb + " g/L.";
    else if (aid === "temp") text = "Temperature " + labs.temp + " C.";
    else if (aid === "ecg12") text = "A 12-lead ECG is consistent with the monitor rhythm already seen. No additional acute change is reported in this simulation.";
    else if (aid === "examine") text = "Airway patent. Chest moving equally. Central and peripheral pulses " + (SIM.pulse ? "present" : "absent") + ". Pupils mid-size and reactive.";
    else if (aid === "history") text = "No additional background is available beyond the scene you were given.";
    else if (aid === "airway") text = "Airway patent. No obstruction is seen.";
  }
  return { item: item, text: text };
}
function askIsRelevant(aid, text) {
  var relevant = false;
  if (aid === "gas" || aid === "bm" || aid === "history" || aid === "examine" || aid === "ecg12") {
    (extrasFor(SIM).causes || []).forEach(function (c) {
      if ((c === "hyperkalaemia" && (/K\+ 7\.|K\+ 6/.test(text) || /peaked T|wide QRS/.test(text))) ||
          (c === "hypokalaemia" && /K\+ 3\.|K\+ 2/.test(text)) ||
          (c === "hypovolaemia" && /Hb 78|blood loss|drains/.test(text)) ||
          (c === "tension" && /deviated|resonant|central line/.test(text)) ||
          (c === "drugs" && /QT-prolonging|prolonged QTc/.test(text))) relevant = true;
    });
  }
  return relevant;
}

function doAsk(aid) {
  if (!SIM || SIM.done) return;
  var built = buildAskText(aid);
  if (!built.item) return;
  closeScnMenu("scnAskList");
  queuePendingResult({
    id: aid,
    kind: "ask",
    label: built.item.label,
    delay: built.item.delay || ASK_DELAY_MS[aid] || 3000,
    text: built.text,
    relevant: askIsRelevant(aid, built.text)
  });
}

function previewNIBP(st) {
  var m = st.mon;
  if (!st.pulse || (m && m.arrest)) {
    return { unrecordable: true, event: "NIBP cycled: unrecordable.", keys: ["n_nibpFail"], t: st.clock };
  }
  var sys = m.sysBase, dia = m.diaBase;
  if (sys == null) { sys = 118; dia = 72; }
  var amtS = (typeof prefersReduced === "function" && prefersReduced()) ? 2 : 5;
  var amtD = (typeof prefersReduced === "function" && prefersReduced()) ? 2 : 4;
  var tr = m.trend || 0;
  if (typeof MODEL_RUNNING !== "undefined" && MODEL_RUNNING) {
    sys = Math.round(sys + tr * 3);
    dia = Math.round(dia + tr * 2);
  } else {
    sys = Math.round(sys + (Math.random() * 2 - 1) * amtS + tr * 3);
    dia = Math.round(dia + (Math.random() * 2 - 1) * amtD + tr * 2);
  }
  return { unrecordable: false, sys: sys, dia: dia, t: st.clock, event: "NIBP " + sys + "/" + dia + " mmHg at " + mmss(st.clock) + ".", keys: ["n_nibp"] };
}

function requestNIBPCycle() {
  if (!SIM || SIM.done) return;
  var reading = previewNIBP(SIM);
  queuePendingResult({
    id: "nibp",
    kind: "nibp",
    label: "Cycle NIBP now",
    delay: ASK_DELAY_MS.nibp,
    text: reading.event,
    reading: reading
  });
}

/* Real-time pending results. Sim clock is not advanced. Tests may use fake timers. */
var askTimerMode = "real";
var askFakeNow = 0;
var askFakeSeq = 0;
var askFakeQueue = [];
var askRealTimeouts = [];
var ASK_PENDING = [];
var askTokenSeq = 0;

function askNow() { return askTimerMode === "fake" ? askFakeNow : Date.now(); }
function askSetTimeout(fn, ms) {
  if (askTimerMode === "fake") {
    var id = ++askFakeSeq;
    askFakeQueue.push({ id: id, at: askFakeNow + ms, fn: fn });
    return id;
  }
  var id = setTimeout(fn, ms);
  askRealTimeouts.push(id);
  return id;
}
function askClearTimeout(id) {
  if (askTimerMode === "fake") {
    askFakeQueue = askFakeQueue.filter(function (tm) { return tm.id !== id; });
    return;
  }
  clearTimeout(id);
  askRealTimeouts = askRealTimeouts.filter(function (tm) { return tm !== id; });
}
function useFakeAskTimers(on) {
  askRealTimeouts.forEach(function (id) { clearTimeout(id); });
  askRealTimeouts = [];
  askFakeQueue = [];
  ASK_PENDING.forEach(function (p) { if (p.timer != null) askClearTimeout(p.timer); });
  ASK_PENDING = [];
  askTimerMode = on ? "fake" : "real";
  askFakeNow = 0;
  renderPending();
}
function advanceAskTimers(ms) {
  if (askTimerMode !== "fake") return;
  askFakeNow += Number(ms) || 0;
  var due = askFakeQueue.filter(function (tm) { return tm.at <= askFakeNow; }).sort(function (a, b) { return a.at - b.at; });
  askFakeQueue = askFakeQueue.filter(function (tm) { return tm.at > askFakeNow; });
  due.forEach(function (tm) { tm.fn(); });
}
function clearAskPending() {
  ASK_PENDING.forEach(function (p) { if (p.timer != null) askClearTimeout(p.timer); });
  ASK_PENDING = [];
  renderPending();
  if (typeof decoratePendingActions === "function") decoratePendingActions();
}
function isAskPending(id) {
  return ASK_PENDING.some(function (p) { return p.id === id; });
}
function queuePendingResult(p) {
  if (!SIM || SIM.done) return;
  if (isAskPending(p.id)) return;
  if (SIM.pendingToken == null) SIM.pendingToken = ++askTokenSeq;
  p.token = SIM.pendingToken;
  p.requestedAt = SIM.clock;
  p.dueAt = askNow() + p.delay;
  p.shortLabel = ({ bm: "Capillary glucose", gas: "Blood gas", temp: "Temperature", ecg12: "12-lead ECG", examine: "Examination", history: "History", airway: "Airway check", nibp: "Cycle NIBP now" })[p.id] || p.label;
  if (p.kind === "ask") SIM.asked[p.id] = 1;
  ASK_PENDING.push(p);
  if (typeof logEvent === "function") {
    logEvent({ v: "info", keys: [], notAction: true, event: p.label + " requested." }, p.label + " requested.", p.kind === "nibp" ? "nibp" : "ask:" + p.id);
  }
  renderPending();
  if (typeof fillAskList === "function") fillAskList();
  if (typeof decoratePendingActions === "function") decoratePendingActions();
  if (p.kind === "nibp" && typeof renderMonitor === "function") renderMonitor();
  p.timer = askSetTimeout(function () { deliverPending(p); }, p.delay);
}
function deliverPending(p) {
  ASK_PENDING = ASK_PENDING.filter(function (x) { return x !== p; });
  var quiet = typeof MODEL_RUNNING !== "undefined" && MODEL_RUNNING;
  if (!SIM || SIM.done || SIM.pendingToken !== p.token) {
    renderPending();
    return;
  }
  if (p.kind === "nibp") {
    applyNIBPReading(SIM, p.reading);
    var no = O("info", (p.reading && p.reading.keys) || "n_nibp", { event: p.text, notAction: true });
    no.label = "Cycle NIBP now";
    if (typeof logEvent === "function") logEvent(no, p.text, "nibp");
    if (!quiet) {
      if (typeof renderFeedback === "function") renderFeedback(no, false);
      if (typeof renderMonitor === "function") renderMonitor();
      if ($("scnLive")) $("scnLive").textContent = p.text;
    }
  } else {
    var keys = "ask_" + p.id;
    if (!TXT[keys]) {
      TXT[keys] = Tfb(p.text, "Information requested", p.id === "ecg12" ? "ecg12Sim" : "refRanges", { event: p.text, outcome: p.text, flag: p.id === "ecg12" ? 1 : 0 });
    } else {
      TXT[keys].full = p.text; TXT[keys].event = p.text; TXT[keys].outcome = p.text;
    }
    if (p.relevant) {
      SIM.found = SIM.found || {};
      SIM.found.ask = 1;
    }
    var askEvent = p.text;
    if (p.relevant) {
      askEvent = p.text + " This result may help you identify a reversible cause. Name it using Identify reversible causes.";
    }
    var o = O("info", keys, { event: askEvent, notAction: true });
    o.label = p.label;
    o.askText = p.text;
    o.relevantAsk = !!p.relevant;
    if (typeof logEvent === "function") logEvent(o, p.label + ": " + askEvent, "ask:" + p.id);
    if (!quiet) {
      if (typeof renderFeedback === "function") renderFeedback(o, false);
      if ($("scnLive")) $("scnLive").textContent = p.label + " result: " + p.text;
    }
  }
  renderPending();
  if (typeof fillAskList === "function") fillAskList();
  if (typeof decoratePendingActions === "function") decoratePendingActions();
}
function applyNIBPReading(st, reading) {
  if (!st || !st.mon || !reading) return;
  var t = st.clock;
  if (reading.unrecordable) {
    st.mon.lastNIBP = { t: t, unrecordable: true, auto: !!reading.auto };
  } else {
    st.mon.lastNIBP = { t: t, sys: reading.sys, dia: reading.dia, unrecordable: false, auto: !!reading.auto };
    st.mon.sys = reading.sys;
    st.mon.dia = reading.dia;
  }
}
function renderPending() {
  var host = $("scnPending"), list = $("scnPendingList");
  if (!host) return;
  if (!ASK_PENDING.length) {
    host.hidden = true;
    if (list) list.innerHTML = "";
    return;
  }
  host.hidden = false;
  if (!list) return;
  list.innerHTML = ASK_PENDING.map(function (p) {
    return "<li><span class='scn-pending-spin' aria-hidden='true'></span><span>" + esc(p.shortLabel || p.label) + ": Pending\u2026</span></li>";
  }).join("");
}
function decoratePendingActions() {
  if (!SIM) return;
  var nibpBtn = document.querySelector("[data-a='nibp']");
  if (!nibpBtn) return;
  var pending = typeof isAskPending === "function" && isAskPending("nibp") && !SIM.done;
  var base = (ACT.nibp && ACT.nibp.label) || "Cycle NIBP now";
  nibpBtn.disabled = !!(pending || SIM.done);
  nibpBtn.textContent = pending ? base + " (pending)" : base;
}
function listAskPending() {
  return ASK_PENDING.map(function (p) {
    return { id: p.id, kind: p.kind, label: p.label, delay: p.delay, remaining: Math.max(0, p.dueAt - askNow()) };
  });
}

/* Shared closer used once doAction / applyReview exist (defined in part-scn.js). */
function finishPickedAction(a, o, timeCost) {
  if (typeof doActionFinish === "function") doActionFinish(a, o, timeCost);
}

function fillCauseList() {
  var host = $("scnCauseButtons"); if (!host || !SIM) return;
  var correct = extrasFor(SIM).causes || [];
  host.innerHTML = causeSetFor(SIM).map(function (c) {
    return "<li><button type='button' class='act-btn scn-sub-btn' data-cause='" + c.id + "'" + (SIM.done ? " disabled" : "") + ">" + esc(c.label) + "</button></li>";
  }).join("");
  host.querySelectorAll("[data-cause]").forEach(function (b) {
    b.addEventListener("click", function () { pickCause(b.getAttribute("data-cause")); });
  });
}
function fillAskList() {
  var host = $("scnAskButtons"); if (!host || !SIM) return;
  host.innerHTML = ASK_ITEMS.map(function (c) {
    var pending = typeof isAskPending === "function" && isAskPending(c.id);
    var got = SIM.asked && SIM.asked[c.id] && !pending;
    var secs = Math.round((c.delay || ASK_DELAY_MS[c.id] || 0) / 1000);
    var extra = pending ? " (pending)" : (got ? " (already requested)" : (secs ? " (about " + secs + " s)" : ""));
    return "<li><button type='button' class='act-btn scn-sub-btn' data-ask='" + c.id + "'" + (SIM.done || pending ? " disabled" : "") + ">" + esc(c.label) + extra + "</button></li>";
  }).join("");
  host.querySelectorAll("[data-ask]").forEach(function (b) {
    b.addEventListener("click", function () { doAsk(b.getAttribute("data-ask")); });
  });
}

var scnModalPrev = null;
function getFocusable(root) {
  return [].slice.call(root.querySelectorAll("a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex='-1'])")).filter(function (el) { return !el.disabled && el.offsetParent !== null || el === document.activeElement || el.getAttribute("type") !== "hidden"; });
}
function openSourcesModal() {
  var m = $("scnSourcesModal"); if (!m) return;
  scnModalPrev = document.activeElement;
  m.hidden = false;
  m.setAttribute("aria-hidden", "false");
  var close = $("scnSourcesClose");
  if (close) close.focus();
  document.addEventListener("keydown", sourcesModalKey);
}
function closeSourcesModal() {
  var m = $("scnSourcesModal"); if (!m) return;
  m.hidden = true;
  m.setAttribute("aria-hidden", "true");
  document.removeEventListener("keydown", sourcesModalKey);
  if (scnModalPrev && scnModalPrev.focus) scnModalPrev.focus();
}
function sourcesModalKey(e) {
  var m = $("scnSourcesModal"); if (!m || m.hidden) return;
  if (e.key === "Escape") { e.preventDefault(); closeSourcesModal(); return; }
  if (e.key !== "Tab") return;
  var list = getFocusable(m);
  if (!list.length) return;
  var first = list[0], last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function missedStepLine(d) {
  if (!d) return "";
  var name = d.name || d[1] || d.id;
  return "Missed: " + name;
}
/* ===== Scenarios: actions, scripted branches, monitor and debrief ===== */
var ACTIONS = [
  { id: "assess", label: "Check rhythm and pulse", g: "Assess and call" },
  { id: "expert", label: "Seek expert help", g: "Assess and call" },
  { id: "causes", label: "Identify reversible causes", g: "Assess and call" },
  { id: "ask", label: "Ask for / check", g: "Assess and call" },
  { id: "nibp", label: "Cycle NIBP now", g: "Assess and call" },
  { id: "observe", label: "Observe and reassess later", g: "Assess and call" },
  { id: "cpr", label: "Start CPR 30:2", g: "CPR and electrical" },
  { id: "ff", label: "CPR for 2 minutes", g: "CPR and electrical" },
  { id: "charge", label: "Charge defibrillator (continue CPR if in progress)", g: "CPR and electrical" },
  { id: "clear", label: "Stop compressions, all clear", g: "CPR and electrical" },
  { id: "shock", label: "Shock (unsynchronised)", g: "CPR and electrical" },
  { id: "sync", label: "Synchronised DC cardioversion", g: "CPR and electrical" },
  { id: "pace", label: "Transcutaneous pacing", g: "CPR and electrical" },
  { id: "vagal", label: "Vagal manoeuvres", g: "CPR and electrical" },
  { id: "decompress", label: "Chest decompression (needle or thoracostomy)", g: "CPR and electrical" },
  { id: "padsAP", label: "Change pads to the antero-posterior position", g: "CPR and electrical" },
  { id: "oxygen", label: "100% oxygen and check the airway", g: "CPR and electrical" },
  { id: "pericardiocentesis", label: "Pericardiocentesis", g: "CPR and electrical" },
  { id: "resternotomy", label: "Return to theatre / emergency re-sternotomy", g: "CPR and electrical" },
  { id: "drugs", label: "Drugs and fluids", g: "Drugs and fluids" }
];
var ACT_EXTRA = [
  { id: "adr", label: "Adrenaline 1 mg IV" },
  { id: "amio300", label: "Amiodarone 300 mg IV" },
  { id: "amio150", label: "Amiodarone 150 mg IV" },
  { id: "atro", label: "Atropine 500 micrograms IV" },
  { id: "aden", label: "Adenosine" },
  { id: "mg", label: "Magnesium 8 mmol (2 g) IV over 10 min" },
  { id: "fluid", label: "IV fluid bolus" },
  { id: "bicarb", label: "Sodium bicarbonate 50 mmol IV" },
  { id: "calcium", label: "Calcium chloride IV" },
  { id: "amioInf", label: "Amiodarone 300 mg IV over 10 to 60 min" },
  { id: "amio1020", label: "Amiodarone 300 mg IV over 10 to 20 min" },
  { id: "adrInf", label: "Adrenaline infusion 2 to 10 micrograms per minute" },
  { id: "iso", label: "Isoprenaline infusion 5 micrograms per minute" },
  { id: "procain", label: "Procainamide 10 to 15 mg/kg IV over 20 min" },
  { id: "verap", label: "Verapamil 5 to 10 mg IV over 2 min" },
  { id: "kcl", label: "Potassium chloride arrest bolus" },
  { id: "lido100", label: "Lidocaine 100 mg IV" },
  { id: "lido50", label: "Lidocaine 50 mg IV" },
  { id: "fibrin", label: "Fibrinolytic or thrombolytic drug" }
];
var ACT = {}; ACTIONS.concat(ACT_EXTRA).forEach(function (a) { ACT[a.id] = a; });
var ACT_TIME = { assess: 10, expert: 5, causes: 30, ask: 0, drugs: 0, nibp: 0, observe: 60, cpr: 5, skip: 0, charge: 5, clear: 5, shock: 15, sync: 30, pace: 60, vagal: 30, adr: 20, amio300: 20, amio150: 20, atro: 20, aden: 30, mg: 30, fluid: 30, bicarb: 20, calcium: 20, decompress: 30, amioInf: 30, amio1020: 30, adrInf: 30, iso: 30, procain: 30, verap: 20, kcl: 20, lido100: 20, lido50: 20, fibrin: 30, padsAP: 20, oxygen: 20, pericardiocentesis: 30, resternotomy: 30 };
function adenLabel(n) { return n === 0 ? "Adenosine 6 mg rapid IV" : n === 1 ? "Adenosine 12 mg rapid IV" : "Adenosine 18 mg (RCUK) or 12 mg (BNF) rapid IV"; }

/* ===== Drugs and fluids panel (catalogue, chooser, dose resolution) ===== */
var DRUG_GROUPS = [
  { id: "arrest", name: "Arrest drugs", fam: "arrest", famLabel: "Arrest drugs", shape: "circle", shapeName: "filled circle" },
  { id: "anti", name: "Antiarrhythmics", fam: "anti", famLabel: "Antiarrhythmics", shape: "diamond", shapeName: "diamond" },
  { id: "brady", name: "Bradycardia drugs", fam: "brady", famLabel: "Bradycardia drugs", shape: "triangle", shapeName: "upward triangle" },
  { id: "electro", name: "Electrolytes", fam: "electro", famLabel: "Electrolytes", shape: "square", shapeName: "filled square" },
  { id: "fluid", name: "Fluids", fam: "fluid", famLabel: "Fluids", shape: "circle-open", shapeName: "open circle" },
  { id: "other", name: "Other", fam: "other", famLabel: "Other", shape: "square-open", shapeName: "open square" }
];
var DRUG_ITEMS = [
  { id: "adr", group: "arrest", name: "Adrenaline", fixed: true, options: [
    { id: "adr", label: "1 mg IV bolus", event: "Adrenaline 1 mg IV given." }
  ] },
  { id: "amioBolus", group: "arrest", name: "Amiodarone (bolus)", fixed: false, options: [
    { id: "amio300", label: "300 mg IV bolus", event: "Amiodarone 300 mg IV given." },
    { id: "amio150", label: "150 mg IV bolus", event: "Amiodarone 150 mg IV given." }
  ] },
  { id: "lido", group: "arrest", name: "Lidocaine", fixed: false, options: [
    { id: "lido100", label: "100 mg IV bolus", event: "Lidocaine 100 mg IV given." },
    { id: "lido50", label: "50 mg IV bolus", event: "Lidocaine 50 mg IV given." }
  ] },
  { id: "aden", group: "anti", name: "Adenosine", fixed: false, options: [
    { id: "aden:6", label: "6 mg rapid IV bolus", event: "Adenosine 6 mg rapid IV given." },
    { id: "aden:12", label: "12 mg rapid IV bolus", event: "Adenosine 12 mg rapid IV given." },
    { id: "aden:18", label: "18 mg rapid IV bolus", event: "Adenosine 18 mg rapid IV given." }
  ] },
  { id: "amioSlow", group: "anti", name: "Amiodarone (slow IV load)", fixed: false, options: [
    { id: "amio1020", label: "300 mg IV over 10 to 20 min", event: "Amiodarone 300 mg IV over 10 to 20 min started." },
    { id: "amioInf", label: "300 mg IV over 10 to 60 min", event: "Amiodarone 300 mg IV over 10 to 60 min started." }
  ] },
  { id: "procain", group: "anti", name: "Procainamide", fixed: true,
    note: "Not stocked in many UK hospitals; follow local protocol.",
    options: [
      { id: "procain", label: "10 to 15 mg/kg IV over 20 min (maximum 1 g)", event: "Procainamide 10 to 15 mg/kg IV over 20 min started." }
    ] },
  { id: "verap", group: "anti", name: "Verapamil", fixed: true, options: [
    { id: "verap", label: "5 to 10 mg IV over 2 min", event: "Verapamil 5 to 10 mg IV over 2 min given." }
  ] },
  { id: "mg", group: "anti", name: "Magnesium", alsoGroup: "electro", fixed: true, options: [
    { id: "mg", label: "8 mmol (2 g) IV over 10 min", event: "Magnesium 8 mmol (2 g) IV given." }
  ] },
  { id: "atro", group: "brady", name: "Atropine", fixed: true, options: [
    { id: "atro", label: "500 micrograms IV", event: "Atropine 500 micrograms IV given." }
  ] },
  { id: "adrInf", group: "brady", name: "Adrenaline infusion", fixed: true, options: [
    { id: "adrInf", label: "2 to 10 micrograms per minute IV infusion", event: "Adrenaline infusion 2 to 10 micrograms per minute started." }
  ] },
  { id: "iso", group: "brady", name: "Isoprenaline infusion", fixed: true,
    note: "This is the Resuscitation Council UK and BNF starting rate of 5 micrograms per minute. Local protocols often start lower and titrate under expert supervision.",
    options: [
      { id: "iso", label: "5 micrograms per minute IV infusion", event: "Isoprenaline infusion 5 micrograms per minute started." }
    ] },
  { id: "kcl", group: "electro", name: "Potassium chloride", fixed: true,
    note: "This option is the Resuscitation Council UK hypokalaemic cardiac arrest bolus only.",
    options: [
      { id: "kcl", label: "20 mmol IV over 2 to 3 min, then 10 mmol over 2 min (cardiac arrest only)", event: "Potassium chloride 20 mmol IV over 2 to 3 min, then 10 mmol over 2 min, given." }
    ] },
  { id: "calcium", group: "electro", name: "Calcium chloride", fixed: false, options: [
    { id: "calcium:arrest", label: "10 mL of 10% IV bolus (cardiac arrest)", event: "Calcium chloride 10 mL of 10% IV bolus given." },
    { id: "calcium:slow", label: "10 mL of 10% IV over 5 min (hyperkalaemia with ECG changes, pulse present)", event: "Calcium chloride 10 mL of 10% IV over 5 min given." }
  ] },
  { id: "bicarb", group: "electro", name: "Sodium bicarbonate", fixed: true, options: [
    { id: "bicarb", label: "50 mmol IV", event: "Sodium bicarbonate 50 mmol IV given." }
  ] },
  { id: "fluid", group: "fluid", name: "Crystalloid bolus", fixed: false, options: [
    { id: "fluid:saline", label: "0.9% sodium chloride bolus", event: "0.9% sodium chloride bolus given." },
    { id: "fluid:balanced", label: "Balanced crystalloid bolus", event: "Balanced crystalloid bolus given." }
  ] },
  { id: "fibrin", group: "other", name: "Fibrinolytic or thrombolytic drug", fixed: true,
    note: "No named agent or dose is given here. Follow local protocol.",
    options: [
      { id: "fibrin", label: "Fibrinolytic or thrombolytic drug (follow local protocol)", event: "Fibrinolytic or thrombolytic drug given, following local protocol." }
    ] }
];
var DRUG_OPT_INDEX = {};
DRUG_ITEMS.forEach(function (item) {
  item.options.forEach(function (opt) { DRUG_OPT_INDEX[opt.id] = { item: item, opt: opt }; });
});
var ACT_ALIAS = {
  "adr:1mg": "adr",
  "atro:500": "atro",
  "mg:8": "mg",
  "bicarb:50": "bicarb",
  "iso:5": "iso",
  "amio:300bolus": "amio300",
  "amio:150bolus": "amio150",
  "amio:1060": "amioInf",
  "amio:1020": "amio1020",
  "lido:100": "lido100",
  "lido:50": "lido50",
  "kcl:arrest": "kcl",
  "calcium:arrest": "calcium",
  "calcium:slow": "calcium",
  "fluid:saline": "fluid",
  "fluid:balanced": "fluid"
};
function baseAct(a) {
  if (!a) return a;
  if (ACT_ALIAS[a]) return ACT_ALIAS[a];
  var i = String(a).indexOf(":");
  if (i > 0) {
    var head = a.slice(0, i);
    if (head === "aden") return "aden";
    if (ACT_ALIAS[a]) return ACT_ALIAS[a];
    return head;
  }
  return a;
}
function adenDoseOf(a, st) {
  var m = /^aden:(\d+)$/.exec(a || "");
  if (m) return parseInt(m[1], 10);
  if (st && st._act && st._act.dose != null) return st._act.dose;
  return null;
}
function resolveDrugAction(raw) {
  var out = { raw: raw, id: raw, dose: null, opt: null, event: null, label: null };
  if (!raw) return out;
  var found = DRUG_OPT_INDEX[raw];
  if (found) {
    out.opt = raw;
    out.id = baseAct(raw);
    out.event = found.opt.event;
    out.label = found.item.name + ": " + found.opt.label;
    if (out.id === "aden") out.dose = adenDoseOf(raw);
    return out;
  }
  if (ACT_ALIAS[raw]) {
    out.id = ACT_ALIAS[raw];
    out.opt = raw;
    var aliasFound = DRUG_OPT_INDEX[out.id] || DRUG_OPT_INDEX[raw];
    if (aliasFound) {
      out.event = aliasFound.opt.event;
      out.label = aliasFound.item.name + ": " + aliasFound.opt.label;
    }
    return out;
  }
  var m = /^aden:(\d+)$/.exec(raw);
  if (m) {
    out.id = "aden";
    out.dose = parseInt(m[1], 10);
    out.opt = raw;
    var adenOpt = DRUG_OPT_INDEX[raw];
    out.event = adenOpt ? adenOpt.opt.event : ("Adenosine " + out.dose + " mg rapid IV given.");
    out.label = "Adenosine " + out.dose + " mg rapid IV";
    return out;
  }
  out.id = raw;
  if (ACT[raw]) out.label = ACT[raw].label;
  if (raw === "aden") {
    out.id = "aden";
  }
  if (raw === "calcium") { out.id = "calcium"; out.opt = "calcium:arrest"; }
  if (raw === "fluid") { out.id = "fluid"; out.opt = "fluid:saline"; }
  return out;
}
function drugEventFor(resolved, fallbackLabel) {
  if (resolved && resolved.event) return resolved.event;
  if (resolved && resolved.id === "aden" && resolved.dose) return "Adenosine " + resolved.dose + " mg rapid IV given.";
  return defaultEvent(resolved ? resolved.id : "", fallbackLabel);
}

var _drugOpenItem = null;
var _drugTypeBuf = "";
var _drugTypeT = 0;
function drugGroupById(id) {
  var g = null;
  DRUG_GROUPS.forEach(function (x) { if (x.id === id) g = x; });
  return g;
}
function drugShapeHtml(group) {
  var cls = "scn-drug-shape drug-fam-" + group.fam + " drug-shape-" + group.shape;
  return "<span class='" + cls + "' aria-hidden='true'></span>";
}
function recentDrugEntries(st) {
  var acts = (st && st.log) ? st.log.filter(function (l) { return l.o && l.act && !l.o.isNudge && !l.o.isReg && !l.o.notAction; }) : [];
  var out = [];
  for (var i = acts.length - 1; i >= 0 && out.length < 3; i--) {
    var id = baseAct(acts[i].act);
    var found = DRUG_OPT_INDEX[acts[i].act] || DRUG_OPT_INDEX[id];
    if (!found && id !== "aden" && !ACT_ALIAS[acts[i].act] && ["adr","amio300","amio150","amioInf","amio1020","atro","aden","mg","fluid","bicarb","calcium","adrInf","iso","procain","verap","kcl","lido100","lido50","fibrin"].indexOf(id) < 0) continue;
    var text = (acts[i].o && acts[i].o.event) || (acts[i].o && acts[i].o.label) || acts[i].text || acts[i].act;
    out.unshift({ t: acts[i].t, text: text });
  }
  return out;
}
function fillDrugRecent() {
  var box = $("scnDrugRecent");
  if (!box) return;
  var rows = recentDrugEntries(SIM);
  if (!rows.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = "<strong>Recently given</strong><ol>" + rows.map(function (r) {
    return "<li><span class='log-t'>" + mmss(r.t) + "</span> " + esc(r.text.replace(/\.$/, "")) + "</li>";
  }).join("") + "</ol>";
}
function closeDrugChooser() {
  _drugOpenItem = null;
  var host = $("scnDrugBrowse");
  if (!host) return;
  host.querySelectorAll(".scn-drug-chooser").forEach(function (el) { el.remove(); });
  host.querySelectorAll(".scn-drug-btn").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
}
function selectedDrugOpt() {
  var host = $("scnDrugBrowse");
  if (!host) return null;
  var picked = host.querySelector("input[name='scnDrugDose']:checked");
  return picked ? picked.value : null;
}
function updateDrugGiveState() {
  var btn = $("scnDrugGive");
  if (!btn || !_drugOpenItem) return;
  if (_drugOpenItem.fixed) { btn.disabled = false; return; }
  btn.disabled = !selectedDrugOpt();
}
function openDrugChooser(itemId, openerBtn) {
  var item = null;
  DRUG_ITEMS.forEach(function (x) { if (x.id === itemId) item = x; });
  if (!item) return;
  closeDrugChooser();
  _drugOpenItem = item;
  if (openerBtn) openerBtn.setAttribute("aria-expanded", "true");
  var chooser = document.createElement("div");
  chooser.className = "scn-drug-chooser";
  chooser.id = "scnDrugChooser";
  var group = drugGroupById(item.group);
  var radios = item.options.map(function (opt, i) {
    var checked = item.fixed && i === 0 ? " checked" : "";
    return "<label class='scn-drug-opt'><input type='radio' name='scnDrugDose' value='" + esc(opt.id) + "'" + checked + ">" + esc(opt.label) + "</label>";
  }).join("");
  var note = item.note ? "<p class='scn-drug-note'>" + esc(item.note) + "</p>" : "";
  chooser.innerHTML = note +
    "<fieldset role='radiogroup' aria-label='Dose for " + esc(item.name) + "'>" +
    "<legend>Dose and route</legend>" + radios + "</fieldset>" +
    "<div class='scn-drug-footer'>" +
    "<button type='button' class='scn-drug-give' id='scnDrugGive'>Give</button>" +
    "<button type='button' class='scn-drug-back' id='scnDrugBack'>Back</button>" +
    "</div>";
  var li = openerBtn && openerBtn.closest("li");
  if (li) li.appendChild(chooser);
  else $("scnDrugBrowse").appendChild(chooser);
  chooser.querySelectorAll("input[name='scnDrugDose']").forEach(function (inp) {
    inp.addEventListener("change", updateDrugGiveState);
  });
  $("scnDrugGive").addEventListener("click", giveSelectedDrug);
  $("scnDrugBack").addEventListener("click", function () {
    closeDrugChooser();
    if (openerBtn) openerBtn.focus();
  });
  updateDrugGiveState();
  var first = chooser.querySelector("input[name='scnDrugDose']");
  if (first) first.focus();
}
function giveSelectedDrug() {
  if (!_drugOpenItem) return;
  var id = _drugOpenItem.fixed ? _drugOpenItem.options[0].id : selectedDrugOpt();
  if (!id) return;
  closeScnMenu("scnDrugList");
  doAction(id);
}
function fillDrugPanel() {
  var host = $("scnDrugBrowse");
  if (!host) return;
  _drugOpenItem = null;
  fillDrugRecent();
  host.innerHTML = DRUG_GROUPS.map(function (g) {
    var items = DRUG_ITEMS.filter(function (it) { return it.group === g.id; });
    if (!items.length) return "";
    return "<section class='scn-drug-group' data-group='" + g.id + "'>" +
      "<h3 class='scn-drug-group-title'>" + drugShapeHtml(g) + "<span>" + esc(g.name) + "</span></h3>" +
      "<ul class='scn-drug-list'>" + items.map(function (it) {
        var descId = "scn-drug-desc-" + it.id;
        var aria = " aria-expanded='false' aria-controls='scnDrugChooser' aria-describedby='" + descId + "'";
        return "<li><button type='button' class='scn-drug-btn' data-drug='" + esc(it.id) + "'" + aria + ">" +
          drugShapeHtml(g) +
          "<span class='scn-drug-btn-text'><span class='scn-drug-btn-name'>" + esc(it.name) + "</span></span></button>" +
          "<span class='visually-hidden' id='" + descId + "'>" + esc(g.famLabel) + ", " + esc(g.shapeName) + "</span></li>";
      }).join("") + "</ul></section>";
  }).join("");
  host.querySelectorAll(".scn-drug-btn").forEach(function (b) {
    b.addEventListener("click", function () { openDrugChooser(b.getAttribute("data-drug"), b); });
  });
}
function drugTypeahead(e) {
  if (!isScnMenuOpen("scnDrugList")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Escape" || e.key === "Tab" || e.key === "Enter" || e.key === " ") return;
  if (e.target && (e.target.tagName === "INPUT" && e.target.type !== "radio")) return;
  var ch = e.key.length === 1 ? e.key : "";
  if (!ch || !/[A-Za-z]/.test(ch)) return;
  var now = Date.now();
  if (now - _drugTypeT > 800) _drugTypeBuf = "";
  _drugTypeT = now;
  _drugTypeBuf += ch.toLowerCase();
  var buttons = Array.prototype.slice.call(document.querySelectorAll("#scnDrugBrowse .scn-drug-btn"));
  var hit = null;
  buttons.forEach(function (b) {
    if (hit) return;
    var name = (b.textContent || "").toLowerCase();
    if (name.indexOf(_drugTypeBuf) >= 0) hit = b;
  });
  if (hit) {
    e.preventDefault();
    hit.focus();
  }
}

function expectedAdenDose(st) {
  var n = (st.adenSeq || st.aden || 0);
  return n === 0 ? 6 : n === 1 ? 12 : n === 2 ? 18 : null;
}
function takeAden(st, dose, plan) {
  plan = plan || {};
  st.adenDoses = st.adenDoses || [];
  var expected = expectedAdenDose(st);
  var given = dose;
  if (given == null) given = expected;
  if (st.adenSeq >= 3 || (st.aden && st.aden >= 3 && st.aden <= 5 && st.adenSeq == null && expected == null)) {
    return O("bad", "aden_after18");
  }
  if ((st.adenSeq || 0) >= 3) return O("bad", "aden_after18");
  var inSeq = given === expected;
  var skipAhead = expected != null && given > expected;
  var lowerOrRepeat = expected != null && given < expected;
  if (lowerOrRepeat || !given) {
    var earlyLo = plan.needVagal && !st.vagal;
    return O("part", earlyLo ? [plan.earlyKey, "aden_wrongDose"] : "aden_wrongDose");
  }
  var stepIdx = st.adenSeq || st.aden || 0;
  st.adenSeq = stepIdx + 1;
  st.aden = st.adenSeq;
  st.adenLast = given;
  st.adenDoses.push(given);
  st.did.aden = 1;
  var step = (plan.doses && plan.doses[expected]) || {};
  var v = "ok";
  var keys = step.key;
  if (plan.needVagal && !st.vagal) {
    v = "part";
    keys = [plan.earlyKey, step.key];
  }
  if (skipAhead) {
    v = "part";
    keys = Array.isArray(keys) ? keys.concat("aden_wrongDose") : [keys, "aden_wrongDose"];
  }
  var opts = {};
  if (step.phys) opts.phys = step.phys;
  if (step.end) {
    opts.end = true;
    if (step.rhythm) opts.rhythm = step.rhythm;
    if (step.vit) opts.vit = step.vit;
  }
  return O(v, keys, opts);
}
function takeLido(st, which) {
  if (which === "lido100") {
    if (st.did.lido100 || st.amio) return O("bad", "lido_already");
    if ((st.shocks || 0) < 3) return O("bad", "lido_early");
    st.did.lido100 = 1;
    st.amio = true;
    st.did.amio300 = 1;
    return O("ok", "lido_100");
  }
  if (which === "lido50") {
    if (st.did.lido50) return O("bad", "lido_already");
    if (!st.did.lido100) return O("part", "lido_50early");
    if ((st.shocks || 0) < 5) return O("part", "lido_50early");
    st.did.lido50 = 1;
    st.amio150 = true;
    st.did.amio150 = 1;
    return O("ok", "lido_50");
  }
  return O("bad", "lido_already");
}


function O(v, keys, x) { x = x || {}; x.v = v; x.keys = [].concat(keys); return x; }

/* ===== Scenario timing: RCUK windows with about 30 seconds of grace ===== */
var TIME_GRACE = 30;
/* Optional ALS-course-judgement mark. If transcutaneous pacing starts only after
   4 or more accepted atropine doses in a case with life-threatening features and
   high-degree atrioventricular block, mark pacing Partly right. Default on.
   This does not change h8 atropine marking (broad-complex complete heart block
   without current life-threatening features remains Partly right for atropine). */
var MARK_PACING_PARTLY_RIGHT_AFTER_FOUR_FAILED_ATROPINE = true;
var LATE_PACING_ATROPINE_DOSE_THRESHOLD = 4;
var ADR_FLOOR = 180;
var ADR_CEIL = 300;
var ADR_LATE_END = ADR_CEIL + 120 + TIME_GRACE;

var RCUK_URLS = {
  alsGuideline: "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-advanced-life-support-guidelines",
  alsPoster: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf",
  bradyPoster: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20bradyarrhythmia%202025.pdf",
  tachyPoster: "https://www.resus.org.uk/sites/default/files/2026-03/Adult%20tachyarrhythmia%20algorithm%20V3%20March%202026.pdf",
  alsCourse: "https://www.resus.org.uk/training-courses/adult-life-support/als-2-day-course-advanced-life-support",
  anaphylaxis: "https://www.resus.org.uk/library/additional-guidance/guidance-anaphylaxis",
  anaphylaxisPoster2021: "https://www.resus.org.uk/sites/default/files/2021-04/Anaphylaxis%20algorithm%202021.pdf"
};
function extLink(href, text) {
  return "<a href='" + href + "' target='_blank' rel='noopener noreferrer'>" + text + " (opens in a new tab)</a>";
}
function posterLineFor(s) {
  var kind = extrasFor({ scn: s }).kind || "arrest";
  var link;
  if (kind === "brady") link = extLink(RCUK_URLS.bradyPoster, "RCUK 2025 Adult bradyarrhythmia algorithm (PDF)");
  else if (kind === "tachy") link = extLink(RCUK_URLS.tachyPoster, "RCUK Adult tachyarrhythmia algorithm V3 March 2026 (PDF)");
  else link = extLink(RCUK_URLS.alsPoster, "RCUK 2025 Adult ALS algorithm (PDF)");
  return "<p class='scn-poster-line'>Read the official algorithm poster used to mark this case: " + link + ".</p>";
}
function repeatIntervalWindow(elapsed) {
  if (elapsed < ADR_FLOOR - TIME_GRACE) return "soon";
  if (elapsed <= ADR_CEIL + TIME_GRACE) return "ok";
  if (elapsed <= ADR_LATE_END) return "late";
  return "missed";
}
function cycleDrugWindow(checks, st) {
  var n = checks || 0;
  var since = (st && st.lastCheckAt != null) ? st.clock - st.lastCheckAt : 1e9;
  if (n <= 0) return "ok";
  if (n === 1) return since <= TIME_GRACE ? "ok" : "late";
  if (n === 2) return since <= TIME_GRACE ? "late" : "missed";
  return "missed";
}
function isShockableRhythm(st) {
  if (!st || st.pulse) return false;
  var g = (st.rhythm && st.rhythm.gen) || "";
  return g === "vf" || g === "vt" || g === "torsades";
}
function missedFirstShockNow(st) {
  if (!st || st.done || st.pulse) return false;
  if ((st.shocks || 0) > 0 || (st.nShocks || 0) > 0 || (st.did && st.did.shock)) return false;
  if (st.phase === "organised") return false;
  return isShockableRhythm(st);
}
function noteCycleCheck(st, o) {
  if (!st || !isCycleCheck(o)) return;
  st.lastCheckAt = st.clock;
  st.rhythmChecks = (st.rhythmChecks || 0) + 1;
  if ((st.shocks || 0) >= 3) st.checksAfter3 = (st.checksAfter3 || 0) + 1;
}
function lastAdrElapsed(st) {
  if (!st || !st.adrT || !st.adrT.length) return null;
  return st.clock - st.adrT[st.adrT.length - 1];
}
function adrRepeatStatus(st) {
  var e = lastAdrElapsed(st);
  if (e == null) return null;
  return repeatIntervalWindow(e);
}
function lateKeys(keys, lateKey) {
  var k = [].concat(keys);
  if (lateKey && k.indexOf(lateKey) < 0) k.push(lateKey);
  return k;
}
function verdictFromWindow(win, keys, lateKey, extra) {
  extra = extra || {};
  if (win === "late" || win === "missed") {
    extra.lateNote = extra.lateNote || "This action still scores full marks. It was later than the recommended window, with about 30 seconds of grace.";
    return O("late", lateKeys(keys, lateKey), extra);
  }
  return O("ok", keys, extra);
}
function takeAdr(st, firstKey, repeatKey, extra) {
  extra = extra || {};
  var o = Object.assign({}, extra.o || {});
  if (extra.phys) o.phys = extra.phys;
  if (st.adrT.length) {
    var rep = repeatIntervalWindow(st.clock - st.adrT[st.adrT.length - 1]);
    if (rep === "soon") {
      var soonO = O("bad", extra.soonKey || "a_adrSoon");
      if (st.adrSoonRunScored) {
        soonO.notScoredAgain = true;
        soonO.logVerdict = "Too soon (not scored again)";
      } else {
        st.adrSoonRunScored = true;
        soonO.logVerdict = "Too soon: repeat every 3 to 5 min";
      }
      return soonO;
    }
    st.adrSoonRunScored = false;
    st.adrT.push(st.clock);
    if ((st.shocks || 0) >= 3) st.adrAfter3 = true;
    st.did.adr = 1;
    if (rep === "late" || rep === "missed") {
      o.lateNote = "This repeat adrenaline dose still scores full marks. It was later than the 3 to 5 minute window (with about 30 seconds of grace).";
    }
    return verdictFromWindow(rep, repeatKey || "a_adrRepeat", "a_adrLate", o);
  }
  var kind = extra.kind || ((st.shocks || 0) >= 3 ? "post3" : "nonshock");
  var win = kind === "post3" ? cycleDrugWindow(st.checksAfter3 || 0, st) : cycleDrugWindow(st.rhythmChecks || 0, st);
  st.adrT.push(st.clock);
  if ((st.shocks || 0) >= 3) st.adrAfter3 = true;
  st.did.adr = 1;
  if (win === "late" || win === "missed") {
    o.lateNote = kind === "post3"
      ? "This dose still scores full marks. After the third shock, adrenaline is due in that cycle. A dose in the next cycle is late, and it is missed once that next cycle is completed."
      : "This first adrenaline dose still scores full marks. In a non-shockable arrest it is due in the first cycle. A dose in the next cycle is late, and it is missed once that next cycle is completed.";
  }
  return verdictFromWindow(win, firstKey, "a_adrLate", o);
}
function takeAmio300(st, okKey, extra) {
  extra = extra || {};
  if (st.amio) return O("bad", extra.twiceKey || "s1_amioTwice");
  if ((st.shocks || 0) < 3) return O("bad", extra.earlyKey || "s1_amioEarly");
  var win = cycleDrugWindow(st.checksAfter3 || 0, st);
  st.amio = true;
  st.did.amio300 = 1;
  var o = Object.assign({}, extra.o || {});
  if (extra.phys) o.phys = extra.phys;
  if (win === "late" || win === "missed") {
    o.lateNote = "This amiodarone dose still scores full marks. After the third shock it is due in that cycle. A dose in the next cycle is late, and it is missed once that next cycle is completed.";
  }
  return verdictFromWindow(win, okKey || "s1_amio", "a_amioLate", o);
}
function takeAtro(st, firstKey, repeatKey, extra) {
  extra = extra || {};
  var o = Object.assign({}, extra.o || {});
  if (extra.phys) o.phys = extra.phys;
  if (extra.rhythm && (st.atro || 0) === 0) o.rhythm = extra.rhythm;
  var forced = extra.verdict;
  if ((st.atro || 0) >= 6) return O("bad", extra.maxKey || "s3_atroMax");
  if (st.lastAtroT != null) {
    var rep = repeatIntervalWindow(st.clock - st.lastAtroT);
    if (rep === "soon") {
      var soonO = O("bad", "s3_atroSoon");
      if (st.atroSoonRunScored) {
        soonO.notScoredAgain = true;
        soonO.logVerdict = "Too soon (not scored again)";
      } else {
        st.atroSoonRunScored = true;
        soonO.logVerdict = "Too soon: repeat every 3 to 5 min";
      }
      return soonO;
    }
    st.atroSoonRunScored = false;
    st.atro = (st.atro || 0) + 1;
    st.lastAtroT = st.clock;
    st.atroT = st.atroT || [];
    st.atroT.push(st.clock);
    st.did.atro = 1;
    if (forced) return O(forced, repeatKey, o);
    if (rep === "late" || rep === "missed") {
      o.lateNote = "This atropine dose still scores full marks. Repeat doses are usually 3 to 5 minutes apart, to a total of 3 mg. The case does not end while that titration is still under way.";
    }
    return verdictFromWindow(rep, repeatKey, "s3_atroLate", o);
  }
  st.atro = (st.atro || 0) + 1;
  st.lastAtroT = st.clock;
  st.atroT = st.atroT || [];
  st.atroT.push(st.clock);
  st.did.atro = 1;
  if (forced) return O(forced, firstKey, o);
  return O("ok", firstKey, o);
}
function isTimeCriticalDue(d) {
  return d && (d.id === "adr" || d.id === "adrRepeat" || d.id === "amio300");
}
function dueSeverity(st, d) {
  if (!d) return "open";
  if (d.id === "atro") return "open";
  if (d.id === "adrRepeat") return adrRepeatStatus(st) || "open";
  if (d.id === "adr") {
    if (st.adrT && st.adrT.length) return adrRepeatStatus(st) || "open";
    if ((st.shocks || 0) >= 3) return cycleDrugWindow(st.checksAfter3 || 0, st);
    return cycleDrugWindow(st.rhythmChecks || 0, st);
  }
  if (d.id === "amio300") return cycleDrugWindow(st.checksAfter3 || 0, st);
  return "open";
}
function endingDueSteps(st, due) {
  return (due || []).filter(function (d) {
    if (isTimeCriticalDue(d)) return dueSeverity(st, d) === "missed";
    if (d.id === "atro") return false;
    return true;
  });
}
function caseThreats(st) {
  return (st && st.scn && st.scn.start && st.scn.start.vit && st.scn.start.vit.threats) || "";
}
function isLifeThreateningHighDegreeBrady(st) {
  if (!st || !st.scn) return false;
  var ex = typeof extrasFor === "function" ? extrasFor(st) : null;
  if (ex && ex.kind && ex.kind !== "brady") return false;
  var startR = st.scn.start && st.scn.start.rhythm && st.scn.start.rhythm.gen;
  var nowR = st.rhythm && st.rhythm.gen;
  if (startR !== "chb" && nowR !== "chb") return false;
  return /\bshock\b|syncope|myocardial ischaemia|severe heart failure|post-ROSC/i.test(caseThreats(st));
}
function latePacingAfterFailedAtropine(st) {
  return !!(MARK_PACING_PARTLY_RIGHT_AFTER_FOUR_FAILED_ATROPINE
    && isLifeThreateningHighDegreeBrady(st)
    && (st.atro || 0) >= LATE_PACING_ATROPINE_DOSE_THRESHOLD);
}
function firstWhyWrong(o) {
  var keys = (o && o.keys) || [], i, tx;
  for (i = keys.length - 1; i >= 0; i--) {
    if (typeof isNudgeKey === "function" && isNudgeKey(keys[i])) continue;
    tx = TXT[keys[i]];
    if (tx && tx.whyWrong) return tx.whyWrong;
  }
  return "";
}
function fallbackWhy(o) {
  var keys = (o && o.keys) || [], i, tx, first;
  for (i = keys.length - 1; i >= 0; i--) {
    if (typeof isNudgeKey === "function" && isNudgeKey(keys[i])) continue;
    tx = TXT[keys[i]];
    if (!tx || !tx.full) continue;
    first = String(tx.full).replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0] || "";
    if (first.length > 20) return first;
  }
  if (o && o.harm && o.harm.label) return o.harm.label;
  return "";
}
function shortenWhy(why) {
  var s = String(why || "").replace(/\s+/g, " ").trim();
  var m = s.match(/^[^.!?]+[.!?]/);
  if (m) s = m[0];
  s = s.replace(/[.]+$/, "");
  if (s.length > 110) s = s.slice(0, 107).replace(/\s+\S*$/, "") + "...";
  return s;
}
function logVerdictLabel(o) {
  if (o && o.logVerdict) return o.logVerdict;
  var base = (o && VERD[o.v]) ? VERD[o.v][1] : "";
  if (!o || o.v === "ok" || o.v === "late" || o.v === "info") return base;
  if (o.notScoredAgain) return base + " (not scored again)";
  var why = firstWhyWrong(o) || fallbackWhy(o);
  if (why) return base + ": " + shortenWhy(why);
  return base;
}
function lastComparableLog(log) {
  var i, l;
  for (i = (log || []).length - 1; i >= 0; i--) {
    l = log[i];
    if (!l || !l.o || !l.act) continue;
    if (l.o.v === "info" || l.o.notAction || l.o.isNudge || l.o.isReg) continue;
    return l;
  }
  return null;
}
function applyWrongClickCollapse(a, o) {
  if (!o || !SIM || !a) return o;
  if (o.v !== "bad" && o.v !== "part") return o;
  if (o.notScoredAgain) return o;
  var prev = lastComparableLog(SIM.log);
  if (prev && prev.act === a && prev.o && prev.o.v === o.v) {
    o.notScoredAgain = true;
    if ((o.logVerdict && /Too soon/.test(o.logVerdict)) || (prev.o.logVerdict && /Too soon/.test(prev.o.logVerdict))) {
      o.logVerdict = "Too soon (not scored again)";
    } else {
      o.logVerdict = ((VERD[o.v] && VERD[o.v][1]) || "Not quite") + " (not scored again)";
    }
  }
  return o;
}
function scoredDecisionEntries(log) {
  return (log || []).filter(function (l) {
    return l && l.o && l.o.v !== "info" && !l.o.notScoredAgain;
  });
}
function decisionScoreFromLog(log, regCalls) {
  var counted = scoredDecisionEntries(log);
  var raw = counted.reduce(function (n, l) {
    return n + (l.o.v === "ok" || l.o.v === "late" ? 1 : l.o.v === "part" ? 0.5 : 0);
  }, 0);
  return { pts: Math.max(0, raw - REG_PENALTY * (regCalls || 0)), of: counted.length, raw: raw };
}

var R_SINUS_ROSC = { gen: "sinus_tachy", opts: { lo: 100, hi: 112 } };

var SCENARIOS = [
  { id: "s1", group: "Cardiac arrest", title: "Shockable arrest: VF to ROSC",
    blurb: "Collapse on a medical ward. Monitored arrest with a shockable rhythm.",
    scene: "A 68-year-old collapses on a medical ward. Unresponsive and not breathing normally. The resuscitation team is present, CPR 30:2 has been started and defibrillator pads are on. Compressions are paused for the first rhythm check.",
    start: { rhythm: { gen: "vf" }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["shock", "Shock VF without delay", "shock"], ["cpr", "Resume CPR immediately after each shock", "als"], ["adr", "Adrenaline 1 mg after the third shock", "adrShock"], ["amio300", "Amiodarone 300 mg after the third shock", "amio"]],
    step: function (a, st) {
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "s1_rosc", { end: true, pulse: true, vit: { pulse: "Present", bp: "96/58 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" }, phys: "rosc" });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "shock") {
        if (st.cpr) return O("bad", "a_shockMid");
        if (st.justShocked) return O("bad", "a_shockTwice");
        st.shocks++; st.justShocked = true; st.did.shock = 1;
        return O("ok", st.shocks === 1 ? "s1_shock1" : st.shocks === 3 ? "s1_shock3" : "s1_shockN", { phys: st.shocks === 1 ? "shockVF" : null });
      }
      if (a === "cpr") {
        if (st.cpr) return O("info", "a_cprRunning");
        if (!st.justShocked && st.shocks === 0) return O("ok", "s1_cprFirst", { cprStart: true });
        st.justShocked = false; st.did.cpr = 1;
        return O("ok", "s1_cpr", { cprStart: true });
      }
      if (st.justShocked && a !== "expert" && a !== "causes") return O("bad", "a_resumeFirst");
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.shocks >= 3 && st.adrAfter3 && st.amio) {
          st.phase = "organised";
          return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: R_SINUS_ROSC });
        }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "vf" }, phys: "vfPersists" });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "s1_rosc", { end: true, pulse: true, vit: { pulse: "Present", bp: "96/58 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" }, phys: "rosc" });
          if (!st.checked) { st.checked = true; return O("ok", "s1_assess", { vit: { pulse: "Absent" } }); }
          if (st.monitorReady) { st.monitorReady = false; return O("ok", "n_noPulse", { vit: { pulse: "Absent" } }); }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.shocks >= 3 && st.adrAfter3 && st.amio) { st.phase = "organised"; return O("ok", "s1_rosc", { end: true, pulse: true, cprStop: true, rhythm: R_SINUS_ROSC, phys: "rosc", vit: { pulse: "Present", bp: "96/58 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" } }); }
        return O("ok", st.shocks >= 3 ? "s1_checkNoDrugs" : "s1_check", { cprStop: true, cycleCheck: true, rhythm: { gen: "vf" }, phys: "vfPersists", vit: { pulse: "Absent" } });
      }
      if (a === "adr") {
        if (st.shocks < 3) return O("bad", "s1_adrEarly");
        return takeAdr(st, "s1_adr", "s1_adrRepeat", { kind: "post3", soonKey: "a_adrSoon", phys: "adr" });
      }
      if (a === "amio300") {
        return takeAmio300(st, "s1_amio", { phys: "amio" });
      }
      if (a === "amio150") {
        if (st.shocks >= 5 && st.amio && !st.amio150) { st.amio150 = true; st.did.amio150 = 1; return O("ok", "s1_amio150"); }
        if (!st.amio) return O("part", "amio150_first");
        return O("bad", "a_amio150");
      }
      if (a === "lido100" || a === "lido50") return takeLido(st, a);
      if (a === "padsAP") {
        if ((st.shocks || 0) < 3) return O("bad", "padsAP_early");
        st.did.padsAP = 1;
        return O("ok", "padsAP_ok");
      }
      if (a === "sync") return O("bad", "a_sync");
      return null;
    } },

  { id: "s2", group: "Cardiac arrest", title: "Non-shockable arrest: PEA with a reversible cause",
    blurb: "Post-operative patient found unresponsive. Something on the ward explains it.",
    scene: "A 54-year-old on a surgical ward, the day after abdominal surgery, is found unresponsive and not breathing normally. CPR 30:2 is under way and pads are on. The nurse mentions the wound drain has filled with fresh blood over the past hour. Compressions are paused for a rhythm check.",
    start: { rhythm: { gen: "pea", opts: { lo: 110, hi: 125 } }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["cpr", "CPR 30:2 without delay", "als"], ["adr", "Adrenaline 1 mg as soon as possible", "adrNon"], ["causes", "Identify the reversible cause (hypovolaemia)", "causes"], ["fluid", "IV fluid for hypovolaemia", "fluid"]],
    step: function (a, st) {
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "s2_rosc", { end: true, pulse: true, vit: { pulse: "Present, weak", bp: "84/50 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" }, phys: "roscHypovol" });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.adrT.length && st.fluid) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: R_SINUS_ROSC }); }
        if (st.cycles >= 2 && !st.fluid && !st.asys) { st.asys = true; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "asystole" }, phys: "peaToAsys" }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, phys: st.asys ? "peaToAsys" : "hypovol" });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "s2_rosc", { end: true, pulse: true, vit: { pulse: "Present, weak", bp: "84/50 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" }, phys: "roscHypovol" });
          if (!st.checked) { st.checked = true; return O("ok", "s2_assess", { vit: { pulse: "Absent" }, phys: "pea" }); }
          if (st.monitorReady) { st.monitorReady = false; return O("ok", "n_noPulse", { vit: { pulse: "Absent" } }); }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.adrT.length && st.fluid) { st.phase = "organised"; return O("ok", "s2_rosc", { end: true, pulse: true, cprStop: true, rhythm: R_SINUS_ROSC, phys: "roscHypovol", vit: { pulse: "Present, weak", bp: "84/50 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" } }); }
        if (st.cycles >= 2 && !st.fluid && !st.asys) { st.asys = true; return O("ok", "s2_checkAsys", { cprStop: true, cycleCheck: true, rhythm: { gen: "asystole" }, phys: "peaToAsys", vit: { pulse: "Absent" } }); }
        return O("ok", st.asys ? "s2_checkAsys" : "s2_check", { cprStop: true, cycleCheck: true, phys: st.asys ? null : "hypovol", vit: { pulse: "Absent" } });
      }
      if (a === "cpr") { if (st.cpr) return O("info", "a_cprRunning"); st.did.cpr = 1; return O("ok", "s2_cpr", { cprStart: true }); }
      if (a === "shock") return O("bad", "s2_shock");
      if (a === "sync") return O("bad", "a_sync");
      if (a === "adr") {
        return takeAdr(st, "s2_adr", "s2_adrRepeat", { kind: "nonshock", soonKey: "s2_adrSoon", phys: "adr" });
      }
      if (a === "causes") { st.cause = true; st.did.causes = 1; return O("ok", "s2_causes", { phys: "hypovol" }); }
      if (a === "fluid") { st.fluid = true; st.did.fluid = 1; return O(st.cause ? "ok" : "part", st.cause ? "s2_fluid" : ["s2_fluidEarly", "s2_fluid"]); }
      if (a === "expert") return O("ok", "s2_expert");
      return null;
    } },

  { id: "s3", group: "Bradycardia", title: "Bradycardia with life-threatening features",
    blurb: "Dizzy, fainted and now hypotensive with a slow pulse.",
    scene: "A 79-year-old on a medical ward felt dizzy and fainted while walking to the bathroom. Now awake but pale, clammy and confused. Monitoring and IV access are in place.",
    start: { rhythm: { gen: "chb", opts: { broad: false, vr: 40 } }, pulse: true, vit: { pulse: "Present, regular", bp: "78/44 mmHg", consc: "Awake, pale, clammy, confused", threats: "Shock; syncope" } },
    req: [["pace", "Interim measures: transcutaneous pacing, or an isoprenaline or adrenaline infusion", "pacing"], ["expert", "Seek expert help and consider transvenous pacing", "brady"]],
    extra: ["s3_widePoint", "s3_atroNuance"], idleNudge: true,
    step: function (a, st) {
      var interim = function () { return !!(st.paced || st.did.adrInf || st.did.iso); };
      var done = function (o) { if (interim() && st.did.expert) o.end = true; return o; };
      var capture = { rhythm: { gen: "pace_v", opts: { rate: 70, pRate: 85 } }, phys: "pace", vit: { bp: "104/62 mmHg", consc: "Awake, less clammy", threats: "Improving with pacing" } };
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "s3_assess"); }
      if (a === "atro") {
        if (interim()) return O("info", "s3_atroPaced");
        return takeAtro(st, "s3_atro1", "s3_atroRepeat", { phys: "atroCHB", rhythm: { gen: "chb", opts: { broad: false, vr: 42 } } });
      }
      if (a === "pace") {
        if (st.paced) return O("info", "s3_paceAgain");
        st.paced = true; st.did.pace = 1;
        if (latePacingAfterFailedAtropine(st)) {
          return done(O("part", "s3_paceLateAfterAtropine", capture));
        }
        return done(O("ok", st.atro ? "s3_pace" : "s3_paceEarly", capture));
      }
      if (a === "adrInf") {
        if (st.did.adrInf) return O("info", "s3_adrInfAgain");
        st.did.adrInf = 1;
        return done(O("ok", "s3_adrInf", { phys: "adrInf", vit: { pulse: "Present, a little faster", bp: "92/56 mmHg", threats: "Interim drug support" } }));
      }
      if (a === "iso") {
        if (st.did.iso) return O("info", "s3_isoAgain");
        st.did.iso = 1;
        return done(O("ok", "s3_iso", { phys: "iso", vit: { pulse: "Present, a little faster", bp: "92/56 mmHg", threats: "Interim drug support" } }));
      }
      if (a === "expert") { st.expert = true; st.did.expert = 1; return done(O("ok", "s3_expert")); }
      if (a === "causes") return O("ok", "s3_causes");
      if (a === "adr") return O("bad", "s3_adr");
      if (a === "aden") return O("bad", "s3_aden");
      if (a === "observe") return O("bad", "s3_observe");
      return null;
    } },

  { id: "s4", group: "Tachycardia", title: "Stable narrow complex tachycardia",
    blurb: "Sudden palpitations in a young adult who looks well.",
    scene: "A 32-year-old attends with sudden-onset palpitations that started an hour ago. Alert and talking, no chest pain, no breathlessness. Monitoring and a large IV cannula are in place.",
    start: { rhythm: { gen: "svt" }, pulse: true, vit: { pulse: "Present, regular", bp: "118/76 mmHg", consc: "Alert, talking", threats: "None" } },
    req: [["vagal", "Vagal manoeuvres first", "narrow"], ["aden", "Adenosine 6 mg, then 12 mg", "aden"]],
    idleNudge: true,
    step: function (a, st) {
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "s4_assess"); }
      if (a === "vagal") { if (st.vagal) return O("info", "s4_vagalAgain"); st.vagal = true; st.did.vagal = 1; return O("ok", "s4_vagal", { phys: "vagal" }); }
      if (a === "aden") {
        return takeAden(st, adenDoseOf(st._act && st._act.raw, st), {
          needVagal: true, earlyKey: "s4_adenEarly",
          doses: {
            6: { key: "s4_aden6", phys: "adenFail" },
            12: { key: "s4_aden12", phys: "aden", end: true, rhythm: { gen: "sinus", opts: { rate: 84 } }, vit: { threats: "None; now in sinus rhythm" } },
            18: { key: "s4_aden12", phys: "aden", end: true, rhythm: { gen: "sinus", opts: { rate: 84 } }, vit: { threats: "None; now in sinus rhythm" } }
          }
        });
      }
      if (a === "sync") return O("bad", "s4_sync");
      if (a === "amio300") return O("bad", "s4_amio");
      if (a === "observe") return O("bad", "s4_observe");
      return null;
    } },

  { id: "s5", group: "Tachycardia", title: "Unstable broad complex tachycardia",
    blurb: "Chest pain, hypotension and a fast regular broad rhythm.",
    scene: "A 63-year-old with a previous myocardial infarction has chest pain and light-headedness on the cardiology ward. Conscious but pale and clammy. Monitoring, oxygen and IV access are in place; defibrillator pads are on.",
    start: { rhythm: { gen: "vt" }, pulse: true, vit: { pulse: "Present, weak, regular", bp: "76/40 mmHg", consc: "Conscious, clammy, chest pain", threats: "Shock; myocardial ischaemia" } },
    req: [["expert", "Careful sedation or anaesthesia before cardioversion (conscious patient)", "sync"], ["sync", "Synchronised shock (up to 3 attempts)", "tachy"]],
    idleNudge: true,
    step: function (a, st) {
      if (st.arrest) {
        if (a === "shock") { st.arrest = false; return O("ok", "s5_arrestShock", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 92 } }, phys: "shockVF", vit: { pulse: "Present", bp: "94/60 mmHg", consc: "Drowsy", threats: "Immediately post-ROSC" } }); }
        if (a === "sync") return O("bad", "a_sync");
        if (a === "cpr") return O("part", "s5_arrestCPR", { cprStart: true });
        return null;
      }
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "s5_assess"); }
      if (a === "expert") { st.expert = true; st.did.expert = 1; return O("ok", "s5_expert"); }
      if (a === "sync") {
        st.sync++; st.did.sync = 1;
        var k = st.sync === 1 ? "s5_sync1" : "s5_sync2", v = st.expert ? "ok" : "part", keys = st.expert ? k : ["s5_noSed", k];
        if (st.sync === 1) return O(v, keys, { phys: "syncFail" });
        return O(v, keys, { end: true, rhythm: { gen: "sinus", opts: { rate: 96 } }, phys: "sync", vit: { pulse: "Present, regular", bp: "102/64 mmHg", consc: "Drowsy after sedation", threats: "None now" } });
      }
      if (a === "shock") { st.arrest = true; return O("bad", "s5_unsync", { pulse: false, rhythm: { gen: "vf" }, phys: "ront", vit: { pulse: "Absent", bp: "Not recordable", consc: "Unresponsive", threats: "Cardiac arrest" } }); }
      if (a === "amio300") return O("bad", "s5_amio");
      if (a === "aden") return O("bad", "s5_aden");
      if (a === "mg") return O("bad", "s5_mg");
      return null;
    } },

  { id: "s6", group: "Tachycardia", title: "Torsades de pointes",
    blurb: "Repeated light-headed spells in an inpatient on several drugs.",
    scene: "A 71-year-old inpatient taking several QT-prolonging drugs has repeated brief spells of light-headedness. The monitor alarms.",
    start: { rhythm: { gen: "torsades", opts: { runLen: 2.4 } }, pulse: true, vit: { pulse: "Present between runs", bp: "104/62 mmHg between runs", consc: "Alert, light-headed during runs", threats: "None sustained; runs are self-terminating" } },
    req: [["mg", "Magnesium 8 mmol IV over 10 min", "tdp"], ["causes", "Identify reversible causes (low potassium, QT-prolonging drugs)", "tdpCauses"]],
    idleNudge: true,
    step: function (a, st) {
      var done = function (o) { if (st.mg && st.cause && !st.arrest) o.end = true; return o; };
      if (st.arrest) {
        if (a === "shock") { st.arrest = false; return done(O("ok", "s6_arrestShock", { pulse: true, rhythm: { gen: "sinus", opts: { rate: 62, longQT: true } }, phys: "shockVF", vit: { pulse: "Present", bp: "96/58 mmHg", consc: "Drowsy", threats: "Immediately post-ROSC" } })); }
        if (a === "sync") return O("bad", "a_sync");
        if (a === "cpr") return O("part", "s6_arrestCPR", { cprStart: true });
        return null;
      }
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "s6_assess"); }
      if (a === "mg") {
        if (st.mg) return O("info", "s6_mgAgain");
        st.mg = true; st.did.mg = 1;
        return done(O("ok", "s6_mg", { rhythm: { gen: "sinus", opts: { rate: 62, longQT: true } }, phys: "mg", vit: { pulse: "Present, regular", bp: "112/68 mmHg", threats: "None; runs have stopped" } }));
      }
      if (a === "causes") { st.cause = true; st.did.causes = 1; return done(O("ok", "s6_causes")); }
      if (a === "amio300" || a === "amio150") { st.arrest = true; return O("bad", "s6_amio", { pulse: false, rhythm: { gen: "torsades", opts: {} }, phys: "amioQT", vit: { pulse: "Absent", bp: "Not recordable", consc: "Unresponsive", threats: "Cardiac arrest" } }); }
      if (a === "pace") {
        if (st.paced) return O("info", "s6_paceAgain");
        st.paced = true; st.did.pace = 1;
        return O("ok", "s6_pace", { phys: "rateQT" });
      }
      if (a === "iso") {
        if (st.did.iso) return O("info", "s6_isoAgain");
        st.did.iso = 1;
        return O("ok", "s6_iso", { phys: "iso", vit: { pulse: "Present, a little faster" } });
      }
      if (a === "sync") return O("bad", "s6_sync");
      return null;
    } }
];

HIDDEN_SCENARIOS.push(
  { id: "h11", idleNudge: true, group: "Bradycardia", title: "Narrow-complex complete heart block that responds to atropine",
    listTitle: "Bradycardia with poor perfusion after a faint",
    blurb: "A faint on the ward, then a slow regular rhythm and low blood pressure.",
    scene: "A 68-year-old had a brief faint on the ward and is now awake but pale, sweaty and confused. Monitoring and IV access are in place. The blood pressure is 76/42 mmHg.",
    start: { rhythm: { gen: "chb", opts: { broad: false, vr: 38 } }, pulse: true, vit: { pulse: "Present, regular, slow", bp: "76/42 mmHg", consc: "Awake, pale, confused", threats: "Shock; syncope" } },
    req: [["atro", "Atropine 500 micrograms IV", "brady"]],
    extra: "s3_atroNuance",
    due: function (st) {
      var out = [], hadChance = (st.actionN || 0) >= 1 || st.checked;
      if (!st.did.atro && hadChance) out.push(dueItem("atro", "Atropine 500 micrograms IV", "Review the first drug on this algorithm", "Have you thought about the first drug on this algorithm?", "brady", "Bradyarrhythmia: atropine 500 mcg IV"));
      return out;
    },
    step: function (a, st) {
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "h11_assess"); }
      if (a === "atro") {
        if (st.did.atro) return takeAtro(st, "h11_atro", "s3_atroRepeat", { phys: "atroCHB", rhythm: { gen: "chb", opts: { broad: false, vr: 58 } } });
        st.did.atro = 1;
        return takeAtro(st, "h11_atro", "s3_atroRepeat", { phys: "atroCHB", rhythm: { gen: "chb", opts: { broad: false, vr: 58 } }, o: { end: true, vit: { pulse: "Present, regular, faster", bp: "102/64 mmHg", consc: "Awake, less confused", threats: "Improving after atropine" } } });
      }
      if (a === "expert") { st.did.expert = 1; return O("ok", "s3_expert"); }
      if (a === "pace") {
        if (st.did.atro) return O("info", "s3_paceAgain");
        st.paced = true; st.did.pace = 1;
        return O("part", "h11_pace", { end: true, rhythm: { gen: "pace_v", opts: { rate: 70, pRate: 85 } }, phys: "pace", vit: { bp: "104/62 mmHg", consc: "Awake, less clammy", threats: "Improving with pacing" } });
      }
      if (a === "adrInf" || a === "iso") {
        if (st.did[a]) return O("info", a === "iso" ? "s3_isoAgain" : "s3_adrInfAgain");
        st.did[a] = 1;
        return O(st.did.atro ? "ok" : "part", a === "iso" ? "s3_iso" : "s3_adrInf", { vit: { pulse: "Present, a little faster", bp: "92/56 mmHg", threats: "Interim drug support" } });
      }
      if (a === "causes") return O("ok", "s3_causes");
      if (a === "aden") return O("bad", "s3_aden");
      if (a === "observe") return O("bad", "s3_observe");
      return null;
    } },

  { id: "h12", idleNudge: true, group: "Bradycardia", title: "Sinus bradycardia with life-threatening features that responds to atropine",
    listTitle: "A slow sinus rhythm after a faint",
    blurb: "A faint after a bowel motion, now pale and hypotensive with a slow sinus rhythm.",
    scene: "A 71-year-old had a brief faint after a bowel motion. They are now awake but pale, sweaty and drowsy. Monitoring and IV access are in place. The blood pressure is 74/40 mmHg.",
    start: { rhythm: { gen: "sinus_brady", opts: { rate: 36 } }, pulse: true, vit: { pulse: "Present, regular, slow", bp: "74/40 mmHg", consc: "Awake, pale, drowsy", threats: "Shock; syncope" } },
    req: [["atro", "Atropine 500 micrograms IV", "brady"]],
    due: function (st) {
      var out = [], hadChance = (st.actionN || 0) >= 1 || st.checked;
      if (!st.did.atro && hadChance) out.push(dueItem("atro", "Atropine 500 micrograms IV", "Review the first drug on this algorithm", "Have you thought about the first drug on this algorithm?", "brady", "Bradyarrhythmia: atropine 500 mcg IV"));
      return out;
    },
    step: function (a, st) {
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "h12_assess"); }
      if (a === "atro") {
        st.did.atro = 1;
        return takeAtro(st, "h12_atro", "s3_atroRepeat", { phys: "atro", rhythm: { gen: "sinus_brady", opts: { rate: 58 } }, o: { end: true, vit: { pulse: "Present, regular, faster", bp: "104/62 mmHg", consc: "Awake, less drowsy", threats: "Improving after atropine" } } });
      }
      if (a === "expert") { st.did.expert = 1; return O("ok", "s3_expert"); }
      if (a === "pace") {
        st.paced = true; st.did.pace = 1;
        return O(st.did.atro ? "ok" : "part", st.did.atro ? "s3_pace" : "h12_pace", { end: true, rhythm: { gen: "pace_v", opts: { rate: 70, pRate: 85 } }, phys: "pace", vit: { bp: "104/62 mmHg", consc: "Awake, less clammy", threats: "Improving with pacing" } });
      }
      if (a === "adrInf" || a === "iso") {
        if (st.did[a]) return O("info", a === "iso" ? "s3_isoAgain" : "s3_adrInfAgain");
        st.did[a] = 1;
        return O(st.did.atro ? "ok" : "part", a === "iso" ? "s3_iso" : "s3_adrInf");
      }
      if (a === "causes") return O("ok", "s3_causes");
      if (a === "observe") return O("bad", "s3_observe");
      return null;
    } },

  { id: "h13", group: "Cardiac arrest", title: "Refractory VF needing a second antiarrhythmic dose and a pad-position change",
    listTitle: "A prolonged shockable arrest",
    blurb: "A shockable arrest that is still shockable after the usual first drugs.",
    scene: "A 58-year-old collapses in a clinic waiting area. They are unresponsive and not breathing normally. CPR 30:2 has been started and pads are on in the antero-lateral position. Compressions are paused for the first rhythm check.",
    start: { rhythm: { gen: "vf" }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["shock", "Shock VF without delay", "shock"], ["cpr", "Resume CPR immediately after each shock", "als"], ["adr", "Adrenaline 1 mg after the third shock", "adrShock"], ["amio300", "Amiodarone 300 mg after the third shock, or lidocaine 100 mg as an alternative", "amio"], ["amio150", "Amiodarone 150 mg after the fifth shock, or lidocaine 50 mg if lidocaine was used", "amio"], ["padsAP", "Change pads to the antero-posterior position after a failed third shock", "alsPriority"]],
    due: function (st) {
      var out = [];
      if (st.shocks >= 3 && !st.did.adr) out.push(dueItem("adr", "Adrenaline 1 mg after the third shock", "Review drug timing after the third shock", "Have you thought about your drugs after the third shock?", "adrShock", "ALS: adrenaline after 3 shocks"));
      if (st.shocks >= 3 && !st.amio) out.push(dueItem("amio300", "Amiodarone 300 mg after the third shock, or lidocaine 100 mg as an alternative", "Review drug timing after the third shock", "Have you thought about your drugs after the third shock?", "amio", "ALS: amiodarone after 3 shocks"));
      if (st.shocks >= 5 && st.amio && !st.amio150 && !st.did.lido50) out.push(dueItem("amio150", "Amiodarone 150 mg after the fifth shock, or lidocaine 50 mg if lidocaine was used", "Review the further antiarrhythmic dose after the fifth shock", "Have you thought about a further antiarrhythmic dose?", "amio", "ALS: amiodarone after 5 shocks"));
      if (st.shocks >= 3 && !st.did.padsAP) out.push(dueItem("padsAP", "Change pads to the antero-posterior position after a failed third shock", "Review pad position in refractory VF", "Have you thought about pad position?", "alsPriority", "ALS: defibrillation vector change"));
      return out;
    },
    step: function (a, st) {
      var roscVit = { pulse: "Present", bp: "96/58 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" };
      var ready = function () { return st.shocks >= 5 && st.amio && st.amio150 && st.did.padsAP; };
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "h13_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc" });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (ready()) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "vf" } }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "vf" }, phys: "vfPersists" });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "h13_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc" });
          if (!st.checked) { st.checked = true; return O("ok", "s1_assess", { vit: { pulse: "Absent" } }); }
          if (st.monitorReady) {
            st.monitorReady = false;
            if (ready()) return O("ok", "h13_rosc", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 90 } }, phys: "rosc", vit: roscVit });
            return O("ok", "n_noPulse", { vit: { pulse: "Absent" } });
          }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (ready()) { st.phase = "organised"; return O("ok", "h13_rosc", { end: true, pulse: true, cprStop: true, rhythm: { gen: "sinus", opts: { rate: 90 } }, phys: "rosc", vit: roscVit }); }
        return O("ok", st.shocks >= 3 ? "s1_checkNoDrugs" : "s1_check", { cprStop: true, cycleCheck: true, rhythm: { gen: "vf" }, phys: "vfPersists", vit: { pulse: "Absent" } });
      }
      if (a === "cpr") {
        if (st.cpr) return O("info", "a_cprRunning");
        return O("ok", "s1_cpr", { cprStart: true });
      }
      if (a === "shock") {
        if (st.cpr) return O("bad", "a_shockMid");
        st.shocks = (st.shocks || 0) + 1; st.justShocked = true;
        return O("ok", "s1_shock", { phys: "shockVF" });
      }
      if (a === "adr") {
        if (st.shocks < 3) return O("bad", "s1_adrEarly");
        return takeAdr(st, "s1_adr", "s1_adrRepeat", { kind: "post3", soonKey: "a_adrSoon", phys: "adr" });
      }
      if (a === "amio300") return takeAmio300(st, "s1_amio", { phys: "amio" });
      if (a === "amio150") {
        if (st.shocks >= 5 && st.amio && !st.amio150) { st.amio150 = true; st.did.amio150 = 1; return O("ok", "s1_amio150"); }
        if (!st.amio) return O("part", "amio150_first");
        return O("bad", "a_amio150");
      }
      if (a === "lido100" || a === "lido50") return takeLido(st, a);
      if (a === "padsAP") {
        if ((st.shocks || 0) < 3) return O("bad", "padsAP_early");
        st.did.padsAP = 1;
        return O("ok", "padsAP_ok");
      }
      if (a === "sync") return O("bad", "a_sync");
      return null;
    } }
);

HIDDEN_SCENARIOS.push(
  { id: "h14", group: "Cardiac arrest", title: "VF then PEA from hypovolaemia",
    listTitle: "A shockable arrest that changes",
    blurb: "An arrest call after a bleed; the first rhythm may not last.",
    scene: "A 49-year-old on a surgical ward, the day after major abdominal surgery, is found unresponsive and not breathing normally. The drain has filled with fresh blood. CPR 30:2 is under way and pads are on. Compressions are paused for a rhythm check.",
    start: { rhythm: { gen: "vf" }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["shock", "Shock the first VF without delay", "shock"], ["cpr", "CPR 30:2", "als"], ["adr", "Adrenaline 1 mg as soon as the rhythm is non-shockable, or after the third shock if it stays shockable", "adrNon"], ["causes", "Identify the reversible cause (hypovolaemia)", "causes"], ["fluid", "IV fluid for hypovolaemia", "fluid"]],
    due: function (st) {
      var out = hiddenDueArrestAdr(st);
      if (st.becamePea && (!st.did.causes || !st.did.fluid) && (st.cpr || st.checked || (st.actionN || 0) >= 2)) {
        out.push(dueItem(st.did.causes ? "fluid" : "causes", st.did.causes ? "IV fluid for hypovolaemia" : "Identify the reversible cause (hypovolaemia)", "Think about reversible causes", "Have you thought about reversible causes?", st.did.causes ? "fluid" : "causes", st.did.causes ? "ALS: fluids for hypovolaemia" : "ALS: identify and treat reversible causes"));
      }
      return out;
    },
    step: function (a, st) {
      var roscVit = { pulse: "Present, weak", bp: "84/50 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" };
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "h14_rosc", { end: true, pulse: true, vit: roscVit, phys: "roscHypovol" });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "cpr") { if (st.cpr) return O("info", "a_cprRunning"); return O("ok", "s1_cpr", { cprStart: true }); }
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (!st.becamePea && (st.shocks || 0) >= 1) {
          st.becamePea = true;
          return O("ok", "h14_nowPea", { cprStop: true, cycleCheck: true, rhythm: { gen: "pea", opts: { lo: 110, hi: 125 } } });
        }
        if (st.becamePea && st.did.fluid && st.did.causes) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "pea", opts: { lo: 90, hi: 110 } } }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: st.becamePea ? { gen: "pea", opts: { lo: 110, hi: 125 } } : { gen: "vf" } });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "h14_rosc", { end: true, pulse: true, vit: roscVit, phys: "roscHypovol" });
          if (!st.checked) { st.checked = true; return O("ok", "s1_assess", { vit: { pulse: "Absent" } }); }
          if (st.monitorReady) {
            st.monitorReady = false;
            if (st.becamePea && st.did.fluid && st.did.causes) return O("ok", "h14_rosc", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 100 } }, phys: "roscHypovol", vit: roscVit });
            if (st.becamePea) return O("ok", "h14_nowPea", { vit: { pulse: "Absent" }, rhythm: { gen: "pea", opts: { lo: 110, hi: 125 } } });
            return O("ok", "n_noPulse", { vit: { pulse: "Absent" } });
          }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (!st.becamePea && (st.shocks || 0) >= 1) {
          st.becamePea = true;
          return O("ok", "h14_nowPea", { cprStop: true, cycleCheck: true, rhythm: { gen: "pea", opts: { lo: 110, hi: 125 } }, vit: { pulse: "Absent" } });
        }
        if (st.becamePea && st.did.fluid && st.did.causes) return O("ok", "h14_rosc", { end: true, pulse: true, cprStop: true, rhythm: { gen: "sinus", opts: { rate: 100 } }, phys: "roscHypovol", vit: roscVit });
        return O("ok", "n_noPulse", { cprStop: true, cycleCheck: true, vit: { pulse: "Absent" } });
      }
      if (a === "shock") {
        if (st.becamePea) return O("bad", "h14_shockPea");
        if (st.cpr) return O("bad", "a_shockMid");
        st.shocks = (st.shocks || 0) + 1;
        return O("ok", "s1_shock", { phys: "shockVF" });
      }
      if (a === "adr") {
        if (!st.becamePea && (st.shocks || 0) < 3) return O("bad", "s1_adrEarly");
        return takeAdr(st, "s1_adr", "s1_adrRepeat", { kind: st.becamePea ? "non" : "post3", soonKey: "a_adrSoon", phys: "adr" });
      }
      if (a === "causes") { st.did.causes = 1; return O("ok", "s2_causes"); }
      if (a === "fluid") { st.fluid = true; st.did.fluid = 1; return O(st.did.causes ? "ok" : "part", st.did.causes ? "s2_fluid" : ["s2_fluidEarly", "s2_fluid"]); }
      if (a === "sync") return O("bad", "a_sync");
      return null;
    } },

  { id: "h15", group: "Cardiac arrest", title: "PEA from suspected pulmonary embolism, treated with a fibrinolytic",
    listTitle: "Non-shockable arrest after sudden collapse",
    blurb: "Sudden collapse after recent long-distance travel; an organised rhythm without a pulse.",
    scene: "A 62-year-old who arrived yesterday after a long-haul flight collapses with sudden breathlessness, then becomes unresponsive and is not breathing normally. CPR 30:2 has been started and pads are on. Compressions are paused for a rhythm check.",
    start: { rhythm: { gen: "pea", opts: { lo: 120, hi: 140 } }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["cpr", "CPR 30:2 without delay", "als"], ["adr", "Adrenaline 1 mg as soon as possible", "adrNon"], ["causes", "Identify the reversible cause (thrombosis, pulmonary embolism)", "causes"], ["fibrin", "Fibrinolytic or thrombolytic drug when PE is the suspected cause, then continue CPR", "special"]],
    extra: "h15_rosc",
    due: function (st) {
      var out = hiddenDueArrestAdr(st);
      if (!st.did.causes && (st.cpr || st.checked || (st.actionN || 0) >= 2)) out.push(dueItem("causes", "Identify the reversible cause (thrombosis, pulmonary embolism)", "Think about reversible causes", "Have you thought about reversible causes?", "causes", "ALS: identify and treat reversible causes"));
      if (st.did.causes && !st.did.fibrin) out.push(dueItem("fibrin", "Fibrinolytic or thrombolytic drug when PE is the suspected cause", "Review specific treatment of the suspected cause", "Have you thought about specific treatment of the suspected cause?", "special", "ALS: thrombolytic drugs when PE is suspected"));
      return out;
    },
    step: function (a, st) {
      var roscVit = { pulse: "Present, weak", bp: "88/54 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" };
      var ready = function () { return st.did.fibrin && (st.cyclesAfterFibrin || 0) >= 2; };
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "h15_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc" });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "cpr") { if (st.cpr) return O("info", "a_cprRunning"); return O("ok", "s1_cpr", { cprStart: true }); }
      if (a === "ff") {
        if (!st.cpr) {
          if (st.did.fibrin) st.cyclesAfterFibrin = (st.cyclesAfterFibrin || 0) + 1;
          return O("info", "a_ffNoCPR");
        }
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.fibrin) st.cyclesAfterFibrin = (st.cyclesAfterFibrin || 0) + 1;
        if (ready()) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "pea", opts: { lo: 90, hi: 110 } } }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "pea", opts: { lo: 120, hi: 140 } } });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "h15_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc" });
          if (!st.checked) { st.checked = true; return O("ok", "s2_assess", { vit: { pulse: "Absent" } }); }
          if (st.monitorReady) {
            st.monitorReady = false;
            if (ready()) return O("ok", "h15_rosc", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 110 } }, phys: "rosc", vit: roscVit });
            return O("ok", "n_noPulse", { vit: { pulse: "Absent" } });
          }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.fibrin) st.cyclesAfterFibrin = (st.cyclesAfterFibrin || 0) + 1;
        if (ready()) return O("ok", "h15_rosc", { end: true, pulse: true, cprStop: true, rhythm: { gen: "sinus", opts: { rate: 110 } }, phys: "rosc", vit: roscVit });
        return O("ok", "n_noPulse", { cprStop: true, cycleCheck: true, vit: { pulse: "Absent" } });
      }
      if (a === "adr") return takeAdr(st, "s2_adr", "s1_adrRepeat", { kind: "non", soonKey: "a_adrSoon", phys: "adr" });
      if (a === "causes") { st.did.causes = 1; return O("ok", "h15_causes"); }
      if (a === "fibrin") {
        st.did.fibrin = 1;
        return O(st.did.causes ? "ok" : "part", st.did.causes ? "h15_fibrin" : ["h15_fibrinEarly", "h15_fibrin"]);
      }
      if (a === "shock") return O("bad", "s2_shock");
      if (a === "sync") return O("bad", "a_sync");
      return null;
    } },

  { id: "h16", group: "Cardiac arrest", title: "PEA after recent cardiac surgery, emergency re-sternotomy",
    listTitle: "Non-shockable arrest in the cardiac recovery area",
    blurb: "The second day after heart surgery, an organised rhythm without a pulse.",
    scene: "A 66-year-old is on the cardiac recovery unit, day 2 after coronary artery bypass grafts. They become unresponsive and are not breathing normally. CPR 30:2 has been started and pads are on. Compressions are paused for a rhythm check. The chest drain output has increased.",
    start: { rhythm: { gen: "pea", opts: { lo: 40, hi: 55 } }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["cpr", "CPR 30:2 without delay", "als"], ["adr", "Adrenaline as soon as possible (standard 1 mg option in this simulation)", "adrNon"], ["causes", "Identify the reversible cause (cardiac tamponade)", "causes"], ["resternotomy", "Return to theatre / emergency re-sternotomy within 5 minutes after recent cardiac surgery", "special"]],
    extra: "h16_guideNote",
    due: function (st) {
      var out = hiddenDueArrestAdr(st);
      if (!st.did.causes && (st.cpr || st.checked || (st.actionN || 0) >= 2)) out.push(dueItem("causes", "Identify the reversible cause (cardiac tamponade)", "Think about reversible causes", "Have you thought about reversible causes?", "causes", "ALS: identify and treat reversible causes"));
      if (st.did.causes && !st.did.resternotomy) out.push(dueItem("resternotomy", "Return to theatre / emergency re-sternotomy", "Review time-critical treatment after recent cardiac surgery", "Have you thought about time-critical treatment after recent cardiac surgery?", "special", "Special circumstances: re-sternotomy within 5 min"));
      return out;
    },
    step: function (a, st) {
      var roscVit = { pulse: "Present, weak", bp: "90/56 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC, in theatre" };
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "h16_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc" });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "cpr") { if (st.cpr) return O("info", "a_cprRunning"); return O("ok", "s1_cpr", { cprStart: true }); }
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.resternotomy) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "pea", opts: { lo: 80, hi: 100 } } }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "pea", opts: { lo: 40, hi: 55 } } });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "h16_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc" });
          if (!st.checked) { st.checked = true; return O("ok", "s2_assess", { vit: { pulse: "Absent" } }); }
          if (st.monitorReady) {
            st.monitorReady = false;
            if (st.did.resternotomy) return O("ok", "h16_rosc", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 90 } }, phys: "rosc", vit: roscVit });
            return O("ok", "n_noPulse", { vit: { pulse: "Absent" } });
          }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.resternotomy) return O("ok", "h16_rosc", { end: true, pulse: true, cprStop: true, rhythm: { gen: "sinus", opts: { rate: 90 } }, phys: "rosc", vit: roscVit });
        return O("ok", "n_noPulse", { cprStop: true, cycleCheck: true, vit: { pulse: "Absent" } });
      }
      if (a === "adr") return takeAdr(st, "s2_adr", "s1_adrRepeat", { kind: "non", soonKey: "a_adrSoon", phys: "adr" });
      if (a === "causes") { st.did.causes = 1; return O("ok", "h16_causes"); }
      if (a === "resternotomy") {
        st.did.resternotomy = 1;
        var late = st.clock > 300;
        return O(late ? "part" : "ok", late ? "h16_resternLate" : "h16_restern");
      }
      if (a === "pericardiocentesis") return O("part", "h16_pericard");
      if (a === "shock") return O("bad", "s2_shock");
      if (a === "sync") return O("bad", "a_sync");
      return null;
    } },

  { id: "h17", group: "Cardiac arrest", title: "PEA from hypoxia, 100% oxygen and an airway check",
    listTitle: "Non-shockable arrest after a difficult intubation",
    blurb: "Just after intubation the patient is blue, with an organised rhythm and no pulse.",
    scene: "A 55-year-old has just been intubated on the ward after a difficult airway. They are deeply cyanosed, unresponsive and not breathing normally. CPR 30:2 has been started and pads are on. Compressions are paused for a rhythm check.",
    start: { rhythm: { gen: "pea", opts: { lo: 40, hi: 50 } }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally, deeply cyanosed", threats: "Cardiac arrest" } },
    req: [["cpr", "CPR 30:2 without delay", "als"], ["adr", "Adrenaline 1 mg as soon as possible", "adrNon"], ["causes", "Identify the reversible cause (hypoxia)", "causes"], ["oxygen", "100% oxygen and check the airway", "special"]],
    due: function (st) {
      var out = hiddenDueArrestAdr(st);
      if (!st.did.causes && (st.cpr || st.checked || (st.actionN || 0) >= 2)) out.push(dueItem("causes", "Identify the reversible cause (hypoxia)", "Think about reversible causes", "Have you thought about reversible causes?", "causes", "ALS: identify and treat reversible causes"));
      if (st.did.causes && !st.did.oxygen) out.push(dueItem("oxygen", "100% oxygen and check the airway", "Review treatment of hypoxia", "Have you thought about the airway and oxygen?", "special", "Special circumstances: 100% oxygen and the airway"));
      return out;
    },
    step: function (a, st) {
      var roscVit = { pulse: "Present", bp: "100/62 mmHg", consc: "Unresponsive but breathing, colour improving", threats: "Immediately post-ROSC" };
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "h17_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc" });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "cpr") { if (st.cpr) return O("info", "a_cprRunning"); return O("ok", "s1_cpr", { cprStart: true }); }
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.oxygen) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "pea", opts: { lo: 80, hi: 100 } } }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "pea", opts: { lo: 40, hi: 50 } } });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "h17_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc" });
          if (!st.checked) { st.checked = true; return O("ok", "s2_assess", { vit: { pulse: "Absent" } }); }
          if (st.monitorReady) {
            st.monitorReady = false;
            if (st.did.oxygen) return O("ok", "h17_rosc", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 96 } }, phys: "rosc", vit: roscVit });
            return O("ok", "n_noPulse", { vit: { pulse: "Absent" } });
          }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.oxygen) return O("ok", "h17_rosc", { end: true, pulse: true, cprStop: true, rhythm: { gen: "sinus", opts: { rate: 96 } }, phys: "rosc", vit: roscVit });
        return O("ok", "n_noPulse", { cprStop: true, cycleCheck: true, vit: { pulse: "Absent" } });
      }
      if (a === "adr") return takeAdr(st, "s2_adr", "s1_adrRepeat", { kind: "non", soonKey: "a_adrSoon", phys: "adr" });
      if (a === "causes") { st.did.causes = 1; return O("ok", "h17_causes"); }
      if (a === "oxygen") {
        st.did.oxygen = 1;
        return O(st.did.causes ? "ok" : "part", st.did.causes ? "h17_oxygen" : ["h17_oxygenEarly", "h17_oxygen"]);
      }
      if (a === "shock") return O("bad", "s2_shock");
      if (a === "sync") return O("bad", "a_sync");
      return null;
    } },

  { id: "h18", group: "Cardiac arrest", title: "Hypokalaemic cardiac arrest treated with a potassium bolus",
    listTitle: "Non-shockable arrest in a patient on diuretics",
    blurb: "An arrest in a patient on high-dose diuretics, with an organised or flat rhythm and no pulse.",
    scene: "A 74-year-old on high-dose loop and thiazide diuretics is found unresponsive and not breathing normally. CPR 30:2 has been started and pads are on. Compressions are paused for a rhythm check.",
    start: { rhythm: { gen: "asystole" }, pulse: false, vit: { pulse: "Not yet checked", bp: "Not recordable", consc: "Unresponsive, not breathing normally", threats: "Cardiac arrest" } },
    req: [["cpr", "CPR 30:2 without delay", "als"], ["adr", "Adrenaline 1 mg as soon as possible", "adrNon"], ["causes", "Identify the reversible cause (hypokalaemia)", "causes"], ["kcl", "Potassium chloride 20 mmol over 2 to 3 min, then 10 mmol over 2 min", "special"]],
    due: function (st) {
      var out = hiddenDueArrestAdr(st);
      if ((!st.did.causes || !st.did.kcl) && (st.cpr || st.checked || (st.actionN || 0) >= 2)) {
        out.push(dueItem(st.did.causes ? "kcl" : "causes", st.did.causes ? "Potassium chloride arrest bolus" : "Identify the reversible cause (hypokalaemia)", "Think about reversible causes", "Have you thought about reversible causes?", st.did.causes ? "special" : "causes", st.did.causes ? "Special circumstances: hypokalaemic cardiac arrest" : "ALS: identify and treat reversible causes"));
      }
      return out;
    },
    step: function (a, st) {
      var roscVit = { pulse: "Present, weak", bp: "88/54 mmHg", consc: "Unresponsive but breathing", threats: "Immediately post-ROSC" };
      if (st.phase === "organised") {
        if (a === "assess") return O("ok", "h18_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc" });
        if (a === "ff") return O("info", "a_ffNoCPR");
        if (a === "cpr") return O("bad", "s1_roscCPR");
        if (a === "shock") return O("bad", "s1_roscShock");
      }
      if (a === "cpr") { if (st.cpr) return O("info", "a_cprRunning"); return O("ok", "s1_cpr", { cprStart: true }); }
      if (a === "ff") {
        if (!st.cpr) return O("info", "a_ffNoCPR");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.kcl && st.did.causes) { st.phase = "organised"; return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "pea", opts: { lo: 60, hi: 80 } } }); }
        return O("ok", "n_skip", { cprStop: true, cycleCheck: true, rhythm: { gen: "asystole" } });
      }
      if (a === "assess") {
        if (!st.cpr) {
          if (st.phase === "organised") return O("ok", "h18_rosc", { end: true, pulse: true, vit: roscVit, phys: "rosc" });
          if (!st.checked) { st.checked = true; return O("ok", "h1_assess", { vit: { pulse: "Absent" } }); }
          if (st.monitorReady) {
            st.monitorReady = false;
            if (st.did.kcl && st.did.causes) return O("ok", "h18_rosc", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 80 } }, phys: "rosc", vit: roscVit });
            return O("ok", "n_noPulse", { vit: { pulse: "Absent" } });
          }
          return O("info", "a_assessAgain");
        }
        if (st.clock - st.cycleStart < 120) return O("bad", "a_interrupt");
        st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
        if (st.did.kcl && st.did.causes) return O("ok", "h18_rosc", { end: true, pulse: true, cprStop: true, rhythm: { gen: "sinus", opts: { rate: 80 } }, phys: "rosc", vit: roscVit });
        return O("ok", "n_noPulse", { cprStop: true, cycleCheck: true, vit: { pulse: "Absent" } });
      }
      if (a === "adr") return takeAdr(st, "s2_adr", "s1_adrRepeat", { kind: "non", soonKey: "a_adrSoon", phys: "adr" });
      if (a === "causes") { st.did.causes = 1; return O("ok", "h18_causes"); }
      if (a === "kcl") {
        st.did.kcl = 1;
        return O(st.did.causes ? "ok" : "part", st.did.causes ? "h18_kcl" : ["h18_kclEarly", "h18_kcl"]);
      }
      if (a === "mg") { st.did.mg = 1; return O("ok", "s6_mg"); }
      if (a === "shock" || a === "sync") return O("bad", "h1_shock");
      return null;
    } }
);

HIDDEN_SCENARIOS.push(
  { id: "h19", idleNudge: true, group: "Tachycardia", title: "Stable broad-complex tachycardia when sedation or anaesthesia risk is too high",
    listTitle: "Regular broad-complex tachycardia in a frail patient",
    blurb: "A frail patient with palpitations who looks well, but sedation or anaesthesia would be high risk.",
    scene: "An 84-year-old with a previous myocardial infarction attends with palpitations for two hours. Alert, talking, no chest pain, no breathlessness, blood pressure is 124/72 mmHg. They are frail, had a full meal an hour ago, and the airway looks difficult. The team judges that sedation or anaesthesia risk is too high. Monitoring and IV access are in place.",
    start: { rhythm: { gen: "vt" }, pulse: true, vit: { pulse: "Present, regular", bp: "124/72 mmHg", consc: "Alert, talking", threats: "None; sedation or anaesthesia risk is too high" } },
    req: [["procain", "Procainamide 10 to 15 mg/kg IV over 20 min (maximum 1 g)", "procain"]],
    due: function (st) {
      var out = [], hadChance = (st.actionN || 0) >= 1 || st.checked;
      if (st.arrest) out.push(dueItem("shock", "Unsynchronised shock for this pulseless rhythm", "This is now a cardiac arrest. Review the immediate electrical treatment", "This is now a cardiac arrest. Have you thought about the immediate electrical treatment?", "alsPriority", "ALS: early defibrillation"));
      else if (!st.did.procain && hadChance) out.push(dueItem("procain", "Procainamide 10 to 15 mg/kg IV over 20 min (maximum 1 g)", "Review drug treatment when sedation risk is too high", "Have you thought about drug treatment when sedation risk is too high?", "procain", "Tachyarrhythmia: procainamide if sedation risk is too high"));
      return out;
    },
    step: function (a, st) {
      if (st.arrest) {
        if (a === "shock") { st.arrest = false; return O("ok", "s5_arrestShock", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 88 } }, phys: "shockVF", vit: { pulse: "Present", bp: "100/64 mmHg", consc: "Drowsy", threats: "Immediately post-ROSC" } }); }
        if (a === "sync") return O("bad", "a_sync");
        if (a === "cpr") return O("part", "s5_arrestCPR", { cprStart: true });
        return null;
      }
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "h19_assess"); }
      if (a === "expert") { st.did.expert = 1; return O("ok", "s5_expert"); }
      if (a === "procain") {
        st.did.procain = 1;
        return O("ok", "h19_procain", { end: true, rhythm: { gen: "sinus", opts: { rate: 86 } }, vit: { pulse: "Present, regular", bp: "118/70 mmHg", threats: "None; now in sinus rhythm" } });
      }
      if (a === "amioInf" || a === "amio1020") {
        st.did.amioInf = 1;
        return O("part", "h19_amio", { end: true, rhythm: { gen: "sinus", opts: { rate: 86 } }, vit: { pulse: "Present, regular", bp: "118/70 mmHg", threats: "None; now in sinus rhythm" } });
      }
      if (a === "amio300") return O("bad", "h7_amioBolus");
      if (a === "sync") {
        st.sync++; st.did.sync = 1;
        var keys = st.expert ? "h19_sync" : ["s5_noSed", "h19_sync"];
        return O("part", keys, { end: true, rhythm: { gen: "sinus", opts: { rate: 88 } }, phys: "sync", vit: { pulse: "Present, regular", bp: "110/70 mmHg", consc: "Drowsy after sedation", threats: "None now" } });
      }
      if (a === "shock") { st.arrest = true; return O("bad", "s5_unsync", { pulse: false, rhythm: { gen: "vf" }, phys: "ront", vit: { pulse: "Absent", bp: "Not recordable", consc: "Unresponsive", threats: "Cardiac arrest" } }); }
      if (a === "aden") return O("bad", "h7_aden");
      return null;
    } },

  { id: "h20", idleNudge: true, group: "Tachycardia", title: "Unstable VT after three failed synchronised shocks",
    listTitle: "Unstable broad-complex tachycardia that persists",
    blurb: "Chest pain and a fast regular broad rhythm that does not correct with the first shocks.",
    scene: "A 61-year-old with a previous myocardial infarction has chest pain and light-headedness. Conscious but pale and clammy. Blood pressure is 78/42 mmHg. Monitoring, oxygen and IV access are in place; defibrillator pads are on.",
    start: { rhythm: { gen: "vt" }, pulse: true, vit: { pulse: "Present, weak, regular", bp: "78/42 mmHg", consc: "Conscious, clammy, chest pain", threats: "Shock; myocardial ischaemia" } },
    req: [["expert", "Careful sedation or anaesthesia before cardioversion (conscious patient)", "sync"], ["sync", "Synchronised shock, up to three attempts", "tachy"], ["amio1020", "Amiodarone 300 mg IV over 10 to 20 min, or procainamide, then a further synchronised shock", "tachy"]],
    due: function (st) {
      var out = [], hadChance = (st.actionN || 0) >= 1 || st.checked;
      if (st.arrest) out.push(dueItem("shock", "Unsynchronised shock for this pulseless rhythm", "This is now a cardiac arrest. Review the immediate electrical treatment", "This is now a cardiac arrest. Have you thought about the immediate electrical treatment?", "alsPriority", "ALS: early defibrillation"));
      else if ((st.sync || 0) < 3 && hadChance) out.push(dueItem("sync", "Synchronised shock, up to three attempts", "Review urgent electrical treatment", "Have you thought about urgent electrical treatment?", "tachy", "Tachyarrhythmia: unstable, synchronised shock"));
      else if ((st.sync || 0) >= 3 && !st.did.amio1020 && !st.did.procain) out.push(dueItem("amio1020", "Amiodarone 300 mg IV over 10 to 20 min, or procainamide, then re-attempt cardioversion", "The shocks have not worked. Review the next drug step", "The shocks have not worked. Have you thought about the next drug step?", "tachy", "ALS: load then re-attempt cardioversion"));
      else if ((st.did.amio1020 || st.did.procain) && !st.did.syncAfterLoad) out.push(dueItem("sync", "A further synchronised shock after the antiarrhythmic load", "Review a further attempt at cardioversion", "Have you thought about a further attempt at cardioversion?", "tachy", "ALS: re-attempt electrical cardioversion"));
      return out;
    },
    step: function (a, st) {
      if (st.arrest) {
        if (a === "shock") { st.arrest = false; return O("ok", "s5_arrestShock", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 92 } }, phys: "shockVF", vit: { pulse: "Present", bp: "94/60 mmHg", consc: "Drowsy", threats: "Immediately post-ROSC" } }); }
        if (a === "sync") return O("bad", "a_sync");
        if (a === "cpr") return O("part", "s5_arrestCPR", { cprStart: true });
        return null;
      }
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "h20_assess"); }
      if (a === "expert") { st.expert = true; st.did.expert = 1; return O("ok", "s5_expert"); }
      if (a === "sync") {
        st.sync = (st.sync || 0) + 1;
        st.did.sync = 1;
        var v = st.expert ? "ok" : "part";
        if (st.did.amio1020 || st.did.procain) {
          st.did.syncAfterLoad = 1;
          var keysOk = st.expert ? "h20_syncOk" : ["s5_noSed", "h20_syncOk"];
          return O(v, keysOk, { end: true, rhythm: { gen: "sinus", opts: { rate: 90 } }, phys: "sync", vit: { pulse: "Present, regular", bp: "108/66 mmHg", consc: "Drowsy after sedation", threats: "None now" } });
        }
        if (st.sync > 3) return O("part", st.expert ? "h20_syncEarly4" : ["s5_noSed", "h20_syncEarly4"], { phys: "syncFail" });
        var k = st.sync === 3 ? "h20_sync3" : "h20_syncFail";
        return O(v, st.expert ? k : ["s5_noSed", k], { phys: "syncFail" });
      }
      if (a === "amio1020" || a === "procain") {
        if ((st.sync || 0) < 3) return O("part", "h10_amio");
        if (a === "amio1020") st.did.amio1020 = 1;
        if (a === "procain") { st.did.procain = 1; st.did.amio1020 = 1; }
        return O("ok", "h20_drug");
      }
      if (a === "amioInf" || a === "amio300") return O("part", "h10_amio");
      if (a === "shock") { st.arrest = true; return O("bad", "s5_unsync", { pulse: false, rhythm: { gen: "vf" }, phys: "ront", vit: { pulse: "Absent", bp: "Not recordable", consc: "Unresponsive", threats: "Cardiac arrest" } }); }
      if (a === "aden") return O("bad", "s5_aden");
      return null;
    } },

  { id: "h21", idleNudge: true, group: "Tachycardia", title: "Pre-excited atrial fibrillation",
    listTitle: "An irregular broad-complex tachycardia",
    blurb: "A young adult with palpitations and an irregular broad rhythm, looking reasonably well.",
    scene: "A 24-year-old with a history of an 'extra pathway' attends with sudden palpitations for 40 minutes. Alert and talking, no chest pain. Blood pressure is 108/70 mmHg. Monitoring and IV access are in place; defibrillator pads are on.",
    start: { rhythm: { gen: "pre_af", opts: { lo: 180, hi: 230 } }, pulse: true, vit: { pulse: "Present, irregular, rapid", bp: "108/70 mmHg", consc: "Alert, talking", threats: "None currently" } },
    req: [["procain", "Procainamide, or synchronised cardioversion, for atrial fibrillation with pre-excitation", "procain"]],
    due: function (st) {
      var out = [], hadChance = (st.actionN || 0) >= 1 || st.checked;
      if (st.arrest) out.push(dueItem("shock", "Unsynchronised shock for this pulseless rhythm", "This is now a cardiac arrest. Review the immediate electrical treatment", "This is now a cardiac arrest. Have you thought about the immediate electrical treatment?", "alsPriority", "ALS: early defibrillation"));
      else if (!st.did.procain && hadChance) out.push(dueItem("procain", "Procainamide, or synchronised cardioversion", "Review treatment of this irregular broad rhythm", "Have you thought about treatment of this irregular broad rhythm?", "procain", "Tachyarrhythmia: AF with pre-excitation, procainamide or cardioversion"));
      return out;
    },
    step: function (a, st) {
      if (st.arrest) {
        if (a === "shock") { st.arrest = false; return O("ok", "s5_arrestShock", { end: true, pulse: true, rhythm: { gen: "sinus", opts: { rate: 80 } }, phys: "shockVF", vit: { pulse: "Present", bp: "100/64 mmHg", consc: "Drowsy", threats: "Immediately post-ROSC" } }); }
        if (a === "sync") return O("bad", "a_sync");
        if (a === "cpr") return O("part", "s5_arrestCPR", { cprStart: true });
        return null;
      }
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "h21_assess"); }
      if (a === "expert") { st.expert = true; st.did.expert = 1; return O("ok", "s5_expert"); }
      if (a === "procain") {
        st.did.procain = 1;
        return O("ok", "h21_procain", { end: true, rhythm: { gen: "sinus", opts: { rate: 84 } }, vit: { pulse: "Present, regular", bp: "112/70 mmHg", threats: "None; now in sinus rhythm" } });
      }
      if (a === "sync") {
        st.sync++; st.did.sync = 1; st.did.procain = 1;
        var v = st.expert ? "ok" : "part", keys = st.expert ? "h21_sync" : ["s5_noSed", "h21_sync"];
        return O(v, keys, { end: true, rhythm: { gen: "sinus", opts: { rate: 82 } }, phys: "sync", vit: { pulse: "Present, regular", bp: "110/70 mmHg", consc: "Drowsy after sedation", threats: "None now" } });
      }
      if (a === "aden") return O("bad", "h21_aden");
      if (a === "verap") return O("bad", "h21_verap");
      if (a === "amio300" || a === "amioInf" || a === "amio1020") return O("part", "h21_aden");
      if (a === "shock") { st.arrest = true; return O("bad", "s5_unsync", { pulse: false, rhythm: { gen: "vf" }, phys: "ront", vit: { pulse: "Absent", bp: "Not recordable", consc: "Unresponsive", threats: "Cardiac arrest" } }); }
      return null;
    } },

  { id: "h22", idleNudge: true, group: "Tachycardia", title: "Known SVT with aberrant conduction",
    listTitle: "Regular broad-complex tachycardia in a patient with known SVT",
    blurb: "Palpitations in someone whose previous SVT ECGs already showed wide complexes.",
    scene: "A 29-year-old with known SVT attends with sudden palpitations. Alert and talking, no chest pain, no breathlessness. Blood pressure is 122/76 mmHg. Previous 12-leads recorded during SVT showed the same wide complexes. Monitoring and a large IV cannula are in place.",
    start: { rhythm: { gen: "vt" }, pulse: true, vit: { pulse: "Present, regular", bp: "122/76 mmHg", consc: "Alert, talking", threats: "None" } },
    req: [["vagal", "Vagal manoeuvres first, as for regular narrow-complex tachycardia", "narrow"], ["aden", "Adenosine 6 mg, then 12 mg, as for known SVT with aberrant conduction", "aden"]],
    due: function (st) {
      var out = [], hadChance = (st.actionN || 0) >= 1 || st.checked;
      if (!st.vagal && hadChance) out.push(dueItem("vagal", "Vagal manoeuvres first", "Review the first manoeuvres on this algorithm", "Have you thought about the first manoeuvres on this algorithm?", "narrow", "Tachyarrhythmia: vagal manoeuvres first"));
      if (st.vagal && st.aden === 0) out.push(dueItem("aden", "Adenosine 6 mg, then 12 mg", "The first manoeuvre has not worked. Review what the algorithm does next", "The first manoeuvre has not worked. Have you thought about what the algorithm does next?", "aden", "Tachyarrhythmia: if ineffective, adenosine"));
      if (st.aden === 1) out.push(dueItem("adenNext", "Complete adenosine treatment with the next dose", "Review whether that drug treatment is complete", "Have you thought about whether that drug treatment is complete?", "aden", "Tachyarrhythmia: adenosine 12 mg"));
      return out;
    },
    step: function (a, st) {
      if (a === "assess") { if (st.checked) return O("info", "a_assessAgain"); st.checked = true; return O("ok", "h22_assess"); }
      if (a === "vagal") { if (st.vagal) return O("info", "s4_vagalAgain"); st.vagal = true; st.did.vagal = 1; return O("ok", "s4_vagal", { phys: "vagal" }); }
      if (a === "aden") {
        return takeAden(st, adenDoseOf(st._act && st._act.raw, st), {
          needVagal: true, earlyKey: "s4_adenEarly",
          doses: {
            6: { key: "s4_aden6", phys: "adenFail" },
            12: { key: "s4_aden12", phys: "aden", end: true, rhythm: { gen: "sinus", opts: { rate: 84 } }, vit: { threats: "None; now in sinus rhythm" } },
            18: { key: "s4_aden12", phys: "aden", end: true, rhythm: { gen: "sinus", opts: { rate: 84 } }, vit: { threats: "None; now in sinus rhythm" } }
          }
        });
      }
      if (a === "sync" || a === "amioInf" || a === "amio1020" || a === "amio300" || a === "procain") {
        st.did.sync = 1;
        return O("part", "h22_partVT", { end: true, rhythm: { gen: "sinus", opts: { rate: 84 } }, vit: { threats: "None; now in sinus rhythm" } });
      }
      if (a === "shock") { return O("bad", "s5_unsync", { pulse: false, rhythm: { gen: "vf" }, phys: "ront", end: true, vit: { pulse: "Absent", bp: "Not recordable", consc: "Unresponsive", threats: "Cardiac arrest" } }); }
      if (a === "observe") return O("bad", "s4_observe");
      return null;
    } }
);

var HIDDEN_SCENARIOS = HIDDEN_SCENARIOS || [];
var ALL_SCENARIOS = SCENARIOS.concat(HIDDEN_SCENARIOS);
var SCN = {}; ALL_SCENARIOS.forEach(function (s) { SCN[s.id] = s; });
var LIST_GROUP_ORDER = ["Cardiac arrest", "Bradycardia", "Tachycardia", "Peri-arrest"];
var LIST_ORDER = ["s1", "h3", "h13", "h4", "h14", "h9", "h18", "s2", "h1", "h2", "h15", "h16", "h17", "s3", "h8", "h11", "h12", "s4", "h5", "h22", "s5", "h7", "h19", "h20", "h6", "h21", "s6", "h10"];
function listTitle(s) { return (s && (s.listTitle || s.title)) || ""; }
function listGroup(s) { return (s && (s.listGroup || s.group)) || ""; }
function listedScenarios() {
  return LIST_ORDER.map(function (id) { return SCN[id]; }).filter(Boolean);
}
function listIndex(s) { return listedScenarios().indexOf(s); }

/* Generic outcomes when a scenario script does not handle an action */
function mentionsIndicatedShock(id, label) {
  if (id === "sync" || id === "shock") return true;
  return /synchronised (shock|cardioversion)|unsynchronised shock/i.test(String(label || ""));
}
function electricalShockIndicated(st) {
  if (!st) return false;
  var gen = (st.rhythm && st.rhythm.gen) || "";
  var shockable = gen === "vf" || gen === "vt" || gen === "torsades";
  if (!st.pulse && shockable) return true;
  if (st.arrest && shockable) return true;
  var req = (st.scn && st.scn.req) || [];
  var i, due;
  for (i = 0; i < req.length; i++) {
    if (mentionsIndicatedShock(req[i][0], req[i][1])) return true;
  }
  if (st.scn && typeof st.scn.due === "function") {
    due = st.scn.due(st) || [];
    for (i = 0; i < due.length; i++) {
      if (mentionsIndicatedShock(due[i].id, due[i].name)) return true;
    }
  }
  return false;
}
function handleDefibSafety(a, st) {
  var indicated = electricalShockIndicated(st);
  if (a === "charge") {
    if (!indicated) return O("bad", "a_chargePulse");
    st.charged = true;
    return O("ok", st.cpr ? "a_chargeCpr" : "a_charge");
  }
  if (a === "clear") {
    if (!indicated) return O("bad", "a_clearPulse");
    st.cleared = true;
    if (st.cpr) return O("ok", "a_clear", { cprStop: true });
    return O("ok", st.pulse ? "a_clearReady" : "a_clear", { cprStop: true });
  }
  return null;
}
function applyDefibSafetyToShock(o, st) {
  if (!o) return o;
  // A shock while compressions are still ongoing is not delivered. detectHarm ends shockable cases.
  if (st.cpr && o.keys && o.keys.indexOf("a_shockMid") !== -1) return o;
  var delivered = o.v === "ok" || o.v === "part" || o.v === "late";
  if (delivered && !st.charged) {
    o.v = "part";
    o.keys = (o.keys || []).concat(["a_shockNoSeq"]);
  }
  if (delivered) {
    st.charged = false;
    st.cleared = false;
  }
  return o;
}
function genericOutcome(a, st) {
  if (a === "charge" || a === "clear") return handleDefibSafety(a, st);
  if (!st.pulse) {
    var m = { atro: "a_atro", aden: "a_aden", vagal: "a_vagal", sync: "a_sync", pace: "a_pace", mg: "a_mg", bicarb: "a_bicarb", calcium: "a_calcium", fluid: "a_fluid", observe: "a_observe", amio150: "a_amio150", amio300: "a_amio300", adr: "s1_adrEarly", ff: "a_ffNoCPR", decompress: "a_decompress", amioInf: "a_amioInf", amio1020: "a_amioInf", adrInf: "a_adrInf", iso: "a_iso", procain: "a_procain", verap: "a_verap", kcl: "a_kcl", lido100: "a_lido", lido50: "a_lido", fibrin: "a_fibrin", padsAP: "a_padsAP", oxygen: "a_oxygen", pericardiocentesis: "a_pericardiocentesis", resternotomy: "a_resternotomy" };
    if (a === "expert") return O("ok", "a_expert");
    if (a === "causes") return O("ok", "a_causes");
    if (a === "cpr") { if (st.cpr) return O("info", "a_cprRunning"); return O("ok", "s1_cpr", { cprStart: true }); }
    if (a === "shock" && st.cpr) return O("bad", "a_shockMid");
    if (a === "assess") return O("info", "a_assessAgain");
    if (a === "ff") {
      if (!st.cpr) return O("info", "a_ffNoCPR");
      st.cycles = (st.cycles || 0) + 1; st.monitorReady = true;
      return O("ok", "n_skip", { cprStop: true, cycleCheck: true });
    }
    return O("bad", m[a] || "a_observe");
  }
  var p = { cpr: "p_cpr", shock: "p_shock", adr: "p_adr", amio300: "p_amio", amio150: "p_amio150", atro: "p_atro", aden: "p_aden", vagal: "p_vagal", sync: "p_sync", pace: "p_pace", mg: "p_mg", fluid: "p_fluid", bicarb: "p_bicarb", calcium: "p_calcium", observe: "p_observe", expert: "p_expert", causes: "p_causes", ff: "a_ffNoCPR", assess: "a_assessAgain", decompress: "p_decompress", amioInf: "p_amioInf", amio1020: "p_amioInf", adrInf: "p_adrInf", iso: "p_iso", procain: "p_procain", verap: "p_verap", kcl: "p_kcl", lido100: "p_lido", lido50: "p_lido", fibrin: "p_fibrin", padsAP: "p_padsAP", oxygen: "p_oxygen", pericardiocentesis: "p_pericardiocentesis", resternotomy: "p_resternotomy" };
  var v = (a === "expert" || a === "causes") ? "ok" : (a === "ff" || a === "assess") ? "info" : "bad";
  return O(v, p[a]);
}

/* Register scenario flags with the page review list */
(function () {
  var nS = 0, sid = function () { nS++; return "S" + String(nS).padStart(2, "0"); };
  Object.keys(TXT).forEach(function (k) {
    if (!TXT[k].flag) return;
    var m = k.match(/^(s\d+|h\d+)_/); var w = (m && SCN[m[1]]) ? SCN[m[1]].title : "Scenarios (shared)";
    FLAGS.push({ id: sid(), where: w + " · " + TXT[k].guideline, text: TXT[k].full, key: k });
  });
  ALL_SCENARIOS.forEach(function (sc) {
    sc.req.forEach(function (r, i) { FLAGS.push({ id: sid(), where: sc.title + " · debrief key step", text: r[1] + ".", key: "req:" + sc.id + ":" + i }); });
  });
  renderVerTable();
})();

/* ===== Animated monitor ===== */
function prefersReduced() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
function Monitor(host) {
  this.host = host; host.innerHTML = "";
  this.win = host.clientWidth && host.clientWidth < 620 ? 6 : 10;
  var W = PAD + this.win * MMS + 2, id = "mon" + (++uidN);
  this.W = W;
  var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Live monitor, lead II. Rhythm changes are announced as text.", preserveAspectRatio: "xMinYMin meet", "class": "mon-svg" });
  var defs = el("defs", {}, svg);
  var p1 = el("pattern", { id: id + "m", width: 1, height: 1, patternUnits: "userSpaceOnUse" }, defs);
  el("path", { d: "M1 0 V1 M0 1 H1", stroke: "var(--ecg-minor)", "stroke-width": 0.09, fill: "none" }, p1);
  var p5 = el("pattern", { id: id + "M", width: 5, height: 5, patternUnits: "userSpaceOnUse" }, defs);
  el("rect", { width: 5, height: 5, fill: "url(#" + id + "m)" }, p5);
  el("path", { d: "M5 0 V5 M0 5 H5", stroke: "var(--ecg-major)", "stroke-width": 0.26, fill: "none" }, p5);
  var cn = el("clipPath", { id: id + "cn" }, defs); this.cn = el("rect", { x: 0, y: 0, width: W, height: H }, cn);
  var co = el("clipPath", { id: id + "co" }, defs); this.co = el("rect", { x: W, y: 0, width: 0, height: H }, co);
  el("rect", { x: 0, y: 0, width: W, height: H, fill: "var(--ecg-paper)" }, svg);
  el("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#" + id + "M)" }, svg);
  el("path", { "class": "ecg-cal", d: "M1 " + BASE + " H2.5 V" + (BASE - 10) + " H7.5 V" + BASE + " H8" }, svg);
  this.pOld = el("path", { "class": "ecg-trace", "clip-path": "url(#" + id + "co)" }, svg);
  this.pNew = el("path", { "class": "ecg-trace", "clip-path": "url(#" + id + "cn)" }, svg);
  this.head = el("circle", { "class": "mon-head", r: 0.9, cx: PAD, cy: BASE }, svg);
  this.tag = el("text", { "class": "ann-text mon-tag", x: PAD + 1, y: 4 }, svg);
  host.appendChild(svg);
  this.t = 0; this.cur = null; this.old = null; this.raf = 0; this.running = false; this.gen = null;
}
Monitor.prototype.build = function (spec, cpr, seed) {
  var s = generate(spec.gen, seed, spec.opts || {});
  var pts = s.pts;
  if (cpr) pts = pts.map(function (p) { var ph = (p[0] * 1.8) % 1, art = ph < 0.5 ? Math.pow(Math.sin(ph * 2 * Math.PI), 2) : 0; return [p[0], p[1] * 0.6 + 1.1 * art - 0.25]; });
  return { pts: pts, s: s };
};
Monitor.prototype.set = function (spec, cpr, keepDrawn) {
  this.spec = spec; this.cprOn = cpr;
  var b = this.build(spec, cpr, Math.floor(Math.random() * 2147483647)), t = this.t;
  this.lastSig = b.s;
  if (keepDrawn && this.cur && this.running) this.cur = this.cur.filter(function (p) { return p[0] < t; }).concat(b.pts.filter(function (p) { return p[0] >= t; }));
  else this.cur = b.pts;
  this.tag.textContent = cpr ? "Compressions in progress: artefact on the trace" : "";
  this.draw();
  return b.s;
};
Monitor.prototype.draw = function () {
  var win = this.win, f = function (pts) { return pts ? pathFrom(pts.filter(function (p) { return p[0] <= win; }), PAD) : ""; };
  this.pNew.setAttribute("d", f(this.cur)); this.pOld.setAttribute("d", f(this.old));
  this.frame();
};
Monitor.prototype.frame = function () {
  if (!this.running) { this.cn.setAttribute("width", this.W); this.co.setAttribute("width", 0); this.head.style.display = "none"; return; }
  var x = PAD + this.t * MMS, gap = 0.4 * MMS;
  this.cn.setAttribute("width", x);
  this.co.setAttribute("x", x + gap); this.co.setAttribute("width", Math.max(0, this.W - x - gap));
  var pts = this.cur, k = Math.min(pts.length - 1, Math.max(0, Math.round(this.t * FS)));
  this.head.style.display = ""; this.head.setAttribute("cx", x); this.head.setAttribute("cy", BASE - pts[k][1] * GAIN);
};
Monitor.prototype.start = function () {
  if (prefersReduced()) { this.running = false; this.frame(); return; }
  if (this.running) return;
  this.running = true; var self = this, last = performance.now();
  function tick(now) {
    if (!self.running) return;
    self.t += Math.min(0.1, (now - last) / 1000); last = now;
    if (self.t >= self.win) { self.t -= self.win; self.old = self.cur; self.cur = self.build(self.spec, self.cprOn, Math.floor(Math.random() * 2147483647)).pts; self.draw(); }
    self.frame();
    self.raf = requestAnimationFrame(tick);
  }
  this.raf = requestAnimationFrame(tick);
};
Monitor.prototype.stop = function () { this.running = false; cancelAnimationFrame(this.raf); this.frame(); };

/* ===== Scenario runtime ===== */
var SIM = null, simTimer = null, monitor = null;
var VERD = { ok: ["\u2713", "Correct"], late: ["\u25C6", "Correct but late"], bad: ["\u2717", "Not quite"], part: ["\u25D0", "Partly right"], info: ["i", "Noted"] };
function mmss(sec) { sec = Math.max(0, Math.round(sec)); return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0"); }
function srcOf(k) { return SRC[TXT[k].src]; }
function srcHTML(k) { return VER[k] ? verQuotes(k) : esc(srcOf(k)); }
function sourceLinesBlock(inner) {
  var text = String(inner || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return "<p class='scn-src scn-quotes'><strong>Source lines:</strong> " + inner + "</p>";
}
function normLine(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").replace(/[.:;]+$/g, "").trim().toLowerCase();
}
function sameLine(a, b) {
  a = normLine(a); b = normLine(b);
  return !!(a && b && (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0));
}
function txtHTML(k) { return esc(TXT[k].full) + verTag(k); }

var HINTS_KEY = "anaesthetic-physiology-scn-hints";
function hintsOn() { try { return localStorage.getItem(HINTS_KEY) === "on"; } catch (e) { return false; } }
function setHints(on) {
  try { localStorage.setItem(HINTS_KEY, on ? "on" : "off"); } catch (e) {}
  syncHintsToggle();
  if (SIM && SIM.lastFb) {
    renderFeedback(SIM.lastFb.o, SIM.lastFb.changed);
    announceFeedback(SIM.lastFb.o);
  }
}
function syncHintsToggle() {
  var b = $("scnHints"); if (!b) return;
  var on = hintsOn();
  b.setAttribute("aria-checked", on ? "true" : "false");
  b.classList.toggle("is-on", on);
  var st = $("scnHintsState"); if (st) st.textContent = on ? "On" : "Off";
}
function physForLive(key) {
  if (!key) return "";
  if (hintsOn()) return PHYS[key] || "";
  if (Object.prototype.hasOwnProperty.call(PHYS_LIVE, key)) return PHYS_LIVE[key] || "";
  return PHYS[key] || "";
}
function liveFbParts(o) {
  var parts = [];
  if (o.event) parts.push(o.event);
  if (o.v === "part" || o.v === "bad") {
    var why = typeof firstWhyWrong === "function" ? firstWhyWrong(o) : "";
    if (why) parts.push(why);
  }
  return parts;
}
function announceFeedback(o) {
  if (typeof MODEL_RUNNING !== "undefined" && MODEL_RUNNING) return;
  var bits = [];
  function push(s) {
    if (!s) return;
    var raw = String(s).trim();
    if (!raw) return;
    if (bits.some(function (b) { return sameLine(b, raw); })) return;
    bits.push(raw);
  }
  push(o.verdictText ? o.verdictText + "." : (o.label + ": " + VERD[o.v][1] + "."));
  if (o.regLine) push(o.regLine);
  else if (o.nudgeText) push(o.nudgeText);
  if (hintsOn()) {
    if (o.changeAnnounce) push(o.changeAnnounce + ".");
    var k = o.keys && o.keys[o.keys.length - 1], i;
    if (o.keys) {
      for (i = o.keys.length - 1; i >= 0; i--) {
        if (TXT[o.keys[i]] && TXT[o.keys[i]].full && !isNudgeKey(o.keys[i]) && o.keys[i] !== "n_reg") { k = o.keys[i]; break; }
      }
    }
    if (k && TXT[k] && TXT[k].full && !isNudgeKey(k) && k !== "n_reg") push(TXT[k].full);
  } else {
    liveFbParts(o).forEach(push);
  }
  $("scnLive").textContent = bits.join(" ");
}
/* ===== Overdue key steps, escalating nudges, and Call the reg ===== */
var MAX_REVIEWS = 8, MAX_ACTIONS = 24, REG_PENALTY = 0.5;
/* After the last required step is due or done, the usual 8-review / 24-action cap applies from that point.
   Until then the cap is a safety ceiling of (minimum path length + the same allowance), so a late step such as
   amiodarone 150 mg after five shocks can still be reached. */
function reqIds(scn) { return ((scn && scn.req) || []).map(function (r) { return r[0]; }); }
function hasReq(scn, id) { return reqIds(scn).indexOf(id) >= 0; }
function minPathReviews(scn) {
  if (scn && scn.reviewCap) return scn.reviewCap;
  if (hasReq(scn, "amio150")) return 5;
  if (hasReq(scn, "amio300") || (hasReq(scn, "shock") && hasReq(scn, "adr"))) return 3;
  if (hasReq(scn, "shock") || hasReq(scn, "cpr") || hasReq(scn, "adr")) return 2;
  return 1;
}
function minPathActions(scn) {
  if (scn && scn.actionCap) return scn.actionCap;
  if (hasReq(scn, "amio150")) return 20;
  if (hasReq(scn, "amio300")) return 12;
  if (hasReq(scn, "shock") || hasReq(scn, "cpr")) return 10;
  return 6;
}
function reviewSafetyCap(st) { return Math.max(MAX_REVIEWS, minPathReviews(st.scn) + MAX_REVIEWS); }
function actionSafetyCap(st) { return Math.max(MAX_ACTIONS, minPathActions(st.scn) + MAX_ACTIONS); }
function noteDueSteps(st) {
  if (!st) return;
  st.wasDue = st.wasDue || {};
  (outstandingSteps(st) || []).forEach(function (d) { if (d && d.id) st.wasDue[d.id] = 1; });
  if (allRequiredAvailable(st) && st.reviewsWhenReady == null) st.reviewsWhenReady = st.reviews || 0;
  if (allRequiredAvailable(st) && st.actionsWhenReady == null) st.actionsWhenReady = st.actionN || 0;
}
function stepWasAvailable(st, id) {
  if (!st || !id) return false;
  if (st.did && st.did[id]) return true;
  if (st.wasDue && st.wasDue[id]) return true;
  if ((st.endedDue || []).some(function (d) { return d.id === id; })) return true;
  return (outstandingSteps(st) || []).some(function (d) { return d.id === id; });
}
function allRequiredAvailable(st) {
  var req = (st && st.scn && st.scn.req) || [];
  if (!req.length) return true;
  return req.every(function (r) { return stepWasAvailable(st, r[0]); });
}
function shouldCapReviews(st) {
  if ((st.reviews || 0) >= reviewSafetyCap(st)) return true;
  if (allRequiredAvailable(st) && st.reviewsWhenReady != null) {
    return (st.reviews || 0) >= st.reviewsWhenReady + MAX_REVIEWS;
  }
  return false;
}
function shouldCapActions(st) {
  if ((st.actionN || 0) >= actionSafetyCap(st)) return true;
  if (allRequiredAvailable(st) && st.actionsWhenReady != null) {
    return (st.actionN || 0) >= st.actionsWhenReady + MAX_ACTIONS;
  }
  return false;
}
function classifyReqSteps(st) {
  var missed = [], notReached = [], seen = {};
  noteDueSteps(st);
  ((st.scn && st.scn.req) || []).forEach(function (r) {
    if (st.did && st.did[r[0]]) return;
    seen[r[0]] = 1;
    if (stepWasAvailable(st, r[0])) missed.push(r);
    else notReached.push(r);
  });
  (st.endedDue || []).forEach(function (d) {
    if (!d || !d.id || seen[d.id] || (st.did && st.did[d.id])) return;
    seen[d.id] = 1;
    missed.push([d.id, d.name, d.src, d.guideline]);
  });
  return { missed: missed, notReached: notReached };
}

var CYCLE_CHECK = { s1_check: 1, s1_checkNoDrugs: 1, s1_checkOrganised: 1, s2_check: 1, s2_checkAsys: 1, s2_checkOrganised: 1 };

function dueItem(id, name, category, reg, src, guideline) {
  return { id: id, name: name, category: category, reg: reg, src: src, guideline: guideline || "" };
}
function outstandingSteps(st) {
  if (!st || !st.scn) return [];
  if (typeof st.scn.due === "function") return st.scn.due(st) || [];
  var id = st.scn.id, out = [], hadChance = (st.actionN || 0) >= 1 || st.checked || st.shocks > 0 || st.cpr;
  if (id === "s1") {
    if (st.shocks === 0 && (st.cpr || (st.reviews || 0) > 0 || (st.actionN || 0) >= 2)) {
      out.push(dueItem("shock", "Shock VF without delay", "Reconsider how this rhythm is treated electrically", "Have you thought about how this rhythm is treated electrically?", "alsPriority", "ALS: shockable, shock first"));
    }
    if (st.shocks >= 3 && !st.adrAfter3) {
      out.push(dueItem("adr", "Adrenaline 1 mg after the third shock", "Review drug timing after the third shock", "Have you thought about your drugs after the third shock?", "adrShock", "ALS: adrenaline after 3 shocks"));
    }
    if (st.shocks >= 3 && !st.amio) {
      out.push(dueItem("amio300", "Amiodarone 300 mg after the third shock", "Review drug timing after the third shock", "Have you thought about your drugs after the third shock?", "amio", "ALS: amiodarone after 3 shocks"));
    }
    if (st.adrAfter3 && st.amio && st.adrT.length && repeatIntervalWindow(st.clock - st.adrT[st.adrT.length - 1]) !== "soon") {
      out.push(dueItem("adrRepeat", "Repeat adrenaline 1 mg every 3 to 5 minutes", "Review drug timing later in the arrest", "Have you thought about whether any drugs are due again?", "adrShock", "ALS: adrenaline every 3 to 5 min"));
    }
  } else if (id === "s2") {
    if (!st.did.adr && (st.cpr || st.checked || (st.reviews || 0) > 0 || (st.actionN || 0) >= 2)) {
      out.push(dueItem("adr", "Adrenaline 1 mg as soon as possible", "Review drug timing in this non-shockable arrest", "In a non-shockable arrest, have you thought about your drugs?", "adrNon", "ALS: non-shockable, adrenaline as soon as possible"));
    }
    if (st.did.adr && st.adrT.length && repeatIntervalWindow(st.clock - st.adrT[st.adrT.length - 1]) !== "soon") {
      out.push(dueItem("adrRepeat", "Repeat adrenaline 1 mg every 3 to 5 minutes", "Review drug timing later in the arrest", "Have you thought about whether any drugs are due again?", "adrNon", "ALS: adrenaline every 3 to 5 min"));
    }
    if ((!st.did.causes || !st.did.fluid) && (st.cpr || st.checked || (st.actionN || 0) >= 2)) {
      out.push(dueItem(st.did.causes ? "fluid" : "causes", st.did.causes ? "IV fluid for hypovolaemia" : "Identify the reversible cause (hypovolaemia)", "Think about reversible causes", "Have you thought about reversible causes?", st.did.causes ? "fluid" : "causes", st.did.causes ? "ALS: fluids only if arrest caused by hypovolaemia" : "ALS: identify and treat reversible causes"));
    }
  } else if (id === "s3") {
    var s3interim = !!(st.paced || st.did.adrInf || st.did.iso);
    if (!st.did.atro && !s3interim && hadChance) {
      out.push(dueItem("atro", "Atropine 500 micrograms IV, repeat to a maximum of 3 mg", "Review the first drug on this algorithm", "Have you thought about the first drug on this algorithm?", "brady", "Bradyarrhythmia: life-threatening features, give atropine"));
    }
    /* Do not treat pacing as overdue while atropine is still being given within the 3 mg maximum. */
    if (!s3interim && st.atro >= 6) {
      out.push(dueItem("pace", "Interim measures: transcutaneous pacing, or an isoprenaline or adrenaline infusion", "Atropine has reached the 3 mg maximum and has not changed things. Review other interim measures", "The first drug has not changed things. Have you thought about other interim measures?", "pacing", "Bradyarrhythmia: interim measures"));
    }
    if (s3interim && !st.did.expert) {
      out.push(dueItem("expert", "Seek expert help and consider transvenous pacing", "Think about who else needs to be involved", "Have you thought about who else needs to be involved?", "brady", "Bradyarrhythmia: seek expert help, consider transvenous pacing"));
    }
  } else if (id === "s4") {
    if (!st.vagal && st.aden === 0 && hadChance) {
      out.push(dueItem("vagal", "Vagal manoeuvres first", "Review the first manoeuvres on this algorithm", "Have you thought about the first manoeuvres on this algorithm?", "narrow", "Tachyarrhythmia: vagal manoeuvres first"));
    }
    if (st.vagal && st.aden === 0) {
      out.push(dueItem("aden", "Adenosine 6 mg, then 12 mg", "The first manoeuvre has not worked. Review what the algorithm does next", "The first manoeuvre has not worked. Have you thought about what the algorithm does next?", "aden", "Tachyarrhythmia: if ineffective, adenosine"));
    }
    if (st.aden === 1) {
      out.push(dueItem("aden2", "Complete adenosine treatment with the next dose", "Review whether that drug treatment is complete", "Have you thought about whether that drug treatment is complete?", "aden", "Tachyarrhythmia: adenosine 12 mg"));
    }
  } else if (id === "s5") {
    if (st.arrest) {
      out.push(dueItem("shock", "Unsynchronised shock for this pulseless rhythm", "This is now a cardiac arrest. Review the immediate electrical treatment", "This is now a cardiac arrest. Have you thought about the immediate electrical treatment?", "alsPriority", "ALS: early defibrillation"));
    } else if (st.sync === 0 && hadChance) {
      out.push(dueItem("sync", "Synchronised shock (up to 3 attempts)", "Review urgent electrical treatment", "Have you thought about urgent electrical treatment?", "tachy", "Tachyarrhythmia: unstable, synchronised shock"));
    } else if (st.sync === 1) {
      out.push(dueItem("sync2", "A further synchronised shock (up to 3 attempts)", "The first electrical attempt has not worked. Review whether to try again", "The first electrical attempt has not worked. Have you thought about a further attempt?", "sync", "Tachyarrhythmia: synchronised shock, up to 3 attempts"));
    }
  } else if (id === "s6") {
    if (st.arrest) {
      out.push(dueItem("shock", "Unsynchronised shock for this pulseless rhythm", "This is now a cardiac arrest. Review the immediate electrical treatment", "This is now a cardiac arrest. Have you thought about the immediate electrical treatment?", "alsPriority", "ALS: early defibrillation"));
    } else {
      if (!st.mg && hadChance) {
        out.push(dueItem("mg", "Magnesium 8 mmol IV over 10 min", "Review the first-line treatment for this rhythm", "Have you thought about the first-line treatment for this rhythm?", "tdp", "Tachyarrhythmia: Mg2+ 8 mmol IV over 10 min"));
      }
      if (!st.cause && hadChance) {
        out.push(dueItem("causes", "Identify reversible causes (low potassium, QT-prolonging drugs)", "Think about reversible causes", "Have you thought about reversible causes?", "tdpCauses", "Tachyarrhythmia: identify and treat reversible causes"));
      }
    }
  }
  return out;
}
var MODEL_RUNNING = false;
function uniqueField(due, field) {
  var seen = {}, out = [];
  due.forEach(function (d) { if (d[field] && !seen[d[field]]) { seen[d[field]] = 1; out.push(d[field]); } });
  return out;
}
function isCycleCheck(o) {
  return !!(o && (o.cycleCheck || (o.keys && o.keys.some(function (k) { return CYCLE_CHECK[k] || k === "n_skip"; }))));
}
function copyDueItems(list) {
  return (list || []).map(function (d) {
    return { id: d.id, name: d.name, category: d.category, src: d.src, guideline: d.guideline };
  });
}
function snapshotDue() {
  if (!SIM) return;
  var due = outstandingSteps(SIM) || [];
  SIM.dueItemsBeforeAction = copyDueItems(due);
  SIM.dueBeforeAction = due.map(function (d) { return d.id; });
}
function stillDueSteps(due) {
  var before = (SIM && SIM.dueBeforeAction) || [];
  return (due || []).filter(function (d) { return before.indexOf(d.id) >= 0; });
}
function isNudgeKey(k) {
  return !!(k && (k.indexOf("n_due") === 0 || k === "n_capEnd"));
}
function overdueNudgeCopy(n, cats) {
  if (n >= 3) {
    return {
      key: "n_dueEnd",
      verdict: "Scenario ended: key step missed",
      text: (TXT.n_dueEnd && TXT.n_dueEnd.full) || "Scenario ended: key step missed."
    };
  }
  if (n === 2) {
    var full = (TXT.n_due2 && TXT.n_due2.full) || "Something in the algorithm is still overdue. Review the category below, then act.";
    var cat = (cats || []).filter(Boolean).join(" ");
    if (cat && !sameLine(full, cat) && normLine(full).indexOf(normLine(cat)) < 0) {
      full = full + (/\.$/.test(full) ? " " : ". ") + cat;
    }
    return { key: "n_due2", verdict: "Something in the algorithm is overdue", text: full, cats: cats };
  }
  return {
    key: "n_due1",
    verdict: "Something in the algorithm is overdue",
    text: (TXT.n_due1 && TXT.n_due1.full) || "Something in the algorithm is overdue. A key step has not been done yet."
  };
}
function actionMatchesDue(a, id) {
  if (!a || !id) return false;
  if (a === id) return true;
  if (a === "aden" && (id === "aden2" || id === "adenNext")) return true;
  if (a === "adr" && id === "adrRepeat") return true;
  if (a === "sync" && id === "sync2") return true;
  if ((a === "adrInf" || a === "iso") && id === "pace") return true;
  if (a.indexOf("cause:") === 0 && id === "causes") return true;
  return false;
}
function actionClearsDue(a) {
  return ((SIM && SIM.dueBeforeAction) || []).some(function (id) { return actionMatchesDue(a, id); });
}
function preparingDueShock(a, due) {
  if (a !== "charge" && a !== "clear") return false;
  return (due || []).some(function (d) { return d && (d.id === "sync" || d.id === "sync2" || d.id === "shock"); });
}
function isZeroTimeRequest(a, o) {
  if (!a) return false;
  if (o && o.notAction) return true;
  if (a === "nibp" || a === "ask" || a.indexOf("ask:") === 0) return true;
  return false;
}
function applyReview(a, o) {
  if (!SIM || o.end) return o;
  if (a !== "skip" && !o.notAction && !isZeroTimeRequest(a, o)) SIM.actionN = (SIM.actionN || 0) + 1;
  else if (o.forceReview) { /* skip time can trigger an overdue review without counting as an action */ }
  else return o;
  if (isCycleCheck(o)) noteCycleCheck(SIM, o);
  var due = outstandingSteps(SIM);
  noteDueSteps(SIM);
  var stillDue = stillDueSteps(due);
  var didDueStep = actionClearsDue(a);
  var preparingShock = preparingDueShock(a, stillDue);
  if (didDueStep || preparingShock || !stillDue.length) SIM.idleSinceDue = 0;
  var review = isCycleCheck(o) || !!o.forceReview || (a === "assess" && o.keys && o.keys[0] === "a_assessAgain");
  if (!review && stillDue.length && !didDueStep && !preparingShock && !isZeroTimeRequest(a, o) && SIM.scn.idleNudge) {
    SIM.idleSinceDue = (SIM.idleSinceDue || 0) + 1;
    if (SIM.idleSinceDue >= 3) { review = true; SIM.idleSinceDue = 0; }
  } else if (!stillDue.length || didDueStep || preparingShock) {
    SIM.idleSinceDue = 0;
  }
  if (review) {
    SIM.reviews = (SIM.reviews || 0) + 1;
    if (isCycleCheck(o) && missedFirstShockNow(SIM)) {
      var shockLine = "A defibrillation shock was needed before the first 2-minute rhythm check.";
      o.nudge = "shock";
      o.nudgeText = shockLine;
      o.separateNudge = { n: "shock", text: shockLine, key: "n_missedShock", verdict: "Not quite", due: [{ id: "shock", name: "Shock without delay" }] };
      SIM.endedDue = [dueItem("shock", "the first shock", "Reconsider how this rhythm is treated electrically", "", "alsPriority", "ALS: shockable, shock first")];
      if (hintsOn()) {
        SIM.shockMissNudged = true;
      } else {
        o.end = true;
        o.endReason = "missedShock";
        o.v = "bad";
        o.verdictText = "Scenario ended: the first shock was missed";
      }
    }
    var missedDue = endingDueSteps(SIM, stillDue);
    if (!o.end && o.nudge !== "shock") {
      if (!stillDue.length || didDueStep) {
        SIM.nudgeStreak = 0;
      } else if (missedDue.length) {
        SIM.nudgeStreak = (SIM.nudgeStreak || 0) + 1;
        SIM.endedDue = missedDue;
        due = missedDue;
        var n = SIM.nudgeStreak >= 3 ? 3 : SIM.nudgeStreak;
        var copy = overdueNudgeCopy(n, n === 2 ? uniqueField(missedDue, "category") : []);
        o.nudge = n;
        o.nudgeText = copy.text;
        o.nudgeCats = copy.cats || o.nudgeCats;
        o.separateNudge = { n: n, text: copy.text, key: copy.key, verdict: copy.verdict, due: copyDueItems(missedDue) };
        if (n >= 3) {
          o.end = true;
          o.endReason = "missed";
        }
      } else if (stillDue.length && !didDueStep) {
        var copyR = overdueNudgeCopy(1, []);
        o.nudge = 1;
        o.nudgeText = copyR.text;
        o.separateNudge = { n: 1, text: copyR.text, key: copyR.key, verdict: copyR.verdict, due: copyDueItems(stillDue) };
      }
    }
    noteDueSteps(SIM);
    due = outstandingSteps(SIM);
    if (!o.end && shouldCapReviews(SIM)) {
      o.keys = o.keys.concat("n_capEnd");
      o.nudge = "cap";
      o.nudgeText = "Scenario ended: too many cycles without a resolution.";
      o.verdictText = "Scenario ended: too many cycles without a resolution";
      o.v = "bad";
      o.end = true;
      o.endReason = "cap";
      if (due.length) SIM.endedDue = due;
    }
  }
  noteDueSteps(SIM);
  if (!o.end && shouldCapActions(SIM)) {
    o.keys = o.keys.concat("n_capEnd");
    o.nudge = "cap";
    o.nudgeText = "Scenario ended: too many cycles without a resolution.";
    o.verdictText = "Scenario ended: too many cycles without a resolution";
    o.v = "bad";
    o.end = true;
    o.endReason = "cap";
    due = outstandingSteps(SIM);
    if (due.length) SIM.endedDue = due;
  }
  return o;
}
function callReg() {
  if (!SIM || SIM.done) return;
  var due = outstandingSteps(SIM);
  SIM.regCalls = (SIM.regCalls || 0) + 1;
  var line = due.length ? "Reg: " + uniqueField(due, "reg").join(" ") : "Reg: I am not seeing an overdue step just now. Keep working through the algorithm.";
  var o = { v: "info", keys: ["n_reg"], label: "Call the reg", isReg: true, regLine: line, nudgeText: line };
  o.t = SIM.clock;
  logEvent(o, "Call the reg");
  logEvent(null, line);
  renderFeedback(o, false);
  announceFeedback(o);
  if (window.innerWidth < 900) $("scnFeedback").scrollIntoView({ block: "start", behavior: prefersReduced() ? "auto" : "smooth" });
}

var lastScn = null;
var CHALLENGE_BEST_KEY = "physioResusChallengeBest";
var challenge = { on: false, score: 0, justEnded: false, lastScore: 0 };
function challengeBest() {
  var n = 0;
  try { n = parseInt(localStorage.getItem(CHALLENGE_BEST_KEY) || "0", 10) || 0; } catch (e) {}
  if (isNaN(n) || n < 0) n = 0;
  return n;
}
function saveChallengeBest(n) {
  try { localStorage.setItem(CHALLENGE_BEST_KEY, String(n)); } catch (e) {}
}
function startChallenge() {
  challenge.on = true;
  challenge.score = 0;
  challenge.justEnded = false;
  challenge.lastScore = 0;
  randomScenario();
}
function stopChallenge(keepLast) {
  if (keepLast) challenge.lastScore = challenge.score;
  challenge.on = false;
  challenge.justEnded = true;
}
function isChallengeFail(reason) {
  return reason === "harm" || reason === "handsOff" || reason === "missedShock";
}
function isChallengeSuccess(completed, reason) {
  return !!completed && !isChallengeFail(reason) && reason !== "missed" && reason !== "cap" && reason !== "early";
}
function challengeLine() {
  var best = challengeBest();
  var n = challenge.on ? challenge.score : (challenge.lastScore || 0);
  if (challenge.on) return "Challenge: " + n + " completed, best " + best;
  if (challenge.justEnded) return "Challenge ended: " + n + " completed, best " + best;
  return "";
}
function syncChallengeUi(opts) {
  opts = opts || {};
  var el = $("scnChallengeStatus");
  if (!el) {
    var row = $("scnClock") && $("scnClock").parentNode;
    if (row) {
      el = document.createElement("p");
      el.id = "scnChallengeStatus";
      el.className = "scn-challenge-status";
      el.setAttribute("aria-live", "polite");
      var skip = $("scnSkipHost");
      row.insertBefore(el, skip || null);
    }
  }
  if (!el) return;
  var line = challengeLine();
  if (line && (challenge.on || challenge.justEnded)) {
    el.hidden = false;
    el.textContent = line;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
  var bar = $("scnChallengeNextBar");
  if (bar) {
    var showNext = !!(challenge.on && typeof SIM !== "undefined" && SIM && SIM.done && isChallengeSuccess(SIM.completed, SIM.endReason));
    bar.hidden = !showNext;
  }
  if (opts.reveal && el && !el.hidden) {
    try { el.scrollIntoView({ block: "nearest", behavior: (typeof prefersReduced === "function" && prefersReduced()) ? "auto" : "smooth" }); } catch (e) {}
  }
}
function randomScenario() {
  var pool = ALL_SCENARIOS.filter(function (x) { return x.id !== lastScn; });
  startScenario(pool[Math.floor(Math.random() * pool.length)].id, true);
}
function renderScnChooser() {
  var host = $("scnGrid"); if (host.childElementCount) return;
  var rb = document.createElement("div"); rb.className = "scn-random-wrap";
  var bestN = challengeBest();
  rb.innerHTML = "<button type='button' class='scn-random' id='scnRandom'><svg class='dice' viewBox='0 0 24 24' width='26' height='26' aria-hidden='true'><rect x='2.5' y='2.5' width='19' height='19' rx='4' fill='none' stroke='currentColor' stroke-width='2'/><circle cx='8' cy='8' r='1.8' fill='currentColor'/><circle cx='16' cy='8' r='1.8' fill='currentColor'/><circle cx='12' cy='12' r='1.8' fill='currentColor'/><circle cx='8' cy='16' r='1.8' fill='currentColor'/><circle cx='16' cy='16' r='1.8' fill='currentColor'/></svg><span><span class='scn-random-title'>Random scenario</span><span class='scn-random-sub'>A case picked for you from all of the cases in the list. The case name is revealed in the debrief, not while you are playing.</span></span></button>" +
    "<button type='button' class='scn-challenge' id='scnChallenge'><span><span class='scn-random-title'>Challenge mode</span><span class='scn-random-sub'>Back-to-back random cases. See how many you can complete correctly in a row. The run ends on a fail (harm, a long hands-off period, or an unsafe shock). Best on this device: " + bestN + ".</span></span></button>";
  host.appendChild(rb);
  $("scnRandom").addEventListener("click", randomScenario);
  $("scnChallenge").addEventListener("click", startChallenge);
  var list = listedScenarios();
  LIST_GROUP_ORDER.forEach(function (g, gi) {
    var items = list.filter(function (s) { return listGroup(s) === g; });
    if (!items.length) return;
    var wrap = document.createElement("div"); wrap.className = "scn-group";
    wrap.innerHTML = "<h3 class='scen-group-label' id='scn-g" + gi + "'>" + esc(g) + "</h3>";
    var row = document.createElement("div"); row.className = "scn-row"; row.setAttribute("role", "group"); row.setAttribute("aria-labelledby", "scn-g" + gi);
    items.forEach(function (s) {
      var b = document.createElement("button"); b.type = "button"; b.className = "scn-card"; b.dataset.id = s.id;
      b.innerHTML = "<span class='scn-num' aria-hidden='true'>" + (listIndex(s) + 1) + "</span><span class='scn-card-text'><span class='scn-card-title'>" + esc(listTitle(s)) + "</span><span class='scn-card-blurb'>" + esc(s.blurb) + "</span></span>";
      b.addEventListener("click", function () { startScenario(s.id); });
      row.appendChild(b);
    });
    wrap.appendChild(row); host.appendChild(wrap);
  });
}

function startScenario(id, random) {
  if (typeof clearAskPending === "function") clearAskPending();
  if (!random && challenge.on) {
    challenge.on = false;
    challenge.justEnded = false;
  }
  var s = SCN[id]; lastScn = id;
  SIM = { scn: s, clock: 0, cpr: false, cycleOpen: false, handsOffFrom: s.start.pulse ? null : 0, cycleStart: 0, cycles: 0, cycleCount: 0, shocks: 0, adrT: [], amio: false, atro: 0, aden: 0, sync: 0, nShocks: 0, random: !!random, challenge: !!challenge.on, pulse: s.start.pulse, vit: Object.assign({}, s.start.vit), log: [], did: {}, done: false, phase: "", cycleWarned: false, lastFb: null, nudgeStreak: 0, reviews: 0, actionN: 0, idleSinceDue: 0, regCalls: 0, endedDue: null, endReason: "", monitorReady: false, wasDue: {}, reviewsWhenReady: null, actionsWhenReady: null, checksAfter3: 0, rhythmChecks: 0, lastCheckAt: null, lastAtroT: null, atroT: [], shockMissNudged: false };
  if (typeof initScenarioExtras === "function") initScenarioExtras(SIM);
  if (typeof renderPending === "function") renderPending();
  document.querySelectorAll("#scnGrid .scn-card").forEach(function (b) { b.setAttribute("aria-pressed", !random && b.dataset.id === id ? "true" : "false"); });
  $("scnChooserWrap").classList.add("hidden");
  $("scnStage").classList.remove("hidden");
  $("scnDebrief").classList.add("hidden"); $("scnPanels").classList.remove("hidden");
  var listN = listIndex(s);
  $("scnTitle").textContent = challenge.on ? "Challenge case" : random ? "Random case" : listN >= 0 ? "Scenario " + (listN + 1) + ": " + listTitle(s) : listTitle(s);
  $("scnScene").innerHTML = "<strong>Scene</strong>" + esc(s.scene);
  $("scnLog").innerHTML = "";
  monitor = new Monitor($("scnMonitor"));
  SIM.sig = monitor.set(s.start.rhythm, false, false);
  SIM.rhythm = s.start.rhythm;
  monitor.start();
  renderActions();
  logEvent(null, "Scenario started. " + s.scene.split(". ")[0] + ".");
  $("scnFeedback").innerHTML = "<p class='explain-kicker'>Feedback</p><p class='ep-wait'>Choose an action. Each choice is checked against the RCUK 2025 algorithms; the rhythm responds.</p>";
  renderVitals(); renderClock(); syncScnBanner();
  if (typeof syncChallengeUi === "function") syncChallengeUi();
  clearInterval(simTimer);
  simTimer = setInterval(function () { if (!SIM || SIM.done || document.hidden) return; SIM.clock++; if (typeof tickMonitor === "function") tickMonitor(SIM); if (typeof checkHandsOff === "function" && checkHandsOff()) return; renderClock(); renderVitals(); }, 1000);
  $("scnTitle").focus({ preventScroll: true });
  if (typeof syncSourceBox === "function") syncSourceBox();
  requestAnimationFrame(function () { scrollToScenario(); });
}
function scrollToScenario() {
  var box = $("scnSourceBox");
  var keepSource = document.body.classList.contains("scn-case-running") && box && box.tagName === "DETAILS" && !box.open;
  var el = keepSource ? box : ($("scnTitle") || $("scnStage"));
  if (!el) return;
  el.scrollIntoView({ block: "start", behavior: prefersReduced() ? "auto" : "smooth" });
}
function debriefFold(id, title, body) {
  return "<details class='scn-debrief-fold'><summary><span class='scn-debrief-chevron' aria-hidden='true'></span><h3 class='viva-group' id='" + id + "'>" + esc(title) + "</h3></summary><div class='scn-debrief-fold-body'>" + body + "</div></details>";
}
function renderActions() {
  var host = $("scnActions"), groups = [];
  ACTIONS.forEach(function (a) { if (groups.indexOf(a.g) < 0) groups.push(a.g); });
  host.innerHTML = groups.map(function (g, gi) {
    return "<div class='act-group'><h3 class='scen-group-label' id='act-g" + gi + "'>" + esc(g) + "</h3><div class='act-row' role='group' aria-labelledby='act-g" + gi + "'>" +
      ACTIONS.filter(function (a) { return a.g === g; }).map(function (a) {
        var lab = a.label;
        var aria = "";
        if (a.id === "ff") aria = " aria-label='CPR for 2 minutes'";
        else if (a.id === "causes") aria = " aria-haspopup='dialog' aria-controls='scnCauseList' aria-expanded='" + (typeof isScnMenuOpen === "function" && isScnMenuOpen("scnCauseList") ? "true" : "false") + "'";
        else if (a.id === "ask") aria = " aria-haspopup='dialog' aria-controls='scnAskList' aria-expanded='" + (typeof isScnMenuOpen === "function" && isScnMenuOpen("scnAskList") ? "true" : "false") + "'";
        else if (a.id === "drugs") aria = " aria-haspopup='dialog' aria-controls='scnDrugList' aria-expanded='" + (typeof isScnMenuOpen === "function" && isScnMenuOpen("scnDrugList") ? "true" : "false") + "'";
        return "<button type='button' class='act-btn" + (a.id === "ff" ? " act-ff" : "") + "' data-a='" + a.id + "'" + aria + (SIM.done ? " disabled" : "") + ">" + esc(lab) + "</button>";
      }).join("") + "</div></div>";
  }).join("");
  host.querySelectorAll(".act-btn").forEach(function (b) { b.addEventListener("click", function () { doAction(b.dataset.a); }); });
  var skipHost = $("scnSkipHost");
  if (skipHost) {
    skipHost.innerHTML = "<button type='button' class='scn-skip' id='scnSkip' aria-label='Skip time, advances the clock by 1 minute, not an algorithm action'" + (SIM.done ? " disabled" : "") + ">Skip time</button>";
    $("scnSkip").addEventListener("click", function () { doAction("skip"); });
  }
  var reg = $("scnReg");
  if (reg) reg.disabled = !!(SIM && SIM.done);
  var rs = $("scnRestart");
  if (rs) rs.disabled = !SIM;
  if (typeof decoratePendingActions === "function") decoratePendingActions();
}
function renderVitals() {
  if (typeof renderMonitor === "function" && SIM && SIM.mon) { renderMonitor(); return; }
  var v = SIM.vit, rate = "";
  if (SIM.pulse && SIM.sig && typeof SIM.sig.measure.rate === "number") rate = " · about " + Math.round(SIM.sig.measure.rate) + " /min";
  var cells = [["Pulse", (v.pulse || "") + (SIM.pulse && !/Not yet/.test(v.pulse) ? rate : "")], ["Blood pressure", v.bp], ["Conscious level", v.consc], ["Life-threatening features", v.threats]];
  $("scnVitals").innerHTML = cells.map(function (c) { return "<div class='stat'><div class='stat-val'>" + esc(c[1]) + "</div><div class='stat-label'>" + c[0] + "</div></div>"; }).join("");
}
function renderClock() {
  if (!SIM) return;
  var txt = "Time " + mmss(SIM.clock);
  if (SIM.cycleOpen) {
    var left = 120 - (SIM.clock - SIM.cycleStart);
    txt += " · CPR cycle " + SIM.cycleCount + (left > 0 ? " · " + mmss(left) + " left" : " · 2 minutes complete");
    if (left <= 0 && !SIM.cycleWarned) { SIM.cycleWarned = true; $("scnLive").textContent = "Two minutes of CPR completed. The rhythm is on the monitor."; }
    var shot = $("scnShotClock");
    if (shot) {
      shot.hidden = false;
      shot.textContent = left > 0 ? mmss(left) : "0:00";
      shot.setAttribute("aria-label", left > 0 ? "CPR cycle time remaining " + mmss(left) : "CPR cycle complete");
    }
  } else {
    var shotOff = $("scnShotClock");
    if (shotOff) { shotOff.hidden = true; shotOff.textContent = ""; }
  }
  txt += " · Shocks delivered " + SIM.nShocks;
  $("scnClock").textContent = txt;
}
function logSeparateNudge(o) {
  var n = o.separateNudge;
  if (!n || !SIM || n.n >= 3) return;
  var no = {
    v: "info", keys: [n.key], isNudge: true, notAction: true, nudge: n.n,
    nudgeText: n.text, event: n.text, label: "Algorithm check", t: SIM.clock,
    dueAt: n.due || o.dueAt || copyDueItems(SIM.dueItemsBeforeAction || [])
  };
  logEvent(no, n.text);
}
function logEvent(o, text, act) {
  var li = { t: SIM.clock, text: text, o: o, act: act };
  SIM.log.push(li);
  if (MODEL_RUNNING) return;
  var host = $("scnLog");
  if (!host) return;
  var item = document.createElement("li");
  if (o) item.innerHTML = "<span class='log-t'>" + mmss(li.t) + "</span><span class='log-mark' aria-hidden='true'>" + VERD[o.v][0] + "</span><span class='log-text'><strong>" + esc(text) + "</strong> <span class='log-verdict'>" + esc(logVerdictLabel(o)) + "</span></span>";
  else item.innerHTML = "<span class='log-t'>" + mmss(li.t) + "</span><span class='log-mark' aria-hidden='true'>\u2022</span><span class='log-text'><em>" + esc(text) + "</em></span>";
  host.appendChild(item);
  host.parentNode.scrollTop = host.parentNode.scrollHeight;
}
function doAction(a) {
  if (!SIM || SIM.done) return;
  snapshotDue();
  if (a && a.indexOf("cause:") === 0) { pickCause(a.slice(6)); return; }
  if (a && a.indexOf("ask:") === 0) { doAsk(a.slice(4)); return; }
  if (a === "causes") { fillCauseList(); openScnMenu("scnCauseList", document.querySelector("[data-a='causes']")); return; }
  if (a === "ask") { fillAskList(); openScnMenu("scnAskList", document.querySelector("[data-a='ask']")); return; }
  if (a === "drugs") { fillDrugPanel(); openScnMenu("scnDrugList", document.querySelector("[data-a='drugs']")); return; }
  var resolved = typeof resolveDrugAction === "function" ? resolveDrugAction(a) : { raw: a, id: a };
  SIM._act = resolved;
  var rawAct = a;
  a = resolved.id || a;
  if (a === "skip") {
    var so = O("info", "n_skipTime", { event: "Simulated time advanced by 1 minute.", notAction: true });
    so.label = "Skip time";
    SIM.clock += 60;
    noteDueSteps(SIM);
    if (stillDueSteps(outstandingSteps(SIM)).length) {
      SIM.idleSinceDue = (SIM.idleSinceDue || 0) + 1;
      if (SIM.idleSinceDue >= 3) {
        so.forceReview = true;
        applyReview("skip", so);
      }
    } else {
      SIM.idleSinceDue = 0;
    }
    doActionFinish("skip", so, 0);
    return;
  }
  if (a === "nibp") {
    if (typeof requestNIBPCycle === "function") requestNIBPCycle();
    return;
  }
  var harm = typeof detectHarm === "function" ? detectHarm(a, SIM) : null;
  var label = (resolved && resolved.label) || (a === "aden" && resolved && resolved.dose ? ("Adenosine " + resolved.dose + " mg rapid IV") : (ACT[a] ? ACT[a].label : (rawAct || a)));
  var o = SIM.scn.step(a, SIM) || genericOutcome(a, SIM);
  if (a === "shock" || a === "sync") o = applyDefibSafetyToShock(o, SIM);
  if (a === "ff" && !SIM.cpr && !SIM.pulse && SIM.phase !== "organised" && o.keys && o.keys.indexOf("a_ffNoCPR") >= 0) {
    o = O("ok", "n_skip", { cprStart: true, cprStop: true, cycleCheck: true });
  }
  if (harm) {
    o.harm = harm;
    o.keys = [harm.id].concat(o.keys || []);
    o.v = "bad";
    // An unsynchronised shock with a pulse would fail the ALS assessment, so the case always ends.
    var alwaysEnd = harm.id === "harm_shockPulse" || harm.id === "harm_shockDuringCpr";
    if (harm.id === "harm_shockDuringCpr") o.keys = [harm.id];
    if (alwaysEnd || !hintsOn()) {
      o.end = true;
      o.endReason = "harm";
      o.verdictText = "Patient harmed: scenario ended";
    } else {
      o.end = false;
      o.endReason = "";
    }
  }
  if (!o.label) o.label = label;
  if (resolved && resolved.event && o.event == null) o.event = resolved.event;
  doActionFinish(a, o, null, rawAct);
}
function startCprIfNeeded() {
  if (!SIM || SIM.cpr) return;
  SIM.cpr = true;
  SIM.handsOffFrom = null;
  if (!SIM.cycleOpen) {
    SIM.cycleStart = SIM.clock;
    SIM.cycleCount++;
    SIM.cycleWarned = false;
    SIM.cycleOpen = true;
  }
}
function endHandsOff() {
  if (!SIM || SIM.done) return;
  var o = O("bad", "a_handsOff", { end: true, endReason: "handsOff", event: "Compressions were interrupted for 60 seconds or more." });
  o.verdictText = "Scenario ended: prolonged interruption to compressions";
  o.label = "Hands off the chest";
  o.t = SIM.clock;
  if (typeof logEvent === "function") logEvent(o, o.label, "handsOff");
  if (typeof announceFeedback === "function") announceFeedback(o);
  if (typeof finishScenario === "function") finishScenario(false, "handsOff");
  if (typeof renderClock === "function") renderClock();
  if (typeof renderVitals === "function") renderVitals();
  if (typeof renderActions === "function") renderActions();
}
function checkHandsOff() {
  if (!SIM || SIM.done) return false;
  if (SIM.pulse || SIM.cpr) {
    SIM.handsOffFrom = null;
    return false;
  }
  if (SIM.handsOffFrom == null) SIM.handsOffFrom = SIM.clock;
  if (SIM.clock - SIM.handsOffFrom < 60) return false;
  endHandsOff();
  return true;
}
function doActionFinish(a, o, timeCost, rawAct) {
  if (!SIM || !o) return;
  var logAct = rawAct || a;
  var label = o.label || (ACT[a] ? ACT[a].label : (rawAct || a));
  if (timeCost == null) {
    if (a === "ff") {
      if (o.cprStart) startCprIfNeeded();
      if (SIM.cpr || SIM.cycleOpen) SIM.clock = Math.max(SIM.clock, (SIM.cycleStart || SIM.clock) + 120);
      else SIM.clock += ACT_TIME[a] || 0;
    } else {
      SIM.clock += ACT_TIME[a] || 0;
      if (o.cprStart) startCprIfNeeded();
    }
  } else if (timeCost) {
    SIM.clock += timeCost;
    if (o.cprStart) startCprIfNeeded();
  } else if (o.cprStart) {
    startCprIfNeeded();
  }
  if (o.cprStop) {
    SIM.cpr = false;
    if (o.cycleCheck) SIM.cycleOpen = false;
    if (!SIM.pulse) SIM.handsOffFrom = SIM.clock;
  }
  if (o.pulse !== undefined) SIM.pulse = o.pulse;
  if (o.vit) Object.keys(o.vit).forEach(function (k) { SIM.vit[k] = o.vit[k]; });
  if (SIM.mon) SIM.mon.arrest = !SIM.pulse;
  if (typeof syncMonBpFromVit === "function") syncMonBpFromVit(SIM);
  if (typeof checkHandsOff === "function" && checkHandsOff()) return;
  o.label = label; o.t = SIM.clock;
  if (typeof applyWrongClickCollapse === "function") applyWrongClickCollapse(a, o);
  if (o.event == null && typeof defaultEvent === "function") o.event = defaultEvent(a, label, SIM && SIM._act);
  if (a === "assess") {
    var pulsePhrase = SIM.pulse ? "Pulse present" : "No pulse";
    var statesPulse = /\bpulse present\b|\bno pulse\b|\bno palpable[^.]*pulse\b/i;
    o.pulseLine = pulsePhrase + ".";
    if (o.event && !statesPulse.test(o.event)) o.event = o.event.replace(/\.?$/, ". ") + pulsePhrase + ".";
    else if (!o.event) o.event = pulsePhrase + ".";
    label = "Check rhythm and pulse: " + pulsePhrase;
    o.label = label;
  }
  if ((a === "shock" || a === "sync") && o.keys && ["a_shockMid", "a_shockTwice", "a_resumeFirst", "p_shock", "s2_shock", "s4_sync", "s6_sync", "s1_roscShock", "a_sync", "p_sync", "h1_shock", "h2_shock", "h4_shockAsys", "h9_sync"].indexOf(o.keys[o.keys.length - 1]) < 0) SIM.nShocks++;
  if (!o.dueAt) o.dueAt = copyDueItems(SIM.dueItemsBeforeAction || []);
  if (a !== "skip") applyReview(a, o);
  logEvent(o, label, logAct);
  if (o.separateNudge) logSeparateNudge(o);
  var changed = false;
  if (o.rhythm) { changed = !SIM.rhythm || o.rhythm.gen !== SIM.rhythm.gen || JSON.stringify(o.rhythm.opts || {}) !== JSON.stringify(SIM.rhythm.opts || {}); SIM.rhythm = o.rhythm; }
  if (!MODEL_RUNNING && typeof monitor !== "undefined" && monitor && (o.rhythm || o.cprStart || o.cprStop)) {
    SIM.sig = monitor.set(SIM.rhythm, SIM.cpr, true);
  }
  if (changed) {
    o.changeAnnounce = rhythmAnnounce(o);
    if (hintsOn() || MODEL_RUNNING) logEvent(null, o.changeAnnounce);
  }
  if (MODEL_RUNNING) {
    if (o.end) finishScenario(!o.endReason || o.endReason === "complete", o.endReason);
    return;
  }
  renderVitals(); renderClock(); renderFeedback(o, changed);
  if ((a === "aden" || a === "drugs") && o.v !== "info") renderActions();
  announceFeedback(o);
  if (o.end) finishScenario(!o.endReason || o.endReason === "complete", o.endReason);
  if (window.innerWidth < 900) $("scnFeedback").scrollIntoView({ block: "start", behavior: prefersReduced() ? "auto" : "smooth" });
}

function rhythmLabel(gen) {
  var names = {
    vf: "VF", vt: "VT", torsades: "torsades de pointes", asystole: "asystole", pea: "PEA",
    sinus: "sinus rhythm", sinus_tachy: "sinus tachycardia", sinus_brady: "sinus bradycardia",
    chb: "complete heart block", pace_v: "ventricular paced rhythm", pace_a: "atrial paced rhythm",
    pace_dual: "dual-chamber paced rhythm", af: "atrial fibrillation", flutter21: "atrial flutter",
    flutter_var: "atrial flutter", svt: "narrow complex tachycardia", hyperk: "wide-complex rhythm",
    pre_af: "pre-excited atrial fibrillation", wpw: "WPW pattern", junctional: "junctional rhythm"
  };
  return names[gen] || String(gen || "").replace(/_/g, " ");
}
function rhythmAnnounce(o) {
  var name = rhythmLabel(o.rhythm.gen);
  if (o.pulse === false) return "Rhythm change: " + name + ", pulse lost";
  if (o.pulse === true) return "Rhythm change: " + name + ", pulse returned";
  return "Rhythm change: " + name;
}
function renderFeedback(o, changed) {
  if (typeof MODEL_RUNNING !== "undefined" && MODEL_RUNNING) return;
  if (SIM) SIM.lastFb = { o: o, changed: changed };
  var ic = o.v === "ok" ? ICON_OK : o.v === "late" ? ICON_LATE : o.v === "bad" ? ICON_NO : "<span class='verdict-glyph' aria-hidden='true'>" + (VERD[o.v] ? VERD[o.v][0] : "") + "</span>";
  var verdict = o.verdictText ? (ic + esc(o.verdictText)) : (ic + VERD[o.v][1] + ": " + esc(o.label));
  var html = "<p class='explain-kicker'>Feedback</p><p class='verdict-line'>" + verdict + "</p>";
  if (o.harm && o.endReason === "harm") {
    var harmWhy = (typeof firstWhyWrong === "function" && firstWhyWrong(o)) || (o.harm && o.harm.label) || "";
    if (harmWhy) html += "<p class='scn-fb'>" + esc(harmWhy) + "</p>";
    $("scnFeedback").innerHTML = html;
    return;
  }
  var on = hintsOn();
  function addFb(inner, cls) {
    if (!inner) return;
    var n = normLine(inner);
    if (!n || sameLine(n, verdict) || normLine(html).indexOf(n) >= 0) return;
    html += "<p class='" + cls + "'>" + inner + "</p>";
  }
  if (on && o.changeAnnounce) addFb("<strong>" + esc(o.changeAnnounce) + "</strong>", "scn-change");
  if (o.regLine) addFb("<strong>" + esc(o.regLine) + "</strong>", "scn-nudge");
  if (o.v === "late" && o.lateNote) addFb(esc(o.lateNote), "scn-late-note");
  if (!on) {
    var ev = o.event || (o.keys && TXT[o.keys[0]] && TXT[o.keys[0]].event) || "";
    if (!ev && typeof defaultEvent === "function") ev = defaultEvent("", o.label);
    if (ev) addFb(esc(ev), "scn-fb");
    if (o.v === "part" || o.v === "bad") {
      var liveWhy = typeof firstWhyWrong === "function" ? firstWhyWrong(o) : "";
      if (liveWhy) addFb(esc(liveWhy), "scn-fb");
    }
  } else {
    (o.keys || []).forEach(function (k) {
      if (!TXT[k] || isNudgeKey(k) || k === "n_reg") return;
      addFb(txtHTML(k), "scn-fb");
    });
    var phys = physForLive(o.phys);
    if (phys) html += "<div class='panel-block'><h3>" + (changed ? "Why the rhythm changed" : "Physiology") + "</h3><p>" + esc(phys) + "</p></div>";
    var k = o.keys[o.keys.length - 1], i;
    for (i = o.keys.length - 1; i >= 0; i--) if (TXT[o.keys[i]] && TXT[o.keys[i]].guideline) { k = o.keys[i]; break; }
    if (TXT[k] && TXT[k].guideline) html += "<p class='scn-src'><strong>Guideline step:</strong> " + esc(TXT[k].guideline) + "</p>";
    if (typeof algLinkHTML === "function") html += algLinkHTML(k);
    else if (TXT[k] && TXT[k].guideline) html += "<p class='scn-src scn-quotes'><strong>Source lines:</strong> " + srcHTML(k) + "</p>";
    if (!o.end) {
      (o.keys || []).forEach(function (nk) {
        if (TXT[nk] && TXT[nk].nextStep) addFb(esc(TXT[nk].nextStep), "scn-fb");
      });
    }
  }
  if (o.pulseLine) addFb(esc(o.pulseLine), "scn-fb");
  if (!o.regLine && o.nudge && o.nudgeText && o.nudge !== "cap") addFb(esc(o.nudgeText), "scn-nudge");
  $("scnFeedback").innerHTML = html;
}
function finishScenario(completed, reason) {
  if (!SIM || SIM.done) return;
  SIM.done = true; SIM.completed = completed; SIM.endReason = reason || (completed ? "complete" : "early");
  if (!MODEL_RUNNING) {
    clearInterval(simTimer);
    renderActions();
  }
  var endLine;
  if (SIM.endReason === "harm") endLine = "Patient harmed: scenario ended.";
  else if (SIM.endReason === "handsOff") endLine = "Scenario ended: prolonged interruption to compressions.";
  else if (SIM.endReason === "missedShock") endLine = "Scenario ended: the first shock was missed.";
  else if (SIM.endReason === "missed") {
    var missNames = (SIM.endedDue || []).map(function (d) { return d.name; }).filter(Boolean);
    endLine = missNames.length ? "Scenario ended: key step missed. Missed: " + missNames.join("; ") : "Scenario ended: key step missed.";
  } else if (SIM.endReason === "cap") endLine = "Scenario ended: too many cycles without a resolution.";
  else endLine = completed ? "Scenario complete." : "Scenario ended early.";
  logEvent(null, endLine);
  var challengeSuccess = false;
  if (challenge.on && SIM.challenge) {
    if (isChallengeSuccess(SIM.completed, SIM.endReason)) {
      challenge.score += 1;
      if (challenge.score > challengeBest()) saveChallengeBest(challenge.score);
      challengeSuccess = true;
    } else {
      stopChallenge(true);
    }
  }
  if (MODEL_RUNNING) return;
  if (SIM.endReason === "missed" || SIM.endReason === "missedShock" || SIM.endReason === "cap" || SIM.endReason === "harm" || SIM.endReason === "handsOff") {
    showDebrief();
  } else {
    var b = $("scnFeedback"), btn = document.createElement("div"); btn.className = "predict-actions";
    var nextHtml = challengeSuccess ? "<button type='button' id='scnChallengeNext'>Next challenge case</button>" : "";
    btn.innerHTML = nextHtml + "<button type='button' id='scnDebriefBtn'" + (challengeSuccess ? " class='secondary'" : "") + ">Open the debrief</button>";
    b.appendChild(btn);
    if ($("scnChallengeNext")) $("scnChallengeNext").addEventListener("click", randomScenario);
    $("scnDebriefBtn").addEventListener("click", showDebrief);
  }
  syncScnBanner();
  if (typeof syncChallengeUi === "function") syncChallengeUi({ reveal: true });
  if (typeof syncSourceBox === "function") syncSourceBox();
}

function syncSourceBox() {
  var box = $("scnSourceBox");
  var stage = $("scnStage");
  var debriefEl = $("scnDebrief");
  var inDebrief = !!(debriefEl && !debriefEl.classList.contains("hidden"));
  var running = !!(SIM && !SIM.done && stage && !stage.classList.contains("hidden") && !inDebrief);
  document.body.classList.toggle("scn-case-running", running);
  document.body.classList.toggle("scn-case-debrief", inDebrief);
  if (!box) return;
  var mobile = false;
  try { mobile = window.matchMedia("(max-width: 700px)").matches; } catch (e) {}
  if (box.tagName === "DETAILS") {
    if (running && mobile) box.open = false;
    else if (!running && !inDebrief && !mobile) box.open = false;
    else box.open = true;
  }
}

function withPeriod(s) {
  s = String(s || "").trim();
  if (!s) return "";
  return /[.!?]$/.test(s) ? s : s + ".";
}
function sourceTagFor(srcKey, guideline) {
  var raw = (srcKey && typeof SRC !== "undefined" && SRC[srcKey]) || "";
  if (raw) {
    var cut = raw.indexOf(":");
    if (cut > 8 && cut < 110) return raw.slice(0, cut).replace(/\s+\([^)]*\)\s*$/, "").trim();
  }
  if (guideline && /RCUK|BNF/.test(guideline)) return guideline;
  if (srcKey && typeof IDEAL_PATHS !== "undefined") {
    /* fall through to a readable default */
  }
  return guideline && /RCUK|BNF|ALS|Brady|Tachy|Special/.test(guideline) ? guideline : (guideline ? "RCUK 2025 Adult ALS guideline" : "RCUK 2025 Adult ALS guideline");
}
function contentWords(s) {
  return normLine(s).replace(/^(give|use|start|resume|continue|do|perform|treat)\s+/, "").split(/[^a-z0-9+]+/).filter(function (w) {
    return w && "the a an and or of to for in on as is it at by with from after then this that than only if over".split(" ").indexOf(w) < 0;
  });
}
function restatesAction(why, action) {
  if (!why) return true;
  if (!action) return false;
  var a = contentWords(action), w = contentWords(why);
  if (!a.length) return false;
  if (normLine(why) === normLine(action)) return true;
  var hit = 0, i;
  for (i = 0; i < a.length; i++) if (w.indexOf(a[i]) >= 0) hit++;
  /* A why that starts with the action but then gives a real reason is not a restatement. */
  if (hit >= Math.max(3, a.length - 1) && w.length <= a.length + 5) return true;
  if (w.join(" ").indexOf(a.join(" ")) >= 0 && w.length <= a.length + 5) return true;
  return false;
}
function physWhyFor(id, scn) {
  var key = ({
    calcium: "hyperk",
    adr: "adr",
    adrRepeat: "adr",
    amio300: "amio",
    amio150: "amio",
    decompress: "roscTension",
    fluid: "roscHypovol",
    mg: "mg"
  })[id];
  if (id === "shock") key = (scn && scn.id === "h9") ? "tdpArrest" : "shockVF";
  if (!key || typeof PHYS === "undefined" || !PHYS[key]) return "";
  if (key === "hyperk") return "Calcium antagonises the membrane effect of high potassium without immediately lowering the serum potassium";
  return PHYS[key];
}
function reasonWhy(action, why, id, scn) {
  if (why && !restatesAction(why, action)) return why;
  var phys = physWhyFor(id, scn);
  if (phys && !restatesAction(phys, action)) return phys;
  return why || phys || "";
}
function dueRank(d, scn) {
  var id = d && d.id;
  if (id === "shock" || id === "sync" || id === "sync2") return 0;
  if (id === "cpr") return 1;
  if (id === "expert") {
    var sid = (scn && scn.id) || "";
    if (sid === "s5" || sid === "h6" || sid === "h10") return 1;
    return 6;
  }
  if (id === "adr" || id === "atro" || id === "vagal" || id === "mg" || id === "amio300") return 2;
  if (id === "aden" || id === "aden2" || id === "adenNext" || id === "amio150" || id === "adrRepeat" || id === "pace" || id === "amioInf") return 3;
  if (id === "calcium" || id === "fluid" || id === "decompress") return 4;
  if (id === "causes") return 6;
  if (id === "ff" || id === "assess") return 7;
  return 5;
}
function pickDue(due, scn) {
  if (!due || !due.length) return [];
  var best = 99, i, r, out = [];
  for (i = 0; i < due.length; i++) {
    r = dueRank(due[i], scn);
    if (r < best) { best = r; out = [due[i]]; }
    else if (r === best) out.push(due[i]);
  }
  return out;
}
function idealWhyFor(scn, id) {
  var ideal = (typeof IDEAL_PATHS !== "undefined" && scn && IDEAL_PATHS[scn.id]) || [];
  var aliases = { aden2: "aden", adenNext: "aden", adrRepeat: "adr", sync2: "sync" };
  var want = aliases[id] || id, i, step;
  for (i = 0; i < ideal.length; i++) {
    step = ideal[i];
    if (step.id === want || step.id === id || (step.alts && (step.alts.indexOf(id) >= 0 || step.alts.indexOf(want) >= 0))) {
      return { why: step.why, src: step.src, label: step.label };
    }
  }
  return null;
}
function answerFromDue(due, scn) {
  if (!due || !due.length) return null;
  var picked = pickDue(due, scn);
  var names = picked.map(function (d) { return d.name; }).filter(Boolean);
  if (!names.length) return null;
  var top = picked[0];
  var action = names.join("; ");
  var meta = idealWhyFor(scn, top.id);
  var why = reasonWhy(action, (meta && meta.why) || top.guideline || "", top.id, scn);
  if (!why) why = "This was the most important algorithm step that was due at that moment.";
  var src = (meta && meta.src) || sourceTagFor(top.src, top.guideline);
  return { action: action, why: why, src: src, id: top.id };
}
function answerFromTxt(keys) {
  var i, k, t;
  for (i = 0; i < (keys || []).length; i++) {
    k = keys[i];
    t = TXT[k];
    if (t && t.nextStep) {
      return { action: t.nextStep, why: t.guideline || t.whyWrong || "", src: sourceTagFor(t.src, t.guideline) };
    }
  }
  return null;
}
function fallbackExpected(scn, logBefore) {
  var meta, step, i, done = {}, alias;
  (logBefore || []).forEach(function (l) {
    if (!l || !l.act || (l.o && l.o.isNudge)) return;
    alias = (typeof idealActId === "function") ? idealActId(l.act) : l.act;
    done[alias] = 1;
    done[l.act] = 1;
  });
  var ideal = (typeof IDEAL_PATHS !== "undefined" && scn && IDEAL_PATHS[scn.id]) || [];
  function unused(step) {
    if (done[step.id]) return false;
    return !(step.alts || []).some(function (a) { return done[a]; });
  }
  for (i = 0; i < ideal.length; i++) {
    step = ideal[i];
    if (step.orderFree) continue;
    if (unused(step)) return { action: step.label, why: reasonWhy(step.label, step.why, step.id, scn), src: step.src };
  }
  for (i = 0; i < ideal.length; i++) {
    step = ideal[i];
    if (unused(step)) return { action: step.label, why: reasonWhy(step.label, step.why, step.id, scn), src: step.src };
  }
  return { action: "Continue with the next step on the RCUK 2025 algorithm for this rhythm", why: "Reassess the patient and treat according to the algorithm.", src: "RCUK 2025 Adult ALS guideline" };
}
function needsCorrectAnswer(l) {
  if (!l || !l.o) return false;
  if (l.o.isReg) return false;
  if (l.o.v === "bad" || l.o.v === "part") return true;
  if (l.o.isNudge && l.o.nudge) return true;
  return false;
}
function correctAnswerForLog(l, log, idx, scn) {
  if (!needsCorrectAnswer(l)) return null;
  var o = l.o || {};
  var keys = o.keys || [];
  if (keys.some(function (k) { return k === "h8_atro1" || k === "h8_atroRepeat"; })) {
    var fromTxt = answerFromTxt(keys);
    if (fromTxt && fromTxt.action) {
      fromTxt.why = reasonWhy(fromTxt.action, fromTxt.why, fromTxt.id, scn);
      return fromTxt;
    }
  }
  var due = o.dueAt || [];
  var unmatched = due.filter(function (d) { return !actionMatchesDue(l.act, d.id); });
  var ans = unmatched.length ? answerFromDue(unmatched, scn) : null;
  if (!ans) ans = answerFromTxt(keys);
  if (!ans) ans = fallbackExpected(scn, (log || []).slice(0, idx));
  if (!ans || !ans.action) {
    ans = { action: "Continue with the next step on the RCUK 2025 algorithm for this rhythm", why: "Reassess the patient and treat according to the algorithm.", src: "RCUK 2025 Adult ALS guideline" };
  } else {
    ans.why = reasonWhy(ans.action, ans.why, ans.id, scn);
  }
  return ans;
}
function correctAnswerForMissed(s, r) {
  var id = r && r[0], name = r && r[1], srcKey = r && r[2], guideline = r && r[3];
  var meta = idealWhyFor(s, id);
  var action = (meta && meta.label) || name || "The missed algorithm step";
  return {
    action: action,
    why: reasonWhy(action, (meta && meta.why) || guideline || "", id, s) || "This required step was due and was not done.",
    src: (meta && meta.src) || sourceTagFor(srcKey, guideline)
  };
}
function renderCorrectAnswer(ans) {
  if (!ans || !ans.action) return "";
  var html = "<p class='correct-ans'><strong>Correct answer:</strong> " + esc(withPeriod(ans.action));
  if (ans.why && !restatesAction(ans.why, ans.action)) html += " " + esc(withPeriod(ans.why));
  if (ans.src) html += " <span class='correct-ans-src'>Source: " + esc(ans.src) + "</span>";
  html += "</p>";
  return html;
}
function debriefReqItem(s, r, kind) {
  var label = kind === "missed" ? "Missed" : "Not reached";
  var reqI = -1;
  (s.req || []).forEach(function (x, i) { if (x[0] === r[0]) reqI = i; });
  var g = r[3] || "", sk = r[2], src = (sk && SRC[sk]) ? SRC[sk] : "";
  var quotes = "", tag = "";
  if (reqI >= 0) {
    var rk = "req:" + s.id + ":" + reqI;
    tag = verTag(rk);
    quotes = verQuotes(rk);
  }
  if (!quotes && src) quotes = esc(src);
  var extra = kind === "notReached" ? "<p>This step was not yet due when the case ended, so it is not marked as missed.</p>" : "";
  var ca = kind === "missed" ? renderCorrectAnswer(correctAnswerForMissed(s, r)) : "";
  return "<li class='db-item db-bad'><p class='db-head'><span class='predict-mark' aria-hidden='true'>✗</span><span><strong>" + label + ":</strong> " + esc(r[1]) + tag + "</span></p>" + extra + ca + (g ? "<p class='scn-src'><strong>Guideline step:</strong> " + esc(g) + "</p>" : "") + sourceLinesBlock(quotes) + "</li>";
}
function debriefEntryBody(l) {
  var k = l.o.keys || [];
  var parts = [], seen = {}, verdict = l.o.verdictText || "", label = l.text || "";
  function restatesShort(n, other) {
    var o = normLine(other);
    if (!n || !o || seen[n]) return !n || seen[n];
    if (n === o) return true;
    // Do not drop a longer teaching paragraph just because it begins with the action label.
    if (n.indexOf(o) === 0) return n.length <= o.length + 40;
    if (o.indexOf(n) === 0) return o.length <= n.length + 40;
    return false;
  }
  function add(html) {
    if (!html) return;
    var n = normLine(html);
    if (!n || seen[n] || restatesShort(n, verdict) || restatesShort(n, label)) return;
    Object.keys(seen).forEach(function (s) { if (sameLine(s, n) && Math.abs(s.length - n.length) <= 40) n = ""; });
    if (!n) return;
    seen[n] = 1;
    parts.push(html);
  }
  if (l.o.isReg) {
    add("<p>" + esc(l.o.regLine || "") + "</p>");
    return parts.join("");
  }
  var hasCaseText = k.some(function (other) {
    return other && !/^harm_/.test(other) && !isNudgeKey(other) && other !== "n_reg" && TXT[other] && TXT[other].full;
  });
  k.forEach(function (kk) {
    if (isNudgeKey(kk) || kk === "n_reg") return;
    if (hasCaseText && /^harm_/.test(kk)) return;
    if (TXT[kk]) add("<p>" + txtHTML(kk) + "</p>");
  });
  if (!(SIM && SIM.endReason === "harm") && !(l.o.harm && l.o.endReason === "harm")) {
    k.forEach(function (kk) {
      if (TXT[kk] && TXT[kk].nextStep) add("<p>" + esc(TXT[kk].nextStep) + "</p>");
    });
  }
  if (l.o.nudgeText && l.o.nudge && !l.o.separateNudge) add("<p>" + esc(l.o.nudgeText) + "</p>");
  return parts.join("");
}
function showDebrief() {
  var s = SIM.scn, acts = SIM.log.filter(function (l) { return l.o; });
  var score = decisionScoreFromLog(SIM.log, SIM.regCalls || 0);
  var counted = scoredDecisionEntries(SIM.log);
  var raw = score.raw, regN = SIM.regCalls || 0, pts = score.pts;
  var classified = classifyReqSteps(SIM);
  var missed = classified.missed, notReached = classified.notReached;
  var html = "<p class='explain-kicker'>Debrief</p><h2 class='explain-title' id='scnDebriefTitle' tabindex='-1'>" + (SIM.random ? "Random case revealed: " : "") + esc(s.title) + "</h2>";
  var ended = SIM.endReason === "harm" ? "Patient harmed: scenario ended" : SIM.endReason === "handsOff" ? "Scenario ended: prolonged interruption to compressions" : SIM.endReason === "missedShock" ? "Scenario ended: the first shock was missed" : SIM.endReason === "missed" ? (function () { var n = (SIM.endedDue || []).map(function (d) { return d.name; }).filter(Boolean); return n.length ? "Scenario ended: key step missed. Missed: " + n.join("; ") : "Scenario ended: key step missed"; }()) : SIM.endReason === "cap" ? "Scenario ended: too many cycles without a resolution" : (SIM.completed ? "Scenario completed" : "Scenario ended early");
  var hasAtroCollapse = (SIM.log || []).some(function (l) { return l.o && l.act === "atro" && (l.o.notScoredAgain || l.o.logVerdict); });
  var hasOtherCollapse = (SIM.log || []).some(function (l) { return l.o && l.o.notScoredAgain && l.act !== "atro"; });
  var atroScoreNote = "";
  if (hasAtroCollapse) atroScoreNote += " A run of too-early repeat atropine doses counts as one decision; further too-early doses in the same run are logged as too soon but are not scored again.";
  if (hasOtherCollapse) atroScoreNote += " Identical consecutive wrong clicks of the same action count as one decision; further clicks in the same run are logged but are not scored again.";
  html += "<p class='big-score'>" + pts + " of " + counted.length + " decisions</p><p>" + ended + " at a simulated time of " + mmss(SIM.clock) + ". Correct and correct but late score 1, partly right 0.5, not quite 0; noted actions are not scored." + atroScoreNote + " Each time you call the reg, 0.5 is deducted from the decision score (minimum 0). Reg called: " + regN + "." + (missed.length ? " Missed steps are listed below." : "") + (notReached.length ? " Steps that were not yet due are listed as not reached." : "") + "</p>";
  html += posterLineFor(s);
  html += renderLogCompare(s, SIM.log);
  if (missed.length) html += "<h3 class='viva-group'>Missed steps</h3><ul class='debrief-list'>" + missed.map(function (r) { return debriefReqItem(s, r, "missed"); }).join("") + "</ul>";
  if (notReached.length) html += "<h3 class='viva-group'>Not reached</h3><ul class='debrief-list'>" + notReached.map(function (r) { return debriefReqItem(s, r, "notReached"); }).join("") + "</ul>";
  ([].concat(s.extra || [])).forEach(function (xk) {
    if (!xk || !TXT[xk]) return;
    html += "<div class='panel-block trap'><h3>Teaching point</h3><p>" + txtHTML(xk) + "</p><p class='scn-src'><strong>Source:</strong> " + esc(srcOf(xk)) + "</p></div>";
  });
  if (SIM.challenge || challenge.justEnded) {
    html += "<p class='scn-challenge-result' id='scnChallengeResult'>" + esc(challengeLine()) + "</p>";
  }
  var nextCh = (challenge.on && isChallengeSuccess(SIM.completed, SIM.endReason)) ? "<button type='button' id='scnChallengeNext'>Next challenge case</button>" : "";
  html += "<div class='predict-actions'>" + nextCh + (SIM.random && !challenge.on ? "<button type='button' id='scnAnother'>Another random scenario</button>" : "") + "<button type='button' id='scnRetry'" + (SIM.random || challenge.on || nextCh ? " class='secondary'" : "") + ">Try this scenario again</button><button type='button' class='secondary' id='scnOther'>Choose another scenario</button></div>";
  var decisionList = "<ol class='debrief-list' id='scnDecisionList'>" + acts.map(function (l, idx) {
    var k = l.o.keys || [];
    var body = debriefEntryBody(l);
    var ca = renderCorrectAnswer(correctAnswerForLog(l, acts, idx, s));
    var gk = k.length ? k[k.length - 1] : "", i;
    for (i = k.length - 1; i >= 0; i--) if (TXT[k[i]] && TXT[k[i]].guideline) { gk = k[i]; break; }
    var srcBlock = "";
    if (!l.o.isReg && gk && TXT[gk] && TXT[gk].guideline) {
      srcBlock = "<p class='scn-src'><strong>Guideline step:</strong> " + esc(TXT[gk].guideline) + "</p>" + sourceLinesBlock(srcHTML(gk));
    } else if (!l.o.isReg && !l.o.isNudge && gk && TXT[gk]) {
      srcBlock = sourceLinesBlock(srcHTML(gk));
    }
    return "<li class='db-item db-" + l.o.v + "'><p class='db-head'><span class='predict-mark' aria-hidden='true'>" + VERD[l.o.v][0] + "</span><span><strong>" + esc(logVerdictLabel(l.o) || l.o.verdictText || VERD[l.o.v][1]) + "</strong> · " + mmss(l.t) + " · " + esc(l.text) + "</span></p>" +
      body +
      ca +
      (l.o.phys ? "<p class='db-phys'><strong>Physiology:</strong> " + esc(PHYS[l.o.phys]) + "</p>" : "") +
      srcBlock + "</li>";
  }).join("") + "</ol>";
  html += debriefFold("scnYourDecisions", "Your decisions in detail", decisionList);
  html += debriefFold("scnIdealTitle", "Ideal pathway", renderIdealPath(s, SIM.log, { noTitle: true }));
  $("scnDebrief").innerHTML = html;
  $("scnDebrief").classList.remove("hidden"); $("scnPanels").classList.add("hidden");
  if (typeof syncSourceBox === "function") syncSourceBox();
  var wasRandom = SIM.random;
  $("scnRetry").addEventListener("click", function () { startScenario(s.id, wasRandom); });
  if ($("scnAnother")) $("scnAnother").addEventListener("click", randomScenario);
  if ($("scnChallengeNext")) $("scnChallengeNext").addEventListener("click", randomScenario);
  $("scnOther").addEventListener("click", showChooser);
  $("scnDebriefTitle").focus({ preventScroll: false });
}
function showChooser() {
  if (monitor) monitor.stop();
  clearInterval(simTimer); SIM = null;
  if (challenge.on) stopChallenge(true);
  challenge.justEnded = false;
  $("scnStage").classList.add("hidden"); $("scnChooserWrap").classList.remove("hidden");
  if ($("scnDebrief")) $("scnDebrief").classList.add("hidden");
  renderScnChooser(); syncScnBanner();
  if (typeof syncChallengeUi === "function") syncChallengeUi();
  if (typeof syncSourceBox === "function") syncSourceBox();
}
function syncScnBanner() {
  var on = mode === "scenario", b = $("scnBanner"), t = $("scnToggle"), st = $("scnBannerStatus");
  if (!b || !t) return;
  b.classList.toggle("is-on", on);
  t.setAttribute("aria-pressed", on ? "true" : "false");
  t.querySelector(".test-cta-label").textContent = on ? "Exit" : "Start";
  t.setAttribute("aria-label", on ? "Exit Scenarios" : "Start Scenarios");
  if (on && SIM) {
    var n = listIndex(SIM.scn);
    st.hidden = false;
    st.textContent = (challenge.on || challenge.justEnded) ? challengeLine() : SIM.done ? "Scenario finished" : SIM.random ? "Random case running" : n >= 0 ? "Scenario " + (n + 1) + " running" : "Case running";
  }
  else { st.hidden = true; st.textContent = ""; }
}
function enterScenarioMode() {
  if (!$("scnWrap")) {
    location.href = "Resus_Scenarios" + (location.search || "") + (location.hash || "");
    return;
  }
  if (mode === "test") { Q = null; current = null; if ($("testBannerScore")) $("testBannerScore").hidden = true; }
  mode = "scenario";
  document.body.classList.add("mode-scn");
  if ($("learnWrap")) $("learnWrap").classList.add("hidden");
  if ($("rhythmPanel") && $("rhythmPanel").parentNode) $("rhythmPanel").parentNode.classList.add("hidden");
  $("scnWrap").classList.remove("hidden");
  if (typeof syncBanner === "function") syncBanner();
  showChooser();
  $("scnWrap").scrollIntoView({ block: "start", behavior: prefersReduced() ? "auto" : "smooth" });
}
function exitScenarioMode(silent) {
  if (typeof clearAskPending === "function") clearAskPending();
  if (monitor) monitor.stop();
  clearInterval(simTimer); SIM = null;
  document.body.classList.remove("mode-scn");
  if ($("scnWrap") && $("learnWrap")) $("scnWrap").classList.add("hidden");
  if ($("learnWrap")) $("learnWrap").classList.remove("hidden");
  if (!silent && $("learnWrap")) renderLearn();
  mode = $("learnWrap") ? "learn" : "scenario";
  syncScnBanner();
}
if ($("scnToggle")) $("scnToggle").addEventListener("click", function () { if (mode === "scenario") exitScenarioMode(); else enterScenarioMode(); });
if ($("scnChallengeNextBar")) $("scnChallengeNextBar").addEventListener("click", randomScenario);
if ($("scnEnd")) $("scnEnd").addEventListener("click", function () { if (SIM && !SIM.done) finishScenario(false); });
if ($("scnRestart")) $("scnRestart").addEventListener("click", function () { if (SIM) startScenario(SIM.scn.id, SIM.random); });
if ($("scnBack")) $("scnBack").addEventListener("click", showChooser);
var srcBtn = $("scnSourcesBtn"), srcClose = $("scnSourcesClose"), srcBg = $("scnSourcesBackdrop");
if (srcBtn) srcBtn.addEventListener("click", openSourcesModal);
if (srcClose) srcClose.addEventListener("click", closeSourcesModal);
if (srcBg) srcBg.addEventListener("click", closeSourcesModal);
var causeClose = $("scnCauseClose"), askClose = $("scnAskClose"), drugClose = $("scnDrugClose");
if (causeClose) causeClose.addEventListener("click", function () { closeScnMenu("scnCauseList"); });
if (askClose) askClose.addEventListener("click", function () { closeScnMenu("scnAskList"); });
if (drugClose) drugClose.addEventListener("click", function () { closeScnMenu("scnDrugList"); });
var causeBg = $("scnCauseBackdrop"), askBg = $("scnAskBackdrop"), drugBg = $("scnDrugBackdrop");
if (causeBg) causeBg.addEventListener("click", function () { closeScnMenu("scnCauseList"); });
if (askBg) askBg.addEventListener("click", function () { closeScnMenu("scnAskList"); });
if (drugBg) drugBg.addEventListener("click", function () { closeScnMenu("scnDrugList"); });
window.addEventListener("resize", function () {
  if (typeof isScnMenuOpen === "function" && typeof positionScnPopup === "function") {
    if (isScnMenuOpen("scnAskList")) positionScnPopup($("scnAskList"), openerForMenu("scnAskList"));
    if (isScnMenuOpen("scnCauseList")) positionScnPopup($("scnCauseList"), openerForMenu("scnCauseList"));
    if (isScnMenuOpen("scnDrugList")) positionScnPopup($("scnDrugList"), openerForMenu("scnDrugList"));
  }
});

if ($("scnHints")) $("scnHints").addEventListener("click", function () { setHints(!hintsOn()); });
try {
  window.matchMedia("(max-width: 700px)").addEventListener("change", function () {
    if (typeof syncSourceBox === "function") syncSourceBox();
  });
} catch (e) {}
if (typeof syncSourceBox === "function") syncSourceBox();

if ($("scnReg")) $("scnReg").addEventListener("click", callReg);
(function initScnGuide() {
  var KEY = "anaesthetic-physiology-scn-guide";
  var g = $("scnGuide");
  if (!g) return;
  try { if (localStorage.getItem(KEY) === "open") g.open = true; } catch (e) {}
  g.addEventListener("toggle", function () {
    try { localStorage.setItem(KEY, g.open ? "open" : "closed"); } catch (e) {}
  });
})();
if ($("scnHints")) syncHintsToggle();
window.__scn = { start: startScenario, random: randomScenario, startChallenge: startChallenge, challenge: function () { return { on: challenge.on, score: challenge.score, best: challengeBest(), justEnded: challenge.justEnded, lastScore: challenge.lastScore }; }, setChallengeBest: function (n) { saveChallengeBest(n); }, act: doAction, enter: enterScenarioMode, exit: exitScenarioMode, debrief: showDebrief, finish: finishScenario, hints: hintsOn, setHints: setHints, callReg: callReg, restart: function () { if (SIM) startScenario(SIM.scn.id, SIM.random); }, pickCause: pickCause, ask: doAsk, due: function () { return outstandingSteps(SIM); }, useFakeTimers: function (on) { if (typeof useFakeAskTimers === "function") useFakeAskTimers(!!on); }, advanceTimers: function (ms) { if (typeof advanceAskTimers === "function") advanceAskTimers(ms); }, pending: function () { return typeof listAskPending === "function" ? listAskPending() : []; }, requestNibp: function () { if (typeof requestNIBPCycle === "function") requestNIBPCycle(); }, get sim() { return SIM; }, get base() { return SCENARIOS; }, get hidden() { return HIDDEN_SCENARIOS; }, get all() { return ALL_SCENARIOS; }, get listed() { return listedScenarios(); }, listTitle: listTitle, listIndex: listIndex, classify: function () { return classifyReqSteps(SIM); }, caps: function () { return SIM ? { reviews: SIM.reviews || 0, actions: SIM.actionN || 0, reviewSafety: reviewSafetyCap(SIM), actionSafety: actionSafetyCap(SIM), reviewsWhenReady: SIM.reviewsWhenReady, actionsWhenReady: SIM.actionsWhenReady, allRequiredAvailable: allRequiredAvailable(SIM) } : null; }, setClock: function (s) { if (SIM) { SIM.clock = s; if (typeof checkHandsOff === "function") checkHandsOff(); } }, score: function () { return decisionScoreFromLog((SIM && SIM.log) || [], (SIM && SIM.regCalls) || 0); }, markPacingPartlyRightAfterFourFailedAtropine: function (on) { if (arguments.length) MARK_PACING_PARTLY_RIGHT_AFTER_FOUR_FAILED_ATROPINE = !!on; return MARK_PACING_PARTLY_RIGHT_AFTER_FOUR_FAILED_ATROPINE; }, timing: { repeat: repeatIntervalWindow, cycle: cycleDrugWindow, adrRepeat: function () { return adrRepeatStatus(SIM); }, firstAdr: function () { return SIM ? (SIM.adrT && SIM.adrT.length ? adrRepeatStatus(SIM) : ((SIM.shocks || 0) >= 3 ? cycleDrugWindow(SIM.checksAfter3 || 0, SIM) : cycleDrugWindow(SIM.rhythmChecks || 0, SIM))) : null; }, dueSeverity: function () { return (outstandingSteps(SIM) || []).map(function (d) { return { id: d.id, severity: dueSeverity(SIM, d) }; }); } } };
/* ===== Ideal pathway for each scenario (shown only in the debrief) ===== */
var SRC_ALS = "RCUK 2025 Adult ALS guideline";
var SRC_ALS_A = "RCUK 2025 Adult ALS algorithm";
var SRC_BRADY = "RCUK 2025 Adult bradyarrhythmia algorithm";
var SRC_TACHY = "RCUK 2025 Adult tachyarrhythmia algorithm";
var SRC_SPEC = "RCUK 2025 Special circumstances guidelines";
var SRC_BNF_ADR = "BNF: adrenaline";
var SRC_BNF_AMIO = "BNF: amiodarone hydrochloride";
var SRC_BNF_ATRO = "BNF: atropine sulfate";
var SRC_BNF_ADEN = "BNF: adenosine";
var SRC_BNF_MG = "BNF: magnesium sulfate";
var SRC_BNF_LIDO = "BNF: lidocaine hydrochloride";
var SRC_BNF_VERA = "BNF: verapamil hydrochloride";

function IP(id, label, why, src, alts, opts) {
  if (alts && !Array.isArray(alts) && typeof alts === "object") { opts = alts; alts = []; }
  var o = { id: id, label: label, why: why, src: src, alts: alts || [] };
  if (opts) {
    if (opts.orderFree) o.orderFree = true;
    if (opts.after) o.after = opts.after;
  }
  return o;
}

var IDEAL_PATHS = {
  s1: [
    IP("assess", "Check rhythm and pulse", "Confirm a shockable arrest before you treat.", SRC_ALS_A),
    IP("charge", "Charge the defibrillator", "Charge while you are still off the chest, or while CPR continues, so the pause for the shock stays short.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "First shock", "Give a shock as early as possible for VF or pulseless VT.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge while compressions continue, so the pause for the shock is as short as possible.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Use single shocks, each followed by a 2-minute cycle of CPR.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Second shock", "If VF or pulseless VT persists, shock again and resume CPR.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge while compressions continue, so the pause for the shock is as short as possible.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Continue 2-minute cycles between shocks.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Third shock", "A third shock is followed by adrenaline and amiodarone during CPR.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("adr", "Adrenaline 1 mg after the third shock", "Adrenaline's alpha-1 vasoconstriction raises aortic diastolic pressure during CPR, and so coronary and cerebral perfusion pressure.", SRC_ALS),
    IP("amio300", "Amiodarone 300 mg after the third shock", "Amiodarone mainly blocks K+ channels, prolonging the action potential and refractory period, which makes re-entry harder to sustain.", SRC_BNF_AMIO),
    IP("ff", "CPR for 2 minutes", "Continue CPR and then reassess the rhythm and pulse.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "Look for ROSC after the cycle of CPR.", SRC_ALS_A)
  ],
  s2: [
    IP("assess", "Check rhythm and pulse", "Confirm a non-shockable arrest before you treat.", SRC_ALS_A),
    IP("cpr", "CPR 30:2 without delay", "High-quality CPR with minimal interruption is the priority.", SRC_ALS),
    IP("adr", "Adrenaline 1 mg as soon as possible", "Adrenaline's alpha-1 vasoconstriction raises aortic diastolic pressure during CPR, and so coronary and cerebral perfusion pressure.", SRC_ALS),
    IP("causes", "Identify the reversible cause (hypovolaemia)", "Identify and treat reversible causes early. This can be done at any time once the arrest is recognised.", SRC_ALS_A, { orderFree: true }),
    IP("fluid", "Give IV fluid for hypovolaemia", "Restoring circulating volume raises preload, so each beat can eject a palpable stroke volume again. Fluids during CPR are given only if the arrest is caused by hypovolaemia.", SRC_ALS, { after: ["causes"] }),
    IP("ff", "CPR for 2 minutes", "Resume CPR for 2 minutes and then reassess.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "Look for ROSC after treating the cause.", SRC_ALS_A)
  ],
  s3: [
    IP("assess", "Check rhythm and pulse", "Confirm the bradycardia and the life-threatening features. Monitoring and IV access are already in place.", SRC_BRADY),
    IP("atro", "Atropine 500 micrograms IV, repeated to a maximum of 3 mg", "Atropine 500 micrograms IV is first-line when life-threatening features are present. Assess the response after each dose. " + ATROPINE_SPACING_TEACHING + " " + ATROPINE_CHB_ALS_JUDGEMENT, SRC_BRADY, null, { orderFree: true }),
    IP("pace", "Transcutaneous pacing, or an isoprenaline or adrenaline infusion", "If the response to atropine is unsatisfactory, use transcutaneous pacing, or an isoprenaline or adrenaline infusion, as an interim measure. These can run alongside repeat atropine; pacing does not have to wait until the full 3 mg has been given. Arrange expert help and transvenous pacing. " + ATROPINE_CHB_ALS_JUDGEMENT, SRC_BRADY, ["adrInf", "iso"]),
    IP("expert", "Seek expert help", "Seek expert help early and consider transvenous pacing. Calling for help early is correct and does not put later treatment out of order.", SRC_BRADY, { orderFree: true })
  ],
  s4: [
    IP("assess", "Check rhythm and pulse", "Confirm a stable narrow complex tachycardia, with no life-threatening features.", SRC_TACHY),
    IP("vagal", "Vagal manoeuvres first", "Start with vagal manoeuvres when the patient is stable.", SRC_TACHY),
    IP("aden", "Adenosine 6 mg", "If vagal manoeuvres are ineffective, give adenosine 6 mg as a rapid IV bolus.", SRC_BNF_ADEN),
    IP("aden", "Adenosine 12 mg", "If the first dose is unsuccessful, give adenosine 12 mg.", SRC_TACHY)
  ],
  s5: [
    IP("assess", "Check rhythm and pulse", "Confirm an unstable broad complex tachycardia with life-threatening features.", SRC_TACHY),
    IP("expert", "Careful sedation or anaesthesia", "A conscious patient needs careful sedation or anaesthesia before synchronised cardioversion.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge before the shock. Continue CPR if it is already in progress.", SRC_ALS),
    IP("clear", "All clear", "Check all is clear, then deliver the synchronised shock.", SRC_ALS),
    IP("sync", "First synchronised shock", "Electrical cardioversion is the preferred treatment in the unstable patient.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge before the shock. Continue CPR if it is already in progress.", SRC_ALS),
    IP("clear", "All clear", "Check all is clear, then deliver the synchronised shock.", SRC_ALS),
    IP("sync", "Further synchronised shock if needed", "Up to three synchronised shocks may be used if the rhythm persists.", SRC_TACHY)
  ],
  s6: [
    IP("assess", "Check rhythm and pulse", "Confirm self-terminating polymorphic VT (torsades de pointes).", SRC_TACHY),
    IP("mg", "Magnesium 8 mmol IV over 10 min", "Torsades is triggered activity from early afterdepolarisations during a prolonged plateau. Magnesium is thought to suppress them, so the runs stop.", SRC_TACHY),
    IP("causes", "Identify reversible causes", "Look for low potassium and QT-prolonging drugs, and treat the cause. This can be done at any time once the rhythm is recognised.", SRC_TACHY, { orderFree: true })
  ],
  h1: [
    IP("assess", "Check rhythm and pulse", "Confirm asystole before you treat.", SRC_ALS_A),
    IP("cpr", "CPR 30:2 without delay", "High-quality CPR with minimal interruption is the priority.", SRC_ALS),
    IP("adr", "Adrenaline 1 mg as soon as possible", "Adrenaline's alpha-1 vasoconstriction raises aortic diastolic pressure during CPR, and so coronary and cerebral perfusion pressure.", SRC_ALS),
    IP("causes", "Identify the reversible cause (hyperkalaemia)", "Name and treat reversible causes early. In this case the reversible cause is hyperkalaemia. Naming the cause can be done at any time once the arrest is recognised.", SRC_ALS_A, { orderFree: true }),
    IP("calcium", "Calcium chloride 10 mL of 10% IV", "Calcium antagonises the membrane effect of high potassium without immediately lowering the serum potassium.", SRC_SPEC, { after: ["causes"] }),
    IP("ff", "Continue CPR cycles, with adrenaline every 3 to 5 minutes", "After treating the cause, continue 2-minute cycles of CPR and repeat adrenaline every 3 to 5 minutes until there is a return of spontaneous circulation.", SRC_ALS),
    IP("assess", "Check rhythm and pulse (ROSC)", "Reassess the rhythm and pulse after treating the cause; a return of spontaneous circulation is the aim.", SRC_ALS_A)
  ],
  h2: [
    IP("assess", "Check rhythm and pulse", "Confirm PEA before you treat.", SRC_ALS_A),
    IP("cpr", "CPR 30:2 without delay", "High-quality CPR with minimal interruption is the priority.", SRC_ALS),
    IP("adr", "Adrenaline 1 mg as soon as possible", "Adrenaline's alpha-1 vasoconstriction raises aortic diastolic pressure during CPR, and so coronary and cerebral perfusion pressure.", SRC_ALS),
    IP("causes", "Identify the reversible cause (tension pneumothorax)", "Identify and treat reversible causes early. Naming the cause can be done at any time once the arrest is recognised.", SRC_ALS_A, { orderFree: true }),
    IP("decompress", "Chest decompression", "Decompressing the chest lets the lung re-expand, intrathoracic pressure falls and venous return is restored, so each beat again ejects a palpable stroke volume.", SRC_SPEC, { after: ["causes"] }),
    IP("ff", "CPR for 2 minutes", "Resume CPR for 2 minutes and then reassess.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "Look for ROSC after treating the cause.", SRC_ALS_A)
  ],
  h3: [
    IP("assess", "Check rhythm and pulse", "Confirm a shockable arrest before you treat.", SRC_ALS_A),
    IP("charge", "Charge the defibrillator", "Charge while you are still off the chest, or while CPR continues, so the pause for the shock stays short.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "First shock", "Give a shock as early as possible for VF or pulseless VT.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge while compressions continue, so the pause for the shock is as short as possible.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Use single shocks, each followed by a 2-minute cycle of CPR.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Second shock", "If VF persists, shock again and resume CPR.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge while compressions continue, so the pause for the shock is as short as possible.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Continue 2-minute cycles between shocks.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Third shock", "After a total of three shocks, give adrenaline and amiodarone 300 mg.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("adr", "Adrenaline 1 mg after the third shock", "Adrenaline's alpha-1 vasoconstriction raises aortic diastolic pressure during CPR, and so coronary and cerebral perfusion pressure.", SRC_ALS),
    IP("amio300", "Amiodarone 300 mg after the third shock", "Amiodarone mainly blocks K+ channels, prolonging the action potential and refractory period, which makes re-entry harder to sustain.", SRC_BNF_AMIO),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge while compressions continue, so the pause for the shock is as short as possible.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Continue CPR and then reassess.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Fourth shock", "If VF persists, continue the shockable algorithm.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge while compressions continue, so the pause for the shock is as short as possible.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Continue 2-minute cycles between shocks.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Fifth shock", "If VF persists, continue the shockable algorithm. Repeat adrenaline every 3 to 5 minutes.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Continue CPR and then reassess the rhythm and pulse.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "Look for ROSC after the cycle of CPR.", SRC_ALS_A)
  ],
  h4: [
    IP("assess", "Check rhythm and pulse", "Confirm the first rhythm and treat it on its merits. The rhythm may change.", SRC_ALS_A),
    IP("charge", "Charge the defibrillator", "Charge while you are still off the chest, or while CPR continues, so the pause for the shock stays short.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Shock VF without delay", "Give a shock as early as possible while the rhythm is VF.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after the shock.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Reassess after 2 minutes of CPR.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "The rhythm may no longer be shockable; treat what you see.", SRC_ALS_A),
    IP("cpr", "Resume CPR", "If the rhythm is now asystole, continue CPR.", SRC_ALS),
    IP("adr", "Adrenaline 1 mg as soon as possible", "Once the rhythm is asystole, adrenaline is due as soon as possible. Adrenaline's alpha-1 vasoconstriction raises aortic diastolic pressure during CPR, and so coronary and cerebral perfusion pressure.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Continue CPR and then reassess.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "Reassess the rhythm and pulse after the cycle of CPR.", SRC_ALS_A)
  ],
  h5: [
    IP("assess", "Check rhythm and pulse", "Confirm a stable narrow complex tachycardia, with no life-threatening features.", SRC_TACHY),
    IP("vagal", "Vagal manoeuvres first", "Start with vagal manoeuvres when the patient is stable.", SRC_TACHY),
    IP("aden", "Adenosine 6 mg", "If vagal manoeuvres are ineffective, give adenosine 6 mg as a rapid IV bolus.", SRC_BNF_ADEN),
    IP("aden", "Adenosine 12 mg", "If the first dose is unsuccessful, give adenosine 12 mg.", SRC_TACHY),
    IP("aden", "Adenosine 18 mg", "RCUK allows a third dose of 18 mg if 6 mg and 12 mg have not worked.", SRC_TACHY)
  ],
  h6: [
    IP("assess", "Check rhythm and pulse", "Confirm unstable tachycardia with life-threatening features.", SRC_TACHY),
    IP("expert", "Careful sedation or anaesthesia", "A conscious patient needs careful sedation or anaesthesia before synchronised cardioversion.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge before the shock. Continue CPR if it is already in progress.", SRC_ALS),
    IP("clear", "All clear", "Check all is clear, then deliver the synchronised shock.", SRC_ALS),
    IP("sync", "First synchronised shock", "Electrical cardioversion is the preferred treatment in unstable atrial fibrillation.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge before the shock. Continue CPR if it is already in progress.", SRC_ALS),
    IP("clear", "All clear", "Check all is clear, then deliver the synchronised shock.", SRC_ALS),
    IP("sync", "Further synchronised shock if needed", "Up to three synchronised shocks may be used if the rhythm persists.", SRC_TACHY)
  ],
  h7: [
    IP("assess", "Check rhythm and pulse", "Confirm a stable regular broad complex tachycardia, with no life-threatening features.", SRC_TACHY),
    IP("expert", "Careful sedation or anaesthesia", "A conscious patient needs careful sedation or anaesthesia before synchronised cardioversion.", SRC_ALS, { orderFree: true }),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge before the shock. Continue CPR if it is already in progress.", SRC_ALS),
    IP("clear", "All clear", "Check all is clear, then deliver the synchronised shock.", SRC_ALS),
    IP("sync", "Synchronised cardioversion", "The Adult tachyarrhythmia algorithm (V3 March 2026) lists synchronised shock(s) first for stable broad and regular tachycardia treated as VT. Drug treatments are only if sedation or anaesthesia risk is too high.", SRC_TACHY)
  ],
  h8: [
    IP("assess", "Check rhythm and pulse", "Confirm broad-complex complete heart block. There are no current life-threatening features, but there is a risk of asystole.", SRC_BRADY),
    IP("expert", "Seek expert help", "When there is a risk of asystole, the algorithm prompts you to seek expert help early and consider transvenous pacing. Calling for help early is correct and does not put later treatment out of order.", SRC_BRADY, { orderFree: true }),
    IP("pace", "Transcutaneous pacing, or an adrenaline or isoprenaline infusion", "Use transcutaneous pacing, or an adrenaline or isoprenaline infusion, as a bridge if transvenous pacing is not immediately available, and seek expert help.", SRC_BRADY, ["adrInf", "iso"])
  ],
  h9: [
    IP("assess", "Check rhythm and pulse", "Confirm pulseless polymorphic VT and treat it as a shockable arrest.", SRC_ALS_A),
    IP("charge", "Charge the defibrillator", "Charge while you are still off the chest, or while CPR continues, so the pause for the shock stays short.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Unsynchronised shock", "Sustained polymorphic VT at this rate gives too little filling time for any useful output: functionally a cardiac arrest, treated like VF.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after the shock.", SRC_ALS),
    IP("mg", "Magnesium 8 mmol (2 g) IV", "Torsades is triggered activity from early afterdepolarisations during a prolonged plateau. Magnesium is thought to suppress them, so the runs stop.", SRC_TACHY),
    IP("ff", "CPR for 2 minutes", "Continue CPR and then reassess.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "Look for ROSC after the cycle of CPR.", SRC_ALS_A)
  ],
  h10: [
    IP("assess", "Check rhythm and pulse", "The patient has just had ROSC; confirm the new unstable rhythm.", SRC_TACHY),
    IP("expert", "Careful sedation or anaesthesia if needed", "A conscious or rousable patient may need sedation or anaesthesia before cardioversion.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge before the shock. Continue CPR if it is already in progress.", SRC_ALS),
    IP("clear", "All clear", "Check all is clear, then deliver the synchronised shock.", SRC_ALS),
    IP("sync", "Synchronised shock", "Electrical cardioversion is the preferred treatment for unstable VT immediately after ROSC.", SRC_ALS)
  ],
  h11: [
    IP("assess", "Check rhythm and pulse", "Confirm narrow-complex complete heart block with life-threatening features.", SRC_BRADY),
    IP("expert", "Seek expert help", "Seek expert help early. Calling for help early is correct and does not put later treatment out of order.", SRC_BRADY, { orderFree: true }),
    IP("atro", "Atropine 500 micrograms IV", "The bradyarrhythmia algorithm starts with atropine 500 micrograms IV when life-threatening features are present. In this case the rate rises and perfusion improves.", SRC_BRADY)
  ],
  h12: [
    IP("assess", "Check rhythm and pulse", "Confirm sinus bradycardia with life-threatening features.", SRC_BRADY),
    IP("expert", "Seek expert help", "Seek expert help early. Calling for help early is correct and does not put later treatment out of order.", SRC_BRADY, { orderFree: true }),
    IP("atro", "Atropine 500 micrograms IV", "The bradyarrhythmia algorithm starts with atropine 500 micrograms IV when life-threatening features are present. In this case the sinus rate rises and perfusion improves.", SRC_BRADY)
  ],
  h13: [
    IP("assess", "Check rhythm and pulse", "Confirm a shockable arrest before you treat.", SRC_ALS_A),
    IP("charge", "Charge the defibrillator", "Charge while you are still off the chest, or while CPR continues, so the pause for the shock stays short.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "First shock", "Give a shock as early as possible for VF or pulseless VT.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge while compressions continue, so the pause for the shock is as short as possible.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Use single shocks, each followed by a 2-minute cycle of CPR.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Second shock", "If VF or pulseless VT persists, shock again and resume CPR.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge while compressions continue, so the pause for the shock is as short as possible.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Continue 2-minute cycles between shocks.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Third shock", "A third shock is followed by adrenaline and amiodarone during CPR.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("adr", "Adrenaline 1 mg after the third shock", "Give adrenaline 1 mg after the third shock in a shockable arrest, and repeat every 3 to 5 minutes.", SRC_BNF_ADR),
    IP("amio300", "Amiodarone 300 mg after the third shock", "Give amiodarone 300 mg IV after a total of three shocks. Lidocaine 100 mg IV may be used as an alternative.", SRC_ALS, ["lido100"]),
    IP("padsAP", "Change pads to the antero-posterior position", "After a failed third shock, prepare to place a fresh set of pads in the anterior-posterior position at the time of the following rhythm check.", SRC_ALS, { orderFree: true }),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge while compressions continue, so the pause for the shock is as short as possible.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Continue 2-minute cycles between shocks.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Fourth shock", "If VF persists, shock again and resume CPR.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge while compressions continue, so the pause for the shock is as short as possible.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Continue 2-minute cycles between shocks.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Fifth shock", "A further amiodarone 150 mg, or lidocaine 50 mg if lidocaine was used, is given after five shocks.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after each shock.", SRC_ALS),
    IP("amio150", "Amiodarone 150 mg after the fifth shock", "Give a further dose of amiodarone 150 mg IV after a total of five shocks. An additional lidocaine 50 mg bolus can be given after five defibrillation attempts if lidocaine was used.", SRC_ALS, ["lido50"]),
    IP("ff", "CPR for 2 minutes", "Continue CPR and then reassess.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "Look for ROSC after the cycle of CPR.", SRC_ALS_A)
  ],
  h14: [
    IP("assess", "Check rhythm and pulse", "Confirm the first shockable rhythm and treat it as VF.", SRC_ALS_A),
    IP("charge", "Charge the defibrillator", "Charge while you are still off the chest, or while CPR continues, so the pause for the shock stays short.", SRC_ALS),
    IP("clear", "Stop compressions, all clear", "Do not defibrillate during manual chest compressions. Stop, check all is clear, then shock, and immediately resume CPR.", SRC_ALS),
    IP("shock", "Shock VF without delay", "Give a shock as early as possible for VF.", SRC_ALS),
    IP("cpr", "Resume CPR after the shock", "Restart compressions immediately after the shock.", SRC_ALS),
    IP("ff", "CPR for 2 minutes", "Use a 2-minute cycle of CPR after the shock, then reassess.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "The rhythm may change. Confirm PEA when the organised rhythm has no pulse.", SRC_ALS_A),
    IP("cpr", "Restart CPR for PEA", "In a non-shockable arrest, resume CPR without delay.", SRC_ALS),
    IP("adr", "Adrenaline 1 mg as soon as possible", "In a non-shockable arrest, give adrenaline 1 mg as soon as possible.", SRC_ALS),
    IP("causes", "Identify the reversible cause (hypovolaemia)", "Always address the reversible causes, including hypovolaemia.", SRC_SPEC),
    IP("fluid", "IV fluid for hypovolaemia", "Give fluids during CPR only if cardiac arrest is caused by hypovolaemia. Use either isotonic saline or balanced crystalloids.", SRC_ALS, ["fluid"]),
    IP("ff", "CPR for 2 minutes", "Continue CPR after treating the cause, then reassess.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "Look for ROSC after the cycle of CPR.", SRC_ALS_A)
  ],
  h15: [
    IP("assess", "Check rhythm and pulse", "Confirm PEA, a non-shockable arrest.", SRC_ALS_A),
    IP("cpr", "CPR 30:2 without delay", "Start or continue CPR in a non-shockable arrest.", SRC_ALS),
    IP("adr", "Adrenaline 1 mg as soon as possible", "In a non-shockable arrest, give adrenaline 1 mg as soon as possible.", SRC_ALS),
    IP("causes", "Identify the reversible cause (thrombosis, pulmonary embolism)", "Consider pulmonary embolism in sudden progressive dyspnoea without known heart or pulmonary disease.", SRC_SPEC),
    IP("fibrin", "Fibrinolytic or thrombolytic drug, then continue CPR", "Use fibrinolytic drugs for cardiac arrest when pulmonary embolism is the suspected cause of cardiac arrest. In select patients, consider CPR for 60-90 min after thrombolytic drugs. This simulation is compressed to a few further cycles, not a literal 60 minutes of play.", SRC_SPEC),
    IP("ff", "Continue CPR after thrombolysis", "Continue CPR after giving the fibrinolytic, then reassess.", SRC_ALS),
    IP("cpr", "Restart CPR", "Resume compressions for a further cycle after the rhythm check.", SRC_ALS),
    IP("ff", "A further cycle of CPR", "The simulation is compressed: a few further cycles stand in for ongoing CPR after thrombolysis.", SRC_SPEC),
    IP("assess", "Check rhythm and pulse", "Look for ROSC after further CPR.", SRC_ALS_A)
  ],
  h16: [
    IP("assess", "Check rhythm and pulse", "Confirm PEA after recent cardiac surgery.", SRC_ALS_A),
    IP("cpr", "CPR 30:2 without delay", "Initiate resuscitation following the standard ALS algorithm.", SRC_SPEC),
    IP("adr", "Adrenaline as soon as possible", "Standard ALS adrenaline timing is used here. Teaching note: special circumstances for cardiac surgery also say: Reduce IV adrenaline dose (0.05-0.1 mg). This simulation uses the standard 1 mg option only.", SRC_SPEC),
    IP("causes", "Identify the reversible cause (cardiac tamponade)", "Always address cardiac tamponade among the reversible causes. Consider ultrasound to identify reversible causes.", SRC_SPEC),
    IP("resternotomy", "Return to theatre / emergency re-sternotomy", "Perform re-sternotomy up to 10 days post-surgery within 5 min. Provide internal cardiac massage once the chest is reopened.", SRC_SPEC),
    IP("ff", "Continue CPR / transfer", "Continue resuscitation while returning to theatre, then reassess.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "Look for ROSC after re-sternotomy.", SRC_ALS_A)
  ],
  h17: [
    IP("assess", "Check rhythm and pulse", "Confirm PEA, a non-shockable arrest.", SRC_ALS_A),
    IP("cpr", "CPR 30:2 without delay", "Start or continue CPR in a non-shockable arrest.", SRC_ALS),
    IP("adr", "Adrenaline 1 mg as soon as possible", "In a non-shockable arrest, give adrenaline 1 mg as soon as possible.", SRC_ALS),
    IP("causes", "Identify the reversible cause (hypoxia)", "Always address hypoxia among the reversible causes.", SRC_SPEC),
    IP("oxygen", "100% oxygen and check the airway", "Treat life-threatening hypoxia with 100% oxygen. Ensure the airway is secure and exclude unrecognised oesophageal intubation.", SRC_SPEC),
    IP("ff", "CPR for 2 minutes", "Continue CPR after treating the cause, then reassess.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "Look for ROSC after the airway is corrected.", SRC_ALS_A)
  ],
  h18: [
    IP("assess", "Check rhythm and pulse", "Confirm a non-shockable arrest.", SRC_ALS_A),
    IP("cpr", "CPR 30:2 without delay", "Start or continue CPR in a non-shockable arrest.", SRC_ALS),
    IP("adr", "Adrenaline 1 mg as soon as possible", "In a non-shockable arrest, give adrenaline 1 mg as soon as possible.", SRC_ALS),
    IP("causes", "Identify the reversible cause (hypokalaemia)", "Always address electrolyte disorders among the reversible causes.", SRC_SPEC),
    IP("kcl", "Potassium chloride arrest bolus", "Give 20 mmol potassium chloride IV/IO over 2-3 min, followed by 10 mmol over 2 min in hypokalaemic cardiac arrest, then monitor K+ level and adjust infusion rate accordingly.", SRC_SPEC),
    IP("ff", "CPR for 2 minutes", "Continue CPR after treating the cause, then reassess.", SRC_ALS),
    IP("assess", "Check rhythm and pulse", "Look for ROSC after the potassium bolus.", SRC_ALS_A)
  ],
  h19: [
    IP("assess", "Check rhythm and pulse", "Confirm a stable regular broad complex tachycardia, with no life-threatening features, and that sedation or anaesthesia risk is too high.", SRC_TACHY),
    IP("expert", "Seek expert help", "Seek expert help. Calling for help early is correct and does not put later treatment out of order.", SRC_TACHY, { orderFree: true }),
    IP("procain", "Procainamide 10 to 15 mg/kg IV over 20 min (maximum 1 g)", "If sedation or anaesthesia risk is too high consider drug treatments: give procainamide 10 to 15 mg/kg over 20 min. Not stocked in many UK hospitals; follow local protocol.", SRC_TACHY)
  ],
  h20: [
    IP("assess", "Check rhythm and pulse", "Confirm unstable tachycardia with life-threatening features.", SRC_TACHY),
    IP("expert", "Careful sedation or anaesthesia", "A conscious patient needs careful sedation or anaesthesia before synchronised cardioversion.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge before the shock. Continue CPR if it is already in progress.", SRC_ALS),
    IP("clear", "All clear", "Check all is clear, then deliver the synchronised shock.", SRC_ALS),
    IP("sync", "First synchronised shock", "Electrical cardioversion is the preferred treatment in unstable VT.", SRC_ALS),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge before the shock. Continue CPR if it is already in progress.", SRC_ALS),
    IP("clear", "All clear", "Check all is clear, then deliver the synchronised shock.", SRC_ALS),
    IP("sync", "Second synchronised shock", "Up to three synchronised shocks may be used if the rhythm persists.", SRC_TACHY),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge before the shock. Continue CPR if it is already in progress.", SRC_ALS),
    IP("clear", "All clear", "Check all is clear, then deliver the synchronised shock.", SRC_ALS),
    IP("sync", "Third synchronised shock", "If three attempts have not worked, give an antiarrhythmic load and re-attempt cardioversion.", SRC_TACHY),
    IP("amio1020", "Amiodarone 300 mg IV over 10 to 20 min, or procainamide", "If cardioversion fails and the patient remains unstable, give procainamide 10–15 mg kg-1 (maximum 1 g) over 20 min or amiodarone 300 mg intravenously over 10–20 min according to local availability and protocols, and re-attempt electrical cardioversion.", SRC_ALS, ["procain"]),
    IP("charge", "Charge the defibrillator (continue CPR if in progress)", "Charge before the shock. Continue CPR if it is already in progress.", SRC_ALS),
    IP("clear", "All clear", "Check all is clear, then deliver the synchronised shock.", SRC_ALS),
    IP("sync", "Further synchronised shock after the load", "Re-attempt electrical cardioversion after the antiarrhythmic load.", SRC_ALS)
  ],
  h21: [
    IP("assess", "Check rhythm and pulse", "Confirm an irregular broad-complex tachycardia. This case is treated as atrial fibrillation with pre-excitation.", SRC_TACHY),
    IP("expert", "Seek expert help, and careful sedation if cardioversion is used", "Seek expert help. A conscious patient needs careful sedation or anaesthesia before synchronised cardioversion.", SRC_ALS, { orderFree: true }),
    IP("procain", "Procainamide, or synchronised cardioversion", "Atrial fibrillation with pre-excitation: procainamide or cardioversion. Not stocked in many UK hospitals; follow local protocol.", SRC_TACHY, ["sync"])
  ],
  h22: [
    IP("assess", "Check rhythm and pulse", "Confirm a regular broad-complex tachycardia that is known SVT with aberrant conduction.", SRC_TACHY),
    IP("vagal", "Vagal manoeuvres first", "If known SVT with aberrant conduction, treat as for narrow complex regular tachycardia: vagal manoeuvres first.", SRC_TACHY),
    IP("aden", "Adenosine 6 mg", "If vagal manoeuvres are ineffective, give adenosine 6 mg rapid IV bolus, if there is no pre-excitation.", SRC_TACHY),
    IP("aden", "Adenosine 12 mg", "If the first dose is unsuccessful, give adenosine 12 mg.", SRC_TACHY)
  ]
};

function idealActId(act) {
  if (!act) return "";
  if (act.indexOf("cause:") === 0) return "causes";
  if (act.indexOf("ask:") === 0) return act;
  return typeof baseAct === "function" ? baseAct(act) : act;
}

function stepMustFollow(first, second) {
  if (!first || !second) return false;
  if (second.after && second.after.indexOf(first.id) >= 0) return true;
  if (first.after && first.after.indexOf(second.id) >= 0) return false;
  if (first.orderFree || second.orderFree) return false;
  return true;
}
function markIdealPath(ideal, log) {
  var acts = (log || []).filter(function (l) { return l.o && l.act && !l.o.isNudge && !l.o.isReg; }).map(function (l) {
    return { id: idealActId(l.act), t: l.t };
  });
  var used = {};
  var assigned = ideal.map(function (step) {
    var hit = -1, u;
    for (u = 0; u < acts.length; u++) {
      if (used[u]) continue;
      if (acts[u].id === step.id || (step.alts && step.alts.indexOf(acts[u].id) >= 0)) { hit = u; break; }
    }
    if (hit >= 0) used[hit] = 1;
    return { step: step, userIndex: hit };
  });
  return assigned.map(function (row, si) {
    var mark = "missed";
    if (row.userIndex >= 0) {
      var late = assigned.some(function (other, sj) {
        return sj > si && other.userIndex >= 0 && other.userIndex < row.userIndex && stepMustFollow(row.step, other.step);
      });
      mark = late ? "late" : "matched";
    }
    return { id: row.step.id, label: row.step.label, why: row.step.why, src: row.step.src, mark: mark, orderFree: !!row.step.orderFree };
  });
}

function renderIdealPath(s, log, opt) {
  var ideal = (typeof IDEAL_PATHS !== "undefined" && IDEAL_PATHS[s.id]) || [];
  if (!ideal.length) return "";
  var rows = markIdealPath(ideal, log);
  var opts = opt || {};
  var html = "<div class='ideal-path' id='scnIdealPath'>";
  if (!opts.noTitle) html += "<h3 class='viva-group' id='scnIdealTitle'>Ideal pathway</h3>";
  html += "<p class='ideal-lead'>The sequence below is the model path for this case. Your actions are marked as matched, late, or missed. Late is used only when a step was done after a step the algorithm requires to come after it (for example, pacing before atropine). Seeking expert help, asking for values, and identifying reversible causes when they are allowed at any time do not make other steps late if you did them early. Requests that are not scored, such as Cycle NIBP, are not required here unless listed.</p>";
  html += "<ol class='ideal-list'>";
  rows.forEach(function (r, i) {
    var markLabel = r.mark === "matched" ? "Matched" : r.mark === "late" ? "Late" : "Missed";
    var glyph = r.mark === "matched" ? "\u2713" : r.mark === "late" ? "\u25D0" : "\u2717";
    html += "<li class='ideal-item ideal-" + r.mark + "'>";
    html += "<p class='ideal-head'><span class='ideal-n' aria-hidden='true'>" + (i + 1) + "</span><span class='ideal-mark' aria-hidden='true'>" + glyph + "</span><span><strong>" + esc(r.label) + "</strong> <span class='ideal-flag'>" + markLabel + "</span></span></p>";
    html += "<p class='ideal-why'>" + esc(r.why) + "</p>";
    if (r.src) html += "<p class='scn-src'><strong>Source:</strong> " + esc(r.src) + "</p>";
    html += "</li>";
  });
  html += "</ol></div>";
  return html;
}


/* ===== Model answer event log: run the ideal path through the engine ===== */
var MODEL_ACTS = {
  s1: ["assess","charge","clear","shock","cpr","charge","ff","clear","shock","cpr","charge","ff","clear","shock","cpr","adr","amio300","ff","assess"],
  s2: ["assess","cpr","adr","ask:gas","cause:hypovolaemia","fluid","ff","assess"],
  s3: ["assess","expert","ask:ecg12","nibp","atro","pace"],
  s4: ["assess","ask:ecg12","nibp","vagal","aden:6","aden:12"],
  s5: ["assess","ask:ecg12","nibp","expert","charge","clear","sync","charge","clear","sync"],
  s6: ["assess","ask:ecg12","ask:gas","mg","cause:hypokalaemia"],
  h1: ["assess","cpr","adr","ask:gas","cause:hyperkalaemia","calcium:arrest","ff","assess"],
  h2: ["assess","cpr","adr","ask:examine","cause:tension","decompress","ff","assess"],
  h3: ["assess","charge","clear","shock","cpr","charge","ff","clear","shock","cpr","charge","ff","clear","shock","cpr","adr","amio300","charge","ff","clear","shock","cpr","charge","ff","clear","shock","cpr","ff","assess"],
  h4: ["assess","charge","clear","shock","cpr","ff","assess","cpr","adr","ff","assess"],
  h5: ["assess","ask:ecg12","nibp","vagal","aden:6","aden:12","aden:18"],
  h6: ["assess","ask:ecg12","nibp","expert","charge","clear","sync","charge","clear","sync"],
  h7: ["assess","ask:ecg12","nibp","expert","charge","clear","sync"],
  h8: ["assess","expert","ask:ecg12","nibp","pace"],
  h9: ["assess","charge","clear","shock","cpr","mg","ff","assess"],
  h10: ["assess","ask:ecg12","nibp","expert","charge","clear","sync"],
  h11: ["assess","ask:ecg12","nibp","expert","atro"],
  h12: ["assess","ask:ecg12","nibp","expert","atro"],
  h13: ["assess","charge","clear","shock","cpr","charge","ff","clear","shock","cpr","charge","ff","clear","shock","cpr","adr","amio300","padsAP","charge","ff","clear","shock","cpr","charge","ff","clear","shock","cpr","amio150","ff","assess"],
  h14: ["assess","charge","clear","shock","cpr","ff","assess","cpr","adr","ask:gas","cause:hypovolaemia","fluid:saline","ff","assess"],
  h15: ["assess","cpr","adr","ask:history","cause:thrombosis","fibrin","ff","cpr","ff","assess"],
  h16: ["assess","cpr","adr","ask:examine","cause:tamponade","resternotomy","ff","assess"],
  h17: ["assess","cpr","adr","ask:airway","cause:hypoxia","oxygen","ff","assess"],
  h18: ["assess","cpr","adr","ask:gas","cause:hypokalaemia","kcl","ff","assess"],
  h19: ["assess","ask:ecg12","nibp","expert","procain"],
  h20: ["assess","ask:ecg12","nibp","expert","charge","clear","sync","charge","clear","sync","charge","clear","sync","amio1020","charge","clear","sync"],
  h21: ["assess","ask:ecg12","nibp","expert","procain"],
  h22: ["assess","ask:ecg12","nibp","vagal","aden:6","aden:12"]
};
var MODEL_LOG_CACHE = {};

function isModelRequest(a) {
  return !!(a && (a === "nibp" || a.indexOf("ask:") === 0));
}
function snapshotAskState() {
  return {
    mode: typeof askTimerMode !== "undefined" ? askTimerMode : "real",
    now: typeof askFakeNow !== "undefined" ? askFakeNow : 0,
    seq: typeof askFakeSeq !== "undefined" ? askFakeSeq : 0,
    queue: typeof askFakeQueue !== "undefined" ? askFakeQueue.slice() : [],
    pending: typeof ASK_PENDING !== "undefined" ? ASK_PENDING.slice() : [],
    real: typeof askRealTimeouts !== "undefined" ? askRealTimeouts.slice() : []
  };
}
function restoreAskState(s) {
  if (!s || typeof askTimerMode === "undefined") return;
  askTimerMode = s.mode;
  askFakeNow = s.now;
  askFakeSeq = s.seq;
  askFakeQueue = s.queue;
  ASK_PENDING = s.pending;
  askRealTimeouts = s.real;
}
function modelFlushPending() {
  if (typeof ASK_PENDING === "undefined" || !ASK_PENDING.length) return;
  var now = askNow(), maxLeft = 0;
  ASK_PENDING.forEach(function (p) {
    var left = (p.dueAt || 0) - now;
    if (left > maxLeft) maxLeft = left;
  });
  if (maxLeft > 0) {
    SIM.clock += Math.max(1, Math.round(maxLeft / 1000));
    if (typeof advanceAskTimers === "function") advanceAskTimers(maxLeft);
  }
}
function startModelScenario(id) {
  var s = SCN[id];
  if (!s) return false;
  SIM = { scn: s, clock: 0, cpr: false, cycleOpen: false, handsOffFrom: s.start.pulse ? null : 0, cycleStart: 0, cycles: 0, cycleCount: 0, shocks: 0, adrT: [], amio: false, atro: 0, aden: 0, sync: 0, nShocks: 0, random: false, pulse: s.start.pulse, vit: Object.assign({}, s.start.vit), log: [], did: {}, done: false, phase: "", cycleWarned: false, lastFb: null, nudgeStreak: 0, reviews: 0, actionN: 0, idleSinceDue: 0, regCalls: 0, endedDue: null, endReason: "", monitorReady: false, wasDue: {}, reviewsWhenReady: null, actionsWhenReady: null, asked: {}, found: {}, checksAfter3: 0, rhythmChecks: 0, lastCheckAt: null, lastAtroT: null, atroT: [], shockMissNudged: false };
  if (typeof initScenarioExtras === "function") initScenarioExtras(SIM);
  SIM.rhythm = s.start.rhythm;
  logEvent(null, "Scenario started. " + s.scene.split(". ")[0] + ".");
  return true;
}
function runModelLog(id) {
  if (MODEL_LOG_CACHE[id] && MODEL_LOG_CACHE[id].length) return MODEL_LOG_CACHE[id];
  var acts = MODEL_ACTS[id];
  if (!acts || !SCN[id] || typeof doAction !== "function") return [];
  var savedSIM = SIM, savedLast = typeof lastScn !== "undefined" ? lastScn : null, askState = snapshotAskState();
  MODEL_RUNNING = true;
  try {
    askTimerMode = "fake";
    askFakeNow = 0;
    askFakeQueue = [];
    ASK_PENDING = [];
    if (!startModelScenario(id)) return [];
    var i, a, prevReq = false;
    for (i = 0; i < acts.length; i++) {
      if (!SIM || SIM.done) break;
      a = acts[i];
      if (prevReq && !isModelRequest(a)) modelFlushPending();
      doAction(a);
      prevReq = isModelRequest(a);
    }
    modelFlushPending();
    MODEL_LOG_CACHE[id] = (SIM && SIM.log) ? SIM.log.slice() : [];
    return MODEL_LOG_CACHE[id];
  } catch (err) {
    return [];
  } finally {
    MODEL_RUNNING = false;
    SIM = savedSIM;
    if (typeof lastScn !== "undefined") lastScn = savedLast;
    restoreAskState(askState);
  }
}
function renderEventLogItems(log) {
  return (log || []).map(function (li) {
    var o = li.o;
    if (o) {
      return "<li><span class='log-t'>" + mmss(li.t) + "</span><span class='log-mark' aria-hidden='true'>" + VERD[o.v][0] + "</span><span class='log-text'><strong>" + esc(li.text) + "</strong> <span class='log-verdict'>" + esc(logVerdictLabel(o)) + "</span></span></li>";
    }
    return "<li><span class='log-t'>" + mmss(li.t) + "</span><span class='log-mark' aria-hidden='true'>\u2022</span><span class='log-text'><em>" + esc(li.text) + "</em></span></li>";
  }).join("");
}
function renderYourEventLog(userLog) {
  var html = "<section class='log-compare-card' aria-labelledby='scnYourLogTitle'>";
  html += "<h4 class='viva-group' id='scnYourLogTitle'>Your event log</h4>";
  html += "<p class='ideal-lead'>What you did in this attempt, in the same format as the event log during the case.</p>";
  html += "<div class='scn-log-scroll' tabindex='0' aria-label='Your event log, newest at the bottom'><ol class='scn-log'>" + renderEventLogItems(userLog) + "</ol></div></section>";
  return html;
}
function renderModelEventLog(s) {
  var model = [];
  try { model = runModelLog(s && s.id) || []; } catch (err) { model = []; }
  var html = "<section class='log-compare-card log-compare-model' aria-labelledby='scnModelLogTitle'>";
  html += "<h4 class='viva-group' id='scnModelLogTitle'>Model answer event log</h4>";
  html += "<p class='ideal-lead'>A guide, not the only acceptable sequence. Times come from a simulated perfect run of this case, including helpful requests such as a 12-lead ECG or a blood gas where they add information.</p>";
  html += "<div class='scn-log-scroll' tabindex='0' aria-label='Model answer event log, a guide, newest at the bottom'><ol class='scn-log' id='scnModelLog'>" + renderEventLogItems(model) + "</ol></div></section>";
  return html;
}
function renderLogCompare(s, userLog) {
  return "<div class='log-compare' id='scnLogCompare'>" + renderYourEventLog(userLog) + renderModelEventLog(s) + "</div>";
}

window.__scnIdeal = { paths: IDEAL_PATHS, mark: markIdealPath, render: renderIdealPath, modelActs: MODEL_ACTS, runModel: runModelLog };

(function bootScenarioPage() {
  if (!$("scnWrap") || $("learnWrap")) return;
  mode = "scenario";
  document.body.classList.add("mode-scn");
  $("scnWrap").classList.remove("hidden");
  if (typeof showChooser === "function") showChooser();
  var raw = (location.hash || "").replace(/^#/, "").split(/[?&]/)[0];
  if (raw && typeof SCN !== "undefined" && SCN[raw]) startScenario(raw);
})();
