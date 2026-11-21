// Usage: node server.mjs   -> http://localhost:5174
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as centrix from './lib/centrix.mjs';
import { repairSpeech } from './public/repair-language.js';
import * as mock from './lib/mock-partner.mjs';

process.chdir(fileURLToPath(new URL('.', import.meta.url))); // data paths are relative to this folder
if (existsSync('.env')) process.loadEnvFile('.env');
process.env.TZ ||= 'Europe/Amsterdam'; // slots and times are Maastricht local time
const PORT = +process.env.PORT || 5174;

// Signed URL for the browser: the API key never leaves the server.
async function agentSession() {
  if (!process.env.ELEVENLABS_API_KEY || !existsSync('data/agent.json')) throw new centrix.HttpError(503, 'agent not set up: add ELEVENLABS_API_KEY to .env and run node scripts/agent.mjs');
  const { agent_id } = JSON.parse(await readFile('data/agent.json', 'utf8'));
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agent_id}`, { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } });
  if (!res.ok) throw new centrix.HttpError(502, `ElevenLabs signed URL failed: ${res.status}`);
  return { signed_url: (await res.json()).signed_url };
}
centrix.config.origin = `http://127.0.0.1:${PORT}`;
await centrix.load();

const audioCache = new Map();
async function repairAudio(caseId, language) {
  const item=centrix.db.cases.find(entry=>entry.id===caseId&&entry.kind!=='offer');
  if(!item)throw new centrix.HttpError(404,'Repair case not found.');
  const narration=repairSpeech(item,language);
  if(!narration)throw new centrix.HttpError(400,'Unsupported update language.');
  if(!process.env.ELEVENLABS_API_KEY||!existsSync('data/agent.json')) {
    throw new centrix.HttpError(503,'Audio updates require the configured ElevenLabs agent.');
  }
  const {voice_id}=JSON.parse(await readFile('data/agent.json','utf8'));
  const key=JSON.stringify([voice_id,language,narration]);
  if(!audioCache.has(key)){
    if(audioCache.size>=64)audioCache.delete(audioCache.keys().next().value);
    const pending=(async()=>{
      const res=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voice_id)+'?output_format=mp3_22050_32',{
        method:'POST',
        headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'content-type':'application/json'},
        body:JSON.stringify({text:narration,model_id:'eleven_flash_v2_5',language_code:language}),
        signal:AbortSignal.timeout(15000)
      });
      if(!res.ok)throw new centrix.HttpError(502,'ElevenLabs could not generate this update. The written case is still available.');
      return Buffer.from(await res.arrayBuffer());
    })();
    audioCache.set(key,pending);
    pending.catch(()=>{if(audioCache.get(key)===pending)audioCache.delete(key);});
  }
  return audioCache.get(key);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const json = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };

const routes = [
  ['GET', /^\/api\/state$/, () => ({ ...centrix.db, partners: centrix.partners })],
  ['POST', /^\/api\/reset$/, async () => { await centrix.load(true); centrix.emit('system.reset'); return { ok: true }; }],
  ['GET', /^\/api\/agent\/session$/, () => agentSession()],
  ['GET', /^\/api\/units\/(\w+)\/context$/, (m) => centrix.unitContext(m[1])],
  ['POST', /^\/api\/cases$/, (m, b) => centrix.createCase(b)],
  ['POST', /^\/api\/trigger$/, (m, b) => centrix.trigger(b)],
  ['POST', /^\/api\/cases\/(\w+)\/accept$/, (m, b) => centrix.acceptOffer(m[1], b)],
  ['POST', /^\/api\/cases\/(\w+)\/messages$/, (m, b) => centrix.addMessage(m[1], b)],
  ['POST', /^\/api\/cases\/(\w+)\/diagnosis$/, (m, b) => centrix.diagnose(m[1], b)],
  ['POST', /^\/api\/cases\/(\w+)\/approve$/, (m, b) => centrix.approve(m[1], b)],
  ['GET', /^\/api\/cases\/(\w+)\/slots$/, (m) => centrix.slots(m[1])],
  ['GET', /^\/api\/cases\/(\w+)\/booking-disclosure$/, (m) => centrix.bookingDisclosure(m[1])],
  ['POST', /^\/api\/cases\/(\w+)\/book$/, (m, b) => centrix.book(m[1], b)],
  // Connector: the one webhook every partner reports to.
  ['POST', /^\/connector\/status$/, (m, b) => centrix.partnerStatus(b)],
  // Fictitious partners' own systems.
  ['POST', /^\/mock\/(\w+)\/quote$/, (m, b) => mock.quote(m[1], b)],
  ['GET', /^\/mock\/(\w+)\/slots$/, (m) => mock.slots(m[1])],
  ['POST', /^\/mock\/(\w+)\/orders$/, (m, b) => mock.order(m[1], b)],
  ['GET', /^\/mock\/(\w+)\/jobs$/, (m) => mock.jobs(m[1])],
  ['POST', /^\/mock\/(\w+)\/jobs\/(\w+)\/status$/, (m, b) => mock.updateJob(m[1], m[2], b)],
];

async function body(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 1e6) throw new centrix.HttpError(413, 'body too large'); }
  try { return s ? JSON.parse(s) : {}; } catch { throw new centrix.HttpError(400, 'invalid JSON'); }
}

async function serveFile(res, path) {
  const root = normalize('public');
  const file = normalize(join(root, path));
  if (!file.startsWith(root) || !existsSync(file)) return json(res, 404, { error: 'not found' });
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
}

createServer(async (req, res) => {
  const hosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
  if (!hosts.has(req.headers.host)) return json(res, 403, { error: 'Use the local Centrix address.' });
  if (req.headers.origin && ![...hosts].some(host => req.headers.origin === 'http://' + host)) {
    return json(res, 403, { error: 'Cross-origin requests are disabled.' });
  }
  const url = new URL(req.url, 'http://x');
  try {
    const audioMatch=url.pathname.match(/^\/api\/cases\/(case_\d+)\/audio$/);
    if(req.method==='GET'&&audioMatch){
      const audio=await repairAudio(audioMatch[1],url.searchParams.get('language')||'en');
      res.writeHead(200,{'content-type':'audio/mpeg','cache-control':'no-store'});
      return res.end(audio);
    }
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
      centrix.bus.on('event', send);
      req.on('close', () => centrix.bus.off('event', send));
      return;
    }
    for (const [method, re, handler] of routes) {
      const m = url.pathname.match(re);
      if (m && req.method === method) return json(res, 200, await handler(m, method === 'POST' ? await body(req) : null));
    }
    return serveFile(res, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  } catch (e) {
    if (!e.status) console.error(e);
    json(res, e.status || 500, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Centrix demo on http://127.0.0.1:${PORT}`));
