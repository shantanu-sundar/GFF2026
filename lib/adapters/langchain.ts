import { createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  isAIMessage,
  isToolMessage,
  type AIMessage,
  type AIMessageChunk,
  type BaseMessage,
  type ToolMessage,
} from '@langchain/core/messages';
import {
  CashfreeAgentToolkit,
  CFEnvironment,
} from '@cashfreepayments/agent-toolkit/langchain';

import { interpretResult, redact } from '../ledger';
import type { RunEvent } from '../events';
import type { FrameworkAdapter, RunTurnOptions, RunTurnResult } from './types';

/**
 * LangChain has no `setTracingDisabled()`. Tracing is opt-in via four env vars,
 * any one of which set to the literal string "true" makes LangSmith POST every
 * prompt, tool input and tool output to api.smith.langchain.com (verified in
 * @langchain/core/dist/utils/callbacks.js). Those payloads carry customer phone
 * numbers, order ids and refund amounts, so rather than trusting them to be
 * unset we pin all four to "false". This is the LangChain equivalent of
 * `setTracingDisabled(true)` in openai.ts and must stay off.
 */
for (const key of [
  'LANGSMITH_TRACING_V2',
  'LANGCHAIN_TRACING_V2',
  'LANGSMITH_TRACING',
  'LANGCHAIN_TRACING',
]) {
  process.env[key] = 'false';
}

/**
 * `lib/cashfree.ts` builds the /openai toolkit, whose tools are `@openai/agents`
 * tool objects — useless to LangChain. The /langchain subpath exports a class
 * with the SAME name but a different shape: `getTools()` returns an ARRAY of
 * CashfreeTool (a StructuredTool subclass) and the by-name map is `toolsMap`,
 * not `tools`. Hence a second cached instance rather than a shared one.
 */
let cached: CashfreeAgentToolkit | null = null;

function getToolkit(): CashfreeAgentToolkit {
  if (cached) return cached;

  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET missing. Copy .env.example to .env.local.',
    );
  }

  const environment =
    process.env.CASHFREE_ENV === 'PRODUCTION'
      ? CFEnvironment.PRODUCTION
      : CFEnvironment.SANDBOX;

  cached = new CashfreeAgentToolkit(environment, clientId, clientSecret);
  return cached;
}

/** Structural scoping, same as openai.ts: the agent is built with a subset and never sees the rest. */
function selectTools(names: string[] | null): { name: string }[] {
  const tk = getToolkit();
  if (names === null) return tk.getTools() as { name: string }[];

  return names.map((name) => {
    const t = tk.toolsMap[name as keyof typeof tk.toolsMap];
    if (!t) throw new Error(`Unknown Cashfree tool: ${name}`);
    return t as { name: string };
  });
}

const now = () => Date.now();

