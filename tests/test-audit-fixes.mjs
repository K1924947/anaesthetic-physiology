import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8770";
const SHOT = "/workspace/physio-lab/ecg-quiz/audit";
const results = [];
function pass(name, extra) { results.push({ name, ok: true, extra }); console.log("PASS", name, extra || ""); }
function fail(name, extra) { results.push({ name, ok: false, extra }); console.log("FAIL", name, extra || ""); }

function attachLogs(page, bag) {
  page.on("pageerror", (err) => bag.push("pageerror: " + err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") bag.push("console.error: " + msg.text());
  });
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu"]
});
await mkdir(SHOT, { recursive: true });

const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
attachLogs(page, errors);
await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__scn && window.__scn.all, null, { timeout: 10000 });
if (errors.length === 0) pass("Resus page loads without console errors");
else fail("Resus page loads without console errors", errors);

// #2 and #6: h6 adenosine harm wording
const h6 = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("h6");
  scn.act("assess");
  scn.act("aden");
  const sim = scn.sim;
  const last = (sim.log || []).filter((x) => x.o && x.act === "aden").pop();
  const fb = (document.getElementById("scnFeedback") || {}).innerText || "";
  const debrief = (document.getElementById("scnDebrief") || {}).innerText || "";
  const body = (document.getElementById("scnDecisionList") || {}).innerText || "";
  return {
    done: !!sim.done,
    endReason: sim.endReason,
    keys: last && last.o && last.o.keys,
    harmId: last && last.o && last.o.harm && last.o.harm.id,
    logVerdict: last && last.o && last.o.logVerdict,
    logText: (document.getElementById("scnLog") || {}).innerText || "",
    fb,
    debrief: debrief.slice(0, 1500),
    body: body.slice(0, 2000),
    hasBroad: /unstable broad-complex/i.test(fb + debrief + body + JSON.stringify(last && last.o)),
    hasAf: /atrial fibrillation|irregular/i.test(fb + debrief + body)
  };
});
const h6ok = h6.done && h6.endReason === "harm" && h6.harmId === "harm_adenUnstableAF" && !h6.hasBroad && h6.hasAf
  && /Adenosine is not the treatment for unstable, irregular/i.test(h6.fb + h6.debrief + h6.body);
if (h6ok) pass("h6 adenosine harm names unstable AF, not broad-complex", { harmId: h6.harmId, keys: h6.keys });
else fail("h6 adenosine harm names unstable AF, not broad-complex", h6);

await page.locator("#scnDebrief, #scnFeedback").first().screenshot({ path: path.join(SHOT, "fix-h6-aden-harm.png") }).catch(() => {});
const h6dec = await page.$("#scnDecisionList li, #scnFeedback");
if (h6dec) await h6dec.screenshot({ path: path.join(SHOT, "fix-h6-aden-decision.png") }).catch(() => {});

// #3: event log shows a short reason (s2 shock PEA)
const s2log = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("s2");
  scn.act("assess");
  scn.act("cpr");
  scn.act("shock");
  const last = (scn.sim.log || []).filter((x) => x.o && x.act === "shock").pop();
  const logText = (document.getElementById("scnLog") || {}).innerText || "";
  const fb = (document.getElementById("scnFeedback") || {}).innerText || "";
  return {
    v: last && last.o && last.o.v,
    logVerdict: last && last.o && last.o.logVerdict,
    label: last && last.o ? last.text : "",
    logText,
    fb,
    hasReason: /Not quite:/i.test(logText) && /non-shockable|not indicated|PEA|asystole/i.test(logText)
  };
});
if (s2log.v === "bad" && s2log.hasReason && /not quite/i.test(s2log.fb)) pass("s2 shock PEA log shows a short Not quite reason", { logText: s2log.logText, fb: s2log.fb.slice(0, 300) });
else fail("s2 shock PEA log shows a short Not quite reason", s2log);
await page.locator("#scnLog").screenshot({ path: path.join(SHOT, "fix-reasoned-log.png") }).catch(() => {});
await page.locator("#scnFeedback").screenshot({ path: path.join(SHOT, "fix-s2-shock-feedback.png") }).catch(() => {});

