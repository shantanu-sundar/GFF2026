/**
 * Scripted RunEvent replay — the dev harness and the demo's insurance policy.
 *
 * Every event here is a real `RunEvent` off the contract in lib/events.ts and
 * is fed through exactly the same reducer the live SSE stream uses, so what you
 * see in mock mode is what you get on camera. Payloads mirror the real Cashfree
 * PG shapes (see docs/tool-schemas.txt and _probe/lifecycle.mjs).
 */

import type { Framework, LedgerEntity, RunEvent, ScenarioId } from './events';
import { PAYMENT_TOOLS, READ_ONLY_TOOLS } from './scenarios';

export interface MockFrame {
  /** Milliseconds to wait after the previous frame before emitting this one. */
  delay: number;
  event: RunEvent;
}

const CATALOG_SIZE = 40;
const MODEL = 'gpt-4.1';

/* ------------------------------------------------------------------ */
/* Stable demo identities — generated once per page load so all three   */
/* beats reference the same order, the way the real ledger carries over. */
/* ------------------------------------------------------------------ */

export interface DemoIds {
  stamp: number;
  customerUid: string;
  customerId: string;
  customerEmail: string;
  customerPhone: string;
  orderId: string;
  cfOrderId: string;
  sessionId: string;
  cfPaymentId: string;
  cfPaymentIdFailed: string;
  refundId: string;
  cfRefundId: string;
  bankReference: string;
}

let cachedIds: DemoIds | null = null;

export function demoIds(): DemoIds {
  if (cachedIds) return cachedIds;
  const stamp = Date.now();
  const tail = String(stamp).slice(-7);
  cachedIds = {
    stamp,
    customerUid: `19${tail.slice(-5)}`,
    customerId: `cust_${stamp}`,
    customerEmail: 'rahul@example.com',
    customerPhone: '9478912345',
    orderId: `demo_order_${stamp}`,
    cfOrderId: `21814${tail.slice(-5)}`,
    sessionId:
      'session_kY1mMzTQyNfVJ0oX3hCq8LrPuA6dEwGsB2vZn4Rt7bXcHkFj9pQmLyDs0aWe',
    cfPaymentId: `51149${tail.slice(-5)}`,
    cfPaymentIdFailed: `51148${tail.slice(-5)}`,
    refundId: `rfnd_${stamp}`,
    cfRefundId: `10974${tail.slice(-5)}`,
    bankReference: `4179${tail.slice(-6)}`,
  };
  return cachedIds;
}

/** Lets the console reset identities between takes. */
export function resetDemoIds(): void {
  cachedIds = null;
}

/* ------------------------------------------------------------------ */
/* Script builder                                                       */
/* ------------------------------------------------------------------ */

function createScript(base: number) {
  let clock = 0;
  const frames: MockFrame[] = [];

  function at(delay: number, build: (ts: number) => RunEvent): void {
    clock += delay;
    frames.push({ delay, event: build(base + clock) });
  }

  /** Streams a message token by token, then finalises it. */
  function say(messageId: string, text: string, lead = 320): void {
    const tokens = text.match(/\S+\s*/g) ?? [text];
    tokens.forEach((token, i) => {
      const delay = i === 0 ? lead : 20 + ((i * 7) % 5) * 9;
      at(delay, (ts) => ({
        type: 'agent_text_delta',
        messageId,
        delta: token,
        ts,
      }));
    });
    at(140, (ts) => ({ type: 'agent_message', messageId, text, ts }));
  }

  function entity(delay: number, value: LedgerEntity): void {
    at(delay, (ts) => ({ type: 'entity', entity: value, ts }));
  }

  return { frames, at, say, entity, elapsed: () => clock };
}

type Script = ReturnType<typeof createScript>;

