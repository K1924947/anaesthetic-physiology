// Resus Scenarios phase 1: titles, hidden flags, footer, phone source box,
// repeat-error scoring, h1 hyperkalaemia drugs, h14 ROSC logic, airway steps,
// waveform ETCO2, review tags and model paths.
// Run from the worktree root: PHYSIO_BASE=http://127.0.0.1:<port> node tests/test-resus-phase1.mjs
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8793";
const results = [];
function pass(name, extra) { results.push({ name, ok: true }); console.log("PASS", name, extra ? JSON.stringify(extra).slice(0, 300) : ""); }
function fail(name, extra) { results.push({ name, ok: false }); console.log("FAIL", name, JSON.stringify(extra, null, 1)); }
function check(name, ok, extra) { if (ok) pass(name, extra); else fail(name, extra); }

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__scn && window.__scn.all, null, { timeout: 10000 });
check("page loads without console errors", errors.length === 0, errors);

// 1. Neutral chooser titles and no leftover hidden flags
const titles = await page.evaluate(() => {
  const scn = window.__scn;
  const pick = ["s1", "s6", "h9", "h6", "h14"].map((id) => ({ id, t: scn.listTitle(scn.all.find((s) => s.id === id)) }));
  const cards = Array.from(document.querySelectorAll("#scnGrid .scn-card-title")).map((e) => e.textContent);
  return { pick, cards, n: scn.all.length, listed: scn.listed.length, hiddenProps: scn.all.filter((s) => Object.prototype.hasOwnProperty.call(s, "hidden")).map((s) => s.id) };
});
const giveaway = /\b(vf|rosc|torsades|fibrillation|af|polymorphic|qt)\b/i;
check("s1, s6, h9, h6 and h14 chooser titles do not name the diagnosis or the plot", titles.pick.every((p) => p.t && !giveaway.test(p.t) && !/changes|first rhythm/i.test(p.t)) && titles.pick.every((p) => titles.cards.includes(p.t)), titles.pick);
check("h14 chooser title is neutral", titles.pick.find((p) => p.id === "h14").t === "Found unresponsive on a surgical ward", titles.pick);
check("still 28 cases, all listed", titles.n === 28 && titles.listed === 28, { n: titles.n, listed: titles.listed });
check("no scenario keeps a hidden flag", titles.hiddenProps.length === 0, titles.hiddenProps);

// 2. Feedback footer
const footer = await page.evaluate(() => {
  const a = document.querySelector("footer a.footer-feedback");
  return a ? { href: a.href, target: a.target, text: a.textContent.trim() } : null;
});
check("footer links the Google Form feedback", footer && footer.href === "https://docs.google.com/forms/d/e/1FAIpQLSf4l2wWHzyrh2k_BOJ1YFn13PWgKmvEzHXuxePAqpYLk6wyxA/viewform?usp=publish-editor" && footer.target === "_blank", footer);

// 3. Repeat-error scoring
const rep = await page.evaluate(() => {
  const s = window.__scn;
  s.setHints(true);
  s.start("s1");
  ["assess", "charge", "clear", "shock", "cpr", "adr", "ff", "charge", "clear", "shock", "cpr", "adr"].forEach((a) => s.act(a));
  const adrs = s.sim.log.filter((l) => l.act === "adr").map((l) => ({ v: l.o.v, ns: !!l.o.notScoredAgain, lv: l.o.logVerdict || "" }));
  const sc1 = s.score();
  s.start("s2");
  ["assess", "cpr", "shock", "shock", "amio300"].forEach((a) => s.act(a));
  const s2 = s.sim.log.filter((l) => l.o && (l.act === "shock" || l.act === "amio300")).map((l) => ({ a: l.act, v: l.o.v, ns: !!l.o.notScoredAgain }));
  return { adrs, sc1, s2 };
});
check("the same mistake later in the case is not scored again", rep.adrs.length === 2 && rep.adrs[0].v === "bad" && !rep.adrs[0].ns && rep.adrs[1].ns && /not scored again/.test(rep.adrs[1].lv), rep);
check("consecutive identical wrong clicks still collapse, a different mistake still counts", rep.s2[0].v === "bad" && !rep.s2[0].ns && rep.s2[1].ns && rep.s2[2].a === "amio300" && !rep.s2[2].ns, rep.s2);

