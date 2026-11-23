import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;
const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8781";
const SHOT = process.env.SHOT || "";
let failed = 0;
const check = (name, ok, extra) => { console.log(ok ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); if (!ok) failed++; };

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(BASE + "/ECG_Conduction.html", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.ECGConduction);

check("noindex", await page.$eval('meta[name="robots"]', (m) => /noindex/.test(m.content)));
const fit = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth }));
check("fits 1280x800 without scrolling", fit.sh <= fit.ih && fit.sw <= 1280, fit);

const q0 = await page.$eval("#ecgcQrs", (e) => +e.dataset.qrs);
await page.click('[data-cond="lbbb"]');
const q1 = await page.$eval("#ecgcQrs", (e) => +e.dataset.qrs);
check("condition switch widens QRS", q0 < 120 && q1 >= 120, { normal: q0, lbbb: q1 });

const before = await page.$eval("#ecgcWheelMark-B", (g) => ({ lead: g.dataset.lead, t: g.getAttribute("transform"), wheel: g.ownerSVGElement.id }));
await page.selectOption('select[data-slot="1"]', "aVL");
const after = await page.$eval("#ecgcWheelMark-B", (g) => ({ lead: g.dataset.lead, t: g.getAttribute("transform"), wheel: g.ownerSVGElement.id }));
check("dropdown changes lead and electrode marker", before.lead === "V1" && after.lead === "aVL" && before.t !== after.t, { before, after });
await page.selectOption('select[data-slot="1"]', "V1");

