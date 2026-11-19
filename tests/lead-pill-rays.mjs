// Assert each visible lead pill sits on its positive-axis screen ray (within 20°).
// Run from the worktree root: node tests/lead-pill-rays.mjs
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { extname, join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

async function loadPlaywright() {
  const candidates = [
    '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js',
    join(ROOT, 'node_modules/playwright-core/index.js'),
    join(ROOT, 'node_modules/playwright/index.js')
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      const mod = await import(pathToFileURL(c).href);
      return mod.default || mod;
    }
  }
  throw new Error('playwright-core not found');
}

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let path = join(ROOT, url === '/' ? '/ECG_Basics.html' : url);
  if (!path.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!existsSync(path)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(path));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/ECG_Basics.html`;

const pw = await loadPlaywright();
const chrome = existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : undefined;
const browser = await pw.chromium.launch({
  executablePath: chrome,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
const ctx = await browser.newContext({ viewport: { width: 1512, height: 780 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', e => console.error('PAGEERROR', e.message));
await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(() => window.ecg3d && window.ecg3d.webgl, { timeout: 20000 });

const LIMIT = 20;
const views = [
  { name: 'frontal', setup: "window.ecg3d.select('II'); window.ecg3d.view('frontal');" },
  { name: 'transverse', setup: "window.ecg3d.select('V4'); window.ecg3d.view('transverse');" },
  { name: 'oblique', setup: "window.ecg3d.select('II'); window.ecg3d.view('oblique');" }
];

let failed = 0;
for (const v of views) {
  const rows = await page.evaluate(async (setup) => {
    window.ecg3d.play(false);
    window.ecg3d.setGuided(false);
    window.ecg3d.setAnatomyLabels(false);
    window.ecg3d.toggle('allLeads', true);
    eval(setup);
    window.ecg3d.setT(290);
    window.dispatchEvent(new Event('resize'));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.ecg3d.leadPillRays();
  }, v.setup);
  console.log('\n' + v.name);
  for (const row of rows) {
    if (!row.visible) { console.log('  ' + row.id + ' hidden'); continue; }
    const ok = Math.abs(row.deltaDeg) <= LIMIT;
    if (!ok) failed++;
    console.log('  ' + row.id + ' delta ' + row.deltaDeg.toFixed(1) + '° ' + (ok ? 'OK' : 'FAIL'));
  }
}

await browser.close();
server.close();
if (failed) {
  console.error('\nFAILED: ' + failed + ' visible pills more than ' + LIMIT + '° from their ray');
  process.exit(1);
}
console.log('\nAll visible lead pills lie within ' + LIMIT + '° of their positive-axis ray.');
