// Deterministic world definition shared by the browser client and the Node server.
// Everything here is pure math: no DOM, no three.js.

export const WORLD_SIZE = 216;
export const HALF = WORLD_SIZE / 2;
export const PLAY_R = 100;
export const GRID = 512; // cells per side of the baked maps

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x, z, oct = 4, seed = 0) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, z * f, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- places

export const POIS = {
  camp: { x: 34, z: -3, r: 12, safe: true },
  hollow: { x: -22, z: 60, r: 22 },
  den: { x: 11, z: -68, r: 22 },
  rot: { x: -56, z: 0, r: 24 },
  gate: { x: -92, z: 0, r: 13 },
};
export const POND = { x: -29, z: 67, r: 9 };
export const SPAWN = { x: 24, z: 5.6 };
export const nearPond = (x, z) => Math.hypot(x - POND.x, z - POND.z) < POND.r * 1.7;

export function zoneAt(x, z) {
  const d = (p) => Math.hypot(x - p.x, z - p.z);
  if (d(POIS.camp) < POIS.camp.r + 2) return 'camp';
  if (d(POIS.gate) < POIS.gate.r + 3) return 'gate';
  if (d(POIS.hollow) < POIS.hollow.r + 4) return 'hollow';
  if (d(POIS.den) < POIS.den.r + 4) return 'den';
  if (x < -32 && Math.abs(z) < 40) return 'rot';
  return 'whisper';
}

const PATH_DEFS = [
  { w: 2.5, pts: [[70, 20], [56, 13], [44, 8], [30, 5], [16, 7], [2, 0], [-14, 3], [-30, -3], [-46, 2], [-62, -2], [-78, 0], [-92, 0]] },
  { w: 1.9, pts: [[16, 7], [9, -9], [15, -27], [7, -43], [11, -58], [11, -68]] },
  { w: 1.9, pts: [[-14, 3], [-21, 19], [-14, 35], [-22, 49], [-22, 60]] },
  { w: 1.7, pts: [[30, 5], [32, 1], [34, -1]] },
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Flattened list of path segments: [x1, z1, x2, z2, halfWidth]
export const PATH_SEGS = (() => {
  const segs = [];
  for (const def of PATH_DEFS) {
    const p = def.pts, n = p.length;
    let prev = null;
    for (let i = 0; i < n - 1; i++) {
      const a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], d = p[Math.min(n - 1, i + 2)];
      for (let s = 0; s < 8; s++) {
        const t = s / 8;
        const pt = [catmull(a[0], b[0], c[0], d[0], t), catmull(a[1], b[1], c[1], d[1], t)];
        if (prev) segs.push([prev[0], prev[1], pt[0], pt[1], def.w]);
        prev = pt;
      }
    }
    const last = p[n - 1];
    segs.push([prev[0], prev[1], last[0], last[1], def.w]);
  }
  return segs;
})();

// Signed-ish distance to the nearest path edge: <0 inside the path.
export function pathDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < PATH_SEGS.length; i++) {
    const s = PATH_SEGS[i];
    const dx = s[2] - s[0], dz = s[3] - s[1];
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - s[0]) * dx + (z - s[1]) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s[0] + dx * t - x, pz = s[1] + dz * t - z;
    const d = Math.sqrt(px * px + pz * pz) - s[4];
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------- terrain

