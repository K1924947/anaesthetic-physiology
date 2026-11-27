// PWA: manifest, icons, registration on every page, offline use, network-first HTML, no POST caching.
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = pkg;
const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8793";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const ok = (n, c, x) => { console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(x || "")); if (!c) failed++; };

// Static checks
const man = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
ok("manifest name and icons", man.name === "The Physio Lab" && man.icons.some((i) => i.sizes === "192x192") && man.icons.some((i) => i.sizes === "512x512") && man.icons.every((i) => fs.existsSync(path.join(root, i.src))), man);
const htmls = fs.readdirSync(root).filter((f) => f.endsWith(".html"));
const missing = htmls.filter((f) => { const s = fs.readFileSync(path.join(root, f), "utf8"); return !/rel="manifest"/.test(s) || !/pwa\.js/.test(s) || !/name="theme-color"/.test(s); });
ok("every page links the manifest, theme colour and registers the service worker", missing.length === 0, missing);
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const refs = new Set();
for (const f of htmls) for (const m of fs.readFileSync(path.join(root, f), "utf8").matchAll(/(?:src|href)="(assets\/[^"?]+)/g)) refs.add(m[1]);
const notPre = [...refs].filter((r) => !sw.includes('"' + r + '"'));
ok("service worker precache list covers every asset the pages reference", notPre.length === 0, notPre);
ok("service worker only handles GET and same-origin", /req\.method !== "GET"/.test(sw) && /url\.origin !== self\.location\.origin/.test(sw));
ok("headers: staging noindex kept and sw.js not cached by HTTP", /X-Robots-Tag: noindex, nofollow/.test(fs.readFileSync(path.join(root, "_headers"), "utf8")) && /\/sw\.js\s+Cache-Control: no-cache/.test(fs.readFileSync(path.join(root, "_headers"), "utf8")));

// Browser checks
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(BASE + "/index.html", { waitUntil: "load" });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForFunction(() => navigator.serviceWorker.controller || true);
await page.reload({ waitUntil: "load" });
const cached = await page.evaluate(async () => { const names = await caches.keys(); const c = await caches.open(names[0]); return { names, keys: (await c.keys()).map((r) => new URL(r.url).pathname) }; });
ok("versioned cache holds pages and assets", /^physiolab-/.test(cached.names[0]) && cached.keys.includes("/ECG_Basics.html") && cached.keys.includes("/assets/site.css") && cached.keys.includes("/assets/vendor/three/three.module.min.js"), cached);

// Network-first: change served HTML while online and see the new version.
await ctx.route("**/privacy.html", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html><title>ONLINE-COPY</title><body>x</body></html>" }));
await page.goto(BASE + "/privacy.html", { waitUntil: "load" });
ok("HTML is network first (online copy wins over cache)", (await page.title()) === "ONLINE-COPY", await page.title());
await ctx.unroute("**/privacy.html");

// Offline
await ctx.setOffline(true);
const off = await ctx.newPage();
await off.goto(BASE + "/ECG_Basics.html", { waitUntil: "domcontentloaded" }).catch(() => {});
ok("offline: a cached tool page still opens", /ECG Basics/.test(await off.title()), await off.title());
await off.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" }).catch(() => {});
ok("offline: home page opens with its styles", (await off.title()).includes("The Physio Lab") && (await off.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== "rgba(0, 0, 0, 0)");
await ctx.setOffline(false);

// POST is never cached or intercepted
const postOk = await page.evaluate(async () => {
  const before = (await (await caches.open((await caches.keys())[0])).keys()).length;
  try { await fetch("/rest/v1/waitlist", { method: "POST", body: "{}" }); } catch (e) {}
  const after = (await (await caches.open((await caches.keys())[0])).keys()).length;
  return before === after;
});
ok("a POST does not add anything to the cache", postOk);
await browser.close();
console.log(failed ? "SOME FAILED" : "ALL PASSED");
process.exit(failed ? 1 : 0);
