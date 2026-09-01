'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import LiveChat from '@/components/LiveChat';
import LiveLedger from '@/components/LiveLedger';
import SparkComposer from '@/components/SparkComposer';
import LiveHero from '@/components/LiveHero';
import ScopePanel from '@/components/ScopePanel';
import { useRun } from '@/lib/useRun';
import { useSettlementPoll } from '@/lib/useSettlementPoll';
import { SCENARIOS, resolvePrompt } from '@/lib/scenarios';
import type { Framework, ScenarioId } from '@/lib/events';

/** Roughly a fast human typist; long prompts speed up so no turn drags. */
function typeDelay(length: number) {
  return length > 70 ? 12 : 22;
}

/**
 * The recording stage.
 *
 * Same agent and same events as the console at /, with every control the
 * operator does not need on camera removed — a stray click mid-take is a
 * reshoot. Driven from the keyboard so the cursor stays off-screen, and
 * configured from the URL so a take is reproducible by pasting a link.
 *
 *   space / enter / right   type the next question, then send it
 *   s                       tool scope panel
 *   r                       restart from turn 0
 *   esc                     stop
 */
export default function LiveStage({
  scenario,
  framework,
  mock,
  chrome,
  auto,
  showTools,
  settleAfterMs,
}: {
  scenario: ScenarioId;
  framework: Framework;
  mock: boolean;
  chrome: boolean;
  auto: boolean;
  showTools: boolean;
  /** Settle the sandbox payment this many ms after it appears. 0 disables. */
  settleAfterMs: number;
}) {
  const run = useRun();
  const { state, busy, hasNext } = run;
  const [scopeOpen, setScopeOpen] = useState(false);

  /** 'in' -> 'out' -> 'gone'. The home screen dissolves on the first send. */
  const [heroPhase, setHeroPhase] = useState('in');
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(false);
  const typeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const definition = SCENARIOS[scenario];

  const orderCard = state.entities.find((e) => e.kind === 'order');
  const customerCard = state.entities.find((e) => e.kind === 'customer');
  const paymentId = state.entities.find((e) => e.kind === 'payment')?.id ?? null;
  const orderId = orderCard?.id ?? null;
  const orderStatus = orderCard?.status;

  const settlement = useSettlementPoll({
    orderId,
    active: !mock && !!paymentId && orderStatus === 'ACTIVE',
    onEntities: run.applyEntities,
  });

  const started = state.status !== 'idle';
  const locked = busy || typing || settlement.polling;

  /**
   * Cut the wait to a predictable beat. Sandbox settles a UPI collect on its
   * own clock — measured 19s to 32s — which is too long to hold and too
   * variable to cut to. Once the payment exists we wait settleAfterMs and ask
   * Cashfree to complete it, using the same simulate call its own sandbox
   * simulator makes. Nothing is faked: the payment really completes.
   */
  const settledFor = useRef<string | null>(null);
  useEffect(() => {
    if (mock || !settleAfterMs) return;
    if (!paymentId || !orderId) return;
    if (orderStatus === 'PAID') return;
    if (settledFor.current === orderId) return;

    const timer = setTimeout(() => {
      // Claimed here, not when the effect runs. Claiming early meant the first
      // re-render cancelled the pending timer and then refused to reschedule.
      settledFor.current = orderId;
      void fetch('/api/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, paymentId }),
      }).catch(() => {
        // Not fatal: the sandbox's own timer still settles it eventually.
      });
    }, settleAfterMs);
    return () => clearTimeout(timer);
  }, [mock, settleAfterMs, paymentId, orderId, orderStatus]);

  /** The question the next turn will ask, resolved against ids we already hold. */
  const nextIndex = started ? state.completedTurns : 0;
  const nextPrompt = useMemo(() => {
    const turn = definition.turns[nextIndex];
    if (!turn) return '';
    return resolvePrompt(turn, {
      orderId: orderId ?? undefined,
      customerId: customerCard?.id,
    });
  }, [definition, nextIndex, orderId, customerCard?.id]);

  useEffect(() => () => {
    if (typeTimer.current) clearTimeout(typeTimer.current);
  }, []);

  /**
   * Type the question out, then send it. The pause between the last character
   * and the request is what makes it read as someone asking rather than a
   * script firing.
   */
  const advance = useCallback(() => {
    if (locked) return;
    if (started && !hasNext) return;
    const prompt = nextPrompt;
    if (!prompt) return;

    const fire = () => {
      setTyped('');
      setTyping(false);
      if (!started) run.start({ scenario, framework, mock });
      else run.next();
    };

    if (!started && heroPhase === 'in') {
      setHeroPhase('out');
      setTimeout(() => setHeroPhase('gone'), 520);
    }

    setTyping(true);
    setTyped('');
    let i = 0;
    const step = () => {
      i += 1;
      setTyped(prompt.slice(0, i));
      if (i < prompt.length) {
        typeTimer.current = setTimeout(step, typeDelay(prompt.length));
      } else {
        setTyping(false);
        typeTimer.current = setTimeout(fire, 320);
      }
    };
    typeTimer.current = setTimeout(step, 90);
  }, [locked, started, hasNext, nextPrompt, run, scenario, framework, mock, heroPhase]);

  const restart = useCallback(() => {
    if (typeTimer.current) clearTimeout(typeTimer.current);
    setTyped('');
    setTyping(false);
    settledFor.current = null;
    setHeroPhase('in');
    run.stop();
    run.clear();
  }, [run]);

  const openPayLink = useCallback(async () => {
    if (!orderId) return;
    try {
      const response = await fetch('/api/paylink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const data = (await response.json()) as {
        web?: string | null;
        simulator?: string | null;
      };
      const url = data.simulator ?? data.web;
      if (url) window.open(url, '_blank', 'noopener');
    } catch {
      // Nothing to do — the automatic settle still covers the run.
    }
  }, [orderId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (scopeOpen && event.key !== 's' && event.key !== 'S') return;

      if (event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowRight') {
        event.preventDefault();
        advance();
      } else if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        setScopeOpen((o) => !o);
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        restart();
      } else if (event.key === 'Escape') {
        run.stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, restart, run, scopeOpen]);

  /** Opt-in autoplay. Still waits out the settle poll. */
  useEffect(() => {
    if (!auto || !started || !hasNext || locked) return;
    const timer = setTimeout(() => advance(), 1100);
    return () => clearTimeout(timer);
  }, [auto, started, hasNext, locked, advance]);

  const readOnly = useMemo(
    () =>
      state.toolNames.length > 0 &&
      !state.toolNames.some((n) => /^(create|terminate|authorize|update|delete|orderPay)/.test(n)),
    [state.toolNames],
  );

  const hint = !started
    ? 'Press space to ask the first question'
    : hasNext
      ? 'Press space for the next question'
      : 'Run complete';

  return (
    <main className="liquid flex h-dvh flex-col overflow-hidden">
      {chrome ? (
        <header className="flex shrink-0 items-center gap-2.5 px-6 py-3.5">
          <span className="glass flex items-center gap-2 rounded-full px-3 py-1.5">
            <span className="size-1.5 rounded-full" style={{ background: 'var(--lg-evergreen)' }} />
            <span className="text-[12px] font-semibold" style={{ color: 'var(--lg-ink-2)', letterSpacing: '0.1em' }}>
              SANDBOX
            </span>
          </span>
          <span className="glass rounded-full px-3 py-1.5 font-mono text-[12px]" style={{ color: 'var(--lg-ink-2)' }}>
            {state.model ?? 'gpt-4.1'}
          </span>
          <span className="glass rounded-full px-3 py-1.5 font-mono text-[12px]" style={{ color: 'var(--lg-ink-2)' }}>
            {state.framework ?? framework}
          </span>

          <button
            type="button"
            onClick={() => setScopeOpen(true)}
            className="glass ml-auto rounded-full px-3.5 py-1.5 font-mono text-[12px] transition-transform duration-150 hover:scale-[1.03]"
            style={{ color: 'var(--lg-ink-2)' }}
          >
            {state.toolNames.length || definition.tools?.length || 0} tools
            {readOnly ? (
              <span className="ml-2 font-semibold" style={{ color: 'var(--lg-evergreen)' }}>
                READ-ONLY
              </span>
            ) : null}
          </button>
        </header>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
        <div className="relative flex min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <LiveChat state={state} showTools={showTools} />
          </div>
          {heroPhase !== 'gone' ? (
            <LiveHero
              leaving={heroPhase === 'out'}
              scenarioTitle={definition.title}
              toolCount={state.toolNames.length || definition.tools?.length || 0}
            />
          ) : null}
          <SparkComposer
            text={typed}
            typing={typing}
            busy={busy}
            settling={settlement.polling}
            hint={hint}
          />
        </div>

        <LiveLedger
          state={state}
          settlement={settlement}
          settleAfterMs={settleAfterMs}
          onPay={openPayLink}
          pending={typed}
        />
      </div>

      <ScopePanel
        open={scopeOpen}
        onClose={() => setScopeOpen(false)}
        toolNames={state.toolNames.length ? state.toolNames : (definition.tools ?? [])}
        toolCatalogSize={state.toolCatalogSize || 40}
        scenarioTitle={definition.title}
      />
    </main>
  );
}
