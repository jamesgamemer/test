import { THREE } from '../gfx/common.js';
import { World3D, QUALITY } from '../gfx/world3d.js';
import { createActor, setActorTextures, LOOKS } from '../gfx/actors.js';
import { FX, makeLoot, makeGatherNode } from '../gfx/fx.js';
import { heightAt, zoneAt, SPAWN, POIS, CAMP, GATE } from '../shared/world.js';
import { SKILLS, SKILL_ORDER, PLAYER_SPEED } from '../shared/data.js';
import { dashDest } from '../shared/sim.js';
import { UI } from '../ui/ui.js';
import { t, setLang, itemName, RARITY_COLORS } from '../ui/i18n.js';
import { Audio } from './audio.js';
import { LocalTransport, WsTransport, clearSave } from './transport.js';

const PREFS_KEY = 'nightglade.prefs.v1';
const lerp = (a, b, k) => a + (b - a) * k;
const angLerp = (a, b, k) => { let d = (b - a) % 6.2831853; if (d > Math.PI) d -= 6.2831853; if (d < -Math.PI) d += 6.2831853; return a + d * k; };
const FIRES = [...CAMP.torches, CAMP.fire, ...GATE.braziers];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.prefs = { lang: 'th', quality: null, vol: 0.7, fps: false, name: '', look: 0 };
    try { Object.assign(this.prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch { /* ignore */ }
    const P = new URLSearchParams(location.search);
    if (P.get('lang')) this.prefs.lang = P.get('lang');
    if (P.get('q') && QUALITY[P.get('q')]) this.prefs.quality = P.get('q');
    if (!this.prefs.quality) this.prefs.quality = guessQuality();
    setLang(this.prefs.lang);
    this.audio = new Audio(); this.audio.vol = this.prefs.vol;
    this.ui = new UI(this);
    this.ents = new Map();
    this.npcs = [];
    this.me = { id: null, x: SPAWN.x, z: SPAWN.z, y: 0, rot: 1.2, hp: 1, mp: 1, xp: 0, dead: false, moving: false, speed: 0, faceLock: 0, aimRot: 0, dash: null, full: null };
    this.cam = { yaw: 0.5, pitch: 0.74, dist: 24, tYaw: 0.5, tPitch: 0.74, tDist: 24, target: new THREE.Vector3(SPAWN.x, 1, SPAWN.z) };
    this.input = { keys: new Set(), mx: 0, my: 0, attack: false, joy: { x: 0, y: 0 }, hasMouse: false, drag: null };
    this.aim = { x: 0, z: 0, dx: 0, dz: 1 };
    this.cd = {}; this.castAt = {};
    this.mode = 'title';
    this.clock = 0; this.sendAt = 0; this.uiAt = 0; this.combo = 0; this.localProj = 0;
    this.zone = null; this.hover = null; this.lastTarget = null; this.lastTargetAt = -9; this.interactTarget = null;
    this.danger = 0; this.resScale = 1; this.fpsAcc = 0; this.fpsN = 0; this.fpsAt = 0;
    this._v = new THREE.Vector3(); this._ray = new THREE.Raycaster(); this._hero = new THREE.Vector3();
    this.touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  }

  savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ } }

  async init(progress) {
    this.world = new World3D(this.canvas, this.prefs.quality);
    await this.world.build(progress);
    setActorTextures(this.world.tex);
    this.fx = new FX(this.world);
    this.layout = this.world.layout;
    this.ui.setMapImage(this.world.maps.mapCanvas);
    this.setPreview(this.prefs.look);
    this._bindInput();
    this.last = performance.now();
    const loop = (now) => { if (!this.paused) this.frame(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  setPreview(look) {
    this.prefs.look = look;
    if (this.meActor) this.world.scene.remove(this.meActor.group);
    this.meActor = createActor('player', { look }, this.world.tex);
    this.world.scene.add(this.meActor.group);
    this.me.y = heightAt(this.me.x, this.me.z);
    this.meActor.group.position.set(this.me.x, this.me.y, this.me.z);
    this.meActor.group.rotation.y = this.me.rot;
    this.world.heroLight.color.set(LOOKS[look].blade);
  }

  async enter({ name, look, socket }) {
    this.prefs.name = name; this.prefs.look = look; this.savePrefs();
    this.audio.start();
    let tr;
    if (socket) {
      tr = this.transport = new WsTransport();
      tr.onMessage = (m) => this.onMessage(m);
      tr.onClose = () => this._fallback();
      try { await tr.connect({ name, look, socket }); } catch { tr = null; }
    }
    if (!tr) {
      tr = this.transport = new LocalTransport();
      tr.onMessage = (m) => this.onMessage(m);
      await tr.connect({ name, look });
    }
    this.mode = 'play';
    this.ui.setTouch(this.touch);
    document.getElementById('hud').classList.remove('hidden');
    this.ui.chat('sys', '', t('sys_welcome'));
    window.addEventListener('beforeunload', () => this.transport.persist());
  }

  async _fallback() {
    this.ui.chat('bad', '', t('sys_disconnect'));
    for (const e of [...this.ents.values()]) if (e.type !== 'n') this._removeEnt(e);
    const tr = new LocalTransport();
    tr.onMessage = (m) => this.onMessage(m);
    this.transport = tr;
    await tr.connect({ name: this.prefs.name, look: this.prefs.look });
  }

  // ------------------------------------------------------------ input
  _bindInput() {
    const c = this.canvas, inp = this.input;
    const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA'); };
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'play' || typing()) return;
      const k = e.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      inp.keys.add(k);
      if (k === 'Enter') { e.preventDefault(); this.ui.focusChat(); }
      else if (k === 'Escape') { if (!this.ui.closeTop()) this.ui.show('settings'); }
      else if (k === 'KeyI' || k === 'KeyB' || k === 'KeyC') this.ui.toggle('bag');
      else if (k === 'KeyJ' || k === 'KeyL') this.ui.toggle('quests');
      else if (k === 'KeyM') this.ui.toggle('map');
      else if (k === 'KeyF') this.interact();
      else if (k === 'Digit1') this.cast('wave');
      else if (k === 'Digit2' || k === 'Space') this.cast('dash');
      else if (k === 'Digit3') this.cast('nova');
      else if (k === 'Digit4') this.cast('starfall');
      else if (k === 'KeyQ') this.usePotion('hp');
      else if (k === 'KeyE') this.usePotion('mp');
    });
    window.addEventListener('keyup', (e) => inp.keys.delete(e.code));
    window.addEventListener('blur', () => { inp.keys.clear(); inp.attack = false; inp.drag = null; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      this.audio.start();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (this.mode !== 'play') return;
      c.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch') { inp.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, touch: true }; return; }
      inp.hasMouse = true; inp.mx = e.clientX; inp.my = e.clientY;
      if (e.button === 0) inp.attack = true;
      else if (e.button === 2) inp.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') { inp.hasMouse = true; inp.mx = e.clientX; inp.my = e.clientY; }
      const d = inp.drag;
      if (d && d.id === e.pointerId) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
        this.cam.tYaw -= dx * 0.0055;
        this.cam.tPitch = Math.min(1.2, Math.max(0.42, this.cam.tPitch + dy * 0.004));
      }
    });
    const up = (e) => {
      if (e.pointerType !== 'touch' && e.button === 0) inp.attack = false;
      const d = inp.drag;
      if (d && d.id === e.pointerId) { if (!d.touch && d.moved < 6) this.cast('wave'); inp.drag = null; }
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.tDist = Math.min(34, Math.max(11, this.cam.tDist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: false });
    window.addEventListener('resize', () => this.world.resize());
    document.addEventListener('pointerdown', () => this.audio.start(), { once: true });
  }

  // ------------------------------------------------------------ actions
  send(msg) { if (this.transport) this.transport.send(msg); }
  chat(text) { this.send({ t: 'chat', text }); }
  respawn() { this.send({ t: 'respawn' }); }
  cdRemaining(s) { return Math.max(0, (this.cd[s] || 0) - this.clock); }
  nearMerchant() { const n = this.npcPos('merchant'); return !!n && Math.hypot(n.x - this.me.x, n.z - this.me.z) < 7; }
  npcPos(role) { return this.npcs.find((n) => n.role === role) || null; }

  usePotion(k) {
    const f = this.me.full;
    if (!f || this.me.dead || f.pots[k] <= 0 || this.cdRemaining('pot_' + k) > 0) { this.audio.sfx('deny'); return; }
    this.cd['pot_' + k] = this.clock + 6; this.castAt['pot_' + k] = this.clock;
    this.send({ t: 'pot', k });
    this.audio.sfx('potion');
    this.ui.flashSlot('pot_' + k);
  }

  cast(s) {
    const me = this.me, f = me.full, sk = SKILLS[s];
    if (this.mode !== 'play' || !f || me.dead || me.dash) return;
    if (f.lvl < sk.lvl) { if (s !== 'slash') { this.ui.toast(t('unlock_at', sk.lvl)); this.audio.sfx('deny'); } return; }
    if (this.cdRemaining(s) > 0) return;
    if (me.mp < sk.mp) { this.ui.toast(t('sys_nomana'), '#7fb8ff'); this.audio.sfx('deny'); this.cd[s] = this.clock + 0.4; return; }
    this._updateAim();
    const { dx, dz } = this.aim;
    let tx = this.aim.x, tz = this.aim.z;
    if (this.hover) { tx = this.hover.x; tz = this.hover.z; }
    this.cd[s] = this.clock + sk.cd; this.castAt[s] = this.clock;
    me.mp -= sk.mp;
    me.faceLock = sk.dur + 0.12; me.aimRot = Math.atan2(dx, dz);
    this.send({ t: 'c', s, dx, dz, tx, tz });
    let c = 0;
    if (s === 'slash') { this.combo = (this.combo + 1) % 3; c = this.combo; }
    const ev = { s, x: me.x, z: me.z, dx, dz, c };
    if (s === 'dash') { const [ex, ez] = dashDest(this.layout, me.x, me.z, dx, dz, sk.dist); ev.tx = ex; ev.tz = ez; me.dash = { x0: me.x, z0: me.z, x1: ex, z1: ez, t: 0, dur: 0.2 }; }
    if (s === 'wave') ev.pj = 'local' + this.localProj++;
    this._playCast(this.meActor, LOOKS[this.prefs.look].blade, ev, 0);
    if (s !== 'slash') this.ui.flashSlot(s);
  }

  _playCast(actor, color, ev, d) {
    const fx = this.fx, a = this.audio;
    if (ev.s === 'slash') { actor.play('atk', SKILLS.slash.dur, ev.c || 0); fx.slash(ev.x, ev.z, ev.dx, ev.dz, color, ev.c || 0); a.sfx(ev.c === 2 ? 'slash3' : 'slash', d); }
    else if (ev.s === 'wave') { actor.play('atk', 0.4, 0); fx.slash(ev.x, ev.z, ev.dx, ev.dz, color, 0); fx.wave(ev.pj, ev.x + ev.dx * 0.9, ev.z + ev.dz * 0.9, ev.dx, ev.dz, color, SKILLS.wave.speed, SKILLS.wave.range / SKILLS.wave.speed); a.sfx('wave', d); }
    else if (ev.s === 'dash') { actor.play('dash', 0.3); fx.dashTrail(ev.x, ev.z, ev.tx, ev.tz, color); a.sfx('dash', d); }
    else if (ev.s === 'nova') { actor.play('cast', 0.6); fx.nova(ev.x, ev.z, SKILLS.nova.radius, color); a.sfx('nova', d); if (d < 20) fx.shake = Math.max(fx.shake, 0.3); }
    else if (ev.s === 'starfall') { actor.play('cast', 0.75); a.sfx('starcast', d); }
  }

  interact() {
    const it = this.interactTarget;
    if (!it || this.me.dead) return;
    if (it.type === 'n') { this.ui.openNpc(it.role); this.audio.sfx('ui'); }
    else if (it.type === 'g') { this.send({ t: 'g', id: it.id }); this.meActor.play('cast', 0.5); }
  }

  setVolume(v) { this.prefs.vol = v; this.audio.setVolume(v); this.savePrefs(); }
  setLanguage(l) { this.prefs.lang = l; setLang(l); this.savePrefs(); this.ui.applyLang(); if (this.zone) this.ui.zone(this.zone); }
  setQuality(q) { this.prefs.quality = q; this.savePrefs(); if (this.transport) this.transport.persist(); location.reload(); }
  resetSave() { clearSave(); this.prefs.name = ''; this.savePrefs(); if (this.transport) this.transport.persist = () => {}; location.reload(); }

  // ------------------------------------------------------------ network
  onMessage(m) {
    if (m.t === 'init') {
      this.me.id = m.id;
      for (const n of m.npcs) {
        const e = { id: n.id, type: 'n', role: n.role, x: n.x, z: n.z, rot: n.rot, hp: 1, mhp: 1 };
        e.actor = createActor('npc', { role: n.role }, this.world.tex);
        e.obj = e.actor.group; e.height = 2.15;
        e.obj.position.set(n.x, heightAt(n.x, n.z), n.z); e.obj.rotation.y = n.rot;
        this.world.scene.add(e.obj);
        this.ents.set(e.id, e); this.npcs.push(e);
      }
      return;
    }
    if (m.t !== 's') return;
    const me = this.me;
    if (m.full) {
      const prev = me.full;
      me.full = m.full;
      this.ui.setFull(m.full);
      if (!prev) { me.x = m.me.x; me.z = m.me.z; this.cam.target.set(me.x, heightAt(me.x, me.z) + 1.2, me.z); }
    }
    me.hp = m.me.hp; me.xp = m.me.xp;
    if (Math.abs(m.me.mp - me.mp) > 3 || this.clock - (this._mpAt || 0) > 0.5) { me.mp = m.me.mp; this._mpAt = this.clock; }
    if (m.me.dead !== (me.dead ? 1 : 0)) { me.dead = !!m.me.dead; this.meActor.setDead(me.dead); if (me.dead) { this.audio.sfx('death'); this.input.attack = false; } }
    if (me.dead) this.ui.death(true, m.me.wait); else this.ui.death(false);
    if (Math.hypot(m.me.x - me.x, m.me.z - me.z) > 7 && !me.dash) { me.x = m.me.x; me.z = m.me.z; }
    for (const k in this.cd) { const srv = m.me.cds[k] || 0; if (srv > 0.15) this.cd[k] = this.clock + srv; else if (this.clock - (this.castAt[k] || -9) > 0.6 && this.cd[k] > this.clock + 0.3) this.cd[k] = 0; }
    // entities
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (const a of m.ents) {
      const id = a[1];
      seen.add(id);
      let e = this.ents.get(id);
      if (!e) e = this._spawnEnt(a);
      if (!e) continue;
      if (a[0] === 'p' || a[0] === 'm') {
        e.px = e.x; e.pz = e.z; e.pr = e.rot; e.nx = a[2]; e.nz = a[3]; e.nr = a[4]; e.t = 0; e.dur = this.transport.interval * 1.15;
        e.hp = a[5]; e.mhp = a[6]; e.lvl = a[7];
        const dead = !!a[9];
        if (dead !== e.dead) { e.dead = dead; e.actor.setDead(dead); }
        e.moving = !!a[10];
      } else if (a[0] === 'g') {
        if (!!a[4] !== e.avail) { e.avail = !!a[4]; e.obj.scale.setScalar(e.avail ? 1 : 0.35); e.obj.userData.halo.visible = e.avail; }
      }
    }
    for (const e of [...this.ents.values()]) if (e.type !== 'n' && !seen.has(e.id)) this._removeEnt(e);
    for (const ev of m.ev) this._event(ev);
  }

  _spawnEnt(a) {
    const type = a[0], id = a[1];
    const e = { id, type, x: a[2], z: a[3], rot: 0, px: a[2], pz: a[3], pr: 0, nx: a[2], nz: a[3], nr: 0, t: 1, dur: 0.1, speed: 0, dead: false, hp: 1, mhp: 1 };
    if (type === 'p') { e.rot = e.pr = e.nr = a[4]; e.look = a[8]; e.name = a[11]; e.actor = createActor('player', { look: a[8] }, this.world.tex); e.color = LOOKS[a[8] % LOOKS.length].blade; }
    else if (type === 'm') { e.rot = e.pr = e.nr = a[4]; e.kind = a[8]; e.lvl = a[7]; e.actor = createActor(a[8], { level: a[7] }, this.world.tex); }
    else if (type === 'l') { e.kind = a[4]; e.obj = makeLoot(a[4], a[5], this.world.tex.soft); e.spin = Math.random() * 6; }
    else if (type === 'g') { e.avail = true; e.obj = makeGatherNode(this.world.tex.soft); }
    else return null;
    if (e.actor) { e.obj = e.actor.group; e.height = e.actor.height; }
    e.obj.position.set(e.x, heightAt(e.x, e.z), e.z);
    this.world.scene.add(e.obj);
    this.ents.set(id, e);
    if (type === 'l') this.fx.burst(e.x, heightAt(e.x, e.z) + 0.5, e.z, { n: 8, color: 0xffe9a0, speed: 2.5, life: 0.5, size: 4 });
    return e;
  }

  _removeEnt(e) {
    this.world.scene.remove(e.obj);
    this.ui.dropPlate(e.id);
    this.ents.delete(e.id);
    if (this.hover === e) this.hover = null;
    if (this.lastTarget === e) this.lastTarget = null;
  }

  _screen(x, y, z) {
    const v = this._v.set(x, y, z).project(this.world.camera);
    return { x: (v.x * 0.5 + 0.5) * this.world.viewW, y: (-v.y * 0.5 + 0.5) * this.world.viewH, ok: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.15 };
  }
  _floatAt(x, z, h, text, cls) { const s = this._screen(x, heightAt(x, z) + h, z); if (s.ok) this.ui.float(s.x, s.y, text, cls); }

  _event(ev) {
    const me = this.me, fx = this.fx, ui = this.ui, au = this.audio;
    const d = ev.x !== undefined ? Math.hypot(ev.x - me.x, ev.z - me.z) : 0;
    const ent = ev.id ? this.ents.get(ev.id) : null;
    switch (ev.e) {
      case 'cast': {
        if (ev.id === me.id) break;
        if (ent && ent.actor) { ent.nr = ent.rot = Math.atan2(ev.dx, ev.dz); this._playCast(ent.actor, ent.color || 0x9fc8ff, ev, d); }
        break;
      }
      case 'dmg': {
        const mine = ev.id === me.id;
        if (mine) { this._floatAt(me.x, me.z, 2.1, '-' + ev.amt, 'hurt'); this.meActor.hit(); fx.hit(me.x, me.z, 0xff5a4a); this.danger = 1; fx.shake = Math.max(fx.shake, 0.25); au.sfx('hurt'); }
        else {
          if (ent && ent.actor) ent.actor.hit();
          if (ev.by === me.id) { this._floatAt(ev.x, ev.z, (ent ? ent.height : 1.6), String(ev.amt), ev.crit ? 'crit' : ''); au.sfx(ev.crit ? 'crit' : 'hit'); if (ent) { this.lastTarget = ent; this.lastTargetAt = this.clock; } if (ev.crit) fx.shake = Math.max(fx.shake, 0.18); }
          else if (d < 30) au.sfx('hit', d + 12);
          fx.hit(ev.x, ev.z, ev.pl ? 0xff6a5a : 0xcfe6ff, ent ? Math.min(1.6, ent.height * 0.5) : 1);
        }
        break;
      }
      case 'die': {
        if (ev.id === me.id) break;
        const col = { wisp: 0x8fe0ff, spore: 0x8ffbe6, wolf: 0x9aa4b4, thorn: 0x9dff6a, sentinel: 0x4fd0ff, player: 0xffb4a6 }[ev.k] || 0xffffff;
        fx.puff(ev.x, ev.z, col, ev.k === 'sentinel' ? 90 : 26, 1);
        au.sfx(ev.k === 'sentinel' ? 'boom' : 'mobdie', d);
        if (ev.k === 'sentinel') { fx.shake = 0.8; fx.ring(ev.x, ev.z, 9, 0x4fd0ff, 1.2); }
        if (ev.k === 'player' && ev.name) ui.chat('bad', '', t('sys_died', ev.name));
        break;
      }
      case 'spawn': fx.ring(ev.x, ev.z, 1.6, 0x9fc8ff, 0.5); break;
      case 'respawn': fx.ring(ev.x, ev.z, 2.2, 0xffe9a0, 0.7); fx.beam(ev.x, ev.z, 0.7, 9, 0xffe9a0, 0.8); break;
      case 'atk': {
        if (!ent || !ent.actor) break;
        if (ev.k === 'slam') { ent.actor.play('slam', 2.1); au.sfx('roar', d); }
        else if (ev.k === 'roar') { ent.actor.play('roar', 1.0); au.sfx('roar', d); }
        else { ent.actor.play('atk', 0.5); if (ent.kind === 'wisp') au.sfx('bolt', d); }
        break;
      }
      case 'proj': fx.bolt(ev.id, ev.x, ev.z, ev.dx, ev.dz, ev.spd, ev.ttl, ev.lv >= 4 ? 0xc27bff : 0x7fdcff); break;
      case 'pjend': fx.endProj(ev.id, ev.x, ev.z); break;
      case 'tele': fx.telegraph(ev.x, ev.z, ev.r, ev.t, ev.k !== 'star'); if (ev.k !== 'star') au.sfx('tele', d); break;
      case 'boom': {
        if (ev.k === 'star') { fx.starfall(ev.x, ev.z, ev.r, 0x8fc4ff); au.sfx('starfall', d); }
        else { fx.quake(ev.x, ev.z, ev.r, ev.k === 'slam'); au.sfx('boom', d); fx.shake = Math.max(fx.shake, ev.k === 'slam' ? 0.9 * Math.max(0, 1 - d / 30) : 0.4 * Math.max(0, 1 - d / 20)); }
        break;
      }
      case 'lvl': {
        fx.levelUp(ev.x, ev.z);
        if (ev.id === me.id) {
          ui.banner(t('level_up'), t('level_up_s', ev.lvl)); au.sfx('levelup');
          this.world.post.mFinal.uniforms.uFlash.value = 0.35;
          for (const s of SKILL_ORDER) if (SKILLS[s].lvl === ev.lvl) ui.toast(t('new_skill', t('sk_' + s)), '#ffe9a0');
        } else ui.chat('good', '', t('sys_lvl', ev.name, ev.lvl));
        break;
      }
      case 'heal': { const x = ev.id === me.id ? me.x : ev.x, z = ev.id === me.id ? me.z : ev.z; fx.puff(x, z, ev.k === 'hp' ? 0x7be08f : 0x7fb8ff, 14, 1); if (ev.id === me.id) this._floatAt(x, z, 2.1, '+' + ev.amt, ev.k === 'hp' ? 'heal' : 'mana'); break; }
      case 'pick': fx.burst(ev.x, heightAt(ev.x, ev.z) + 0.6, ev.z, { n: 12, color: ev.k === 'gold' ? 0xffd866 : 0xffffff, speed: 3, life: 0.5, size: 5, up: 1.5 }); if (ev.by === me.id) au.sfx(ev.k === 'gold' ? 'coin' : 'pickup'); break;
      case 'gather': fx.burst(ev.x, heightAt(ev.x, ev.z) + 0.5, ev.z, { n: 24, color: 0x6fffd8, speed: 3, life: 0.9, size: 6, up: 1.6, gravity: -1 }); if (ev.by === me.id) au.sfx('gather'); break;
      case 'chat': if (ev.line !== undefined) ui.botChat(ev.from, ev.line, ev.who); else ui.chat(ev.id === me.id ? 'me' : '', ev.from, ev.text); break;
      case 'join': ui.chat('sys', '', t('sys_join', ev.name)); break;
      case 'leave': ui.chat('sys', '', t('sys_leave', ev.name)); break;
      case 'sys': {
        const msg = t('sys_' + ev.k, ...(ev.a || []));
        if (ev.k === 'bosswake' || ev.k === 'enrage') { if (ev.k === 'enrage' || this.zone === 'gate' || this.zone === 'rot') { ui.banner(msg, '', 2200); } ui.chat('bad', '', msg); }
        else if (ev.k === 'bosskill') { ui.chat('good', '', msg); ui.banner(msg, '', 3500); }
        else { ui.toast(msg, '#ff8d7d'); au.sfx('deny'); }
        break;
      }
      case 'xp': this._floatAt(me.x, me.z, 2.5, `+${ev.amt} XP`, 'xp'); break;
      case 'gold': this._floatAt(me.x, me.z, 2.2, `+${ev.amt}`, 'gold'); break;
      case 'loot': ui.toast(t('sys_loot', itemName(ev.item)), RARITY_COLORS[ev.item.q]); ui.chat('good', '', t('sys_loot', `[${itemName(ev.item)}]`)); au.sfx('loot'); break;
      case 'pot': ui.toast(t('sys_loot', t('pot_' + ev.k)), ev.k === 'hp' ? '#ff8d7d' : '#7fb8ff'); break;
      case 'quest': {
        if (ev.k === 'accept') { ui.banner(t('q_new'), t('q' + (ev.i + 1) + '_t'), 2600); au.sfx('quest'); }
        else if (ev.k === 'ready') { ui.toast(t('q_ready'), '#7be08f'); au.sfx('quest'); }
        else if (ev.k === 'done') { ui.banner(t('q_complete'), t('q' + (ev.i + 1) + '_t'), 3000); au.sfx('levelup'); }
        break;
      }
      case 'pos': me.x = ev.x; me.z = ev.z; me.dash = null; break;
    }
  }

  // ------------------------------------------------------------ per-frame
  _updateAim() {
    const me = this.me, aim = this.aim;
    let best = null, bd = 1e9;
    if (this.input.hasMouse && !this.touch) {
      const cam = this.world.camera;
      this._v.set((this.input.mx / this.world.viewW) * 2 - 1, -(this.input.my / this.world.viewH) * 2 + 1, 0.5).unproject(cam);
      const o = cam.position, dx = this._v.x - o.x, dy = this._v.y - o.y, dz = this._v.z - o.z;
      const k = dy < -1e-4 ? (me.y + 0.9 - o.y) / dy : 30;
      aim.x = o.x + dx * k; aim.z = o.z + dz * k;
      for (const e of this.ents.values()) { if (e.type !== 'm' || e.dead) continue; const d = Math.hypot(e.x - aim.x, e.z - aim.z) - (e.actor.radius || 0.5); if (d < 1.5 && d < bd) { bd = d; best = e; } }
    } else {
      for (const e of this.ents.values()) { if (e.type !== 'm' || e.dead) continue; const d = Math.hypot(e.x - me.x, e.z - me.z); if (d < 11 && d < bd) { bd = d; best = e; } }
      if (best) { aim.x = best.x; aim.z = best.z; } else { aim.x = me.x + Math.sin(me.rot) * 6; aim.z = me.z + Math.cos(me.rot) * 6; }
    }
    this.hover = best;
    let dx = (best ? best.x : aim.x) - me.x, dz = (best ? best.z : aim.z) - me.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.25) { dx = Math.sin(me.rot); dz = Math.cos(me.rot); } else { dx /= l; dz /= l; }
    aim.dx = dx; aim.dz = dz;
  }

  _updatePlay(dt) {
    const me = this.me, inp = this.input, cam = this.cam, ui = this.ui;
    const typing = document.activeElement === ui.chatIn;
    // --- movement
    let mx = 0, mz = 0;
    if (!typing) {
      const K = inp.keys;
      const f = (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0) - inp.joy.y;
      const r = (K.has('KeyD') || K.has('ArrowRight') ? 1 : 0) - (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0) + inp.joy.x;
      mx = -Math.sin(cam.yaw) * f + Math.cos(cam.yaw) * r; mz = -Math.cos(cam.yaw) * f - Math.sin(cam.yaw) * r;
    }
    const ml = Math.hypot(mx, mz);
    me.moving = false;
    if (me.dash) {
      const d = me.dash; d.t += dt / d.dur;
      const k = Math.min(1, d.t), e = 1 - (1 - k) * (1 - k);
      me.x = lerp(d.x0, d.x1, e); me.z = lerp(d.z0, d.z1, e); me.moving = true;
      if (k >= 1) me.dash = null;
    } else if (ml > 0.15 && !me.dead) {
      const sp = PLAYER_SPEED * Math.min(1, ml) * dt;
      const [x, z] = this.layout.collide(me.x + mx / ml * sp, me.z + mz / ml * sp, 0.4);
      me.speed = Math.hypot(x - me.x, z - me.z) / dt;
      me.x = x; me.z = z; me.moving = true;
      if (me.faceLock <= 0) me.rot = angLerp(me.rot, Math.atan2(mx, mz), Math.min(1, dt * 14));
    }
    if (!me.moving) me.speed = 0;
    me.faceLock -= dt;
    if (me.faceLock > 0) me.rot = angLerp(me.rot, me.aimRot, Math.min(1, dt * 22));
    me.y = heightAt(me.x, me.z);
    this._updateAim();
    if (inp.attack && !typing) this.cast('slash');
    // --- network
    if (this.clock >= this.sendAt) {
      this.sendAt = this.clock + 0.066;
      if (!me.dead && (me.moving || this._sentMoving || Math.abs(me.rot - (this._sentRot || 0)) > 0.02)) {
        this.send({ t: 'm', x: +me.x.toFixed(2), z: +me.z.toFixed(2), r: +me.rot.toFixed(2), mv: me.moving ? 1 : 0 });
        this._sentMoving = me.moving; this._sentRot = me.rot;
      }
    }
    this.transport.update(dt);
    // --- my avatar
    const ma = this.meActor;
    ma.group.position.set(me.x, me.y, me.z); ma.group.rotation.y = me.rot;
    ma.update(dt, me.dash ? 9 : me.speed);
    // --- other entities
    const camera = this.world.camera;
    let interact = null, ibest = 1e9, fire = 0;
    for (const e of this.ents.values()) {
      const dist = Math.hypot(e.x - me.x, e.z - me.z);
      if (e.type === 'p' || e.type === 'm') {
        e.t += dt;
        const k = Math.min(1, e.t / e.dur);
        e.x = lerp(e.px, e.nx, k); e.z = lerp(e.pz, e.nz, k); e.rot = angLerp(e.pr, e.nr, k);
        const sp = e.moving ? Math.hypot(e.nx - e.px, e.nz - e.pz) / e.dur : 0;
        e.speed = lerp(e.speed, sp, Math.min(1, dt * 10));
        e.obj.position.set(e.x, heightAt(e.x, e.z), e.z); e.obj.rotation.y = e.rot;
        if (dist < 60) e.actor.update(dt, e.speed);
      } else if (e.type === 'n') {
        e.actor.update(dt, 0);
        if (dist < 4.2 && dist < ibest) { ibest = dist; interact = e; }
        if (dist < 9) e.obj.rotation.y = angLerp(e.obj.rotation.y, Math.atan2(me.x - e.x, me.z - e.z), Math.min(1, dt * 3));
      } else if (e.type === 'l') {
        e.spin += dt * 2.5;
        const c = e.obj.userData.core; c.rotation.y = e.spin; c.position.y = 0.5 + Math.sin(e.spin * 1.3) * 0.08;
      } else if (e.type === 'g') {
        if (e.avail && dist < 2.8 && dist < ibest) { ibest = dist; interact = e; }
      }
      // nameplate
      if (e.type !== 'l' && e.type !== 'g') {
        const show = dist < 38 && !(e.dead && e.type === 'm');
        if (show) { const s = this._screen(e.x, e.obj.position.y + (e.height || 2), e.z); ui.placePlate(e, s.x, s.y - 4, s.ok); }
        else if (ui.plates.has(e.id)) ui.placePlate(e, 0, 0, false);
      }
    }
    {
      const s = this._screen(me.x, me.y + 2.05, me.z);
      ui.placePlate(this._mePlate || (this._mePlate = { id: 'me', type: 'me', name: this.prefs.name, hp: 1, mhp: 1 }), s.x, s.y - 4, s.ok && !me.dead);
    }
    this.interactTarget = interact;
    ui.prompt(interact && !me.dead ? (interact.type === 'n' ? t('prompt_talk', t('npc_' + interact.role)) : t('prompt_gather')) : '');
    if (ui.npcOpen) { const n = this.npcPos(ui.npcOpen); if (n && Math.hypot(n.x - me.x, n.z - me.z) > 8) { ui.close('npc'); } }
    // --- target frame
    const tg = this.hover || (this.clock - this.lastTargetAt < 5 && this.lastTarget && !this.lastTarget.dead ? this.lastTarget : null);
    ui.setTarget(tg && tg.label ? tg : null);
    // --- zone & ambience
    const z = zoneAt(me.x, me.z);
    if (z !== this.zone) { this.zone = z; ui.zone(z); this.audio.setZone(z); }
    for (const f of FIRES) fire = Math.max(fire, 1 - Math.hypot(f.x - me.x, f.z - me.z) / 16);
    this.audio.setFire(Math.max(0, fire));
    // --- hud (10 Hz for the heavier bits)
    if (this.clock >= this.uiAt) {
      this.uiAt = this.clock + 0.1;
      ui.setVitals(me);
      ui.updateSkills((s) => this.cdRemaining(s), me.mp);
      ui.drawMinimap(me, this.ents.values(), cam.yaw);
      if (ui.open.has('map')) ui.drawBigMap();
    }
  }

  _updateTitle(dt) {
    const cam = this.cam;
    cam.tYaw = 0.42 + Math.sin(this.clock * 0.07) * 0.4;
    cam.tDist = 23; cam.tPitch = 0.68;
    this.meActor.update(dt, 0);
  }

  frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000)); this.last = now;
    this.clock += dt;
    const me = this.me, cam = this.cam, world = this.world;
    if (this.mode === 'play') this._updatePlay(dt); else this._updateTitle(dt);
    // camera rig
    const k = 1 - Math.exp(-dt * 9);
    cam.yaw = lerp(cam.yaw, cam.tYaw, k); cam.pitch = lerp(cam.pitch, cam.tPitch, k); cam.dist = lerp(cam.dist, cam.tDist, k);
    cam.target.x = lerp(cam.target.x, me.x, 1 - Math.exp(-dt * 12));
    cam.target.z = lerp(cam.target.z, me.z, 1 - Math.exp(-dt * 12));
    cam.target.y = lerp(cam.target.y, me.y + 1.2, 1 - Math.exp(-dt * 6));
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), c = world.camera, sh = this.fx.shake;
    c.position.set(cam.target.x + Math.sin(cam.yaw) * cp * cam.dist, cam.target.y + sp * cam.dist, cam.target.z + Math.cos(cam.yaw) * cp * cam.dist);
    c.position.y = Math.max(c.position.y, heightAt(c.position.x, c.position.z) + 2);
    c.lookAt(cam.target);
    if (sh > 0) { c.position.x += (Math.random() - 0.5) * sh * 0.5; c.position.y += (Math.random() - 0.5) * sh * 0.5; c.rotation.z += (Math.random() - 0.5) * sh * 0.02; }
    // grass reacts to nearby bodies
    const push = [{ x: me.x, z: me.z, r: 1.3, k: 0.9 }];
    if (this.mode === 'play') for (const e of this.ents.values()) { if (push.length >= 8) break; if ((e.type === 'm' || e.type === 'p') && !e.dead && Math.abs(e.x - me.x) < 26 && Math.abs(e.z - me.z) < 26) push.push({ x: e.x, z: e.z, r: e.kind === 'sentinel' ? 3 : 1.2, k: e.kind === 'wisp' ? 0.25 : 0.8 }); }
    this._hero.set(me.x, me.y, me.z);
    world.update(dt, this._hero, push);
    this.fx.update(dt);
    // screen feedback
    const u = world.post.mFinal.uniforms;
    this.danger = Math.max(0, this.danger - dt * 1.6);
    const low = me.full && !me.dead && me.hp < me.full.mhp * 0.3 ? 0.35 + Math.sin(this.clock * 6) * 0.15 : 0;
    u.uDanger.value = Math.max(this.danger * 0.7, low);
    u.uFlash.value = Math.max(0, u.uFlash.value - dt * 0.9);
    world.render();
    // frame-rate governor: trade resolution for smoothness
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 1.5) {
      const fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
      if (this.clock > 4) {
        if (fps < 30 && this.resScale > 0.5) { this.resScale = Math.max(0.5, this.resScale - 0.12); world.resScale = this.resScale; world.resize(); }
        else if (fps > 57 && this.resScale < 1 && this.clock - this.fpsAt > 8) { this.resScale = Math.min(1, this.resScale + 0.08); world.resScale = this.resScale; world.resize(); this.fpsAt = this.clock; }
      }
      if (this.prefs.fps) this.ui.fps(`${fps.toFixed(0)} fps · ${world.renderer.info.render.triangles >> 10}k tris · ${world.renderer.info.render.calls} calls\n${world.qualityName} ×${this.resScale.toFixed(2)} · ${this.transport ? (this.transport.online ? 'online' : 'solo') + ' · ' + this.transport.playerCount() + 'p' : ''}`);
    }
  }
}

function guessQuality() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  let renderer = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch { /* ignore */ }
  if (/swiftshader|llvmpipe|software/i.test(renderer)) return 'low';
  if (mobile) return (navigator.deviceMemory || 4) >= 6 ? 'medium' : 'low';
  if (/Intel|UHD|Iris|Mali|Adreno/i.test(renderer) && !/Arc|Apple/i.test(renderer)) return 'medium';
  return 'high';
}
