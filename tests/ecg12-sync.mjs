// Assert the 12-lead page has four simultaneous column cursors at equal relative x, plus a rhythm-strip cursor on the 9.6 s clock, at 1x and 0.25x.
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
    let path = join(ROOT, url === '/' ? '/ECG_3D.html' : url);
    if (!path.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(path));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

function checkSample(label, cursors, pageTime) {
  const cols = cursors.filter(c => c.id !== 'II-rhythm').sort((a, b) => a.col - b.col);
  const rhythm = cursors.find(c => c.id === 'II-rhythm');
  const errors = [];
  if (cols.length !== 4) errors.push(`${label}: expected 4 column cursors, got ${cols.length}`);
  if (!rhythm) errors.push(`${label}: missing rhythm-strip cursor`);
  if (cursors.length !== cols.length + (rhythm ? 1 : 0)) {
    errors.push(`${label}: unexpected extra cursors: ${cursors.map(c => c.id).join(', ')}`);
  }
  if (!cols.length) return errors;
  const tAbs = cols[0].tAbs, t0 = cols[0].t0;
  const offset = tAbs - t0;
  const tCol0 = Math.floor(tAbs / 2400) * 2400;
  const tPage0 = Math.floor(tAbs / 9600) * 9600;
  if (tAbs !== pageTime) errors.push(`${label}: cursor tAbs ${tAbs} != pageTime ${pageTime}`);
  if (Math.abs(t0 - tCol0) > 0.5) errors.push(`${label}: column t0 ${t0} != window start ${tCol0}`);
  if (offset < 0 || offset >= 2400) errors.push(`${label}: column offset ${offset} outside 0..2400`);
  for (const c of cols) {
    if (c.tAbs !== tAbs) errors.push(`${label}: ${c.id} tAbs ${c.tAbs} != ${tAbs}`);
    if (Math.abs(c.t0 - t0) > 0.5) errors.push(`${label}: ${c.id} t0 ${c.t0} != ${t0}`);
    if (Math.abs((c.tAbs - c.t0) - offset) > 0.5) errors.push(`${label}: ${c.id} offset ${c.tAbs - c.t0} != ${offset}`);
  }
  if (cols.map(c => c.col).join() !== '0,1,2,3') errors.push(`${label}: columns are ${cols.map(c => c.col).join(', ')}`);
  const rel = cols.map(c => (c.relX != null ? c.relX : null));
  if (rel.every(v => v != null) && Math.max(...rel) - Math.min(...rel) > 0.5) {
    errors.push(`${label}: column relX differs: ${rel.join(', ')}`);
  }
  const xs = cols.map(c => c.x);
  // Absolute x differs by column origin; relative x must match.
  const pxPerMs = cols[0].pxPerMs || 1;
  const relFromX = cols.map(c => c.x - (c.col * 2400 * 0.025 * (c.pxPerMs / (0.025))));
  // Safer: compare (x - min x) steps or relX only. If relX missing, compare (tAbs-t0)*pxPerMs via x offsets.
  const relCalc = cols.map(c => c.x - c.col * 60 * (c.pxPerMs / 0.025));
  if (Math.max(...relCalc) - Math.min(...relCalc) > 0.75) {
    errors.push(`${label}: column relative x differs: ${relCalc.join(', ')}`);
  }
  if (rhythm && rhythm.tAbs !== tAbs) errors.push(`${label}: rhythm tAbs ${rhythm.tAbs} != column tAbs ${tAbs}`);
  if (rhythm && Math.abs(rhythm.t0 - tPage0) > 0.5) errors.push(`${label}: rhythm t0 ${rhythm.t0} != page window ${tPage0}`);
  return errors;
}

// Assert the 12-lead page has four simultaneous column cursors at equal relative x, plus a rhythm-strip cursor on the 9.6 s clock, at 1x and 0.25x.
// Run from the worktree root: node tests/ecg12-sync.mjs
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/ECG_3D.html`;
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
console.log('\nFour simultaneous column cursors share one relative x, and the rhythm strip follows the 9.6 s clock, at 1x and 0.25x.');
