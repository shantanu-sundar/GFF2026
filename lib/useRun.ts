'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  decodeEvent,
  type Framework,
  type LedgerEntity,
  type RunEvent,
  type ScenarioId,
} from './events';
import { SCENARIOS } from './scenarios';
import { buildMockRun, type MockFrame } from './mock-run';
import {
  freshRunState,
  initialRunState,
  reduceRun,
  type RunMode,
  type RunState,
} from './runState';

type Action =
  | { type: 'event'; event: RunEvent }
  | { type: 'start'; mode: RunMode; scenario: ScenarioId }
  | { type: 'begin-turn'; turnIndex: number }
  | { type: 'turn-ended' }
  | { type: 'halt' }
  | { type: 'clear' };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'event':
      return reduceRun(state, action.event);
    case 'start':
      return freshRunState(action.mode, action.scenario);
    case 'begin-turn':
      return { ...state, status: 'connecting', requestedTurn: action.turnIndex };
    case 'turn-ended':
      // run_completed / error already settled the run; otherwise we are simply
      // between turns, waiting on the operator (or auto-advance).
      if (state.status !== 'running' && state.status !== 'connecting') return state;
      return { ...state, status: 'awaiting', activeTurn: -1 };
    case 'halt':
      if (state.status !== 'running' && state.status !== 'connecting') return state;
      return {
        ...state,
        status: state.items.length ? 'awaiting' : 'idle',
        activeTurn: -1,
      };
    case 'clear':
      return initialRunState;
  }
}

/**
 * Pull the `data:` payload out of one SSE frame. Comment lines (`:` keep-alives)
 * and non-data fields are ignored; multi-line data is rejoined with newlines,
 * per the EventSource spec.
 */
function frameToData(frame: string): string | null {
  const parts: string[] = [];
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('data:')) {
      const value = line.slice(5);
      parts.push(value.startsWith(' ') ? value.slice(1) : value);
    }
  }
  return parts.length ? parts.join('\n') : null;
}

/** Split a scripted run at `turn_started` boundaries so mock advances turn by turn. */
function segmentByTurn(frames: MockFrame[]): MockFrame[][] {
  const segments: MockFrame[][] = [];
  let current: MockFrame[] = [];
  let sawTurn = false;
  for (const frame of frames) {
    if (frame.event.type === 'turn_started') {
      if (sawTurn) {
        segments.push(current);
        current = [];
      }
      sawTurn = true;
    }
    current.push(frame);
  }
  if (current.length) segments.push(current);
  return segments;
}

interface Session {
  scenario: ScenarioId;
  framework: Framework;
  mock: boolean;
  runId?: string;
  turnIndex: number;
  segments: MockFrame[][];
  context: { customerId?: string; orderId?: string };
}

export interface StartOptions {
  scenario: ScenarioId;
  framework: Framework;
  /** Replay the scripted run instead of hitting /api/run. */
  mock: boolean;
}

export interface UseRun {
  state: RunState;
  /** A turn is streaming right now. */
  busy: boolean;
  /** The run is parked between turns and there is another turn to fire. */
  hasNext: boolean;
  turnsTotal: number;
  start: (options: StartOptions) => void;
  next: () => void;
  stop: () => void;
  clear: () => void;
  /** Fold entities discovered outside the stream (e.g. the settlement poller). */
  applyEntities: (entities: LedgerEntity[]) => void;
}

