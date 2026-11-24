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
await page.selectOption("#ecgcCond", "lbbb");
const q1 = await page.$eval("#ecgcQrs", (e) => +e.dataset.qrs);
check("condition switch widens QRS", q0 < 120 && q1 >= 120, { normal: q0, lbbb: q1 });
// The LBBB preset shows V1 and V6; override back to one lead (II) for the layout checks below.
await page.evaluate(() => { const E = window.ECGConduction; E.setLeadCount(1); E.setLead(0, "II"); });

// One large lead panel: its dropdown picks any of the 12 leads and moves the electrode marker to the right wheel.
const before = await page.$eval("#ecgcWheelMark-A", (g) => ({ lead: g.dataset.lead, t: g.getAttribute("transform"), wheel: g.ownerSVGElement.id }));
await page.selectOption('select[data-slot="0"]', "V1");
const after = await page.$eval("#ecgcWheelMark-A", (g) => ({ lead: g.dataset.lead, t: g.getAttribute("transform"), wheel: g.ownerSVGElement.id }));
const layout = await page.evaluate(() => { const E = window.ECGConduction, vis = () => [...document.querySelectorAll(".ecgc-lead")].filter((w) => !w.hidden), o = {};
  const marks = () => [...document.querySelectorAll("[id^=ecgcWheelMark]")].filter((g) => g.isConnected && g.ownerSVGElement).map((g) => g.id + ":" + g.dataset.lead);
  o.def = { panels: vis().length, marks: marks(), gain: E.paper().pxPerMv };
  for (const n of [2, 3]) { E.setLeadCount(n); const p = E.paper(), cv = vis().map((w) => w.querySelector("canvas").getBoundingClientRect());
    o[n] = { panels: vis().length, marks: marks(), gain: p.pxPerMv, square: Math.abs(p.pxPerMs * 400 - p.pxPerMv) < 1e-9, noOverlap: cv.every((r, i) => !i || r.top >= cv[i - 1].bottom), equal: cv.every((r) => Math.abs(r.height - cv[0].height) < .5), sh: document.documentElement.scrollHeight }; }
  E.setLeadCount(1);
  o.focusBtns = document.querySelectorAll(".ecgc-focus").length; o.options = document.querySelectorAll('select[data-slot="0"] option').length;
  o.speeds = [...document.querySelectorAll("#ecgcSpeed option")].map((x) => x.value); o.counts = [...document.querySelectorAll("#ecgcNLeads option")].map((x) => x.value);
  const st = document.querySelector(".ecgc-stage").children; o.order = [...st].map((n) => n.className.baseVal === undefined ? n.className.split(" ")[0] : n.getAttribute("class"));
  return o; });
check("lead count 1, 2 or 3 (user override of the preset): gain 100 px/mV with one lead, scaled down only to fit more, identical panels, paper stays square; one shaped, lettered marker per shown lead; dropdown moves it between wheels; speeds 0.01 to 1x",
  before.lead === "II" && before.wheel === "ecgcWheelF" && after.lead === "V1" && after.wheel === "ecgcWheelH" && layout.def.panels === 1 && layout.def.gain === 100 && layout.def.marks.length === 1 &&
  layout[2].panels === 2 && layout[3].panels === 3 && layout[2].marks.length === 2 && layout[3].marks.length === 3 && layout[2].gain < 100 && layout[3].gain <= layout[2].gain && layout[2].square && layout[3].square &&
  layout[2].noOverlap && layout[3].noOverlap && layout[2].equal && layout[3].equal && layout[3].gain >= 45 && layout[2].sh <= 800 && layout[3].sh <= 800 && layout.focusBtns === 0 && layout.options === 12 && layout.counts.join() === "1,2,3" &&
  layout.speeds.join() === "0.01,0.02,0.05,0.1,0.25,0.5,1", { before, after, layout });
check("ECG panel(s) next to the heart, wheels on the far right", layout.order.indexOf("ecgc-heart") === 0 && layout.order.indexOf("ecgc-leads") === 1 && layout.order.indexOf("ecgc-wheels") === 2, layout.order);
await page.selectOption('select[data-slot="0"]', "II");

const box = await page.$eval("#ecgcScrub", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const loopMs = await page.evaluate(() => window.ECGConduction.loop().ms);
await page.mouse.click(box.x + 8 + (box.w - 16) * (232 / 799), box.y + box.h / 2); // one-beat bar (0 to 799 ms); range thumb is 16 px wide
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
  E.setTime(40); const cv = document.querySelector(".ecgc-lead.is-focus canvas"), r = cv.getBoundingClientRect(), fi = [...document.querySelectorAll(".ecgc-lead canvas")].indexOf(cv);
  return { peak: b.peak, x: E.traceX(fi, b.peak + 1), y: r.top + r.height / 2 }; });
await page.mouse.click(tap.x, tap.y);
const tapped = await page.evaluate(() => ({ t: window.ECGConduction.state.t, playing: window.ECGConduction.state.playing, link: document.querySelector("#ecgcLink line").getAttribute("opacity") }));
check("tapping a bump sets the clock to it and shows the link", tapped.t === tap.peak && !tapped.playing && tapped.link === "1", { tap, tapped });

