// Authoritative world simulation. Runs unchanged in the browser (solo / offline) and in Node (server).
import { buildLayout, mulberry32, POIS, SPAWN, CAMP, POND, clamp } from './world.js';
import {
  SKILLS, MOBS, SPAWNS, QUESTS, SHOP, MAX_LEVEL, PLAYER_SPEED, INV_SIZE,
  xpNeed, baseStats, mobStats, makeItem, rollRarity,
} from './data.js';

const BOT_NAMES = ['Lyria', 'Kaedric', 'Mirel', 'Thorne', 'Sylwen', 'Bram', 'Isolde', 'Renji', 'Vesper', 'Orin'];
export const BOT_CHAT_LINES = 18; // text lives in the client's i18n
const HUNT_SPOTS = [
  [[-2, 9], [-11, 17], [6, 17], [-17, -7], [4, -8]],
  [[-21, 52], [-15, 62], [11, -55], [5, -62]],
  [[-50, 5], [-58, -9], [-46, -15], [-62, 10]],
];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;

// Shared with the client so a dash lands in the same place on both sides.
export function dashDest(layout, x, z, dx, dz, d) {
  const step = 0.5;
  for (let s = 0; s < d; s += step) {
    const [nx, nz] = layout.collide(x + dx * step, z + dz * step, 0.4);
    if (Math.hypot(nx - x, nz - z) < 0.15) break;
    x = nx; z = nz;
  }
  return [x, z];
}

export class Sim {
  constructor({ bots = 6, seed = 7 } = {}) {
    this.layout = buildLayout();
    this.rnd = mulberry32(seed);
    this.time = 0;
    this.seq = 1;
    this.players = new Map();
    this.mobs = new Map();
    this.loot = new Map();
    this.projs = [];
    this.pending = [];
    this.gathers = [];
    this.events = [];
    this.npcs = [
      { id: 'n1', role: 'elder', x: CAMP.elder.x, z: CAMP.elder.z, rot: CAMP.elder.rot },
      { id: 'n2', role: 'merchant', x: CAMP.merchant.x, z: CAMP.merchant.z, rot: CAMP.merchant.rot },
    ];
    this.chatAt = 10;
    this.greet = [];
    this._spawnWorld();
    for (let i = 0; i < bots; i++) this._addBot(i);
  }

