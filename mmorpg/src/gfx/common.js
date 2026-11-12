import * as THREE from '../../vendor/three.min.js';
export { THREE };

// Uniforms shared by every patched material. Objects are shared by reference.
export const U = {
  uTime: { value: 0 },
  uNoiseTex: { value: null },
  uWorldTex: { value: null },
  uFocus: { value: new THREE.Vector3() },
  uFadeCenter: { value: new THREE.Vector2(0, 0) },
  uFadeDepth: { value: 1e6 },
  uFadeY: { value: 0 },
  uHero: { value: new THREE.Vector3() },
  uGhost: { value: new THREE.Vector4(0, 1, 12, 9) }, // which way the camera looks along the ground (x, z), how far behind itself a tree hides the ground, how far to the side that matters
  uResolution: { value: new THREE.Vector2(1, 1) },
  uPush: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1, 0)) },
};

let patchId = 0;
// Patch a built-in material's shader. `fn(shader)` edits shader.vertexShader / fragmentShader.
export function patch(mat, fn, uniforms = {}) {
  const id = 'p' + patchId++;
  mat.onBeforeCompile = (shader) => {
    for (const k in U) shader.uniforms[k] = U[k];
    for (const k in uniforms) shader.uniforms[k] = uniforms[k];
    fn(shader);
  };
  mat.customProgramCacheKey = () => id;
  return mat;
}

const VERT_DECL = `
uniform float uTime;
uniform sampler2D uNoiseTex;
`;
const FADE_DECL = `
uniform vec2 uFadeCenter;
uniform float uFadeDepth;
uniform float uFadeY;
uniform vec2 uResolution;
varying float vWY;
varying float vGhost;
`;
// 1) a hole around the hero for anything standing between hero and camera
// 2) tall things dissolve into the dark canopy above the hero so the camera can look through
// 3) a tree that stands between the camera and the ground around the hero thins out to a ghost of itself above
//    knee height (vGhost, worked out once for the whole tree): the fight behind it stays readable, its foot
//    still shows where it stands
const fadeBody = (h0, h1, ghost) => `
{
  vec2 fNdc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  vec2 fDd = (fNdc - uFadeCenter) * vec2(uResolution.x / uResolution.y, 1.0);
  float fAmt = smoothstep(0.11, 0.2, length(fDd)) + step(uFadeDepth - 1.4, vViewPosition.z);
  fAmt = min(fAmt, 1.0 - smoothstep(${h0.toFixed(1)}, ${h1.toFixed(1)}, vWY - uFadeY));
  fAmt = min(fAmt, 1.0 - vGhost * ${ghost.toFixed(2)} * smoothstep(0.7, 2.3, vWY - uFadeY));
  if (fAmt < 1.0) {
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (ign >= fAmt) discard;
  }
}
`;

// Adds wind sway (weight expression in GLSL, e.g. "uv.y") and/or the see-through fade
// that keeps the hero visible behind trunks and foliage. fade: [startHeight, endHeight] in metres.
export function foliage(mat, { wind = null, strength = 1, fade = null, ghost = 0.86, noFlip = false } = {}) {
  return patch(mat, (s) => {
    if (wind) {
      s.vertexShader = VERT_DECL + s.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 wp_ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          #else
            vec3 wp_ = (modelMatrix * vec4(transformed, 1.0)).xyz;
          #endif
          float wn_ = texture2D(uNoiseTex, wp_.xz * 0.035 + uTime * vec2(0.03, 0.021)).r - 0.5;
          float ww_ = (${wind}) * ${strength.toFixed(3)};
          transformed.x += (wn_ * 0.9 + sin(uTime * 1.4 + wp_.x * 0.6 + wp_.z * 0.8) * 0.08) * ww_;
          transformed.z += (wn_ * 0.5 + cos(uTime * 1.1 + wp_.x * 0.7 - wp_.z * 0.5) * 0.08) * ww_;
        }`);
    }
    if (fade) {
      s.vertexShader = 'varying float vWY;\nvarying float vGhost;\nuniform vec3 uHero;\nuniform vec4 uGhost;\n' + s.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        #ifdef USE_INSTANCING
          vWY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
          vec2 gAt_ = uHero.xz - (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        #else
          vWY = (modelMatrix * vec4(transformed, 1.0)).y;
          vec2 gAt_ = uHero.xz - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        #endif
        // how far the hero is beyond this tree as the camera looks, and how far off to the side
        float gAlong_ = dot(gAt_, uGhost.xy), gSide_ = abs(gAt_.x * uGhost.y - gAt_.y * uGhost.x);
        vGhost = smoothstep(-4.5, -1.5, gAlong_) * (1.0 - smoothstep(uGhost.z, uGhost.z + 5.0, gAlong_)) * (1.0 - smoothstep(uGhost.w, uGhost.w + 4.0, gSide_));`);
      s.fragmentShader = FADE_DECL + s.fragmentShader
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + fadeBody(fade[0], fade[1], ghost));
    }
    if (noFlip) {
      // foliage cards are lit as one soft volume: do not flip the normal on back faces
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
    }
  });
}

// Group many instances of one geometry into per-cell InstancedMeshes so the frustum can cull them.
export function chunked(geometry, material, items, { cell = 40, cast = true, receive = true, colors = false } = {}) {
  const group = new THREE.Group();
  const buckets = new Map();
  for (const it of items) {
    const k = Math.floor(it.x / cell) + ':' + Math.floor(it.z / cell);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(it);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
  for (const list of buckets.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((it, i) => {
      p.set(it.x, it.y || 0, it.z);
      e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
      q.setFromEuler(e);
      if (it.sx !== undefined) s.set(it.sx, it.sy, it.sz); else s.setScalar(it.s === undefined ? 1 : it.s);
      mesh.setMatrixAt(i, m.compose(p, q, s));
      if (colors) mesh.setColorAt(i, c.set(it.color === undefined ? 0xffffff : it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

// Merge BufferGeometries that share the same attribute set (position/normal/uv[/color]).
export function mergeGeos(geos) {
  const names = Object.keys(geos[0].attributes);
  let vcount = 0, icount = 0;
  for (const g of geos) { vcount += g.attributes.position.count; icount += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  const arrays = {};
  for (const n of names) arrays[n] = new Float32Array(vcount * geos[0].attributes[n].itemSize);
  const index = new Uint32Array(icount);
  let vo = 0, io = 0;
  for (const g of geos) {
    for (const n of names) arrays[n].set(g.attributes[n].array, vo * g.attributes[n].itemSize);
    const cnt = g.attributes.position.count;
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) index[io++] = a[i] + vo; }
    else for (let i = 0; i < cnt; i++) index[io++] = vo + i;
    vo += cnt;
  }
  for (const n of names) out.setAttribute(n, new THREE.BufferAttribute(arrays[n], geos[0].attributes[n].itemSize));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

// Give a geometry a constant vertex colour attribute (so it can be merged with coloured ones).
export function tint(geo, color, fn = null) {
  const c = new THREE.Color(color), n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3), pos = geo.attributes.position, tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    tmp.copy(c);
    if (fn) fn(tmp, pos.getX(i), pos.getY(i), pos.getZ(i), i);
    arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function xform(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sx, sy, sz } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx === undefined ? s : sx, sy === undefined ? s : sy, sz === undefined ? s : sz));
  geo.applyMatrix4(m);
  return geo;
}
