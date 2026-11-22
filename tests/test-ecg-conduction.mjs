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

if (SHOT) {
  await page.evaluate(() => window.ECGConduction.setTime(232));
  await page.mouse.move(5, 5);
  await page.screenshot({ path: SHOT });
}
check("no console errors", errors.length === 0, errors);
await browser.close();
process.exit(failed ? 1 : 0);
