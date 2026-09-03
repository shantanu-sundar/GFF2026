# Relay agent orbs — blinking, no background

The three orbs off Relay's agent shelf in `../booth.html`, cut out and looping.
Nothing but the blink: no card, no ground, no shadow, no ring.

| file | agent | booth class |
|---|---|---|
| `orb-cart-recovery.*` | Cart Recovery | `.o1` — green, sky-blue crown, gold fleck |
| `orb-payment-recovery.*` | Payment Recovery | `.o2` — yellow into olive, cream left glow |
| `orb-emi-collection.*` | EMI Collection | `.o4` — lilac, gold spot, violet base |

Each name ships three ways:

- **`.gif`** — 512×512, transparent, loops forever. What was asked for.
- **`.webp`** — same timeline, animated, with real 8-bit alpha. GIF transparency
  is 1 bit, so GIF has to cut the antialiased rim to a hard edge; WebP doesn't.
  Use it anywhere that takes it — every current browser does.
- **`.png`** — the orb standing still, eyes open, for slides and stickers.

## It is the booth's blink, not a new one

`make-orbs.mjs` replays what `booth.html` does rather than re-animating it:

- **the artwork** — `orb.html` carries the `.orb` / `.o1` / `.o2` / `.o4` rules
  verbatim, so the gradients are the shelf's to the pixel.
- **the curve** — `@keyframes eyeblink`, 0.28 s, `scaleY(1)` → `0.08` at 45–55 %
  → `1`. `ease-in-out` is `cubic-bezier(.42,0,.58,1)` applied *per keyframe
  segment*, the way CSS does it, not once across the whole blink.
- **the schedule** — booth.html ~line 7157: every 900 ms an orb rolls
  `Math.random()` and blinks below 0.22. So blinks land on a 900 ms grid and
  never between ticks, and these do too.
- **the independence** — the page runs `querySelectorAll(...).forEach`, so every
  orb rolls its own dice and the shelf never blinks in unison. Each file here
  gets its own stream, so the three stay out of step side by side.

The loop is 8.1 s (nine 900 ms ticks) at 50 fps — 20 ms a frame, which is 2
centiseconds, the finest delay GIF can express exactly. Every frame of the
timeline is in the file. Runs of bit-identical frames are carried as one frame
holding for the length of the run, which is what a GIF encoder does anyway and
is pixel-identical at every instant; nothing is decimated or resampled.

A blink is 280 ms and ticks are 900 ms apart, so no blink can straddle the loop
seam — the last one ends 620 ms before the loop comes round.

## Two deliberate departures from the shelf

Both are about being a cut-out rather than a thing sitting on black:

- **no drop shadow.** `box-shadow: 0 8px 18px rgba(0,0,0,.5)` needs a ground.
  Without one it is a grey smudge.
- **no rim, and the artwork is clipped to the ball.** The
  `rgba(255,255,255,.2)` outline is a rim *light* off the black shelf and reads
  as a detached ring once the shelf is gone; and `.orb::before` is drawn 4 %
  oversized and blurred, which on black is a soft glow but on a cut-out is a
  fringe — and 1-bit GIF alpha turns a fringe into a crust. `overflow: hidden`
  cuts it clean. The inside of the ball is untouched.

## Rebuilding

```sh
node make-orbs.mjs                # all three, 512px, into this folder
node make-orbs.mjs --size 256     # the booth draws them at 17–58px
node make-orbs.mjs --ticks 12     # a longer loop, more blinks
node make-orbs.mjs --seed 11      # a different roll of the dice
node make-orbs.mjs --out ./dist
```

Needs `playwright` and `sharp`, both already in the repo root's `node_modules`.
Frames are held in memory and handed straight to the encoder — no PNG sequence
is written to disk.

`preview.html` shows the GIFs over checker, black, light and Cashfree green, at
full size and at shelf size, to check the alpha.
