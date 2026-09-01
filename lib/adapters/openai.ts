import {
  Agent,
  run,
  setTracingDisabled,
  type AgentInputItem,
  type RunStreamEvent,
  type protocol,
} from '@openai/agents';

import { getToolkit, selectTools } from '../cashfree';
import { interpretResult, redact } from '../ledger';
import type { RunEvent } from '../events';
import type { FrameworkAdapter, RunTurnOptions, RunTurnResult } from './types';

/**
 * Tracing is enabled by default and POSTs tool inputs AND outputs to
 * api.openai.com/v1/traces/ingest. These tool payloads carry customer phone
 * numbers, order ids and refund amounts, so this is switched off deliberately
 * and must stay off.
 */
setTracingDisabled(true);

/**
 * The shipped .d.ts was generated against zod 3, but the installed zod is 4,
 * whose ZodDiscriminatedUnion has the opposite generic order. That collapses
 * `protocol.ToolCallItem` to `{}`, so `rawItem` needs a local union to read
 * `.name` / `.arguments` / `.callId`. The individually-inferred item types are
 * unaffected, which is why this shim works.
 */
type AnyToolCall = protocol.FunctionCallItem | protocol.HostedToolCallItem;
type AnyToolResult = protocol.FunctionCallResultItem;
type AssistantPart = { type: 'output_text'; text: string } | { type: string };

const now = () => Date.now();

export const openaiAdapter: FrameworkAdapter = {
  id: 'openai',
  label: 'OpenAI Agents SDK',

  resolveToolNames(toolNames) {
    return toolNames ?? getToolkit().getAgentTools().map((t: { name: string }) => t.name);
  },

  async runTurn({
    instructions,
    model,
    toolNames,
    history,
    prompt,
    emit,
  }: RunTurnOptions): Promise<RunTurnResult> {
    const agent = new Agent({
      name: 'Merchant Support Agent',
      instructions,
      model,
      tools: selectTools(toolNames),
      // Pinned so the same prompts pick the same tools across takes.
      modelSettings: { temperature: 0 },
    });

    const priorHistory = history as AgentInputItem[];
    const input: AgentInputItem[] = [
      ...priorHistory,
      { role: 'user', content: prompt },
    ];

    const result = await run(agent, input, {
      stream: true,
      // Default is 10. The lifecycle beat can spend several turns confirming
      // payment, and hitting the cap mid-demo would look like a crash.
      maxTurns: 30,
    });

    const pending = new Map<string, { name: string; at: number }>();
    let messageId = `msg_${now()}`;

    for await (const event of result as AsyncIterable<RunStreamEvent>) {
      if (event.type === 'raw_model_stream_event') {
        // Only 'output_text_delta'. Every raw provider event is ALSO re-emitted
        // as type 'model', so handling both double-renders every token.
        if (event.data.type === 'output_text_delta') {
          emit({
            type: 'agent_text_delta',
            messageId,
            delta: event.data.delta,
            ts: now(),
          });
        }
        continue;
      }

      if (event.type !== 'run_item_stream_event') continue;
      const item = event.item;

      if (item.type === 'tool_call_item') {
        const raw = item.rawItem as AnyToolCall;
        if (raw.type !== 'function_call') continue;
        pending.set(raw.callId, { name: raw.name, at: now() });

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(raw.arguments) as Record<string, unknown>;
        } catch {
          args = { _raw: raw.arguments };
        }

        emit({
          type: 'tool_call',
          callId: raw.callId,
          name: raw.name,
          args: redact(args),
          ts: now(),
        });
        continue;
      }

      if (item.type === 'tool_call_output_item') {
        const raw = item.rawItem as AnyToolResult;
        const callId = raw.callId ?? '';
        const rec = pending.get(callId);
        pending.delete(callId);

        const name = rec?.name ?? 'unknown';
        // tool_called fires before execution and tool_output after, so this is
        // genuine tool latency, not a render artefact.
        const durationMs = rec ? now() - rec.at : 0;
        const interpreted = interpretResult(name, item.output);

        emit({
          type: 'tool_result',
          callId,
          name,
          ok: interpreted.ok,
          result: interpreted.value,
          summary: interpreted.summary,
          durationMs,
          ts: now(),
        });

        for (const entity of interpreted.entities) {
          emit({ type: 'entity', entity, ts: now() });
        }
        continue;
      }

      if (item.type === 'message_output_item') {
        const parts = (item.rawItem.content ?? []) as AssistantPart[];
        const text = parts
          .filter((p): p is { type: 'output_text'; text: string } => p.type === 'output_text')
          .map((p) => p.text)
          .join('');
        emit({ type: 'agent_message', messageId, text, ts: now() });
        messageId = `msg_${now()}`;
      }
    }

    await result.completed;

    return {
      // `result.history` is the JS equivalent of the Python SDK's
      // toInputList() — which does not exist here. Only valid post-completion.
      history: result.history as unknown[],
      finalText: String(result.finalOutput ?? ''),
    };
  },
};

export type { RunEvent };
