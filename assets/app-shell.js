/* The Physio Lab: phone app shell.
   On small screens (720 px wide or less) this adds a fixed bottom tab bar
   (Home, ECG, Heart, Resus, Saved), a back button on tool pages, a Save
   button for favourites, and remembers recently used tools in localStorage.
   On Resus Scenarios it docks the main actions above the tab bar and opens
   the other action groups in a slide-up sheet. Desktop layout is unchanged:
   everything added here is hidden above 720 px by assets/app-shell.css. */
(function () {
  "use strict";

  var RECENT_KEY = "physiolab-recent";
  var SAVED_KEY = "physiolab-saved";
  var PHONE = "(max-width: 720px)";

  /* tab: which bottom tab is current on that page. hub: where Back goes when
     there is no in-site history to go back to. */
  var PAGES = {
    "": { title: "Home", tab: "home" },
    "cardiac": { title: "Cardiac", tab: "heart", hub: "./" },
    "respiratory": { title: "Respiratory", tab: "home", hub: "./" },
    "privacy": { title: "Privacy notice", tab: "home", hub: "./" },
    "saved": { title: "Saved", tab: "saved", hub: "./" },
    "ECG_Basics": { title: "ECG Basics", desc: "Waves, intervals and rate", tab: "ecg", hub: "cardiac", tool: 1 },
    "ECG_Conduction": { title: "ECG Conduction", desc: "How the heart's wiring draws each wave", tab: "ecg", hub: "cardiac", tool: 1 },
    "ECG_3D": { title: "ECG in 3D", desc: "A heart in 3D drawing all 12 leads", tab: "ecg", hub: "cardiac", tool: 1 },
    "ECG_Rhythm_Quiz": { title: "ECG Rhythms", desc: "Rhythms on the strip", tab: "ecg", hub: "cardiac", tool: 1 },
    "Cardiac_Action_Potential": { title: "Cardiac Action Potential", desc: "Ionic foundations", tab: "heart", hub: "cardiac", tool: 1 },
    "PV_Loop": { title: "Pressure-Volume Loop", desc: "The cardiac cycle", tab: "heart", hub: "cardiac", tool: 1 },
    "Cardiac_Murmurs": { title: "Cardiac Murmurs", desc: "Sounds and haemodynamics", tab: "heart", hub: "cardiac", tool: 1 },
    "Resus_Scenarios": { title: "Resus Scenarios", desc: "Arrest and peri-arrest cases", tab: "resus", hub: "./", tool: 1 },
    "Arterial_Waveform": { title: "Arterial Waveform", tab: "heart", hub: "cardiac" },
    "HF_Notes": { title: "Heart failure notes", tab: "heart", hub: "cardiac" },
    "MI_Timeline": { title: "MI timeline", tab: "heart", hub: "cardiac" }
  };
  /* Order of the swipe row on the home screen. */
  var QUICK = ["Resus_Scenarios", "ECG_Basics", "ECG_Rhythm_Quiz", "ECG_3D", "ECG_Conduction", "Cardiac_Action_Potential", "PV_Loop", "Cardiac_Murmurs"];

  var ICON = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h5v-5h3v5h5V10"/>',
    ecg: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M5 12h3l1.5-3.5 2.5 7 2-3.5H19"/>',
    heart: '<path d="M12 20S4 14.8 2.6 10.4C1.5 7.2 3.5 4 7 4c2 0 3.4 1.1 5 3.1C13.6 5.1 15 4 17 4c3.5 0 5.5 3.2 4.4 6.4C20 14.8 12 20 12 20z"/>',
    resus: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M5.5 11h3l1.5-3 2 6 1.5-4 1 1h4"/><path d="M9 20.5h6M12 16.5v4"/>',
    saved: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    arrow: '<path d="M4 12h14M13 6.5l5.5 5.5-5.5 5.5"/>'
  };
  function svg(name, size) {
    var s = size || 24;
    return '<svg class="pl-ico" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICON[name] + "</svg>";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function slugOf(pathname) {
    var p = (pathname || "").split("?")[0].split("#")[0];
    var last = p.substring(p.lastIndexOf("/") + 1).replace(/\.html$/, "");
    return last === "index" ? "" : last;
  }
  var SLUG = slugOf(location.pathname);
  var INFO = PAGES[SLUG] || { title: document.title, tab: "home", hub: "./" };

  function readList(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function writeList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* private mode */ }
  }
  function recent() {
    return readList(RECENT_KEY).filter(function (r) { return r && PAGES[r.slug] && PAGES[r.slug].tool; });
  }
  function saved() {
    return readList(SAVED_KEY).filter(function (s) { return PAGES[s] && PAGES[s].tool; });
  }
  function isSaved(slug) { return saved().indexOf(slug) !== -1; }
  function toggleSaved(slug) {
    var list = saved();
    var i = list.indexOf(slug);
    if (i === -1) list.unshift(slug); else list.splice(i, 1);
    writeList(SAVED_KEY, list);
    return i === -1;
  }
  function remember() {
    if (!INFO.tool) return;
    var list = recent().filter(function (r) { return r.slug !== SLUG; });
    list.unshift({ slug: SLUG, t: Date.now() });
    writeList(RECENT_KEY, list.slice(0, 8));
  }
  function href(slug) { return slug === "" ? "./" : slug; }

  var phoneMq = null;
  try { phoneMq = window.matchMedia(PHONE); } catch (e) { phoneMq = null; }
  function isPhone() { return !!(phoneMq && phoneMq.matches); }

  /* ---------- Bottom tab bar ---------- */
  var TABS = [
    { id: "home", label: "Home", href: "./" },
    { id: "ecg", label: "ECG", href: "cardiac#tools-ecg" },
    { id: "heart", label: "Heart", href: "cardiac" },
    { id: "resus", label: "Resus", href: "Resus_Scenarios" },
    { id: "saved", label: "Saved", href: "saved" }
  ];
  function buildTabBar() {
    var host = document.querySelector(".page") || document.body;
    var nav = document.createElement("nav");
    nav.className = "pl-tabbar";
    nav.setAttribute("aria-label", "Main sections");
    nav.innerHTML = TABS.map(function (t) {
      var on = t.id === INFO.tab;
      return '<a class="pl-tab' + (on ? " is-current" : "") + '" href="' + t.href + '" data-tab="' + t.id + '"' + (on ? ' aria-current="page"' : "") + ">" +
        svg(t.id, 24) + '<span class="pl-tab-label">' + t.label + "</span></a>";
    }).join("");
    host.appendChild(nav);
    document.documentElement.classList.add("pl-shell");
  }

  /* ---------- Back and Save in the header ---------- */
  function sameOriginReferrer() {
    try { return !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (e) { return false; }
  }
  function buildHeaderBits() {
    var top = document.querySelector(".site-header-top, .tool-header-top");
    if (!top || SLUG === "") return;
    var back = document.createElement("a");
    back.className = "pl-back";
    back.href = INFO.hub || "./";
    var hubName = INFO.hub === "cardiac" ? "Cardiac" : "Home";
    back.setAttribute("aria-label", "Back");
    back.innerHTML = svg("back", 22) + '<span class="pl-back-label">Back</span>';
    back.title = "Back (or " + hubName + ")";
    back.addEventListener("click", function (e) {
      if (sameOriginReferrer() && history.length > 1) {
        e.preventDefault();
        history.back();
      }
    });
    top.insertBefore(back, top.firstChild);

    if (!INFO.tool) return;
    var actions = top.querySelector(".header-actions");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pl-save";
    function paint() {
      var on = isSaved(SLUG);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? "Saved to your list, tap to remove" : "Save this tool to your list");
      btn.innerHTML = svg("star", 20) + '<span class="pl-save-label">' + (on ? "Saved" : "Save") + "</span>";
    }
    paint();
    btn.addEventListener("click", function () { toggleSaved(SLUG); paint(); });
    if (actions) actions.insertBefore(btn, actions.firstChild);
    else { btn.classList.add("pl-save-end"); top.appendChild(btn); }
  }

  /* ---------- Home: continue card and swipe row ---------- */
  function toolCard(slug, cls) {
    var p = PAGES[slug];
    return '<a class="' + cls + '" href="' + href(slug) + '">' +
      '<span class="pl-card-icon">' + svg(p.tab === "resus" ? "resus" : p.tab, 26) + "</span>" +
      '<span class="pl-card-text"><span class="pl-card-title">' + esc(p.title) + "</span>" +
      (p.desc ? '<span class="pl-card-desc">' + esc(p.desc) + "</span>" : "") + "</span>" +
      '<span class="pl-card-go">' + svg("arrow", 20) + "</span></a>";
  }
  function buildHome() {
    var main = document.getElementById("main");
    if (!main || SLUG !== "") return;
    var wrap = document.createElement("section");
    wrap.className = "pl-home";
    wrap.setAttribute("aria-labelledby", "pl-quick-h");
    var last = recent()[0];
    var html = "";
    if (last) {
      html += '<div class="pl-continue"><p class="pl-kicker" id="pl-continue-h">Pick up where you left off</p>' +
        toolCard(last.slug, "pl-card pl-card-wide") + "</div>";
    }
    html += '<h2 class="pl-section-title" id="pl-quick-h">Jump to a tool</h2>' +
      '<p class="pl-swipe-hint">Swipe sideways for more.</p>' +
      '<ul class="pl-quick" role="list">' + QUICK.map(function (s) { return "<li>" + toolCard(s, "pl-card pl-card-quick") + "</li>"; }).join("") + "</ul>";
    wrap.innerHTML = html;
    var intro = main.querySelector(".home-intro");
    if (intro && intro.nextSibling) main.insertBefore(wrap, intro.nextSibling); else main.insertBefore(wrap, main.firstChild);
  }

  /* ---------- Saved page ---------- */
  function buildSavedPage() {
    var favHost = document.getElementById("plSavedList");
    var recHost = document.getElementById("plRecentList");
    if (!favHost && !recHost) return;
    function paint() {
      var fav = saved();
      if (favHost) {
        favHost.innerHTML = fav.length
          ? '<ul class="pl-list" role="list">' + fav.map(function (s) {
              return '<li class="pl-list-row">' + toolCard(s, "pl-card pl-card-wide") +
                '<button type="button" class="pl-remove" data-remove="' + esc(s) + '" aria-label="Remove ' + esc(PAGES[s].title) + ' from saved">Remove</button></li>';
            }).join("") + "</ul>"
          : '<p class="pl-empty">Nothing saved yet. On any tool, tap <strong>Save</strong> at the top to add it here.</p>';
      }
      var rec = recent();
      if (recHost) {
        recHost.innerHTML = rec.length
          ? '<ul class="pl-list" role="list">' + rec.map(function (r) { return '<li class="pl-list-row">' + toolCard(r.slug, "pl-card pl-card-wide") + "</li>"; }).join("") + "</ul>"
          : '<p class="pl-empty">Tools you open will appear here.</p>';
      }
      var clr = document.getElementById("plClearRecent");
      if (clr) clr.hidden = !rec.length;
    }
    paint();
    document.addEventListener("click", function (e) {
      var rm = e.target.closest && e.target.closest("[data-remove]");
      if (rm) { toggleSaved(rm.getAttribute("data-remove")); paint(); var h = document.getElementById("plSavedTitle"); if (h) h.focus(); }
      if (e.target.closest && e.target.closest("#plClearRecent")) { writeList(RECENT_KEY, []); paint(); }
    });
  }

  /* ---------- Resus Scenarios: docked actions and slide-up sheet ---------- */
  var TINY = { "Circulation and defib": "Circ" };
  var SHORT = { "Monitoring": "Monitor", "Airway and breathing": "Airway", "Circulation and defib": "Circulation", "Drugs": "Drugs", "Checks": "Checks" };
  function buildResusDock() {
    var host = document.getElementById("scnActions");
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

    var active = "";
    var lastChip = null;

    function groups() { return Array.prototype.slice.call(host.querySelectorAll(".act-group")); }
    function nameOf(g) { var h = g.querySelector(".scen-group-label"); return h ? h.textContent.trim() : ""; }

    function mark() {
      groups().forEach(function (g) { g.classList.toggle("pl-on", !!active && nameOf(g) === active); });
    }
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
      active = name;
      lastChip = chip || lastChip;
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
      /* A group with one action (Drugs and fluids) opens that action straight away. */
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
    /* An action chosen from the sheet closes it so the monitor and feedback show. */
    host.addEventListener("click", function (e) {
      var b = e.target.closest(".act-group .act-btn");
      if (b && active && isPhone()) setTimeout(function () { shut(false); }, 0);
    });

    new MutationObserver(function () { mark(); paintTabs(); }).observe(host, { childList: true });
    paintTabs();

    /* Keep room at the bottom of the page for the dock. */
    function measure() {
      var h = isPhone() && document.body.classList.contains("scn-case-running") && !card.classList.contains("pl-sheet-open") ? card.getBoundingClientRect().height : null;
      if (h) document.documentElement.style.setProperty("--pl-dock-h", Math.ceil(h) + "px");
    }
    if (window.ResizeObserver) new ResizeObserver(measure).observe(card);
    var wasRunning = document.body.classList.contains("scn-case-running");
    new MutationObserver(function () {
      var running = document.body.classList.contains("scn-case-running");
      if (!running) shut(false);
      /* A case has just started on a phone: bring the case title and monitor to the top. */
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

  function init() {
    remember();
    buildTabBar();
    buildHeaderBits();
    buildHome();
    buildSavedPage();
    buildResusDock();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.PhysioShell = { pages: PAGES, recent: recent, saved: saved, isPhone: isPhone };
})();
