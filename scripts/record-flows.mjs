/**
 * Render one video per flow.
 *
 * Two routes, because "the frames" means two different things in this repo:
 *
 *   (default)  --live    Record `Split Version/booth.html` while it PLAYS.
 *                        The booth at a 360x800 viewport is exactly the phone
 *                        screen, 1:1, no shell — so a viewport screencast IS
 *                        the frame, with every one of the 26 @keyframes
 *                        animations, the typing, the call scene and the
 *                        checkout drop-in intact. A real recording of the
 *                        prototype, not a slideshow of it.
 *
 *              --stills  Build the same flows out of the static artboards in
 *                        `Toolkit Section/all-screens.html` — the 303 frames
 *                        that go to Figma. Hard cuts, no in-between motion,
 *                        deterministic to the pixel. The storyboard reel.
 *
 * The live route reuses the rig `build-all-screens.mjs` proved: drive the real
 * page (`openDemo`, `next`), wait on the page's own `busy` flag, never guess.
 *
 *   node scripts/record-flows.mjs                    # all 7 flows, live
 *   node scripts/record-flows.mjs --only toolkit     # one flow
 *   node scripts/record-flows.mjs --stills           # storyboard reels
 *   node scripts/record-flows.mjs --scale 3 --fps 60 # bigger, smoother
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOTH = path.join(ROOT, 'Split Version', 'booth.html');
const SHEET = path.join(ROOT, 'Toolkit Section', 'all-screens.html');
const OUTDIR = path.join(ROOT, 'Split Version', 'video');
const WORK = path.join(ROOT, '_probe', 'video-frames');

const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const STILLS = argv.includes('--stills');
const SCALE = Number(flag('scale', 2));       // 2 -> 720x1600
const FPS = Number(flag('fps', 30));
const HOLD = Number(flag('hold', 1.6));       // --stills: seconds per artboard
const TAIL = Number(flag('tail', 2.0));       // freeze on the last frame
const INTRO = !argv.includes('--no-intro');
const ONLY = flag('only', null);
const CRF = Number(flag('crf', 18));

/* The flows, in the order the booth presents them, with the picker each one
   actually sits behind — so the lead-in walks the path a visitor walks. */
const FLOWS = [
  { key: 'relayCart', slug: 'relay-cart-recovery',        label: 'Relay · Cart Recovery',        via: 'goAgents' },
  { key: 'relayPay',  slug: 'relay-payment-recovery',     label: 'Relay · Payment Recovery',     via: 'goAgents' },
  { key: 'relayEmi',  slug: 'relay-emi-collection',       label: 'Relay · EMI Collection',       via: 'goAgents' },
  { key: 'spark',     slug: 'cashfree-spark',             label: 'Cashfree Spark',               via: null },
  { key: 'toolkit',   slug: 'agent-toolkit',              label: 'Agent Toolkit',                via: 'goTier2' },
  { key: 'skills',    slug: 'agent-skills',               label: 'Agent Skills',                 via: 'goTier2' },
  { key: 'mcp',       slug: 'mcp-server',                 label: 'MCP Server',                   via: 'goTier2' },
];

const picked = ONLY && ONLY !== true
  ? FLOWS.filter(f => f.key === ONLY || f.slug === ONLY)
  : FLOWS;
if (!STILLS && !picked.length) { console.error('no flow matches --only ' + ONLY); process.exit(1); }

fs.mkdirSync(OUTDIR, { recursive: true });
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

/* ------------------------------------------------------------------ *
 * ffmpeg
 * ------------------------------------------------------------------ */

/**
 * Encode a list of stills into H.264, honouring a per-frame duration.
 *
 * The screencast fires on repaint, not on a clock — frames arrive unevenly and
 * carry their own timestamps. Feeding those durations to the concat demuxer and
 * letting ffmpeg resample to CFR keeps the real timing of the run; encoding the
 * frames at a flat rate would speed up the quiet stretches and slow the busy
 * ones, which is exactly backwards.
 */
