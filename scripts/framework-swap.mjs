#!/usr/bin/env node
/**
 * scripts/framework-swap.mjs — the framework-swap beat, in a terminal.
 *
 *   npm run demo:swap -- --dry     wiring proof, no model, no OPENAI_API_KEY
 *   npm run demo:swap              same task through all three frameworks
 *
 * The claim being demonstrated: one Cashfree toolkit, three agent ecosystems,
 * identical behaviour. The claim being kept honest: the three entry points are
 * NOT drop-in compatible with each other, and this script prints exactly how
 * they differ rather than pretending you "change one import line".
 *
 *   subpath      class                    tools array        tool map
 *   /openai      CashfreeAgentToolkit     getAgentTools()    .tools.getOrder
 *   /langchain   CashfreeAgentToolkit     getTools() array   .toolsMap.getOrder
 *   /ai-sdk      CashfreeAISDKToolkit     getTools() object  .tools.getOrder
 *
 * The app absorbs that in lib/adapters/*.ts behind one FrameworkAdapter
 * interface, so the UI swaps a single `FRAMEWORK` constant. Those adapters are
 * TypeScript modules with extensionless relative imports, i.e. Next/Turbopack
 * modules — they cannot be imported from a plain .mjs. This script therefore
 * re-implements the three call sites directly against the SDKs. If the numbers
 * here and the numbers in the console disagree, the adapters have drifted.
 *
 * STATUS: --dry is verified against the sandbox. Live mode is NOT — it has
 * never been executed, because OPENAI_API_KEY was empty when this was written.
 * The three call sites mirror lib/adapters/*.ts (which the console does
 * exercise), but run it once yourself before you rely on it on camera.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* ------------------------------------------------------------------ args -- */

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};

if (flag('help', false)) {
  console.log(`
  npm run demo:swap [-- options]

    --dry             construct all three toolkits and print tool counts,
                      accessor shapes and the first few tool names.
                      Needs Cashfree sandbox creds only — NO OpenAI key.
    --order=<id>      live mode: ask about this existing order instead of
                      running the default createCustomer task
    --only=openai,ai-sdk    restrict to some frameworks
    --tools=3         how many tool names to preview per framework (--dry)
    --no-color        plain output
    --ascii           no unicode glyphs
`);
  process.exit(0);
}

const DRY = !!flag('dry', false);
const PREVIEW_N = Number(flag('tools', 4));
const ORDER_ID = flag('order', null);
const ONLY = flag('only', null);

/* ------------------------------------------------------------- cosmetics -- */

const TTY = process.stdout.isTTY === true;
const COLOR = TTY && !flag('no-color', false) && !process.env.NO_COLOR;
const UNICODE =
  !flag('ascii', false) &&
  (process.platform !== 'win32' || !!process.env.WT_SESSION || !!process.env.TERM_PROGRAM);

const c = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c(1);
const dim = c(2);
const red = c(31);
const green = c(32);
const yellow = c(33);
const grey = c(90);

const G = UNICODE
  ? { ok: '✓', bad: '✗', rule: '─', arrow: '→', dots: '…' }
  : { ok: 'ok', bad: 'XX', rule: '-', arrow: '->', dots: '...' };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------- env -- */

function fromEnvFile(key) {
  try {
    const text = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
  return '';
}

// `node --env-file` sets empty vars as '', so falsy-check rather than `in`.
const env = (key) => process.env[key] || fromEnvFile(key) || '';

const CLIENT_ID = env('CASHFREE_CLIENT_ID');
const CLIENT_SECRET = env('CASHFREE_CLIENT_SECRET');
const MODEL = env('OPENAI_MODEL') || 'gpt-4.1-mini';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    red(`\n  ${G.bad} CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET not set.`) +
      `\n    Fill them into ${path.join(ROOT, '.env.local')}, then run ` +
      `${bold('npm run demo:swap -- --dry')}.\n`,
  );
  process.exit(2);
}

/* -------------------------------------------------------- the three wires -- */

/** Tool names each framework is handed. Small and fixed, so takes are comparable. */
const TASK = ORDER_ID
  ? {
      toolNames: ['getOrder', 'getAllRefunds'],
      prompt: `What is the status of order ${ORDER_ID}, and how much has been refunded on it?`,
    }
  : {
      // createCustomer is idempotent on phone number, so all three frameworks
      // return the SAME customer_uid. That identical id is the whole point of
      // the beat: same toolkit, same call, same money object.
      toolNames: ['createCustomer'],
      prompt:
        'Register a customer named Rahul Sharma, phone 9478912345, email rahul@example.com. Reply with just the customer uid.',
    };

