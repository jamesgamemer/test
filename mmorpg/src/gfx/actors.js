import { THREE } from './common.js';

// ---------------------------------------------------------------- helpers
const geoCache = new Map();
function G(kind, ...a) {
  const k = kind + a.join(',');
  let g = geoCache.get(k);
  if (!g) {
    if (kind === 'box') g = new THREE.BoxGeometry(...a);
    else if (kind === 'sph') g = new THREE.SphereGeometry(...a);
    else if (kind === 'cyl') g = new THREE.CylinderGeometry(...a);
    else if (kind === 'cone') g = new THREE.ConeGeometry(...a);
    else if (kind === 'cap') g = new THREE.CapsuleGeometry(...a);
    else if (kind === 'tor') g = new THREE.TorusGeometry(...a);
    else if (kind === 'ico') g = new THREE.IcosahedronGeometry(...a);
    else if (kind === 'plane') g = new THREE.PlaneGeometry(...a);
    geoCache.set(k, g);
  }
  return g;
}
const matCache = new Map();
function M(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  let m = matCache.get(k);
  if (!m) {
    m = opts.glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(opts.glow), side: opts.side || THREE.FrontSide })
      : new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0, flatShading: !!opts.flat, side: opts.side || THREE.FrontSide });
    matCache.set(k, m);
  }
  return m;
}
function part(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = !mat.isMeshBasicMaterial;
  parent.add(m);
  return m;
}
function joint(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;
let softTex = null;
export function setActorTextures(T) { softTex = T.soft; }
function halo(parent, color, size, y = 0, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size); s.position.y = y;
  parent.add(s);
  return s;
}
function groundGlow(parent, color, size) {
  const m = new THREE.Mesh(G('plane', 1, 1), new THREE.MeshBasicMaterial({ map: softTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.scale.setScalar(size); m.renderOrder = 2;
  parent.add(m);
  return m;
}

class Actor {
  constructor() {
    this.group = new THREE.Group();
    this.phase = Math.random() * 6;
    this.action = null; this.actionT = 0; this.actionDur = 1;
    this.dead = false; this.deadT = 0;
    this.time = Math.random() * 10;
    this.height = 1.9; this.radius = 0.4;
    this.hitT = 1;
  }
  play(name, dur = 0.4, arg = 0) { this.action = name; this.actionT = 0; this.actionDur = dur; this.actionArg = arg; }
  hit() { this.hitT = 0; }
  setDead(d) { if (d !== this.dead) { this.dead = d; this.deadT = 0; if (!d) { this.group.scale.setScalar(1); this.group.position.y = 0; } } }
  // returns normalized action time or -1
  tick(dt, speed, stride) {
    this.time += dt;
    this.phase += speed * dt * stride;
    this.hitT = Math.min(1, this.hitT + dt * 5);
    if (this.dead) this.deadT += dt;
    if (this.action) {
      this.actionT += dt / this.actionDur;
      if (this.actionT >= 1) this.action = null;
    }
    const p = 1 + Math.sin(this.hitT * Math.PI) * 0.12;
    this.inner.scale.set(p, 2 - p, p);
    return this.action ? this.actionT : -1;
  }
}

// ---------------------------------------------------------------- hero
export const LOOKS = [
  { id: 'moon', cloak: 0x2a3a5c, trim: 0x8fb0e6, blade: 0x79b8ff, tunic: 0x39414f },
  { id: 'dusk', cloak: 0x4a2f5e, trim: 0xc59cf0, blade: 0xc88cff, tunic: 0x3b3346 },
  { id: 'moss', cloak: 0x2f4a38, trim: 0x9fd6a0, blade: 0x7dffb0, tunic: 0x3a4238 },
  { id: 'ember', cloak: 0x5a2c26, trim: 0xf0b07a, blade: 0xffa45c, tunic: 0x45362f },
  { id: 'frost', cloak: 0x6f7f96, trim: 0xe8f2ff, blade: 0xbfe9ff, tunic: 0x4a5566 },
];

export class Humanoid extends Actor {
  constructor(lookIndex = 0, { npc = null } = {}) {
    super();
    const L = LOOKS[lookIndex % LOOKS.length];
    this.look = L;
    const cloak = M(npc ? npc.robe : L.cloak, { rough: 0.9, side: THREE.DoubleSide }), tunic = M(npc ? npc.robe2 : L.tunic, { rough: 0.85 });
    const leather = M(0x3a2a1e, { rough: 0.8 }), skin = M(0xd6a988, { rough: 0.7 }), steel = M(0x9aa4b4, { rough: 0.35, metal: 0.85 });
    const trim = M(npc ? npc.trim : L.trim, { rough: 0.5, metal: 0.4 });
    const inner = this.inner = joint(this.group);
    const hips = this.hips = joint(inner, 0, 0.93, 0);
    // legs
    this.legs = [-1, 1].map((s) => {
      const hip = joint(hips, s * 0.1, -0.02, 0);
      part(hip, G('cap', 0.085, 0.3, 3, 8), tunic, 0, -0.2, 0);
      const knee = joint(hip, 0, -0.42, 0);
      part(knee, G('cap', 0.07, 0.28, 3, 8), leather, 0, -0.2, 0);
      part(knee, G('box', 0.12, 0.09, 0.26), leather, 0, -0.44, 0.05);
      return { hip, knee };
    });
    // torso
    const spine = this.spine = joint(hips, 0, 0.02, 0);
    part(spine, G('cyl', 0.2, 0.155, 0.5, 10), tunic, 0, 0.27, 0, 0, 0, 0, 1, 1, 0.72);
    part(spine, G('cyl', 0.165, 0.25, 0.3, 10, 1, true), cloak, 0, -0.08, 0, 0, 0, 0, 1, 1, 0.8);
    part(spine, G('cyl', 0.17, 0.17, 0.07, 10), leather, 0, 0.04, 0, 0, 0, 0, 1, 1, 0.78);
    part(spine, G('box', 0.07, 0.07, 0.03), trim, 0, 0.04, 0.135);
    // shoulders + cowl
    part(spine, G('tor', 0.17, 0.075, 6, 12), cloak, 0, 0.5, -0.01, Math.PI / 2, 0, 0, 1, 0.9, 1);
    for (const s of [-1, 1]) part(spine, G('sph', 0.105, 8, 6), npc ? cloak : trim, s * 0.235, 0.47, 0, 0, 0, 0, 1, 0.75, 1);
    // head + hood
    const head = this.head = joint(spine, 0, 0.6, 0);
    part(head, G('sph', 0.115, 10, 8), skin, 0, 0.08, 0.012);
    if (!npc || npc.hood) {
      part(head, G('sph', 0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), cloak, 0, 0.085, -0.02, -0.38, 0, 0);
      part(head, G('cone', 0.1, 0.24, 8), cloak, 0, 0.15, -0.15, -1.9, 0, 0);
    } else {
      part(head, G('sph', 0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), M(npc.hair, { rough: 0.9 }), 0, 0.09, 0, -0.2, 0, 0);
      if (npc.beard) part(head, G('cone', 0.08, 0.2, 6), M(npc.hair, { rough: 0.9 }), 0, -0.03, 0.08, Math.PI, 0, 0);
    }
    // arms
    this.arms = [-1, 1].map((s) => {
      const sh = joint(spine, s * 0.235, 0.44, 0);
      part(sh, G('cap', 0.06, 0.2, 3, 8), tunic, 0, -0.14, 0);
      const el = joint(sh, 0, -0.28, 0);
      part(el, G('cap', 0.052, 0.18, 3, 8), leather, 0, -0.12, 0);
      const hand = joint(el, 0, -0.27, 0);
      part(hand, G('sph', 0.055, 6, 5), skin);
      return { sh, el, hand };
    });
    // cape (animated grid)
    {
      const g = new THREE.PlaneGeometry(1, 1, 4, 6);
      this.capeGeo = g;
      part(spine, g, cloak, 0, 0, 0).frustumCulled = false;
    }
    // weapon
    const R = this.arms[1];
    const weapon = this.weapon = joint(R.hand, 0, 0, 0);
    if (!npc) {
      const bladeMat = M(L.blade, { glow: 2.4 });
      part(weapon, G('box', 0.045, 0.82, 0.012), bladeMat, 0, 0.52, 0);
      part(weapon, G('cone', 0.032, 0.14, 4), bladeMat, 0, 1.0, 0, 0, Math.PI / 4, 0, 1, 1, 0.3);
      part(weapon, G('box', 0.012, 0.8, 0.02), M(0xffffff, { glow: 3 }), 0, 0.52, 0);
      part(weapon, G('box', 0.24, 0.035, 0.05), steel, 0, 0.1, 0);
      part(weapon, G('cyl', 0.02, 0.02, 0.2, 6), leather, 0, -0.01, 0);
      part(weapon, G('sph', 0.03, 6, 5), trim, 0, -0.12, 0);
      this.bladeHalo = halo(weapon, L.blade, 0.9, 0.55, 0.5);
      this.glow = groundGlow(this.group, new THREE.Color(L.blade).multiplyScalar(0.28), 3.4);
    } else if (npc.staff) {
      part(weapon, G('cyl', 0.022, 0.028, 1.7, 6), M(0x4a3526, { rough: 0.9 }), 0, 0.35, 0);
      part(weapon, G('ico', 0.07, 0), M(npc.staff, { glow: 2.6 }), 0, 1.26, 0);
      halo(weapon, npc.staff, 0.8, 1.26, 0.6);
    }
    this.height = 2.0; this.radius = 0.4;
    this.capeSwing = 0;
    this.npc = npc;
    this._lastSpeed = 0;
  }

  update(dt, speed = 0) {
    const a = this.tick(dt, speed, 3.6);
    const run = clamp01(speed / 4.5), t = this.time, ph = this.phase;
    const { hips, spine, head, legs, arms, weapon, inner } = this;
    const s = Math.sin(ph), c = Math.cos(ph);
    // locomotion
    hips.position.y = 0.93 + Math.abs(c) * 0.05 * run + Math.sin(t * 1.7) * 0.008 * (1 - run);
    hips.rotation.set(0.14 * run, s * 0.12 * run, 0);
    spine.rotation.set(0.1 * run + Math.sin(t * 1.7) * 0.015, -s * 0.2 * run, 0);
    head.rotation.set(-0.12 * run, s * 0.08 * run, 0);
    legs[0].hip.rotation.x = s * 0.95 * run; legs[1].hip.rotation.x = -s * 0.95 * run;
    legs[0].knee.rotation.x = (Math.max(0, -c) * 1.25 + 0.12) * run + 0.04;
    legs[1].knee.rotation.x = (Math.max(0, c) * 1.25 + 0.12) * run + 0.04;
    // arms: left swings, right carries the blade low and back like in the key art
    arms[0].sh.rotation.set(-s * 0.8 * run + 0.05, 0, -0.12);
    arms[0].el.rotation.x = -0.25 - 0.55 * run;
    let rsx = 0.28 + s * 0.22 * run, rsz = 0.16, rel = -0.25 - 0.2 * run, wx = 2.3 + 1.6 * run, wz = 0.1, twist = 0, lean = 0, rise = 0;
    if (this.npc) { rsx = this.npc.staff ? -0.55 : s * 0.5 * run; rsz = 0.1; rel = this.npc.staff ? -0.6 : -0.2; wx = this.npc.staff ? 1.1 : 0; wz = 0; }
    // actions
    if (a >= 0) {
      const k = Math.sin(clamp01(a) * Math.PI);          // 0→1→0
      const sw = ease(clamp01(a * 1.6));                  // swing progress
      if (this.action === 'atk') {
        const dir = this.actionArg % 2 === 0 ? 1 : -1, over = this.actionArg === 2;
        if (over) { rsx = lerp(-3.0, -0.6, sw); rsz = 0.1; rel = -0.15; wx = 2.75; lean = 0.3 * k; }
        else { twist = dir * lerp(1.0, -1.0, sw); rsx = -1.35; rsz = 0.25; rel = -0.1; wx = 3.05; wz = 0; lean = 0.14 * k; }
      } else if (this.action === 'cast') {
        rsx = lerp(rsx, -2.9, k); rel = -0.1; wx = lerp(wx, 3.1, k); rise = 0.08 * k;
        arms[0].sh.rotation.set(-2.3 * k, 0, -0.5 * k);
      } else if (this.action === 'dash') {
        lean = 0.75 * k; rsx = 1.1; wx = 3.6; legs[0].hip.rotation.x = 0.9 * k; legs[1].hip.rotation.x = -1.0 * k;
      } else if (this.action === 'wave') {
        arms[0].sh.rotation.set(-2.6, 0, -0.5 + Math.sin(t * 9) * 0.3);
      }
    }
    arms[1].sh.rotation.set(rsx, 0, rsz);
    arms[1].el.rotation.x = rel;
    weapon.rotation.set(wx, 0, wz);
    spine.rotation.y += twist; spine.rotation.x += lean; hips.position.y += rise;
    // death
    if (this.dead) {
      const d = ease(clamp01(this.deadT * 2.2));
      inner.rotation.x = -d * 1.45; inner.position.y = d * 0.22;
      if (this.glow) this.glow.material.opacity = 1 - d;
    } else { inner.rotation.x = 0; inner.position.y = 0; if (this.glow) this.glow.material.opacity = 1; }
    // cape
    const acc = (speed - this._lastSpeed) / Math.max(dt, 1e-3); this._lastSpeed = speed;
    this.capeSwing += ((run * 0.9 + clamp01(acc * 0.05) + (this.action === 'dash' ? 1 : 0)) - this.capeSwing) * Math.min(1, dt * 6);
    const p = this.capeGeo.attributes.position, sw = this.capeSwing;
    for (let r = 0; r <= 6; r++) {
      const tt = r / 6;
      for (let cI = 0; cI <= 4; cI++) {
        const u = cI / 4 - 0.5, i = r * 5 + cI;
        const wave = Math.sin(t * (2.2 + sw * 5) - tt * 3.2 + u * 2.4) * (0.02 + sw * 0.09) * tt;
        p.setXYZ(i, u * (0.42 + tt * 0.34), 0.52 - tt * (0.98 - sw * 0.2), -0.11 - tt * (0.05 + sw * 0.5) - wave - Math.abs(u) * -0.1 * (1 - tt));
      }
    }
    p.needsUpdate = true;
    this.capeGeo.computeVertexNormals();
    if (this.bladeHalo) this.bladeHalo.material.opacity = 0.42 + Math.sin(t * 3) * 0.08;
  }
}

export const NPC_LOOKS = {
  elder: { robe: 0x6a5a7c, robe2: 0x4d4460, trim: 0xd9c890, hood: true, staff: 0x8fd0ff },
  merchant: { robe: 0x7a4f2a, robe2: 0x5a3d26, trim: 0xe0b060, hair: 0x5a3a22, beard: true },
};

// ---------------------------------------------------------------- monsters
export class Wisp extends Actor {
  constructor(level = 1) {
    super();
    const col = level >= 4 ? 0xc27bff : 0x6fd8ff;
    const inner = this.inner = joint(this.group, 0, 1.15, 0);
    part(inner, G('ico', 0.2, 2), M(0xffffff, { glow: 1.8 }));
    this.shell = part(inner, G('ico', 0.3, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.3), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }));
    this.rings = [0, 1].map((i) => part(inner, G('tor', 0.4 + i * 0.1, 0.012, 4, 28), M(col, { glow: 2.2 }), 0, 0, 0, i * 1.2, 0, i));
    this.tail = part(inner, G('cone', 0.16, 0.9, 8, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.8), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, -0.55, 0, Math.PI, 0, 0);
    this.halo = halo(inner, col, 2.4, 0, 0.5);
    this.glow = groundGlow(this.group, new THREE.Color(col).multiplyScalar(0.4), 3.2);
    this.height = 1.9; this.radius = 0.45;
  }
  update(dt, speed = 0) {
    const a = this.tick(dt, speed, 1);
    const t = this.time;
    this.inner.position.y = 1.15 + Math.sin(t * 2.1) * 0.14;
    this.rings[0].rotation.set(t * 1.7, t * 0.9, 0); this.rings[1].rotation.set(1.2 + t * 1.1, 0, t * 1.5);
    this.shell.rotation.set(t * 0.6, t * 0.8, 0);
    this.tail.rotation.z = Math.sin(t * 3) * 0.2 + speed * 0.1;
    let k = 1 + Math.sin(t * 5) * 0.06;
    if (a >= 0 && this.action === 'atk') k += Math.sin(a * Math.PI) * 0.7;
    this.inner.scale.multiplyScalar(k);
    if (this.dead) { const d = clamp01(this.deadT * 2); this.group.scale.setScalar(Math.max(0.001, 1 - d)); }
  }
}

export class Sporecap extends Actor {
  constructor() {
    super();
    const inner = this.inner = joint(this.group);
    const body = this.body = joint(inner, 0, 0.3, 0);
    part(body, G('cyl', 0.2, 0.27, 0.5, 10), M(0xcdbfa8, { rough: 0.9 }), 0, 0.25, 0);
    const cap = this.cap = joint(body, 0, 0.5, 0);
    const pts = [];
    for (let i = 0; i <= 7; i++) { const an = (i / 7) * Math.PI * 0.5; pts.push(new THREE.Vector2(Math.sin(an) * 0.6 + 0.001, Math.cos(an) * 0.36)); }
    const capGeo = geoCache.get('sporecap') || new THREE.LatheGeometry(pts, 14);
    geoCache.set('sporecap', capGeo);
    const capMat = geoCache.get('sporeMat') || new THREE.MeshStandardMaterial({ color: 0x8a56b4, roughness: 0.6, emissive: 0x2c1244, emissiveIntensity: 1.0 });
    geoCache.set('sporeMat', capMat);
    part(cap, capGeo, capMat);
    part(cap, G('cyl', 0.54, 0.46, 0.05, 14), M(0x74f0d8, { glow: 0.9 }), 0, -0.03, 0);
    for (let i = 0; i < 7; i++) { const an = i * 2.4, r = 0.15 + (i % 3) * 0.14; part(cap, G('sph', 0.04 + (i % 2) * 0.02, 6, 4), M(0x8ffbe6, { glow: 1.15 }), Math.cos(an) * r, 0.36 * Math.cos(r / 0.6 * 1.57), Math.sin(an) * r, 0, 0, 0, 1, 0.5, 1); }
    for (const s of [-1, 1]) part(body, G('sph', 0.04, 6, 5), M(0xffe27a, { glow: 2.6 }), s * 0.09, 0.36, 0.19);
    this.legs = [-1, 1].map((s) => { const j = joint(inner, s * 0.13, 0.3, 0); part(j, G('cap', 0.07, 0.16, 3, 6), M(0xb5a58c, { rough: 0.9 }), 0, -0.16, 0); return j; });
    this.height = 1.45; this.radius = 0.5;
  }
  update(dt, speed = 0) {
    const a = this.tick(dt, speed, 5.5);
    const s = Math.sin(this.phase), run = clamp01(speed / 2), t = this.time;
    this.legs[0].rotation.x = s * 0.8 * run; this.legs[1].rotation.x = -s * 0.8 * run;
    this.body.rotation.set(0, 0, s * 0.12 * run);
    this.body.position.y = 0.3 + Math.abs(Math.cos(this.phase)) * 0.05 * run;
    this.cap.rotation.z = Math.sin(t * 1.4) * 0.05; this.cap.scale.y = 1 + Math.sin(t * 2.2) * 0.05;
    if (a >= 0 && this.action === 'atk') { const k = Math.sin(a * Math.PI); this.body.rotation.x = k * 0.9; this.body.position.z = k * 0.35; } else { this.body.rotation.x = 0; this.body.position.z = 0; }
    if (this.dead) { const d = ease(clamp01(this.deadT * 2)); this.inner.rotation.z = d * 1.5; this.group.scale.setScalar(Math.max(0.001, 1 - clamp01(this.deadT - 1.2))); } else this.inner.rotation.z = 0;
  }
}

export class Wolf extends Actor {
  constructor(level = 3) {
    super();
    const fur = M(level >= 6 ? 0x2a2630 : 0x3a4250, { rough: 0.95 }), dark = M(0x1c2028, { rough: 0.95 }), light = M(0x6d7888, { rough: 0.95 });
    const inner = this.inner = joint(this.group);
    const body = this.body = joint(inner, 0, 0.72, 0);
    part(body, G('cap', 0.25, 0.62, 4, 10), fur, 0, 0, 0, Math.PI / 2, 0, 0, 1, 1, 1.05);
    part(body, G('sph', 0.31, 10, 8), fur, 0, 0.04, 0.34, 0, 0, 0, 1, 1.05, 1.1);
    part(body, G('cone', 0.2, 0.5, 6), light, 0, 0.23, 0.2, -0.5, 0, 0, 1.2, 1, 0.8);
    const neck = this.neck = joint(body, 0, 0.14, 0.56);
    part(neck, G('cyl', 0.15, 0.2, 0.34, 8), fur, 0, 0.08, 0.08, 1.0, 0, 0);
    const head = this.head = joint(neck, 0, 0.2, 0.22);
    part(head, G('box', 0.26, 0.22, 0.28), fur, 0, 0, 0.03);
    part(head, G('box', 0.14, 0.11, 0.24), dark, 0, -0.045, 0.26);
    this.jaw = part(head, G('box', 0.12, 0.04, 0.2), dark, 0, -0.12, 0.22);
    for (const s of [-1, 1]) {
      part(head, G('cone', 0.055, 0.17, 4), dark, s * 0.09, 0.17, -0.04, -0.2, 0, s * -0.15);
      part(head, G('sph', 0.028, 6, 5), M(0xff8a2a, { glow: 3 }), s * 0.085, 0.03, 0.17);
    }
    this.tail = joint(body, 0, 0.08, -0.5);
    part(this.tail, G('cone', 0.09, 0.6, 6), fur, 0, -0.05, -0.26, -1.9, 0, 0);
    this.legs = [[-1, 0.36], [1, 0.36], [-1, -0.36], [1, -0.36]].map(([s, z]) => {
      const hip = joint(body, s * 0.16, -0.08, z);
      part(hip, G('cap', 0.065, 0.2, 3, 6), fur, 0, -0.16, 0);
      const knee = joint(hip, 0, -0.32, 0);
      part(knee, G('cap', 0.045, 0.22, 3, 6), dark, 0, -0.15, 0);
      return { hip, knee };
    });
    this.height = 1.55; this.radius = 0.6;
  }
  update(dt, speed = 0) {
    const a = this.tick(dt, speed, 2.6);
    const run = clamp01(speed / 5), t = this.time, ph = this.phase;
    this.legs.forEach((l, i) => {
      const off = i === 0 || i === 3 ? 0 : Math.PI * (0.5 + run * 0.4);
      const s = Math.sin(ph + off), c = Math.cos(ph + off);
      l.hip.rotation.x = s * 0.85 * run; l.knee.rotation.x = (i < 2 ? -1 : 1) * (Math.max(0, c) * 0.9 * run + 0.25);
    });
    this.body.position.y = 0.72 + Math.sin(ph * 2) * 0.05 * run + Math.sin(t * 2) * 0.01;
    this.body.rotation.x = Math.sin(ph * 2 + 1) * 0.07 * run;
    this.tail.rotation.set(0.3 * run, Math.sin(t * 3) * 0.3, 0);
    this.neck.rotation.x = -0.25 * run + Math.sin(t * 1.3) * 0.05;
    this.jaw.rotation.x = 0;
    if (a >= 0 && this.action === 'atk') { const k = Math.sin(a * Math.PI); this.body.position.z = k * 0.6; this.neck.rotation.x = -0.5 * k; this.jaw.rotation.x = 0.5 * k; this.body.rotation.x = -0.25 * k; } else this.body.position.z = 0;
    if (this.dead) { const d = ease(clamp01(this.deadT * 2.5)); this.inner.rotation.z = d * 1.5; this.inner.position.y = -d * 0.35; this.group.scale.setScalar(Math.max(0.001, 1 - clamp01(this.deadT - 1.4))); } else { this.inner.rotation.z = 0; this.inner.position.y = 0; }
  }
}

export class Thornling extends Actor {
  constructor(barkTex) {
    super();
    const bark = geoCache.get('thornMat') || new THREE.MeshStandardMaterial({ map: barkTex, color: 0x9a8a78, roughness: 0.95 });
    geoCache.set('thornMat', bark);
    const leaf = M(0x4f8a44, { rough: 0.9, flat: true }), eye = M(0x9dff6a, { glow: 3 });
    const inner = this.inner = joint(this.group);
    const body = this.body = joint(inner, 0, 0.55, 0);
    part(body, G('cyl', 0.2, 0.34, 0.9, 7), bark, 0, 0.42, 0);
    part(body, G('cyl', 0.24, 0.2, 0.34, 7), bark, 0, 1.0, 0.04, 0.2, 0, 0);
    for (const s of [-1, 1]) part(body, G('sph', 0.045, 6, 5), eye, s * 0.09, 1.02, 0.21);
    for (let i = 0; i < 5; i++) part(body, G('cone', 0.13, 0.36, 4), leaf, Math.cos(i * 1.3) * 0.13, 1.28, Math.sin(i * 1.3) * 0.13, Math.sin(i * 1.3) * 0.5, 0, -Math.cos(i * 1.3) * 0.5);
    for (let i = 0; i < 3; i++) part(body, G('cone', 0.04, 0.4, 4), bark, Math.cos(i * 2.1 + 1) * 0.2, 0.7 + i * 0.12, -0.12, -1.2, i * 2.1, 0);
    this.arms = [-1, 1].map((s) => {
      const sh = joint(body, s * 0.22, 0.86, 0);
      part(sh, G('cyl', 0.05, 0.075, 0.6, 5), bark, s * 0.12, -0.26, 0, 0, 0, s * 0.45);
      const el = joint(sh, s * 0.25, -0.52, 0);
      part(el, G('cyl', 0.03, 0.05, 0.55, 5), bark, 0, -0.22, 0.08, 0.35, 0, 0);
      for (let k = -1; k <= 1; k++) part(el, G('cone', 0.022, 0.26, 4), bark, k * 0.05, -0.56, 0.2, 2.6, 0, k * 0.3);
      return { sh, el };
    });
    this.legs = [0, 1, 2].map((i) => { const an = i * 2.094 + 0.5; const j = joint(inner, Math.cos(an) * 0.2, 0.55, Math.sin(an) * 0.2); part(j, G('cone', 0.09, 0.62, 5), bark, Math.cos(an) * 0.12, -0.28, Math.sin(an) * 0.12, Math.PI + Math.sin(an) * 0.4, 0, -Math.cos(an) * 0.4); return j; });
    this.height = 2.15; this.radius = 0.5;
  }
  update(dt, speed = 0) {
    const a = this.tick(dt, speed, 4);
    const run = clamp01(speed / 2.5), t = this.time, ph = this.phase;
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(ph + i * 2.1) * 0.5 * run; });
    this.body.rotation.set(0.12 * run, Math.sin(ph) * 0.14 * run, Math.sin(t * 1.2) * 0.04);
    this.body.position.y = 0.55 + Math.abs(Math.sin(ph)) * 0.05 * run;
    let l = Math.sin(t * 1.5) * 0.12 - Math.sin(ph) * 0.5 * run, r = Math.sin(t * 1.5 + 1) * 0.12 + Math.sin(ph) * 0.5 * run;
    if (a >= 0 && this.action === 'atk') { const k = ease(clamp01(a * 1.7)); r = lerp(-2.4, 0.7, k); l = lerp(-1.6, 0.4, k); this.body.rotation.y = lerp(0.6, -0.5, k); }
    this.arms[0].sh.rotation.x = l; this.arms[1].sh.rotation.x = r;
    if (this.dead) { const d = ease(clamp01(this.deadT * 2)); this.inner.rotation.x = d * 1.5; this.group.scale.setScalar(Math.max(0.001, 1 - clamp01(this.deadT - 1.4))); } else this.inner.rotation.x = 0;
  }
}

