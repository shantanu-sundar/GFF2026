import type { LedgerEntity } from './events';

/**
 * Reading a Cashfree tool result correctly is subtle enough to deserve its own
 * module. Two verified facts drive everything here:
 *
 *  1. The toolkit's tools NEVER THROW. A failed API call resolves to
 *     `{ error, details: { code, message, help } }`. A naive `try/catch` UI
 *     renders a green tick over a failed call, so `ok` must be derived from the
 *     payload, not from the absence of an exception.
 *  2. The `error` string itself is unreliable — a failed `createCustomer`
 *     reports "Failed to fetch order" (copy-paste bug upstream). Key off
 *     `details.code`, which is accurate.
 */

export interface ToolFailure {
  code: string;
  message: string;
}

export interface InterpretedResult {
  ok: boolean;
  /** Parsed JSON when the tool returned JSON, else the raw string. */
  value: unknown;
  /** One line for the collapsed tool card. */
  summary: string;
  failure?: ToolFailure;
  entities: LedgerEntity[];
}

/** `payment_session_id` is a ~138-char bearer-ish token. Never let it reach the screen. */
const SECRET_KEYS = new Set(['payment_session_id']);

export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.has(k) && typeof v === 'string' ? maskToken(v) : redact(v);
    }
    return out as T;
  }
  return value;
}

function maskToken(token: string): string {
  return token.length <= 12 ? '••••' : `${token.slice(0, 7)}…${token.slice(-7)} (redacted)`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

const rupees = (n: unknown) =>
  typeof n === 'number' ? `₹${n.toLocaleString('en-IN')}` : undefined;

/** Pull ledger entities out of any Cashfree payload — object or array. */
function extractEntities(value: unknown): LedgerEntity[] {
  if (Array.isArray(value)) return value.flatMap(extractEntities);
  const r = asRecord(value);
  if (!r) return [];

  const out: LedgerEntity[] = [];

  if (typeof r.refund_id === 'string' || typeof r.cf_refund_id === 'string') {
    const id = String(r.refund_id ?? r.cf_refund_id);
    out.push({
      kind: 'refund',
      id,
      label: id,
      amount: typeof r.refund_amount === 'number' ? r.refund_amount : undefined,
      status: typeof r.refund_status === 'string' ? r.refund_status : undefined,
      data: {
        cf_refund_id: r.cf_refund_id,
        order_id: r.order_id,
        status_description: r.status_description,
        processed_at: r.processed_at,
      },
    });
  } else if (typeof r.cf_payment_id !== 'undefined' && r.entity !== 'order') {
    const id = String(r.cf_payment_id);
    const upi = asRecord(asRecord(r.payment_method)?.upi);
    out.push({
      kind: 'payment',
      id,
      label: id,
      amount: typeof r.payment_amount === 'number' ? r.payment_amount : undefined,
      // orderPayUsingUpi returns no status field at all — it has only just started.
      status: typeof r.payment_status === 'string' ? r.payment_status : 'INITIATED',
      data: {
        payment_method: r.payment_method ? Object.keys(asRecord(r.payment_method) ?? {})[0] : r.payment_group,
        upi_id: upi?.upi_id,
        bank_reference: r.bank_reference,
        payment_completion_time: r.payment_completion_time,
      },
    });
  }

  // A PAYMENT record also carries order_id and order_amount but no order_status.
  // Without this guard it minted a phantom order entity whose status was
  // undefined, which clobbered the real order card and stopped the settlement
  // poller dead. Only treat a record as an order if it says it is one.
  const isOrder = r.entity === 'order' || typeof r.order_status === 'string';
  if (isOrder && typeof r.order_id === 'string' && typeof r.order_amount !== 'undefined') {
    out.push({
      kind: 'order',
      id: r.order_id,
      label: r.order_id,
      amount: typeof r.order_amount === 'number' ? r.order_amount : undefined,
      status: typeof r.order_status === 'string' ? r.order_status : undefined,
      data: {
        cf_order_id: r.cf_order_id,
        order_currency: r.order_currency,
        customer: asRecord(r.customer_details)?.customer_name,
        created_at: r.created_at,
      },
    });
  }

  if (typeof r.customer_uid === 'string') {
    out.push({
      kind: 'customer',
      id: r.customer_uid,
      label: typeof r.customer_phone === 'string' ? r.customer_phone : r.customer_uid,
      data: { customer_uid: r.customer_uid, customer_phone: r.customer_phone },
    });
  }

  return out;
}

function summarise(toolName: string, value: unknown): string {
  if (Array.isArray(value)) {
    const n = value.length;
    const first = asRecord(value[0]);
    if (first?.refund_status)
      return `${n} refund${n === 1 ? '' : 's'} · ${value
        .map((v) => `${rupees(asRecord(v)?.refund_amount)} ${asRecord(v)?.refund_status}`)
        .join(', ')}`;
    if (first?.payment_status)
      return `${n} payment${n === 1 ? '' : 's'} · ${first.payment_status}`;
    return `${n} result${n === 1 ? '' : 's'}`;
  }

  const r = asRecord(value);
  if (!r) return String(value).slice(0, 120);

  const bits: (string | undefined)[] = [];
  if (r.order_id) bits.push(String(r.order_id));
  if (r.refund_id) bits.push(String(r.refund_id));
  if (r.cf_payment_id && !r.order_id) bits.push(String(r.cf_payment_id));
  if (r.customer_uid) bits.push(String(r.customer_phone ?? r.customer_uid));

  const amount = rupees(r.order_amount ?? r.refund_amount ?? r.payment_amount);
  if (amount) bits.push(amount);

  const status = r.order_status ?? r.refund_status ?? r.payment_status;
  if (typeof status === 'string') bits.push(status);
  else if (toolName === 'orderPayUsingUpi') bits.push('INITIATED');

  return bits.filter(Boolean).join(' · ') || 'ok';
}

/** Turn a raw tool output string into everything the UI needs. */
export function interpretResult(toolName: string, raw: unknown): InterpretedResult {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
  }

  const r = asRecord(value);
  const details = asRecord(r?.details);
  const isError = !!r && 'error' in r;

  if (isError) {
    const code = String(details?.code ?? 'error');
    const message = String(details?.message ?? r?.error ?? 'Tool call failed');
    return {
      ok: false,
      value: redact(value),
      summary: `${code} · ${message}`.slice(0, 160),
      failure: { code, message },
      entities: [],
    };
  }

  return {
    ok: true,
    value: redact(value),
    summary: summarise(toolName, value),
    entities: extractEntities(value),
  };
}