const INSTRUCTIONS =
  'You are a merchant support agent operating a Cashfree payments account through the tools you have been given. ' +
  'Always use a tool; never invent an id or a status. Reply in one short sentence.';

/**
 * Each entry knows only how its own SDK differs. `construct` is the part that
 * is genuinely not portable between the three.
 */
const FRAMEWORKS = [
  {
    id: 'openai',
    label: 'OpenAI Agents SDK',
    subpath: '@cashfreepayments/agent-toolkit/openai',
    className: 'CashfreeAgentToolkit',
    arrayAccessor: 'getAgentTools()',
    mapAccessor: '.tools.<name>',
    async construct() {
      const { CashfreeAgentToolkit, CFEnvironment } = await import(
        '@cashfreepayments/agent-toolkit/openai'
      );
      const tk = new CashfreeAgentToolkit(CFEnvironment.SANDBOX, CLIENT_ID, CLIENT_SECRET);
      const all = tk.getAgentTools();
      return {
        tk,
        shape: 'Array<tool()>',
        names: all.map((t) => t.name),
        pick: (names) => names.map((n) => tk.tools[n]),
      };
    },
    async run(built, prompt) {
      const { Agent, run, setTracingDisabled } = await import('@openai/agents');
      // Tracing POSTs tool inputs AND outputs to OpenAI. Those carry customer
      // phone numbers and order ids. Off, deliberately.
      setTracingDisabled(true);
      const agent = new Agent({
        name: 'Merchant Support Agent',
        instructions: INSTRUCTIONS,
        model: MODEL,
        tools: built.pick(TASK.toolNames),
        modelSettings: { temperature: 0 },
      });
      const result = await run(agent, prompt, { maxTurns: 12 });
      const calls = (result.history ?? [])
        .filter((i) => i?.type === 'function_call')
        .map((i) => i.name);
      return { text: String(result.finalOutput ?? ''), calls };
    },
  },

  {
    id: 'langchain',
    label: 'LangChain',
    subpath: '@cashfreepayments/agent-toolkit/langchain',
    className: 'CashfreeAgentToolkit',
    arrayAccessor: 'getTools()',
    mapAccessor: '.toolsMap.<name>',
    async construct() {
      const { CashfreeAgentToolkit, CFEnvironment } = await import(
        '@cashfreepayments/agent-toolkit/langchain'
      );
      const tk = new CashfreeAgentToolkit(CFEnvironment.SANDBOX, CLIENT_ID, CLIENT_SECRET);
      const all = tk.getTools();
      return {
        tk,
        shape: 'Array<StructuredTool>',
        names: all.map((t) => t.name),
        // NOTE: .toolsMap here, not .tools — .tools is the array on this class.
        pick: (names) => names.map((n) => tk.toolsMap[n]),
      };
    },
    async run(built, prompt) {
      const { createAgent } = await import('langchain');
      const { ChatOpenAI } = await import('@langchain/openai');
      // Matches lib/adapters/langchain.ts: an explicit ChatOpenAI (a bare model
      // string routes through initChatModel, leaving nowhere to pin
      // temperature), and `systemPrompt`, which is prepended at model-call time
      // rather than stored in the message state.
      const agent = createAgent({
        model: new ChatOpenAI({ model: MODEL, temperature: 0 }),
        tools: built.pick(TASK.toolNames),
        systemPrompt: INSTRUCTIONS,
      });
      const result = await agent.invoke({
        messages: [{ role: 'user', content: prompt }],
      });
      const messages = result.messages ?? [];
      const calls = messages.flatMap((m) => (m.tool_calls ?? []).map((t) => t.name));
      const last = messages[messages.length - 1];
      const text =
        typeof last?.content === 'string'
          ? last.content
          : (last?.content ?? []).map((p) => p.text ?? '').join('');
      return { text, calls };
    },
  },

  {
    id: 'ai-sdk',
    label: 'Vercel AI SDK',
    subpath: '@cashfreepayments/agent-toolkit/ai-sdk',
    className: 'CashfreeAISDKToolkit',
    arrayAccessor: 'getTools()',
    mapAccessor: '.tools.<name>',
    async construct() {
      const { CashfreeAISDKToolkit, CFEnvironment } = await import(
        '@cashfreepayments/agent-toolkit/ai-sdk'
      );
      const tk = new CashfreeAISDKToolkit(CFEnvironment.SANDBOX, CLIENT_ID, CLIENT_SECRET);
      const all = tk.getTools();
      return {
        tk,
        shape: 'Record<name, tool>',
        // getTools() is an OBJECT here, not an array. Names are the keys.
        names: Object.keys(all),
        pick: (names) => Object.fromEntries(names.map((n) => [n, tk.tools[n]])),
      };
    },
    async run(built, prompt) {
      const { generateText, stepCountIs } = await import('ai');
      const { openai } = await import('@ai-sdk/openai');
      const result = await generateText({
        // `.chat()` pins Chat Completions; a bare `openai(MODEL)` would route
        // through the Responses API. Matches lib/adapters/ai-sdk.ts, so all
        // three frameworks here hit the same endpoint.
        model: openai.chat(MODEL),
        system: INSTRUCTIONS,
        prompt,
        tools: built.pick(TASK.toolNames),
        temperature: 0,
        stopWhen: stepCountIs(12),
      });
      const calls = (result.steps ?? []).flatMap((s) => (s.toolCalls ?? []).map((t) => t.toolName));
      return { text: result.text ?? '', calls };
    },
  },
];

