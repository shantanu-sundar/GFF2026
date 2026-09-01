# Cashfree SANDBOX — Real Money-Lifecycle Validation (NO LLM)

**Date:** 2026-08-31 · **Toolkit:** `@cashfreepayments/agent-toolkit@1.1.0` (`/openai` entrypoint)
**Env:** `CFEnvironment.SANDBOX` · **Creds:** `CASHFREE_CLIENT_ID` / `CASHFREE_CLIENT_SECRET` from `C:\Toolkit\.env.local`
**Scripts:** `C:\Toolkit\_probe\dump.mjs`, `C:\Toolkit\_probe\lifecycle.mjs` · **Logs:** `C:\Toolkit\_probe\logs\run{1..5}.log` · **Metrics:** `C:\Toolkit\_probe\metrics.jsonl`
**Schemas:** `C:\Toolkit\docs\tool-schemas.txt` (40 tools)

---

## 1. Verdict

**YES — the full 6-step lifecycle works end-to-end on sandbox with these credentials, with zero LLM involved.**

**6 / 6 runs succeeded.** Every run reached `order_status: PAID` / `payment_status: SUCCESS` and completed a partial refund that settled to `refund_status: SUCCESS`. Zero timeouts, zero 5xx, zero flakes across 6 runs (~200 tool calls). The only error observed was a *deliberate* probe (refund before payment).

Two corrections to the original plan, both confirmed empirically:

- `testsuccess@gateway` is **rejected** (`upi_id_invalid`). The working VPA is **`testsuccess@gocash`**.
- `createOrder` **does not accept an `order_id`** — Cashfree generates it. You cannot use `demo_order_<timestamp>` as the order id; put it in `order_note` instead.

### How to execute a tool with no LLM

The toolkit ships its own no-LLM executor. **Use `handleToolCall`:**

```js
import { CashfreeAgentToolkit, CFEnvironment } from '@cashfreepayments/agent-toolkit/openai';
const tk = new CashfreeAgentToolkit(CFEnvironment.SANDBOX, clientId, clientSecret);

const res = await tk.handleToolCall({
  id: 'call_1', type: 'function',
  function: { name: 'createOrder', arguments: JSON.stringify(args) },
});
const data = JSON.parse(res.content);   // res = { role:'tool', tool_call_id, content:<string> }
```

Runtime shape of `tk.tools.<name>` (an `@openai/agents` tool object):
`["type","name","description","parameters","strict","invoke","needsApproval","isEnabled","inputGuardrails","outputGuardrails"]`
— there is **no `.execute`**. `.invoke(runContext, argsJsonString)` also works and returns a **string**, but it runs zod validation and, on bad input, returns the opaque string `"An error occurred while running the tool. Please try again. Error: InvalidToolInputError: Invalid JSON input for tool"` instead of the real API error.

| Path | Validates args (zod) | Returns | Recommendation |
|---|---|---|---|
| `tk.handleToolCall({...})` | **No** — args go straight to the API | `{role,tool_call_id,content:string}` | **Preferred.** Real Cashfree error codes come back verbatim. |
| `tk.tools.X.invoke({}, argsJson)` | Yes | `string` | Use only if you want client-side schema enforcement. Masks API errors. |
| `tk.toolDefinitions[i].execute(tk.cashfree, args)` | No | parsed object | Internal; works but undocumented. |

All three ultimately call the same `cashfree-pg` SDK methods (`PGCreateOrder`, `PGPayOrder`, `PGFetchOrder`, `PGOrderFetchPayments`, `PGRefundOrder`, `PGOrderFetchRefunds`, `PGCreateCustomer`) with the `x-sdk-platform: nodejssdk-agenttoolkit.1.1.0` header.

---

## 2. The exact working call sequence

Copy-pasteable argument objects. **Every field listed in the JSON Schema's `required` array must be present, including the nullable ones — pass explicit `null`.** The toolkit's schemas are `strict`, so `return_url`, `order_note`, `upi_redirect_url`, `refund_splits`, etc. are all *required keys with nullable values*.

