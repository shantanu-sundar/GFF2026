# Shoot runbook — Cashfree Agent Toolkit demo

**Target:** ~3 minutes. **Recorded:** screen only (console left, Cashfree sandbox
dashboard right) plus terminal inserts. **Ground truth:** `docs/SANDBOX-FINDINGS.md`.

This document exists to stop you wasting a shoot. It is deliberately pessimistic.

---

## 0. The one number that governs the whole shoot

**After the agent initiates the UPI payment, the sandbox holds the order at `ACTIVE`
for roughly 20–32 seconds before flipping it to `PAID`.** It is a server-side simulator
timer. It is not network latency, it is not your code, and there is nothing you can do
to shorten it.

Everything below is arranged around that fact. Read §2 before you plan a single shot.

---

## 1. Pre-flight

Start this **45 minutes** before you intend to roll. Nothing here is optional.

### 1.1 Prove the sandbox

```bash
npm run demo:lifecycle -- --runs=5
```

~3 minutes. Watch for `5/5 lifecycle runs passed`. This is a no-LLM run against the real
sandbox, so a pass means the credentials, the API, the VPA and the refund path are all
healthy right now. If it fails, **do not start recording** — read the printed
`details.code` against `SANDBOX-FINDINGS.md §5` and fix it first.

Note the `to PAID` column in the summary table. That is the length of your dead-air
window today. Two runs on 2026-08-31 landed at **31.5 s** and **19.2 s**, so treat the
wait as a range, not a constant, and never cut a shot assuming a fixed 31 s.

Then a single warm-up immediately before the first take:

```bash
npm run demo:lifecycle
```

### 1.2 Prove the console

```bash
npm run dev
```

**Read the printed URL.** If port 3000 is occupied Next silently moves to 3001/3002 and
every URL in this runbook shifts with it.

Then, in the browser you will record:

- `http://localhost:3000/?scenario=lifecycle&framework=openai` — loads clean, scope panel
  shows 11 of 40 tools.
- Click through one full lifecycle beat, live, end to end. If the agent misbehaves you
  want to know now, not on take 3.
- `http://localhost:3000/?mock=1` — confirm the scripted fallback plays (see §5).

### 1.3 Prove the framework swap

```bash
npm run demo:swap -- --dry
```

Expect three `ok` rows, all reading **40**, and `console adapters present:` listing all
three `lib/adapters/*.ts`. This needs no OpenAI key.

If you intend to shoot the live three-way comparison, `OPENAI_API_KEY` must be in
`.env.local` and `npm run demo:swap` must pass. **Check this the day before** — with the
key absent the script exits 2 with an instructional message, which is a fine developer
experience and a terrible thing to discover with a camera running.

> **Honest status:** `--dry` is verified against the sandbox. The live path of
> `demo:swap` has **never been executed** — there was no OpenAI key on the box when it
> was written. Its three call sites mirror `lib/adapters/*.ts`, which the console does
> exercise, but treat the first live run as a test, not a take.

### 1.4 Warm the npm cache

The install shot (§3, beat 3) must be fast and must not fail.

```bash
mkdir /tmp/cf-install-take && cd /tmp/cf-install-take && npm init -y
npm i @cashfreepayments/agent-toolkit @openai/agents
rm -rf node_modules            # keep the cache, lose the tree, so the take re-resolves fast
```

**Never run `npm install` inside `C:\Toolkit` on camera.** Two concurrent installs here
rewrite `package.json` and silently drop dependencies while still exiting 0. Shoot the
install in the throwaway directory.

### 1.5 Machine and capture

- [ ] 1920×1080, scaling 100%, second monitor **disconnected** (window managers move
      windows between takes otherwise)
- [ ] Terminal font ≥ 18pt. The lifecycle script's step lines run to ~100 columns; check
      nothing wraps at your window width.
- [ ] Terminal is **Windows Terminal / VS Code**, not legacy `conhost`. The scripts detect
      this and fall back to ASCII glyphs, but the unicode version looks better.
      Force it either way with `-- --ascii` if the box characters render as mojibake.
- [ ] Colour: the scripts emit ANSI only to a TTY. Do not pipe them through `tee` on
      camera or you lose all colour and the progress line.
- [ ] Notifications off — Windows Focus Assist on, Slack/Teams/Mail quit, calendar alerts
      off, phone silenced.
