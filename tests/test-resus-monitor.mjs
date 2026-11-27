// Resus Scenarios: clinical defibrillator / patient monitor and attachment.
// Run from the worktree root: PHYSIO_BASE=http://127.0.0.1:<port> node tests/test-resus-monitor.mjs
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8793";
const results = [];
function pass(name, extra) { results.push({ name, ok: true }); console.log("PASS", name, extra ? JSON.stringify(extra).slice(0, 280) : ""); }
function fail(name, extra) { results.push({ name, ok: false }); console.log("FAIL", name, JSON.stringify(extra, null, 1)); }
function check(name, ok, extra) { if (ok) pass(name, extra); else fail(name, extra); }
function rgbToHex(c) {
  const m = String(c || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return String(c || "").toLowerCase();
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__scn && window.__scn.all, null, { timeout: 10000 });

const start = await page.evaluate(() => {
  const s = window.__scn;
  s.setHints(false);
  s.start("s1");
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const val = (el.querySelector(".stat-val") || {}).textContent || "";
    const note = (el.querySelector(".defib-num-note, .stat-note") || {}).textContent || "";
    const lab = (el.querySelector(".defib-num-lab") || {}).textContent || "";
    const color = getComputedStyle(el).color;
    return { val, note, lab, color };
  };
  const ecgDrawn = Array.from(document.querySelectorAll("#scnMonitor .ecg-trace")).some((el) => el.getAttribute("d"));
  return {
    errors: 0,
    attached: { ...s.sim.attached },
    dark: getComputedStyle(document.getElementById("scnDefib")).backgroundColor,
    head: getComputedStyle(document.querySelector(".mon-head")).fill,
    ecgDrawn,
    tag: (document.querySelector("#scnMonitor .mon-tag") || {}).textContent || "",
    hr: box(".defib-num-ecg"),
    spo2: box(".defib-num-spo2"),
    nibp: box(".defib-num-nibp"),
    rr: box(".defib-num-rr"),
    etco2: box(".stat-etco2"),
    labels: Array.from(document.querySelectorAll(".defib-num-lab")).map((e) => e.textContent)
  };
});
check("page loads without console errors", errors.length === 0, errors);
check("s1 starts with pads on and a visible ECG on a dark monitor", start.attached.pads && start.ecgDrawn && rgbToHex(start.dark) === "#111111" && rgbToHex(start.head) === "#ededed", start);
check("s1: SpO2, NIBP and ETCO2 stay off until attached, with --- and a text label",
  start.spo2 && start.spo2.val === "---" && /Probe off/i.test(start.spo2.note)
  && start.nibp && start.nibp.val === "---" && /Cuff off/i.test(start.nibp.note)
  && start.etco2 && start.etco2.val === "---" && /No capnography/i.test(start.etco2.note), start);
check("every parameter box is labelled with text", ["HR", "NIBP", "SpO2", "RR", "ETCO2"].every((l) => start.labels.includes(l)), start.labels);
check("parameter colours are one per family (ECG light grey, NIBP magenta, SpO2 blue, RR grey, ETCO2 orange)",
  start.hr && rgbToHex(start.hr.color) === "#ededed"
  && start.nibp && rgbToHex(start.nibp.color) === "#c44aa8"
  && start.spo2 && rgbToHex(start.spo2.color) === "#4c8ddb"
  && start.rr && rgbToHex(start.rr.color) === "#c8c8c8"
  && start.etco2 && rgbToHex(start.etco2.color) === "#e07a00",
  { hr: start.hr, nibp: start.nibp, spo2: start.spo2, rr: start.rr, etco2: start.etco2 });

const attach = await page.evaluate(() => {
  const s = window.__scn;
  const last = () => { const l = s.sim.log.filter((x) => x.o).slice(-1)[0]; return l ? { v: l.o.v, keys: l.o.keys } : null; };
  const box = (sel) => {
    const el = document.querySelector(sel);
    return el ? { val: (el.querySelector(".stat-val") || {}).textContent || "", note: (el.querySelector(".defib-num-note, .stat-note") || {}).textContent || "" } : null;
  };
  s.start("s1"); s.act("assess"); s.act("cpr");
  s.act("spo2Probe");
  const spo2 = { last: last(), box: box(".defib-num-spo2"), pleth: (document.querySelector("#scnPleth .defib-lane-tag") || {}).textContent || "" };
  s.act("nibpCuff");
  s.act("nibp");
  const nibp = { last: last(), box: box(".defib-num-nibp") };
  return { spo2, nibp, attached: { ...s.sim.attached } };
});
check("applying the SpO2 probe in arrest is scored as correct and the reading is a poor trace",
  attach.spo2.last && attach.spo2.last.v === "ok" && attach.spo2.last.keys.includes("a_spo2Probe")
  && attach.spo2.box.val === "---" && /Poor trace|no pulsatile/i.test(attach.spo2.box.note), attach.spo2);
