# Agent Toolkit — interactive section

A sibling to the Checkout360 section in `../Checkout Screen/`. Same dark bento shell,
a phone in the middle you tap through.

## Open it

Double-click `index.html`. That's the whole setup — no server, no build, no npm,
and no connection to the Next.js app on localhost. It is one self-contained file.

## `checkout-frames.html` — the same screens as Figma artboards

`index.html` is a website section; `checkout-frames.html` is a **sheet of artboards**
of the checkout, for importing into Figma and wiring as a prototype. Ten frames, two
flows, each a fixed-pixel box with nothing outside it that can reflow it.

**Why it is a separate file rather than a switch on the section.** The section draws
the storefront and the drop-in *inside* a 596×376 laptop lid, so its type bottoms out
at 8px and every padding in it is tuned to that lid. Import that and you get a postage
stamp — legible on screen only because it is 596px of a 1440px page. The artboards are
drawn at the size the design is actually specified at.

Neither size is invented. Every export in `../Checkout Screen/` is **720×1600** — a 2×
export, so **360×800** is the native mobile frame. The desktop frames are the ShirtShop
browser lifted off the lid onto **1280×800**.

| # | frame | size | flow |
|---|---|---|---|
| 01 | Checkout — Base | 360×800 | A · Cashfree Checkout, mobile |
| 02 | Pre-filled Delivery Address | 360×800 | A |
| 03 | Contextual Cross-selling | 360×800 | A |
| 04 | Instant Coupons & Discount | 360×800 | A |
| 05 | Smart Preferred paymode | 360×800 | A |
| 06 | Payment Successful | 360×800 | A |
| 07 | ShirtShop — Our Collection | 1280×800 | B · ShirtShop, desktop |
| 08 | ShirtShop — Payment | 1280×800 | B |
| 09 | Cashfree Drop-in | 1280×800 | B |
| 10 | Payment Successful | 1280×800 | B |

**Frames 02–05 are one screen, not four designs.** The four reference stills
(`Address.png`, `AOV.png`, `Offers.png`, `Preffered method.png`) are all the same base
checkout with everything dimmed except one element, a green heading, a curved arrow and
a Next pill. That is a prototype flow drawn as stills — so it is rebuilt as one overlay
that moves, and the highlighted element is the *same markup* re-emitted above the dim at
its measured box.

**The wiring is written into the markup.** Every frame carries `data-frame` and every
tappable element carries `data-goto` naming the frame it advances to, so the prototype
links survive the import as text and can be reconnected in one pass. `Next` runs
01→02→03→04→05, `Pay Now` on 05 lands on 06; on the desktop side Add to Cart → 08,
Proceed to Pay → 09, State Bank → 10.

**Nothing here was eyeballed.** The colours are sampled off `OCC + AOV.png` by scanning
for boundaries — header `#035D32`, promo strip `#1C6D46`, secured band `#0B6339`, ground
`#F8F7F7`, pay bar `#1F1E1E`, offer tint `#F4FCF8`. The dim is not plain black either: a
`#2C2A2A` pixel under it reads `#111111`, which resolves to ~86% of a near-black with a
faint green cast. The two mugs and the merchant logo are cropped out of the same export
and inlined as data URIs, so the file resolves no relative paths.

### Rules for editing it

These are what keep the import clean, and every one of them is a lesson:

- **px only.** No `vh`/`vw`/`%`, no `clamp()`, no `calc()` against the viewport.
- **No `backdrop-filter`, `filter`, `mix-blend-mode` or `transform`** on a frame or
  anything inside one. Importers rasterise or drop all four, and you lose the layer you
  cared about. This is why the artboards do *not* inherit the section's liquid-glass.
- **Solid fills and plain linear-gradients only.**
- **Icons are inline `<svg>` with explicit width/height** — no sprites, no `<use>`, no
  icon fonts.
- **DM Sans only**, because it is on Google Fonts and therefore present in Figma. Do not
  reach for a font the importer cannot resolve.

### Edit frame 01, then re-run the generator

The base screen exists **once**, in frame 01 between the `CO:START` / `CO:END` markers.
`scripts/build-checkout-frames.py` stamps it into 02–06 between `GEN:START` / `GEN:END`
and inlines the photography:

```
python scripts/build-checkout-frames.py
```

Edit frame 01 and re-run. **If you edit a generated frame instead, the next run silently
overwrites you** — that is the whole reason the base is not written out five times by
hand, since five hand-maintained copies are how they drift apart.

Verified in Chromium (Playwright, real Chrome): all ten frames report their exact
declared size, zero scroll overflow, zero elements past the artboard edge, zero clipped
text, every image decoded, no console errors. A clipped-text check is worth keeping in
any harness you write against this file — a caption one pixel wider than its box is
invisible in a screenshot and arrives in Figma as a truncated layer.

## `booth-frames.html` — the eight-frame loop for the booth

Generated, not hand-written. Eight frames, every one **360×800 — Figma's Android Large**,
so they drop straight into the prototype file next to the Index / Index L2 frames already
there:

`B01 Introducing Checkout 360` → `B02 Shopping Cart` → `B03 Checkout — Base` →
`B04`–`B07` the four feature callouts → `B08 Payment Successful` → **back to `B01`.**

**Do not draw a phone around these.** Select the frames in Figma and set
**Prototype → Device → Android Large**; Figma renders the phone body itself at Present
time. A shell baked into a 360×800 frame would eat ~40px a side and shrink the actual
checkout — the booth would show a *smaller* design, not a bigger one.

`B03` and `B08` carry their `data-goto` **on the frame element itself**, meaning the whole
frame is the hotspot. A booth crowd jabs at the screen rather than hunting for the one live
element, and `B08` looping back to `B01` is what lets the thing run unattended all day.

The cart totals **₹1,530**, which is exactly what the checkout then charges. Two of its
three rows are tinted tiles rather than photographs: the reference export contains only two
mug images, and the green one is reserved for the checkout's cross-sell card — putting it in
the cart as well would have the buyer cross-sold something already in their basket. The
markup takes an `<img>` in place of the `<span>` unchanged when there is real photography.

## Index and L3 — the navigation in front of it all

Flow D in `checkout-frames.html`, built to the frame spec from the Figma file rather than to
a guess: **Index 360×902, `#000000`**, column, padding 8, gap 8; **Index L3 360×800,
`#010101`**, padding 8. (The L3 spec says `flex-direction: row` — that is the outer wrapper
holding one full-width column, so the content here is a column inside a row and the geometry
is identical.)

| frame | what it is |
|---|---|
| `N01 Index` | the black bento. Checkout360 → `B01`, Relay → `N02`, For Builders → `N03`; the rest are `locked` tiles |
| `N02 L3 · Relay` | Cart Recovery, Payment Recovery, Subscription Dunning |
| `N03 L3 · Cashfree For Builders` | Agent Toolkit, Agent Skills, MCP Server |

**The copy on those six cards is lifted verbatim from the `DEMOS` blurbs in `index.html`,**
so the booth says exactly what the section says. Do not paraphrase it in one place only.

> **This Index has diverged from the section's home grid and has not been re-cut.** That grid
> is now three tiles (Relay, Spark, Builders) with no locked cards; this one still carries the
> full bento. Deliberate for now — the booth deck is a different surface with different needs —
> but it is no longer true that one mirrors the other, and Spark is missing here entirely.

**The other tiles have no L3, on purpose.** Payouts, Subscriptions, AutoCollect, EasySplit,
CrossBorder and Settlements have no sub-items or descriptions anywhere in this repo, and a
booth screen is the last place to find out what a made-up product description sounds like.
They render as `locked` tiles with their existing tag and nothing else. Give them sourced
copy before wiring them.

