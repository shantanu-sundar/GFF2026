/** Presentation-only helpers. No contract types leak out of here. */

const INR = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** 500 -> "₹500", 1250.5 -> "₹1,250.5" */
export function formatINR(amount: number): string {
  return `₹${INR.format(amount)}`;
}

/** 142 -> "142ms", 1840 -> "1.84s" */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Long opaque ids get an ellipsis in the middle, never at the useful end. */
export function truncateId(value: string, head = 14, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * The handle a human would quote back over the phone.
 *
 * Cashfree mints order ids itself — `createOrder` has no `order_id` parameter,
 * so there is nothing to make legible at the source; the only lever is display.
 * The front of one of these is boilerplate and a timestamp, so a head-truncation
 * shows the part that is identical on every order and hides the part that isn't.
 * Take the tail instead, and take the same last-10 window the demo already
 * builds refund ids out of (`rf_<last10>_<amount>`) so an order and its refund
 * visibly refer to the same thing on screen.
 *
 * Ids that are already short or already readable are returned untouched.
 */
export function idHandle(value: string, keep = 10): string {
  return value.length <= 20 ? value : value.slice(-keep);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ArgPair {
  key: string;
  value: string;
  /** Numbers, booleans and ids render in mono; free text does not. */
  mono: boolean;
}

function scalar(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    return `{${keys.slice(0, 2).join(', ')}${keys.length > 2 ? ', …' : ''}}`;
  }
  return String(value);
}

/**
 * Turn a tool's argument object into compact key -> value pairs.
 * Nulls are dropped: the Cashfree schemas require a lot of explicit nulls and
 * they are noise on camera.
 */
export function toArgPairs(
  args: Record<string, unknown>,
  limit = 6,
): { pairs: ArgPair[]; hidden: number } {
  const entries = Object.entries(args).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );
  const pairs = entries.slice(0, limit).map(([key, value]) => {
    const raw = scalar(value);
    return {
      key,
      value: raw.length > 34 ? truncateId(raw, 20, 8) : raw,
      mono: typeof value !== 'string' || /^[\w@.:+\-/]+$/.test(raw),
    };
  });
  return { pairs, hidden: Math.max(0, entries.length - pairs.length) };
}

/** Statuses that should read as money-good. */
const GOOD = new Set(['PAID', 'SUCCESS', 'SUCCESSFUL', 'ACTIVE', 'ON FILE', 'COMPLETED']);
const PENDING = new Set(['PENDING', 'ONHOLD', 'INITIATED', 'IN PROGRESS', 'NOT_ATTEMPTED']);
const BAD = new Set(['FAILED', 'CANCELLED', 'EXPIRED', 'TERMINATED', 'USER_DROPPED']);

export type StatusTone = 'good' | 'live' | 'pending' | 'bad' | 'neutral';

export function statusTone(status: string | undefined): StatusTone {
  if (!status) return 'neutral';
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return 'live';
  if (GOOD.has(s)) return 'good';
  if (PENDING.has(s)) return 'pending';
  if (BAD.has(s)) return 'bad';
  return 'neutral';
}
