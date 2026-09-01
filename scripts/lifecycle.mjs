#!/usr/bin/env node
/**
 * scripts/lifecycle.mjs — the no-LLM sandbox dry-run.
 *
 *   npm run demo:lifecycle
 *   npm run demo:lifecycle -- --runs=5
 *
 * Drives the full six-step money lifecycle against the Cashfree SANDBOX with
 * zero model involvement, so you can prove the sandbox is healthy before you
 * put an agent (and a camera) in front of it.
 *
 * WHY handleToolCall AND NOT .invoke()
 * ------------------------------------
 * `tk.tools.X.invoke(ctx, argsJson)` runs the zod schema first and, on any
 * problem, returns the opaque string "...InvalidToolInputError: Invalid JSON
 * input for tool" — the real Cashfree error code never reaches you.
 * `tk.handleToolCall()` posts the args straight through, so `order_id_not_paid`
 * / `refund_id_invalid` / `upi_id_invalid` come back verbatim.
 * See docs/SANDBOX-FINDINGS.md section 1.
 *
 * THESE TOOLS NEVER THROW
 * -----------------------
 * A failed call RESOLVES to `{ error, details: { code, message, help } }`.
 * try/catch catches nothing. Every step below branches on `parsed.error` and
 * reports `details.code`, which is the only trustworthy field — the `error`
 * string is mislabelled upstream (a failed createCustomer says "Failed to
 * fetch order"). See docs/SANDBOX-FINDINGS.md section 5, items 18-19.
 *
 * SECRETS
 * -------
 * `redact()` lives in lib/ledger.ts, but importing a .ts from a .mjs makes Node
 * print a MODULE_TYPELESS_PACKAGE_JSON warning straight into the recorded
 * terminal. So the masking is reimplemented locally (`mask`/`redact` below) and
 * lib/ is left alone. The client secret is never read into a printable
 * variable, and `payment_session_id` is never printed at all — not even a
 * prefix.
 */

import { CashfreeAgentToolkit, CFEnvironment } from '@cashfreepayments/agent-toolkit/openai';
import { readFileSync } from 'node:fs';
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
  npm run demo:lifecycle [-- options]

    --runs=N            run the whole lifecycle N times, then print a summary
                        table of per-step latency and pass/fail    (default 1)
    --amount=500        order amount in rupees                     (default 500)
    --refund=200        partial refund amount in rupees            (default 200)
    --vpa=<upi id>      test VPA (only testsuccess@gocash works in sandbox)
    --poll-ms=2000      settle poll interval
    --timeout-ms=90000  give up waiting for PAID after this
    --verbose           print the redacted JSON payload of every step
    --no-color          plain output
    --ascii             no unicode glyphs (legacy cmd.exe / codepage 437)