The card arc is a **conic-gradient ring with a punched hole**, and the B01 blobs are
**radial-gradients** — not blurred divs. `filter: blur()` is the one thing that reliably
arrives in Figma as a flat raster, which is exactly the layer you would want to edit. Figma
has native angular and radial fills, so these survive as editable gradients.

> Two traps this cost, both worth remembering. The frame modifier for the 902-tall Index was
> first called `.idx` — the same class as the inner container — so `.idx`'s `padding: 8px`
> and `display: flex` landed on the *frame* too, insetting the screen and giving the artboard
> 16px of scroll. It is `.frame.idxf` now. And `.itile .nm` had `gap: 8px` for the icon,
> which also applied between the two spans of a two-tone name, rendering "AutoCollect" as
> "Auto Collect". The icon carries `margin-right` instead.

## The Figma file, and what "same as the HTML" means

<https://www.figma.com/design/W35CsMvurIhKQuC3Y8pZoB> — built natively with the Figma
plugin API, not imported. Every frame is **360×800, Figma's Android Large**.

**The standard is parity with `index.html`.** Anything below that is a defect, not a
trade-off, and this section exists so the gaps are visible instead of quietly shipped.

### Verified identical

| thing | how it was made identical |
|---|---|
| every prompt, tool line, reply, stat, tag | lifted verbatim from the `DEMOS` object — not paraphrased |
| the shelf card | `.acard`: `#0a0a0b`, `1px #2a2a2a`, radius 20, padding 13/14 |
| the chat | `.bubble-me` `#e6f7cd` + `rgba(0,122,76,.14)`, `.bubble-ai` white + `rgba(29,34,31,.10)`, asymmetric radii 17/17/17/6, `.toolrow` and `.ledger` on `#fafaf9` |
| the orbs | each CSS `radial-gradient(rx ry at cx cy)` converted stop-for-stop into a Figma radial fill, stacked in **reversed** order because CSS paints top-first and Figma's `fills` is bottom-first |
| the corner blobs | `.hblob` recipe as a gradient ellipse with a real Figma layer blur at 30, opacity 0.34 |
| screen structure | `ph-top` / `thread` / `ledger` / `composer`, thread bottom-aligned and clipped so turns accumulate and scroll off the top |

### Cannot be identical, and why

These are mechanism differences, not sloppiness. Each is a place where Figma has no
equivalent primitive:

- **`filter: blur(1.4px)` on `.orb::before`.** Figma has no per-fill blur, so the
  gradients are stacked on the ball itself. Reads the same; the layer tree differs.
- **The prompt typing into the composer.** Figma has no text-typing primitive. The
  prompt currently appears already sent. *Closable* by splitting each beat into a
  typing frame and a sent frame — 8 more frames per agent.
- **The `bead` travelling down the connect wire.** Replaced by a Smart Animate wire
  fill plus the switch throw, on a 0.35s auto-advance. The motion is there; the bead
  is not.
- **The blink** is a two-variant component swap on an After-delay loop, not a CSS
  `scaleY` keyframe. Same read, different mechanism.
- **The thread renders a window of the last ~5 turns**, where the HTML holds the whole
  transcript and lets `overflow: hidden` clip it. Identical on screen; a shorter layer
  tree underneath.

### Not built yet

**Cart Recovery and Subscription Dunning are built; Payment Recovery is not.** Payment
Recovery still runs the shorter shape — one drop-off beat, then the call, then Runs — with
different orbs, buyers and amounts. Spark has no screen. The For Builders demos open nothing.
Do not describe the file as complete.

> **The Figma file is now behind `index.html` on Cart Recovery, and this is the largest gap
> in it.** The section has since dropped the connect beat for all three Relay agents, put
> Relay's onboarding screen in front of the run, and grown Cart Recovery from seven beats to
> nine — her cart, then the exit prompt over that cart, and the payment she makes coming back
> through the link. So `CR0a`/`CR0b` (the connect frames the flow below opens on) are frames
> of a beat the section no longer plays, and three new frames are missing behind them. Re-cut
> Cart Recovery from `DEMOS.relayCart` before showing the prototype next to the section.

### The flow

`02 Relay — agents` → Cart Recovery card → `CR0a` **auto-advances after 0.35s** (that is
the connect animation) → `CR0b` → then every frame is a **whole-frame hotspot**, so a tap
anywhere advances. `CR7` returns to the shelf; `back` returns from anywhere.

> One trap: the frame modifier and the inner container must never share a class name —
> and in Figma the equivalent trap is windowing. `CR0b` first rendered **both** connect
> cards, idle and live, because the two states are alternatives but the window that picks
> a frame's turns was a contiguous range. Ranges cannot express "one of these two".

**Set `Prototype → Device → Android Large` by hand.** `prototypeDevice` is not writable
from the plugin API, and neither is the document name.

## Booth mode — the section as one 360x800 screen

The booth is an Android Large display stood on its end. What runs on it is the
**device**, not the page that explains the device, so `body.booth` keeps `.screen`
and throws the rest away: the eyebrow, the headline, the deck, the other bento
cards, the step list, the controls and the dots. Everything they said is already
said on screen, and a booth crowd reads the screen.

**Two ways in**, because there are two things to look at this on:

| | |
|---|---|
| the booth display | on automatically at **≤420 CSS px** — nobody types a query string into a kiosk at 9am |
| a laptop | **`index.html?booth`** forces it; `?booth=0` forces it off on a narrow window |

**No bezel** — the same rule the Figma frames follow. A phone body drawn around a
360x800 frame eats ~40px a side and shrinks the thing it frames, so the booth would
show a *smaller* design, not a bigger one. Figma draws the phone at Present time; a
booth display **is** the phone.

**The desktop section is untouched.** Every rule is scoped `body.booth`, so at 1440
the lid is still 596x376 and the terminal still has its file rail. Both were
verified in the same pass, and any change here should be.

**Booth mode must never depend on a viewport media query** — this is the rule the
whole section turns on. `?booth` sizes the *screen* to 360x800 while leaving the
*window* at whatever it is, so the two sizes are decoupled and any layout keyed to
`max-width` silently does the wrong thing on a laptop. Everything booth needs is
scoped to `body.booth` and carries its own copy. The check that enforces it is
running the same sweep at 360 and at 1440 and diffing the measurements: they must
come out identical, surface for surface.

### Agent Skills has no laptop on a booth screen

`setChassis()` still adds `.as-laptop` — **the JS is not branched** — it simply has
nowhere to widen to, and booth mode collapses both chassis shapes to the same 360x800
frame. The terminal then rides the stacked layout the `max-width: 700px` rules already
had: title bar, transcript, workspace rail under it, `$` prompt at the foot.

This does give up the one gesture the section made for Skills: the phone visibly
*widening* into a laptop when you tap in. What survives is the grammar — traffic
lights, JetBrains Mono, a `$` prompt, `~/ecommerce-app` and `claude code` in the
chrome, a light paper ground — and that is what says "this is a developer surface".
A 596px lid on a 360px screen would say it at 60% scale, which says nothing.

### The store had to be rebuilt, not reflowed

The `max-width: 700px` rules were written for a phone-**wide** laptop lid about 270px
tall, where the store's grid row is ~130px. They delete the section heading, the size
chips and **two of the three products** because nothing else fits in that band. A booth
screen inverts the problem — 360 wide but 800 tall, with height to spare — so booth
mode puts all of it back and lets the grid run down the page the way a phone shop does.

The type goes up with it. Every size in the store was picked against a 596px lid inside
a 1440px page; on a screen that *is* 360px the same numbers read as a picture of a
website rather than as a website.

**Proceed to Pay reorders.** A column is not a two-column layout stacked: `.st-side`
takes `order: 1` so the cart and the total come first and the button stays last, where
a thumb expects it.

