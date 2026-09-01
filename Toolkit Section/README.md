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
| `N01 Index` | the black bento. Checkout360 → `B01`, Relay → `N02`, For Builders → `N03`; the rest are the `locked` tiles from the section's own home grid |
| `N02 L3 · Relay` | Cart Recovery, Payment Recovery, Subscription Dunning |
| `N03 L3 · Cashfree For Builders` | Agent Toolkit, Agent Skills, MCP Server |

**The copy on those six cards is lifted verbatim from the `DEMOS` blurbs in `index.html`,**
so the booth says exactly what the section says. Do not paraphrase it in one place only.

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

## Three levels

The phone boots to a **home screen replicating `../Checkout Screen/Screen 1.png`** — the
same bento rhythm (wide+square, narrow+wide, full-width hero, full, two-up, two-up), the
same near-black cards with hairline borders, two-weight lockups, pill tags and a gradient
blob bleeding out of one corner. The product icons are glassmorphic: a translucent tile
with a specular top edge, an inner bloom and a coloured glow, built in CSS rather than
shipped as art.

Three cards on that grid are live. **Relay** opens straight from home, because it is a
Merchant Dashboard product rather than a builder tool — but it opens a *shelf* rather than a
demo, because Relay is a set of agents with one payment operation each. Pick an agent and its
own conversation runs. **Cashfree Spark** sits in the slot the SecureID tile used to hold, and
opens the **merchant dashboard** — the real Payments home, navy bar and welcome hero and product
cards — with a Spark button floating on it. Tapping that button starts the chat. **Cashfree
For Builders** sits in the hero slot (where Checkout360 sits in the reference) and opens
**three more**. Each demo has its own steps, its own bottom panel and its own status chips:

| demo | what it shows | panel | provenance |
|---|---|---|---|
| **Relay · Cart Recovery** *(from home → shelf)* | **spoken** prompt → the month in a table → Relay builds trigger/condition/action → test run → activate → the buyer's own screen leaves a ₹2,598 cart → **Relay calls Priya** → Runs tab | Agent: trigger, condition, action, runs | Illustrative |
| **Relay · Payment Recovery** *(from the shelf)* | **spoken** prompt → 38 failures by reason → Relay builds it → test run → activate → the buyer's own screen shows a ₹2,598 UPI decline → **Relay calls Rahul** → Runs tab | Agent: trigger, condition, action, runs | Illustrative |
| **Relay · Subscription Dunning** *(from the shelf)* | **spoken** prompt → renewals by outcome → Relay builds it → test run → activate → a ₹499 renewal fails → **Relay calls Anita** and takes Friday → the retry lands → Runs tab | Agent: trigger, condition, action, runs | Illustrative |
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

**Cashfree Spark has no connect beat at all**, and that is the point rather than an omission.
Every other demo bridges two things that start apart — your app to the sandbox, Claude to the
MCP server, a repo to the skills — and the wire filling is that bridge being built. Spark
bridges nothing: it is an assistant already inside the merchant dashboard, "same dashboard,
same login, same permissions, nothing to install". Animating a connection would have staged a
step that does not exist and contradicted the one line the product leads with. Segment 1 of the
flow doc is "log in, click Spark" — which is played as an actual screen rather than as a step
(see below), so the run itself opens on the merchant's first real question.

`connectStep` is therefore optional: `loadDemo()` prepends it when a demo has one and starts on
`steps[0]` when it does not, and the step counters on the cards add the extra beat the same way.

**Every agent connects to the sandbox, not to a tab.** The three Relay agents used to connect to
"Cart Recovery" / "Payment Recovery" / "Subscription Dunning", which is a screen you open rather
than a thing you connect to — and it quietly undersold the point. An agent is only interesting
because it is wired to a real Cashfree account, so all three now land on **Cashfree Sandbox**,
the same node the Agent Toolkit demo connects to. Which agent you are in is carried by the
header chip and its face, so nothing is lost by taking the name off that node.

| demo | host | connects to | via |
|---|---|---|---|
| Relay · any agent | Merchant Dashboard | **Cashfree Sandbox** | Agents · Runs · Connections |
| Agent Toolkit | Your app | Cashfree Sandbox | `@cashfreepayments/agent-toolkit` |
| Agent Skills | Claude Code + Cursor | Cashfree Skills | `npx @cashfreepayments/agent-skills add skills` |
| MCP Server | Claude | Cashfree MCP | `mcp.cashfree.com/mcp` · OAuth |
| Cashfree Spark | — | — | *nothing to connect; it is already in the dashboard* |

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