/** tool_call now, tool_result `durationMs` later. */
function callTool(
  script: Script,
  opts: {
    lead: number;
    callId: string;
    name: string;
    args: Record<string, unknown>;
    durationMs: number;
    result: unknown;
    summary: string;
    ok?: boolean;
  },
): void {
  script.at(opts.lead, (ts) => ({
    type: 'tool_call',
    callId: opts.callId,
    name: opts.name,
    args: opts.args,
    ts,
  }));
  script.at(opts.durationMs, (ts) => ({
    type: 'tool_result',
    callId: opts.callId,
    name: opts.name,
    ok: opts.ok ?? true,
    result: opts.result,
    summary: opts.summary,
    durationMs: opts.durationMs,
    ts,
  }));
}

/* ------------------------------------------------------------------ */
/* Cashfree-shaped payloads                                             */
/* ------------------------------------------------------------------ */

function orderPayload(ids: DemoIds, status: 'ACTIVE' | 'PAID', at: number) {
  return {
    cf_order_id: ids.cfOrderId,
    order_id: ids.orderId,
    entity: 'order',
    order_currency: 'INR',
    order_amount: 500,
    order_status: status,
    payment_session_id: ids.sessionId,
    order_expiry_time: new Date(at + 1000 * 60 * 60 * 24 * 30).toISOString(),
    order_note: 'Support demo order',
    created_at: new Date(at - 1000 * 60).toISOString(),
    customer_details: {
      customer_id: ids.customerId,
      customer_name: 'Rahul Sharma',
      customer_email: ids.customerEmail,
      customer_phone: ids.customerPhone,
      customer_uid: ids.customerUid,
    },
    order_meta: {
      return_url: null,
      notify_url: null,
      payment_methods: null,
    },
  };
}

function paymentPayload(
  ids: DemoIds,
  status: 'SUCCESS' | 'FAILED',
  at: number,
) {
  const failed = status === 'FAILED';
  return {
    cf_payment_id: failed ? ids.cfPaymentIdFailed : ids.cfPaymentId,
    order_id: ids.orderId,
    entity: 'payment',
    payment_currency: 'INR',
    payment_amount: 500,
    payment_time: new Date(at - 1000 * 42).toISOString(),
    payment_completion_time: failed
      ? null
      : new Date(at - 1000 * 30).toISOString(),
    payment_status: status,
    payment_message: failed
      ? 'Transaction failed at the customer bank. No amount was captured.'
      : 'Transaction is successful',
    bank_reference: failed ? null : ids.bankReference,
    auth_id: null,
    payment_group: 'upi',
    payment_method: {
      upi: { channel: 'collect', upi_id: 'testsuccess@gateway' },
    },
  };
}

function refundPayload(
  ids: DemoIds,
  status: 'PENDING' | 'SUCCESS',
  at: number,
) {
  return {
    cf_refund_id: ids.cfRefundId,
    cf_payment_id: ids.cfPaymentId,
    refund_id: ids.refundId,
    order_id: ids.orderId,
    entity: 'refund',
    refund_currency: 'INR',
    refund_amount: 200,
    refund_note: 'Partial refund requested by customer',
    refund_status: status,
    refund_arn: status === 'SUCCESS' ? `10000${ids.stamp.toString().slice(-8)}` : null,
    refund_charge: 0,
    refund_type: 'MERCHANT_INITIATED',
    refund_mode: 'STANDARD',
    refund_splits: [],
    status_description: status === 'SUCCESS' ? 'Refund processed' : 'In progress',
    created_at: new Date(at - 1000 * 5).toISOString(),
    processed_at: status === 'SUCCESS' ? new Date(at).toISOString() : null,
  };
}

/* ------------------------------------------------------------------ */
/* Entity helpers                                                       */
/* ------------------------------------------------------------------ */

function customerEntity(ids: DemoIds): LedgerEntity {
  return {
    kind: 'customer',
    id: ids.customerId,
    label: 'Rahul Sharma',
    status: 'ON FILE',
    data: {
      customer_uid: ids.customerUid,
      customer_name: 'Rahul Sharma',
      customer_email: ids.customerEmail,
      customer_phone: ids.customerPhone,
    },
  };
}

