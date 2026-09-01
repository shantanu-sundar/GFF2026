# OpenAI Agents SDK for JavaScript — Code-Level Reference

**Ground truth for this document = the shipped `.d.ts` and `.mjs` files in
`C:\Toolkit\_probe\node_modules\@openai\agents*\dist\`.**
Everything below is verified against those files unless explicitly tagged
**`[UNVERIFIED — from docs]`** or **`[UNVERIFIED — needs live API call]`**.

Verification script: `C:\Toolkit\_probe\agents-probe.mjs` (run with `node agents-probe.mjs`
from `C:\Toolkit\_probe`). It makes **zero network calls** and needs no API key.

---

## 1. Installed versions

| Package | Version |
|---|---|
| `@openai/agents` | **0.3.9** |
| `@openai/agents-core` | **0.3.9** |
| `@openai/agents-openai` | **0.3.9** |
| `@openai/agents-realtime` | **0.3.9** |
| `openai` (transitive) | 6.49.0 |
| `zod` (peer, installed) | **4.5.4** |

`@openai/agents` is a thin re-export barrel:

```js
// node_modules/@openai/agents/dist/index.d.ts — the ENTIRE file
export * from '@openai/agents-core';
export * from '@openai/agents-openai';
export { applyPatchTool, shellTool } from '@openai/agents-core';
export type { Shell, /* … */ } from '@openai/agents-core';
export * as realtime from '@openai/agents-realtime';
```

Verified by probe: `Object.keys(agents-core).filter(k => !(k in agents))` is **empty**.
Import everything from `@openai/agents`; there is never a reason to import
`@openai/agents-core` directly in app code.

**Peer dependency note:** `peerDependencies: { "zod": "^3.25.40 || ^4.0" }`. The probe
box has **zod 4.5.4** and `tool({ parameters: z.object({...}) })` works and emits
draft-07 JSON Schema. Do **not** run `npm i zod@3` in `_probe` — it breaks resolution.

### ⚠️ READ THIS FIRST: with zod 4, some protocol types silently become `unknown`

This is the one thing most likely to burn you, and it is **not** in any documentation.
Verified with `tsc 5.9.3 --strict` against the installed tree.

The shipped `.d.ts` files were generated against **zod v3** typings. `ZodDiscriminatedUnion`
changed its generic parameter order between v3 and v4:

```ts
// zod v3 — node_modules/zod/v3/types.d.ts:614     DISCRIMINATOR FIRST
declare class ZodDiscriminatedUnion<Discriminator extends string, Options extends ...[]>

// zod v4 — node_modules/zod/v4/classic/schemas.d.cts:540   OPTIONS FIRST
interface ZodDiscriminatedUnion<Options extends readonly core.SomeType[], Disc extends string>
```

`protocol.d.ts` writes the **v3** order (`z.ZodDiscriminatedUnion<"type", [ … ]>`), so under
zod 4 the compiler reads `Options = "type"` and `z.infer<…>` collapses to `{}` / `unknown`.

**Types that degrade to `unknown` under zod 4** (tsc-verified — each one errors on any
property access):

| Type | Why |
|---|---|
| `protocol.ToolCallItem` | `z.discriminatedUnion('type', …)` |
| `protocol.MessageItem` | `z.discriminatedUnion('role', …)` |
| `protocol.ToolCallOutputContent` | `z.discriminatedUnion('type', …)` |
| `protocol.OutputModelItem` | `z.discriminatedUnion('type', …)` |
| `AssistantMessageItem['content']` elements | `z.array(z.discriminatedUnion(…))` |

**Types that are FINE** (tsc-verified): `FunctionCallItem`, `FunctionCallResultItem`,
`HostedToolCallItem`, `AssistantMessageItem` (the object itself), `UserMessageItem`,
`ReasoningItem`, `protocol.ModelItem` (plain `z.union`), `StreamEvent` and its four
members (hand-written TS union, not `z.infer`), `AgentInputItem` / `AgentOutputItem`
(hand-written unions), and **every `Run*Item` class** (plain classes — `item.type`
narrowing works perfectly).

**Practical impact:** `RunToolCallItem.rawItem` is declared `protocol.ToolCallItem`, so
under zod 4 **you cannot narrow it and cannot read `.name` / `.arguments` / `.callId`
without a cast.** The fix is a one-line local union of the types that *do* infer — see
the compile-verified §4 switch, which uses exactly this. All snippets in this document
are written to compile clean under zod 4 with `--strict`.

Alternative fix (not tried here — `npm i zod@3` is off-limits on this box):
pinning zod to `^3.25.40` should make the declarations line up as intended.
**`[UNVERIFIED — not attempted]`**

---

## 2. Constructing an Agent

### The exact options type

`AgentOptions` = `name` required, **everything else optional**:

```ts
// agent.d.ts
export type AgentOptions<TContext, TOutput> =
  Expand<Pick<AgentConfiguration<TContext, TOutput>, 'name'>
       & Partial<AgentConfiguration<TContext, TOutput>>>;
```

Full `AgentConfiguration` field list (exact names, from `agent.d.ts`):

| Field | Type |
|---|---|
| `name` | `string` **(required)** |
| `instructions` | `string \| ((runContext, agent) => string \| Promise<string>)` |
| `prompt` | `Prompt \| ((runContext, agent) => Prompt \| Promise<Prompt>)` (Responses API only) |
| `handoffDescription` | `string` |
| `handoffs` | `(Agent \| Handoff)[]` |
| `handoffOutputTypeWarningEnabled` | `boolean` |
| `model` | `string \| Model` |
| `modelSettings` | `ModelSettings` |
| `tools` | `Tool<TContext>[]` |
| `mcpServers` | `MCPServer[]` |
| `inputGuardrails` | `InputGuardrail[]` |
| `outputGuardrails` | `OutputGuardrail<TOutput>[]` |
| `outputType` | `TOutput` (`'text'` \| Zod object \| JSON-schema def) |
| `toolUseBehavior` | `ToolUseBehavior` |
| `resetToolChoice` | `boolean` |

### `ModelSettings` — the exact shape

Yes, it is **`modelSettings: { temperature: 0 }`**. Verbatim from `model.d.ts`:

```ts
export type ModelSettingsToolChoice = 'auto' | 'required' | 'none' | (string & {});