// Round 7: both lead wheels, narration for every step, and everything still fits at every step.
const wh = await page.evaluate(() => { const E = window.ECGConduction; E.setCondition("lbbb"); E.setLead(0, "V1"); E.setFocus(0); const chestMark = E.wheels().marks[0].wheel; E.setLead(0, "aVL"); E.setTime(230);
  return Object.assign(E.wheels(), { chestMark }, { focusAxis: !!document.querySelector("#ecgcSvg line[stroke-dasharray='6 5']"), papillary: document.querySelectorAll("#ecgcSvg path[d^='M300,352 C308']").length }); });
check("limb (hexaxial) and chest wheels exist with live vector and markers", wh.limb.length === 6 && wh.chest.length === 6 && wh.limbVec === "1" && wh.chestVec === "1" &&
  wh.marks.length === 1 && wh.marks[0].wheel === "ecgcWheelF" && wh.chestMark === "ecgcWheelH" && wh.focusAxis && wh.papillary === 0, wh);
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
// The anterior fascicle's front-wall stretch (lafF) is drawn in front of the slice, so it may cross the LV cavity.
check("every conduction route sits in a wall (only the moderator band crosses a cavity; the front-wall fascicle is in front of the slice)",
  Object.entries(cav).every(([k, v]) => k === "mod" ? v > 0 : /^lafF/.test(k) ? true : v === 0) && cav.lafF > 0, cav);
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

// Round 11: standard paper, 25 mm/s and 10 mm/mV (square 10 px boxes at 100 px/mV), rhythm strip with the explained beat first.
const paper = await page.evaluate(() => { const E = window.ECGConduction, p = E.paper(); const r = document.querySelectorAll(".ecgc-lead canvas")[0].getBoundingClientRect(); return { p, w0: E.traceX(0, 0), w200: E.traceX(0, 200), w800: E.traceX(0, 800), left: r.left, right: r.right }; });
check("paper is 25 mm/s and 10 mm/mV: 1 mm = 10 px both ways, 200 ms = 50 px; the explained beat is first, just after the 1 mV pulse",
  Math.abs(paper.p.pxPerMs * 40 - 10) < 1e-9 && paper.p.pxPerMv === 100 && Math.abs(paper.w200 - paper.w0 - 50) < 1e-6 && paper.w800 <= paper.right - 4 && paper.w0 - paper.left < 120, paper);

