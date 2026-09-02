# Taking the booth into Figma

`index.html` is the booth. It is also the worst thing you can hand Figma.

Import it directly and you get **three screens** — home plus the two pickers,
stacked invisibly on top of each other. The conversation does not exist in the
DOM until someone taps through it, and each scene is built and destroyed per
step, so at rest there is nothing there to capture. Every screen the booth shows
is a screen it has not made yet.

So the screens are *captured* instead, by driving the real page and snapshotting
`.screen` at every state. Two sheets come out of that, and which one you want
depends on who is reading it.

## Which file

| you are | use | boards |
|---|---|---|
| handing it to a Figma AI agent, or wiring a prototype | **`all-screens-beats.html`** | 54 |
| rebuilding the section frame by frame in Figma | **`all-screens.html`** | ~300 |
| after the checkout only | `checkout-frames.html` | 10 |
| after the eight-frame booth loop only | `booth-frames.html` | 8 |

**Start with `all-screens-beats.html`.** One board per beat — the settled end
state of each step, which is the state a designer or an agent actually means
when they say "the screen". 54 boards is a storyboard something can reason over.

`all-screens.html` is the filmstrip: every distinct state the page passes
through, prompt-typed and tool-running and answered, four to eight boards per
beat. Right when you want the in-between frames, far too much when you want the
design.

Both cover exactly the three tracks the booth presents, grouped and captioned:

- **Navigation** — Home, Relay agent shelf, Cashfree For Builders
- **Relay** — Cart Recovery, Payment Recovery, Subscription Dunning
- **Cashfree Spark**
- **Cashfree For Builders** — Agent Toolkit, Agent Skills, MCP Server

## The frames

Every board is **360 × 800 — Figma's Android Large**, and carries no phone body.

**Do not draw a phone around these.** Select the frames in Figma and set
**Prototype → Device → Android Large**; Figma renders the phone at Present time.
A bezel baked into the frame means the same screen has to shrink to fit inside
a second one, and the booth shows a *smaller* design for no gain.

Both sheets are fully self-contained — every image is a `data:` URI, no relative
paths, nothing to lose in transit. The one external dependency is the Google
Fonts link for **DM Sans**, which is deliberate: it is on Google Fonts, so Figma
already has it and the text lands as live text rather than as outlines.

## Importing

The sheets are static HTML with no scripts, which is what html.to.design wants.
Either path works:

- **From a URL** — drag the file onto <https://app.netlify.com/drop> and give
  html.to.design the address. Most reliable for a file this size.
- **From the tab** — open it in Chrome and capture with the html.to.design
  browser extension. Works straight off a `file://` path.

Pasting the HTML is not an option: the filmstrip is ~4.7 MB inline.

## Regenerating

Both sheets are **generated, never hand-edited**. Edit `index.html`, then:

```bash
node scripts/build-all-screens.mjs --beats   # all-screens-beats.html — 54
node scripts/build-all-screens.mjs           # all-screens.html — ~300
```

Each run drives the real page in a headless Chromium, so the artboards are the
booth's own output and cannot drift from it. They take a few minutes; the beats
are played, not faked, and a beat that types a prompt and calls a tool takes as
long here as it does at the booth.

Two things about the output, both known:

- **The filmstrip's board count moves between runs.** It samples on
  an interval and dedupes, so a frame that lands either side of a tick is in or
  out. The storyboard is stable at 54 — it is driven off the run's own beat
  position, not off a timer.
- **The storyboard warns when it is off-position.** `! n off-position` in the
  log means a beat did not settle where it was asked to, and that group's
  captions are not to be trusted. A clean run prints no such line.
