/**
 * Build the Figma import sheets for the booth: every screen of the section laid
 * out side by side as static artboards, so ONE html.to.design import brings the
 * whole thing into Figma.
 *
 * Why this exists: the section builds each beat at runtime and throws the
 * previous one away. Import `index.html` directly and you get three screens —
 * home plus the two pickers stacked invisibly — because the conversation does
 * not exist in the DOM until you tap through it, and the scenes are created and
 * destroyed per step. There is nothing there to capture.
 *
 * So this does not re-implement the screens. It DRIVES the real page — opens
 * each demo and plays it beat by beat — and snapshots `.screen` as it goes,
 * then re-emits those snapshots against the section's own stylesheet. The
 * artboards are therefore the HTML's own output, not a second rendering of it,
 * and they cannot drift from it.
 *
 *   node scripts/build-all-screens.mjs            # the filmstrip
 *   node scripts/build-all-screens.mjs --beats    # the storyboard
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Two sheets, one capture rig.
 *
 *   (default)  all-screens.html        every distinct state — the filmstrip
 *   --beats    all-screens-beats.html  one board per beat  — the storyboard
 *
 * The filmstrip is what you import when you want the section's every frame in
 * Figma. The storyboard is what you hand a Figma AI agent, or wire as a
 * prototype: ~54 boards it can hold in its head, against ~196 it cannot. Both
 * come off the same page, so neither can drift from the other or from index.html.
 */
const BEATS = process.argv.includes('--beats');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'Toolkit Section', 'index.html');
const OUT = path.join(ROOT, 'Toolkit Section',
  BEATS ? 'all-screens-beats.html' : 'all-screens.html');
const URL = 'file:///' + SRC.replace(/\\/g, '/').replace(/ /g, '%20') + '?booth';

/* The demos, in the order the section presents them. `nav` entries are the
   picker screens, which are real screens too and need artboards of their own. */
const NAV = [
  { key: 'home', label: 'Home', fn: 'goHome' },
  { key: 'agents', label: 'Relay — agent shelf', fn: 'goAgents' },
  { key: 'tier2', label: 'Cashfree For Builders', fn: 'goTier2' },
];
const DEMOS = [
  { key: 'relayCart', label: 'Relay · Cart Recovery' },
  { key: 'relayPay', label: 'Relay · Payment Recovery' },
  { key: 'relayDun', label: 'Relay · Subscription Dunning' },
  { key: 'spark', label: 'Cashfree Spark' },
  { key: 'toolkit', label: 'Agent Toolkit' },
  { key: 'skills', label: 'Agent Skills' },
  { key: 'mcp', label: 'MCP Server' },
];

const src = fs.readFileSync(SRC, 'utf8');
const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const links = [...src.matchAll(/<link[^>]+rel="(?:preconnect|stylesheet)"[^>]*>/g)].map(m => m[0]).join('\n');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

/* Pass 1 — count the beats. Booth mode strips the step chrome, dots included,
   so the counting has to happen on the normal page. Counting by jumping until
   the screen stops changing would be guesswork; the dots are the real answer. */
