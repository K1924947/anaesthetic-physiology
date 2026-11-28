// App v2: design system, light/dark theme, store, progress, tab bar, Case menu,
// today's case, overflow at 390 px and contrast spot checks in both themes.
// Run from the worktree root: PHYSIO_BASE=http://127.0.0.1:<port> node tests/test-app-v2.mjs
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
import fs from "node:fs";
const { chromium } = pkg;
const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8794";
const results = [];
function check(name, ok, extra) { results.push({ name, ok }); console.log(ok ? "PASS" : "FAIL", name, ok ? "" : JSON.stringify(extra, null, 1)); }
const errors = [];
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
function watch(p) { p.on("pageerror", (e) => errors.push(p.url() + " " + e.message)); }

// ---------- Static: head order ----------
const htmls = fs.readdirSync(".").filter((f) => f.endsWith(".html"));
const order = htmls.filter((f) => {
  const s = fs.readFileSync(f, "utf8");
  const head = s.slice(0, s.indexOf("</head>"));
  const boot = head.indexOf("assets/boot.js"), css = head.indexOf('rel="stylesheet"'), meta = head.indexOf('name="theme-color"');
  const sync = /<script src="assets\/boot\.js\?v=[^"]+"><\/script>/.test(head);
  return !(sync && boot > meta && boot < css && /<html lang="en-GB" data-ds="(app|tool)"/.test(s));
});
check("every page runs boot.js synchronously before any stylesheet and marks data-ds", order.length === 0, order);

// ---------- Theme ----------
const CAPTURE = () => {
  window.__firstScheme = null;
  new MutationObserver((m, o) => { if (document.body && window.__firstScheme === null) { window.__firstScheme = document.documentElement.getAttribute("data-scheme"); o.disconnect(); } })
    .observe(document, { childList: true, subtree: true });
};
for (const cs of ["light", "dark"]) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: cs });
  await c.addInitScript(CAPTURE);
  const p = await c.newPage(); watch(p);
  await p.goto(BASE + "/index.html", { waitUntil: "load" });
  const r = await p.evaluate(() => ({ first: window.__firstScheme, now: document.documentElement.dataset.scheme, pref: document.documentElement.dataset.schemePref, bg: getComputedStyle(document.body).backgroundColor, meta: document.querySelector('meta[name="theme-color"]').content }));
  check("theme follows the system (" + cs + ") and is set before the body is parsed (no flash)", r.first === cs && r.now === cs && r.pref === "system" && (cs === "dark" ? r.bg === "rgb(14, 17, 22)" && r.meta === "#0E1116" : r.bg !== "rgb(14, 17, 22)"), r);
  await c.close();
}
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  await c.addInitScript(CAPTURE);
  const p = await c.newPage(); watch(p);
  await p.goto(BASE + "/index.html", { waitUntil: "load" });
  const btn0 = await p.evaluate(() => { const b = document.getElementById("appTheme"); return { pressed: b.getAttribute("aria-pressed"), label: b.getAttribute("aria-label") }; });
  await p.click("#appTheme");
  const after = await p.evaluate(() => ({ scheme: document.documentElement.dataset.scheme, stored: localStorage.getItem("physiolab:v1:prefs.theme"), pressed: document.getElementById("appTheme").getAttribute("aria-pressed") }));
  await p.goto(BASE + "/ECG_Basics.html", { waitUntil: "load" });
  const tool = await p.evaluate(() => ({
    first: window.__firstScheme,
    frame: getComputedStyle(document.querySelector(".app-topbar")).getPropertyValue("--surface").trim(),
    pageSurface: getComputedStyle(document.querySelector(".page")).getPropertyValue("--surface").trim(),
    pageBg: getComputedStyle(document.querySelector(".page")).backgroundColor,
    paper: getComputedStyle(document.documentElement).getPropertyValue("--ecg-paper").trim(),
    paperCard: getComputedStyle(document.querySelector(".graph-card")).backgroundColor
  }));
  check("top bar toggle switches to dark, is remembered, and the next page starts dark before first paint", btn0.pressed === "false" && btn0.label === "Dark theme" && after.scheme === "dark" && after.stored === '"dark"' && after.pressed === "true" && tool.first === "dark", { btn0, after, tool });
  check("tool pages in dark: page and frame are dark, ECG paper stays light paper",
    /#171B22/i.test(tool.frame) && /#171B22/i.test(tool.pageSurface) && tool.pageBg === "rgb(14, 17, 22)" && /#FFF9F5/i.test(tool.paper) && tool.paperCard === "rgb(255, 249, 245)", tool);
  await p.goto(BASE + "/profile.html", { waitUntil: "load" });
  const seg = await p.evaluate(() => Array.from(document.querySelectorAll("#appThemeSeg input")).map((i) => i.value + ":" + i.checked).join(","));
  await p.click("label[for=appThemeSystem]");
  const sys = await p.evaluate(() => ({ scheme: document.documentElement.dataset.scheme, pref: document.documentElement.dataset.schemePref }));
  check("Profile theme control shows Dark, then System returns to following the device", seg === "system:false,light:false,dark:true" && sys.scheme === "light" && sys.pref === "system", { seg, sys });
  // colour-blind switch on Profile drives the same setting as the header toggle
  await p.click("#appCbSwitch");
  const cb = await p.evaluate(() => ({ theme: document.documentElement.dataset.theme, sw: document.getElementById("appCbSwitch").getAttribute("aria-checked"), key: localStorage.getItem("anaesthetic-physiology-colour-blind") }));
  await p.click("#appCbSwitch");
  check("Profile colour-blind switch turns the tool palette on and off", cb.theme === "colour-blind" && cb.sw === "true" && !!cb.key, cb);
  await c.close();
}

