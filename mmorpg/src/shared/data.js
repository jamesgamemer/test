// Game data shared by client and server. Text lives in the client's i18n tables; only ids here.
import { POIS, GATE } from './world.js';

export const MAX_LEVEL = 12;
export const PLAYER_SPEED = 6.2;
export const INV_SIZE = 24;

export const SKILLS = {
  slash: { cd: 0.5, mp: 0, lvl: 1, range: 3.0, arc: 1.15, mult: 1.0, dur: 0.36 },
  wave: { cd: 4, mp: 10, lvl: 1, range: 15, speed: 21, radius: 1.35, mult: 1.7, dur: 0.4 },
  dash: { cd: 6, mp: 8, lvl: 2, dist: 7.5, radius: 1.6, mult: 1.3, dur: 0.28 },
  nova: { cd: 10, mp: 22, lvl: 4, radius: 5.4, mult: 2.3, slow: 0.45, slowDur: 3.5, dur: 0.6 },
  starfall: { cd: 26, mp: 38, lvl: 6, range: 15, radius: 4.8, delay: 0.8, mult: 4.4, dur: 0.7 },
};
export const SKILL_ORDER = ['slash', 'wave', 'dash', 'nova', 'starfall'];

export const MOBS = {
  wisp: { hp: 44, atk: 7, def: 0, xp: 16, gold: [2, 6], speed: 3.0, aggro: 9.5, range: 7, atkCd: 2.1, radius: 0.45, ranged: 9.5 },
  spore: { hp: 68, atk: 9, def: 1, xp: 22, gold: [3, 8], speed: 2.3, aggro: 7.5, range: 1.6, atkCd: 1.7, radius: 0.5 },
  wolf: { hp: 86, atk: 13, def: 2, xp: 30, gold: [4, 10], speed: 5.3, aggro: 12, range: 1.8, atkCd: 1.35, radius: 0.55 },
  thorn: { hp: 150, atk: 17, def: 5, xp: 46, gold: [7, 15], speed: 2.7, aggro: 9.5, range: 2.1, atkCd: 1.9, radius: 0.5 },
  sentinel: { hp: 2400, atk: 30, def: 9, xp: 900, gold: [150, 220], speed: 2.4, aggro: 15, range: 3.4, atkCd: 2.3, radius: 1.3, boss: true, respawn: 150 },
};

export const SPAWNS = [
  { kind: 'wisp', n: 9, x: -2, z: 6, r: 27, lvl: [1, 2] },
  { kind: 'spore', n: 5, x: -10, z: 14, r: 20, lvl: [2, 2] },
  { kind: 'spore', n: 9, x: POIS.hollow.x, z: POIS.hollow.z, r: 20, lvl: [2, 3] },
  { kind: 'wisp', n: 4, x: POIS.hollow.x, z: POIS.hollow.z, r: 22, lvl: [3, 3] },
  { kind: 'wolf', n: 11, x: POIS.den.x, z: POIS.den.z + 6, r: 24, lvl: [3, 5] },
  { kind: 'thorn', n: 9, x: POIS.rot.x, z: POIS.rot.z, r: 24, lvl: [5, 6] },
  { kind: 'wisp', n: 5, x: POIS.rot.x, z: POIS.rot.z, r: 26, lvl: [5, 5] },
  { kind: 'wolf', n: 3, x: -60, z: -24, r: 11, lvl: [6, 6] },
  { kind: 'sentinel', n: 1, x: GATE.boss.x, z: GATE.boss.z, r: 0, lvl: [8, 8] },
];

export const QUESTS = [
  { id: 'q1', type: 'kill', target: 'wisp', count: 6, xp: 90, gold: 25, reward: { slot: 'weapon', q: 1, lvl: 2 }, pots: { hp: 2, mp: 1 } },
  { id: 'q2', type: 'gather', target: 'glowcap', count: 5, xp: 150, gold: 35, reward: { slot: 'trinket', q: 1, lvl: 3 }, pots: { hp: 3, mp: 2 } },
  { id: 'q3', type: 'kill', target: 'wolf', count: 8, xp: 280, gold: 60, reward: { slot: 'armor', q: 2, lvl: 5 } },
  { id: 'q4', type: 'kill', target: 'thorn', count: 6, xp: 450, gold: 90, reward: { slot: 'weapon', q: 2, lvl: 7 } },
  { id: 'q5', type: 'kill', target: 'sentinel', count: 1, xp: 1300, gold: 300, reward: { slot: 'weapon', q: 3, lvl: 9 } },
];

export const SHOP = { hp: 12, mp: 12 };
export const SLOTS = ['weapon', 'armor', 'trinket'];
export const ITEM_BASES = { weapon: 5, armor: 5, trinket: 5 }; // number of base names per slot (see i18n)

export const xpNeed = (lvl) => Math.round(80 * Math.pow(lvl, 1.6));
export function baseStats(lvl) {
  return { mhp: 120 + 26 * (lvl - 1), mmp: 60 + 8 * (lvl - 1), atk: 12 + 3 * (lvl - 1), def: 2 + (lvl - 1), crit: 5 };
}
export function mobStats(kind, lvl) {
  const b = MOBS[kind], k = lvl - 1;
  return { mhp: Math.round(b.hp * (1 + 0.28 * k)), atk: Math.round(b.atk * (1 + 0.2 * k)), def: Math.round(b.def * (1 + 0.15 * k)), xp: Math.round(b.xp * (1 + 0.25 * k)) };
}

let itemSeq = 1;
export function makeItem(rnd, slot, lvl, q) {
  const f = 1 + 0.28 * q, v = 0.9 + rnd() * 0.2;
  const it = { id: 'i' + (itemSeq++) + Math.floor(rnd() * 1e6).toString(36), slot, base: Math.floor(rnd() * ITEM_BASES[slot]), q, lvl, atk: 0, def: 0, hp: 0, mp: 0, crit: 0 };
  if (slot === 'weapon') { it.atk = Math.max(1, Math.round((3 + lvl * 2.1) * f * v)); if (q >= 2) it.crit = q; }
  else if (slot === 'armor') { it.def = Math.max(1, Math.round((1 + lvl * 0.85) * f * v)); it.hp = Math.round(lvl * 6 * f * v); }
  else { it.crit = Math.round((1.5 + q * 1.5) * v * 10) / 10; it.mp = Math.round(lvl * 4 * f * v); if (q >= 2) it.atk = Math.round(lvl * 0.5); }
  it.value = Math.round((6 + lvl * 4) * (1 + q * 0.9));
  return it;
}
export function rollRarity(rnd, boss = false) {
  const r = rnd();
  if (boss) return r < 0.3 ? 3 : 2;
  return r < 0.006 ? 3 : r < 0.06 ? 2 : r < 0.3 ? 1 : 0;
}
