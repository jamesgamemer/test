import { t, setLang, getLang, itemName, botLine, RARITY_COLORS } from './i18n.js';
import { SKILLS, SKILL_ORDER, QUESTS, SHOP, INV_SIZE } from '../shared/data.js';
import { WORLD_SIZE, HALF, POIS } from '../shared/world.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
export const ICONS = {
  slash: svg('<path d="M4 20C6 10 12 5 21 3c-5 4-8 9-9 17"/><path d="M4 20l5-2"/>'),
  wave: svg('<path d="M5 5c5 3 5 11 0 14M11 5c5 3 5 11 0 14M17 5c5 3 5 11 0 14"/>'),
  dash: svg('<path d="M3 7l5 5-5 5M9 7l5 5-5 5M17 5l3 7-3 7"/>'),
  nova: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>'),
  starfall: svg('<path d="M12 9l1.6 3.4 3.7.4-2.8 2.5.8 3.7-3.3-1.9-3.3 1.9.8-3.7-2.8-2.5 3.7-.4zM6 2l2 4M12 1v4M18 2l-2 4"/>'),
  potion: svg('<path d="M9 3h6M10 3v5l-4 8a3 3 0 0 0 3 5h6a3 3 0 0 0 3-5l-4-8V3M7.5 14h9"/>'),
  weapon: svg('<path d="M20 4L9 15M20 4v4M20 4h-4M6 12l6 6M4 20l4-4"/>'),
  armor: svg('<path d="M6 4l6-2 6 2v8c0 5-3 8-6 10-3-2-6-5-6-10z"/><path d="M12 6v12"/>'),
  trinket: svg('<circle cx="12" cy="15" r="5"/><path d="M12 10V4M9 4h6M12 13v4M10 15h4"/>'),
  hand: svg('<path d="M8 12V5a1.5 1.5 0 0 1 3 0v5V4a1.5 1.5 0 0 1 3 0v6V6a1.5 1.5 0 0 1 3 0v8c0 4-2 7-6 7s-6-3-7-7l-1-3a1.5 1.5 0 0 1 3-1z"/>'),
};
const KEYS = { slash: 'LMB', wave: '1', dash: '2', nova: '3', starfall: '4' };
const QUEST_SPOT = [[-2, 6], [POIS.hollow.x, POIS.hollow.z], [POIS.den.x, POIS.den.z], [POIS.rot.x, POIS.rot.z], [POIS.gate.x, POIS.gate.z]];

export class UI {
  constructor(game) {
    this.g = game;
    this.full = null;
    this.sel = null;         // selected item: {where:'inv'|'eq', i|slot}
    this.open = new Set();
    this.plates = new Map();
    this.npcOpen = null;
    this.floatCount = 0;
    this._build();
    this.applyLang();
  }

