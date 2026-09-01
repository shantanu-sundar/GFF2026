import type { Framework, LedgerEntity, RunEvent, ScenarioId } from './events';

/* ------------------------------------------------------------------ */
/* View model. RunEvent[] folded into something a component can render. */
/* ------------------------------------------------------------------ */

export type RunStatus =
  | 'idle'
  | 'connecting'
  /** A turn is streaming. */
  | 'running'
  /** Parked between turns, waiting on the operator or auto-advance. */
  | 'awaiting'
  | 'completed'
  | 'error';
export type RunMode = 'live' | 'mock';

export interface UserItem {
  kind: 'user';
  id: string;
  turnIndex: number;
  prompt: string;
  ts: number;
}

export interface AssistantItem {
  kind: 'assistant';
  id: string;
  messageId: string;
  text: string;
  streaming: boolean;
  ts: number;
}

export type ToolStatus = 'running' | 'ok' | 'failed' | 'blocked';

export interface ToolItem {
  kind: 'tool';
  id: string;
  callId: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  result?: unknown;
  summary?: string;
  durationMs?: number;
  reason?: string;
  ts: number;
}

export type StreamItem = UserItem | AssistantItem | ToolItem;

export interface EntityCard extends LedgerEntity {
  /** kind + id — stable across updates so the card animates instead of remounting. */
  key: string;
  firstSeen: number;
  updatedAt: number;
  /** Bumped whenever status changes, so the pill can flash. */
  revision: number;
  previousStatus?: string;
}

export interface RunState {
  status: RunStatus;
  mode: RunMode;
  runId?: string;
  scenario?: ScenarioId;
  framework?: Framework;
  model?: string;
  toolNames: string[];
  toolCatalogSize: number;
  items: StreamItem[];
  entities: EntityCard[];
  /** Turn currently streaming, or -1. */
  activeTurn: number;
  /** Last turn index we asked the server for. One request == one turn. */
  requestedTurn: number;
  completedTurns: number;
  toolCalls: number;
  totalMs?: number;
  startedAt?: number;
  lastEventAt?: number;
  error?: { message: string; detail?: string };
}

export const initialRunState: RunState = {
  status: 'idle',
  mode: 'live',
  toolNames: [],
  toolCatalogSize: 0,
  items: [],
  entities: [],
  activeTurn: -1,
  requestedTurn: 0,
  completedTurns: 0,
  toolCalls: 0,
};

export function freshRunState(mode: RunMode, scenario: ScenarioId): RunState {
  return { ...initialRunState, mode, scenario, status: 'connecting' };
}

/* ------------------------------------------------------------------ */
/* Reducer                                                              */
/* ------------------------------------------------------------------ */

function replaceTool(
  items: StreamItem[],
  callId: string,
  patch: (tool: ToolItem) => ToolItem,
): StreamItem[] | null {
  const index = items.findIndex(
    (item) => item.kind === 'tool' && item.callId === callId,
  );
  if (index === -1) return null;
  const next = items.slice();
  next[index] = patch(next[index] as ToolItem);
  return next;
}

function upsertEntity(
  entities: EntityCard[],
  entity: LedgerEntity,
  ts: number,
): EntityCard[] {
  const key = `${entity.kind}:${entity.id}`;
  const index = entities.findIndex((e) => e.key === key);
  if (index === -1) {
    return [
      ...entities,
      { ...entity, key, firstSeen: ts, updatedAt: ts, revision: 0 },
    ];
  }
  const prev = entities[index];
  const changed = prev.status !== entity.status;
  const next = entities.slice();
  next[index] = {
    ...prev,
    ...entity,
    key,
    firstSeen: prev.firstSeen,
    updatedAt: ts,
    revision: changed ? prev.revision + 1 : prev.revision,
    previousStatus: changed ? prev.status : prev.previousStatus,
  };
  return next;
}