// ---------- Store ----------
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await c.newPage(); watch(p);
  await p.goto(BASE + "/privacy.html", { waitUntil: "load" });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem("physiolab-saved", JSON.stringify(["PV_Loop"])); localStorage.setItem("physiolab-recent", JSON.stringify([{ slug: "ECG_3D", at: 1 }])); });
  await p.reload({ waitUntil: "load" });
  const r = await p.evaluate(() => {
    const S = window.PhysioStore, seen = [];
    const off = S.subscribe("test.key", (v) => seen.push(v));
    S.set("test.key", { a: 1 });
    S.update("test.key", (v) => ({ a: v.a + 1 }));
    off && off();
    S.set("test.key", { a: 9 });
    return {
      schema: localStorage.getItem("physiolab:schema"), raw: localStorage.getItem("physiolab:v1:test.key"), got: S.get("test.key"), missing: S.get("nope", "fb"), seen,
      saved: S.get("tools.saved"), recent: (S.get("tools.recent") || []).map((x) => x.slug), oldGone: localStorage.getItem("physiolab-saved") === null,
      keys: S.keys().includes("test.key"), plus: window.PhysioPlus.isPlus(), can: ["resus.history", "resus.allCases", "ecg.allTools"].every((f) => window.PhysioPlus.canUse(f)),
      badge: /ds-plus-badge/.test(window.PhysioPlus.badge()), badgesShown: document.querySelectorAll(".ds-plus-badge").length, adapter: typeof S.setAdapter === "function"
    };
  });
  check("store: namespaced keys with a schema version, get/set/update/subscribe", r.schema === "1" && r.raw === '{"a":9}' && r.got.a === 9 && r.missing === "fb" && r.seen.length === 2 && r.seen[1].a === 2 && r.keys && r.adapter, r);
  check("store: migrates the phase 1 saved and recent lists", JSON.stringify(r.saved) === '["PV_Loop"]' && r.recent[0] === "ECG_3D" && r.oldGone, r);
  check("entitlements: not Plus, every feature free, badge exists but is shown nowhere", !r.plus && r.can && r.badge && r.badgesShown === 0, r);
  await c.close();
}

