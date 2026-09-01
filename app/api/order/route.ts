import { NextRequest } from 'next/server';

import { getToolkit } from '@/lib/cashfree';
import { interpretResult } from '@/lib/ledger';

/**
 * Order status polling, deliberately kept OUT of /api/run.
 *
 * Two reasons: it must not depend on the adapter registry (a missing optional
 * framework adapter would otherwise take this down with it), and it must not
 * cost a model turn. The console polls this every ~2s while an order is ACTIVE
 * so the ledger card can flip to PAID on its own — which is what covers the
 * sandbox's fixed ~30s settle timer during a recording.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('orderId');
  if (!orderId) {
    return Response.json({ error: 'orderId query param required' }, { status: 400 });
  }

  try {
    const tk = getToolkit();
    // handleToolCall is the toolkit's own no-LLM executor. The agent-tool
    // .invoke() path runs zod validation first and masks real Cashfree error
    // codes behind a generic InvalidToolInputError, which we'd rather see.
    const raw = (await tk.handleToolCall({
      id: `poll_${Date.now()}`,
      type: 'function',
      function: { name: 'getOrder', arguments: JSON.stringify({ order_id: orderId }) },
    } as never)) as { content: string };

    const order = interpretResult('getOrder', raw.content);

    // Also refresh payments, so the payment card can move INITIATED -> SUCCESS.
    // Without this the order flips to PAID while the payment beside it still
    // reads INITIATED, which looks broken on camera.
    try {
      const payRaw = (await tk.handleToolCall({
        id: `poll_pay_${Date.now()}`,
        type: 'function',
        function: {
          name: 'getPaymentsForOrder',
          arguments: JSON.stringify({ order_id: orderId }),
        },
      } as never)) as { content: string };
      const payments = interpretResult('getPaymentsForOrder', payRaw.content);
      if (payments.ok) order.entities = [...order.entities, ...payments.entities];
    } catch {
      // Non-fatal: the order status alone is enough to unblock the run.
    }

    return Response.json(order);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
