// Visit every page in one browser profile, open the trace on the last one, screenshot it.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [dir, out] = process.argv.slice(2);
const chrome = spawn('chromium', ['--headless=new', '--remote-debugging-port=9333', '--user-data-dir=/tmp/walk-prof', '--window-size=1440,1000', '--allow-file-access-from-files', 'about:blank']);
await new Promise(r => setTimeout(r, 2500));
const tabs = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = {};
ws.onmessage = m => { const d = JSON.parse(m.data); if (pending[d.id]) { pending[d.id](d.result); delete pending[d.id]; } };
const send = (method, params = {}) => new Promise(r => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const p of ['index', 'blog', 'cv', 'contact']) { await send('Page.navigate', { url: `${dir}/${p}.html` }); await sleep(1500); }
await send('Runtime.evaluate', { expression: `document.querySelector('details').open = true; document.querySelectorAll('.rise').forEach(e=>e.classList.add('in')); scrollTo(0, document.body.scrollHeight)` });
await sleep(1500);
const { result } = await send('Runtime.evaluate', { expression: 'document.getElementById("trace").innerText' });
console.log(result.value);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
chrome.kill(); process.exit(0);
