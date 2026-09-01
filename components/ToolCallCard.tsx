'use client';

import { memo, useState } from 'react';
import JsonView, { stringifyValue } from './JsonView';
import {
  IconAlert,
  IconCheck,
  IconChevron,
  IconCopy,
  IconLock,
  IconSlash,
  IconSpinner,
} from './Icons';
import { formatMs, toArgPairs } from '@/lib/format';
import type { ToolItem } from '@/lib/runState';

const SHELL: Record<ToolItem['status'], string> = {
  running: 'border-accent/40 bg-accent/[0.055]',
  ok: 'border-line bg-white/[0.022] hover:border-line-2',
  failed: 'border-warn/40 bg-warn/[0.05]',
  blocked: 'border-bad/45 bg-bad/[0.06]',
};

function StatusGlyph({ status }: { status: ToolItem['status'] }) {
  if (status === 'running') {
    return (
      <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent-2">
        <IconSpinner className="spin-ring size-4" />
      </span>
    );
  }
  if (status === 'ok') {
    return (
      <span className="pop-in mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-good/15 text-good">
        <IconCheck className="size-4" />
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="pop-in mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-warn/15 text-warn">
        <IconAlert className="size-4" />
      </span>
    );
  }
  return (
    <span className="pop-in mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-bad/15 text-bad">
      <IconSlash className="size-4" />
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-ink-3 transition-colors hover:bg-white/5 hover:text-ink-2"
    >
      <IconCopy className="size-3.5" />
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

function ToolCallCardImpl({
  tool,
  onOpenScope,
}: {
  tool: ToolItem;
  onOpenScope?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { pairs, hidden } = toArgPairs(tool.args);
  const running = tool.status === 'running';
  const blocked = tool.status === 'blocked';
  const hasArgs = pairs.length > 0;

  return (
    <div
      className={`evt-in relative overflow-hidden rounded-xl border transition-colors duration-200 ${SHELL[tool.status]}`}
    >
      {running ? (
        <span className="sweep pointer-events-none absolute inset-x-0 top-0 h-[2px]" />
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        <StatusGlyph status={tool.status} />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-mono text-md font-medium tracking-[-0.01em] text-ink">
              {tool.name}
            </span>
            {running ? (
              <span className="text-xs tracking-[0.1em] text-accent-2 uppercase">
                running
              </span>
            ) : null}
            {blocked ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-bad/40 bg-bad/12 px-2 py-[2px] text-xs font-medium tracking-[0.08em] text-bad uppercase">
                <IconLock className="size-3.5" />
                not in scope
              </span>
            ) : null}
            {tool.status === 'failed' ? (
              <span className="text-xs tracking-[0.1em] text-warn uppercase">
                failed
              </span>
            ) : null}
          </span>

          {hasArgs ? (
            <span className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
              {pairs.map((pair) => (
                <span key={pair.key} className="inline-flex items-baseline gap-1.5">
                  <span className="text-xs text-ink-3">{pair.key}</span>
                  <span className="text-xs text-ink-3">→</span>
                  <span
                    className={`text-sm text-ink ${pair.mono ? 'font-mono' : ''}`}
                  >
                    {pair.value}
                  </span>
                </span>
              ))}
              {hidden > 0 ? (
                <span className="text-xs text-ink-3">+{hidden} more</span>
              ) : null}
            </span>
          ) : null}

          {tool.summary ? (
            <span className="mt-2.5 flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full bg-good" />
              <span className="font-mono text-sm text-ink-2">{tool.summary}</span>
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-2.5 pt-0.5">
          {typeof tool.durationMs === 'number' ? (
            <span className="font-mono text-xs text-ink-3">
              {formatMs(tool.durationMs)}
            </span>
          ) : null}
          <IconChevron
            className={`size-4 text-ink-3 transition-transform duration-200 ${
              open ? 'rotate-90' : ''
            }`}
          />
        </span>
      </button>

      {blocked && tool.reason ? (
        <div className="border-t border-bad/25 bg-bad/[0.05] px-3.5 py-3">
          <p className="text-base text-ink">{tool.reason}</p>
          {onOpenScope ? (
            <button
              type="button"
              onClick={onOpenScope}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-bad/35 px-2.5 py-1 text-xs text-bad transition-colors hover:bg-bad/10"
            >
              View this agent&rsquo;s tool scope
              <IconChevron className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="grid gap-3 border-t border-line/80 bg-black/35 px-3.5 py-3">
          <section>
            <header className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium tracking-[0.14em] text-ink-3 uppercase">
                Request
              </span>
              <CopyButton value={stringifyValue(tool.args)} />
            </header>
            <JsonView
              value={tool.args}
              className="scroll-slim max-h-64 overflow-y-auto rounded-lg border border-line/70 bg-canvas/70 p-3"
            />
          </section>

          {tool.status === 'ok' || tool.status === 'failed' ? (
            <section>
              <header className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium tracking-[0.14em] text-ink-3 uppercase">
                  Response
                </span>
                <CopyButton value={stringifyValue(tool.result)} />
              </header>
              <JsonView
                value={tool.result}
                className="scroll-slim max-h-80 overflow-y-auto rounded-lg border border-line/70 bg-canvas/70 p-3"
              />
            </section>
          ) : (
            <p className="text-sm text-ink-3">
              {running
                ? 'Waiting on the Cashfree API…'
                : 'No response — the model never got to call this tool.'}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

const ToolCallCard = memo(ToolCallCardImpl);
export default ToolCallCard;
