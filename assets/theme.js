/* Shared colour-blind theme toggle for The Physio Lab.
   Saved in localStorage so the choice persists across pages, including
   when a tool is opened as a standalone file. */
(function () {
  "use strict";

  var KEY = "anaesthetic-physiology-colour-blind";
  var reduced = false;

  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    reduced = false;
  }

  function read() {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function write(on) {
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch (e) { /* private mode: still apply for this page load */ }
  }

  function token(name) {
    var value = getComputedStyle(document.documentElement)
      .getPropertyValue("--" + name)
      .trim();
    return value;
  }

  function tokens() {
    return {
      bg: token("bg"),
      surface: token("surface"),
      text: token("text"),
      muted: token("muted"),
      dim: token("dim"),
      primary: token("primary"),
      accent: token("accent"),
      border: token("border"),
      focus: token("focus"),
      chartBg: token("chart-bg"),
      grid: token("grid"),
      axis: token("axis"),
      a: token("series-a"),
      b: token("series-b"),
      c: token("series-c"),
      d: token("series-d"),
      e: token("series-e"),
      fontSans: token("font-sans"),
      fontSerif: token("font-serif")
    };
  }

  /* Line styles and markers so colour is never the only cue.
     Index 0..4 cycles with the five series tokens. */
  var CUES = [
    { dash: "",          marker: "circle",   hatch: "hatch-horiz" },
    { dash: "7 5",       marker: "square",   hatch: "hatch-diag" },
    { dash: "2 3.5",     marker: "triangle", hatch: "hatch-vert" },
    { dash: "10 3 2 3",  marker: "diamond",  hatch: "hatch-cross" },
    { dash: "1 2.5",     marker: "cross",    hatch: "hatch-dots" }
  ];

  function cue(index) {
    return CUES[((index % CUES.length) + CUES.length) % CUES.length];
  }

  function seriesKey(index) {
    return ["a", "b", "c", "d", "e"][((index % 5) + 5) % 5];
  }

  function hexAlpha(hex, aa) {
    if (!hex) return hex;
    var h = hex.trim().replace("#", "");
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (h.length > 6) h = h.slice(0, 6);
    return "#" + h + aa;
  }

  function apply(on) {
    document.documentElement.setAttribute("data-theme", on ? "colour-blind" : "default");
    document.documentElement.classList.toggle("cb", !!on);
    var btn = document.getElementById("colour-blind-toggle");
    if (btn) {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      var label = btn.querySelector(".cb-toggle-text");
      if (label) label.textContent = on ? "Colour-blind mode on" : "Colour-blind mode";
    }
    window.__physioColourBlind = !!on;
    window.dispatchEvent(new CustomEvent("themechange", { detail: { colourBlind: !!on } }));
  }

  /* Apply as early as possible to avoid a flash of the wrong palette. */
  apply(read());

  function bind() {
    apply(read());
    var btn = document.getElementById("colour-blind-toggle");
    if (btn && !btn.__physioBound) {
      btn.__physioBound = true;
      btn.addEventListener("click", function () {
        var next = !read();
        write(next);
        apply(next);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  function ensurePatterns(svg) {
    if (!svg) return;
    var NS = "http://www.w3.org/2000/svg";
    var t = tokens();
    var existing = svg.querySelector("#physio-patterns");
    if (existing) existing.remove();
    var defs = document.createElementNS(NS, "defs");
    defs.setAttribute("id", "physio-patterns");
    var specs = [
      ["hatch-horiz", t.a, "M0 4 H8", 8, 8],
      ["hatch-diag",  t.b, "M0 8 L8 0", 8, 8],
      ["hatch-vert",  t.c, "M4 0 V8", 8, 8],
      ["hatch-cross", t.d, "M0 0 L8 8 M8 0 L0 8", 8, 8],
      ["hatch-dots",  t.e, "M2 2 H3 V3 H2 Z M6 6 H7 V7 H6 Z", 8, 8]
    ];
    specs.forEach(function (spec) {
      var pat = document.createElementNS(NS, "pattern");
      pat.setAttribute("id", spec[0]);
      pat.setAttribute("patternUnits", "userSpaceOnUse");
      pat.setAttribute("width", String(spec[3]));
      pat.setAttribute("height", String(spec[4]));
      var bg = document.createElementNS(NS, "rect");
      bg.setAttribute("width", "8");
      bg.setAttribute("height", "8");
      bg.setAttribute("fill", hexAlpha(spec[1], "22"));
      pat.appendChild(bg);
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", spec[2]);
      path.setAttribute("stroke", spec[1]);
      path.setAttribute("stroke-width", "1.25");
      path.setAttribute("fill", spec[1]);
      path.setAttribute("fill-opacity", spec[0] === "hatch-dots" ? "1" : "0");
      pat.appendChild(path);
      defs.appendChild(pat);
    });
    svg.insertBefore(defs, svg.firstChild);
  }

  function markerPath(type, x, y, r) {
    r = r || 4;
    if (type === "square") {
      return "M" + (x - r) + " " + (y - r) + " H" + (x + r) + " V" + (y + r) + " H" + (x - r) + " Z";
    }
    if (type === "triangle") {
      return "M" + x + " " + (y - r) + " L" + (x + r) + " " + (y + r) + " L" + (x - r) + " " + (y + r) + " Z";
    }
    if (type === "diamond") {
      return "M" + x + " " + (y - r) + " L" + (x + r) + " " + y + " L" + x + " " + (y + r) + " L" + (x - r) + " " + y + " Z";
    }
    if (type === "cross") {
      var s = r * 0.7;
      return "M" + (x - s) + " " + (y - s) + " L" + (x + s) + " " + (y + s) + " M" + (x + s) + " " + (y - s) + " L" + (x - s) + " " + (y + s);
    }
    /* circle as a short arc path, or caller may use a circle element */
    return null;
  }

  window.PhysioTheme = {
    token: token,
    tokens: tokens,
    cue: cue,
    seriesKey: seriesKey,
    hexAlpha: hexAlpha,
    ensurePatterns: ensurePatterns,
    markerPath: markerPath,
    isColourBlind: function () {
      return document.documentElement.getAttribute("data-theme") === "colour-blind";
    },
    prefersReducedMotion: function () {
      try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch (e) {
        return reduced;
      }
    }
  };
})();
