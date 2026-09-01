# Cashfree Agent Toolkit — demo console

An AI merchant-support agent that runs a **real money lifecycle against the Cashfree
sandbox** — create a customer, create an order, take a UPI payment, confirm it settled,
issue a partial refund, list the refunds — driven entirely by tool calls, shown in a
purpose-built console you can put on screen next to the real Cashfree dashboard.

Three things it is built to prove:

1. **The agent moves real money.** Every id, amount and status on screen came back from
   the Cashfree API. Nothing is mocked in live mode.
2. **The same toolkit runs on three agent frameworks** — OpenAI Agents SDK, LangChain,
   Vercel AI SDK — with the same tools and the same result.
3. **Scoping is structural.** Hand the agent five read tools instead of eleven and it
   cannot refund, because the refund tool is not in its context at all.

Built on [`@cashfreepayments/agent-toolkit`](https://www.npmjs.com/package/@cashfreepayments/agent-toolkit)
v1.1.0 — 40 tools (payment gateway + verification/KYC).

---

## Quickstart (60 seconds)

```bash
npm install
```

Create `.env.local` in the repo root:

```ini
CASHFREE_ENV=SANDBOX
CASHFREE_CLIENT_ID=<sandbox app id>
CASHFREE_CLIENT_SECRET=<sandbox secret key>
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1
```

Sandbox credentials come from the Cashfree merchant dashboard in **sandbox** mode
(Developers → API Keys). `.env.local` is gitignored.

Prove the sandbox works before you involve a model — this needs **no** OpenAI key:

```bash
npm run demo:lifecycle
```

```
  ok  1  createCustomer           243 ms   +91 9999999999 - uid ae9c510d...
  ok  2  createOrder              125 ms   order_4303293IgAor3H... - Rs 500 - ACTIVE
  ok  3  orderPayUsingUpi         465 ms   cf_payment_id 214984358705088 - collect - testsuccess@gocash
  ok  4  getOrder x14             32.0 s   PAID / SUCCESS - 14 polls
  ok  5  createRefund             477 ms   refund_1788176014416 - Rs 200 - PENDING (settles in ~2 s)
  ok  6  getAllRefunds            120 ms   1 refund - Rs 200 SUCCESS
```

Then start the console:

```bash
npm run dev      # http://localhost:3000
```

Pick a scenario, hit run, and watch the tool calls stream in.

---

## The three beats

Defined in [`lib/scenarios.ts`](lib/scenarios.ts). Each is a scripted sequence of human
turns — the prompts are fixed so takes are repeatable; the *tool choices* are the model's.

| Beat | What it shows | Tools given |
|---|---|---|
| **Full money lifecycle** | Customer → ₹500 order → UPI payment → status → ₹200 partial refund → refund list, in one conversation | 11 payment tools |
| **Read-only agent** | The same agent, same prompts, handed 5 read tools. Asked to refund, it says it cannot and escalates. | 5 read tools |
| **Reconciliation** | One vague question ("he says he was charged twice") → the model chains `getOrder` + `getPaymentsForOrder` + `getAllRefunds` unprompted | 5 read tools |

The console carries the `orderId` between beats, so beat 2 and beat 3 investigate the
order beat 1 actually created.

**Beat 1 takes ~35 seconds of wall clock**, and about 30 of those are a fixed sandbox
timer, not your code. See [the settle timer](#the-30-second-settle-timer).

### URL parameters

The console reads these on load, which is how you set up a take without clicking:

| Param | Effect |
|---|---|
| `?scenario=lifecycle\|scoped\|reconciliation` | preselect the beat |
| `?framework=openai\|langchain\|ai-sdk` | preselect the framework |
| `?auto=1` | auto-advance through the turns |
| `?mock=1` | scripted playback, no API and no model — the fallback if the sandbox is down |

---

## Terminal scripts

Both are plain `.mjs`, run under `node --env-file=.env.local`, and touch no Next.js code.

```bash
npm run demo:lifecycle              # one no-LLM lifecycle against the sandbox
npm run demo:lifecycle -- --runs=5  # five, then a per-step latency + pass/fail table
npm run demo:lifecycle -- --help

npm run demo:swap -- --dry          # construct all three toolkits, print tool counts (no OpenAI key needed)
npm run demo:swap                   # the same task through all three frameworks (needs OPENAI_API_KEY)
```

`scripts/lifecycle.mjs` executes tools through `toolkit.handleToolCall()`, the toolkit's
own no-LLM path. It is the pre-flight check before a recording: if this passes five times,
the sandbox is healthy and any failure on camera is yours, not Cashfree's.

---

## Project layout

```
lib/events.ts        the contract. RunEvent discriminated union, streamed over SSE.
                     Server emits, client narrows. Single source of truth.
lib/scenarios.ts     the three beats: tool scopes, instructions, turn prompts.
lib/cashfree.ts      one toolkit instance per process + selectTools().
lib/ledger.ts        reads a Cashfree tool result correctly (see "tools never throw").
lib/adapters/        one file per framework, behind a single FrameworkAdapter interface.
lib/tool-catalog.ts  display mirror of the 40 tools, so the scope panel can show
                     what the agent was NOT given.

app/api/run/         SSE route that drives an agent run.
app/api/order/       order-status polling, deliberately outside /api/run.
components/          the console UI.

scripts/             no-LLM terminal runners (lifecycle dry-run, framework swap).
docs/                verified findings. Read SANDBOX-FINDINGS.md before you touch
                     anything money-shaped, and SHOOT-RUNBOOK.md before you record.
```

---

## How the framework swap works

The honest version, because the marketing line is not literally true.

**The three toolkit entry points are not drop-in compatible with each other:**

| subpath | class | tools array | tool map |
|---|---|---|---|
| `/openai` | `CashfreeAgentToolkit` | `getAgentTools()` → `Array<tool()>` | `.tools.getOrder` |
| `/langchain` | `CashfreeAgentToolkit` | `getTools()` → `Array<StructuredTool>` | `.toolsMap.getOrder` |
| `/ai-sdk` | `CashfreeAISDKToolkit` | `getTools()` → `Record<name, tool>` | `.tools.getOrder` |

Different class name, different accessor, different return shape. You cannot swap one
import line and be done.

What you *can* do is absorb that difference once. `lib/adapters/types.ts` defines a
`FrameworkAdapter` — `resolveToolNames()` and `runTurn()` — and each of the three files
under `lib/adapters/` implements it against its own SDK. Everything above that line
(scenarios, events, the UI) is framework-agnostic, so on camera the swap really is one
constant: the console's `framework` state, which the header button cycles.

Run `npm run demo:swap -- --dry` to see all three constructed side by side:

```
  ok OpenAI Agents SDK CashfreeAgentToolkit    getAgentTools()   Array<tool()>          40
  ok LangChain         CashfreeAgentToolkit    getTools()        Array<StructuredTool>  40
  ok Vercel AI SDK     CashfreeAISDKToolkit    getTools()        Record<name, tool>     40
```

Same account, same 40 tools, three ecosystems — and three different ways to reach them.

---

## How tool scoping works

There is no allow-list middleware and nothing to bypass. You hand the agent an array:

```ts
// lib/cashfree.ts
export function selectTools(names: string[] | null) {
  const tk = getToolkit();
  if (names === null) return tk.getAgentTools();
  return names.map((name) => tk.tools[name]);   // throws on an unknown name
}
```

```ts
// lib/adapters/openai.ts
new Agent({ instructions, model, tools: selectTools(toolNames) })
```

The withheld tools are never serialised into the request, so the model does not know
they exist. In the read-only beat the agent is given `getOrder`, `getPaymentsForOrder`,
`getPaymentById`, `getAllRefunds`, `getRefund` — and when asked to refund ₹200 it can
only answer in words. That is the mechanism, not a guardrail prompt: the scope panel in
the console shows the 5 given against the 40 in the catalogue.

---

## Sandbox facts that will bite you

Full detail in [`docs/SANDBOX-FINDINGS.md`](docs/SANDBOX-FINDINGS.md), verified over six
end-to-end runs. The four that matter most:

### The 30-second settle timer

`orderPayUsingUpi` with `channel: "collect"` returns in ~400 ms with **no status field**.
The order is still `ACTIVE` and the payment row is `NOT_ATTEMPTED`. Cashfree's sandbox
simulator auto-approves the collect request **server-side on a fixed ~30 s timer** —
measured at 30.6–31.4 s across six runs, always exactly 14 polls at 2 s. No webhook, no
browser step; you just wait. It cannot be shortened, so plan for it: the console polls
`/api/order` on its own and flips the order card to a green **PAID** pill when it lands.

Refunding before that lands hard-fails with `order_id_not_paid`.

### The test VPA is `testsuccess@gocash`

Not `testsuccess@gateway` (→ `upi_id_invalid`). A dozen other plausible VPAs were probed
and rejected; only the `@gocash` handle passes. `testfailure@gocash` is accepted but
never resolves — do not build a failure demo on it.

### Tools never throw

A failed call **resolves** to `{ error, details: { code, message, help } }`. `try/catch`
catches nothing, so a naive happy-path UI renders a green tick over a failed call. Branch
on the payload. Key off `details.code`, not `error` — the `error` string is mislabelled
upstream (a failed `createCustomer` reports `"Failed to fetch order"`), and `details.help`
is a long shortener blob that will blow out any layout. `lib/ledger.ts` does all of this.

### `payment_session_id` must never reach the screen

It is a ~138-character bearer-style token. Agent run history stays server-side, tool args
and results are redacted before they become `RunEvent`s, and the terminal scripts print
its length instead of its value. Reusing one also silently creates a *second* payment
attempt, so guard against double-submit.

---

## Docs

| File | What it is |
|---|---|
| [`docs/SANDBOX-FINDINGS.md`](docs/SANDBOX-FINDINGS.md) | The verified lifecycle: working payloads, timings over six runs, every error code and gotcha. Ground truth. |
| [`docs/SHOOT-RUNBOOK.md`](docs/SHOOT-RUNBOOK.md) | Recording day: pre-flight, beat-by-beat shot list, on-camera traps, recovery moves. |
| [`docs/AGENTS-SDK-NOTES.md`](docs/AGENTS-SDK-NOTES.md) | OpenAI Agents SDK reference, verified against the shipped `.d.ts`. |
| [`docs/tool-schemas.txt`](docs/tool-schemas.txt) | All 40 tool names, plus the full JSON Schema for the 7 lifecycle tools as the model sees them. |
| [`CLAUDE.md`](CLAUDE.md) | Pinned versions, resolved risks, repo conventions. |

## Requirements

Node 20+ (developed on 24.16), a Cashfree **sandbox** account, and an OpenAI key for the
console. `scripts/lifecycle.mjs` needs only the Cashfree credentials.

`scripts/lifecycle.mjs` refuses to run when `CASHFREE_ENV=PRODUCTION`. Keep it that way.

## Two surfaces

| route | what it is |
|---|---|
| `/` | the full console — scenario picker, framework cycler, live/mock toggle. For exploring. |
| `/live` | the **recording stage**. Same agent and components, no controls. Keyboard-driven so the cursor stays off-screen. |

`/live` keys: `space`/`enter`/`→` advance a turn · `s` tool scope · `r` restart · `esc` stop.
Configure by URL — `?scenario=scoped` · `?framework=langchain` · `?mock=1` · `?chrome=0` · `?auto=1`.


While an order is unpaid, the ledger shows **Pay this order ↗**, which fetches a real
payment link from `POST /api/paylink` and opens Cashfree's sandbox simulator — enter OTP
`111000`, choose Success, and the order settles at once rather than waiting out the
~20–32s auto-settle timer. Sandbox only (403 under `CASHFREE_ENV=PRODUCTION`).

Do not construct checkout URLs from a `payment_session_id`: that page returns HTTP 200 and
then renders "Invalid Session ID". Ask Cashfree for the link instead.
