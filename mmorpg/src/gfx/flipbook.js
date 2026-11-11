// Plays the hand-painted VFX sprite sheets in assets/vfx/ (generated with Higgsfield, packed by
// dev/build_vfx.py). Each effect is a quad that either lies on the ground or faces the camera.
import { THREE } from './common.js';
import { VFX } from './vfx-manifest.js';
import { heightAt } from '../shared/world.js';

const BASE = (() => { try { return new URL('../../assets/vfx/', import.meta.url).href; } catch { return 'assets/vfx/'; } })();

const VERT = `
  uniform float uBoard; uniform vec2 uAnchor; uniform vec2 uSize; uniform float uRot;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec2 q = (position.xy + 0.5 - uAnchor) * uSize;
    if (uBoard > 0.5) {
      vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float c = cos(uRot), s = sin(uRot);
      mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c);
      gl_Position = projectionMatrix * mv;
    } else {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 0.0, 1.0);
    }
  }`;
const FRAG = `
  uniform sampler2D tMap; uniform vec2 uGrid; uniform float uFrame; uniform float uCount; uniform float uLoop;
  uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform float uRemap; uniform float uGain; uniform float uFlip; uniform float uAlpha;
  varying vec2 vUv;
  vec3 cell(float i, vec2 uv) {
    float cx = mod(i, uGrid.x), cy = floor(i / uGrid.x);
    return texture2D(tMap, vec2((cx + uv.x) / uGrid.x, 1.0 - (cy + 1.0 - uv.y) / uGrid.y)).rgb;
  }
  void main() {
    vec2 uv = clamp(vec2(uFlip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y), 0.003, 0.997);
    float f = uLoop > 0.5 ? mod(uFrame, uCount) : min(uFrame, uCount - 1.0);
    float f0 = floor(f), f1 = uLoop > 0.5 ? mod(f0 + 1.0, uCount) : min(f0 + 1.0, uCount - 1.0);
    // blend neighbouring frames so the drawing stays smooth at any refresh rate
    vec3 t = mix(cell(f0, uv), cell(f1, uv), fract(f));
    float l = max(t.r, max(t.g, t.b));
    // optional recolour: keep the painted shapes, map their brightness onto another palette
    vec3 ramp = mix(mix(uC0, uC1, smoothstep(0.1, 0.5, l)), uC2, smoothstep(0.55, 0.97, l)) * (0.3 + 0.7 * l) * smoothstep(0.0, 0.14, l);
    vec3 col = mix(t, ramp, uRemap);
    gl_FragColor = vec4(col * uGain * uAlpha * (0.62 + l * l * 0.26), 1.0);
  }`;

const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Matrix4();

export class Flipbooks {
  constructor(scene) {
    this.scene = scene;
    this.tex = {};
    this.free = []; this.live = [];
    this.geo = new THREE.PlaneGeometry(1, 1);
    const loader = new THREE.TextureLoader();
    const embedded = (typeof window !== 'undefined' && window.NG_ASSETS) || {};
    for (const name in VFX) {
      const t = loader.load(embedded[VFX[name].file] || BASE + VFX[name].file);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.anisotropy = 4;
      this.tex[name] = t;
    }
  }

