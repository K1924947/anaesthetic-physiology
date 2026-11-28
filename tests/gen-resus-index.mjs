import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
import fs from "node:fs";
const { chromium } = pkg;
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-gpu"] });
const p = await b.newPage();
await p.goto((process.env.PHYSIO_BASE || "http://127.0.0.1:8794") + "/Resus_Scenarios.html"); await p.waitForFunction(()=>window.__scn&&window.__scn.all);
const list = await p.evaluate(()=>window.__scn.listed.map((s,i)=>({id:s.id,n:i+1,title:window.__scn.listTitle(s),group:s.group})));
const out = `/* Resus Scenarios index: the listed cases in list order, with spoiler-free names.
   Generated from Resus_Scenarios (window.__scn.listed); tests/test-app-v2.mjs checks it
   still matches the page, so regenerate it whenever cases are added or reordered. */
window.PHYSIO_RESUS_CASES = ${JSON.stringify(list, null, 1).replace(/\n\s*/g, " ")};
`;
fs.writeFileSync(new URL("../assets/resus-index.js", import.meta.url), out);
console.log(list.length, [...new Set(list.map(x=>x.group))]);
await b.close();