`);
  process.exit(0);
}

const RUNS = Math.max(1, Number(flag('runs', 1)) || 1);
const AMOUNT = Number(flag('amount', 500));
const REFUND_AMOUNT = Number(flag('refund', 200));
const VPA = String(flag('vpa', 'testsuccess@gocash'));
const POLL_MS = Number(flag('poll-ms', 2000));
const TIMEOUT_MS = Number(flag('timeout-ms', 90000));
const VERBOSE = !!flag('verbose', false);
const REFUND_SETTLE_MS = Number(flag('refund-settle-ms', 2500));

/* ------------------------------------------------------------- cosmetics -- */

const TTY = process.stdout.isTTY === true;
const COLOR = TTY && !flag('no-color', false) && !process.env.NO_COLOR;
// Windows Terminal / VS Code / most modern hosts do UTF-8. Legacy conhost does not.
const UNICODE =
  !flag('ascii', false) &&
  (process.platform !== 'win32' || !!process.env.WT_SESSION || !!process.env.TERM_PROGRAM);

const c = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c(1);
const dim = c(2);
const red = c(31);
const green = c(32);
const yellow = c(33);
const blue = c(36);
const grey = c(90);

const G = UNICODE
  ? { ok: '✓', bad: '✗', bar: '█', gap: '░', rule: '─', rupee: '₹', dots: '…' }
  : { ok: 'ok', bad: 'XX', bar: '#', gap: '.', rule: '-', rupee: 'Rs ', dots: '...' };
const SPIN = UNICODE
  ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  : ['-', '\\', '|', '/'];

const rupees = (n) => `${G.rupee}${Number(n).toLocaleString('en-IN')}`;
const secs = (n) => `${(n / 1000).toFixed(1)} s`;
const msec = (n) => `${n} ms`;

/* --------------------------------------------------------------- secrets -- */

/** Keys whose values must never reach a terminal that is being recorded. */
const SECRET_KEYS = new Set(['payment_session_id', 'client_secret', 'x-client-secret']);
const mask = (v) => (typeof v === 'string' ? `<hidden ${v.length} chars>` : '<hidden>');

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.has(k) ? mask(v) : redact(v);
    return out;
  }
  return value;
}

/* ------------------------------------------------------------------- env -- */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadCreds() {
  let id = process.env.CASHFREE_CLIENT_ID;
  let secret = process.env.CASHFREE_CLIENT_SECRET;

  // Fallback so `node scripts/lifecycle.mjs` works without --env-file.
  if (!id || !secret) {
    try {
      const text = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (!m) continue;
        const val = m[2].replace(/^["']|["']$/g, '');
        if (m[1] === 'CASHFREE_CLIENT_ID' && !id) id = val;
        if (m[1] === 'CASHFREE_CLIENT_SECRET' && !secret) secret = val;
      }
    } catch {
      /* fall through to the error below */
    }
  }

  if (!id || !secret) {
    console.error(
      red(`\n  ${G.bad} CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET not set.\n`) +
        `    Put your sandbox credentials in ${path.join(ROOT, '.env.local')} and run\n` +
        `    ${bold('npm run demo:lifecycle')} (which passes --env-file for you).\n`,
    );
    process.exit(2);
  }
  return { id, secret };
}

const { id: CLIENT_ID, secret: CLIENT_SECRET } = loadCreds();
const ENVIRONMENT =
  process.env.CASHFREE_ENV === 'PRODUCTION' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;

if (ENVIRONMENT === CFEnvironment.PRODUCTION) {
  console.error(red('\n  Refusing to run: CASHFREE_ENV=PRODUCTION. This script moves real money.\n'));
  process.exit(2);
}

const tk = new CashfreeAgentToolkit(ENVIRONMENT, CLIENT_ID, CLIENT_SECRET);

/* ------------------------------------------------------------ tool calls -- */

const sleep = (n) => new Promise((r) => setTimeout(r, n));
let seq = 0;

/** The verified no-LLM execution path. Returns { ms, ok, value, code, message }. */
async function callTool(name, args) {
  const t0 = Date.now();
  const res = await tk.handleToolCall({
    id: `call_${Date.now()}_${++seq}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  });
  const elapsed = Date.now() - t0;

  let value;
  try {
    value = JSON.parse(res.content);
  } catch {
    value = res.content;
  }

  // Tools resolve an error object; they do not throw.
  const isError = !!value && typeof value === 'object' && !Array.isArray(value) && 'error' in value;
  return {
    ms: elapsed,
    ok: !isError,
    value,
    // details.code is the field to trust; value.error is mislabelled upstream.
    // Some transient sandbox failures carry no details block at all.
    code: isError ? String(value.details?.code ?? 'no_error_code') : null,
    message: isError ? String(value.details?.message ?? value.error ?? '') : null,
  };
}

/* -------------------------------------------------------------- printing -- */

const LABEL_W = 22;

function stepLine(n, tool, timing, detail, ok = true) {
  const glyph = ok ? green(G.ok) : red(G.bad);
  console.log(
    `  ${glyph}  ${grey(String(n))}  ${bold(String(tool).padEnd(LABEL_W))}` +
      `${dim(String(timing).padStart(9))}   ${detail}`,
  );
}

