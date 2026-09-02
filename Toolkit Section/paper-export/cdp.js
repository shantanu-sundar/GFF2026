// Minimal Chrome DevTools Protocol driver: load a URL, run an expression,
// capture console errors, and optionally screenshot. No npm deps.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function run({ url, width = 1440, height = 1000, wait = 3500, evaluate, screenshot, fullPage, extraArgs = [], media }) {
  const port = 9200 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port,
    '--window-size=' + width + ',' + height,
  ].concat(extraArgs, ['about:blank']), { stdio: 'ignore' });

  const deadline = Date.now() + 20000;
  let wsUrl;
  while (Date.now() < deadline) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/version');
      wsUrl = (await r.json()).webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  if (!wsUrl) { chrome.kill(); throw new Error('chrome did not expose a debugger'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);

  await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable');
  if (media) await S('Emulation.setEmulatedMedia', { features: media });
  await S('Page.navigate', { url });
  await new Promise(r => setTimeout(r, wait));

  const out = { console: [], exceptions: [] };
  for (const e of events) {
    if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type))
      out.console.push(e.params.type + ': ' + e.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    if (e.method === 'Runtime.exceptionThrown')
      out.exceptions.push(e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
    if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
      out.console.push('log: ' + e.params.entry.text);
  }

  if (evaluate) {
    const r = await S('Runtime.evaluate', { expression: evaluate, returnByValue: true, awaitPromise: true });
    out.value = r.exceptionDetails ? 'EVAL ERROR: ' + JSON.stringify(r.exceptionDetails) : r.result.value;
  }
  if (screenshot) {
    const p = fullPage ? { captureBeyondViewport: true } : {};
    if (fullPage) {
      const m = await S('Page.getLayoutMetrics');
      p.clip = { x: 0, y: 0, width: m.cssContentSize.width, height: m.cssContentSize.height, scale: 1 };
    }
    const { data } = await S('Page.captureScreenshot', Object.assign({ format: 'png' }, p));
    fs.writeFileSync(screenshot, Buffer.from(data, 'base64'));
    out.screenshot = screenshot;
  }

  ws.close(); chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  return out;
}

module.exports = { run };
if (require.main === module) {
  const args = JSON.parse(process.argv[2]);
  run(args).then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); },
                 e => { console.error(e); process.exit(1); });
}
