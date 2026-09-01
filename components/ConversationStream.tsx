'use client';

import { useEffect, useRef, useState } from 'react';
import ToolCallCard from './ToolCallCard';
import { IconArrowRight, IconCheck, IconTerminal, ProductMark } from './Icons';
import { Eyebrow } from './ui';
import { formatMs } from '@/lib/format';
import type { AssistantItem, RunState, StreamItem, UserItem } from '@/lib/runState';

function UserTurn({ item }: { item: UserItem }) {
  return (
    <div className="evt-in">
      <div className="mb-2 flex items-center gap-2.5">
        <Eyebrow>Support rep</Eyebrow>
        <span className="text-xs text-ink-3">turn {item.turnIndex + 1}</span>
      </div>
      <div className="rounded-xl border border-line border-l-2 border-l-accent/80 bg-surface-2 px-4 py-3 text-md text-ink">
        {item.prompt}
      </div>
    </div>
  );
}

function AssistantMessage({ item }: { item: AssistantItem }) {
  return (
    <div className="evt-in flex gap-3">
      <span className="mt-[3px] flex size-7 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/12 text-accent-2">
        <IconTerminal className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-md whitespace-pre-wrap text-ink">
        {item.text}
        {item.streaming ? (
          <span className="caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] rounded-full bg-accent-2 align-baseline" />
        ) : null}
      </p>
    </div>
  );
}

function ToolRow({
  item,
  onOpenScope,
}: {
  item: StreamItem & { kind: 'tool' };
  onOpenScope: () => void;
}) {
  return (
    <div className="relative pl-9">
      <span className="pointer-events-none absolute top-[-14px] bottom-[-14px] left-[13px] w-px bg-line" />
      <span className="pointer-events-none absolute top-[22px] left-[9px] size-[9px] rounded-full border-2 border-canvas bg-line-2" />
      <ToolCallCard tool={item} onOpenScope={onOpenScope} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-10 text-center">
      <ProductMark className="opacity-90" />
      <h2 className="mt-5 text-xl font-medium tracking-[-0.01em] text-ink">
        No run yet
      </h2>
      <p className="mt-2 max-w-[38ch] text-base text-ink-2">
        Pick a scenario above and hit Run. Every tool call the model makes is
        streamed here as it happens, with the live money ledger below.
      </p>
      <div className="mt-6 flex items-center gap-2.5 text-sm text-ink-3">
        <IconArrowRight className="size-4" />
        Sandbox credentials only. Nothing here touches production.
      </div>
    </div>
  );
}

function RunFooter({ state }: { state: RunState }) {
  if (state.status !== 'completed') return null;
  return (
    <div className="evt-in flex items-center gap-2.5 rounded-lg border border-good/25 bg-good/[0.06] px-3.5 py-2.5">
      <IconCheck className="size-4 shrink-0 text-good" />
      <span className="text-sm text-ink-2">
        Run complete
        <span className="text-ink-3"> · </span>
        {state.completedTurns} {state.completedTurns === 1 ? 'turn' : 'turns'}
        <span className="text-ink-3"> · </span>
        {state.toolCalls} tool {state.toolCalls === 1 ? 'call' : 'calls'}
        {typeof state.totalMs === 'number' ? (
          <>
            <span className="text-ink-3"> · </span>
            {formatMs(state.totalMs)}
          </>
        ) : null}
      </span>
    </div>
  );
}

export default function ConversationStream({
  state,
  onOpenScope,
}: {
  state: RunState;
  onOpenScope: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const onScroll = () => {
      const atBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight < 96;
      if (atBottom !== stick.current) {
        stick.current = atBottom;
        setPinned(atBottom);
      }
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, []);

  // Deliberately runs on every render: the stream mutates on every token.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !stick.current) return;
    element.scrollTop = element.scrollHeight;
  });

  const empty = state.items.length === 0;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        className="scroll-slim h-full overflow-y-auto overscroll-contain px-6 py-6"
      >
        {empty ? (
          state.status === 'connecting' ? (
            <div className="flex h-full items-center justify-center gap-3 text-base text-ink-2">
              <span className="size-2 rounded-full bg-accent breathe" />
              Opening the agent stream…
            </div>
          ) : (
            <EmptyState />
          )
        ) : (
          <div className="mx-auto flex max-w-[860px] flex-col gap-3.5">
            {state.items.map((item) => {
              if (item.kind === 'user') {
                return (
                  <div key={item.id} className="pt-2 first:pt-0">
                    <UserTurn item={item} />
                  </div>
                );
              }
              if (item.kind === 'assistant') {
                return <AssistantMessage key={item.id} item={item} />;
              }
              return (
                <ToolRow key={item.id} item={item} onOpenScope={onOpenScope} />
              );
            })}
            <RunFooter state={state} />
            <div className="h-2" />
          </div>
        )}
      </div>

      {!pinned && !empty ? (
        <button
          type="button"
          onClick={() => {
            const element = scroller.current;
            if (!element) return;
            element.scrollTop = element.scrollHeight;
            stick.current = true;
            setPinned(true);
          }}
          className="evt-in absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-line-2 bg-surface-2/95 px-3.5 py-1.5 text-sm text-ink-2 shadow-lg shadow-black/40 backdrop-blur transition-colors hover:text-ink"
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
