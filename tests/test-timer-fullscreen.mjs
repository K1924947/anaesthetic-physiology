import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8772";
const results = [];
function pass(name, extra) { results.push({ name, ok: true, extra }); console.log("PASS", name, extra || ""); }
function fail(name, extra) { results.push({ name, ok: false, extra }); console.log("FAIL", name, extra || ""); }

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu"]
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__scn && window.__scn.all, null, { timeout: 10000 });

const clock = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("s1");
  scn.act("assess");
  scn.act("cpr");
  const cycleStart = scn.sim.cycleStart;
  const afterStart = scn.sim.clock;
  scn.act("charge");
  scn.act("clear");
  scn.act("shock");
  scn.act("cpr");
  const afterResume = { clock: scn.sim.clock, cycleStart: scn.sim.cycleStart, cycleOpen: scn.sim.cycleOpen, cpr: scn.sim.cpr };
  scn.act("ff");
  return {
    cycleStart,
    afterStart,
    afterResume,
    afterFf: scn.sim.clock,
    expected: cycleStart + 120,
    oldWrong: afterResume.clock + 120,
    done: !!scn.sim.done,
    endReason: scn.sim.endReason
  };
});
const clockOk = clock.afterResume.cycleStart === clock.cycleStart
  && clock.afterFf === clock.expected
  && clock.afterFf !== clock.oldWrong
  && !clock.done;
if (clockOk) pass("CPR for 2 minutes counts from the first Start CPR of the cycle", clock);
else fail("CPR for 2 minutes counts from the first Start CPR of the cycle", clock);

const hands = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("s1");
  const before = { clock: scn.sim.clock, done: !!scn.sim.done };
  scn.act("skip");
  const fb = (document.getElementById("scnFeedback") || {}).innerText || "";
  const debrief = (document.getElementById("scnDebrief") || {}).innerText || "";
  return {
    before,
    done: !!scn.sim.done,
    completed: !!scn.sim.completed,
    endReason: scn.sim.endReason,
    clock: scn.sim.clock,
    hasWhy: /prolonged interruption to compressions/i.test(fb + debrief),
    hasMinimise: /minimal interruption/i.test(fb + debrief)
  };
});
const handsOk = hands.done && !hands.completed && hands.endReason === "handsOff" && hands.clock >= 60 && hands.hasWhy;
if (handsOk) pass("hands-off of 60 s in arrest ends the case as a fail", hands);
else fail("hands-off of 60 s in arrest ends the case as a fail", hands);

const under = await page.evaluate(() => {
  const scn = window.__scn;
  scn.setHints(false);
  scn.start("s1");
  scn.act("assess");
  scn.act("charge");
  scn.act("clear");
  scn.act("shock");
  return { done: !!scn.sim.done, clock: scn.sim.clock, endReason: scn.sim.endReason, cpr: scn.sim.cpr };
});
if (!under.done && under.clock < 60) pass("a first shock under 60 s does not trigger the hands-off fail", under);
else fail("a first shock under 60 s does not trigger the hands-off fail", under);

await page.close();

for (const vp of [{ width: 1280, height: 800 }, { width: 1024, height: 553 }]) {
  const p = await browser.newPage({ viewport: vp });
  await p.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await p.waitForFunction(() => window.__scn && window.__scn.all, null, { timeout: 10000 });
  const layout = await p.evaluate(() => {
    const inView = (el, slop) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      return r.top >= -1 && r.top < vh && r.bottom <= vh + (slop || 1);
    };
    const box = document.getElementById("scnSourceBox");
    const heading = document.getElementById("scnSourceHeading");
    const chooser = document.getElementById("scnChooserTitle");
    const random = document.querySelector(".scn-random");
    const card = document.querySelector(".scn-card");
    const vh = window.innerHeight, vw = window.innerWidth;
    return {
      open: box && box.open,
      heading: heading && heading.textContent,
      headingInView: inView(heading),
      chooserInView: inView(chooser),
      randomInView: inView(random, 8),
      firstCardTop: card && Math.round(card.getBoundingClientRect().top),
      firstCardStartsInView: card && card.getBoundingClientRect().top < vh - 8,
      scrollHeight: document.documentElement.scrollHeight,
      vh, vw
    };
  });
  const name = "first screen shows without scrolling at " + vp.width + "x" + vp.height;
  const ok = layout.heading === "Learn from the source" && layout.headingInView && !layout.open
    && layout.chooserInView && layout.randomInView
    && (vp.height >= 800 ? layout.firstCardStartsInView : true);
  if (ok) pass(name, layout);
  else fail(name, layout);
  await p.close();
}

const hub = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await hub.goto(BASE + "/cardiac.html", { waitUntil: "domcontentloaded", timeout: 30000 });
const cardiac = await hub.evaluate(() => {
  const cards = Array.from(document.querySelectorAll("a.jcard")).map((a) => ({ href: a.getAttribute("href"), title: (a.querySelector(".jcard-title") || {}).textContent || "" }));
  const orderLinks = Array.from(document.querySelectorAll(".order-list a")).map((a) => a.getAttribute("href"));
  return { cards, orderLinks, intro: (document.querySelector(".hub-intro") || {}).textContent || "" };
});
const hubOk = !cardiac.cards.some((c) => /Resus_Scenarios/.test(c.href) || /Resus Scenarios/.test(c.title))
  && !cardiac.orderLinks.some((h) => /Resus_Scenarios/.test(h))
  && cardiac.cards.some((c) => c.href === "ECG_Basics.html")
  && cardiac.orderLinks.some((h) => h === "ECG_Basics.html");