### Step 1 — `createCustomer`

```json
{
  "customer_phone": "9999999999",
  "customer_email": "rahul@example.com",
  "customer_name": "Rahul Sharma"
}
```

### Step 2 — `createOrder` (no `order_id` field — CF generates it)

```json
{
  "order_amount": 500,
  "order_currency": "INR",
  "customer_id": "cust_1788174655651",
  "customer_name": "Rahul Sharma",
  "customer_email": "rahul@example.com",
  "customer_phone": "9999999999",
  "return_url": null,
  "order_note": "demo_order_1788174655651"
}
```

`customer_id` is a **merchant-chosen string**, not the `customer_uid` from step 1. Grab `order_id` and `payment_session_id` from the response.

### Step 3 — `orderPayUsingUpi`

```json
{
  "payment_session_id": "<payment_session_id from step 2>",
  "channel": "collect",
  "upi_id": "testsuccess@gocash",
  "upi_redirect_url": null,
  "upi_expiry_minutes": null,
  "authorize_only": null,
  "authorization": null,
  "save_instrument": null,
  "offer_id": null
}
```

### Step 4 — poll `getOrder` + `getPaymentsForOrder`

```json
{ "order_id": "order_4303293Ig8496RkDcRj9bUB9wk6lW0Afj" }
```

Poll every 2000 ms until `order_status === "PAID"` (or `payments[0].payment_status === "SUCCESS"`). **~31 s / 14 polls.** Use a 60 s ceiling.

### Step 5 — `createRefund` (partial 200)

```json
{
  "order_id": "order_4303293Ig8496RkDcRj9bUB9wk6lW0Afj",
  "refund_amount": 200,
  "refund_id": "refund_1788174655651",
  "refund_note": "Partial refund demo",
  "refund_speed": "STANDARD",
  "refund_splits": null
}
```

### Step 6 — `getAllRefunds`

```json
{ "order_id": "order_4303293Ig8496RkDcRj9bUB9wk6lW0Afj" }
```

**Wait ~2 s after step 5** or this returns `refund_status: "PENDING"` (see §5).

---

## 3. The UPI test VPA that actually works

| VPA | Result |
|---|---|
| `testsuccess@gateway` | ❌ `upi_id_invalid` — *"Invalid UPI ID entered"* (rejected at request validation; no payment created) |
| **`testsuccess@gocash`** | ✅ **Accepted → auto-SUCCESS after ~30 s** |
| `testfailure@gocash` | ⚠️ Accepted, but stayed `NOT_ATTEMPTED` for 63 s — **does not auto-fail** (see §5) |

Probed and rejected: `success@upi`, `failure@upi`, `test@success`, `9999999999@ybl`, `success@gocash`, `testsuccess@cfsdk`, `rahul@okicici`, `test@okhdfcbank`, `cashfree@upi`, `success@paytm`, `abc@upi`. Only the `@gocash` handle passes Cashfree's VPA validator in this sandbox.

### How SUCCESS is reached

`orderPayUsingUpi` with `channel: "collect"` returns **immediately (~400 ms)** with `action: "custom"` and a `cf_payment_id`. At that instant the payment row exists with `payment_status: "NOT_ATTEMPTED"` and the order is still `ACTIVE`. Cashfree's sandbox simulator then auto-approves the collect request **server-side on a fixed ~30-second timer**. No callback, webhook, browser step, or extra API call is required — you just poll. The resulting payment carries `payment_message: "Simulated response message"` and `bank_reference: "1234567890"`.

Other channels (probed, not used in the lifecycle):

- `channel: "link"` → returns a `data.payload` map of UPI intent links (`bhim`, `default`, …) pointing at `https://payments-test.cashfree.com/pgbillpayuiapi/simulator/<cf_payment_id>?...` — a **manually clickable** sandbox simulator page.
- `channel: "qrcode"` → returns `data.payload.qrcode` as a `data:image/png;base64,...` string, renderable directly in an `<img>`.