function orderEntity(ids: DemoIds, status: 'ACTIVE' | 'PAID'): LedgerEntity {
  return {
    kind: 'order',
    id: ids.orderId,
    label: 'Order · Rahul Sharma',
    amount: 500,
    status,
    data: {
      cf_order_id: ids.cfOrderId,
      order_currency: 'INR',
      order_amount: 500,
      order_status: status,
      customer_id: ids.customerId,
    },
  };
}

function paymentEntity(ids: DemoIds, status: 'PENDING' | 'SUCCESS'): LedgerEntity {
  return {
    kind: 'payment',
    id: ids.cfPaymentId,
    label: 'UPI collect',
    amount: 500,
    status,
    data: {
      cf_payment_id: ids.cfPaymentId,
      order_id: ids.orderId,
      payment_group: 'upi',
      upi_id: 'testsuccess@gateway',
      payment_status: status,
    },
  };
}

function refundEntity(ids: DemoIds, status: 'PENDING' | 'SUCCESS'): LedgerEntity {
  return {
    kind: 'refund',
    id: ids.refundId,
    label: 'Partial refund',
    amount: 200,
    status,
    data: {
      cf_refund_id: ids.cfRefundId,
      order_id: ids.orderId,
      refund_amount: 200,
      refund_speed: 'STANDARD',
      refund_status: status,
    },
  };
}

/* ------------------------------------------------------------------ */
/* BEAT 1 — full money lifecycle                                        */
/* ------------------------------------------------------------------ */