const selected = ONLY
  ? FRAMEWORKS.filter((f) => String(ONLY).split(',').includes(f.id))
  : FRAMEWORKS;

/* --------------------------------------------------------------- adapters -- */

/**
 * The console's own adapters live in lib/adapters/*.ts. They cannot be
 * imported here (TypeScript + extensionless specifiers), so this is a presence
 * check only — it tells you whether the app-side swap is wired, and degrades to
 * a warning line if a file has not been written yet.
 */
function adapterStatus() {
  return ['openai', 'langchain', 'ai-sdk'].map((id) => ({
    id,
    present: existsSync(path.join(ROOT, 'lib', 'adapters', `${id}.ts`)),
  }));
}

/* -------------------------------------------------------------- dry mode -- */

async function dryRun() {
  console.log('');
  console.log(`  ${bold('Framework swap')} ${dim(G.rule)} wiring check ${dim('(--dry: no model, no OpenAI key)')}`);
  console.log(grey(`  one Cashfree sandbox account, three toolkit entry points`));
  console.log(grey(`  ${G.rule.repeat(84)}`));
  console.log('');
  console.log(
    grey(
      `  ${'framework'.padEnd(20)}${'class'.padEnd(24)}${'tools array'.padEnd(18)}` +
        `${'shape'.padEnd(22)}count`,
    ),
  );

  const built = [];
  let failures = 0;

  for (const f of selected) {
    try {
      const t0 = Date.now();
      const b = await f.construct();
      const ms = Date.now() - t0;
      built.push({ f, b, ms });
      console.log(
        `  ${green(G.ok)} ${f.label.padEnd(18)}${f.className.padEnd(24)}` +
          `${f.arrayAccessor.padEnd(18)}${b.shape.padEnd(22)}${bold(String(b.names.length))}`,
      );
    } catch (err) {
      failures++;
      console.log(`  ${red(G.bad)} ${f.label.padEnd(18)}${red(err.message)}`);
    }
  }

  console.log('');
  for (const { f, b, ms } of built) {
    const preview = b.names.slice(0, PREVIEW_N).join(', ');
    // ms is import + construct; the first framework pays the module-load cost.
    console.log(`  ${bold(f.label)} ${dim(`${f.subpath}  ${ms} ms import+construct`)}`);
    console.log(`     tools     ${preview}${b.names.length > PREVIEW_N ? dim(`, +${b.names.length - PREVIEW_N} more`) : ''}`);
    // The scoping accessor is the part that actually differs between the three.
    const scoped = b.pick(TASK.toolNames);
    const got = Array.isArray(scoped) ? scoped.length : Object.keys(scoped).length;
    const allResolved = Array.isArray(scoped)
      ? scoped.every(Boolean)
      : Object.values(scoped).every(Boolean);
    console.log(
      `     scoping   ${f.mapAccessor.padEnd(20)}${G.arrow} ` +
        `${allResolved ? green(`${got}/${TASK.toolNames.length} resolved`) : red('unresolved')} ` +
        `${dim(`(${TASK.toolNames.join(', ')})`)}`,
    );
    console.log('');
  }

  // Cross-check: all three should expose the same catalogue.
  const counts = [...new Set(built.map((x) => x.b.names.length))];
  if (built.length > 1) {
    if (counts.length === 1) {
      console.log(
        `  ${green(G.ok)} all ${built.length} entry points expose the same ${bold(String(counts[0]))} tools ` +
          `${dim(`${G.rule} same account, same catalogue, three ecosystems`)}`,
      );
    } else {
      console.log(`  ${yellow('!')} entry points disagree on tool count: ${counts.join(' vs ')}`);
    }
  }

  const adapters = adapterStatus();
  const missing = adapters.filter((a) => !a.present);
  if (missing.length === 0) {
    console.log(`  ${green(G.ok)} console adapters present: ${adapters.map((a) => `lib/adapters/${a.id}.ts`).join(', ')}`);
  } else {
    console.log(
      `  ${yellow('!')} console adapters not yet written: ` +
        `${missing.map((a) => `lib/adapters/${a.id}.ts`).join(', ')} ` +
        `${dim(`${G.rule} the terminal swap above still works; the UI swap will not`)}`,
    );
  }
  console.log('');

  process.exit(failures ? 1 : 0);
}

