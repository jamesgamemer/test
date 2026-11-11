import { THREE, U } from './common.js';
import { heightAt } from '../shared/world.js';

const ADD = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true };

// arc strip with aU (0..1 along the sweep) and aV (0 inner .. 1 outer)
function arcGeometry(r0, r1, angle, segs = 28) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, a = (u - 0.5) * angle;
    const taper = Math.sin(u * Math.PI);
    const ri = r1 - (r1 - r0) * (0.25 + 0.75 * taper);
    pos.push(Math.sin(a) * ri, 0, Math.cos(a) * ri, Math.sin(a) * r1, 0, Math.cos(a) * r1);
    uv.push(u, 0, u, 1);
    if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const ARC_FRAG = `
  uniform float uT; uniform vec3 uColor; uniform float uDir; uniform float uHold;
  varying vec2 vUv;
  void main() {
    float u = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
    float head = mix(uT * 1.3, 1.3, uHold);
    float trail = smoothstep(head - 0.75, head, u) * (1.0 - smoothstep(head, head + 0.03, u));
    float rim = pow(vUv.y, 3.0) * 1.6 + pow(vUv.y, 0.8) * 0.35;
    float a = trail * rim * (1.0 - uT * uT * (1.0 - uHold));
    gl_FragColor = vec4(mix(uColor, vec3(1.0), pow(vUv.y, 6.0) * 0.7) * a * 3.4, 1.0);
  }`;
const UV_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const DISC_FRAG = `
  uniform float uT; uniform vec3 uColor; uniform float uMode; uniform sampler2D uNoiseTex; uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); float ang = atan(p.y, p.x);
    float n = texture2D(uNoiseTex, vec2(ang * 0.32, r * 0.6 - uTime * 0.15)).r;
    float a = 0.0;
    if (uMode < 0.5) {            // expanding shock ring
      float w = 0.16 + 0.1 * uT;
      a = smoothstep(uT - w, uT, r) * (1.0 - smoothstep(uT, uT + 0.035, r)) * (1.0 - uT) * (0.6 + n);
      a += (1.0 - smoothstep(0.0, uT, r)) * 0.18 * (1.0 - uT) * (1.0 - uT);
    } else if (uMode < 1.5) {     // telegraph: outline + fill that grows until impact
      float edge = smoothstep(0.9, 0.96, r) * (1.0 - smoothstep(0.97, 1.0, r));
      float fill = (1.0 - smoothstep(uT - 0.02, uT, r)) * 0.28;
      a = (edge * 1.1 + fill * (0.6 + 0.6 * n) + (1.0 - smoothstep(0.0, 1.0, r)) * 0.06) * step(r, 1.0);
      a *= 0.75 + 0.25 * sin(uTime * 14.0);
    } else {                       // persistent rune ring
      float edge = smoothstep(0.86, 0.92, r) * (1.0 - smoothstep(0.94, 1.0, r));
      float ticks = step(0.5, fract(ang * 3.8197 + uTime * 0.2)) * smoothstep(0.7, 0.76, r) * (1.0 - smoothstep(0.8, 0.84, r));
      a = (edge + ticks * 0.6) * uT;
    }
    gl_FragColor = vec4(uColor * a * 2.6, 1.0);
  }`;

const BEAM_FRAG = `
  uniform float uT; uniform vec3 uColor; varying vec2 vUv; varying float vF;
  void main() {
    float a = vF * (1.0 - uT) * (1.0 - vUv.y) * (1.0 - vUv.y);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.3 * vF) * a * 2.2, 1.0);
  }`;
const BEAM_VERT = `
  varying vec2 vUv; varying float vF;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vF = pow(abs(dot(n, normalize(-mv.xyz))), 1.6);
    gl_Position = projectionMatrix * mv;
  }`;

class Pool {
  constructor(make) { this.make = make; this.free = []; this.live = []; }
  get() { const o = this.free.pop() || this.make(); o.t = 0; o.mesh.visible = true; this.live.push(o); return o; }
  update(dt, fn) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const o = this.live[i];
      o.t += dt;
      if (fn(o) === false) { o.mesh.visible = false; this.live.splice(i, 1); this.free.push(o); }
    }
  }
}