// 4. h1: calcium plus bicarbonate or insulin-glucose (either or both)
const h1 = await page.evaluate(() => {
  const s = window.__scn;
  s.setHints(false);
  const run = (acts) => { s.start("h1"); acts.forEach((a) => s.act(a)); return { done: s.sim.done, end: s.sim.endReason, pulse: s.sim.pulse, due: (s.due() || []).map((d) => d.id) }; };
  const base = ["assess", "cpr", "adr", "cause:hyperkalaemia"];
  return {
    caOnly: run(base.concat(["calcium:arrest", "ff", "assess"])),
    caIns: run(base.concat(["calcium:arrest", "insulin", "ff", "assess"])),
    caBic: run(base.concat(["calcium:arrest", "bicarb", "ff", "assess"])),
    both: run(base.concat(["insulin", "calcium:arrest", "bicarb", "ff", "assess"])),
    insOnly: run(base.concat(["insulin", "ff", "assess"])),
    drug: (() => { s.start("h1"); document.querySelector("[data-a='drugs']").click(); const b = document.querySelector("[data-drug='insulin']"); const t = b ? b.textContent : ""; document.getElementById("scnDrugClose").click(); return t; })()
  };
});
check("h1: calcium alone does not give ROSC and asks for the second drug", !h1.caOnly.pulse && h1.caOnly.due.includes("shiftK"), h1.caOnly);
check("h1: calcium plus insulin-glucose gives ROSC", h1.caIns.pulse && h1.caIns.end === "complete", h1.caIns);
check("h1: calcium plus bicarbonate gives ROSC", h1.caBic.pulse && h1.caBic.end === "complete", h1.caBic);
check("h1: calcium plus both gives ROSC", h1.both.pulse && h1.both.end === "complete", h1.both);
check("h1: insulin-glucose without calcium does not give ROSC", !h1.insOnly.pulse && h1.insOnly.due.includes("calcium"), h1.insOnly);
check("insulin-glucose is in the Drugs panel", /Insulin/i.test(h1.drug), h1.drug);

// 5. h14: no silent ROSC during CPR
const h14 = await page.evaluate(() => {
  const s = window.__scn;
  s.setHints(false);
  const pre = ["assess", "charge", "clear", "shock", "cpr", "ff", "assess", "cpr", "adr", "cause:hypovolaemia"];
  s.start("h14"); pre.forEach((a) => s.act(a));
  const earlyNoSigns = (() => { s.act("assess"); const l = s.sim.log.filter((x) => x.o).slice(-1)[0]; return { keys: l.o.keys, v: l.o.v }; })();
  s.start("h14"); pre.forEach((a) => s.act(a));
  s.act("fluid:saline");
  const afterFluid = { cpr: s.sim.cpr, pulse: s.sim.pulse, rhythm: s.sim.rhythm.gen, pending: s.sim.roscPending, prompt: (document.querySelector(".scn-signs") || {}).textContent || "", done: s.sim.done };
  s.act("assess");
  const early = { done: s.sim.done, end: s.sim.endReason, pulse: s.sim.pulse, rhythm: s.sim.rhythm.gen, last: s.sim.log.filter((x) => x.o).slice(-1)[0].o.keys };
  s.start("h14"); pre.forEach((a) => s.act(a));
  s.act("fluid:saline");
  const cs = s.sim.cycleStart;
  s.act("ff");
  const ff = { done: s.sim.done, end: s.sim.endReason, pulse: s.sim.pulse, clock: s.sim.clock, cs, last: s.sim.log.filter((x) => x.o).slice(-1)[0].o.keys };
  s.start("h14"); ["assess", "charge", "clear", "shock", "cpr", "ff", "assess", "cpr", "cause:hypovolaemia", "adr", "ff", "assess", "fluid:saline"].forEach((a) => s.act(a));
  const paused = { cpr: s.sim.cpr, pending: s.sim.roscPending, pulse: s.sim.pulse, prompt: !!document.querySelector(".scn-signs") };
  s.act("cpr");
  const resumed = { prompt: (document.querySelector(".scn-signs") || {}).textContent || "", pulse: s.sim.pulse };
  return { earlyNoSigns, afterFluid, early, ff, paused, resumed };
});
check("h14: checking mid-cycle without signs of life is still an interruption", h14.earlyNoSigns.keys.includes("a_interrupt"), h14.earlyNoSigns);
check("h14: treating the cause during CPR gives a clear signs-of-life prompt, no silent rhythm or pulse change", h14.afterFluid.cpr && !h14.afterFluid.pulse && h14.afterFluid.rhythm === "pea" && h14.afterFluid.pending && /Stop compressions and check rhythm and pulse/.test(h14.afterFluid.prompt) && !h14.afterFluid.done, h14.afterFluid);
check("h14: an early check after signs of life confirms ROSC", h14.early.done && h14.early.end === "complete" && h14.early.pulse && h14.early.last.includes("h14_roscEarly"), h14.early);
check("h14: CPR for 2 minutes jumps to the end of the cycle and the check", h14.ff.done && h14.ff.pulse && h14.ff.clock === h14.ff.cs + 120 && h14.ff.last.includes("h14_ffCheck"), h14.ff);
check("h14: treated during a pause, ROSC waits for a check and the prompt comes when CPR restarts", !h14.paused.cpr && h14.paused.pending && !h14.paused.pulse && !h14.paused.prompt && /Signs of life/.test(h14.resumed.prompt) && !h14.resumed.pulse, { paused: h14.paused, resumed: h14.resumed });

