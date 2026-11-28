/* The Physio Lab: storage layer.
   One small API for everything the site remembers: favourites, recently used
   tools, theme, Resus results and history, progress.

     PhysioStore.get(key, fallback)      read a value (JSON)
     PhysioStore.set(key, value)         write a value and notify subscribers
     PhysioStore.update(key, fn, fb)     read, change, write
     PhysioStore.remove(key)
     PhysioStore.subscribe(key, fn)      fn(value, key) on change, here or in another tab;
                                         key "*" hears every change. Returns an unsubscribe.
     PhysioStore.keys()                  every key the store owns
     PhysioStore.clearAll()              forget everything on this device

   Keys are namespaced ("prefs.theme", "tools.recent", "resus.attempts") and
   stored as "physiolab:v1:<key>" with the schema version in "physiolab:schema".

   ADAPTER POINT (accounts later). All reads and writes go through ADAPTER,
   which is localStorage today. To sync with Supabase, call
   PhysioStore.setAdapter({ read, write, remove, list }) with an adapter that
   keeps localStorage as the fast local copy and pushes changes to a
   user_data table keyed by user id and key (see docs/accounts-plan.md).
   Nothing else in the site needs to change. */
(function () {
  "use strict";

  var PREFIX = "physiolab:v1:";
  var SCHEMA_KEY = "physiolab:schema";
  var SCHEMA = 1;
  var subs = {};

  var memory = {};
  function hasLocal() {
    try { var k = "physiolab:probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch (e) { return false; }
  }
  var LOCAL = hasLocal();

  var localAdapter = {
    read: function (k) { try { return LOCAL ? localStorage.getItem(PREFIX + k) : (k in memory ? memory[k] : null); } catch (e) { return null; } },
    write: function (k, raw) { try { if (LOCAL) localStorage.setItem(PREFIX + k, raw); else memory[k] = raw; } catch (e) { memory[k] = raw; } },
    remove: function (k) { try { if (LOCAL) localStorage.removeItem(PREFIX + k); delete memory[k]; } catch (e) { delete memory[k]; } },
    list: function () {
      var out = [];
      try {
        if (LOCAL) { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length)); } }
        else out = Object.keys(memory);
      } catch (e) {}
      return out;
    }
  };
  var ADAPTER = localAdapter;

  function emit(key, value) {
    (subs[key] || []).concat(subs["*"] || []).forEach(function (fn) { try { fn(value, key); } catch (e) {} });
  }
  function get(key, fallback) {
    var raw = ADAPTER.read(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  function set(key, value) {
    ADAPTER.write(key, JSON.stringify(value));
    emit(key, value);
    return value;
  }
  function update(key, fn, fallback) { return set(key, fn(get(key, fallback))); }
  function remove(key) { ADAPTER.remove(key); emit(key, undefined); }
  function subscribe(key, fn) {
    (subs[key] = subs[key] || []).push(fn);
    return function () { subs[key] = (subs[key] || []).filter(function (f) { return f !== fn; }); };
  }
  function keys() { return ADAPTER.list(); }
  function clearAll() {
    keys().forEach(function (k) { ADAPTER.remove(k); emit(k, undefined); });
    /* Older keys from before the store, and the colour-blind setting */
    ["physiolab-recent", "physiolab-saved", "anaesthetic-physiology-colour-blind", "anaesthetic-physiology-scn-guide"].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
  }

  /* Another tab changed something */
  window.addEventListener("storage", function (e) {
    if (!e.key || e.key.indexOf(PREFIX) !== 0) return;
    var k = e.key.slice(PREFIX.length), v;
    try { v = e.newValue == null ? undefined : JSON.parse(e.newValue); } catch (x) { v = undefined; }
    emit(k, v);
  });

  /* Schema version and migration from the phase 1 keys */
  function migrate() {
    var from = 0;
    try { from = LOCAL ? parseInt(localStorage.getItem(SCHEMA_KEY) || "0", 10) || 0 : SCHEMA; } catch (e) {}
    if (from >= SCHEMA) return;
    try {
      var oldRecent = JSON.parse(localStorage.getItem("physiolab-recent") || "null");
      if (Array.isArray(oldRecent) && get("tools.recent") == null) set("tools.recent", oldRecent);
      var oldSaved = JSON.parse(localStorage.getItem("physiolab-saved") || "null");
      if (Array.isArray(oldSaved) && get("tools.saved") == null) set("tools.saved", oldSaved);
      localStorage.removeItem("physiolab-recent");
      localStorage.removeItem("physiolab-saved");
      localStorage.setItem(SCHEMA_KEY, String(SCHEMA));
    } catch (e) {}
  }
  migrate();

  window.PhysioStore = {
    SCHEMA: SCHEMA, PREFIX: PREFIX,
    get: get, set: set, update: update, remove: remove, subscribe: subscribe, keys: keys, clearAll: clearAll,
    setAdapter: function (a) { if (a && a.read && a.write && a.remove && a.list) ADAPTER = a; },
    adapter: function () { return ADAPTER; },
    localAdapter: localAdapter
  };

  /* ---------- Entitlements ----------
     Everything is free for now. isPlus() is false for everyone and every
     feature flag is on. When Plus launches, entitlements come from the
     account (Supabase) through the adapter; features check canUse(name). */
  var FLAGS = {
    "resus.history": true,
    "resus.allCases": true,
    "ecg.allTools": true,
    "progress.sync": false /* needs accounts */
  };
  window.PhysioPlus = {
    isPlus: function () { return get("account.plus", false) === true; },
    canUse: function (feature) { return Object.prototype.hasOwnProperty.call(FLAGS, feature) ? FLAGS[feature] !== false || window.PhysioPlus.isPlus() : true; },
    flags: function () { var o = {}; for (var k in FLAGS) o[k] = FLAGS[k]; return o; },
    /* Plus badge component: not shown anywhere yet. */
    badge: function (label) {
      return '<span class="ds-plus-badge"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.4L8 11.2 4.1 13.4 5 9 1.7 6l4.4-.5z" fill="currentColor"/></svg><span>' + (label || "Plus") + "</span></span>";
    }
  };

  /* ---------- Progress: Resus attempts ---------- */
  var MAX_ATTEMPTS = 500;
  function attempts() { var a = get("resus.attempts", []); return Array.isArray(a) ? a : []; }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  window.PhysioProgress = {
    record: function (a) {
      if (!a || !a.id) return null;
      var rec = {
        id: String(a.id), title: String(a.title || ""), n: a.n || null,
        pts: Number(a.pts) || 0, of: Number(a.of) || 0,
        pct: a.of ? Math.round((Number(a.pts) || 0) / Number(a.of) * 100) : 0,
        simSec: Number(a.simSec) || 0, completed: !!a.completed, outcome: String(a.outcome || ""),
        random: !!a.random, solution: !!a.solution, challenge: !!a.challenge, at: a.at || Date.now()
      };
      update("resus.attempts", function (list) { list = Array.isArray(list) ? list : []; list.push(rec); return list.slice(-MAX_ATTEMPTS); }, []);
      return rec;
    },
    attempts: attempts,
    best: function (id) {
      var b = null;
      attempts().forEach(function (r) { if (r.id === id && (!b || r.pct > b.pct || (r.pct === b.pct && r.pts > b.pts))) b = r; });
      return b;
    },
    bests: function () {
      var m = {};
      attempts().forEach(function (r) { var b = m[r.id]; if (!b || r.pct > b.pct || (r.pct === b.pct && r.pts > b.pts)) m[r.id] = r; });
      return m;
    },
    stats: function (now) {
      var list = attempts(), done = {}, days = {};
      list.forEach(function (r) { if (r.completed) done[r.id] = 1; days[dayKey(r.at)] = 1; });
      var streak = 0, d = new Date(now || Date.now());
      if (!days[dayKey(d.getTime())]) d.setDate(d.getDate() - 1); /* today not played yet: streak still counts up to yesterday */
      while (days[dayKey(d.getTime())]) { streak++; d.setDate(d.getDate() - 1); }
      return { attempts: list.length, completed: Object.keys(done).length, tried: Object.keys(window.PhysioProgress.bests()).length, days: Object.keys(days).length, streak: streak, last: list[list.length - 1] || null };
    },
    clear: function () { remove("resus.attempts"); },
    dayKey: dayKey
  };
})();
