'use client';

import { useEffect, useRef } from 'react';

import { formatMs } from '@/lib/format';
import type { RunState, ToolItem, AssistantItem } from '@/lib/runState';

/**
 * The conversation, in the Cashfree liquid-glass direction.
 *
 * The merchant's turns are mint glass capsules on the right; the agent answers
 * in opaque white result cards led by a green check, per the Spark UI kit. Tool
 * calls sit between them as quiet glass chips — present, because watching the
 * agent reach for a real payments tool is the whole point, but never loud enough
 * to turn the thread into a log.
 */

function ToolChip({ tool }: { tool: ToolItem }) {
  const running = tool.status === 'running';
  const failed = tool.status === 'failed' || tool.status === 'blocked';

  return (
    <div className="lg-rise flex justify-start">
      <div
        className={`${failed ? 'glass-amber' : 'glass'} flex max-w-[92%] items-center gap-2.5 rounded-2xl py-2 pr-3.5 pl-3`}
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-full"
          style={{
            background: running
              ? 'rgba(29,34,31,0.12)'
              : failed
                ? 'var(--lg-coral)'
                : 'var(--lg-evergreen)',
          }}
        >
          {running ? (
            <svg viewBox="0 0 24 24" fill="none" className="lg-ring size-3" style={{ color: 'var(--lg-ink-3)' }}>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="size-3 text-white">
              <path
                d={failed ? 'M6 6l12 12M18 6L6 18' : 'M5 13l4 4L19 7'}
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>

        <span className="shrink-0 font-mono text-[14px] font-medium" style={{ color: 'var(--lg-ink)' }}>
          {tool.name}
        </span>

        {tool.summary && (
          <span className="min-w-0 truncate font-mono text-[12.5px]" style={{ color: 'var(--lg-ink-3)' }}>
            {tool.summary}
          </span>
        )}

        {typeof tool.durationMs === 'number' && (
          <span className="ml-1 shrink-0 font-mono text-[12px] tabular-nums" style={{ color: 'var(--lg-ink-3)' }}>
            {formatMs(tool.durationMs)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Words arrive one after another rather than all at once. */
function AnimatedAnswer({ item }: { item: AssistantItem }) {
  const words = item.text.split(/(\s+)/);
  return (
    <span style={{ color: 'var(--lg-ink)' }}>
      {words.map((word, i) =>
        /^\s+$/.test(word) ? (
          word
        ) : (
          <span
            key={`${item.id}-${i}`}
            className="lg-word"
            style={{ animationDelay: `${Math.min(i * 22, 900)}ms` }}
          >
            {word}
          </span>
        ),
      )}
      {item.streaming && (
        <span className="lg-caret ml-[2px]" />
      )}
    </span>
  );
}

export default function LiveChat({
  state,
  showTools,
}: {
  state: RunState;
  showTools: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [state.items]);

  const items = showTools ? state.items : state.items.filter((i) => i.kind !== 'tool');

  return (
    <div ref={scroller} className="scroll-glass h-full overflow-y-auto px-7 pt-7 pb-2">
      <div className="mx-auto flex min-h-full max-w-[680px] flex-col justify-end gap-4">
        {items.map((item) => {
          if (item.kind === 'user') {
            return (
              <div key={item.id} className="lg-rise flex justify-end">
                <div className="glass-mint max-w-[86%] rounded-[20px] rounded-br-lg px-4.5 py-3 text-[15.5px] leading-relaxed"
                  style={{ color: 'var(--lg-ink)' }}
                >
                  {item.prompt}
                </div>
              </div>
            );
          }

          if (item.kind === 'tool') {
            return <ToolChip key={item.id} tool={item} />;
          }

          return (
            <div key={item.id} className="lg-rise flex justify-start">
              <div className="card-solid flex max-w-[92%] items-start gap-3 rounded-[20px] rounded-bl-lg px-4 py-3.5">
                <span
                  className="mt-[3px] grid size-5 shrink-0 place-items-center rounded-full"
                  style={{ background: 'var(--lg-evergreen)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="size-3 text-white">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <p className="text-[15.5px] leading-relaxed">
                  <AnimatedAnswer item={item} />
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
