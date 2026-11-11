import { THREE, U, patch } from './common.js';
import {
  WORLD_SIZE, HALF, GRID, PLAY_R, heightAt, pathDist, fbm, smoothstep, POIS, POND, POND_LEVEL, nearPond,
} from '../shared/world.js';

// Bakes the per-texel world masks used by the terrain, the grass and the minimap.
// R = height (m), G = grass density, B = bare dirt, A = wetness
export function bakeWorldMaps(layout) {
  const n = GRID, step = WORLD_SIZE / n;
  const dens = new Float32Array(n * n), dirt = new Float32Array(n * n), wet = new Float32Array(n * n), hgt = new Float32Array(n * n);
  const stamp = new Float32Array(n * n);
  const toCell = (v) => Math.floor((v + HALF) / step);
  const splat = (x, z, r0, r1, amount) => {
    const i0 = Math.max(0, toCell(x - r1)), i1 = Math.min(n - 1, toCell(x + r1));
    const j0 = Math.max(0, toCell(z - r1)), j1 = Math.min(n - 1, toCell(z + r1));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(-HALF + (i + 0.5) * step - x, -HALF + (j + 0.5) * step - z);
      const v = (1 - smoothstep(r0, r1, d)) * amount;
      if (v > stamp[j * n + i]) stamp[j * n + i] = v;
    }
  };
  for (const t of layout.trees) splat(t.x, t.z, t.r * 0.8, t.r * 1.5 + 0.5, t.type === 2 ? 0.4 : 0.85);
  for (const r of layout.rocks) if (r.r > 0.7) splat(r.x, r.z, r.r * 0.7, r.r * 1.3, 0.8);
  for (const g of layout.giants) splat(g.x, g.z, 0.6, 2.2, 0.9);

  const C = POIS.camp, G = POIS.gate;
  const puddles = [[C.x - 2.4, C.z + 7.6, 1.7], [C.x + 2.2, C.z + 8.6, 1.0], [C.x + 0.4, C.z + 5.6, 0.75], [C.x - 6.2, C.z + 9.6, 1.1]];
  for (let j = 0; j < n; j++) {
    const z = -HALF + (j + 0.5) * step;
    for (let i = 0; i < n; i++) {
      const x = -HALF + (i + 0.5) * step, k = j * n + i;
      const rag = (fbm(x * 0.33, z * 0.33, 3, 7) - 0.5);
      const pd = pathDist(x, z) + rag * 1.7;
      const path = 1 - smoothstep(-0.7, 0.8, pd);
      const dCamp = Math.hypot(x - C.x, z - C.z) + rag * 5;
      const dGate = Math.hypot(x - G.x, z - G.z) + rag * 4;
      const camp = 1 - smoothstep(6.5, 11.5, dCamp), gate = 1 - smoothstep(9.5, 14, dGate);
      const bald = smoothstep(0.7, 0.82, fbm(x * 0.07, z * 0.07, 3, 13)) * 0.7;
      const d = Math.max(path, camp * 0.92, gate, stamp[k], bald);
      const h = heightAt(x, z);
      const shore = nearPond(x, z) ? 1 - smoothstep(POND_LEVEL + 0.05, POND_LEVEL + 0.55, h) : 0;
      let w = shore;
      for (const p of puddles) w = Math.max(w, 1 - smoothstep(p[2] * 0.55, p[2], Math.hypot(x - p[0], z - p[1]) + rag * 0.9));
      w = Math.max(w, path * smoothstep(0.7, 0.78, fbm(x * 0.21, z * 0.21, 2, 29)));
      const lush = 0.45 + 0.55 * smoothstep(0.25, 0.55, fbm(x * 0.05, z * 0.05, 3, 17));
      const out = 1 - smoothstep(PLAY_R + 4, PLAY_R + 12, Math.hypot(x, z));
      dirt[k] = Math.max(d, shore);
      dens[k] = Math.pow(1 - Math.max(d, shore), 1.6) * lush * (0.35 + 0.65 * out);
      wet[k] = w;
      hgt[k] = h;
    }
  }

  const half = new Uint16Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    half[k * 4] = THREE.DataUtils.toHalfFloat(hgt[k]);
    half[k * 4 + 1] = THREE.DataUtils.toHalfFloat(dens[k]);
    half[k * 4 + 2] = THREE.DataUtils.toHalfFloat(dirt[k]);
    half[k * 4 + 3] = THREE.DataUtils.toHalfFloat(wet[k]);
  }
  const tex = new THREE.DataTexture(half, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  const sample = (arr, x, z) => arr[Math.min(n - 1, Math.max(0, toCell(z))) * n + Math.min(n - 1, Math.max(0, toCell(x)))];

  // minimap image
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = mapCanvas.height = n;
  {
    const ctx = mapCanvas.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
    for (let k = 0; k < n * n; k++) {
      const g = dens[k], b = dirt[k], x = -HALF + ((k % n) + 0.5) * step, z = -HALF + (Math.floor(k / n) + 0.5) * step;
      const sh = 0.8 + (hgt[k] % 1.5) * 0.08;
      let r = 22 + b * 70 - g * 6, gg = 44 + g * 46 + b * 34, bb = 40 + b * 30 + g * 4;
      if (hgt[k] < POND_LEVEL && nearPond(x, z)) { r = 30; gg = 110; bb = 150; }
      const fade = 1 - smoothstep(PLAY_R - 2, PLAY_R + 8, Math.hypot(x, z));
      d[k * 4] = r * sh * fade; d[k * 4 + 1] = gg * sh * fade; d[k * 4 + 2] = bb * sh * fade + (1 - fade) * 14; d[k * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const px = (v) => (v + HALF) / step;
    ctx.fillStyle = 'rgba(8,20,16,0.55)';
    for (const t of layout.trees) { ctx.beginPath(); ctx.arc(px(t.x), px(t.z), Math.max(1.3, t.r * 2.6), 0, 6.283); ctx.fill(); }
    ctx.fillStyle = 'rgba(190,190,200,0.9)';
    for (const p of layout.colliders) if (p.x1 !== undefined && p.r > 0.5) {
      ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(200,196,186,0.95)';
      ctx.beginPath(); ctx.moveTo(px(p.x1), px(p.z1)); ctx.lineTo(px(p.x2), px(p.z2)); ctx.stroke();
    }
  }

  return { tex, dens: (x, z) => sample(dens, x, z), dirt: (x, z) => sample(dirt, x, z), wet: (x, z) => sample(wet, x, z), mapCanvas };
}

export function createTerrain(T) {
  const size = 320, segs = 320;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const out = Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - HALF);
    pos.setY(i, heightAt(x, z) + out * 0.35);
  }
  geo.computeVertexNormals();

  T.groundN.repeat.set(70, 70);
  const mat = new THREE.MeshStandardMaterial({ map: T.dirt, normalMap: T.groundN, roughness: 0.96, metalness: 0, normalScale: new THREE.Vector2(0.9, 0.9) });
  patch(mat, (s) => {
    s.vertexShader = 'varying vec3 vWPos;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = `
      varying vec3 vWPos;
      uniform sampler2D uWorldTex; uniform sampler2D uMossTex; uniform sampler2D uNoiseTex;
      ` + s.fragmentShader
      .replace('#include <map_fragment>', `
        vec2 wuv = vWPos.xz / ${WORLD_SIZE.toFixed(1)} + 0.5;
        vec4 wd = texture2D(uWorldTex, wuv);
        float tn = texture2D(uNoiseTex, vWPos.xz * 0.09).g;
        float macro = texture2D(uNoiseTex, vWPos.xz * 0.013).r;
        float dirtK = smoothstep(0.32, 0.62, wd.b + (tn - 0.5) * 0.4);
        vec3 cDirt = texture2D(map, vWPos.xz * 0.23).rgb;
        vec3 cMoss = texture2D(uMossTex, vWPos.xz * 0.17).rgb;
        vec3 albedo = mix(cMoss, cDirt, dirtK) * (0.7 + macro * 0.6);
        float wetK = smoothstep(0.35, 0.8, wd.a + (tn - 0.5) * 0.25);
        albedo = mix(albedo, albedo * vec3(0.6, 0.66, 0.78), wetK);
        diffuseColor.rgb *= albedo;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.24, wetK);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.002, 0.006, 0.015) * wetK;')
      .replace('#include <normal_fragment_maps>', `
        vec3 flatN = normal;
        #include <normal_fragment_maps>
        normal = normalize(mix(normal, flatN, wetK * 0.97));`);
  }, { uMossTex: { value: T.moss } });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  // pond
  const waterN = T.groundN.clone();
  waterN.repeat.set(5, 5);
  waterN.needsUpdate = true;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.r * 1.5, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0a2a3a, roughness: 0.05, metalness: 0.2, normalMap: waterN, normalScale: new THREE.Vector2(0.25, 0.25), emissive: 0x06324a, emissiveIntensity: 0.55, transparent: true, opacity: 0.88 }));
  water.position.set(POND.x, POND_LEVEL, POND.z);
  water.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh, water);
  return { group, mesh, update(t) { waterN.offset.set(t * 0.012, t * 0.009); } };
}
