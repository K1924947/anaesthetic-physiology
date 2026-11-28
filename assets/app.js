/* The Physio Lab: app frame and app pages.
   - Top bar on every page: Back (or the brand), the page title on phones,
     the main nav on wide screens, Save on tools, the colour-blind toggle
     (wide screens), the light/dark toggle and the account (Profile) button.
   - Bottom tab bar on phones: Learn, Practise, Resus, Progress, Profile.
   - Home dashboard, Learn, Practise, Progress, Profile and Saved pages.
   - Resus: the Case menu sheet, the docked actions, deep links
     (#case=ID, #random, #challenge) and saving each attempt to Progress.
   Data goes through window.PhysioStore (assets/store.js). */
(function () {
  "use strict";

  var S = window.PhysioStore;
  var PHONE = "(max-width: 720px)";
  var phoneMq = null;
  try { phoneMq = window.matchMedia(PHONE); } catch (e) {}
  function isPhone() { return !!(phoneMq && phoneMq.matches); }

  /* section: which tab is current. parent: where Back goes without history. */
  var PAGES = {
    "": { title: "Home", section: "home", top: 1 },
    "learn": { title: "Learn", section: "learn", top: 1 },
    "practise": { title: "Practise", section: "practise", top: 1 },
    "progress": { title: "Progress", section: "progress", top: 1 },
    "profile": { title: "Profile", section: "profile", top: 1 },
    "saved": { title: "Saved tools", section: "learn", parent: "learn" },
    "cardiac": { title: "Cardiac", section: "learn", parent: "learn" },
    "respiratory": { title: "Respiratory", section: "learn", parent: "learn" },
    "privacy": { title: "Privacy", section: "profile", parent: "profile" },
    "ECG_Basics": { title: "ECG Basics", desc: "Waves, intervals and rate", icon: "ecg", section: "learn", parent: "learn", tool: 1 },
    "ECG_Conduction": { title: "ECG Conduction", desc: "How the heart's wiring draws each wave", icon: "ecg", section: "learn", parent: "learn", tool: 1 },
    "ECG_3D": { title: "ECG in 3D", desc: "A heart in 3D drawing all 12 leads", icon: "cube", section: "learn", parent: "learn", tool: 1 },
    "ECG_Rhythm_Quiz": { title: "ECG Rhythms", desc: "Name the rhythm on the strip", icon: "quiz", section: "practise", parent: "practise", tool: 1 },
    "Cardiac_Action_Potential": { title: "Cardiac Action Potential", desc: "Ionic foundations", icon: "wave", section: "learn", parent: "learn", tool: 1 },
    "PV_Loop": { title: "Pressure-Volume Loop", desc: "The cardiac cycle", icon: "loop", section: "learn", parent: "learn", tool: 1 },
    "Cardiac_Murmurs": { title: "Cardiac Murmurs", desc: "Sounds and haemodynamics", icon: "heart", section: "learn", parent: "learn", tool: 1 },
    "Resus_Scenarios": { title: "Resus Scenarios", short: "Resus", desc: "Arrest and peri-arrest cases", icon: "resus", section: "resus", top: 1, tool: 1 },
    "Arterial_Waveform": { title: "Arterial Waveform", section: "learn", parent: "cardiac" },
    "HF_Notes": { title: "Heart failure notes", section: "learn", parent: "cardiac" },
    "MI_Timeline": { title: "MI timeline", section: "learn", parent: "cardiac" }
  };
  var TABS = [
    { id: "learn", label: "Learn", href: "learn", icon: "learn" },
    { id: "practise", label: "Practise", href: "practise", icon: "target" },
    { id: "resus", label: "Resus", href: "Resus_Scenarios", icon: "resus" },
    { id: "progress", label: "Progress", href: "progress", icon: "chart" },
    { id: "profile", label: "Profile", href: "profile", icon: "person" }
  ];
  var QUICK = ["Resus_Scenarios", "ECG_Rhythm_Quiz", "ECG_Basics", "ECG_3D", "ECG_Conduction", "Cardiac_Action_Potential", "PV_Loop", "Cardiac_Murmurs"];

  var ICON = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h5v-5h3v5h5V10"/>',
    learn: '<path d="M3 5.5c3-1.3 6-1.3 9 .5 3-1.8 6-1.8 9-.5v13c-3-1.3-6-1.3-9 .5-3-1.8-6-1.8-9-.5z"/><path d="M12 6v13"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    resus: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M5.5 11h3l1.5-3 2 6 1.5-4 1 1h4"/><path d="M9 20.5h6M12 16.5v4"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.2-4 4.4-6 8-6s6.8 2 8 6"/>',
    ecg: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M5 12h3l1.5-3.5 2.5 7 2-3.5H19"/>',
    heart: '<path d="M12 20S4 14.8 2.6 10.4C1.5 7.2 3.5 4 7 4c2 0 3.4 1.1 5 3.1C13.6 5.1 15 4 17 4c3.5 0 5.5 3.2 4.4 6.4C20 14.8 12 20 12 20z"/>',
    cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M12 12 20 7.5M12 12 4 7.5M12 12v9"/>',
    quiz: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 12h2.5l1.2-3 2 6 1.3-3H18"/>',
    wave: '<path d="M3 16h3l2-10 2 3h4l3 7h4"/>',
    loop: '<path d="M6 18V8c0-2 1-3 3-3h7c1.5 0 2 1 2 2.5V18z"/>',
    lungs: '<path d="M12 4v8"/><path d="M12 10c-1 0-2 1-3 1-3 0-5 3-5 7 0 1.5 1 2 2.5 2 3 0 5.5-2 5.5-5"/><path d="M12 10c1 0 2 1 3 1 3 0 5 3 5 7 0 1.5-1 2-2.5 2-3 0-5.5-2-5.5-5"/>',
    saved: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    star: '<path class="app-fill" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    arrow: '<path d="M4 12h14M13 6.5l5.5 5.5-5.5 5.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    flame: '<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-3.5 2.6-5.6 4-8.5.4 2 1.6 3 2.5 3.5.3-2.5 1.5-4.5 3-6 .4 3 3.5 5 3.5 10 0 4-2.5 7-6.5 7z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8M12 13v4M8 20.5h8M9.5 17h5v3.5h-5z"/>',
    check: '<path d="M4.5 12.5 9.5 17.5 19.5 7"/>',
    cross: '<path d="M6 6l12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.5v.5"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6z"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    menu: '<circle cx="5.5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor"/>'
  };
  function svg(name, size, cls) {
    var s = size || 24;
    return '<svg class="app-ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICON[name] || "") + "</svg>";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function slugOf(pathname) {
    var p = (pathname || "/").replace(/\/+$/, "");
    var last = p.split("/").pop() || "";
    last = decodeURIComponent(last).replace(/\.html$/i, "");
    if (last === "index") last = "";
    return Object.prototype.hasOwnProperty.call(PAGES, last) ? last : (/\/$/.test(pathname) ? "" : last);
  }
  var SLUG = slugOf(location.pathname);
  var INFO = PAGES[SLUG] || { title: document.title.split("|")[0].trim(), section: "learn", parent: "learn" };
  function href(slug) { return slug === "" ? "./" : slug; }
  function $(id) { return document.getElementById(id); }

  /* ---------- Store-backed lists ---------- */
  function get(k, d) { return S ? S.get(k, d) : d; }
  function set(k, v) { if (S) S.set(k, v); }
  function recent() { var r = get("tools.recent", []); return (Array.isArray(r) ? r : []).filter(function (x) { return x && PAGES[x.slug] && PAGES[x.slug].tool; }); }
  function saved() { var r = get("tools.saved", []); return (Array.isArray(r) ? r : []).filter(function (s) { return PAGES[s] && PAGES[s].tool; }); }
  function isSaved(slug) { return saved().indexOf(slug) !== -1; }
  function toggleSaved(slug) {
    var list = saved(), i = list.indexOf(slug);
    if (i === -1) list.unshift(slug); else list.splice(i, 1);
    set("tools.saved", list);
  }
  function remember() {
    if (!INFO.tool) return;
    var list = recent().filter(function (r) { return r.slug !== SLUG; });
    list.unshift({ slug: SLUG, at: Date.now() });
    set("tools.recent", list.slice(0, 8));
  }

  /* ---------- Small helpers for dates, scores and cases ---------- */
  function cases() { return Array.isArray(window.PHYSIO_RESUS_CASES) ? window.PHYSIO_RESUS_CASES : []; }
  function caseById(id) { return cases().filter(function (c) { return c.id === id; })[0] || null; }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function dayKey(t) { return window.PhysioProgress ? window.PhysioProgress.dayKey(t) : new Date(t).toISOString().slice(0, 10); }
  /* Today's case: the same pick for everyone on a given local date. */
  function todaysCase(now) {
    var list = cases();
    if (!list.length) return null;
    return list[hash("physiolab-daily-" + dayKey(now || Date.now())) % list.length];
  }
  function fmtClock(sec) { sec = Math.max(0, Math.round(sec || 0)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function fmtDate(t) {
    var d = new Date(t), today = dayKey(Date.now()), y = new Date(); y.setDate(y.getDate() - 1);
    var time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (dayKey(t) === today) return "Today " + time;
    if (dayKey(t) === dayKey(y.getTime())) return "Yesterday " + time;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) + " " + time;
  }
  function fmtPts(n) { return (Math.round(n * 10) / 10).toString(); }
  var OUTCOME = {
    complete: { label: "Completed", icon: "check", tag: "blue" },
    harm: { label: "Patient harmed", icon: "cross", tag: "orange" },
    missed: { label: "Key step missed", icon: "cross", tag: "orange" },
    cap: { label: "Time limit", icon: "clock", tag: "magenta" },
    ended: { label: "Ended early", icon: "clock", tag: "grey" }
  };
  function outcomeOf(r) { return r.completed ? OUTCOME.complete : (OUTCOME[r.outcome] || OUTCOME.ended); }
  function tag(o) { return '<span class="ds-tag ds-tag--' + o.tag + '">' + svg(o.icon, 14) + esc(o.label) + "</span>"; }
  function stats() { return window.PhysioProgress ? window.PhysioProgress.stats() : { attempts: 0, completed: 0, tried: 0, days: 0, streak: 0, last: null }; }

  function toolCard(slug, extra) {
    var p = PAGES[slug];
    return '<a class="ds-card ds-card--row' + (extra ? " " + extra : "") + '" href="' + href(slug) + '">' +
      '<span class="ds-card__icon">' + svg(p.icon || "learn", 24) + "</span>" +
      '<span class="ds-card__body"><span class="ds-card__title">' + esc(p.title) + "</span>" +
      (p.desc ? '<span class="ds-card__desc">' + esc(p.desc) + "</span>" : "") + "</span>" +
      '<span class="ds-card__go">' + svg("arrow", 20) + "</span></a>";
  }

  /* ---------- Frame: top bar ---------- */
  function sameOriginReferrer() {
    try { return !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (e) { return false; }
  }
  function themeBtnPaint(btn) {
    var dark = (window.PhysioScheme ? window.PhysioScheme.current() : "light") === "dark";
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    btn.setAttribute("aria-label", "Dark theme");
    btn.title = dark ? "Dark theme on: switch to light" : "Switch to dark theme";
    btn.innerHTML = svg(dark ? "moon" : "sun", 22);
  }
  function buildTopBar() {
    var bar = document.createElement("header");
    bar.className = "app-topbar";
    var left;
    if (INFO.top || !INFO.parent) {
      left = '<a class="app-brand' + (SLUG === "" ? "" : " app-brand--icon") + '" href="./" aria-label="The Physio Lab, home"><img src="assets/logo.svg?v=20261118f" width="22" height="22" alt=""><span class="app-brand-name">The Physio Lab</span></a>';
    } else {
      var to = PAGES[INFO.parent] ? PAGES[INFO.parent].title : "Home";
      left = '<a class="app-back" href="' + href(INFO.parent) + '" aria-label="Back" title="Back (or ' + esc(to) + ')">' + svg("back", 22) + '<span class="app-back-label">Back</span></a>' +
        '<a class="app-brand app-brand--wide" href="./" aria-label="The Physio Lab, home"><img src="assets/logo.svg?v=20261118f" width="22" height="22" alt=""><span class="app-brand-name">The Physio Lab</span></a>';
    }
    var title = SLUG === "" ? "" : '<p class="app-title">' + esc(INFO.short || INFO.title) + "</p>";
    var nav = '<nav class="app-nav" aria-label="Main">' + TABS.map(function (t) {
      var on = t.id === INFO.section;
      return '<a href="' + t.href + '" data-tab="' + t.id + '"' + (on ? ' aria-current="page"' : "") + ">" + svg(t.icon, 20) + "<span>" + t.label + "</span></a>";
    }).join("") + "</nav>";
    var acts = '<div class="app-actions">' +
      (INFO.tool ? '<button type="button" class="app-icon-btn app-save" id="appSave"></button>' : "") +
      '<button type="button" class="app-icon-btn app-theme" id="appTheme"></button>' +
      '<a class="app-icon-btn app-account" href="profile" aria-label="Profile and settings" title="Profile and settings"' + (SLUG === "profile" ? ' aria-current="page"' : "") + ">" + svg("person", 22) + "</a></div>";
    bar.innerHTML = '<div class="app-topbar__inner">' + left + title + nav + acts + "</div>";
    var skip = document.querySelector(".skip-link");
    if (skip && skip.parentNode === document.body) document.body.insertBefore(bar, skip.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);

    var back = bar.querySelector(".app-back");
    if (back) back.addEventListener("click", function (e) {
      if (sameOriginReferrer() && history.length > 1) { e.preventDefault(); history.back(); }
    });
    /* Colour-blind toggle: move the existing button into the bar so it keeps working */
    var cb = $("colour-blind-toggle");
    var actions = bar.querySelector(".app-actions");
    if (cb) actions.insertBefore(cb, actions.firstChild);

    var tb = $("appTheme");
    themeBtnPaint(tb);
    tb.addEventListener("click", function () {
      var next = (window.PhysioScheme && window.PhysioScheme.current() === "dark") ? "light" : "dark";
      setScheme(next);
    });
    window.addEventListener("schemechange", function () { themeBtnPaint(tb); });

    var sb = $("appSave");
    if (sb) {
      var paint = function () {
        var on = isSaved(SLUG);
        sb.setAttribute("aria-pressed", on ? "true" : "false");
        sb.setAttribute("aria-label", "Save this tool");
        sb.title = on ? "Saved: tap to remove from your list" : "Save this tool to your list";
        sb.innerHTML = svg("star", 22);
      };
      paint();
      sb.addEventListener("click", function () { toggleSaved(SLUG); paint(); });
      if (S) S.subscribe("tools.saved", paint);
    }
  }
  function setScheme(p) {
    if (S) S.set("prefs.theme", p);
    if (window.PhysioScheme) window.PhysioScheme.set(p);
  }

  /* ---------- Frame: phone tab bar ---------- */
  function buildTabBar() {
    var nav = document.createElement("nav");
    nav.className = "app-tabbar";
    nav.setAttribute("aria-label", "Main sections");
    nav.innerHTML = TABS.map(function (t) {
      var on = t.id === INFO.section;
      return '<a class="app-tab" href="' + t.href + '" data-tab="' + t.id + '"' + (on ? ' aria-current="page"' : "") + ">" +
        svg(t.icon, 24) + '<span class="app-tab-label">' + t.label + "</span></a>";
    }).join("");
    document.body.appendChild(nav);
  }

  /* ---------- Home dashboard ---------- */
  function greeting(now) {
    var h = new Date(now || Date.now()).getHours();
    return h < 5 ? "Working late?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }
  function todayCard(extra) {
    var c = todaysCase();
    if (!c) return "";
    var best = window.PhysioProgress && window.PhysioProgress.best(c.id);
    var doneToday = window.PhysioProgress && window.PhysioProgress.attempts().some(function (r) { return r.id === c.id && dayKey(r.at) === dayKey(Date.now()); });
    return '<a class="ds-card ds-card--hero' + (extra ? " " + extra : "") + '" href="Resus_Scenarios#case=' + encodeURIComponent(c.id) + '" id="appTodayCase" data-case="' + esc(c.id) + '">' +
      '<span class="ds-kicker">' + svg("calendar", 16) + " Today's case</span>" +
      '<span class="ds-card--row" style="display:flex;gap:12px;align-items:center">' +
      '<span class="ds-card__icon">' + svg("resus", 24) + "</span>" +
      '<span class="ds-card__body"><span class="ds-card__title">' + esc(c.title) + "</span>" +
      '<span class="ds-card__desc">' + esc(c.group) + " &middot; case " + c.n + " of " + cases().length + "</span></span>" +
      '<span class="ds-card__go">' + svg("arrow", 20) + "</span></span>" +
      '<span class="ds-card__meta">' + (doneToday ? svg("check", 14) + " Done today. " : "") + (best ? "Your best: " + best.pct + "%" : "Not tried yet") + "</span></a>";
  }
  function statsStrip() {
    var st = stats();
    return '<div class="ds-stats" role="list">' +
      '<div class="ds-stat" role="listitem"><span class="ds-stat__val">' + st.completed + '<span class="ds-small"> / ' + cases().length + '</span></span><span class="ds-stat__lab">' + svg("check", 14) + " Cases completed</span></div>" +
      '<div class="ds-stat" role="listitem"><span class="ds-stat__val">' + st.attempts + '</span><span class="ds-stat__lab">' + svg("resus", 14) + " Attempts</span></div>" +
      '<div class="ds-stat" role="listitem"><span class="ds-stat__val">' + st.streak + '</span><span class="ds-stat__lab">' + svg("flame", 14) + " Day streak</span></div></div>";
  }
  function buildHome() {
    var host = $("appHome");
    if (!host) return;
    var last = recent()[0];
    var st = stats();
    var html = '<div class="app-hello"><p class="ds-kicker">The Physio Lab</p><h1 class="ds-h1" id="appGreeting">' + greeting() + "</h1>" +
      '<p class="ds-lede">Interactive physiology for anaesthesia: learn it, practise it, then run the resus cases.</p></div>' +
      '<div class="app-dash">' +
        '<section aria-labelledby="appContinueH"><h2 class="ds-kicker" id="appContinueH">' + (last ? "Pick up where you left off" : "Start here") + "</h2>" +
          toolCard(last ? last.slug : "ECG_Basics", "ds-card--strong app-continue") + "</section>" +
        '<section aria-labelledby="appTodayH"><h2 class="ds-kicker visually-hidden" id="appTodayH">Today\'s case</h2>' + todayCard() + "</section>" +
        '<section class="app-dash-wide" aria-labelledby="appProgH"><div class="ds-section-head"><h2 class="ds-h3" id="appProgH">Your progress</h2><a class="ds-link" href="progress">See all</a></div>' +
          statsStrip() +
          (st.last ? '<p class="ds-small" style="margin:8px 0 0">Last case: ' + esc(st.last.title) + ", " + st.last.pct + "% (" + fmtDate(st.last.at) + ")</p>" : '<p class="ds-small" style="margin:8px 0 0">Finish a Resus case and your score is saved here, on this device.</p>') +
        "</section>" +
        '<section class="app-dash-wide" aria-labelledby="appQuickH"><h2 class="ds-h3" id="appQuickH">Quick links</h2><div class="app-quick">' +
          '<a href="learn">' + svg("learn", 24) + 'Learn<span class="ds-small">ECG and heart tools</span></a>' +
          '<a href="practise">' + svg("target", 24) + 'Practise<span class="ds-small">Rhythm quiz and drills</span></a>' +
          '<a href="Resus_Scenarios">' + svg("resus", 24) + "Resus<span class=\"ds-small\">" + cases().length + " cases</span></a>" +
          '<a href="Resus_Scenarios#random">' + svg("dice", 24) + 'Random case<span class="ds-small">Name revealed at the end</span></a>' +
        "</div></section>" +
        '<section class="app-dash-wide" aria-labelledby="appToolsH"><h2 class="ds-h3" id="appToolsH">Jump to a tool</h2><p class="ds-small app-swipe-hint">Swipe sideways for more.</p>' +
          '<ul class="app-swipe" role="list">' + QUICK.map(function (s) { return "<li>" + toolCard(s) + "</li>"; }).join("") + "</ul></section>" +
      "</div>";
    host.innerHTML = html;
  }

  /* ---------- Learn and Saved lists ---------- */
  function buildSavedLists() {
    var favHost = $("appSavedList"), recHost = $("appRecentList");
    if (!favHost && !recHost) return;
    function paint() {
      var fav = saved();
      if (favHost) {
        favHost.innerHTML = fav.length
          ? '<ul class="ds-grid ds-grid--2" role="list" style="list-style:none;margin:0;padding:0">' + fav.map(function (s) {
              return '<li style="display:flex;gap:8px;min-width:0">' + toolCard(s) +
                '<button type="button" class="ds-btn app-remove" data-remove="' + esc(s) + '" aria-label="Remove ' + esc(PAGES[s].title) + ' from saved">' + svg("cross", 18) + "<span>Remove</span></button></li>";
            }).join("") + "</ul>"
          : '<p class="app-empty">Nothing saved yet. On any tool, tap the star at the top to add it here.</p>';
      }
      var rec = recent();
      if (recHost) {
        recHost.innerHTML = rec.length
          ? '<ul class="ds-grid ds-grid--2" role="list" style="list-style:none;margin:0;padding:0">' + rec.slice(0, recHost.hasAttribute("data-max") ? Number(recHost.getAttribute("data-max")) : 8).map(function (r) { return "<li>" + toolCard(r.slug) + "</li>"; }).join("") + "</ul>"
          : '<p class="app-empty">Tools you open will appear here.</p>';
      }
      var clr = $("appClearRecent");
      if (clr) clr.hidden = !rec.length;
    }
    paint();
    if (S) { S.subscribe("tools.saved", paint); S.subscribe("tools.recent", paint); }
    document.addEventListener("click", function (e) {
      var rm = e.target.closest && e.target.closest("[data-remove]");
      if (rm) { toggleSaved(rm.getAttribute("data-remove")); var h = $("appSavedTitle"); if (h) h.focus(); }
      if (e.target.closest && e.target.closest("#appClearRecent")) set("tools.recent", []);
    });
  }

  /* ---------- Practise ---------- */
  function buildPractise() {
    var host = $("appPractiseToday");
    if (host) host.innerHTML = todayCard();
  }

  /* ---------- Progress ---------- */
  function buildProgress() {
    var sHost = $("appProgStats"), bHost = $("appProgBest"), hHost = $("appProgHistory");
    if (!sHost && !bHost && !hHost) return;
    function paint() {
      var P = window.PhysioProgress;
      var list = P ? P.attempts().slice().reverse() : [];
      var bests = P ? P.bests() : {};
      var st = stats();
      if (sHost) {
        var total = cases().length || 28;
        var pct = Math.round(st.completed / total * 100);
        sHost.innerHTML = statsStrip() +
          '<div style="margin-top:12px"><div class="ds-section-head" style="margin:0 0 6px"><span class="ds-small" id="appProgMeterLab"><strong>' + st.completed + " of " + total + "</strong> cases completed at least once</span><span class=\"ds-small\">" + pct + "%</span></div>" +
          '<div class="ds-meter" role="progressbar" aria-labelledby="appProgMeterLab" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + st.completed + '"><span style="width:' + pct + '%"></span></div></div>' +
          '<p class="ds-small" style="margin:10px 0 0">' + svg("calendar", 14) + " Active on " + st.days + " day" + (st.days === 1 ? "" : "s") + ". Tried " + st.tried + " different case" + (st.tried === 1 ? "" : "s") + ".</p>";
      }
      if (bHost) {
        var groups = {};
        cases().forEach(function (c) { (groups[c.group] = groups[c.group] || []).push(c); });
        bHost.innerHTML = Object.keys(groups).map(function (g) {
          return '<h3 class="ds-kicker" style="margin:16px 0 6px">' + esc(g) + '</h3><ul class="ds-list" role="list">' + groups[g].map(function (c) {
            var b = bests[c.id];
            var done = list.some(function (r) { return r.id === c.id && r.completed; });
            return '<li><a class="ds-row" href="Resus_Scenarios#case=' + encodeURIComponent(c.id) + '" data-case="' + esc(c.id) + '">' +
              '<span class="ds-row__icon" aria-hidden="true">' + svg(done ? "check" : b ? "clock" : "resus", 20) + "</span>" +
              '<span class="ds-row__body"><span class="ds-row__title">' + c.n + ". " + esc(c.title) + "</span>" +
              '<span class="ds-row__sub">' + (b ? (done ? "Completed" : "Tried, not completed yet") + ". Best " + fmtPts(b.pts) + " of " + fmtPts(b.of) : "Not tried yet") + "</span></span>" +
              '<span class="ds-row__end">' + (b ? '<span class="app-best">' + b.pct + '%<span class="visually-hidden"> best score</span></span>' : '<span class="ds-small">Start</span>') + svg("arrow", 18) + "</span></a></li>";
          }).join("") + "</ul>";
        }).join("");
      }
      if (hHost) {
        hHost.innerHTML = list.length
          ? '<ul class="ds-list" role="list" id="appHistoryList">' + list.slice(0, 50).map(function (r) {
              var o = outcomeOf(r);
              return '<li class="ds-row app-attempt" data-case="' + esc(r.id) + '"><span class="ds-row__body"><span class="ds-row__title">' + esc(r.title || r.id) + "</span>" +
                '<span class="ds-row__sub">' + fmtDate(r.at) + " &middot; sim time " + fmtClock(r.simSec) + (r.random ? " &middot; random" : "") + (r.challenge ? " &middot; challenge" : "") + (r.solution ? " &middot; solution on" : "") + "</span>" +
                '<span style="margin-top:4px">' + tag(o) + "</span></span>" +
                '<span class="ds-row__end"><span class="app-score">' + fmtPts(r.pts) + " / " + fmtPts(r.of) + '<span class="ds-small" style="display:block;text-align:right">' + r.pct + "%</span></span></span></li>";
            }).join("") + "</ul>" + (list.length > 50 ? '<p class="ds-small">Showing your latest 50 of ' + list.length + " attempts.</p>" : "")
          : '<p class="app-empty">No attempts yet. Finish or end a Resus case and it shows up here with the score and time.</p>';
        var clr = $("appClearHistory");
        if (clr) clr.hidden = !list.length;
      }
    }
    paint();
    if (S) S.subscribe("resus.attempts", paint);
    var clr = $("appClearHistory");
    if (clr) clr.addEventListener("click", function () {
      if (window.confirm("Clear your Resus history on this device? This cannot be undone.")) { if (window.PhysioProgress) window.PhysioProgress.clear(); }
    });
  }

  /* ---------- Profile ---------- */
  function buildProfile() {
    var seg = $("appThemeSeg");
    if (seg) {
      var pref = window.PhysioScheme ? window.PhysioScheme.pref() : "system";
      Array.prototype.forEach.call(seg.querySelectorAll("input[name=appTheme]"), function (r) {
        r.checked = r.value === pref;
        r.addEventListener("change", function () { if (r.checked) setScheme(r.value); });
      });
      window.addEventListener("schemechange", function () {
        var p = window.PhysioScheme.pref();
        Array.prototype.forEach.call(seg.querySelectorAll("input[name=appTheme]"), function (r) { r.checked = r.value === p; });
      });
    }
    var cbs = $("appCbSwitch");
    if (cbs) {
      var paint = function () {
        var on = !!(window.PhysioTheme && window.PhysioTheme.isColourBlind());
        cbs.setAttribute("aria-checked", on ? "true" : "false");
        var st = cbs.querySelector(".ds-switch__state");
        if (st) st.textContent = on ? "On" : "Off";
      };
      paint();
      cbs.addEventListener("click", function () {
        if (window.PhysioTheme && window.PhysioTheme.setColourBlind) window.PhysioTheme.setColourBlind(!window.PhysioTheme.isColourBlind());
      });
      window.addEventListener("themechange", paint);
    }
    var clr = $("appClearData");
    if (clr) clr.addEventListener("click", function () {
      if (!window.confirm("Clear everything this site has saved on this device: progress, saved tools, recent tools and settings?")) return;
      if (S) S.clearAll();
      if (window.PhysioTheme && window.PhysioTheme.setColourBlind) window.PhysioTheme.setColourBlind(false);
      try { localStorage.removeItem("anaesthetic-physiology-colour-blind"); } catch (e) {}
      if (window.PhysioScheme) window.PhysioScheme.apply();
      var msg = $("appClearMsg");
      if (msg) { msg.hidden = false; msg.textContent = "Cleared. This device now has no saved progress or settings."; }
      window.dispatchEvent(new CustomEvent("schemechange"));
    });
    var store = $("appStoreInfo");
    if (store && S) {
      var paintInfo = function () {
        var n = window.PhysioProgress ? window.PhysioProgress.attempts().length : 0;
        store.textContent = n + " Resus attempt" + (n === 1 ? "" : "s") + ", " + saved().length + " saved tool" + (saved().length === 1 ? "" : "s") + " on this device.";
      };
      paintInfo();
      S.subscribe("*", paintInfo);
    }
  }

  /* ---------- Resus Scenarios ---------- */
  var TINY = { "Circulation and defib": "Circ" };
  var SHORT = { "Monitoring": "Monitor", "Airway and breathing": "Airway", "Circulation and defib": "Circulation", "Drugs": "Drugs", "Checks": "Checks" };
  function buildResusDock() {
    var host = $("scnActions");
    var card = host && host.closest(".scn-actions-card");
    if (!card) return;
    card.classList.add("pl-dock");
    card.id = card.id || "plActionsDock";

    var tabs = document.createElement("div");
    tabs.className = "pl-act-tabs";
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "More actions");
    card.appendChild(tabs);

    var close = document.createElement("button");
    close.type = "button";
    close.className = "pl-sheet-close";
    close.innerHTML = '<span aria-hidden="true">&times;</span><span class="pl-sheet-close-label">Close</span>';
    close.setAttribute("aria-label", "Close actions");
    var head = card.querySelector(".scn-actions-head");
    if (head) head.appendChild(close);

    var backdrop = document.createElement("div");
    backdrop.className = "pl-sheet-backdrop";
    backdrop.hidden = true;
    card.parentNode.insertBefore(backdrop, card);

    var active = "", lastChip = null;
    function groups() { return Array.prototype.slice.call(host.querySelectorAll(".act-group")); }
    function nameOf(g) { var h = g.querySelector(".scen-group-label"); return h ? h.textContent.trim() : ""; }
    function mark() { groups().forEach(function (g) { g.classList.toggle("pl-on", !!active && nameOf(g) === active); }); }
    function paintTabs() {
      var names = groups().map(nameOf).filter(Boolean);
      var sig = names.join("|");
      if (tabs.getAttribute("data-sig") !== sig) {
        tabs.setAttribute("data-sig", sig);
        tabs.innerHTML = names.map(function (n) {
          var one = (groups().filter(function (x) { return nameOf(x) === n; })[0] || host).querySelectorAll(".act-btn").length === 1;
          return '<button type="button" class="pl-act-tab" data-group="' + esc(n) + '"' + (one ? ' aria-haspopup="dialog"' : ' aria-expanded="false"') + ' aria-label="' + esc(n) + (one ? "" : " actions") + '">' + (TINY[n] ? '<span class="pl-chip-long">' + esc(SHORT[n] || n) + '</span><span class="pl-chip-short" aria-hidden="true">' + esc(TINY[n]) + "</span>" : esc(SHORT[n] || n)) + "</button>";
        }).join("");
      }
      Array.prototype.forEach.call(tabs.querySelectorAll(".pl-act-tab"), function (b) {
        var on = b.getAttribute("data-group") === active;
        if (b.hasAttribute("aria-expanded")) b.setAttribute("aria-expanded", on ? "true" : "false");
        b.classList.toggle("is-on", on);
      });
    }
    function open(name, chip) {
      active = name; lastChip = chip || lastChip;
      card.classList.add("pl-sheet-open");
      document.body.classList.add("pl-sheet-is-open");
      backdrop.hidden = false;
      mark(); paintTabs();
      var label = card.querySelector(".explain-title");
      if (label) label.textContent = name;
      var first = host.querySelector(".act-group.pl-on .act-btn:not(:disabled)") || host.querySelector(".act-group.pl-on .act-btn");
      if (first) first.focus({ preventScroll: true });
    }
    function shut(returnFocus) {
      if (!active) return;
      active = "";
      card.classList.remove("pl-sheet-open");
      document.body.classList.remove("pl-sheet-is-open");
      backdrop.hidden = true;
      var label = card.querySelector(".explain-title");
      if (label) label.textContent = "What do you do next?";
      mark(); paintTabs();
      if (returnFocus && lastChip && document.body.contains(lastChip)) lastChip.focus({ preventScroll: true });
    }
    tabs.addEventListener("click", function (e) {
      var b = e.target.closest(".pl-act-tab");
      if (!b) return;
      var name = b.getAttribute("data-group");
      if (active === name) { shut(true); return; }
      var g = groups().filter(function (x) { return nameOf(x) === name; })[0];
      var btns = g ? g.querySelectorAll(".act-btn") : [];
      if (btns.length === 1) { shut(false); btns[0].click(); return; }
      open(name, b);
    });
    close.addEventListener("click", function () { shut(true); });
    backdrop.addEventListener("click", function () { shut(true); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && active && !document.body.classList.contains("scn-popup-open")) shut(true);
    });
    host.addEventListener("click", function (e) {
      var b = e.target.closest(".act-group .act-btn");
      if (b && active && isPhone()) setTimeout(function () { shut(false); }, 0);
    });
    new MutationObserver(function () { mark(); paintTabs(); }).observe(host, { childList: true });
    paintTabs();

    function measure() {
      var h = isPhone() && document.body.classList.contains("scn-case-running") && !card.classList.contains("pl-sheet-open") ? card.getBoundingClientRect().height : null;
      if (h) document.documentElement.style.setProperty("--pl-dock-h", Math.ceil(h) + "px");
    }
    if (window.ResizeObserver) new ResizeObserver(measure).observe(card);
    var wasRunning = document.body.classList.contains("scn-case-running");
    new MutationObserver(function () {
      var running = document.body.classList.contains("scn-case-running");
      if (!running) shut(false);
      if (running && !wasRunning && isPhone()) {
        var t = document.querySelector(".scn-card-main");
        if (t) requestAnimationFrame(function () { t.scrollIntoView({ block: "start", behavior: "auto" }); });
      }
      wasRunning = running;
      measure();
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    if (phoneMq && phoneMq.addEventListener) phoneMq.addEventListener("change", function () { if (!isPhone()) shut(false); measure(); });
    measure();
  }

  /* Case menu: on phones Show solution, Restart, End scenario and All
     scenarios move into a bottom sheet opened by one "Case" button, so the
     monitor gets the room. The buttons themselves are moved, not copied, so
     every existing handler keeps working; on wide screens they stay inline. */
  function buildCaseMenu() {
    var tools = document.querySelector("#scnStage .strip-tools");
    var headEl = tools && tools.parentNode;
    if (!tools) return;
    var home = document.createComment("strip-tools home");
    headEl.insertBefore(home, tools);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ds-btn app-case-btn";
    btn.id = "appCaseBtn";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "appCaseSheet");
    btn.innerHTML = svg("menu", 20) + '<span>Case</span><span class="ds-tag ds-tag--blue app-case-sol" hidden>' + svg("eye", 14) + "Solution on</span>";
    headEl.appendChild(btn);

    var backdrop = document.createElement("div");
    backdrop.className = "ds-sheet-backdrop app-case-backdrop";
    backdrop.hidden = true;
    var sheet = document.createElement("div");
    sheet.className = "ds-sheet app-case-sheet";
    sheet.id = "appCaseSheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "appCaseSheetTitle");
    sheet.hidden = true;
    sheet.innerHTML = '<div class="ds-sheet-grip" aria-hidden="true"></div><div class="ds-sheet-head"><h2 class="ds-sheet-title" id="appCaseSheetTitle">Case</h2>' +
      '<button type="button" class="ds-btn ds-btn--quiet app-case-close" aria-label="Close case menu">' + svg("cross", 20) + "<span>Close</span></button></div>" +
      '<div class="app-case-slot"></div><a class="ds-btn app-case-history" href="progress#history">' + svg("chart", 20) + "<span>Your results and history</span></a>";
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    var slot = sheet.querySelector(".app-case-slot");

    function paintSol() {
      var h = $("scnHints");
      var on = h && h.getAttribute("aria-checked") === "true";
      btn.querySelector(".app-case-sol").hidden = !on;
    }
    var hb = $("scnHints");
    if (hb) new MutationObserver(paintSol).observe(hb, { attributes: true, attributeFilter: ["aria-checked"] });
    paintSol();

    function openSheet() {
      slot.appendChild(tools);
      sheet.hidden = false; backdrop.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      document.body.classList.add("app-case-open");
      var f = tools.querySelector("button");
      if (f) f.focus({ preventScroll: true });
    }
    function closeSheet(focusBack) {
      if (sheet.hidden) return;
      headEl.insertBefore(tools, home.nextSibling);
      sheet.hidden = true; backdrop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("app-case-open");
      if (focusBack && document.body.classList.contains("scn-case-running")) btn.focus({ preventScroll: true });
    }
    btn.addEventListener("click", openSheet);
    backdrop.addEventListener("click", function () { closeSheet(true); });
    sheet.querySelector(".app-case-close").addEventListener("click", function () { closeSheet(true); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !sheet.hidden) { e.preventDefault(); closeSheet(true); }
      if (e.key === "Tab" && !sheet.hidden) {
        var f = Array.prototype.slice.call(sheet.querySelectorAll("button, a[href]")).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    /* Restart, End and All scenarios close the menu; Show solution keeps it open so the new state shows */
    tools.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b && b.id !== "scnHints" && !sheet.hidden) setTimeout(function () { closeSheet(false); }, 0);
    });
    if (phoneMq && phoneMq.addEventListener) phoneMq.addEventListener("change", function () { if (!isPhone()) closeSheet(false); });
    new MutationObserver(function () { if (!document.body.classList.contains("scn-case-running")) closeSheet(false); })
      .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  function resusDeepLink() {
    var h = (location.hash || "").replace(/^#/, "");
    if (!h) return;
    var m = /^case=([\w-]+)$/.exec(h);
    var tries = 0;
    (function go() {
      var target = m ? document.querySelector('#scnGrid .scn-card[data-id="' + m[1] + '"]') : h === "random" ? $("scnRandom") : h === "challenge" ? $("scnChallenge") : null;
      if (!target) { if (++tries < 40 && (m || h === "random" || h === "challenge")) setTimeout(go, 50); return; }
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      target.click();
    })();
  }

  function resusResults() {
    /* A link to your results above the case list */
    var title = $("scnChooserTitle");
    if (title && !$("appResultsLink")) {
      var a = document.createElement("a");
      a.className = "ds-link app-results-link";
      a.id = "appResultsLink";
      a.href = "progress#history";
      a.innerHTML = svg("chart", 18) + "<span>&nbsp;Your results and history</span>";
      title.parentNode.insertBefore(a, title.nextSibling);
    }
    var deb = $("scnDebrief"), saved = false;
    function addNote() {
      if (!saved || !deb || deb.querySelector(".app-saved-note") || !deb.childNodes.length) return;
      var note = document.createElement("p");
      note.className = "app-saved-note";
      note.innerHTML = svg("check", 16) + ' Saved to your progress on this device. <a href="progress#history">See your history</a>';
      deb.appendChild(note);
    }
    window.addEventListener("physio:resus-result", function (e) {
      var rec = window.PhysioProgress ? window.PhysioProgress.record(e.detail || {}) : null;
      saved = !!rec;
      /* the debrief HTML is written just after the event */
      setTimeout(addNote, 0);
    });
    /* keep the note when the debrief is drawn again; forget it when a new case starts */
    if (deb) new MutationObserver(addNote).observe(deb, { childList: true });
    var wasRunning = document.body.classList.contains("scn-case-running");
    new MutationObserver(function () {
      var running = document.body.classList.contains("scn-case-running");
      if (running && !wasRunning) saved = false;
      wasRunning = running;
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  /* ---------- Boot ---------- */

  /* On phones, start with About these cases closed so the list comes first.
     Desktop keeps it open (the summary is hidden) so the 1024x553 first-screen test still fits. */
  function buildResusAbout() {
    var about = $("scnAbout");
    if (!about) return;
    function sync() {
      if (isPhone()) about.open = false;
      else about.open = true;
    }
    sync();
    if (phoneMq && phoneMq.addEventListener) phoneMq.addEventListener("change", sync);
    /* Desktop: do not collapse the about block, it is the page intro. */
    about.addEventListener("toggle", function () {
      if (!isPhone() && !about.open) about.open = true;
    });
  }

  /* CAP, PV and Murmurs on phones: keep the graph full width and move the
     scenario / try-this panels into a Controls bottom sheet. The nodes are
     moved, not copied, so every existing handler keeps working. */
  function buildToolControlsSheet() {
    var controls = document.querySelector(".tool-controls");
    if (!controls || $("scnStage")) return;
    var home = document.createComment("tool-controls home");
    if (controls.parentNode) controls.parentNode.insertBefore(home, controls);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ds-btn ds-btn--primary app-ctrl-btn";
    btn.id = "appCtrlBtn";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "appCtrlSheet");
    btn.innerHTML = svg("menu", 20) + "<span>Controls</span>";
    if (home.parentNode) home.parentNode.insertBefore(btn, home);

    var backdrop = document.createElement("div");
    backdrop.className = "ds-sheet-backdrop app-ctrl-backdrop";
    backdrop.hidden = true;
    var sheet = document.createElement("div");
    sheet.className = "ds-sheet app-ctrl-sheet";
    sheet.id = "appCtrlSheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "appCtrlSheetTitle");
    sheet.hidden = true;
    sheet.innerHTML = '<div class="ds-sheet-grip" aria-hidden="true"></div><div class="ds-sheet-head"><h2 class="ds-sheet-title" id="appCtrlSheetTitle">Controls</h2>' +
      '<button type="button" class="ds-btn ds-btn--quiet app-ctrl-close" aria-label="Close controls">' + svg("cross", 20) + "<span>Close</span></button></div>" +
      '<div class="app-ctrl-slot"></div>';
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    var slot = sheet.querySelector(".app-ctrl-slot");

    function openSheet() {
      slot.appendChild(controls);
      sheet.hidden = false; backdrop.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      document.body.classList.add("app-ctrl-open");
      var f = controls.querySelector("button, select, input, [tabindex]");
      if (f) f.focus({ preventScroll: true });
    }
    function closeSheet(focusBack) {
      if (sheet.hidden) return;
      if (home.parentNode) home.parentNode.insertBefore(controls, home.nextSibling);
      sheet.hidden = true; backdrop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("app-ctrl-open");
      if (focusBack) btn.focus({ preventScroll: true });
    }
    btn.addEventListener("click", function () { if (sheet.hidden) openSheet(); else closeSheet(false); });
    backdrop.addEventListener("click", function () { closeSheet(true); });
    sheet.querySelector(".app-ctrl-close").addEventListener("click", function () { closeSheet(true); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !sheet.hidden) { e.preventDefault(); closeSheet(true); }
    });
    if (phoneMq && phoneMq.addEventListener) phoneMq.addEventListener("change", function () { if (!isPhone()) closeSheet(false); });
  }

  function init() {
    document.documentElement.classList.add("app-frame");
    remember();
    buildTopBar();
    buildTabBar();
    buildHome();
    buildSavedLists();
    buildPractise();
    buildProgress();
    buildProfile();
    buildResusAbout();
    buildToolControlsSheet();
    if (SLUG === "Resus_Scenarios" || $("scnStage")) {
      buildResusDock();
      buildCaseMenu();
      resusResults();
      resusDeepLink();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.PhysioApp = { pages: PAGES, tabs: TABS, recent: recent, saved: saved, isPhone: isPhone, todaysCase: todaysCase, slug: SLUG, version: 2 };
})();
