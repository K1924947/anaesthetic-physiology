import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
import fs from "node:fs";
import path from "node:path";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8776";
const SHOT_DIR = process.env.LEARN_PRACTISE_SHOTS || "/workspace/physio-lab/learn-practise-shots";
const results = [];
function pass(name, extra) { results.push({ name, ok: true, extra }); console.log("PASS", name, extra || ""); }
function fail(name, extra) { results.push({ name, ok: false, extra }); console.log("FAIL", name, extra || ""); }

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu"]
});

async function dragFrom(page, pt, dx) {
  await page.mouse.move(pt.clientX, pt.clientY);
  await page.mouse.down();
  await page.mouse.move(pt.clientX + dx, pt.clientY, { steps: 10 });
  await page.mouse.up();
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push("console.error: " + msg.text()); });

/* ---- Homepage: Learn / Practise ---- */
await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("#home-learn-h", { timeout: 10000 });
const home = await page.evaluate(() => {
  const learn = document.getElementById("home-learn-h");
  const practise = document.getElementById("home-practise-h");
  const learnSec = learn && learn.closest("section");
  const practiseSec = practise && practise.closest("section");
  const hrefs = (sec) => sec ? Array.from(sec.querySelectorAll("a.jcard")).map((a) => a.getAttribute("href")) : [];
  return {
    learnTitle: learn && learn.textContent.trim(),
    practiseTitle: practise && practise.textContent.trim(),
    learnHrefs: hrefs(learnSec),
    practiseHrefs: hrefs(practiseSec),
    resusInLearn: !!(learnSec && learnSec.querySelector('a[href="Resus_Scenarios.html"]')),
    cardiacInLearn: !!(learnSec && learnSec.querySelector('a[href="cardiac.html"]')),
    resusInPractise: !!(practiseSec && practiseSec.querySelector('a[href="Resus_Scenarios.html"]')),
    atoe: practiseSec ? (practiseSec.textContent || "") : "",
    leaked3d: !!document.querySelector('a[href*="ECG_3D.html"]')
  };
});
if (home.learnTitle === "Learn" && home.practiseTitle === "Practise" && home.cardiacInLearn && !home.resusInLearn && home.resusInPractise && /A to E/i.test(home.atoe) && !home.leaked3d) {
  pass("homepage splits Learn and Practise, Resus is out of Learn", home);
} else fail("homepage splits Learn and Practise, Resus is out of Learn", home);

fs.mkdirSync(SHOT_DIR, { recursive: true });
const shotPath = path.join(SHOT_DIR, "homepage-1280x800.png");
await page.screenshot({ path: shotPath, fullPage: false });
pass("homepage screenshot saved", shotPath);

