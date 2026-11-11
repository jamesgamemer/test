// Headless soak test of the shared simulation: bots hunt, a scripted player fights, nothing may throw.
import { Sim } from '../src/shared/sim.js';
import { SKILLS } from '../src/shared/data.js';

const sim = new Sim({ bots: 6 });
const me = sim.addPlayer({ name: 'Tester', look: 0 });
const p = sim.players.get(me);
let events = {}, deaths = 0;
const minutes = +(process.argv[2] || 20);
for (let i = 0; i < minutes * 60 * 20; i++) {
  // scripted player: walk to nearest mob and attack it
  if (p.dead) { sim.handle(me, { t: 'respawn' }); deaths++; }
  else {
    let best = null, bd = 1e9;
    for (const m of sim.mobs.values()) { if (m.dead || m.lvl > p.lvl + 1 || m.kind === 'sentinel') continue; const d = Math.hypot(m.x - p.x, m.z - p.z); if (d < bd) { bd = d; best = m; } }
    if (best) {
      const dx = (best.x - p.x) / (bd || 1), dz = (best.z - p.z) / (bd || 1);
      if (bd > 2.2) sim.handle(me, { t: 'm', x: p.x + dx * 6 * 0.05, z: p.z + dz * 6 * 0.05, r: Math.atan2(dx, dz), mv: 1 });
      for (const s of ['slash', 'nova', 'wave', 'starfall']) if (bd < (SKILLS[s].range || SKILLS[s].radius || 3)) sim.handle(me, { t: 'c', s, dx, dz, tx: best.x, tz: best.z });
      if (p.hp < p.mhp * 0.4) sim.handle(me, { t: 'pot', k: 'hp' });
    }
    if (p.quest.s === 'offer' || p.quest.s === 'ready') { // teleport-free: quests need the elder nearby, so emulate being there
      const ox = p.x, oz = p.z; p.x = sim.npcs[0].x + 1; p.z = sim.npcs[0].z + 1;
      sim.handle(me, { t: 'quest', a: p.quest.s === 'offer' ? 'accept' : 'turnin' });
      p.x = ox; p.z = oz;
    }
  }
  sim.tick(0.05);
  if (i % 2 === 0) { const s = sim.snapshot(me); for (const ev of s.ev) events[ev.e] = (events[ev.e] || 0) + 1; JSON.stringify(s); }
}
console.log('time', sim.time.toFixed(0), 'player lvl', p.lvl, 'gold', p.gold, 'inv', p.inv.length, 'quest', JSON.stringify(p.quest), 'deaths', deaths, 'kills', p.kills);
console.log('bots', [...sim.players.values()].filter((b) => b.bot).map((b) => `${b.name}:L${b.lvl}/${b.ai.st}/k${b.kills}${b.dead ? '/dead' : ''}`).join(' '));
console.log('events', JSON.stringify(events));
console.log('mobs alive', [...sim.mobs.values()].filter((m) => !m.dead).length, '/', sim.mobs.size, 'loot', sim.loot.size, 'gathers', sim.gathers.length);
const snap = sim.snapshot(me);
console.log('snapshot bytes', JSON.stringify(snap).length, 'ents', snap.ents.length);
