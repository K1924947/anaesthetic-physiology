// Published-criteria checks: amplitudes and durations of every lead in all three conditions, measured from the model
// trace the way a reader would, against LITFL and Klabunde values. Set CRITERIA_OUT=path.md to also write the table.
import fs from "fs";
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;
const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8781";
let failed = 0;
const rows = [];
const check = (cond, name, value, range, source, ok) => {
  console.log(ok ? "PASS" : "FAIL", cond + ": " + name, JSON.stringify({ value, range }));
  rows.push([cond, name, value, range, source, ok ? "pass" : "FAIL"]); if (!ok) failed++;
};
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(BASE + "/ECG_Conduction.html", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.ECGConduction);

const m = await page.evaluate(() => {
  const E = window.ECGConduction, LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"], TH = .02, out = {};
  for (const c of ["normal", "rbbb", "lbbb"]) {
    const s = (L, t) => E.sample(c, L, t), seg = Object.fromEntries(E.segs(c).map((x) => [x[0], [x[1], x[2]]]));
    const any = (t) => LEADS.some((L) => Math.abs(s(L, t)) > TH);
    let pOn = null, pOff = null; for (let t = 0; t < 140; t++) if (any(t)) { if (pOn === null) pOn = t; pOff = t; }
    let qOn = null; for (let t = 140; t < seg.QRS[1]; t++) if (any(t)) { qOn = t; break; }
    const qOff = seg.QRS[1];
    const L = {};
    for (const ld of LEADS) {
      let pMax = 0, pMin = 0, pNegW = 0; for (let t = 0; t < 140; t++) { const v = s(ld, t); pMax = Math.max(pMax, v); pMin = Math.min(pMin, v); if (v < -TH) pNegW++; }
      let r = 0, rT = null, sMin = 0, firstPos = null; for (let t = qOn; t <= qOff; t++) { const v = s(ld, t); if (v > r) { r = v; rT = t; } if (firstPos === null && v > TH) firstPos = t; }
      let q = 0, qW = 0; if (firstPos !== null) for (let t = qOn; t < firstPos; t++) { const v = s(ld, t); if (v < -TH) { qW++; q = Math.min(q, v); } }
      let sW = 0; for (let t = firstPos === null ? qOn : firstPos; t <= qOff; t++) { const v = s(ld, t); if (v < sMin) sMin = v; if (v < -TH) sW++; }
      let tMax = 0, tMin = 0; for (let t = seg.T[0]; t <= seg.T[1]; t++) { tMax = Math.max(tMax, s(ld, t)); tMin = Math.min(tMin, s(ld, t)); }
      L[ld] = { pMax, pMin, pNegW, r, rpt: rT === null ? null : rT - qOn, q: -q, qW, s: -sMin, sW, st: s(ld, qOff + 60), t: Math.abs(tMax) >= Math.abs(tMin) ? tMax : tMin,
        bumps: E.bumps(c, ld).map((b) => b.name), bumpAmp: E.bumps(c, ld).map((b) => b.amp) };
    }
    let aI = 0, aF = 0, pI = 0, pF = 0; for (let t = qOn; t <= qOff; t++) { aI += s("I", t); aF += s("aVF", t); } for (let t = 0; t < 140; t++) { pI += s("I", t); pF += s("aVF", t); }
    // T end by the tangent (maximum slope) method, latest of II and V5.
    const tEnd = (ld) => { let pk = seg.T[0], pv = 0; for (let t = seg.T[0]; t <= seg.T[1]; t++) if (Math.abs(s(ld, t)) > Math.abs(pv)) { pv = s(ld, t); pk = t; }
      let best = 0, bt = pk; for (let t = pk; t < seg.T[1] + 40; t++) { const d = (s(ld, t + 1) - s(ld, t)) * Math.sign(pv); if (d < best) { best = d; bt = t; } }
      return bt + Math.abs(s(ld, bt) / best); };
    const qt = Math.max(tEnd("II"), tEnd("V5")) - qOn;
    out[c] = { pDur: pOff - pOn + 1, pr: qOn - pOn, qrs: qOff - qOn, qrsAxis: Math.atan2(aF, aI) * 180 / Math.PI, pAxis: Math.atan2(pF, pI) * 180 / Math.PI, qt, rr: 800, L };
  }
  return out;
});
const f = (x, d = 2) => +x.toFixed(d), N = m.normal, RB = m.rbbb, LB = m.lbbb, LIMB = ["I", "II", "III", "aVR", "aVL", "aVF"], CHEST = ["V1", "V2", "V3", "V4", "V5", "V6"];
const LP = "LITFL P wave", LQ = "LITFL Q wave", LT = "LITFL T wave", LTMP = "LITFL ECG exam template", K = "Klabunde a009";
// ---- Normal ----
check("Normal", "P duration (ms)", N.pDur, "< 120 (LITFL); 80 to 100 (Klabunde)", LP + "; " + K, N.pDur < 120 && N.pDur >= 80 && N.pDur <= 100);
const pLimb = Math.max(...LIMB.map((l) => Math.max(N.L[l].pMax, -N.L[l].pMin))), pChest = Math.max(...CHEST.map((l) => Math.max(N.L[l].pMax, -N.L[l].pMin)));
check("Normal", "P amplitude, limb leads (mV)", f(pLimb), "< 0.25", LP, pLimb < .25);
check("Normal", "P amplitude, chest leads (mV)", f(pChest), "< 0.15", LP, pChest < .15);
check("Normal", "P axis (degrees)", f(N.pAxis, 0), "0 to +75", LP, N.pAxis >= 0 && N.pAxis <= 75);
check("Normal", "P upright I, II, aVF, V2 to V6; inverted aVR; biphasic V1", ["I", "II", "aVF", "V2", "V3", "V4", "V5", "V6"].every((l) => N.L[l].pMax > .03) ? "yes" : "no", "yes", LP + "; " + LTMP,
  ["I", "II", "aVF", "V2", "V3", "V4", "V5", "V6"].every((l) => N.L[l].pMax > .03 && N.L[l].pMax > -N.L[l].pMin) && N.L.aVR.pMin < -.03 && N.L.aVR.pMax < .02 && N.L.V1.pMax > .03 && N.L.V1.pMin < -.03);