const box = await page.$eval("#ecgcScrub", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await page.mouse.click(box.x + box.w * 0.29, box.y + box.h / 2);
const ms = await page.$eval("#ecgcMs", (e) => +e.textContent);
const playing = await page.evaluate(() => window.ECGConduction.state.playing);
check("scrubbing sets the readout and pauses", Math.abs(ms - 232) < 12 && !playing, { ms, playing });

await page.keyboard.press("ArrowRight");
const ms2 = await page.$eval("#ecgcMs", (e) => +e.textContent);
check("scrubber is keyboard operable", ms2 === ms + 1, { ms, ms2 });

// Round 5: step-through story, bump labels on the focus lead, tap a bump to jump the clock.
const steps = await page.evaluate(() => { const E = window.ECGConduction; const o = {};
  for (const c of ["normal", "rbbb", "lbbb"]) { const st = E.steps(c, "aVL"); o[c] = { n: st.length, ids: st.flatMap((s) => s.ids), allText: st.every((s) => s.text && s.text.length > 20 && s.t >= 0) }; }
  return o; });
check("step-through steps exist for all 3 conditions",
  ["normal", "rbbb", "lbbb"].every((c) => steps[c].n >= 8 && steps[c].allText && steps[c].ids.includes("bump1") && steps[c].ids.includes("t")) &&
  steps.normal.ids.includes("septum") && steps.rbbb.ids.includes("slow-rv") && steps.lbbb.ids.includes("slow-lv"), steps);

await page.click("#ecgcStep");
await page.click("#ecgcNext");
const stepUi = await page.evaluate(() => ({ idx: window.ECGConduction.state.stepIdx, sent: document.getElementById("ecgcSentence").textContent, back: !document.getElementById("ecgcBack").hidden }));
check("Step through and Next advance the story", stepUi.idx === 1 && /^Step 2 of \d+: /.test(stepUi.sent) && stepUi.back, stepUi);
await page.click("#ecgcStep");

const lab = await page.evaluate(() => { const E = window.ECGConduction; E.setCondition("lbbb"); E.setLead(0, "aVL"); E.setFocus(0);
  const bs = E.bumps("lbbb", "aVL"), seen = [];
  for (const b of bs) { E.setTime(b.peak); seen.push(document.querySelector(".ecgc-lead.is-focus .ecgc-lead-note").textContent); }
  return { names: bs.map((b) => b.name), labels: bs.map((b) => b.label), seen, focusLead: document.querySelector(".ecgc-lead.is-focus select").value }; });
check("bump labels exist for the focus lead", lab.focusLead === "aVL" && lab.names.length >= 2 && lab.labels.every((l) => / (fast route|slow cell to cell)/.test(l)) &&
  lab.seen.every((t, i) => t.startsWith(lab.names[i] + ":")), lab);

const tap = await page.evaluate(() => { const E = window.ECGConduction; const b = E.bumps("lbbb", "aVL").find((x) => x.name === "2nd R") || E.bumps("lbbb", "aVL")[0];
  E.setTime(40); const cv = document.querySelector(".ecgc-lead.is-focus canvas"), r = cv.getBoundingClientRect(), left = 34, pw = r.width - left - 4;
  return { peak: b.peak, x: r.left + left + (b.peak + 4) / 800 * pw, y: r.top + r.height / 2 }; });
await page.mouse.click(tap.x, tap.y);
const tapped = await page.evaluate(() => ({ t: window.ECGConduction.state.t, playing: window.ECGConduction.state.playing, link: document.querySelector("#ecgcLink line").getAttribute("opacity") }));
check("tapping a bump sets the clock to it and shows the link", tapped.t === tap.peak && !tapped.playing && tapped.link === "1", { tap, tapped });

// Round 7: both lead wheels, narration for every step, and everything still fits at every step.
const wh = await page.evaluate(() => { const E = window.ECGConduction; E.setCondition("lbbb"); E.setLead(0, "aVL"); E.setLead(1, "V1"); E.setFocus(0); E.setTime(230);
  return Object.assign(E.wheels(), { focusAxis: !!document.querySelector("#ecgcSvg line[stroke-dasharray='6 5']"), papillary: document.querySelectorAll("#ecgcSvg path[d^='M300,352 C308']").length }); });
check("limb (hexaxial) and chest wheels exist with live vector and markers", wh.limb.length === 6 && wh.chest.length === 6 && wh.limbVec === "1" && wh.chestVec === "1" &&
  wh.marks[0].wheel === "ecgcWheelF" && wh.marks[1].wheel === "ecgcWheelH" && wh.focusAxis && wh.papillary === 0, wh);
const narr = await page.evaluate(() => { const E = window.ECGConduction, bad = [], over = []; let n = 0;
  for (const c of ["normal", "rbbb", "lbbb"]) for (const L of ["aVL", "II", "V1", "V6"]) {
    E.setCondition(c); E.setLead(0, L); E.setFocus(0); E.stepMode(true);
    for (const s of E.steps(c, L)) { n++; const x = E.narration(c, L, s.t), lines = [x.where, x.how, x.sees, x.trace].filter((v) => v && v.length > 15);
      if (lines.length < 4 || !x.title || (c !== "normal" && s.t >= 128 && s.t < 560 && !x.diff)) bad.push([c, L, s.id]);
      E.goStep(s.id); const p = document.querySelector(".ecgc-narr");
      if (document.documentElement.scrollHeight > innerHeight || p.scrollHeight > p.clientHeight + 1 || !document.getElementById("ecgcNSees").textContent.startsWith(L + " looks")) over.push([c, L, s.id]); }
    E.stepMode(false); }
  return { n, bad, over }; });
check("every step has narration lines (Where, How, lead sees, On the trace; Different from normal in blocks) and fits", narr.n > 100 && !narr.bad.length && !narr.over.length, narr);

// Round 6: anatomy and bundle visibility.
const cav = await page.evaluate(() => window.ECGConduction.cavityHits());
check("every conduction route sits in a wall (only the moderator band crosses a cavity)", Object.entries(cav).every(([k, v]) => k === "mod" ? v > 0 : v === 0), cav);
const lbVis = await page.evaluate(() => { const E = window.ECGConduction, o = {};
  for (const c of ["normal", "rbbb", "lbbb"]) { E.setCondition(c); o[c] = { lb: E.bundleStyle("lb"), rb: E.bundleStyle("rb") }; }
  return o; });
const solid = (s) => s.dash === "none" && s.width >= 3, partDashed = (s) => s.dash !== "none" && parseFloat(s.dash) > 5 && s.width >= 3;
check("left and right bundles clearly drawn; blocked one solid to the X, dashed beyond",
  solid(lbVis.normal.lb) && solid(lbVis.normal.rb) && solid(lbVis.rbbb.lb) && partDashed(lbVis.rbbb.rb) && solid(lbVis.lbbb.rb) && partDashed(lbVis.lbbb.lb) && lbVis.lbbb.lb.stroke === "#4E5968", lbVis);

// Round 8: animation matches the vector and the ECG.
const anim = await page.evaluate(() => { const E = window.ECGConduction, o = { unsorted: [], dup: [] };
  for (const c of ["normal", "rbbb", "lbbb"]) for (const L of ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]) {
    const st = E.steps(c, L);
    for (let i = 1; i < st.length; i++) { if (st[i].t < st[i - 1].t) o.unsorted.push([c, L, st[i].id]); if (st[i].t - st[i - 1].t < 5) o.dup.push([c, L, st[i - 1].id, st[i].id]); } }
  o.paths = { normal: E.paths("normal"), rbbb: E.paths("rbbb"), lbbb: E.paths("lbbb") };
  o.reg = { normal: E.regions("normal"), rbbb: E.regions("rbbb"), lbbb: E.regions("lbbb") };
  o.slowNormal = E.model("normal").slowPoints;
  o.gap = { rbbb: E.activationGap("rbbb"), lbbb: E.activationGap("lbbb") };
  o.aVL2 = (E.bumps("lbbb", "aVL").find((b) => b.name === "2nd R") || {}).peak;
  o.v1 = (E.bumps("lbbb", "V1").find((b) => /QS|S/.test(b.name)) || {}).label || "";
  o.lbTitles = E.steps("lbbb", "aVL").map((s) => E.narration("lbbb", "aVL", s.t).title);
  return o; });
