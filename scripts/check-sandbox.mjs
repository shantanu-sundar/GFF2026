#!/usr/bin/env node
/**
 * Is the Cashfree sandbox actually reachable with the keys in .env.local?
 *
 * Creates a real ₹1,042 order -- the figure the Agent Skills demo says out loud
 * -- and reports what came back. Nothing is written anywhere; this is a health
 * check you run before a shoot, or when a number in the section is questioned
 * and you want to prove the account behind it is live.
 *
 *     node scripts/check-sandbox.mjs
 *
 * On the live drop-in: a payment_session_id is public by design, so one could in
 * principle be baked into the section and opened with the browser SDK. It is
 * not, and `docs/` records why -- the sandbox returns "Something went wrong" for
 * a freshly minted session often enough that a demo cannot lean on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CashfreeAgentToolkit, CFEnvironment } from '@cashfreepayments/agent-toolkit/openai';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.join(HERE, '..', '.env.local');

/** .env.local is the one env file (see CLAUDE.md); read it rather than shelling out. */
if (fs.existsSync(ENV)) {
  for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const id = process.env.CASHFREE_CLIENT_ID;
const secret = process.env.CASHFREE_CLIENT_SECRET;
if (!id || !secret) {
  console.error('CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET missing. Fill in .env.local.');
  process.exit(1);
}
console.log('env      ', process.env.CASHFREE_ENV || 'SANDBOX', '· key', id.slice(0, 6) + '…');

const tk = new CashfreeAgentToolkit(CFEnvironment.SANDBOX, id, secret);
const call = async (name, args) =>
  JSON.parse((await tk.handleToolCall({
    id: 'chk' + Date.now(),
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  })).content);

const t0 = Date.now();
const order = await call('createOrder', {
  order_amount: 1042,
  order_currency: 'INR',
  customer_id: 'cust_healthcheck_' + Date.now(),
  customer_name: 'Rahul Sharma',
  customer_email: 'rahul@example.com',
  customer_phone: '9999999999',
  return_url: null,
  order_note: 'sandbox health check',
});

if (!order || !order.order_id) {
  console.error('\nFAILED. createOrder returned:', JSON.stringify(order).slice(0, 500));
  process.exit(1);
}

const expires = new Date(order.order_expiry_time);
console.log('order    ', order.order_id);
console.log('status   ', order.order_status, '· ₹' + order.order_amount);
console.log('session  ', String(order.payment_session_id).length, 'chars (not printed: it is payable)');
console.log('expires  ', expires.toISOString().slice(0, 10), '·', Math.round((expires - Date.now()) / 864e5), 'days');
console.log('round trip', Date.now() - t0, 'ms');
console.log('\nsandbox OK');
