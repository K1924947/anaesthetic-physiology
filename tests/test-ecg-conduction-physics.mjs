// Physics checks: lead polarity = projection of the heart vector on each lead axis, plus textbook features.
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;
const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8781";
let failed = 0;
const check = (name, ok, extra) => { console.log(ok ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); if (!ok) failed++; };

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(BASE + "/ECG_Conduction.html", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.ECGConduction);

const r = await page.evaluate(() => {
  const E = window.ECGConduction, LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
  // Independent lead axes, as drawn on the wheels.
  const F = { I: 0, II: 60, III: 120, aVF: 90, aVL: -30, aVR: -150 }, H = { V1: 115, V2: 94, V3: 75, V4: 60, V5: 30, V6: 0 };
  const rad = (d) => d * Math.PI / 180;
  const out = { sign: {}, maxErr: 0, feat: {} };
  for (const c of ["normal", "rbbb", "lbbb"]) {
    let mism = 0, n = 0;
    for (const L of LEADS) for (let t = 0; t < 800; t += 2) {
      const v = E.vectorAt(c, t);
      const p = F[L] !== undefined ? v.x * Math.cos(rad(F[L])) + v.y * Math.sin(rad(F[L])) : v.x * Math.cos(rad(H[L])) + v.z * Math.sin(rad(H[L]));
      const s = E.sample(c, L, t);
      if (Math.abs(p) > 0.03) { n++; if (Math.sign(p) !== Math.sign(s)) mism++; }
    }
    out.sign[c] = { mism, n };
  }
  const tr = (c, L, a, b) => { const o = []; for (let t = a; t <= b; t++) o.push(E.sample(c, L, t)); return o; };
  const first = (arr, th) => { for (const x of arr) if (Math.abs(x) > th) return Math.sign(x); return 0; };
  const peaks = (arr, th) => { // signed sequence of lobes above threshold
    const seq = []; let cur = 0, best = 0;
    for (const x of arr) { const s = Math.abs(x) > th ? Math.sign(x) : 0; if (s && s !== cur) { if (cur) seq.push(cur * best); cur = s; best = 0; } if (s === cur && s) best = Math.max(best, Math.abs(x)); }
    if (cur) seq.push(cur * best); return seq; };
  // QRS = span where any lead is changing fast (slope > 0.007 mV/ms), so a slow ST shift is not counted.
  const width = (c) => { let a = -1, b = -1; for (let t = 140; t < 340; t++) { const m = Math.max(...LEADS.map((L) => Math.abs(E.sample(c, L, t + 1) - E.sample(c, L, t - 1)) / 2)); if (m > 0.007) { if (a < 0) a = t; b = t; } } return b - a; };
  const area = (c, L, a, b) => tr(c, L, a, b).reduce((s, x) => s + x, 0);
  const tPeak = (c, L) => { const sg = E.segs(c).find((s) => s[0] === "T"); const a = tr(c, L, sg[1], sg[2]); return a.reduce((m, x) => Math.abs(x) > Math.abs(m) ? x : m, 0); };
  const f = out.feat;
  f.Pwave = { II: peaks(tr("normal", "II", 0, 100), .03), aVR: peaks(tr("normal", "aVR", 0, 100), .03), V1: peaks(tr("normal", "V1", 0, 100), .02) };
  f.width = { normal: width("normal"), rbbb: width("rbbb"), lbbb: width("lbbb") };
  f.normalFirst = Object.fromEntries(["I", "aVL", "V6", "V1"].map((L) => [L, first(tr("normal", L, 150, 260), .03)]));
  f.normalT = Object.fromEntries(["I", "II", "aVR", "V4", "V5", "V6"].map((L) => [L, [Math.sign(area("normal", L, 155, 250)), Math.sign(tPeak("normal", L))]]));
  f.rbbbV1 = peaks(tr("rbbb", "V1", 150, 310), .05);
  f.rbbbTerminal = Object.fromEntries(["I", "V6", "aVR", "V1"].map((L) => [L, E.sample("rbbb", L, 262)]));
  f.rbbbT = Object.fromEntries(["V1", "V2", "I", "V6"].map((L) => [L, tPeak("rbbb", L)]));
  f.lbbbFirst = Object.fromEntries(["I", "aVL", "V6"].map((L) => [L, Math.min(...tr("lbbb", L, 150, 205))]));
  f.lbbbV1net = area("lbbb", "V1", 155, 305);
  f.lbbbV6 = peaks(tr("lbbb", "V6", 150, 310), .05);
  f.lbbbV6notch = (() => { const a = tr("lbbb", "V6", 190, 280); let mx = 0; for (let i = 1; i < a.length - 1; i++) if (a[i] > a[i - 1] && a[i] >= a[i + 1]) mx++; return mx; })();
  f.lbbbT = Object.fromEntries(["I", "aVL", "V6", "V1"].map((L) => [L, [Math.sign(area("lbbb", L, 155, 305)), Math.sign(tPeak("lbbb", L))]]));
  const stS = E.segs("lbbb").find((s) => s[0] === "ST"), stT = Math.round((stS[1] + stS[2]) / 2);
  f.lbbbST = { t: stT, V1: E.sample("lbbb", "V1", stT), V6: E.sample("lbbb", "V6", stT) };
  return out;
});

