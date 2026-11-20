import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8770";
const results = [];
function pass(name, extra) { results.push({ name, ok: true, extra }); console.log("PASS", name, extra || ""); }
function fail(name, extra) { results.push({ name, ok: false, extra }); console.log("FAIL", name, extra || ""); }

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu"]
});

const viewports = [
  { width: 1280, height: 800, name: "1280x800" },
  { width: 1024, height: 553, name: "1024x553" },
  { width: 390, height: 844, name: "390x844" }
];

async function measurePanel(page) {
  return page.evaluate(() => {
    const pop = document.getElementById("scnDrugPopup");
    const panel = document.getElementById("scnDrugList");
    const title = document.getElementById("scnDrugTitle");
    const close = document.getElementById("scnDrugClose");
    const body = panel && panel.querySelector(".scn-drug-body");
    const groups = Array.from(document.querySelectorAll(".scn-drug-group-title")).map((h) => h.textContent.replace(/\s+/g, " ").trim());
    const vw = window.innerWidth, vh = window.innerHeight;
    const inView = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= -1 && r.left >= -1 && r.bottom <= vh + 1 && r.right <= vw + 1;
    };
    const r = panel.getBoundingClientRect();
    const fits = r.top >= -1 && r.left >= -1 && r.bottom <= vh + 1 && r.right <= vw + 1;
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const centred = Math.abs(cx - vw / 2) <= 24 && Math.abs(cy - vh / 2) <= 24;
    const titleVis = inView(title);
    const closeVis = inView(close);
    let titleAfter = titleVis, closeAfter = closeVis, canScroll = false;
    if (body) {
      canScroll = body.scrollHeight > body.clientHeight + 1;
      if (canScroll) {
        body.scrollTop = body.scrollHeight;
      }
      titleAfter = inView(title);
      closeAfter = inView(close);
      body.scrollTop = 0;
    }
    return {
      open: pop && !pop.hidden,
      fits,
      centred,
      titleVis,
      closeVis,
      titleAfter,
      closeAfter,
      canScroll,
      groups,
      box: { top: r.top, left: r.left, bottom: r.bottom, right: r.right, w: r.width, h: r.height },
      vw,
      vh
    };
  });
}

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__scn && window.__scn.all, null, { timeout: 10000 });
  await page.evaluate(() => {
    const scn = window.__scn;
    scn.setHints(false);
    scn.start("s1");
    document.querySelector("[data-a='drugs']").click();
  });
  await page.waitForSelector("#scnDrugPopup:not([hidden])", { timeout: 5000 });
  const m = await measurePanel(page);
  const groupsOk = ["Arrest drugs", "Antiarrhythmics", "Bradycardia drugs", "Electrolytes"].every((g) => m.groups.some((x) => x.indexOf(g) !== -1));
  const ok = m.open && m.fits && m.centred && m.titleVis && m.closeVis && m.titleAfter && m.closeAfter && groupsOk;
  const name = "Drugs panel is a centred dialog that fits " + vp.name;
  if (ok) pass(name, { canScroll: m.canScroll, box: m.box });
  else fail(name, m);
  await page.close();
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__scn && window.__scn.all, null, { timeout: 10000 });

const seq = await page.evaluate(() => {
  const scn = window.__scn;
  const last = (act) => (scn.sim.log || []).filter((x) => x.o && x.act === act).pop();
  const why = (row) => (row && row.o && (row.o.logWhy || row.o.whyWrong || "")) || "";
  const vOf = (act) => {
    const row = last(act);
    return row && row.o && row.o.v;
  };
  const reasonOf = (act) => {
    const row = last(act);
    const keys = (row && row.o && row.o.keys) || [];
    return { v: row && row.o && row.o.v, keys, log: row && (row.o.logVerdict || row.text || "") };
  };

  scn.setHints(false);
  scn.start("s1");
  scn.act("assess");
  scn.act("shock");
  const skip = reasonOf("shock");
  const skipFb = (document.getElementById("scnFeedback") || {}).innerText || "";

  scn.start("s1");
  scn.act("assess");
  scn.act("charge");
  scn.act("clear");
  scn.act("shock");
  const firstOk = vOf("shock");
  scn.act("cpr");
  scn.act("charge");
  scn.act("ff");
  scn.act("clear");
  scn.act("shock");
  const secondOk = vOf("shock");

  scn.start("s1");
  scn.act("assess");
  scn.act("cpr");
  const cprFirst = reasonOf("cpr");
  scn.act("shock");
  const mid = reasonOf("shock");
  const midFb = (document.getElementById("scnFeedback") || {}).innerText || "";

  scn.start("s2");
  scn.act("assess");
  scn.act("cpr");
  scn.act("shock");
  const pea = reasonOf("shock");

  const labels = Array.from(document.querySelectorAll("[data-a='charge'], [data-a='clear'], [data-a='shock']")).map((b) => ({
    id: b.getAttribute("data-a"),
    label: b.textContent.trim()
  }));

  return { skip, skipFb, firstOk, secondOk, cprFirst, mid, midFb, pea, labels };
});

const skipOk = seq.skip.v === "part" && /charge|clear|all clear/i.test(seq.skipFb + (seq.skip.keys || []).join(" "));
if (skipOk) pass("shock without charge or clear is Partly right, with a short reason", { keys: seq.skip.keys, fb: seq.skipFb.slice(0, 240) });
else fail("shock without charge or clear is Partly right, with a short reason", seq.skip);

if (seq.firstOk === "ok" && seq.secondOk === "ok") pass("charge, clear, shock then resume CPR scores Correct", { firstOk: seq.firstOk, secondOk: seq.secondOk });
else fail("charge, clear, shock then resume CPR scores Correct", { firstOk: seq.firstOk, secondOk: seq.secondOk });

if (seq.cprFirst.v === "ok" || seq.cprFirst.v === "info") pass("starting CPR before the first shock is not penalised", seq.cprFirst);
else fail("starting CPR before the first shock is not penalised", seq.cprFirst);

const midOk = seq.mid.v === "part" && (seq.mid.keys || []).indexOf("a_shockNoSeq") !== -1;
if (midOk) pass("a shock during CPR without the sequence is Partly right", { keys: seq.mid.keys, fb: seq.midFb.slice(0, 240) });
else fail("a shock during CPR without the sequence is Partly right", seq.mid);

if (seq.pea.v === "bad") pass("unsynchronised shock in PEA remains Not quite", seq.pea);
else fail("unsynchronised shock in PEA remains Not quite", seq.pea);

const hasCharge = seq.labels.some((b) => b.id === "charge" && /Charge defibrillator/i.test(b.label));
const hasClear = seq.labels.some((b) => b.id === "clear" && /Stop compressions, all clear/i.test(b.label));
if (hasCharge && hasClear) pass("charge and clear actions are in the CPR and electrical group", seq.labels);
else fail("charge and clear actions are in the CPR and electrical group", seq.labels);

await page.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? "FAILED " + failed.length + "/" + results.length : "ALL " + results.length + " PASSED");
process.exit(failed.length ? 1 : 0);