function broadHeight(x, z) {
  return (fbm(x * 0.011, z * 0.011, 3, 11) - 0.5) * 9;
}
function rawHeight(x, z) {
  const broad = broadHeight(x, z);
  const detail = (fbm(x * 0.045, z * 0.045, 4, 23) - 0.5) * 4.2 + (vnoise(x * 0.21, z * 0.21, 5) - 0.5) * 0.5;
  let flat = 1 - smoothstep(0.5, 9, pathDist(x, z));
  for (const k in POIS) {
    const p = POIS[k];
    const d = Math.hypot(x - p.x, z - p.z);
    const rr = k === 'camp' || k === 'gate' ? p.r : p.r * 0.5;
    flat = Math.max(flat, 1 - smoothstep(rr * 0.75, rr * 1.5, d));
  }
  let h = broad + detail * (1 - flat * 0.92);
  // pond basin
  const pd = Math.hypot(x - POND.x, z - POND.z) + (vnoise(x * 0.3, z * 0.3, 77) - 0.5) * 3;
  const basin = 1 - smoothstep(POND.r * 0.45, POND.r * 1.25, pd);
  h = lerp(h, POND_LEVEL - 1.1, basin);
  // rim rising toward the world edge
  const edge = smoothstep(PLAY_R - 6, HALF + 6, Math.hypot(x, z));
  h += edge * edge * 9;
  return h;
}
export const POND_LEVEL = broadHeight(POND.x, POND.z) - 0.55;

let _height = null;
export function heightGrid() {
  if (_height) return _height;
  const n = GRID + 1;
  const g = new Float32Array(n * n);
  const step = WORLD_SIZE / GRID;
  for (let j = 0; j < n; j++) {
    const z = -HALF + j * step;
    for (let i = 0; i < n; i++) g[j * n + i] = rawHeight(-HALF + i * step, z);
  }
  _height = g;
  return g;
}

export function heightAt(x, z) {
  const g = heightGrid();
  const n = GRID + 1;
  const fx = clamp((x + HALF) / WORLD_SIZE * GRID, 0, GRID - 0.001);
  const fz = clamp((z + HALF) / WORLD_SIZE * GRID, 0, GRID - 0.001);
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const a = g[iz * n + ix], b = g[iz * n + ix + 1], c = g[(iz + 1) * n + ix], d = g[(iz + 1) * n + ix + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

// ---------------------------------------------------------------- layout

// Ruin walls in world space: [x1, z1, x2, z2, height, flags]
const C = POIS.camp;
export const CAMP_WALLS = [
  { a: [C.x - 8, C.z - 5], b: [C.x + 6.5, C.z - 5], h: 5.6, window: 0.72, seed: 1 },
  { a: [C.x + 6.5, C.z - 5], b: [C.x + 6.5, C.z + 2.2], h: 4.4, decay: 1, seed: 2 },
  { a: [C.x - 8, C.z - 5], b: [C.x - 8, C.z - 1.2], h: 3.2, decay: 1, seed: 3 },
];
export const CAMP = {
  torches: [
    { x: C.x - 4.6, z: C.z - 4.5, y: 2.5, wall: true },
    { x: C.x + 6.0, z: C.z - 3.5, y: 2.2, wall: true, face: -Math.PI / 2 },
  ],
  fire: { x: C.x - 2.2, z: C.z + 1.6 },
  column: { x: C.x + 3.4, z: C.z + 3.2, rot: 0.5 },
  elder: { x: C.x - 3.6, z: C.z - 0.2, rot: 2.2 },
  merchant: { x: C.x + 2.6, z: C.z - 2.6, rot: 3.6 },
};
const G = POIS.gate;
export const GATE = {
  pillars: Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + 0.39;
    return { x: G.x + Math.cos(a) * 10.5, z: G.z + Math.sin(a) * 10.5, h: 2.2 + ((i * 7) % 5) * 0.9, broken: i % 3 === 1 };
  }).filter((p) => !(p.x > G.x + 8 && Math.abs(p.z - G.z) < 4)),
  braziers: [
    { x: G.x + 7.6, z: G.z - 5.2 }, { x: G.x + 7.6, z: G.z + 5.2 },
    { x: G.x - 6.4, z: G.z - 6.6 }, { x: G.x - 6.4, z: G.z + 6.6 },
  ],
  boss: { x: G.x - 1.5, z: G.z },
};
export const WAYLIGHTS = [
  { x: 17.6, z: 3.2 }, { x: -12.4, z: 5.8 }, { x: 13.4, z: -26.5 }, { x: -15.6, z: 34.2 },
  { x: -45.5, z: 4.8 }, { x: -74, z: 2.8 }, { x: 52, z: 13.6 }, { x: 9.2, z: -52 },
];

