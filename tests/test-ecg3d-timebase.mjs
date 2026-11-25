import pkg from "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.js";
const { chromium } = pkg;

const BASE = process.env.PHYSIO_BASE || "http://127.0.0.1:8793";
const results = [];
function pass(name, extra) { results.push({ name, ok: true, extra }); console.log("PASS", name, extra ? JSON.stringify(extra) : ""); }
function fail(name, extra) { results.push({ name, ok: false, extra }); console.log("FAIL", name, extra ? JSON.stringify(extra) : ""); }

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu"]
});

function attachErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  return errors;
}

async function inspectCloseup(page, idx) {
  return page.evaluate((idx) => {
    const c = idx === 1 ? document.getElementById("leadCloseup2") : document.getElementById("leadCloseup");
    if (!c) return null;
    const dpr = window.devicePixelRatio || 1;
    const cssW = parseFloat(c.dataset.cssW || c.clientWidth);
    const cssH = parseFloat(c.dataset.cssH || c.clientHeight);
    const px = parseFloat(c.dataset.px);
    const pxPerMs = parseFloat(c.dataset.pxPerMs);
    const x0Px = parseFloat(c.dataset.x0Px);
    const t0 = parseFloat(c.dataset.t0);
    const t1 = parseFloat(c.dataset.t1);
    const tAbs = parseFloat(c.dataset.tAbs);
    const cursorX = parseFloat(c.dataset.cursorX);
    const lead = c.dataset.lead;
    const beats = parseFloat(c.dataset.beats);
    const ctx = c.getContext("2d");
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;

    // Locate blue sweep cursor column from rendered pixels
    const blueCounts = new Array(Math.round(cssW)).fill(0);
    for (let cx = 0; cx < Math.round(cssW); cx++) {
      const ix = Math.min(W - 1, Math.round(cx * dpr));
      for (let cy = 4; cy < Math.round(cssH) - 4; cy++) {
        const iy = Math.min(H - 1, Math.round(cy * dpr));
        const p = (iy * W + ix) * 4;
        if (img[p + 2] > img[p] + 40 && img[p + 2] > 70) blueCounts[cx]++;
      }
    }
    let pixelCursorX = 0, bestBlue = -1;
    for (let cx = 0; cx < blueCounts.length; cx++) {
      if (blueCounts[cx] > bestBlue) { bestBlue = blueCounts[cx]; pixelCursorX = cx; }
    }

    // Check rendered dark ink inside each beat's QRS window around global R-time (236 ms) and lead's own extremum
    const tr = window.ecg3d.trace(lead);
    let rPk = 236, maxAbs = -1;
    for (let t = 200; t <= 280; t++) {
      if (Math.abs(tr[t]) > maxAbs) { maxAbs = Math.abs(tr[t]); rPk = t; }
    }
    const qrsCenterXs = []; // shared beat QRS center (b*800 + 236) -> tests identical beat alignment across leads
    const rInkCounts = [];  // rendered ink around each beat's lead extremum -> tests pixel trace exists at expected x
    for (let b = 0; b < Math.round(beats); b++) {
      qrsCenterXs.push(+(x0Px + (b * 800 + 236) * pxPerMs).toFixed(2));
      const x = x0Px + (b * 800 + rPk) * pxPerMs;
      let dark = 0;
      const midY0 = Math.round(cssH * 0.16 * dpr), midY1 = Math.round(cssH * 0.86 * dpr);
      for (let dx = -2; dx <= 2; dx++) {
        const ix = Math.max(0, Math.min(W - 1, Math.round((x + dx) * dpr)));
        for (let iy = midY0; iy < midY1; iy++) {
          const p = (iy * W + ix) * 4;
          const r = img[p], g = img[p + 1], bl = img[p + 2];
          if (r < 110 && g < 110 && bl < 110 && (r - bl) < 25) dark++;
        }
      }
      rInkCounts.push(dark);
    }
    return {
      lead, beats, px, pxPerMs, x0Px, t0, t1, tAbs, cursorX, pixelCursorX, bestBlue,
      rPk, qrsCenterXs, rInkCounts, cssW, cssH
    };
  }, idx);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = attachErrors(page);
await page.goto(BASE + "/ECG_3D.html", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.ecg3d && window.ecg3d.enterFullscreen, null, { timeout: 20000 });
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.waitForTimeout(250);

// 1) Normal view at two viewport widths (1280x800 and 960x640): V3 vs V4 share exact timebase, cursor X, and beat X
for (const vp of [{ width: 1280, height: 800 }, { width: 960, height: 640 }]) {
  await page.setViewportSize(vp);
  await page.waitForTimeout(200);
  // t = 2120 ms puts cursor after beat 2's T-wave so beats 0, 1, 2 are outside the 80 ms erase gap (beat 3 is prior loop!)
  await page.evaluate(() => { window.ecg3d.play(false); window.ecg3d.setPageTime(2120); window.ecg3d.select("V3"); });
  await page.waitForTimeout(80);
  const v3 = await inspectCloseup(page, 0);
  await page.evaluate(() => { window.ecg3d.select("V4"); });
  await page.waitForTimeout(80);
  const v4 = await inspectCloseup(page, 0);

  const sameBeats = v3.beats === 4 && v4.beats === 4;
  const sameScale = Math.abs(v3.pxPerMs - v4.pxPerMs) < 1e-5;
  const sameWindow = v3.t0 === v4.t0 && v3.t1 === v4.t1;
  const sameCursor = Math.abs(v3.cursorX - v4.cursorX) < 0.5 && Math.abs(v3.pixelCursorX - v4.pixelCursorX) <= 1;
  const maxBeatDiff = Math.max(...v3.qrsCenterXs.map((x, i) => Math.abs(x - v4.qrsCenterXs[i])));
  const allInk = v3.rInkCounts.every((d) => d > 0) && v4.rInkCounts.every((d) => d > 0);

  if (sameBeats && sameScale && sameWindow && sameCursor && maxBeatDiff <= 1 && allInk) {
    pass(`Normal view (${vp.width}x${vp.height}): V3 and V4 share beat count, 25 mm/s scale, cursor x and beat x`, {
      beats: v3.beats, pxPerMs: v3.pxPerMs, cursorX: v3.cursorX, pixelCursorX: [v3.pixelCursorX, v4.pixelCursorX], maxBeatDiff
    });
  } else {
    fail(`Normal view (${vp.width}x${vp.height}): V3 and V4 share beat count, 25 mm/s scale, cursor x and beat x`, { v3, v4, maxBeatDiff });
  }
}

// 2) Full screen view: V3 and V4 simultaneously, equal width then forced asymmetric container width
await page.setViewportSize({ width: 1280, height: 800 });
await page.evaluate(async () => { await window.ecg3d.enterFullscreen(); });
await page.waitForTimeout(250);
// Currently ["V4"] is selected; select("V3") adds V3 so ["V4", "V3"] are both active (card2 visible)
await page.evaluate(() => {
  window.ecg3d.play(false);
  window.ecg3d.select("V3");
  window.ecg3d.setPageTime(2920);
});
await page.waitForTimeout(150);

const card2Hidden = await page.evaluate(() => document.getElementById("leadCloseupCard2").hidden);
const fs0 = await inspectCloseup(page, 0);
const fs1 = await inspectCloseup(page, 1);
const fsMaxBeat = Math.max(...fs0.qrsCenterXs.map((x, i) => Math.abs(x - fs1.qrsCenterXs[i])));
const fsOk = !card2Hidden
  && fs0.lead === "V4" && fs1.lead === "V3"
  && fs0.beats === 4 && fs1.beats === 4
  && Math.abs(fs0.pxPerMs - fs1.pxPerMs) < 1e-5
  && fs0.t0 === fs1.t0 && fs0.t1 === fs1.t1
  && Math.abs(fs0.cursorX - fs1.cursorX) < 0.5
  && Math.abs(fs0.pixelCursorX - fs1.pixelCursorX) <= 1
  && fsMaxBeat <= 1
  && fs0.rInkCounts.every((d) => d > 0) && fs1.rInkCounts.every((d) => d > 0);
if (fsOk) {
  pass("Fullscreen view: V4 and V3 share beat count, 25 mm/s scale, cursor x and beat x", {
    beats: fs0.beats, pxPerMs: fs0.pxPerMs, cursorX: fs0.cursorX, pixelCursors: [fs0.pixelCursorX, fs1.pixelCursorX], fsMaxBeat
  });
} else {
  fail("Fullscreen view: V4 and V3 share beat count, 25 mm/s scale, cursor x and beat x", { card2Hidden, fs0, fs1, fsMaxBeat });
}

// Force different frame widths on card 1 vs card 2 in fullscreen and assert both STILL lock to identical pxPerMs & cursor x
await page.evaluate(() => {
  document.getElementById("leadCloseupCard2").style.width = "320px";
  window.ecg3d.refresh();
});
await page.waitForTimeout(150);
const diff0 = await inspectCloseup(page, 0);
const diff1 = await inspectCloseup(page, 1);
const diffMaxBeat = Math.max(...diff0.qrsCenterXs.map((x, i) => Math.abs(x - diff1.qrsCenterXs[i])));
if (diff0.cssW === diff1.cssW && diff0.beats === 4 && diff1.beats === 4
    && Math.abs(diff0.pxPerMs - diff1.pxPerMs) < 1e-5
    && Math.abs(diff0.cursorX - diff1.cursorX) < 0.5
    && Math.abs(diff0.pixelCursorX - diff1.pixelCursorX) <= 1
    && diffMaxBeat <= 1) {
  pass("Different strip container widths: V4 and V3 still lock to identical scale, cursor x and beat x", {
    canvasCssW: [diff0.cssW, diff1.cssW], pxPerMs: diff0.pxPerMs, cursorX: diff0.cursorX, diffMaxBeat
  });
} else {
  fail("Different strip container widths: V4 and V3 still lock to identical scale, cursor x and beat x", { diff0, diff1, diffMaxBeat });
}
await page.evaluate(() => {
  document.getElementById("leadCloseupCard2").style.width = "";
  window.ecg3d.refresh();
});
await page.evaluate(async () => { await window.ecg3d.exitFullscreen(); });
await page.waitForTimeout(250);

// 3) 12-lead ECG: shared clock, vertical beat alignment across rows & rhythm strip, sweep cursor alignment,
//    and NO horizontal scroll/translation between frames across wraps (2400 ms and 9600 ms).
async function inspect12Lead(page) {
  return page.evaluate(() => {
    const c = document.getElementById("ecg12");
    const frame = c.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const px = parseFloat(c.dataset.px);
    const pxPerMs = parseFloat(c.dataset.pxPerMs);
    const rowH = parseFloat(c.dataset.rowH);
    const colMs = parseFloat(c.dataset.colMs);
    const pageMs = parseFloat(c.dataset.pageMs);
    const tAbs = parseFloat(c.dataset.tAbs);
    const tWin0 = parseFloat(c.dataset.tWin0);
    const tPage0 = parseFloat(c.dataset.tPage0);
    const cssW = parseFloat(c.style.width);
    const cssH = parseFloat(c.style.height);
    const ctx = c.getContext("2d");
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;

    const cursors = window.ecg3d.sheetCursors();
    const cols = cursors.filter((k) => k.id !== "II-rhythm");
    const rhythm = cursors.find((k) => k.id === "II-rhythm");

    function findBlueInBand(xStart, xEnd, yStart, yEnd) {
      let bestX = -1, best = 0;
      for (let cx = Math.max(0, Math.floor(xStart)); cx <= Math.min(Math.floor(cssW) - 1, Math.ceil(xEnd)); cx++) {
        const ix = Math.round(cx * dpr);
        let cnt = 0;
        for (let cy = Math.max(0, Math.floor(yStart)); cy <= Math.min(Math.floor(cssH) - 1, Math.ceil(yEnd)); cy++) {
          const iy = Math.round(cy * dpr);
          const p = (iy * W + ix) * 4;
          if (img[p + 2] > img[p] + 40 && img[p + 2] > 70) cnt++;
        }
        if (cnt > best) { best = cnt; bestX = cx; }
      }
      return { x: bestX, cnt: best };
    }

    // Neutral dark ink (excludes pink/red grid lines where R >> G,B and blue cursor where B >> R)
    function darkTraceProfile(xStart, xEnd, yStart, yEnd) {
      const counts = [];
      for (let cx = Math.floor(xStart); cx <= Math.ceil(xEnd); cx++) {
        const ix = Math.min(W - 1, Math.round(cx * dpr));
        let score = 0;
        for (let cy = Math.floor(yStart); cy <= Math.ceil(yEnd); cy++) {
          const iy = Math.min(H - 1, Math.round(cy * dpr));
          const p = (iy * W + ix) * 4;
          const r = img[p], g = img[p + 1], b = img[p + 2];
          if (r < 170 && g < 170 && b < 170 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25) {
            score += (200 - (r + g + b) / 3);
          }
        }
        counts.push({ x: cx, score: Math.round(score) });
      }
      return counts;
    }

    const colW = colMs * 0.025 * px;
    const calX = 8 * px;
    const rowCursors = [];
    for (let r = 0; r < 3; r++) {
      const y0 = (2 + r * rowH + 1) * px, y1 = (2 + (r + 1) * rowH - 1) * px;
      const perCol = [];
      for (let col = 0; col < 4; col++) {
        const x0 = calX + col * colW, x1 = x0 + colW;
        perCol.push(findBlueInBand(x0, x1, y0, y1));
      }
      rowCursors.push(perCol);
    }
    const rhyCursor = findBlueInBand(calX, calX + pageMs * 0.025 * px, (2 + 3 * rowH + 1) * px, (2 + 4 * rowH - 1) * px);

    const LAYOUT = [["I", "aVR", "V1", "V4"], ["II", "aVL", "V2", "V5"], ["III", "aVF", "V3", "V6"]];
    // Measure rendered R-peak / S-nadir X (centroid of extremum Y dark trace ink) in beat 2 (clear of all labels)
    const qrsPeak = (row, col, beatIdx) => {
      const leadId = row === 3 ? "II" : LAYOUT[row][col];
      const tr = window.ecg3d.trace(leadId);
      let rPk = 236, maxAbs = -1, sign = 1;
      for (let t = 200; t <= 280; t++) {
        if (Math.abs(tr[t]) > maxAbs) { maxAbs = Math.abs(tr[t]); rPk = t; sign = tr[t] >= 0 ? 1 : -1; }
      }
      const expectedX = (8 + col * 60 + beatIdx * 20 + rPk * 0.025) * px;
      const xStart = (8 + col * 60 + beatIdx * 20 + 5.0) * px;
      const xEnd = (8 + col * 60 + beatIdx * 20 + 7.2) * px;
      const yTrace0 = (2 + row * rowH + 1.0) * px;
      const y1 = (2 + (row + 1) * rowH - 1.0) * px;
      let bestY = sign > 0 ? Infinity : -Infinity, score = 0;
      const pts = [];
      for (let cx = Math.floor(xStart); cx <= Math.ceil(xEnd); cx++) {
        const ix = Math.min(W - 1, Math.round(cx * dpr));
        for (let cy = Math.floor(yTrace0); cy <= Math.ceil(y1); cy++) {
          const iy = Math.min(H - 1, Math.round(cy * dpr));
          const p = (iy * W + ix) * 4;
          const r = img[p], g = img[p + 1], b = img[p + 2];
          if (r < 140 && g < 140 && b < 140 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25) {
            score++;
            pts.push({ x: cx, y: cy });
            if ((sign > 0 && cy < bestY) || (sign < 0 && cy > bestY)) bestY = cy;
          }
        }
      }
      const tip = pts.filter((p) => Math.abs(p.y - bestY) <= 1);
      const meanX = tip.length ? +(tip.reduce((a, p) => a + p.x, 0) / tip.length).toFixed(2) : -1;
      return { x: meanX, y: bestY, score, leadId, rPk, expectedX: +expectedX.toFixed(2), err: +Math.abs(meanX - expectedX).toFixed(2) };
    };

    return {
      px, pxPerMs, colMs, pageMs, tAbs, tWin0, tPage0,
      scrollLeft: frame.scrollLeft,
      colsOffsetUniform: new Set(cols.map((k) => Math.round(k.tAbs - k.t0))).size === 1,
      rowCursors,
      rhyCursor,
      rhythmX: rhythm ? +rhythm.x.toFixed(2) : null,
      colCursorXs: [0, 1, 2, 3].map((col) => +(cols.find((k) => k.col === col && k.row === 0).x).toFixed(2)),
      // Check col 0 (I, II, III, II rhythm), col 2 (V1, V2, V3, II rhythm), col 3 (V4, V5, V6, II rhythm) on beat 1
      qrsCol0Beat1: [0, 1, 2, 3].map((r) => qrsPeak(r, 0, 2)),
      qrsCol2Beat1: [0, 1, 2, 3].map((r) => qrsPeak(r, 2, 2)),
      qrsCol3Beat1: [0, 1, 2, 3].map((r) => qrsPeak(r, 3, 2))
    };
  });
}

// Sample 12-lead at four times across wraps: t=400, t=1840, t=2650 (after 2.4s col wrap), t=9850 (after 9.6s rhythm wrap)
const samples12 = [];
for (const t of [400, 2200, 2650, 9850]) {
  await page.evaluate((t) => { window.ecg3d.play(false); window.ecg3d.setPageTime(t); }, t);
  await page.waitForTimeout(80);
  samples12.push(await inspect12Lead(page));
}

let ecg12AlignOk = true;
const alignDetails = [];
for (const s of samples12) {
  // All 3 rows in each column must have identical pixel cursor X (spread <= 1 px)
  for (let col = 0; col < 4; col++) {
    const xs = [0, 1, 2].map((r) => s.rowCursors[r][col].x);
    const geo = s.colCursorXs[col];
    const spread = Math.max(...xs) - Math.min(...xs);
    const geoErr = Math.max(...xs.map((x) => Math.abs(x - geo)));
    if (spread > 1 || geoErr > 1.5) { ecg12AlignOk = false; alignDetails.push({ t: s.tAbs, col, xs, geo, spread, geoErr }); }
  }
  // Equal inter-column cursor spacing (every column cursor is at the exact same offset within its 2400 ms column)
  const colW = s.colMs * 0.025 * s.px;
  for (let col = 1; col < 4; col++) {
    if (Math.abs((s.colCursorXs[col] - s.colCursorXs[0]) - col * colW) > 0.5) {
      ecg12AlignOk = false; alignDetails.push({ t: s.tAbs, colCursorXs: s.colCursorXs, colW });
    }
  }
  // Rhythm cursor aligns with active column's cursor
  const activeCol = Math.floor((s.tAbs % s.pageMs) / s.colMs);
  const colX = s.colCursorXs[activeCol];
  if (Math.abs(s.rhythmX - colX) > 0.5 || Math.abs(s.rhyCursor.x - colX) > 1.5) {
    ecg12AlignOk = false; alignDetails.push({ t: s.tAbs, activeCol, rhythmX: s.rhythmX, rhyPixel: s.rhyCursor.x, colX });
  }
  // Each lead rendered QRS peak/nadir matches the shared-clock expected X within 1.5 px across rows 0..3
  for (const [tag, arr] of [["col0b1", s.qrsCol0Beat1], ["col2b1", s.qrsCol2Beat1], ["col3b1", s.qrsCol3Beat1]]) {
    if (arr.some((a) => a.err > 1.5 || a.score === 0)) {
      ecg12AlignOk = false; alignDetails.push({ t: s.tAbs, tag, arr });
    }
  }
}
if (ecg12AlignOk) {
  pass("12-lead ECG: sweep cursors and QRS beats align vertically across all 12 leads and the rhythm strip", {
    colMs: samples12[0].colMs, pageMs: samples12[0].pageMs, pxPerMs: samples12[0].pxPerMs,
    col0Beats: samples12[0].qrsCol0Beat1.map((a) => a.x),
    col2Beats: samples12[0].qrsCol2Beat1.map((a) => a.x),
    col3Beats: samples12[0].qrsCol3Beat1.map((a) => a.x)
  });
} else {
  fail("12-lead ECG: sweep cursors and QRS beats align vertically across all 12 leads and the rhythm strip", alignDetails);
}

// Assert NO horizontal scroll or waveform translation between frames (before and after 2.4s & 9.6s wraps)
const ref0 = samples12[0].qrsCol0Beat1.map((a) => a.x);
const ref2 = samples12[0].qrsCol2Beat1.map((a) => a.x);
const ref3 = samples12[0].qrsCol3Beat1.map((a) => a.x);
let staticOk = true;
const shiftDetails = [];
for (const s of samples12) {
  if (s.scrollLeft !== 0) { staticOk = false; shiftDetails.push({ t: s.tAbs, scrollLeft: s.scrollLeft }); }
  s.qrsCol0Beat1.forEach((a, r) => {
    if (Math.abs(a.x - ref0[r]) > 1) { staticOk = false; shiftDetails.push({ t: s.tAbs, col: 0, row: r, x: a.x, ref: ref0[r] }); }
  });
  s.qrsCol2Beat1.forEach((a, r) => {
    if (Math.abs(a.x - ref2[r]) > 1) { staticOk = false; shiftDetails.push({ t: s.tAbs, col: 2, row: r, x: a.x, ref: ref2[r] }); }
  });
  s.qrsCol3Beat1.forEach((a, r) => {
    if (Math.abs(a.x - ref3[r]) > 1) { staticOk = false; shiftDetails.push({ t: s.tAbs, col: 3, row: r, x: a.x, ref: ref3[r] }); }
  });
}
if (staticOk) {
  pass("12-lead ECG: fixed monitor window does not shift beats horizontally across wraps (0.4s, 2.20s, 2.65s, 9.85s)", {
    col0Rxs: ref0, col2Rxs: ref2, col3Rxs: ref3
  });
} else {
  fail("12-lead ECG: fixed monitor window does not shift beats horizontally across wraps", shiftDetails);
}

if (errors.length === 0) pass("No console or page errors");
else fail("No console or page errors", errors);

await page.close();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? "FAILED " + failed.length + "/" + results.length : "ALL " + results.length + " PASSED");
process.exit(failed.length ? 1 : 0);