// Unsynchronised shock with a pulse always ends the case (Show solution on and off)
const s5Both = await page.evaluate(() => {
  const scn = window.__scn;
  const run = (hints) => {
    scn.setHints(!!hints);
    scn.start("s5");
    scn.act("assess");
    scn.act("shock");
    const fb = (document.getElementById("scnFeedback") || {}).innerText || "";
    const debrief = (document.getElementById("scnDebrief") || {}).innerText || "";
    const last = (scn.sim.log || []).filter((x) => x.o && x.act === "shock").pop();
    return {
      hints: !!hints,
      done: !!scn.sim.done,
      completed: !!scn.sim.completed,
      endReason: scn.sim.endReason,
      v: last && last.o && last.o.v,
      harmId: last && last.o && last.o.harm && last.o.harm.id,
      verdictText: last && last.o && last.o.verdictText,
      fb,
      debrief: debrief.slice(0, 2000),
      hasWhy: /synchronised|pulse|T wave/i.test(fb + debrief),
      hasPatientHarmed: /Patient harmed: scenario ended/i.test(fb + debrief),
      hasNextShock: /the next shock should be unsynchronised/i.test(fb + debrief),
      onlyHarmLine: !/synchronised|pulse|T wave/i.test(fb)
    };
  };
  return { off: run(false), on: run(true) };
});
for (const [label, r] of [["off", s5Both.off], ["on", s5Both.on]]) {
  const ok = r.done && !r.completed && r.endReason === "harm" && r.v === "bad"
    && r.harmId === "harm_shockPulse" && r.hasPatientHarmed && r.hasWhy && !r.hasNextShock && !r.onlyHarmLine;
  const name = "s5 unsync shock with a pulse ends as harmed (Show solution " + label + ")";
  if (ok) pass(name, { endReason: r.endReason, fb: r.fb && r.fb.slice(0, 300) });
  else fail(name, r);
}

// #7: identical consecutive wrong clicks collapse; rapid adrenaline too
const collapse = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("s2");
  scn.act("assess");
  scn.act("cpr");
  scn.act("shock");
  scn.act("shock");
  scn.act("shock");
  const shocks = (scn.sim.log || []).filter((x) => x.act === "shock").map((x) => ({
    v: x.o.v, notScored: !!x.o.notScoredAgain, log: x.o.logVerdict || ""
  }));
  const score = scn.score();
  return { shocks, score };
});
const colOk = collapse.shocks.length === 3
  && collapse.shocks[0].v === "bad" && !collapse.shocks[0].notScored
  && collapse.shocks[1].notScored && /not scored again/i.test(collapse.shocks[1].log)
  && collapse.shocks[2].notScored
  && collapse.score.of === 3 + ((collapse.score.airwayGaps || []).length); // assess ok, cpr ok, first shock bad; undone airway teaching steps count as 0
if (colOk) pass("identical consecutive wrong shocks count once", collapse);
else fail("identical consecutive wrong shocks count once", collapse);

const adrCol = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("s1");
  const acts = ["assess", "shock", "cpr", "ff", "shock", "cpr", "ff", "shock", "cpr", "adr"];
  for (const a of acts) scn.act(a);
  scn.act("adr");
  scn.act("adr");
  scn.act("adr");
  const adrs = (scn.sim.log || []).filter((x) => x.act === "adr").map((x) => ({
    v: x.o.v, notScored: !!x.o.notScoredAgain, log: x.o.logVerdict || "", keys: x.o.keys
  }));
  return { adrs, score: scn.score() };
});
const tooSoon = adrCol.adrs.filter((a) => /Too soon/i.test(a.log) || (a.keys || []).some((k) => /Soon/.test(k)));
const adrOk = tooSoon.length >= 3
  && tooSoon.filter((a) => !a.notScored && a.log === "Too soon: repeat every 3 to 5 min").length === 1
  && tooSoon.filter((a) => a.notScored && a.log === "Too soon (not scored again)").length === tooSoon.length - 1;
if (adrOk) pass("rapid too-soon adrenaline collapses like atropine", adrCol);
else fail("rapid too-soon adrenaline collapses like atropine", adrCol);