for (const c of Object.keys(r.sign)) check(`${c}: trace sign = vector projection, all 12 leads`, r.sign[c].mism === 0 && r.sign[c].n > 500, r.sign[c]);
const f = r.feat;
check("P upright in II", f.Pwave.II.length === 1 && f.Pwave.II[0] > 0, f.Pwave.II);
check("P inverted in aVR", f.Pwave.aVR.length === 1 && f.Pwave.aVR[0] < 0, f.Pwave.aVR);
check("P biphasic in V1 (positive then negative)", f.Pwave.V1.length === 2 && f.Pwave.V1[0] > 0 && f.Pwave.V1[1] < 0, f.Pwave.V1);
check("normal QRS 70 to 100 ms (LITFL normal range)", f.width.normal >= 70 && f.width.normal <= 100, f.width);
check("BBB QRS >= 120 ms", f.width.rbbb >= 120 && f.width.lbbb >= 120, f.width);
check("normal septal q in I, aVL, V6 and r in V1", f.normalFirst.I < 0 && f.normalFirst.aVL < 0 && f.normalFirst.V6 < 0 && f.normalFirst.V1 > 0, f.normalFirst);
check("normal T concordant with QRS", Object.values(f.normalT).every(([q, t]) => q === t), f.normalT);
check("RBBB rSR' in V1 (R' taller than r)", f.rbbbV1.length === 3 && f.rbbbV1[0] > 0 && f.rbbbV1[1] < 0 && f.rbbbV1[2] > f.rbbbV1[0], f.rbbbV1);
check("RBBB terminal S in I and V6, R' in aVR and V1", f.rbbbTerminal.I < -0.1 && f.rbbbTerminal.V6 < -0.1 && f.rbbbTerminal.aVR > 0.1 && f.rbbbTerminal.V1 > 0.1, f.rbbbTerminal);
check("RBBB T inverted V1-V2, upright I and V6", f.rbbbT.V1 < 0 && f.rbbbT.V2 < 0 && f.rbbbT.I > 0 && f.rbbbT.V6 > 0, f.rbbbT);
check("LBBB no septal q in I, aVL, V6", Object.values(f.lbbbFirst).every((x) => x > -0.03), f.lbbbFirst);
check("LBBB dominant S in V1", f.lbbbV1net < 0, f.lbbbV1net);
check("LBBB broad notched R in V6", f.lbbbV6.length === 1 && f.lbbbV6[0] > 0 && f.lbbbV6notch >= 2, { lobes: f.lbbbV6, maxima: f.lbbbV6notch });
check("LBBB T discordant in I, aVL, V6, V1", Object.values(f.lbbbT).every(([q, t]) => q === -t), f.lbbbT);
check("LBBB ST up in V1, down in V6", f.lbbbST.V1 > 0.05 && f.lbbbST.V6 < -0.05, f.lbbbST);
await browser.close();
process.exit(failed ? 1 : 0);
