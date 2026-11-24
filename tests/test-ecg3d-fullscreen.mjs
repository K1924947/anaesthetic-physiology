import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8775";
const results = [];
function pass(name, extra) { results.push({ name, ok: true, extra }); console.log("PASS", name, extra || ""); }
function fail(name, extra) { results.push({ name, ok: false, extra }); console.log("FAIL", name, extra || ""); }

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu"]
});

const d3 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
d3.on("pageerror", (err) => errors.push("pageerror: " + err.message));
d3.on("console", (msg) => { if (msg.type() === "error") errors.push("console.error: " + msg.text()); });

await d3.goto(BASE + "/ECG_3D.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await d3.waitForFunction(() => window.ecg3d && typeof window.ecg3d.enterFullscreen === "function", null, { timeout: 15000 });
const meta = await d3.evaluate(() => {
  const robots = document.querySelector('meta[name="robots"]');
  return {
    title: document.title,
    robots: (robots && robots.getAttribute("content")) || "",
    hasBtn: !!document.getElementById("fsBtn")
  };
});
if (meta.hasBtn && /noindex/i.test(meta.robots) && errors.length === 0) pass("ECG_3D.html loads noindex with a Full screen button", { meta, errors });
else fail("ECG_3D.html loads noindex with a Full screen button", { meta, errors });

await d3.waitForFunction(() => window.ecg3d && window.ecg3d.webgl && window.ecg3d.heartBox, null, { timeout: 20000 });
await d3.evaluate(() => {
  window.ecg3d.play(false);
  window.ecg3d.setT(290);
  window.ecg3d.view('frontal');
});
await d3.waitForTimeout(200);

function midOk(box, extra) {
  const midY = (box.top + box.bottom) / 2;
  const midX = (box.left + box.right) / 2;
  const inView = box.top > 0.01 && box.bottom < 0.99 && box.left > 0.01 && box.right < 0.99;
  return { midX, midY, inView, centred: Math.abs(midX - 0.5) < 0.08 && Math.abs(midY - 0.5) < 0.08, ...extra, box };
}

const framed = await d3.evaluate(() => {
  const box = window.ecg3d.heartBox();
  const o = window.ecg3d.orbitState();
  const c = window.ecg3d.heartCentre();
  const d = Math.hypot(o.target.x - c.x, o.target.y - c.y, o.target.z - c.z);
  return { box, o, c, targetAtCentre: d < 0.15 };
});
const framedMid = midOk(framed.box, { targetAtCentre: framed.targetAtCentre });
if (framedMid.centred && framedMid.inView && framed.targetAtCentre) pass("normal view frames the heart in the middle of the viewer", framedMid);
else fail("normal view frames the heart in the middle of the viewer", framedMid);

const zoomed = await d3.evaluate(() => {
  const o = window.ecg3d.orbitState();
  window.ecg3d.orbit(o.az, o.el, o.r * 0.85);
  const box = window.ecg3d.heartBox();
  const after = window.ecg3d.orbitState();
  const c = window.ecg3d.heartCentre();
  const d = Math.hypot(after.target.x - c.x, after.target.y - c.y, after.target.z - c.z);
  return { box, r0: o.r, r1: after.r, targetAtCentre: d < 0.15 };
});
const zoomedMid = midOk(zoomed.box, { r0: zoomed.r0, r1: zoomed.r1, targetAtCentre: zoomed.targetAtCentre });
if (zoomedMid.centred && zoomedMid.inView && zoomed.r1 < zoomed.r0 && zoomed.targetAtCentre) pass("zooming in keeps the heart centred and fully visible", zoomedMid);
else fail("zooming in keeps the heart centred and fully visible", zoomedMid);

await d3.evaluate(() => window.ecg3d.view('frontal'));

const arrow = await d3.evaluate(() => window.ecg3d.arrowDims());
if (arrow && arrow.shaftRadius <= 0.1 && arrow.headRadius <= 0.24 && arrow.headHeight >= 0.6 && arrow.vecScale >= 3.5 && arrow.shaftRadius < arrow.headRadius) {
  pass("vector arrow is slimmer and longer", arrow);
} else fail("vector arrow is slimmer and longer", arrow);

const fsBefore = await d3.evaluate(() => {
  const t0 = window.ecg3d.simTime();
  window.ecg3d.setSpeed(1);
  window.ecg3d.play(true);
  return { t0 };
});
await d3.locator("#fsBtn").click({ timeout: 10000 });
await d3.waitForTimeout(300);
const fsOn = await d3.evaluate(() => {
  const on = window.ecg3d.isFullscreen();
  const stage = document.getElementById("stage");
  const closeup = document.getElementById("leadCloseupCard");
  const leads = document.getElementById("leadBtns");
  const exitBtn = document.getElementById("fsExitBtn");
  const explain = document.getElementById("explainCard");
  const inView = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const menu = document.querySelector(".stage-bar");
  const closeup2 = document.getElementById("leadCloseupCard2");
  const stageR = stage && stage.getBoundingClientRect();
  const menuR = menu && menu.getBoundingClientRect();
  const closeupR = closeup && closeup.getBoundingClientRect();
  const explainR = explain && explain.getBoundingClientRect();
  const leadsR = leads && leads.getBoundingClientRect();
  const leadBtn = document.querySelector(".lead-btn");
  const leadBtnH = leadBtn ? leadBtn.getBoundingClientRect().height : 0;
  return {
    on,
    stageOn: inView(stage),
    closeupOn: inView(closeup),
    closeup2Hidden: !closeup2 || closeup2.hidden || !inView(closeup2),
    leadsOn: inView(leads),
    exitOn: exitBtn && !exitBtn.hidden && inView(exitBtn),
    explainOn: inView(explain),
    menuOn: inView(menu),
    menuAboveHeart: !!(menuR && stageR && menuR.bottom <= stageR.top + 2),
    explainBelowStrip: !!(closeupR && explainR && explainR.top >= closeupR.bottom - 2),
    leadsBelowExplain: !!(explainR && leadsR && leadsR.top >= explainR.bottom - 8),
    leadBtnH,
    simTime: window.ecg3d.simTime()
  };
});
if (fsOn.on && fsOn.stageOn && fsOn.closeupOn && fsOn.leadsOn && fsOn.exitOn && fsOn.explainOn && fsOn.menuOn && fsOn.menuAboveHeart && fsOn.explainBelowStrip && fsOn.leadBtnH >= 40) {
  pass("Full screen shows the model, menu above the heart, a lead strip, explanation below and a larger lead chooser", fsOn);
} else {
  fail("Full screen shows the model, menu above the heart, a lead strip, explanation below and a larger lead chooser", fsOn);
}

await d3.evaluate(() => { window.ecg3d.select("II"); window.ecg3d.select("V1"); });
const two = await d3.evaluate(() => {
  const inView = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const card2 = document.getElementById("leadCloseupCard2");
  const name1 = document.getElementById("leadCloseupName") && document.getElementById("leadCloseupName").textContent;
  const name2 = document.getElementById("leadCloseupName2") && document.getElementById("leadCloseupName2").textContent;
  const explain = document.getElementById("explainCard");
  const closeup2 = card2 && card2.getBoundingClientRect();
  const explainR = explain && explain.getBoundingClientRect();
  const c1 = window.ecg3d.closeupCursorScreen && window.ecg3d.closeupCursorScreen();
  const c2el = document.getElementById("leadCloseup2");
  const c2 = c2el ? { tAbs: +c2el.dataset.tAbs, t0: +c2el.dataset.t0 } : null;
  return {
    leads: window.ecg3d.selectedLeads(),
    name1, name2,
    card2On: inView(card2),
    explainBelowSecond: !!(closeup2 && explainR && explainR.top >= closeup2.bottom - 2),
    tAbsMatch: !!(c1 && c2 && c1.tAbs === c2.tAbs)
  };
});
if (two.leads && two.leads.length === 2 && two.leads[0] === "II" && two.leads[1] === "V1" && two.name1 === "II" && two.name2 === "V1" && two.card2On && two.explainBelowSecond && two.tAbsMatch) {
  pass("fullscreen can show two synced lead strips with the explanation below", two);
} else fail("fullscreen can show two synced lead strips with the explanation below", two);

await d3.evaluate(() => window.ecg3d.select("V4"));
const three = await d3.evaluate(() => window.ecg3d.selectedLeads());
if (three && three.length === 2 && three[0] === "V1" && three[1] === "V4") pass("selecting a third lead replaces the oldest", { three });
else fail("selecting a third lead replaces the oldest", { three });

await d3.evaluate(() => window.ecg3d.select("V4"));
const kept = await d3.evaluate(() => window.ecg3d.selectedLeads());
if (kept && kept.length === 1 && kept[0] === "V1") pass("deselecting a second lead always leaves at least one selected", { kept });
else fail("deselecting a second lead always leaves at least one selected", { kept });

const fsZoom = await d3.evaluate(() => {
  window.ecg3d.view("frontal");
  const o = window.ecg3d.orbitState();
  window.ecg3d.orbit(o.az, o.el, o.r * 0.85);
  const box = window.ecg3d.heartBox();
  const after = window.ecg3d.orbitState();
  const c = window.ecg3d.heartCentre();
  const d = Math.hypot(after.target.x - c.x, after.target.y - c.y, after.target.z - c.z);
  return { box, r0: o.r, r1: after.r, targetAtCentre: d < 0.15 };
});
const fsZoomMid = midOk(fsZoom.box, { r0: fsZoom.r0, r1: fsZoom.r1, targetAtCentre: fsZoom.targetAtCentre });
if (fsZoomMid.centred && fsZoomMid.inView && fsZoom.r1 < fsZoom.r0 && fsZoom.targetAtCentre) pass("full screen zoom also stays centred on the heart", fsZoomMid);
else fail("full screen zoom also stays centred on the heart", fsZoomMid);

await d3.waitForTimeout(200);
const t1 = await d3.evaluate(() => window.ecg3d.now());
const t0 = fsBefore.t0;
const advanced = t1.simTime > t0;
const inSync = Math.abs((t1.simTime) - (t1.beat * 800 + t1.t)) < 2;
if (advanced && inSync) pass("master simTime keeps running and stays in sync in full screen", { t0, t1 });
else fail("master simTime keeps running and stays in sync in full screen", { t0, t1, advanced, inSync });

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

await d3.goto(BASE + "/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
const homeLeak = await d3.evaluate(() => Array.from(document.querySelectorAll("a")).some((a) => /ECG_3D\\.html$/i.test((a.getAttribute("href") || "").split("?")[0])));
await d3.goto(BASE + "/cardiac.html", { waitUntil: "domcontentloaded", timeout: 30000 });
const hubLeak = await d3.evaluate(() => Array.from(document.querySelectorAll("a")).some((a) => /ECG_3D\\.html$/i.test((a.getAttribute("href") || "").split("?")[0])));
if (!homeLeak && !hubLeak) pass("homepage and cardiac hub do not link to ECG_3D.html");
else fail("homepage and cardiac hub do not link to ECG_3D.html", { homeLeak, hubLeak });

await d3.close();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? "FAILED " + failed.length + "/" + results.length : "ALL " + results.length + " PASSED");
process.exit(failed.length ? 1 : 0);