- [ ] Browser: a **clean profile**. No extensions, no bookmarks bar, no autofill dropdown,
      no other tabs. Zoom 100% (or a deliberate 110% for legibility — decide once).
- [ ] Cashfree **sandbox** dashboard logged in, parked on the order list, sorted newest
      first, in the right-hand window. Confirm the session is not about to expire.
- [ ] Terminal scrollback cleared before every take.
- [ ] Desktop wallpaper neutral, taskbar auto-hidden, clock hidden if you plan to cut
      shots out of order.

### 1.6 Secrets

- [ ] `.env.local` filled, `CASHFREE_ENV=SANDBOX`.
- [ ] No editor tab open on `.env.local` or `.env`. Close them. An accidental alt-tab in
      a take is a credential leak that you will have to re-shoot around.
- [ ] Terminal scrollback contains no earlier `env` dump or stack trace.

---

## 2. The 30-second problem

### What actually happens

`orderPayUsingUpi` with `channel: "collect"` returns in ~400 ms with **no status field at
all**. At that instant:

- the payment row exists with `payment_status: NOT_ATTEMPTED`
- the order is still `order_status: ACTIVE`

Cashfree's sandbox simulator auto-approves the collect request server-side, ~20–32 s
later. No webhook, no browser step, no extra call. You wait.

### Why it is dangerous on camera

If you advance to the next turn too early, the agent asks `getOrder`, sees `ACTIVE`, and
correctly says the payment is still settling — which reads on camera as *the demo not
working*. Worse, if you skip ahead to the refund turn, `createRefund` **hard-fails**:

```json
{ "error": "Failed to create refund",
  "details": { "code": "order_id_not_paid", "message": "transaction not found" } }
```

That is a real red card on screen, and the order is not recoverable into a clean take —
you start a new one.

### The concrete on-camera handling

The console already covers this. `/api/order` is a separate route that polls order status
outside the agent loop and costs no model turn, so **the order card in the ledger flips to
a green `PAID` pill by itself** while nothing else is happening.

So the rule for the operator is exactly this:

> After turn 3 ("Pay it using UPI"), **do not touch anything**. Watch the order card.
> When the pill goes green `PAID`, advance to turn 4.

Auto-advance (`?auto=1`) already parks itself while the settlement poll is running, so if
you are driving hands-free it will wait for you. Do not fight it.

**In the edit:** speed-ramp that window 4×–8× with the poll counter visible, or cut to the
Cashfree dashboard on the right and let the viewer watch *that* row change — which is a
stronger shot anyway, because it proves the money is real and not console theatre.

### The filler turn, if you want continuous motion

If you would rather not cut, you have one safe read-only turn to spend during the wait:

> **"What payment methods are available on that order?"** → `getEligiblePaymentMethods`

It is in the lifecycle beat's tool scope, it is read-only, and it cannot disturb the
order. Verified against the sandbox: `{ order_id, amount: null }` returns in ~250 ms.
With model round-trip that is a few seconds of legitimate motion in the middle of the
dead window. Use it once — twice looks like stalling.

**Caveat:** it returns a *long* array (every card network, wallet and netbanking option,
each with a nested `payment_method_details` list). Leave the tool card collapsed; the
summary line is the shot, not the payload.

Do **not** use `getPaymentsForOrder` as filler — during the wait it returns
`payment_status: NOT_ATTEMPTED`, which is exactly the frame you do not want enlarged.

---

## 3. Shot list

Total ~3:00. Durations are finished-edit lengths, not take lengths.

---

### Beat 1 — Cold open · 0:00–0:10

**On screen:** the console mid-run, already deep into the lifecycle beat. Tool cards
streaming, ledger showing an order with a green `PAID` pill and a refund below it.

**Do:** record this *last*, from your best lifecycle take. It is a lift, not a take.

**VO:** one line, no setup. *"This agent just took a payment and refunded part of it.
Real money, real API, no glue code."*

---

### Beat 2 — The problem · 0:10–0:25

**On screen:** static — a code editor showing a hand-rolled payments integration, or a
simple title card. No live app.

**VO:** the point is that wiring an LLM to a payments API is normally weeks of tool
schemas, auth, error mapping and a hand-written allow-list.

Nothing to run. Nothing to break.

---