**The drop-in becomes a bottom sheet** — full width, anchored to the bottom edge,
sliding up rather than scaling out of the centre. On the lid it is a narrow panel
floated over a browser page, because that is how Cashfree's checkout arrives on a
desktop site; on a 360-wide screen the page *is* a phone and the sheet behaves like
one. At that size the whole sheet fits, so the `.occ-scroll` glide has nothing left
to travel — which is the runtime measurement doing its job, not a bug.

> Four traps, all found by measuring rather than by looking.
>
> **The terminal stacked on the viewport, not on the screen.** The `max-width: 700px`
> rules already knew how to put the file rail under the transcript, and at a 360px
> viewport they fire — so booth mode looked right on the kiosk and in every 360-wide
> test. Open `?booth` on a 1440px laptop and the media query never fires: the 186px
> rail stays beside a **174px** transcript, and the install banner, the tool lines and
> the generated code are all cut in half. A layout that depends on how big the screen
> is cannot be keyed to how big the window is. `body.booth .screen.term` now carries
> its own copy of the stacking.
>
> **A one-column grid with a definite height is not a stack.** `.st-grid` is `flex: 1`,
> so setting `grid-template-columns: 1fr` gave three implicit rows that the browser
> sized to 190px each out of the 617px available — against 247px of content. Every card
> lost 58px off the bottom: the price, the stock pill and Add to Cart, i.e. the entire
> product. `align-content: start` does not help. It is `display: flex` now, and cards
> are `flex: none`.
>
> **The other bento cards are children of `.wrap`, not of `.bento`.** `body.booth
> .bento > .card:not(.demo)` matched nothing and five 382px-wide cards stayed on screen,
> stretching the centred grid to 384 and giving the whole document a horizontal scroll.
> The selector is `body.booth .card:not(.demo)`.
>
> **`.screen` was a scroll container it had no business being.** The four level panels
> carry `transform: scale(1.05)` while they are `.gone`, which overhangs 9px a side. The
> screen's `overflow: hidden` clipped it but still scrolled programmatically; booth mode
> uses `overflow: clip`, which clips without ever becoming a scroller.

## Three levels

The phone boots to a **home screen of three tiles — Relay, Spark, Cashfree For Builders —
drawn to the Figma index frame.** Pure black cards, a white line glyph, a two-weight wordmark,
a grey pill at the foot, and vivid gradient art bleeding off the right edge.

**Everything on that grid opens.** An earlier version carried nine more tiles — Checkout360,
Payouts, SecureID, Subscriptions, AutoCollect, EasySplit, CrossBorder, Settlements — all
locked "Live product" cards you could not tap. On a tap-through prototype that trains the
viewer that most of the screen is dead, and it buried the three cards that do something under
eight that do not. Three products, three tiles, nothing else.

The art is CSS, because this section ships as one self-contained file with no image assets:

- **`.art.blades`** — the Checkout 360 treatment, on Spark. Five narrow leaves fanned from one
  pivot below the card, tips pointing up and out, with a cyan bloom behind the cluster. The
  outer blades are darker than the inner ones; **that ordering, not a shadow, is what makes the
  overlaps read as depth**.
- **`.art.mesh`** — the treatment the wider reference tiles use, on Relay (`gold`) and Builders
  (`spectrum`). Overlapping colour fields blurred until the seams disappear.

All three cards on that grid are live. **Relay** opens straight from home, because it is a
Merchant Dashboard product rather than a builder tool — but it opens a *shelf* rather than a
demo, because Relay is a set of agents with one payment operation each. Pick an agent and its
own conversation runs. **Cashfree Spark** opens the **merchant dashboard** — the real Payments home, navy bar and welcome hero and product
cards — with a Spark button floating on it. Tapping that button starts the chat. **Cashfree
For Builders** opens **three more**. Each demo has its own steps, its own bottom panel and its own status chips:

| demo | what it shows | panel | provenance |
|---|---|---|---|
| **Relay · Cart Recovery** *(home → shelf → onboarding)* | **spoken** prompt → the month in a table → the template loads → test run → activate → her ₹2,598 One-Stop Shoppy cart → the exit prompt over that cart → **Relay calls Priya inside ten minutes** → the link, the UPI she went looking for, the tick → Relay reports it | Agent: trigger, condition, action, runs | Illustrative |
| **Relay · Payment Recovery** *(shelf → onboarding)* | **spoken** prompt → 38 failures by reason → Relay builds it → test run → activate → the buyer's own screen shows a ₹2,598 UPI decline → **Relay calls Rahul** → Runs tab | Agent: trigger, condition, action, runs | Illustrative |
| **Relay · Subscription Dunning** *(shelf → onboarding)* | **spoken** prompt → renewals by reason → the ready-made template loads → test run → activate → Rahul's ₹999 EMI bounces on Myra and the delivery pauses → **Relay calls Rahul** → he opens the link → the Cashfree checkout, credit card preselected → paid → Runs tab | Agent: trigger, condition, action, runs | Illustrative |
| **Cashfree Spark** *(home → dashboard)* | settlement asked and answered in Hindi → a customer's payment → a refund that **stops and asks** → say yes → a ₹500 link → WhatsApp → paid | Account: settlement, order, refund, link | Illustrative |
| **Agent Toolkit** | 6 tool calls: customer → ₹500 order → UPI → status → ₹200 refund → list | Merchant ledger, net position | **Real** captured sandbox run |
| **Agent Skills** *(light terminal, on a laptop)* | the real installer banner → pick Claude Code → the skill tree → restart → one prompt → keys + SDK → order + verification → the v3 checkout SDK → validation skill → ShirtShop → Proceed to Pay → the Cashfree drop-in pays | Workspace: the files it wrote and is reading | Illustrative, but the CLI output is the package's own |
| **MCP Server** | unsettled → next settlement → withdrawal cost → recon report → download → payment link | Account: settlement, report, link | Illustrative |

**Provenance is shown on screen, per demo.** Only the Toolkit demo is a recording of
something that happened; Relay, Skills and MCP use triggers, commands, file paths and tool
names taken verbatim from the Cashfree docs, with plausible stand-in amounts and ids. The badge
under the heading says which you are looking at, and it is green for real, amber for
illustrative. Do not relabel one as the other.

An adversarial fact-check pass against the docs removed, from earlier drafts: an invented
`src/webhooks/refund-status.ts` path, a fabricated "6 items" checklist count, a claim that
the skills update your order state at runtime (they generate code, they do not run it), and
two taglines that asserted more than the docs support.

## Most demos open by connecting — Spark does not

Connecting is the **first turn of the conversation**, not a gate in front of it. You ask to
connect, a card appears in the thread showing host on the left and Cashfree surface on the
right, the wire fills, the switch throws, and the assistant confirms — then the rest of the
prompts follow in the same scroll.

For **Agent Skills** the connect turn is the install itself — the real terminal command,
`npx @cashfreepayments/agent-skills add skills`, typed at a `$` prompt.

**Cashfree Spark has no connect beat at all, and neither do the three Relay agents** — and in
both cases that is the point rather than an omission. Every other demo bridges two things that
start apart — your app to the sandbox, Claude to the MCP server, a repo to the skills — and the
wire filling is that bridge being built. Spark bridges nothing: it is an assistant already
inside the merchant dashboard, "same dashboard, same login, same permissions, nothing to
install". Relay bridges nothing either, for exactly the same reason — it is a tab in the
dashboard the merchant already logged into. Animating a connection would have staged a step
that does not exist and contradicted the one line both products lead with. Segment 1 of Spark's
flow doc is "log in, click Spark", and Relay's equivalent is picking a ready-made agent off its
onboarding screen; both are played as an actual screen rather than as a step (see below), so
the runs themselves open on the merchant's first real prompt.

`connectStep` is therefore optional: `loadDemo()` prepends it when a demo has one and starts on
`steps[0]` when it does not, and the step counters on the cards add the extra beat the same way.
Only the three For Builders demos still carry one.

