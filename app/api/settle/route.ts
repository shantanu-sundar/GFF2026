import { NextRequest } from 'next/server';

import { getToolkit } from '@/lib/cashfree';

/**
 * Settle a sandbox payment now instead of waiting for the auto-settle timer.
 *
 * Cashfree's sandbox succeeds a UPI collect payment on its own fixed server-side
 * clock — measured between 19s and 32s. That is dead air in the middle of the
 * demo, and long enough that a refund turn fired too early hard-fails with
 * `order_id_not_paid`.
 *
 * This does not fake anything. It calls the same simulation endpoint Cashfree's
 * own sandbox payment simulator calls when a human picks "Success" on it
 * (POST /pg/view/simulate with entity PAYMENTS). The payment genuinely completes
 * and the order genuinely reads PAID — the identical end state the timer would
 * have reached, just sooner. Measured: PAID ~1.8s after this returns.
 *
 * Sandbox only, and structurally so: the endpoint is hard-coded to the sandbox
 * host, and refuses outright under production credentials.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIMULATE_URL = 'https://sandbox.cashfree.com/pg/view/simulate';

export async function POST(req: NextRequest) {
  if (process.env.CASHFREE_ENV === 'PRODUCTION') {
    return Response.json({ error: 'Disabled outside sandbox' }, { status: 403 });
  }

  let orderId: string | undefined;
  let paymentId: string | undefined;
  try {
    ({ orderId, paymentId } = (await req.json()) as {
      orderId?: string;
      paymentId?: string;
    });
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!orderId && !paymentId) {
    return Response.json({ error: 'orderId or paymentId required' }, { status: 400 });
  }

  const tk = getToolkit();

  try {
    let cfPaymentId = paymentId;

    if (!cfPaymentId) {
      const raw = (await tk.handleToolCall({
        id: `settle_${Date.now()}`,
        type: 'function',
        function: {
          name: 'getPaymentsForOrder',
          arguments: JSON.stringify({ order_id: orderId }),
        },
      } as never)) as { content: string };

      const payments = JSON.parse(raw.content) as
        | Array<Record<string, unknown>>
        | Record<string, unknown>;

      if (!Array.isArray(payments)) {
        return Response.json(
          { error: String((payments as Record<string, unknown>).error ?? 'No payments') },
          { status: 502 },
        );
      }
      // Newest attempt last; anything already SUCCESS needs no help.
      const pending = [...payments]
        .reverse()
        .find((p) => p.payment_status !== 'SUCCESS');
      if (!pending) {
        return Response.json({ alreadySettled: true });
      }
      cfPaymentId = String(pending.cf_payment_id);
    }

    const response = await fetch(SIMULATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'PAYMENTS',
        entity_id: String(cfPaymentId),
        entity_simulation: { payment_status: 'SUCCESS', payment_error_code: '' },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return Response.json(
        { error: `Simulate failed (${response.status})`, detail: body },
        { status: 502 },
      );
    }

    return Response.json({
      simulated: true,
      paymentId: cfPaymentId,
      simulationId: body.simulation_id ?? null,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