function encode(frames, out, listName, vf) {
  const body = frames
    .map((f) => "file '" + f.file + "'\nduration " + f.dur.toFixed(4))
    .join('\n');
  // The concat demuxer drops the final entry's duration, so the last file is
  // repeated: that repeat is what actually holds the closing frame on screen.
  const last = "\nfile '" + frames[frames.length - 1].file + "'\n";
  fs.writeFileSync(path.join(WORK, listName), 'ffconcat version 1.0\n' + body + last);

  const r = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listName,
    ...(vf ? ['-vf', vf] : []),
    '-fps_mode', 'cfr', '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    out,
  ], { cwd: WORK, stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('ffmpeg exited ' + r.status + ' for ' + out);
}

/* ------------------------------------------------------------------ *
 * Route 1 — record the live booth
 * ------------------------------------------------------------------ */

async function live() {
  const browser = await chromium.launch({
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--hide-scrollbars',
    ],
  });

  /* Pass 1 — how many beats each flow has. Booth mode strips the step chrome,
     dots included, so the count has to be read off the un-boothed page. */
  const counter = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await counter.goto(fileUrl(BOOTH) + '?booth=0', { waitUntil: 'networkidle' });
  await counter.evaluate(() => document.fonts.ready);
  const COUNTS = {};
  for (const f of picked) {
    /* A key that no longer exists in DEMOS throws inside openDemo. That is
       worth reporting loudly per flow, but not worth losing the other six
       takes over — `relayDun` became `relayEmi` and killed a whole run. */
    try {
      COUNTS[f.key] = await counter.evaluate(async (key) => {
        if (typeof DEMOS !== 'object' || !DEMOS[key]) throw new Error('no such demo: ' + key);
        window.openDemo(key);
        await new Promise((r) => setTimeout(r, 450));
        return document.querySelectorAll('#dots > i').length;
      }, f.key);
    } catch (e) {
      COUNTS[f.key] = 0;
      console.warn('  ! ' + f.key + ': ' + String(e.message || e).split('\n')[0]);
    }
  }
  await counter.close();
  console.log('beats per flow: ' + JSON.stringify(COUNTS));

  for (const f of picked) {
    const n = COUNTS[f.key];
    if (!n) { console.warn('  ! ' + f.key + ' produced no beats — skipped'); continue; }

    /* A fresh context per flow: the booth is a stateful prototype, and a run
       left half-played would bleed into the next take.
     *
     * Resolution comes from the booth's own `?fit`, NOT from deviceScaleFactor.
     * `Page.startScreencast` captures the compositor surface in CSS pixels and
     * its maxWidth/maxHeight only ever shrink — set deviceScaleFactor: 2 and
     * the frames still come back 360x800. `?fit` instead scales `.wrap` by
     * min(innerWidth/360, innerHeight/800), so a 720x1600 viewport lays the
     * phone out at 360x800 and rasterises it at 2x. Verified crisp: it is a
     * real 2x raster, not an upscale. */
    const ctx = await browser.newContext({
      viewport: { width: 360 * SCALE, height: 800 * SCALE },
      reducedMotion: 'no-preference',
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(fileUrl(BOOTH) + '?booth=1&fit=1', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);

    fs.mkdirSync(path.join(WORK, f.slug), { recursive: true });

    const cdp = await ctx.newCDPSession(page);
    const shots = [];
    let i = 0;
    cdp.on('Page.screencastFrame', (ev) => {
      const rel = f.slug + '/' + String(i++).padStart(5, '0') + '.jpg';
      fs.writeFileSync(path.join(WORK, rel), Buffer.from(ev.data, 'base64'));
      shots.push({ t: ev.metadata.timestamp, file: rel });
      // Chrome will not send the next frame until this one is acked.
      cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    });

    await cdp.send('Page.startScreencast', {
      format: 'jpeg', quality: 92, everyNthFrame: 1,
      maxWidth: 360 * SCALE, maxHeight: 800 * SCALE,
    });

    /* One continuous take: home, the picker this flow sits behind, then the
       run — so the lead-in and the flow share a clock. */
    if (INTRO) {
      await page.evaluate(() => window.goHome());
      await page.waitForTimeout(1300);
      if (f.via) {
        await page.evaluate((fn) => window[fn](), f.via);
        await page.waitForTimeout(1400);
      }
    }

    await page.evaluate((key) => window.openDemo(key), f.key);
    await page.waitForTimeout(800);

    /* Read the run's own position rather than counting taps. Opening a demo
       schedules its own first advance (__openTimer), so a bare next() per beat
       is off by one and either no-ops against `busy` or double-steps past it. */
    for (let b = 0; b < n; b++) {
      for (let t = 0; t < 200; t++) {
        const st = await page.evaluate(() => ({
          at: typeof at === 'number' ? at : -1,
          busy: typeof busy === 'boolean' ? busy : false,
        }));
        if (st.at >= b && !st.busy) break;
        if (st.at < b && !st.busy) await page.evaluate(() => window.next());
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(500);   // let the CSS run past the await
    }
    await page.waitForTimeout(1200);

    await cdp.send('Page.stopScreencast').catch(() => {});
    await page.waitForTimeout(300);
    await ctx.close();

    if (!shots.length) { console.warn('  ! ' + f.slug + ' captured no frames'); continue; }

    /* Screencast timestamps are absolute seconds; the gap to the NEXT frame is
       how long this one was on screen. The last one gets the tail freeze. */
    shots.sort((a, b2) => a.t - b2.t);
    const frames = shots.map((s, k) => ({
      file: s.file,
      dur: k === shots.length - 1
        ? TAIL
        : Math.min(Math.max(shots[k + 1].t - s.t, 1 / 120), 2),
    }));
    const out = path.join(OUTDIR, f.slug + '.mp4');
    encode(frames, out, f.slug + '.txt');
    const secs = frames.reduce((a, b2) => a + b2.dur, 0);
    console.log('  ' + f.label.padEnd(34) + n + ' beats · ' + shots.length + ' frames · '
      + secs.toFixed(1) + 's -> ' + path.relative(ROOT, out)
      + (errs.length ? '  ! ' + errs.length + ' page errors' : ''));
  }
  await browser.close();
}

/* ------------------------------------------------------------------ *
 * Route 2 — the static artboards, cut as a storyboard reel
 * ------------------------------------------------------------------ */

async function stills() {
  const browser = await chromium.launch({ args: ['--hide-scrollbars'] });
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 }, deviceScaleFactor: SCALE,
  });
  await page.goto(fileUrl(SHEET), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);

  /* all-screens.html groups the 303 artboards into <section class="xb-flow">.
     Read the grouping off the page rather than re-deriving it here, so the
     reels and the Figma import can never disagree about what a flow contains. */
  const groups = await page.evaluate(() =>
    [...document.querySelectorAll('section.xb-flow')].map((sec, si) => {
      const h = sec.querySelector('h1, h2, h3, .xb-flow-title, header');
      return {
        si,
        title: (h && h.textContent.trim()) || 'flow ' + (si + 1),
        count: sec.querySelectorAll('.xb-frame').length,
      };
    })
  );

  for (const g of groups) {
    const slug = g.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      || ('flow-' + (g.si + 1));
    if (ONLY && ONLY !== true && !slug.includes(String(ONLY).toLowerCase())) continue;
    fs.mkdirSync(path.join(WORK, 'st-' + slug), { recursive: true });

    const els = await page.$$('section.xb-flow:nth-of-type(' + (g.si + 1) + ') .xb-frame');
    const frames = [];
    for (let k = 0; k < els.length; k++) {
      const rel = 'st-' + slug + '/' + String(k).padStart(5, '0') + '.png';
      await els[k].screenshot({ path: path.join(WORK, rel) });
      frames.push({ file: rel, dur: k === els.length - 1 ? TAIL : HOLD });
    }
    if (!frames.length) continue;
    /* The artboard's own border rides along in an element screenshot, so the
       stills come out 720x1602 while the live takes are 720x1600. Normalise,
       or the two reels cannot be intercut without a resolution change. */
    const out = path.join(OUTDIR, slug + '-storyboard.mp4');
    encode(frames, out, 'st-' + slug + '.txt',
      'scale=' + (360 * SCALE) + ':' + (800 * SCALE) + ':flags=lanczos');
    console.log('  ' + g.title.padEnd(34) + frames.length + ' artboards -> '
      + path.relative(ROOT, out));
  }
  await browser.close();
}

console.log(STILLS
  ? 'storyboard reels from all-screens.html'
  : 'live capture from booth.html  (' + (360 * SCALE) + 'x' + (800 * SCALE) + ' @ ' + FPS + 'fps)');
await (STILLS ? stills() : live());
console.log('\ndone -> ' + path.relative(ROOT, OUTDIR));