function failLine(n, tool, r) {
  stepLine(n, tool, typeof r.ms === 'number' ? msec(r.ms) : '-', `${red(r.code)} ${dim(G.rule)} ${r.message}`, false);
}

function verbose(value) {
  if (!VERBOSE) return;
  console.log(
    grey(
      JSON.stringify(redact(value), null, 2)
        .split('\n')
        .map((l) => '         ' + l)
        .join('\n'),
    ),
  );
}

/** A single line that redraws in place. Silent on a non-TTY (CI, piped logs). */
function progress() {
  let frame = 0;
  let timer = null;
  let state = '';
  const paint = () => {
    if (!TTY) return;
    process.stdout.write(`\x1b[2K\r  ${blue(SPIN[frame++ % SPIN.length])}  ${state}`);
  };
  return {
    set(text) {
      state = text;
      paint();
    },
    start() {
      if (TTY) timer = setInterval(paint, 110);
    },
    stop() {
      if (timer) clearInterval(timer);
      if (TTY) process.stdout.write('\x1b[2K\r');
    },
  };
}

function bar(fraction, width = 16) {
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
  return `${G.bar.repeat(filled)}${G.gap.repeat(width - filled)}`;
}

/* ------------------------------------------------------------- lifecycle -- */

/** Sandbox auto-approves the UPI collect request on a fixed ~30 s server timer. */
const EXPECTED_SETTLE_MS = 31000;

/**
 * The six verified steps. Every nullable-but-required field is passed as an
 * explicit null — the schemas are strict, and omitting them fails on any path
 * that validates.
 */
