// Keeps the home-page Resus Scenarios count in step with the cases actually listed and playable.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "assets/ecg-app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

const results = [];
function pass(name, extra) { results.push({ name, ok: true, extra }); console.log("PASS", name, extra || ""); }
function fail(name, extra) { results.push({ name, ok: false, extra }); console.log("FAIL", name, extra || ""); }

const listMatch = app.match(/var LIST_ORDER = (\[[^\]]+\])/);
if (!listMatch) {
  fail("LIST_ORDER is defined in assets/ecg-app.js");
} else {
  const listedIds = JSON.parse(listMatch[1]);
  const uniqueListed = [...new Set(listedIds)];
  const defined = new Set();
  const idRe = /\{\s*id:\s*"(s\d+|h\d+)"/g;
  let m;
  while ((m = idRe.exec(app))) defined.add(m[1]);
  const playable = uniqueListed.filter((id) => defined.has(id));
  const missing = uniqueListed.filter((id) => !defined.has(id));
  if (missing.length) fail("every LIST_ORDER id has a scenario object", missing);
  else pass("every LIST_ORDER id has a scenario object", { n: playable.length });

  const card = index.match(/href="Resus_Scenarios\.html"[\s\S]*?<p class="jcard-meta">([^<]*)<\/p>/);
  if (!card) {
    fail("home page has a Resus Scenarios card with a jcard-meta count");
  } else {
    const label = card[1].trim();
    const expected = playable.length + " cases";
    if (label === expected) pass("home page Resus card shows the listed case count", label);
    else fail("home page Resus card shows the listed case count", { expected, got: label });
  }
}

const failed = results.filter((r) => !r.ok);
console.log("\n" + results.filter((r) => r.ok).length + " passed, " + failed.length + " failed, " + results.length + " total");
if (failed.length) process.exit(1);
