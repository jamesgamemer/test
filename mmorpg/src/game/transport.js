import { Sim } from '../shared/sim.js';

const SAVE_KEY = 'nightglade.save.v1';
export function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { return null; } }
export function storeSave(s) { try { if (s) localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* private mode */ } }
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

// Runs the whole world in this tab: same simulation the server uses, with AI adventurers for company.
export class LocalTransport {
  constructor({ bots = 6 } = {}) {
    this.online = false;
    this.interval = 0.05;
    this.sim = new Sim({ bots, seed: (Date.now() & 0xffff) + 7 });
    this.acc = 0;
    this.onMessage = () => {};
    this.saveAt = 0;
  }
  async connect({ name, look }) {
    const save = loadSave();
    this.pid = this.sim.addPlayer({ name, look, save });
    this.onMessage(this.sim.init(this.pid));
    this.onMessage(this.sim.snapshot(this.pid));
  }
  send(msg) { this.sim.handle(this.pid, msg); }
  update(dt) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.interval && n++ < 5) {
      this.acc -= this.interval;
      this.sim.tick(this.interval);
      this.onMessage(this.sim.snapshot(this.pid));
    }
    if (this.acc > 0.5) this.acc = 0;
    if (this.sim.time > this.saveAt) { this.saveAt = this.sim.time + 8; this.persist(); }
  }
  persist() { storeSave(this.sim.exportSave(this.pid)); }
  playerCount() { return this.sim.players.size; }
  close() { this.persist(); }
}

// Thin JSON-over-WebSocket link to server/server.js.
export class WsTransport {
  constructor(url) {
    this.url = url;
    this.online = true;
    this.interval = 0.1;
    this.onMessage = () => {};
    this.onClose = () => {};
    this.count = 1;
  }
  static probe(url, timeout = 1800) {
    return new Promise((resolve) => {
      let done = false, ws;
      const fin = (ok) => { if (done) return; done = true; if (!ok && ws) { try { ws.close(); } catch { /* ignore */ } } resolve(ok ? ws : null); };
      try { ws = new WebSocket(url); } catch { return resolve(null); }
      ws.onopen = () => fin(true);
      ws.onerror = () => fin(false);
      ws.onclose = () => fin(false);
      setTimeout(() => fin(false), timeout);
    });
  }
  connect({ name, look, socket }) {
    return new Promise((resolve, reject) => {
      const ws = this.ws = socket;
      let token = null;
      try { token = localStorage.getItem('nightglade.token'); if (!token) { token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('nightglade.token', token); } } catch { token = 'anon' + Math.random().toString(36).slice(2); }
      let ready = false;
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'init') { ready = true; resolve(); }
        if (m.n) this.count = m.n;
        this.onMessage(m);
      };
      ws.onclose = () => { if (!ready) reject(new Error('closed')); else this.onClose(); };
      ws.send(JSON.stringify({ t: 'hello', name, look, token }));
      setTimeout(() => { if (!ready) reject(new Error('timeout')); }, 5000);
    });
  }
  send(msg) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  update() {}
  persist() {}
  playerCount() { return this.count; }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}
