// Combat VFX. The effects themselves are hand-painted-style fire animations generated with Higgsfield
// and played back as sprite sheets (see flipbook.js); nothing here draws an effect procedurally.
// This file only choreographs them: which sheet, where, when — plus the supporting juice
// (embers, sword ribbons, light flashes, screen shockwaves, hit-stop, camera kick, afterimages).
import { THREE, U } from './common.js';
import { heightAt } from '../shared/world.js';
import { Flipbooks } from './flipbook.js';
import { VFX } from './vfx-manifest.js';

const ADD = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true };
const UV_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const _c = new THREE.Color(), _c2 = new THREE.Color();
const rgb = (hex, gain = 1) => { _c.set(hex); return [_c.r * gain, _c.g * gain, _c.b * gain]; };
const mixHex = (a, b, k) => _c.set(a).lerp(_c2.set(b), k).getHex();
const rand = (a, b) => a + Math.random() * (b - a);
// palette for recolouring the painted fire from a single colour: [smoky edge, body, hot core]
const rampOf = (hex) => [mixHex(hex, 0x000000, 0.55), hex, mixHex(hex, 0xffffff, 0.85)];
const GOLD = [0xa85a08, 0xffcc55, 0xfffbe0];
export const FIRE = { blade: 0xff9a3c, ramp: null };
const DASH_ART = VFX.dash.box; // where the streak starts and ends inside its frame

// ---------------------------------------------------------------- embers
// Tiny instanced sprites: 0 soft ember, 1 spark streak (stretches along its velocity), 3 smoke puff.
class Particles {
  constructor(scene, cap, smoke) {
    this.cap = cap; this.cursor = 0;
    const f = (n) => new Float32Array(cap * n);
    this.pos = f(3); this.vel = f(3); this.c0 = f(3); this.c1 = f(3);
    this.age = f(1); this.max = f(1); this.s0 = f(1); this.s1 = f(1); this.grav = f(1); this.drag = f(1);
    this.shape = f(1); this.stretch = f(1); this.rot = f(1); this.alpha = f(1);
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.setAttribute('position', base.attributes.position);
    const attr = (name, n) => { const a = new THREE.InstancedBufferAttribute(f(n), n); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
    this.aPos = attr('aPos', 3); this.aVel = attr('aVel', 3); this.aCol = attr('aCol', 4); this.aPar = attr('aPar', 4);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uNoiseTex: U.uNoiseTex },
      defines: smoke ? { SMOKE: 1 } : {},
      vertexShader: `
        attribute vec3 aPos; attribute vec3 aVel; attribute vec4 aCol; attribute vec4 aPar;
        varying vec2 vUv; varying vec4 vCol; varying float vShape; varying float vSeed;
        void main() {
          vec4 mv = viewMatrix * vec4(aPos, 1.0);
          vec2 q = position.xy, off;
          if (aPar.y > 0.0) {
            vec3 vv = (viewMatrix * vec4(aVel, 0.0)).xyz;
            float sp = length(vv.xy);
            vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(0.0, 1.0);
            off = dir * q.y * aPar.x * (1.0 + aPar.y * sp) + vec2(-dir.y, dir.x) * q.x * aPar.x;
          } else off = q * aPar.x;
          mv.xy += off;
          gl_Position = projectionMatrix * mv;
          vUv = position.xy + 0.5; vCol = aCol; vShape = aPar.z; vSeed = aPar.w;
        }`,
      fragmentShader: `
        uniform sampler2D uNoiseTex;
        varying vec2 vUv; varying vec4 vCol; varying float vShape; varying float vSeed;
        void main() {
          vec2 p = vUv * 2.0 - 1.0; float r = length(p), a;
          if (vShape < 0.5) { a = smoothstep(1.0, 0.0, r); a *= a; }
          else if (vShape < 1.5) { a = exp(-abs(p.x) * 6.0) * smoothstep(1.0, 0.25, abs(p.y)); }
          else { float n = texture2D(uNoiseTex, vUv * 0.55 + vSeed * 3.7).r; a = smoothstep(1.0, 0.1, r) * smoothstep(0.2, 0.75, n + 0.3 - r * 0.25); }
          #ifdef SMOKE
            gl_FragColor = vec4(vCol.rgb, a * vCol.a);
          #else
            gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);
          #endif
        }`,
      depthWrite: false, transparent: true, blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = smoke ? 5 : 9;
    scene.add(this.mesh);
  }

  spawn(x, y, z, vx, vy, vz, life, size0, size1, c0, c1, shape, stretch, grav, drag, alpha) {
    const i = this.cursor; this.cursor = (i + 1) % this.cap;
    const j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.c0[j] = c0[0]; this.c0[j + 1] = c0[1]; this.c0[j + 2] = c0[2];
    this.c1[j] = c1[0]; this.c1[j + 1] = c1[1]; this.c1[j + 2] = c1[2];
    this.age[i] = 0; this.max[i] = life; this.s0[i] = size0; this.s1[i] = size1; this.grav[i] = grav; this.drag[i] = drag;
    this.shape[i] = shape; this.stretch[i] = stretch; this.rot[i] = Math.random() * 6.283; this.alpha[i] = alpha;
  }