async function runLifecycle() {
  const stamp = Date.now();
  const wallStart = stamp;
  const steps = [];
  const record = (n, tool, taken, ok) => steps.push({ n, tool, ms: taken, ok });
  const fail = (n, tool, r) => {
    failLine(n, tool, r);
    record(n, tool, typeof r.ms === 'number' ? r.ms : 0, false);
    return {
      ok: false,
      steps,
      wallMs: Date.now() - wallStart,
      failure: { step: n, tool, code: r.code, message: r.message },
    };
  };

  /* 1 - createCustomer. Idempotent on phone number; decorative for the payment
        flow (createOrder re-accepts name/email/phone inline) but it is the
        first thing the agent does on camera, so it is dry-run here too. */
  let r = await callTool('createCustomer', {
    customer_phone: '9478912345',
    customer_email: `rahul+${stamp}@example.com`,
    customer_name: 'Rahul Sharma',
  });
  if (!r.ok) return fail(1, 'createCustomer', r);
  const uid = String(r.value.customer_uid ?? '');
  record(1, 'createCustomer', r.ms, true);
  stepLine(1, 'createCustomer', msec(r.ms), `${r.value.customer_phone} ${dim(G.rule)} uid ${uid.slice(0, 8)}${G.dots}`);
  verbose(r.value);

  /* 2 - createOrder. There is NO order_id parameter; Cashfree generates it.
        A run label goes in order_note instead. */
  r = await callTool('createOrder', {
    order_amount: AMOUNT,
    order_currency: 'INR',
    customer_id: `cust_${stamp}`,
    customer_name: 'Rahul Sharma',
    customer_email: `rahul+${stamp}@example.com`,
    customer_phone: '9478912345',
    return_url: null,
    order_note: `demo_order_${stamp}`,
  });
  if (!r.ok) return fail(2, 'createOrder', r);
  const orderId = String(r.value.order_id);
  const session = String(r.value.payment_session_id ?? '');
  record(2, 'createOrder', r.ms, true);
  stepLine(
    2,
    'createOrder',
    msec(r.ms),
    `${orderId} ${dim(G.rule)} ${rupees(r.value.order_amount)} ${dim(G.rule)} ${yellow(r.value.order_status)}`,
  );
  console.log(`        ${grey(`payment_session_id received (${session.length} chars, never printed)`)}`);
  verbose(r.value);
  if (!session) {
    return fail(2, 'createOrder', {
      ms: 0,
      code: 'no_payment_session',
      message: 'order created without a payment_session_id',
    });
  }

  /* 3 - orderPayUsingUpi. Returns in ~400 ms with no status field at all: the
        payment row exists as NOT_ATTEMPTED and the order is still ACTIVE. */
  const payStart = Date.now();
  r = await callTool('orderPayUsingUpi', {
    payment_session_id: session,
    channel: 'collect',
    upi_id: VPA,
    upi_redirect_url: null,
    upi_expiry_minutes: null,
    authorize_only: null,
    authorization: null,
    save_instrument: null,
    offer_id: null,
  });
  if (!r.ok) return fail(3, 'orderPayUsingUpi', r);
  record(3, 'orderPayUsingUpi', r.ms, true);
  stepLine(
    3,
    'orderPayUsingUpi',
    msec(r.ms),
    `cf_payment_id ${r.value.cf_payment_id} ${dim(G.rule)} collect ${dim(G.rule)} ${VPA}`,
  );
  verbose(r.value);

  /* 4 - the ~30 s wait. A fixed server-side simulator timer, not network
        latency, and it cannot be shortened. One line, redrawn in place. */
  const p = progress();
  p.start();
  let polls = 0;
  let orderStatus = null;
  let paymentStatus = '(none)';
  let paidAt = null;
  let pollMsTotal = 0;
  // Observed on sandbox: a single getOrder can hang ~19 s and come back
  // { error: "Failed to fetch order" } with NO details.code. It is transient —
  // the next poll succeeds. One bad poll must not abort a take.
  let pollErrors = 0;
  let consecutivePollErrors = 0;
  const MAX_CONSECUTIVE_POLL_ERRORS = 3;

  while (Date.now() - payStart < TIMEOUT_MS) {
    const since = Date.now() - payStart;
    p.set(
      `${grey('4')}  ${bold('settling'.padEnd(LABEL_W))}${dim(secs(since).padStart(9))}   ` +
        `${bar(Math.min(0.97, since / EXPECTED_SETTLE_MS))} ` +
        `${dim(`poll ${polls}`)} ${dim(G.rule)} ${yellow(orderStatus ?? 'ACTIVE')} / ${yellow(paymentStatus)}`,
    );
    await sleep(POLL_MS);
    polls++;

    const go = await callTool('getOrder', { order_id: orderId });
    const gp = await callTool('getPaymentsForOrder', { order_id: orderId });
    pollMsTotal += go.ms + gp.ms;
    if (!go.ok) {
      pollErrors++;
      consecutivePollErrors++;
      if (consecutivePollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        p.stop();
        return fail(4, 'getOrder', {
          ...go,
          message: `${go.message} (${consecutivePollErrors} consecutive poll failures)`,
        });
      }
      continue;
    }
    consecutivePollErrors = 0;
    orderStatus = go.value.order_status;
    // getPaymentsForOrder returns a BARE ARRAY, and [] before any attempt.
    paymentStatus = Array.isArray(gp.value) && gp.value.length ? gp.value[0].payment_status : '(none)';

    if (orderStatus === 'PAID' || paymentStatus === 'SUCCESS') {
      paidAt = Date.now() - payStart;
      break;
    }
    if (
      ['FAILED', 'USER_DROPPED'].includes(paymentStatus) ||
      ['EXPIRED', 'TERMINATED'].includes(orderStatus)
    ) {
      break;
    }
  }
  p.stop();

  if (paidAt === null) {
    return fail(4, 'getOrder poll', {
      ms: Date.now() - payStart,
      code: 'settle_timeout',
      message: `never reached PAID in ${secs(Date.now() - payStart)} (order=${orderStatus} payment=${paymentStatus}, ${polls} polls, ${pollErrors} poll errors)`,
    });
  }
  record(4, 'settle', paidAt, true);
  stepLine(
    4,
    `getOrder x${polls}`,
    secs(paidAt),
    `${green(orderStatus)} / ${green(paymentStatus)} ${dim(G.rule)} ` +
      `${dim(`${polls} polls, ${msec(pollMsTotal)} in flight`)}` +
      (pollErrors ? ` ${yellow(`${pollErrors} transient poll error${pollErrors === 1 ? '' : 's'} retried`)}` : ''),
  );

  /* 5 - createRefund. Always comes back PENDING. refund_id must be unique per
        MERCHANT (not per order), so it is timestamped. */
  const refundId = `refund_${stamp}`;
  r = await callTool('createRefund', {
    order_id: orderId,
    refund_amount: REFUND_AMOUNT,
    refund_id: refundId,
    refund_note: 'Partial refund demo',
    refund_speed: 'STANDARD',
    refund_splits: null,
  });
  if (!r.ok) return fail(5, 'createRefund', r);
  record(5, 'createRefund', r.ms, true);
  stepLine(
    5,
    'createRefund',
    msec(r.ms),
    `${refundId} ${dim(G.rule)} ${rupees(r.value.refund_amount)} ${dim(G.rule)} ` +
      `${yellow(r.value.refund_status)} ${dim('(settles in ~2 s)')}`,
  );
  verbose(r.value);

  /* 6 - getAllRefunds, after the settle wait, so the run ends on SUCCESS and
        not on "In Progress". */
  const w = progress();
  w.start();
  const waitStart = Date.now();
  const waiter = setInterval(() => {
    const since = Date.now() - waitStart;
    w.set(
      `${grey('6')}  ${bold('refund settling'.padEnd(LABEL_W))}${dim(secs(since).padStart(9))}   ` +
        `${bar(Math.min(0.97, since / REFUND_SETTLE_MS))}`,
    );
  }, 120);
  await sleep(REFUND_SETTLE_MS);
  clearInterval(waiter);
  w.stop();

  r = await callTool('getAllRefunds', { order_id: orderId });
  if (!r.ok) return fail(6, 'getAllRefunds', r);
  record(6, 'getAllRefunds', r.ms, true);
  const refunds = Array.isArray(r.value) ? r.value : [];
  const finalRefundStatus = refunds[0]?.refund_status ?? '(none)';
  stepLine(
    6,
    'getAllRefunds',
    msec(r.ms),
    `${refunds.length} refund${refunds.length === 1 ? '' : 's'} ${dim(G.rule)} ` +
      refunds
        .map(
          (x) =>
            `${rupees(x.refund_amount)} ${
              x.refund_status === 'SUCCESS' ? green(x.refund_status) : yellow(x.refund_status)
            }`,
        )
        .join(', '),
  );
  verbose(r.value);

  return {
    ok: true,
    steps,
    wallMs: Date.now() - wallStart,
    orderId,
    polls,
    paidAt,
    orderStatus,
    paymentStatus,
    refundStatus: finalRefundStatus,
  };
}

