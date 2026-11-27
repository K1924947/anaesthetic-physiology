// Phone app layout (phase 1): bottom tab bar, back/save, home continue card and
// swipe row, Saved page, Resus docked actions and slide-up sheet, desktop untouched.
// Run from the worktree root: PHYSIO_BASE=http://127.0.0.1:<port> node tests/test-phone-layout.mjs
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
import fs from "node:fs";
const { chromium, devices } = pkg;
const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8794";
const results = [];
function check(name, ok, extra) { results.push({ name, ok }); console.log(ok ? "PASS" : "FAIL", name, ok ? "" : JSON.stringify(extra, null, 1)); }

// Static: every page loads the shell
const htmls = fs.readdirSync(".").filter((f) => f.endsWith(".html"));
const noShell = htmls.filter((f) => { const s = fs.readFileSync(f, "utf8"); return !/assets\/app-shell\.js\?v=/.test(s) || !/assets\/app-shell\.css\?v=/.test(s); });
check("every page loads app-shell.css and app-shell.js", noShell.length === 0, noShell);

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));

// Home
await page.goto(BASE + "/index.html", { waitUntil: "load" });
const home = await page.evaluate(() => {
  const bar = document.querySelector(".pl-tabbar");
  const r = bar && bar.getBoundingClientRect();
  const tabs = Array.from(document.querySelectorAll(".pl-tab")).map((t) => ({ label: t.innerText.trim(), h: t.getBoundingClientRect().height, w: t.getBoundingClientRect().width, cur: t.getAttribute("aria-current") }));
  return { shown: !!bar && getComputedStyle(bar).display !== "none", top: r && r.top, bottom: r && r.bottom, vh: innerHeight, tabs, quick: document.querySelectorAll(".pl-quick .pl-card").length, cont: !!document.querySelector(".pl-continue"), sw: document.documentElement.scrollWidth, vw: innerWidth };
});
check("home: tab bar is fixed at the bottom of the screen", home.shown && Math.abs(home.bottom - home.vh) <= 1, home);
check("home: five tabs, each with a text label and at least 44 px to tap", home.tabs.length === 5 && home.tabs.map((t) => t.label).join(",") === "Home,ECG,Heart,Resus,Saved" && home.tabs.every((t) => t.h >= 44 && t.w >= 44), home.tabs);
check("home: Home tab is marked as the current page", home.tabs[0].cur === "page" && home.tabs.filter((t) => t.cur).length === 1, home.tabs);
check("home: swipe row of tools, no continue card before any tool is used", home.quick >= 6 && !home.cont, home);
check("home: no sideways overflow", home.sw <= home.vw, home);

// Resus chooser
await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__scn && window.__scn.all);
const chooser = await page.evaluate(() => {
  const box = document.getElementById("scnSourceBox");
  const r = box.getBoundingClientRect();
  return { open: box.open, h: r.height, vh: innerHeight, back: !!document.querySelector(".pl-back"), save: !!document.querySelector(".pl-save"), cur: (document.querySelector(".pl-tab[aria-current='page']") || {}).innerText, sw: document.documentElement.scrollWidth, vw: innerWidth };
});
check("resus: source box does not cover the screen before a case is picked", chooser.h < chooser.vh * 0.6, chooser);
check("resus: Back and Save in the header, Resus tab current", chooser.back && chooser.save && chooser.cur === "Resus", chooser);
check("resus chooser: no sideways overflow", chooser.sw <= chooser.vw, chooser);

// Resus running case
await page.evaluate(() => { const s = window.__scn; s.setHints(false); s.start("s1"); });
await page.waitForTimeout(400);
const run = await page.evaluate(() => {
  const vh = innerHeight;
  const bar = document.querySelector(".pl-tabbar").getBoundingClientRect();
  const prim = Array.from(document.querySelectorAll(".act-primary .act-btn")).map((b) => { const r = b.getBoundingClientRect(); return { lab: b.textContent, top: r.top, bottom: r.bottom, h: r.height }; });
  const chips = Array.from(document.querySelectorAll(".pl-act-tab")).map((b) => { const r = b.getBoundingClientRect(); return { lab: b.textContent, h: r.height, bottom: r.bottom }; });
  const mon = document.getElementById("scnDefib").getBoundingClientRect();
  const groupsShown = Array.from(document.querySelectorAll(".act-group")).filter((g) => getComputedStyle(g).display !== "none").length;
  return { vh, barTop: bar.top, prim, chips, monTop: mon.top, monBottom: mon.bottom, groupsShown, sw: document.documentElement.scrollWidth, vw: innerWidth };
});
check("resus: primary row (CPR, Charge, Shock, Rhythm check) visible without scrolling, above the tab bar",
  run.prim.length === 4 && run.prim.every((p) => p.top >= 0 && p.bottom <= run.barTop + 0.5 && p.h >= 44), run);
