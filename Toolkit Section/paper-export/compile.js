// Compile booth screens into Paper-ready HTML.
//
//   node compile.js <stateName>      -- one screen, for checking
//   node compile.js --all            -- every screen in the flow
//
// Writes out/<nn>-<name>.html plus out/index.json. Assets land in assets/ and
// are referenced as paper-asset:// absolute paths, which Paper resolves locally
// and uploads into the file, so nothing depends on this folder afterwards.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const os = require('os');

const SERIALIZER = require('./serializer.js');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = 'file:///C:/Toolkit/Toolkit%20Section/index.html?booth';
const OUT = path.join(__dirname, 'out');
const ASSETS = path.join(__dirname, 'assets');

const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg',
              'image/gif': 'gif', 'image/svg+xml': 'svg' };

function saveAsset(uri) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(uri);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
  const file = path.join(ASSETS, hash + '.' + (EXT[m[1]] || 'png'));
  if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
  return 'paper-asset://' + file.replace(/\\/g, '/');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(ASSETS, { recursive: true });

  const port = 9600 + Math.floor(Math.random() * 300);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port,
    '--window-size=360,800', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl; const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { wsUrl = (await (await fetch('http://127.0.0.1:' + port + '/json/version')).json()).webSocketDebuggerUrl; if (wsUrl) break; } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Page.navigate', { url: URL_ });
  await new Promise(r => setTimeout(r, 3500));

  const ev = async expr => {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception).slice(0, 300));
    return r.result.value;
  };
  const pause = ms => new Promise(r => setTimeout(r, ms));

  const index = [];
  let n = 0;
  async function capture(name) {
    const raw = JSON.parse(await ev(SERIALIZER));
    let html = raw.html;
    raw.assets.forEach((uri, i) => {
      const ref = uri.startsWith('data:') ? saveAsset(uri) : uri;
      html = html.split('__ASSET:' + i + '__').join(ref || '');
    });
    const file = String(n).padStart(2, '0') + '-' + name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.html';
    fs.writeFileSync(path.join(OUT, file), html);
    const nodes = (html.match(/<div /g) || []).length + (html.match(/<svg/g) || []).length;
    index.push({ i: n, name, file, bytes: html.length, nodes });
    console.log(String(n).padStart(2, '0'), name.padEnd(24), String(html.length).padStart(7) + 'b', String(nodes).padStart(4) + ' nodes');
    n++;
  }

  const only = process.argv[2] !== '--all' ? process.argv[2] : null;

  if (only === 'probe') {
    await ev('openDemo("toolkit")'); await pause(1600);
    for (let i = 1; i < 7; i++) { await ev('next()'); await pause(1600); }
    await capture('toolkit step 6');
  } else {
    await capture('home');
    await ev('goAgents()'); await pause(900); await capture('agent picker');
    const agents = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.agentpick [data-agent]')].map(e=>e.dataset.agent))`));
    await ev(`goOnboard(${JSON.stringify(agents[0])})`); await pause(900); await capture('onboard ' + agents[0]);
    await ev('goHome()'); await pause(600); await ev('goTier2()'); await pause(900); await capture('tier 2 builders');

    for (const key of JSON.parse(await ev('JSON.stringify(Object.keys(DEMOS))'))) {
      await ev('goHome()'); await pause(500);
      await ev(`openDemo(${JSON.stringify(key)})`); await pause(1600);
      const total = await ev('STEPS.length');
      await capture(key + ' step 0');
      for (let s = 1; s < total; s++) { await ev('next()'); await pause(1700); await capture(key + ' step ' + s); }
    }
  }

  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
  console.log('\\n' + index.length + ' screens, ' +
    index.reduce((a, b) => a + b.nodes, 0) + ' nodes total');
  ws.close(); chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch(e => { console.error('COMPILE FAILED:', e.message); process.exit(1); });
