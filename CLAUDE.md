# Cashfree Agent Toolkit — demo

Demo app for a ~3 min product video: an AI merchant-support agent that runs a real
money lifecycle against the **Cashfree sandbox**, shown in a purpose-built agent
console (left of screen) next to the real Cashfree dashboard (right of screen).

## Layout
- `lib/events.ts` — **the contract.** `RunEvent` discriminated union, streamed over SSE.
  Server emits, client narrows. Single source of truth; don't widen it.
- `lib/scenarios.ts` — the three demo beats and their tool scopes.
- `lib/adapters/` — one file per framework (`openai`, `langchain`, `ai-sdk`).
- `app/api/run/` — SSE route that drives an agent run.
- `app/`, `components/` — the console UI.
- `scripts/` — no-LLM terminal runners (sandbox dry-run, framework swap).
- `docs/` — verified findings from research passes.

## Verified ground truth (do not re-derive)

**Package** `@cashfreepayments/agent-toolkit@1.1.0`. **40 tools total: 22 payment
gateway + 18 verification/KYC** — counted from `getAgentTools()`, not from the README
(which implies 41). We demo a subset of the payment ones.

**The three adapters are NOT drop-in identical.** This matters — the marketing
line "change one import" is not literally true:

| subpath | class | tools array | tool map |
|---|---|---|---|
| `/openai` | `CashfreeAgentToolkit` | `getAgentTools()` | `.tools.getOrder` |
| `/langchain` | `CashfreeAgentToolkit` | `getTools()` (array) | `.toolsMap.getOrder` |
| `/ai-sdk` | `CashfreeAISDKToolkit` | `getTools()` (object) | `.tools.getOrder` |

So the demo hides this behind `lib/adapters/*` and swaps a single `FRAMEWORK`
constant instead. Same tools, same agent, same result, three ecosystems.

**`/openai` targets the Agents SDK properly** — `getAgentTools()` returns real
`tool()` objects from `@openai/agents` (peer dep `^0.3.0`), each wrapping
`toolDef.execute(cashfree, args)` and JSON-stringifying the result.

**Tool scoping is structural**, not a middleware allow-list: you hand
`new Agent({ tools: [...] })` a subset and the model simply never sees the rest.

## Gotchas
- `npm install zod@3` fails with ERESOLVE here. Let npm resolve zod itself.
- The directory is `C:\Toolkit` (capital T) so `create-next-app` refuses to name a
  project after it; the app was scaffolded elsewhere and hoisted. Package name is
  `cashfree-agent-demo`.
- `npx tsc` may try to install the unrelated `tsc` package from npm. Use
  `./node_modules/.bin/tsc --noEmit`.
- Credentials live in `.env.local` (gitignored). Sandbox test creds; `OPENAI_API_KEY`
  is filled in separately.

## Resolved risks (verified, don't re-investigate)

**zod 3 vs zod 4 is a non-issue.** The toolkit ships a nested `zod@3.25.76` and
builds its schemas with it, while root resolves `zod@4.5.4` for `@openai/agents`.
They never meet: `tool()` converts the zod schema to plain JSON Schema eagerly at
construction, so `tk.tools.createOrder.parameters` is already a plain object
(`strict: true` preserved). Verified by constructing an `Agent` with a toolkit tool.

**Never run two `npm install`s concurrently here** — the second rewrites
`package.json` and silently drops the first's deps while still exiting 0.

## Pinned versions
`@openai/agents` 0.3.9 · `openai` 6.49.0 · `zod` 4.5.4 (root) / 3.25.76 (nested)
`@langchain/core` 1.2.9 · `@langchain/openai` 1.5.10 · `langchain` 1.5.10
`ai` 6.0.272 · `@ai-sdk/openai` 3.0.105 · `next` 16.3.3 · `react` 19.2.8

## Tool schema notes
- 40 tools total (README's "23 + 19" is wrong; `getAgentTools().length === 40`).
- `createOrder` requires `customer_name`, `customer_email`, `customer_phone`,
  `return_url`, `order_note` — the last two are required-but-nullable, so the model
  must pass explicit `null`s. Strict mode handles this; don't fight it in the prompt.
- `createCustomer`'s three param descriptions are copy-paste bugs upstream (all read
  "The unique identifier for the order whose status is to be fetched"). Harmless for
  tool selection, but visible to anyone reading the package. Worth an upstream fix.
- Execution paths: agent tools expose `.invoke(ctx, argsJson)`; `tk.handleToolCall()`
  is the no-LLM path used by `scripts/`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

**Strict tool-calling: the two conversions differ.** Verified empirically:
- `tk.tools.<name>.parameters` (Agents SDK path) — the SDK does its OWN zod→JSON
  Schema conversion and puts **all** properties in `required` (createOrder: 8/8),
  so `strict: true` is safe. The flagship OpenAI path is fine.
- `tk.getTools()` (Chat Completions path) — uses raw `zodToJsonSchema`, which honours
  `.default()` and leaves `order_currency` **out** of `required` (7/8). Enabling
  OpenAI strict mode over this schema is a hard 400 on the whole request.

That is why `lib/adapters/langchain.ts` and `ai-sdk.ts` deliberately do NOT enable
strict tool calling, while `openai.ts` inherits it safely.

**Framework-swap honesty caveat:** the OpenAI adapter talks to the **Responses API**
with strict schemas; LangChain and AI SDK talk to **Chat Completions** with
non-strict ones. Same tools, same scoping, same events, same ledger — but not
byte-identical requests. Claim "same result across three ecosystems", not
"identical requests".

## Verified LIVE end-to-end (2026-08-31, real key + real sandbox)

All three beats and all three frameworks were run against the live sandbox:

- **lifecycle** — 6 turns, 6 tool calls, ids carried across turns, `payment_session_id`
  masked in the emitted args, order ACTIVE→PAID, refund PENDING→SUCCESS. Ran twice.
- **scoped** — 5/40 tools. Asked to refund, the agent made **zero tool calls** and
  refused in plain text. Confirms scoping is structural.
- **reconciliation** — 5/40 tools, model chose `getPaymentsForOrder` + `getAllRefunds`
  **in parallel** unprompted and produced a customer-facing answer citing the refund id.
- **framework swap** — `openai`, `langchain` and `ai-sdk` each ran turn 1 with identical
  tool calls, identical args and the identical `customer_uid`.

### The refund_id trap (found only on the second live run)
At `temperature: 0` the model originally chose the fixed literal `refund_id: "refund_200_1"`.
Refund ids are unique **per merchant, not per order**, so take 2 would have hard-failed
with a duplicate. `BASE_INSTRUCTIONS` now requires deriving it from the order id
(`rf_<last10 of order_id>_<amount>`, e.g. `rf_FZIdb1U3PK_200`), verified stable across runs.
**Any change to the refund instructions must be re-tested with two consecutive runs** —
a single run cannot catch this class of bug.

### Env precedence footgun (fixed)
A duplicate `.env` held the real `OPENAI_API_KEY` while `.env.local` defined it as empty.
`.env.local` wins in Next, so the app silently saw an empty key. Consolidated into
`.env.local`; `.env` deleted. Keep exactly one env file.
