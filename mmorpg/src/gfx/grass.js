import { THREE, U, patch } from './common.js';
import { WORLD_SIZE, mulberry32 } from '../shared/world.js';

export const GRASS_PATCH = 60;

// A single pool of blades that wraps around the camera focus, so the whole forest floor
// appears covered while only ~one screen of grass ever exists.
export function createGrass(count) {
  const rnd = mulberry32(4242);
  // blade: 3 segments, tapered
  const lv = [0, 0.36, 0.7, 1], wd = [1, 0.82, 0.5, 0];
  const p = [], idx = [];
  for (let i = 0; i < 3; i++) { p.push(-0.5 * wd[i], lv[i], 0, 0.5 * wd[i], lv[i], 0); }
  p.push(0, 1, 0);
  idx.push(0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(21).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);

  const base = new Float32Array(count * 3), param = new Float32Array(count * 4);
  let n = 0;
  while (n < count) {
    const cx = rnd() * GRASS_PATCH, cz = rnd() * GRASS_PATCH;
    const k = 3 + ((rnd() * 5) | 0);
    const clumpH = 0.4 + Math.pow(rnd(), 1.8) * 0.8, clumpLean = rnd(), clumpA = rnd() * 6.283, spread = 0.1 + rnd() * 0.2;
    const thr = rnd();
    for (let i = 0; i < k && n < count; i++, n++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * spread;
      base[n * 3] = (cx + Math.cos(a) * d + GRASS_PATCH) % GRASS_PATCH;
      base[n * 3 + 1] = Math.min(0.999, thr * 0.85 + rnd() * 0.15);
      base[n * 3 + 2] = (cz + Math.sin(a) * d + GRASS_PATCH) % GRASS_PATCH;
      param[n * 4] = clumpA + (rnd() - 0.5) * 2.4;
      param[n * 4 + 1] = clumpH * (0.65 + rnd() * 0.6);
      param[n * 4 + 2] = 0.045 + rnd() * 0.04;
      param[n * 4 + 3] = (clumpLean + (rnd() - 0.5) * 0.35 + 1) % 1;
    }
  }
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute('aParam', new THREE.InstancedBufferAttribute(param, 4));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  // wider blades when there are fewer of them, so coverage stays similar across quality levels
  const widthBoost = Math.sqrt(140000 / count);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  patch(mat, (s) => {
    s.vertexShader = `
      attribute vec3 aBase; attribute vec4 aParam;
      uniform vec3 uFocus; uniform float uTime; uniform sampler2D uWorldTex; uniform sampler2D uNoiseTex; uniform vec4 uPush[8];
      varying vec3 vGCol;
      ` + s.vertexShader
      .replace('#include <beginnormal_vertex>', `
        const float PATCH = ${GRASS_PATCH.toFixed(1)};
        vec2 gOrg = uFocus.xz - vec2(PATCH * 0.5);
        vec2 gWp = gOrg + mod(aBase.xz - gOrg, PATCH);
        vec4 gWd = texture2D(uWorldTex, gWp / ${WORLD_SIZE.toFixed(1)} + 0.5);
        float gKeep = step(aBase.y, gWd.g * 1.25);
        vec2 gFd = abs(gWp - uFocus.xz) / (PATCH * 0.5);
        float gEdge = 1.0 - smoothstep(0.78, 0.98, max(gFd.x, gFd.y));
        float gH = aParam.y * (0.5 + 0.7 * gWd.g) * gKeep * gEdge;
        float gT = position.y;
        vec2 gDir = vec2(cos(aParam.x), sin(aParam.x));
        vec2 gPerp = vec2(-gDir.y, gDir.x);
        float gGust = texture2D(uNoiseTex, gWp * 0.028 + uTime * vec2(0.045, 0.028)).r;
        float gFine = texture2D(uNoiseTex, gWp * 0.11 + uTime * vec2(0.11, 0.07)).g;
        float gSway = (gGust - 0.42) * 1.25 + (gFine - 0.5) * 0.35;
        vec2 gBend = vec2(0.89, 0.45) * gSway * 0.62 + gPerp * (aParam.w - 0.5) * 0.85;
        for (int i = 0; i < 8; i++) {
          vec2 pd = gWp - uPush[i].xy; float pl = length(pd);
          gBend += (pd / max(pl, 0.05)) * (1.0 - smoothstep(0.0, uPush[i].z, pl)) * uPush[i].w;
        }
        float gCurve = gT * gT;
        float gFar = 1.0 + smoothstep(14.0, 30.0, length(gWp - uFocus.xz)) * 0.8;
        vec3 gPos;
        gPos.xz = gWp + gDir * position.x * aParam.z * ${widthBoost.toFixed(3)} * gFar * step(0.001, gH) + gBend * gCurve * gH;
        gPos.y = gWd.r + gT * gH * (1.0 - 0.3 * min(1.0, dot(gBend, gBend)) * gCurve) - 0.03;
        vec3 objectNormal = normalize(vec3(gBend.x * 0.55 + gPerp.x * 0.18, 1.0, gBend.y * 0.55 + gPerp.y * 0.18));
        // colour: dark roots, moonlit tips, broad patches of teal / dry tones
        float gVar = texture2D(uNoiseTex, gWp * 0.017).g;
        float gVar2 = texture2D(uNoiseTex, gWp * 0.004 + 0.37).r;
        vec3 gTip = mix(vec3(0.09, 0.24, 0.085), vec3(0.05, 0.2, 0.145), gVar);
        gTip = mix(gTip, vec3(0.13, 0.17, 0.05), smoothstep(0.55, 0.85, gVar2) * 0.6);
        gTip *= 0.75 + aParam.w * 0.6;
        vec3 gRoot = gTip * vec3(0.16, 0.24, 0.26);
        vGCol = mix(gRoot, gTip, gT * gT) * (0.6 + 0.4 * gWd.g);
        vGCol += gTip * pow(gT, 3.0) * max(0.0, gSway) * 0.5;
      `)
      .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
    s.fragmentShader = 'varying vec3 vGCol;\n' + s.fragmentShader
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vGCol;')
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.name = 'grass';
  return mesh;
}