### Beat 3 — Install and init · 0:25–0:50

**On screen:** clean terminal, in the throwaway directory from §1.4.

**Type verbatim:**

```
npm i @cashfreepayments/agent-toolkit
```

Cut the install output down to the last line in the edit.

Then the editor, typing (or pasting, then trimming in the edit) exactly:

```ts
import { CashfreeAgentToolkit, CFEnvironment } from '@cashfreepayments/agent-toolkit/openai';

const toolkit = new CashfreeAgentToolkit(
  CFEnvironment.SANDBOX,
  process.env.CASHFREE_CLIENT_ID,
  process.env.CASHFREE_CLIENT_SECRET,
);

const agent = new Agent({
  name: 'Merchant Support Agent',
  instructions,
  tools: toolkit.getAgentTools(),      // all 40
});
```

**Trap:** do not type real credentials. Keep `process.env`.

---

### Beat 4 — The tools · 0:50–1:10

**On screen:** the console's scope panel, open, showing the catalogue grouped by area —
Orders, Payments, Refunds, Customers, Verification — with the 11 given to this agent
highlighted against the 40 in the toolkit.

**Alternative / B-roll:** the terminal, running

```
npm run demo:swap -- --dry
```

which prints all three entry points side by side, each reading 40. It is a good shot
because it is fast, it is real, and it needs no model.

**VO:** 40 tools, one line to construct, and the agent picks which to call.

---

### Beat 5 — The main run · 1:10–2:10

**The take.** Console left, Cashfree sandbox dashboard right.

**Setup:** load `?scenario=lifecycle&framework=openai`, scrollback and transcript clear,
dashboard order list on screen right.

The six turns are scripted in `lib/scenarios.ts` — you drive them with **Run** and then
**Next**; there is no free-text box. The prompts that appear on screen, verbatim:

| # | Prompt shown | Tool the model picks | Timing |
|---|---|---|---|
| 1 | `Create a customer for Rahul Sharma, phone 9478912345, email rahul@example.com` | `createCustomer` | ~0.2 s |
| 2 | `Create an order for ₹500 for that customer` | `createOrder` | ~0.3 s |
| 3 | `Pay it using UPI` | `orderPayUsingUpi` | ~0.6 s, then **wait** |
| — | *(optional filler, §2)* `What payment methods are available on that order?` | `getEligiblePaymentMethods` | ~0.5 s |
| 4 | `What's the status of that order?` | `getOrder` → `PAID` | ~0.3 s |
| 5 | `Rahul wants a partial refund of ₹200` | `createRefund` → **`PENDING`** | ~0.5 s |
| 6 | `Show me all refunds on it` | `getAllRefunds` → `SUCCESS` | ~0.15 s |

**Two hard rules in this beat:**

1. **After turn 3, wait for the green `PAID` pill before clicking Next.** See §2.
2. **After turn 5, wait ~2 seconds before clicking Next.** `createRefund` always returns
   `PENDING`; it settles to `SUCCESS` about 1–2 s later. Clicking straight through ends
   your hero beat on the word "In Progress".

**The money shot** is turn 5→6 with the Cashfree dashboard visible: refresh the dashboard
and let the viewer see the same refund on Cashfree's own UI. That is the proof.

**VO:** one conversation, six tool calls, a real order and a real refund.

---

### Beat 6 — Framework swap · 2:10–2:30

**On screen:** the console header. Click the framework button: `openai` → `langchain` →
`ai-sdk`. Re-run a short beat (reconciliation is best — one turn, three tool calls, over
in seconds) on a second framework and show the identical result.

**Optional insert:** the terminal running `npm run demo:swap`, printing the same task and
the same tools called under all three.

**Be honest in the VO.** Do not say "change one import line" — it is not true, and anyone
who opens the package will see it in ten seconds. The truthful line is stronger anyway:

> *"Same toolkit, same account, three agent frameworks. The entry points aren't
> identical — different class, different accessor — so the app absorbs that once in an
> adapter, and everything above it never changes."*

The `--dry` table on screen makes exactly that point in one frame.

---

### Beat 7 — Scoped tools · 2:30–2:50

**On screen:** switch to the **Read-only agent** beat. Scope panel visibly drops from 11
tools to 5. Same agent, same model, same instructions.

Two scripted turns:

