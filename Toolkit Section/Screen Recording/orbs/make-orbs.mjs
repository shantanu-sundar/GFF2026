#!/usr/bin/env node
/* =====================================================================
 * Relay agent orbs -> looping GIF, blinking, on nothing.
 *
 * Not a re-animation of the orbs: a replay of the booth's own one. Four
 * things are carried over from ../booth.html rather than reinvented.
 *
 *   1. the artwork.  orb.html holds the .orb / .o1 / .o2 / .o4 rules as
 *      they are on the shelf, to the pixel.
 *
 *   2. the curve.  @keyframes eyeblink, 0.28s ease-in-out both:
 *      0%,100% scaleY(1); 45%,55% scaleY(0.08). CSS applies the easing to
 *      each keyframe SEGMENT, so this does too -- not once across the blink.
 *
 *   3. the schedule.  booth.html ~line 7157: every 900ms each orb rolls
 *      Math.random() and blinks on < 0.22, unless it is already blinking.
 *      Blinks therefore land on a 900ms grid, never between ticks, and this
 *      keeps that grid. The rolls come from a seeded PRNG so a re-run gives
 *      the same file; the law (p = 0.22, once per 900ms) is the page's.
 *
 *   4. the independence.  the page does querySelectorAll(...).forEach, so
 *      every orb rolls its OWN dice -- the shelf never blinks in unison.
 *      Each agent here gets its own stream, so three orbs sitting side by
 *      side stay out of step.
 *
 * Every frame of the timeline is emitted at 50fps -- 2 centiseconds, the
 * finest delay GIF can express exactly. Runs of bit-identical frames are
 * carried as one frame holding for the length of the run, which is what the
 * GIF encoder would do anyway and is pixel-identical at every instant. No
 * frame is dropped, decimated, resampled or approximated, and no PNG
 * sequence is left behind: frames live in memory and go straight to cgif.
 *
 *   node make-orbs.mjs                 all three, 512px
 *   node make-orbs.mjs --size 256      smaller
 *   node make-orbs.mjs --ticks 9       loop length, in 900ms ticks
 *   node make-orbs.mjs --seed 3        a different roll of the dice
 *   node make-orbs.mjs --out ./dist
 * ===================================================================== */

import { chromium } from 'playwright';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const SIZE  = Number(arg('size', 512));
const TICKS = Number(arg('ticks', 9));
const SEED  = Number(arg('seed', 3));
const OUT   = path.resolve(HERE, String(arg('out', '.')));

/* booth.html's constants, not new ones */
const TICK_MS  = 900;   // setInterval(..., 900)
const BLINK_P  = 0.22;  // if (Math.random() >= 0.22) return;
const BLINK_MS = 280;   // animation: eyeblink 0.28s
const FPS      = 50;    // 20ms = 2cs, exact in GIF's delay units
const FRAME_MS = 1000 / FPS;

/* the three agents on the shelf, in shelf order */
const AGENTS = [
  { cls: 'o1', file: 'orb-cart-recovery',    label: 'Cart Recovery' },
  { cls: 'o2', file: 'orb-payment-recovery', label: 'Payment Recovery' },
  { cls: 'o4', file: 'orb-emi-collection',   label: 'EMI Collection' },
];

/* ---------- the curve --------------------------------------------------- */

/* CSS ease-in-out is cubic-bezier(0.42, 0, 0.58, 1). Newton on x, read y. */
function bezier(t, x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (u) => ((ax * u + bx) * u + cx) * u;
  const dfx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  let u = t;
  for (let i = 0; i < 10; i++) {
    const e = fx(u) - t;
    if (Math.abs(e) < 1e-9) break;
    const d = dfx(u);
    if (Math.abs(d) < 1e-9) break;
    u -= e / d;
  }
  return ((ay * u + by) * u + cy) * u;
}
const easeInOut = (t) => bezier(t, 0.42, 0, 0.58, 1);

/* @keyframes eyeblink: 0%,100% scaleY(1); 45%,55% scaleY(0.08) */
function eyeblink(p) {
  if (p <= 0 || p >= 1) return 1;
  if (p < 0.45) return 1 + (0.08 - 1) * easeInOut(p / 0.45);
  if (p < 0.55) return 0.08;
  return 0.08 + (1 - 0.08) * easeInOut((p - 0.55) / 0.45);
}

/* ---------- the schedule ------------------------------------------------ */

