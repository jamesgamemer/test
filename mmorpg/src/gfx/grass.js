import { THREE, U, patch } from './common.js';
import { WORLD_SIZE, mulberry32 } from '../shared/world.js';

export const GRASS_PATCH = 60;

// A single pool of grass tufts that wraps around the camera focus, so the whole forest floor appears
// covered while only ~one screen of grass ever exists. Each tuft is a painted card from
// assets/env/grass.webp (tall, wispy and low tufts side by side). A card turns to face the camera around the
// vertical axis and leans back a little, so from the high game camera it reads as a full clump, and it
// bends with the wind and away from anything pushing through it.
export function createGrass(count, card) {
  const rnd = mulberry32(4242);
  const SEG = 4, cells = card.cells;
  const p = [], uv = [], nrm = [], idx = [];
  for (let i = 0; i <= SEG; i++) { const t = i / SEG; p.push(-0.5, t, 0, 0.5, t, 0); uv.push(0, t, 1, t); nrm.push(0, 1, 0, 0, 1, 0); }
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);

  // aBase: x, keep threshold, z.  aParam: turn (0..1), card height in metres, atlas cell, tone (0..1)
  const base = new Float32Array(count * 3), param = new Float32Array(count * 4);
  let n = 0;
  while (n < count) {
    // tufts grow in loose drifts: a few of one kind near each other
    const cx = rnd() * GRASS_PATCH, cz = rnd() * GRASS_PATCH;
    const k = 1 + ((rnd() * 4) | 0), kind = rnd() < 0.3 ? 0 : rnd() < 0.55 ? 1 : 2, spread = 0.35 + rnd() * 0.7, thr = rnd(), tone = rnd();
    for (let i = 0; i < k && n < count; i++, n++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * spread;
      base[n * 3] = (cx + Math.cos(a) * d + GRASS_PATCH) % GRASS_PATCH;
      base[n * 3 + 1] = Math.min(0.999, thr * 0.85 + rnd() * 0.15);
      base[n * 3 + 2] = (cz + Math.sin(a) * d + GRASS_PATCH) % GRASS_PATCH;
      const cell = rnd() < 0.75 ? kind : (rnd() * cells) | 0;
      param[n * 4] = rnd();
      param[n * 4 + 1] = (cell === 0 ? 1.05 : cell === 1 ? 0.9 : 1.0) * (0.75 + rnd() * 0.6);
      param[n * 4 + 2] = Math.min(cells - 1, cell);
      param[n * 4 + 3] = (tone + (rnd() - 0.5) * 0.3 + 1) % 1;
    }
  }
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute('aParam', new THREE.InstancedBufferAttribute(param, 4));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  // fewer tufts are drawn a little larger, so coverage stays similar across quality levels
  const sizeBoost = Math.pow(32000 / count, 0.25);
  const mat = new THREE.MeshLambertMaterial({ map: card.map, alphaTest: 0.36, side: THREE.DoubleSide });
  patch(mat, (s) => {
    s.vertexShader = `
      attribute vec3 aBase; attribute vec4 aParam;
      uniform vec3 uFocus; uniform float uTime; uniform sampler2D uWorldTex; uniform sampler2D uNoiseTex; uniform vec4 uPush[8];
      varying vec3 vGCol;
      ` + s.vertexShader
      .replace('#include <uv_vertex>', `
        #include <uv_vertex>
        // pick this tuft's cell of the atlas; every other tuft is mirrored
        vMapUv = vec2((aParam.z + mix(uv.x, 1.0 - uv.x, step(0.5, fract(aParam.x * 7.31)))) / ${cells.toFixed(1)}, uv.y);`)
      .replace('#include <beginnormal_vertex>', `
        const float PATCH = ${GRASS_PATCH.toFixed(1)};
        vec2 gOrg = uFocus.xz - vec2(PATCH * 0.5);
        vec2 gWp = gOrg + mod(aBase.xz - gOrg, PATCH);
        vec4 gWd = texture2D(uWorldTex, gWp / ${WORLD_SIZE.toFixed(1)} + 0.5);
        float gKeep = step(aBase.y, gWd.g * 1.25);
        vec2 gFd = abs(gWp - uFocus.xz) / (PATCH * 0.5);
        float gEdge = 1.0 - smoothstep(0.78, 0.98, max(gFd.x, gFd.y));
        float gH = aParam.y * ${sizeBoost.toFixed(3)} * (0.55 + 0.6 * gWd.g) * gKeep * gEdge;
        float gT = position.y;
        // the card's width runs across the view, turned a little differently for every tuft
        vec2 gRight = normalize(vec2(viewMatrix[0][0], viewMatrix[2][0]) + 1e-5);
        vec2 gBack = normalize(vec2(viewMatrix[0][2], viewMatrix[2][2]) + 1e-5);
        float gTurn = (aParam.x - 0.5) * 1.5;
        vec2 gDir = gRight * cos(gTurn) + gBack * sin(gTurn);
        float gGust = texture2D(uNoiseTex, gWp * 0.028 + uTime * vec2(0.045, 0.028)).r;
        float gFine = texture2D(uNoiseTex, gWp * 0.11 + uTime * vec2(0.11, 0.07)).g;
        float gSway = (gGust - 0.42) * 1.25 + (gFine - 0.5) * 0.35;
        vec2 gBend = vec2(0.89, 0.45) * gSway * 0.42;
        for (int i = 0; i < 8; i++) {
          vec2 pd = gWp - uPush[i].xy; float pl = length(pd);
          gBend += (pd / max(pl, 0.05)) * (1.0 - smoothstep(0.0, uPush[i].z, pl)) * uPush[i].w;
        }
        float gCurve = gT * gT;
        vec3 gPos;
        // lean the top away from the camera so the tuft shows its face to a view from above
        gPos.xz = gWp + gDir * position.x * gH * ${card.aspect.toFixed(4)} + (gBend * gCurve - gBack * 0.3 * gT) * gH;
        gPos.y = gWd.r + gT * gH * (1.0 - 0.3 * min(1.0, dot(gBend, gBend)) * gCurve) - 0.04;
        vec3 objectNormal = normalize(vec3(gBend.x * 0.45, 1.0, gBend.y * 0.45));
        // tone: broad patches of teal and of dry grass, dark at the roots, tips catching the wind
        float gVar = texture2D(uNoiseTex, gWp * 0.017).g;
        float gVar2 = texture2D(uNoiseTex, gWp * 0.004 + 0.37).r;
        vec3 gTint = mix(vec3(0.58, 0.84, 0.7), vec3(0.4, 0.76, 0.92), gVar);
        gTint = mix(gTint, vec3(0.8, 0.74, 0.46), smoothstep(0.55, 0.85, gVar2) * 0.45);
        gTint *= 0.72 + aParam.w * 0.5;
        vGCol = gTint * mix(0.3, 1.0, smoothstep(0.0, 0.5, gT)) * (0.6 + 0.4 * gWd.g);
        vGCol += gTint * gT * gT * max(0.0, gSway) * 0.3;
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