| # | Prompt shown | Result |
|---|---|---|
| 1 | `What's the status of order <the order from beat 5>?` | `getOrder` runs. Reads still work. |
| 2 | `Refund ₹200 on order <same order>` | No refund tool exists. The agent says it cannot and escalates. |

**VO:** this is not a prompt telling it to behave. The refund tool was never put in its
context — there is no allow-list to jailbreak.

**Trap:** the order id is carried from beat 5, so beat 7 must be shot **after** a
successful beat 5 in the same browser session, or the prompts fall back to "the most
recent order" and the on-screen id disappears.

---

### Beat 8 — CTA · 2:50–3:00

**On screen:** the npm package page, or a clean title card with the install line and the
docs URL.

**VO:** one line, one link. Do not stack three calls to action.

---

## 4. Known on-camera traps

Every one of these has actually happened or is documented as verified in
`SANDBOX-FINDINGS.md §7`.

| # | Trap | Why it happens | Mitigation |
|---|---|---|---|
| 1 | **~20–32 s of dead air after "Pay it using UPI"** | Fixed sandbox simulator timer, not latency. Cannot be shortened. | Wait for the green `PAID` pill. Speed-ramp in the edit, or spend the one filler turn (§2). |
| 2 | **Refunding too early → `order_id_not_paid`** | The order is still `ACTIVE` until the timer fires. Hard failure, red card on screen. | Never advance past turn 3 until the pill is green. The order is burnt if you do — start a fresh take. |
| 3 | **`createRefund` shows `PENDING`, so the demo ends on "In Progress"** | It always returns `PENDING`; it settles ~1–2 s later. | Wait ~2 s before turn 6. The terminal script already sleeps 2.5 s for this reason. |
| 4 | **Re-shoot fails with `refund_id_invalid` / "Duplicate Merchant Refund Id"** | **Refund ids are unique per MERCHANT, not per order.** A hardcoded `refund_demo_1` works on take 1 and fails on every take after, on every order, forever. | Refund ids must be timestamped (`refund_${Date.now()}`). They are, in `scripts/lifecycle.mjs` and in the agent path. Never hardcode one to make a "cleaner" id on screen. |
| 5 | **`payment_session_id` on screen** | ~138-char bearer-style token returned by `createOrder`. | Already redacted in `/api/order`, in `RunEvent`s, and in the terminal scripts (which print its length only). Do not add a raw JSON dump to the UI for the shoot. Do not scroll a raw API response on camera. |
| 6 | **A second, silent payment on the same order** | Reusing a `payment_session_id` creates a **second** `cf_payment_id` with no error. Two payment rows on the dashboard mid-take. | Never re-run turn 3 within a take. If you need turn 3 again, start a new order. |
| 7 | **`testsuccess@gateway`** | Rejected: `upi_id_invalid`. | The only working VPA is **`testsuccess@gocash`**. It is pinned as a constant in the scenario instructions and in the script — never typed live. |
| 8 | **A failure-path demo built on `testfailure@gocash`** | It does not auto-fail. It sits at `NOT_ATTEMPTED` indefinitely (63 s observed). | If you want a failure on camera, use a synchronous one: early refund (`order_id_not_paid`) or over-refund (`refund_post_failed`). Both return in <500 ms. |
| 9 | **A green tick over a failed call** | Toolkit tools **never throw** — a failure resolves to `{ error, details: { code } }`. `try/catch` catches nothing. | `lib/ledger.ts` branches on the payload. If you patch anything for the shoot, do not reintroduce `try/catch` optimism. |
| 10 | **A card blown out by `details.help`** | The error `help` field is a long URL-shortener blob. | Only `details.code` + `details.message` are rendered. Leave it that way. |
| 11 | **`order_id` isn't the string you expected** | `createOrder` has **no** `order_id` parameter — Cashfree generates a 34-char id. The demo label lives in `order_note`. | Read the real `order_id` off screen; do not promise the viewer a pretty id. |
| 12 | **A transient `getOrder` failure mid-poll** | Observed 2026-08-31: one `getOrder` hung ~19 s and returned `{ error: "Failed to fetch order" }` with **no `details.code`**. The next poll succeeded. | `scripts/lifecycle.mjs` now retries; it aborts only after 3 consecutive failures and reports the retry count. In the console this shows as one slow poll. If it happens on camera, it is a slow pill, not a broken demo — keep going. |
| 13 | **Port 3000 taken → console on 3001/3002** | Next silently reassigns and prints the URL. | Read the printed URL. Fix your bookmarks/URL params before the take, not during. |
| 14 | **`npm install` on camera inside the repo** | Two concurrent installs here rewrite `package.json` and drop deps while exiting 0. | Shoot the install shot in the throwaway directory (§1.4). |
| 15 | **Credentials in scrollback** | Any `env` dump or stack trace can carry them. | Clear scrollback before every take. Never open `.env.local` in a visible editor tab. |

