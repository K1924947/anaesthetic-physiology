// Phone app layout (app v2): top bar, bottom tab bar (Learn, Practise, Resus,
// Progress, Profile), save, home dashboard, Saved page, Resus docked actions,
// slide-up sheet and Case menu; desktop gets the same nav in the top bar.
// Run from the worktree root: PHYSIO_BASE=http://127.0.0.1:<port> node tests/test-phone-layout.mjs
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
import fs from "node:fs";
const { chromium, devices } = pkg;
const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8794";
const results = [];
function check(name, ok, extra) { results.push({ name, ok }); console.log(ok ? "PASS" : "FAIL", name, ok ? "" : JSON.stringify(extra, null, 1)); }

// Static: every page loads the shell
const htmls = fs.readdirSync(".").filter((f) => f.endsWith(".html"));
const noShell = htmls.filter((f) => { const s = fs.readFileSync(f, "utf8"); return !/assets\/app\.js\?v=/.test(s) || !/assets\/ds\.css\?v=/.test(s) || !/assets\/store\.js\?v=/.test(s) || !/assets\/boot\.js\?v=/.test(s) || /app-shell/.test(s); });
check("every page loads boot.js, ds.css, store.js and app.js (and not the old app-shell)", noShell.length === 0, noShell);

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));

// Home
await page.goto(BASE + "/index.html", { waitUntil: "load" });
const home = await page.evaluate(() => {
  const bar = document.querySelector(".app-tabbar");
  const r = bar && bar.getBoundingClientRect();
  const tabs = Array.from(document.querySelectorAll(".app-tab")).map((t) => ({ label: t.innerText.trim(), h: t.getBoundingClientRect().height, w: t.getBoundingClientRect().width, cur: t.getAttribute("aria-current") }));
  return { shown: !!bar && getComputedStyle(bar).display !== "none", top: r && r.top, bottom: r && r.bottom, vh: innerHeight, tabs, quick: document.querySelectorAll(".app-swipe .ds-card").length, cont: (document.querySelector(".app-continue") || {}).getAttribute ? document.querySelector(".app-continue").getAttribute("href") : null, sw: document.documentElement.scrollWidth, vw: innerWidth };
});
check("home: tab bar is fixed at the bottom of the screen", home.shown && Math.abs(home.bottom - home.vh) <= 1, home);
check("home: five tabs, each with a text label and at least 44 px to tap", home.tabs.length === 5 && home.tabs.map((t) => t.label).join(",") === "Learn,Practise,Resus,Progress,Profile" && home.tabs.every((t) => t.h >= 44 && t.w >= 44), home.tabs);
check("home: no tab is marked current on Home (Home is not one of the five)", home.tabs.filter((t) => t.cur).length === 0, home.tabs);
check("home: swipe row of tools; before any tool is used the start card is ECG Basics", home.quick >= 6 && home.cont === "ECG_Basics", home);
check("home: no sideways overflow", home.sw <= home.vw, home);

// Resus chooser
await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__scn && window.__scn.all);
const chooser = await page.evaluate(() => {
  const box = document.getElementById("scnSourceBox");
  const r = box.getBoundingClientRect();
  return { open: box.open, h: r.height, vh: innerHeight, brand: !!document.querySelector(".app-topbar .app-brand"), title: (document.querySelector(".app-title") || {}).textContent, save: !!document.querySelector("#appSave"), cur: (document.querySelector(".app-tab[aria-current='page']") || {}).innerText, sw: document.documentElement.scrollWidth, vw: innerWidth };
});
check("resus: source box does not cover the screen before a case is picked", chooser.h < chooser.vh * 0.6, chooser);
check("resus: top bar has the brand, the title Resus and Save; Resus tab current", chooser.brand && chooser.title === "Resus" && chooser.save && chooser.cur === "Resus", chooser);
check("resus: Learn from the source starts collapsed on a phone", chooser.open === false, chooser);
check("resus chooser: no sideways overflow", chooser.sw <= chooser.vw, chooser);

