# Booth build → video (the fast path)

One MP4 per flow. 720 × 1600, H.264, no audio. All seven in about four minutes.

> **There is a second, better renderer in this repo.**
> `Toolkit Section/Screen Recording/` replaces the page's clock and advances it
> by exactly 1/60 s per frame, so every frame is a real render rather than a
> sample — frame-exact, machine-independent, 1080 × 2400, with a ProRes master
> and a pacing dial. **That is the one to ship.** Its README said it had never
> been executed because Chromium could not be downloaded there; it has since
> been run in this repo and works (`node render.mjs --flow toolkit --preview 6`
> → 720 × 1600, 180 frames, clean).
>
> This script is the *fast* path, not the *good* one. It records in real time,
> so all seven flows land in ~4 minutes against ~40 for a full-quality
> deterministic pass. Use it to check a flow end to end, to re-shoot after a
> booth edit, or when a rough cut is all that's needed. Use the deterministic
> renderer for anything anyone else will watch.

```
node scripts/record-flows.mjs                     # all 7 flows, live
node scripts/record-flows.mjs --only relayEmi     # one flow
node scripts/record-flows.mjs --stills            # storyboard reels
node scripts/record-flows.mjs --scale 3 --fps 60  # 1080x2400
```

Output lands in `Split Version/video/`. It is **gitignored** — the renders are
reproducible from `booth.html` and weigh ~25 MB, so the script is the artefact,
not the files. Drop the ignore line if the booth machine needs them committed.

---

## The three routes, honestly

| | `Screen Recording/render` | this, `--live` | this, `--stills` |
|---|---|---|---|
| Method | virtual clock, 1/60 s per frame | real-time screencast | static artboards |
| Frames | every one a real render | sampled on repaint, ~14–30 fps | one per artboard |
| Determinism | same output on any machine | depends on machine load | exact |
| Resolution | up to 1440 × 3200, ProRes master | 720 × 1600 (`--scale 3` → 1080) | same |
| All 7 flows | ~40 min | ~4 min | ~3 min |
| Use | the deliverable | the check | a storyboard reel |

## Why neither live route is a slideshow

`motion-inventory.md` counts 26 `@keyframes` in this build, 12 of them
`infinite` — the mic breathing in the composer, the sandbox dot pulsing, the
call wire rippling between the agent and the buyer. Those have no start and no
end, so there is no pair of frames to interpolate between. Cut a video out of
the 303 static artboards and every one of them lands as a still.

So the default route does not cut frames together. It **plays the booth and
records it**, which is the same thing `motion-inventory.md` recommends when a
frame has to move: the real CSS, running, captured.

The geometry makes this clean. At a 360 × 800 viewport `booth.html` renders as
exactly the phone screen — `.screen` is at 0,0 and 360 × 800, no shell around
it. The viewport *is* the frame, so there is nothing to crop or letterbox.

## The two routes

| | `--live` (default) | `--stills` |
|---|---|---|
| Source | `booth.html`, playing | `Toolkit Section/all-screens.html` |
| Motion | all 26 animations, real timing | none — hard cuts |
| Frames | ~14–30 fps, screencast | one per artboard, `--hold` seconds each |
| Use | the thing you show people | a storyboard reel, deterministic to the pixel |

Both emit 720 × 1600, so they intercut without a resolution change.

## What the script had to get right

**It drives the real page.** `openDemo(key)`, then `next()` per beat, waiting on
the page's own `busy` flag — the rig `scripts/build-all-screens.mjs` proved.
Opening a demo schedules its *own* first advance (`__openTimer`), so a bare
`next()` per beat is off by one and either no-ops against `busy` or double-steps
past it. The loop reads `at` instead of counting taps.

**Beat counts come off the un-boothed page.** Booth mode strips the step chrome,
`#dots` included, so pass 1 loads `?booth=0` at 1280 × 900 just to count.

**Resolution comes from `?fit`, not `deviceScaleFactor`.**
`Page.startScreencast` captures the compositor surface in CSS pixels and its
`maxWidth`/`maxHeight` only ever shrink — set `deviceScaleFactor: 2` and the
frames still come back 360 × 800. `--force-device-scale-factor` doesn't help
either; Playwright's own `setDeviceMetricsOverride` overrides it back to 1.
`booth.html?fit=1` scales `.wrap` by `min(innerWidth/360, innerHeight/800)`, so
a 720 × 1600 viewport lays the phone out at 360 × 800 and rasterises it at 2×.
Verified against a 1:1 crop: a real 2× raster, not an upscale.

**Timing comes from the screencast, not from a clock.** Frames fire on repaint,
so they arrive unevenly and carry their own timestamps. The gap to the *next*
frame is how long this one was on screen; those durations go to the concat
demuxer and ffmpeg resamples to CFR. Encoding at a flat rate would speed up the
quiet stretches and slow the busy ones, which is exactly backwards. It is also
why Spark records 346 frames where Cart Recovery records 1519 — Spark is mostly
text and simply repaints less. Both play at the right speed.

**One context per flow.** The booth is a stateful prototype; a run left
half-played bleeds into the next take.

## Lead-in

Each take opens on Home, walks the picker the flow actually sits behind — the
agent shelf for the three Relay flows, Cashfree For Builders for Toolkit,
Skills and MCP — then opens the demo, all on one continuous tape. `--no-intro`
starts cold on the flow instead.

## Current output

| Flow | Beats | Frames | Length |
|---|---:|---:|---:|
| Relay · Cart Recovery | 8 | 1519 | 54.1s |
| Relay · Payment Recovery | 7 | 1263 | 45.2s |
| Relay · EMI Collection | 8 | 1528 | 54.4s |
| Cashfree Spark | 7 | 346 | 24.4s |
| Agent Toolkit | 7 | 647 | 23.9s |
| Agent Skills | 8 | 692 | 29.6s |
| MCP Server | 7 | 719 | 27.4s |

## One thing to know

`all-screens.html` was built before the flow now called **EMI Collection** was
renamed from Subscription Dunning, so `--stills` still labels that reel
`relay-subscription-dunning-storyboard.mp4`. The live route reads the key off
`booth.html` and is correct. Re-run `node scripts/build-all-screens.mjs` to
resync the sheet.
