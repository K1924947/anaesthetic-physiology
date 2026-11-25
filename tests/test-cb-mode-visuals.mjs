// Verify Colour-blind mode applies to all visuals (3D WebGL, SVG, canvas, CSS)
// and that ECG paper remains standard light-orange grid + black trace in both modes.
// Run against a local server of this worktree:
//   PHYSIO_BASE=http://127.0.0.1:<port> node tests/test-cb-mode-visuals.mjs
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const { chromium } = pkg;
const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8793";
const SHOTS_DIR = process.env.CB_SHOTS_DIR || "";

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok: !!ok, extra });
  console.log(ok ? "PASS" : "FAIL", name, extra !== undefined ? JSON.stringify(extra) : "");
}

function rgbToHex(rgb) {
  const m = String(rgb || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return String(rgb || "").toLowerCase();
  return "#" + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, "0")).join("");
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
});

if (SHOTS_DIR) await mkdir(SHOTS_DIR, { recursive: true });

// 1. ECG_3D.html: orange slow front + CB mode on 3D heart, tubes, colour key, cursor
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(BASE + "/ECG_3D.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.ecg3d && window.ecg3d.webgl && window.ecg3d.themeColors, null, { timeout: 60000 });

  await page.evaluate(() => {
    window.ecg3d.play(false);
    window.ecg3d.setT(250);
    window.ecg3d.view("frontal");
  });
  await page.waitForTimeout(300);

  async function inspect3D() {
    return await page.evaluate(() => {
      const c = document.getElementById("scene");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      const w = c.width, h = c.height;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let brightOrange = 0, darkBrown = 0, bluePx = 0;
      // Sample central heart region
      const x0 = Math.floor(w * 0.25), x1 = Math.floor(w * 0.75);
      const y0 = Math.floor(h * 0.2), y1 = Math.floor(h * 0.8);
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * w + x) * 4;
          const r = px[i], g = px[i + 1], b = px[i + 2];
          if (r > 180 && g > 70 && g < 160 && b < 55) brightOrange++;
          if (r > 80 && r < 150 && g < 45 && b < 30) darkBrown++;
          if (b > 120 && r < 40 && g > 50 && g < 130) bluePx++;
        }
      }
      const cssFront = getComputedStyle(document.documentElement).getPropertyValue("--ecg3d-front").trim().toLowerCase();
      const cssCursor = getComputedStyle(document.documentElement).getPropertyValue("--ecg3d-cursor").trim().toLowerCase();
      const tc = window.ecg3d.themeColors();
      return {
        theme: window.ecg3d.theme(),
        front: tc.front.toLowerCase(),
        cssFront,
        cssCursor,
        brightOrange,
        darkBrown,
        bluePx
      };
    });
  }

  const def3d = await inspect3D();
  check("ECG_3D default: bright orange front pixels present", def3d.brightOrange > 40 && def3d.brightOrange > def3d.darkBrown * 3, def3d);
  check("ECG_3D default: theme front matches CSS --ecg3d-front", def3d.front === def3d.cssFront && def3d.front === "#e0701e", def3d);

  await page.click("#colour-blind-toggle");
  await page.waitForTimeout(350);

  const cb3d = await inspect3D();
  check("ECG_3D CB mode active", cb3d.theme === "colour-blind" && cb3d.cssCursor === "#005a9e", cb3d);
  check("ECG_3D CB mode: bright orange front pixels present (not brown-red)", cb3d.brightOrange > 40 && cb3d.brightOrange > cb3d.darkBrown * 3, cb3d);
  check("ECG_3D CB mode: theme front matches CSS --ecg3d-front", cb3d.front === cb3d.cssFront && cb3d.front === "#d95f02", cb3d);
  check("ECG_3D CB mode: blue pulse/dot pixels rendered", cb3d.bluePx > 5, cb3d);
  check("ECG_3D no console/page errors", errors.length === 0, errors);

  if (SHOTS_DIR) {
    await page.screenshot({ path: path.join(SHOTS_DIR, "ecg3d-cb-midqrs.png") });
  }
  await page.close();
}