/* ---- ECG Basics: axis teach, QTc copy, rate Start calliper ---- */
errors.length = 0;
await page.goto(BASE + "/ECG_Basics.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__ecgBasics, { timeout: 10000 });

const teach = await page.evaluate(() => {
  const axis = document.getElementById("step-axis");
  const text = (axis && axis.textContent || "").replace(/\s+/g, " ");
  const qtcBox = document.querySelector(".qtc-box");
  const qtc = (qtcBox && qtcBox.textContent || "").replace(/\s+/g, " ");
  const valuesTable = document.querySelector("table") || document.body;
  const values = valuesTable.textContent || "";
  return {
    hasQuadrant: /leads I and aVF/i.test(text) && /quadrant/i.test(text),
    hasLeadII: /lead II/i.test(text) && /left axis deviation/i.test(text),
    hasIso: /isoelectric/i.test(text) && /perpendicular/i.test(text),
    hasWhy: /net-positive QRS/i.test(text) && /positive pole/i.test(text) && /hexaxial/i.test(text),
    hasCategory: /marked by category/i.test(text),
    srcLitfl: !!(axis && axis.querySelector('a[href="https://litfl.com/ecg-axis-interpretation/"]')),
    qtcNoCalc: /not expected to calculate/i.test(qtc) && /machine-reported QT is the corrected QTc/i.test(qtc),
    qtcRanges: /440 ms in men/i.test(qtc) && /460 ms in women/i.test(qtc) && /500 ms/i.test(qtc),
    qtcSourced: !!(qtcBox && qtcBox.querySelector('a[href="https://litfl.com/qt-interval-ecg-library/"]')),
    valuesRanges: /440 ms in men/i.test(values) && /460 ms in women/i.test(values)
  };
});
if (teach.hasQuadrant && teach.hasLeadII && teach.hasIso && teach.hasWhy && teach.hasCategory && teach.srcLitfl) {
  pass("axis section has a sourced step-by-step method", teach);
} else fail("axis section has a sourced step-by-step method", teach);
if (teach.qtcNoCalc && teach.qtcRanges && teach.qtcSourced && teach.valuesRanges) {
  pass("QTc teaching uses machine-reported QTc and sourced ranges", teach);
} else fail("QTc teaching uses machine-reported QTc and sourced ranges", teach);

await page.evaluate(() => {
  window.__ecgBasics.read.startRate({ kind: "regular", largeSq: 4, seed: 1 });
});
await page.locator("#rateSvg").scrollIntoViewIfNeeded();
await page.waitForTimeout(150);
const before = await page.evaluate(() => window.__ecgBasics.read.state().rate);
const startPt = await page.evaluate(() => window.__ecgBasics.read.caliperPoint("A", "head"));
const learnDrag = await page.evaluate((dx) => {
  const svg = document.getElementById("rateSvg");
  const pt = window.__ecgBasics.read.caliperPoint("A", "head") || window.__ecgBasics.read.caliperPoint("A", "line");
  if (!svg || !pt) return { ok: false, reason: "no point" };
  const ev = (type, x, y) => new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", bubbles: true, cancelable: true, buttons: type === "pointerup" ? 0 : 1 });
  svg.dispatchEvent(ev("pointerdown", pt.clientX, pt.clientY));
  svg.dispatchEvent(ev("pointermove", pt.clientX + dx, pt.clientY));
  svg.dispatchEvent(ev("pointerup", pt.clientX + dx, pt.clientY));
  const after = window.__ecgBasics.read.state().rate;
  return { ok: true, calA: after.calA, marks: after.marks, t: pt.t };
}, 90);
const moved = learnDrag && Math.abs(learnDrag.calA - before.calA) > 0.04;
const noMarks = learnDrag && learnDrag.marks.length === 0;
if (moved && noMarks) pass("Learn: Rate Start calliper can be dragged", { before: before.calA, after: learnDrag.calA, marks: learnDrag.marks });
else fail("Learn: Rate Start calliper can be dragged", { before, learnDrag, startPt });

/* Snapped onto the first R: Start should still drag, not toggle a mark */
await page.evaluate(() => {
  const st = window.__ecgBasics.read.state().rate;
  window.__ecgBasics.read.setRateCalipers(st.times[0], st.times[0] + 0.40);
});
await page.waitForTimeout(100);
const snappedBefore = await page.evaluate(() => window.__ecgBasics.read.state().rate);
await page.locator("#rateSvg").scrollIntoViewIfNeeded();
const snappedPt = await page.evaluate(() => window.__ecgBasics.read.caliperPoint("A", "head") || window.__ecgBasics.read.caliperPoint("A", "line"));
const snappedAfter = await page.evaluate((dx) => {
  const svg = document.getElementById("rateSvg");
  const pt = window.__ecgBasics.read.caliperPoint("A", "head") || window.__ecgBasics.read.caliperPoint("A", "line");
  const ev = (type, x, y) => new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", bubbles: true, cancelable: true, buttons: type === "pointerup" ? 0 : 1 });
  svg.dispatchEvent(ev("pointerdown", pt.clientX, pt.clientY));
  svg.dispatchEvent(ev("pointermove", pt.clientX + dx, pt.clientY));
  svg.dispatchEvent(ev("pointerup", pt.clientX + dx, pt.clientY));
  return window.__ecgBasics.read.state().rate;
}, 70);
if (snappedAfter && Math.abs(snappedAfter.calA - snappedBefore.calA) > 0.04 && snappedAfter.marks.length === 0) {
  pass("Learn: Start calliper still drags when it sits on an R wave", { before: snappedBefore.calA, after: snappedAfter.calA });
} else fail("Learn: Start calliper still drags when it sits on an R wave", { snappedBefore, snappedAfter });

/* Drills */
await page.evaluate(() => {
  window.__ecgBasics.quiz.open({ type: "rate", kind: "regular", largeSq: 4, seed: 1 });
});
await page.waitForSelector("#quizSvg", { timeout: 5000 });
await page.locator("#quizSvg").scrollIntoViewIfNeeded();
await page.waitForTimeout(150);
const qBefore = await page.evaluate(() => window.__ecgBasics.quiz.state());
const qPt = await page.evaluate(() => window.__ecgBasics.quiz.caliperPoint("A", "line"));
if (!qPt) fail("Drills rate Start calliper has a hit point", qPt);
else {
  await dragFrom(page, qPt, 80);
  const qAfter = await page.evaluate(() => window.__ecgBasics.quiz.state());
  const moved = qAfter && Math.abs(qAfter.calA - qBefore.calA) > 0.04;
  const marks = (qAfter.item && qAfter.item.marks) || [];
  if (moved && marks.length === 0) pass("Drills: Rate Start calliper can be dragged", { before: qBefore.calA, after: qAfter.calA, marks });
  else fail("Drills: Rate Start calliper can be dragged", { qBefore, qAfter, qPt });
}

const qtcItem = await page.evaluate(() => {
  const item = window.__ecgBasics.quiz.specToItem({ type: "calipers", measure: "QT" });
  return {
    skip: !!(item && item.skipMeasure && item.machineQtc),
    q: item && item.q,
    help: item && item.help,
    hasMachine: item && /machine reports a QTc/i.test(item.q),
    noBazett: item && !/Bazett/i.test(item.q + " " + item.help),
    ranges: item && /440 ms in men/i.test(item.help) && /460 ms in women/i.test(item.help)
  };
});
if (qtcItem.skip && qtcItem.hasMachine && qtcItem.noBazett && qtcItem.ranges) {
  pass("QTc drills ask learners to interpret a machine QTc, not calculate it", qtcItem);
} else fail("QTc drills ask learners to interpret a machine QTc, not calculate it", qtcItem);

/* ---- Resus: cause-matched feedback + Challenge mode ---- */
errors.length = 0;
await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__scn, { timeout: 10000 });