// Round 9: repolarisation (recovery) map.
const rep = await page.evaluate(() => { const E = window.ECGConduction, o = {}, AX = { I: 0, II: 60, III: 120, aVF: 90, aVL: -30, aVR: -150 };
  for (const c of ["normal", "rbbb", "lbbb", "lafb", "bifasc"]) { const r = E.recovery(c), T = {}, agree = [];
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
check("recovery map dipole gives the same T polarity as the trace in every limb lead with a clear T (all 5 conditions)",
  ["normal", "rbbb", "lbbb", "lafb", "bifasc"].every((c) => rep[c].agree.length >= 3 && rep[c].agree.every((x) => x[1])), Object.fromEntries(["normal", "rbbb", "lbbb", "lafb", "bifasc"].map((c) => [c, rep[c].agree])));
check("T peak within 10 ms of the middle of recovery (all 5 conditions)", ["normal", "rbbb", "lbbb", "lafb", "bifasc"].every((c) => Math.abs(rep[c].peakMax - rep[c].rec.median) <= 10),
  Object.fromEntries(["normal", "rbbb", "lbbb", "lafb", "bifasc"].map((c) => [c, [rep[c].peakMax, Math.round(rep[c].rec.median)]])));
check("heart: all muscle lit through ST, a recovery front shown mid-T, all back to grey after T",
  rep.shown.st.lit === rep.shown.st.total && rep.shown.st.front === 0 && rep.shown.mid.front > 10 && rep.shown.mid.lit > 0 && rep.shown.mid.lit < rep.shown.mid.total && rep.shown.after.lit === 0, rep.shown);

// Round 13: LAFB and bifascicular block; the anterior fascicle's front-wall stretch.
const fas = await page.evaluate(() => {
  const E = window.ECGConduction, o = {};
  o.btns = [...document.querySelectorAll("#ecgcCond option")].map((b) => b.value);
  for (const c of ["lafb", "bifasc"]) { const st = E.steps(c, "aVL"); o[c] = { n: st.length, ids: st.flatMap((s) => s.ids), allText: st.every((s) => s.text && s.text.length > 20), titles: st.map((s) => E.narration(c, "aVL", s.t).title), diffs: st.map((s) => E.narration(c, "aVL", s.t).diff).join(" | ") }; }
  o.paths = { normal: E.paths("normal").lafF, rbbb: E.paths("rbbb").lafF, lafb: E.paths("lafb").lafF, bifasc: E.paths("bifasc").lafF, lbbb: E.paths("lbbb").lafF };
  o.style = {}; for (const c of ["normal", "lafb", "bifasc"]) { E.setCondition(c); o.style[c] = { lafF: E.bundleStyle("lafF"), laf: E.bundleStyle("laf"), rb: E.bundleStyle("rb"), marks: document.querySelectorAll("#ecgcSvg path[d='M-7,-7 L7,7 M7,-7 L-7,7']").length }; }
  o.tips = [...document.querySelectorAll("#ecgcSvg title")].map((t) => t.textContent);
  o.reg = { lafb: E.regions("lafb"), bifasc: E.regions("bifasc") };
  E.setCondition("normal"); return o; });
const dotted = (s) => s.dash !== "none" && parseFloat(s.dash) < 2 && s.width < 2;
check("condition toggle has LAFB and RBBB + LAFB; both have a full step-through story",
  fas.btns.includes("lafb") && fas.btns.includes("bifasc") && ["lafb", "bifasc"].every((c) => fas[c].n >= 8 && fas[c].allText && fas[c].ids.includes("block") && fas[c].ids.includes("slow-lv-up") && fas[c].ids.includes("t")) && fas.bifasc.ids.includes("slow-rv"), fas);
check("front-wall anterior fascicle: lit (fast) in Normal and RBBB, not in LBBB, LAFB or bifascicular; same timing where it conducts",
  !!fas.paths.normal && !!fas.paths.rbbb && !fas.paths.lafb && !fas.paths.bifasc && !fas.paths.lbbb && Math.abs(fas.paths.normal.start - fas.paths.rbbb.start) < 1e-6, fas.paths);
check("front-wall stretch drawn faint and dotted (not the recovery dash or a chevron); X on the anterior fascicle in LAFB, two X in bifascicular",
  dotted(fas.style.normal.lafF) && dotted(fas.style.lafb.lafF) && fas.style.normal.marks === 0 && fas.style.lafb.marks === 1 && fas.style.bifasc.marks === 2 && fas.style.lafb.laf.dash !== "none", fas.style);
check("hover notes: front-wall stretch is the anterior fascicle; the upper lateral-wall line is its Purkinje fibres re-entering the slice, not a separate pathway",
  fas.tips.some((t) => /anterior fascicle, on the front wall/i.test(t)) && fas.tips.some((t) => /re-?enter|coming back into this slice/i.test(t) && /not a separate pathway/.test(t)), fas.tips);
check("LAFB/bifascicular: upper LV wall partly slow (chevrons), base slow; septum and inferior wall fast; bifascicular RV slow",
  ["lafb", "bifasc"].every((c) => fas.reg[c].LVW.slowFrac > .2 && fas.reg[c].LVW.slowFrac < .9 && fas.reg[c].LVB.slowFrac > .8 && fas.reg[c].SEP.slowFrac === 0 && fas.reg[c].LVA.slowFrac === 0) && fas.reg.bifasc.RV.slowFrac > .8, fas.reg);
check("bifascicular narration flags the risk of complete heart block", /complete heart block/.test(fas.bifasc.diffs), fas.bifasc.diffs);

// Round 12: 0.01x speed, smooth at sub-millisecond steps (no rounding of the clock, pen between whole ms).
const slow = await page.evaluate(async () => {
  const E = window.ECGConduction, sel = document.getElementById("ecgcSpeed");
  const hasOpt = [...sel.options].some((o) => o.value === "0.01");
  const snap = () => { const cv = document.querySelector(".ecgc-panel canvas, canvas"); return cv.toDataURL(); };
  E.setCondition("normal"); E.setTime(300); const a = snap(); E.setTime(300.5); const b = snap();
  sel.value = "0.01"; sel.dispatchEvent(new Event("change"));
  E.setTime(200); document.getElementById("ecgcPlay").click();
  const ts = []; await new Promise((res) => { const f = () => { ts.push(E.state.t); ts.length < 90 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
  document.getElementById("ecgcPlay").click(); sel.value = "0.25"; sel.dispatchEvent(new Event("change"));
  const d = ts.slice(1).map((t, i) => t - ts[i]);
  return { hasOpt, subMsMoves: a !== b, maxStep: Math.max(...d), minStep: Math.min(...d), adv: ts[ts.length - 1] - ts[0], frac: ts.some((t) => t % 1) };
});
check("0.01x speed: option present, clock advances in small sub-ms steps, trace moves between whole ms",
  slow.hasOpt && slow.subMsMoves && slow.minStep >= 0 && slow.maxStep < 1.01 && slow.adv > 5 && slow.adv < 30 && slow.frac, slow);

// Round 14: condition dropdown (data-driven, grouped) and teaching tabs under the narration.
const CONDS = ["normal", "rbbb", "lbbb", "lafb", "bifasc"];
const dd = await page.evaluate(() => { const sel = document.getElementById("ecgcCond"), lab = sel.closest("label");
  return { tag: sel.tagName, label: lab ? lab.textContent.trim().split(/\s+/)[0] : "", aria: sel.getAttribute("aria-label"), groups: [...sel.querySelectorAll("optgroup")].map((g) => [g.label, [...g.children].map((o) => o.value)]),
    menu: window.ECGConduction.condMenu.map((g) => g.group), oldBtns: document.querySelectorAll(".ecgc-cond-btn").length }; });
check("condition picker is one labelled native <select> built from the menu data, grouped (Bundle branch blocks, Fascicular blocks), no old buttons",
  dd.tag === "SELECT" && dd.label === "Condition" && dd.aria === "Condition" && dd.oldBtns === 0 && dd.groups.flatMap((g) => g[1]).join() === CONDS.join() &&
  dd.groups.some((g) => g[0] === "Bundle branch blocks" && g[1].join() === "rbbb,lbbb") && dd.groups.some((g) => g[0] === "Fascicular blocks" && g[1].join() === "lafb,bifasc") && dd.groups.map((g) => g[0]).join() === dd.menu.join(), dd);
await page.selectOption("#ecgcCond", "rbbb");
const viaSel = await page.evaluate(() => ({ cond: window.ECGConduction.state.cond, qrs: +document.getElementById("ecgcQrs").dataset.qrs, title: document.querySelector("#ecgcPane-key .ecgc-teach-head").textContent }));
await page.focus("#ecgcCond"); await page.keyboard.press("ArrowDown");
const viaKey = await page.evaluate(() => window.ECGConduction.state.cond);
check("selecting from the dropdown (mouse or keyboard) drives the condition, QRS readout and teaching content",
  viaSel.cond === "rbbb" && viaSel.qrs >= 120 && /RBBB/.test(viaSel.title) && viaKey === "lbbb", { viaSel, viaKey });
await page.selectOption("#ecgcCond", "normal");

const tb = await page.evaluate(() => { const list = document.querySelector(".ecgc-narr [role=tablist]"), tabs = [...list.querySelectorAll("[role=tab]")];
  return { label: list.getAttribute("aria-label"), names: tabs.map((t) => t.textContent.replace(/\s+/g, " ").trim()), sel: tabs.map((t) => t.getAttribute("aria-selected")),
    panes: tabs.map((t) => { const p = document.getElementById(t.getAttribute("aria-controls")); return !!p && p.getAttribute("role") === "tabpanel" && p.getAttribute("aria-labelledby") === t.id; }),
    tabindex: tabs.map((t) => t.tabIndex), visible: [...document.querySelectorAll(".ecgc-narr [role=tabpanel]")].filter((p) => !p.hidden).map((p) => p.id) }; });
check("tab bar: role=tablist with Steps, Key points, Clinical, Pitfalls, Quiz; Steps selected; panels linked; roving tabindex",
  tb.names.join("|") === "Steps|Key points|Clinical review|Pitfalls|Quiz" && tb.sel.join() === "true,false,false,false,false" && tb.panes.every(Boolean) &&
  tb.tabindex.join() === "0,-1,-1,-1,-1" && tb.visible.join() === "ecgcPane-steps", tb);
await page.focus("#ecgcTab-steps");
const keys = [];
for (const k of ["ArrowRight", "ArrowRight", "ArrowLeft", "End", "Home", "ArrowLeft"]) { await page.keyboard.press(k);
  keys.push(await page.evaluate(() => [document.activeElement.dataset.tab, document.querySelector("[role=tab][aria-selected=true]").dataset.tab, [...document.querySelectorAll(".ecgc-narr [role=tabpanel]")].filter((p) => !p.hidden).map((p) => p.id).join()])); }
check("tabs: arrow keys, Home and End move focus and selection, one panel shown",
  keys.map((k) => k[1]).join() === "key,clin,key,quiz,steps,quiz" && keys.every((k) => k[0] === k[1] && k[2] === "ecgcPane-" + k[1]), keys);
await page.click("#ecgcTab-clin");
const tc = await page.evaluate((CONDS) => { const E = window.ECGConduction, o = {}, n = document.querySelector(".ecgc-narr");
  const fits = () => { const nb = n.getBoundingClientRect().bottom - 6; return [...n.querySelectorAll(".ecgc-pane:not([hidden]) *")].every((e) => e.getBoundingClientRect().bottom <= nb + .5); };
  for (const c of CONDS) { E.setCondition(c); const T = E.teach(c), r = { fit: {} };
    r.key = T.key.length; r.clin = T.clin.length; r.pit = T.pit.length; r.quiz = T.quiz.length;
    r.keyLis = document.querySelectorAll("#ecgcPane-key li").length; r.badge = (document.querySelector("#ecgcPane-clin .ecgc-review-badge") || {}).textContent;
    r.clinHead = document.querySelector("#ecgcPane-clin .ecgc-teach-head").textContent;
    r.keyWhy = T.key.every((k) => k[0] && k[1] && k[2]); r.srcs = [...new Set([].concat(T.key, T.clin, T.pit, T.quiz).map((k) => k[k.length - 1]))];
    for (const tab of ["steps", "key", "clin", "pit", "quiz"]) { E.setTab(tab); if (tab === "quiz") document.querySelectorAll("#ecgcPane-quiz .ecgc-reveal").forEach((b) => b.click()); r.fit[tab] = fits(); }
    const qa = [...document.querySelectorAll("#ecgcPane-quiz .ecgc-quiz-a")]; r.revealed = qa.every((a) => !a.hidden) && [...document.querySelectorAll("#ecgcPane-quiz .ecgc-reveal")].every((b) => b.getAttribute("aria-expanded") === "true");
    E.setTab("clin");
    const st = E.steps(c, "II"); r.why = st.map((s) => E.why(c, s.t)); r.text = JSON.stringify(T) + r.why.join(" ");
    o[c] = r; }
  E.setCondition("normal"); E.setTab("steps"); return o; }, CONDS);
check("each condition: 3-5 key points (criterion + why + source), Clinical marked 'Needs anaesthetist review', pitfalls, 1-2 quiz questions",
  CONDS.every((c) => tc[c].key >= 3 && tc[c].key <= 5 && tc[c].keyLis === tc[c].key && tc[c].keyWhy && tc[c].clin >= 2 && /Needs anaesthetist review/.test(tc[c].badge) && tc[c].pit >= 2 && tc[c].quiz >= 1 && tc[c].quiz <= 2),
  Object.fromEntries(CONDS.map((c) => [c, [tc[c].key, tc[c].clin, tc[c].pit, tc[c].quiz, tc[c].badge]])));
check("tab content switches with the condition", CONDS.every((c, i) => CONDS.every((d, j) => i === j || tc[c].clinHead !== tc[d].clinHead)) && new Set(CONDS.map((c) => tc[c].text)).size === 5,
  CONDS.map((c) => tc[c].clinHead));
check("every step has a Why line, all differ from step to step within a condition", CONDS.every((c) => tc[c].why.every((w) => w.length > 30) && new Set(tc[c].why).size >= tc[c].why.length - 2),
  Object.fromEntries(CONDS.map((c) => [c, tc[c].why.length])));
check("teaching sources only from the reference set; British English, no em dashes, no Wikipedia",
  CONDS.every((c) => tc[c].srcs.every((s) => /^(Klabunde|LITFL|Guyton & Hall|Franz 1987|Hampton)/.test(s.split("; ")[0])) && !/\u2014|wikipedia|wikimedia/i.test(tc[c].text) && !/\b(color|center|anesthe)/i.test(tc[c].text)),
  Object.fromEntries(CONDS.map((c) => [c, tc[c].srcs])));
check("quiz: tap to reveal sets aria-expanded and shows the answer", CONDS.every((c) => tc[c].revealed), CONDS.map((c) => tc[c].revealed));
check("every tab fits the narration box for every condition (no overflow)", CONDS.every((c) => Object.values(tc[c].fit).every(Boolean)), Object.fromEntries(CONDS.map((c) => [c, tc[c].fit])));
const fit2 = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth }));
check("still fits 1280x800 with the tab bar", fit2.sh <= fit2.ih && fit2.sw <= 1280, fit2);

// Round 15: two consecutive beats (both full black traces, then loop) and per-condition lead presets.
const two = await page.evaluate(async () => {
  const E = window.ECGConduction, o = { loops: {} };
  E.setCondition("rbbb", true);
  for (const n of [1, 2, 3]) { E.setLeadCount(n); o.loops[n] = E.loop(); }
  E.setLeadCount(2); E.setLead(0, "V1"); E.setFocus(0);
  const lp = E.loop(), cv = document.querySelector(".ecgc-lead canvas"), r = cv.getBoundingClientRect(), ctx = cv.getContext("2d"), dpr = cv.width / r.width;
  const bs = E.bumps("rbbb", "V1"); let big = bs[0]; bs.forEach((b) => { if (Math.abs(b.amp) > Math.abs(big.amp)) big = b; });
  E.setTime(60); // in the first P wave: nothing coloured yet
  const col = (ms) => { const x = Math.round((E.traceX(0, ms) - r.left) * dpr), d = ctx.getImageData(x, 0, 1, cv.height).data; let black = 0, grey = 0;
    for (let k = 0; k < d.length; k += 4) { if (d[k] < 60 && d[k + 1] < 60 && d[k + 2] < 60) black++; if (Math.abs(d[k] - 163) < 6 && Math.abs(d[k + 1] - 168) < 6 && Math.abs(d[k + 2] - 174) < 6) grey++; } return { black, grey }; };
  o.cols = { qrs1: col(big.peak), qrs2: col(800 + big.peak), t2: col(800 + 400), p2: col(800 + 50) };
  // Heart and narration follow the second beat exactly as the first.
  const snap = () => [document.getElementById("ecgcSvg").innerHTML.length, document.getElementById("ecgcSentence").textContent, document.getElementById("ecgcNWhere").textContent];
  E.setTime(big.peak); const a = snap(), heartA = document.getElementById("ecgcSvg").innerHTML; E.setTime(800 + big.peak); const b2 = snap(), heartB = document.getElementById("ecgcSvg").innerHTML;
  o.follow = { sameHeart: heartA === heartB, sameText: a[1] === b2[1] && a[2] === b2[2], beat: document.getElementById("ecgcBeat").textContent, ms: +document.getElementById("ecgcMs").textContent };
  // Playback runs from beat 1 into beat 2, then loops back to beat 1.
  const sp = document.getElementById("ecgcSpeed"); sp.value = "1"; sp.dispatchEvent(new Event("change"));
  E.setTime(780); document.getElementById("ecgcPlay").click(); await new Promise((res) => setTimeout(res, 250)); o.into2 = E.state.t;
  document.getElementById("ecgcPlay").click(); E.setTime(lp.ms - 30); document.getElementById("ecgcPlay").click(); await new Promise((res) => setTimeout(res, 250)); o.wrapped = E.state.t;
  document.getElementById("ecgcPlay").click(); sp.value = "0.25"; sp.dispatchEvent(new Event("change"));
  // Step-through covers both beats.
  E.stepMode(true); const cs = E.curSteps(), one = E.steps("rbbb", "V1"); E.goStep("t"); o.steps = { n: cs.length, one: one.length, beat2: cs.filter((s) => s.beat === 2).length, lastT: cs[cs.length - 1].t };
  const nb = document.getElementById("ecgcNext"); for (let k = 0; k < cs.length + 2; k++) nb.click(); o.steps.endT = E.state.t; o.steps.endBeat = document.getElementById("ecgcBeat").textContent; E.stepMode(false);
  o.segs = [...document.querySelectorAll("#ecgcSegs .ecgc-seg")].filter((d) => d.textContent === "QRS").length;
  o.tap = { peak: big.peak, x: E.traceX(0, 800 + big.peak + 1), y: r.top + r.height / 2 };
  return o; });
await page.mouse.click(two.tap.x, two.tap.y);
const tap2 = await page.evaluate(() => window.ECGConduction.state.t);
check("two beats: loop holds two full beats (1600 ms with 2 or 3 leads; at least to the second T end with 1 lead), one beat's segments on the timeline",
  two.loops[2].beats === 2 && two.loops[2].ms === 1600 && two.loops[3].ms === 1600 && two.loops[1].ms >= 800 + 600 && two.segs === 1, two.loops);
check("two beats: both beats drawn as full black traces (QRS, P and T of beat 2 in black), no faint grey later beats",
  two.cols.qrs1.black > 0 && two.cols.qrs2.black > 0 && two.cols.p2.black > 0 && two.cols.t2.black > 0 && Object.values(two.cols).every((c) => c.grey === 0), two.cols);
check("two beats: the heart and narration follow the second beat; the readout says Beat 2 of 2", two.follow.sameHeart && two.follow.sameText && two.follow.beat === "Beat 2 of 2:" && two.follow.ms < 800, two.follow);
check("two beats: playback runs on into beat 2, then loops back to beat 1", two.into2 > 800 && two.into2 < 1200 && two.wrapped < 400, { into2: two.into2, wrapped: two.wrapped });
check("two beats: step-through narrates both beats and ends in beat 2", two.steps.n === 2 * two.steps.one && two.steps.beat2 === two.steps.one && two.steps.endT === two.steps.lastT && two.steps.endT > 800 && two.steps.endBeat === "Beat 2 of 2:", two.steps);
check("two beats: tapping a bump on the second beat jumps to that bump in beat 2", tap2 === 800 + two.tap.peak, { tap2, want: 800 + two.tap.peak });

const PRESETS = { normal: [3, "II,V1,V6"], rbbb: [2, "V1,V6"], lbbb: [2, "V1,V6"], lafb: [3, "I,II,aVL"], bifasc: [3, "V1,II,aVL"] };
const pres = {};
for (const c of Object.keys(PRESETS)) { await page.selectOption("#ecgcCond", c);
  pres[c] = await page.evaluate((c) => { const E = window.ECGConduction, pr = E.preset(c), n = E.state.nLeads;
    const keyText = E.teach(c).key.map((k) => k[0]).join(" ");
    return { n, leads: E.state.leads.slice(0, n).join(), sels: [...document.querySelectorAll(".ecgc-lead:not([hidden]) select")].map((s) => s.value).join(), nSel: document.getElementById("ecgcNLeads").value,
      data: !!pr && pr.leads.join(), sug: document.getElementById("ecgcSuggest").textContent, why: pr && pr.why,
      matches: !!pr && (() => { const stop = /^(i|ii|iii|avr|avl|avf|v[1-6]|in|and|no|the|of)$/, tok = (t) => t.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length >= 2 && !stop.test(w)), kt = new Set(tok(keyText)); return tok(pr.why).some((w) => kt.has(w)); })(), sh: document.documentElement.scrollHeight }; }, c); }
check("lead presets from the condition data: Normal 3 (II, V1, V6), RBBB and LBBB 2 (V1, V6), LAFB 3 (I, II, aVL), RBBB + LAFB 3 (V1, II, aVL); fits 1280x800",
  Object.entries(PRESETS).every(([c, p]) => pres[c].n === p[0] && pres[c].leads === p[1] && pres[c].sels === p[1] && pres[c].nSel === String(p[0]) && pres[c].data === p[1] && pres[c].sh <= 800), pres);
check("suggested leads line shows the leads and a short reason that matches the Key points",
  Object.entries(PRESETS).every(([c, p]) => pres[c].sug.startsWith("Suggested leads: " + p[1].split(",").join(", ") + " (") && pres[c].matches), Object.fromEntries(Object.keys(PRESETS).map((c) => [c, [pres[c].sug, pres[c].matches]])));
await page.selectOption("#ecgcCond", "rbbb");
await page.selectOption("#ecgcNLeads", "1");
await page.selectOption('select[data-slot="0"]', "aVR");
const ov = await page.evaluate(() => { const E = window.ECGConduction; E.setTime(300); return { n: E.state.nLeads, L: E.state.leads[0], cond: E.state.cond, title: document.getElementById("ecgcNSeesLab").textContent }; });
check("presets can be overridden afterwards with the leads menu and lead dropdowns", ov.n === 1 && ov.L === "aVR" && ov.cond === "rbbb" && ov.title === "aVR sees", ov);
await page.selectOption("#ecgcCond", "normal");

// Round 16: with 2 or 3 leads the strip is wider in ms, so further beats continue it to the right edge (no blank paper).
const fill = await page.evaluate(() => {
  const E = window.ECGConduction, o = {};
  E.setCondition("normal");
  for (const n of [1, 2, 3]) { E.setLeadCount(n); E.setLead(0, "II"); E.setFocus(0); E.setTime(60);
    const cv = document.querySelector(".ecgc-lead canvas"), r = cv.getBoundingClientRect(), ctx = cv.getContext("2d"), dpr = cv.width / r.width, d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let last = -1, grey = 0;
    for (let x = cv.width - 1; x >= 0 && last < 0; x--) for (let y = 0; y < cv.height; y++) { const k = (y * cv.width + x) * 4; if (d[k] < 60 && d[k + 1] < 60 && d[k + 2] < 60) { last = x; break; } }
    for (let k = 0; k < d.length; k += 4) if (Math.abs(d[k] - 163) < 6 && Math.abs(d[k + 1] - 168) < 6 && Math.abs(d[k + 2] - 174) < 6) grey++;
    const bs = E.bumps("normal", "II"); let big = bs[0]; bs.forEach((b) => { if (Math.abs(b.amp) > Math.abs(big.amp)) big = b; });
    let qrs = 0; for (let b = 0; b < 10; b++) { const x = E.traceX(0, b * 800 + big.peak) - r.left; if (x < r.width - 2) qrs++; }
    const p = E.paper(); o[n] = { gap: Math.round(r.width - last / dpr), w: Math.round(r.width), qrs, grey, gain: p.pxPerMv, loop: E.loop().ms, peak: big.peak,
      tap3: n === 3 ? { x: E.traceX(0, 2 * 800 + big.peak + 1), y: r.top + r.height / 2 } : null }; }
  return o; });
check("strip filled edge to edge with continuing beats at every lead count (trailing gap under 6 px), more beats at lower gain, gains 100/80/48, all black (no faint grey beats; a few anti-aliased pixels allowed)",
  [1, 2, 3].every((n) => fill[n].gap < 6 && fill[n].grey < 20) && fill[1].qrs >= 2 && fill[2].qrs >= 3 && fill[3].qrs >= 4 && fill[3].qrs > fill[2].qrs &&
  fill[1].gain === 100 && fill[2].gain === 80 && fill[3].gain === 48 && fill[2].loop === 1600 && fill[3].loop === 1600, fill);
await page.mouse.click(fill[3].tap3.x, fill[3].tap3.y);
const tap3 = await page.evaluate(() => ({ t: window.ECGConduction.state.t, beat: document.getElementById("ecgcBeat").textContent }));
check("tapping a bump on a continuing beat (beat 3) jumps to that bump in beat 2", tap3.t === 800 + fill[3].peak && tap3.beat === "Beat 2 of 2:", tap3);
await page.evaluate(() => window.ECGConduction.setLeadCount(1));

// Round 17: one-beat timeline bar, drag-to-scrub on the strips, Space toggles Play/Pause anywhere.
const tl = await page.evaluate(() => { const E = window.ECGConduction, o = {}; E.setCondition("rbbb", true);
  o.segs = [...document.querySelectorAll("#ecgcSegs .ecgc-seg")].map((d) => d.textContent);
  const th = () => document.querySelector(".ecgc-scrub-thumb").style.left, now = () => (document.querySelector("#ecgcSegs .is-now") || {}).textContent;
  E.setTime(232); o.b1 = [th(), now(), document.getElementById("ecgcScrub").value, document.getElementById("ecgcBeat").textContent];
  E.setTime(1032); o.b2 = [th(), now(), document.getElementById("ecgcScrub").value, document.getElementById("ecgcBeat").textContent];
  const sc = document.getElementById("ecgcScrub"); sc.value = "400"; sc.dispatchEvent(new Event("input")); o.inBeat2 = E.state.t; o.max = sc.max;
  return o; });
check("timeline bar shows one beat (P, PR, QRS, ST, T, Rest); it maps to the beat being explained and the marker moves within it",
  tl.segs.join() === "P,PR,QRS,ST,T,Rest" && tl.b1[0] === tl.b2[0] && tl.b1[1] === "QRS" && tl.b2[1] === "QRS" && tl.b1[2] === "232" && tl.b2[2] === "232" &&
  tl.b1[3] === "Beat 1 of 2:" && tl.b2[3] === "Beat 2 of 2:" && tl.inBeat2 === 1200 && tl.max === "799", tl);
await page.evaluate(() => { const E = window.ECGConduction; E.setTime(100); document.getElementById("ecgcPlay").click(); });
const dg0 = await page.evaluate(() => { const E = window.ECGConduction, cv = document.querySelector(".ecgc-lead canvas"), r = cv.getBoundingClientRect();
  return { x0: E.traceX(0, 100), x1: E.traceX(0, 560), y: r.top + r.height * 0.8, cursor: getComputedStyle(cv).cursor, touch: getComputedStyle(cv).touchAction }; });
await page.mouse.move(dg0.x0, dg0.y); await page.mouse.down();
const seen = [];
for (let k = 1; k <= 12; k++) { await page.mouse.move(dg0.x0 + (dg0.x1 - dg0.x0) * k / 12, dg0.y);
  seen.push(await page.evaluate(() => [window.ECGConduction.state.t, window.ECGConduction.state.playing, document.getElementById("ecgcSentence").textContent, document.querySelector(".ecgc-lead canvas").classList.contains("is-dragging")])); }
await page.mouse.up();
const dg1 = await page.evaluate(() => window.ECGConduction.state.t);
const mono = seen.every((v, k) => !k || v[0] > seen[k - 1][0]);
check("drag across a strip scrubs smoothly: pauses, time follows the pointer, narration updates live, no bump snap on release; ew-resize cursor, touch pans vertically only",
  mono && seen.every((v) => !v[1]) && Math.abs(seen[11][0] - 560) < 3 && new Set(seen.map((v) => v[2])).size >= 4 && seen[5][3] && dg1 === seen[11][0] && dg0.cursor === "ew-resize" && dg0.touch === "pan-y",
  { mono, first: seen[0], last: seen[11], titles: new Set(seen.map((v) => v[2])).size, dg1, cursor: dg0.cursor, touch: dg0.touch });
const touch = await page.evaluate(() => { const E = window.ECGConduction, cv = document.querySelector(".ecgc-lead canvas"), x0 = E.traceX(0, 900), x1 = E.traceX(0, 1100), y = cv.getBoundingClientRect().top + 60;
  const ev = (t, x) => cv.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }));
  ev("pointerdown", x0); for (let k = 1; k <= 6; k++) ev("pointermove", x0 + (x1 - x0) * k / 6); ev("pointerup", x1); cv.dispatchEvent(new MouseEvent("click", { clientX: x1, clientY: y, bubbles: true }));
  return { t: E.state.t, beat: document.getElementById("ecgcBeat").textContent }; });
