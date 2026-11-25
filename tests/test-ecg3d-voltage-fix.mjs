// Scrubber width, chest-gain labels, visible close-up bounds, visual-only heart shift,
// and 12-lead click/keyboard focus. Run from the worktree root against port 8793:
//   PHYSIO_BASE=http://127.0.0.1:8793 node tests/test-ecg3d-voltage-fix.mjs
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8793";
const HERE = dirname(fileURLToPath(import.meta.url));
const results = [];
function pass(name, extra) { results.push({ name, ok: true, extra }); console.log("PASS", name, extra ? JSON.stringify(extra) : ""); }
function fail(name, extra) { results.push({ name, ok: false, extra }); console.log("FAIL", name, extra ? JSON.stringify(extra) : ""); }

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

await page.goto(BASE + "/ECG_3D.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.ecg3d && window.ecg3d.enterFullscreen, null, { timeout: 60000 });
await page.waitForTimeout(200);

const LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];

// 1. Voltages clearly normal; limb samples match the dipole (visual shift is not in the electrical path)
const volts = await page.evaluate((leads) => {
  function ext(id) {
    const a = window.ecg3d.trace(id);
    let hi = -99, lo = 99;
    for (let t = 0; t < a.length; t++) { if (a[t] > hi) hi = a[t]; if (a[t] < lo) lo = a[t]; }
    return { hi, lo };
  }
  const E = {};
  for (const id of leads) E[id] = ext(id);
  const mm = (v) => v * 10;
  const sokolow = mm(-E.V1.lo + Math.max(E.V5.hi, E.V6.hi));
  const sv1rv5 = mm(-E.V1.lo + E.V5.hi);
  const cornell = mm(E.aVL.hi + (-E.V3.lo));
  const rAVL = mm(E.aVL.hi);
  const t = 243;
  const D = window.ecg3d.dipoleAt(t);
  const II = window.ecg3d.trace("II")[t];
  // Lead II is (0, 1/Math.sqrt(2)?); compare via TRACE vs dipole * implied dir from aVF/I if needed.
  // Direct check: body vs visual composition, and II sample equals dipole projection stored in TRACE.
  const p = [0.32, -2.02, 0.05];
  const body = window.ecg3d.bodyPoint(p);
  const vis = window.ecg3d.visualPoint(p);
  const s = window.ecg3d.visualShift();
  const sc = window.ecg3d.visScale();
  const composed = [s.x + sc * body[0], s.y + sc * body[1], s.z + sc * body[2]];
  const maxComp = Math.max(...composed.map((v, i) => Math.abs(v - vis[i])));
  return {
    sokolow, sv1rv5, cornell, rAVL, iiR: mm(E.II.hi), v2S: mm(E.V2.lo), v6R: mm(E.V6.hi),
    shift: s, maxComp, dipole: D, II, chestMm: window.ecg3d.sheetChestMmPerMv()
  };
}, LEADS);
const voltsOk = volts.sokolow >= 20 && volts.sokolow <= 25
  && volts.sokolow < 35 && volts.cornell < 20 && volts.rAVL < 11
  && volts.shift.x > 0 && volts.shift.y < 0 && volts.maxComp < 1e-6
  && volts.chestMm === 5;
if (voltsOk) pass("Voltages clearly normal; visual shift is display-only; chest sheet stays 5 mm/mV", volts);
else fail("Voltages clearly normal; visual shift is display-only; chest sheet stays 5 mm/mV", volts);

const base = JSON.parse(readFileSync(join(HERE, "fixtures/ecg3d-baseline-traces.json"), "utf8"));
const traceDiff = await page.evaluate((base) => {
  let maxDiff = 0, worst = null;
  for (const [id, arr] of Object.entries(base.traces)) {
    const now = window.ecg3d.trace(id);
    arr.forEach((x, k) => {
      const d = Math.abs(now[k * base.stepMs] - x);
      if (d > maxDiff) { maxDiff = d; worst = { id, k, expected: x, got: now[k * base.stepMs] }; }
    });
  }
  return { maxDiff, worst };
}, base);
if (traceDiff.maxDiff < 0.002) pass("Lead samples match the scaled electrical baseline (visual shift does not change them)", traceDiff);
else fail("Lead samples match the scaled electrical baseline (visual shift does not change them)", traceDiff);