check("Normal", "V1 P: positive part (mV); negative part depth (mV) / width (ms)", f(N.L.V1.pMax) + "; " + f(-N.L.V1.pMin) + " / " + N.L.V1.pNegW, "positive <= 0.15 (no RAE); not both > 0.1 mV and > 40 ms (no LAE); similar sizes", LP,
  N.L.V1.pMax <= .15 && !(-N.L.V1.pMin > .1 && N.L.V1.pNegW > 40) && -N.L.V1.pMin <= N.L.V1.pMax);
check("Normal", "PR interval (ms)", N.pr, "120 to 200", K + "; " + LTMP, N.pr >= 120 && N.pr <= 200);
check("Normal", "QRS duration (ms)", N.qrs, "60 to 100 (Klabunde); 60 to 110 (LITFL)", K + "; " + LTMP, N.qrs >= 60 && N.qrs <= 100);
check("Normal", "QRS axis (degrees)", f(N.qrsAxis, 0), "-30 to +90", "LITFL ECG axis", N.qrsAxis >= -30 && N.qrsAxis <= 90);
const sept = ["I", "aVL", "V5", "V6"];
check("Normal", "septal q present in I, aVL, V5, V6 (mV)", sept.map((l) => f(N.L[l].q)).join(", "), "present (absence in V5 to V6 abnormal)", LQ, sept.every((l) => N.L[l].q > .02));
const qr = ["I", "aVL", "aVF", "V4", "V5", "V6"].map((l) => [l, N.L[l].r ? N.L[l].q / N.L[l].r : 0]);
check("Normal", "q depth / R height in I, aVL, aVF, V4 to V6", qr.map(([l, x]) => l + " " + Math.round(100 * x) + "%").join(", "), "< 25%", LTMP, qr.every(([, x]) => x < .25));
const qMaxW = Math.max(...Object.values(N.L).map((x) => x.qW)), qMaxD = Math.max(...Object.values(N.L).map((x) => x.q));
check("Normal", "q width (ms) / depth (mV), worst lead", qMaxW + " / " + f(qMaxD), "< 40 ms (< 30 ms outside V2 to V3) and < 0.2 mV", LQ + "; " + LTMP, qMaxW < 30 && qMaxD < .2);
check("Normal", "no q in V1 to V3", ["V1", "V2", "V3"].map((l) => f(N.L[l].q)).join(", "), "0", LQ, ["V1", "V2", "V3"].every((l) => N.L[l].q <= .02));
const rs = CHEST.map((l) => N.L[l].r / Math.max(.01, N.L[l].s)), trans = CHEST[rs.findIndex((x) => x >= 1)];
check("Normal", "R/S ratio V1 to V6; transition (first lead with R >= S)", rs.map((x) => f(x, 1)).join(", ") + "; " + trans, "S > R in V1 and V2 (not early); transition V3 or V4", LTMP, rs[0] < 1 && rs[1] < 1 && (trans === "V3" || trans === "V4"));
check("Normal", "R grows V1 to V5; R in V3 (mV)", CHEST.map((l) => f(N.L[l].r)).join(", "), "R V3 > 0.3 (no poor R wave progression)", "LITFL R wave; LITFL PRWP", N.L.V3.r > .3 && [0, 1, 2, 3].every((i) => N.L[CHEST[i + 1]].r > N.L[CHEST[i]].r));
const sok = N.L.V1.s + Math.max(N.L.V5.r, N.L.V6.r), corn = N.L.aVL.r + N.L.V3.s, peg = Math.max(...Object.values(N.L).map((x) => x.s)) + N.L.V4.s;
check("Normal", "Sokolow-Lyon S V1 + max R V5,V6 (mV)", f(sok), "< 3.5 (no LVH)", "LITFL LVH", sok < 3.5);
check("Normal", "Cornell R aVL + S V3 (mV)", f(corn), "<= 2.0 (women's threshold; men 2.8)", "LITFL LVH", corn <= 2.0);
check("Normal", "Peguero-Lo Presti deepest S + S V4 (mV)", f(peg), "< 2.3 (women's threshold; men 2.8)", "LITFL LVH", peg < 2.3);
check("Normal", "R wave peak time aVL, V5, V6 (ms)", ["aVL", "V5", "V6"].map((l) => N.L[l].rpt).join(", "), "<= 45", "LITFL R wave peak time", ["aVL", "V5", "V6"].every((l) => N.L[l].rpt <= 45));
const stMax = Math.max(...Object.values(N.L).map((x) => Math.abs(x.st)));
check("Normal", "ST at J + 60 ms, largest deviation (mV)", f(stMax, 3), "isoelectric (model limit 0.05)", K + " (isoelectric)", stMax < .05);
check("Normal", "T upright in all leads except aVR and V1", Object.entries(N.L).filter(([l, x]) => x.t < 0).map(([l]) => l).join(", ") + " inverted", "only aVR and V1 not upright", LT,
  Object.entries(N.L).every(([l, x]) => (l === "aVR" ? x.t < -.05 : l === "V1" ? x.t <= .05 : x.t > 0)));