export class FX {
  constructor(world) {
    this.world = world;
    const scene = this.scene = world.scene;
    this.shake = 0;
    const mk = (geo, frag, vert = UV_VERT, extra = {}) => () => {
      const mat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color() }, uDir: { value: 1 }, uHold: { value: 0 }, uMode: { value: 0 }, uNoiseTex: U.uNoiseTex, uTime: U.uTime }, vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide, ...ADD, ...extra });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 6;
      scene.add(mesh);
      return { mesh, u: mat.uniforms };
    };
    this.arcs = new Pool(mk(arcGeometry(1.0, 3.1, 2.5), ARC_FRAG));
    this.waves = new Pool(mk(arcGeometry(0.9, 1.75, 2.0), ARC_FRAG));
    this.discs = new Pool(mk(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), DISC_FRAG));
    this.beams = new Pool(mk(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0), BEAM_FRAG, BEAM_VERT));
    this.projs = new Map();
    this.lights = world.fxLights.map((l) => ({ l, t: 1, dur: 1, i: 0 }));

    // CPU particles
    const N = this.N = 900;
    this.pp = new Float32Array(N * 3); this.pc = new Float32Array(N * 3); this.ps = new Float32Array(N);
    this.pv = new Float32Array(N * 3); this.pl = new Float32Array(N); this.pm = new Float32Array(N); this.pg = new Float32Array(N); this.pz = new Float32Array(N);
    this.pcol = new Float32Array(N * 3);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pp, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pc, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.ps, 1));
    const pm = new THREE.ShaderMaterial({
      uniforms: { uResolution: U.uResolution },
      vertexShader: `attribute float aSize; uniform vec2 uResolution; varying vec3 vC;
        void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uResolution.y / 900.0 * 30.0 / max(3.0, -mv.z); }`,
      fragmentShader: `varying vec3 vC; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a * a * 2.4, 1.0); }`,
      vertexColors: true, ...ADD,
    });
    this.points = new THREE.Points(g, pm);
    this.points.frustumCulled = false; this.points.renderOrder = 7;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  burst(x, y, z, { n = 10, color = 0xffffff, speed = 3, life = 0.6, size = 5, up = 1, gravity = 5, spread = 0.2 } = {}) {
    const c = this._c.set(color);
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.N;
      const a = Math.random() * 6.283, e = Math.random(), s = speed * (0.4 + Math.random() * 0.8);
      this.pp.set([x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread], i * 3);
      this.pv.set([Math.cos(a) * s * (1 - e * 0.5), s * (0.2 + e) * up, Math.sin(a) * s * (1 - e * 0.5)], i * 3);
      this.pcol.set([c.r, c.g, c.b], i * 3);
      this.pl[i] = 0; this.pm[i] = life * (0.6 + Math.random() * 0.7); this.pg[i] = gravity; this.pz[i] = size * (0.6 + Math.random() * 0.8);
    }
  }

  flash(x, y, z, color, intensity, dur = 0.3, dist = 16) {
    const s = this.lights.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    s.l.position.set(x, y, z); s.l.color.set(color); s.l.distance = dist; s.i = intensity; s.t = 0; s.dur = dur;
  }

  y(x, z) { return heightAt(x, z); }

  slash(x, z, dx, dz, color, combo = 0) {
    const o = this.arcs.get();
    const big = combo === 2;
    o.dur = big ? 0.3 : 0.24;
    o.mesh.position.set(x, this.y(x, z) + (big ? 1.25 : 1.05), z);
    o.mesh.rotation.set(big ? -0.5 : (combo ? 0.22 : -0.22), Math.atan2(dx, dz), 0, 'YXZ');
    o.mesh.scale.setScalar(big ? 1.22 : 1);
    o.u.uColor.value.set(color); o.u.uDir.value = combo === 1 ? -1 : 1; o.u.uHold.value = 0;
  }

  wave(id, x, z, dx, dz, color, spd, ttl) {
    const o = this.waves.get();
    o.mesh.rotation.set(0, Math.atan2(dx, dz), 0);
    o.u.uColor.value.set(color); o.u.uHold.value = 1; o.u.uT.value = 0; o.u.uDir.value = 1;
    this.projs.set(id, { o, k: 'wave', x, z, dx, dz, spd, ttl, life: ttl, color });
  }

  bolt(id, x, z, dx, dz, spd, ttl, color = 0x7fdcff) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6) }));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.world.tex.soft, color, ...ADD }));
    s.scale.setScalar(1.6);
    g.add(core, s);
    this.scene.add(g);
    this.projs.set(id, { g, k: 'bolt', x, z, dx, dz, spd, ttl, life: ttl, color });
  }

  endProj(id, x, z) {
    const p = this.projs.get(id);
    if (!p) return;
    this.burst(x, this.y(x, z) + 1, z, { n: 14, color: p.color, speed: 4, life: 0.4, size: 5 });
    this._dropProj(id, p);
  }
  _dropProj(id, p) {
    if (p.g) this.scene.remove(p.g);
    if (p.o) { p.o.t = 1e3; }
    this.projs.delete(id);
  }

  ring(x, z, radius, color, dur = 0.6, mode = 0) {
    const o = this.discs.get();
    o.dur = dur; o.mode = mode;
    o.mesh.position.set(x, this.y(x, z) + 0.18, z);
    o.mesh.scale.setScalar(radius);
    o.u.uColor.value.set(color); o.u.uMode.value = mode; o.u.uT.value = 0;
    return o;
  }
  telegraph(x, z, radius, delay, hostile) { return this.ring(x, z, radius, hostile ? 0xff5a2a : 0x5fb4ff, delay, 1); }

  beam(x, z, radius, height, color, dur = 0.5) {
    const o = this.beams.get();
    o.dur = dur; o.r = radius;
    o.mesh.position.set(x, this.y(x, z) - 0.2, z);
    o.mesh.scale.set(radius, height, radius);
    o.u.uColor.value.set(color);
  }

  nova(x, z, radius, color) {
    this.ring(x, z, radius * 1.1, color, 0.55);
    this.ring(x, z, radius * 0.7, 0xffffff, 0.35);
    this.beam(x, z, 1.1, 7, color, 0.45);
    this.burst(x, this.y(x, z) + 0.6, z, { n: 40, color, speed: 9, life: 0.6, size: 6, up: 0.35, gravity: 2 });
    this.flash(x, this.y(x, z) + 2, z, color, 120, 0.45, 20);
  }

  starfall(x, z, radius, color) {
    const y = this.y(x, z);
    this.beam(x, z, radius * 0.2, 12, color, 0.55);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283 + Math.random(), d = radius * (0.3 + Math.random() * 0.6);
      this.beam(x + Math.cos(a) * d, z + Math.sin(a) * d, 0.16 + Math.random() * 0.2, 9 + Math.random() * 3, 0xcfe6ff, 0.3 + Math.random() * 0.3);
    }
    this.ring(x, z, radius * 1.15, color, 0.7);
    this.ring(x, z, radius * 0.8, 0xffffff, 0.4);
    this.burst(x, y + 0.5, z, { n: 70, color, speed: 11, life: 0.8, size: 7, up: 0.8, gravity: 6, spread: radius });
    this.flash(x, y + 3, z, color, 150, 0.6, 26);
    this.shake = Math.max(this.shake, 0.5);
  }

  quake(x, z, radius, big) {
    const y = this.y(x, z);
    this.ring(x, z, radius * 1.1, 0xffa060, 0.6);
    this.burst(x, y + 0.3, z, { n: big ? 70 : 30, color: 0xffb070, speed: big ? 10 : 6, life: 0.8, size: 7, up: 0.9, gravity: 9, spread: radius * 0.8 });
    this.burst(x, y + 0.3, z, { n: big ? 40 : 16, color: 0x8a8f9a, speed: 5, life: 1.0, size: 9, up: 0.5, gravity: 3, spread: radius });
    this.flash(x, y + 2, z, 0xff8a40, big ? 200 : 90, 0.4, 24);
  }

  levelUp(x, z) {
    const y = this.y(x, z);
    this.beam(x, z, 1.0, 14, 0xffe9a0, 1.2);
    this.ring(x, z, 4.5, 0xffe08a, 0.9);
    this.burst(x, y + 0.4, z, { n: 60, color: 0xffe9a0, speed: 4, life: 1.4, size: 6, up: 2.2, gravity: -1.5, spread: 1.2 });
    this.flash(x, y + 2, z, 0xffdf90, 150, 0.8, 22);
  }

  hit(x, z, color = 0xffffff, h = 1.0) {
    this.burst(x, this.y(x, z) + h, z, { n: 9, color, speed: 5.5, life: 0.32, size: 5, up: 0.7, gravity: 8 });
  }
  puff(x, z, color, n = 26, h = 0.8) {
    this.burst(x, this.y(x, z) + h, z, { n, color, speed: 3.2, life: 0.9, size: 7, up: 1.2, gravity: -0.8, spread: 0.7 });
  }
  dashTrail(x0, z0, x1, z1, color) {
    for (let i = 0; i < 14; i++) {
      const t = i / 13, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      this.burst(x, this.y(x, z) + 0.9, z, { n: 3, color, speed: 0.8, life: 0.5, size: 8, up: 0.3, gravity: 0, spread: 0.5 });
    }
  }

  update(dt) {
    this.arcs.update(dt, (o) => { const k = o.t / o.dur; o.u.uT.value = Math.min(1, k); return k < 1; });
    this.waves.update(dt, (o) => o.t < 100);
    this.discs.update(dt, (o) => { const k = o.t / o.dur; o.u.uT.value = Math.min(1, k); return k < 1; });
    this.beams.update(dt, (o) => { const k = o.t / o.dur; o.u.uT.value = Math.min(1, k); o.mesh.scale.x = o.mesh.scale.z = o.r * (1 - k * 0.6); return k < 1; });
    for (const [id, p] of this.projs) {
      p.x += p.dx * p.spd * dt; p.z += p.dz * p.spd * dt; p.ttl -= dt;
      const y = this.y(p.x, p.z);
      if (p.o) {
        p.o.mesh.position.set(p.x, y + 0.9, p.z);
        p.o.u.uT.value = 1 - Math.min(1, p.ttl / 0.18);
        if (Math.random() < dt * 60) this.burst(p.x, y + 0.9, p.z, { n: 2, color: p.color, speed: 1.2, life: 0.4, size: 5, gravity: 0, spread: 1.2 });
      } else { p.g.position.set(p.x, y + 1.15 + Math.sin(p.ttl * 9) * 0.1, p.z); if (Math.random() < dt * 40) this.burst(p.x, y + 1.15, p.z, { n: 1, color: p.color, speed: 0.5, life: 0.35, size: 4, gravity: 0 }); }
      if (p.ttl <= 0) this._dropProj(id, p);
    }
    for (const s of this.lights) { s.t = Math.min(s.dur, s.t + dt); s.l.intensity = s.i * (1 - s.t / s.dur) ** 2; }
    // particles
    const { pp, pv, pl, pm, pg, pz, ps, pc, pcol, N } = this;
    for (let i = 0; i < N; i++) {
      if (pm[i] <= 0) continue;
      pl[i] += dt;
      const k = pl[i] / pm[i];
      if (k >= 1) { pm[i] = 0; ps[i] = 0; continue; }
      const j = i * 3;
      pv[j + 1] -= pg[i] * dt;
      const drag = 1 - 1.6 * dt;
      pv[j] *= drag; pv[j + 2] *= drag;
      pp[j] += pv[j] * dt; pp[j + 1] += pv[j + 1] * dt; pp[j + 2] += pv[j + 2] * dt;
      const f = 1 - k * k;
      pc[j] = pcol[j] * f; pc[j + 1] = pcol[j + 1] * f; pc[j + 2] = pcol[j + 2] * f;
      ps[i] = pz[i] * (0.5 + 0.5 * f);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.aSize.needsUpdate = true;
    this.shake = Math.max(0, this.shake - dt * 1.8);
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