// ---------- Resus index, today's case, results recording ----------
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await c.newPage(); watch(p);
  await p.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.waitForFunction(() => window.__scn && window.__scn.all);
  const idx = await p.evaluate(() => {
    const live = typeof window.__scn.listed === "function" ? window.__scn.listed() : (window.__scn.listed || []);
    const a = live.map((s) => s.id + "|" + window.__scn.listTitle(s)).join(";");
    const b = window.PHYSIO_RESUS_CASES.map((c) => c.id + "|" + c.title).join(";");
    return { same: a === b, n: window.PHYSIO_RESUS_CASES.length, live: live.length };
  });
  check("resus-index.js matches the live case list (ids, titles, order)", idx.same && idx.n === 28, idx);

  await p.evaluate(() => { window.__scn.setHints(false); window.__scn.start("s1"); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { window.__scn.act("attachPads"); });
  const live = await p.evaluate(() => window.__scn.score());
  await p.evaluate(() => window.__scn.debrief());
  await p.waitForTimeout(200);
  await p.evaluate(() => window.__scn.debrief()); // a second debrief must not add a second attempt
  await p.waitForTimeout(200);
  const rec = await p.evaluate(() => ({ list: window.PhysioProgress.attempts(), note: !!document.querySelector("#scnDebrief .app-saved-note a[href^='progress']"), box: document.getElementById("scnSourceBox").open }));
  const a0 = rec.list[0] || {};
  check("finishing or ending a case saves one attempt with id, title, score and time (score unchanged)", rec.list.length === 1 && a0.id === "s1" && a0.title.length > 3 && a0.pts === live.pts && a0.of === live.of && typeof a0.simSec === "number" && a0.at > 0 && a0.solution === false && rec.note, { rec, live });
  check("debrief opens Learn from the source again", rec.box === true, rec);

  await p.goto(BASE + "/progress.html", { waitUntil: "load" });
  const prog = await p.evaluate(() => ({
    rows: document.querySelectorAll("#appHistoryList .app-attempt").length,
    first: (document.querySelector("#appHistoryList .app-attempt") || {}).innerText || "",
    best: (document.querySelector('#appProgBest a[data-case="s1"]') || {}).innerText || "",
    bestRows: document.querySelectorAll("#appProgBest a.ds-row").length,
    stat: document.querySelector("#appProgStats .ds-stat__val") && document.querySelector("#appProgStats").innerText,
    cur: (document.querySelector(".app-tab[aria-current='page']") || {}).innerText
  }));
  check("Progress page lists the attempt in history and as the best for that case, with all 28 cases", prog.rows === 1 && /%/.test(prog.first) && /Best/.test(prog.best) && prog.bestRows === 28 && /Attempts/.test(prog.stat) && prog.cur === "Progress", prog);

  await p.goto(BASE + "/index.html", { waitUntil: "load" });
  const today = await p.evaluate(() => ({ href: document.getElementById("appTodayCase").getAttribute("href"), id: document.getElementById("appTodayCase").dataset.case, pick: window.PhysioApp.todaysCase().id, again: window.PhysioApp.todaysCase(Date.now()).id, other: window.PhysioApp.todaysCase(Date.now() + 86400000 * 3).id, prog: document.querySelector("#appProgH").closest("section").innerText }));
  check("Home: today's case is a fixed daily pick from the Resus list", today.id === today.pick && today.pick === today.again && today.href === "Resus_Scenarios#case=" + today.id && /Attempts/.test(today.prog), today);
  await p.goto(BASE + "/" + today.href.replace("Resus_Scenarios", "Resus_Scenarios.html"), { waitUntil: "load" });
  await p.waitForFunction(() => document.body.classList.contains("scn-case-running"), null, { timeout: 8000 }).catch(() => {});
  const deep = await p.evaluate(() => ({ running: document.body.classList.contains("scn-case-running"), title: document.getElementById("scnTitle").textContent, hash: location.hash }));
  const want = await p.evaluate((id) => window.PHYSIO_RESUS_CASES.find((c) => c.id === id).title, today.id);
  check("Today's case link opens straight into that case", deep.running && deep.title.indexOf(want) !== -1 && deep.hash === "", { deep, want });

  // Clear data from Profile
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + "/profile.html", { waitUntil: "load" });
  const info = await p.evaluate(() => document.getElementById("appStoreInfo").textContent);
  await p.click("#appClearData");
  const cleared = await p.evaluate(() => ({ n: window.PhysioProgress.attempts().length, keys: Object.keys(localStorage).filter((k) => /^physiolab/.test(k) && k !== "physiolab:schema"), msg: document.getElementById("appClearMsg").textContent }));
  check("Profile says accounts are coming soon, counts what is saved, and Clear data empties it", /1 Resus attempt/.test(info) && cleared.n === 0 && cleared.keys.length === 0 && /Cleared/.test(cleared.msg), { info, cleared });
  await c.close();
}