const tLimb = Math.max(...LIMB.map((l) => Math.abs(N.L[l].t))), tChest = Math.max(...CHEST.map((l) => Math.abs(N.L[l].t)));
check("Normal", "T amplitude limb / chest (mV)", f(tLimb) + " / " + f(tChest), "< 0.5 / < 1.0 (0.8 in women)", LT, tLimb < .5 && tChest < .8);
const tr = ["I", "II", "aVF", "V4", "V5", "V6"].map((l) => N.L[l].t / N.L[l].r);
check("Normal", "T / R in leads with a dominant R (I, II, aVF, V4 to V6)", tr.map((x) => Math.round(100 * x) + "%").join(", "), "< 2/3 of R", LTMP, tr.every((x) => x < 2 / 3));
const qtc = N.qt / Math.sqrt(N.rr / 1000);
check("Normal", "QT / QTc Bazett at 75 per minute (ms)", Math.round(N.qt) + " / " + Math.round(qtc), "QTc 350 to 440; QT < half RR (400)", "LITFL QT interval", qtc >= 350 && qtc <= 440 && N.qt < N.rr / 2);
// ---- RBBB ----
const LR = "LITFL RBBB";
check("RBBB", "QRS duration (ms)", RB.qrs, "> 120", LR, RB.qrs > 120);
check("RBBB", "RSR' in V1 to V3 (deflections)", ["V1", "V2", "V3"].map((l) => l + " " + RB.L[l].bumps.join(" ")).join("; "), "positive, S, then R'", LR,
  ["V1", "V2", "V3"].every((l) => RB.L[l].bumps.length >= 3 && RB.L[l].bumpAmp[0] > 0 && RB.L[l].bumpAmp[1] < 0 && RB.L[l].bumpAmp[2] > 0 && /R'|r'/.test(RB.L[l].bumps[2])));