let _layout = null;
// Static world contents. Deterministic for a given seed so client and server agree.
export function buildLayout(seed = 20261111) {
  if (_layout) return _layout;
  const rnd = mulberry32(seed);
  const trees = [], rocks = [], logs = [], shrooms = [], colliders = [], giants = [], crystals = [];
  const cell = 4, occ = new Map();
  const key = (x, z) => Math.floor(x / cell) + ':' + Math.floor(z / cell);
  const near = (x, z, minD) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell), r = Math.ceil(minD / cell);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const list = occ.get((cx + i) + ':' + (cz + j));
      if (!list) continue;
      for (const o of list) if (Math.hypot(o.x - x, o.z - z) < minD + o.r) return true;
    }
    return false;
  };
  const put = (o) => { const k = key(o.x, o.z); if (!occ.has(k)) occ.set(k, []); occ.get(k).push(o); };
  const poiClear = (x, z) => {
    if (Math.hypot(x - C.x, z - C.z) < C.r + 1) return true;
    if (Math.hypot(x - G.x, z - G.z) < G.r) return true;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 2.5) return true;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 7.5) return true;
    return false;
  };

  // --- trees
  for (let i = 0; i < 5200; i++) {
    const x = (rnd() * 2 - 1) * (HALF + 4), z = (rnd() * 2 - 1) * (HALF + 4);
    const dc = Math.hypot(x, z);
    const t = rnd();
    const type = t < 0.3 ? 0 : t < 0.72 ? 1 : 2;
    const r = type === 0 ? 0.85 + rnd() * 0.45 : type === 1 ? 0.45 + rnd() * 0.25 : 0.17 + rnd() * 0.1;
    const dens = fbm(x * 0.03, z * 0.03, 2, 91);
    if (dc < PLAY_R && dens < 0.36 + (type === 0 ? 0.06 : 0)) continue;
    if (poiClear(x, z)) continue;
    const pd = pathDist(x, z);
    if (pd < 1.2 + r * 1.6) continue;
    if (near(x, z, type === 0 ? 4.6 : type === 1 ? 3.2 : 2.0)) continue;
    const o = { x, z, r, type, rot: rnd() * Math.PI * 2, s: 0.85 + rnd() * 0.4, lean: rnd() };
    trees.push(o); put(o);
    colliders.push({ x, z, r: r * (type === 0 ? 1.15 : 1.05) });
  }

  // --- rocks
  for (let i = 0; i < 520; i++) {
    const x = (rnd() * 2 - 1) * HALF, z = (rnd() * 2 - 1) * HALF;
    const big = rnd() < 0.22;
    const r = big ? 1.1 + rnd() * 1.3 : 0.3 + rnd() * 0.55;
    if (poiClear(x, z) && r > 0.5) continue;
    if (pathDist(x, z) < 0.3 + r) continue;
    if (near(x, z, r + 0.6)) continue;
    const o = { x, z, r, type: (rnd() * 3) | 0, rot: rnd() * 6.283, sy: 0.55 + rnd() * 0.5 };
    rocks.push(o); put(o);
    if (r > 0.75) colliders.push({ x, z, r: r * 0.82 });
  }
  // den outcrop ring
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 1.5 + 2.2;
    const x = POIS.den.x + Math.cos(a) * (9 + rnd() * 2), z = POIS.den.z - 4 + Math.sin(a) * (8 + rnd() * 2);
    const r = 2 + rnd() * 1.4;
    rocks.push({ x, z, r, type: (rnd() * 3) | 0, rot: rnd() * 6.283, sy: 0.9 + rnd() * 0.5 });
    colliders.push({ x, z, r: r * 0.8 });
  }

  // --- fallen logs
  for (let i = 0; i < 70; i++) {
    const x = (rnd() * 2 - 1) * PLAY_R, z = (rnd() * 2 - 1) * PLAY_R;
    const len = 3.6 + rnd() * 3.6, r = 0.32 + rnd() * 0.2, rot = rnd() * Math.PI;
    if (poiClear(x, z) || pathDist(x, z) < 1.5 + len * 0.3) continue;
    if (near(x, z, len * 0.5 + 0.4)) continue;
    const o = { x, z, r: len * 0.5, len, rad: r, rot };
    logs.push(o); put(o);
    const dx = Math.cos(rot) * len * 0.5, dz = -Math.sin(rot) * len * 0.5;
    colliders.push({ x1: x - dx, z1: z - dz, x2: x + dx, z2: z + dz, r: r * 0.9 });
    // mushrooms growing along the log
    const n = 1 + ((rnd() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const u = rnd() * 2 - 1;
      shrooms.push({ x: x + dx * u * 0.8 + (rnd() - 0.5) * 0.5, z: z + dz * u * 0.8 + (rnd() - 0.5) * 0.5, s: 0.7 + rnd() * 0.7, rot: rnd() * 6.283, lift: r * 0.9, glow: rnd() < 0.55 });
    }
  }
  // a hero log beside the spawn, like in the key art
  {
    const x = SPAWN.x - 10.4, z = SPAWN.z + 5.2, len = 6.4, r = 0.5, rot = 0.3;
    logs.push({ x, z, r: len / 2, len, rad: r, rot });
    const dx = Math.cos(rot) * len * 0.5, dz = -Math.sin(rot) * len * 0.5;
    colliders.push({ x1: x - dx, z1: z - dz, x2: x + dx, z2: z + dz, r: r * 0.9 });
    for (let k = 0; k < 3; k++) shrooms.push({ x: x + dx * (k - 1) * 0.55, z: z + dz * (k - 1) * 0.55 + 0.25, s: 1.0 + k * 0.15, rot: k * 2.1, lift: 0.42, glow: true });
  }

  // --- mushroom clusters at tree bases
  for (const t of trees) {
    if (t.type === 2 || rnd() > 0.2) continue;
    const a = rnd() * 6.283;
    shrooms.push({ x: t.x + Math.cos(a) * (t.r + 0.35), z: t.z + Math.sin(a) * (t.r + 0.35), s: 0.6 + rnd() * 0.8, rot: rnd() * 6.283, lift: 0, glow: rnd() < 0.5 });
  }
  // --- Glowcap Hollow: giant mushrooms, dense clusters, crystals around the pond
  const H = POIS.hollow;
  for (let i = 0; i < 16; i++) {
    const a = rnd() * 6.283, d = 5 + rnd() * (H.r - 3);
    const x = H.x + Math.cos(a) * d, z = H.z + Math.sin(a) * d;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.5 || pathDist(x, z) < 2.2 || near(x, z, 2.6)) continue;
    const o = { x, z, r: 0.5, s: 2.2 + rnd() * 3.2, rot: rnd() * 6.283 };
    giants.push(o); put(o);
    colliders.push({ x, z, r: 0.28 * o.s * 0.5 + 0.25 });
  }
  for (let i = 0; i < 60; i++) {
    const a = rnd() * 6.283, d = rnd() * (H.r + 4);
    const x = H.x + Math.cos(a) * d, z = H.z + Math.sin(a) * d;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r || pathDist(x, z) < 0.4) continue;
    shrooms.push({ x, z, s: 0.7 + rnd() * 1.1, rot: rnd() * 6.283, lift: 0, glow: true });
  }
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * 6.283 + rnd() * 0.4, d = POND.r * (0.72 + rnd() * 0.3);
    crystals.push({ x: POND.x + Math.cos(a) * d, z: POND.z + Math.sin(a) * d, s: 0.7 + rnd() * 1.3, rot: rnd() * 6.283 });
  }
  for (let i = 0; i < 7; i++) {
    const a = rnd() * 6.283, d = G.r + 1 + rnd() * 3;
    crystals.push({ x: G.x + Math.cos(a) * d, z: G.z + Math.sin(a) * d, s: 0.8 + rnd() * 1.2, rot: rnd() * 6.283 });
  }

  // --- structures
  for (const w of CAMP_WALLS) colliders.push({ x1: w.a[0], z1: w.a[1], x2: w.b[0], z2: w.b[1], r: 0.55 });
  {
    const c = CAMP.column, dx = Math.cos(c.rot) * 1.5, dz = -Math.sin(c.rot) * 1.5;
    colliders.push({ x1: c.x - dx, z1: c.z - dz, x2: c.x + dx, z2: c.z + dz, r: 0.5 });
    colliders.push({ x: CAMP.fire.x, z: CAMP.fire.z, r: 0.7 });
  }
  for (const p of GATE.pillars) colliders.push({ x: p.x, z: p.z, r: 0.85 });
  for (const b of GATE.braziers) colliders.push({ x: b.x, z: b.z, r: 0.5 });
  for (const w of WAYLIGHTS) colliders.push({ x: w.x, z: w.z, r: 0.25 });

  // --- collider grid
  const cgCell = 6, cg = new Map();
  const add = (cx, cz, c) => { const k = cx + ':' + cz; if (!cg.has(k)) cg.set(k, []); cg.get(k).push(c); };
  for (const c of colliders) {
    const minX = (c.x1 !== undefined ? Math.min(c.x1, c.x2) : c.x) - c.r, maxX = (c.x1 !== undefined ? Math.max(c.x1, c.x2) : c.x) + c.r;
    const minZ = (c.z1 !== undefined ? Math.min(c.z1, c.z2) : c.z) - c.r, maxZ = (c.z1 !== undefined ? Math.max(c.z1, c.z2) : c.z) + c.r;
    for (let j = Math.floor(minZ / cgCell); j <= Math.floor(maxZ / cgCell); j++)
      for (let i = Math.floor(minX / cgCell); i <= Math.floor(maxX / cgCell); i++) add(i, j, c);
  }

  // Push a circle (x, z, r) out of every static collider. Returns [x, z].
  function collide(x, z, r) {
    for (let pass = 0; pass < 2; pass++) {
      const list = cg.get(Math.floor(x / cgCell) + ':' + Math.floor(z / cgCell));
      if (list) for (const c of list) {
        let px, pz;
        if (c.x1 !== undefined) {
          const dx = c.x2 - c.x1, dz = c.z2 - c.z1, l2 = dx * dx + dz * dz;
          const t = clamp(((x - c.x1) * dx + (z - c.z1) * dz) / l2, 0, 1);
          px = c.x1 + dx * t; pz = c.z1 + dz * t;
        } else { px = c.x; pz = c.z; }
        let ox = x - px, oz = z - pz;
        const d = Math.hypot(ox, oz), min = r + c.r;
        if (d < min) {
          if (d < 1e-4) { ox = 1; oz = 0; } else { ox /= d; oz /= d; }
          x = px + ox * min; z = pz + oz * min;
        }
      }
    }
    // pond and world edge
    const pd = Math.hypot(x - POND.x, z - POND.z), pr = POND.r * 0.78;
    if (pd < pr) { x = POND.x + (x - POND.x) / pd * pr; z = POND.z + (z - POND.z) / pd * pr; }
    const dc = Math.hypot(x, z);
    if (dc > PLAY_R) { x *= PLAY_R / dc; z *= PLAY_R / dc; }
    return [x, z];
  }
  function blocked(x, z, r) {
    const [nx, nz] = collide(x, z, r);
    return Math.abs(nx - x) + Math.abs(nz - z) > 1e-3;
  }

  _layout = { trees, rocks, logs, shrooms, giants, crystals, colliders, collide, blocked, seed };
  return _layout;
}
