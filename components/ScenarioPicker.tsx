'use client';

import { IconArrowRight, IconPlay, IconRotate, IconStop } from './Icons';
import { PAYMENT_TOOLS, SCENARIO_ORDER, SCENARIOS } from '@/lib/scenarios';
import type { ScenarioId } from '@/lib/events';
import type { RunState } from '@/lib/runState';
import type { SettlementPoll } from '@/lib/useSettlementPoll';

function ScenarioCard({
  id,
  index,
  selected,
  disabled,
  progress,
  onSelect,
}: {
  id: ScenarioId;
  index: number;
  selected: boolean;
  disabled: boolean;
  /** 0..1, only rendered for the scenario currently on screen. */
  progress: number | null;
  onSelect: () => void;
}) {
  const scenario = SCENARIOS[id];
  const toolCount = (scenario.tools ?? PAYMENT_TOOLS).length;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`group relative flex flex-col overflow-hidden rounded-xl border px-3.5 pt-3 pb-3 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        selected
          ? 'border-accent/55 bg-accent/[0.08]'
          : 'border-line bg-white/[0.022] hover:border-line-2 hover:bg-white/[0.045]'
      } ${disabled ? 'cursor-default opacity-55' : 'cursor-pointer'}`}
    >
      <span className="flex items-center gap-2">
        <span
          className={`font-mono text-xs ${selected ? 'text-accent-2' : 'text-ink-3'}`}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="text-sm font-medium text-ink">{scenario.title}</span>
      </span>

      <span className="mt-1.5 line-clamp-2 text-xs text-ink-2">
        {scenario.tagline}
      </span>

      <span className="mt-2.5 flex items-center gap-2 text-xs text-ink-3">
        <span
          className={`rounded border px-1.5 py-px font-mono ${
            toolCount <= 5
              ? 'border-warn/30 bg-warn/10 text-warn'
              : 'border-line bg-white/5'
          }`}
        >
          {toolCount} tools
        </span>
        <span>
          {scenario.turns.length} {scenario.turns.length === 1 ? 'turn' : 'turns'}
        </span>
      </span>

      {progress !== null ? (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-accent/15">
          <span
            className="block h-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </span>
      ) : null}
    </button>
  );
}

export default function ScenarioPicker({
  selected,
  onSelect,
  state,
  busy,
  hasNext,
  turnsTotal,
  mock,
  onToggleMock,
  autoAdvance,
  onToggleAutoAdvance,
  settlement,
  onRun,
  onNext,
  onStop,
}: {
  selected: ScenarioId;
  onSelect: (id: ScenarioId) => void;
  state: RunState;
  busy: boolean;
  hasNext: boolean;
  turnsTotal: number;
  mock: boolean;
  onToggleMock: (value: boolean) => void;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
  settlement: SettlementPoll;
  onRun: () => void;
  onNext: () => void;
  onStop: () => void;
}) {
  const onScreen = state.scenario;
  const total = onScreen ? SCENARIOS[onScreen].turns.length : 0;
  const progress =
    onScreen && state.items.length > 0 && total > 0
      ? Math.min(1, state.completedTurns / total)
      : null;

  const nextTurnLabel = hasNext
    ? `turn ${state.requestedTurn + 2} of ${turnsTotal}`
    : null;

  return (
    <section className="shrink-0 border-b border-line bg-canvas-2/50 px-6 pt-4 pb-3.5">
      <div className="grid grid-cols-3 gap-2.5">
        {SCENARIO_ORDER.map((id, index) => (
          <ScenarioCard
            key={id}
            id={id}
            index={index}
            selected={id === selected}
            disabled={busy}
            progress={onScreen === id ? progress : null}
            onSelect={() => onSelect(id)}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-2 bg-white/[0.04] px-3.5 text-sm font-medium text-ink transition-colors hover:bg-white/[0.08]"
            >
              <IconStop className="size-3.5" />
              Stop
            </button>
          ) : hasNext ? (
            <button
              type="button"
              onClick={onNext}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_6px_20px_-8px_rgba(124,108,246,0.9)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.985]"
            >
              Next turn
              <IconArrowRight className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onRun}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_6px_20px_-8px_rgba(124,108,246,0.9)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.985]"
            >
              <IconPlay className="size-3.5" />
              Run scenario
            </button>
          )}

          {state.items.length > 0 && !busy ? (
            <button
              type="button"
              onClick={onRun}
              title="Restart this scenario from turn 1"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-ink-3 transition-colors hover:border-line-2 hover:text-ink"
            >
              <IconRotate className="size-4" />
            </button>
          ) : null}

          {busy ? (
            <span className="ml-1 flex items-center gap-2 text-xs whitespace-nowrap text-ink-3">
              <span className="size-1.5 rounded-full bg-accent breathe" />
              {state.status === 'connecting'
                ? 'connecting'
                : `turn ${Math.max(1, state.activeTurn + 1)} of ${turnsTotal}`}
            </span>
          ) : settlement.polling ? (
            <span className="ml-1 flex min-w-0 items-center gap-2 text-xs whitespace-nowrap text-warn">
              <span className="size-1.5 rounded-full bg-warn breathe" />
              sandbox settling · {Math.round(settlement.elapsedMs / 1000)}s
              <span className="text-ink-3">
                — order flips to PAID at ~30s
              </span>
            </span>
          ) : settlement.gaveUp ? (
            <span className="ml-1 flex items-center gap-2 text-xs whitespace-nowrap text-ink-3">
              settlement not confirmed — advance anyway
            </span>
          ) : nextTurnLabel ? (
            <span className="ml-1 text-xs whitespace-nowrap text-ink-3">
              next · {nextTurnLabel}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {state.runId ? (
            <span
              className="hidden font-mono text-xs text-ink-3 xl:inline"
              title={state.runId}
            >
              {state.runId.slice(0, 20)}
            </span>
          ) : null}

          <button
            type="button"
            onClick={onToggleAutoAdvance}
            title={
              autoAdvance
                ? 'Auto-advance is on — turns fire on their own once settlement clears'
                : 'Auto-advance is off — you drive each turn'
            }
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium tracking-[0.06em] uppercase transition-colors duration-150 ${
              autoAdvance
                ? 'border-accent/50 bg-accent/15 text-accent-2'
                : 'border-line bg-white/[0.02] text-ink-3 hover:text-ink-2'
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                autoAdvance ? 'bg-accent-2 breathe' : 'bg-ink-3'
              }`}
            />
            auto
          </button>

          <div className="inline-flex items-center rounded-lg border border-line bg-white/[0.02] p-0.5">
            {(
              [
                ['live', false],
                ['mock', true],
              ] as const
            ).map(([label, value]) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                onClick={() => onToggleMock(value)}
                title={
                  value
                    ? 'Replay the scripted run — no API key needed'
                    : 'Stream from POST /api/run'
                }
                className={`h-7 rounded-[6px] px-2.5 text-xs font-medium tracking-[0.06em] uppercase transition-colors duration-150 ${
                  mock === value
                    ? value
                      ? 'bg-warn/15 text-warn'
                      : 'bg-good/15 text-good'
                    : 'text-ink-3 hover:text-ink-2'
                } ${busy ? 'cursor-default opacity-60' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
