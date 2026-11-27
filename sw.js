/* The Physio Lab service worker.
   - Pages (HTML): network first, so updates are never stuck; the cached copy
     is only used when offline.
   - Assets (CSS, JS, images): stale-while-revalidate.
   - Only same-origin GET requests are handled. Everything else, including the
     waitlist POST to Supabase, goes straight to the network and is never cached.
   Bump CACHE_VERSION whenever you want old caches thrown away. */
var CACHE_VERSION = "20261127-3";
var CACHE = "physiolab-" + CACHE_VERSION;

var PAGES = [
  "./", "cardiac", "respiratory", "privacy", "ECG_Basics", "ECG_Conduction", "ECG_3D",
  "ECG_Rhythm_Quiz", "Cardiac_Action_Potential", "PV_Loop", "Cardiac_Murmurs", "Resus_Scenarios", "saved"
];
var ASSETS = [
  "assets/site.css", "assets/layout.css", "assets/theme.js", "assets/pwa.js", "assets/waitlist.js",
  "assets/app-shell.css", "assets/app-shell.js",
  "assets/logo.svg", "assets/favicon.svg", "assets/favicon-32.png", "assets/apple-touch-icon.png",
  "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable-512.png",
  "assets/ecg-app.js", "assets/ecg-basics.css", "assets/ecg-basics.js",
  "assets/ecg-conduction.css", "assets/ecg-conduction.js",
  "assets/ecg3d.css", "assets/ecg3d-revamp.css", "assets/ecg3d.js",
  "assets/graph-tween.js", "assets/murmurs.css", "assets/murmurs.js",
  "assets/pv-core.css", "assets/pv-tool.css", "assets/pv-tool.js",
  "assets/vendor/three/three.module.min.js", "assets/vendor/three/LICENSE.txt"
];

function key(url) { var u = new URL(url, self.location); u.search = ""; u.hash = ""; return u.href; }

/* A redirected response cannot be used to answer a navigation, so store a plain copy. */
function plain(res) {
  if (!res.redirected) return Promise.resolve(res);
  return res.blob().then(function (b) {
    return new Response(b, { status: 200, statusText: "OK", headers: res.headers });
  });
}

function fillPage(cache, name) {
  function grab(n) {
    var url = new URL(n, self.location).href;
    return fetch(url, { cache: "reload" }).then(function (res) {
      if (!res.ok) throw new Error("skip " + n);
      return plain(res).then(function (p) { return cache.put(key(url), p); });
    });
  }
  /* Hosts that serve clean URLs answer the first; plain file servers need .html. */
  return grab(name).catch(function () {
    if (name === "./") return;
    return grab(name + ".html");
  }).catch(function () { /* page missing: skip, runtime caching will fill it later */ });
}

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    var jobs = PAGES.map(function (p) { return fillPage(cache, p); });
    ASSETS.forEach(function (a) {
      jobs.push(fetch(new URL(a, self.location).href, { cache: "reload" }).then(function (r) {
        if (r.ok) return cache.put(key(a), r);
      }).catch(function () {}));
    });
    return Promise.all(jobs);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) { return n.indexOf("physiolab-") === 0 && n !== CACHE; })
      .map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

function cachedPage(url) {
  var k = key(url);
  var alts = [k];
  if (/\.html$/.test(k)) alts.push(k.replace(/\.html$/, ""));
  else if (!/\/$/.test(k)) alts.push(k + ".html");
  return alts.reduce(function (p, a) {
    return p.then(function (hit) { return hit || caches.match(a); });
  }, Promise.resolve(null));
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var isPage = req.mode === "navigate" || (req.headers.get("accept") || "").indexOf("text/html") !== -1;
  if (isPage) {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok && res.type === "basic" && !res.redirected) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(key(req.url), copy); });
      }
      return res;
    }).catch(function () {
      return cachedPage(req.url).then(function (hit) {
        return hit || caches.match(key("./")) || Response.error();
      });
    }));
    return;
  }

  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(req.url).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res.ok && res.type === "basic") cache.put(req.url, res.clone());
        return res;
      });
      if (hit) { net.catch(function () {}); return hit; }
      return net.catch(function () {
        return cache.match(key(req.url), { ignoreSearch: true }).then(function (h) { return h || Response.error(); });
      });
    });
  }));
});