/* mulberry32, so --seed makes a run reproducible. The test is the page's. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A blink runs 280ms and ticks are 900ms apart, so a blink can never straddle
 * the loop seam: the last one has ended 620ms before the loop comes round.
 * Re-roll only when the loop came up with fewer than two blinks, which as a
 * fixed loop would read as a still image rather than as a lazy one. */
function schedule(seed) {
  for (let s = seed; s < seed + 5000; s++) {
    const rand = prng(s);
    const at = [];
    for (let i = 0; i < TICKS; i++) if (rand() < BLINK_P) at.push(i * TICK_MS);
    if (at.length >= 2) return { at, seed: s };
  }
  throw new Error('no schedule found for seed ' + seed);
}

/* ---------- build ------------------------------------------------------- */

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const loopMs = TICKS * TICK_MS;
  const total  = Math.round(loopMs / FRAME_MS);

  console.log(`loop   ${(loopMs / 1000).toFixed(1)}s, ${total} frames @ ${FPS}fps (${FRAME_MS}ms = 2cs)`);
  console.log(`blink  ${BLINK_MS}ms ease-in-out, p=${BLINK_P} per ${TICK_MS}ms tick, per orb`);
  console.log(`out    ${SIZE}px, transparent, ${OUT}\n`);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: SIZE + 40, height: SIZE + 40 },
    deviceScaleFactor: 1,
  });
  await page.goto(url.pathToFileURL(path.join(HERE, 'orb.html')).href);

  for (const [i, a] of AGENTS.entries()) {
    /* each orb rolls its own dice, as it does on the shelf */
    const { at, seed } = schedule(SEED + i * 101);

    /* the full timeline: one scaleY per frame, every frame, no gaps */
    const timeline = [];
    for (let f = 0; f < total; f++) {
      const t = f * FRAME_MS;
      let k = 1;
      for (const b of at) {
        if (t >= b && t < b + BLINK_MS) { k = eyeblink((t - b) / BLINK_MS); break; }
      }
      timeline.push(Number(k.toFixed(6)));
    }

    /* collapse runs of the identical frame into one frame + a longer hold.
     * Lossless: what is on screen at any instant is unchanged. */
    const runs = [];
    for (const k of timeline) {
      const last = runs[runs.length - 1];
      if (last && last.k === k) last.ms += FRAME_MS;
      else runs.push({ k, ms: FRAME_MS });
    }

    await page.evaluate(([cls, size]) => window.setOrb(cls, size), [a.cls, SIZE]);
    const el = page.locator('#orb');

    /* render each distinct eye state once, reuse it wherever it recurs */
    const cache = new Map();
    for (const r of runs) {
      if (cache.has(r.k)) continue;
      await page.evaluate((v) => window.setEye(v), r.k);
      const png = await el.screenshot({ omitBackground: true });
      cache.set(r.k, await sharp(png).ensureAlpha().raw().toBuffer());
    }

    const strip = Buffer.concat(runs.map((r) => cache.get(r.k)));
    const delay = runs.map((r) => r.ms);
    const raw = { width: SIZE, height: SIZE * runs.length, channels: 4, pageHeight: SIZE };

    const gif  = path.join(OUT, `${a.file}.gif`);
    const webp = path.join(OUT, `${a.file}.webp`);
    const png  = path.join(OUT, `${a.file}.png`);

    await sharp(strip, { raw })
      .gif({ colours: 255, dither: 0, effort: 10, loop: 0, delay })
      .toFile(gif);

    /* GIF alpha is 1 bit, so the antialiased rim is cut to a hard edge. The
     * same timeline as animated WebP keeps the real alpha, for anywhere that
     * can take it. */
    await sharp(strip, { raw })
      .webp({ quality: 90, effort: 6, loop: 0, delay })
      .toFile(webp);

    /* and the orb standing still, for slides and stickers */
    await sharp(cache.get(1), { raw: { width: SIZE, height: SIZE, channels: 4 } })
      .png({ compressionLevel: 9 }).toFile(png);

    const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + 'K';
    console.log(
      `${a.label.padEnd(17)} blinks at ${at.map((b) => (b / 1000).toFixed(1)).join(', ').padEnd(20)} ` +
      `seed ${String(seed).padEnd(5)} ${String(runs.length).padStart(3)} gif frames  ` +
      `gif ${kb(gif)} · webp ${kb(webp)} · png ${kb(png)}`
    );
  }

  await browser.close();
  console.log('\nno frame sequence written to disk — frames were held in memory');
})();