const causeCases = [
  { id: "h16", cause: "tamponade", need: /tamponade/i, forbid: /hypovolaemia, one of the 4 Hs|give IV fluid/i },
  { id: "h15", cause: "thrombosis", need: /thrombosis|pulmonary embolism/i, forbid: /hypovolaemia, one of the 4 Hs|give IV fluid/i },
  { id: "h17", cause: "hypoxia", need: /hypoxia/i, forbid: /hypovolaemia, one of the 4 Hs|give IV fluid/i },
  { id: "h18", cause: "hypokalaemia", need: /hypokalaemia/i, forbid: /QT-prolonging drugs/i },
  { id: "s2", cause: "hypovolaemia", need: /hypovolaemia/i, forbid: /tamponade/i },
  { id: "h14", cause: "hypovolaemia", need: /hypovolaemia/i, forbid: /tamponade/i }
];
let causeOk = true;
const causeExtra = [];
for (const c of causeCases) {
  const got = await page.evaluate(({ id, cause }) => {
    if (window.__scn.setHints) window.__scn.setHints(true);
    window.__scn.start(id);
    if (window.__scn.setHints) window.__scn.setHints(true);
    window.__scn.pickCause(cause);
    const fb = (document.getElementById("scnFeedback") && document.getElementById("scnFeedback").innerText) || "";
    const keys = (window.__scn.sim && window.__scn.sim.lastFb && window.__scn.sim.lastFb.o && window.__scn.sim.lastFb.o.keys) || [];
    return { fb: fb.replace(/\s+/g, " "), keys: keys.slice() };
  }, c);
  const text = got.fb || "";
  const ok = c.need.test(text) && !c.forbid.test(text) && got.keys.some((k) => k !== "cause_ok");

  causeExtra.push({ id: c.id, cause: c.cause, ok, keys: got.keys, text: (got.fb || "").slice(0, 360) });
  if (!ok) causeOk = false;
}
if (causeOk) pass("reversible-cause feedback matches the chosen cause", causeExtra);
else fail("reversible-cause feedback matches the chosen cause", causeExtra);

function playModelPath(id) {
  return page.evaluate((caseId) => {
    const scn = window.__scn;
    const path = (window.__scnIdeal && window.__scnIdeal.modelActs && window.__scnIdeal.modelActs[caseId]) || [];
    scn.setHints(false);
    scn.useFakeTimers(true);
    scn.start(caseId, true);
    for (const a of path) {
      if (scn.sim.done) break;
      scn.act(a);
      if (a === "nibp" || String(a).indexOf("ask:") === 0) scn.advanceTimers(12000);
    }
    const st = document.getElementById("scnChallengeStatus");
    const bar = document.getElementById("scnChallengeNextBar");
    const r = st ? st.getBoundingClientRect() : null;
    return {
      done: !!scn.sim.done,
      completed: !!scn.sim.completed,
      endReason: scn.sim.endReason,
      ch: scn.challenge(),
      status: st ? (st.hidden ? "" : (st.textContent || "").trim()) : "",
      statusInView: !!(r && r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0),
      nextBar: !!(bar && !bar.hidden),
      nextFeedback: !!document.getElementById("scnChallengeNext")
    };
  }, id);
}

