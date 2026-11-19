import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8770";
const SHOT = process.env.SHOT_DIR || "/workspace/physio-lab/ecg-quiz/drugs-cases-shots";
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

const inventory = await page.evaluate(() => {
  const scn = window.__scn;
  return {
    nAll: scn.all.length,
    nListed: scn.listed.length,
    ids: scn.all.map((s) => s.id),
    listed: scn.listed.map((s) => s.id),
    hasDrugsBtn: true,
    modelIds: Object.keys((window.__scnIdeal && window.__scnIdeal.modelActs) || {})
  };
});
if (inventory.nAll === 28 && inventory.nListed === 28 && inventory.modelIds.length === 28) {
  pass("28 cases listed and in Random, with model paths", inventory);
} else fail("28 cases listed and in Random, with model paths", inventory);

// Dose chooser: open panel, adenosine Give disabled until a dose is chosen, fixed-dose preselected
const chooser = await page.evaluate(async () => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("s4");
  const drugsBtn = document.querySelector("[data-a='drugs']");
  if (!drugsBtn) return { ok: false, reason: "no drugs button" };
  drugsBtn.click();
  const pop = document.getElementById("scnDrugPopup");
  const groups = Array.from(document.querySelectorAll(".scn-drug-group-title")).map((h) => h.textContent.trim());
  const adenBtn = document.querySelector("[data-drug='aden']");
  if (!adenBtn) return { ok: false, reason: "no adenosine button", groups, open: pop && !pop.hidden };
  adenBtn.click();
  const radios = Array.from(document.querySelectorAll("input[name='scnDrugDose']")).map((r) => ({ value: r.value, checked: r.checked }));
  const give = document.getElementById("scnDrugGive");
  const giveDisabled = !!(give && give.disabled);
  const clock0 = scn.sim.clock;
  // Back, then adrenaline (fixed-dose)
  const back = document.getElementById("scnDrugBack");
  if (back) back.click();
  const adrBtn = document.querySelector("[data-drug='adr']");
  adrBtn.click();
  const adrRadios = Array.from(document.querySelectorAll("input[name='scnDrugDose']")).map((r) => ({ value: r.value, checked: r.checked }));
  const give2 = document.getElementById("scnDrugGive");
  const give2Disabled = !!(give2 && give2.disabled);
  const clock1 = scn.sim.clock;
  return {
    ok: true,
    open: pop && !pop.hidden,
    groups,
    adenRadios: radios,
    adenGiveDisabled: giveDisabled,
    adrRadios,
    adrGiveEnabled: give2 && !give2Disabled,
    clockUnchanged: clock0 === 0 && clock1 === 0,
    hasShapes: !!document.querySelector(".scn-drug-shape")
  };
});
const chooserOk = chooser.ok && chooser.open && chooser.adenGiveDisabled
  && chooser.adenRadios.length === 3 && chooser.adenRadios.every((r) => !r.checked)
  && chooser.adrGiveEnabled && chooser.adrRadios.length === 1 && chooser.adrRadios[0].checked
  && chooser.clockUnchanged && chooser.groups.length >= 6;
if (chooserOk) pass("dose chooser: adenosine unselected, fixed-dose preselected, clock unchanged", chooser);
else fail("dose chooser: adenosine unselected, fixed-dose preselected, clock unchanged", chooser);

await page.locator("#scnDrugList").screenshot({ path: path.join(SHOT, "desktop-dose-chooser.png") });
// close chooser to show the grouped panel
await page.evaluate(() => {
  const back = document.getElementById("scnDrugBack");
  if (back) back.click();
});
await page.locator("#scnDrugList").screenshot({ path: path.join(SHOT, "desktop-drugs-panel.png") });
await page.evaluate(() => { if (window.closeScnMenu) window.closeScnMenu("scnDrugList"); else document.getElementById("scnDrugClose")?.click(); });