  update(dt) {
    const { pos, vel, c0, c1, age, max, cap } = this;
    const P = this.aPos.array, V = this.aVel.array, C = this.aCol.array, A = this.aPar.array;
    let n = 0;
    for (let i = 0; i < cap; i++) {
      if (max[i] <= 0) continue;
      age[i] += dt;
      const k = age[i] / max[i];
      if (k >= 1) { max[i] = 0; continue; }
      const j = i * 3, d = Math.max(0, 1 - this.drag[i] * dt);
      vel[j] *= d; vel[j + 2] *= d; vel[j + 1] = vel[j + 1] * d - this.grav[i] * dt;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      const o = n * 3, q = n * 4, fade = 1 - k * k;
      P[o] = pos[j]; P[o + 1] = pos[j + 1]; P[o + 2] = pos[j + 2];
      V[o] = vel[j]; V[o + 1] = vel[j + 1]; V[o + 2] = vel[j + 2];
      C[q] = c0[j] + (c1[j] - c0[j]) * k; C[q + 1] = c0[j + 1] + (c1[j + 1] - c0[j + 1]) * k; C[q + 2] = c0[j + 2] + (c1[j + 2] - c0[j + 2]) * k;
      C[q + 3] = this.alpha[i] * fade * Math.min(1, k * 12 + 0.25);
      A[q] = this.s0[i] + (this.s1[i] - this.s0[i]) * k; A[q + 1] = this.stretch[i]; A[q + 2] = this.shape[i]; A[q + 3] = this.rot[i];
      n++;
    }
    this.mesh.geometry.instanceCount = n;
    this.aPos.needsUpdate = this.aVel.needsUpdate = this.aCol.needsUpdate = this.aPar.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- sword ribbons
// A strip of geometry that follows the blade; its look comes from the painted flame-ribbon texture.
const TRAIL_MAX = 22;
class Trail {
  constructor(scene, ribbonTex) {
    const n = TRAIL_MAX * 2;
    const g = new THREE.BufferGeometry();
    this.p = new Float32Array(n * 2 * 3); this.uv = new Float32Array(n * 2 * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tRibbon: { value: ribbonTex }, uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uRemap: { value: 0 }, uGain: { value: 1 } },
      vertexShader: UV_VERT,
      fragmentShader: `
        uniform sampler2D tRibbon; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform float uRemap; uniform float uGain;
        varying vec2 vUv;
        void main() {
          // the texture's bright head is at its right edge: newest part of the trail
          vec3 t = texture2D(tRibbon, vec2(0.98 - vUv.x * 0.96, 0.08 + vUv.y * 0.84)).rgb;
          float l = max(t.r, max(t.g, t.b));
          vec3 ramp = mix(mix(uC0, uC1, smoothstep(0.1, 0.5, l)), uC2, smoothstep(0.55, 0.97, l)) * (0.3 + 0.7 * l) * smoothstep(0.0, 0.14, l);
          gl_FragColor = vec4(mix(t, ramp, uRemap) * uGain * (1.0 - vUv.x * vUv.x), 1.0);
        }`,
      side: THREE.DoubleSide, ...ADD,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.mesh.visible = false;
    scene.add(this.mesh);
    this.s = []; this.live = false; this.feeding = false;
  }
  start(look, life, gain = 1.6) {
    this.s.length = 0; this.life = life; this.live = true; this.feeding = true;
    const u = this.mat.uniforms;
    u.uGain.value = gain;
    if (look.ramp) { u.uC0.value.set(look.ramp[0]); u.uC1.value.set(look.ramp[1]); u.uC2.value.set(look.ramp[2]); u.uRemap.value = 1; } else u.uRemap.value = 0;
    this.mesh.visible = true;
    return this;
  }
  push(ax, ay, az, bx, by, bz, age = 0) {
    const h = this.s[0];
    if (h && Math.hypot(ax - h[0], ay - h[1], az - h[2]) + Math.hypot(bx - h[3], by - h[4], bz - h[5]) < 0.05) { h[0] = ax; h[1] = ay; h[2] = az; h[3] = bx; h[4] = by; h[5] = bz; return; }
    this.s.unshift([ax, ay, az, bx, by, bz, age]);
    if (this.s.length > TRAIL_MAX) this.s.pop();
  }
  stop() { this.feeding = false; }
  update(dt) {
    const s = this.s;
    for (const q of s) q[6] += dt;
    while (s.length && s[s.length - 1][6] > this.life) s.pop();
    if (s.length < 2) { if (!this.feeding) { this.live = false; this.mesh.visible = false; } this.mesh.geometry.setDrawRange(0, 0); return; }
    let w = 0;
    const put = (q, t, o) => {
      const p = this.p, uv = this.uv, i = w * 6, j = w * 4;
      for (let k = 0; k < 6; k++) p[i + k] = o ? q[k] + (o[k] - q[k]) * t : q[k];
      const u = Math.min(1, (o ? q[6] + (o[6] - q[6]) * t : q[6]) / this.life);
      uv[j] = u; uv[j + 1] = 0; uv[j + 2] = u; uv[j + 3] = 1;
      w++;
    };
    put(s[0], 0, null);
    for (let i = 0; i < s.length - 1; i++) { put(s[i], 0.25, s[i + 1]); put(s[i], 0.75, s[i + 1]); }
    put(s[s.length - 1], 0, null);
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = g.attributes.uv.needsUpdate = true;
    g.setDrawRange(0, (w - 1) * 6);
  }
}

// ---------------------------------------------------------------- the system
export class FX {
  constructor(world) {
    this.world = world;
    const scene = this.scene = world.scene;
    this.shake = 0; this.kick = 0; this.aberr = 0; this.dark = 0; this.darkTarget = 0;
    this.time = 0;
    this.fb = new Flipbooks(scene);
    this.parts = new Particles(scene, 2200, false);
    this.smoke = new Particles(scene, 260, true);
    this.trails = [];
    this.bladeTrails = new Map();
    this.projs = new Map();
    this.meteors = [];
    this.ghosts = [];
    this.queue = [];
    this.shocks = [];
    this.pushers = [];
    this.eclipses = 0;
    this.lights = world.fxLights.map((l) => ({ l, t: 1, dur: 1, i: 0 }));
    // aiming marker under the targeted enemy (interface, not an effect)
    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.4, 0.22), ...ADD, opacity: 0.7 }));
    this.targetRing.visible = false; this.targetRing.renderOrder = 4;
    scene.add(this.targetRing);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._v = new THREE.Vector3();
  }

  y(x, z) { return heightAt(x, z); }
  later(delay, fn) { this.queue.push({ at: this.time + delay, fn }); }

  // ------------------------------------------------------------ supporting kit
  // embers and sparks. o: n, color, color2, gain, size, size2, life, speed, mode ('sphere'|'ring'|'cone'|'in'),
  //   dir, cone, radius, spread, up, gravity, drag, shape (0 ember, 1 spark, 3 smoke), stretch, alpha, smoke
  emit(x, y, z, o = {}) {
    const n = o.n ?? 8, sys = o.smoke ? this.smoke : this.parts;
    const gain = o.gain ?? 1.15;
    const c0 = rgb(o.color ?? 0xffffff, gain), c1 = rgb(o.color2 ?? o.color ?? 0xffffff, gain * (o.color2 === undefined ? 0.6 : 1));
    const size = o.size ?? 0.15, size2 = o.size2 ?? size * 0.15, life = o.life ?? 0.5, speed = o.speed ?? 3;
    const mode = o.mode || 'sphere', spread = o.spread ?? 0.1, up = o.up ?? 1, R = o.radius ?? 0;
    const shape = o.smoke ? 3 : (o.shape ?? 0), stretch = o.stretch ?? 0, grav = o.gravity ?? 0, drag = o.drag ?? 1.5, alpha = o.alpha ?? 1;
    const d = o.dir || [0, 1, 0], cone = o.cone ?? 0.5;
    for (let i = 0; i < n; i++) {
      const l = life * rand(0.65, 1.3), s = speed * rand(0.45, 1.2);
      let px = x + rand(-spread, spread), py = y + rand(-spread, spread) * 0.6, pz = z + rand(-spread, spread), vx, vy, vz;
      const a = Math.random() * 6.283;
      if (mode === 'ring') {
        px = x + Math.cos(a) * R; pz = z + Math.sin(a) * R;
        vx = Math.cos(a) * s; vz = Math.sin(a) * s; vy = s * up * rand(0, 0.6);
      } else if (mode === 'in') {
        const e = rand(0.1, 0.9) * up, rr = R * rand(0.7, 1.1);
        px = x + Math.cos(a) * rr; pz = z + Math.sin(a) * rr; py = y + e * rr * 0.8;
        vx = (x - px) / l; vy = (y - py) / l; vz = (z - pz) / l;
      } else if (mode === 'cone') {
        const t = Math.random() * cone, cx = Math.cos(a) * Math.sin(t), cz = Math.sin(a) * Math.sin(t), cy = Math.cos(t);
        const ux = Math.abs(d[1]) > 0.9 ? 1 : 0, uy = ux ? 0 : 1;
        let tx = uy * d[2], ty = -ux * d[2], tz = ux * d[1] - uy * d[0];
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        const bx = d[1] * tz - d[2] * ty, by = d[2] * tx - d[0] * tz, bz = d[0] * ty - d[1] * tx;
        vx = (tx * cx + bx * cz + d[0] * cy) * s; vy = (ty * cx + by * cz + d[1] * cy) * s; vz = (tz * cx + bz * cz + d[2] * cy) * s;
      } else {
        const e = Math.random();
        vx = Math.cos(a) * s * (1 - e * 0.5); vz = Math.sin(a) * s * (1 - e * 0.5); vy = s * (e - 0.15) * up;
        if (R) { const rr = R * Math.sqrt(Math.random()); px += Math.cos(a) * rr; pz += Math.sin(a) * rr; }
      }
      sys.spawn(px, py, pz, vx, vy, vz, l, size * rand(0.7, 1.3), size2, c0, c1, shape, stretch, grav, drag, alpha);
    }
  }
  embers(x, y, z, look, n, o = {}) {
    this.emit(x, y, z, { n, color: mixHex(look.blade, 0xffffff, 0.45), color2: look.blade, speed: 6, life: 0.5, size: 0.055, shape: 1, stretch: 0.5, up: 1.4, gravity: 7, drag: 1.8, ...o });
  }
  // sizes here are in the old screen-ish units used by pick-up sparkles
  burst(x, y, z, { n = 10, color = 0xffffff, speed = 3, life = 0.6, size = 5, up = 1, gravity = 5, spread = 0.2 } = {}) {
    this.emit(x, y, z, { n, color, speed, life, size: size * 0.035, up, gravity, spread, drag: 1.6 });
  }
  flash(x, y, z, color, intensity, dur = 0.3, dist = 16) {
    const s = this.lights.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    s.l.position.set(x, y, z); s.l.color.set(color); s.l.distance = dist; s.i = intensity; s.t = 0; s.dur = dur;
  }
  trail(look, life, gain) {
    let t = this.trails.find((q) => !q.live);
    if (!t) { t = new Trail(this.scene, this.fb.tex.ribbon); this.trails.push(t); }
    return t.start(look, life, gain);
  }
  // screen-space refraction ring travelling outward over the ground
  shock(x, z, radius, strength = 0.02, dur = 0.5) {
    if (this.shocks.length >= 4) this.shocks.shift();
    this.shocks.push({ x, z, y: this.y(x, z) + 0.3, radius, strength, dur, t: 0 });
  }
  // bend the grass: a disc that pushes outward, optionally growing into a wave front
  push(x, z, r, k, dur, grow = 0) { const p = { x, z, r, r0: r, k, k0: k, t: 0, dur, grow, follow: null }; this.pushers.push(p); return p; }
  impact(shake = 0, kick = 0, aberr = 0) { this.shake = Math.max(this.shake, shake); this.kick = Math.max(this.kick, kick); this.aberr = Math.max(this.aberr, aberr); }

  target(e, time) {
    const r = this.targetRing;
    r.visible = !!e;
    if (!e) return;
    r.position.set(e.x, heightAt(e.x, e.z) + 0.12, e.z);
    r.scale.setScalar((e.actor && e.actor.radius ? e.actor.radius : 0.5) * 1.8 * (1 + Math.sin(time * 5) * 0.04));
  }

  // flame ribbon behind a swinging blade: call every frame for each swordsman
  blade(actor, look) {
    let t = this.bladeTrails.get(actor);
    const swinging = actor.action === 'atk' || actor.action === 'dash' || actor.action === 'ult';
    if (!swinging) { if (t) { t.stop(); this.bladeTrails.delete(actor); } return; }
    if (!t) { t = this.trail(look, actor.action === 'ult' ? 0.34 : 0.24, 0.5); this.bladeTrails.set(actor, t); }
    actor.bladePoints(this._a, this._b);
    t.push(this._a.x, this._a.y, this._a.z, this._b.x, this._b.y, this._b.z);
  }
  dropBlade(actor) { const t = this.bladeTrails.get(actor); if (t) { t.stop(); this.bladeTrails.delete(actor); } }

  // scorched ground that keeps glowing for a while
  scorch(x, z, size, look, dur = 2.6, gain = 1.1) {
    return this.fb.play('scorch', { x, z, size, yaw: Math.random() * 6.283, ramp: look.ramp, dur, fadeIn: 0.08, fadeOut: dur * 0.8, gain, lift: 0.14 });
  }

  // ------------------------------------------------------------ skills
  // Crescent Slash: three painted fire arcs; the third is an overhead cut that bursts where it lands
  slash(x, z, dx, dz, look, combo = 0) {
    const yaw = Math.atan2(dx, dz), y = this.y(x, z), ramp = look.ramp;
    if (combo < 2) {
      this.fb.play(combo ? 'slash_b' : 'slash_a', { x, z, y: y + 1.0, reach: 3.3, yaw, flip: combo === 1, ramp, gain: 1.4 });
      const side = combo === 1 ? -1 : 1;
      for (let i = 0; i < 5; i++) { const a = yaw + side * rand(-0.9, 0.9), r = rand(2.3, 3.0); this.embers(x + Math.sin(a) * r, y + 1.0, z + Math.cos(a) * r, look, 1, { mode: 'cone', dir: [Math.sin(a - side * 1.2), 0.3, Math.cos(a - side * 1.2)], cone: 0.4, speed: 7, life: 0.35 }); }
      this.flash(x + dx * 1.6, y + 1.2, z + dz * 1.6, look.blade, 30, 0.2, 9);
    } else {
      const fx = x + dx * 2.6, fz = z + dz * 2.6;
      this.fb.play('slam', { x, z, y: y + 0.6, reach: 2.6, yaw, ramp, gain: 1.8 });
      this.later(0.09, () => {
        this.fb.play('burst', { x: fx, z: fz, y: this.y(fx, fz) + 1.1, reach: 1.9, board: true, ramp, gain: 1.4, speed: 1.3 });
        this.scorch(fx, fz, 3.4, look, 2.0);
        this.embers(fx, this.y(fx, fz) + 0.4, fz, look, 16, { spread: 0.5, speed: 7.5 });
        this.flash(fx, this.y(fx, fz) + 1.2, fz, look.blade, 90, 0.3, 13);
        this.shock(fx, fz, 3.4, 0.01, 0.32);
        this.push(fx, fz, 2.6, 1.2, 0.5);
        this.impact(0.26, 0.7, 0.3);
      });
    }
  }

  // Moonblade Wave: a painted crescent of flame that flies out and sets the grass swaying
  wave(id, x, z, dx, dz, look, spd, ttl) {
    const yaw = Math.atan2(dx, dz);
    const h = this.fb.play('wave', { x, z, y: this.y(x, z) + 0.9, reach: 1.9, yaw, ramp: look.ramp, gain: 1.7, dur: ttl + 0.1, fadeIn: 0.05, fadeOut: 0.14 });
    this.projs.set(id, { h, k: 'wave', x, z, dx, dz, spd, ttl, look });
    this.push(x, z, 2.2, 1.0, ttl).follow = id;
    this.flash(x, this.y(x, z) + 1, z, look.blade, 55, 0.25, 12);
    this.embers(x, this.y(x, z) + 0.9, z, look, 10, { mode: 'cone', dir: [dx, 0.1, dz], cone: 0.7, speed: 9, life: 0.3 });
  }

  bolt(id, x, z, dx, dz, spd, ttl, color = 0x7fdcff) {
    const look = { blade: color, ramp: rampOf(color) };
    const h = this.fb.play('meteor', { x, z, y: this.y(x, z) + 1.15, reach: 0.24, board: true, ramp: look.ramp, gain: 1.0, dur: ttl + 0.1, fadeIn: 0.04, fadeOut: 0.1 });
    this.projs.set(id, { h, k: 'bolt', x, z, dx, dz, spd, ttl, look });
  }
  endProj(id, x, z) {
    const p = this.projs.get(id);
    if (!p) return;
    this.fb.play('hit', { x, z, y: this.y(x, z) + 1.1, reach: 1.1, board: true, rot: Math.random() * 6.283, ramp: p.look.ramp, gain: 1.5 });
    this._dropProj(id, p);
  }
  _dropProj(id, p) { this.fb.stop(p.h, 0.12); this.projs.delete(id); }

  // Shadowstep: a painted streak of fire along the path, afterimages hanging behind
  dash(actor, x0, z0, x1, z1, look) {
    const y0 = this.y(x0, z0), y1 = this.y(x1, z1), dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz);
    // the streak starts a little behind the swordsman and ends a little past where he stops; the sheet is stretched to that length
    this.fb.play('dash', { x: x0 - dx / len * 0.7, z: z0 - dz / len * 0.7, y: (y0 + y1) / 2 + 0.7, size: 5, h: (len + 1.7) / (DASH_ART[3] - DASH_ART[1]), yaw, anchor: [0.5, DASH_ART[1]], ramp: look.ramp, gain: 1.7 });
    this.emit(x0, y0 + 0.9, z0, { n: 8, color: 0x241018, color2: 0x070304, smoke: true, speed: 1.4, life: 0.7, size: 0.8, size2: 1.7, alpha: 0.5, up: 0.5, drag: 2.5, gain: 1 });
    for (let i = 0; i < 12; i++) { const t = Math.random(), x = x0 + dx * t, z = z0 + dz * t; this.embers(x, this.y(x, z) + rand(0.4, 1.4), z, look, 1, { mode: 'cone', dir: [dx / len, 0.1, dz / len], cone: 0.3, speed: 5, life: 0.45, gravity: 2 }); }
    if (actor) for (let i = 0; i < 4; i++) this.later(0.03 + i * 0.045, () => this.ghost(actor, look.blade, 0.34));
    this.later(0.2, () => {
      this.fb.play('burst', { x: x1, z: z1, y: y1 + 1.0, reach: 1.5, board: true, ramp: look.ramp, gain: 1.2, speed: 1.5 });
      this.flash(x1, y1 + 1.2, z1, look.blade, 70, 0.25, 12);
      this.push(x1, z1, 2.6, 1.1, 0.4);
    });
    this.impact(0.12, 0.8, 0.3);
  }

  ghost(actor, color, dur) {
    const g = actor.group.clone(true);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.9), ...ADD, opacity: 0.55 });
    g.traverse((o) => { if (o.isSprite || (o.isMesh && o.material && o.material.blending === THREE.AdditiveBlending)) o.visible = false; else if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    this.scene.add(g);
    this.ghosts.push({ g, mat, t: 0, dur });
  }

  // Lunar Nova: embers rush in, then a painted ring of fire bursts outward from the caster
  nova(x, z, radius, look) {
    const y = this.y(x, z);
    this.emit(x, y + 1, z, { n: 22, color: mixHex(look.blade, 0xffffff, 0.5), mode: 'in', radius: radius * 0.8, life: 0.12, size: 0.06, shape: 1, stretch: 0.5, drag: 0, up: 0.6 });
    this.later(0.07, () => {
      this.fb.play('nova', { x, z, reach: radius * 1.15, yaw: Math.random() * 6.283, ramp: look.ramp, gain: 1.7, lift: 0.4 });
      this.fb.play('burst', { x, z, y: y + 1.3, reach: 2.4, board: true, ramp: look.ramp, gain: 1.0, speed: 1.2 });
      this.scorch(x, z, radius * 1.5, look, 2.6);
      this.embers(x, y + 0.5, z, look, 36, { mode: 'ring', radius: 0.8, speed: radius * 2.6, life: 0.55, up: 1.0, gravity: 5 });
      this.emit(x, y + 0.3, z, { n: 26, color: look.blade, radius: radius * 0.9, speed: 0.5, life: 1.5, size: 0.065, up: 3.2, gravity: -1.3, drag: 0.6 });
      this.emit(x, y + 0.3, z, { n: 10, color: 0x2a1a18, color2: 0x0a0605, smoke: true, mode: 'ring', radius: radius * 0.35, speed: radius * 1.1, life: 1.0, size: 0.9, size2: 2.2, alpha: 0.35, up: 0.3, drag: 2.6, gain: 1 });
      this.flash(x, y + 2, z, look.blade, 100, 0.5, 22);
      this.shock(x, z, radius * 1.5, 0.018, 0.48);
      this.push(x, z, 1, 1.6, 0.55, radius * 1.4);
      this.impact(0.42, 1.0, 0.5);
    });
  }

  // Starfall: a fire whirl marks the ground while comets rain in ahead of the main strike
  starCharge(x, z, radius, delay, look) {
    this.fb.play('vortex', { x, z, reach: radius * 1.05, yaw: Math.random() * 6.283, ramp: look.ramp, gain: 0.9, dur: delay + 0.3, fadeIn: 0.25, fadeOut: 0.3, lift: 0.3 });
    const n = 7, fall = 0.36;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + rand(0, 0.8), d = radius * rand(0.25, 0.85);
      const tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d;
      this.later(Math.max(0, delay - fall - 0.26 + i * 0.045), () => this.meteor(tx, tz, fall, look, 1));
    }
  }
  meteor(tx, tz, fall, look, size = 1) {
    const ty = this.y(tx, tz);
    const m = { tx, ty, tz, x: tx - 5.5, y: ty + 17, z: tz - 3.2, t: 0, dur: fall, look, size };
    m.h = this.fb.play('meteor', { x: m.x, z: m.z, y: m.y, reach: 0.45 * size, board: true, ramp: look.ramp, gain: 1.8, dur: fall + 0.05, fadeIn: 0.03, fadeOut: 0.04 });
    this.meteors.push(m);
  }
  _meteorLand(m) {
    const { tx, ty, tz, look, size } = m;
    this.fb.play('burst', { x: tx, z: tz, y: ty + 1.0, reach: 1.8 * size, board: true, ramp: look.ramp, gain: 1.4, speed: 1.35 });
    this.scorch(tx, tz, 2.6 * size, look, 1.8);
    this.embers(tx, ty + 0.3, tz, look, 10, { speed: 7, up: 1.7, gravity: 13 });
    this.flash(tx, ty + 1, tz, look.blade, 50, 0.2, 9);
    this.shake = Math.max(this.shake, 0.1);
    if (this.onMeteor) this.onMeteor(tx, tz);
  }
  starfall(x, z, radius, look) {
    const y = this.y(x, z);
    this.fb.play('pillar', { x, z, y: y - 0.1, reach: 11, board: true, ramp: look.ramp, gain: 1.3 });
    this.fb.play('nova', { x, z, reach: radius * 1.3, yaw: Math.random() * 6.283, ramp: look.ramp, gain: 1.6, lift: 0.4 });
    this.fb.play('burst', { x, z, y: y + 1.6, reach: 3.1, board: true, ramp: look.ramp, gain: 0.9, delay: 0.05 });
    this.scorch(x, z, radius * 2.0, look, 3.2, 1.3);
    this.embers(x, y + 0.5, z, look, 50, { mode: 'ring', radius: 0.6, speed: radius * 2.8, life: 0.6, up: 1.4, gravity: 9 });
    this.embers(x, y + 0.5, z, look, 22, { mode: 'cone', dir: [0, 1, 0], cone: 0.5, speed: 12, life: 0.7, gravity: 11 });
    this.emit(x, y + 0.4, z, { n: 14, color: 0x2a1a18, color2: 0x0a0605, smoke: true, mode: 'ring', radius: radius * 0.3, speed: radius * 1.2, life: 1.3, size: 1.1, size2: 2.8, alpha: 0.4, up: 0.4, drag: 2.4, gain: 1 });
    this.flash(x, y + 3, z, look.blade, 140, 0.6, 28);
    this.shock(x, z, radius * 1.7, 0.026, 0.55);
    this.push(x, z, 1, 1.8, 0.6, radius * 1.5);
    this.impact(0.6, 1.4, 0.7);
  }

  // Eclipse: the light goes out under a burning black sun, a whirl of fire turns around the caster,
  // cuts land again and again, then everything comes down at once
  eclipse(x, z, radius, look, s) {
    const y = this.y(x, z), cam = this.world.camera;
    this.fb.play('vortex', { x, z, reach: radius * 1.05, ramp: look.ramp, gain: 0.75, dur: s.finalAt + 0.15, fadeIn: 0.3, fadeOut: 0.2, lift: 0.3, speed: 1.4 });
    cam.getWorldDirection(this._v); this._v.y = 0; this._v.normalize();
    this.fb.play('eclipse', { x: x + this._v.x * 1.2, z: z + this._v.z * 1.2, y: y + 4.3, reach: 2.4, board: true, ramp: look.ramp, gain: 1.5, dur: s.finalAt + 0.1, fadeIn: 0.3, fadeOut: 0.15, grow: 0.12 });
    this.emit(x, y + 1, z, { n: 36, color: mixHex(look.blade, 0xffffff, 0.5), mode: 'in', radius, life: 0.35, size: 0.06, shape: 1, stretch: 0.5, drag: 0, up: 0.8 });
    this.eclipses++;
    this.darkTarget = 1;
    this.later(s.finalAt + 0.05, () => { this.eclipses--; });
    this.flash(x, y + 2.5, z, look.blade, 90, s.finalAt, 20);
    this.impact(0.2, 0.9, 0.3);
  }
  eclipseCut(x, z, radius, look) {
    const y = this.y(x, z);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * 6.283, d = rand(0.3, radius * 0.35), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      this.fb.play(i % 2 ? 'slash_b' : 'slash_a', { x: px, z: pz, y: y + rand(0.7, 1.6), reach: rand(4.2, 5.6), yaw: Math.random() * 6.283, flip: Math.random() < 0.5, ramp: look.ramp, gain: 1.2, speed: 1.25, delay: i * 0.03 });
    }
    this.embers(x, y + 1, z, look, 16, { mode: 'ring', radius: 1, speed: 12, life: 0.3, up: 0.5 });
    this.flash(x, y + 1.5, z, look.blade, 80, 0.14, 16);
    this.impact(0.16, 0.5, 0.25);
  }
  eclipseEnd(x, z, radius, look) {
    const y = this.y(x, z);
    this.darkTarget = 0;
    this.fb.play('pillar', { x, z, y: y - 0.1, reach: 15, board: true, ramp: look.ramp, gain: 1.3 });
    this.fb.play('nova', { x, z, reach: radius * 1.3, yaw: Math.random() * 6.283, ramp: look.ramp, gain: 1.35, lift: 0.4 });
    this.fb.play('nova', { x, z, reach: radius * 0.9, yaw: Math.random() * 6.283, ramp: look.ramp, gain: 1.0, lift: 0.5, delay: 0.14 });
    this.fb.play('burst', { x, z, y: y + 2, reach: 3.4, board: true, ramp: look.ramp, gain: 0.8, delay: 0.04 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.283 + 0.3, bx = x + Math.cos(a) * radius * 0.62, bz = z + Math.sin(a) * radius * 0.62;
      this.fb.play('burst', { x: bx, z: bz, y: this.y(bx, bz) + 1.1, reach: 2.2, board: true, ramp: look.ramp, gain: 0.9, delay: 0.06 + i * 0.035, speed: 1.2 });
    }
    this.scorch(x, z, radius * 2.3, look, 3.8, 1.4);
    this.embers(x, y + 0.5, z, look, 70, { mode: 'ring', radius: 0.8, speed: radius * 2.7, life: 0.65, up: 1.3, gravity: 8 });
    this.emit(x, y + 0.4, z, { n: 40, color: look.blade, radius, speed: 0.7, life: 2.2, size: 0.075, up: 3.4, gravity: -1.3, drag: 0.5 });
    this.emit(x, y + 0.4, z, { n: 20, color: 0x2a1a18, color2: 0x0a0605, smoke: true, mode: 'ring', radius: radius * 0.3, speed: radius * 1.3, life: 1.5, size: 1.3, size2: 3.2, alpha: 0.45, up: 0.4, drag: 2.2, gain: 1 });
    this.flash(x, y + 3, z, look.blade, 170, 0.8, 34);
    this.shock(x, z, radius * 2.0, 0.034, 0.7);
    this.shock(x, z, radius * 1.2, 0.02, 0.45);
    this.push(x, z, 1, 2.2, 0.7, radius * 1.8);
    this.impact(1.0, 2.2, 1.0);
  }

  // per-skill hit reaction on a struck enemy; (dx, dz) points from attacker to target
  hitMark(x, z, h, dx, dz, skill, look, crit) {
    const y = this.y(x, z) + h;
    const go = () => {
      this.fb.play('hit', { x, z, y, reach: crit || skill === 'slash3' ? 1.8 : 1.25, board: true, rot: Math.random() * 6.283, ramp: look.ramp, gain: crit ? 1.9 : 1.5 });
      this.embers(x, y, z, look, crit ? 9 : 5, { mode: 'cone', dir: [dx, 0.3, dz], cone: 0.8, speed: 6.5, life: 0.3 });
      if (crit) this.impact(0.2, 0.7, 0.35);
    };
    // a dash's cut lands a beat after the swordsman has passed
    if (skill === 'dash') this.later(0.13, go); else go();
  }

  // ------------------------------------------------------------ world events
  telegraph(x, z, radius, delay) {
    // a ring of fire closing in on the moment of impact
    this.fb.play('vortex', { x, z, reach: radius, gain: 0.5, dur: delay, fadeIn: 0.2, fadeOut: 0.08, lift: 0.3, speed: 1.6, follow: (h) => { h.gain = 0.4 + 0.9 * Math.min(1, h.t / delay); } });
  }
  quake(x, z, radius, big) {
    const y = this.y(x, z);
    this.fb.play('nova', { x, z, reach: radius * 1.15, yaw: Math.random() * 6.283, gain: 1.6, lift: 0.4 });
    this.fb.play('burst', { x, z, y: y + 1.4, reach: radius * (big ? 0.6 : 0.75), board: true, gain: 1.3 });
    this.scorch(x, z, radius * 1.7, FIRE, big ? 3.2 : 2.0);
    this.embers(x, y + 0.3, z, FIRE, big ? 40 : 18, { mode: 'ring', radius: radius * 0.3, speed: radius * 2.0, life: 0.6, up: 1.6, gravity: 12 });
    this.emit(x, y + 0.3, z, { n: big ? 18 : 8, color: 0x3a2e28, color2: 0x120e0c, smoke: true, mode: 'ring', radius: radius * 0.4, speed: radius * 0.9, life: 1.3, size: 1.2, size2: 3, alpha: 0.45, up: 0.4, drag: 2.2, gain: 1 });
    this.flash(x, y + 2, z, 0xff8a40, big ? 200 : 90, 0.4, 24);
    this.shock(x, z, radius * 1.5, big ? 0.028 : 0.014, 0.5);
    this.push(x, z, 1, 1.6, 0.55, radius * 1.3);
  }
  levelUp(x, z) {
    const y = this.y(x, z), look = { blade: 0xffd866, ramp: GOLD };
    this.fb.play('pillar', { x, z, y: y - 0.1, reach: 9, board: true, ramp: GOLD, gain: 1.5, speed: 0.8 });
    this.fb.play('nova', { x, z, reach: 4.2, ramp: GOLD, gain: 1.2, lift: 0.35 });
    this.emit(x, y + 0.3, z, { n: 40, color: 0xfff0b8, color2: 0xffc24a, radius: 1.3, speed: 0.6, life: 1.5, size: 0.065, shape: 1, stretch: 0.6, up: 9, gravity: -2, drag: 0.5 });
    this.flash(x, y + 2, z, 0xffdf90, 150, 0.8, 22);
    this.shock(x, z, 6, 0.012, 0.6);
    return look;
  }
  // arrival / departure flourish in a given colour
  ring(x, z, radius, color, dur = 0.6) {
    this.fb.play('nova', { x, z, reach: radius * 1.1, ramp: rampOf(color), gain: 1.1, lift: 0.35, speed: 0.53 / Math.max(0.3, dur) });
  }
  beam(x, z, radius, height, color) {
    this.fb.play('pillar', { x, z, y: this.y(x, z) - 0.1, reach: height, board: true, ramp: rampOf(color), gain: 1.3 });
  }
  hit(x, z, color = 0xffffff, h = 1.0) {
    this.fb.play('hit', { x, z, y: this.y(x, z) + h, reach: 1.0, board: true, rot: Math.random() * 6.283, ramp: rampOf(color), gain: 1.4 });
  }
  puff(x, z, color, n = 26, h = 0.8) {
    const y = this.y(x, z) + h, big = n > 60;
    this.fb.play('burst', { x, z, y: y + (big ? 1.4 : 0.2), reach: big ? 4.6 : 1.5, board: true, ramp: rampOf(color), gain: 1.3 });
    this.emit(x, y, z, { n: Math.min(30, n), color, color2: mixHex(color, 0x202040, 0.6), speed: 3, life: 0.9, size: 0.1, up: 1.6, gravity: -0.8, spread: 0.5, drag: 1.4 });
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    const T = (this.time += dt), cam = this.world.camera;
    for (let i = this.queue.length - 1; i >= 0; i--) if (T >= this.queue[i].at) { const q = this.queue[i]; this.queue.splice(i, 1); q.fn(); }

    // projectiles carry their flipbook along
    for (const [id, p] of this.projs) {
      p.x += p.dx * p.spd * dt; p.z += p.dz * p.spd * dt; p.ttl -= dt;
      const y = this.y(p.x, p.z);
      if (p.k === 'wave') {
        p.h.fixedY = y + 0.9;
        this.fb.place(p.h, p.x, p.z);
        if (Math.random() < dt * 50) this.embers(p.x + (-p.dz) * rand(-1.4, 1.4), y + rand(0.5, 1.2), p.z + p.dx * rand(-1.4, 1.4), p.look, 1, { mode: 'cone', dir: [-p.dx, 0.2, -p.dz], cone: 0.4, speed: 4, life: 0.4, gravity: 2 });
      } else {
        const by = y + 1.15 + Math.sin(p.ttl * 9) * 0.1;
        p.h.fixedY = by;
        this.fb.place(p.h, p.x, p.z);
        // point the comet's head along its flight, as seen on screen
        this._a.set(p.x, by, p.z).project(cam); this._b.set(p.x + p.dx, by, p.z + p.dz).project(cam);
        p.h.u.uRot.value = Math.atan2((this._b.x - this._a.x) * cam.aspect, -(this._b.y - this._a.y));
      }
      if (p.ttl <= 0) this._dropProj(id, p);
    }

    // falling comets
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.dur), e = k * k;
      const x = m.x + (m.tx - m.x) * e, y = m.y + (m.ty - m.y) * e, z = m.z + (m.tz - m.z) * e;
      m.h.fixedY = y; this.fb.place(m.h, x, z);
      this._a.set(x, y, z).project(cam); this._b.set(m.tx, m.ty, m.tz).project(cam);
      m.h.u.uRot.value = Math.atan2((this._b.x - this._a.x) * cam.aspect, -(this._b.y - this._a.y));
      if (k >= 1) { this._meteorLand(m); this.meteors.splice(i, 1); }
    }

    // afterimages
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt;
      g.mat.opacity = 0.55 * (1 - Math.min(1, g.t / g.dur)) ** 2;
      if (g.t >= g.dur) { this.scene.remove(g.g); g.mat.dispose(); this.ghosts.splice(i, 1); }
    }

    if (this.eclipses <= 0) this.darkTarget = 0;
    this.dark += (this.darkTarget - this.dark) * Math.min(1, dt * (this.darkTarget ? 7 : 4));

    this.fb.update(dt);
    for (const t of this.trails) if (t.live) t.update(dt);
    this.parts.update(dt); this.smoke.update(dt);
    for (const s of this.lights) { s.t = Math.min(s.dur, s.t + dt); s.l.intensity = s.i * (1 - s.t / s.dur) ** 2; }

    // grass pushers
    for (let i = this.pushers.length - 1; i >= 0; i--) {
      const p = this.pushers[i];
      p.t += dt;
      const k = p.t / p.dur;
      if (k >= 1) { this.pushers.splice(i, 1); continue; }
      if (p.follow) { const pj = this.projs.get(p.follow); if (pj) { p.x = pj.x; p.z = pj.z; } else { this.pushers.splice(i, 1); continue; } }
      if (p.grow) { p.r = p.r0 + (p.grow - p.r0) * easeOut(k); p.k = p.k0 * (1 - k); }
    }
    // shock rings → post-process uniforms
    for (let i = this.shocks.length - 1; i >= 0; i--) { this.shocks[i].t += dt; if (this.shocks[i].t >= this.shocks[i].dur) this.shocks.splice(i, 1); }
    const su = this.world.post.mFinal.uniforms.uShock.value;
    for (let i = 0; i < 4; i++) {
      const s = this.shocks[i];
      if (!s) { su[i].w = 0; continue; }
      const k = s.t / s.dur;
      const c = this._a.set(s.x, s.y, s.z).project(cam);
      if (c.z > 1) { su[i].w = 0; continue; }
      const cx = c.x, cy = c.y;
      this._v.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(s.radius * easeOut(k)).add(this._b.set(s.x, s.y, s.z)).project(cam);
      su[i].set(cx * 0.5 + 0.5, cy * 0.5 + 0.5, Math.abs(this._v.x - cx) * 0.5 * cam.aspect, s.strength * (1 - k) * (1 - k));
    }

    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.kick = Math.max(0, this.kick - dt * 7 * Math.max(0.4, this.kick));
    this.aberr = Math.max(0, this.aberr - dt * 3.5);
  }
}