// ---------- Tab bar and overflow on every page, both themes ----------
const TABS = { learn: "Learn", cardiac: "Learn", respiratory: "Learn", saved: "Learn", ECG_Basics: "Learn", ECG_Conduction: "Learn", ECG_3D: "Learn", Cardiac_Action_Potential: "Learn", PV_Loop: "Learn", Cardiac_Murmurs: "Learn", HF_Notes: "Learn", MI_Timeline: "Learn", Arterial_Waveform: "Learn", practise: "Practise", ECG_Rhythm_Quiz: "Practise", Resus_Scenarios: "Resus", progress: "Progress", profile: "Profile", privacy: "Profile", index: "" };
for (const cs of ["light", "dark"]) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: cs, isMobile: true, hasTouch: true });
  const bad = [], tabsBad = [];
  for (const slug of Object.keys(TABS)) {
    const p = await c.newPage(); watch(p);
    await p.goto(BASE + "/" + slug + ".html", { waitUntil: "load" });
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, cur: Array.from(document.querySelectorAll(".app-tab[aria-current='page']")).map((t) => t.innerText.trim()), top: !!document.querySelector(".app-topbar"), tabs: document.querySelectorAll(".app-tab").length }));
    if (r.sw > r.vw) bad.push(slug + " " + r.sw);
    if (!r.top || r.tabs !== 5 || r.cur.join() !== TABS[slug]) tabsBad.push(slug + " " + JSON.stringify(r));
    await p.close();
  }
  check("390 px " + cs + ": no page scrolls sideways", bad.length === 0, bad);
  check("390 px " + cs + ": top bar and five tabs on every page, the right one marked current", tabsBad.length === 0, tabsBad);
  await c.close();
}

// ---------- Contrast spot checks (WCAG AA) ----------
function lum([r, g, b]) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
for (const cs of ["light", "dark"]) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: cs });
  const p = await c.newPage(); watch(p);
  const pairs = [];
  for (const [page, sels] of [
    ["index", [".ds-h1", ".ds-lede", ".ds-card__title", ".ds-card__desc", ".ds-card__meta", ".ds-stat__lab", ".app-tab", ".app-brand-name", ".ds-link", ".jcard-meta", ".home-section-lede"]],
    ["progress", [".app-tab[aria-current]", ".ds-row__title", ".ds-row__sub", ".ds-small", ".ds-kicker"]],
    ["profile", [".ds-seg label", ".app-setting-text span", ".ds-switch__state", ".ds-row__sub"]],
    ["Cardiac_Action_Potential", ["h1", ".subtitle", ".tool-section-title", ".try-btn", ".disclaimer"]],
    ["PV_Loop", ["h1", ".subtitle", ".try-btn"]],
    ["Cardiac_Murmurs", ["h1", ".subtitle"]],
    ["ECG_Conduction", [".ecgc-sub", ".ecgc-btn", ".ecgc-rule"]],
    ["ECG_Basics", ["h1", ".subtitle", ".tool-intro"]]
  ]) {
    await p.goto(BASE + "/" + page + ".html", { waitUntil: "load" });
    await p.waitForTimeout(150);
    pairs.push(...await p.evaluate((sels) => {
      const rgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { c: v.slice(0, 3), a: v.length > 3 ? v[3] : 1 }; };
      const bgOf = (el) => {
        const stack = [];
        for (let e = el; e; e = e.parentElement) { const b = rgb(getComputedStyle(e).backgroundColor); if (b && b.a > 0) { stack.push(b); if (b.a >= 1) break; } }
        let out = [255, 255, 255];
        for (let i = stack.length - 1; i >= 0; i--) { const b = stack[i]; out = out.map((v, k) => b.c[k] * b.a + v * (1 - b.a)); }
        return out;
      };
      return sels.map((s) => { const el = document.querySelector(s); if (!el) return { s, missing: true }; return { s: location.pathname.split("/").pop() + " " + s, fg: rgb(getComputedStyle(el).color).c, bg: bgOf(el) }; });
    }, sels));
  }
  const low = pairs.filter((x) => x.missing || ratio(x.fg, x.bg) < 4.5).map((x) => x.missing ? x.s + " missing" : x.s + " " + ratio(x.fg, x.bg).toFixed(2));
  check("contrast " + cs + ": text in the frame, cards, rows and settings is at least 4.5:1", low.length === 0, low);
  await c.close();
}