check("RBBB", "wide, slurred S in I, aVL, V5, V6: S duration (ms), Normal in brackets", ["I", "aVL", "V5", "V6"].map((l) => l + " " + RB.L[l].sW + " (" + N.L[l].sW + ")").join(", "), "wide: at least 40 ms and wider than Normal (number is the model's, LITFL gives no figure)", LR,
  ["I", "aVL", "V5", "V6"].every((l) => RB.L[l].sW >= 40 && RB.L[l].sW > N.L[l].sW));
check("RBBB", "QRS axis (degrees)", f(RB.qrsAxis, 0), "-30 to +90 (normal in isolated RBBB)", LR, RB.qrsAxis >= -30 && RB.qrsAxis <= 90);
check("RBBB", "early QRS unchanged: septal q in I and V6 (mV), Normal in brackets", ["I", "V6"].map((l) => l + " " + f(RB.L[l].q) + " (" + f(N.L[l].q) + ")").join(", "), "same as Normal", LR, ["I", "V6"].every((l) => Math.abs(RB.L[l].q - N.L[l].q) < .02));
check("RBBB", "ST depression and/or T inversion V1 to V3: T (mV)", ["V1", "V2", "V3"].map((l) => f(RB.L[l].t)).join(", "), "inverted", LR + "; " + LT, ["V1", "V2", "V3"].every((l) => RB.L[l].t < -.05 || RB.L[l].st < -.05));
// ---- LBBB ----
const LL = "LITFL LBBB";
check("LBBB", "QRS duration (ms)", LB.qrs, ">= 120", LL, LB.qrs >= 120);
check("LBBB", "V1 dominant S: r / S (mV)", f(LB.L.V1.r) + " / " + f(LB.L.V1.s), "rS or QS", LL, LB.L.V1.s > 3 * LB.L.V1.r && LB.L.V1.q <= .02);
check("LBBB", "broad R, no S, in I, aVL, V5, V6 (S mV)", ["I", "aVL", "V5", "V6"].map((l) => l + " " + f(LB.L[l].s)).join(", "), "monophasic or notched R", LL, ["I", "aVL", "V5", "V6"].every((l) => LB.L[l].s < .03 && LB.L[l].r > .3));
check("LBBB", "no q in I, aVL, V5, V6 (mV)", ["I", "aVL", "V5", "V6"].map((l) => f(LB.L[l].q)).join(", "), "0", LL + "; " + LQ, ["I", "aVL", "V5", "V6"].every((l) => LB.L[l].q <= .02));
check("LBBB", "R wave peak time V5, V6 (ms)", LB.L.V5.rpt + ", " + LB.L.V6.rpt, "> 60", LL, LB.L.V5.rpt > 60 && LB.L.V6.rpt > 60);
const stRatio = ["V1", "V2", "V3"].map((l) => LB.L[l].st / LB.L[l].s);
check("LBBB", "ST elevation V1 to V3 as % of the S", stRatio.map((x) => Math.round(100 * x) + "%").join(", "), "> 0 and < 25% (appropriate discordance)", LL, stRatio.every((x) => x > 0 && x < .25));
check("LBBB", "lateral ST down and T inverted (I, aVL, V5, V6): T (mV)", ["I", "aVL", "V5", "V6"].map((l) => f(LB.L[l].t)).join(", "), "T inverted, ST not raised", LL + "; " + LT, ["I", "aVL", "V5", "V6"].every((l) => LB.L[l].t < -.05 && LB.L[l].st <= .01));
check("LBBB", "poor R wave progression: R in V3 (mV)", f(LB.L.V3.r), "<= 0.3 (associated feature)", LL + "; LITFL PRWP", LB.L.V3.r <= .3);
for (const [c, x] of [["RBBB", RB], ["LBBB", LB]]) check(c, "P and PR unchanged from Normal (ms)", x.pDur + " / " + x.pr, "same as Normal within 5 ms", K, Math.abs(x.pDur - N.pDur) <= 5 && Math.abs(x.pr - N.pr) <= 5);

if (process.env.CRITERIA_OUT) {
  const md = ["| Condition | Criterion | Model value | Range | Source | Result |", "| --- | --- | --- | --- | --- | --- |"].concat(rows.map((r) => "| " + r.join(" | ") + " |"));
  fs.writeFileSync(process.env.CRITERIA_OUT, md.join("\n") + "\n");
}
await browser.close();
process.exit(failed ? 1 : 0);