---

## 5. Recovery moves

**Something failed mid-take. Do not improvise on camera — cut, then pick one of these.**

### The order got into a bad state (early refund, double payment, over-refund)

Abandon it. Every run is fully independent — a fresh order costs ~0.3 s. Reload the
console (clears the transcript and the ledger) and start the beat again. Never try to
rescue an order on camera; the dashboard row will show the mess.

### The agent picked the wrong tool or hallucinated an id

The scenario instructions pin `temperature: 0`, so this is rare and usually means the
conversation history is polluted from a previous beat. Reload the page to clear the
session and re-run from turn 1. Do not "just continue".

### The sandbox is slow or throwing

Run `npm run demo:lifecycle` in a second terminal. If that fails too, it is Cashfree, not
you. Options, in order:

1. Wait 5 minutes and re-run the dry-run. Transient failures have been observed to clear
   on the next call.
2. Shoot the beats that need no API: beat 2 (the problem), beat 3 (install + init),
   beat 4 via the scope panel, beat 8 (CTA).
3. Fall back to `?mock=1` — scripted playback with no API and no model, with auto-advance
   on. **This is a real fallback, not a cheat, but you must not narrate it as a live run.**
   Use it for framing, timing and B-roll only; keep at least one genuine live take of
   beat 5.

### The model is slow, rate-limited, or the key is dead

Beat 5, 6 and 7 all need the model. Beats 2, 3, 4 and 8 do not, and
`npm run demo:lifecycle` / `npm run demo:swap -- --dry` are both entirely model-free and
make good terminal inserts. Shoot those while you sort the key out.

### You lost the order id needed for beats 6 and 7

Beats 6 and 7 reuse the order from beat 5 via the console's session context. If you
reloaded the page between takes, that context is gone. Re-shoot beat 5 first, or accept
the fallback prompts ("the most recent order"), which read fine but lose the on-screen id.

### You caught a credential or a `payment_session_id` on screen

Stop. Do not "fix it in the edit" as an afterthought — note the timecode immediately,
because a 138-character token is easy to miss on a scrubbing pass. Then rotate the
sandbox key before publishing regardless of whether you think you cut it.

---

## 6. Quick reference

```bash
npm run demo:lifecycle -- --runs=5    # pre-flight: five no-LLM lifecycles + summary table
npm run demo:lifecycle                # one warm-up run, right before rolling
npm run demo:lifecycle -- --help      # flags: --amount --refund --vpa --verbose --ascii
npm run demo:swap -- --dry            # three toolkits side by side, no OpenAI key
npm run demo:swap                     # same task, three frameworks (needs OPENAI_API_KEY)
npm run dev                           # the console — READ THE PRINTED PORT
```

| Constant | Value |
|---|---|
| Working test VPA | `testsuccess@gocash` (nothing else works) |
| UPI channel | `collect` |
| Order amount | ₹500 |
| Partial refund | ₹200 |
| Settle wait | ~20–32 s, variable |
| Refund settle | ~1–2 s, `PENDING` → `SUCCESS` |
| Tools in toolkit | 40 |
| Tools in lifecycle beat | 11 |
| Tools in read-only beat | 5 |

**Console URLs** (adjust the port):

```
http://localhost:3000/?scenario=lifecycle&framework=openai
http://localhost:3000/?scenario=scoped
http://localhost:3000/?scenario=reconciliation
http://localhost:3000/?mock=1                    # scripted fallback, no API, no model
```

---

## Late additions — found during live verification (read these)

