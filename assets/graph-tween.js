/* Shared graph transition helper for The Physio Lab.
   Matches the PV loop: 500 ms quadratic ease-in-out, retrigger from the
   current mid-transition state, and an instant change when the user prefers
   reduced motion. PV_Loop.html keeps its own copy of these rules and does
   not load this file. */
(function (global) {
  "use strict";

  var ANIM_MS = 500;

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function reduced() {
    try {
      if (global.PhysioTheme && typeof PhysioTheme.prefersReducedMotion === "function") {
        return PhysioTheme.prefersReducedMotion();
      }
      return global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (err) {
      return false;
    }
  }

  function lerp(a, b, e) { return a + (b - a) * e; }

  function lerpArray(a, b, e) {
    var n = Math.max(a && a.length || 0, b && b.length || 0), out = [], i, va, vb;
    if (!n) return out;
    for (i = 0; i < n; i++) {
      va = a && i < a.length ? a[i] : (a && a.length ? a[a.length - 1] : 0);
      vb = b && i < b.length ? b[i] : (b && b.length ? b[b.length - 1] : 0);
      out.push(lerp(va, vb, e));
    }
    return out;
  }

  function create(opts) {
    var duration = opts.duration || ANIM_MS;
    var from = null, to = null, t = 1, raf = null, start = null, current = null;

    function mixAt(tt) {
      if (!to) return current;
      if (tt >= 1 || !from) return to;
      return opts.mix(from, to, easeInOut(tt));
    }

    function cancel() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }

    function paint(state, done) {
      current = state;
      opts.render(state, done);
    }

    function tick(ts) {
      if (start === null) start = ts;
      t = Math.min((ts - start) / duration, 1);
      paint(mixAt(t), t >= 1);
      if (t < 1) raf = requestAnimationFrame(tick);
      else { t = 1; start = null; raf = null; }
    }

    function go(next) {
      from = current != null ? (t >= 1 ? current : mixAt(t)) : next;
      to = next;
      cancel();
      if (reduced()) { t = 1; start = null; paint(to, true); return; }
      t = 0; start = null;
      raf = requestAnimationFrame(tick);
    }

    function jump(next) {
      cancel();
      from = to = next;
      t = 1; start = null;
      paint(next, true);
    }

    return {
      go: go,
      jump: jump,
      cancel: cancel,
      state: function () { return current != null ? current : to; },
      animating: function () { return t < 1; }
    };
  }

  global.GraphTween = {
    ANIM_MS: ANIM_MS,
    easeInOut: easeInOut,
    lerp: lerp,
    lerpArray: lerpArray,
    reduced: reduced,
    create: create
  };
})(window);