Both require `upi_id: null`. Neither auto-succeeds; `collect` + `testsuccess@gocash` is the only hands-free path.

---

## 4. Timing table

### Per-step latency (ms), 5 consecutive runs

| Step | Tool | run1 | run2 | run3 | run4 | run5 | run6 | typical |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | `createCustomer` | 505 | 274 | 141 | 374 | 152 | 198 | 140–510 |
| 2 | `createOrder` | 140 | 189 | 86 | 358 | 262 | 322 | 85–360 |
| 3 | `orderPayUsingUpi` | 415 | 527 | 363 | 511 | 818 | 519 | 360–820 |
| 4 | `getOrder` (per poll) | 44–200 | — | — | — | — | — | ~50–120 |
| 4 | `getPaymentsForOrder` (per poll) | 43–218 | — | — | — | — | — | ~50–130 |
| 5 | `createRefund` | 452 | 476 | 227 | 172 | 447 | 258 | 170–480 |
| 6 | `getAllRefunds` | 143 | 79 | 80 | 59 | 102 | 138 | 60–145 |

### Run-level

| Run | Wall time | Polls | Time to PAID | Final status | Refund |
|---|---:|---:|---:|---|---|
| run1 | 32 332 ms | 14 | 30 896 ms | PAID / SUCCESS | ✅ |
| run2 | 32 239 ms | 14 | 31 212 ms | PAID / SUCCESS | ✅ |
| run3 | 31 181 ms | 14 | 30 634 ms | PAID / SUCCESS | ✅ |
| run4 | 32 177 ms | 14 | 31 202 ms | PAID / SUCCESS | ✅ |
| run5 | 32 365 ms | 14 | 31 392 ms | PAID / SUCCESS | ✅ |
| run6 | 34 481 ms | 14 | 31 045 ms | PAID / SUCCESS | ✅ (settles to SUCCESS — includes the 2.5 s settle wait) |

**Time-to-PAID: min 30 634 / max 31 392 / avg 31 054 ms — a 758 ms spread over 6 runs. Step 3 → 4 timing is extremely stable: exactly 14 polls at a 2 s interval, every single run.**

- **Polling delay needed after `orderPayUsingUpi`: ~31 s.** Nothing happens before ~30 s; polling earlier is pure waste. A sensible pattern is `sleep(28000)` then poll at 1–2 s.
- **Refund settlement: `PENDING` → `SUCCESS` in ~1–1.7 s.** `createRefund` itself always returns `PENDING`.
- **Rate limits: none hit.** 25 parallel `getOrder` calls completed in 478 ms with 0 errors. ~60 sequential calls per run, 5 runs back-to-back, no throttling.

---

## 5. Gotchas

### Schema / arguments

1. **All nullable fields are still `required`.** The zod schemas are converted with `strict: true`, so `required` includes `return_url`, `order_note`, `upi_id`, `upi_redirect_url`, `upi_expiry_minutes`, `authorize_only`, `authorization`, `save_instrument`, `offer_id`, `refund_note`, `refund_speed`, `refund_splits`. Omitting them is fine via `handleToolCall` but fails via `.invoke()`. Always send explicit `null`.
2. **`createOrder` has no `order_id` parameter.** Cashfree assigns `order_id` (e.g. `order_4303293Ig8496RkDcRj9bUB9wk6lW0Afj` — a 34-char suffix, prefixed with your merchant id `4303293`) and a numeric string `cf_order_id` (e.g. `"214978005419968"`). A run-scoped label must go in `order_note`.
3. **`createCustomer` and `createOrder` are not actually linked.** `createCustomer` returns a UUID `customer_uid`; `createOrder` takes a merchant-chosen `customer_id` string and re-accepts name/email/phone inline. Passing the `customer_uid` as `customer_id` works and is stored verbatim, but `getOrder` still returns `customer_details.customer_uid: null`. **Step 1 is decorative for the payment flow** — `createOrder` works standalone.
4. **`createCustomer` echoes `customer_email: null, customer_name: null`** even on success. Only `customer_uid` and a normalized `customer_phone` (`"+91 9999999999"`) come back. Don't render those nulls.
5. **`createCustomer` is idempotent on phone number.** Two calls with `9999999999` and different emails returned the *same* `customer_uid`. No duplicate error.
6. **`customer_phone` must be exactly 10 digits** (or `+91`-prefixed). 11 digits → `customer_phone_invalid`.
7. **`order_amount` must be ≥ 1.00 and have ≤ 2 decimals.** `0`, `-5`, and `0.5` all → `order_amount_invalid`.
8. **`refund_id` is alphanumeric + underscore only.** `refund_1788174655651` ✅ ; `bad id#123!` → `refund_id_invalid` — *"refund_id format not valid"*.

