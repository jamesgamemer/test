import { THREE, U } from './common.js';
import { WORLD_SIZE, mulberry32, heightAt, pathDist, PLAY_R } from '../shared/world.js';

// Direction the moonlight travels (down, toward +x/+z): gives back-lit rims from the default camera.
export const MOON_DIR = new THREE.Vector3(0.52, -1.0, 0.3).normalize();

// A fixed set of point lights reassigned every frame to the nearest emitters, so the shader
// light count never changes while the world can hold hundreds of glowing things.
export class LightPool {
  constructor(scene, n) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 1.6);
      scene.add(l);
      this.lights.push(l);
    }
    this.sources = [];
    this._c = new THREE.Color();
  }
  setSources(list) {
    this.sources = list.map((s, i) => ({ flicker: 0, ...s, phase: i * 1.731, d: 0 }));
  }
  update(focus, t) {
    const src = this.sources;
    for (const s of src) s.d = (s.x - focus.x) ** 2 + (s.z - focus.z) ** 2 - (s.priority || 0);
    src.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i], s = src[i];
      if (!s) { l.intensity = 0; continue; }
      const d = Math.sqrt(Math.max(0, s.d));
      const fade = 1 - Math.min(1, Math.max(0, (d - 40) / 16));
      let k = 1;
      if (s.flicker) {
        const n = Math.sin(t * 9.1 + s.phase) * 0.5 + Math.sin(t * 23.7 + s.phase * 2.3) * 0.3 + Math.sin(t * 3.3 + s.phase) * 0.4;
        k = 1 + n * s.flicker;
      }
      l.position.set(s.x, s.y + (s.flicker ? Math.sin(t * 13 + s.phase) * 0.03 : 0), s.z);
      l.color.set(s.color);
      l.intensity = s.intensity * fade * k;
      l.distance = s.dist;
    }
  }
}

const quad = () => {
  const g = new THREE.PlaneGeometry(1, 1);
  return g;
};

export function createFires(fires) {
  const geo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1.7).translate(0, 0.85, 0);
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const pos = new Float32Array(fires.length * 3), info = new Float32Array(fires.length * 4);
  fires.forEach((f, i) => {
    pos.set([f.x, f.y - 0.12 * f.scale, f.z], i * 3);
    info.set([f.scale * 0.62, (i * 0.37) % 1, f.blue ? 1 : 0, 0], i * 4);
  });
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  geo.instanceCount = fires.length;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uNoiseTex: U.uNoiseTex },
    vertexShader: `
      attribute vec3 aPos; attribute vec4 aInfo;
      varying vec2 vUv; varying float vPhase; varying float vBlue;
      void main() {
        vUv = uv; vPhase = aInfo.y; vBlue = aInfo.z;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), camUp, 0.5));
        vec3 p = aPos + right * position.x * aInfo.x + up * position.y * aInfo.x;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uNoiseTex; uniform float uTime;
      varying vec2 vUv; varying float vPhase; varying float vBlue;
      void main() {
        float t = uTime * 1.2 + vPhase * 10.0;
        float n1 = texture2D(uNoiseTex, vec2(vUv.x * 0.5 + vPhase, vUv.y * 0.42 - t * 0.5)).r;
        float n2 = texture2D(uNoiseTex, vec2(vUv.x * 1.3 - vPhase, vUv.y * 0.9 - t * 0.9)).g;
        float n = n1 * 0.62 + n2 * 0.38;
        float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 0.7 * vUv.y;
        float width = mix(0.6, 0.04, pow(vUv.y, 0.75));
        float body = 1.0 - smoothstep(width * 0.3, width, abs(x));
        float f = body * (1.0 - smoothstep(0.3, 1.0, vUv.y + (0.5 - n) * 0.8)) * smoothstep(0.0, 0.07, vUv.y);
        f = clamp(f * 1.6, 0.0, 1.0);
        vec3 warm = mix(vec3(1.0, 0.14, 0.02), vec3(1.0, 0.55, 0.12), f); warm = mix(warm, vec3(1.0, 0.92, 0.62), pow(f, 3.0));
        vec3 cold = mix(vec3(0.04, 0.2, 1.0), vec3(0.2, 0.7, 1.0), f); cold = mix(cold, vec3(0.85, 1.0, 1.0), pow(f, 3.0));
        gl_FragColor = vec4(mix(warm, cold, vBlue) * f * 1.9, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;

  // embers
  const per = 18, n = fires.length * per;
  const eo = new Float32Array(n * 3), es = new Float32Array(n * 4);
  const rnd = mulberry32(8);
  fires.forEach((f, i) => {
    for (let k = 0; k < per; k++) {
      const j = i * per + k;
      eo.set([f.x, f.y + 0.2, f.z], j * 3);
      es.set([rnd(), rnd(), rnd(), f.blue ? -(0.3 + rnd() * 0.7) : 0.3 + rnd() * 0.7], j * 4);
    }
  });
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(eo, 3));
  eg.setAttribute('aSeed', new THREE.BufferAttribute(es, 4));
  const em = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uResolution: U.uResolution },
    vertexShader: `
      attribute vec4 aSeed; uniform float uTime; uniform vec2 uResolution;
      varying float vLife; varying float vBlue;
      void main() {
        float sp = abs(aSeed.w);
        float life = fract(uTime * (0.18 + sp * 0.22) + aSeed.x);
        vLife = life; vBlue = step(aSeed.w, 0.0);
        vec3 p = position;
        p.x += sin(aSeed.y * 6.283 + life * 5.0) * 0.35 * life + (aSeed.z - 0.5) * 0.35;
        p.z += cos(aSeed.x * 6.283 + life * 4.0) * 0.35 * life + (aSeed.y - 0.5) * 0.35;
        p.y += life * (1.4 + sp * 2.4);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.0 - life) * (2.2 + sp * 2.5) * uResolution.y / 900.0 * 24.0 / max(4.0, -mv.z);
      }`,
    fragmentShader: `
      varying float vLife; varying float vBlue;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * (1.0 - vLife);
        vec3 c = mix(vec3(1.0, 0.45, 0.1), vec3(0.3, 0.7, 1.0), vBlue);
        gl_FragColor = vec4(c * a * 5.0, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const embers = new THREE.Points(eg, em);
  embers.frustumCulled = false;
  const g = new THREE.Group();
  g.add(mesh, embers);
  return g;
}