**1. refund_id must be derived, never a literal — this only fails on take 2.**
Refund ids are unique **per merchant account, not per order**. At `temperature: 0` the
model will happily pick the same literal every take, so take 1 passes and take 2 dies with
a duplicate-id error. `lib/scenarios.ts` now instructs the agent to build it as
`rf_<last 10 chars of order_id>_<amount>` (e.g. `rf_FZIdb1U3PK_200`). Verified stable
across two consecutive live runs. If you edit the refund instructions, **re-test twice**.

**2. Exactly one env file.** A duplicate `.env` alongside `.env.local` caused the app to
read an empty `OPENAI_API_KEY`, because `.env.local` takes precedence in Next and an empty
value still counts as defined. There is now only `.env.local`. If you add a `.env`, expect
confusing "missing key" failures.

**3. What the scoped beat actually looks like on camera.** The agent emits **no tool call
at all** and refuses in plain text:

> "I am in read-only support mode and cannot create refunds. If you need a refund
> processed, please contact someone with refund access."

There is no red "blocked" card in a live run — scoping is structural, so there is nothing
to intercept. The visual payoff is the **scope panel** (write tools visibly absent) plus the
READ-ONLY tag. The mock was corrected to match this; do not rehearse against a mock that
shows a blocked card that live cannot produce.
If you want a genuine blocked card, use approval gating instead (hand the agent
`createRefund` with `needsApproval` and deny it) — a different, stronger claim.

**4. The reconciliation beat fires two tools in parallel** (`getPaymentsForOrder` +
`getAllRefunds`, both ~205 ms). It's the best single shot in the demo — the model picks
both tools unprompted and answers with the refund reference. Don't cut away early.

**5. All three frameworks verified live** with identical tool calls and identical results.
The swap beat is real, not staged.

---

## The `/live` recording stage

`/` is the full console (pickers, toggles, mode switches) — good for exploring, wrong for
recording, because a stray click mid-take is a reshoot. Use **`/live`** to record: same
agent, same events, same components, none of the controls.

It is keyboard-driven so the cursor can stay off-screen:

| key | action |
|---|---|
| `space` / `enter` / `→` | start, then advance one turn |
| `s` | tool scope panel — the payoff shot for the scoped beat |
| `r` | restart this scenario from turn 0 |
| `esc` | stop |

Configure by URL, so a take is reproducible by pasting a link:

```
/live                          the money lifecycle (default)
/live?scenario=scoped          the read-only agent
/live?scenario=reconciliation  the parallel-tool beat
/live?framework=langchain      same beat, different SDK — the swap shot
/live?mock=1                   scripted replay, no API calls (rehearsal / fallback)
/live?chrome=0                 hide even the top strip
/live?auto=1                   advance turns automatically
```

Advancing is **locked while the settlement poller is running**, so you cannot accidentally
fire the refund turn into an order that is still ACTIVE.

### Paying the order yourself instead of waiting

While an order is unpaid, the ledger column shows **Pay this order ↗**. It asks the server
for a link at click time, opens Cashfree's sandbox **payment simulator**, and you settle the
order in a few seconds instead of waiting out the ~20–32s auto-settle timer.

On the simulator page: **enter OTP `111000`**, choose **Success**, submit.

Do not build a checkout URL yourself. An earlier version of this project constructed
`sandbox.cashfree.com/pg/view/sessions/checkout/web/<payment_session_id>`; it returns
HTTP 200 — the SPA shell — and then renders **"Invalid Session ID"** in the browser. The
200 is meaningless. `POST /api/paylink { orderId }` now asks Cashfree for the real links
instead (`orderPayUsingUpi` with `channel: "link"`), returning both its own UPI page
(`payload.web`) and the simulator (`payload.default`).

Two things to know:

1. **Asking for the link starts a payment attempt.** If the agent has already run its UPI
   turn on that order, this is a *second* attempt. Harmless in sandbox — the order can only
   be captured once — but if you plan to pay by hand, it is cleaner to skip the
   "Pay it using UPI" turn.
2. **Sandbox only.** `/api/paylink` returns 403 when `CASHFREE_ENV=PRODUCTION`. The
   simulator does not exist in production, and a demo console should not be handing out
   payable links against real money.

### The wait is now a fixed ~10 seconds

`/live` no longer waits out the sandbox's own 19–32s auto-settle clock. Once the payment
appears it holds for 9 seconds, then asks Cashfree to complete it, and the order reads PAID
at roughly the 10s mark.

