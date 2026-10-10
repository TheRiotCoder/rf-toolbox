// Headless Chrome smoke test over raw CDP (no npm deps). Needs google-chrome + python3.
// Run: node --experimental-websocket tests/browser-smoke.js   (Node 22+: flag not needed)
// Optional: APP_URL=https://... to test a deployed copy (offline step then skipped).
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const PORT = 9334, LOCAL = !process.env.APP_URL, APP = process.env.APP_URL || 'http://127.0.0.1:8766/rf-toolbox/';
const SHOTS = '/tmp/rftoolbox-shots'; fs.mkdirSync(SHOTS, { recursive: true });
fs.rmSync('/tmp/chrome-rft', { recursive: true, force: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// serve the repo under /rf-toolbox/ to mimic the GitHub Pages subpath
let server;
if (LOCAL) {
  const root = '/tmp/rft-serve'; fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root);
  fs.symlinkSync(path.join(__dirname, '..'), root + '/rf-toolbox');
  server = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
}
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/chrome-rft', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const problems = []; let ws, nextId = 1; const pending = new Map(); const listeners = [];
function send(method, params = {}) { const id = nextId++; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej, method })); }
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + expr + ' -> ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
  return r.result.value;
}
function waitEvent(name, ms = 15000) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout ' + name)), ms); listeners.push({ name, fn: p => { clearTimeout(t); res(p); } }); }); }
const results = [];
function check(name, ok, info) { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' -> ' + JSON.stringify(info) : '')); }
const setVal = (sel, v) => `(() => { const e=document.querySelector(${JSON.stringify(sel)}); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); })()`;
const resText = (card, label) => `(() => { const r=[...document.querySelectorAll('#card-${card} .res')].find(x=>x.querySelector('.rl').textContent.startsWith(${JSON.stringify(label)})); return r ? r.querySelector('.rv').textContent : null; })()`;