export class Sentinel extends Actor {
  constructor(stoneTex, stoneN) {
    super();
    const stone = new THREE.MeshStandardMaterial({ map: stoneTex, normalMap: stoneN, color: 0x8d8f96, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x55585f, roughness: 0.9 });
    const rune = M(0x4fd0ff, { glow: 3.2 }), moss = M(0x3f6a3a, { rough: 1, flat: true });
    const B = (p, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, m = stone) => part(p, G('box', w, h, d), m, x, y, z, rx, ry, rz);
    const inner = this.inner = joint(this.group);
    const hips = this.hips = joint(inner, 0, 1.25, 0);
    B(hips, 1.0, 0.5, 0.75, 0, 0, 0, 0, 0, 0, dark);
    const chest = this.chest = joint(hips, 0, 0.3, 0);
    B(chest, 1.7, 1.15, 1.05, 0, 0.72, 0);
    B(chest, 1.2, 0.5, 0.9, 0, 0.1, 0, 0, 0, 0, dark);
    this.core = part(chest, G('ico', 0.27, 1), rune, 0, 0.75, 0.5);
    B(chest, 0.08, 0.7, 0.04, -0.4, 0.75, 0.54, 0, 0, 0.5, rune); B(chest, 0.08, 0.7, 0.04, 0.4, 0.75, 0.54, 0, 0, -0.5, rune);
    part(chest, G('ico', 0.4, 0), moss, -0.6, 1.32, -0.1, 0, 0, 0, 1.3, 0.35, 1); part(chest, G('ico', 0.35, 0), moss, 0.55, 1.3, 0.2, 0, 0, 0, 1.2, 0.3, 1);
    const head = this.head = joint(chest, 0, 1.45, 0.1);
    B(head, 0.62, 0.55, 0.6, 0, 0.1, 0);
    B(head, 0.4, 0.07, 0.05, 0, 0.14, 0.31, 0, 0, 0, rune);
    this.coreHalo = halo(chest, 0x4fd0ff, 3.2, 0.75, 0.6);
    this.arms = [-1, 1].map((s) => {
      const sh = joint(chest, s * 1.08, 1.02, 0);
      B(sh, 0.62, 0.62, 0.62, 0, 0, 0, 0.3, 0.2, 0.2);
      B(sh, 0.4, 0.75, 0.4, 0, -0.55, 0, 0, 0, 0, dark);
      const el = joint(sh, 0, -1.0, 0);
      B(el, 0.62, 0.95, 0.62, 0, -0.42, 0);
      B(el, 0.72, 0.5, 0.72, 0, -1.0, 0, 0, 0.4, 0);
      B(el, 0.07, 0.5, 0.04, 0, -0.42, 0.33, 0, 0, 0, rune);
      return { sh, el };
    });
    this.legs = [-1, 1].map((s) => {
      const hip = joint(hips, s * 0.42, -0.2, 0);
      B(hip, 0.5, 0.6, 0.5, 0, -0.3, 0, 0, 0, 0, dark);
      const knee = joint(hip, 0, -0.6, 0);
      B(knee, 0.58, 0.55, 0.62, 0, -0.22, 0.03);
      return { hip, knee };
    });
    this.glow = groundGlow(this.group, new THREE.Color(0x2a7fb0), 6);
    this.height = 4.1; this.radius = 1.3;
  }
  update(dt, speed = 0) {
    const a = this.tick(dt, speed, 1.7);
    const run = clamp01(speed / 2), t = this.time, s = Math.sin(this.phase), c = Math.cos(this.phase);
    this.legs[0].hip.rotation.x = s * 0.55 * run; this.legs[1].hip.rotation.x = -s * 0.55 * run;
    this.legs[0].knee.rotation.x = Math.max(0, -c) * 0.6 * run; this.legs[1].knee.rotation.x = Math.max(0, c) * 0.6 * run;
    this.hips.position.y = 1.25 + Math.abs(c) * 0.08 * run + Math.sin(t * 1.1) * 0.02;
    this.chest.rotation.set(0.08 * run, -s * 0.12 * run, s * 0.04 * run);
    let lx = -s * 0.4 * run + Math.sin(t * 1.1) * 0.04, rx = s * 0.4 * run - Math.sin(t * 1.1) * 0.04, lz = 0.12, rz = -0.12, le = -0.2, re = -0.2, lean = 0;
    if (a >= 0) {
      if (this.action === 'slam') { // wind up overhead, crash down
        const up = ease(clamp01(a / 0.7)), down = ease(clamp01((a - 0.7) / 0.18));
        lx = rx = lerp(-2.9 * up, 0.5, down); le = re = -0.5 * (1 - down); lean = lerp(-0.25 * up, 0.5, down);
      } else if (this.action === 'atk') { const k = ease(clamp01(a * 1.5)); rx = lerp(-1.9, 0.6, k); rz = -0.3; this.chest.rotation.y = lerp(0.7, -0.6, k); lean = 0.15 * Math.sin(a * Math.PI); }
      else if (this.action === 'roar') { const k = Math.sin(a * Math.PI); lx = rx = -0.6 * k; lz = 0.9 * k; rz = -0.9 * k; lean = -0.3 * k; }
    }
    this.arms[0].sh.rotation.set(lx, 0, lz); this.arms[1].sh.rotation.set(rx, 0, rz);
    this.arms[0].el.rotation.x = le; this.arms[1].el.rotation.x = re;
    this.chest.rotation.x += lean;
    const pulse = 1 + Math.sin(t * 2.4) * 0.12;
    this.core.scale.setScalar(pulse); this.core.rotation.y = t;
    this.coreHalo.material.opacity = 0.45 + Math.sin(t * 2.4) * 0.15;
    if (this.dead) { const d = ease(clamp01(this.deadT * 1.2)); this.inner.rotation.x = d * 1.35; this.inner.position.y = -d * 0.5; this.coreHalo.material.opacity = 0.5 * (1 - d); this.group.scale.setScalar(Math.max(0.001, 1 - clamp01((this.deadT - 2.5) * 0.7))); } else { this.inner.rotation.x = 0; this.inner.position.y = 0; }
  }
}

export function createActor(kind, opts, T) {
  if (kind === 'player') return new Humanoid(opts.look || 0);
  if (kind === 'npc') return new Humanoid(0, { npc: NPC_LOOKS[opts.role] || NPC_LOOKS.elder });
  if (kind === 'wisp') return new Wisp(opts.level);
  if (kind === 'spore') return new Sporecap();
  if (kind === 'wolf') return new Wolf(opts.level);
  if (kind === 'thorn') return new Thornling(T.bark);
  if (kind === 'sentinel') return new Sentinel(T.stone, T.stoneN);
  return new Sporecap();
}
