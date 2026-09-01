'use client';

import { IconGrid, IconRotate, ProductMark } from './Icons';
import { Chip } from './ui';
import type { Framework } from '@/lib/events';

const FRAMEWORKS: Framework[] = ['openai', 'langchain', 'ai-sdk'];

export default function HeaderBar({
  framework,
  onCycleFramework,
  model,
  toolCount,
  readOnly,
  onOpenScope,
  locked,
}: {
  framework: Framework;
  onCycleFramework: () => void;
  model: string;
  toolCount: number;
  /** No granted tool can move money — worth saying out loud in the chrome. */
  readOnly: boolean;
  onOpenScope: () => void;
  /** True while a run is in flight — the framework can't change mid-run. */
  locked: boolean;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-canvas-2/80 px-6 py-3.5 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <ProductMark />
        <div className="min-w-0">
          <h1 className="truncate text-md leading-tight font-medium tracking-[-0.015em] text-ink">
            Merchant Support Agent
          </h1>
          <p className="truncate text-xs text-ink-3">
            Cashfree Payments Agent Toolkit
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Chip title="Cashfree sandbox environment">
          <span className="size-1.5 rounded-full bg-good breathe" />
          <span className="font-medium tracking-[0.08em] text-ink">SANDBOX</span>
        </Chip>

        <Chip title="Model driving the run">
          <span className="font-mono text-ink-2">{model}</span>
        </Chip>

        <Chip
          onClick={locked ? undefined : onCycleFramework}
          title={
            locked
              ? 'Framework is fixed while a run is in flight'
              : `Swap framework · ${FRAMEWORKS.join(' / ')}`
          }
        >
          <IconRotate className={`size-3.5 ${locked ? 'opacity-40' : ''}`} />
          <span className="font-mono text-ink-2">{framework}</span>
        </Chip>

        <Chip onClick={onOpenScope} title="See exactly which tools this agent has">
          <IconGrid className="size-3.5 text-accent-2" />
          <span className="font-medium text-ink">{toolCount} tools</span>
          {readOnly ? (
            <span className="rounded bg-warn/15 px-1.5 py-px font-medium tracking-[0.06em] text-warn uppercase">
              read-only
            </span>
          ) : null}
        </Chip>
      </div>
    </header>
  );
}

export { FRAMEWORKS };
