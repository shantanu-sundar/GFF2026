'use client';

import { useEffect, useRef, useState } from 'react';
import type { LedgerEntity } from './events';

const TICK_MS = 1000;
const POLL_EVERY_MS = 2000;
const GIVE_UP_MS = 60_000;
/** Consecutive `ok: false` responses before we stop asking. */
const MAX_FAILURES = 3;

/**
 * Cashfree sandbox settles a UPI collect on a fixed ~30s server-side timer, so
 * the order sits at ACTIVE after `orderPayUsingUpi` and a refund fired too early
 * hard-fails with `order_id_not_paid`.
 *
 * While an order is ACTIVE we poll `GET /api/order?orderId=…` and fold whatever
 * entities come back into the ledger, which turns the dead wait into the order
 * pill flipping to PAID on camera. Gives up after a minute.
 *
 * The endpoint answers HTTP 200 even when the tool failed — `ok` is the only
 * signal that matters, exactly like `tool_result.ok`.
 */
export interface SettlementPoll {
  polling: boolean;
  elapsedMs: number;
  gaveUp: boolean;
  /** Set when the endpoint kept answering `ok: false`. */
  failure: string | null;
}

interface OrderPollResponse {
  ok?: boolean;
  value?: unknown;
  summary?: string;
  entities?: unknown;
  failure?: { code?: string; message?: string };
}

const ENTITY_KINDS = ['customer', 'order', 'payment', 'refund'];

function isLedgerEntity(value: unknown): value is LedgerEntity {
  if (typeof value !== 'object' || value === null) return false;
  const entity = value as Partial<LedgerEntity>;
  return (
    typeof entity.id === 'string' &&
    typeof entity.kind === 'string' &&
    ENTITY_KINDS.includes(entity.kind)
  );
}

/** Normalise a polled entity — `data` is optional on the wire, required in state. */
function toLedgerEntity(value: LedgerEntity): LedgerEntity {
  return {
    kind: value.kind,
    id: value.id,
    label: value.label ?? value.id,
    amount: typeof value.amount === 'number' ? value.amount : undefined,
    status: typeof value.status === 'string' ? value.status : undefined,
    data:
      typeof value.data === 'object' && value.data !== null ? value.data : {},
  };
}

export const IDLE_SETTLEMENT: SettlementPoll = {
  polling: false,
  elapsedMs: 0,
  gaveUp: false,
  failure: null,
};

export function useSettlementPoll({
  orderId,
  active,
  onEntities,
}: {
  orderId: string | null;
  active: boolean;
  onEntities: (entities: LedgerEntity[]) => void;
}): SettlementPoll {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const onEntitiesRef = useRef(onEntities);
  onEntitiesRef.current = onEntities;

  useEffect(() => {
    if (!active || !orderId) {
      setElapsedMs(0);
      setGaveUp(false);
      setFailure(null);
      return;
    }

    let cancelled = false;
    let elapsed = 0;
    let failures = 0;
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | null = null;

    const halt = (reason: string | null) => {
      if (timer) clearInterval(timer);
      timer = null;
      if (cancelled) return;
      setGaveUp(true);
      if (reason) setFailure(reason);
    };

    const poll = async () => {
      let payload: OrderPollResponse;
      try {
        const response = await fetch(
          `/api/order?orderId=${encodeURIComponent(orderId)}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        payload = (await response.json()) as OrderPollResponse;
      } catch {
        // Transport hiccup — the next tick retries.
        return;
      }
      if (cancelled) return;

      if (payload.ok === false) {
        failures += 1;
        const reason =
          payload.summary ??
          payload.failure?.message ??
          payload.failure?.code ??
          'Order lookup failed';
        if (failures >= MAX_FAILURES) halt(reason);
        return;
      }

      failures = 0;
      const entities = Array.isArray(payload.entities)
        ? payload.entities.filter(isLedgerEntity).map(toLedgerEntity)
        : [];
      if (entities.length) onEntitiesRef.current(entities);
    };

    void poll();

    timer = setInterval(() => {
      if (cancelled) return;
      elapsed += TICK_MS;
      setElapsedMs(elapsed);
      if (elapsed >= GIVE_UP_MS) {
        halt(null);
        return;
      }
      if (elapsed % POLL_EVERY_MS === 0) void poll();
    }, TICK_MS);

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [active, orderId]);

  return {
    polling: active && !gaveUp && Boolean(orderId),
    elapsedMs,
    gaveUp: gaveUp && active,
    failure,
  };
}
