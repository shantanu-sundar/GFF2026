/**
 * Build `Toolkit Section/all-screens.html` — every beat of every demo, laid out
 * side by side as static artboards, so ONE html.to.design import brings the
 * whole section into Figma.
 *
 * Why this exists: the section builds each beat at runtime and throws the
 * previous one away. Import `index.html` directly and you get three screens —
 * home plus the two pickers stacked invisibly — because the conversation does
 * not exist in the DOM until you tap through it, and the scenes are created and
 * destroyed per step. There is nothing there to capture.
 *
 * So this does not re-implement the screens. It DRIVES the real page —
 * `openDemo()` then `jump(i)` for every beat — and snapshots `.screen` at each
 * one, then re-emits those snapshots against the section's own stylesheet. The
 * artboards are therefore the HTML's own output, not a second rendering of it,
 * and they cannot drift from it.
 *
 *   node scripts/build-all-screens.mjs
 *
 * `jump()` paints a beat's END STATE synchronously rather than animating into
 * it, which is what makes the capture deterministic.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'Toolkit Section', 'index.html');
const OUT = path.join(ROOT, 'Toolkit Section', 'all-screens.html');
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

const shots = [];
const settle = (ms) => page.waitForTimeout(ms);

for (const nav of NAV) {
  await page.evaluate((fn) => window[fn](), nav.fn);
  await settle(420);
  shots.push({ group: 'Navigation', ...(await snap(nav.label)) });
}

for (const d of DEMOS) {
  const n = COUNTS[d.key];
  if (!n) { console.warn('  ! ' + d.key + ' produced no beats — skipped'); continue; }
  await page.evaluate((key) => window.openDemo(key), d.key);
  await settle(420);
  for (let i = 0; i < n; i++) {
    await page.evaluate((i) => window.jump(i), i);
    await settle(520);
    shots.push({ group: d.label, ...(await snap(d.label + ' · ' + (i + 1) + '/' + n)) });
  }
  console.log('  ' + d.label.padEnd(32) + n + ' beats');
}

await browser.close();

/* ---- emit the sheet ---------------------------------------------------- */
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
<title>Cashfree booth — every screen</title>
${links}
<!-- GENERATED by scripts/build-all-screens.mjs. Do not hand-edit: edit
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
  <h2>Cashfree booth — every screen</h2>
</div>

${body}

</body>
</html>
`;

fs.writeFileSync(OUT, out, 'utf8');
console.log('\nwrote %s — %d artboards, %d groups%s',
  path.relative(ROOT, OUT), shots.length, groups.length,
  errors.length ? '\npage errors: ' + errors.slice(0, 5).join(' | ') : '');