// #8 s6 gas does not complete causes
const s6 = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.useFakeTimers(true);
  scn.start("s6");
  scn.act("assess");
  scn.act("ask:gas");
  scn.advanceTimers(12000);
  const afterGas = {
    done: !!scn.sim.done,
    cause: !!scn.sim.cause,
    didCauses: !!(scn.sim.did && scn.sim.did.causes),
    logText: ((scn.sim.log || []).map((x) => x.text).join(" | ")).slice(-500)
  };
  scn.act("mg");
  const afterMg = { done: !!scn.sim.done, completed: !!scn.sim.completed, cause: !!scn.sim.cause, mg: !!scn.sim.mg };
  scn.act("cause:hypokalaemia");
  const afterCause = { done: !!scn.sim.done, completed: !!scn.sim.completed, cause: !!scn.sim.cause, endReason: scn.sim.endReason };
  return { afterGas, afterMg, afterCause };
});
const s6ok = !s6.afterGas.done && !s6.afterGas.cause && !s6.afterGas.didCauses
  && /Identify reversible causes/i.test(s6.afterGas.logText)
  && s6.afterMg.mg && !s6.afterMg.done && !s6.afterMg.cause
  && s6.afterCause.completed && s6.afterCause.cause && s6.afterCause.endReason === "complete";
if (s6ok) pass("s6 blood gas does not silently complete reversible causes", s6);
else fail("s6 blood gas does not silently complete reversible causes", s6);

// replay s6 mid-case for screenshot (after gas + mg, not complete)
await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.useFakeTimers(true);
  scn.start("s6");
  scn.act("assess");
  scn.act("ask:gas");
  scn.advanceTimers(12000);
  scn.act("mg");
});
await page.locator("#scnStage").screenshot({ path: path.join(SHOT, "fix-s6-gas-mg.png") }).catch(() => {});
await page.locator("#scnFeedback").screenshot({ path: path.join(SHOT, "fix-s6-feedback.png") }).catch(() => {});

// #9 mobile source box collapsed during a running case
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
attachLogs(mobile, errors);
await mobile.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await mobile.waitForFunction(() => window.__scn && window.__scn.all, null, { timeout: 10000 });
const chooserBox = await mobile.evaluate(() => {
  const box = document.getElementById("scnSourceBox");
  const heading = document.getElementById("scnSourceHeading");
  return {
    open: box && box.open,
    heading: heading && heading.textContent,
    runningClass: document.body.classList.contains("scn-case-running")
  };
});
if (chooserBox.open && chooserBox.heading === "Learn from the source" && !chooserBox.runningClass) {
  pass("source box is open on the chooser at 390 px", chooserBox);
} else fail("source box is open on the chooser at 390 px", chooserBox);

await mobile.evaluate(() => {
  window.__scn.setHints(false);
  window.__scn.start("s2");
});
await mobile.waitForTimeout(400);
const runningBox = await mobile.evaluate(() => {
  const box = document.getElementById("scnSourceBox");
  const stage = document.getElementById("scnStage");
  const title = document.getElementById("scnTitle");
  const heading = document.getElementById("scnSourceHeading");
  const stageRect = stage && stage.getBoundingClientRect();
  const boxRect = box && box.getBoundingClientRect();
  return {
    open: box && box.open,
    runningClass: document.body.classList.contains("scn-case-running"),
    stageHidden: stage && stage.classList.contains("hidden"),
    title: title && title.textContent,
    heading: heading && heading.textContent,
    boxHeight: boxRect && Math.round(boxRect.height),
    stageTop: stageRect && Math.round(stageRect.top),
    hint: ((box && box.querySelector(".scn-source-toggle-hint")) || {}).textContent || ""
  };
});
const runOk = runningBox.runningClass && runningBox.open === false && !runningBox.stageHidden
  && /Scenario/.test(runningBox.title || "") && runningBox.heading === "Learn from the source"
  && runningBox.boxHeight < 220;
if (runOk) pass("mobile 390 running case collapses the source box", runningBox);
else fail("mobile 390 running case collapses the source box", runningBox);
await mobile.screenshot({ path: path.join(SHOT, "fix-mobile-390-running.png"), fullPage: false });
// scroll stage into view if needed and shoot again
await mobile.evaluate(() => {
  const el = document.getElementById("scnTitle") || document.getElementById("scnStage");
  if (el) el.scrollIntoView({ block: "start", behavior: "instant" });
});
await mobile.waitForTimeout(200);
await mobile.screenshot({ path: path.join(SHOT, "fix-mobile-390-stage.png"), fullPage: false });