> **The Relay agents used to open on a connect card** — `Merchant Dashboard → Cashfree Sandbox`,
> via `Agents · Runs · Connections`. That was the Agent Toolkit's story wearing Relay's clothes,
> and it cost the run its first beat: a wire filling to a thing that was never apart. The
> `connect: {}` blocks are still in `DEMOS` for all three, unrendered. They are the recipe if a
> Relay agent ever does need to show what it is wired to — do not delete them, and do not
> re-prepend them either.

| demo | host | connects to | via |
|---|---|---|---|
| Relay · any agent | — | — | *nothing to connect; it is a tab in the dashboard* |
| Agent Toolkit | Your app | Cashfree Sandbox | `@cashfreepayments/agent-toolkit` |
| Agent Skills | Claude Code + Cursor | Cashfree Skills | `npx @cashfreepayments/agent-skills add skills` |
| MCP Server | Claude | Cashfree MCP | `mcp.cashfree.com/mcp` · OAuth |
| Cashfree Spark | — | — | *nothing to connect; it is already in the dashboard* |

## Picking an agent is two screens, not one

The Relay card opens a **shelf** (`#agents`, level 2b), and picking an agent off it opens
Relay's own **onboarding screen** (`#onboard`, level 2b-ii) before any chat starts:

```
home → Relay shelf → onboarding → the run
       #agents        #onboard      mode = 'demo'
```

`#onboard` is a replica of what a merchant actually meets the first time: a sparkle, *"Let's
get an agent on the clock"*, four ready-made templates — Dispute Defender, Failed Payment
Recovery, Subscription Dunning, Abandoned Cart Recovery — a **Show more**, and a black
**Build your own** under an *or*. The row matching the agent picked upstairs carries `.on`,
which is what highlights it, pulses it and makes it the **only clickable thing on the screen**.
Everything else is scenery, exactly the deal `#mdash` strikes with its one live Spark button.

**It is the one level in the section not dressed in the black bento or in Cashfree green.**
Relay's surface is a light card on a light ground with an indigo accent, and painting it in the
house palette would have made it read as a third Cashfree dashboard rather than as the product
the merchant is looking at.

The headline is the reference's, with one deliberate difference: the reference reads
*"Lets get an agent on the clock"*, missing its apostrophe. Every other string in this file is
set with a real `’`, so this one is too. **That is a typo worth reporting upstream**, not a
house-style decision.

Back retraces the way in, one level per press: run → onboarding → shelf → home. Which means a
Relay agent is three presses from home and Spark is two, and that asymmetry is correct — Spark
has one screen in front of it, Relay has two.

## Relay is a shelf, not a demo

Relay's landing page sells five agents, one per payment operation, so the Relay card opens a
picker before any chat starts: **Cart Recovery**, **Payment Recovery** and **Subscription
Dunning**. Clicking one loads that agent's own conversation — its own prompts, its own
trigger/condition/action, its own run — and the phone header then wears that agent's face so
you can never lose track of which of the three you are watching. Back from a demo returns to
the shelf; back from the shelf returns home.

The orbs are lifted from the beta-access form in `../Checkout Screen/relay-beta-form Final.html`
— same gradient recipes (`.o1`, `.o2`, `.o4`), same eyes. What is deliberately **not** lifted
is that form's cursor-following 3D tilt and pupil tracking: this shelf is a menu you click, the
card already answers the hover, and a ball leaning away from the pointer fights the tap it is
inviting. Only the blink is kept, because that is what makes an agent read as alive rather than
as an icon.

Names and one-liners follow the Relay landing page. **The shelf cards carry no stat pill at
all** — the card is now name, one-liner and the chevron. "20% carts recovered" and the two
"Relay template" pills were removed outright.

That history is worth keeping, because it is the second time these pills have been wrong. An
early draft showed "40% failed payments recovered" and "50% failed renewals recovered";
neither appears on the Relay landing page or anywhere in the docs, so both were replaced with
"Relay template" — accurate, but filler on a card that then read as though it were a metric.
Now the whole row is gone. **Do not reinstate a performance figure without a source you can
point at**, and do not add a pill just to balance the card.

(The `.acard .stat` rule is left in the stylesheet, unused. It is scoped to a selector that no
longer exists, so it costs nothing and it is the recipe if a sourced figure ever earns a place
back.)
The triggers, Connections and the Runs tab are the product's own vocabulary; the amounts, buyer
names and ids are plausible stand-ins — which is exactly what the amber provenance badge says.

Adding the other two agents from the landing page (Dispute Responder, COD Confirmation) is a
`DEMOS` entry plus one `.acard` in `#agents`, with the orb recipe copied from the beta form.
Adding a fourth *product* is one `.hcard` in `#hgrid` plus an `.art` recipe — but think twice:
the grid earns its clarity from having nothing on it that does not open.

## A Relay run is three segments, and two of them are not a chat

The three journey docs (`../Checkout Screen/Cart Recovery.docx`, `Payment Recovery.docx` and
`../Subscription Dunning.docx`) tell the same story in the same order, so all three agents on
the shelf run it:

| segment | what happens | who is on screen |
|---|---|---|
| **1 · set the agent up** | the merchant **speaks** the opening prompt, Relay answers with the month's numbers, loads the ready-made template, **test-runs it**, then asks before switching it on | the merchant |
| **2 · the drop-off** | the payment fails, or the cart is left at the payment step | **the buyer** |
| **3 · the call** | Relay rings the buyer, works the objection, sends a link | both |
| **4 · the payoff** *(Cart Recovery, Dunning)* | the buyer comes back through the link and pays | **the buyer** |

**Cart Recovery and Subscription Dunning run the whole arc; Payment Recovery does not yet.**
The extra beats they gained are the ones the docs actually describe:

| | Cart Recovery | Subscription Dunning | Payment Recovery |
|---|---|---|---|
| segment 2 | **two beats on one screen** — her cart, then the exit prompt over it | one beat: the push, the paused order and the EMI schedule | one beat |
| segment 4 | **three beats on the checkout** — the link she opens, the method, the tick | **three beats on the checkout** — Proceed to Pay, the method, the tick | none |

**Segment 2 is two beats and they are in that order for a reason.** You have to see the cart
before it can be abandoned: a "Leaving Checkout?" card with nothing behind it is a dialog, not
a drop-off. So the first beat draws One-Stop Shoppy's cart — ₹2,598, the kurta line and
`+1 more item`, shipping free, the `PREPAID_GIFT` strip — and the second lands the exit prompt
**as a sheet over that same cart**, which dims underneath rather than being replaced. The basket
she is walking away from stays on screen behind the question she is being asked.

### Relay says nothing for six beats, and that is the loudest thing it does

From her cart to the tick — the cart, the exit prompt, the call, the link, the method, the
payment — **not one beat on Cart Recovery carries a `say`.** The merchant types nothing either.
The composer reads *"Tap, it runs without you"* for the whole stretch, and Relay does not speak
again until it has something to report, which is the last beat and is that she paid.

That is the product's claim rendered as an interaction rather than asserted in a bubble. It is
also the reason `say` is optional: `runStep()` and `rebuild()` both guard it, as do the two
terminal painters. **Do not add narration back to those beats.** A sentence describing the
screen the viewer is already looking at is the agent talking about itself, and it costs the run
the one thing that makes it read as automatic.

The same discipline shortens segment 1. *"It's done. Would you like to do a test run?"* plus a
ledger that visibly fills in with the trigger, the condition and the action beats a paragraph
restating all three: one is a product doing something, the other is a chatbot narrating itself.

### The reason she gives is the reason the checkout answers

Priya ticks **"I didn't find the payment mode I was looking for"** on the way out. On the call
she says the same thing in her own words. Three beats later the method screen opens with **UPI
already selected**, carrying the note *"The mode she left the checkout looking for"*.