const anatomy = await page.evaluate(() => {
  const apex = window.ecg3d.apexWorld();
  const v4 = window.ecg3d.electrodeWorld("V4");
  const v1 = window.ecg3d.electrodeWorld("V1");
  const v2 = window.ecg3d.electrodeWorld("V2");
  const c = window.ecg3d.heartCentre();
  const s = window.ecg3d.visualShift();
  return {
    apex, v4, v1, v2, c, s,
    apexLeftOfCentre: apex.x > c.x,
    apexUnderV4: apex.y < v4.y,
    apexCloserInXToV4ThanUnshifted: Math.abs((apex.x) - v4.x) < Math.abs((apex.x - s.x) - v4.x)
  };
});
if (anatomy.apexLeftOfCentre && anatomy.apexUnderV4 && anatomy.apexCloserInXToV4ThanUnshifted)
  pass("Visual heart sits down and to the patient's left, apex under V4", anatomy);
else fail("Visual heart sits down and to the patient's left, apex under V4", anatomy);

// 2. No in-cell 5 mm/mV labels on the sheet
const labels = await page.evaluate(() => window.ecg3d.sheetDrawnTexts());
const noInCell = Array.isArray(labels) && labels.every((t) => t.role === "footer" || !/5\s*mm\/mV/i.test(t.text || ""));
const footerNamesChest = labels.some((t) => t.role === "footer" && /chest leads 5 mm\/mV/i.test(t.text || ""));
if (noInCell && footerNamesChest)
  pass("5 mm/mV is named in the caption only, not drawn on the traces", labels);
else fail("5 mm/mV is named in the caption only, not drawn on the traces", labels);

// 3. Close-up visible bounds, all 12 leads, after another beat and a resize
async function closeupAll(tag, requireInkInside) {
  const rows = await page.evaluate((leads) => {
    const out = [];
    for (const id of leads) {
      window.ecg3d.select(id);
      window.ecg3d.refresh();
      const w = window.ecg3d.closeupWave();
      const pad = 1.5;
      const visH = w.visH || w.cssH;
      const visTop = w.visTopInCanvas || 0;
      const visBot = (w.visBotInCanvas != null) ? w.visBotInCanvas : visH;
      const canvasMatchesVis = Math.abs(w.cssH - w.canvasH) < 1.5 && Math.abs(w.visH - w.canvasH) < 1.5;
      const inside = w.yMin >= visTop - pad && w.yMax <= visBot + pad;
      const room = visH + pad >= (w.yMax - w.yMin);
      out.push({ id, inside, room, canvasMatchesVis, yMin: w.yMin, yMax: w.yMax, visH, cssH: w.cssH, canvasH: w.canvasH });
    }
    return out;
  }, LEADS);
  const ok = rows.every((r) => r.canvasMatchesVis && (!requireInkInside || r.inside));
  if (ok) pass("Close-up visible bounds: all 12 leads (" + tag + ")", { n: rows.length, visH: rows[0].visH, v2: rows.find((r) => r.id === "V2") });
  else fail("Close-up visible bounds: all 12 leads (" + tag + ")", rows);
}
await page.evaluate(() => { window.ecg3d.select("V2"); window.ecg3d.setPageTime(280); window.ecg3d.refresh(); });
await closeupAll("first beat, 1280x800", true);
await page.evaluate(() => { window.ecg3d.setPageTime(280 + 800 * 5); window.ecg3d.refresh(); });
await closeupAll("later beat with wander", true);
await page.setViewportSize({ width: 1400, height: 900 });
await page.waitForTimeout(250);
await page.evaluate(() => { window.dispatchEvent(new Event("resize")); window.ecg3d.refresh(); });
await closeupAll("resized 1400x900", true);
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(250);
await page.evaluate(() => { window.dispatchEvent(new Event("resize")); window.ecg3d.refresh(); });

// 4. Click-to-focus, keyboard, cursor, aria-label (normal view)
const hits = await page.evaluate(() => {
  const list = window.ecg3d.sheetHits();
  const v2 = document.querySelector('.ecg12-hit[data-lead="V2"]');
  const cs = v2 ? getComputedStyle(v2).cursor : null;
  window.ecg3d.select("II");
  v2.click();
  const afterClick = window.ecg3d.selectedLeads();
  return {
    list, cursor: cs, afterClick,
    v2Label: v2 && v2.getAttribute("aria-label"),
    focusable: v2 && v2.tabIndex >= 0 && v2.tagName === "BUTTON"
  };
});
const ids = new Set(hits.list.map((h) => h.id));
const labelsOk = hits.list.every((h) => h.label === "Focus lead " + h.id && h.tag === "BUTTON" && h.type === "button");
const allLeadsPresent = LEADS.every((id) => ids.has(id));
if (allLeadsPresent && labelsOk && hits.focusable && hits.cursor === "pointer" && hits.afterClick.includes("V2"))
  pass("12-lead cells: click focuses the lead, pointer cursor, aria-label Focus lead V2", { cursor: hits.cursor, n: hits.list.length, afterClick: hits.afterClick });