// Resus running case
await page.evaluate(() => { const s = window.__scn; s.setHints(false); s.start("s1"); });
await page.waitForTimeout(400);
const run = await page.evaluate(() => {
  const vh = innerHeight;
  const bar = document.querySelector(".app-tabbar").getBoundingClientRect();
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
// Case menu: Show solution, Restart, End scenario and All scenarios in one sheet
const caseBtn = await page.evaluate(() => { const b = document.getElementById("appCaseBtn"); const r = b.getBoundingClientRect(); return { shown: getComputedStyle(b).display !== "none", h: r.height, inlineHidden: getComputedStyle(document.querySelector("#scnStage .strip-tools")).display === "none" }; });
check("resus: one Case button replaces the four case buttons above the monitor", caseBtn.shown && caseBtn.h >= 44 && caseBtn.inlineHidden, caseBtn);
await page.tap("#appCaseBtn");
await page.waitForTimeout(250);
const menu = await page.evaluate(() => { const s = document.getElementById("appCaseSheet"); const ids = Array.from(s.querySelectorAll("button[id]")).map((b) => b.id); const r = s.getBoundingClientRect(); return { open: !s.hidden, ids, top: r.top, bottom: r.bottom, vh: innerHeight, expanded: document.getElementById("appCaseBtn").getAttribute("aria-expanded"), role: s.getAttribute("role"), focusIn: s.contains(document.activeElement), history: !!s.querySelector("a[href^='progress']") }; });
check("resus: Case menu sheet holds Show solution, Restart, End scenario, All scenarios and a history link", menu.open && ["scnHints", "scnRestart", "scnEnd", "scnBack"].every((i) => menu.ids.includes(i)) && menu.bottom <= menu.vh + 1 && menu.expanded === "true" && menu.role === "dialog" && menu.focusIn && menu.history, menu);
await page.tap("#scnHints");
const sol = await page.evaluate(() => ({ open: !document.getElementById("appCaseSheet").hidden, on: document.getElementById("scnHints").getAttribute("aria-checked"), tag: !document.querySelector(".app-case-sol").hidden }));
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
const solClosed = await page.evaluate(() => ({ open: !document.getElementById("appCaseSheet").hidden, back: !!document.querySelector("#scnStage .strip-head > .strip-tools"), focus: document.activeElement && document.activeElement.id }));
check("resus: Show solution toggles inside the sheet, the Case button then says Solution on; Escape closes and returns focus", sol.open && sol.on === "true" && sol.tag && !solClosed.open && solClosed.back && solClosed.focus === "appCaseBtn", { sol, solClosed });
await page.evaluate(() => { if (document.getElementById("scnHints").getAttribute("aria-checked") === "true") document.getElementById("scnHints").click(); });

await page.evaluate(() => window.__scn.debrief());
await page.waitForTimeout(300);
const deb = await page.evaluate(() => ({ dockFixed: getComputedStyle(document.querySelector(".pl-dock")).position === "fixed", sw: document.documentElement.scrollWidth, vw: innerWidth, logSw: (document.querySelector(".scn-log-scroll") || {}).scrollWidth, logCw: (document.querySelector(".scn-log-scroll") || {}).clientWidth }));
check("resus debrief: event log and debrief need no sideways scrolling", !deb.dockFixed && deb.sw <= deb.vw && deb.logSw <= deb.logCw + 1, deb);

// Save, Saved page and the continue card
await page.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded" });
await page.tap("#appSave");
const pressed = await page.evaluate(() => document.querySelector("#appSave").getAttribute("aria-pressed"));
await page.goto(BASE + "/saved.html", { waitUntil: "load" });
const saved = await page.evaluate(() => ({ fav: Array.from(document.querySelectorAll("#appSavedList .ds-card__title")).map((e) => e.textContent), rec: Array.from(document.querySelectorAll("#appRecentList .ds-card__title")).map((e) => e.textContent), cur: (document.querySelector(".app-tab[aria-current='page']") || {}).innerText }));
check("save: Save marks the tool and the Saved page lists it with recently used", pressed === "true" && saved.fav.includes("Resus Scenarios") && saved.rec[0] === "Resus Scenarios" && saved.cur === "Learn", { pressed, saved });
await page.goto(BASE + "/index.html", { waitUntil: "load" });
const cont = await page.evaluate(() => { const a = document.querySelector("a.app-continue"); return a ? { href: a.getAttribute("href"), text: a.innerText } : null; });
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

// Desktop: the same five sections as a nav in the top bar
const dk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await dk.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "domcontentloaded" });
await dk.waitForFunction(() => window.__scn && window.__scn.all);
await dk.evaluate(() => { window.__scn.setHints(false); window.__scn.start("s1"); });
const desk = await dk.evaluate(() => {
  const hidden = (sel) => { const e = document.querySelector(sel); return !e || getComputedStyle(e).display === "none"; };
  const nav = Array.from(document.querySelectorAll(".app-nav a")).map((a) => ({ label: a.innerText.trim(), cur: a.getAttribute("aria-current") }));
  return { tab: hidden(".app-tabbar"), chips: hidden(".pl-act-tabs"), caseBtn: hidden("#appCaseBtn"), toolsInline: !hidden("#scnStage .strip-tools") && !!document.querySelector("#scnStage .strip-head > .strip-tools"), dock: getComputedStyle(document.querySelector(".scn-actions-card")).position, groups: Array.from(document.querySelectorAll(".act-group")).filter((g) => getComputedStyle(g).display !== "none").length, nav, cb: !hidden(".app-topbar #colour-blind-toggle"), oldTop: hidden(".site-header-top") };
});
check("desktop: no tab bar or action tabs; nav of five in the top bar with Resus current; case buttons inline; colour-blind toggle in the top bar", desk.tab && desk.chips && desk.caseBtn && desk.toolsInline && desk.dock !== "fixed" && desk.groups >= 4 && desk.nav.map((n) => n.label).join(",") === "Learn,Practise,Resus,Progress,Profile" && desk.nav.filter((n) => n.cur).map((n) => n.label).join() === "Resus" && desk.cb && desk.oldTop, desk);

check("no page errors", errors.length === 0, errors);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`);
process.exit(failed.length ? 1 : 0);
