'use client';

import { useState } from 'react';

import { formatINR, formatMs, idHandle } from '@/lib/format';
import { deriveRoadmap, type Stage } from '@/lib/roadmap';
import type { RunState, EntityCard } from '@/lib/runState';
import type { EntityKind } from '@/lib/events';
import type { SettlementPoll } from '@/lib/useSettlementPoll';

const KIND_LABEL: Record<EntityKind, string> = {
  customer: 'Customer',
  order: 'Order',
  payment: 'Payment',
  refund: 'Refund',
};

const ORDER_OF: EntityKind[] = ['customer', 'order', 'payment', 'refund'];

const GOOD = new Set(['PAID', 'SUCCESS']);
const WARN = new Set(['ACTIVE', 'PENDING', 'INITIATED', 'NOT_ATTEMPTED']);

function tone(status?: string) {
  if (!status) return { fg: 'var(--lg-ink-3)', bg: 'rgba(29,34,31,0.08)' };
  if (GOOD.has(status)) return { fg: '#04663f', bg: 'rgba(0,173,108,0.16)' };
  if (WARN.has(status)) return { fg: '#8a5a00', bg: 'rgba(255,174,21,0.22)' };
  return { fg: '#8f1f3c', bg: 'rgba(230,77,115,0.16)' };
}

const ICON: Record<EntityKind, string> = {
  customer: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  order: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M9 13h6M9 17h6',
  payment: 'M2 9h20M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Z',
  refund: 'M3 10h11a4 4 0 0 1 0 8h-1M3 10l4-4M3 10l4 4',
};

