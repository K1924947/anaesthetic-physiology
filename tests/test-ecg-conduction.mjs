import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;
const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8781";
const SHOT = process.env.SHOT || "";
let failed = 0;
const check = (name, ok, extra) => { console.log(ok ? "PASS" : "FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); if (!ok) failed++; };

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(BASE + "/ECG_Conduction.html", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.ECGConduction);

check("noindex", await page.$eval('meta[name="robots"]', (m) => /noindex/.test(m.content)));
const fit = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth }));
check("fits 1280x800 without scrolling", fit.sh <= fit.ih && fit.sw <= 1280, fit);

const q0 = await page.$eval("#ecgcQrs", (e) => +e.dataset.qrs);
await page.click('[data-cond="lbbb"]');
const q1 = await page.$eval("#ecgcQrs", (e) => +e.dataset.qrs);
check("condition switch widens QRS", q0 < 120 && q1 >= 120, { normal: q0, lbbb: q1 });

const before = await page.$eval("#ecgcWheelMark-B", (g) => ({ lead: g.dataset.lead, t: g.getAttribute("transform"), wheel: g.ownerSVGElement.id }));
await page.selectOption('select[data-slot="1"]', "aVL");
const after = await page.$eval("#ecgcWheelMark-B", (g) => ({ lead: g.dataset.lead, t: g.getAttribute("transform"), wheel: g.ownerSVGElement.id }));
check("dropdown changes lead and electrode marker", before.lead === "V1" && after.lead === "aVL" && before.t !== after.t, { before, after });
await page.selectOption('select[data-slot="1"]', "V1");

const box = await page.$eval("#ecgcScrub", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await page.mouse.click(box.x + box.w * 0.29, box.y + box.h / 2);
const ms = await page.$eval("#ecgcMs", (e) => +e.textContent);
const playing = await page.evaluate(() => window.ECGConduction.state.playing);
check("scrubbing sets the readout and pauses", Math.abs(ms - 232) < 12 && !playing, { ms, playing });

await page.keyboard.press("ArrowRight");
const ms2 = await page.$eval("#ecgcMs", (e) => +e.textContent);
check("scrubber is keyboard operable", ms2 === ms + 1, { ms, ms2 });

// Round 5: step-through story, bump labels on the focus lead, tap a bump to jump the clock.
const steps = await page.evaluate(() => { const E = window.ECGConduction; const o = {};
  for (const c of ["normal", "rbbb", "lbbb"]) { const st = E.steps(c, "aVL"); o[c] = { n: st.length, ids: st.map((s) => s.id), allText: st.every((s) => s.text && s.text.length > 20 && s.t >= 0) }; }
  return o; });
check("step-through steps exist for all 3 conditions",
  ["normal", "rbbb", "lbbb"].every((c) => steps[c].n >= 8 && steps[c].allText && steps[c].ids.includes("bump1") && steps[c].ids.includes("t")) &&
  steps.normal.ids.includes("septum") && steps.rbbb.ids.includes("slow-rv") && steps.lbbb.ids.includes("slow-lv"), steps);

await page.click("#ecgcStep");
await page.click("#ecgcNext");
const stepUi = await page.evaluate(() => ({ idx: window.ECGConduction.state.stepIdx, sent: document.getElementById("ecgcSentence").textContent, back: !document.getElementById("ecgcBack").hidden }));
check("Step through and Next advance the story", stepUi.idx === 1 && /^Step 2 of \d+: /.test(stepUi.sent) && stepUi.back, stepUi);
await page.click("#ecgcStep");

const lab = await page.evaluate(() => { const E = window.ECGConduction; E.setCondition("lbbb"); E.setLead(0, "aVL"); E.setFocus(0);
  const bs = E.bumps("lbbb", "aVL"), seen = [];
  for (const b of bs) { E.setTime(b.peak); seen.push(document.querySelector(".ecgc-lead.is-focus .ecgc-lead-note").textContent); }
  return { names: bs.map((b) => b.name), labels: bs.map((b) => b.label), seen, focusLead: document.querySelector(".ecgc-lead.is-focus select").value }; });
check("bump labels exist for the focus lead", lab.focusLead === "aVL" && lab.names.length >= 2 && lab.labels.every((l) => / (fast route|slow cell to cell)/.test(l)) &&
  lab.seen.every((t, i) => t.startsWith(lab.names[i] + ":")), lab);

const tap = await page.evaluate(() => { const E = window.ECGConduction; const b = E.bumps("lbbb", "aVL").find((x) => x.name === "2nd R") || E.bumps("lbbb", "aVL")[0];
  E.setTime(40); const cv = document.querySelector(".ecgc-lead.is-focus canvas"), r = cv.getBoundingClientRect(), left = 34, pw = r.width - left - 4;
  return { peak: b.peak, x: r.left + left + (b.peak + 4) / 800 * pw, y: r.top + r.height / 2 }; });
await page.mouse.click(tap.x, tap.y);
const tapped = await page.evaluate(() => ({ t: window.ECGConduction.state.t, playing: window.ECGConduction.state.playing, link: document.querySelector("#ecgcLink line").getAttribute("opacity") }));
check("tapping a bump sets the clock to it and shows the link", tapped.t === tap.peak && !tapped.playing && tapped.link === "1", { tap, tapped });

if (SHOT) {
  await page.evaluate(() => window.ECGConduction.setTime(232));
  await page.mouse.move(5, 5);
  await page.screenshot({ path: SHOT });
}
check("no console errors", errors.length === 0, errors);
await browser.close();
process.exit(failed ? 1 : 0);