export function createFireflies(count) {
  const P = 64;
  const rnd = mulberry32(1234);
  const base = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    base.set([rnd() * P, rnd(), rnd() * P], i * 3);
    seed.set([rnd(), rnd(), rnd(), rnd() < 0.28 ? 1 : 0], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uFocus: U.uFocus, uWorldTex: U.uWorldTex, uResolution: U.uResolution },
    vertexShader: `
      attribute vec4 aSeed; uniform float uTime; uniform vec3 uFocus; uniform sampler2D uWorldTex; uniform vec2 uResolution;
      varying float vA; varying float vKind;
      void main() {
        const float P = ${P.toFixed(1)};
        vec2 org = uFocus.xz - vec2(P * 0.5);
        vec2 wp = org + mod(position.xz - org, P);
        float t = uTime * (0.25 + aSeed.x * 0.4);
        wp += vec2(sin(t + aSeed.y * 6.283), cos(t * 0.8 + aSeed.z * 6.283)) * 1.6;
        float h = texture2D(uWorldTex, wp / ${WORLD_SIZE.toFixed(1)} + 0.5).r;
        float y = h + 0.35 + position.y * 2.6 + sin(t * 1.7 + aSeed.x * 9.0) * 0.35;
        vec2 fd = abs(wp - uFocus.xz) / (P * 0.5);
        float edge = 1.0 - smoothstep(0.8, 1.0, max(fd.x, fd.y));
        float blink = pow(max(0.0, sin(uTime * (0.7 + aSeed.y * 1.6) + aSeed.z * 30.0)), 2.0);
        vKind = aSeed.w;
        vA = edge * mix(blink, 0.45 + 0.3 * blink, vKind);
        vec4 mv = viewMatrix * vec4(wp.x, y, wp.y, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = mix(4.2, 2.6, vKind) * uResolution.y / 900.0 * 26.0 / max(5.0, -mv.z);
      }`,
    fragmentShader: `
      varying float vA; varying float vKind;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = (smoothstep(0.5, 0.0, d) * 0.6 + smoothstep(0.16, 0.0, d)) * vA;
        vec3 c = mix(vec3(0.75, 1.0, 0.3), vec3(0.45, 0.8, 1.0), vKind);
        gl_FragColor = vec4(c * a * 3.2, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

export function createMist(count, softTex) {
  const P = 96;
  const rnd = mulberry32(555);
  const geo = new THREE.InstancedBufferGeometry();
  const base = quad();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const a = new Float32Array(count * 4), b = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    a.set([rnd() * P, 0.5 + rnd() * 1.6, rnd() * P, 9 + rnd() * 10], i * 4);
    b.set([rnd(), rnd(), 0.5 + rnd() * 0.5, rnd()], i * 4);
  }
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(a, 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 4));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uFocus: U.uFocus, uWorldTex: U.uWorldTex, uNoiseTex: U.uNoiseTex, uSoft: { value: softTex }, uColor: { value: new THREE.Color(0.2, 0.34, 0.62) } },
    vertexShader: `
      attribute vec4 aA; attribute vec4 aB;
      uniform float uTime; uniform vec3 uFocus; uniform sampler2D uWorldTex;
      varying vec2 vUv; varying float vA; varying vec2 vN;
      void main() {
        const float P = ${P.toFixed(1)};
        vec2 org = uFocus.xz - vec2(P * 0.5);
        vec2 drift = vec2(uTime * 0.28 * aB.z, uTime * 0.12 * aB.z);
        vec2 wp = org + mod(aA.xz + drift - org, P);
        float h = texture2D(uWorldTex, wp / ${WORLD_SIZE.toFixed(1)} + 0.5).r;
        vec2 fd = abs(wp - uFocus.xz) / (P * 0.5);
        vA = (1.0 - smoothstep(0.6, 1.0, max(fd.x, fd.y))) * (0.5 + 0.5 * sin(uTime * 0.2 + aB.x * 6.283)) * aB.z;
        vUv = uv; vN = wp * 0.02 + aB.xy;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 p = vec3(wp.x, h + aA.y, wp.y) + right * position.x * aA.w + up * position.y * aA.w * 0.5;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uSoft; uniform sampler2D uNoiseTex; uniform vec3 uColor; uniform float uTime;
      varying vec2 vUv; varying float vA; varying vec2 vN;
      void main() {
        float s = texture2D(uSoft, vUv).a;
        float n = texture2D(uNoiseTex, vN + vUv * 0.35 + uTime * 0.004).r;
        gl_FragColor = vec4(uColor * s * vA * (0.35 + n) * 0.16, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return mesh;
}

// Volumetric moon shafts: additive cylinders aligned with the light, soft at the silhouette.
export function createGodRays(maps, count) {
  const rnd = mulberry32(2718);
  const spots = [];
  let guard = 0;
  while (spots.length < count && guard++ < 6000) {
    const x = (rnd() * 2 - 1) * PLAY_R, z = (rnd() * 2 - 1) * PLAY_R;
    const pd = pathDist(x, z);
    if (rnd() < 0.6 && pd > 7) continue;
    if (maps.dirt(x, z) > 0.9 && pd > 2) continue; // inside a trunk footprint
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 8)) continue;
    spots.push({ x, z, r: 1.1 + rnd() * 2.2 });
  }
  const geo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true).translate(0, -0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uNoiseTex: U.uNoiseTex, uColor: { value: new THREE.Color(0.32, 0.5, 1.0) }, uStrength: { value: 0.075 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vSeed; varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp;
        vN = normalize(mat3(viewMatrix) * mat3(instanceMatrix) * normal);
        vV = normalize(-mv.xyz);
        vUv = uv; vSeed = instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.071; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uNoiseTex; uniform float uTime; uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vSeed; varying float vDepth;
      void main() {
        float fres = pow(abs(dot(normalize(vN), normalize(vV))), 2.4);
        float s1 = texture2D(uNoiseTex, vec2(vUv.x * 1.5 + vSeed, uTime * 0.006 + vSeed)).r;
        float s2 = texture2D(uNoiseTex, vec2(vUv.x * 4.0 - vSeed, vUv.y * 0.3 + uTime * 0.012)).g;
        float h = vUv.y;
        float a = fres * (0.25 + 0.75 * s1) * (0.55 + 0.45 * s2) * smoothstep(0.0, 0.2, h) * (0.3 + 0.7 * h) * smoothstep(3.0, 12.0, vDepth);
        gl_FragColor = vec4(uColor * a * uStrength, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), MOON_DIR), p = new THREE.Vector3(), s = new THREE.Vector3();
  const len = 40;
  spots.forEach((sp, i) => {
    const y = heightAt(sp.x, sp.z) - 1.5;
    p.set(sp.x, y, sp.z).addScaledVector(MOON_DIR, -len);
    mesh.setMatrixAt(i, m.compose(p, q, s.set(sp.r, len, sp.r)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}