(async () => {
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch (e) {} await sleep(200); }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(p.method + ': ' + msg.error.message)) : p.res(msg.result); return; }
    const { method, params } = msg;
    if (method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(params.type)) problems.push('console.' + params.type + ': ' + params.args.map(a => a.value !== undefined ? a.value : a.description).join(' '));
    if (method === 'Runtime.exceptionThrown') problems.push('exception: ' + (params.exceptionDetails.exception ? params.exceptionDetails.exception.description : params.exceptionDetails.text));
    if (method === 'Log.entryAdded' && params.entry.level === 'error') problems.push('log.error: ' + params.entry.text + ' ' + (params.entry.url || ''));
    if (method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
    for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].name === method) { const l = listeners[i]; listeners.splice(i, 1); l.fn(params); }
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

  let ld = waitEvent('Page.loadEventFired'); await send('Page.navigate', { url: APP }); await ld; await sleep(1500);
  check('title', (await ev('document.title')) === 'RF Toolbox');
  check('11 tool tiles on home', await ev('document.querySelectorAll(".tile").length') === 11);
  check('disclaimer on home', await ev('document.querySelector(".disclaimer").textContent.includes("engineering estimates")'));
  check('SW active', await ev('navigator.serviceWorker.ready.then(r => !!r.active)'));
  check('manifest parses', await ev(`fetch('manifest.webmanifest').then(r=>r.json()).then(m=>m.icons.length===3 && m.display==='standalone' && m.start_url.startsWith('./'))`));
  check('icons reachable', await ev(`Promise.all(['icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png','icons/favicon-32.png'].map(u=>fetch(u).then(r=>r.ok))).then(a=>a.every(Boolean))`));
  fs.writeFileSync(SHOTS + '/home-dark.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

  const tools = await ev('RFTools.TOOLS.map(t=>t.id)');
  for (const id of tools) {
    await ev(`location.hash='#/${id}'`); await sleep(350);
    const info = await ev(`(() => { const cards=[...document.querySelectorAll('main .card')]; return { cards: cards.length, withRes: cards.filter(c=>c.querySelectorAll('.res').length>0).length, errs: [...document.querySelectorAll('main .err')].map(e=>e.textContent), dashes: [...document.querySelectorAll('main .res .rv')].filter(v=>v.textContent.trim()==='—').length, decimalInputs: document.querySelectorAll('main input[inputmode=decimal]').length }; })()`);
    check(`tool ${id} renders & computes`, info.cards > 0 && info.withRes === info.cards && info.errs.length === 0 && info.dashes === 0 && info.decimalInputs > 0, info);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${SHOTS}/${id}.png`, Buffer.from(shot.data, 'base64'));
  }
  // specific values
  await ev(`location.hash='#/dish'`); await sleep(300);
  check('dish 1.2 m 12 GHz 65% gain', await ev(resText('dish', 'Gain')), '41.70 dBi');
  check('dish 1.2 m 12 GHz 65% gain = 41.70 dBi', (await ev(resText('dish', 'Gain'))) === '41.70 dBi');
  await ev(setVal('#f-dish-d', '4')); await ev(`(() => { const s=document.querySelector('#card-dish .field[data-id=d] .unit'); s.value='ft'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  check('unit selector changes result (4 ft)', (await ev(resText('dish', 'Gain'))) !== '41.70 dBi', await ev(resText('dish', 'Gain')));
  await ev(`location.hash='#/link'`); await sleep(300);
  await ev(setVal('#f-lb-tx', '20')); await ev(setVal('#f-lb-d', '1')); await ev(setVal('#f-lb-txl', '0')); await ev(setVal('#f-lb-rxl', '0')); await ev(setVal('#f-lb-txg', '0')); await ev(setVal('#f-lb-rxg', '0'));
  check('link FSPL 1 km 2.4 GHz', (await ev(resText('lb', 'Free-space'))) === '100.05 dB', await ev(resText('lb', 'Free-space')));
  check('margin colored', await ev(`!!document.querySelector('#card-lb .res.big.good, #card-lb .res.big.warn, #card-lb .res.big.bad')`));
  await ev(setVal('#f-lb-mode', 'enter'));
  check('sensitivity field shown in enter mode', await ev(`!document.querySelector('#card-lb .field[data-id=sens]').hidden && document.querySelector('#card-lb .field[data-id=snr]').hidden`));
  await ev(setVal('#f-lb-d', ''));
  check('blank input shows validation message', await ev(`!!document.querySelector('#card-lb .err')`));
  await ev(setVal('#f-lb-d', '1'));
  check('inputs remembered in localStorage', await ev(`JSON.parse(localStorage.getItem('rft:card:lb')).tx.v === '20'`));
  await ev(`location.hash='#/'`); await sleep(200); await ev(`location.hash='#/link'`); await sleep(300);
  check('inputs restored on revisit', await ev(`document.querySelector('#f-lb-tx').value`) === '20');
  await ev(`document.querySelector('#card-lb .pm').click()`);
  check('± button toggles sign', await ev(`document.querySelector('#f-lb-tx').value`) === '-20');
  await ev(`location.hash='#/vswr'`); await sleep(300);
  check('VSWR 2 -> RL 9.54', (await ev(resText('vswr', 'Return loss'))) === '9.54 dB');
  check('VSWR 2 -> ML 0.512', (await ev(resText('vswr', 'Mismatch loss'))) === '0.512 dB');
  await ev(setVal('#f-vswr-mode', 'rl')); await ev(setVal('#f-vswr-rl', '-3'));
  check('negative return loss -> inline error, no result', await ev(`!!document.querySelector('#card-vswr .err') && document.querySelectorAll('#card-vswr .res').length === 0`), await ev(`(document.querySelector('#card-vswr .err')||{}).textContent`));
  await ev(setVal('#f-vswr-mode', 'g')); await ev(setVal('#f-vswr-g', '1.5'));
  check('|Γ| > 1 -> inline error', await ev(`!!document.querySelector('#card-vswr .err')`));
  await ev(setVal('#f-vswr-mode', 'p')); await ev(setVal('#f-vswr-pf', '0'));
  check('forward power 0 -> inline error', await ev(`!!document.querySelector('#card-vswr .err')`));
  await ev(setVal('#f-vswr-pf', '100')); await ev(setVal('#f-vswr-g', '0.2')); await ev(setVal('#f-vswr-rl', '14')); await ev(setVal('#f-vswr-mode', 'vswr'));
  await ev(`location.hash='#/dish'`); await sleep(300);
  await ev(setVal('#f-dish-eff', '150'));
  check('dish efficiency 150% -> inline error', await ev(`!!document.querySelector('#card-dish .err')`), await ev(`(document.querySelector('#card-dish .err')||{}).textContent`));
  await ev(setVal('#f-dish-eff', '65')); await ev(setVal('#f-dish-fd', '0'));
  check('dish F/D 0 -> inline error', await ev(`!!document.querySelector('#card-dish .err')`));
  await ev(setVal('#f-dish-fd', '0.4'));
  await ev(`location.hash='#/link'`); await sleep(300);
  await ev(setVal('#f-lb-d', '0'));
  check('link distance 0 -> inline error', await ev(`!!document.querySelector('#card-lb .err')`));
  await ev(setVal('#f-lb-d', '1'));
  await ev(`location.hash='#/units'`); await sleep(300);
  await ev(setVal('#f-pwr-unit', 'W')); await ev(setVal('#f-pwr-x', '-1'));
  check('negative watts -> inline error', await ev(`!!document.querySelector('#card-pwr .err')`), await ev(`(document.querySelector('#card-pwr .err')||{}).textContent`));
  await ev(setVal('#f-pwr-x', '0')); await ev(setVal('#f-pwr-unit', 'dBm'));
  await ev(`location.hash='#/prop'`); await sleep(300);
  check('k-factor default 4/3 parsed (10 m + 0 m horizon 13.03 km)', await (async () => { await ev(setVal('#f-hor-h1', '10')); await ev(setVal('#f-hor-h2', '0')); return (await ev(resText('hor', 'Horizon antenna 1'))) === '13.03 km'; })(), await ev(resText('hor', 'Horizon antenna 1')));
  await ev(`location.hash='#/pads'`); await sleep(300);
  check('10 dB 50Ω Pi pad 96.25/71.15', (await ev(resText('pad', 'Shunt resistors'))) === '96.25 Ω' && (await ev(resText('pad', 'Series resistor'))) === '71.15 Ω');
  await ev(setVal('#f-lnet-rl', '1000'));
  check('L-network 50->1000 Ω @14.2 MHz BW = 2f/Q = 6.515 MHz', (await ev(resText('lnet', 'Approx. −3 dB bandwidth'))) === '6.515 MHz', await ev(resText('lnet', 'Approx. −3 dB bandwidth')));
  await ev(setVal('#f-lnet-rl', '200'));
  await ev(`location.hash='#/antenna'`); await sleep(300);
  await ev(setVal('#f-wire-f', '14.2'));
  check('full-wave loop 14.2 MHz = 70.77 ft', (await ev(`[...document.querySelectorAll('#card-wire .res')].filter(r=>r.querySelector('.rl').textContent==='Loop').map(r=>r.querySelector('.rv').textContent).join('|')`)).includes('70.77 ft'));
  await ev(setVal('#f-wire-f', '146'));
  await ev(`location.hash='#/noise'`); await sleep(300);
  check('kTB 1 MHz = -113.98 dBm', (await ev(resText('ktb', 'Noise floor'))) === '−113.98 dBm', await ev(resText('ktb', 'Noise floor')));
  await ev(setVal('#f-ktb-t', '50')); await ev(setVal('#f-ktb-nf', '1'));
  check('noise floor 50 K source + 1 dB NF = -117.63 dBm (k(Ts+Te)B)', (await ev(resText('ktb', 'Noise floor'))) === '−117.63 dBm', await ev(resText('ktb', 'Noise floor')));
  await ev(setVal('#f-ktb-t', '-5'));
  check('negative temperature -> inline error + red field', await ev(`!!document.querySelector('#card-ktb .err') && document.querySelector('#card-ktb .field[data-id=t]').classList.contains('invalid')`), await ev(`(document.querySelector('#card-ktb .err')||{}).textContent`));
  await ev(setVal('#f-ktb-t', '290')); await ev(setVal('#f-ktb-nf', '0'));
  await ev(`location.hash='#/misc'`); await sleep(300);
  check('LC 10 µH 100 pF = 5.033 MHz', (await ev(resText('lc', 'Resonant'))) === '5.033 MHz', await ev(resText('lc', 'Resonant')));
  // cascade editing
  await ev(`location.hash='#/cascade'`); await sleep(300);
  check('cascade default 4 stages, NF 1.61 dB', await ev(`document.querySelectorAll('.stage').length`) === 4 && (await ev(resText('cascade', 'Cascaded noise'))) === '1.61 dB', await ev(resText('cascade', 'Cascaded noise')));
  await ev(`document.querySelector('[data-add=amp]').click()`); await sleep(100);
  check('add stage', await ev(`document.querySelectorAll('.stage').length`) === 5);
  await ev(`document.querySelectorAll('.stage')[4].querySelector('[data-a=up]').click()`); await sleep(100);
  check('reorder stage', await ev(`document.querySelectorAll('.stage')[3].querySelector('.sname').value`) === 'Amp');
  await ev(`document.querySelectorAll('.stage')[3].querySelector('[data-a=del]').click()`); await sleep(100);
  check('remove stage -> back to 1.61 dB', await ev(`document.querySelectorAll('.stage').length`) === 4 && (await ev(resText('cascade', 'Cascaded noise'))) === '1.61 dB');
  await ev(`(() => { const i=document.querySelectorAll('.stage')[1].querySelector('[data-k=gain]'); i.value='-3'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  check('passive stage NF follows loss', await ev(`document.querySelectorAll('.stage')[1].querySelector('[data-k=nf]').value`) === '3');
  check('cascade per-stage table', await ev(`document.querySelectorAll('#card-cascade tbody tr').length`) === 4);
  check('cascade SFDR (both definitions) shown', (await ev(resText('cascade', 'SFDR (re noise'))) !== null && (await ev(resText('cascade', 'SFDR (re MDS'))) !== null);
  check('cascade persisted', await ev(`JSON.parse(localStorage.getItem('rft:cascade')).stages[1].gain`) === '-3');
  await ev(`(() => { const i=document.querySelectorAll('.stage')[1].querySelector('[data-k=gain]'); i.value='3'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  check('passive stage with positive gain -> inline error', await ev(`!!document.querySelector('#card-cascade .err')`), await ev(`(document.querySelector('#card-cascade .err')||{}).textContent`));
  await ev(`(() => { const i=document.querySelectorAll('.stage')[0].querySelector('[data-k=ip3]'); i.value='abc'; document.querySelectorAll('.stage')[1].querySelector('[data-k=gain]').value='-3'; document.querySelectorAll('.stage')[1].querySelector('[data-k=gain]').dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  check('non-numeric IP3 -> inline error', await ev(`(document.querySelector('#card-cascade .err')||{}).textContent || ''`).then(t => /not a number/.test(t)));
  await ev(`(() => { const i=document.querySelectorAll('.stage')[0].querySelector('[data-k=ip3]'); i.value='30'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  check('cascade recovers after fixing input', await ev(`!document.querySelector('#card-cascade .err')`));
  fs.writeFileSync(SHOTS + '/cascade-edited.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'));
  // copy text builder works (clipboard may be blocked in headless; just ensure no exception)
  await ev(`document.querySelector('#card-cascade .act-copy').click()`); await sleep(300);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await ev(`location.hash='#/link'`); await sleep(300);
  fs.writeFileSync(SHOTS + '/link-light.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  const onlineProblems = problems.slice();

  if (LOCAL) {
    server.kill('SIGKILL'); await sleep(500);
    ld = waitEvent('Page.loadEventFired'); await send('Page.reload', {}); await ld; await sleep(1200);
    check('offline reload works (server stopped)', await ev(`!!document.querySelector('#card-lb') && !!window.RF`));
    check('SW controls page', await ev(`!!navigator.serviceWorker.controller`));
    await ev(`location.hash='#/coax'`); await sleep(300);
    check('offline tool computes', await ev(`document.querySelectorAll('#card-coax .res').length > 0`));
  }
  console.log('Console/log problems:', problems);
  const fails = results.filter(r => !r).length;
  console.log(`\n${results.length - fails}/${results.length} checks passed`);
  ws.close(); chrome.kill('SIGKILL'); if (server) server.kill();
  process.exit(fails || onlineProblems.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); console.log('problems', problems); chrome.kill('SIGKILL'); if (server) server.kill(); process.exit(2); });