### Refunds

9. **You cannot refund before PAID.** `createRefund` on an `ACTIVE` order → `{"code":"order_id_not_paid","message":"transaction not found"}`. Verified twice.
10. **Duplicate `refund_id` → `refund_id_invalid` / "Duplicate Merchant Refund Id".** Refund ids are unique per merchant, not per order. Always timestamp them.
11. **Over-refund → `refund_post_failed` / "Total amount of Refunds cannot be greater than the transaction amount."** The cap is cumulative across all refunds on the order.
12. **`refund_speed` accepts only `"STANDARD"` or `"INSTANT"` (or `null`).** Anything else → `refund_speed_invalid`. **`INSTANT` is silently downgraded in sandbox**: the response shows `refund_speed: {requested:"INSTANT", accepted:"STANDARD"}`.
13. **`createRefund` always returns `refund_status: "PENDING"`, `processed_at: null`.** It flips to `SUCCESS` ~1–1.7 s later. Calling `getAllRefunds` immediately shows PENDING.

### Payments

14. **A `payment_session_id` is reusable — dangerously so.** Calling `orderPayUsingUpi` twice with the same session created a **second payment attempt with a new `cf_payment_id`** and no error. Guard against double-submit.
15. **`testfailure@gocash` does not auto-fail.** It sits at `NOT_ATTEMPTED` indefinitely (63 s observed, `error_details: null`). Do not build a failure-path demo around a timer; use a real error instead (early refund, over-refund, bad VPA).
16. **`getPaymentsForOrder` returns `[]` (bare array, not `{data:[]}`) before any payment attempt** — index into `[0]` defensively.
17. **`payment_status` enum seen: `NOT_ATTEMPTED` → `SUCCESS`.** `order_status` seen: `ACTIVE` → `PAID`. Also possible: `EXPIRED`, `TERMINATED`, `FAILED`, `USER_DROPPED`.

### Error shape

18. Tools **never throw** — they resolve to an error *object*, so `try/catch` won't catch anything. Always check `result.error`:

```json
{
  "error": "Failed to create refund",
  "details": {
    "code": "order_id_not_paid",
    "message": "transaction not found",
    "type": "invalid_request_error",
    "help": "Check latest errors and resolution from Merchant Dashboard API logs: https://bit.ly/4glEd0W ..."
  }
}
```

The `details.help` string is long and shortener-laden — **strip it before rendering in UI.**

19. **Toolkit bug:** `createCustomer`'s error handler is mislabelled — a failed `createCustomer` returns `"error": "Failed to fetch order"`. Don't key UI copy off the `error` string; use `details.code`.
20. `handleToolCall` on an unknown tool returns `{"error":"Tool <name> not found"}` (no throw).

---

## 6. Sample real responses (trimmed) — what the UI can render

**1 · `createCustomer`**

```json
{ "customer_uid": "ae9c510d-1996-42f9-a59c-f9d12f62aca8",
  "customer_phone": "+91 9999999999",
  "customer_email": null, "customer_name": null }
```

**2 · `createOrder`**

