// ECG in 3D: anatomical conduction system and wavefront timing.
// Run from the worktree root against a local server of this worktree:
//   PHYSIO_BASE=http://127.0.0.1:<port> node tests/test-ecg3d-conduction-3d.mjs
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const { chromium } = pkg;
const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8775";
const HERE = dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, extra) { results.push({ name, ok }); console.log(ok ? "PASS" : "FAIL", name, extra !== undefined ? JSON.stringify(extra) : ""); }

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(BASE + "/ECG_3D.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.ecg3d && window.ecg3d.conduction, null, { timeout: 60000 });
const C = await page.evaluate(() => window.ecg3d.conduction());
const seg = C.seg;

// 1. Structures: every part of the real conduction system is in the model
const ids = new Set(C.segments.map(s => s.id));
for (const id of ["his", "rbb", "lbb", "laf", "lpf", "mod"]) check(`segment ${id} present`, ids.has(id));
check("Purkinje fibres present (several)", C.segments.filter(s => s.fibre).length >= 6, C.segments.filter(s => s.fibre).length);
check("Bachmann's bundle present", !!seg.bach);
check("three internodal routes (anterior, middle, posterior)", JSON.stringify(C.internodal) === JSON.stringify(["inA", "inM", "inP"]), C.internodal);
check("His bundle leaves the AV node; bundles leave the His; fascicles leave the left bundle",
  C.segments.find(s => s.id === "his").parent === "avn" && C.segments.find(s => s.id === "rbb").parent === "his" && C.segments.find(s => s.id === "lbb").parent === "his"
  && C.segments.find(s => s.id === "laf").parent === "lbb" && C.segments.find(s => s.id === "lpf").parent === "lbb");

// 2. Timing order: SA < AV < His < bundles < Purkinje < ventricular myocardium
const purk = C.segments.filter(s => s.fibre).map(s => seg[s.id]);
const purkStart = Math.min(...purk.map(s => s.start)), purkEnd = Math.max(...purk.map(s => s.end));
const bundleStart = Math.min(seg.rbb.start, seg.lbb.start);
check("SA node fires before the impulse reaches the AV node", C.saTime < C.tAV, { sa: C.saTime, av: C.tAV });
check("AV node delay before the His bundle", C.tAV < C.tHis && C.tHis - C.tAV >= 60, { av: C.tAV, his: C.tHis });
check("His bundle starts when the AV delay ends", Math.abs(seg.his.start - C.tHis) < 0.5);
check("bundle branches start at the end of the His bundle", Math.abs(bundleStart - seg.his.end) < 0.5 && seg.his.end > seg.his.start, { his: seg.his, bundleStart });
check("fascicles after the left bundle starts", seg.laf.start >= seg.lbb.start && seg.lpf.start >= seg.lbb.start);
check("Purkinje fibres after the bundle branches", purkStart > bundleStart, { purkStart, bundleStart });
check("ventricular muscle mostly after the Purkinje fibres start (median activation)", C.ventMedian > purkStart, { median: C.ventMedian, purkStart });
check("last ventricular muscle after the last Purkinje fibre", C.vMax > purkEnd, { vMax: C.vMax, purkEnd });
check("ventricular muscle never before the His bundle fires", C.vMin > C.tHis, { vMin: C.vMin, his: C.tHis });
check("endocardium on average before epicardium (inside outwards)", C.endoMean < C.epiMean, { endo: C.endoMean, epi: C.epiMean });
check("atria finish before the ventricles start (fibrous ring insulates)", C.atrialEnd < C.vMin, { atrialEnd: C.atrialEnd, vMin: C.vMin });

// 3. Fast versus slow: bundles and Purkinje conduct many times faster than the internodal (muscle-timed) routes
const v = s => s.len / (s.end - s.start);
const internodalV = C.internodal.map(id => { const t = C.tubes[id]; return { t0: t.t0, t1: t.t1 }; });
check("internodal routes start at the SA node and end when the AV node is reached", internodalV.every(t => Math.abs(t.t0 - C.saTime) < 1 && Math.abs(t.t1 - C.tAV) < 1), internodalV);
check("bundle branches faster than the Bachmann band", v(seg.rbb) > v(seg.bach) && v(seg.lbb) > v(seg.bach));
check("Purkinje fibres at least as fast as the bundle branches", purk.every(s => v(s) >= v(seg.rbb) - 1e-9));

// 4. The drawn tubes light up exactly over the model's own segment times (picture, vector and traces share one clock)
let worst = 0;
for (const [id, t] of Object.entries(C.tubes)) { if (t.internodal) continue; const s = seg[id]; worst = Math.max(worst, Math.abs(t.t0 - s.start), Math.abs(t.t1 - s.end)); }
check("every drawn bundle and fibre spans its model start and end time (within 0.5 ms)", worst < 0.5, { worstMs: worst });
const mid = (seg.rbb.start + seg.rbb.end) / 2;
const b1 = await page.evaluate(t => window.ecg3d.beadAt("rbb", t), mid);
const b2 = await page.evaluate(t => window.ecg3d.beadAt("rbb", t), seg.rbb.end - 0.01);
const dEnd = Math.hypot(...b2.pos.map((x, i) => x - b2.end[i]));
check("impulse bead visible mid right bundle", b1.visible);
check("impulse bead reaches the end of the right bundle at the segment's end time", b2.visible && dEnd < 0.03, { dEnd });

// 5. The ECG is unchanged by the redesign (the routes added are timed with the muscle and add no speed)
const base = JSON.parse(readFileSync(join(HERE, "fixtures/ecg3d-baseline-traces.json"), "utf8"));
let maxDiff = 0;
for (const [id, arr] of Object.entries(base.traces)) {
  const now = await page.evaluate(id => window.ecg3d.trace(id), id);
  arr.forEach((x, k) => { maxDiff = Math.max(maxDiff, Math.abs(now[k * base.stepMs] - x)); });
}
check("all 12 traces match the pre-redesign baseline (max diff under 0.002 mV)", maxDiff < 0.002, { maxDiff });

// 6. Labels and colour key
await page.evaluate(() => { window.ecg3d.setLabels("all"); window.ecg3d.setT(120); });
await page.waitForTimeout(300);
const texts = await page.evaluate(() => window.ecg3d.labelSnapshot().map(l => l.text));
for (const want of ["SA node", "Internodal routes", "Bachmann's bundle", "Coronary sinus (opening)", "Fibrous AV ring", "Bundle of His", "Right bundle branch", "Left bundle branch", "Left anterior fascicle", "Left posterior fascicle", "Purkinje fibres"])
  check(`label "${want}" shown with all labels on`, texts.some(t => t.startsWith(want)));
const avLabel = texts.find(t => t.startsWith("AV node"));
check("AV node label shown with all labels on", !!avLabel, avLabel);
const keyText = await page.evaluate(() => document.getElementById("keyDetailsList").textContent);
check("colour key names fast and slow routes", /Fast route/.test(keyText) && /Slow route/.test(keyText));
check("colour key no longer mentions magenta muscle", !/magenta/i.test(keyText));
const theme = await page.evaluate(() => window.ecg3d.themeColors());
const hue = hex => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return null; let h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn); h *= 60; return (h + 360) % 360; };
check("front is the orange family", hue(theme.front) > 15 && hue(theme.front) < 45, theme.front);
check("still depolarised is the blue family", hue(theme.dot) > 190 && hue(theme.dot) < 230, theme.dot);
check("ECG paper unchanged: 25 mm/s, 10 mm/mV note", /25 mm\/s/.test(await page.textContent("#leadCloseupGain")) && /10 mm\/mV/.test(await page.textContent("#leadCloseupGain")));
const robots = await page.getAttribute('meta[name="robots"]', "content");
check("page stays noindex", /noindex/.test(robots || ""), robots);
check("no page errors", errors.length === 0, errors);

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(failed.length ? `${failed.length} FAILED of ${results.length}` : `ALL ${results.length} PASSED`);
process.exit(failed.length ? 1 : 0);