check("touch drag (pointer events) scrubs into beat 2 and the following click does not snap to a bump", Math.abs(touch.t - 1100) < 3 && touch.beat === "Beat 2 of 2:", touch);
// A press without movement still picks the bump.
const tapAgain = await page.evaluate(() => { const E = window.ECGConduction, bs = E.bumps(E.state.cond, E.state.leads[0]); let big = bs[0]; bs.forEach((b) => { if (Math.abs(b.amp) > Math.abs(big.amp)) big = b; });
  const cv = document.querySelector(".ecgc-lead canvas"); return { x: E.traceX(0, big.peak + 2), y: cv.getBoundingClientRect().top + 60, peak: big.peak }; });
await page.mouse.click(tapAgain.x, tapAgain.y);
check("a tap without movement still selects the bump", await page.evaluate(() => window.ECGConduction.state.t) === tapAgain.peak, tapAgain);

const space = {};
const st = () => page.evaluate(() => ({ playing: window.ECGConduction.state.playing, t: window.ECGConduction.state.t, cond: document.getElementById("ecgcCond").value, tab: document.querySelector("[role=tab][aria-selected=true]").dataset.tab, sy: scrollY, step: window.ECGConduction.state.step }));
await page.evaluate(() => { const E = window.ECGConduction; E.setTime(500); });
await page.focus("#ecgcCond"); const a0 = await st(); await page.keyboard.press("Space"); space.select = [a0, await st()];
await page.keyboard.press("Space"); space.select2 = await st();
await page.focus("#ecgcReplay"); await page.evaluate(() => window.ECGConduction.setTime(500)); await page.keyboard.press("Space"); space.replay = await st();
await page.keyboard.press("Space");
await page.focus("#ecgcTab-pit"); await page.keyboard.press("Space"); space.tab = await st(); await page.keyboard.press("Space");
await page.focus("#ecgcStep"); await page.keyboard.press("Space"); space.stepBtn = await st(); await page.keyboard.press("Space");
await page.focus("#ecgcPlay"); const pb = (await st()).playing; await page.keyboard.press("Space"); space.playBtn = [pb, (await st()).playing];
if (space.playBtn[1]) await page.keyboard.press("Space");
space.alt = await page.evaluate(() => { const sel = document.getElementById("ecgcCond"); sel.focus(); const ev = new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", altKey: true, bubbles: true, cancelable: true }); sel.dispatchEvent(ev);
  const inp = document.createElement("input"); inp.type = "text"; document.body.appendChild(inp); inp.focus(); const ev2 = new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }); const p0 = window.ECGConduction.state.playing; inp.dispatchEvent(ev2);
  const r = { altPrevented: ev.defaultPrevented, textPrevented: ev2.defaultPrevented, textToggled: window.ECGConduction.state.playing !== p0 }; inp.remove(); return r; });
check("Space toggles Play/Pause from the dropdown, a button, a tab and the Play button without triggering them or scrolling; Alt+Down and text fields untouched",
  !space.select[0].playing && space.select[1].playing && space.select[1].cond === space.select[0].cond && !space.select2.playing && space.select[1].sy === 0 &&
  space.replay.playing && space.replay.t >= 500 && space.tab.playing && space.tab.tab === "steps" && space.stepBtn.playing && !space.stepBtn.step &&
  space.playBtn[0] === false && space.playBtn[1] === true && !space.alt.altPrevented && !space.alt.textPrevented && !space.alt.textToggled, space);
await page.evaluate(() => { const E = window.ECGConduction; if (E.state.playing) document.getElementById("ecgcPlay").click(); E.setLeadCount(1); });

if (SHOT) {
  await page.evaluate(() => window.ECGConduction.setTime(232));
  await page.mouse.move(5, 5);
  await page.screenshot({ path: SHOT });
}
check("no console errors", errors.length === 0, errors);
await browser.close();
process.exit(failed ? 1 : 0);