export const langchainAdapter: FrameworkAdapter = {
  id: 'langchain',
  label: 'LangChain',

  resolveToolNames(toolNames) {
    return (
      toolNames ?? (getToolkit().getTools() as { name: string }[]).map((t) => t.name)
    );
  },

  async runTurn({
    instructions,
    model,
    toolNames,
    history,
    prompt,
    emit,
  }: RunTurnOptions): Promise<RunTurnResult> {
    const agent = createAgent({
      // Passing `model` as a string routes through initChatModel, which leaves
      // nowhere to pin temperature. An explicit ChatOpenAI does.
      //
      // Deliberately NOT `supportsStrictToolCalling: true`. LangChain sets
      // OpenAI's strict flag without rewriting the schema to suit it, and the
      // toolkit's schemas are not strict-compatible: `createOrder.order_currency`
      // carries a zod .default(), so it lands outside `required` and OpenAI 400s
      // the whole request. Verified with convertToOpenAITool in
      // _probe/schema-strict.mjs. The nullable-but-required fields
      // (return_url, order_note) still appear in `required`, so the model is
      // told to send explicit nulls — it is just not forced to.
      model: new ChatOpenAI({ model, temperature: 0, streaming: true }),
      tools: selectTools(toolNames),
      // createAgent prepends this at model-call time; it never lands in the
      // message state, so `history` stays free of it across turns.
      systemPrompt: instructions,
    });

    const priorHistory = history as BaseMessage[];
    const input: BaseMessage[] = [...priorHistory, new HumanMessage(prompt)];

    /**
     * streamEvents v2 is the flat, ordered event stream. The v3 `AgentRunStream`
     * hands over tool call ids more directly but splits the run into parallel
     * async iterables (run.messages, run.toolCalls) with no single ordering
     * between them — and the SSE contract is one ordered stream.
     */
    const stream = agent.streamEvents(
      { messages: input },
      {
        version: 'v2',
        // LangGraph counts graph steps, not agent turns: one turn is a model
        // node plus a tools node. The default 25 is ~12 turns, so this is
        // maxTurns: 30 in the OpenAI adapter's sense, with headroom.
        recursionLimit: 100,
      },
    );

    const pending = new Map<string, { name: string; at: number }>();
    let messageId = `msg_${now()}`;
    let finalText = '';

    /**
     * streamEvents does not hand back the final agent state, so the updated
     * history is rebuilt from the stream. This is exactly what LangGraph's
     * `messages` channel accumulates — the model's AIMessage followed by the
     * ToolNode's ToolMessages, in emission order — because this agent runs
     * with no middleware that could rewrite state.
     */
    const produced: BaseMessage[] = [];

    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream') {
        const chunk = event.data.chunk as AIMessageChunk | undefined;
        const delta = chunk?.text ?? '';
        // Tool-argument tokens arrive as tool_call_chunks with empty text;
        // emitting those would spray JSON fragments into the message bubble.
        if (delta) {
          emit({ type: 'agent_text_delta', messageId, delta, ts: now() });
        }
        continue;
      }

      if (event.event === 'on_chat_model_end') {
        const output = event.data.output as BaseMessage | undefined;
        if (!output || !isAIMessage(output)) continue;
        const message = output as AIMessage;

        const text = message.text;
        if (text) {
          emit({ type: 'agent_message', messageId, text, ts: now() });
          finalText = text;
          messageId = `msg_${now()}`;
        }

        for (const call of message.tool_calls ?? []) {
          // `call.id` is the provider's real call id. LangChain's on_tool_start
          // carries no tool_call_id, so this is the only point at which a call
          // can be keyed; durationMs therefore includes the ToolNode dispatch
          // hop, which is sub-millisecond next to a Cashfree round trip.
          const callId = call.id ?? `call_${now()}_${call.name}`;
          pending.set(callId, { name: call.name, at: now() });

          emit({
            type: 'tool_call',
            callId,
            name: call.name,
            args: redact(call.args ?? {}),
            ts: now(),
          });
        }

        produced.push(message);
        continue;
      }

      if (event.event === 'on_tool_end') {
        const output = event.data.output as unknown;
        const toolMessage =
          output && typeof output === 'object' && isToolMessage(output as BaseMessage)
            ? (output as ToolMessage)
            : null;

        const callId = toolMessage?.tool_call_id ?? '';
        const rec = pending.get(callId);
        pending.delete(callId);

        const name = rec?.name ?? toolMessage?.name ?? event.name;
        const durationMs = rec ? now() - rec.at : 0;

        // CashfreeTool._call JSON-stringifies its result, so this is the same
        // raw string openai.ts feeds in. `ok` comes from interpretResult, never
        // from the absence of a throw — these tools resolve a failed API call
        // to {error, details:{code}} and would otherwise show a green tick.
        const interpreted = interpretResult(name, toolMessage ? toolMessage.text : output);

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

        if (toolMessage) produced.push(toolMessage);
        continue;
      }

      if (event.event === 'on_tool_error') {
        /**
         * NOT the Cashfree failure path — API errors resolve to a payload and
         * leave through on_tool_end above. This fires only when LangChain
         * itself throws before the call happens (ToolInputParsingException on a
         * zod mismatch), which the OpenAI Agents SDK instead turns into a tool
         * output string. Without this branch the tool card would hang open for
         * the rest of the take, so `ok: false` here genuinely does come from a
         * thrown exception rather than from reading a result.
         */
        const message = String(event.data.error ?? 'Tool call failed');
        let callId = '';
        for (const [id, rec] of pending) {
          if (rec.name === event.name) {
            callId = id;
            break;
          }
        }
        const rec = pending.get(callId);
        pending.delete(callId);

        emit({
          type: 'tool_result',
          callId,
          name: rec?.name ?? event.name,
          ok: false,
          result: { error: message },
          summary: `tool_error · ${message}`.slice(0, 160),
          durationMs: rec ? now() - rec.at : 0,
          ts: now(),
        });
      }
    }

    return {
      history: [...input, ...produced] as unknown[],
      finalText,
    };
  },
};

export type { RunEvent };
