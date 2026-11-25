import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8793";
const results = [];
function pass(name, extra) { results.push({ name, ok: true, extra }); console.log("PASS", name, extra ? JSON.stringify(extra) : ""); }
function fail(name, extra) { results.push({ name, ok: false, extra }); console.log("FAIL", name, extra ? JSON.stringify(extra) : ""); }

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

await page.goto(BASE + "/ECG_3D.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.ecg3d && window.ecg3d.enterFullscreen, null, { timeout: 20000 });
await page.waitForTimeout(200);

const walk = await page.evaluate(() => {
  const b = document.getElementById("guidedBtn");
  return b ? b.textContent.trim() : "";
});
if (walk === "Walk through the beat") pass("toolbar button is Walk through the beat");
else fail("toolbar button is Walk through the beat", { walk });

const showUi = await page.evaluate(() => ({
  btn: !!document.getElementById("showBtn"),
  panel: !!document.getElementById("showPanel"),
  labelsGone: !document.getElementById("labelsBtn") && !document.getElementById("moreBtn")
}));
if (showUi.btn && showUi.panel && showUi.labelsGone) pass("Show button and panel replace Labels and More", showUi);
else fail("Show button and panel replace Labels and More", showUi);

// Open Show, toggle chambers group and one item, check mixed state
const toggle = await page.evaluate(() => {
  window.ecg3d.openShow();
  const chambers = document.getElementById("show-g-chambers");
  const exp = document.getElementById("show-x-chambers");
  if (exp) exp.click();
  chambers.click(); // all chamber items on
  const afterOn = {
    group: chambers.getAttribute("aria-checked"),
    LV: document.getElementById("show-i-LV").getAttribute("aria-checked"),
    RA: document.getElementById("show-i-RA").getAttribute("aria-checked")
  };
  document.getElementById("show-i-LV").click(); // turn LV off
  const mixed = {
    group: chambers.getAttribute("aria-checked"),
    LV: document.getElementById("show-i-LV").getAttribute("aria-checked"),
    RA: document.getElementById("show-i-RA").getAttribute("aria-checked"),
    items: window.ecg3d.labels().items,
    snap: window.ecg3d.labelSnapshot().map((L) => L.text)
  };
  return { afterOn, mixed, snapHasLV: mixed.snap.includes("Left ventricle"), snapHasRA: mixed.snap.includes("Right atrium") };
});
if (toggle.afterOn.group === "true" && toggle.afterOn.LV === "true" && toggle.mixed.group === "mixed" && toggle.mixed.LV === "false" && toggle.mixed.RA === "true" && !toggle.snapHasLV && toggle.snapHasRA) {
  pass("Show panel: individual chamber toggles and group mixed state", { group: toggle.mixed.group });
} else fail("Show panel: individual chamber toggles and group mixed state", toggle);

const cond = await page.evaluate(() => {
  const g = document.getElementById("show-g-conduction");
  const exp = document.getElementById("show-x-conduction");
  if (exp) exp.click();
  g.click();
  document.getElementById("show-i-sa").click();
  return {
    group: g.getAttribute("aria-checked"),
    sa: document.getElementById("show-i-sa").getAttribute("aria-checked"),
    av: document.getElementById("show-i-av").getAttribute("aria-checked"),
    items: window.ecg3d.labels().items
  };
});
if (cond.group === "mixed" && cond.sa === "false" && cond.av === "true") pass("Show panel: conduction items and mixed group state", cond);
else fail("Show panel: conduction items and mixed group state", cond);

const keys = await page.evaluate(() => {
  const btn = document.getElementById("show-g-vectors");
  btn.focus();
  const ev = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
  btn.dispatchEvent(ev);
  return { checked: btn.getAttribute("aria-checked"), items: window.ecg3d.labels().items.vec };
});
if (keys.checked === "true" && keys.items) pass("Show panel switches are keyboard accessible", keys);
else fail("Show panel switches are keyboard accessible", keys);

await page.evaluate(() => window.ecg3d.closeShow());

// Shared recording: same timestamp, identical samples; views are windows on one clock
const rec = await page.evaluate(() => {
  const t = 2150;
  window.ecg3d.play(false);
  window.ecg3d.setPageTime(t);
  const leads = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
  const samples = Object.fromEntries(leads.map((id) => [id, window.ecg3d.sampleAt(id, t)]));
  const again = Object.fromEntries(leads.map((id) => [id, window.ecg3d.sampleAt(id, t)]));
  const recInfo = window.ecg3d.recording();
  const beat = window.ecg3d.beatIndex(t);
  const start = window.ecg3d.beatStart(beat);
  const now = window.ecg3d.now();
  const cursors = window.ecg3d.sheetCursors();
  const close = window.ecg3d.closeupCursorScreen();
  const rr = [];
  for (let i = 0; i < 20; i++) rr.push(recInfo.starts[i + 1] - recInfo.starts[i]);
  const rate = rr.map((d) => 60000 / d);
  return {
    samples, match: leads.every((id) => samples[id] === again[id]),
    seed: recInfo.seed, rsaMs: recInfo.rsaMs,
    rr, rateMin: Math.min(...rate), rateMax: Math.max(...rate),
    beat, start, tInBeat: now.t, sim: now.simTime,
    cursorT: cursors.map((c) => c.tAbs),
    closeT: close && close.tAbs,
    relXs: cursors.filter((c) => c.id !== "II-rhythm").map((c) => c.relX)
  };
});
const recOk = rec.match && rec.seed === 439001 && rec.rsaMs === 4000
  && rec.rateMin >= 60 && rec.rateMax <= 100
  && rec.cursorT.every((t) => Math.abs(t - 2150) < 1)
  && Math.abs(rec.closeT - 2150) < 1
  && Math.abs(rec.sim - 2150) < 1
  && Math.abs(rec.tInBeat - (2150 - rec.start)) < 1
  && rec.relXs.length === 4 && Math.max(...rec.relXs) - Math.min(...rec.relXs) < 0.5;
if (recOk) pass("One shared recording: same timestamp, same samples, all views and the heart on one clock", { rateMin: rec.rateMin, rateMax: rec.rateMax, beat: rec.beat, rr0: rec.rr[0] });
else fail("One shared recording: same timestamp, same samples, all views and the heart on one clock", rec);

// Close-up: every lead's min/max y stays inside the strip; layout fixed across leads
const clip = await page.evaluate(() => {
  const leads = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
  const rows = [];
  let base0 = null, cssH0 = null, yMin0 = null, yMax0 = null;
  for (const id of leads) {
    window.ecg3d.select(id);
    window.ecg3d.refresh();
    const w = window.ecg3d.closeupWave();
    const pad = 1.5;
    const inside = w && w.yMin >= -pad && w.yMax <= w.cssH + pad;
    if (base0 == null) { base0 = w.baseMm; cssH0 = w.cssH; yMin0 = w.yMin; yMax0 = w.yMax; }
    rows.push({ id, ...w, inside, sameLayout: Math.abs(w.baseMm - base0) < 0.05 && Math.abs(w.cssH - cssH0) < 1 });
  }
  return rows;
});
if (clip.every((r) => r.inside && r.sameLayout)) pass("Close-up: every lead's waveform stays inside a fixed-height strip", { yMin: clip[0].yMin, yMax: clip[0].yMax, cssH: clip[0].cssH });
else fail("Close-up: every lead's waveform stays inside a fixed-height strip", clip);

// Printed lap: at an early time in the window, no dark trace well ahead of the cursor
const printed = await page.evaluate(() => {
  window.ecg3d.select("II");
  window.ecg3d.setPageTime(200);
  window.ecg3d.refresh();
  const c = document.getElementById("leadCloseup");
  const dpr = window.devicePixelRatio || 1;
  const cssW = parseFloat(c.dataset.cssW);
  const cssH = parseFloat(c.dataset.cssH);
  const cursorX = parseFloat(c.dataset.cursorX);
  const ctx = c.getContext("2d");
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const W = c.width, H = c.height;
  let darkAhead = 0;
  const x0 = Math.min(cssW - 2, cursorX + 8);
  const x1 = Math.min(cssW - 2, cursorX + 40);
  for (let cx = Math.floor(x0); cx <= Math.ceil(x1); cx++) {
    const ix = Math.min(W - 1, Math.round(cx * dpr));
    for (let cy = Math.round(cssH * 0.2); cy < Math.round(cssH * 0.85); cy++) {
      const iy = Math.min(H - 1, Math.round(cy * dpr));
      const p = (iy * W + ix) * 4;
      const r = img[p], g = img[p + 1], b = img[p + 2];
      if (r < 110 && g < 110 && b < 110 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25) darkAhead++;
    }
  }
  let darkBehind = 0;
  const xb0 = Math.max(2, cursorX - 40), xb1 = Math.max(2, cursorX - 8);
  for (let cx = Math.floor(xb0); cx <= Math.ceil(xb1); cx++) {
    const ix = Math.min(W - 1, Math.round(cx * dpr));
    for (let cy = Math.round(cssH * 0.2); cy < Math.round(cssH * 0.85); cy++) {
      const iy = Math.min(H - 1, Math.round(cy * dpr));
      const p = (iy * W + ix) * 4;
      const r = img[p], g = img[p + 1], b = img[p + 2];
      if (r < 110 && g < 110 && b < 110 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25) darkBehind++;
    }
  }
  return { cursorX, darkAhead, darkBehind };
});
if (printed.darkAhead < 8 && printed.darkBehind > 20) pass("Printed lap: trace draws in behind the cursor, paper ahead stays blank", printed);
else fail("Printed lap: trace draws in behind the cursor, paper ahead stays blank", printed);

// Full screen controls and stable layout
await page.evaluate(async () => { await window.ecg3d.enterFullscreen(); });
await page.waitForTimeout(250);

const fsCtrl = await page.evaluate(() => {
  const tool = document.getElementById("tool");
  const tl = document.querySelector(".timeline");
  const nav = document.getElementById("timelineFsNav");
  const steps = document.getElementById("stepRow");
  const vis = (el) => !!(el && el.offsetParent);
  const explain = document.querySelector(".explain-card");
  const er = explain.getBoundingClientRect();
  const c1 = document.getElementById("leadCloseup").getBoundingClientRect();
  return {
    timeline: vis(tl), nav: vis(nav), stepsHidden: !vis(steps),
    play: vis(document.getElementById("playBtn")),
    scrub: vis(document.getElementById("scrub")),
    speed: vis(document.getElementById("speed")),
    back: vis(document.getElementById("fsStepBack")),
    next: vis(document.getElementById("fsStepNext")),
    explainH: Math.round(er.height),
    c1: { x: c1.x, y: c1.y, w: c1.width, h: c1.height }
  };
});
if (fsCtrl.timeline && fsCtrl.nav && fsCtrl.stepsHidden && fsCtrl.play && fsCtrl.scrub && fsCtrl.speed && fsCtrl.back && fsCtrl.next && fsCtrl.explainH === 260) {
  pass("Full screen shows timeline, play, speed, scrubber and compact Back/Next; explain stays 260px", fsCtrl);
} else fail("Full screen shows timeline, play, speed, scrubber and compact Back/Next; explain stays 260px", fsCtrl);

const scrubOk = await page.evaluate(() => {
  window.ecg3d.play(false);
  window.ecg3d.setT(120);
  const a = window.ecg3d.now().t;
  const scrub = document.getElementById("scrub");
  scrub.value = "400";
  scrub.dispatchEvent(new Event("input", { bubbles: true }));
  const b = window.ecg3d.now().t;
  return { a, b, playing: window.ecg3d.now().playing };
});
if (Math.abs(scrubOk.a - 120) < 2 && Math.abs(scrubOk.b - 400) < 2 && !scrubOk.playing) pass("Full screen scrubber moves the beat back and forth", scrubOk);
else fail("Full screen scrubber moves the beat back and forth", scrubOk);

const speedOk = await page.evaluate(() => {
  const sel = document.getElementById("speed");
  sel.value = "0.25";
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  const s1 = window.ecg3d.now().speed;
  document.getElementById("playBtn").click();
  const playing = window.ecg3d.now().playing;
  document.getElementById("playBtn").click();
  return { s1, playing, paused: !window.ecg3d.now().playing };
});
if (speedOk.s1 === 0.25 && speedOk.playing && speedOk.paused) pass("Full screen play/pause and speed setting work", speedOk);
else fail("Full screen play/pause and speed setting work", speedOk);

const stepped = await page.evaluate(() => {
  const rects = [];
  window.ecg3d.setGuided(true);
  for (let i = 0; i < 7; i++) {
    window.ecg3d.step(i);
    const explain = document.querySelector(".explain-card").getBoundingClientRect();
    const c1 = document.getElementById("leadCloseup").getBoundingClientRect();
    rects.push({ explainH: explain.height, c1: { x: c1.x, y: c1.y, w: c1.width, h: c1.height } });
  }
  const same = rects.every((r) => Math.abs(r.explainH - 260) < 1
    && Math.abs(r.c1.x - rects[0].c1.x) < 1 && Math.abs(r.c1.y - rects[0].c1.y) < 1
    && Math.abs(r.c1.w - rects[0].c1.w) < 1 && Math.abs(r.c1.h - rects[0].c1.h) < 1);
  return { same, rects };
});
if (stepped.same) pass("Full screen: explain box and close-up do not move or resize across steps", { first: stepped.rects[0] });
else fail("Full screen: explain box and close-up do not move or resize across steps", stepped);

if (errors.length === 0) pass("No console or page errors");
else fail("No console or page errors", errors);

await page.evaluate(async () => { await window.ecg3d.exitFullscreen(); });
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? "FAILED " + failed.length + "/" + results.length : "ALL " + results.length + " PASSED");
process.exit(failed.length ? 1 : 0);