function lifecycleScript(framework: Framework): MockFrame[] {
  const ids = demoIds();
  const base = Date.now();
  const s = createScript(base);
  const runId = `run_mock_${ids.stamp}_lifecycle`;

  s.at(60, (ts) => ({
    type: 'run_started',
    runId,
    scenario: 'lifecycle',
    framework,
    model: MODEL,
    toolNames: [...PAYMENT_TOOLS],
    toolCatalogSize: CATALOG_SIZE,
    turnsTotal: 6,
    ts,
  }));

  /* --- turn 0 : createCustomer ------------------------------------ */
  s.at(280, (ts) => ({
    type: 'turn_started',
    turnIndex: 0,
    prompt:
      'Create a customer for Rahul Sharma, phone 9478912345, email rahul@example.com',
    ts,
  }));
  callTool(s, {
    lead: 620,
    callId: 'call_mock_1',
    name: 'createCustomer',
    args: {
      customer_name: 'Rahul Sharma',
      customer_phone: ids.customerPhone,
      customer_email: ids.customerEmail,
    },
    durationMs: 412,
    result: {
      customer_uid: ids.customerUid,
      customer_name: 'Rahul Sharma',
      customer_email: ids.customerEmail,
      customer_phone: ids.customerPhone,
    },
    summary: `Rahul Sharma · customer_uid ${ids.customerUid}`,
  });
  s.entity(90, customerEntity(ids));
  s.say(
    'msg_lc_0',
    `Customer created — Rahul Sharma is on file with customer_uid ${ids.customerUid}.`,
  );
  s.at(60, (ts) => ({ type: 'turn_completed', turnIndex: 0, ts }));

  /* --- turn 1 : createOrder --------------------------------------- */
  s.at(700, (ts) => ({
    type: 'turn_started',
    turnIndex: 1,
    prompt: 'Create an order for ₹500 for that customer',
    ts,
  }));
  callTool(s, {
    lead: 540,
    callId: 'call_mock_2',
    name: 'createOrder',
    args: {
      order_amount: 500,
      order_currency: 'INR',
      customer_id: ids.customerId,
      customer_name: 'Rahul Sharma',
      customer_email: ids.customerEmail,
      customer_phone: ids.customerPhone,
      return_url: null,
      order_note: 'Support demo order',
    },
    durationMs: 538,
    result: orderPayload(ids, 'ACTIVE', base),
    summary: `${ids.orderId} · ₹500 · ACTIVE`,
  });
  s.entity(90, orderEntity(ids, 'ACTIVE'));
  s.say(
    'msg_lc_1',
    `Order ${ids.orderId} is created for ₹500 and is ACTIVE, waiting on payment.`,
  );
  s.at(60, (ts) => ({ type: 'turn_completed', turnIndex: 1, ts }));

  /* --- turn 2 : orderPayUsingUpi ---------------------------------- */
  s.at(700, (ts) => ({
    type: 'turn_started',
    turnIndex: 2,
    prompt: 'Pay it using UPI',
    ts,
  }));
  callTool(s, {
    lead: 480,
    callId: 'call_mock_3',
    name: 'orderPayUsingUpi',
    args: {
      payment_session_id: ids.sessionId,
      channel: 'collect',
      upi_id: 'testsuccess@gateway',
      upi_redirect_url: null,
      upi_expiry_minutes: null,
      authorize_only: null,
      authorization: null,
      save_instrument: null,
      offer_id: null,
    },
    durationMs: 604,
    result: {
      cf_payment_id: ids.cfPaymentId,
      payment_amount: 500,
      payment_currency: 'INR',
      channel: 'collect',
      action: 'CUSTOM',
      payment_method: {
        upi: { channel: 'collect', upi_id: 'testsuccess@gateway' },
      },
      data: { url: null, payload: {}, content_type: null, method: null },
    },
    summary: `cf_payment_id ${ids.cfPaymentId} · ₹500 · collect`,
  });
  s.entity(90, paymentEntity(ids, 'PENDING'));
  s.say(
    'msg_lc_2',
    'Sent a UPI collect request to testsuccess@gateway for ₹500. The payment is pending customer approval.',
  );
  s.at(60, (ts) => ({ type: 'turn_completed', turnIndex: 2, ts }));

  /* --- turn 3 : getOrder ------------------------------------------ */
  s.at(760, (ts) => ({
    type: 'turn_started',
    turnIndex: 3,
    prompt: "What's the status of that order?",
    ts,
  }));
  callTool(s, {
    lead: 420,
    callId: 'call_mock_4',
    name: 'getOrder',
    args: { order_id: ids.orderId },
    durationMs: 268,
    result: orderPayload(ids, 'PAID', base),
    summary: `${ids.orderId} · ₹500 · PAID`,
  });
  s.entity(120, orderEntity(ids, 'PAID'));
  s.entity(180, paymentEntity(ids, 'SUCCESS'));
  s.say(
    'msg_lc_3',
    `Order ${ids.orderId} is PAID — the full ₹500 was captured over UPI.`,
  );
  s.at(60, (ts) => ({ type: 'turn_completed', turnIndex: 3, ts }));

  /* --- turn 4 : createRefund -------------------------------------- */
  s.at(760, (ts) => ({
    type: 'turn_started',
    turnIndex: 4,
    prompt: 'Rahul wants a partial refund of ₹200',
    ts,
  }));
  callTool(s, {
    lead: 560,
    callId: 'call_mock_5',
    name: 'createRefund',
    args: {
      order_id: ids.orderId,
      refund_amount: 200,
      refund_id: ids.refundId,
      refund_note: 'Partial refund requested by customer',
      refund_speed: 'STANDARD',
      refund_splits: null,
    },
    durationMs: 486,
    result: refundPayload(ids, 'PENDING', base),
    summary: `${ids.refundId} · ₹200 · PENDING`,
  });
  s.entity(90, refundEntity(ids, 'PENDING'));
  s.say(
    'msg_lc_4',
    `Refund ${ids.refundId} for ₹200 is initiated against ${ids.orderId} and is currently PENDING.`,
  );
  s.at(60, (ts) => ({ type: 'turn_completed', turnIndex: 4, ts }));

  /* --- turn 5 : getAllRefunds ------------------------------------- */
  s.at(760, (ts) => ({
    type: 'turn_started',
    turnIndex: 5,
    prompt: 'Show me all refunds on it',
    ts,
  }));
  callTool(s, {
    lead: 400,
    callId: 'call_mock_6',
    name: 'getAllRefunds',
    args: { order_id: ids.orderId },
    durationMs: 322,
    result: [refundPayload(ids, 'SUCCESS', base)],
    summary: `1 refund · ₹200 · SUCCESS`,
  });
  s.entity(120, refundEntity(ids, 'SUCCESS'));
  s.say(
    'msg_lc_5',
    `One refund on ${ids.orderId}: ₹200, now SUCCESS. Net settled amount on the order is ₹300.`,
  );
  s.at(60, (ts) => ({ type: 'turn_completed', turnIndex: 5, ts }));

  s.at(340, (ts) => ({
    type: 'run_completed',
    runId,
    turns: 6,
    toolCalls: 6,
    totalMs: s.elapsed(),
    ts,
  }));

  return s.frames;
}