export type ModelSettings = {
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  toolChoice?: ModelSettingsToolChoice;
  parallelToolCalls?: boolean;      // "Defaults to false if not provided."
  truncation?: 'auto' | 'disabled';
  maxTokens?: number;
  store?: boolean;                  // "Defaults to true if not provided."
  promptCacheRetention?: 'in-memory' | '24h' | null;
  reasoning?: { effort?: 'none'|'minimal'|'low'|'medium'|'high'|null;
                summary?: 'auto'|'concise'|'detailed'|null };
  text?: { verbosity?: 'low' | 'medium' | 'high' | null };
  providerData?: Record<string, any>;
};
```

Note it is a **`type` alias, not a class** — pass a plain object literal.
`maxTokens` is camelCase (not `max_tokens`, not `max_output_tokens`).

### Working constructor (verified — this exact code ran in the probe)

```ts
import { Agent, tool } from '@openai/agents';
import { z } from 'zod';

const getBalance = tool({
  name: 'get_balance',
  description: 'Fetch merchant balance',
  parameters: z.object({ merchantId: z.string() }),
  execute: async ({ merchantId }) => `balance for ${merchantId}`,
});

const agent = new Agent({
  name: 'Cashfree Agent',
  instructions: 'You help with Cashfree payments.',
  model: 'gpt-4.1-mini',
  modelSettings: { temperature: 0, toolChoice: 'auto', parallelToolCalls: false },
  tools: [getBalance],
});
```

Probe output confirming the properties land where you expect:

```
agent.model            = gpt-4.1-mini
agent.modelSettings    = {"temperature":0,"toolChoice":"auto","parallelToolCalls":false}
agent.tools.length     = 1 -> get_balance
agent.toolUseBehavior  = "run_llm_again"     <- default
agent.resetToolChoice  = true                <- default
agent.outputType       = "text"              <- default
```

### Pinning a model / which model id strings are valid

`model` is typed `string | Model`. **The SDK performs no validation or enum check on
the string** — it is forwarded verbatim to the OpenAI Responses API by
`OpenAIProvider`. So "valid" = "whatever the Responses API accepts".

Verified constants:

```
getDefaultModel()                            = "gpt-4.1"
DEFAULT_OPENAI_MODEL (agents-openai/defaults) = "gpt-4.1"
DEFAULT_OPENAI_API                            = "responses"
OPENAI_DEFAULT_MODEL_ENV_VARIABLE_NAME        = "OPENAI_DEFAULT_MODEL"
getDefaultModelSettings()                     = {}
getDefaultModelSettings('gpt-5')              = {"reasoning":{"effort":"low"},"text":{"verbosity":"low"}}
gpt5ReasoningSettingsRequired('gpt-5-mini')   = true
```

Three ways to pin, in precedence order (`runner/modelSettings.mjs → selectModel`):

```ts
// 1. Per-agent (wins)
new Agent({ name: 'A', model: 'gpt-4.1-mini' });

// 2. Per-run, overrides EVERY agent in the run
new Runner({ model: 'gpt-4.1-mini' });

// 3. Process-wide default via env var
process.env.OPENAI_DEFAULT_MODEL = 'gpt-4.1-mini';  // lowercased by getDefaultModel()
```

The only model-name **logic** in the SDK is a `startsWith('gpt-5')` check
(`gpt5ReasoningSettingsRequired`), with `gpt-5-chat*` excluded. Nothing else is
special-cased. Which concrete ids (`gpt-4.1`, `gpt-4.1-mini`, `gpt-5`, `gpt-5-mini`, …)
your key can actually reach is **`[UNVERIFIED — needs live API call]`**.

> **Gotcha `[UNVERIFIED — needs live API call]`:** reasoning models (`gpt-5*`, `o*`)
> generally reject `temperature` at the Responses API. The SDK does **not** strip
> `temperature` for you — `stripGpt5OnlySettings` only removes `reasoning`/`text.verbosity`
> when going the *other* direction (gpt-5 defaults onto a non-gpt-5 model). If you pin a
> reasoning model, drop `temperature` and use `reasoning: { effort: 'low' }` instead.

---

## 3. Running with streaming

### Exact call and return type

`run.d.ts` declares two overloads discriminated on the `stream` literal:

```ts
export declare function run<TAgent, TContext>(
  agent: TAgent,
  input: string | AgentInputItem[] | RunState<TContext, TAgent>,
  options?: NonStreamRunOptions<TContext>,      // { stream?: false }
): Promise<RunResult<TContext, TAgent>>;

export declare function run<TAgent, TContext>(
  agent: TAgent,
  input: string | AgentInputItem[] | RunState<TContext, TAgent>,
  options?: StreamRunOptions<TContext>,          // { stream: true }
): Promise<StreamedRunResult<TContext, TAgent>>;
```

So:

```ts
import { run } from '@openai/agents';

