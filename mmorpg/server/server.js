// Nightglade Online — multiplayer server.
// Serves the game client and runs the same authoritative simulation the browser uses for solo play.
//   cd mmorpg && npm install && npm start        (PORT=8080 BOTS=4 by default)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Sim } from '../src/shared/sim.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const BOTS = process.env.BOTS !== undefined ? Number(process.env.BOTS) : 4;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 60;
const SAVE_FILE = path.join(ROOT, 'server', 'data', 'characters.json');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.mesh': 'application/octet-stream', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// ---------------------------------------------------------------- persistence
let saves = {};
try { saves = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch { /* first run */ }
let dirty = false;
function flush() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true });
    fs.writeFileSync(SAVE_FILE + '.tmp', JSON.stringify(saves));
    fs.renameSync(SAVE_FILE + '.tmp', SAVE_FILE);
  } catch (e) { console.error('save failed:', e.message); }
}

// ---------------------------------------------------------------- static files
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(ROOT, '.' + p);
  const rel = path.relative(ROOT, file);
  // only the client: never the save data, dependencies, dev tools or dotfiles
  if (rel.startsWith('..') || path.isAbsolute(rel) || /(^|[\\/])(\.|node_modules|server|dev)/.test(rel) || !MIME[path.extname(file)] || rel === 'package.json' || rel === 'package-lock.json') {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)], 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- game
const sim = new Sim({ bots: BOTS, seed: Date.now() & 0xffffff });
const clients = new Set();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  const c = { ws, pid: null, token: null, budget: 60, alive: true };
  clients.add(c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (raw, isBinary) => {
    if (isBinary || --c.budget < 0) return;
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!c.pid) {
      if (m.t !== 'hello') return;
      if (sim.players.size - BOTS >= MAX_PLAYERS) { ws.close(1013, 'server full'); return; }
      const token = typeof m.token === 'string' && /^[\w-]{8,64}$/.test(m.token) ? m.token : null;
      // one session per character: a newer login replaces the older one
      if (token) for (const o of clients) if (o !== c && o.token === token) o.ws.close(4000, 'logged in elsewhere');
      c.token = token;
      c.pid = sim.addPlayer({ name: m.name, look: m.look, save: token ? saves[token] : null });
      ws.send(JSON.stringify(sim.init(c.pid)));
      console.log(`+ ${sim.players.get(c.pid).name} (${clients.size} connected)`);
      return;
    }
    try { sim.handle(c.pid, m); } catch (e) { console.error('handle:', e); }
  });
  ws.on('close', () => {
    clients.delete(c);
    if (!c.pid) return;
    const save = sim.removePlayer(c.pid);
    if (c.token && save) { saves[c.token] = save; dirty = true; }
    console.log(`- ${save ? save.name : c.pid} (${clients.size} connected)`);
  });
  ws.on('error', () => {});
});

const STEP = 0.05;
let last = Date.now(), acc = 0, tickNo = 0;
setInterval(() => {
  const now = Date.now();
  acc = Math.min(0.5, acc + (now - last) / 1000); last = now;
  while (acc >= STEP) {
    acc -= STEP;
    try { sim.tick(STEP); } catch (e) { console.error('tick:', e); }
    tickNo++;
    if (tickNo % 2) continue;
    const n = sim.players.size;
    for (const c of clients) {
      if (!c.pid || c.ws.readyState !== 1) continue;
      const p = sim.players.get(c.pid);
      if (c.ws.bufferedAmount > 262144) { if (p && p.evq.length > 400) p.evq.length = 0; continue; } // slow link: skip this snapshot
      const snap = sim.snapshot(c.pid);
      if (!snap) continue;
      snap.n = n;
      c.ws.send(JSON.stringify(snap));
    }
  }
}, 25);

setInterval(() => { for (const c of clients) c.budget = 60; }, 1000);
setInterval(() => {
  for (const c of clients) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; try { c.ws.ping(); } catch { /* closing */ } }
  for (const c of clients) if (c.pid && c.token) { const s = sim.exportSave(c.pid); if (s) { saves[c.token] = s; dirty = true; } }
  flush();
}, 30000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  for (const c of clients) if (c.pid && c.token) { const s = sim.exportSave(c.pid); if (s) { saves[c.token] = s; dirty = true; } }
  flush();
  process.exit(0);
});

server.listen(PORT, () => console.log(`Nightglade Online listening on http://localhost:${PORT}  (bots: ${BOTS})`));
