import { NextRequest } from 'next/server';

import { getToolkit } from '@/lib/cashfree';

/**
 * Hand the operator a real, payable link for an order.
 *
 * An earlier version of this built a checkout URL by hand from the
 * payment_session_id. It returned HTTP 200 and then rendered "Invalid Session ID"
 * in the browser — the 200 was the SPA shell, not a working session. So this
 * asks Cashfree for the URL instead of guessing at one: `orderPayUsingUpi` with
 * channel "link" returns both a real UPI payment page (`payload.web`) and a
 * sandbox simulator page (`payload.default`) where a click settles the order
 * immediately, instead of waiting out the ~20-32s auto-settle timer.
 *
 * This is on-demand rather than emitted with every order because the call does
 * initiate a payment attempt. If the agent has already run its own UPI turn on
 * this order, using this creates a SECOND attempt — fine in sandbox, and the
 * order can still only be captured once, but worth knowing.
 *
 * Sandbox only: the simulator does not exist in production, and handing out a
 * payable link from a demo console is not something to do against live money.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (process.env.CASHFREE_ENV === 'PRODUCTION') {
    return Response.json({ error: 'Disabled outside sandbox' }, { status: 403 });
  }

  let orderId: string | undefined;
  try {
    ({ orderId } = (await req.json()) as { orderId?: string });
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!orderId) return Response.json({ error: 'orderId required' }, { status: 400 });

  const tk = getToolkit();
  const call = async (name: string, args: Record<string, unknown>) => {
    const raw = (await tk.handleToolCall({
      id: `paylink_${Date.now()}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    } as never)) as { content: string };
    return JSON.parse(raw.content) as Record<string, unknown>;
  };

  try {
    const order = await call('getOrder', { order_id: orderId });
    if (order.error) {
      return Response.json({ error: String(order.error) }, { status: 502 });
    }
    if (order.order_status === 'PAID') {
      return Response.json({ error: 'Order is already paid' }, { status: 409 });
    }

    const pay = await call('orderPayUsingUpi', {
      payment_session_id: order.payment_session_id,
      channel: 'link',
      upi_id: null,
      upi_redirect_url: null,
      upi_expiry_minutes: null,
      authorize_only: null,
      authorization: null,
      save_instrument: null,
      offer_id: null,
    });
    if (pay.error) {
      return Response.json({ error: String(pay.error) }, { status: 502 });
    }

    const data = pay.data as { payload?: Record<string, string> } | undefined;
    const payload = data?.payload ?? {};
    return Response.json({
      /** Cashfree's own UPI payment page. */
      web: payload.web ?? null,
      /** Sandbox simulator — click Success here and the order settles at once. */
      simulator: payload.default ?? payload.bhim ?? null,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