/* ------------------------------------------------------------- live mode -- */

async function liveRun() {
  const key = env('OPENAI_API_KEY');
  if (!key) {
    console.error('');
    console.error(`  ${red(G.bad)} ${bold('OPENAI_API_KEY is not set')} — live mode needs a model.`);
    console.error('');
    console.error(`    All three frameworks here call OpenAI. Add a key to ${bold('.env.local')}:`);
    console.error('');
    console.error(grey('        OPENAI_API_KEY=sk-...'));
    console.error(grey(`        OPENAI_MODEL=${MODEL}`));
    console.error('');
    console.error(`    Then re-run ${bold('npm run demo:swap')}.`);
    console.error('');
    console.error(
      `    To prove the toolkit wiring right now without a key, run ` +
        `${bold('npm run demo:swap -- --dry')} ${dim('(sandbox creds only).')}`,
    );
    console.error('');
    process.exit(2);
  }
  // generateText / ChatOpenAI read process.env directly.
  process.env.OPENAI_API_KEY = key;

  console.log('');
  console.log(`  ${bold('Framework swap')} ${dim(G.rule)} same task, three frameworks ${dim(`(${MODEL})`)}`);
  console.log(grey(`  tools: ${TASK.toolNames.join(', ')}`));
  console.log(grey(`  task:  "${TASK.prompt}"`));
  console.log(grey(`  ${G.rule.repeat(84)}`));

  const rows = [];
  for (const f of selected) {
    process.stdout.write(`\n  ${bold(f.label.padEnd(20))}${dim(f.subpath)}\n`);
    const t0 = Date.now();
    try {
      const built = await f.construct();
      const out = await f.run(built, TASK.prompt);
      const ms = Date.now() - t0;
      rows.push({ f, ok: true, ms, calls: out.calls, text: out.text });
      console.log(`     ${green(G.ok)} ${dim(`${ms} ms`)}  tools called: ${bold(out.calls.join(' ' + G.arrow + ' ') || '(none)')}`);
      console.log(`     ${dim(G.rule)} ${out.text.trim().replace(/\s+/g, ' ')}`);
    } catch (err) {
      rows.push({ f, ok: false, ms: Date.now() - t0, error: err.message });
      console.log(`     ${red(G.bad)} ${red(err.message)}`);
    }
  }

  console.log('');
  console.log(grey(`  ${G.rule.repeat(84)}`));
  console.log(
    grey(`  ${'framework'.padEnd(20)}${'result'.padEnd(9)}${'latency'.padStart(9)}   tools called`),
  );
  for (const r of rows) {
    console.log(
      `  ${r.f.label.padEnd(20)}${(r.ok ? green('ok') : red('fail')).padEnd(COLOR ? 18 : 9)}` +
        `${`${r.ms} ms`.padStart(9)}   ${r.ok ? r.calls.join(', ') : r.error}`,
    );
  }
  console.log('');
  process.exit(rows.every((r) => r.ok) ? 0 : 1);
}

await (DRY ? dryRun() : liveRun());
