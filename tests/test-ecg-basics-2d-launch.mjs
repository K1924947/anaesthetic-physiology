import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8773";
const results = [];
function pass(name, extra) { results.push({ name, ok: true, extra }); console.log("PASS", name, extra || ""); }
function fail(name, extra) { results.push({ name, ok: false, extra }); console.log("FAIL", name, extra || ""); }

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu"]
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push("console.error: " + msg.text()); });

await page.goto(BASE + "/ECG_Basics.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("h1", { timeout: 10000 });
const twoD = await page.evaluate(() => {
  const robots = document.querySelector('meta[name="robots"]');
  const robotsContent = (robots && robots.getAttribute("content")) || "";
  const title = (document.querySelector("h1") || {}).textContent || "";
  const nodes = Array.from(document.querySelectorAll("a, button, [aria-disabled], .scn-banner, .next-card, .next-link"));
  const see = nodes.filter((el) => /see it in 3d/i.test(el.textContent || "") || /see it in 3d/i.test(el.getAttribute("aria-label") || ""));
  const liveLinks = Array.from(document.querySelectorAll("a")).filter((a) => {
    const href = (a.getAttribute("href") || "").split("?")[0];
    return /ECG_3D\.html$/i.test(href);
  }).map((a) => ({ href: a.getAttribute("href"), text: (a.textContent || "").trim().slice(0, 80) }));
  const coming = see.map((el) => ({
    tag: el.tagName,
    href: el.getAttribute("href"),
    disabled: !!(el.disabled || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("disabled")),
    text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160)
  }));
  return {
    title: title.trim(),
    robotsContent,
    indexable: !/noindex/i.test(robotsContent),
    seeCount: see.length,
    coming,
    liveLinks,
    allComingSoon: see.length > 0 && see.every((el) => /coming soon/i.test(el.textContent || "") && !el.getAttribute("href"))
  };
});
if (twoD.title === "ECG Basics" && errors.length === 0) pass("2D ECG Basics loads with no errors", { errors, title: twoD.title });
else fail("2D ECG Basics loads with no errors", { errors, twoD });
if (twoD.indexable) pass("2D ECG Basics is indexable");
else fail("2D ECG Basics is indexable", twoD);
if (twoD.seeCount >= 1 && twoD.allComingSoon && twoD.liveLinks.length === 0) {
  pass("See it in 3D is visibly unavailable and does not link to ECG_3D.html", twoD);
} else {
  fail("See it in 3D is visibly unavailable and does not link to ECG_3D.html", twoD);
}

const hub = await page.evaluate(async (base) => {}, BASE);
await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
const home = await page.evaluate(() => {
  const cardiac = document.querySelector('a.jcard[href="cardiac.html"]');
  const meta = cardiac && cardiac.querySelector(".jcard-meta");
  const desc = cardiac && cardiac.querySelector(".jcard-desc");
  const direct = !!document.querySelector('a.jcard[href="ECG_Basics.html"]');
  const leaked = Array.from(document.querySelectorAll("a")).some((a) => /ECG_3D\.html$/i.test((a.getAttribute("href") || "").split("?")[0]));
  return {
    hasCardiac: !!cardiac,
    meta: meta && meta.textContent.trim(),
    desc: desc && desc.textContent.trim(),
    direct,
    leaked
  };
});
if (home.hasCardiac && /5 tools live/.test(home.meta || "") && !home.leaked) pass("homepage Cardiac card counts five live tools and does not link to ECG_3D.html", home);
else fail("homepage Cardiac card counts five live tools and does not link to ECG_3D.html", home);

await page.goto(BASE + "/cardiac.html", { waitUntil: "domcontentloaded", timeout: 30000 });
const cardiac = await page.evaluate(() => {
  const card = document.querySelector('a.jcard[href="ECG_Basics.html"]');
  const order = Array.from(document.querySelectorAll(".order-list a")).map((a) => ({ href: a.getAttribute("href"), text: a.textContent.trim() }));
  const leaked = Array.from(document.querySelectorAll("a")).some((a) => /ECG_3D\.html$/i.test((a.getAttribute("href") || "").split("?")[0]));
  return {
    cardTitle: card && (card.querySelector(".jcard-title") || {}).textContent,
    inOrder: order.some((o) => o.href === "ECG_Basics.html"),
    order,
    leaked,
    intro: (document.querySelector(".hub-intro") || {}).textContent || ""
  };
});
if (cardiac.cardTitle === "ECG Basics" && cardiac.inOrder && !cardiac.leaked && /ECG Basics/.test(cardiac.intro)) {
  pass("cardiac hub links to ECG Basics and does not link to ECG_3D.html", { cardTitle: cardiac.cardTitle, inOrder: cardiac.inOrder, intro: cardiac.intro });
} else {
  fail("cardiac hub links to ECG Basics and does not link to ECG_3D.html", cardiac);
}

const d3err = [];
page.removeAllListeners("pageerror");
page.removeAllListeners("console");
page.on("pageerror", (err) => d3err.push("pageerror: " + err.message));
page.on("console", (msg) => { if (msg.type() === "error") d3err.push("console.error: " + msg.text()); });
await page.goto(BASE + "/ECG_3D.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.ecg3d && typeof window.ecg3d.simTime === "function", null, { timeout: 15000 });
const threeD = await page.evaluate(() => {
  const robots = document.querySelector('meta[name="robots"]');
  const robotsContent = (robots && robots.getAttribute("content")) || "";
  return {
    title: document.title,
    robotsContent,
    noindex: /noindex/i.test(robotsContent),
    hasApi: !!(window.ecg3d && window.ecg3d.simTime)
  };
});
if (threeD.noindex && threeD.hasApi && d3err.length === 0) pass("unlisted 3D page loads with noindex and no errors", { ...threeD, d3err });
else fail("unlisted 3D page loads with noindex and no errors", { ...threeD, d3err });

await page.evaluate(() => { window.ecg3d.setSpeed(1); window.ecg3d.play(true); });
const t0 = await page.evaluate(() => window.ecg3d.now());
await page.waitForTimeout(400);
const t1 = await page.evaluate(() => window.ecg3d.now());
const sync = await page.evaluate(() => {
  const now = window.ecg3d.now();
  return { simTime: now.simTime, t: now.t, beat: now.beat, playing: now.playing };
});
const advanced = t1.simTime > t0.simTime && Math.abs((t1.simTime - t0.simTime) - ((t1.beat * 800 + t1.t) - (t0.beat * 800 + t0.t))) < 2;
if (advanced) pass("3D master simTime stays in sync with the beat cursor", { t0, t1, sync });
else fail("3D master simTime stays in sync with the beat cursor", { t0, t1, sync });

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? "FAILED " + failed.length + "/" + results.length : "ALL " + results.length + " PASSED");
process.exit(failed.length ? 1 : 0);