// 2. ECG_Basics.html: SVG traces/wheel change in CB mode, ECG paper stays standard light orange
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(BASE + "/ECG_Basics.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#beatSvg .hl-trace", { timeout: 15000 });

  const defState = await page.evaluate(() => ({
    hlStroke: document.querySelector("#beatSvg .hl-trace")?.getAttribute("stroke")?.toLowerCase(),
    axisCol: document.querySelector("#axisSvg .axis-shaft:not(.axis-shaft-true)")?.getAttribute("stroke")?.toLowerCase(),
    paperMinor: getComputedStyle(document.documentElement).getPropertyValue("--ecg-minor").trim().toLowerCase(),
    paperMajor: getComputedStyle(document.documentElement).getPropertyValue("--ecg-major").trim().toLowerCase(),
    paperBg: getComputedStyle(document.documentElement).getPropertyValue("--ecg-paper").trim().toLowerCase()
  }));

  await page.click("#colour-blind-toggle");
  await page.waitForTimeout(200);

  const cbState = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    hlStroke: document.querySelector("#beatSvg .hl-trace")?.getAttribute("stroke")?.toLowerCase(),
    axisCol: document.querySelector("#axisSvg .axis-shaft:not(.axis-shaft-true)")?.getAttribute("stroke")?.toLowerCase(),
    paperMinor: getComputedStyle(document.documentElement).getPropertyValue("--ecg-minor").trim().toLowerCase(),
    paperMajor: getComputedStyle(document.documentElement).getPropertyValue("--ecg-major").trim().toLowerCase(),
    paperBg: getComputedStyle(document.documentElement).getPropertyValue("--ecg-paper").trim().toLowerCase()
  }));

  check("ECG_Basics CB mode updates #beatSvg and #axisSvg strokes",
    defState.hlStroke === "#184a63" && cbState.hlStroke === "#005a9e" && cbState.axisCol === "#005a9e",
    { defState, cbState });
  check("ECG_Basics ECG paper remains light orange in both modes (not grey)",
    defState.paperMinor === "#f8dfd2" && cbState.paperMinor === "#f8dfd2" && cbState.paperMajor === "#edb497",
    { defState, cbState });
  check("ECG_Basics no errors", errors.length === 0, errors);

  if (SHOTS_DIR) {
    await page.screenshot({ path: path.join(SHOTS_DIR, "ecg-basics-cb.png") });
  }
  await page.close();
}

// 3. ECG_Rhythm_Quiz.html: conduction diagram & markers update; ECG paper stays light orange
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(BASE + "/ECG_Rhythm_Quiz.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".cd-on", { timeout: 15000 });

  const defQuiz = await page.evaluate(() => ({
    cdOn: getComputedStyle(document.querySelector(".cd-on")).stroke,
    annText: getComputedStyle(document.querySelector(".ann-text")).fill,
    paperMinor: getComputedStyle(document.documentElement).getPropertyValue("--ecg-minor").trim().toLowerCase()
  }));

  await page.click("#colour-blind-toggle");
  await page.waitForTimeout(200);

  const cbQuiz = await page.evaluate(() => ({
    cdOn: getComputedStyle(document.querySelector(".cd-on")).stroke,
    annText: getComputedStyle(document.querySelector(".ann-text")).fill,
    paperMinor: getComputedStyle(document.documentElement).getPropertyValue("--ecg-minor").trim().toLowerCase(),
    paperMajor: getComputedStyle(document.documentElement).getPropertyValue("--ecg-major").trim().toLowerCase()
  }));

  check("ECG_Rhythm_Quiz CB mode updates conduction diagram & strip markers",
    rgbToHex(defQuiz.cdOn) === "#184a63" && rgbToHex(cbQuiz.cdOn) === "#005a9e" && rgbToHex(cbQuiz.annText) === "#005a9e",
    { defQuiz, cbQuiz });
  check("ECG_Rhythm_Quiz ECG paper remains light orange in CB mode",
    cbQuiz.paperMinor === "#f8dfd2" && cbQuiz.paperMajor === "#edb497", cbQuiz);
  check("ECG_Rhythm_Quiz no errors", errors.length === 0, errors);

  if (SHOTS_DIR) {
    await page.screenshot({ path: path.join(SHOTS_DIR, "ecg-rhythm-quiz-cb.png") });
  }
  await page.close();
}

