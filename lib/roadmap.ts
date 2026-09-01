import type { EntityKind } from './events';
import type { RunState } from './runState';

/**
 * What the ledger has earned the right to draw.
 *
 * The panel used to render a fixed Created → Paid → Refunded rail and four
 * "Not created yet" cards regardless of what the conversation was about. That
 * promised a refund nobody had asked for, and in the read-only beat it promised
 * one the agent structurally cannot perform.
 *
 * Nothing here is declared up front. A stage appears only once the run has
 * produced evidence for it, in descending order of how much that evidence is
 * worth:
 *
 *   1. an entity the sandbox actually returned  — the money moved
 *   2. a tool the agent reached for             — the agent went after it
 *   3. the merchant asking for it in words      — someone wants it
 *
 * Then scope has the last word: a stage raised by an ask, that nothing has yet
 * made real, whose write tool was never handed to this agent, is drawn as
 * out-of-scope rather than pending. That is the honest rendering of beat 2 —
 * "refund this" against a read-only agent is not a step that is coming, it is a
 * step that cannot happen.
 *
 * The one asymmetry worth naming: `paid` follows structurally from an order —
 * an unpaid order is an open obligation whether or not anyone mentions it — but
 * `refunded` never does. A refund only exists because someone asked for it.
 */

export type StageId = 'created' | 'paid' | 'refunded';

export type StageState =
  /** Done, and the sandbox says so. */
  | 'done'
  /** Underway — money is in flight. */
  | 'active'
  /** Raised and reachable, but nothing has happened yet. */
  | 'expected'
  /** Asked for, but this agent was never given the tool. */
  | 'out-of-scope';

export interface Stage {
  id: StageId;
  label: string;
  state: StageState;
  /** Only set for `out-of-scope`, where the reason is the point. */
  note?: string;
}

export interface Roadmap {
  /** In money order, and only the ones the conversation earned. */
  stages: Stage[];
  /** Entity kinds worth showing an empty placeholder for. */
  expecting: EntityKind[];
}

/** The tools that move each stage, split by whether they can spend money. */
const STAGE_TOOLS: Record<StageId, { writes: string[]; reads: string[] }> = {
  created: {
    writes: ['createOrder', 'terminateOrder', 'authorizeOrder'],
    reads: ['getOrder', 'getOrderExtendedData', 'getEligiblePaymentMethods', 'getEligibleOffers'],
  },
  paid: {
    writes: [
      'orderPayUsingUpi',
      'orderPayUsingNetbanking',
      'orderPayUsingApp',
      'orderPayUsingPlainCard',
      'orderPayUsingSavedCard',
    ],
    reads: ['getPaymentsForOrder', 'getPaymentById'],
  },
  refunded: {
    writes: ['createRefund'],
    reads: ['getAllRefunds', 'getRefund'],
  },
};

const LABEL: Record<StageId, string> = {
  created: 'Created',
  paid: 'Paid',
  refunded: 'Refunded',
};

/**
 * What the merchant has to say for a stage to count as raised. Deliberately
 * plain vocabulary — this reads what a support rep types, not a command syntax.
 */
const ASKS: Record<StageId | 'customer', RegExp> = {
  created: /\b(order|orders|checkout|invoice)\b/i,
  paid: /\b(pay|pays|paid|paying|payment|payments|upi|netbanking|card|charge|charged|collect|settle|settled)\b/i,
  refunded: /\b(refund|refunds|refunded|refunding|reverse|reversal|chargeback)\b|money back/i,
  customer: /\b(customer|customers|buyer|shopper)\b/i,
};

const CUSTOMER_TOOLS = [
  'createCustomer',
  'fetchCustomerInstruments',
  'fetchCustomerInstrument',
  'deleteCustomerInstrument',
];

/**
 * @param pending text being typed but not yet sent, so the rail grows while the
 *   question is still being asked rather than a beat after it lands.
 */
export function deriveRoadmap(state: RunState, pending = ''): Roadmap {
  const called = new Set<string>();
  const said: string[] = [];
  for (const item of state.items) {
    if (item.kind === 'tool') called.add(item.name);
    else if (item.kind === 'user') said.push(item.prompt);
  }
  if (pending) said.push(pending);
  const words = said.join('\n');

  const scope = new Set(state.toolNames);
  // Before run_started we know nothing about scope, so nothing is out of it.
  const scopeKnown = state.toolNames.length > 0;
  const inScope = (names: string[]) => names.some((n) => scope.has(n));
  const reached = (id: StageId) =>
    [...STAGE_TOOLS[id].writes, ...STAGE_TOOLS[id].reads].some((n) => called.has(n));

  const order = state.entities.find((e) => e.kind === 'order');
  const customer = state.entities.find((e) => e.kind === 'customer');
  const payments = state.entities.filter((e) => e.kind === 'payment');
  const refunds = state.entities.filter((e) => e.kind === 'refund');

  const paid = order?.status === 'PAID' || payments.some((p) => p.status === 'SUCCESS');
  const settling = payments.length > 0 && !paid;
  const refunded = refunds.some((r) => r.status === 'SUCCESS');
  const refunding = refunds.length > 0 && !refunded;

  const raised: Record<StageId, boolean> = {
    created: !!order || reached('created') || ASKS.created.test(words),
    paid:
      paid ||
      settling ||
      reached('paid') ||
      ASKS.paid.test(words) ||
      // An order that exists and can be charged is an open obligation, whether
      // or not anyone has said the word "pay" yet.
      (!!order && inScope(STAGE_TOOLS.paid.writes)),
    // Never structural. A refund happens because someone asked for one.
    refunded: refunds.length > 0 || reached('refunded') || ASKS.refunded.test(words),
  };

  const base: Record<StageId, StageState> = {
    created: order ? 'done' : 'expected',
    paid: paid ? 'done' : settling ? 'active' : 'expected',
    refunded: refunded ? 'done' : refunding ? 'active' : 'expected',
  };

  const stages: Stage[] = [];
  for (const id of ['created', 'paid', 'refunded'] as StageId[]) {
    if (!raised[id]) continue;
    const { writes } = STAGE_TOOLS[id];
    const blocked = base[id] === 'expected' && scopeKnown && !inScope(writes);
    stages.push(
      blocked
        ? { id, label: LABEL[id], state: 'out-of-scope', note: `${writes[0]} not in scope` }
        : { id, label: LABEL[id], state: base[id] },
    );
  }

  const open = (id: StageId) =>
    stages.some((s) => s.id === id && (s.state === 'expected' || s.state === 'active'));

  const expecting: EntityKind[] = [];
  if (!customer && (CUSTOMER_TOOLS.some((n) => called.has(n)) || ASKS.customer.test(words))) {
    expecting.push('customer');
  }
  if (!order && open('created')) expecting.push('order');
  if (!payments.length && open('paid')) expecting.push('payment');
  if (!refunds.length && open('refunded')) expecting.push('refund');

  return { stages, expecting };
}
