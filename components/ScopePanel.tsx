'use client';

import { useEffect, useMemo } from 'react';
import { IconCheck, IconClose, IconLock } from './Icons';
import { Eyebrow } from './ui';
import { CATALOG_TOOL_COUNT, TOOL_CATALOG } from '@/lib/tool-catalog';

function ToolPill({
  name,
  granted,
  write,
}: {
  name: string;
  granted: boolean;
  write: boolean;
}) {
  return (
    <span
      title={write ? `${name} · can move money` : `${name} · read only`}
      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-sm transition-colors duration-200 ${
        granted
          ? 'border-good/35 bg-good/12 text-good'
          : 'border-line bg-white/[0.015] text-ink-3 opacity-70'
      }`}
    >
      {granted ? (
        <IconCheck className="size-3.5 shrink-0" />
      ) : (
        <span className="size-3.5 shrink-0 rounded-[3px] border border-current opacity-50" />
      )}
      {name}
      {write ? (
        <span
          className={`size-1.5 shrink-0 rounded-full ${
            granted ? 'bg-good' : 'bg-warn/50'
          }`}
        />
      ) : null}
    </span>
  );
}

export default function ScopePanel({
  open,
  onClose,
  toolNames,
  toolCatalogSize,
  scenarioTitle,
}: {
  open: boolean;
  onClose: () => void;
  toolNames: string[];
  toolCatalogSize: number;
  scenarioTitle: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const granted = useMemo(() => new Set(toolNames), [toolNames]);

  const stats = useMemo(() => {
    const total = toolCatalogSize || CATALOG_TOOL_COUNT;
    let writeGranted = 0;
    for (const group of TOOL_CATALOG) {
      for (const tool of group.tools) {
        if (tool.write && granted.has(tool.name)) writeGranted += 1;
      }
    }
    const unknown = toolNames.filter(
      (name) =>
        !TOOL_CATALOG.some((group) =>
          group.tools.some((tool) => tool.name === name),
        ),
    );
    return {
      total,
      grantedCount: toolNames.length,
      withheld: Math.max(0, total - toolNames.length),
      writeGranted,
      unknown,
    };
  }, [granted, toolCatalogSize, toolNames]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button
        type="button"
        aria-label="Close tool scope"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
      />

      <div className="evt-in relative flex max-h-[88vh] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-2xl shadow-black/70">
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <div className="flex items-center gap-2.5">
              <IconLock className="size-4 text-accent-2" />
              <Eyebrow>Tool scope</Eyebrow>
            </div>
            <h2 className="mt-2 text-xl font-medium tracking-[-0.015em] text-ink">
              This agent was handed{' '}
              <span className="text-good">{stats.grantedCount}</span> of{' '}
              {stats.total} tools
            </h2>
            <p className="mt-1.5 text-sm text-ink-2">
              {scenarioTitle} · the model&rsquo;s tool list literally does not
              contain the greyed names.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line p-2 text-ink-3 transition-colors hover:border-line-2 hover:text-ink"
            aria-label="Close"
          >
            <IconClose className="size-4" />
          </button>
        </header>

        <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
          <div className="bg-surface px-6 py-3.5">
            <Eyebrow>Granted</Eyebrow>
            <p className="mt-1 font-mono text-xl text-good">
              {stats.grantedCount}
            </p>
          </div>
          <div className="bg-surface px-6 py-3.5">
            <Eyebrow>Withheld</Eyebrow>
            <p className="mt-1 font-mono text-xl text-ink-3">{stats.withheld}</p>
          </div>
          <div className="bg-surface px-6 py-3.5">
            <Eyebrow>Can move money</Eyebrow>
            <p
              className={`mt-1 font-mono text-xl ${
                stats.writeGranted === 0 ? 'text-ink-3' : 'text-warn'
              }`}
            >
              {stats.writeGranted === 0 ? 'none' : stats.writeGranted}
            </p>
          </div>
        </div>

        <div className="scroll-slim flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-6">
            {TOOL_CATALOG.map((group) => {
              const count = group.tools.filter((tool) =>
                granted.has(tool.name),
              ).length;
              return (
                <section key={group.label}>
                  <div className="mb-3 flex items-baseline gap-3">
                    <h3 className="text-md font-medium text-ink">{group.label}</h3>
                    <span className="font-mono text-xs text-ink-3">
                      {count}/{group.tools.length}
                    </span>
                    <span className="truncate text-xs text-ink-3">
                      {group.hint}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.tools.map((tool) => (
                      <ToolPill
                        key={tool.name}
                        name={tool.name}
                        granted={granted.has(tool.name)}
                        write={tool.write}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {stats.unknown.length > 0 ? (
              <section>
                <div className="mb-3 flex items-baseline gap-3">
                  <h3 className="text-md font-medium text-ink">Also granted</h3>
                  <span className="text-xs text-ink-3">
                    not in the local catalogue mirror
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {stats.unknown.map((name) => (
                    <ToolPill key={name} name={name} granted write={false} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-line px-6 py-3.5">
          <span className="flex items-center gap-4 text-xs text-ink-3">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-warn/60" />
              writes money
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[3px] border border-ink-3" />
              withheld
            </span>
          </span>
          <span className="text-xs text-ink-3">
            Scoping happens at construction — there is no allow-list to bypass.
          </span>
        </footer>
      </div>
    </div>
  );
}