```json
{ "cf_order_id": "214978005419968",
  "order_id": "order_4303293Ig8496RkDcRj9bUB9wk6lW0Afj",
  "entity": "order",
  "order_amount": 500, "order_currency": "INR",
  "order_status": "ACTIVE",
  "order_note": "demo_order_1788174655651",
  "created_at": "2026-08-31T16:37:45+05:30",
  "order_expiry_time": "2026-09-30T16:37:45+05:30",
  "payment_session_id": "session_KIAnGV1UPanqhnle-...-payment",
  "customer_details": { "customer_id": "cust_1788174655651", "customer_name": "Rahul Sharma",
                        "customer_email": "rahul@example.com", "customer_phone": "9999999999",
                        "customer_uid": null },
  "order_meta": { "return_url": null, "notify_url": null,
                  "payment_methods": null, "payment_methods_filters": null },
  "order_splits": [], "order_tags": null, "cart_details": null, "terminal_data": null }
```

`payment_session_id` is ~138 chars and always ends in `payment`. **Never show it on camera.**

**3 · `orderPayUsingUpi`** *(returns in ~400 ms; note there is no status field)*

```json
{ "action": "custom",
  "cf_payment_id": "214978555099072",
  "channel": "collect",
  "payment_amount": 500,
  "payment_method": "upi",
  "data": { "url": null, "payload": null, "content_type": null, "method": null } }
```

**4a · `getOrder` after PAID** — same shape as step 2 with `"order_status": "PAID"`.

**4b · `getPaymentsForOrder` after SUCCESS** (array)

```json
[{ "cf_payment_id": "214978555099072",
   "order_id": "order_4303293Ig7wpbgWGf0jSr6KapKRLlDcMm",
   "entity": "payment",
   "payment_status": "SUCCESS",
   "payment_amount": 500, "payment_currency": "INR",
   "order_amount": 500, "order_currency": "INR",
   "payment_group": "upi",
   "payment_method": { "upi": { "channel": "collect", "upi_id": "testsuccess@gocash",
                                "upi_instrument": "UPI", "upi_instrument_number": "",
                                "upi_payer_account_number": "", "upi_payer_ifsc": "" } },
   "payment_time": "2026-08-31T16:39:59+05:30",
   "payment_completion_time": "2026-08-31T16:40:29+05:30",
   "payment_message": "Simulated response message",
   "bank_reference": "1234567890",
   "is_captured": true, "error_details": null,
   "payment_surcharge": { "payment_surcharge_service_charge": 0, "payment_surcharge_service_tax": 0 },
   "payment_gateway_details": { "gateway_name": "CASHFREE", "gateway_settlement": "cashfree",
                                "gateway_order_id": null, "gateway_payment_id": null,
                                "gateway_status_code": null },
   "international_payment": { "international": false },
   "auth_id": null, "authorization": null, "payment_offers": null }]
```

> `payment_completion_time` − `payment_time` = **exactly 30 s** — the sandbox simulator's fixed delay.

**5 · `createRefund`**

```json
{ "cf_refund_id": "1319846526",
  "cf_payment_id": "214978794866624",
  "refund_id": "refund_1788174655651",
  "order_id": "order_4303293Ig8496RkDcRj9bUB9wk6lW0Afj",
  "entity": "refund",
  "refund_amount": 200, "refund_currency": "INR",
  "refund_status": "PENDING",
  "status_description": "In Progress",
  "refund_note": "Partial refund demo",
  "refund_type": "MERCHANT_INITIATED", "refund_mode": "NORMAL",
  "refund_speed": { "requested": "STANDARD", "accepted": "STANDARD",
                    "processed": null, "message": null },
  "created_at": "2026-08-31T16:41:28+05:30",
  "processed_at": null, "refund_arn": null,
  "refund_charge": 0, "charges_currency": "INR", "refund_splits": [], "metadata": null,
  "forex_conversion_rate": 0, "forex_conversion_handling_charge": 0, "forex_conversion_handling_tax": 0 }
```

**6 · `getAllRefunds`** — array of the above. After ~2 s the same record reads:

