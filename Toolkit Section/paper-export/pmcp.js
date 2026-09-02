// Minimal client for the Paper desktop MCP server (streamable HTTP transport).
//
// Paper is not registered as an MCP server for this session, but it is running
// locally and speaks plain JSON-RPC over HTTP, so we can drive it directly. The
// session id from `initialize` is cached on disk and reused, which keeps every
// later call in the same Paper session across separate invocations.
//
//   node pmcp.js <method> '<json params>'      -- raw JSON-RPC
//   node pmcp.js call <tool> '<json args>'     -- shorthand for tools/call
//   node pmcp.js reset                         -- forget the cached session
const fs = require('fs');
const path = require('path');

const URL_ = 'http://127.0.0.1:29979/mcp';
const SESSION_FILE = path.join(__dirname, '.paper-session');

async function rpc(body, sessionId, { notify = false } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(URL_, { method: 'POST', headers, body: JSON.stringify(body) });
  const sid = res.headers.get('mcp-session-id') || sessionId;
  if (notify) return { sessionId: sid };

  const text = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 400));

  // The transport answers as SSE: one or more `data: {...}` lines.
  let payload = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const parsed = JSON.parse(line.slice(5).trim());
    if (parsed.id === body.id) payload = parsed;
  }
  if (!payload) {
    try { payload = JSON.parse(text); } catch { throw new Error('no JSON-RPC reply in: ' + text.slice(0, 400)); }
  }
  if (payload.error) throw new Error('RPC error: ' + JSON.stringify(payload.error));
  return { result: payload.result, sessionId: sid };
}

let nextId = 1;

async function handshake() {
  const init = await rpc({
    jsonrpc: '2.0', id: nextId++, method: 'initialize',
    params: {
      protocolVersion: '2025-06-18', capabilities: {},
      clientInfo: { name: 'claude-code', version: '1.0' },
    },
  });
  await rpc({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
            init.sessionId, { notify: true });
  fs.writeFileSync(SESSION_FILE, init.sessionId);
  return init.sessionId;
}

async function session() {
  if (fs.existsSync(SESSION_FILE)) {
    const sid = fs.readFileSync(SESSION_FILE, 'utf8').trim();
    if (sid) return sid;
  }
  return handshake();
}

(async () => {
  const [cmd, a, b] = process.argv.slice(2);

  if (cmd === 'reset') {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
    console.log('session cleared');
    return;
  }

  // '@path' reads the JSON args from a file, so HTML never has to survive a
  // trip through shell quoting.
  const readArg = v => (v && v.startsWith('@'))
    ? fs.readFileSync(v.slice(1), 'utf8') : v;
  const argA = cmd === 'call' ? a : readArg(a);
  const argB = cmd === 'call' ? readArg(b) : b;

  let sid = await session();
  const body = cmd === 'call'
    ? { jsonrpc: '2.0', id: nextId++, method: 'tools/call',
        params: { name: argA, arguments: argB ? JSON.parse(argB) : {} } }
    : { jsonrpc: '2.0', id: nextId++, method: cmd, params: argA ? JSON.parse(argA) : {} };

  let out;
  try {
    out = await rpc(body, sid);
  } catch (e) {
    // A stale cached session is the usual cause; re-handshake once and retry.
    if (!/session/i.test(e.message) && !/HTTP 4/.test(e.message)) throw e;
    sid = await handshake();
    body.id = nextId++;
    out = await rpc(body, sid);
  }

  const r = out.result;
  // tools/call wraps everything in a content array; unwrap text parts so the
  // output is readable rather than a wall of JSON envelopes.
  if (r && Array.isArray(r.content)) {
    for (const c of r.content) {
      if (c.type === 'text') console.log(c.text);
      else if (c.type === 'image' && c.data) {
        const ext = (c.mimeType || 'image/png').split('/')[1].split('+')[0];
        const f = path.join(__dirname, 'shot.' + ext);
        fs.writeFileSync(f, Buffer.from(c.data, 'base64'));
        console.log('[image] ' + c.mimeType + ' -> ' + f);
      } else console.log('[' + c.type + ']' + (c.mimeType ? ' ' + c.mimeType : ''));
    }
    if (r.isError) process.exitCode = 1;
  } else {
    console.log(JSON.stringify(r, null, 1));
  }
})().catch(e => { console.error(String(e.message || e)); process.exit(1); });