const result = await run(agent, 'What is my balance?', { stream: true });
// result: StreamedRunResult<...>
```

**`run()` returns a Promise — you must `await` it before iterating.**

> **TS gotcha:** the overload only narrows on a *literal* `true`. If you pass a variable
> typed `boolean` (`{ stream: streaming }`), TypeScript picks the first overload and you
> get `RunResult`. Inline the literal, or split the call sites.

Full shared options (`SharedRunOptions` in `run.d.ts`):

```ts
{
  context?: TContext | RunContext<TContext>;
  maxTurns?: number;
  signal?: AbortSignal;
  previousResponseId?: string;
  conversationId?: string;
  session?: Session;
  sessionInputCallback?: SessionInputCallback;
  callModelInputFilter?: CallModelInputFilter;
  tracing?: TracingConfig;
  stream: true;            // StreamRunOptions
}
```

### The three ways to consume — all share ONE underlying stream

`StreamedRunResult implements AsyncIterable<RunStreamEvent>`. From `result.mjs`:

```js
toStream()               { return this.#readableStream; }
[Symbol.asyncIterator]() { return this.#readableStream[Symbol.asyncIterator](); }
toTextStream(options)    { return this.#readableStream.pipeThrough(/* filter */); }
```

**All three read the same single `#readableStream`. Consume exactly one of them.**

```ts
// (a) async iteration — full event taxonomy. This is what you want.
for await (const event of result) { /* event: RunStreamEvent */ }

// (b) web ReadableStream of the same events
const stream: ReadableStream<RunStreamEvent> = result.toStream();

// (c) text-only convenience stream
const text: ReadableStream<string> = result.toTextStream();
const nodeText: Readable = result.toTextStream({ compatibleWithNodeStreams: true });
```

`toTextStream()` is exactly a filter over the raw token deltas — verbatim impl:

```js
if (event.type === 'raw_model_stream_event' && event.data.type === 'output_text_delta') {
  controller.enqueue(StreamEventTextStream.parse(event.data).delta);
}
```

Since your UI needs tool calls too, use **(a)** and derive the text yourself.

---

## 4. The stream event taxonomy  ← the important part

### Top level: 3 classes, discriminated on `.type`

From `events.d.ts` (all three are exported classes; `.type` is `readonly` and set in
the constructor — probe-verified at runtime):

```ts
export type RunStreamEvent =
  | RunRawModelStreamEvent      // .type === 'raw_model_stream_event'
  | RunItemStreamEvent          // .type === 'run_item_stream_event'
  | RunAgentUpdatedStreamEvent; // .type === 'agent_updated_stream_event'
```

| Class | `.type` | Payload fields |
|---|---|---|
| `RunRawModelStreamEvent` | `'raw_model_stream_event'` | `.data: ResponseStreamEvent` |
| `RunItemStreamEvent` | `'run_item_stream_event'` | `.name: RunItemStreamEventName`, `.item: RunItem` |
| `RunAgentUpdatedStreamEvent` | `'agent_updated_stream_event'` | `.agent: Agent<any, any>` |

Probe output:

```
RunRawModelStreamEvent     .type = "raw_model_stream_event"    fields: [ 'data', 'type' ]
RunItemStreamEvent         .type = "run_item_stream_event"     fields: [ 'name', 'item', 'type' ]
RunAgentUpdatedStreamEvent .type = "agent_updated_stream_event" fields: [ 'agent', 'type' ]
```

### Level 2a: `raw_model_stream_event` → `.data.type` (4 values)

`ResponseStreamEvent` is an alias: `types/helpers.d.ts` → `export type ResponseStreamEvent = StreamEvent;`
and `StreamEvent` is a zod discriminated union on `type` (`types/protocol`). Probe:
`output_text_delta | response_done | response_started | model`.

| `.data.type` | Fields | Meaning |
|---|---|---|
| `'response_started'` | `providerData?` | model call began |
| `'output_text_delta'` | **`delta: string`**, `providerData?` | **assistant text token** |
| `'response_done'` | `response: { id, usage, output, providerData? }`, `providerData?` | one model turn finished |
| `'model'` | `event: any`, `providerData?` | raw provider event, passed through |

> ### ⚠ Critical gotcha: every raw event is ALSO emitted as `type: 'model'`
>
> In `agents-openai/dist/openaiResponsesModel.mjs` the `yield { type: 'model', event }`
> at **line 1435 sits OUTSIDE the `if/else-if` chain** (lines 1387–1434), so it fires for
> *every* provider event. And `response.completed` yields `'model'` **twice** (line 1422
> inside the branch, then line 1435).
>
> **Consequence:** if you handle both `'output_text_delta'` and `'model'` as text, you
> will render every token twice. **Use `'output_text_delta'` for tokens and ignore
> `'model'`** unless you specifically want provider-native detail.

**What's inside `.data.event` when `.data.type === 'model'`:** the raw OpenAI Responses
API stream event from the `openai` 6.49.0 package — e.g.
`response.created`, `response.output_item.added`, `response.output_text.delta`,
`response.function_call_arguments.delta`, `response.function_call_arguments.done`,
`response.completed`. Useful if you want *streaming tool-call argument deltas*
(verified against `openai/resources/responses/responses.d.ts:2457`):

```ts
interface ResponseFunctionCallArgumentsDeltaEvent {
  delta: string; item_id: string; output_index: number; sequence_number: number;
  type: 'response.function_call_arguments.delta';
}
```

### Level 2b: `run_item_stream_event` → `.name` (7 values) and `.item.type` (7 values)

`RunItemStreamEventName` (verbatim from `events.d.ts`):

```ts
export type RunItemStreamEventName =
  | 'message_output_created' | 'handoff_requested' | 'handoff_occurred'
  | 'tool_called' | 'tool_output' | 'reasoning_item_created'
  | 'tool_approval_requested';
```

The mapping from item class → event name is **1:1 and total**, from
`runner/streaming.mjs → getRunItemStreamEventName()`. Both the `.name` and the
`.item.type` values below are **runtime-verified by the probe**:

| `event.name` | `event.item` class | `event.item.type` | Key item fields |
|---|---|---|---|
| `message_output_created` | `RunMessageOutputItem` | `'message_output_item'` | `rawItem: AssistantMessageItem`, `agent` |
| `tool_called` | `RunToolCallItem` | `'tool_call_item'` | `rawItem: ToolCallItem`, `agent` |
| `tool_output` | `RunToolCallOutputItem` | `'tool_call_output_item'` | `rawItem`, `agent`, **`output: string \| unknown`** |
| `reasoning_item_created` | `RunReasoningItem` | `'reasoning_item'` | `rawItem: ReasoningItem`, `agent` |
| `handoff_requested` | `RunHandoffCallItem` | `'handoff_call_item'` | `rawItem: FunctionCallItem`, `agent` |
| `handoff_occurred` | `RunHandoffOutputItem` | `'handoff_output_item'` | `rawItem`, **`sourceAgent`**, **`targetAgent`** (no `.agent`) |
| `tool_approval_requested` | `RunToolApprovalItem` | `'tool_approval_item'` | `rawItem`, `agent`, getters **`.name`**, **`.arguments`** |

```ts
export type RunItem = RunMessageOutputItem | RunToolCallItem | RunReasoningItem
  | RunHandoffCallItem | RunToolCallOutputItem | RunHandoffOutputItem
  | RunToolApprovalItem;
```

You can switch on **either** `event.name` **or** `event.item.type` — they carry identical
information. `event.item.type` gives you the better TypeScript narrowing (it's the
discriminant of the `RunItem` union), so prefer it.

### Reading the tool name + arguments (tool call STARTING)

`item.rawItem` for a `tool_call_item` is a `protocol.ToolCallItem`, itself a discriminated
union on `type`: `computer_call | shell_call | apply_patch_call | function_call | hosted_tool_call`.
For ordinary function tools it is `function_call`. Probe-verified field lists:

```
FunctionCallItem   : providerData, id, type, callId, name, status, arguments
HostedToolCallItem : providerData, id, type, name, arguments, status, output
```

```ts
// protocol.FunctionCallItem (from types/protocol.mjs)
{
  type: 'function_call',
  callId: string,     // <- correlate call <-> result
  name: string,       // <- TOOL NAME
  arguments: string,  // <- JSON STRING, already complete. JSON.parse() it.
  status?: 'in_progress' | 'completed' | 'incomplete',
  id?: string,
  providerData?: Record<string, any>,
}
```

`arguments` is a **JSON string**, not an object.

### Reading the tool RESULT

Two places hold the output, and they differ:

```ts
// item.output  -> the RAW return value of your execute() fn (object, string, whatever)
// item.rawItem -> protocol.FunctionCallResultItem, output coerced to text for the model
```

Probe-verified `FunctionCallResultItem` fields: `providerData, id, type, name, callId, status, output`.

```ts
{
  type: 'function_call_result',
  name: string,
  callId: string,                                  // matches the call's callId
  status: 'in_progress' | 'completed' | 'incomplete',
  output: string | ToolCallOutputContent | ToolCallStructuredOutput[],
}
```

Confirmed in `runner/toolExecution.mjs`: the raw item is built as
`{ type:'function_call_result', name, callId, status:'completed', output:{ type:'text', text: toSmartString(output) } }`
while the third constructor arg — `item.output` — is the untouched `execute()` return value
(`new RunToolCallOutputItem(getToolCallOutputItem(toolRun.toolCall, response), agent, response)`).

**For UI rendering, use `item.output`.** For the model-visible text, use
`item.rawItem.output.text`.

### ⚠ Event ORDERING — verified by reading `run.mjs` lines 555–680

This is the single most important behavioural fact for your UI:

1. **During** the model call, every provider event is enqueued as
   `RunRawModelStreamEvent` (line 584) → this is where `output_text_delta` tokens arrive.
2. **After** the model turn completes, `processModelResponse()` produces `newItems`, and
   those are streamed **immediately, BEFORE any tool executes** (line 621,
   `streamStepItemsToRunResult`, captured as `preToolItems`).
3. **Then** the tools actually run (`resolveTurnAfterModelResponse`), and the remaining
   items — the tool outputs — are streamed via
   `addStepToRunResult(result, step, { skipItems: preToolItems })` (line 631).

**Therefore `tool_called` genuinely fires before the tool runs, and `tool_output` fires
after it returns.** Timing `tool_called → tool_output` in your handler gives you real
tool latency, which is exactly what you want to display.

Caveat: `tool_called` fires after the *model turn* finished, not while arguments stream.
So `arguments` is always complete at that point — but you see nothing about the pending
call until the model finishes emitting it. For a true "arguments typing in" effect you
must fall back to the raw `'model'` events
(`response.function_call_arguments.delta`).

### Turn boundaries, handoffs, completion

- **Turn boundary:** `raw_model_stream_event` with `data.type === 'response_done'` marks the
  end of one model turn (carries `response.id` and `response.usage`).
- **Handoff:** two events — `run_item_stream_event`/`handoff_requested` (model asked), then
  `handoff_occurred` (done, read `item.sourceAgent` / `item.targetAgent`). Separately,
  `RunAgentUpdatedStreamEvent` is emitted from `run.mjs:662` on `next_step_handoff`, giving
  you the new `.agent`.
- **Run completion:** there is **no** terminal event in the stream. The async iterator
  simply ends. Await `result.completed` (see §7).

### The exact `switch` an engineer should write

**This exact code compiles clean** under `tsc 5.9.3 --strict --module nodenext`
against the installed tree (`@openai/agents` 0.3.9 + zod 4.5.4). Source of truth:
`C:/Toolkit/_probe/tscheck/fixed.ts`.

Note the three local type aliases at the top - they exist purely to work around the
zod-4 `unknown` degradation described in section 1. Each member type listed in them *does*
infer correctly on its own; only the `z.discriminatedUnion` wrapper is broken.

```ts
import {
  run, Agent, tool,
  type RunStreamEvent, type AgentInputItem, type protocol,
} from '@openai/agents';

// ---- zod4 compat shims: these five DO infer correctly individually ----
type AnyToolCall =
  | protocol.FunctionCallItem
  | protocol.HostedToolCallItem
  | protocol.ComputerUseCallItem
  | protocol.ShellCallItem
  | protocol.ApplyPatchCallItem;

type AnyToolResult =
  | protocol.FunctionCallResultItem
  | protocol.ComputerCallResultItem
  | protocol.ShellCallResultItem
  | protocol.ApplyPatchCallResultItem;

type AssistantContentPart =
  | { type: 'output_text'; text: string }
  | { type: 'refusal'; refusal: string }
  | { type: 'audio'; audio: string | { id: string }; transcript?: string | null }
  | { type: 'image'; image: string };

type UiEvent =
  | { kind: 'text_delta'; delta: string }
  | { kind: 'tool_start'; callId: string; name: string; args: unknown }
  | { kind: 'tool_end'; callId: string; name: string; output: unknown; ms: number }
  | { kind: 'message'; text: string }
  | { kind: 'agent_changed'; name: string }
  | { kind: 'turn_done'; responseId: string; usage: unknown };

export async function* streamAgent(
  agent: Agent<any, any>,
  input: string | AgentInputItem[],
): AsyncGenerator<UiEvent> {
  const result = await run(agent, input, { stream: true });
  const started = new Map<string, { name: string; at: number }>();

  for await (const event of result as AsyncIterable<RunStreamEvent>) {
    switch (event.type) {
      case 'raw_model_stream_event': {
        switch (event.data.type) {
          case 'output_text_delta':
            yield { kind: 'text_delta', delta: event.data.delta };
            break;
          case 'response_started':
            break;
          case 'response_done':
            yield { kind: 'turn_done', responseId: event.data.response.id, usage: event.data.response.usage };
            break;
          case 'model':
            break;
        }
        break;
      }
      case 'run_item_stream_event': {
        const item = event.item;
        switch (item.type) {
          case 'tool_call_item': {
            const raw = item.rawItem as AnyToolCall;
            if (raw.type === 'function_call') {
              started.set(raw.callId, { name: raw.name, at: Date.now() });
              let args: unknown;
              try { args = JSON.parse(raw.arguments); } catch { args = raw.arguments; }
              yield { kind: 'tool_start', callId: raw.callId, name: raw.name, args };
            } else if (raw.type === 'hosted_tool_call') {
              yield { kind: 'tool_start', callId: raw.id ?? raw.name, name: raw.name, args: raw.arguments };
            }
            break;
          }
          case 'tool_call_output_item': {
            const raw = item.rawItem as AnyToolResult;
            const callId = 'callId' in raw ? raw.callId : '';
            const rec = started.get(callId);
            yield {
              kind: 'tool_end',
              callId,
              name: 'name' in raw ? raw.name : (rec?.name ?? 'unknown'),
              output: item.output,
              ms: rec ? Date.now() - rec.at : 0,
            };
            started.delete(callId);
            break;
          }
          case 'message_output_item': {
            const parts = item.rawItem.content as AssistantContentPart[];
            const text = parts
              .filter((c): c is Extract<AssistantContentPart, { type: 'output_text' }> => c.type === 'output_text')
              .map((c) => c.text)
              .join('');
            yield { kind: 'message', text };
            break;
          }
          case 'reasoning_item':
          case 'handoff_call_item':
            break;
          case 'handoff_output_item':
            yield { kind: 'agent_changed', name: item.targetAgent.name };
            break;
          case 'tool_approval_item':
            break;
        }
        break;
      }
      case 'agent_updated_stream_event':
        yield { kind: 'agent_changed', name: event.agent.name };
        break;
    }
  }
  await result.completed;
}
```

Helper: `extractAllTextOutput(items: RunItem[]): string` is exported and concatenates
the text of all `message_output_item`s — handy for `result.newItems`.

---

## 5. Multi-turn conversation

**`toInputList()` does NOT exist in the JS SDK.** (That's `to_input_list()` from the
*Python* SDK.) A repo-wide grep for `toInputList` across all four `@openai/*` packages
returns **zero hits**. The JS equivalent is the **`history`** getter.

```ts
// result.d.ts, on RunResultBase (so on BOTH RunResult and StreamedRunResult)
get history(): AgentInputItem[];   // input items + all newly generated items
get output(): AgentOutputItem[];   // ONLY the new model-side items this run
get input(): string | AgentInputItem[];
get newItems(): RunItem[];         // new items WITH agent association (Run*Item wrappers)
get finalOutput(): ResolvedAgentOutput<...> | undefined;
```

The doc comment on `history` says it explicitly: *"This can be used as inputs for the
next agent run."*

### Manual history threading (recommended — full control)

```ts
import { run, type AgentInputItem } from '@openai/agents';

let thread: AgentInputItem[] = [];

async function turn(userText: string) {
  const input: AgentInputItem[] | string =
    thread.length ? [...thread, { role: 'user', content: userText }] : userText;

  const result = await run(agent, input, { stream: true });

  for await (const ev of result) { /* … push to UI … */ }
  await result.completed;

  thread = result.history;          // <- carries turn N into turn N+1
  return result.finalOutput;
}
```

`{ role: 'user', content: userText }` is a valid `UserMessageItem`
(`content` is `string | (InputText|InputImage|InputFile)[]`). There are also exported
helpers: **`user()`, `assistant()`, `system()`** from `helpers/message`.

> **Important:** `result.history` on a `StreamedRunResult` is only complete **after**
> `await result.completed`. Read it before that and you get a partial thread.

### Alternative: `Session` (SDK-managed history)

```ts
import { MemorySession, run } from '@openai/agents';

const session = new MemorySession({ sessionId: 'chat-123' });
await run(agent, 'first',  { stream: true, session });
await run(agent, 'second', { stream: true, session }); // history injected automatically
```

`Session` interface: `getSessionId()`, `getItems(limit?)`, `addItems(items)`,
`popItem()`, `clearSession()`. `MemorySession`'s own docstring says *"intended for demos
or tests. Not recommended for production use."* Also available:
`OpenAIConversationsSession` / `startOpenAIConversationsSession` (server-side history),
and `OpenAIResponsesCompactionSession`.

### Alternative: server-side conversation ids

`run()` options accept `previousResponseId?: string` and `conversationId?: string`, so
the Responses API keeps state for you. `result.lastResponseId` gives you the value to
feed forward. **`[UNVERIFIED — needs live API call]`** for end-to-end behaviour.

---

## 6. Restricting tools

**Yes — `new Agent({ tools: [subset] })` is all that is needed.** `tools` is a plain
`Tool<TContext>[]`; only what you list is serialized into the model request. Probe:
`agent.tools.length = 1 -> get_balance`.

For a shared toolkit, filter at construction:

```ts
const all = cashfreeToolkit.getAgentTools();
const readOnly = all.filter((t) => ['getOrder', 'getPaymentsForOrder'].includes(t.name));
const agent = new Agent({ name: 'Read-only', instructions: '…', tools: readOnly });
```

Two additional levers on `tool()` itself:

- **`isEnabled?: ToolEnabledOption<Context>`** — decide per-run whether a tool is exposed
  to the model. Better than rebuilding agents when the subset is dynamic.
- **`needsApproval?: boolean | ToolApprovalFunction`** — the run *pauses* instead of
  calling, emitting `tool_approval_requested`; resume via `result.interruptions` +
  `result.state`.

Also `agent.clone(...)` exists on the prototype (probe-verified) for spawning a variant
with a different tool set.

### What happens when asked to do something it has no tool for

The model just answers in natural language — it cannot invoke what it was never shown.
There is no SDK-level "unknown tool" path for this case: the tool list sent to the model
*is* the whole world. **`[UNVERIFIED — needs live API call]`** for the exact wording;
steer it in `instructions` (e.g. *"If you cannot do something with the tools available,
say so plainly and do not invent results."*).

If the model hallucinates a tool name that isn't in the list, that's a
`ModelBehaviorError` path, not a normal tool result.

### `toolUseBehavior` (on the Agent)

```ts
export type ToolUseBehaviorFlags = 'run_llm_again' | 'stop_on_first_tool';

export type ToolUseBehavior =
  | ToolUseBehaviorFlags
  | { stopAtToolNames: string[] }
  | ToolToFinalOutputFunction;   // (context, toolResults) => ToolsToFinalOutputResult
```

- `'run_llm_again'` — **default** (probe-verified). Tools run, model sees results, replies.
- `'stop_on_first_tool'` — first tool's output becomes `finalOutput`; the model never
  post-processes it.
- `{ stopAtToolNames: ['createRefund'] }` — stop when any listed tool is called.
- A function returning `{ isFinalOutput: boolean; isInterrupted; finalOutput? }`.

> Doc comment: *"This configuration is specific to `FunctionTools`. Hosted tools … are
> always processed by the LLM."*

### `modelSettings.toolChoice` — forcing / forbidding tool use

```ts
modelSettings: { toolChoice: 'auto' }        // default provider behaviour
modelSettings: { toolChoice: 'required' }    // must call some tool
modelSettings: { toolChoice: 'none' }        // forbid tools this turn
modelSettings: { toolChoice: 'get_balance' } // force one specific tool by name
```

(`ModelSettingsToolChoice = 'auto' | 'required' | 'none' | (string & {})` — the
`(string & {})` arm is what lets you pass a bare tool name with autocomplete intact.)

> ### ⚠ Gotcha: `toolChoice` is silently cleared after the first tool call
>
> `resetToolChoice` defaults to **`true`**, and `runner/modelSettings.mjs`:
> ```js
> export function maybeResetToolChoice(agent, toolUseTracker, modelSettings) {
>   if (agent.resetToolChoice && toolUseTracker.hasUsedTools(agent)) {
>     return { ...modelSettings, toolChoice: undefined };
>   }
>   return modelSettings;
> }
> ```
> So `toolChoice: 'required'` applies to the **first turn only** — by design, to stop
> infinite tool loops. To keep it pinned across turns set
> `new Agent({ …, resetToolChoice: false })`, and be aware you can then loop until
> `maxTurns`.

---

## 7. Waiting for a streamed run to finish

```ts
get completed(): Promise<void>;   // result.d.ts
get error(): unknown;
get cancelled(): boolean;
```

```ts
const result = await run(agent, input, { stream: true });

for await (const event of result) { /* … */ }

await result.completed;                 // <- rethrows if the run failed
const finalText = result.finalOutput;   // string when outputType is 'text' (the default)
```

`await result.completed` is **required** if you are not draining the stream, and is good
hygiene even if you are — it's where a run error surfaces as a rejection.

### Getting the final text

Three options, in order of preference:

```ts
// 1. finalOutput — typed via outputType; a string for the default 'text'
await result.completed;
const text = result.finalOutput;

// 2. accumulate output_text_delta yourself while streaming (what your UI does anyway)

// 3. text-only stream, if you want nothing else
for await (const chunk of result.toTextStream()) process.stdout.write(chunk);
await result.completed;
```

> **Do not read `finalOutput` before completion.** Verbatim from `result.mjs`:
> ```js
> get finalOutput() {
>   if (this.state._currentStep?.type === 'next_step_final_output') {
>     return this.state._currentAgent.processFinalOutput(this.state._currentStep.output);
>   }
>   logger.warn('Accessed finalOutput before agent run is completed.');
>   return undefined;
> }
> ```
> It returns **`undefined`** and logs a warning. Same applies to `history` and `newItems`.

Also on `StreamedRunResult`: `currentAgent`, `currentTurn: number`, `maxTurns: number | undefined`,
`lastResponseId`, `rawResponses`, `interruptions`, and the four guardrail-result arrays.

---

## 8. Errors

### Exported error classes (all probe-verified as present on `@openai/agents`)

```
AgentsError (abstract base, has .state?: RunState)
├── SystemError
├── MaxTurnsExceededError            ← NOTE: ...Error suffix, not "MaxTurnsExceeded"
├── ModelBehaviorError
│   └── InvalidToolInputError        ← NOT re-exported from the barrel (see below)
├── UserError
├── GuardrailExecutionError          (.error: Error)
├── ToolCallError                    (.error: Error)
├── InputGuardrailTripwireTriggered  (.result: InputGuardrailResult)
├── OutputGuardrailTripwireTriggered (.result: OutputGuardrailResult)
├── ToolInputGuardrailTripwireTriggered
└── ToolOutputGuardrailTripwireTriggered
```

> **`InvalidToolInputError` is declared in `errors.d.ts` but is NOT in the
> `index.d.ts` export list** — probe confirms it is absent from `Object.keys(Agents)`.
> Detect it with `err instanceof ModelBehaviorError` plus a name check, or deep-import.
> It carries `.originalError` and
> `.toolInvocation?: { runContext?, input?, details?: { toolCall: FunctionCallItem } }`.

Every `AgentsError` carries `.state?: RunState`, which you can serialize and later
resume by passing it back as the `input` argument to `run()`.

### What throws

From the `Runner.run` doc comment:

> *"In two cases, the agent may raise an exception: 1. If the maxTurns is exceeded, a
> MaxTurnsExceeded exception is raised. 2. If a guardrail tripwire is triggered, a
> GuardrailTripwireTriggered exception is raised."*

Plus, from `run.mjs`: `ModelBehaviorError('Model did not produce a final response!')`
when the stream ends with no `response_done`.

In streaming mode, errors reject **`result.completed`** (and the async iterator throws) —
so wrap `for await` + `await result.completed` in one `try/catch`.

### ⚠ How a thrown tool error surfaces — the key answer

**By default a tool that throws does NOT kill the run.** It comes back as a normal tool
*output* string that the model then reads. From `tool.mjs`:

```js
function defaultToolErrorFunction(context, error) {
  const details = error instanceof Error ? error.toString() : String(error);
  return `An error occurred while running the tool. Please try again. Error: ${details}`;
}

const toolErrorFunction =
  typeof options.errorFunction === 'undefined' ? defaultToolErrorFunction : options.errorFunction;

// …
return _invoke(...).catch((error) => {
  if (toolErrorFunction) {
    getCurrentSpan()?.setError({ message: 'Error running tool (non-fatal)', data: {...} });
    return toolErrorFunction(runContext, error);   // becomes the tool OUTPUT
  }
  throw error;
});
```

So in your stream you will see a perfectly ordinary
`run_item_stream_event` / `tool_output` whose `item.output` is that error string. **Your
UI must detect failures itself** — the event shape is identical to a success.

Three configurations of `tool({ errorFunction })`:

| `errorFunction` | Behaviour |
|---|---|
| omitted (`undefined`) | `defaultToolErrorFunction` → error text becomes the tool output; run continues |
| a custom function | your string becomes the tool output; run continues |
| **`null`** | the error **rethrows** → wrapped as `ToolCallError` → **kills the run** |

Recommended pattern for a UI that must distinguish the two:

```ts
const getOrder = tool({
  name: 'get_order',
  description: 'Fetch an order',
  parameters: z.object({ orderId: z.string() }),
  errorFunction: (_ctx, error) =>
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  execute: async ({ orderId }) => JSON.stringify({ ok: true, data: await api.getOrder(orderId) }),
});
// then in the stream: JSON.parse(item.output as string).ok === false  -> render red
```

If you *do* set `errorFunction: null`, the throw is caught in
`runner/toolExecution.mjs:61`:

```js
throw new ToolCallError(`Failed to run function tools: ${e}`, e, state);
```

`ToolCallError.error` holds your original error, `.state` holds the resumable run state.

### Cancellation

Pass `signal?: AbortSignal` in the run options. `runner/streaming.mjs` exports
`isAbortError()`, and `run.mjs` treats an abort as a clean early return (not a throw) —
it persists what it has and stops. `result.cancelled` reflects a consumer that broke out
of the stream loop.

---

## 9. `maxTurns`

**Default = 10.** Verbatim, `runner/constants.mjs`:

```js
export const DEFAULT_MAX_TURNS = 10;
```

Applied in `run.mjs` (lines 200 and 734) as `options.maxTurns ?? DEFAULT_MAX_TURNS`.

Raise it per run:

```ts
const result = await run(agent, input, { stream: true, maxTurns: 30 });
```

There is **no** `maxTurns` field on `RunConfig`/`Runner` — it is a *run option* only
(`SharedRunOptions`), so pass it at every `run()` call site. Exceeding it throws
`MaxTurnsExceededError`. A "turn" = one model call, so an agent that calls tools
repeatedly burns one turn per model round-trip.

`StreamedRunResult` exposes `currentTurn: number` and `maxTurns: number | undefined`
live during streaming — nice for a progress indicator.

---

## 10. Node / Next.js gotchas

### ✅ Node runtime is REQUIRED — Edge will not work

`agents-core/package.json` declares an `./_shims` export map with `workerd`, `browser`,
and `node` conditions, **and a default fallback**. The fallback is:

```js
// dist/shims/shims.mjs — the ENTIRE file
export * from "./shims-node.mjs";
```

And `shims-node.d.ts` imports:
`node:events`, `node:crypto` (`randomUUID`), `node:stream` (`Readable`),
`node:stream/web` (`ReadableStream`, `TransformStream`), `node:async_hooks`
(`AsyncLocalStorage`), `node:timers`, plus `./mcp-server/node`.

**Next.js Edge runtime resolves the `edge-light`/default condition, not `workerd`** — so
it lands on the Node shim and fails on `node:async_hooks` et al. Therefore:

```ts
// app/api/agent/route.ts
export const runtime = 'nodejs';   // REQUIRED
export const dynamic = 'force-dynamic';
export const maxDuration = 300;    // agent runs are long; raise the platform limit
```

`[UNVERIFIED — from docs]`: a Cloudflare Workers deploy would pick the `workerd` shim and
may work; not relevant here.

### Env vars

| Variable | Effect | Source |
|---|---|---|
| `OPENAI_API_KEY` | model calls **and**, by default, trace upload | `defaults.mjs → getDefaultOpenAIKey()` |
| `OPENAI_DEFAULT_MODEL` | overrides `getDefaultModel()`; **lowercased** | `defaultModel.mjs` |
| `OPENAI_AGENTS_DISABLE_TRACING` | `'true'` or `'1'` disables tracing | `config.mjs` |
| `OPENAI_AGENTS_DONT_LOG_MODEL_DATA` | `'true'`/`'1'` redacts model data from debug logs | `config.mjs` |
| `OPENAI_AGENTS_DONT_LOG_TOOL_DATA` | `'true'`/`'1'` redacts tool args/results from logs | `config.mjs` |
| `NODE_ENV=test` | **auto-disables tracing** | `config.mjs` |
| `DEBUG=openai-agents:*` | verbose logging (uses the `debug` package) | `package.json` dep |

Only `OPENAI_API_KEY` is required. Note the flags accept **only** the exact strings
`'true'` or `'1'`:

```js
function isEnabled(flagName) {
  const env = loadEnv();
  return (typeof env !== 'undefined' && (env[flagName] === 'true' || env[flagName] === '1'));
}
```

### ⚠ Tracing DOES phone home by default

`@openai/agents/dist/index.mjs` calls **`setDefaultOpenAITracingExporter()` at module
load time** — merely importing the package registers the exporter. The exporter POSTs to:

```js
// agents-openai/dist/openaiTracingExporter.mjs:14
endpoint: options.endpoint ?? 'https://api.openai.com/v1/traces/ingest'
```

authenticated with `getTracingExportApiKey() ?? OPENAI_API_KEY`.

Tracing is auto-disabled only when: `isBrowserEnvironment()`, or `NODE_ENV === 'test'`,
or `OPENAI_AGENTS_DISABLE_TRACING` is `'true'`/`'1'`. **In a Next.js server route with
`NODE_ENV=production`, traces WILL be uploaded to OpenAI unless you turn them off.**

For Cashfree payment data this matters — trace payloads include tool inputs/outputs.
Disable at module scope, before any `run()`:

```ts
import { setTracingDisabled } from '@openai/agents';
setTracingDisabled(true);
```

Options short of a full disable:

```ts
// keep spans, strip sensitive payloads
const runner = new Runner({ traceIncludeSensitiveData: false });

// or per-run: disable entirely for this runner
const runner = new Runner({ tracingDisabled: true });

// or send traces to your own collector
import { setTraceProcessors, BatchTraceProcessor } from '@openai/agents';
setTraceProcessors([new BatchTraceProcessor(myExporter)]);

// or just use a different key for trace export
import { setTracingExportApiKey } from '@openai/agents';
setTracingExportApiKey(process.env.OPENAI_TRACING_KEY!);
```

Note `RunConfig.tracingDisabled` and `RunConfig.traceIncludeSensitiveData` are **required**
(non-optional) fields of `RunConfig`, but `new Runner(config?: Partial<RunConfig>)` takes
a `Partial`, so you can pass just the ones you want.

### Bundling

- `@openai/agents` ships CJS (`dist/index.js`) + ESM (`dist/index.mjs`) + `.d.ts`. No
  build step needed.
- `MCPServerStdio` pulls in `child_process`. If you don't use MCP, Next.js tree-shaking
  usually handles it; if the bundler complains, add
  `serverExternalPackages: ['@openai/agents']` to `next.config.js`
  (`experimental.serverComponentsExternalPackages` on Next 14).
  **`[UNVERIFIED — from docs]`** — not reproduced here.
- Keep the agent, tools and `run()` strictly server-side. `isBrowserEnvironment()` exists
  and force-disables tracing in a browser, but the Node shims won't load there.

### Wiring the stream into a Next.js route (SSE)

```ts
// app/api/agent/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { setTracingDisabled } from '@openai/agents';
import { streamAgent } from '@/lib/agent';   // the generator from §4

setTracingDisabled(true);

export async function POST(req: Request) {
  const { message, history } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
      try {
        for await (const ev of streamAgent(agent, history?.length ? [...history, { role: 'user', content: message }] : message)) {
          send(ev);
        }
        send({ kind: 'done' });
      } catch (err) {
        send({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',   // stop nginx/proxy buffering the SSE
    },
  });
}
```

`result.toStream()` returns a `ReadableStream` from `node:stream/web`, which is
structurally compatible with the Web Streams API that `Response` expects — but building
your own `ReadableStream` as above is cleaner because you're re-shaping events for the UI
anyway.

---

## Quick reference card

```
run(agent, input, { stream: true })  ->  Promise<StreamedRunResult>   [must await]

for await (const e of result) {
  e.type === 'raw_model_stream_event'   -> e.data.type
      'output_text_delta'  -> e.data.delta                (string) ← TOKENS
      'response_started'
      'response_done'      -> e.data.response.{id,usage,output}
      'model'              -> e.data.event                ← FIRES FOR EVERY EVENT, skip
  e.type === 'run_item_stream_event'    -> e.name / e.item.type
      'tool_called'            / 'tool_call_item'         ← BEFORE execution
            e.item.rawItem.{name, arguments(JSON string), callId}
      'tool_output'            / 'tool_call_output_item'  ← AFTER execution
            e.item.output               (raw execute() return value)
            e.item.rawItem.{name, callId, status, output}
      'message_output_created' / 'message_output_item'
            e.item.rawItem.content[] where c.type === 'output_text' -> c.text
      'reasoning_item_created' / 'reasoning_item'
      'handoff_requested'      / 'handoff_call_item'
      'handoff_occurred'       / 'handoff_output_item'    e.item.{sourceAgent,targetAgent}
      'tool_approval_requested'/ 'tool_approval_item'     e.item.name / e.item.arguments
  e.type === 'agent_updated_stream_event' -> e.agent
}

await result.completed;      // then, and only then:
result.finalOutput           // final text
result.history               // AgentInputItem[]  -> feed into the next run()
result.newItems              // RunItem[]
result.lastResponseId
```

**Defaults:** `maxTurns` 10 · model `gpt-4.1` · `toolUseBehavior` `'run_llm_again'` ·
`resetToolChoice` `true` · `outputType` `'text'` · `parallelToolCalls` false ·
tracing **ON** (uploads to OpenAI).

**Top 6 things that will cost you hours if you get them wrong:**
1. **zod 4 breaks `protocol.ToolCallItem` etc. to `unknown`** (§1). Cast `item.rawItem`
   to a local union of `FunctionCallItem | HostedToolCallItem | …` before narrowing.
2. The `'model'` raw event fires for **every** provider event — don't read text from it,
   you'll double-render every token.
3. `toInputList()` doesn't exist; it's **`result.history`** (and only after `completed`).
4. A thrown tool error becomes a normal **`tool_output`**, not an exception — unless
   `errorFunction: null`.
5. Tracing **uploads to OpenAI by default**; call `setTracingDisabled(true)`.
6. `toStream()` / `toTextStream()` / `for await` all drain the **same** stream — pick one.
```