export function useRun(): UseRun {
  const [state, dispatch] = useReducer(reducer, initialRunState);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<Session | null>(null);
  /** Bumped on every start/stop; stale async work checks it and bails. */
  const tokenRef = useRef(0);

  const cancel = useCallback(() => {
    tokenRef.current += 1;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  /** Every event goes through here so the session refs stay in step with state. */
  const applyEvent = useCallback((event: RunEvent) => {
    const session = sessionRef.current;
    if (session) {
      if (event.type === 'run_started') session.runId = event.runId;
      if (event.type === 'entity') {
        if (event.entity.kind === 'order') session.context.orderId = event.entity.id;
        if (event.entity.kind === 'customer') {
          session.context.customerId = event.entity.id;
        }
      }
    }
    dispatch({ type: 'event', event });
  }, []);

  /* ---------------- mock ---------------- */

  const playSegment = useCallback(
    (token: number, frames: MockFrame[]) => {
      if (!frames.length) {
        dispatch({ type: 'turn-ended' });
        return;
      }
      let index = 0;
      const tick = () => {
        if (tokenRef.current !== token) return;
        applyEvent(frames[index].event);
        index += 1;
        if (index < frames.length) {
          timerRef.current = setTimeout(tick, frames[index].delay);
        } else {
          timerRef.current = null;
          dispatch({ type: 'turn-ended' });
        }
      };
      timerRef.current = setTimeout(tick, frames[0].delay);
    },
    [applyEvent],
  );

  /* ---------------- live ---------------- */

  const streamTurn = useCallback(
    async (token: number, session: Session, turnIndex: number) => {
      const controller = new AbortController();
      abortRef.current = controller;

      const emit = (frame: string): boolean => {
        const data = frameToData(frame);
        if (data === null) return true;
        let event: RunEvent | null;
        try {
          event = decodeEvent(data);
        } catch {
          // A malformed frame is not worth killing the run over.
          return true;
        }
        if (event === null) return false; // SSE_DONE
        if (tokenRef.current !== token) return false;
        applyEvent(event);
        return true;
      };

      const body: Record<string, unknown> = {
        scenario: session.scenario,
        framework: session.framework,
        turnIndex,
      };
      if (turnIndex > 0 && session.runId) body.runId = session.runId;
      if (session.context.customerId || session.context.orderId) {
        body.context = { ...session.context };
      }

      try {
        const response = await fetch('/api/run', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'text/event-stream',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!response.ok || !response.body) {
          let detail = `POST /api/run responded ${response.status}`;
          try {
            const payload = (await response.json()) as { error?: string };
            if (payload?.error) detail += ` — ${payload.error}`;
          } catch {
            /* body was not JSON */
          }
          throw new Error(detail);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let open = true;

        while (open) {
          const { done, value } = await reader.read();
          if (tokenRef.current !== token) {
            await reader.cancel().catch(() => {});
            return;
          }
          if (done) break;

          // Chunks split anywhere, including mid-frame and mid-UTF8.
          buffer = (buffer + decoder.decode(value, { stream: true })).replace(
            /\r\n/g,
            '\n',
          );

          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (!emit(frame)) {
              open = false;
              break;
            }
            boundary = buffer.indexOf('\n\n');
          }
        }

        if (open) {
          const tail = (buffer + decoder.decode()).replace(/\r\n/g, '\n').trim();
          if (tail) emit(tail);
        }

        await reader.cancel().catch(() => {});
        if (tokenRef.current === token) dispatch({ type: 'turn-ended' });
      } catch (error) {
        if (tokenRef.current !== token) return;
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : 'Stream failed';
        applyEvent({
          type: 'error',
          message: 'Could not reach the agent runtime.',
          detail: message,
          ts: Date.now(),
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [applyEvent],
  );

  /* ---------------- controls ---------------- */

  const start = useCallback(
    ({ scenario, framework, mock }: StartOptions) => {
      cancel();
      const token = tokenRef.current;
      const session: Session = {
        scenario,
        framework,
        mock,
        turnIndex: 0,
        segments: mock ? segmentByTurn(buildMockRun(scenario, framework)) : [],
        context: {},
      };
      sessionRef.current = session;
      dispatch({ type: 'start', mode: mock ? 'mock' : 'live', scenario });
      if (mock) {
        playSegment(token, session.segments[0] ?? []);
      } else {
        void streamTurn(token, session, 0);
      }
    },
    [cancel, playSegment, streamTurn],
  );

  const next = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    cancel();
    const token = tokenRef.current;
    const turnIndex = session.turnIndex + 1;
    session.turnIndex = turnIndex;
    dispatch({ type: 'begin-turn', turnIndex });
    if (session.mock) {
      playSegment(token, session.segments[turnIndex] ?? []);
    } else {
      void streamTurn(token, session, turnIndex);
    }
  }, [cancel, playSegment, streamTurn]);

  const stop = useCallback(() => {
    cancel();
    dispatch({ type: 'halt' });
  }, [cancel]);

  const clear = useCallback(() => {
    cancel();
    sessionRef.current = null;
    dispatch({ type: 'clear' });
  }, [cancel]);

  const applyEntities = useCallback(
    (entities: LedgerEntity[]) => {
      const ts = Date.now();
      for (const entity of entities) {
        applyEvent({ type: 'entity', entity, ts });
      }
    },
    [applyEvent],
  );

  const turnsTotal = state.scenario ? SCENARIOS[state.scenario].turns.length : 0;
  const busy = state.status === 'running' || state.status === 'connecting';
  const hasNext =
    state.status === 'awaiting' && state.requestedTurn + 1 < turnsTotal;

  return useMemo(
    () => ({
      state,
      busy,
      hasNext,
      turnsTotal,
      start,
      next,
      stop,
      clear,
      applyEntities,
    }),
    [state, busy, hasNext, turnsTotal, start, next, stop, clear, applyEntities],
  );
}
