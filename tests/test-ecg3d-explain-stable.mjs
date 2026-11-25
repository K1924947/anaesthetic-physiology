import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8793";
const results = [];
function pass(name, extra) { results.push({ name, ok: true, extra }); console.log("PASS", name, extra || ""); }
function fail(name, extra) { results.push({ name, ok: false, extra }); console.log("FAIL", name, extra || ""); }

function sameRect(a, b, tol = 0.5) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) <= tol
    && Math.abs(a.y - b.y) <= tol
    && Math.abs(a.width - b.width) <= tol
    && Math.abs(a.height - b.height) <= tol;
}

function rectKey(r) {
  if (!r) return null;
  return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu"]
});

async function measureSteps(page) {
  await page.waitForFunction(() => window.ecg3d && typeof window.ecg3d.step === "function", null, { timeout: 20000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    window.ecg3d.play(false);
    const card = document.getElementById("explainCard");
    const scroll = document.getElementById("explainScroll");
    const closeup = document.getElementById("leadCloseupCard");
    const steps = [];
    for (let i = 0; i < 7; i++) {
      window.ecg3d.step(i);
      const cr = closeup.getBoundingClientRect();
      const er = card.getBoundingClientRect();
      steps.push({
        i,
        title: (document.getElementById("phaseTitle") || {}).textContent || "",
        closeup: { x: cr.x, y: cr.y, width: cr.width, height: cr.height },
        explain: { x: er.x, y: er.y, width: er.width, height: er.height },
        scrollOverflow: scroll.scrollHeight - scroll.clientHeight
      });
    }
    return steps;
  });
}

async function openPage(viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(BASE + "/ECG_3D.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  return page;
}

const desktop = await openPage({ width: 1280, height: 800 });
const dSteps = await measureSteps(desktop);
const d0 = dSteps[0];
const closeupStable = dSteps.every((s) => sameRect(s.closeup, d0.closeup));
const explainStable = dSteps.every((s) => sameRect(s.explain, d0.explain));
const explainH = d0 && d0.explain ? d0.explain.height : 0;
const allFit = dSteps.every((s) => s.scrollOverflow <= 1);
if (closeupStable && explainStable && dSteps.length === 7) {
  pass("selected-lead ECG box bounding rect is identical across all 7 steps at 1280x800", {
    closeup: rectKey(d0.closeup),
    explainH: +explainH.toFixed(2),
    titles: dSteps.map((s) => s.title)
  });
} else {
  fail("selected-lead ECG box bounding rect is identical across all 7 steps at 1280x800", {
    steps: dSteps.map((s) => ({ i: s.i, title: s.title, closeup: rectKey(s.closeup), explain: rectKey(s.explain) }))
  });
}
if (explainH >= 256 && explainH <= 264 && allFit) {
  pass("explanation box is a fixed 260px and fits every step at 1280x800 without scrolling", {
    explainH: +explainH.toFixed(2),
    overflow: dSteps.map((s) => ({ i: s.i, overflow: s.scrollOverflow }))
  });
} else {
  fail("explanation box is a fixed 260px and fits every step at 1280x800 without scrolling", {
    explainH: +explainH.toFixed(2),
    overflow: dSteps.map((s) => ({ i: s.i, title: s.title, overflow: s.scrollOverflow }))
  });
}
await desktop.close();

const narrow = await openPage({ width: 960, height: 600 });
const nSteps = await measureSteps(narrow);
const n0 = nSteps[0];
const nCloseupStable = nSteps.every((s) => sameRect(s.closeup, n0.closeup));
const nExplainStable = nSteps.every((s) => sameRect(s.explain, n0.explain));
if (nCloseupStable && nExplainStable && nSteps.length === 7) {
  pass("selected-lead ECG box bounding rect is identical across all 7 steps at 960x600", {
    closeup: rectKey(n0.closeup),
    explainH: +n0.explain.height.toFixed(2),
    maxOverflow: Math.max(...nSteps.map((s) => s.scrollOverflow))
  });
} else {
  fail("selected-lead ECG box bounding rect is identical across all 7 steps at 960x600", {
    steps: nSteps.map((s) => ({ i: s.i, title: s.title, closeup: rectKey(s.closeup), explain: rectKey(s.explain), overflow: s.scrollOverflow }))
  });
}
await narrow.close();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? "FAILED " + failed.length + "/" + results.length : "ALL " + results.length + " PASSED");
process.exit(failed.length ? 1 : 0);