else fail("12-lead cells: click focuses the lead, pointer cursor, aria-label Focus lead V2", hits);

await page.evaluate(() => { window.ecg3d.select("II"); });
await page.locator('.ecg12-hit[data-lead="V2"]').focus();
await page.keyboard.press("Enter");
const ent = await page.evaluate(() => window.ecg3d.selectedLeads());
await page.evaluate(() => { window.ecg3d.select("II"); });
await page.locator('.ecg12-hit[data-lead="V2"]').focus();
await page.keyboard.press("Space");
const sp = await page.evaluate(() => window.ecg3d.selectedLeads());
if (ent.includes("V2") && sp.includes("V2")) pass("12-lead cells: Enter and Space focus the lead", { ent, sp });
else fail("12-lead cells: Enter and Space focus the lead", { ent, sp });

// 5. Full screen: pick-up-to-two, unclipped close-ups at both sizes, scrubber width constant
await page.evaluate(async () => { await window.ecg3d.enterFullscreen(); });
await page.waitForTimeout(300);

async function setFsLeads(ids) {
  await page.evaluate((ids) => {
    let guard = 0;
    while (guard++ < 24) {
      const cur = window.ecg3d.selectedLeads();
      const extra = cur.filter((id) => !ids.includes(id));
      const missing = ids.filter((id) => !cur.includes(id));
      if (!extra.length && !missing.length) break;
      // In FS, the last remaining lead cannot be toggled off, so add a wanted lead first.
      if (missing.length && cur.length < 2) { window.ecg3d.select(missing[0]); continue; }
      if (extra.length && cur.length > 1) { window.ecg3d.select(extra[0]); continue; }
      if (missing.length) { window.ecg3d.select(missing[0]); continue; }
      break;
    }
    window.ecg3d.refresh();
  }, ids);
}

function waveOk(w, pad) {
  if (!w || w.visH < 8) return { ok: false, reason: "missing" };
  const visTop = w.visTopInCanvas || 0;
  const visBot = (w.visBotInCanvas != null) ? w.visBotInCanvas : w.visH;
  const canvasMatchesVis = Math.abs(w.cssH - w.canvasH) < 1.5 && Math.abs(w.visH - w.canvasH) < 1.5;
  const inside = w.yMin >= visTop - pad && w.yMax <= visBot + pad;
  return { ok: canvasMatchesVis && inside, canvasMatchesVis, inside, yMin: w.yMin, yMax: w.yMax, visH: w.visH, cssH: w.cssH, canvasH: w.canvasH, lead: w.lead };
}

async function fsCloseupCheck(tag, nLeads, tAbs) {
  await page.evaluate((t) => { window.ecg3d.setPageTime(t); window.ecg3d.refresh(); }, tAbs);
  const pad = 1.5;
  const rows = [];
  let h0 = null;
  for (const id of LEADS) {
    const partner = id === "V2" ? "II" : "V2";
    const ids = nLeads === 2 ? (id === "V2" ? ["V2", "II"] : [id, partner]) : [id];
    await setFsLeads(ids);
    const shot = await page.evaluate((nLeads) => {
      const w1 = window.ecg3d.closeupWave(0);
      const w2 = nLeads === 2 ? window.ecg3d.closeupWave(1) : null;
      const explainH = document.querySelector(".explain-card").getBoundingClientRect().height;
      const c1 = document.getElementById("leadCloseup").getBoundingClientRect();
      const c2el = document.getElementById("leadCloseup2");
      const c2 = c2el && !c2el.closest("[hidden]") ? c2el.getBoundingClientRect() : null;
      return { w1, w2, explainH, sels: window.ecg3d.selectedLeads(), c1: { x: c1.x, y: c1.y, w: c1.width, h: c1.height }, c2: c2 ? { x: c2.x, y: c2.y, w: c2.width, h: c2.height } : null };
    }, nLeads);
    const a = waveOk(shot.w1, pad);
    const b = nLeads === 2 ? waveOk(shot.w2, pad) : { ok: true };
    if (h0 == null) h0 = { c1: shot.c1, c2: shot.c2, explainH: shot.explainH };
    const sameLayout = Math.abs(shot.c1.h - h0.c1.h) < 1 && Math.abs(shot.c1.w - h0.c1.w) < 1
      && Math.abs(shot.explainH - 260) < 1
      && (nLeads !== 2 || (shot.c2 && Math.abs(shot.c2.h - h0.c2.h) < 1 && Math.abs(shot.c2.w - h0.c2.w) < 1));
    rows.push({ id, sels: shot.sels, a, b, explainH: shot.explainH, sameLayout, c1h: shot.c1.h, c2h: shot.c2 && shot.c2.h });
  }
  const ok = rows.every((r) => r.a.ok && r.b.ok && r.sameLayout && Math.abs(r.explainH - 260) < 1);
  if (ok) pass("Full screen close-up: all 12 leads unclipped (" + tag + ")", { n: rows.length, nLeads, visH: rows[0].a.visH, c1h: rows[0].c1h, c2h: rows[0].c2h, v2: rows.find((r) => r.id === "V2") });
  else fail("Full screen close-up: all 12 leads unclipped (" + tag + ")", rows);
}

