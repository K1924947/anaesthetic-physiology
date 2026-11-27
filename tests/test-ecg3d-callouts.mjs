// Close-up callouts and the interval bar must not appear ahead of the sweep
// cursor, over blank paper. Run from the worktree root against port 8793
// (or PHYSIO_BASE):
//   PHYSIO_BASE=http://127.0.0.1:8793 node tests/test-ecg3d-callouts.mjs
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8793";
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
await page.waitForFunction(() => window.ecg3d && window.ecg3d.closeupAnnots && window.ecg3d.intervals, null, { timeout: 60000 });
await page.waitForTimeout(200);

function intervalFlags(text) {
  const tokens = text ? text.split(/\s{2,}/).map(s => s.trim()) : [];
  return {
    P: tokens.some(s => /^P \d+ ms$/.test(s)),
    PR: tokens.some(s => /^PR \d+ ms$/.test(s)),
    QRS: tokens.some(s => /^QRS \d+ ms$/.test(s)),
    QT: tokens.some(s => /^QT \d+ ms$/.test(s))
  };
}

function ahead(ann, pad = 0.75) {
  const problems = [];
  if (!ann) return ["missing annots"];
  const cx = ann.cursorX;
  for (const L of ann.labels || []) {
    if (L.featX > cx + pad) problems.push(`${L.txt} dot at ${L.featX.toFixed(1)} > cursor ${cx.toFixed(1)}`);
    if (L.x0 > cx + pad) problems.push(`${L.txt} box starts at ${L.x0.toFixed(1)} > cursor ${cx.toFixed(1)}`);
  }
  if (ann.bar) {
    if (ann.bar.x1 > cx + pad) problems.push(`bar ends at ${ann.bar.x1.toFixed(1)} > cursor ${cx.toFixed(1)}`);
    for (const x of ann.bar.marks || []) {
      if (x > cx + pad) problems.push(`bar tick at ${x.toFixed(1)} > cursor ${cx.toFixed(1)}`);
    }
    if (ann.bar.textX0 != null && ann.bar.textX0 > cx + pad) {
      problems.push(`interval text starts at ${ann.bar.textX0.toFixed(1)} > cursor ${cx.toFixed(1)}`);
    }
  }
  return problems;
}

function checkCase(c, ann, I) {
  const problems = ahead(ann);
  const names = (ann && ann.labels || []).map(L => L.txt);
  const text = (ann && ann.bar && ann.bar.text) || "";
  const flags = intervalFlags(text);
  if (c.allow) {
    const unexpected = names.filter(n => !c.allow.includes(n));
    if (unexpected.length) problems.push(`unexpected labels ${unexpected.join(", ")} (allowed ${c.allow.join(", ")})`);
    for (const need of c.require || []) {
      if (!names.includes(need)) problems.push(`missing label ${need}; had ${names.join(", ") || "(none)"}`);
    }
  }
  if (c.textHas) {
    for (const bit of c.textHas) if (!flags[bit]) problems.push(`expected interval ${bit} in ${JSON.stringify(text)}`);
  }
  if (c.textNot) {
    for (const bit of c.textNot) if (flags[bit]) problems.push(`did not expect interval ${bit} in ${JSON.stringify(text)}`);
  }
  return { problems, names, text, cursorX: ann && ann.cursorX, barX1: ann && ann.bar && ann.bar.x1 };
}

const setup = await page.evaluate(() => {
  window.ecg3d.play(false);
  window.ecg3d.select("II");
  return { I: window.ecg3d.intervals(), b0: window.ecg3d.beatStart(0) };
});
if (!setup.I || setup.I.P <= 0) fail("intervals available after load", setup);
else pass("intervals available after load", setup);