// ---------- ECG paper light, monitor dark in both themes ----------
for (const cs of ["light", "dark"]) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: cs });
  const p = await c.newPage(); watch(p);
  await p.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "load" });
  await p.waitForFunction(() => window.__scn && window.__scn.all);
  await p.evaluate(() => { window.__scn.setHints(false); window.__scn.start("s1"); });
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => ({ mon: getComputedStyle(document.getElementById("scnDefib")).backgroundColor, paper: getComputedStyle(document.documentElement).getPropertyValue("--ecg-paper").trim() }));
  const dark = (s) => { const v = s.match(/\d+/g).map(Number); return v[0] + v[1] + v[2] < 200; };
  check("Resus " + cs + ": the monitor stays dark and ECG paper stays light paper", dark(m.mon) && /#FFF9F5/i.test(m.paper), m);
  await c.close();
}


// ---------- ECG Conduction: colour-blind toggle lives in the shared top bar ----------
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await c.newPage(); watch(p);
  await p.goto(BASE + "/ECG_Conduction.html", { waitUntil: "load" });
  const r = await p.evaluate(() => {
    const btn = document.getElementById("colour-blind-toggle");
    const bar = document.querySelector(".app-topbar");
    return { inBar: !!(btn && bar && bar.contains(btn)), shown: btn && getComputedStyle(btn).display !== "none", pressed: btn && btn.getAttribute("aria-pressed") };
  });
  await p.click("#colour-blind-toggle");
  const on = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.click("#colour-blind-toggle");
  check("ECG Conduction: colour-blind toggle is in the top bar and works", r.inBar && r.shown && r.pressed === "false" && on === "colour-blind", r);
  await c.close();
}

// ---------- Resus about: collapsed on phones so the case list comes first ----------
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await c.newPage(); watch(p);
  await p.goto(BASE + "/Resus_Scenarios.html", { waitUntil: "load" });
  await p.waitForFunction(() => window.__scn && window.__scn.all);
  const r = await p.evaluate(() => {
    const about = document.getElementById("scnAbout");
    const sum = about && about.querySelector("summary");
    const chooser = document.getElementById("scnChooserTitle") || document.querySelector(".scn-random");
    const text = (about && about.innerText) || "";
    return {
      exists: !!about, open: about && about.open, sumShown: sum && getComputedStyle(sum).display !== "none",
      sumTop: sum && Math.round(sum.getBoundingClientRect().top),
      chooserTop: chooser && Math.round(chooser.getBoundingClientRect().top),
      sumBottom: sum && Math.round(sum.getBoundingClientRect().bottom),
      hasDisclaimer: /Not affiliated with or endorsed by Resuscitation Council UK/.test(about.querySelector(".scn-about-body") ? about.querySelector(".scn-about-body").textContent : ""),
      hasAmber: /pending senior colleague review/.test(about.textContent),
      sw: document.documentElement.scrollWidth, vw: innerWidth
    };
  });
  check("Resus phone: a compact About these cases row sits above the case list, starts closed, disclaimer text is still there", r.exists && r.open === false && r.sumShown && r.sumTop < 140 && r.chooserTop > r.sumBottom && r.chooserTop < 280 && r.hasDisclaimer && r.hasAmber && r.sw <= r.vw, r);
  await p.click("#scnAbout > summary");
  const opened = await p.evaluate(() => document.getElementById("scnAbout").open);
  check("Resus phone: opening About these cases reveals the disclaimer and amber notice", opened === true, { opened });
  await c.close();
}

check("no page errors", errors.length === 0, errors);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`);
process.exit(failed.length ? 1 : 0);