export function reduceRun(state: RunState, event: RunEvent): RunState {
  const base = { ...state, lastEventAt: event.ts };

  switch (event.type) {
    case 'run_started':
      return {
        ...base,
        status: 'running',
        runId: event.runId,
        scenario: event.scenario,
        framework: event.framework,
        model: event.model,
        toolNames: event.toolNames,
        toolCatalogSize: event.toolCatalogSize,
        items: [],
        entities: [],
        activeTurn: -1,
        requestedTurn: 0,
        completedTurns: 0,
        toolCalls: 0,
        totalMs: undefined,
        startedAt: event.ts,
        error: undefined,
      };

    case 'turn_started':
      return {
        ...base,
        status: 'running',
        activeTurn: event.turnIndex,
        items: [
          ...base.items,
          {
            kind: 'user',
            id: `turn-${event.turnIndex}`,
            turnIndex: event.turnIndex,
            prompt: event.prompt,
            ts: event.ts,
          },
        ],
      };

    case 'agent_text_delta': {
      const index = base.items.findIndex(
        (item) => item.kind === 'assistant' && item.messageId === event.messageId,
      );
      if (index === -1) {
        return {
          ...base,
          items: [
            ...base.items,
            {
              kind: 'assistant',
              id: `msg-${event.messageId}`,
              messageId: event.messageId,
              text: event.delta,
              streaming: true,
              ts: event.ts,
            },
          ],
        };
      }
      const items = base.items.slice();
      const current = items[index] as AssistantItem;
      items[index] = { ...current, text: current.text + event.delta };
      return { ...base, items };
    }

    case 'agent_message': {
      const index = base.items.findIndex(
        (item) => item.kind === 'assistant' && item.messageId === event.messageId,
      );
      if (index === -1) {
        return {
          ...base,
          items: [
            ...base.items,
            {
              kind: 'assistant',
              id: `msg-${event.messageId}`,
              messageId: event.messageId,
              text: event.text,
              streaming: false,
              ts: event.ts,
            },
          ],
        };
      }
      const items = base.items.slice();
      const current = items[index] as AssistantItem;
      items[index] = { ...current, text: event.text, streaming: false };
      return { ...base, items };
    }

    case 'tool_call':
      return {
        ...base,
        toolCalls: base.toolCalls + 1,
        items: [
          ...base.items,
          {
            kind: 'tool',
            id: `call-${event.callId}`,
            callId: event.callId,
            name: event.name,
            args: event.args,
            status: 'running',
            ts: event.ts,
          },
        ],
      };

    case 'tool_result': {
      const patched = replaceTool(base.items, event.callId, (tool) => ({
        ...tool,
        status: event.ok ? 'ok' : 'failed',
        result: event.result,
        summary: event.summary,
        durationMs: event.durationMs,
      }));
      if (patched) return { ...base, items: patched };
      // A result with no preceding call still deserves a finished card.
      return {
        ...base,
        toolCalls: base.toolCalls + 1,
        items: [
          ...base.items,
          {
            kind: 'tool',
            id: `call-${event.callId}`,
            callId: event.callId,
            name: event.name,
            args: {},
            status: event.ok ? 'ok' : 'failed',
            result: event.result,
            summary: event.summary,
            durationMs: event.durationMs,
            ts: event.ts,
          },
        ],
      };
    }

    case 'tool_blocked': {
      const patched = replaceTool(base.items, event.callId, (tool) => ({
        ...tool,
        status: 'blocked',
        reason: event.reason,
      }));
      if (patched) return { ...base, items: patched };
      return {
        ...base,
        items: [
          ...base.items,
          {
            kind: 'tool',
            id: `call-${event.callId}`,
            callId: event.callId,
            name: event.name,
            args: {},
            status: 'blocked',
            reason: event.reason,
            ts: event.ts,
          },
        ],
      };
    }

    case 'entity':
      return {
        ...base,
        entities: upsertEntity(base.entities, event.entity, event.ts),
      };

    case 'turn_completed':
      return { ...base, completedTurns: base.completedTurns + 1 };

    case 'run_completed':
      return {
        ...base,
        status: 'completed',
        runId: event.runId,
        toolCalls: event.toolCalls,
        totalMs: event.totalMs,
        activeTurn: -1,
      };

    case 'error':
      return {
        ...base,
        status: 'error',
        activeTurn: -1,
        error: { message: event.message, detail: event.detail },
      };
  }
}