That chain is the whole demo. Break any link of it — change the ticked option, change her line,
change which method is picked — and the checkout screen goes back to being a screenshot of a
checkout. **The agent calls inside ten minutes, not thirty**, which is why the condition reads
`above ₹2,000 · idle 10 min` and the tool row says `called in 6 min`; those three numbers move
together.

`OSS_CART` / `OSS_CART_PAID` are **one cart read by the cart and exit beats**, the same
discipline `CART_ITEMS` follows in the Skills store and for the same reason: 1,299 × 2 = the
2,598 the exit prompt shows, 10% of which is the 260 the call gives away and the 2,338 the
checkout, the ledger and the Runs tab all report. Change one of those numbers and change the
constant, not the beat.

**Subscription Dunning ends on the checkout, and its segment 2 is an instalment rather than
a plan.** A failed renewal is the only failure in the set where the customer is not standing in
front of a checkout: they are asleep, or at work, and the only thing that reaches them is a
*push*. So segment 2 is a notification and an order history rather than an error page — Myra,
Rahul's Chikankari Kurta Set at `#4127`, and the EMI schedule showing instalment 2 of 3 bounced
on insufficient funds with the delivery paused behind it.

**The schedule is what gives the beat its stakes.** A paused SaaS plan is an abstraction; three
rows showing one instalment already paid, one failed and one still coming say that the customer
is committed, is not leaving, and has a delivery stuck behind ₹999. The `Retry payment` button
is drawn as a real CTA on purpose: it is the thing the agent exists to make unnecessary.

**Segment 3 does not stop at the call.** The call ends on `"Here's the payment link"`, and a
link that is never seen to open is an assertion, so the run follows it: Rahul opens the
Cashfree checkout with the instalment filled in and the late fee waived, the method list shows
the debit card that bounced greyed out *carrying its reason* next to the credit card the agent
recommended already selected, and then the tick. Three beats, one sheet — `paysheetHTML`'s
`step: 'review' | 'method' | 'done'`, so there is one header to keep in sync rather than three.

Keeping the failed card on the list is the point of the beat. Removing it would hide what the
agent's advice was *for*; leaving it there, greyed, with `Declined 1 Sep · insufficient funds`
under it, is what makes the preselected credit card read as a recommendation rather than a
default.

**The drop-in already in this file could not be reused.** `.store` / `.cf-pay` / `.cf-done`
belong to the Skills demo: they are a laptop-lid surface driven by the terminal step runner
(`s.term.kind === 'store'`), not something that can be dropped into a Relay chat bubble. So the
checkout is drawn at bubble width in the palette sampled off the real thing and shared with
`checkout-frames.html` — header `#035D32`, secured band `#0B6339`, ground `#F8F7F7`, pay bar
`#1F1E1E`.

### The thread scrolls, and the run survives in it

**You can scroll back through a finished run.** This is newer than most of the file and worth
knowing about, because three separate things had to change and fixing any one alone fixes
nothing:

1. `.thread` was `overflow: hidden`, so there was no scrolling at all.
2. It pinned the newest bubble down with `justify-content: flex-end`, which on a scrollable
   box clips the overflow at the **top** and puts it out of reach of any `scrollTop`. The
   bottom-pinning is now an `auto` top margin on the first child instead: it eats the slack
   while the thread is short, and resolves to zero the moment the thread is taller than the
   phone.
3. `add()` **deleted** every bubble past the 7th. That was free while everything above the
   fold was invisible anyway, but it meant a scrollbar would have revealed nothing. The cap is
   now a memory guard (200 bubbles, 400 in the terminal) that no demo comes near — a full
   Dunning run ends at 31.

**Following the bottom is driven by a `ResizeObserver`, not a timer.** A bubble is not its
final height when it is appended: the push slides in, the approval gate expands as it is
signed, the checkout's tick pops. Scrolling once at append time lands short, and — worse — the
gap it leaves reads as "the viewer scrolled up", which latches the follow off for the rest of
the run. Spark did exactly that from its approval beat onward, ending 1,181px short. The
`scroll` handler now ignores any event where `scrollHeight` changed, because that is the thread
growing rather than the viewer asking to read.

### Relay never speaks in em dashes

**Every `say` on the three Relay agents, the `live` card's body and every line the agent
speaks on a call are written without an em dash.** A dash where a comma, a colon or a full
stop would do is the single loudest tell that a sentence was generated rather than written,
and the whole point of these three demos is that a customer is about to hear this voice on a
phone call. `1,284 paid, but 412 walked` and `the execution history: every agent` say the same
thing without the tell.

The rule is scoped to **what Relay says**, not to the file. These keep theirs, and should:

| still has one | why |
|---|---|
| `blurb` | the section's own copy under the heading, outside the phone — the writer's voice, not the agent's |
| `ask` | the merchant talking. People do use em dashes |
| `head` / `reason` / `note` / `title` on `.buyscr` | the store's own screens and pushes: `Order on hold — EMI bounced` is a UI label |
| `5–7 business days` | an en dash in a number range, which is just correct typography |

**Check this whenever you add or reword a Relay reply.** Grepping the three `DEMOS` blocks for
`—` and confirming every hit is one of the four rows above takes ten seconds and is the only
thing standing between this and a slow drift back.

Segments 2 and 3 carry **no merchant prompt at all** — the composer reads "Tap — it runs
without you" rather than "Tap to continue". That is the product claim rendered as an
interaction: you stop typing and it keeps going. Nothing goes live unasked either; the test
run and the activation are both a separate yes, exactly as the docs script them.

Three set pieces carry the parts a chat bubble cannot:

- **`.vcap` — the voice capture.** A bar meter and a loose ring of Indic glyphs, the way the
  doc frames it. Not decoration: the reason a voice agent is worth building in this market is
  that the buyer is not answering in English. A step opts in with `voice: true`, and
  `listenAsk()` replaces `typeAsk()` — the words then resolve into the composer faster than
  fingers would type them.
- **`.buyscr` — the buyer's screen.** Drawn as its own small labelled device inside the thread
  so it can never be misread as the merchant's phone. Red for money that bounced, amber for
  money that walked, green for money that finally landed. **Everything below the brand bar is
  optional**, which is what lets one builder serve four quite different screens: a failed
  renewal passes `notif` + `banner` and no cart, an abandoned cart passes `cart` + `exit` and no
  head line. `cart` draws the basket the way the Skills store draws ShirtShop's — one line per
  item with its picture, then the totals — redrawn at phone scale rather than reusing `.st-cart`,
  whose 8px type is only legible because a 596px laptop lid puts it there. `exit` and `done` are
  the same `.bs-sheet` at the two ends of the story: the "Leaving Checkout?" prompt, and the
  receipt. `notif` draws a real push sitting on top of the app and `banner` slides the plan's
  new state up under the reason — *Subscription paused*, then *Subscription active*; a renewal
  failure has no page to fail on, so if the notification were only described in a sentence the
  beat would not land.
- **`.livecard` — "It's live".** The one reply in the setup segment that is not a sentence.
  Switching the agent on is the moment the merchant has been asked to consent to three times
  over, so it lands as a green card that says so rather than as a fourth bubble reading exactly
  like the three before it.
- **`.callscene` — Relay Calling.** Full screen, because that is what a call does to a phone.
  It rings, connects, runs a clock, and the halo and the meter between the two faces lean
  toward whoever is talking. The agent's own orb and colour come along, so a call always looks
  like it came from the agent you were just watching. It ends on what the call **produced** —
  a link, a code, a mandate — then hangs up and drops you back into the thread.

A fourth, `.brk`, answers the opening prompt: "the agent lists failed transactions with reasons
for failure" is five reasons and five amounts, which a sentence cannot hold, so it is a table.