/* ------------------------------------------------------------------ main -- */

function header() {
  console.log('');
  console.log(
    `  ${bold('Cashfree agent toolkit')} ${dim(G.rule)} no-LLM lifecycle dry-run ` +
      `${dim(`(SANDBOX, ${RUNS} run${RUNS === 1 ? '' : 's'})`)}`,
  );
  console.log(
    grey(`  ${rupees(AMOUNT)} order, ${rupees(REFUND_AMOUNT)} partial refund, UPI collect via ${VPA}`),
  );
  console.log(grey(`  ${G.rule.repeat(76)}`));
}

/** Right-align text that may contain ANSI escapes (which .padStart miscounts). */
function padStartAnsi(text, width) {
  const visible = String(text).replace(/\x1b\[[0-9;]*m/g, '').length;
  return ' '.repeat(Math.max(0, width - visible)) + text;
}

function summary(results) {
  const byStep = new Map();
  for (const res of results) {
    for (const s of res.steps) {
      const tool = s.tool.replace(/ x\d+$/, '');
      const key = `${s.n}|${tool}`;
      if (!byStep.has(key)) byStep.set(key, { n: s.n, tool, all: [], ok: 0 });
      const e = byStep.get(key);
      e.all.push(s.ms);
      if (s.ok) e.ok++;
    }
  }

  console.log('');
  console.log(grey(`  ${G.rule.repeat(76)}`));
  console.log(`  ${bold('per-step latency')}`);
  console.log(
    grey(
      `  step  ${'tool'.padEnd(20)}${'ok'.padStart(7)}${'min'.padStart(11)}` +
        `${'avg'.padStart(11)}${'max'.padStart(11)}`,
    ),
  );
  for (const e of [...byStep.values()].sort((a, b) => a.n - b.n)) {
    const min = Math.min(...e.all);
    const max = Math.max(...e.all);
    const avg = Math.round(e.all.reduce((a, b) => a + b, 0) / e.all.length);
    const fmt = e.n === 4 ? secs : msec;
    const okTxt = `${e.ok}/${e.all.length}`;
    console.log(
      `  ${String(e.n).padEnd(6)}${e.tool.padEnd(20)}` +
        `${padStartAnsi(e.ok === e.all.length ? green(okTxt) : red(okTxt), 7)}` +
        `${fmt(min).padStart(11)}${fmt(avg).padStart(11)}${fmt(max).padStart(11)}`,
    );
  }

  console.log('');
  console.log(`  ${bold('per-run')}`);
  console.log(
    grey(
      `  run  ${'wall'.padStart(9)}${'polls'.padStart(7)}${'to PAID'.padStart(10)}  ` +
        `${'order'.padEnd(9)}${'payment'.padEnd(10)}${'refund'.padEnd(9)}result`,
    ),
  );
  results.forEach((res, i) => {
    const verdict = res.ok ? green('PASS') : red(`FAIL ${res.failure.code}`);
    console.log(
      `  ${String(i + 1).padEnd(5)}${secs(res.wallMs).padStart(9)}` +
        `${String(res.polls ?? '-').padStart(7)}${(res.paidAt ? secs(res.paidAt) : '-').padStart(10)}  ` +
        `${String(res.orderStatus ?? '-').padEnd(9)}${String(res.paymentStatus ?? '-').padEnd(10)}` +
        `${String(res.refundStatus ?? '-').padEnd(9)}${verdict}`,
    );
  });
}

const results = [];
for (let i = 1; i <= RUNS; i++) {
  if (i === 1) header();
  console.log(RUNS > 1 ? `\n  ${bold(`run ${i}/${RUNS}`)}` : '');
  results.push(await runLifecycle());
}

const failed = results.filter((r) => !r.ok);
if (RUNS > 1) summary(results);

console.log('');
if (failed.length === 0) {
  const avg = Math.round(results.reduce((a, r) => a + r.wallMs, 0) / results.length);
  console.log(
    `  ${green(G.ok)} ${bold(`${results.length}/${results.length} lifecycle run${results.length === 1 ? '' : 's'} passed`)} ` +
      `${dim(G.rule)} avg ${secs(avg)} wall`,
  );
  console.log('');
  process.exit(0);
}

const first = failed[0].failure;
console.log(`  ${red(G.bad)} ${bold(`${failed.length}/${results.length} run${results.length === 1 ? '' : 's'} failed`)}`);
console.log(`     first failure: step ${first.step} ${bold(first.tool)} ${dim(G.rule)} ${red(first.code)}`);
console.log(`     ${first.message}`);
console.log(grey('     error codes are documented in docs/SANDBOX-FINDINGS.md section 5'));
console.log('');
process.exit(1);
