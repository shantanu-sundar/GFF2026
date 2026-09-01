import { NextRequest } from 'next/server';

import { encodeEvent, SSE_DONE, type Framework, type RunEvent, type ScenarioId } from '@/lib/events';
import { SCENARIOS, resolvePrompt, type RunContext } from '@/lib/scenarios';
import { getAdapter } from '@/lib/adapters';
import { toolCatalogSize } from '@/lib/cashfree';

/**
 * The Agents SDK needs `node:async_hooks`, `node:crypto` and `node:stream/web`.
 * On the Edge runtime it resolves the `edge-light` condition, lands on the Node
 * shim anyway and fails at import time — so this route is Node-only.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Session {
  history: unknown[];
  context: RunContext;
  toolCalls: number;
  startedAt: number;
  turns: number;
}

/**
 * In-memory, single-process session store. History stays on the server so raw
 * payloads (notably payment_session_id) never reach the browser — the client
 * only ever sees redacted RunEvents.
 */
const sessions = new Map<string, Session>();

interface RunRequest {
  scenario: ScenarioId;
  framework: Framework;
  /** Which turn of the scenario to run. Omit or 0 to start a new run. */
  turnIndex?: number;
  /** Required for turnIndex > 0. Returned in the run_started event. */
  runId?: string;
  /** Ids carried over from an earlier scenario, e.g. the order to investigate. */
  context?: RunContext;
}

export async function POST(req: NextRequest) {
  let body: RunRequest;
  try {
    body = (await req.json()) as RunRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const scenario = SCENARIOS[body.scenario];
  if (!scenario) {
    return Response.json({ error: `Unknown scenario: ${body.scenario}` }, { status: 400 });
  }

  const turnIndex = body.turnIndex ?? 0;
  const turn = scenario.turns[turnIndex];
  if (!turn) {
    return Response.json({ error: `Turn ${turnIndex} out of range` }, { status: 400 });
  }

  const framework = body.framework ?? 'openai';
  const model = process.env.OPENAI_MODEL || 'gpt-4.1';
  const runId = turnIndex === 0 ? `run_${Date.now()}` : body.runId;
  if (!runId) {
    return Response.json({ error: 'runId required for turnIndex > 0' }, { status: 400 });
  }

  if (turnIndex === 0) {
    sessions.set(runId, {
      history: [],
      context: body.context ?? {},
      toolCalls: 0,
      startedAt: Date.now(),
      turns: 0,
    });
  }
  const session = sessions.get(runId);
  if (!session) {
    return Response.json({ error: 'Unknown runId — start a new run' }, { status: 409 });
  }
  if (body.context) session.context = { ...session.context, ...body.context };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: RunEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeEvent(event)));
      };

      try {
        const adapter = await getAdapter(framework);
        const toolNames = adapter.resolveToolNames(scenario.tools);

        if (turnIndex === 0) {
          send({
            type: 'run_started',
            runId,
            scenario: scenario.id,
            framework,
            model,
            toolNames,
            toolCatalogSize: toolCatalogSize(),
            turnsTotal: scenario.turns.length,
            ts: Date.now(),
          });
        }

        const prompt = resolvePrompt(turn, session.context);
        send({ type: 'turn_started', turnIndex, prompt, ts: Date.now() });

        const result = await adapter.runTurn({
          instructions: scenario.instructions,
          model,
          toolNames: scenario.tools,
          history: session.history,
          prompt,
          emit: (event) => {
            if (event.type === 'tool_call') session.toolCalls += 1;
            // Learn ids as they appear so later scenarios can reference them.
            if (event.type === 'entity') {
              if (event.entity.kind === 'order') session.context.orderId = event.entity.id;
              if (event.entity.kind === 'customer') session.context.customerId = event.entity.id;
            }
            send(event);
          },
        });

        session.history = result.history;
        session.turns = turnIndex + 1;

        send({ type: 'turn_completed', turnIndex, ts: Date.now() });

        const isLast = turnIndex === scenario.turns.length - 1;
        if (isLast) {
          send({
            type: 'run_completed',
            runId,
            turns: session.turns,
            toolCalls: session.toolCalls,
            totalMs: Date.now() - session.startedAt,
            ts: Date.now(),
          });
        }
      } catch (err) {
        const e = err as Error;
        send({
          type: 'error',
          message: e.message || 'Agent run failed',
          detail: e.stack?.split('\n').slice(0, 4).join('\n'),
          ts: Date.now(),
        });
      } finally {
        controller.enqueue(encoder.encode(`data: ${SSE_DONE}\n\n`));
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
