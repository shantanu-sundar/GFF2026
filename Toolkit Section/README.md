# Agent Toolkit — interactive section

A sibling to the Checkout360 section in `../Checkout Screen/`. Same dark bento shell,
a phone in the middle you tap through.

## Open it

Double-click `index.html`. That's the whole setup — no server, no build, no npm,
and no connection to the Next.js app on localhost. It is one self-contained file.

## Three levels

The phone boots to a **home screen replicating `../Checkout Screen/Screen 1.png`** — the
same bento rhythm (wide+square, narrow+wide, full-width hero, full, two-up, two-up), the
same near-black cards with hairline borders, two-weight lockups, pill tags and a gradient
blob bleeding out of one corner. The product icons are glassmorphic: a translucent tile
with a specular top edge, an inner bloom and a coloured glow, built in CSS rather than
shipped as art.

Two cards on that grid are live. **Relay** opens straight from home, because it is a
Merchant Dashboard product rather than a builder tool — but it opens a *shelf* rather than a
demo, because Relay is a set of agents with one payment operation each. Pick an agent and its
own conversation runs. **Cashfree For Builders** sits in the hero slot (where Checkout360 sits
in the reference) and opens **three more**. Each demo has its own steps, its own bottom panel
and its own status chips:

| demo | what it shows | panel | provenance |
|---|---|---|---|
| **Relay · Cart Recovery** *(from home → shelf)* | **spoken** prompt → the month in a table → Relay builds trigger/condition/action → test run → activate → the buyer's own screen leaves a ₹2,598 cart → **Relay calls Priya** → Runs tab | Agent: trigger, condition, action, runs | Illustrative |
| **Relay · Payment Recovery** *(from the shelf)* | **spoken** prompt → 38 failures by reason → Relay builds it → test run → activate → the buyer's own screen shows a ₹2,598 UPI decline → **Relay calls Rahul** → Runs tab | Agent: trigger, condition, action, runs | Illustrative |
| **Relay · Subscription Dunning** *(from the shelf)* | **spoken** prompt → renewals by outcome → Relay builds it → test run → activate → a ₹499 renewal fails → **Relay calls Anita** and takes Friday → the retry lands → Runs tab | Agent: trigger, condition, action, runs | Illustrative |
| **Agent Toolkit** | 6 tool calls: customer → ₹500 order → UPI → status → ₹200 refund → list | Merchant ledger, net position | **Real** captured sandbox run |
| **Agent Skills** *(light terminal, on a laptop)* | the real installer banner → pick Claude Code → the skill tree → restart → one prompt → keys + SDK → order + backend verification → validation skill → ShirtShop takes a payment | Workspace: the files it wrote and is reading | Illustrative, but the CLI output is the package's own |
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

## Every demo opens by connecting

Connecting is the **first turn of the conversation**, not a gate in front of it. You ask to
connect, a card appears in the thread showing host on the left and Cashfree surface on the
right, the wire fills, the switch throws, and the assistant confirms — then the rest of the
prompts follow in the same scroll.

For **Agent Skills** the connect turn is the install itself — the real terminal command,
`npx @cashfreepayments/agent-skills add skills`, typed at a `$` prompt.

| demo | host | connects to | via |
|---|---|---|---|
| Relay · any agent | Merchant Dashboard | that agent | Agents · Runs · Connections |
| Agent Toolkit | Your app | Cashfree Sandbox | `@cashfreepayments/agent-toolkit` |
| Agent Skills | Claude Code + Cursor | Cashfree Skills | `npx @cashfreepayments/agent-skills add skills` |
| MCP Server | Claude | Cashfree MCP | `mcp.cashfree.com/mcp` · OAuth |

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

Steps declare these with `scene: { kind: 'brk' | 'buy' | 'call', … }`. `playScene()` runs them
in `runStep()`; `rebuild()` repaints `brk` and `buy` statically, and repaints the call **only
if you landed on that beat**, because a call is a moment rather than a state.

> One trap worth remembering: the section subtitle up top is a bare `.sub { margin: 18px 0 0 }`,
> and it leaked into the call scene's caption spans and pushed them off their node. Those are
> `.cwho` now. Bare single-class rules in this file are shared ground — scope new ones.

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

**The last beat leaves the terminal.** The script's outro is the browser, not the console
("Visual: Website check out - payments"), so `term.kind: 'store'` lifts a browser over the
whole laptop screen: **ShirtShop** — the same store as the recording, with its indigo nav,
Our Collection grid, size chips and Add to Cart buttons — and then a *Paid with Cashfree*
confirmation. `killStore` tears it down on Back, on a dot-jump and on any chassis change,
so it cannot outlive its step. Under a phone-width lid the grid row is only ~130px, so the
mobile rules drop the section heading, the size chips and the second and third cards.

**It is the same `.screen` element throughout.** Nothing is swapped in the DOM, so
tap-to-advance, the dots, Back, auto-play, the guided tour and the connect turn all carry
over untouched. Going back to the grid drops the chassis and the skin together.

**The payoff Skills has and the others cannot.** Toolkit and MCP change account state; Skills
writes code into your repo. So this surface ends on a file, not a figure — the generated
`PGCreateOrder` / `PGFetchOrder` call is on screen, and the closing line says out loud that
it generated the code and running it is still yours.

## The Skills beats follow the recorded script

The nine beats are cut from the voiceover script in
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
| it pulls the validation skill → checklist + sandbox data | 8 · Testing checklist |
| outro: "Website check out - payments" | 9 · See it work — ShirtShop takes a payment |

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
`pg/apis/references/SKILL.md`, `validation-and-testing/SKILL.md` all appear verbatim in
`INSTALLED_TREE_LINES`. An earlier draft used a placeholder `cashfree-skills/SKILL.md`
because nothing on hand named the checkout skill; that guess is no longer needed, so don't
reintroduce one.

**The SDK calls are real**, checked against the installed `cashfree-pg`:
`new Cashfree(CFEnvironment.SANDBOX, id, secret)`, `PGCreateOrder({order_amount,
order_currency, customer_details})` and `PGFetchOrder(order_id)` all exist with those
signatures. The demo is still badged amber, because the *session* is a reconstruction — but
nobody can copy a call out of it that does not compile.

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
  `{fn, res, code?: {head, body}}` for an assistant tool line, or `{kind:'store', ms, out}`
  to run the shell lines and then lift the storefront over the screen. `code.body` is HTML —
  wrap tokens in `.k` (keyword), `.s` (string), `.n` (number), `.c` (comment). Omit a step's
  `ask` to make it a continuation of the previous prompt.
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