const h14scene = await page.evaluate(() => {
  const s = window.__scn;
  s.setHints(false);
  const scene = () => (document.getElementById("scnScene") || {}).textContent || "";
  s.start("h14");
  const opened = scene();
  ["assess", "charge", "clear", "shock", "cpr"].forEach((a) => s.act(a));
  const running = scene();
  s.act("ff");
  const paused = scene();
  return { opened, running, paused };
});
check("h14: the scene says compressions are paused at the start and after a cycle check, and that they have been restarted once CPR is running", /Compressions are paused for a rhythm check/.test(h14scene.opened) && /Compressions have been restarted/.test(h14scene.running) && !/Compressions are paused/.test(h14scene.running) && /Compressions are paused for a rhythm check/.test(h14scene.paused), h14scene);

// 6. Airway steps and waveform ETCO2
const air = await page.evaluate(async () => {
  const s = window.__scn;
  s.setHints(true);
  const last = () => { const l = s.sim.log.filter((x) => x.o).slice(-1)[0]; return { v: l.o.v, keys: l.o.keys }; };
  const cell = () => { const c = document.querySelector(".stat-etco2"); return c ? { val: c.querySelector(".stat-val").textContent, svg: !!(c.querySelector("svg.scn-capno") || document.querySelector("#scnCapnoWave .defib-lane-wave[d]") || (document.querySelector("#scnCapnoWave .defib-lane-wave") && document.querySelector("#scnCapnoWave .defib-lane-wave").getAttribute("d"))), aria: c.getAttribute("aria-label") } : null; };
  const out = {};
  s.start("s2"); s.act("assess"); s.act("ett"); out.ettHandsOff = last();
  s.start("s2"); s.act("assess"); s.act("cpr"); s.act("ett"); out.ettNoBasic = last();
  s.start("s2"); s.act("assess"); s.act("cpr"); out.noAirwayCell = cell();
  s.start("s2"); s.act("assess"); s.act("cpr"); s.act("adjunct"); out.adjunctFirst = last();
  s.start("s2"); s.act("assess"); s.act("cpr");
  ["airwayOpen", "adjunct", "bvm"].forEach((a) => s.act(a)); out.bvm = last(); out.bvmCell = cell();
  s.act("sga"); out.sga = last(); out.sgaCell = cell(); out.fb = document.getElementById("scnFeedback").innerText;
  s.act("ff");
  const t0 = s.sim.clock; s.setClock(t0 + 10);
  await new Promise((r) => setTimeout(r, 1300));
  out.pausedCell = cell();
  s.start("s4"); s.act("ett"); out.pulseCase = last(); out.pulseCell = cell();
  s.start("h17"); out.h17start = cell(); s.act("assess"); out.h17assess = last();
  ["cpr", "adr", "cause:hypoxia", "oxygen"].forEach((a) => s.act(a)); out.h17fix = last(); out.h17cell = cell();
  return out;
});
const kpa = (c) => c && parseFloat(c.val);
check("an advanced airway during a hands-off pause is partly right", air.ettHandsOff.v === "part" && air.ettHandsOff.keys.includes("a_advHandsOff"), air.ettHandsOff);
check("an advanced airway before basic steps and bag-mask is partly right", air.ettNoBasic.v === "part" && air.ettNoBasic.keys.includes("a_advNoBasic"), air.ettNoBasic);
check("an airway adjunct before opening the airway is partly right", air.adjunctFirst && air.adjunctFirst.v === "part" && (air.adjunctFirst.keys || []).includes("a_adjunctOpenFirst"), air.adjunctFirst);
check("stepwise basic airway, adjunct and bag-mask are correct", air.bvm.v === "ok" && air.bvm.keys.includes("a_bvm"), air.bvm);
check("ETCO2 shows no trace before an advanced airway", air.noAirwayCell && air.noAirwayCell.val === "---" && /No capnography/i.test(air.noAirwayCell.aria || "") && air.bvmCell.val === "---", { a: air.noAirwayCell, b: air.bvmCell });
check("SGA during CPR is correct and ETCO2 appears low with a waveform", air.sga.v === "ok" && kpa(air.sgaCell) >= 3 && kpa(air.sgaCell) <= 4 && air.sgaCell.svg && /about 10 breaths/.test(air.sgaCell.aria), air.sgaCell);
check("ETCO2 falls when compressions pause", kpa(air.pausedCell) < kpa(air.sgaCell) && /paused/i.test(air.pausedCell.aria), air.pausedCell);
check("airway steps are noted, not scored, when the patient has a pulse", air.pulseCase.v === "info" && air.pulseCell && air.pulseCell.val === "---", { case: air.pulseCase, cell: air.pulseCell });
check("h17 starts with a flat capnography trace on the new tube", air.h17start && (air.h17start.val === "0.0" || air.h17start.val === "Flat" || air.h17start.val === "Flat trace") && /flat/i.test(air.h17start.aria || "") && air.h17assess.keys.includes("h17_flat"), { cell: air.h17start, keys: air.h17assess.keys });
check("h17: checking the airway re-sites the tube and a trace appears", air.h17fix.v === "ok" && air.h17fix.keys.includes("h17_resite") && kpa(air.h17cell) > 2, { fix: air.h17fix, cell: air.h17cell });
check("new clinical content is tagged for senior colleague review (Show solution on)", /For senior colleague review/.test(air.fb), air.fb.slice(0, 200));
const tagOff = await page.evaluate(() => { const s = window.__scn; s.setHints(false); s.start("s2"); s.act("assess"); s.act("cpr"); s.act("airwayOpen"); return document.getElementById("scnFeedback").innerText; });
check("review tag also shows with Show solution off", /For senior colleague review/.test(tagOff), tagOff.slice(0, 200));
const roscEt = await page.evaluate(() => {
  const s = window.__scn; s.setHints(false);
  s.start("h14"); ["assess", "charge", "clear", "shock", "cpr", "ff", "assess", "cpr", "airwayOpen", "bvm", "ett", "adr", "cause:hypovolaemia"].forEach((a) => s.act(a));
  const before = parseFloat(document.querySelector(".stat-etco2 .stat-val").textContent);
  s.act("fluid:saline");
  const after = parseFloat(document.querySelector(".stat-etco2 .stat-val").textContent);
  return { before, after, prompt: (document.querySelector(".scn-signs") || {}).textContent || "" };
});
check("ETCO2 jumps with ROSC and the prompt names the ETCO2 rise", roscEt.after - roscEt.before >= 1.5 && /ETCO2 has risen sharply/.test(roscEt.prompt), roscEt);