await page.goto(URL.replace('?booth', ''), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const COUNTS = {};
for (const d of DEMOS) {
  COUNTS[d.key] = await page.evaluate(async (key) => {
    if (typeof window.openDemo !== 'function') return 0;
    window.openDemo(key);
    await new Promise(r => setTimeout(r, 420));
    return document.querySelectorAll('#dots > i').length;
  }, d.key);
}
console.log('beats per demo:', JSON.stringify(COUNTS));

/* Pass 2 — capture, in booth mode, where `.screen` is exactly 360x800. */
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

/** Snapshot `.screen` exactly as it stands, plus the chassis classes it needs. */
async function snap(name) {
  return await page.evaluate((n) => {
    const s = document.querySelector('.screen');
    const phone = document.querySelector('.phone');
    // `.gone` overlays are opacity:0 layers that would import as invisible
    // duplicates sitting on top of the real screen. Drop them from the capture.
    const clone = s.cloneNode(true);
    clone.querySelectorAll('.gone').forEach(e => e.remove());
    const r = s.getBoundingClientRect();
    return {
      name: n,
      phoneClass: phone ? phone.className : 'phone',
      screenClass: clone.className,
      html: clone.innerHTML,
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  }, name);
}

/* A beat is not a screen. `store` alone plays seven — collection, the press,
   the Cashfree loader, the drop-in, the scroll, paying, paid — and `call` and
   `cast` play several more. Snapshotting once per dot threw all of that away.
   So instead of jumping, PLAY the demo and record every distinct state.

   Sampling runs in-page on an interval rather than over the wire, and dedupes
   on a signature with the composer text and any mm:ss timer stripped — those
   change on every frame while typing or while a call clock runs, and would
   otherwise record fifty near-identical screens per prompt. */
async function installRecorder() {
  await page.evaluate(() => {
    window.__startRec = () => {
      window.__rec = [];
      const seen = new Set();
      window.__int = setInterval(() => {
        const s = document.querySelector('.screen');
        if (!s) return;
        const c = s.cloneNode(true);
        c.querySelectorAll('.gone').forEach(e => e.remove());
        const probe = c.cloneNode(true);
        const comp = probe.querySelector('.composer');
        if (comp) comp.textContent = '';
        const sig = probe.innerHTML.replace(/\d\d:\d\d/g, '').replace(/\s+/g, ' ');
        let x = 0;
        for (let i = 0; i < sig.length; i++) x = (x * 31 + sig.charCodeAt(i)) | 0;
        const key = x + '_' + sig.length;
        if (seen.has(key)) return;
        // Build the record BEFORE marking the signature seen. `.phone` is null
        // while the chassis is being swapped, and reading .className off it threw
        // *after* seen.add() — which marked the state recorded when it was not,
        // so every later occurrence was skipped too. MCP recorded 1 screen
        // instead of 29 that way. Nothing is marked seen until it is captured.
        const phone = document.querySelector('.phone');
        if (!phone) return;
        const r = s.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const rec = {
          phoneClass: phone.className,
          screenClass: c.className,
          html: c.innerHTML,
          w: Math.round(r.width), h: Math.round(r.height),
        };
        seen.add(key);
        window.__rec.push(rec);
      }, 110);
    };
    window.__stopRec = () => { clearInterval(window.__int); return window.__rec; };
  });
}

/** Advance one beat and wait for the run to put itself down.
 *
 *  This waits on `busy` — the page's own flag — and NOT on the recorder going
 *  quiet, which is what it did first and got wrong. While a prompt types, the
 *  only thing changing is the composer, and the recorder strips the composer
 *  out of its signature; so the recorder sits at the same count for a second or
 *  more mid-beat, the old wait read that as "finished", and fired next() again.
 *  next() while busy is ignored, so every remaining beat was swallowed and the
 *  demo never advanced — MCP recorded 1 screen out of 29. Quiescence of a
 *  deduped stream is not the same signal as the work being over. */
async function playBeat() {
  await page.evaluate(() => { if (typeof window.next === 'function') window.next(); });
  await settleBeat();
}

const shots = [];
const settle = (ms) => page.waitForTimeout(ms);

for (const nav of NAV) {
  await page.evaluate((fn) => window[fn](), nav.fn);
  await settle(420);
  shots.push({ group: 'Navigation', ...(await snap(nav.label)) });
}

/* Storyboard capture: get the run to beat `i`, settled, and no further.
 *
 * Driving this with a bare next() per beat is off by one. Opening a demo
 * schedules its OWN first advance about half a second later (__openTimer in
 * index.html), so by the time the page is ready the run is already on beat 1 —
 * and next() either no-ops against `busy` or double-steps past it, depending on
 * how long that beat's typing takes. Either way the caption lies about which
 * beat the board is.
 *
 * So this reads the run's own position instead of counting taps: advance only
 * while `at` is behind, never while `busy`, and return when `at` IS `i` and the
 * beat has put itself down. The short settle after that is for the CSS running
 * past the await — a checkout sliding in, a connect wire filling. */
async function reachBeat(i) {
  for (let t = 0; t < 140; t++) {
    const st = await page.evaluate(() => ({
      at: typeof at === 'number' ? at : -1,
      busy: typeof busy === 'boolean' ? busy : false,
    }));
    if (st.at >= i && !st.busy) { await settle(700); return st.at === i; }
    if (st.at < i && !st.busy) await page.evaluate(() => window.next());
    await settle(250);
  }
  return false;
}

if (!BEATS) await installRecorder();

for (const d of DEMOS) {
  const n = COUNTS[d.key];
  if (!n) { console.warn('  ! ' + d.key + ' produced no beats — skipped'); continue; }
  await page.evaluate((key) => window.openDemo(key), d.key);
  await settle(700);

  if (BEATS) {
    let drift = 0;
    for (let i = 0; i < n; i++) {
      if (!(await reachBeat(i))) drift++;
      shots.push({ group: d.label, ...(await snap(d.label + ' · ' + (i + 1) + '/' + n)) });
    }
    console.log('  ' + d.label.padEnd(32) + n + ' beats'
      + (drift ? '  ! ' + drift + ' off-position' : ''));
    continue;
  }

  await page.evaluate(() => window.__startRec());
  await settle(300);
  for (let i = 0; i < n; i++) await playBeat();
  const rec = await page.evaluate(() => window.__stopRec());
  rec.forEach((s, i) => shots.push({
    group: d.label, name: d.label + ' · ' + (i + 1) + '/' + rec.length, ...s,
  }));
  console.log('  ' + d.label.padEnd(32) + n + ' beats -> ' + rec.length + ' screens');
}

await browser.close();

/* ---- emit the sheet ---------------------------------------------------- */
const SHEET_TITLE = BEATS
  ? 'Cashfree booth — storyboard, one board per beat'
  : 'Cashfree booth — every screen';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const groups = [...new Set(shots.map(s => s.group))];
const body = groups.map(g => {
  const list = shots.filter(s => s.group === g);
  return `<section class="xb-flow">
  <h2>${esc(g)}</h2>
  <div class="xb-rail">
${list.map((s, i) => {
  const next = list[i + 1];
  const goto = next ? ` data-goto="${esc(next.name)}"` : '';
  return `    <figure class="xb-art">
      <figcaption>${esc(s.name)} <span>${s.w} × ${s.h}</span></figcaption>
      <div class="xb-frame" data-frame="${esc(s.name)}"${goto} style="width:${s.w}px;height:${s.h}px">
        <div class="${esc(s.phoneClass)} xb-phone" style="width:${s.w}px;height:${s.h}px">
          <div class="${esc(s.screenClass)}">${s.html}</div>
        </div>
      </div>
    </figure>`;
}).join('\n')}
  </div>
</section>`;
}).join('\n\n');

const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${SHEET_TITLE}</title>
${links}
<!-- GENERATED by scripts/build-all-screens.mjs${BEATS ? ' --beats' : ''}. Do not hand-edit: edit
     index.html and re-run. The stylesheet below is index.html's own, copied
     verbatim, so these artboards render identically to the section. -->
<style>
${styles}
</style>
<style>
/* ---- sheet chrome ----------------------------------------------------
   Everything above is index.html's stylesheet, copied verbatim. That means
   ANY class name used down here is a live collision risk: ".art" already
   exists up there as "position:absolute; pointer-events:none", which stacked
   all 54 artboards on top of each other at the same coordinates. Every class
   the sheet owns is therefore prefixed "xb-", and must stay that way — the
   section's stylesheet keeps growing and a generic name is a landmine.
   -------------------------------------------------------------------- */
body { margin:0; padding:48px 40px 96px; background:#14171A; font-family:'DM Sans',system-ui,sans-serif; color:#E8E6E1; }
.xb-flow { margin:0 0 64px; position:static; }
.xb-flow > h2 { margin:0 0 18px; font-size:12.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:#CEF993; }
.xb-rail { display:flex; flex-wrap:wrap; gap:40px; align-items:flex-start; position:static; }
figure.xb-art { margin:0; position:static; z-index:auto; pointer-events:auto; }
figure.xb-art figcaption { display:flex; gap:10px; align-items:baseline; margin:0 0 12px; font-size:12.5px; font-weight:600; color:#E8E6E1; }
figure.xb-art figcaption span { font-family:ui-monospace,Menlo,monospace; font-size:11px; font-weight:400; color:rgba(232,230,225,.36); }
/* the artboard: a fixed box holding one captured screen, nothing outside it */
.xb-frame { position:relative; overflow:hidden; background:#fff; flex:none; }
/* the capture came out of a phone chassis with a bezel; strip it so the
   artboard IS the screen — 360x800, the same box as an Android Large frame */
.xb-phone { position:relative; border:0 !important; border-radius:0 !important;
  box-shadow:none !important; transform:none !important; margin:0 !important;
  padding:0 !important; background:none !important; }
.xb-phone::before, .xb-phone::after { display:none !important; }
.xb-phone > .screen { position:absolute; inset:0; width:100% !important; height:100% !important; border-radius:0 !important; }
</style>
</head>
<body>

<div class="flow">
  <h2>${SHEET_TITLE}</h2>
</div>

${body}

</body>
</html>
`;

fs.writeFileSync(OUT, out, 'utf8');
console.log('\nwrote %s — %d artboards, %d groups%s',
  path.relative(ROOT, OUT), shots.length, groups.length,
  errors.length ? '\npage errors: ' + errors.slice(0, 5).join(' | ') : '');
