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
  scn.act("clear");
  scn.act("shock");
  const noCharge = reasonOf("shock");
  const noChargeFb = (document.getElementById("scnFeedback") || {}).innerText || "";

  scn.start("s1");
  scn.act("assess");
  scn.act("cpr");
  const cprFirst = reasonOf("cpr");
  scn.act("shock");
  const mid = reasonOf("shock");
  const midFb = (document.getElementById("scnFeedback") || {}).innerText || "";
  const midState = {
    done: !!scn.sim.done,
    completed: !!scn.sim.completed,
    endReason: scn.sim.endReason,
    harmId: mid && mid.keys && mid.keys[0],
    v: mid.v,
    verdict: (last("shock") && last("shock").o && last("shock").o.verdictText) || "",
    fb: midFb
  };

  const midBoth = [false, true].map((hints) => {
    scn.setHints(!!hints);
    scn.start("s1");
    scn.act("assess");
    scn.act("cpr");
    scn.act("shock");
    const row = last("shock");
    const fb = (document.getElementById("scnFeedback") || {}).innerText || "";
    const debrief = (document.getElementById("scnDebrief") || {}).innerText || "";
    return {
      hints: !!hints,
      done: !!scn.sim.done,
      completed: !!scn.sim.completed,
      endReason: scn.sim.endReason,
      v: row && row.o && row.o.v,
      harmId: row && row.o && row.o.harm && row.o.harm.id,
      verdictText: row && row.o && row.o.verdictText,
      hasWhy: /do not defibrillate during chest compressions|all clear first/i.test(fb + debrief),
      hasPatientHarmed: /Patient harmed: scenario ended/i.test(fb + debrief)
    };
  });

  scn.setHints(false);
  scn.start("s2");
  scn.act("assess");
  scn.act("cpr");
  scn.act("shock");
  const pea = reasonOf("shock");
  const peaDone = !!scn.sim.done;

  const labels = Array.from(document.querySelectorAll("[data-a='charge'], [data-a='clear'], [data-a='shock']")).map((b) => ({
    id: b.getAttribute("data-a"),
    label: b.textContent.trim()
  }));

  return { skip, skipFb, firstOk, secondOk, noCharge, noChargeFb, cprFirst, mid, midFb, midState, midBoth, pea, peaDone, labels };
});

const skipOk = seq.skip.v === "part" && /charge|clear|all clear/i.test(seq.skipFb + (seq.skip.keys || []).join(" "));
if (skipOk) pass("shock without charge or clear is Partly right, with a short reason", { keys: seq.skip.keys, fb: seq.skipFb.slice(0, 240) });
else fail("shock without charge or clear is Partly right, with a short reason", seq.skip);

if (seq.firstOk === "ok" && seq.secondOk === "ok") pass("charge, clear, shock then resume CPR scores Correct", { firstOk: seq.firstOk, secondOk: seq.secondOk });
else fail("charge, clear, shock then resume CPR scores Correct", { firstOk: seq.firstOk, secondOk: seq.secondOk });

if (seq.cprFirst.v === "ok" || seq.cprFirst.v === "info") pass("starting CPR before the first shock is not penalised", seq.cprFirst);
else fail("starting CPR before the first shock is not penalised", seq.cprFirst);

const noChargeOk = seq.noCharge.v === "part" && (seq.noCharge.keys || []).indexOf("a_shockNoSeq") !== -1;
if (noChargeOk) pass("a shock after all clear but without charging is Partly right", { keys: seq.noCharge.keys, fb: (seq.noChargeFb || "").slice(0, 240) });
else fail("a shock after all clear but without charging is Partly right", seq.noCharge);

const midEnds = seq.midBoth && seq.midBoth.length === 2 && seq.midBoth.every((r) =>
  r.done && !r.completed && r.endReason === "harm" && r.v === "bad"
  && r.harmId === "harm_shockDuringCpr" && r.hasPatientHarmed && r.hasWhy
);
if (midEnds) pass("a shock during CPR ends the case as a harm, Show solution on or off", seq.midBoth);
else fail("a shock during CPR ends the case as a harm, Show solution on or off", { midState: seq.midState, midBoth: seq.midBoth, mid: seq.mid, fb: seq.midFb });

if (seq.pea.v === "bad" && !seq.peaDone) pass("unsynchronised shock in PEA remains Not quite and does not end the case", seq.pea);
else fail("unsynchronised shock in PEA remains Not quite and does not end the case", { pea: seq.pea, peaDone: seq.peaDone });

const hasCharge = seq.labels.some((b) => b.id === "charge" && /Charge defibrillator \(continue CPR if in progress\)/i.test(b.label));
const hasClear = seq.labels.some((b) => b.id === "clear" && /Stop compressions, all clear/i.test(b.label));
if (hasCharge && hasClear) pass("charge and clear actions are in the CPR and electrical group", seq.labels);
else fail("charge and clear actions are in the CPR and electrical group", seq.labels);