const I = setup.I;
const b0 = setup.b0;
const cases = [
  // Mid-beat labels may not all fit beside a still-early cursor; what must never
  // happen is a future-segment callout or an interval bar past the cursor.
  { name: "before P", t: b0 + Math.max(0, I.pOn - 20), allow: [], require: [], textHas: [], textNot: ["P", "PR", "QRS", "QT"] },
  { name: "during P, before P ends", t: b0 + I.pOn + Math.max(4, Math.floor((I.pOff - I.pOn) * 0.4)), allow: ["P wave"], require: [], textHas: [], textNot: ["P", "PR", "QRS", "QT"] },
  { name: "PR segment, after P, before QRS", t: b0 + I.pOff + Math.max(4, Math.floor((I.qOn - I.pOff) * 0.5)), allow: ["P wave"], require: [], textHas: ["P"], textNot: ["PR", "QRS", "QT"] },
  { name: "during QRS, before QRS ends", t: b0 + I.qOn + Math.max(4, Math.floor((I.qOff - I.qOn) * 0.5)), allow: ["P wave", "QRS"], require: [], textHas: ["P", "PR"], textNot: ["QRS", "QT"] },
  { name: "during ST", t: b0 + I.qOff + 20, allow: ["P wave", "QRS", "ST"], require: [], textHas: ["P", "PR", "QRS"], textNot: ["QT"] },
  { name: "after T ends", t: b0 + I.tEnd + 20, allow: ["P wave", "QRS", "ST", "T wave"], require: ["P wave", "QRS", "ST"], textHas: ["P", "PR", "QRS", "QT"], textNot: [] },
  { name: "cursor at 75% of the four-beat strip", t: 0.75 * 3200, allow: null, require: null, textHas: null, textNot: null }
];

async function setLeads(ids) {
  await page.evaluate((ids) => {
    if (typeof window.ecg3d.exitFullscreen === "function" && window.ecg3d.isFullscreen && window.ecg3d.isFullscreen()) {
      // stay in fullscreen; just reshape the selection
    }
    const have = window.ecg3d.selectedLeads();
    // Clear down to one, then add.
    for (const id of have.slice().reverse()) {
      if (have.length && ids.indexOf(id) < 0) window.ecg3d.select(id);
    }
    for (const id of ids) {
      const now = window.ecg3d.selectedLeads();
      if (!now.includes(id)) window.ecg3d.select(id);
    }
    // If we still have an extra, toggle it off.
    let now = window.ecg3d.selectedLeads();
    for (const id of now) {
      if (ids.indexOf(id) < 0 && now.length > ids.length) {
        window.ecg3d.select(id);
        now = window.ecg3d.selectedLeads();
      }
    }
    return window.ecg3d.selectedLeads();
  }, ids);
}

await page.evaluate(async () => { await window.ecg3d.enterFullscreen(); });
await page.waitForTimeout(150);

for (const leadSet of [["II"], ["II", "V4"], ["V4"]]) {
  const sels = await setLeads(leadSet);
  const setLabel = leadSet.join("+");
  for (const c of cases) {
    const shot = await page.evaluate((t) => {
      window.ecg3d.setPageTime(t);
      window.ecg3d.refresh();
      const n = window.ecg3d.selectedLeads().length;
      const out = { sels: window.ecg3d.selectedLeads(), now: window.ecg3d.now(), a0: window.ecg3d.closeupAnnots(0) };
      if (n > 1) out.a1 = window.ecg3d.closeupAnnots(1);
      return out;
    }, c.t);
    const annots = [shot.a0];
    if (shot.a1) annots.push(shot.a1);
    for (let i = 0; i < annots.length; i++) {
      const ann = annots[i];
      const checked = checkCase(c, ann, I);
      const label = `${setLabel} close-up ${i} (${ann && ann.lead}): ${c.name}`;
      if (checked.problems.length) fail(label, { t: c.t, sels: shot.sels, ...checked });
      else pass(label, { t: c.t, names: checked.names, text: checked.text, cursorX: checked.cursorX, barX1: checked.barX1 });
    }
  }
}

if (errors.length) fail("page errors", errors);
else pass("no page errors");

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED` : `\nAll ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