/* ------------------------------------------------------------------ */
/* BEAT 2 — read-only agent, the refusal                                */
/* ------------------------------------------------------------------ */

function scopedScript(framework: Framework): MockFrame[] {
  const ids = demoIds();
  const base = Date.now();
  const s = createScript(base);
  const runId = `run_mock_${ids.stamp}_scoped`;

  s.at(60, (ts) => ({
    type: 'run_started',
    runId,
    scenario: 'scoped',
    framework,
    model: MODEL,
    toolNames: [...READ_ONLY_TOOLS],
    toolCatalogSize: CATALOG_SIZE,
    turnsTotal: 2,
    ts,
  }));

  /* --- turn 0 : reads still work ---------------------------------- */
  s.at(280, (ts) => ({
    type: 'turn_started',
    turnIndex: 0,
    prompt: `What's the status of order ${ids.orderId}?`,
    ts,
  }));
  callTool(s, {
    lead: 480,
    callId: 'call_mock_s1',
    name: 'getOrder',
    args: { order_id: ids.orderId },
    durationMs: 241,
    result: orderPayload(ids, 'PAID', base),
    summary: `${ids.orderId} · ₹500 · PAID`,
  });
  s.entity(100, orderEntity(ids, 'PAID'));
  s.say('msg_sc_0', `Order ${ids.orderId} is PAID for ₹500 over UPI.`);
  s.at(60, (ts) => ({ type: 'turn_completed', turnIndex: 0, ts }));

  /* --- turn 1 : the refusal --------------------------------------- */
  s.at(900, (ts) => ({
    type: 'turn_started',
    turnIndex: 1,
    prompt: `Refund ₹200 on order ${ids.orderId}`,
    ts,
  }));
  /*
   * Deliberately NO tool_blocked event here.
   *
   * Scoping in this demo is structural: the scoped agent is constructed without
   * the write tools, so the model never sees createRefund and there is nothing to
   * intercept or refuse. A red "blocked" card would look great and would be a lie —
   * no live run can produce one, and a mock that promises a shot the real take
   * cannot deliver is how a shoot gets wasted.
   *
   * The safety beat lands through the scope panel (write tools visibly absent),
   * the READ-ONLY tag on the tools chip, and the refusal below.
   *
   * To get a genuine blocked card on camera, use approval gating instead: hand the
   * agent createRefund with needsApproval and deny it. That is a different and
   * stronger claim — "it asked and was stopped", not "it never had the tool".
   * ToolCallCard already renders tool_blocked for exactly that case.
   */
  s.say(
    'msg_sc_1',
    `I can't refund that from here — this agent is running read-only and has no refund tool, so there is nothing for me to call. Raising it to the write-scoped agent for ₹200 on ${ids.orderId}.`,
    620,
  );
  s.at(60, (ts) => ({ type: 'turn_completed', turnIndex: 1, ts }));

  s.at(340, (ts) => ({
    type: 'run_completed',
    runId,
    turns: 2,
    toolCalls: 1,
    totalMs: s.elapsed(),
    ts,
  }));

  return s.frames;
}

