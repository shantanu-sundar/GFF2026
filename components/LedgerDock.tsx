'use client';

import { useState } from 'react';
import JsonView from './JsonView';
import { IconCard, IconClose, IconReceipt, IconReturn, IconUser } from './Icons';
import { AnimatedAmount, Eyebrow, StatusPill } from './ui';
import { truncateId } from '@/lib/format';
import type { EntityKind } from '@/lib/events';
import type { EntityCard, RunState } from '@/lib/runState';
import type { SettlementPoll } from '@/lib/useSettlementPoll';

/** Sandbox UPI settles on a fixed ~30s server-side timer. */
const SETTLE_TARGET_MS = 30_000;

const KIND_ORDER: EntityKind[] = ['customer', 'order', 'payment', 'refund'];

const KIND_META: Record<
  EntityKind,
  { label: string; Icon: (props: { className?: string }) => React.ReactElement }
> = {
  customer: { label: 'Customer', Icon: IconUser },
  order: { label: 'Order', Icon: IconReceipt },
  payment: { label: 'Payment', Icon: IconCard },
  refund: { label: 'Refund', Icon: IconReturn },
};

function GhostCard({ kind }: { kind: EntityKind }) {
  const { label, Icon } = KIND_META[kind];
  return (
    <div className="flex min-w-0 flex-col justify-between rounded-xl border border-dashed border-line/80 px-3.5 py-3">
      <div className="flex items-center gap-2 text-ink-3">
        <Icon className="size-4" />
        <Eyebrow>{label}</Eyebrow>
      </div>
      <div className="mt-3 text-sm text-ink-3">Not created yet</div>
    </div>
  );
}

function LedgerCard({
  entity,
  open,
  onToggle,
  settling,
}: {
  entity: EntityCard;
  open: boolean;
  onToggle: () => void;
  /** Elapsed ms of the settlement wait, or null when nothing is pending. */
  settling: number | null;
}) {
  const { label, Icon } = KIND_META[entity.kind];
  const settleProgress =
    settling === null ? 0 : Math.min(1, settling / SETTLE_TARGET_MS);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`pop-in relative flex min-w-0 flex-col justify-between overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        open
          ? 'border-accent/50 bg-accent/[0.07]'
          : 'border-line bg-white/[0.025] hover:border-line-2 hover:bg-white/[0.05]'
      }`}
    >
      <span className="flex items-center justify-between gap-2 text-ink-3">
        <span className="flex items-center gap-2">
          <Icon className="size-4" />
          <Eyebrow>{label}</Eyebrow>
        </span>
        {settling !== null ? (
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-warn">
            <span className="size-1.5 rounded-full bg-warn breathe" />
            settling {Math.round(settling / 1000)}s
          </span>
        ) : null}
      </span>

      {entity.label && entity.label !== entity.id ? (
        <span className="mt-2 block truncate text-sm text-ink" title={entity.label}>
          {entity.label}
        </span>
      ) : null}
      <span
        className="mt-2 block truncate font-mono text-sm text-ink-2"
        title={entity.id}
      >
        {truncateId(entity.id, 18, 5)}
      </span>

      <span className="mt-2.5 flex items-center justify-between gap-2">
        {typeof entity.amount === 'number' ? (
          <AnimatedAmount
            value={entity.amount}
            className="font-mono text-lg font-medium text-ink"
          />
        ) : (
          <span className="font-mono text-lg text-ink-3">—</span>
        )}
        {entity.status ? (
          <StatusPill status={entity.status} revision={entity.revision} />
        ) : null}
      </span>

      {settling !== null ? (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-warn/15">
          <span
            className="block h-full bg-warn/70 transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.round(settleProgress * 100)}%` }}
          />
        </span>
      ) : null}
    </button>
  );
}

export default function LedgerDock({
  state,
  settlement,
}: {
  state: RunState;
  settlement: SettlementPoll;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const entities = [...state.entities].sort((a, b) => {
    const byKind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    return byKind !== 0 ? byKind : a.firstSeen - b.firstSeen;
  });

  const present = new Set(entities.map((entity) => entity.kind));
  const ghosts = KIND_ORDER.filter((kind) => !present.has(kind));
  const opened = entities.find((entity) => entity.key === openKey) ?? null;

  /**
   * While an order is still unpaid we surface its hosted checkout link, so a
   * human can pay it there and then instead of waiting out the sandbox's
   * ~20-32s auto-settle timer. lib/ledger.ts only ever emits checkout_url in
   * SANDBOX, so this strip simply never appears against production.
   */
  const payable = entities.find(
    (entity) =>
      entity.kind === 'order' &&
      entity.status !== 'PAID' &&
      typeof entity.data?.checkout_url === 'string',
  );
  const payUrl = payable?.data?.checkout_url as string | undefined;
  const live = state.status === 'running' || state.status === 'connecting';

  return (
    <div className="relative shrink-0 border-t border-line bg-canvas-2">
      {payUrl ? (
        <div className="evt-in flex items-center gap-3 border-b border-line bg-warn/8 px-6 py-2.5">
          <span className="size-1.5 shrink-0 rounded-full bg-warn breathe" />
          <span className="shrink-0 text-xs text-ink-2">
            Awaiting payment — pay it yourself instead of waiting for the timer
          </span>
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink-3">
            {payUrl}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(payUrl)}
            className="shrink-0 rounded-md border border-line px-2 py-1 font-mono text-xs text-ink-2 transition-colors hover:border-line-2 hover:text-ink"
          >
            copy
          </button>
          <a
            href={payUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md border border-warn/40 bg-warn/10 px-3 py-1 font-mono text-xs text-warn transition-colors hover:bg-warn/20"
          >
            Open checkout ↗
          </a>
        </div>
      ) : null}
      {opened ? (
        <div className="absolute right-6 bottom-full left-6 z-20 mb-3">
          <div className="evt-in overflow-hidden rounded-xl border border-line-2 bg-surface shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Eyebrow>{KIND_META[opened.kind].label}</Eyebrow>
                <span className="truncate font-mono text-sm text-ink">
                  {opened.id}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpenKey(null)}
                className="rounded-md p-1 text-ink-3 transition-colors hover:bg-white/5 hover:text-ink"
                aria-label="Close entity detail"
              >
                <IconClose className="size-4" />
              </button>
            </div>
            <JsonView
              value={opened.data}
              className="scroll-slim max-h-56 overflow-y-auto bg-canvas/60 p-4"
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-6 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2.5">
          <Eyebrow>Ledger</Eyebrow>
          <span className="flex items-center gap-1.5 text-xs text-ink-3">
            <span
              className={`size-1.5 rounded-full ${
                live ? 'bg-good breathe' : 'bg-ink-3'
              }`}
            />
            {live ? 'live' : 'idle'}
          </span>
        </div>
        <span className="text-xs text-ink-3">
          lifted from tool results · amounts in INR
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2.5 px-6 pb-4">
        {entities.map((entity) => (
          <LedgerCard
            key={entity.key}
            entity={entity}
            settling={
              settlement.polling &&
              entity.kind === 'order' &&
              entity.status === 'ACTIVE'
                ? settlement.elapsedMs
                : null
            }
            open={entity.key === openKey}
            onToggle={() =>
              setOpenKey((current) => (current === entity.key ? null : entity.key))
            }
          />
        ))}
        {ghosts.map((kind) => (
          <GhostCard key={kind} kind={kind} />
        ))}
      </div>
    </div>
  );
}