// ---------------------------------------------------------------- world pickups
export function makeLoot(kind, q, soft) {
  const g = new THREE.Group();
  const colors = { gold: 0xffd060, hp: 0xff5a5a, mp: 0x5aa0ff };
  const rar = [0xd8dde6, 0x62e07a, 0x58a8ff, 0xc77dff];
  const col = kind === 'item' ? rar[q] : colors[kind];
  let core;
  if (kind === 'gold') core = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.7) }));
  else if (kind === 'item') core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.8) }));
  else core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.7) }));
  core.position.y = 0.5;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: col, ...ADD, opacity: 0.8 }));
  halo.scale.setScalar(kind === 'item' ? 1.8 : 1.1); halo.position.y = 0.5;
  g.add(core, halo);
  if (kind === 'item') {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 4.5, 8, 1, true).translate(0, 2.25, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.9), ...ADD, opacity: 0.55, side: THREE.DoubleSide }));
    g.add(beam);
  }
  g.userData.core = core;
  return g;
}

export function makeGatherNode(soft) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.5, 1.25) });
  const stemMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.8, 0.75) });
  for (let i = 0; i < 4; i++) {
    const h = 0.35 + i * 0.13, a = i * 1.7, d = i ? 0.22 : 0;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 6), stemMat);
    stem.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16 + i * 0.02, 10, 5, 0, 6.283, 0, 1.571), mat);
    cap.scale.y = 0.65; cap.position.set(Math.cos(a) * d, h, Math.sin(a) * d);
    g.add(stem, cap);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: 0x6fffd8, ...ADD, opacity: 0.7 }));
  halo.scale.setScalar(2.6); halo.position.y = 0.5;
  g.add(halo);
  g.userData.halo = halo;
  return g;
}