check("steps are in time order with no two under 5 ms apart (all conditions, all 12 leads)", !anim.unsorted.length && !anim.dup.length, { unsorted: anim.unsorted, dup: anim.dup });
const speedBad = [];
for (const k of Object.keys(anim.paths.normal)) for (const c of ["rbbb", "lbbb"]) { const a = anim.paths.normal[k], b = anim.paths[c][k];
  if (b && (Math.abs(a.len / a.dur - b.len / b.dur) > 1e-6 || Math.abs(a.start - b.start) > 1e-6)) speedBad.push([k, c]); }
check("each fast route has the same drawn speed and timing in every condition", !speedBad.length && Object.keys(anim.paths.rbbb).length > 5, speedBad);
check("Normal: no slow (orange chevron) muscle anywhere", anim.slowNormal === 0, anim.slowNormal);
const lw = anim.reg.lbbb.LVW, la = anim.reg.lbbb.LVA;
check("LBBB lateral wall lights up with its vector and the 2nd R in aVL (within 5 ms); apex with its component",
  Math.abs(lw.median - 262) <= 5 && Math.abs(lw.median - anim.aVL2) <= 5 && Math.abs(la.median - 230) <= 5, { lw, la, aVL2: anim.aVL2 });
check("LBBB septum crossing is mostly slow; RBBB slow front is continuous; unaffected LV base keeps Normal timing in RBBB",
  anim.reg.lbbb.SEP.slowFrac > .6 && anim.gap.rbbb < 10 && anim.reg.rbbb.RV.first - anim.reg.rbbb.SEP.last < 10 &&
  Math.abs(anim.reg.rbbb.LVB.median - anim.reg.normal.LVB.median) < 1, { sep: anim.reg.lbbb.SEP, gap: anim.gap, rbbbRV: anim.reg.rbbb.RV, lvb: [anim.reg.rbbb.LVB, anim.reg.normal.LVB] });
