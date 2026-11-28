/* The Physio Lab: applies the light or dark theme before the first paint.
   Loaded without defer at the top of <head>. The choice ("light", "dark" or
   "system") is kept by the store under prefs.theme; "system" follows
   prefers-color-scheme and updates live when the phone switches. */
(function () {
  "use strict";
  var KEY = "physiolab:v1:prefs.theme";
  var root = document.documentElement;
  function pref() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); return v === "light" || v === "dark" ? v : "system"; } catch (e) { return "system"; }
  }
  var mq = null;
  try { mq = window.matchMedia("(prefers-color-scheme: dark)"); } catch (e) {}
  function apply() {
    var p = pref();
    var scheme = p === "system" ? (mq && mq.matches ? "dark" : "light") : p;
    root.setAttribute("data-scheme", scheme);
    root.setAttribute("data-scheme-pref", p);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", scheme === "dark" ? "#0E1116" : "#184A63");
    return scheme;
  }
  apply();
  if (mq) {
    var onChange = function () { if (pref() === "system") { apply(); try { window.dispatchEvent(new CustomEvent("schemechange")); } catch (e) {} } };
    if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  window.PhysioScheme = {
    pref: pref,
    current: function () { return root.getAttribute("data-scheme") || "light"; },
    set: function (p) {
      try { localStorage.setItem(KEY, JSON.stringify(p === "light" || p === "dark" ? p : "system")); } catch (e) {}
      var s = apply();
      try { window.dispatchEvent(new CustomEvent("schemechange", { detail: { scheme: s, pref: pref() } })); } catch (e) {}
      return s;
    },
    apply: apply
  };
})();
