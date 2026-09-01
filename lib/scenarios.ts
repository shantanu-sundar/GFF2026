import type { ScenarioId } from './events';

/**
 * Context carried between scenarios. The console keeps this in its ledger and
 * feeds it back in, the way a real support agent already knows which order a
 * ticket is about.
 */
export interface RunContext {
  customerId?: string;
  orderId?: string;
}

export interface Turn {
  /** What the "merchant support rep" types. */
  prompt: string | ((ctx: RunContext) => string);
  /** Shown under the turn in the UI while recording. Not sent to the model. */
  note?: string;
}

export interface Scenario {
  id: ScenarioId;
  title: string;
  /** One line under the title in the scenario picker. */
  tagline: string;
  /**
   * Tools this agent is handed. `null` means the full payment-gateway set.
   * This is the entire scoping mechanism — there is no allow-list middleware,
   * the agent simply cannot see what it was not given.
   */
  tools: string[] | null;
  instructions: string;
  turns: Turn[];
}

/** A subset of the 22 payment-gateway tools; the 18 verification/KYC ones are not demoed. */
export const PAYMENT_TOOLS = [
  'createCustomer',
  'createOrder',
  'getOrder',
  'orderPayUsingUpi',
  'getPaymentsForOrder',
  'getPaymentById',
  'createRefund',
  'getRefund',
  'getAllRefunds',
  'getEligiblePaymentMethods',
  'terminateOrder',
] as const;

/** Read-only subset. Nothing here can move a rupee. */
export const READ_ONLY_TOOLS = [
  'getOrder',
  'getPaymentsForOrder',
  'getPaymentById',
  'getAllRefunds',
  'getRefund',
] as const;

const BASE_INSTRUCTIONS = `You are a merchant support agent for an Indian D2C brand. You operate the brand's Cashfree payments account through the tools you have been given.

Rules:
- Always use a tool to answer. Never guess or invent an id, amount, or status; if you do not have it, look it up.
- Reuse ids returned by earlier tool calls in this conversation instead of asking the user for them.
- All amounts the user gives you are in rupees (INR).
- Keep replies to one or two short sentences. State what you did and the key id or amount. No preamble, no bullet lists, no markdown.
- If you lack a tool for what is being asked, say plainly that you cannot do it and what you would need. Never pretend you did it.

Working in the Cashfree SANDBOX:
- To pay an order by UPI use channel "collect" with upi_id "testsuccess@gocash". That is the sandbox test VPA; do not invent another one.
- Initiating a UPI payment does NOT mean it succeeded. Never report an order as paid until getOrder has actually returned order_status PAID.
- After calling orderPayUsingUpi, STOP. Report in one sentence that the payment was initiated and is settling. Do NOT call getOrder in that same turn, and never poll it repeatedly — you will be asked for the status separately. Repeated identical lookups are treated as an error.
- A newly created refund comes back PENDING and settles a second or two later. That is normal, not a failure.
- refund_id must be UNIQUE ACROSS THE WHOLE MERCHANT ACCOUNT, not just the order. Reusing one fails with refund_id_already_exists, which is what happens on a second take if you pick a fixed literal. Always build it from the order: "rf_" + the last 10 characters of the order_id + "_" + the refund amount, e.g. rf_9u7dUcmQu0_200.
- Set refund_speed to "STANDARD" and refund_note to a short human reason. Do not send empty strings for them.
- Many tool parameters are required but nullable. Pass explicit null for the ones you have no value for (return_url, order_note, refund_splits, and the optional UPI fields).`;

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  /* ------------------------------------------------------------------ */
  /* BEAT 1 — the payoff. One conversation, the whole money lifecycle.    */
  /* ------------------------------------------------------------------ */
  lifecycle: {
    id: 'lifecycle',
    title: 'Full money lifecycle',
    tagline: 'Customer → order → UPI payment → status → partial refund → refund list',
    tools: [...PAYMENT_TOOLS],
    instructions: BASE_INSTRUCTIONS,
    turns: [
      {
        prompt: 'Create a customer for Rahul Sharma, phone 9478912345, email rahul@example.com',
        note: 'createCustomer — registers Rahul on the account',
      },
      {
        prompt: 'Create an order for ₹500 for that customer',
        note: 'createOrder — CF generates the order_id; ₹500 row appears',
      },
      {
        prompt: 'Pay it using UPI',
        note: 'orderPayUsingUpi — collect @ testsuccess@gocash. WAIT for the green PAID pill before turn 4.',
      },
      {
        prompt: "What's the status of that order?",
        note: 'getOrder — confirms PAID (~30s after turn 3)',
      },
      {
        prompt: 'Rahul wants a partial refund of ₹200',
        note: 'createRefund — returns PENDING, settles to SUCCESS in ~2s',
      },
      {
        prompt: 'Show me all refunds on it',
        note: 'getAllRefunds',
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* BEAT 2 — the safety answer. Same agent, read-only tool set.          */
  /* ------------------------------------------------------------------ */
  scoped: {
    id: 'scoped',
    title: 'Read-only agent',
    tagline: 'The same agent, handed 5 read tools instead of 11. Watch it refuse.',
    tools: [...READ_ONLY_TOOLS],
    instructions: `${BASE_INSTRUCTIONS}

You are running in READ-ONLY support mode. You can look things up but you cannot create, charge, or refund anything.`,
    turns: [
      {
        prompt: (ctx) =>
          ctx.orderId
            ? `What's the status of order ${ctx.orderId}?`
            : "What's the status of the most recent order?",
        note: 'getOrder — reads still work',
      },
      {
        prompt: (ctx) =>
          ctx.orderId
            ? `Refund ₹200 on order ${ctx.orderId}`
            : 'Refund ₹200 on that order',
        note: 'No refund tool exists → agent escalates instead of acting',
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* BEAT 3 — reasoning, not command execution. Multi-tool, unprompted.   */
  /* ------------------------------------------------------------------ */
  reconciliation: {
    id: 'reconciliation',
    title: 'Reconciliation',
    tagline: 'One vague human question, three tools chained without being told which',
    tools: [...READ_ONLY_TOOLS],
    instructions: `${BASE_INSTRUCTIONS}

When investigating a billing complaint, check the payments on the order AND the refunds on the order before answering. Give the customer-facing answer with the net amount and a reference id they can quote.`,
    turns: [
      {
        prompt: (ctx) =>
          ctx.orderId
            ? `Rahul is saying he was charged twice on order ${ctx.orderId} and wants his money back. Sort it out and tell me what to reply to him.`
            : 'Rahul is saying he was charged twice on his last order and wants his money back. Sort it out and tell me what to reply to him.',
        note: 'getOrder + getPaymentsForOrder + getAllRefunds, chosen by the model',
      },
    ],
  },
};

export const SCENARIO_ORDER: ScenarioId[] = ['lifecycle', 'scoped', 'reconciliation'];

export function resolvePrompt(turn: Turn, ctx: RunContext): string {
  return typeof turn.prompt === 'function' ? turn.prompt(ctx) : turn.prompt;
}