check("LBBB steps include the slow crawl through the LV wall, and V1 QS credits the septum first", anim.lbTitles.some((t) => /Slow crawl through the LV wall/.test(t)) &&
  anim.lbTitles.some((t) => /Slow crawl across the septum/.test(t)) && /septum, then/.test(anim.v1), { titles: anim.lbTitles, v1: anim.v1 });

// Round 9: repolarisation (recovery) map.
const rep = await page.evaluate(() => { const E = window.ECGConduction, o = {}, AX = { I: 0, II: 60, III: 120, aVF: 90, aVL: -30, aVR: -150 };
  for (const c of ["normal", "rbbb", "lbbb"]) { const r = E.recovery(c), T = {}, agree = [];
    for (const L of ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]) { let big = 0, tp = 0; for (let t = r.tS; t <= r.tE; t++) { const v = E.sample(c, L, t); if (Math.abs(v) > Math.abs(big)) { big = v; tp = t; } } T[L] = { v: big, tp }; }
    for (const L of Object.keys(AX)) if (Math.abs(T[L].v) >= .15) { const a = AX[L] * Math.PI / 180, p = r.dipole.x * Math.cos(a) + r.dipole.y * Math.sin(a); agree.push([L, Math.sign(p) === Math.sign(T[L].v)]); }
    o[c] = { T, agree, rec: r, peakII: T.II.tp, peakMax: Object.values(T).sort((x, y) => Math.abs(y.v) - Math.abs(x.v))[0].tp }; }
  E.setCondition("normal"); E.setTime(300); const st = E.recoveryShown(); E.setTime(435); const mid = E.recoveryShown(); E.setTime(560); const after = E.recoveryShown();
  o.shown = { st, mid, after }; return o; });
const sg = (c, L) => Math.sign(rep[c].T[L].v) * (Math.abs(rep[c].T[L].v) >= .05 ? 1 : 0);
check("T polarity: Normal I, II, V5, V6 up, aVR down, V1 flat or negative; RBBB V1 to V3 inverted; LBBB I, aVL, V5, V6 inverted, V1 to V3 upright",
  ["I", "II", "V5", "V6"].every((L) => sg("normal", L) > 0) && sg("normal", "aVR") < 0 && rep.normal.T.V1.v <= .05 &&
  ["V1", "V2", "V3"].every((L) => sg("rbbb", L) < 0) && ["I", "aVL", "V5", "V6"].every((L) => sg("lbbb", L) < 0) && ["V1", "V2", "V3"].every((L) => sg("lbbb", L) > 0),
  Object.fromEntries(["normal", "rbbb", "lbbb"].map((c) => [c, Object.fromEntries(Object.entries(rep[c].T).map(([L, x]) => [L, +x.v.toFixed(2)]))])));
check("recovery map dipole gives the same T polarity as the trace in every limb lead with a clear T (all 3 conditions)",
  ["normal", "rbbb", "lbbb"].every((c) => rep[c].agree.length >= 3 && rep[c].agree.every((x) => x[1])), Object.fromEntries(["normal", "rbbb", "lbbb"].map((c) => [c, rep[c].agree])));
check("T peak within 10 ms of the middle of recovery (all 3 conditions)", ["normal", "rbbb", "lbbb"].every((c) => Math.abs(rep[c].peakMax - rep[c].rec.median) <= 10),
  Object.fromEntries(["normal", "rbbb", "lbbb"].map((c) => [c, [rep[c].peakMax, Math.round(rep[c].rec.median)]])));
check("heart: all muscle lit through ST, a recovery front shown mid-T, all back to grey after T",
  rep.shown.st.lit === rep.shown.st.total && rep.shown.st.front === 0 && rep.shown.mid.front > 10 && rep.shown.mid.lit > 0 && rep.shown.mid.lit < rep.shown.mid.total && rep.shown.after.lit === 0, rep.shown);

if (SHOT) {
  await page.evaluate(() => window.ECGConduction.setTime(232));
  await page.mouse.move(5, 5);
  await page.screenshot({ path: SHOT });
}
check("no console errors", errors.length === 0, errors);
await browser.close();
process.exit(failed ? 1 : 0);
