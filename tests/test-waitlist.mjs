// Plus waitlist form on the home page: consent, success/failure messages, request shape.
import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;
const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8793";
let failed = 0;
const ok = (n, c, x) => { console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(x || "")); if (!c) failed++; };

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-gpu"] });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });

const st = page.locator("#waitlist-status");
ok("status region is a polite live region", (await st.getAttribute("aria-live")) === "polite" && (await st.getAttribute("role")) === "status");
ok("consent checkbox is required and the form has a privacy link", await page.evaluate(() => document.getElementById("waitlist-consent").required && !!document.querySelector('#waitlist-form a[href="privacy"]')));

// Not configured: honest message, no network call.
let calls = 0;
await page.route("**/rest/v1/waitlist", (r) => { calls++; r.fulfill({ status: 201, body: "" }); });
await page.fill("#waitlist-email", "a@example.com");
await page.check("#waitlist-consent");
await page.click("#waitlist-form button[type=submit]");
ok("unconfigured form says it is not open and sends nothing", /not open yet/.test(await st.textContent()) && calls === 0, await st.textContent());

// Without consent: blocked.
const p2 = await ctx.newPage();
await p2.addInitScript(() => { window.PHYSIO_WAITLIST_CONFIG = { url: "https://example.supabase.co", key: "anon-test" }; });
let req = null;
await p2.route("https://example.supabase.co/rest/v1/waitlist", (r) => { req = { method: r.request().method(), headers: r.request().headers(), body: r.request().postData() }; r.fulfill({ status: 201, body: "" }); });
await p2.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
ok("consent checkbox starts unticked", await p2.evaluate(() => !document.getElementById("waitlist-consent").checked));
await p2.fill("#waitlist-email", "b@example.com");
await p2.click("#waitlist-form button[type=submit]");
ok("no consent, no request", req === null && /consent/i.test(await p2.locator("#waitlist-status").textContent()));

await p2.check("#waitlist-consent");
await p2.selectOption("#waitlist-role", "foundation doctor");
await p2.click("#waitlist-form button[type=submit]");
await p2.waitForFunction(() => /on the Plus waitlist/.test(document.getElementById("waitlist-status").textContent));
ok("POST has apikey, minimal return, JSON body", req && req.method === "POST" && req.headers.apikey === "anon-test" && req.headers.prefer === "return=minimal" && JSON.parse(req.body).email === "b@example.com" && JSON.parse(req.body).role === "foundation doctor", req);
ok("success message uses a text prefix, names the email and shows the contact placeholder", /^Done\./.test(await p2.locator("#waitlist-status").textContent()) && /at b@example\.com when/.test(await p2.locator("#waitlist-status").textContent()) && /\[CONTACT EMAIL\]/.test(await p2.locator("#waitlist-status").textContent()));
ok("POST carries consent version and source", JSON.parse(req.body).consent_version === "waitlist-2026-11-27" && JSON.parse(req.body).source === "home", req);

// Duplicate (409) is shown as success; server error as failure.
await p2.unroute("https://example.supabase.co/rest/v1/waitlist");
await p2.route("https://example.supabase.co/rest/v1/waitlist", (r) => r.fulfill({ status: 409, body: "{}" }));
await p2.fill("#waitlist-email", "b@example.com"); await p2.check("#waitlist-consent");
await p2.click("#waitlist-form button[type=submit]");
await p2.waitForFunction(() => /on the Plus waitlist/.test(document.getElementById("waitlist-status").textContent));
ok("duplicate email is treated as success", true);
await p2.unroute("https://example.supabase.co/rest/v1/waitlist");
await p2.route("https://example.supabase.co/rest/v1/waitlist", (r) => r.fulfill({ status: 500, body: "{}" }));
await p2.fill("#waitlist-email", "c@example.com"); await p2.check("#waitlist-consent");
await p2.click("#waitlist-form button[type=submit]");
await p2.waitForFunction(() => /^Problem\./.test(document.getElementById("waitlist-status").textContent));
ok("server error shows a Problem message and re-enables the button", await p2.locator("#waitlist-form button[type=submit]").isEnabled());

// Privacy page placeholders and ICO line.
await page.goto(BASE + "/privacy.html", { waitUntil: "domcontentloaded" });
const txt = await page.locator("main").textContent();
ok("privacy page has [contact email] placeholder and ICO line", /\[CONTACT EMAIL\]/.test(txt) && /Information Commissioner/.test(txt));
ok("no page errors", errors.length === 0, errors);
await browser.close();
console.log(failed ? "SOME FAILED" : "ALL PASSED");
process.exit(failed ? 1 : 0);