Names and one-liners follow the Relay landing page. **Only Cart Recovery carries a stat there**
("20% Carts recovered", alongside "You only pay for recovered orders"), and only that one is
reproduced. An earlier draft also showed "40% failed payments recovered" and "50% failed renewals
recovered" — neither appears on the landing page or anywhere in the Relay docs, so both were
removed and replaced with "Relay template" (both ARE documented template names). Do not reinstate
a performance figure without a source you can point at.
The triggers, Connections and the Runs tab are the product's own vocabulary; the amounts, buyer
names and ids are plausible stand-ins — which is exactly what the amber provenance badge says.

Adding the other two agents from the landing page (Dispute Responder, COD Confirmation) is a
`DEMOS` entry plus one `.acard` in `#agents`, with the orb recipe copied from the beta form.

## A Relay run is three segments, and two of them are not a chat

The three journey docs (`../Checkout Screen/Cart Recovery.docx`, `Payment Recovery.docx` and
`../Subscription Dunning.docx`) tell the same story in the same order, so all three agents on
the shelf run it:

| segment | what happens | who is on screen |
|---|---|---|
| **1 · set the agent up** | the merchant **speaks** the opening prompt, Relay answers with the month's numbers, offers to build the agent, **test-runs it**, then asks before switching it on | the merchant |
| **2 · the drop-off** | the payment fails, or the cart is left at the payment step | **the buyer** |
| **3 · the call** | Relay rings the buyer, works the objection, sends a link | both |
| **4 · the payoff** *(Dunning only)* | the day the subscriber picked arrives and the retry clears | **the buyer** |

**Subscription Dunning is the one that ends on a fourth beat, because its doc does.** A failed
renewal is the only failure in the set where the customer is not standing in front of a
checkout: they are asleep, or at work, and the only thing that reaches them is a *push*. So
segment 2 there is a notification and a "Subscription paused" banner rather than an error page,
the call takes a date instead of a payment (`"Salary hasn't come in yet. Try again in 2 days?"`
→ `"Got it — we'll retry on Friday."`), and segment 4 is Friday: the retry clears, a second push
says the plan is active, and she never had to do anything. That last beat is the whole point of
the agent, so it gets its own step rather than being summarised in the Runs line.

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
  money that walked, green for money that finally landed; the abandoned variant shows the exit
  prompt with the reason the buyer actually picked, which is what the agent leads the call with.
  Two optional parts serve the renewal story: `notif` draws a real push sitting on top of the
  app, and `banner` slides the plan's new state up under the reason — *Subscription paused*,
  then *Subscription active*. A renewal failure has no page to fail on, so if the notification
  were only described in a sentence the beat would not land.
- **`.callscene` — Relay Calling.** Full screen, because that is what a call does to a phone.
  It rings, connects, runs a clock, and the halo and the meter between the two faces lean
  toward whoever is talking. The agent's own orb and colour come along, so a call always looks
  like it came from the agent you were just watching. It ends on what the call **produced** —
  a link, a code, a mandate — then hangs up and drops you back into the thread.

A fourth, `.brk`, answers the opening prompt: "the agent lists failed transactions with reasons
for failure" is five reasons and five amounts, which a sentence cannot hold, so it is a table.

Steps declare these with `scene: { kind: 'brk' | 'buy' | 'call' | 'gate' | 'approve' | 'wa', … }`
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
| `payment` | the Address ✓ / Review ✓ / **Payment** stepper, "Pay securely with Cashfree", the order summary and **Proceed to Pay** |
| `checkout` | the same page dimmed under the **Cashfree drop-in** — business panel, ₹1,042, offers and coupon, favourites, the UPI QR, other payment options — then the success card |

`showStore(view, cap, amt)` rebuilds the overlay per beat but skips the entrance animation
when one is already up, so the browser chrome does not blink between the three. The
`checkout` beat animates the whole gesture in sequence: `.pressing` on the CTA → `.cfopen`
raises the drop-in and its dim → `.paid` swaps it for the confirmation and flips the caption
strip green. `killStore` tears it all down on Back, on a dot-jump and on any chassis change.

**The caption strip exists because the overlay covers the transcript.** `.store` is
`inset: 0`, so the beat's `say` would otherwise be hidden behind it — `.st-cap` puts it back
at the bottom of the browser, and turns green with the amount once the payment lands.

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