// Adenosine wrong dose is Partly right; correct sequence is Correct
const adenDose = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("s4");
  scn.act("assess");
  scn.act("vagal");
  scn.act("aden:12");
  const skip = (scn.sim.log || []).filter((x) => x.o && String(x.act).indexOf("aden") === 0).pop();
  scn.start("s4");
  scn.act("assess");
  scn.act("vagal");
  scn.act("aden:6");
  scn.act("aden:6");
  const repeat = (scn.sim.log || []).filter((x) => x.o && String(x.act).indexOf("aden") === 0).pop();
  scn.start("s4");
  scn.act("assess");
  scn.act("vagal");
  scn.act("aden:6");
  scn.act("aden:12");
  const ok = (scn.sim.log || []).filter((x) => x.o && x.act === "aden:12").pop();
  return {
    skipV: skip && skip.o.v,
    skipDone: !!scn.sim.done, // last run
    lastDone: !!scn.sim.done,
    lastV: ok && ok.o.v,
    repeatV: repeat && repeat.o.v,
    repeatEnded: null
  };
});
// the last run is the correct sequence which should complete; recompute skip/repeat from stored
if (adenDose.skipV === "part" && adenDose.repeatV === "part" && adenDose.lastV === "ok") {
  pass("adenosine skip-ahead and repeat are Partly right; 6 then 12 is Correct", adenDose);
} else fail("adenosine skip-ahead and repeat are Partly right; 6 then 12 is Correct", adenDose);

// h7: procainamide is in the panel, not a top-level button; amio infusion still Partly right
const h7 = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("h7");
  const topLevelProcain = !!(document.querySelector("[data-a='procain']") || document.querySelector("[data-a='procainamide']"));
  const drugsBtn = document.querySelector("[data-a='drugs']");
  drugsBtn.click();
  const inPanel = !!document.querySelector("[data-drug='procain']");
  document.getElementById("scnDrugClose")?.click();
  scn.act("assess");
  scn.act("amioInf");
  const last = (scn.sim.log || []).filter((x) => x.o && x.act === "amioInf").pop();
  return { topLevelProcain, inPanel, v: last && last.o.v, done: !!scn.sim.done };
});
if (!h7.topLevelProcain && h7.inPanel && h7.v === "part") pass("h7: procainamide is in the panel; amiodarone infusion is Partly right", h7);
else fail("h7: procainamide is in the panel; amiodarone infusion is Partly right", h7);

// All model paths score full marks
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
    const score = scn.score();
    out[id] = {
      done: !!scn.sim.done,
      completed: !!scn.sim.completed,
      endReason: scn.sim.endReason,
      pts: score && score.pts,
      of: score && score.of,
      bad: (scn.sim.log || []).filter((x) => x.o && x.o.v === "bad").map((x) => x.act)
    };
  }
  return out;
});
const failedModels = Object.entries(models).filter(([, r]) => !r.completed || r.endReason !== "complete" || r.pts !== r.of || (r.bad && r.bad.length));
if (failedModels.length === 0) pass("all " + Object.keys(models).length + " model paths score full marks", { n: Object.keys(models).length });
else fail("all model paths score full marks", failedModels);

// New case midway screenshot: h19 after assess, panel closed
await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("h19");
  scn.act("assess");
});
await page.locator("#scnStage").screenshot({ path: path.join(SHOT, "desktop-h19-midway.png") });

// Debrief screenshot after model path of h19
await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.useFakeTimers(true);
  scn.start("h19");
  for (const a of window.__scnIdeal.modelActs.h19) {
    if (scn.sim.done) break;
    scn.act(a);
    if (a === "nibp" || String(a).indexOf("ask:") === 0) scn.advanceTimers(12000);
  }
  if (!scn.sim.done) scn.finish(true);
  scn.debrief();
});
await page.waitForSelector("#scnDebrief:not(.hidden)", { timeout: 8000 });
await page.locator("#scnDebrief").screenshot({ path: path.join(SHOT, "desktop-h19-debrief.png") });

await page.close();

// Mobile: no console errors, shots of panel and chooser
const mobileErrors = [];
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
attachLogs(mobile, mobileErrors);
await mobile.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await mobile.waitForFunction(() => window.__scn && window.__scn.all, null, { timeout: 10000 });
await mobile.evaluate(() => {
  window.__scn.setHints(false);
  window.__scn.start("h18");
  window.__scn.act("assess");
  document.querySelector("[data-a='drugs']")?.click();
});
await mobile.locator("#scnDrugList").screenshot({ path: path.join(SHOT, "mobile-drugs-panel.png") });
await mobile.evaluate(() => {
  document.querySelector("[data-drug='aden']")?.click();
});
await mobile.locator("#scnDrugList").screenshot({ path: path.join(SHOT, "mobile-dose-chooser.png") });
await mobile.evaluate(() => document.getElementById("scnDrugClose")?.click());
if (mobileErrors.length === 0) pass("mobile Resus has no console errors");
else fail("mobile Resus has no console errors", mobileErrors);

await mobile.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log("\n" + results.filter((r) => r.ok).length + " passed, " + failed.length + " failed, " + results.length + " total");
if (failed.length) process.exit(1);