const h17rosc = await page.evaluate(() => {
  const s = window.__scn;
  s.setHints(false);
  const last = () => { const l = s.sim.log.filter((x) => x.o).slice(-1)[0]; return { keys: l.o.keys, v: l.o.v }; };
  const pre = ["assess", "cpr", "adr", "cause:hypoxia"];
  s.start("h17"); pre.forEach((a) => s.act(a));
  const earlyNoSigns = (() => { s.act("assess"); return last(); })();
  s.start("h17"); pre.forEach((a) => s.act(a));
  s.act("oxygen");
  const afterOx = { cpr: s.sim.cpr, pulse: s.sim.pulse, rhythm: s.sim.rhythm.gen, pending: s.sim.roscPending, prompt: (document.querySelector(".scn-signs") || {}).textContent || "", done: s.sim.done };
  s.act("assess");
  const early = { done: s.sim.done, end: s.sim.endReason, pulse: s.sim.pulse, rhythm: s.sim.rhythm.gen, last: last().keys };
  s.start("h17"); pre.forEach((a) => s.act(a));
  s.act("oxygen");
  const cs = s.sim.cycleStart;
  s.act("ff");
  const ff = { done: s.sim.done, end: s.sim.endReason, pulse: s.sim.pulse, clock: s.sim.clock, cs, last: last().keys };
  s.start("h17"); ["assess", "cpr", "cause:hypoxia", "adr", "ff", "assess", "oxygen"].forEach((a) => s.act(a));
  const paused = { cpr: s.sim.cpr, pending: s.sim.roscPending, pulse: s.sim.pulse, prompt: !!document.querySelector(".scn-signs") };
  s.act("cpr");
  const resumed = { prompt: (document.querySelector(".scn-signs") || {}).textContent || "", pulse: s.sim.pulse };
  return { earlyNoSigns, afterOx, early, ff, paused, resumed };
});
check("h17: checking mid-cycle without signs of life is still an interruption", h17rosc.earlyNoSigns.keys.includes("a_interrupt"), h17rosc.earlyNoSigns);
check("h17: re-siting the tube during CPR gives a signs-of-life prompt, no silent rhythm or pulse change", h17rosc.afterOx.cpr && !h17rosc.afterOx.pulse && h17rosc.afterOx.rhythm === "pea" && h17rosc.afterOx.pending && /Stop compressions and check rhythm and pulse/.test(h17rosc.afterOx.prompt) && !h17rosc.afterOx.done, h17rosc.afterOx);
check("h17: an early check after signs of life confirms ROSC", h17rosc.early.done && h17rosc.early.end === "complete" && h17rosc.early.pulse && h17rosc.early.last.includes("h17_roscEarly"), h17rosc.early);
check("h17: CPR for 2 minutes jumps to the end of the cycle and the check", h17rosc.ff.done && h17rosc.ff.pulse && h17rosc.ff.clock === h17rosc.ff.cs + 120 && h17rosc.ff.last.includes("h17_ffCheck"), h17rosc.ff);
check("h17: treated during a pause, ROSC waits for a check and the prompt comes when CPR restarts", !h17rosc.paused.cpr && h17rosc.paused.pending && !h17rosc.paused.pulse && !h17rosc.paused.prompt && /Signs of life/.test(h17rosc.resumed.prompt) && !h17rosc.resumed.pulse, { paused: h17rosc.paused, resumed: h17rosc.resumed });