/* ------------------------------------------------------------------ */
/* BEAT 3 — reconciliation, three tools chosen by the model             */
/* ------------------------------------------------------------------ */

function reconciliationScript(framework: Framework): MockFrame[] {
  const ids = demoIds();
  const base = Date.now();
  const s = createScript(base);
  const runId = `run_mock_${ids.stamp}_recon`;

  s.at(60, (ts) => ({
    type: 'run_started',
    runId,
    scenario: 'reconciliation',
    framework,
    model: MODEL,
    toolNames: [...READ_ONLY_TOOLS],
    toolCatalogSize: CATALOG_SIZE,
    turnsTotal: 1,
    ts,
  }));

  s.at(280, (ts) => ({
    type: 'turn_started',
    turnIndex: 0,
    prompt: `Rahul is saying he was charged twice on order ${ids.orderId} and wants his money back. Sort it out and tell me what to reply to him.`,
    ts,
  }));

  callTool(s, {
    lead: 720,
    callId: 'call_mock_r1',
    name: 'getOrder',
    args: { order_id: ids.orderId },
    durationMs: 249,
    result: orderPayload(ids, 'PAID', base),
    summary: `${ids.orderId} · ₹500 · PAID`,
  });
  s.entity(100, orderEntity(ids, 'PAID'));

  callTool(s, {
    lead: 380,
    callId: 'call_mock_r2',
    name: 'getPaymentsForOrder',
    args: { order_id: ids.orderId },
    durationMs: 366,
    result: [
      paymentPayload(ids, 'FAILED', base),
      paymentPayload(ids, 'SUCCESS', base),
    ],
    summary: '2 attempts · 1 SUCCESS ₹500 · 1 FAILED',
  });
  s.entity(100, paymentEntity(ids, 'SUCCESS'));

  callTool(s, {
    lead: 340,
    callId: 'call_mock_r3',
    name: 'getAllRefunds',
    args: { order_id: ids.orderId },
    durationMs: 288,
    result: [refundPayload(ids, 'SUCCESS', base)],
    summary: '1 refund · ₹200 · SUCCESS',
  });
  s.entity(100, refundEntity(ids, 'SUCCESS'));

  s.say(
    'msg_rc_0',
    `He was not charged twice. There were two UPI attempts on ${ids.orderId}: the first failed at the bank and was never captured, the second captured ₹500. A ₹200 refund has already gone through, so his net paid amount is ₹300. Reply: "Only one payment of ₹500 went through on your order; the other attempt failed and was never charged. We have already refunded ₹200 — reference ${ids.refundId} — so your net paid amount is ₹300."`,
    760,
  );
  s.at(60, (ts) => ({ type: 'turn_completed', turnIndex: 0, ts }));

  s.at(340, (ts) => ({
    type: 'run_completed',
    runId,
    turns: 1,
    toolCalls: 3,
    totalMs: s.elapsed(),
    ts,
  }));

  return s.frames;
}

/* ------------------------------------------------------------------ */

export function buildMockRun(
  scenario: ScenarioId,
  framework: Framework = 'openai',
): MockFrame[] {
  switch (scenario) {
    case 'lifecycle':
      return lifecycleScript(framework);
    case 'scoped':
      return scopedScript(framework);
    case 'reconciliation':
      return reconciliationScript(framework);
  }
}

/** Total wall-clock length of a scripted run, for the picker's runtime hint. */
export function mockDurationMs(
  scenario: ScenarioId,
  framework: Framework = 'openai',
): number {
  return buildMockRun(scenario, framework).reduce((n, f) => n + f.delay, 0);
}