```json
{ "refund_status": "SUCCESS",
  "status_description": "Refund processed successfully",
  "processed_at": "2026-08-31T16:41:29+05:30",
  "refund_speed": { "requested": "STANDARD", "accepted": "STANDARD",
                    "processed": "STANDARD", "message": null } }
```

**Fields worth rendering:** `order_id`, `cf_order_id`, `order_amount` + `order_currency`, `order_status`, `cf_payment_id`, `payment_status`, `payment_method.upi.upi_id`, `payment_completion_time`, `bank_reference`, `refund_id`, `cf_refund_id`, `refund_amount`, `refund_status`, `status_description`.

**Enums:** `order_status` ∈ {ACTIVE, PAID, EXPIRED, TERMINATED} · `payment_status` ∈ {NOT_ATTEMPTED, SUCCESS, FAILED, USER_DROPPED, PENDING} · `refund_status` ∈ {PENDING, SUCCESS, FAILED, CANCELLED}.

---

## 7. What would break on camera — and how to avoid it

| Risk | Why | Mitigation |
|---|---|---|
| **~31 s of dead air after `orderPayUsingUpi`** | The sandbox simulator's fixed 30 s auto-approve timer. It is *not* network latency and cannot be shortened. This is the single biggest on-camera hazard. | Show a live poll counter / spinner with `t+Xs`, cut away and back, or speed-ramp the clip. Budget it into the script — do **not** plan for an instant `PAID`. |
| **Using `testsuccess@gateway`** | Hard `upi_id_invalid` failure. | Use **`testsuccess@gocash`**. Pin it as a constant, not a typed-live string. |
| **Refund shows `PENDING` right after `createRefund`** | It settles ~1–1.7 s later. Chaining `getAllRefunds` immediately makes the demo end on "In Progress". | `await sleep(2500)` before step 6, or re-poll `getAllRefunds` until `SUCCESS`. |
| **`payment_session_id` on screen** | It's a live bearer-style token, ~138 chars, and would visually wrap/clip anyway. | Mask it (`session_KIAnG…payment`) in any log or UI panel. |
| **Client id / secret in a terminal scrollback** | Any `env` dump or error trace could expose them. | Load from `.env.local` only; never echo. `.env.local` is already covered by `.gitignore`. |
| **Reusing a hardcoded `refund_id` across takes** | Second take → `refund_id_invalid` / "Duplicate Merchant Refund Id". Refund ids are unique **per merchant**, so a re-shoot with the same id fails. | Always `refund_${Date.now()}`. Same for `customer_id`. |
| **Re-running a take against the same order** | `createRefund` on an already-fully-refunded order → `refund_post_failed`. | Create a fresh order per take (each run is fully independent — verified across 5). |
| **A demo built on `testfailure@gocash`** | It never resolves; it just sits at `NOT_ATTEMPTED`. | Demo the failure path with a synchronous error instead — early refund (`order_id_not_paid`) or over-refund (`refund_post_failed`) both return in <500 ms. |
| **`try/catch` around tool calls showing "success" on failure** | Tools resolve with an error *object*, never throw. A naive happy-path UI would render a green tick over a failed call. | Branch on `result.error` / `result.details.code` before rendering. |
| **Rendering `details.help`** | It is a long URL-shortener blob that will blow out any card layout. | Render `details.code` + `details.message` only. |
| **`order_id` not being your demo string** | CF generates it; `demo_order_<ts>` lives in `order_note`. | Either display the real `order_id`, or label the `order_note` clearly as "reference". |
| **Network flake** | None observed in 5 runs / ~60 calls, but sandbox is not SLA-backed. | Do a warm-up run immediately before recording; keep a captured `logs/run*.log` as a fallback. |

**Recommended on-camera timing:** ~1 s (customer) → ~0.3 s (order) → ~0.5 s (UPI pay) → **~31 s wait** → ~0.5 s (refund) → ~2.5 s wait → ~0.1 s (list refunds). **Total ≈ 36 s.**
