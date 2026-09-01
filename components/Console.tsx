'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ConversationStream from './ConversationStream';
import HeaderBar, { FRAMEWORKS } from './HeaderBar';
import LedgerDock from './LedgerDock';
import ScenarioPicker from './ScenarioPicker';
import ScopePanel from './ScopePanel';
import { IconAlert, IconPlay } from './Icons';
import { useRun } from '@/lib/useRun';
import { useSettlementPoll } from '@/lib/useSettlementPoll';
import { CATALOG_TOOL_COUNT, isWriteTool } from '@/lib/tool-catalog';
import { PAYMENT_TOOLS, SCENARIOS } from '@/lib/scenarios';
import type { Framework, ScenarioId } from '@/lib/events';

const SCENARIO_IDS: ScenarioId[] = ['lifecycle', 'scoped', 'reconciliation'];
const DEFAULT_MODEL = 'gpt-4.1';

function isScenarioId(value: string | null): value is ScenarioId {
  return value !== null && (SCENARIO_IDS as string[]).includes(value);
}

function isFramework(value: string | null): value is Framework {
  return value !== null && (FRAMEWORKS as string[]).includes(value);
}

export default function Console() {
  const {
    state,
    busy,
    hasNext,
    turnsTotal,
    start,
    next,
    stop,
    clear,
    applyEntities,
  } = useRun();

  const [scenario, setScenario] = useState<ScenarioId>('lifecycle');
  const [framework, setFramework] = useState<Framework>('openai');
  const [mock, setMock] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);

  // ?mock=1 drives the scripted harness; it also turns on auto-advance so a
  // single click plays a whole beat end to end.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mockParam = params.get('mock');
    if (mockParam === '1' || mockParam === 'true') {
      setMock(true);
      setAutoAdvance(true);
    }
    const autoParam = params.get('auto');
    if (autoParam === '1' || autoParam === 'true') setAutoAdvance(true);
    if (autoParam === '0' || autoParam === 'false') setAutoAdvance(false);
    const scenarioParam = params.get('scenario');
    if (isScenarioId(scenarioParam)) setScenario(scenarioParam);
    const frameworkParam = params.get('framework');
    if (isFramework(frameworkParam)) setFramework(frameworkParam);
  }, []);

  /* ---------------- settlement wait ---------------- */

  const orderEntity = state.entities.find((entity) => entity.kind === 'order');
  const hasPayment = state.entities.some((entity) => entity.kind === 'payment');
  // Only meaningful after a payment has been attempted: that is the ~30s window
  // where the sandbox is holding the order at ACTIVE.
  const settlementActive =
    state.mode === 'live' &&
    hasPayment &&
    orderEntity?.status === 'ACTIVE';

  const settlement = useSettlementPoll({
    orderId: orderEntity?.id ?? null,
    active: settlementActive,
    onEntities: applyEntities,
  });

  /* ---------------- controls ---------------- */

  const runNow = useCallback(
    (options?: { mock?: boolean }) => {
      const useMock = options?.mock ?? mock;
      if (options?.mock !== undefined) setMock(options.mock);
      setScopeOpen(false);
      start({ scenario, framework, mock: useMock });
    },
    [framework, mock, scenario, start],
  );

  const selectScenario = useCallback(
    (id: ScenarioId) => {
      setScenario(id);
      // Never mix two beats in one transcript.
      if (state.scenario && state.scenario !== id) clear();
    },
    [clear, state.scenario],
  );

  const cycleFramework = useCallback(() => {
    setFramework((current) => {
      const index = (FRAMEWORKS.indexOf(current) + 1) % FRAMEWORKS.length;
      return FRAMEWORKS[index];
    });
  }, []);

  // Auto-advance parks itself while the sandbox is still settling the order.
  useEffect(() => {
    if (!autoAdvance || !hasNext) return;
    if (state.status !== 'awaiting') return;
    if (settlement.polling) return;
    const timer = setTimeout(() => next(), 1000);
    return () => clearTimeout(timer);
  }, [autoAdvance, hasNext, next, settlement.polling, state.status]);

  /* ---------------- derived chrome ---------------- */

  const toolNames = useMemo(() => {
    if (state.toolNames.length > 0 && state.scenario === scenario) {
      return state.toolNames;
    }
    return [...(SCENARIOS[scenario].tools ?? PAYMENT_TOOLS)];
  }, [scenario, state.scenario, state.toolNames]);

  const readOnlyScope = useMemo(
    () => toolNames.length > 0 && toolNames.every((name) => !isWriteTool(name)),
    [toolNames],
  );

  const catalogSize = state.toolCatalogSize || CATALOG_TOOL_COUNT;
  const model = state.model ?? DEFAULT_MODEL;
  const runInFlight = busy || state.status === 'awaiting';
  const activeFramework = runInFlight ? (state.framework ?? framework) : framework;

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-canvas">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(65%_100%_at_50%_0%,rgba(124,108,246,0.11),transparent_70%)]" />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <HeaderBar
          framework={activeFramework}
          onCycleFramework={cycleFramework}
          model={model}
          toolCount={toolNames.length}
          readOnly={readOnlyScope}
          onOpenScope={() => setScopeOpen(true)}
          locked={runInFlight}
        />

        <ScenarioPicker
          selected={scenario}
          onSelect={selectScenario}
          state={state}
          busy={busy}
          hasNext={hasNext}
          turnsTotal={turnsTotal}
          mock={mock}
          onToggleMock={setMock}
          autoAdvance={autoAdvance}
          onToggleAutoAdvance={() => setAutoAdvance((value) => !value)}
          settlement={settlement}
          onRun={() => runNow()}
          onNext={next}
          onStop={stop}
        />

        {state.error ? (
          <div className="evt-in flex shrink-0 items-start gap-3 border-b border-bad/25 bg-bad/[0.07] px-6 py-3">
            <IconAlert className="mt-0.5 size-4 shrink-0 text-bad" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {state.error.message}
              </p>
              {state.error.detail ? (
                <p className="mt-0.5 truncate font-mono text-xs text-ink-3">
                  {state.error.detail}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => runNow({ mock: true })}
              className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line-2 bg-white/[0.05] px-3 text-xs font-medium text-ink transition-colors hover:bg-white/[0.09]"
            >
              <IconPlay className="size-3" />
              Replay from mock
            </button>
          </div>
        ) : null}

        {settlement.failure ? (
          <div className="evt-in flex shrink-0 items-center gap-3 border-b border-warn/25 bg-warn/[0.06] px-6 py-2.5">
            <IconAlert className="size-4 shrink-0 text-warn" />
            <p className="min-w-0 flex-1 truncate text-sm text-ink-2">
              Settlement lookup stopped —{' '}
              <span className="font-mono text-ink-3">{settlement.failure}</span>
            </p>
          </div>
        ) : null}

        <ConversationStream state={state} onOpenScope={() => setScopeOpen(true)} />

        <LedgerDock state={state} settlement={settlement} />
      </div>

      <ScopePanel
        open={scopeOpen}
        onClose={() => setScopeOpen(false)}
        toolNames={toolNames}
        toolCatalogSize={catalogSize}
        scenarioTitle={SCENARIOS[scenario].title}
      />
    </div>
  );
}