Steps declare these with
`scene: { kind: 'brk' | 'buy' | 'live' | 'call' | 'gate' | 'approve' | 'wa', … }`
— the last three belong to Spark. `playScene()` runs them in `runStep()`; `rebuild()` repaints
the static ones and repaints the call **only if you landed on that beat**, because a call is a
moment rather than a state.

### The mark

`CX_ICON.cf` was a hand-drawn green chevron standing in for the Cashfree logo. It is the real
mark now (`../Default.png`), inlined as a base64 data URI so the section stays the **one
self-contained file** the top of this README promises — a relative `<img src>` would break the
moment anyone moved or emailed the file. One constant feeds every connect card, so replacing the
logo again is a one-line change. It renders through `img.cfmark`, which carries
`max-width/max-height: 100%` so it can never outgrow whatever box a call site hands it; the two
call sites that need a specific size (the 38px connect tile, the 14px WhatsApp link) set it.

**Relay has a mark too**, and the home screen uses it: `#card-relay`'s glass tile carries the
two-swoosh Relay logo (`../black -Logo.svg`) instead of the drawn glyph every other card gets.
Only the mark is lifted, not the lockup — that file sets the word "Relay" as a **black** path,
which would be invisible on a near-black card and a duplicate of the card's own label anyway.
The four gradients come along with their ids renamed `rl0`–`rl3`, because gradient ids are
global to the document and `paint0_linear_4_13` is exactly the kind of name a second pasted
logo would also bring. It runs at 21px rather than the 16px the glyphs use, since it is two
thin strokes rather than one solid shape.

> One trap worth remembering, and it has now bitten twice: the section subtitle up top is a bare
> `.sub { margin: 18px 0 0 }`, and it leaked into the call scene's caption spans and pushed them off their node. Those are
> `.cwho` now. The second time was the mark inside the WhatsApp link, on a `<span class="cf">`
> — which is also the bare class on the Cashfree drop-in modal in the store view, so it was
> inheriting `position: absolute`, `opacity: 0` and a `172px` grid track. That mark had never
> actually been visible; swapping in a real image is what made the 172px box obvious. It is
> `.cfl` now. Bare single-class rules in this file are shared ground — scope new ones.

## Spark stops before it moves money

Spark's run is the demo flow doc end to end (`../Cashfree Spark - Narrative (1).docx`), with the
claims it is meant to prove taken from the positioning doc (`Narrative (2).docx`).

| segment | what happens | who is on screen |
|---|---|---|
| **1 · log in, click Spark** | **the merchant dashboard itself** — a screen, not a step | the merchant |
| **2 · four prompts** | a settlement question **asked and answered in Hindi**, a customer's payment status, a refund that stops and asks, a ₹500 payment link | the merchant |
| **3 · tell the customer** | the merchant leaves Spark and messages the buyer; the new order is paid | **the buyer** |

### Segment 1 is a screen, not a step

Spark's pitch is that it is a layer on a dashboard you already have — *"same dashboard, same
login, same permissions, nothing to install"* — and that claim is only legible if you have seen
the dashboard it is sitting on. Told as a chat bubble it is a boast; shown as the Payments home
with a Spark button floating in the corner, it is just true.

So `#mdash` is a replica of that screen: the navy bar with the Cashfree mark, the apps grid,
Developers and Switch to Test; the purple welcome hero; and the Payment Gateway / Payment Links
/ Payment Forms cards with their Try Test Environment and View Docs buttons. Copy is verbatim.
**It is scenery — only the Spark button does anything**, and it pulses, because on a screen the
viewer has never seen before the eye needs telling where to go.

That makes it a level of its own (`mode = 'dash'`, z-index 12), modelled on the Relay shelf:
home → dashboard → chat going in, and Back retracing the same way out. The run itself is then
seven steps and opens cold on `मेरा अगला सेटलमेंट कब आएगा?`, because by then the merchant is
already inside a dashboard you watched them open.

> The card footer row is `.cfoot`, not `.cf`. `.cf` is the Cashfree drop-in overlay for the
> Skills store demo, which sits at `opacity: 0` until that demo opens it — and it swallowed the
> Try Test Environment row whole. Same trap as the `.sub` one below: **bare single-class rules
> in this file are shared ground.**

**The refund is two steps, not one, and that is the point.** The doc's control section says
reading is free and anything that moves money stops and asks; the demo would be claiming that
in a bubble if the refund happened on the turn the merchant asked for it. So the ask raises an
approval card and stops, and the money moves on the *next* turn, when the merchant says yes.
The card then stays in the thread wearing who signed it — *Approved by you · logged in the
audit trail* — which is the doc's other line ("a person approved it, so a person did it")
rendered as an interaction rather than asserted.

That card is also the only one in the section that renders **after** its own answer bubble
rather than before it, via `sceneLast: true` on the step. Otherwise the Yes/No buttons sit
above the sentence they are answering.

Two set pieces are new here; the other two are borrowed:

- **`.gate` — the approval card.** Amount, what it does, three facts to check it against, and
  two buttons. `playScene` adds it on the asking turn; the next step's
  `scene: { kind: 'approve' }` does **not** add a second card — `approveGate()` finds the one
  already in the thread and flips it. A second card would read as a second refund.
- **`.wa` — the buyer's WhatsApp.** Segment 3 is deliberately not a Cashfree surface: the
  merchant takes what Spark gave them and tells the customer. Drawn as its own labelled device
  for the same reason `.buyscr` is, and the payment link rides in it as a link chip.
- **`.brk`** carries the Hindi settlement answer, because a date, an amount, a cycle and a bank
  account are a table, not a sentence — and **`.buyscr` in its green `ok` tone** is the last
  beat, the doc's "screen cuts to payment successful".

**The tool rows name capability areas, not endpoints** — *Settlements*, *Payments and orders*,
*Refunds*, *Links and offers*. Those are the rows of the capability table in the positioning
doc. That doc names areas and names no API, so inventing endpoint names would have been the
one thing on screen with nothing behind it.

The Hindi is the doc's own prompt (`मेरा अगला सेटलमेंट कब आएगा?`) answered in Hindi, because the
doc's note on that beat is that Spark replies in the merchant's language — an English answer to
a Hindi question would have shown the opposite of the claim.

## Agent Skills is a terminal, on a laptop

Every other demo is a chat on a phone, because every other product is something a merchant
talks to. Skills is not: you run a command in your repo and your coding assistant reads the
skill files as it writes code. Rendering that as a phone chat made the one developer product
in the set look like the two merchant ones.

So that demo swaps the device. `surface: 'terminal'` on the demo does three things at once:

- **the chassis** — `.phone` gains `.as-laptop` (596×376 with a base lip) and the demo card
  gains `.wide`. The `.phone-wrap` keeps a `722px` min-height in both shapes, so opening
  Skills never reflows the card underneath. Both transition, so the phone visibly *widens*
  into a laptop when you tap in.
- **the screen** — `.screen.term` re-lays the same four children (`ph-top`, `thread`,
  `ledger`, `composer`) onto a CSS grid: title bar across the top, a file rail down the left,
  transcript and prompt to the right of it. Traffic lights, JetBrains Mono, a `$` prompt —
  and a **light** ground, the same warm liquid-glass paper as the rest of the section. A
  terminal is legible on paper as long as the grammar is intact; a dark slab in this layout
  read as a hole cut in the page.
- **the renderer** — `runStepTerm` / `paintStepTerm` replace the bubble pair with a shell
  line (`$ cmd` + ✔ output) or an assistant tool line (`● Read(path)` + `└ result`), plus a
  syntax-coloured code block where the assistant generated code.

**The last three beats leave the terminal.** The script's outro is the browser, not the
console ("Visual: Website check out - payments"), so `term.kind: 'store'` lifts a browser
over the whole laptop screen and `term.view` says which page it is on:

| `view` | what is on screen |
|---|---|
| `collection` | **ShirtShop** — indigo nav, Our Collection, size chips, Add to Cart |
| `payment` | the Address ✓ / Review ✓ / **Payment** stepper, "Pay securely with Cashfree", **what is in the cart**, the order summary and **Proceed to Pay** |
| `checkout` | the same page dimmed under the **Cashfree drop-in** — the OCC sheet: promo strip, saved address, the frequently-paired cross-sell, offers, payment methods and the black Pay Now bar — then the success card |

`showStore(view, cap, amt)` rebuilds the overlay per beat but skips the entrance animation
when one is already up, so the browser chrome does not blink between the three. The
`checkout` beat animates the whole gesture in sequence: `.pressing` on the CTA → `.cfopen`
raises the drop-in and its dim → `.paid` swaps it for the confirmation and flips the caption
strip green. `killStore` tears it all down on Back, on a dot-jump and on any chassis change.

**The caption strip exists because the overlay covers the transcript.** `.store` is
`inset: 0`, so the beat's `say` would otherwise be hidden behind it — `.st-cap` puts it back
at the bottom of the browser, and turns green with the amount once the payment lands.

**The cart is on ShirtShop's page, not inside the Cashfree sheet.** Both used to list it, which
read as the drop-in asking the buyer to re-approve a basket they had already agreed to two steps
earlier. So `viewPayment` carries the cart (`.st-cart`, beside the summary) and the sheet carries
only what is *new* there — the frequently-paired cross-sell, which is a Cashfree feature rather
than a restatement of the order. The sheet still shows the total in three places, so nothing about
what is being paid for is lost.

**₹799 + ₹99 shipping + ₹144 GST = ₹1,042**, which is the figure the summary, the drop-in and
`PGCreateOrder({order_amount: 1042})` all carry. If you change the product price, change all
four. Under a phone-width lid the store's grid row is only ~130px, so the mobile rules drop
the section heading, the size chips, cards two and three, the summary's line items (the total
survives), the drop-in's left panel and its QR block.

**It is the same `.screen` element throughout.** Nothing is swapped in the DOM, so
tap-to-advance, the dots, Back, auto-play, the guided tour and the connect turn all carry
over untouched. Going back to the grid drops the chassis and the skin together.

**The payoff Skills has and the others cannot.** Toolkit and MCP change account state; Skills
writes code into your repo. So this surface ends on a file, not a figure — the generated
`PGCreateOrder` / `PGFetchOrder` call is on screen, and the closing line says out loud that
it generated the code and running it is still yours.

## The Skills beats follow the recorded script

The twelve beats are cut from the voiceover script in
`../Checkout Screen/Tutorial Video Scripts.docx` ("Cashfree Agent Skills + Claude Code"), so
the section and the tutorial video tell the same story in the same order:

| script beat | demo step |
|---|---|
| prerequisites, Node 18+ | folded into the install output, not its own step |
| `npx @cashfreepayments/agent-skills add skills` | 1 · Install the skills — the real banner |
| "It asks which assistants you want. Choose Claude." | 2 · Pick your assistant |
| it wrote `.claude/skills/cashfree-skills/` and `CLAUDE.md`, the routing table | 3 · What it wrote |
| restart Claude Code so it picks this up | 4 · Restart Claude Code |
| "Add Cashfree Payments checkout to my app." | 5 · The prompt |
| API keys, install the SDK | 6 · Keys and SDK |
| create an order, verify it on your backend | 7 · Order, then verify |
| — | 8 · Checkout in the browser (the v3 SDK half) |
| it pulls the validation skill → checklist + sandbox data | 9 · Testing checklist |
| outro: "Website check out - payments" | 10 · See it work — ShirtShop |
| — | 11 · Proceed to Pay |
| — | 12 · Pay with Cashfree — the drop-in, then SUCCESS |

**Three beats are not in the script** (8, 11, 12). The script ends on a single "website
checkout" shot; the section carries the payment through instead, because a page that never
shows the drop-in never shows the product taking money. Beat 8 is the front-end half that
makes beats 11–12 possible — without it *Proceed to Pay* has no code behind it on screen.

**The banner and the picker are two beats, not one.** They are one screen in a real terminal,
but banner + a nine-item checkbox + a narration line is ~330px against a ~280px transcript,
so the banner was being clipped off the top. Splitting them also matches the script, which
narrates them separately.

**Steps 6–8 have no `ask`.** The script has exactly one prompt and everything after it is the
assistant working, which is the point of the product — so those beats print tool lines with
no prompt line above them. `tAsk` and `runStepTerm` skip the typing when `ask` is absent.

## The last Skills beat is a payment, not a screenshot

Proceed to Pay used to cut straight to a drawn sheet and then to "paid". Two beats were
missing, and both are what makes a payment feel like a payment:

1. **Cashfree's own loading sheet.** Pressing pay puts it up while the SDK boots. It is the
   real asset (`../Looped Loader.gif`, inlined as a data URI) rather than a redraw, so the
   lockup and its timing are Cashfree's, not an approximation of them.
2. **The moment between pay and paid.** The method rings, "Completing your payment" sits over
   the sheet, and only then does the success card land.

The full beat is now: **Proceed to Pay → loader → checkout → it scrolls to the method →
completing → paid.**

### The checkout is the OCC screen, and it lists the actual cart

It follows `../Checkout Screen/OCC + AOV-1.png`: green header with the merchant and the
amount, "Secured by" with the mark, the buyer's saved address and delivery promise, the cart,
the paired upsell, an offer, the payment methods, and a black Pay Now bar.

**One cart feeds the shop and the checkout.** `CART_ITEMS` and `PAIRED` are declared once and
read by both, so the two can never quietly disagree about what is being bought. The cart holds
a single ₹799 tee on purpose: 799 + 99 shipping + 144 GST is the ₹1,042 the step says out loud
and the sandbox order was created for. The paired item is the AOV half of the reference —
offered, not bought, so the total holds.

**Products have pictures now.** A colour swatch does not answer "what am I buying", and that is
the one question a cart exists to answer, so `ART` draws each item — the same call the
glassmorphic product icons make, art built in CSS/SVG rather than shipped photography. The tee
in the shop is the tee in the checkout.

**And the sheet scrolls.** The reference is a full phone screen; this one sits in a 276px
browser page. Every attempt to make it fit by deleting sections lost the thing worth copying,
so instead it does what a buyer does: lands on the address, then glides down to the method it
is about to pay with. `occScroll()` measures the overflow at run time, so editing the contents
cannot leave it landing in the wrong place.

## The sandbox is real, the drop-in in the demo is not

`node scripts/check-sandbox.mjs` creates a live ₹1,042 order with the keys in `.env.local` and
reports what came back. Run it before a shoot, or when someone questions whether the account
behind these numbers exists.

**The genuine drop-in was tried here and did not survive contact.** A `payment_session_id` is
public by design — it is exactly what you hand the browser SDK — so one *can* be baked into a
static page and opened with `Cashfree({mode:'sandbox'}).checkout(...)`. It rendered once, with
the real ₹1,042, offers and UPI QR. Then the same code against freshly minted sessions started
returning **"Something went wrong"** on the Cashfree page, in all three `redirectTarget` modes
(element, `_blank`, `_self`), from both a `file://` and an `http://localhost` origin. A beat
that works once and then does not is worse than a drawn one, so the sheet is drawn and the
script stays as the health check. If you want to retry it, the session is the only thing you
need and `check-sandbox.mjs` already mints one.

## The install screen is the package's own output

Not a redraw from a screenshot. `npm pack @cashfreepayments/agent-skills` (0.2.6) into a
scratch dir, then read `dist/cli-ui.js` and `dist/config.js`. From there, verbatim:

| thing | source |
|---|---|
| the ANSI-shadow `CASHFREE` / `PAYMENTS` art | `BANNER_TOP_LINES` / `BANNER_BOTTOM_LINES` |
| `#10b981` green, `#f59e0b` amber | the two `chalk.bold.hex(...)` calls that paint them |
| `🎯 Agent Skills Setup - Add Cashfree Payments…` | `printBanner()` |
| "Select AI coding assistants to configure:" + the `<space>/<a>/<i>/<enter>` hint | the inquirer `checkbox` prompt |
| the nine frameworks, in order, all unchecked | `FRAMEWORKS` |
| `CLAUDE.md`, `.claude/skills` | `getManifest()` / `getSkillsBasePath('claude-code')` |
| `✅ Cashfree Payments skill configuration complete!` and the skill tree | `printInstallSuccess()` / `INSTALLED_TREE_LINES` |

Two deliberate departures, both visible on screen: the tree is **elided** (a `├── …` line
stands in for the entries not shown — the real one is 31 lines, far taller than the
transcript), and the recording predates **Kiro**, so the video shows eight frameworks where
the section shows nine. The section follows the package, since that is what a viewer running
the command today gets. If you want them identical, drop the last picker item.

**The skill paths are now the real ones** — `pg/backend-sdks/SKILL.md`,
`pg/apis/references/SKILL.md`, `pg/web-sdk/SKILL.md` and `validation-and-testing/SKILL.md`
all appear verbatim in `INSTALLED_TREE_LINES`. An earlier draft used a placeholder
`cashfree-skills/SKILL.md` because nothing on hand named the checkout skill; that guess is no
longer needed, so don't reintroduce one.

**The code on screen is real**, and it is deliberately in two halves — the blocks are headed
`generated · server` and `generated · browser` so the two `cashfree` bindings do not read as
a contradiction:

- **server**, checked against the installed `cashfree-pg`: `new Cashfree(CFEnvironment.SANDBOX,
  id, secret)`, `PGCreateOrder({order_amount, order_currency, customer_details})` and
  `PGOrderFetchPayments(order_id) → PaymentEntity[]` with `payment_status: "SUCCESS"` all
  exist with those signatures.
- **browser**, from Cashfree Dev Studio: `Cashfree({ mode: "sandbox" })` from
  `sdk.cashfree.com/js/v3/cashfree.js`, then `cashfree.checkout({ paymentSessionId,
  redirectTarget: "_self" })`.

The demo is still badged amber, because the *session* is a reconstruction — but nobody can
copy a call out of it that does not compile.

**The drop-in is a rebuild, not a screenshot.** Layout, copy and colours follow the real
sandbox checkout; the business name reads **ShirtShop** rather than the sandbox's
"Business Name" placeholder, since the store next to it is ShirtShop. It is a static
reconstruction — no `cashfree.js` is loaded and no session exists, which is the whole reason
the badge stays amber.

**The MCP demo wears Claude's skin.** That integration runs inside an AI client rather than
inside a Cashfree surface, so for that demo the phone switches to a warm ivory ground with a
terracotta accent, and the assistant replies as plain text rather than in a card. It is
stylised on purpose — the point is "this runs here", not a pixel copy of anyone's app. The
skin is dropped the moment you go back.

## What it is

A website section for the Cashfree Agent Toolkit, built to sit next to the checkout
one on the same page:

- **Shell** — the dark bento language from `Checkout Screen/Screen 1.png`: near-black
  ground, large rounded cards, two-tone headings (bold + muted), small pill tags,
  soft gradient blobs bleeding out of the card corners.
- **Phone** — the Cashfree 2026 liquid-glass direction (mint → oat → amber light,
  frosted surfaces, faint blueprint grid), so the device reads as *the product* and
  the shell reads as *the website around it*.

The phone steps through the full money lifecycle as a chat: create customer →
create ₹500 order → pay by UPI → check status → refund ₹200 → list refunds. The
merchant's question types itself into the composer, the tool call fires, and the
merchant ledger at the bottom updates to a live net position.

## The data is real

Every id, amount and latency in `run-data.json` was captured from an actual run
against the Cashfree sandbox on 2026-08-31 — real order id, real `cf_payment_id`,
real per-tool round trips. Nothing is invented. If you change the copy, keep that
true or drop the "nothing is mocked" line from the section.

Verified figures, so the copy stays honest:

| claim | value | how it was checked |
|---|---|---|
| tools in the catalogue | **40** | `getAgentTools().length` |
| split | **22 payments / 18 verification** | tool names, not the package README (which implies 41) |
| tools given to this agent | **11** | the lifecycle scenario's scope |
| tool time, whole lifecycle | **1.8s** across 6 calls | sum of measured latencies |
| spread | **64ms – 925ms**, median **210ms** | per-call measurements |

**64ms is the fastest call (`getAllRefunds`), not a typical one.** An earlier draft of
this section called it "typical tool round-trip", which was wrong — the card now leads
with the 1.8s total instead.

## Controls

| input | action |
|---|---|
| Next step / → / space | advance one step |
| Back / ← | step back |
| Auto-play | run the whole lifecycle unattended |
| step list, dots | jump straight to any step |

Buttons disable while a step is animating, so a click can't be swallowed mid-typing.

## Editing

- **Demos** — the `DEMOS` object in the `<script>`. Each demo supplies `title`, `blurb`,
  `provenance`, `chips`, a `panel` (its own headline + rows) and `steps`. A step is
  `{label, tool, ask, call: {name, summary, ms}, say, patch}`, where `patch` writes into the
  panel — `__headline` sets the big value, `<key>__warn` tints a row amber.
  Adding a fifth demo is a new entry plus one card.
- **Terminal demos** — add `surface: 'terminal'` to the demo and `panel.kind: 'files'` (a row
  with `sum: true` renders under a rule, for a summary rather than a path). Each step then
  needs a `term`: either `{kind:'shell', ms, out:[{t:'ok'|'dim', s}]}` for a command,
  `{fn, res, code?: {head, body}}` for an assistant tool line, or
  `{kind:'store', view, ms, out?, amt?, paidCap?}` to run any shell lines and then put the
  browser over the screen at that `view` (`collection` | `payment` | `checkout`). A shell step
  may also carry `banner: true`, `setup` and `pick: {q, items:[{n, on?}]}` to reproduce an
  installer screen. `code.body` is HTML — wrap tokens in `.k` (keyword), `.s` (string),
  `.n` (number), `.c` (comment); `code.head` labels the block (`generated · server` /
  `· browser`). Omit a step's `ask` to make it a continuation of the previous prompt — the
  store beats after the first use that, because from there it is clicks, not commands.
- **Connect turn** — `connectStep` on each demo (`{kind:'connect', label, tool, ask, say, patch, mono?}`)
  plus `connect` (`{host, hostIcon, target, via}`). It is prepended to `steps` at load, so a
  demo's step count is `steps.length + 1`. Set `mono: true` when the prompt is a command.
- **Bento cards** — plain markup under `<!-- supporting bento cards -->`. Grid is
  12-column; use `.span-3` … `.span-12`.
- **Colors** — the `:root` block. Shell greys first, then the brand tokens
  (evergreen `#00AD6C`, gold `#FFAE15`, mint `#CEF993`, oat `#FCE2B0`).

Verified in Chromium (Playwright, real Chrome): all four demos, all six Skills beats in the
terminal surface, the laptop chassis raised and dropped, Back, dot-jump, auto-play, and a
430px viewport — no document overflow, no console errors. The `.screen` reports ~14px of
horizontal scroll width while the hidden `.home` overlay is laid out behind a landscape
chassis; it is clipped by `overflow: hidden` and never visible, since the home screen is only
ever *shown* on the phone chassis.
