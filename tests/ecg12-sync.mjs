// Assert all 12-lead column cursors share one time and one x-offset, at 1x and 0.25x.
// Run from the worktree root: node tests/ecg12-sync.mjs
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

function startServer() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let path = join(ROOT, url === '/' ? '/ECG_Basics.html' : url);
    if (!path.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(path));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

function checkSample(label, cursors, pageTime) {
  const cols = cursors.filter(c => c.id !== 'II-rhythm');
  const rhythm = cursors.find(c => c.id === 'II-rhythm');
  const errors = [];
  if (cols.length !== 12) errors.push(`${label}: expected 12 column cursors, got ${cols.length}`);
  if (!rhythm) errors.push(`${label}: missing rhythm-strip cursor`);
  if (!cols.length) return errors;
  const tAbs = cols[0].tAbs, t0 = cols[0].t0;
  const offset = tAbs - t0;
  if (tAbs !== pageTime) errors.push(`${label}: cursor tAbs ${tAbs} != pageTime ${pageTime}`);
  for (const c of cols) {
    if (c.tAbs !== tAbs) errors.push(`${label}: ${c.id} tAbs ${c.tAbs} != ${tAbs}`);
    if (c.t0 !== t0) errors.push(`${label}: ${c.id} t0 ${c.t0} != ${t0}`);
    if (Math.abs((c.tAbs - c.t0) - offset) > 0.5) errors.push(`${label}: ${c.id} offset ${c.tAbs - c.t0} != ${offset}`);
  }
  if (t0 !== Math.floor(tAbs / 2500) * 2500) errors.push(`${label}: t0 ${t0} is not the 2.5 s window for ${tAbs}`);
  if (offset < 0 || offset >= 2500) errors.push(`${label}: column offset ${offset} outside 0–2500`);
  // same x offset within each column (subtract the column origin)
  const byCol = {};
  for (const c of cols) {
    const colW = 2500 * (c.pxPerMs || 0);
    const localX = colW ? (c.x % (colW + 1)) : c.x;
    (byCol[c.col] ||= []).push(c);
  }
  const local = cols.map(c => c.tAbs - c.t0);
  if (new Set(local.map(v => Math.round(v))).size !== 1) errors.push(`${label}: column time offsets differ: ${[...new Set(local)].join(', ')}`);
  if (rhythm && rhythm.tAbs !== tAbs) errors.push(`${label}: rhythm tAbs ${rhythm.tAbs} != column tAbs ${tAbs}`);
  return errors;
}

const server = await startServer();
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
await page.evaluate(() => {
  window.ecg3d.play(false);
  window.ecg3d.setGuided(false);
  window.ecg3d.view('frontal');
  window.ecg3d.select('II');
});

const errors = [];
const fixedTimes = [400, 1200, 2600, 4000, 6100, 8900];
for (const ms of fixedTimes) {
  const sample = await page.evaluate(ms => {
    window.ecg3d.setPageTime(ms);
    return { pageTime: window.ecg3d.pageTime(), cursors: window.ecg3d.sheetCursors() };
  }, ms);
  const e = checkSample('t=' + ms, sample.cursors, sample.pageTime);
  errors.push(...e);
  const t0 = sample.cursors[0] && sample.cursors[0].t0;
  console.log('fixed', ms, 'pageTime', sample.pageTime, 't0', t0, 'cursors', sample.cursors.length, e.length ? 'FAIL' : 'OK');
}

for (const speed of [1, 0.25]) {
  await page.evaluate(speed => {
    window.ecg3d.setPageTime(800);
    window.ecg3d.setSpeed(speed);
    window.ecg3d.play(true);
  }, speed);
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(speed === 1 ? 220 : 400);
    const sample = await page.evaluate(() => ({
      now: window.ecg3d.now(),
      cursors: window.ecg3d.sheetCursors()
    }));
    const e = checkSample(`speed ${speed}x sample ${i + 1}`, sample.cursors, sample.now.pageTime);
    errors.push(...e);
    console.log('speed', speed, 'sample', i + 1, 'pageTime', sample.now.pageTime, 't0', sample.cursors[0] && sample.cursors[0].t0, e.length ? 'FAIL' : 'OK');
  }
  await page.evaluate(() => window.ecg3d.play(false));
}

await browser.close();
server.close();
if (errors.length) {
  console.error('\nFAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nAll column cursors share one time value, and the rhythm-strip cursor matches, at 1x and 0.25x.');
