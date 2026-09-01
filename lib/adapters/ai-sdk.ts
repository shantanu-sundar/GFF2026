import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText, type ModelMessage, type ToolSet } from 'ai';
import {
  CashfreeAISDKToolkit,
  CFEnvironment,
} from '@cashfreepayments/agent-toolkit/ai-sdk';

import { interpretResult, redact } from '../ledger';
import type { RunEvent } from '../events';
import type { FrameworkAdapter, RunTurnOptions, RunTurnResult } from './types';

/**
 * The AI SDK has no `setTracingDisabled()` because it never phones home on its
 * own: telemetry is OpenTelemetry-based and opt-in per call via
 * `experimental_telemetry` (TelemetrySettings.isEnabled — "Disabled by default
 * while experimental"). There is no ambient env var that can switch it on, so
 * unlike LangSmith there is nothing to pin at module scope. It is still passed
 * explicitly below, because a registered global tracer would otherwise record
 * tool inputs and outputs — which carry customer phone numbers and order ids.
 */

/**
 * The /ai-sdk subpath is a THIRD shape: a differently named class
 * (`CashfreeAISDKToolkit`, not `CashfreeAgentToolkit`) whose `getTools()`
 * returns an OBJECT keyed by tool name rather than an array. Its tools are real
 * `tool()` values from `ai`, so their `execute` resolves the parsed payload —
 * not the JSON string the other two subpaths hand back.
 */
let cached: CashfreeAISDKToolkit | null = null;

function getToolkit(): CashfreeAISDKToolkit {
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

  cached = new CashfreeAISDKToolkit(environment, clientId, clientSecret);
  return cached;
}

/**
 * Structural scoping again — `streamText` only ever sees the tools in this
 * object, so there is nothing for the model to name that it wasn't given.
 */
function selectTools(names: string[] | null): ToolSet {
  const tk = getToolkit();
  const all = tk.getTools() as ToolSet;
  if (names === null) return all;

  const scoped: ToolSet = {};
  for (const name of names) {
    const t = all[name];
    if (!t) throw new Error(`Unknown Cashfree tool: ${name}`);
    scoped[name] = t;
  }
  return scoped;
}

const now = () => Date.now();

export const aiSdkAdapter: FrameworkAdapter = {
  id: 'ai-sdk',
  label: 'Vercel AI SDK',

  resolveToolNames(toolNames) {
    return toolNames ?? Object.keys(getToolkit().getTools() as ToolSet);
  },

  async runTurn({
    instructions,
    model,
    toolNames,
    history,
    prompt,
    emit,
  }: RunTurnOptions): Promise<RunTurnResult> {
    const priorHistory = history as ModelMessage[];
    const input: ModelMessage[] = [
      ...priorHistory,
      { role: 'user', content: prompt },
    ];

    const result = streamText({
      // `openai(model)` would route through the Responses API. `.chat()` pins
      // Chat Completions, which is what LangChain's ChatOpenAI uses, so the two
      // new adapters at least talk to the same endpoint.
      //
      // Deliberately NOT `providerOptions: { openai: { strictJsonSchema: true } }`
      // — the toolkit's schemas are not strict-compatible (`createOrder`'s
      // order_currency has a zod .default(), so it falls outside `required` and
      // OpenAI rejects the request). Same reasoning as langchain.ts; see
      // _probe/schema-strict.mjs.
      model: openai.chat(model),
      system: instructions,
      messages: input,
      tools: selectTools(toolNames),
      // Pinned so the same prompts pick the same tools across takes.
      temperature: 0,
      // streamText's default is stepCountIs(1) — one model call and then stop,
      // so without this the run would end the instant the first tool returned.
      // 30 matches the OpenAI adapter's maxTurns.
      stopWhen: stepCountIs(30),
      experimental_telemetry: { isEnabled: false },
    });

    const pending = new Map<string, { name: string; at: number }>();
    let messageId = `msg_${now()}`;
    let openText = '';
    let finalText = '';

    /**
     * fullStream is the ordered union of every part. Text arrives as
     * text-start / text-delta* / text-end keyed by id, so `agent_message` is
     * emitted at text-end rather than reconstructed at the end of the run.
     */
    for await (const part of result.fullStream) {
      if (part.type === 'text-start') {
        openText = '';
        continue;
      }

      if (part.type === 'text-delta') {
        openText += part.text;
        emit({ type: 'agent_text_delta', messageId, delta: part.text, ts: now() });
        continue;
      }

      if (part.type === 'text-end') {
        if (openText) {
          emit({ type: 'agent_message', messageId, text: openText, ts: now() });
          finalText = openText;
        }
        openText = '';
        messageId = `msg_${now()}`;
        continue;
      }

      if (part.type === 'tool-call') {
        // Fires once the arguments have finished streaming and before execute()
        // runs, so the gap to the matching tool-result is genuine tool latency.
        pending.set(part.toolCallId, { name: part.toolName, at: now() });

        emit({
          type: 'tool_call',
          callId: part.toolCallId,
          name: part.toolName,
          args: redact((part.input ?? {}) as Record<string, unknown>),
          ts: now(),
        });
        continue;
      }

      if (part.type === 'tool-result') {
        const rec = pending.get(part.toolCallId);
        pending.delete(part.toolCallId);

        const name = rec?.name ?? part.toolName;
        const durationMs = rec ? now() - rec.at : 0;
        // Unlike the other two subpaths this is already a parsed object, which
        // interpretResult handles. `ok` still comes from the payload, never
        // from the absence of a throw: a failed Cashfree call resolves here as
        // a perfectly ordinary tool-result carrying {error, details:{code}}.
        const interpreted = interpretResult(name, part.output);

        emit({
          type: 'tool_result',
          callId: part.toolCallId,
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

      if (part.type === 'tool-error') {
        /**
         * NOT the Cashfree failure path — API errors resolve to a payload and
         * arrive as a normal tool-result above. This is the AI SDK's own throw
         * (invalid tool input, unknown tool), which the OpenAI Agents SDK
         * instead converts into a tool output string. Left unhandled the tool
         * card would hang open for the rest of the take, so `ok: false` here
         * really does come from a thrown exception, not from reading a result.
         */
        const rec = pending.get(part.toolCallId);
        pending.delete(part.toolCallId);

        const message =
          part.error instanceof Error ? part.error.message : String(part.error);

        emit({
          type: 'tool_result',
          callId: part.toolCallId,
          name: rec?.name ?? part.toolName,
          ok: false,
          result: { error: message },
          summary: `tool_error · ${message}`.slice(0, 160),
          durationMs: rec ? now() - rec.at : 0,
          ts: now(),
        });
      }
    }

    /**
     * `response` resolves to the FINAL step, but each step's `messages` is built
     * as [...every earlier step's messages, ...this step's] — verified in
     * ai/dist/index.js — so this is the whole turn's assistant and tool
     * messages, not just the last hop.
     */
    const response = await result.response;

    return {
      history: [...input, ...response.messages] as unknown[],
      finalText: finalText || (await result.text),
    };
  },
};

export type { RunEvent };