**Nothing is faked.** It posts to `POST /pg/view/simulate` — the exact call Cashfree's own
sandbox payment simulator makes when a human picks "Success" on it. The payment genuinely
completes; the order genuinely becomes PAID; `getOrder`, `getPaymentsForOrder` and the
Cashfree dashboard all agree. It is the same end state the timer would have reached, just
on a schedule you can cut to. Measured: PAID lands ~0.3s after the call.

- `?settle=0` — disable it and wait out the real timer (19–32s, variable)
- `?settle=20` — hold for 20s instead
- Sandbox only: `/api/settle` returns 403 under `CASHFREE_ENV=PRODUCTION`, and the simulate
  host is hard-coded to sandbox.

This removes the single worst on-camera risk. The refund turn can no longer be fired into an
ACTIVE order, and the wait is now a predictable beat instead of a variable stall.


### Measured timings on the recording stage (browser-verified)

Driven through a real headless browser, not curl:

| moment | when |
|---|---|
| "Awaiting payment" appears | ~2.8s after the pay turn (agent tool call) |
| settle fires | 9s after that |
| ORDER flips to PAID | ~1.5s later (2s poller) |
| **visible awaiting window** | **~10s** |

Tune with `?settle=N` seconds; `?settle=0` restores the real 19-32s sandbox timer.

### Three bugs this shook out — all fixed, all invisible to curl

1. **The auto-settle never fired.** The effect claimed its guard *before* scheduling the
   timer and depended on `state.entities`, which changes on every poll tick — so each
   re-render cancelled the pending timer and then refused to reschedule it. It silently fell
   back to the sandbox's own timer, which is why the counter ran past 16s.
2. **A phantom order entity.** A *payment* record also carries `order_id` and
   `order_amount` but no `order_status`, so `extractEntities` minted an order entity with
   `status: undefined` that clobbered the real order card, took `active` false, and killed
   the settlement poller after one tick. Now a record must declare `entity: 'order'` or
   carry an `order_status`.
3. **"Awaiting payment" started too early** — it keyed off "order exists and is unpaid"
   rather than "a payment is in flight", so the countdown began at order creation. Split
   into "Order not paid yet" vs the settling state.

The lesson worth keeping: all three were verified green by curl against the API and were
still broken in the browser. Integration bugs need the browser. `_probe/full.mjs` and
`_probe/e2e3.mjs` drive the real page via Playwright — re-run them after touching the
stage, the poller or the ledger.

### Also
- `devIndicators: false` in `next.config.ts` — the floating Next dev badge otherwise sits
  in the corner of every take.
- The agent is instructed **not** to poll `getOrder` in the pay turn. Without that rule it
  fired six identical lookups in a row, filling the transcript with a wall of repeated
  ACTIVE lines and stealing the reveal from the "What's the status?" turn.

---

## The /live stage got the liquid-glass treatment

`/live` now renders in the Cashfree 2026 liquid-glass direction, per
`cashfree-liquid-glass-image-prompts`. `/` is unchanged and still dark.

**It is light, deliberately.** The brand system's hard-avoid list bans dark and black
backgrounds outright, so the stage is a soft mint -> oat -> amber atmospheric gradient
(G1) with a faint blueprint layer: hairline dotted grid and L-shaped corner registration
brackets. All of it is scoped under a `.liquid` class in `app/live/liquid.css`, so nothing
leaks into the dark console.

**The conversation now performs.** Press space and the question *types itself* into a
frosted Spark input pill, pauses, then sends — the pause between the last character and the
request is what makes it read as someone asking rather than a script firing. The agent's
answer arrives word by word, each word fading up from a slight blur. Merchant turns are
mint-glass capsules on the right; the agent answers in white result cards led by a green
check; tool calls sit between them as quiet glass chips.

**The ledger carries more.** Net position (captured minus refunded, Indian digit grouping)
sits on top; then the four entity cards with status pills that flash on change and ids you
can click to expand; then a Created -> Paid -> Refunded timeline whose nodes light green as
the money moves; then tool-call count, elapsed, and the tool-scope ratio.

Note: the refund card reads PENDING until the final "Show me all refunds on it" turn runs —
Cashfree returns a new refund as PENDING and it settles a second or two later. Running that
last turn is what flips it to SUCCESS and lights the Refunded node. Do not cut before it.