const challenge = await page.evaluate(() => {
  localStorage.removeItem("physioResusChallengeBest");
  const chooserHas = !!document.getElementById("scnChallenge");
  window.__scn.startChallenge();
  const first = window.__scn.challenge();
  const during = ((document.getElementById("scnChallengeStatus") || {}).textContent || "").trim();
  const title = (document.getElementById("scnTitle") && document.getElementById("scnTitle").textContent) || "";
  window.__scn.finish(true, "complete");
  const afterOk = window.__scn.challenge();
  const statusAfter = ((document.getElementById("scnChallengeStatus") || {}).textContent || "").trim();
  const nextBtn = !!document.getElementById("scnChallengeNext") || !!(document.getElementById("scnChallengeNextBar") && !document.getElementById("scnChallengeNextBar").hidden);
  window.__scn.random();
  window.__scn.finish(false, "harm");
  const afterFail = window.__scn.challenge();
  const result = (document.getElementById("scnChallengeResult") && document.getElementById("scnChallengeResult").textContent) ||
    (document.getElementById("scnChallengeStatus") && document.getElementById("scnChallengeStatus").textContent) || "";
  const stored = localStorage.getItem("physioResusChallengeBest");
  return { chooserHas, first, during, title, afterOk, statusAfter, nextBtn, afterFail, result, stored };
});
const chOk = challenge.chooserHas &&
  challenge.first && challenge.first.on && challenge.first.score === 0 &&
  /Challenge: 0 completed, best 0/.test(challenge.during) &&
  /Challenge case/i.test(challenge.title) &&
  challenge.afterOk && challenge.afterOk.on && challenge.afterOk.score === 1 && challenge.afterOk.best === 1 &&
  /Challenge: 1 completed, best 1/.test(challenge.statusAfter) &&
  challenge.nextBtn &&
  challenge.afterFail && challenge.afterFail.justEnded && !challenge.afterFail.on &&
  challenge.afterFail.lastScore === 1 && challenge.afterFail.best === 1 &&
  /Challenge ended: 1 completed, best 1/.test(challenge.result) &&
  challenge.stored === "1";
if (chOk) pass("Challenge mode counts a streak, ends on a fail, and stores the best score", challenge);
else fail("Challenge mode counts a streak, ends on a fail, and stores the best score", challenge);

await page.evaluate(() => localStorage.removeItem("physioResusChallengeBest"));
await page.evaluate(() => window.__scn.startChallenge());
const twoA = await playModelPath("s4");
const twoB = await playModelPath("h7");
// h7 model path is perfect (sync). Also play a partly-right finish on a fresh challenge case.
const part = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.useFakeTimers(true);
  scn.start("h7", true);
  scn.act("assess");
  scn.act("ask:ecg12"); scn.advanceTimers(12000);
  scn.act("nibp"); scn.advanceTimers(12000);
  scn.act("amioInf");
  const st = document.getElementById("scnChallengeStatus");
  const bar = document.getElementById("scnChallengeNextBar");
  const last = (scn.sim.log || []).filter((x) => x.o && x.act === "amioInf").pop();
  return {
    done: !!scn.sim.done,
    completed: !!scn.sim.completed,
    v: last && last.o && last.o.v,
    ch: scn.challenge(),
    status: st ? (st.hidden ? "" : (st.textContent || "").trim()) : "",
    nextBar: !!(bar && !bar.hidden)
  };
});
const twoOk = twoA.completed && twoA.ch.score === 1 && /Challenge: 1 completed, best 1/.test(twoA.status) && twoA.statusInView && twoA.nextBar
  && twoB.completed && twoB.ch.score === 2 && /Challenge: 2 completed, best 2/.test(twoB.status) && twoB.statusInView && twoB.nextBar
  && part.completed && part.v === "part" && part.ch.score === 3 && /Challenge: 3 completed, best 3/.test(part.status) && part.nextBar;
if (twoOk) pass("Challenge counter increments across two model-path cases and a partly-right finish", { twoA, twoB, part });
else fail("Challenge counter increments across two model-path cases and a partly-right finish", { twoA, twoB, part });

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log("\n" + results.filter((r) => r.ok).length + " passed, " + failed.length + " failed, " + results.length + " total");
if (failed.length) process.exit(1);
