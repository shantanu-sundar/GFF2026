/**
 * The wire protocol between the server-side agent runtime and the console UI.
 *
 * One agent run = one ordered stream of RunEvent, delivered over SSE as
 * `data: <json>\n\n`. Every event carries `ts` (epoch ms) so the UI can render
 * a real timeline, and every tool call/result pair shares a `callId` so the UI
 * can match a result back to the card it already rendered.
 *
 * This file is the single source of truth. Server emits it, client narrows on
 * it. Do not widen `any` into it.
 */

export type Framework = 'openai' | 'langchain' | 'ai-sdk';

export type ScenarioId = 'lifecycle' | 'scoped' | 'reconciliation';

/** Entities we lift out of tool results so the UI can show a live money ledger. */
export type EntityKind = 'customer' | 'order' | 'payment' | 'refund';

export interface LedgerEntity {
  kind: EntityKind;
  /** cust_… / order id / cf_payment_id / refund_id */
  id: string;
  label: string;
  /** Rupees, not paise. Undefined for customers. */
  amount?: number;
  status?: string;
  /** Raw fields worth showing in the expanded card. May be absent. */
  data?: Record<string, unknown>;
}

export type RunEvent =
  /** Run opened. Always the first event. */
  | {
      type: 'run_started';
      runId: string;
      scenario: ScenarioId;
      framework: Framework;
      model: string;
      /** Names of the tools this agent was actually given — drives the scoping panel. */
      toolNames: string[];
      /** Total tools available in the toolkit, for the "5 of 40" framing. */
      toolCatalogSize: number;
      /** How many turns this scenario has, so the client knows when a run is over. */
      turnsTotal: number;
      ts: number;
    }
  /** A turn of the scripted conversation begins. */
  | { type: 'turn_started'; turnIndex: number; prompt: string; ts: number }
  /** Assistant token delta. UI appends to the open message bubble. */
  | { type: 'agent_text_delta'; messageId: string; delta: string; ts: number }
  /** Assistant message finalised. */
  | { type: 'agent_message'; messageId: string; text: string; ts: number }
  /** Model decided to call a tool. Emitted the moment the call is seen. */
  | {
      type: 'tool_call';
      callId: string;
      name: string;
      args: Record<string, unknown>;
      ts: number;
    }
  /** Tool returned. `callId` matches the preceding tool_call. */
  | {
      type: 'tool_result';
      callId: string;
      name: string;
      ok: boolean;
      /** Parsed JSON when the tool returned JSON, else the raw string. */
      result: unknown;
      /** Short human line for the collapsed card, e.g. "order_Xk9 · ₹500 · PAID". */
      summary: string;
      durationMs: number;
      ts: number;
    }
  /**
   * The agent tried to do something it has no tool for, or a guard refused it.
   * This is the safety beat — the UI renders it in red and it is NOT an error.
   */
  | {
      type: 'tool_blocked';
      callId: string;
      name: string;
      reason: string;
      ts: number;
    }
  /** An entity appeared or changed. Drives the ledger panel. */
  | { type: 'entity'; entity: LedgerEntity; ts: number }
  | { type: 'turn_completed'; turnIndex: number; ts: number }
  | {
      type: 'run_completed';
      runId: string;
      turns: number;
      toolCalls: number;
      totalMs: number;
      ts: number;
    }
  /** Fatal. The run is over. */
  | { type: 'error'; message: string; detail?: string; ts: number };

export type RunEventType = RunEvent['type'];

/** Narrowing helper: `isEvent(e, 'tool_call')` gives you the exact member. */
export function isEvent<T extends RunEventType>(
  event: RunEvent,
  type: T,
): event is Extract<RunEvent, { type: T }> {
  return event.type === type;
}

export const SSE_DONE = '[DONE]';

/** Server side: format one event as an SSE frame. */
export function encodeEvent(event: RunEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Client side: parse one SSE `data:` payload. Returns null for the DONE sentinel. */
export function decodeEvent(data: string): RunEvent | null {
  if (data === SSE_DONE) return null;
  return JSON.parse(data) as RunEvent;
}