check("resus: five action group tabs above the tab bar, at least 44 px", run.chips.length === 5 && run.chips.every((c) => c.h >= 44 && c.bottom <= run.barTop + 0.5), run.chips);
check("resus: monitor starts on screen once the case starts", run.monTop >= 0 && run.monTop < run.vh * 0.6, run);
check("resus: other action groups are tucked away until opened", run.groupsShown === 0, run);
check("resus running: no sideways overflow", run.sw <= run.vw, run);

await page.tap(".pl-act-tab[data-group='Airway and breathing']");
await page.waitForTimeout(250);
const sheet = await page.evaluate(() => {
  const g = document.querySelector(".act-group.pl-on");
  const btns = g ? Array.from(g.querySelectorAll(".act-btn")).map((b) => { const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height }; }) : [];
  return { open: document.querySelector(".pl-dock").classList.contains("pl-sheet-open"), label: g && g.querySelector(".scen-group-label").textContent, btns, vh: innerHeight, expanded: document.querySelector(".pl-act-tab[data-group='Airway and breathing']").getAttribute("aria-expanded"), focus: document.activeElement && document.activeElement.dataset.a };
});
check("resus: Airway tab opens a sheet with that group's buttons on screen", sheet.open && sheet.label === "Airway and breathing" && sheet.btns.length >= 5 && sheet.btns.every((b) => b.top >= 0 && b.bottom <= sheet.vh && b.h >= 44) && sheet.expanded === "true" && !!sheet.focus, sheet);
await page.tap(".act-group.pl-on [data-a='airwayOpen']");
await page.waitForTimeout(250);
const after = await page.evaluate(() => ({ open: document.querySelector(".pl-dock").classList.contains("pl-sheet-open"), log: document.getElementById("scnLog").innerText }));
check("resus: choosing an action from the sheet does it and closes the sheet", !after.open && /Open the airway/.test(after.log), after);
await page.tap(".pl-act-tab[data-group='Drugs']");
await page.waitForTimeout(250);
const drugs = await page.evaluate(() => ({ pop: !document.getElementById("scnDrugPopup").hidden }));
check("resus: Drugs tab opens Drugs and fluids straight away", drugs.pop, drugs);
await page.evaluate(() => document.getElementById("scnDrugClose").click());
await page.tap(".pl-act-tab[data-group='Checks']");
await page.keyboard.press("Escape");
const esc = await page.evaluate(() => document.querySelector(".pl-dock").classList.contains("pl-sheet-open"));
check("resus: Escape closes the sheet", !esc, { esc });
await page.evaluate(() => window.__scn.debrief());
await page.waitForTimeout(300);
const deb = await page.evaluate(() => ({ dockFixed: getComputedStyle(document.querySelector(".pl-dock")).position === "fixed", sw: document.documentElement.scrollWidth, vw: innerWidth, logSw: (document.querySelector(".scn-log-scroll") || {}).scrollWidth, logCw: (document.querySelector(".scn-log-scroll") || {}).clientWidth }));
check("resus debrief: event log and debrief need no sideways scrolling", !deb.dockFixed && deb.sw <= deb.vw && deb.logSw <= deb.logCw + 1, deb);