if (hubOk) pass("Resus Scenarios is not in the cardiac hub list or cards, and ECG Basics is", cardiac);
else fail("Resus Scenarios is not in the cardiac hub list or cards, and ECG Basics is", cardiac);
await hub.goto(BASE + "/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
const home = await hub.evaluate(() => !!document.querySelector('a.jcard[href="Resus_Scenarios.html"]'));
if (home) pass("homepage Resus Scenarios card is kept");
else fail("homepage Resus Scenarios card is kept");
await hub.close();

const d3 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await d3.goto(BASE + "/ECG_3D.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await d3.waitForFunction(() => window.ecg3d && typeof window.ecg3d.enterFullscreen === "function", null, { timeout: 15000 });
const fsBefore = await d3.evaluate(() => {
  const t0 = window.ecg3d.simTime();
  window.ecg3d.setSpeed(1);
  window.ecg3d.play(true);
  return { t0, hasBtn: !!document.getElementById("fsBtn") };
});
await d3.locator("#fsBtn").click({ timeout: 10000 });
await d3.waitForTimeout(300);
const fsOn = await d3.evaluate(() => {
  const on = window.ecg3d.isFullscreen();
  const fallback = document.body.classList.contains("ecg3d-fs-fallback");
  const native = !!(document.fullscreenElement || document.webkitFullscreenElement);
  const stage = document.getElementById("stage");
  const closeup = document.getElementById("leadCloseupCard");
  const leads = document.getElementById("leadBtns");
  const exitBtn = document.getElementById("fsExitBtn");
  const header = document.querySelector(".site-header");
  const explain = document.getElementById("explainCard");
  const inView = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  return {
    on, fallback, native,
    stageOn: inView(stage),
    closeupOn: inView(closeup),
    leadsOn: inView(leads),
    exitOn: exitBtn && !exitBtn.hidden && inView(exitBtn),
    headerCoveredOrHidden: !header || getComputedStyle(header).display === "none" || header.getBoundingClientRect().bottom <= 0 || (document.body.classList.contains("ecg3d-fs-fallback") && (stage && stage.getBoundingClientRect().top >= 0)),
    explainHidden: !explain || getComputedStyle(explain).display === "none" || explain.getBoundingClientRect().height === 0,
    sel: window.ecg3d.now && window.ecg3d.now().simTime,
    simTime: window.ecg3d.simTime()
  };
});
const fsEntered = fsOn.on && fsOn.stageOn && fsOn.closeupOn && fsOn.leadsOn && fsOn.exitOn && fsOn.explainHidden;
if (fsEntered) pass("3D full screen shows the model, one lead and a lead chooser", fsOn);
else fail("3D full screen shows the model, one lead and a lead chooser", fsOn);

await d3.evaluate(() => window.ecg3d.select("V1"));
const picked = await d3.evaluate(() => document.getElementById("leadCloseupName") && document.getElementById("leadCloseupName").textContent);
if (picked === "V1") pass("fullscreen lead chooser changes the close-up lead", { picked });
else fail("fullscreen lead chooser changes the close-up lead", { picked });

await d3.waitForTimeout(200);
const t1 = await d3.evaluate(() => window.ecg3d.simTime());
if (t1 > fsBefore.t0) pass("master simTime keeps running in full screen", { t0: fsBefore.t0, t1 });
else fail("master simTime keeps running in full screen", { t0: fsBefore.t0, t1 });

await d3.keyboard.press("Escape");
await d3.waitForTimeout(200);
let fsOff = await d3.evaluate(() => window.ecg3d.isFullscreen());
if (fsOff) {
  await d3.click("#fsExitBtn");
  await d3.waitForTimeout(200);
  fsOff = await d3.evaluate(() => window.ecg3d.isFullscreen());
}
if (!fsOff) pass("Exit or Escape leaves 3D full screen");
else fail("Exit or Escape leaves 3D full screen", { fsOff });

await d3.goto(BASE + "/ECG_Basics.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await d3.waitForSelector("h1", { timeout: 10000 });
const coming = await d3.evaluate(() => {
  const title = (document.querySelector("h1") || {}).textContent || document.title || "";
  const is3dPage = /in 3D/i.test(title);
  const nodes = Array.from(document.querySelectorAll("a, button, [aria-disabled], .scn-banner, .next-card, .next-link"));
  const see = nodes.filter((el) => /see it in 3d/i.test(el.textContent || "") || /see it in 3d/i.test(el.getAttribute("aria-label") || ""));
  const liveLinks = Array.from(document.querySelectorAll("a")).filter((el) => {
    const href = (el.getAttribute("href") || "").split("?")[0];
    return /ECG_3D\.html$/i.test(href);
  });
  const allDisabledOrSoon = see.every((el) => {
    const href = (el.getAttribute("href") || "").split("?")[0];
    const disabled = el.disabled || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("disabled") || !href || href === "#" || /coming soon/i.test(el.textContent || "");
    return disabled && !/ECG_3D\.html$/i.test(href);
  });
  return { title, is3dPage, seeCount: see.length, liveLinks: liveLinks.length, allDisabledOrSoon };
});
if (coming.seeCount >= 1 && coming.allDisabledOrSoon && coming.liveLinks === 0) pass("See it in 3D is visibly unavailable and does not link to ECG_3D.html", coming);
else fail("See it in 3D must stay unavailable and must not link to ECG_3D.html", coming);
await d3.close();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? "FAILED " + failed.length + "/" + results.length : "ALL " + results.length + " PASSED");
process.exit(failed.length ? 1 : 0);