await mobile.evaluate(() => window.__scn.debrief());
const debriefBox = await mobile.evaluate(() => {
  const box = document.getElementById("scnSourceBox");
  return { open: box && box.open, debriefClass: document.body.classList.contains("scn-case-debrief"), runningClass: document.body.classList.contains("scn-case-running") };
});
if (debriefBox.open && debriefBox.debriefClass && !debriefBox.runningClass) pass("source box is open again in the debrief at 390 px", debriefBox);
else fail("source box is open again in the debrief at 390 px", debriefBox);
await mobile.close();

// h7 marking after poster decision (no new drug button)
const h7 = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("h7");
  const scene = scn.sim.scn.scene;
  scn.act("assess");
  scn.act("expert");
  scn.act("pads");
  scn.act("charge");
  scn.act("clear");
  scn.act("sync");
  const syncPath = { done: !!scn.sim.done, completed: !!scn.sim.completed, endReason: scn.sim.endReason, score: scn.score() };
  const last = (scn.sim.log || []).filter((x) => x.act === "sync").pop();
  scn.start("h7");
  scn.act("assess");
  scn.act("amioInf");
  if (!scn.sim.done) scn.finish(true, "complete");
  scn.debrief();
  const lastAmio = (scn.sim.log || []).filter((x) => x.act === "amioInf").pop();
  const debrief = (document.getElementById("scnDebrief") || {}).innerText || "";
  const decision = (document.getElementById("scnDecisionList") || {}).innerText || "";
  const amioPath = {
    v: lastAmio && lastAmio.o.v,
    why: lastAmio && lastAmio.o.keys,
    log: lastAmio && (lastAmio.o.logVerdict || ""),
    done: !!scn.sim.done,
    completed: !!scn.sim.completed,
    missed: (scn.classify() || {}).missed,
    debrief: debrief,
    decision: decision
  };
  const model = (window.__scnIdeal && window.__scnIdeal.modelActs && window.__scnIdeal.modelActs.h7) || [];
  return {
    scene,
    sceneFlagsRisk: /sedation or anaesthesia risk is not described as too high/i.test(scene),
    syncV: last && last.o.v,
    syncPath,
    amioPath,
    model,
    hasTopLevelProcainamide: !!(document.querySelector("[data-a='procainamide']") || document.querySelector("[data-a='procain']"))
  };
});
const h7ok = h7.sceneFlagsRisk && h7.syncV === "ok" && h7.syncPath.completed
  && h7.amioPath.v === "part" && /procainamide/i.test(h7.amioPath.debrief + h7.amioPath.decision)
  && h7.model.indexOf("sync") >= 0 && h7.model.indexOf("amioInf") < 0
  && !h7.hasTopLevelProcainamide;
if (h7ok) pass("h7 sync with sedation is Correct; amiodarone is Partly right; procainamide is not a top-level button", { model: h7.model, amioV: h7.amioPath.v });
else fail("h7 sync with sedation is Correct; amiodarone is Partly right; procainamide is not a top-level button", h7);

// model paths still complete (h7 now expert, charge, clear, sync)
const models = await page.evaluate(() => {
  const scn = window.__scn;
  const paths = window.__scnIdeal.modelActs;
  const out = {};
  for (const id of Object.keys(paths)) {
    scn.setHints(false);
    scn.useFakeTimers(true);
    scn.start(id);
    for (const a of paths[id]) {
      if (scn.sim.done) break;
      scn.act(a);
      if (a === "nibp" || String(a).indexOf("ask:") === 0) scn.advanceTimers(12000);
    }
    out[id] = { done: !!scn.sim.done, completed: !!scn.sim.completed, endReason: scn.sim.endReason, bad: (scn.sim.log || []).filter((x) => x.o && x.o.v === "bad").map((x) => x.act) };
  }
  return out;
});
const failedModels = Object.entries(models).filter(([, r]) => !r.completed || r.endReason !== "complete");
if (failedModels.length === 0) pass("all model paths still complete", { n: Object.keys(models).length });
else fail("all model paths still complete", failedModels);

await page.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log("\n" + results.filter((r) => r.ok).length + " passed, " + failed.length + " failed, " + results.length + " total");
if (failed.length) process.exit(1);