  // ------------------------------------------------------------ setup
  _build() {
    const bar = $('#skillbar');
    this.slots = {};
    SKILL_ORDER.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'slot'; el.dataset.skill = s;
      el.innerHTML = `<span class="key">${KEYS[s]}</span><div class="ic">${ICONS[s]}</div><div class="cd"></div><div class="cdt"></div>`;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.g.cast(s); });
      this._tipOn(el, () => `<h5>${t('sk_' + s)}</h5><p>${t('sk_' + s + '_d')}</p><small>${SKILLS[s].mp ? t('cost', SKILLS[s].mp) + ' · ' : ''}${t('cooldown', SKILLS[s].cd)}${this.full && this.full.lvl < SKILLS[s].lvl ? ' · ' + t('unlock_at', SKILLS[s].lvl) : ''}</small>`);
      bar.appendChild(el); this.slots[s] = el;
    });
    for (const k of ['hp', 'mp']) {
      const el = document.createElement('div');
      el.className = `slot pot ${k}-pot` + (k === 'hp' ? ' gap' : '');
      el.innerHTML = `<span class="key">${k === 'hp' ? 'Q' : 'E'}</span><div class="ic">${ICONS.potion}</div><div class="cd"></div><div class="cdt"></div><span class="cnt"></span>`;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.g.usePotion(k); });
      this._tipOn(el, () => `<h5>${t('pot_' + k)}</h5><p>${t('pot_' + k + '_d')}</p>`);
      bar.appendChild(el); this.slots['pot_' + k] = el;
    }
    document.querySelectorAll('#menu button').forEach((b) => b.addEventListener('click', () => this.toggle(b.dataset.open)));
    document.querySelectorAll('.panel .x').forEach((b) => b.addEventListener('click', () => this.close(b.closest('.panel').id.replace('panel-', ''))));
    $('#btn-respawn').addEventListener('click', () => this.g.respawn());
    // chat
    const inp = this.chatIn = $('#chat-in');
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = inp.value.trim(); if (v) this.g.chat(v); inp.value = ''; inp.blur(); }
      else if (e.key === 'Escape') { inp.value = ''; inp.blur(); }
    });
    // settings
    $('#set-vol').addEventListener('input', (e) => this.g.setVolume(e.target.value / 100));
    $('#set-lang').addEventListener('change', (e) => this.g.setLanguage(e.target.value));
    $('#set-quality').addEventListener('change', (e) => this.g.setQuality(e.target.value));
    $('#set-fps').addEventListener('change', (e) => { $('#fps').classList.toggle('hidden', !e.target.checked); this.g.prefs.fps = e.target.checked; this.g.savePrefs(); });
    $('#set-reset').addEventListener('click', () => { if (confirm(t('reset_confirm'))) this.g.resetSave(); });
    $('#prompt').addEventListener('pointerdown', () => this.g.interact());
    this.mm = $('#minimap').getContext('2d');
    this.north = $('#minimap-wrap .north');
    this._buildTouch();
  }

  _buildTouch() {
    const tb = $('#tbtns');
    const mk = (cls, icon, style, down, up) => {
      const b = document.createElement('button');
      b.className = cls; b.innerHTML = icon; b.style.cssText = style;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); down(); });
      if (up) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, up);
      tb.appendChild(b);
      return b;
    };
    mk('big', ICONS.slash, '', () => { this.g.input.attack = true; }, () => { this.g.input.attack = false; });
    mk('', ICONS.wave, 'right:96px;bottom:0', () => this.g.cast('wave'));
    mk('', ICONS.dash, 'right:88px;bottom:68px', () => this.g.cast('dash'));
    mk('', ICONS.nova, 'right:30px;bottom:110px', () => this.g.cast('nova'));
    mk('', ICONS.starfall, 'right:152px;bottom:40px', () => this.g.cast('starfall'));
    const stick = $('#stick'), nub = stick.firstElementChild;
    let pid = null;
    const move = (e) => {
      const r = stick.getBoundingClientRect();
      let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      this.g.input.joy.x = x; this.g.input.joy.y = y;
      nub.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
    };
    stick.addEventListener('pointerdown', (e) => { pid = e.pointerId; stick.setPointerCapture(pid); move(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
    const end = (e) => { if (e.pointerId !== pid) return; pid = null; this.g.input.joy.x = this.g.input.joy.y = 0; nub.style.transform = ''; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  }

  setTouch(on) { $('#touch').classList.toggle('hidden', !on); document.body.classList.toggle('touch', on); }

  applyLang() {
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
    $('#title-sub').textContent = t('title_sub');
    $('#in-name').placeholder = t('name_ph');
    this.chatIn.placeholder = t('chat_ph');
    $('#set-controls').textContent = t('controls');
    $('#title-controls').textContent = t('controls');
    $('#set-lang').value = $('#t-lang').value = getLang();
    if (this.full) { this.renderBag(); this.renderQuest(); this.renderTracker(); if (this.npcOpen) this.openNpc(this.npcOpen); }
    for (const [, p] of this.plates) if (p.refresh) p.refresh();
  }

  _tipOn(el, html) {
    const tip = $('#tip');
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      tip.innerHTML = html(); tip.classList.remove('hidden');
      const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
      tip.style.top = Math.max(8, r.top - h - 10) + 'px';
    });
    el.addEventListener('pointerleave', () => tip.classList.add('hidden'));
  }

  // ------------------------------------------------------------ vitals & bars
  setFull(full) {
    const prev = this.full;
    this.full = full;
    $('#me-name').textContent = full.name;
    $('#me-lvl').textContent = full.lvl;
    $('#bag-gold').textContent = full.gold;
    this.slots.pot_hp.querySelector('.cnt').textContent = full.pots.hp;
    this.slots.pot_mp.querySelector('.cnt').textContent = full.pots.mp;
    for (const s of SKILL_ORDER) {
      const locked = full.lvl < SKILLS[s].lvl;
      this.slots[s].classList.toggle('locked', locked);
      if (locked) this.slots[s].querySelector('.cdt').textContent = 'Lv ' + SKILLS[s].lvl;
    }
    if (this.sel && this.sel.where === 'inv' && (!prev || prev.inv.length !== full.inv.length || !full.inv[this.sel.i])) this.sel = null;
    if (this.open.has('bag')) this.renderBag();
    this.renderQuest(); this.renderTracker();
    if (this.npcOpen) this.openNpc(this.npcOpen, true);
  }

  setVitals(v) {
    const f = this.full; if (!f) return;
    $('#me-hp').style.width = (100 * v.hp / f.mhp) + '%';
    $('#me-mp').style.width = (100 * v.mp / f.mmp) + '%';
    $('#me-hp-t').textContent = `${Math.max(0, Math.ceil(v.hp))} / ${f.mhp}`;
    $('#me-mp-t').textContent = `${Math.floor(v.mp)} / ${f.mmp}`;
    $('#xp-fill').style.width = Math.min(100, 100 * v.xp / f.xpn) + '%';
    $('#xp-t').textContent = `${t('lv')} ${f.lvl} · ${Math.floor(100 * v.xp / f.xpn)}%`;
  }

  updateSkills(remaining, mp) {
    const f = this.full; if (!f) return;
    for (const s of SKILL_ORDER) {
      const el = this.slots[s], sk = SKILLS[s];
      if (f.lvl < sk.lvl) continue;
      const rem = remaining(s);
      el.querySelector('.cd').style.setProperty('--p', (rem > 0 ? Math.min(100, 100 * rem / sk.cd) : 0) + '%');
      el.querySelector('.cdt').textContent = rem > 0.6 ? Math.ceil(rem) : '';
      el.classList.toggle('nomana', mp < sk.mp);
    }
    for (const k of ['hp', 'mp']) {
      const el = this.slots['pot_' + k], rem = remaining('pot_' + k);
      el.querySelector('.cd').style.setProperty('--p', (rem > 0 ? 100 * rem / 6 : 0) + '%');
    }
  }
  flashSlot(s) { const el = this.slots[s]; if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

  setTarget(e) {
    const el = $('#unit-target');
    if (!e) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.classList.toggle('boss', e.kind === 'sentinel');
    $('#tg-name').textContent = e.label;
    $('#tg-lvl').textContent = `${t('lv')} ${e.lvl}`;
    $('#tg-hp').style.width = Math.max(0, 100 * e.hp / e.mhp) + '%';
    $('#tg-hp-t').textContent = `${Math.max(0, e.hp)} / ${e.mhp}`;
  }

  // ------------------------------------------------------------ world-anchored elements
  plate(e) {
    let p = this.plates.get(e.id);
    if (!p) {
      const el = document.createElement('div');
      const cls = e.type === 'me' ? 'me' : e.type === 'p' ? 'player' : e.type === 'n' ? 'npc' : e.kind === 'sentinel' ? 'boss' : 'mob';
      el.className = 'plate ' + cls;
      p = { el, hp: -1, shown: true };
      p.refresh = () => {
        const sub = e.type === 'm' ? `<small>${t('lv')} ${e.lvl}</small>` : e.type === 'n' ? `<small>${t('npc_' + e.role + '_t')}</small>` : '';
        const name = e.type === 'm' ? t('mob_' + e.kind) : e.type === 'n' ? t('npc_' + e.role) : e.name;
        el.innerHTML = `${e.type === 'n' ? '<span class="q"></span>' : ''}<span>${esc(name)}</span>${sub}${e.type === 'm' || e.type === 'p' ? '<div class="hb"><i></i></div>' : ''}`;
        p.bar = el.querySelector('.hb i'); p.q = el.querySelector('.q'); p.hp = -1;
        e.label = name;
      };
      p.refresh();
      $('#plates').appendChild(el);
      this.plates.set(e.id, p);
    }
    return p;
  }
  placePlate(e, sx, sy, visible) {
    const p = this.plate(e);
    if (visible !== p.shown) { p.el.style.display = visible ? '' : 'none'; p.shown = visible; }
    if (!visible) return;
    p.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
    if (p.bar && e.hp !== p.hp) { p.hp = e.hp; p.bar.style.width = Math.max(0, 100 * e.hp / e.mhp) + '%'; p.bar.parentElement.style.visibility = e.hp < e.mhp || e.type === 'm' ? 'visible' : 'hidden'; }
    if (p.q) {
      const q = this.full && this.full.quest, mark = e.role === 'elder' && q ? (q.s === 'offer' ? '!' : q.s === 'ready' ? '?' : '') : '';
      if (p.q.textContent !== mark) p.q.textContent = mark;
    }
  }
  dropPlate(id) { const p = this.plates.get(id); if (p) { p.el.remove(); this.plates.delete(id); } }

  float(sx, sy, text, cls = '') {
    if (this.floatCount > 40) return;
    const el = document.createElement('div');
    el.className = 'float ' + cls; el.textContent = text;
    el.style.left = (sx + (Math.random() - 0.5) * 36) + 'px'; el.style.top = (sy + (Math.random() - 0.5) * 16) + 'px';
    $('#floaters').appendChild(el);
    this.floatCount++;
    setTimeout(() => { el.remove(); this.floatCount--; }, 950);
  }

  toast(text, color) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text; if (color) el.style.color = color;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), 3400);
  }
  banner(title, sub = '', ms = 2600) {
    const b = $('#banner');
    b.querySelector('.bt').textContent = title; b.querySelector('.bs').textContent = sub;
    b.classList.toggle('long', title.length > 16);
    b.classList.add('on'); clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('on'), ms);
  }
  zone(id) {
    const z = $('#zone-banner');
    z.querySelector('.zt').textContent = t('zone_' + id); z.querySelector('.zs').textContent = t('zone_' + id + '_s');
    $('#zone-label').textContent = t('zone_' + id);
    z.classList.add('on'); clearTimeout(this._zt); this._zt = setTimeout(() => z.classList.remove('on'), 3200);
  }
  prompt(text) {
    const p = $('#prompt');
    if (!text) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    if (p.lastChild.textContent !== text) p.lastChild.textContent = text;
  }
  death(on, wait = 0) {
    $('#death').classList.toggle('hidden', !on);
    const b = $('#btn-respawn');
    b.disabled = wait > 0;
    b.textContent = wait > 0 ? t('respawn_in', Math.ceil(wait)) : t('respawn');
  }
  fps(text) { $('#fps').textContent = text; }

  // ------------------------------------------------------------ chat
  chat(kind, from, text) {
    const log = $('#chat-log');
    const el = document.createElement('div');
    el.className = kind;
    el.innerHTML = from ? `<b>${esc(from)}:</b> ${esc(text)}` : esc(text);
    log.appendChild(el);
    while (log.children.length > 60) log.firstChild.remove();
  }
  botChat(from, line, who) { this.chat('', from, botLine(line, who)); }
  focusChat() { this.chatIn.focus(); }

  // ------------------------------------------------------------ panels
  toggle(name) { this.open.has(name) ? this.close(name) : this.show(name); }
  show(name) {
    if (name === 'bag') this.renderBag();
    if (name === 'quests') this.renderQuest();
    if (name === 'map') this.drawBigMap();
    if (name !== 'bag' && name !== 'npc') for (const o of [...this.open]) if (o !== name) this.close(o);
    $('#panel-' + name).classList.remove('hidden');
    this.open.add(name);
    this._layout();
  }
  close(name) {
    $('#panel-' + name).classList.add('hidden');
    this.open.delete(name);
    if (name === 'npc') this.npcOpen = null;
    $('#tip').classList.add('hidden');
    this._layout();
  }
  closeTop() { const last = [...this.open].pop(); if (last) { this.close(last); return true; } return false; }
  _layout() {
    // bag + npc side by side when both are open
    const both = this.open.has('bag') && this.open.has('npc') && window.innerWidth > 1100;
    $('#panel-bag').style.left = both ? '64%' : '50%';
    $('#panel-npc').style.left = both ? '22%' : '50%';
  }

  _icon(it, extra = '') {
    return `<div class="iico" style="--rc:${RARITY_COLORS[it.q]}">${ICONS[it.slot]}${extra}</div>`;
  }
  _stats(it) {
    const rows = [];
    if (it.atk) rows.push(['atk', it.atk]); if (it.def) rows.push(['def', it.def]); if (it.hp) rows.push(['hp', it.hp]); if (it.mp) rows.push(['mp', it.mp]); if (it.crit) rows.push(['crit', it.crit + '%']);
    return rows;
  }

  renderBag() {
    const f = this.full; if (!f) return;
    $('#equip').innerHTML = ['weapon', 'armor', 'trinket'].map((s) => {
      const it = f.eq[s];
      return `<div class="eq" data-slot="${s}">${it ? this._icon(it) : `<div class="iico" style="--rc:#3a4660">${ICONS[s]}</div>`}<div>${it ? `<span style="color:${RARITY_COLORS[it.q]}">${esc(itemName(it))}</span>` : `<span style="color:var(--dim)">${t('empty')}</span>`}<small>${t('slot_' + s)}</small></div></div>`;
    }).join('');
    $('#stats').innerHTML = [['lv', f.lvl], ['hp', f.mhp], ['mp', f.mmp], ['atk', f.atk], ['def', f.def], ['crit', f.crit + '%'], ['kills', f.kills]].map(([k, v]) => `<span>${t(k)}</span><b>${v}</b>`).join('');
    let cells = '';
    for (let i = 0; i < INV_SIZE; i++) {
      const it = f.inv[i];
      cells += `<div class="cell${this.sel && this.sel.where === 'inv' && this.sel.i === i ? ' sel' : ''}" data-i="${i}">${it ? this._icon(it, `<u>${it.lvl}</u>`) : ''}</div>`;
    }
    const grid = $('#bag-grid');
    grid.innerHTML = cells;
    grid.querySelectorAll('.cell').forEach((c) => c.addEventListener('click', () => { const i = +c.dataset.i; if (f.inv[i]) { this.sel = { where: 'inv', i }; this.renderBag(); } }));
    $('#equip').querySelectorAll('.eq').forEach((c) => c.addEventListener('click', () => { if (f.eq[c.dataset.slot]) { this.sel = { where: 'eq', slot: c.dataset.slot }; this.renderBag(); } }));
    $('#bag-count').textContent = t('bag_count', f.inv.length, INV_SIZE);
    $('#bag-gold').textContent = f.gold;
    // detail
    const d = $('#item-detail');
    const it = this.sel ? (this.sel.where === 'inv' ? f.inv[this.sel.i] : f.eq[this.sel.slot]) : null;
    if (!it) { d.innerHTML = `<div style="color:var(--dim)">${t('select_item')}</div>`; return; }
    const cur = this.sel.where === 'inv' ? f.eq[it.slot] : null;
    const diff = (k, v) => { if (!cur) return ''; const dv = Math.round((parseFloat(v) - (cur[k] || 0)) * 10) / 10; return dv ? ` <span class="${dv > 0 ? 'up' : 'down'}">(${dv > 0 ? '+' : ''}${dv})</span>` : ''; };
    const keys = ['atk', 'def', 'hp', 'mp', 'crit'].filter((k) => it[k] || (cur && cur[k]));
    d.innerHTML = `<h4 style="color:${RARITY_COLORS[it.q]}">${esc(itemName(it))}</h4><div class="sub">${t('rar_' + it.q)} · ${t('slot_' + it.slot)} · ${t('lv')} ${it.lvl}${this.sel.where === 'eq' ? ' · ' + t('equipped') : ''}</div>`
      + keys.map((k) => `<div class="st"><span>${t(k)}</span><b>${it[k] || 0}${k === 'crit' ? '%' : ''}${diff(k, it[k] || 0)}</b></div>`).join('')
      + `<div class="acts">${this.sel.where === 'inv'
        ? `<button class="btn primary" data-a="equip">${t('equip')}</button>${this.g.nearMerchant() ? `<button class="btn" data-a="sell">${t('sell_for', it.value)}</button>` : ''}<button class="btn danger" data-a="drop">${t('drop')}</button>`
        : `<button class="btn" data-a="unequip">${t('unequip')}</button>`}</div>`;
    d.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a, s = this.sel;
      if (a === 'equip') this.g.send({ t: 'equip', i: s.i });
      else if (a === 'sell') this.g.send({ t: 'sell', i: s.i });
      else if (a === 'drop') this.g.send({ t: 'drop', i: s.i });
      else if (a === 'unequip') this.g.send({ t: 'unequip', slot: s.slot });
      this.g.audio.sfx(a === 'sell' ? 'coin' : 'equip');
      this.sel = null;
    }));
  }

  _questHtml(i, withText) {
    const q = QUESTS[i], f = this.full;
    const it = q.reward, rw = `<span>${t('q_reward')}:</span><span style="color:#cda8ff">${q.xp} ${t('xp')}</span><span class="gold"><i></i>${q.gold}</span><span style="color:${RARITY_COLORS[it.q]}">${t('rar_' + it.q)} · ${t('slot_' + it.slot)}</span>`;
    const st = f.quest;
    const prog = st.i === i && st.s !== 'offer' ? `<div class="obj${st.s === 'ready' ? ' ok' : ''}">${t(q.id + '_o')} ${Math.min(st.n, q.count)}/${q.count}${st.s === 'ready' ? ' ✓' : ''}</div>` : `<div class="obj">${t(q.id + '_o')} 0/${q.count}</div>`;
    return `<div class="quest"><h4>${t(q.id + '_t')}</h4>${withText ? `<p>${t(q.id + '_d')}</p>` : ''}${prog}<div class="rw">${rw}</div></div>`;
  }
  renderQuest() {
    const f = this.full; if (!f) return;
    const q = f.quest, body = $('#quest-body');
    if (q.s === 'done') body.innerHTML = `<div class="quest"><p>${t('q_done_all')}</p></div>`;
    else if (q.s === 'offer') body.innerHTML = `<div class="quest"><p>${t('q_talk')}</p></div>`;
    else body.innerHTML = this._questHtml(q.i, true) + (q.s === 'ready' ? `<div class="quest"><p style="color:#7be08f">${t('q_ready')}</p></div>` : '');
  }
  renderTracker() {
    const f = this.full; if (!f) return;
    const q = f.quest, el = $('#tracker');
    if (q.s === 'done') { el.innerHTML = ''; return; }
    if (q.s === 'offer') { el.innerHTML = `<h4>${t('q_new')}</h4><div>${t('q_talk')}</div>`; return; }
    const d = QUESTS[q.i];
    el.innerHTML = `<h4>${t(d.id + '_t')}</h4><div class="${q.s === 'ready' ? 'ok' : ''}">${q.s === 'ready' ? t('q_ready') : `${t(d.id + '_o')} ${q.n}/${d.count}`}</div>`;
  }
  questTarget() {
    const f = this.full; if (!f) return null;
    const q = f.quest;
    if (q.s === 'done') return null;
    if (q.s === 'active') return QUEST_SPOT[q.i];
    return 'elder';
  }

  openNpc(role, refresh = false) {
    const f = this.full; if (!f) return;
    this.npcOpen = role;
    $('#npc-name').textContent = t('npc_' + role); $('#npc-title').textContent = t('npc_' + role + '_t');
    const body = $('#npc-body');
    if (role === 'elder') {
      const q = f.quest;
      if (q.s === 'done') body.innerHTML = `<div class="quest"><p>${t('q_done_all')}</p></div>`;
      else {
        const d = QUESTS[q.i];
        const btn = q.s === 'offer' ? `<button class="btn primary" data-a="accept">${t('q_accept')}</button>` : q.s === 'ready' ? `<button class="btn primary" data-a="turnin">${t('q_turnin')}</button>` : `<button class="btn" disabled>${t('q_progress', q.n, d.count)}</button>`;
        body.innerHTML = this._questHtml(q.i, true) + `<div class="acts" style="display:grid">${btn}</div>`;
        body.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { this.g.send({ t: 'quest', a: b.dataset.a }); this.g.audio.sfx('quest'); }));
      }
    } else {
      body.innerHTML = `<div class="shop">${['hp', 'mp'].map((k) => `<div class="row"><div class="iico" style="--rc:${k === 'hp' ? '#ff8d7d' : '#7fb8ff'}">${ICONS.potion}</div><div>${t('pot_' + k)}<small>${t('pot_' + k + '_d')} · ${f.pots[k]}/20</small></div><span class="gold"><i></i>${SHOP[k]}</span><button class="btn" data-k="${k}" ${f.gold < SHOP[k] || f.pots[k] >= 20 ? 'disabled' : ''}>${t('buy')}</button></div>`).join('')}
        <div class="row"><div><span class="gold"><i></i>${f.gold}</span><small>${t('shop_hint')}</small></div><button class="btn" data-bag="1">${t('bag')}</button></div></div>`;
      body.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { this.g.send({ t: 'buy', k: b.dataset.k }); this.g.audio.sfx('coin'); }));
      body.querySelector('[data-bag]').addEventListener('click', () => this.show('bag'));
    }
    if (!refresh) { this.show('npc'); if (role === 'merchant') this.show('bag'); }
  }

  // ------------------------------------------------------------ maps
  setMapImage(canvas) { this.mapImg = canvas; }
  drawMinimap(me, ents, yaw) {
    const ctx = this.mm, c = 92, s = 1.75;
    ctx.save();
    ctx.clearRect(0, 0, 184, 184);
    ctx.beginPath(); ctx.arc(c, c, c, 0, 6.283); ctx.clip();
    ctx.fillStyle = '#060b16'; ctx.fillRect(0, 0, 184, 184);
    ctx.translate(c, c); ctx.rotate(yaw);
    if (this.mapImg) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.mapImg, (-HALF - me.x) * s, (-HALF - me.z) * s, WORLD_SIZE * s, WORLD_SIZE * s); }
    for (const e of ents) {
      if (e.type === 'g' && !e.avail) continue;
      if (e.dead) continue;
      const x = (e.x - me.x) * s, z = (e.z - me.z) * s;
      if (x * x + z * z > 96 * 96) continue;
      ctx.fillStyle = e.type === 'm' ? (e.kind === 'sentinel' ? '#ff9a3c' : '#ff5a4a') : e.type === 'p' ? '#7fc4ff' : e.type === 'n' ? '#ffd866' : e.type === 'l' ? '#fff3a0' : '#6fffd8';
      const r = e.type === 'm' && e.kind === 'sentinel' ? 4.5 : e.type === 'n' ? 3.4 : e.type === 'l' ? 1.8 : 2.6;
      ctx.beginPath(); ctx.arc(x, z, r, 0, 6.283); ctx.fill();
    }
    // quest pointer
    const qt = this.questTarget();
    if (qt) {
      const tx = qt === 'elder' ? this.g.npcPos('elder') : { x: qt[0], z: qt[1] };
      if (tx) {
        let x = (tx.x - me.x) * s, z = (tx.z - me.z) * s; const d = Math.hypot(x, z);
        if (d > 80) { x *= 80 / d; z *= 80 / d; }
        ctx.save(); ctx.translate(x, z); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#ffd866'; ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.5;
        ctx.fillRect(-4.5, -4.5, 9, 9); ctx.strokeRect(-4.5, -4.5, 9, 9);
        ctx.restore();
      }
    }
    // me
    ctx.rotate(-me.rot + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a1020'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    this.north.style.transform = `rotate(${yaw}rad)`;
  }
  drawBigMap() {
    const cv = $('#bigmap'), ctx = cv.getContext('2d'), S = cv.width, k = S / WORLD_SIZE;
    ctx.clearRect(0, 0, S, S);
    if (this.mapImg) ctx.drawImage(this.mapImg, 0, 0, S, S);
    ctx.font = '600 13px Sarabun, sans-serif'; ctx.textAlign = 'center';
    const label = (x, z, text, col = '#e6c888') => { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(text, (x + HALF) * k + 1, (z + HALF) * k + 1); ctx.fillStyle = col; ctx.fillText(text, (x + HALF) * k, (z + HALF) * k); };
    label(POIS.camp.x, POIS.camp.z - 9, t('zone_camp')); label(POIS.hollow.x, POIS.hollow.z - 14, t('zone_hollow')); label(POIS.den.x, POIS.den.z + 20, t('zone_den'));
    label(POIS.rot.x, POIS.rot.z - 20, t('zone_rot')); label(POIS.gate.x + 6, POIS.gate.z + 20, t('zone_gate'), '#ffb080'); label(-2, 22, t('zone_whisper'));
    const me = this.g.me;
    for (const e of this.g.ents.values()) if (e.type === 'p') { ctx.fillStyle = '#7fc4ff'; ctx.beginPath(); ctx.arc((e.x + HALF) * k, (e.z + HALF) * k, 3, 0, 6.283); ctx.fill(); }
    const qt = this.questTarget();
    if (qt) { const p = qt === 'elder' ? this.g.npcPos('elder') : { x: qt[0], z: qt[1] }; if (p) { ctx.fillStyle = '#ffd866'; ctx.font = '700 22px Cinzel, serif'; ctx.fillText(qt === 'elder' ? '!' : '◆', (p.x + HALF) * k, (p.z + HALF) * k + 7); } }
    ctx.save(); ctx.translate((me.x + HALF) * k, (me.z + HALF) * k); ctx.rotate(-me.rot + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a1020'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

export { t, setLang, getLang, itemName };