// 4. Resus_Scenarios.html: monitor & drug families CB-safe; ECG paper stays light orange
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__scn && window.__scn.start, null, { timeout: 15000 });
  await page.evaluate(() => window.__scn.start("s1"));
  await page.waitForSelector(".mon-svg .mon-head", { timeout: 10000 });

  const defResus = await page.evaluate(() => ({
    monHead: getComputedStyle(document.querySelector(".mon-head")).fill,
    paperMinor: getComputedStyle(document.documentElement).getPropertyValue("--ecg-minor").trim().toLowerCase()
  }));

  await page.click("#colour-blind-toggle");
  await page.waitForTimeout(200);

  const cbResus = await page.evaluate(() => ({
    monHead: getComputedStyle(document.querySelector(".mon-head")).fill,
    paperMinor: getComputedStyle(document.documentElement).getPropertyValue("--ecg-minor").trim().toLowerCase(),
    paperMajor: getComputedStyle(document.documentElement).getPropertyValue("--ecg-major").trim().toLowerCase()
  }));

  check("Resus_Scenarios CB mode updates monitor sweep head colour",
    rgbToHex(defResus.monHead) === "#184a63" && rgbToHex(cbResus.monHead) === "#005a9e",
    { defResus, cbResus });
  check("Resus_Scenarios monitor ECG paper remains light orange in CB mode",
    cbResus.paperMinor === "#f8dfd2" && cbResus.paperMajor === "#edb497", cbResus);
  check("Resus_Scenarios no errors", errors.length === 0, errors);
  await page.close();
}

// 5. Cardiac_Action_Potential.html, Cardiac_Murmurs.html, PV_Loop.html
for (const spec of [
  { file: "Cardiac_Action_Potential.html", svgSel: "#apSvg path[stroke='#184A63'], #apSvg path[stroke='#184a63']", cbExpected: "#005a9e" },
  { file: "Cardiac_Murmurs.html", svgSel: "#mmSvg path[stroke='#184A63'], #mmSvg path[stroke='#184a63']", cbExpected: "#005a9e" },
  { file: "PV_Loop.html", svgSel: "#pvSvg path[stroke='#184A63'], #pvSvg path[stroke='#184a63']", cbExpected: "#005a9e" }
]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(BASE + "/" + spec.file, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(spec.svgSel, { state: "attached", timeout: 15000 });

  const defHasDefault = await page.evaluate(sel => document.querySelectorAll(sel).length > 0, spec.svgSel);
  await page.click("#colour-blind-toggle");
  await page.waitForTimeout(250);
  const cbCount = await page.evaluate(col => {
    const els = document.querySelectorAll("svg [stroke]");
    let n = 0;
    els.forEach(el => { if ((el.getAttribute("stroke") || "").toLowerCase() === col) n++; });
    return n;
  }, spec.cbExpected);

  check(`${spec.file} CB mode updates SVG diagram strokes`, defHasDefault && cbCount > 0, { defHasDefault, cbCount });
  check(`${spec.file} no errors`, errors.length === 0, errors);
  await page.close();
}

// 6. Hub/static pages + localStorage persistence
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  const defAccent = rgbToHex(await page.evaluate(() => getComputedStyle(document.querySelector(".jcard-icon")).color));
  await page.click("#colour-blind-toggle");
  const cbAccent = rgbToHex(await page.evaluate(() => getComputedStyle(document.querySelector(".jcard-icon")).color));
  await page.reload({ waitUntil: "domcontentloaded" });
  const persisted = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute("data-theme"),
    pressed: document.getElementById("colour-blind-toggle")?.getAttribute("aria-pressed"),
    accent: getComputedStyle(document.querySelector(".jcard-icon")).color
  }));
  check("index.html CB mode updates card icons and persists across reload",
    defAccent === "#184a63" && cbAccent === "#005a9e" && persisted.attr === "colour-blind" && persisted.pressed === "true",
    { defAccent, cbAccent, persisted });
  await page.close();
}

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(failed.length ? `${failed.length} FAILED of ${results.length}` : `ALL ${results.length} PASSED`);
process.exit(failed.length ? 1 : 0);
