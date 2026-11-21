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
  return {
    on,
    stageOn: inView(stage),
    closeupOn: inView(closeup),
    leadsOn: inView(leads),
    exitOn: exitBtn && !exitBtn.hidden && inView(exitBtn),
    explainHidden: !explain || getComputedStyle(explain).display === "none" || explain.getBoundingClientRect().height === 0,
    simTime: window.ecg3d.simTime()
  };
});
if (fsOn.on && fsOn.stageOn && fsOn.closeupOn && fsOn.leadsOn && fsOn.exitOn && fsOn.explainHidden) {
  pass("Full screen shows the model, one lead and a lead chooser", fsOn);
} else {
  fail("Full screen shows the model, one lead and a lead chooser", fsOn);
}

await d3.evaluate(() => window.ecg3d.select("V1"));
const picked = await d3.evaluate(() => document.getElementById("leadCloseupName") && document.getElementById("leadCloseupName").textContent);
if (picked === "V1") pass("fullscreen lead chooser changes the close-up lead", { picked });
else fail("fullscreen lead chooser changes the close-up lead", { picked });

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