// 7. Every model path still completes
const models = await page.evaluate(() => {
  const ids = Object.keys(window.__scnIdeal.modelActs);
  return ids.map((id) => { const log = window.__scnIdeal.runModel(id) || []; return { id, n: log.length, complete: log.some((l) => /Scenario complete/.test(l.text || "")) }; });
});
const incomplete = models.filter((m) => !m.complete);
check("all 28 model paths still reach Scenario complete", models.length === 28 && incomplete.length === 0, incomplete);

// 8. Phone: source box toggle and readable references
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await phone.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded" });
await phone.waitForFunction(() => window.__scn && window.__scn.all);
const ph = await phone.evaluate(async () => {
  const box = document.getElementById("scnSourceBox");
  const chev = getComputedStyle(box.querySelector(".scn-source-chevron")).display;
  const sum = box.querySelector("summary");
  const before = box.open; sum.click(); const after = box.open; sum.click();
  const s = window.__scn; s.setHints(true); s.start("s1"); ["assess", "charge", "clear", "shock"].forEach((a) => s.act(a));
  const tag = document.querySelector("#scnFeedback .vtag");
  const src = document.querySelector("#scnFeedback .scn-src");
  return { chev, toggles: before !== after, tagFs: tag ? parseFloat(getComputedStyle(tag).fontSize) : 0, srcFs: src ? parseFloat(getComputedStyle(src).fontSize) : 0, sw: document.documentElement.scrollWidth, vw: window.innerWidth };
});
check("phone: the source box is a visible tap toggle on the chooser", ph.chev !== "none" && ph.toggles, ph);
check("phone: reference text in feedback is at least 14 px and nothing overflows sideways", ph.tagFs >= 14 && ph.srcFs >= 15 && ph.sw <= ph.vw, ph);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`);
process.exit(failed.length ? 1 : 0);