  // o: x, z, y (absolute) or lift (above ground); size (world width; height follows the art's aspect unless h is given);
  //    yaw (ground quad: the art's "up" points along this heading) or board:true (camera-facing), anchor [ax, ay], rot,
  //    ramp [edge, body, core] colours or null for the painted fire colours, gain, speed, flip,
  //    loop effects: dur, fadeIn, fadeOut; delay; follow(handle, dt) called every frame
  play(name, o = {}) {
    const def = VFX[name];
    if (!def) return null;
    let h = this.free.pop();
    if (!h) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          tMap: { value: null }, uGrid: { value: new THREE.Vector2() }, uFrame: { value: 0 }, uCount: { value: 1 }, uLoop: { value: 0 },
          uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uRemap: { value: 0 },
          uGain: { value: 1 }, uFlip: { value: 0 }, uAlpha: { value: 1 }, uBoard: { value: 0 }, uAnchor: { value: new THREE.Vector2(0.5, 0.5) },
          uSize: { value: new THREE.Vector2(1, 1) }, uRot: { value: 0 },
        },
        vertexShader: VERT, fragmentShader: FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      h = { mesh, u: mat.uniforms };
    }
    const u = h.u, size = o.size ?? 4;
    h.def = def; h.t = -(o.delay ?? 0); h.speed = o.speed ?? 1; h.loop = def.loop; h.done = false;
    h.dur = def.loop ? (o.dur ?? 1) : (def.n > 1 ? def.n / (def.fps * h.speed) : (o.dur ?? 1));
    h.fadeIn = o.fadeIn ?? (def.loop ? 0.12 : 0); h.fadeOut = o.fadeOut ?? (def.loop || def.n === 1 ? 0.25 : 0);
    h.gain = o.gain ?? 1.5; h.follow = o.follow || null; h.spin = o.spin ?? 0; h.grow = o.grow ?? 0;
    h.w = size; h.h = o.h ?? size / def.aspect; h.board = !!o.board; h.yaw = o.yaw ?? 0; h.lift = o.lift ?? 0.3; h.fixedY = o.y;
    u.tMap.value = this.tex[name]; u.uGrid.value.set(def.cols, def.rows); u.uCount.value = def.n; u.uLoop.value = def.loop ? 1 : 0;
    u.uFrame.value = 0; u.uFlip.value = o.flip ? 1 : 0; u.uBoard.value = h.board ? 1 : 0; u.uRot.value = o.rot ?? 0;
    u.uAnchor.value.set(o.anchor ? o.anchor[0] : 0.5, o.anchor ? o.anchor[1] : 0.5);
    u.uSize.value.set(h.w, h.h);
    if (o.ramp) { u.uC0.value.set(o.ramp[0]); u.uC1.value.set(o.ramp[1]); u.uC2.value.set(o.ramp[2]); u.uRemap.value = 1; } else u.uRemap.value = 0;
    h.mesh.renderOrder = h.board ? 8 : 6;
    h.mesh.visible = h.t >= 0;
    this.place(h, o.x ?? 0, o.z ?? 0);
    this.live.push(h);
    return h;
  }

  place(h, x, z) {
    h.x = x; h.z = z;
    const y = h.fixedY !== undefined ? h.fixedY : heightAt(x, z) + h.lift;
    h.mesh.position.set(x, y, z);
    if (h.board) return;
    // lie on the slope: local X = right, local Y = the art's up (the heading), local Z = ground normal
    const e = Math.min(2.5, h.w * 0.25);
    _n.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
    if (h.fixedY !== undefined) _n.set(0, 1, 0);
    _f.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    _f.addScaledVector(_n, -_f.dot(_n)).normalize();
    _r.crossVectors(_f, _n);
    h.mesh.quaternion.setFromRotationMatrix(_m.makeBasis(_r, _f, _n));
  }

  stop(h, fade = 0.2) { if (h && !h.done) { h.dur = Math.min(h.dur, Math.max(0, h.t) + fade); h.fadeOut = fade; } }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const h = this.live[i];
      h.t += dt;
      if (h.t < 0) continue;
      h.mesh.visible = true;
      if (h.follow) h.follow(h, dt);
      if (h.spin) { h.yaw += h.spin * dt; this.place(h, h.x, h.z); }
      if (h.grow) { const k = 1 + h.grow * h.t; h.u.uSize.value.set(h.w * k, h.h * k); }
      h.u.uFrame.value = h.def.n > 1 ? h.t * h.def.fps * h.speed : 0;
      let a = 1;
      if (h.fadeIn) a *= Math.min(1, h.t / h.fadeIn);
      if (h.fadeOut) a *= Math.min(1, Math.max(0, (h.dur - h.t) / h.fadeOut));
      h.u.uAlpha.value = a; h.u.uGain.value = h.gain;
      if (h.t >= h.dur) { h.done = true; h.mesh.visible = false; this.live.splice(i, 1); this.free.push(h); }
    }
  }
}
