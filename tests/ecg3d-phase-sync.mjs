// Assert the heart phase and every ECG cursor stay on one master sim time
// through long runs, speed changes, guided jumps, scrubbing, pause/resume
// and a hidden-tab gap. Run from the worktree root: node tests/ecg3d-phase-sync.mjs
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { extname, join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BEAT_MS = 800;
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

function wrap(t, period = BEAT_MS) {
  let x = t % period;
  if (x < 0) x += period;
  return x;
}

function phaseDelta(a, b) {
  let d = Math.abs(wrap(a) - wrap(b));
  if (d > BEAT_MS / 2) d = BEAT_MS - d;
  return d;
}

function checkSample(label, sample) {
  const errors = [];
  const n = sample.now;
  const sim = n.simTime;
  if (!Number.isFinite(sim)) errors.push(`${label}: missing simTime`);
  if (Number.isFinite(n.pageTime) && Math.abs(n.pageTime - sim) > 1e-6) {
    errors.push(`${label}: pageTime ${n.pageTime} != simTime ${sim}`);
  }
  const beatIdx = sample.beatIndex != null ? sample.beatIndex : n.beat;
  const t0 = sample.beatStart;
  if (!Number.isFinite(t0)) errors.push(`${label}: missing beat start`);
  else {
    const heart = Number.isFinite(n.t) ? n.t : (sim - t0);
    if (Math.abs(heart - (sim - t0)) > 1) {
      errors.push(`${label}: heart phase ${heart} != simTime-beatStart ${sim - t0} (simTime ${sim}, start ${t0})`);
    }
    if (Number.isFinite(n.beat) && n.beat !== beatIdx) {
      errors.push(`${label}: beat ${n.beat} != recording index ${beatIdx}`);
    }
  }
  const cursors = sample.cursors || [];
  const cols = cursors.filter(c => c.id !== 'II-rhythm');
  const rhythm = cursors.find(c => c.id === 'II-rhythm');
  if (cols.length !== 4) errors.push(`${label}: expected 4 column cursors, got ${cols.length}`);
  if (!rhythm) errors.push(`${label}: missing rhythm-strip cursor`);
  if (cols.length === 4 && cols[0].relX != null) {
    const rel = cols.map(c => c.relX);
    if (Math.max(...rel) - Math.min(...rel) > 0.5) errors.push(`${label}: column relX differs: ${rel.join(', ')}`);
  }
  for (const c of cursors) {
    if (Math.abs(c.tAbs - sim) > 1) {
      errors.push(`${label}: ${c.id} tAbs ${c.tAbs} != simTime ${sim}`);
    }
  }
  if (rhythm && Number.isFinite(rhythm.t0)) {
    const tPage0 = Math.floor(sim / 9600) * 9600;
    if (Math.abs(rhythm.t0 - tPage0) > 1) {
      errors.push(`${label}: rhythm t0 ${rhythm.t0} != page window ${tPage0}`);
    }
    const off = rhythm.tAbs - rhythm.t0;
    if (off < -0.5 || off >= 9600.5) errors.push(`${label}: rhythm offset ${off} outside the 9.6 s page`);
  }
  const closeup = sample.closeup;
  if (closeup && Number.isFinite(closeup.tAbs) && Math.abs(closeup.tAbs - sim) > 1) {
    errors.push(`${label}: close-up cursor tAbs ${closeup.tAbs} != simTime ${sim}`);
  }
  return errors;
}

// Assert the heart phase and every ECG cursor stay on one master sim time
// through long runs, speed changes, guided jumps, scrubbing, pause/resume
// and a hidden-tab gap. Run from the worktree root: node tests/ecg3d-phase-sync.mjs
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
await page.waitForFunction(() => window.ecg3d && window.ecg3d.webgl && window.ecg3d.advanceSim, { timeout: 20000 });

await page.evaluate(() => {
  window.ecg3d.play(false);
  window.ecg3d.setGuided(true);
  window.ecg3d.view('frontal');
  window.ecg3d.select('II');
  window.ecg3d.setSpeed(1);
  window.ecg3d.setSimTime(250);
});

const errors = [];

async function sample(label) {
  const data = await page.evaluate(() => ({
    now: window.ecg3d.now(),
    cursors: window.ecg3d.sheetCursors(),
    closeup: window.ecg3d.closeupCursorScreen && window.ecg3d.closeupCursorScreen(),
    beatIndex: window.ecg3d.beatIndex(window.ecg3d.simTime()),
    beatStart: window.ecg3d.beatStart(window.ecg3d.beatIndex(window.ecg3d.simTime()))
  }));
  const e = checkSample(label, data);
  errors.push(...e);
  const n = data.now;
  console.log(label, 'simTime', n.simTime, 't', n.t, 'beat', n.beat, e.length ? 'FAIL' : 'OK');
  return data;
}

async function playSim(wallMs, chunk = 100) {
  await page.evaluate(({ wallMs, chunk }) => {
    const speed = window.ecg3d.now().speed;
    let left = wallMs;
    while (left > 0) {
      const dt = Math.min(chunk, left);
      window.ecg3d.advanceSim(dt * speed, false, true);
      left -= dt;
    }
    window.ecg3d.refresh();
  }, { wallMs, chunk });
}

// Long runs: 10+ minutes of sim time at 0.01x and at 1x, in clamped rAF-sized chunks.
await page.evaluate(() => { window.ecg3d.setSimTime(250); window.ecg3d.setSpeed(0.01); });
await playSim(10 * 60 * 1000 / 0.01, 100); // 10 min of sim time at 0.01x
await sample('10 min sim at 0.01x');

await page.evaluate(() => window.ecg3d.setSpeed(1));
await playSim(10 * 60 * 1000, 100); // another 10 min at 1x
await sample('20 min sim after 1x run');

// Speed change mid-run
await page.evaluate(() => window.ecg3d.setSpeed(0.25));
await playSim(8000, 50);
await sample('after speed change to 0.25x');

// Ed's case: past the first 10 s page wrap, on QRS, at 0.01x
await page.evaluate(() => {
  window.ecg3d.setSpeed(0.01);
  window.ecg3d.setSimTime(13 * 800 + 250);
  window.ecg3d.step(4);
});
await sample('step 5 QRS after page wrap at 0.01x');

// Guided step jumps should keep the same beat (only the in-beat phase changes)
{
  const before = await page.evaluate(() => window.ecg3d.now());
  await page.evaluate(() => window.ecg3d.step(0));
  const after = await sample('guided jump to step 1');
  if (after.now.beat !== before.beat) {
    errors.push(`guided jump changed beat from ${before.beat} to ${after.now.beat}`);
  }
  await page.evaluate(() => window.ecg3d.step(6));
  await sample('guided jump to step 7');
}

// Scrubbing changes only the phase of the current beat
{
  const before = await page.evaluate(() => window.ecg3d.now());
  await page.evaluate(() => window.ecg3d.setT(100));
  const after = await sample('scrub to 100 ms');
  if (after.now.beat !== before.beat) {
    errors.push(`scrubbing changed beat from ${before.beat} to ${after.now.beat}`);
  }
  if (phaseDelta(after.now.t, 100) > 1) {
    errors.push(`scrub to 100 ms left heart at ${after.now.t}`);
  }
}

// Pause / resume, then a short play burst through the rAF hook
await page.evaluate(() => {
  window.ecg3d.play(false);
  window.ecg3d.setSpeed(1);
  const t0 = window.ecg3d.now().simTime;
  window.ecg3d.play(true);
  window.ecg3d.syncClock(5000);
  window.ecg3d.frameAt(5000 + 80);
  window.ecg3d.play(false);
  window.ecg3d.syncClock();
  return t0;
});
await sample('pause/resume then 80 ms frame at 1x');

// Hidden-tab gap: resetting the clock on resume must not desync views.
// A huge rAF gap without a reset is also clamped once on the master clock.
await page.evaluate(() => {
  window.ecg3d.setSimTime(13 * 800 + 260);
  const t0 = window.ecg3d.now().simTime;
  window.ecg3d.setSpeed(1);
  window.ecg3d.play(true);
  window.ecg3d.syncClock(1e9);
  window.ecg3d.frameAt(1e9); // dt = 0 after resume reset
  const mid = window.ecg3d.now().simTime;
  window.ecg3d.frameAt(1e9 + 5000); // unclamped wall gap, dt clamped to 100
  const after = window.ecg3d.now().simTime;
  window.ecg3d.play(false);
  window.ecg3d.syncClock();
  return { t0, mid, after };
}).then(jumps => {
  if (Math.abs(jumps.mid - jumps.t0) > 1) {
    errors.push(`hidden-tab resume advanced simTime from ${jumps.t0} to ${jumps.mid}`);
  }
  if (Math.abs(jumps.after - (jumps.mid + 100)) > 1) {
    errors.push(`clamped hidden gap should add 100 ms at 1x, got ${jumps.after - jumps.mid} (from ${jumps.mid} to ${jumps.after})`);
  }
  console.log('hidden-tab gap', jumps, Math.abs(jumps.mid - jumps.t0) <= 1 && Math.abs(jumps.after - (jumps.mid + 100)) <= 1 ? 'OK' : 'FAIL');
});
await sample('after hidden-tab gap');

await browser.close();
server.close();
if (errors.length) {
  console.error('\nFAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nHeart phase and all ECG cursors stayed within 1 ms across long runs, speed changes, guided jumps, scrubbing, pause/resume and a hidden-tab gap.');