function KindIcon({ kind }: { kind: EntityKind }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[15px]" style={{ color: 'var(--lg-ink-3)' }} aria-hidden>
      <path d={ICON[kind]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Pill({ status, revision }: { status: string; revision: number }) {
  const t = tone(status);
  return (
    <span
      key={revision}
      className="lg-rise inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold"
      style={{ color: t.fg, background: t.bg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: t.fg }} />
      {status}
    </span>
  );
}

function Row({ entity }: { entity: EntityCard }) {
  const [open, setOpen] = useState(false);
  const money = typeof entity.amount === 'number';
  const label = entity.label;
  const handle = idHandle(label);
  // A shortened id is a handle, so mark it as one and give it room to be read;
  // the full string is one click away for anyone who needs to copy it.
  const shortened = handle !== label;

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="glass lg-rise w-full rounded-[18px] px-4 py-3.5 text-left transition-transform duration-200 hover:scale-[1.015]"
    >
      <div className="flex items-center gap-2">
        <KindIcon kind={entity.kind} />
        <span className="text-[11.5px] font-semibold uppercase" style={{ color: 'var(--lg-ink-3)', letterSpacing: '0.14em' }}>
          {KIND_LABEL[entity.kind]}
        </span>
        {entity.status ? (
          <span className="ml-auto">
            <Pill status={entity.status} revision={entity.revision} />
          </span>
        ) : null}
      </div>

      {money ? (
        <div className="mt-2 text-[26px] leading-none font-semibold tabular-nums" style={{ color: 'var(--lg-ink)' }}>
          {formatINR(entity.amount as number)}
        </div>
      ) : null}

      <div
        className={
          open || !shortened
            ? 'mt-2 font-mono text-[11.5px] break-all'
            : 'mt-2 font-mono text-[13.5px] tracking-[0.02em]'
        }
        style={{ color: shortened && !open ? 'var(--lg-ink-2)' : 'var(--lg-ink-3)' }}
        title={label}
      >
        {open || !shortened ? label : `#${handle}`}
      </div>
    </button>
  );
}

function Ghost({ kind }: { kind: EntityKind }) {
  return (
    <div className="rounded-[18px] border border-dashed px-4 py-3.5" style={{ borderColor: 'rgba(29,34,31,0.16)' }}>
      <div className="flex items-center gap-2 opacity-45">
        <KindIcon kind={kind} />
        <span className="text-[11.5px] font-semibold uppercase" style={{ color: 'var(--lg-ink-3)', letterSpacing: '0.14em' }}>
          {KIND_LABEL[kind]}
        </span>
      </div>
      <div className="mt-2 text-[15px]" style={{ color: 'var(--lg-ink-3)' }}>Not created yet</div>
    </div>
  );
}

/** One node on the money rail. Its look is entirely a function of `state`. */
function Step({ stage, last }: { stage: Stage; last: boolean }) {
  const done = stage.state === 'done';
  const active = stage.state === 'active';
  const blocked = stage.state === 'out-of-scope';

  // Only the nodes that carry a connector may absorb slack, so the rail ends
  // flush with the last label instead of trailing off into empty panel.
  return (
    <div className={last ? 'flex items-center gap-2' : 'flex flex-1 items-center gap-2'} title={stage.note}>
      <span
        className={
          active
            ? 'lg-pulse grid size-[14px] shrink-0 place-items-center rounded-full border'
            : 'grid size-[14px] shrink-0 place-items-center rounded-full border transition-colors duration-500'
        }
        style={{
          borderColor: done
            ? 'var(--lg-evergreen)'
            : active
              ? 'var(--lg-gold)'
              : 'rgba(29,34,31,0.22)',
          background: done ? 'var(--lg-evergreen)' : active ? 'var(--lg-gold)' : 'transparent',
          boxShadow: done ? '0 0 0 4px rgba(0,173,108,0.16)' : 'none',
        }}
      >
        {done ? (
          <svg viewBox="0 0 24 24" fill="none" className="size-2 text-white">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : blocked ? (
          <span className="block h-[1.5px] w-[6px] rounded-full" style={{ background: 'rgba(29,34,31,0.34)' }} />
        ) : null}
      </span>
      <span
        className="text-[11px] font-medium whitespace-nowrap"
        style={{
          color: done || active ? 'var(--lg-ink-2)' : 'var(--lg-ink-3)',
          textDecoration: blocked ? 'line-through' : undefined,
          textDecorationThickness: blocked ? '1px' : undefined,
        }}
      >
        {stage.label}
      </span>
      {!last ? <span className="h-px flex-1" style={{ background: 'rgba(29,34,31,0.16)' }} /> : null}
    </div>
  );
}

/**
 * The merchant's side of the story: what actually exists in the payments
 * account. Net position on top, the entities themselves, and a rail that lights
 * up as the money moves. Every value here came from a real Cashfree response,
 * which is the point of showing it beside the chat.
 *
 * Nothing in the lower half is fixed furniture. The rail and the empty entity
 * slots are both derived from the conversation by `lib/roadmap.ts` — see the
 * note there for why a refund step is never drawn until someone asks for one.
 */
export default function LiveLedger({
  state,
  settlement,
  settleAfterMs,
  onPay,
  pending = '',
}: {
  state: RunState;
  settlement: SettlementPoll;
  settleAfterMs: number;
  onPay: () => void;
  /** The question currently being typed, so the rail reacts as it is asked. */
  pending?: string;
}) {
  const entities = [...state.entities].sort((a, b) => {
    const k = ORDER_OF.indexOf(a.kind) - ORDER_OF.indexOf(b.kind);
    return k !== 0 ? k : a.firstSeen - b.firstSeen;
  });

  const order = entities.find((e) => e.kind === 'order');
  const payment = entities.find((e) => e.kind === 'payment');
  const refunds = entities.filter((e) => e.kind === 'refund');

  const captured = order && order.status === 'PAID' ? (order.amount ?? 0) : 0;
  const refunded = refunds.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const net = captured - refunded;

  const unpaid = !!order && order.status !== 'PAID';
  const settling = unpaid && !!payment && payment.status !== 'SUCCESS';
  const progress = settlement.polling
    ? Math.min(1, settlement.elapsedMs / (settleAfterMs || 32000))
    : 0;

  const { stages, expecting } = deriveRoadmap(state, pending);
  // One node is a dot, not a rail. It says nothing the entity card above it
  // isn't already saying, so wait until there is an actual sequence to show.
  const rail = stages.length >= 2 ? stages : [];

  return (
    <aside className="flex h-full min-h-0 flex-col border-l" style={{ borderColor: 'rgba(255,255,255,0.6)' }}>
      <div className="flex shrink-0 items-center gap-2 px-5 pt-5 pb-3">
        <span className="text-[11.5px] font-semibold uppercase" style={{ color: 'var(--lg-ink-2)', letterSpacing: '0.16em' }}>
          Merchant ledger
        </span>
        <span
          className={settlement.polling ? 'lg-pulse ml-auto size-1.5 rounded-full' : 'ml-auto size-1.5 rounded-full'}
          style={{ background: settlement.polling ? 'var(--lg-gold)' : 'rgba(29,34,31,0.25)' }}
        />
      </div>

      <div className="shrink-0 px-5 pb-3">
        <div className="glass rounded-[18px] px-4 py-3.5">
          <div className="text-[11.5px] font-semibold uppercase" style={{ color: 'var(--lg-ink-3)', letterSpacing: '0.14em' }}>
            Net position
          </div>
          <div className="mt-1.5 text-[30px] leading-none font-semibold tabular-nums" style={{ color: 'var(--lg-ink)' }}>
            {formatINR(net)}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[12.5px]" style={{ color: 'var(--lg-ink-2)' }}>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: 'var(--lg-evergreen)' }} />
              Captured {formatINR(captured)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: 'var(--lg-gold)' }} />
              Refunded {formatINR(refunded)}
            </span>
          </div>
        </div>
      </div>

      {unpaid ? (
        <div className="shrink-0 px-5 pb-3">
          <div className="glass-amber rounded-[18px] px-4 py-3.5">
            <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: '#8a5a00' }}>
              <span
                className={settling ? 'lg-pulse size-1.5 rounded-full' : 'size-1.5 rounded-full'}
                style={{ background: 'var(--lg-gold)' }}
              />
              {settling ? 'Awaiting payment' : 'Order not paid yet'}
              {settling && settlement.polling ? (
                <span className="ml-auto font-mono tabular-nums">
                  {Math.round(settlement.elapsedMs / 1000)}s
                </span>
              ) : null}
            </div>

            {settling && settlement.polling ? (
              <span
                className="lg-sheen relative mt-2.5 block h-[4px] w-full overflow-hidden rounded-full"
                style={{ background: 'rgba(255,255,255,0.6)' }}
              >
                <span
                  className="block h-full rounded-full transition-[width] duration-1000 ease-linear"
                  style={{ width: Math.round(progress * 100) + '%', background: 'var(--lg-gold)' }}
                />
              </span>
            ) : null}

            <button
              type="button"
              onClick={onPay}
              className="mt-3 w-full rounded-full py-2 text-[13px] font-semibold text-white transition-transform duration-150 hover:scale-[1.02]"
              style={{ background: 'var(--lg-evergreen)' }}
            >
              Pay this order
            </button>
          </div>
        </div>
      ) : null}

      <div className="scroll-glass flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-3">
        {entities.map((e) => (
          <Row key={e.key} entity={e} />
        ))}
        {expecting.map((k) => (
          <Ghost key={k} kind={k} />
        ))}
        {!entities.length && !expecting.length ? (
          <div className="py-6 text-center text-[12.5px]" style={{ color: 'var(--lg-ink-3)' }}>
            Nothing on the account yet.
          </div>
        ) : null}
      </div>

      <div className="shrink-0 px-5 pt-1 pb-5">
        {rail.length ? (
          <div className="flex items-center gap-2">
            {rail.map((stage, i) => (
              <Step key={stage.id} stage={stage} last={i === rail.length - 1} />
            ))}
          </div>
        ) : null}

        <div
          className={rail.length ? 'mt-3.5 flex items-center gap-2 text-[12px]' : 'flex items-center gap-2 text-[12px]'}
          style={{ color: 'var(--lg-ink-2)' }}
        >
          {order ? (
            <span className="font-mono tabular-nums" title={order.id}>
              #{idHandle(order.id)}
            </span>
          ) : null}
          <span className="tabular-nums">
            {state.toolCalls} tool {state.toolCalls === 1 ? 'call' : 'calls'}
          </span>
          {typeof state.totalMs === 'number' ? (
            <span className="font-mono tabular-nums" style={{ color: 'var(--lg-ink-3)' }}>
              {formatMs(state.totalMs)}
            </span>
          ) : null}
          {state.toolNames.length ? (
            <span className="ml-auto whitespace-nowrap tabular-nums">
              {state.toolNames.length} of {state.toolCatalogSize || 40} tools
            </span>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