  // ------------------------------------------------------------ setup
  _spawnWorld() {
    const rnd = this.rnd, L = this.layout;
    for (const s of SPAWNS) {
      for (let i = 0; i < s.n; i++) {
        let x = s.x, z = s.z;
        for (let tries = 0; tries < 40 && s.r > 0; tries++) {
          const a = rnd() * 6.283, d = Math.sqrt(rnd()) * s.r;
          x = s.x + Math.cos(a) * d; z = s.z + Math.sin(a) * d;
          if (L.blocked(x, z, 0.9)) continue;
          if (Math.hypot(x - POIS.camp.x, z - POIS.camp.z) < POIS.camp.r + 9) continue;
          if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 14) continue;
          if (Math.hypot(x - POIS.gate.x, z - POIS.gate.z) < POIS.gate.r + 3) continue;
          break;
        }
        const lvl = s.lvl[0] + Math.floor(rnd() * (s.lvl[1] - s.lvl[0] + 1));
        this._mob(s.kind, lvl, x, z);
      }
    }
    const H = POIS.hollow;
    let guard = 0;
    while (this.gathers.length < 12 && guard++ < 400) {
      const a = rnd() * 6.283, d = 4 + rnd() * 16;
      const x = H.x + Math.cos(a) * d, z = H.z + Math.sin(a) * d;
      if (L.blocked(x, z, 0.8) || Math.hypot(x - POND.x, z - POND.z) < POND.r + 1) continue;
      if (this.gathers.some((g) => Math.hypot(g.x - x, g.z - z) < 4)) continue;
      this.gathers.push({ id: 'g' + this.seq++, x, z, avail: true, at: 0 });
    }
  }

  _mob(kind, lvl, x, z) {
    const s = mobStats(kind, lvl);
    const m = {
      id: 'm' + this.seq++, kind, lvl, x, z, rot: this.rnd() * 6.283, hx: x, hz: z,
      hp: s.mhp, mhp: s.mhp, atk: s.atk, def: s.def, xp: s.xp,
      st: 'idle', tgt: null, nextAtk: 0, scanAt: this.rnd() * 0.3, wanderAt: this.rnd() * 5, wx: x, wz: z,
      slowUntil: 0, busyUntil: 0, threat: new Map(), dead: false, diedAt: -99, respawnAt: 0, moving: false,
      sp1: 0, sp2: 0, enraged: false, r: MOBS[kind].radius,
    };
    this.mobs.set(m.id, m);
    return m;
  }

  addPlayer({ name = 'Wanderer', look = 0, save = null, bot = false } = {}) {
    const rnd = this.rnd;
    const p = {
      id: 'p' + this.seq++, name: cleanName(name), look: clamp(look | 0, 0, 4), bot,
      x: SPAWN.x + (rnd() - 0.5) * 2, z: SPAWN.z + (rnd() - 0.5) * 2, rot: 1.2,
      lvl: 1, xp: 0, gold: 0, inv: [], eq: { weapon: null, armor: null, trinket: null }, pots: { hp: 3, mp: 2 },
      quest: { i: 0, s: 'offer', n: 0 }, cds: {}, hp: 1, mp: 1, dead: false, deadAt: 0, moving: false,
      lastCombat: -99, invuln: 0, lastChat: -9, lastMove: 0, slackUntil: 0, combo: 0, dirty: true, evq: [], kills: 0,
    };
    if (save && typeof save === 'object') {
      p.lvl = clamp(save.lvl | 0, 1, MAX_LEVEL); p.xp = Math.max(0, save.xp | 0); p.gold = clamp(save.gold | 0, 0, 1e7);
      if (Array.isArray(save.inv)) p.inv = save.inv.filter(validItem).slice(0, INV_SIZE);
      for (const s of ['weapon', 'armor', 'trinket']) if (validItem(save.eq && save.eq[s]) && save.eq[s].slot === s) p.eq[s] = save.eq[s];
      if (save.pots) p.pots = { hp: clamp(save.pots.hp | 0, 0, 20), mp: clamp(save.pots.mp | 0, 0, 20) };
      if (save.quest) p.quest = { i: clamp(save.quest.i | 0, 0, QUESTS.length), s: ['offer', 'active', 'ready', 'done'].includes(save.quest.s) ? save.quest.s : 'offer', n: Math.max(0, save.quest.n | 0) };
      p.kills = save.kills | 0;
    } else if (!bot) {
      p.eq.weapon = makeItem(rnd, 'weapon', 1, 0);
    }
    this._recalc(p);
    p.hp = p.mhp; p.mp = p.mmp;
    this.players.set(p.id, p);
    if (!bot) {
      this.emit({ e: 'join', name: p.name, g: 1 });
      this.greet.push({ at: this.time + 2 + rnd() * 3, name: p.name });
    }
    return p.id;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return null;
    const save = this.exportSave(id);
    this.players.delete(id);
    for (const m of this.mobs.values()) { m.threat.delete(id); if (m.tgt === id) m.tgt = null; }
    for (const [k, l] of this.loot) if (l.owner === id) this.loot.delete(k);
    if (!p.bot) this.emit({ e: 'leave', name: p.name, g: 1 });
    return save;
  }

  exportSave(id) {
    const p = this.players.get(id);
    if (!p) return null;
    return { name: p.name, look: p.look, lvl: p.lvl, xp: p.xp, gold: p.gold, inv: p.inv, eq: p.eq, pots: p.pots, quest: p.quest, kills: p.kills };
  }

  _recalc(p) {
    const b = baseStats(p.lvl), e = p.eq;
    let atk = b.atk, def = b.def, mhp = b.mhp, mmp = b.mmp, crit = b.crit;
    for (const s in e) if (e[s]) { atk += e[s].atk; def += e[s].def; mhp += e[s].hp; mmp += e[s].mp; crit += e[s].crit; }
    Object.assign(p, { atk, def, mhp, mmp, crit });
    p.hp = Math.min(p.hp, mhp); p.mp = Math.min(p.mp, mmp);
    p.dirty = true;
  }

  _addBot(i) {
    const rnd = this.rnd;
    const id = this.addPlayer({ name: BOT_NAMES[i % BOT_NAMES.length], look: (i + 1) % 5, bot: true });
    const p = this.players.get(id);
    p.lvl = Math.min(8, 2 + i);
    p.eq.weapon = makeItem(rnd, 'weapon', p.lvl, 1);
    p.eq.armor = makeItem(rnd, 'armor', p.lvl, 1);
    p.pots = { hp: 5, mp: 3 };
    this._recalc(p);
    p.hp = p.mhp; p.mp = p.mmp;
    const a = i * 1.3 + 0.4;
    [p.x, p.z] = this.layout.collide(CAMP.fire.x + Math.cos(a) * (2.6 + (i % 3)), CAMP.fire.z + 1 + Math.sin(a) * (2.2 + (i % 2)), 0.4);
    p.rot = Math.atan2(CAMP.fire.x - p.x, CAMP.fire.z - p.z);
    p.ai = { st: 'rest', until: 3 + i * 7, spot: null, tgt: null, lastX: p.x, lastZ: p.z, checkAt: 0, sideUntil: 0, side: 1, wanderAt: 0, wp: null, huntUntil: 0 };
    return p;
  }

  emit(ev) { this.events.push(ev); }
  _safe(p) { return Math.hypot(p.x - POIS.camp.x, p.z - POIS.camp.z) < POIS.camp.r + 2; }

  // ------------------------------------------------------------ client messages
  handle(pid, msg) {
    const p = this.players.get(pid);
    if (!p || !msg || typeof msg.t !== 'string') return;
    const T = this.time;
    switch (msg.t) {
      case 'm': {
        if (p.dead || !isFinite(msg.x) || !isFinite(msg.z)) return;
        const dt = Math.max(0.016, Math.min(1, T - p.lastMove));
        p.lastMove = T;
        let dx = msg.x - p.x, dz = msg.z - p.z;
        const d = Math.hypot(dx, dz), max = PLAYER_SPEED * 1.4 * dt + 0.7 + (T < p.slackUntil ? 9 : 0);
        if (d > max) { dx *= max / d; dz *= max / d; p.evq.push({ e: 'pos', x: r2(p.x + dx), z: r2(p.z + dz) }); }
        const [x, z] = this.layout.collide(p.x + dx, p.z + dz, 0.4);
        p.x = x; p.z = z; p.rot = +msg.r || 0; p.moving = !!msg.mv;
        break;
      }
      case 'c': this._cast(p, msg); break;
      case 'pot': {
        const k = msg.k === 'mp' ? 'mp' : 'hp';
        if (p.dead || p.pots[k] <= 0 || (p.cds['pot_' + k] || 0) > T) return;
        p.pots[k]--; p.cds['pot_' + k] = T + 6; p.dirty = true;
        if (k === 'hp') { const a = Math.round(p.mhp * 0.45); p.hp = Math.min(p.mhp, p.hp + a); this.emit({ e: 'heal', id: p.id, amt: a, x: p.x, z: p.z, k }); }
        else { const a = Math.round(p.mmp * 0.55); p.mp = Math.min(p.mmp, p.mp + a); this.emit({ e: 'heal', id: p.id, amt: a, x: p.x, z: p.z, k }); }
        break;
      }
      case 'equip': {
        const it = p.inv[msg.i | 0];
        if (!it) return;
        const old = p.eq[it.slot];
        p.inv.splice(msg.i | 0, 1);
        if (old) p.inv.push(old);
        p.eq[it.slot] = it;
        this._recalc(p);
        break;
      }
      case 'unequip': {
        const it = p.eq[msg.slot];
        if (!it || p.inv.length >= INV_SIZE) return;
        p.eq[msg.slot] = null; p.inv.push(it);
        this._recalc(p);
        break;
      }
      case 'drop': {
        if (p.inv[msg.i | 0]) { p.inv.splice(msg.i | 0, 1); p.dirty = true; }
        break;
      }
      case 'sell': {
        const it = p.inv[msg.i | 0];
        if (!it || dist(p, this.npcs[1]) > 7) return;
        p.inv.splice(msg.i | 0, 1); p.gold += it.value; p.dirty = true;
        p.evq.push({ e: 'gold', amt: it.value });
        break;
      }
      case 'buy': {
        const k = msg.k === 'mp' ? 'mp' : 'hp';
        if (dist(p, this.npcs[1]) > 7 || p.gold < SHOP[k] || p.pots[k] >= 20) return;
        p.gold -= SHOP[k]; p.pots[k]++; p.dirty = true;
        break;
      }
      case 'quest': {
        if (dist(p, this.npcs[0]) > 7) return;
        const q = p.quest, def = QUESTS[q.i];
        if (!def) return;
        if (msg.a === 'accept' && q.s === 'offer') { q.s = 'active'; q.n = 0; p.dirty = true; p.evq.push({ e: 'quest', k: 'accept', i: q.i }); }
        else if (msg.a === 'turnin' && q.s === 'ready') {
          p.gold += def.gold;
          if (def.pots) { p.pots.hp = Math.min(20, p.pots.hp + (def.pots.hp || 0)); p.pots.mp = Math.min(20, p.pots.mp + (def.pots.mp || 0)); }
          const it = makeItem(this.rnd, def.reward.slot, def.reward.lvl, def.reward.q);
          if (p.inv.length < INV_SIZE) { p.inv.push(it); p.evq.push({ e: 'loot', item: it }); }
          else this._drop(p, p.x, p.z, 'item', 0, it);
          p.evq.push({ e: 'quest', k: 'done', i: q.i, gold: def.gold, xp: def.xp });
          q.i++; q.n = 0; q.s = q.i < QUESTS.length ? 'offer' : 'done';
          this._gainXp(p, def.xp);
          p.dirty = true;
        }
        break;
      }
      case 'g': {
        const g = this.gathers.find((o) => o.id === msg.id);
        if (!g || !g.avail || p.dead || Math.hypot(g.x - p.x, g.z - p.z) > 3) return;
        g.avail = false; g.at = T + 40;
        this.emit({ e: 'gather', id: g.id, by: p.id, x: g.x, z: g.z });
        const q = p.quest, def = QUESTS[q.i];
        if (q.s === 'active' && def && def.type === 'gather') {
          q.n++; if (q.n >= def.count) { q.s = 'ready'; p.evq.push({ e: 'quest', k: 'ready', i: q.i }); }
          p.dirty = true;
        } else this._gainXp(p, 6);
        break;
      }
      case 'respawn': {
        if (!p.dead || T - p.deadAt < 3) return;
        this._respawn(p);
        break;
      }
      case 'chat': {
        if (typeof msg.text !== 'string' || T - p.lastChat < 0.8) return;
        const text = msg.text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 140);
        if (!text) return;
        p.lastChat = T;
        this.emit({ e: 'chat', from: p.name, id: p.id, text, g: 1 });
        break;
      }
    }
  }

  _respawn(p) {
    p.dead = false; p.hp = Math.round(p.mhp * 0.6); p.mp = Math.round(p.mmp * 0.6);
    p.x = SPAWN.x + (this.rnd() - 0.5) * 2; p.z = SPAWN.z + (this.rnd() - 0.5) * 2;
    p.invuln = this.time + 2;
    p.evq.push({ e: 'pos', x: p.x, z: p.z });
    this.emit({ e: 'respawn', id: p.id, x: p.x, z: p.z });
  }

  _cast(p, msg) {
    const sk = SKILLS[msg.s], T = this.time;
    if (!sk || p.dead || p.lvl < sk.lvl || (p.cds[msg.s] || 0) > T + 0.06 || p.mp < sk.mp) return;
    let dx = +msg.dx, dz = +msg.dz;
    if (!isFinite(dx) || !isFinite(dz) || Math.hypot(dx, dz) < 1e-3) { dx = Math.sin(p.rot); dz = Math.cos(p.rot); }
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    p.mp -= sk.mp; p.cds[msg.s] = T + sk.cd; p.rot = Math.atan2(dx, dz);
    const ev = { e: 'cast', id: p.id, s: msg.s, x: r2(p.x), z: r2(p.z), dx: r2(dx), dz: r2(dz) };
    if (msg.s === 'slash') {
      p.combo = (p.combo + 1) % 3; ev.c = p.combo;
      const mult = sk.mult * (p.combo === 2 ? 1.4 : 1);
      for (const m of this.mobs.values()) {
        if (m.dead) continue;
        const ox = m.x - p.x, oz = m.z - p.z, d = Math.hypot(ox, oz);
        if (d - m.r > sk.range) continue;
        if (d > 1.1 && Math.acos(clamp((ox * dx + oz * dz) / d, -1, 1)) > sk.arc) continue;
        this._hitMob(p, m, mult);
      }
    } else if (msg.s === 'wave') {
      const id = 'j' + this.seq++;
      this.projs.push({ id, k: 'wave', by: p.id, side: 'p', x: p.x + dx * 0.9, z: p.z + dz * 0.9, dx, dz, spd: sk.speed, ttl: sk.range / sk.speed, r: sk.radius, mult: sk.mult, hit: new Set() });
      ev.pj = id;
    } else if (msg.s === 'dash') {
      const [tx, tz] = dashDest(this.layout, p.x, p.z, dx, dz, sk.dist);
      for (const m of this.mobs.values()) {
        if (m.dead) continue;
        const sx = tx - p.x, sz = tz - p.z, l2 = sx * sx + sz * sz || 1;
        const t = clamp(((m.x - p.x) * sx + (m.z - p.z) * sz) / l2, 0, 1);
        if (Math.hypot(p.x + sx * t - m.x, p.z + sz * t - m.z) < sk.radius + m.r) this._hitMob(p, m, sk.mult);
      }
      p.x = tx; p.z = tz; p.invuln = T + 0.45; p.slackUntil = T + 0.8;
      ev.tx = r2(tx); ev.tz = r2(tz);
    } else if (msg.s === 'nova') {
      for (const m of this.mobs.values()) {
        if (m.dead || dist(m, p) - m.r > sk.radius) continue;
        m.slowUntil = T + sk.slowDur;
        this._hitMob(p, m, sk.mult);
      }
    } else if (msg.s === 'starfall') {
      let tx = +msg.tx, tz = +msg.tz;
      if (!isFinite(tx) || !isFinite(tz)) { tx = p.x + dx * 8; tz = p.z + dz * 8; }
      const d = Math.hypot(tx - p.x, tz - p.z);
      if (d > sk.range) { tx = p.x + (tx - p.x) / d * sk.range; tz = p.z + (tz - p.z) / d * sk.range; }
      this.pending.push({ at: T + sk.delay, type: 'aoe', side: 'p', by: p.id, x: tx, z: tz, r: sk.radius, mult: sk.mult, k: 'star' });
      this.emit({ e: 'tele', x: r2(tx), z: r2(tz), r: sk.radius, t: sk.delay, k: 'star' });
      ev.tx = r2(tx); ev.tz = r2(tz);
    }
    this.emit(ev);
  }

  // ------------------------------------------------------------ combat
  _hitMob(p, m, mult) {
    if (m.dead) return;
    const crit = this.rnd() * 100 < p.crit;
    const raw = p.atk * mult * (0.9 + this.rnd() * 0.2) * (crit ? 1.8 : 1);
    const dmg = Math.max(1, Math.round(raw - m.def * 0.5));
    m.hp -= dmg;
    m.threat.set(p.id, (m.threat.get(p.id) || 0) + dmg);
    p.lastCombat = this.time;
    if (!m.tgt && m.st !== 'return') { m.tgt = p.id; m.st = 'chase'; }
    this.emit({ e: 'dmg', id: m.id, by: p.id, amt: dmg, crit: crit ? 1 : 0, x: r2(m.x), z: r2(m.z) });
    if (m.hp <= 0) this._killMob(m);
  }

  _killMob(m) {
    const def = MOBS[m.kind], rnd = this.rnd;
    m.dead = true; m.hp = 0; m.st = 'dead'; m.tgt = null; m.moving = false; m.diedAt = this.time;
    m.respawnAt = this.time + (def.respawn || 10 + rnd() * 7);
    this.emit({ e: 'die', id: m.id, x: r2(m.x), z: r2(m.z), k: m.kind });
    let top = null, best = 0;
    for (const [pid, d] of m.threat) {
      const p = this.players.get(pid);
      if (!p || dist(p, m) > 45) continue;
      if (d > best) { best = d; top = p; }
      p.kills++;
      this._gainXp(p, Math.round(m.xp * (m.lvl + 3 < p.lvl ? 0.35 : 1)));
      const q = p.quest, qd = QUESTS[q.i];
      if (q.s === 'active' && qd && qd.type === 'kill' && qd.target === m.kind) {
        q.n++; p.dirty = true;
        if (q.n >= qd.count) { q.s = 'ready'; p.evq.push({ e: 'quest', k: 'ready', i: q.i }); }
      }
    }
    m.threat.clear();
    if (top) {
      const gold = Math.round((def.gold[0] + rnd() * (def.gold[1] - def.gold[0])) * (1 + 0.15 * (m.lvl - 1)));
      this._drop(top, m.x, m.z, 'gold', gold);
      if (def.boss || rnd() < 0.15) {
        const slot = ['weapon', 'armor', 'trinket'][Math.floor(rnd() * 3)];
        this._drop(top, m.x, m.z, 'item', 0, makeItem(rnd, slot, m.lvl + (def.boss ? 1 : 0), rollRarity(rnd, def.boss)));
      }
      if (rnd() < 0.15) this._drop(top, m.x, m.z, 'hp', 1);
      if (rnd() < 0.09) this._drop(top, m.x, m.z, 'mp', 1);
      if (def.boss) this.emit({ e: 'sys', k: 'bosskill', a: [top.name], g: 1 });
    }
  }

  _drop(p, x, z, k, amt, item = null) {
    const a = this.rnd() * 6.283, d = 0.5 + this.rnd() * 1.1;
    const [lx, lz] = this.layout.collide(x + Math.cos(a) * d, z + Math.sin(a) * d, 0.3);
    const l = { id: 'l' + this.seq++, x: lx, z: lz, k, amt, item, owner: p.id, exp: this.time + 75 };
    this.loot.set(l.id, l);
  }

  _gainXp(p, amt) {
    if (amt <= 0) return;
    if (p.bot) { if (p.lvl >= 9) return; amt = Math.ceil(amt * 0.3); } else p.evq.push({ e: 'xp', amt });
    if (p.lvl >= MAX_LEVEL) return;
    p.xp += amt;
    while (p.lvl < MAX_LEVEL && p.xp >= xpNeed(p.lvl)) {
      p.xp -= xpNeed(p.lvl); p.lvl++;
      this._recalc(p);
      p.hp = p.mhp; p.mp = p.mmp;
      this.emit({ e: 'lvl', id: p.id, lvl: p.lvl, x: r2(p.x), z: r2(p.z), name: p.name });
    }
    p.dirty = true;
  }

  _hitPlayer(p, amt, srcKind) {
    if (p.dead || this.time < p.invuln || this._safe(p)) return;
    const dmg = Math.max(1, Math.round(amt * (0.9 + this.rnd() * 0.2) - p.def * 0.5));
    p.hp -= dmg; p.lastCombat = this.time;
    this.emit({ e: 'dmg', id: p.id, amt: dmg, crit: 0, x: r2(p.x), z: r2(p.z), pl: 1 });
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true; p.deadAt = this.time; p.moving = false;
      this.emit({ e: 'die', id: p.id, x: r2(p.x), z: r2(p.z), k: 'player', name: p.name, by: srcKind });
      for (const m of this.mobs.values()) { m.threat.delete(p.id); if (m.tgt === p.id) m.tgt = null; }
    }
  }

  // ------------------------------------------------------------ simulation step
  tick(dt) {
    const T = (this.time += dt), L = this.layout;
    for (const p of this.players.values()) {
      if (p.bot) this._botThink(p, dt);
      if (p.dead) continue;
      const calm = T - p.lastCombat > 5, safe = this._safe(p);
      if (p.hp < p.mhp) p.hp = Math.min(p.mhp, p.hp + p.mhp * (safe ? 0.08 : calm ? 0.03 : 0) * dt);
      if (p.mp < p.mmp) p.mp = Math.min(p.mmp, p.mp + p.mmp * (safe ? 0.1 : calm ? 0.045 : 0.014) * dt);
    }
    for (const m of this.mobs.values()) this._mobThink(m, dt);
    // light separation so packs don't stack into one spot
    const ms = [...this.mobs.values()].filter((m) => !m.dead && m.tgt);
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i], b = ms[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.r + b.r;
      if (d < min && d > 1e-3) { const k = (min - d) * 0.5 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
    }
    // projectiles
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const j = this.projs[i];
      j.x += j.dx * j.spd * dt; j.z += j.dz * j.spd * dt; j.ttl -= dt;
      let done = j.ttl <= 0;
      if (j.side === 'p') {
        const p = this.players.get(j.by);
        if (p) for (const m of this.mobs.values()) {
          if (m.dead || j.hit.has(m.id) || Math.hypot(m.x - j.x, m.z - j.z) > j.r + m.r) continue;
          j.hit.add(m.id); this._hitMob(p, m, j.mult);
        }
      } else {
        for (const p of this.players.values()) {
          if (p.dead || Math.hypot(p.x - j.x, p.z - j.z) > j.r + 0.4) continue;
          this._hitPlayer(p, j.dmg, j.src); done = true;
          this.emit({ e: 'pjend', id: j.id, x: r2(j.x), z: r2(j.z) });
          break;
        }
        if (!done && L.blocked(j.x, j.z, 0.15)) { done = true; this.emit({ e: 'pjend', id: j.id, x: r2(j.x), z: r2(j.z) }); }
      }
      if (done) this.projs.splice(i, 1);
    }
    // delayed hits
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const h = this.pending[i];
      if (T < h.at) continue;
      this.pending.splice(i, 1);
      if (h.type === 'melee') {
        const m = this.mobs.get(h.mob), p = this.players.get(h.tgt);
        if (m && !m.dead && p && dist(m, p) <= h.range) this._hitPlayer(p, m.atk, m.kind);
      } else if (h.side === 'p') {
        const p = this.players.get(h.by);
        this.emit({ e: 'boom', x: r2(h.x), z: r2(h.z), r: h.r, k: h.k });
        if (p) for (const m of this.mobs.values()) if (!m.dead && Math.hypot(m.x - h.x, m.z - h.z) < h.r + m.r) this._hitMob(p, m, h.mult);
      } else {
        this.emit({ e: 'boom', x: r2(h.x), z: r2(h.z), r: h.r, k: h.k });
        for (const p of this.players.values()) if (Math.hypot(p.x - h.x, p.z - h.z) < h.r + 0.3) this._hitPlayer(p, h.dmg, 'sentinel');
      }
    }
    // loot: owner walks over it
    for (const [id, l] of this.loot) {
      if (T > l.exp) { this.loot.delete(id); continue; }
      const p = this.players.get(l.owner);
      if (!p || p.dead || Math.hypot(p.x - l.x, p.z - l.z) > 1.7) continue;
      if (l.k === 'gold') { p.gold += l.amt; p.evq.push({ e: 'gold', amt: l.amt }); }
      else if (l.k === 'item') { if (p.inv.length >= INV_SIZE) { if (!l.warned) { l.warned = true; p.evq.push({ e: 'sys', k: 'bagfull' }); } continue; } p.inv.push(l.item); p.evq.push({ e: 'loot', item: l.item }); }
      else { if (p.pots[l.k] >= 20) continue; p.pots[l.k]++; p.evq.push({ e: 'pot', k: l.k }); }
      p.dirty = true;
      this.loot.delete(id);
      this.emit({ e: 'pick', x: r2(l.x), z: r2(l.z), k: l.k, by: p.id });
    }
    for (const g of this.gathers) if (!g.avail && T >= g.at) g.avail = true;
    // ambient chatter from the AI adventurers
    if (T >= this.chatAt) {
      this.chatAt = T + 16 + this.rnd() * 26;
      const bots = [...this.players.values()].filter((p) => p.bot && !p.dead);
      if (bots.length) { const b = bots[Math.floor(this.rnd() * bots.length)]; this.emit({ e: 'chat', from: b.name, id: b.id, line: 3 + Math.floor(this.rnd() * (BOT_CHAT_LINES - 3)), g: 1 }); }
    }
    for (let i = this.greet.length - 1; i >= 0; i--) if (T >= this.greet[i].at) {
      const bots = [...this.players.values()].filter((p) => p.bot);
      if (bots.length) { const b = bots[Math.floor(this.rnd() * bots.length)]; this.emit({ e: 'chat', from: b.name, id: b.id, line: Math.floor(this.rnd() * 3), who: this.greet[i].name, g: 1 }); }
      this.greet.splice(i, 1);
    }
    this._distribute();
  }

  _distribute() {
    if (this.events.length) {
      for (const p of this.players.values()) {
        if (p.bot) { p.evq.length = 0; continue; }
        for (const ev of this.events) {
          if (ev.to && ev.to !== p.id) continue;
          if (!ev.g && ev.x !== undefined && Math.hypot(ev.x - p.x, ev.z - p.z) > 80) continue;
          p.evq.push(ev);
        }
      }
      this.events.length = 0;
    }
  }

  _moveToward(e, tx, tz, speed, dt, radius) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return 0;
    const step = Math.min(d, speed * dt);
    const [x, z] = this.layout.collide(e.x + dx / d * step, e.z + dz / d * step, radius);
    e.x = x; e.z = z; e.rot = Math.atan2(dx, dz); e.moving = true;
    return d - step;
  }

  _mobThink(m, dt) {
    const T = this.time, def = MOBS[m.kind], rnd = this.rnd;
    if (m.dead) {
      if (T >= m.respawnAt) {
        const s = mobStats(m.kind, m.lvl);
        Object.assign(m, { dead: false, hp: s.mhp, x: m.hx, z: m.hz, st: 'idle', tgt: null, enraged: false, slowUntil: 0, busyUntil: 0 });
        this.emit({ e: 'spawn', id: m.id, x: r2(m.x), z: r2(m.z) });
      }
      return;
    }
    m.moving = false;
    const speed = def.speed * (T < m.slowUntil ? SKILLS.nova.slow : 1) * (m.enraged ? 1.25 : 1);
    let tgt = m.tgt ? this.players.get(m.tgt) : null;
    const leash = def.boss ? 26 : 34;
    if (m.tgt && (!tgt || tgt.dead || this._safe(tgt) || Math.hypot(tgt.x - m.hx, tgt.z - m.hz) > leash)) {
      // drop this target, fall back to anyone else who has hurt it
      m.threat.delete(m.tgt); m.tgt = null; tgt = null;
      let best = 0;
      for (const [pid, d] of m.threat) { const o = this.players.get(pid); if (o && !o.dead && !this._safe(o) && Math.hypot(o.x - m.hx, o.z - m.hz) < leash && d > best) { best = d; tgt = o; m.tgt = pid; } }
      if (!tgt) m.st = 'return';
    }
    if (m.st === 'return') {
      m.hp = Math.min(m.mhp, m.hp + m.mhp * 0.25 * dt);
      if (this._moveToward(m, m.hx, m.hz, def.speed * 1.4, dt, m.r) < 0.4) { m.st = 'idle'; m.threat.clear(); m.enraged = false; }
      return;
    }
    if (!tgt && T >= m.scanAt) {
      m.scanAt = T + 0.3;
      let best = def.aggro;
      for (const p of this.players.values()) {
        if (p.dead || this._safe(p)) continue;
        const d = dist(p, m);
        if (d < best && Math.hypot(p.x - m.hx, p.z - m.hz) < leash) { best = d; tgt = p; }
      }
      if (tgt) {
        m.tgt = tgt.id; m.st = 'chase';
        if (def.boss) { m.sp1 = T + 5; m.sp2 = T + 9; m.busyUntil = T + 1.2; this.emit({ e: 'atk', id: m.id, k: 'roar', x: r2(m.x), z: r2(m.z) }); this.emit({ e: 'sys', k: 'bosswake', g: 1 }); }
      }
    }
    if (tgt) {
      const d = dist(m, tgt);
      if (T < m.busyUntil) return;
      m.rot = Math.atan2(tgt.x - m.x, tgt.z - m.z);
      if (def.boss) {
        if (!m.enraged && m.hp < m.mhp * 0.35) { m.enraged = true; this.emit({ e: 'sys', k: 'enrage', x: m.x, z: m.z }); }
        if (T >= m.sp1 && d < 9) {
          m.sp1 = T + (m.enraged ? 7 : 10.5); m.busyUntil = T + 2.1;
          this.emit({ e: 'atk', id: m.id, k: 'slam', x: r2(m.x), z: r2(m.z) });
          this.emit({ e: 'tele', x: r2(m.x), z: r2(m.z), r: 6.6, t: 1.5, k: 'slam' });
          this.pending.push({ at: T + 1.5, type: 'aoe', side: 'm', x: m.x, z: m.z, r: 6.6, dmg: m.atk * 2.1, k: 'slam' });
          return;
        }
        if (T >= m.sp2) {
          m.sp2 = T + (m.enraged ? 8 : 13); m.busyUntil = T + 1.0;
          this.emit({ e: 'atk', id: m.id, k: 'roar', x: r2(m.x), z: r2(m.z) });
          const near = [...this.players.values()].filter((p) => !p.dead && dist(p, m) < 24).sort(() => rnd() - 0.5).slice(0, 3);
          for (const p of near) {
            this.emit({ e: 'tele', x: r2(p.x), z: r2(p.z), r: 3.3, t: 1.35, k: 'rock' });
            this.pending.push({ at: T + 1.35, type: 'aoe', side: 'm', x: p.x, z: p.z, r: 3.3, dmg: m.atk * 1.45, k: 'rock' });
          }
          return;
        }
      }
      if (d > def.range) this._moveToward(m, tgt.x, tgt.z, speed, dt, m.r);
      else if (T >= m.nextAtk) {
        m.nextAtk = T + def.atkCd * (m.enraged ? 0.75 : 1);
        this.emit({ e: 'atk', id: m.id, k: 'atk', x: r2(m.x), z: r2(m.z) });
        if (def.ranged) {
          const dx = (tgt.x - m.x) / (d || 1), dz = (tgt.z - m.z) / (d || 1), id = 'j' + this.seq++;
          this.projs.push({ id, k: 'bolt', side: 'm', src: m.kind, x: m.x + dx * 0.5, z: m.z + dz * 0.5, dx, dz, spd: def.ranged, ttl: 1.5, r: 0.55, dmg: m.atk });
          this.emit({ e: 'proj', id, k: 'bolt', x: r2(m.x + dx * 0.5), z: r2(m.z + dz * 0.5), dx: r2(dx), dz: r2(dz), spd: def.ranged, ttl: 1.5, lv: m.lvl });
        } else {
          m.busyUntil = T + 0.45;
          this.pending.push({ at: T + 0.3, type: 'melee', mob: m.id, tgt: tgt.id, range: def.range + 1.1 });
        }
      }
      return;
    }
    // idle wander
    if (def.boss) return;
    if (T >= m.wanderAt) {
      m.wanderAt = T + 3 + rnd() * 6;
      const a = rnd() * 6.283, d = rnd() * 5;
      m.wx = m.hx + Math.cos(a) * d; m.wz = m.hz + Math.sin(a) * d;
    }
    if (Math.hypot(m.wx - m.x, m.wz - m.z) > 0.3) this._moveToward(m, m.wx, m.wz, def.speed * 0.35, dt, m.r);
  }

  // ------------------------------------------------------------ AI adventurers
  _botThink(p, dt) {
    const T = this.time, ai = p.ai, rnd = this.rnd;
    if (p.dead) { if (T - p.deadAt > 7) { this._respawn(p); ai.st = 'rest'; ai.until = T + 6; } return; }
    p.moving = false;
    if (p.hp < p.mhp * 0.4 && p.pots.hp > 0) this.handle(p.id, { t: 'pot', k: 'hp' });
    if (p.mp < p.mmp * 0.25 && p.pots.mp > 0) this.handle(p.id, { t: 'pot', k: 'mp' });
    const go = (tx, tz, sp = PLAYER_SPEED * 0.92) => {
      let dx = tx - p.x, dz = tz - p.z; const d = Math.hypot(dx, dz);
      if (d < 0.2) return d;
      dx /= d; dz /= d;
      if (T < ai.sideUntil) { const ox = dx; dx = -dz * ai.side * 0.9 + dx * 0.3; dz = ox * ai.side * 0.9 + dz * 0.3; }
      const [x, z] = this.layout.collide(p.x + dx * sp * dt, p.z + dz * sp * dt, 0.4);
      p.x = x; p.z = z; p.rot = Math.atan2(dx, dz); p.moving = true;
      if (T >= ai.checkAt) {
        if (Math.hypot(p.x - ai.lastX, p.z - ai.lastZ) < 0.9) { ai.sideUntil = T + 0.9 + rnd(); ai.side = rnd() < 0.5 ? -1 : 1; }
        ai.lastX = p.x; ai.lastZ = p.z; ai.checkAt = T + 0.8;
      }
      return d;
    };
    const fight = () => {
      let m = ai.tgt ? this.mobs.get(ai.tgt) : null;
      if (!m || m.dead || dist(m, p) > 22) {
        m = null; ai.tgt = null;
        let best = 17;
        for (const o of this.mobs.values()) {
          if (o.dead || MOBS[o.kind].boss || o.lvl > p.lvl + 1) continue;
          const d = dist(o, p) - (o.tgt === p.id ? 8 : 0);
          if (d < best) { best = d; m = o; }
        }
        if (m) ai.tgt = m.id;
      }
      if (!m) return false;
      const d = dist(m, p), dx = (m.x - p.x) / (d || 1), dz = (m.z - p.z) / (d || 1);
      if (d - m.r > 2.3) go(m.x, m.z); else p.rot = Math.atan2(dx, dz);
      const can = (s) => p.lvl >= SKILLS[s].lvl && (p.cds[s] || 0) <= T && p.mp >= SKILLS[s].mp;
      if (d - m.r < 2.9 && can('slash') && rnd() < 0.1) this.handle(p.id, { t: 'c', s: 'slash', dx, dz });
      else if (d > 4 && d < 13 && can('wave') && rnd() < 0.02) this.handle(p.id, { t: 'c', s: 'wave', dx, dz });
      else if (d < 4.5 && can('nova') && rnd() < 0.012) this.handle(p.id, { t: 'c', s: 'nova', dx, dz });
      else if (d < 13 && can('starfall') && rnd() < 0.006) this.handle(p.id, { t: 'c', s: 'starfall', dx, dz, tx: m.x, tz: m.z });
      return true;
    };
    if (ai.st === 'rest') {
      if (T > ai.until && p.hp > p.mhp * 0.8) {
        const tier = p.lvl <= 2 ? 0 : p.lvl <= 4 ? 1 : 2, list = HUNT_SPOTS[tier];
        ai.spot = list[Math.floor(rnd() * list.length)]; ai.st = 'travel';
      }
    } else if (ai.st === 'travel') {
      const threatened = [...this.mobs.values()].some((m) => m.tgt === p.id && dist(m, p) < 6);
      if (threatened) { fight(); return; }
      if (go(ai.spot[0], ai.spot[1]) < 7) { ai.st = 'hunt'; ai.huntUntil = T + 50 + rnd() * 80; ai.wp = null; }
    } else if (ai.st === 'hunt') {
      if ((p.hp < p.mhp * 0.3 && p.pots.hp === 0) || T > ai.huntUntil) { ai.st = 'home'; ai.tgt = null; return; }
      if (!fight()) {
        if (!ai.wp || T > ai.wanderAt) { const a = rnd() * 6.283; ai.wp = [ai.spot[0] + Math.cos(a) * 9, ai.spot[1] + Math.sin(a) * 9]; ai.wanderAt = T + 5; }
        go(ai.wp[0], ai.wp[1], PLAYER_SPEED * 0.6);
      }
    } else if (ai.st === 'home') {
      if (go(SPAWN.x + 4, SPAWN.z - 2) < 4) { ai.st = 'rest'; ai.until = T + 6 + rnd() * 12; p.pots.hp = 5; p.pots.mp = 3; }
    }
  }

  // ------------------------------------------------------------ views for a client
  init(pid) {
    return { t: 'init', id: pid, time: this.time, npcs: this.npcs };
  }

  snapshot(pid) {
    const p = this.players.get(pid);
    if (!p) return null;
    const T = this.time, R = 72, ents = [];
    for (const o of this.players.values()) if (o.id !== pid && Math.abs(o.x - p.x) < R && Math.abs(o.z - p.z) < R) ents.push(['p', o.id, r2(o.x), r2(o.z), r2(o.rot), Math.ceil(o.hp), o.mhp, o.lvl, o.look, o.dead ? 1 : 0, o.moving ? 1 : 0, o.name]);
    for (const m of this.mobs.values()) {
      if (m.dead && T - m.diedAt > 3.5) continue;
      if (Math.abs(m.x - p.x) < R && Math.abs(m.z - p.z) < R) ents.push(['m', m.id, r2(m.x), r2(m.z), r2(m.rot), Math.ceil(m.hp), m.mhp, m.lvl, m.kind, m.dead ? 1 : 0, m.moving ? 1 : 0]);
    }
    for (const l of this.loot.values()) if (l.owner === pid) ents.push(['l', l.id, r2(l.x), r2(l.z), l.k, l.item ? l.item.q : 0]);
    for (const g of this.gathers) if (Math.abs(g.x - p.x) < R && Math.abs(g.z - p.z) < R) ents.push(['g', g.id, r2(g.x), r2(g.z), g.avail ? 1 : 0]);
    const cds = {};
    for (const k in p.cds) { const rem = p.cds[k] - T; if (rem > 0) cds[k] = r2(rem); }
    const out = { t: 's', time: r2(T), ents, me: { x: r2(p.x), z: r2(p.z), hp: Math.ceil(p.hp), mp: Math.floor(p.mp), xp: p.xp, dead: p.dead ? 1 : 0, wait: p.dead ? r2(Math.max(0, 3 - (T - p.deadAt))) : 0, cds }, ev: p.evq };
    p.evq = [];
    if (p.dirty) {
      p.dirty = false;
      out.full = { name: p.name, look: p.look, lvl: p.lvl, xpn: xpNeed(p.lvl), gold: p.gold, mhp: p.mhp, mmp: p.mmp, atk: p.atk, def: p.def, crit: r2(p.crit), inv: p.inv, eq: p.eq, pots: p.pots, quest: p.quest, kills: p.kills };
    }
    return out;
  }
}

function cleanName(n) {
  n = String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
  return n || 'Wanderer';
}
function validItem(it) {
  return !!it && typeof it === 'object' && ['weapon', 'armor', 'trinket'].includes(it.slot) && Number.isFinite(it.atk) && Number.isFinite(it.def) && Number.isFinite(it.hp) && Number.isFinite(it.mp)
    && Number.isFinite(it.crit) && Number.isFinite(it.value) && it.atk <= 200 && it.def <= 200 && it.hp <= 2000 && it.mp <= 2000 && it.crit <= 30 && it.value <= 5000 && typeof it.id === 'string' && it.id.length < 40
    && Number.isInteger(it.q) && it.q >= 0 && it.q <= 3 && Number.isInteger(it.base) && it.base >= 0 && it.base < 5 && Number.isInteger(it.lvl);
}