const pulseCharge = await page.evaluate(() => {
  const scn = window.__scn;
  const last = (act) => (scn.sim.log || []).filter((x) => x.o && x.act === act).pop();
  const reasonOf = (act) => {
    const row = last(act);
    const keys = (row && row.o && row.o.keys) || [];
    return {
      v: row && row.o && row.o.v,
      keys,
      label: row && row.o && row.o.label,
      event: row && row.o && row.o.event,
      text: row && (row.text || ""),
      pulseLine: row && row.o && row.o.pulseLine
    };
  };
  const fb = () => (document.getElementById("scnFeedback") || {}).innerText || "";

  scn.setHints(false);
  scn.start("s5");
  scn.act("assess");
  const s5assess = Object.assign(reasonOf("assess"), { fb: fb() });
  scn.act("charge");
  const s5charge = Object.assign(reasonOf("charge"), { fb: fb() });

  scn.start("s5");
  scn.act("assess");
  scn.act("sync");
  const s5syncNoCharge = reasonOf("sync");

  scn.start("s5");
  scn.act("assess");
  scn.act("expert");
  scn.act("charge");
  scn.act("clear");
  scn.act("sync");
  const s5syncOk = reasonOf("sync");

  scn.start("s5");
  scn.act("assess");
  scn.act("shock");
  const unsyncRow = last("shock");
  const s5unsync = {
    v: unsyncRow && unsyncRow.o && unsyncRow.o.v,
    done: !!scn.sim.done,
    completed: !!scn.sim.completed,
    endReason: scn.sim.endReason,
    harmId: unsyncRow && unsyncRow.o && unsyncRow.o.harm && unsyncRow.o.harm.id
  };

  scn.start("s4");
  scn.act("assess");
  const s4assess = Object.assign(reasonOf("assess"), { fb: fb() });
  scn.act("pads");
  scn.act("charge");
  const s4charge = Object.assign(reasonOf("charge"), { fb: fb() });

  scn.start("s3");
  scn.act("assess");
  const s3assess = Object.assign(reasonOf("assess"), { fb: fb() });

  scn.start("s2");
  scn.act("assess");
  const s2assess = Object.assign(reasonOf("assess"), { fb: fb() });

  const chargeLabel = Array.from(document.querySelectorAll("[data-a='charge']")).map((b) => b.textContent.trim())[0] || "";

  return { s5assess, s5charge, s5syncNoCharge, s5syncOk, s5unsync, s4assess, s4charge, s3assess, s2assess, chargeLabel };
});

function mentionsPulse(row, expect) {
  const blob = [row && row.label, row && row.event, row && row.fb, row && row.pulseLine, row && row.text].join(" ");
  return new RegExp(expect, "i").test(blob);
}

if (mentionsPulse(pulseCharge.s5assess, "Pulse present") && mentionsPulse(pulseCharge.s4assess, "Pulse present") && mentionsPulse(pulseCharge.s3assess, "Pulse present") && mentionsPulse(pulseCharge.s2assess, "No pulse")) {
  pass("Check rhythm and pulse states Pulse present or No pulse", {
    s5: pulseCharge.s5assess.label,
    s2: pulseCharge.s2assess.label,
    s3: pulseCharge.s3assess.label,
    s4: pulseCharge.s4assess.label
  });
} else {
  fail("Check rhythm and pulse states Pulse present or No pulse", { s5: pulseCharge.s5assess, s2: pulseCharge.s2assess, s3: pulseCharge.s3assess, s4: pulseCharge.s4assess });
}

const chargeOk = pulseCharge.s5charge.v === "ok" && (pulseCharge.s5charge.keys || []).indexOf("a_chargePulse") === -1 && !/not quite|not for unsynchronised/i.test(pulseCharge.s5charge.fb || "");
if (chargeOk) pass("charging before synchronised cardioversion in pulsed VT is Correct", { keys: pulseCharge.s5charge.keys, fb: (pulseCharge.s5charge.fb || "").slice(0, 240) });
else fail("charging before synchronised cardioversion in pulsed VT is Correct", pulseCharge.s5charge);

const noSeq = pulseCharge.s5syncNoCharge.v === "part" && (pulseCharge.s5syncNoCharge.keys || []).indexOf("a_shockNoSeq") !== -1;
if (noSeq) pass("a synchronised shock without charging is Partly right, same pattern as unsynchronised", pulseCharge.s5syncNoCharge);
else fail("a synchronised shock without charging is Partly right, same pattern as unsynchronised", pulseCharge.s5syncNoCharge);

if (pulseCharge.s5syncOk.v === "ok") pass("charge, all clear, then synchronised shock scores Correct", pulseCharge.s5syncOk);
else fail("charge, all clear, then synchronised shock scores Correct", pulseCharge.s5syncOk);

const unsyncEnds = pulseCharge.s5unsync.done && !pulseCharge.s5unsync.completed && pulseCharge.s5unsync.endReason === "harm" && pulseCharge.s5unsync.harmId === "harm_shockPulse";
if (unsyncEnds) pass("an unsynchronised shock with a pulse still ends the case", pulseCharge.s5unsync);
else fail("an unsynchronised shock with a pulse still ends the case", pulseCharge.s5unsync);

const s4not = pulseCharge.s4charge.v === "bad" && (pulseCharge.s4charge.keys || []).indexOf("a_chargePulse") !== -1 && !/not for unsynchronised/i.test(pulseCharge.s4charge.fb || "");
if (s4not) pass("charging is not Correct when a shock is not the next step", { keys: pulseCharge.s4charge.keys, fb: (pulseCharge.s4charge.fb || "").slice(0, 240) });
else fail("charging is not Correct when a shock is not the next step", pulseCharge.s4charge);

if (pulseCharge.chargeLabel === "Charge defibrillator (continue CPR if in progress)") pass("charge button says continue CPR if in progress", pulseCharge.chargeLabel);
else fail("charge button says continue CPR if in progress", pulseCharge.chargeLabel);

await page.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? "FAILED " + failed.length + "/" + results.length : "ALL " + results.length + " PASSED");
process.exit(failed.length ? 1 : 0);