// Save, Saved page and the continue card
await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded" });
await page.tap(".pl-save");
const pressed = await page.evaluate(() => document.querySelector(".pl-save").getAttribute("aria-pressed"));
await page.goto(BASE + "/saved.html", { waitUntil: "load" });
const saved = await page.evaluate(() => ({ fav: Array.from(document.querySelectorAll("#plSavedList .pl-card-title")).map((e) => e.textContent), rec: Array.from(document.querySelectorAll("#plRecentList .pl-card-title")).map((e) => e.textContent), cur: (document.querySelector(".pl-tab[aria-current='page']") || {}).innerText }));
check("save: Save marks the tool and the Saved page lists it with recently used", pressed === "true" && saved.fav.includes("Resus Scenarios") && saved.rec[0] === "Resus Scenarios" && saved.cur === "Saved", { pressed, saved });
await page.goto(BASE + "/index.html", { waitUntil: "load" });
const cont = await page.evaluate(() => { const a = document.querySelector(".pl-continue a"); return a ? { href: a.getAttribute("href"), text: a.innerText } : null; });
check("home: offers the last tool used", cont && cont.href === "Resus_Scenarios" && /Resus Scenarios/.test(cont.text), cont);

// Reduced motion: no sheet animation
const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const rp = await rm.newPage();
await rp.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded" });
await rp.waitForFunction(() => window.__scn && window.__scn.all);
await rp.evaluate(() => { window.__scn.setHints(false); window.__scn.start("s1"); });
await rp.waitForSelector(".pl-act-tab[data-group='Monitoring']");
await rp.evaluate(() => document.querySelector(".pl-act-tab[data-group='Monitoring']").click());
const anim = await rp.evaluate(() => getComputedStyle(document.querySelector(".pl-dock")).animationName);
check("reduced motion: the sheet does not animate", anim === "none", { anim });
await rm.close();

// Live monitor sweep on an iPhone 13, with and without Reduce Motion
for (const motion of ["no-preference", "reduce"]) {
  const ic = await browser.newContext({ ...devices["iPhone 13"], reducedMotion: motion });
  const ip = await ic.newPage();
  await ip.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded" });
  await ip.waitForFunction(() => window.__scn && window.__scn.all);
  await ip.evaluate(() => { window.__scn.setHints(false); window.__scn.start("s1"); });
  await ip.waitForTimeout(600);
  const read = () => ip.evaluate(() => {
    const svg = document.querySelector("#scnMonitor svg");
    const rects = svg.querySelectorAll("clipPath rect");
    const head = svg.querySelector(".mon-head");
    return { drawn: +rects[0].getAttribute("width"), eraseX: +rects[1].getAttribute("x"), full: +svg.viewBox.baseVal.width, head: +head.getAttribute("cx"), headShown: getComputedStyle(head).display !== "none" };
  });
  const s1 = await read();
  await ip.waitForTimeout(1000);
  const s2 = await read();
  const moved = s2.drawn !== s1.drawn && (s2.drawn > s1.drawn || s2.drawn < 20);
  check("iPhone 13 (" + motion + "): monitor ECG sweeps live with an erase gap ahead of the head",
    moved && s2.drawn < s2.full - 2 && s2.eraseX > s2.drawn && s2.headShown && Math.abs(s2.head - s2.drawn) < 0.01, { s1, s2 });
  await ic.close();
}

// Desktop untouched
const dk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await dk.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded" });
await dk.waitForFunction(() => window.__scn && window.__scn.all);
await dk.evaluate(() => { window.__scn.setHints(false); window.__scn.start("s1"); });
const desk = await dk.evaluate(() => {
  const hidden = (sel) => { const e = document.querySelector(sel); return !e || getComputedStyle(e).display === "none"; };
  return { tab: hidden(".pl-tabbar"), back: hidden(".pl-back"), save: hidden(".pl-save"), chips: hidden(".pl-act-tabs"), dock: getComputedStyle(document.querySelector(".scn-actions-card")).position, groups: Array.from(document.querySelectorAll(".act-group")).filter((g) => getComputedStyle(g).display !== "none").length, crumb: !hidden(".crumb"), about: !hidden(".header-link") };
});
check("desktop: no tab bar, back, save or action tabs; actions and header as before", desk.tab && desk.back && desk.save && desk.chips && desk.dock !== "fixed" && desk.groups >= 4 && desk.crumb && desk.about, desk);

check("no page errors", errors.length === 0, errors);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`);
process.exit(failed.length ? 1 : 0);