check("cycling NIBP in arrest after applying the cuff is unrecordable",
  attach.attached.nibp && /Unrecordable|Cycling|Cuff on/i.test(attach.nibp.box.val + " " + attach.nibp.box.note), attach.nibp);

const noPads = await page.evaluate(() => {
  const s = window.__scn;
  const last = () => { const l = s.sim.log.filter((x) => x.o).slice(-1)[0]; return l ? { v: l.o.v, keys: l.o.keys } : null; };
  const tag = () => (document.querySelector("#scnMonitor .mon-tag") || {}).textContent || "";
  const drawn = () => Array.from(document.querySelectorAll("#scnMonitor .ecg-trace")).some((el) => el.getAttribute("d"));
  s.start("s4");
  const before = { attached: { ...s.sim.attached }, tag: tag(), drawn: drawn(), hr: (document.querySelector(".defib-num-ecg .stat-val") || {}).textContent };
  s.act("charge");
  const charge = last();
  s.act("shock");
  const shock = last();
  s.act("pads");
  const pads = last();
  const after = { attached: { ...s.sim.attached }, tag: tag(), drawn: drawn() };
  return { before, charge, shock, pads, after };
});
check("a monitored patient without pads still shows the ECG from the 3-lead",
  noPads.before.attached.leads && !noPads.before.attached.pads && noPads.before.drawn && noPads.before.hr !== "---", noPads.before);
check("charge or shock without pads is blocked and prompts the learner to apply pads",
  noPads.charge.keys.includes("a_noPads") && noPads.shock.keys.includes("a_noPads") && noPads.charge.v === "part", noPads);
check("applying pads then enables the defibrillator and keeps the ECG on the monitor",
  noPads.pads.v === "ok" && noPads.after.attached.pads && noPads.after.drawn, noPads.after);

const bare = await page.evaluate(() => {
  const s = window.__scn;
  s.start("s6");
  const before = { attached: { ...s.sim.attached }, tag: (document.querySelector("#scnMonitor .mon-tag") || {}).textContent || "", drawn: Array.from(document.querySelectorAll("#scnMonitor .ecg-trace")).some((el) => el.getAttribute("d")), hr: (document.querySelector(".defib-num-ecg .stat-val") || {}).textContent, spo2: (document.querySelector(".defib-num-spo2 .defib-num-note") || {}).textContent };
  s.act("leads");
  const afterLeads = { attached: { ...s.sim.attached }, drawn: Array.from(document.querySelectorAll("#scnMonitor .ecg-trace")).some((el) => el.getAttribute("d")), hr: (document.querySelector(".defib-num-ecg .stat-val") || {}).textContent, tag: (document.querySelector("#scnMonitor .mon-tag") || {}).textContent || "" };
  s.act("charge");
  const charge = (() => { const l = s.sim.log.filter((x) => x.o).slice(-1)[0]; return { v: l.o.v, keys: l.o.keys }; })();
  return { before, afterLeads, charge };
});
check("a case with no monitoring starts with --- and No pads, and no ECG trace",
  !bare.before.attached.pads && !bare.before.attached.leads && bare.before.hr === "---" && /No pads/i.test(bare.before.tag) && !bare.before.drawn, bare.before);
check("applying a 3-lead shows the ECG but is not enough to charge or shock",
  bare.afterLeads.attached.leads && !bare.afterLeads.attached.pads && bare.afterLeads.drawn && bare.charge.keys.includes("a_noPads"), bare);

const review = await page.evaluate(() => {
  const bar = (document.querySelector(".defib-mon-review") || {}).textContent || "";
  const et = (document.querySelector(".stat-etco2") || {}).textContent || "";
  return { bar, et };
});
check("monitor numbers are flagged as illustrative and for senior colleague review",
  /senior colleague review/i.test(review.bar) && /senior colleague review/i.test(review.et), review);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`);
process.exit(failed.length ? 1 : 0);