for (const [w, h] of [[1280, 800], [1400, 900]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.dispatchEvent(new Event("resize")); window.ecg3d.refresh(); });
  await fsCloseupCheck(w + "x" + h + " 1-lead, first beat", 1, 280);
  await fsCloseupCheck(w + "x" + h + " 1-lead, later beat with wander", 1, 280 + 800 * 5);
  await fsCloseupCheck(w + "x" + h + " 2-lead, first beat", 2, 280);
  await fsCloseupCheck(w + "x" + h + " 2-lead, later beat with wander", 2, 280 + 800 * 5);
}

await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(200);
await page.evaluate(() => { window.dispatchEvent(new Event("resize")); window.ecg3d.refresh(); });
await setFsLeads(["II"]);

const fsPick = await page.evaluate(() => {
  window.ecg3d.select("II");
  document.querySelector('.ecg12-hit[data-lead="V1"]').click();
  const one = window.ecg3d.selectedLeads().slice();
  document.querySelector('.ecg12-hit[data-lead="V2"]').click();
  const two = window.ecg3d.selectedLeads().slice();
  document.querySelector('.ecg12-hit[data-lead="V3"]').click();
  const three = window.ecg3d.selectedLeads().slice();
  return { one, two, three };
});
const pickOk = fsPick.one.includes("V1") && fsPick.two.length === 2 && fsPick.two.includes("V1") && fsPick.two.includes("V2")
  && fsPick.three.length === 2 && fsPick.three.includes("V2") && fsPick.three.includes("V3") && !fsPick.three.includes("V1");
if (pickOk) pass("Full screen: clicking a 12-lead cell respects pick-up-to-two", fsPick);
else fail("Full screen: clicking a 12-lead cell respects pick-up-to-two", fsPick);

const scrub = await page.evaluate(() => {
  window.ecg3d.setGuided(true);
  const widths = [];
  for (let i = 0; i < 7; i++) {
    window.ecg3d.step(i);
    const wrap = document.querySelector(".scrub-wrap");
    const bar = document.getElementById("scrub");
    const name = document.getElementById("fsStepName");
    const time = document.getElementById("timeOut");
    const wr = wrap.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const nr = name.getBoundingClientRect();
    const tr = time.getBoundingClientRect();
    widths.push({
      i, title: name.textContent, wrapW: wr.width, barW: br.width,
      nameW: nr.width, timeW: tr.width
    });
  }
  const wrapSpan = Math.max(...widths.map((w) => w.wrapW)) - Math.min(...widths.map((w) => w.wrapW));
  const barSpan = Math.max(...widths.map((w) => w.barW)) - Math.min(...widths.map((w) => w.barW));
  const nameSpan = Math.max(...widths.map((w) => w.nameW)) - Math.min(...widths.map((w) => w.nameW));
  const timeSpan = Math.max(...widths.map((w) => w.timeW)) - Math.min(...widths.map((w) => w.timeW));
  return { widths, wrapSpan, barSpan, nameSpan, timeSpan };
});
if (scrub.barSpan < 1 && scrub.wrapSpan < 1 && scrub.nameSpan < 1 && scrub.timeSpan < 1)
  pass("Full screen scrubber width is identical across all steps", { barSpan: scrub.barSpan, wrapSpan: scrub.wrapSpan, titles: scrub.widths.map((w) => w.title) });
else fail("Full screen scrubber width is identical across all steps", scrub);

await page.evaluate(async () => { await window.ecg3d.exitFullscreen(); });

if (errors.length === 0) pass("No console or page errors");
else fail("No console or page errors", errors);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? "FAILED " + failed.length + "/" + results.length : "ALL " + results.length + " PASSED");
process.exit(failed.length ? 1 : 0);
