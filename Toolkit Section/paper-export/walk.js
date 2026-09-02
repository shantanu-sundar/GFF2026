// Walk the booth flow and capture every screen state.
//
// The booth has no visible controls -- it advances by tapping the screen -- so
// the walk drives the page's own navigation functions and the same next() the
// tap handler uses. For each state it saves a 360x800 PNG of .screen and a
// structural note, which together become the manifest for the Paper build.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = 'file:///C:/Toolkit/Toolkit%20Section/index.html?booth';
const OUT = path.join(__dirname, 'screens');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const port = 9400 + Math.floor(Math.random() * 300);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port,
    '--window-size=360,800', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/version');
      wsUrl = (await r.json()).webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0; const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);

  await S('Page.enable'); await S('Runtime.enable');
  await S('Page.navigate', { url: URL_ });
  await new Promise(r => setTimeout(r, 3500));

  const ev = async expr => {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(expr.slice(0, 60) + ' -> ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };

  const manifest = [];
  let n = 0;
  async function shot(name, note) {
    const box = await ev(`(()=>{const b=document.querySelector('.screen').getBoundingClientRect();
      return JSON.stringify({x:b.x,y:b.y,w:b.width,h:b.height})})()`);
    const b = JSON.parse(box);
    const { data } = await S('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1 },
    });
    const file = String(n).padStart(2, '0') + '-' + name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png';
    fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
    manifest.push({ i: n, name, file, note, size: [b.w, b.h] });
    console.log(String(n).padStart(2, '0'), name.padEnd(34), note);
    n++;
  }

  const structure = () => ev(`(()=>{
    const q=s=>document.querySelector(s);
    const vis=e=>e&&getComputedStyle(e).display!=='none'&&!e.classList.contains('gone');
    return JSON.stringify({
      screen: vis(q('.home'))?'home':vis(q('.agentpick'))?'agents':vis(q('.onboard'))?'onboard':'demo',
      thread: q('#thread')?q('#thread').children.length:0,
      ledger: q('#panel')?q('#panel').children.length:0,
      chip: q('#toolchip')?q('#toolchip').textContent:'',
      composer: q('#composer')?q('#composer').textContent:''
    })})()`);

  // ---- the flow -------------------------------------------------------
  await shot('home', await structure());

  await ev('goAgents()'); await new Promise(r => setTimeout(r, 900));
  await shot('agent picker', await structure());

  const agents = await ev(`JSON.stringify([...document.querySelectorAll('.agentpick [data-agent]')].map(e=>e.dataset.agent))`);
  const firstAgent = JSON.parse(agents)[0];
  await ev(`goOnboard(${JSON.stringify(firstAgent)})`); await new Promise(r => setTimeout(r, 900));
  await shot('onboard ' + firstAgent, await structure());

  await ev('goHome()'); await new Promise(r => setTimeout(r, 700));
  await ev('goTier2()'); await new Promise(r => setTimeout(r, 900));
  await shot('tier 2 (builders)', await structure());

  // Every demo, walked to its end.
  const demos = JSON.parse(await ev('JSON.stringify(Object.keys(DEMOS))'));
  for (const key of demos) {
    await ev('goHome()'); await new Promise(r => setTimeout(r, 500));
    await ev(`openDemo(${JSON.stringify(key)})`);
    await new Promise(r => setTimeout(r, 1600));
    const total = await ev('STEPS.length');
    await shot(key + ' step 0', await structure());
    for (let s = 1; s < total; s++) {
      await ev('next()');
      await new Promise(r => setTimeout(r, 1700));
      await shot(key + ' step ' + s, await structure());
    }
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log('\n' + manifest.length + ' screens -> ' + OUT);
  ws.close(); chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch(e => { console.error('WALK FAILED:', e.message); process.exit(1); });
