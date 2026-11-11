import { THREE, patch, mergeGeos, xform } from './common.js';
import { propMaterial } from './assets.js';
import { mulberry32, heightAt, POIS, CAMP, GATE, WAYLIGHTS } from '../shared/world.js';

// Box with chamfered edges; face normals blend across the bevel so blocks read as worn stone.
function chamferBox(bev = 0.07) {
  const pos = [], nor = [], uv = [], idx = [], map = new Map();
  const others = [[1, 2], [0, 2], [0, 1]];
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) for (const u of [-1, 1]) for (const v of [-1, 1]) {
    const [b, c] = others[a], p = [0, 0, 0], n = [0, 0, 0], sg = [0, 0, 0];
    p[a] = s * 0.5; p[b] = u * (0.5 - bev); p[c] = v * (0.5 - bev); n[a] = s;
    sg[a] = s; sg[b] = u; sg[c] = v;
    map.set(a + ':' + sg.join(','), pos.length / 3);
    pos.push(...p); nor.push(...n); uv.push(u * 0.5 + 0.5, v * 0.5 + 0.5);
  }
  const V = (a, sg) => map.get(a + ':' + sg.join(','));
  const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const tri = (i, j, k) => {
    const A = P(i), B = P(j), C = P(k);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const out = nx * (A[0] + B[0] + C[0]) + ny * (A[1] + B[1] + C[1]) + nz * (A[2] + B[2] + C[2]);
    if (out >= 0) idx.push(i, j, k); else idx.push(i, k, j);
  };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
    const [b, c] = others[a];
    const g = (u, v) => { const sg = [0, 0, 0]; sg[a] = s; sg[b] = u; sg[c] = v; return V(a, sg); };
    quad(g(-1, -1), g(1, -1), g(1, 1), g(-1, 1));
  }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const c = 3 - a - b;
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const g = (ax, sc) => { const sg = [0, 0, 0]; sg[a] = sa; sg[b] = sb; sg[c] = sc; return V(ax, sg); };
      quad(g(a, -1), g(a, 1), g(b, 1), g(b, -1));
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) tri(V(0, [sx, sy, sz]), V(1, [sx, sy, sz]), V(2, [sx, sy, sz]));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

class Blocks {
  constructor() { this.m = []; this.c = []; }
  add(matrix, color) { this.m.push(matrix.clone()); this.c.push(color); }
  box(x, y, z, sx, sy, sz, ry = 0, color = 0x9a9890, rx = 0, rz = 0) {
    this.add(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz)), color);
  }
  build(geo, mat) {
    const mesh = new THREE.InstancedMesh(geo, mat, this.m.length);
    const c = new THREE.Color();
    this.m.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.set(this.c[i])); });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

const STONES = [0x8f8d86, 0x9d9a90, 0x85847f, 0xa39f92, 0x7b7c7a, 0x979285, 0x8a8f8c];
// The camp ruin is assembled from generated models (assets/env): wall pieces, a column, rubble and torches.
// Paving, the campfire ring and the Sentinel's Gate are still built from blocks, textured with generated stone.
export function createRuins(T, A) {
  const group = new THREE.Group();
  const rnd = mulberry32(31337);
  const fires = [], lamps = [];
  const C = POIS.camp, G = POIS.gate;

  const stoneMat = new THREE.MeshStandardMaterial({ map: T.stone, normalMap: T.stoneN, roughness: 0.86, normalScale: new THREE.Vector2(1.2, 1.2) });
  patch(stoneMat, (s) => {
    s.vertexShader = s.vertexShader.replace('#include <uv_vertex>', `
      #include <uv_vertex>
      #ifdef USE_INSTANCING
        vec2 bo_ = fract(vec2(instanceMatrix[3].x * 0.371 + instanceMatrix[3].y * 0.713, instanceMatrix[3].z * 0.533 + instanceMatrix[3].y * 0.291));
        vMapUv = vMapUv * 0.55 + bo_;
        vNormalMapUv = vNormalMapUv * 0.55 + bo_;
      #endif`);
  });
  const woodMat = new THREE.MeshStandardMaterial({ map: T.bark, roughness: 0.9, color: 0x9a8468 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.55, metalness: 0.7 });
  const box = chamferBox(0.07);

  // one generated prop, standing on the ground at (x, z); sizes are in metres because every model's longest
  // side is one unit (how each model is oriented is noted in dev/build_env.py)
  const mats = {};
  const prop = (name, { x, z, y = 0, rx = 0, ry = 0, rz = 0, s = 1, sx, sy, sz }) => {
    const m = A.models[name];
    const mesh = new THREE.Mesh(m.geo, mats[name] || (mats[name] = propMaterial(m)));
    mesh.position.set(x, heightAt(x, z) + y, z);
    mesh.rotation.set(rx, ry, rz, 'YXZ');
    mesh.scale.set(sx ?? s, sy ?? s, sz ?? s);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // ---------------- camp
  const blocks = new Blocks();
  {
    // The walls stand on the lines of CAMP_WALLS, which the server also uses for collision.
    // Back wall: two window pieces with their tall ends meeting in the middle, stepping down to either side.
    const zb = C.z - 5;
    prop('ruin_arch', { x: C.x - 3.35, z: zb, y: -0.25, ry: Math.PI / 2, sx: 3.8, sy: 5.9, sz: 6.0 });
    prop('ruin_arch', { x: C.x + 2.0, z: zb, y: -0.25, ry: -Math.PI / 2, sx: 3.8, sy: 5.5, sz: 5.6 });
    // Corners: the piece's two arms run along +x and +z from its corner, which sits 0.43 units from its centre.
    const sl = 3.9, sr = 4.7;
    prop('ruin_corner', { x: C.x - 8 + 0.43 * sl, z: zb + 0.43 * sl, y: -0.2, s: sl });
    prop('ruin_corner', { x: C.x + 6.5 - 0.43 * sr, z: zb + 0.43 * sr, y: -0.2, ry: -Math.PI / 2, s: sr });
  }
  const campY = heightAt(C.x, C.z);
  // flagstones
  for (let i = 0; i < 70; i++) {
    const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 8.5;
    const x = C.x - 0.5 + Math.cos(a) * d, z = C.z - 0.6 + Math.sin(a) * d * 0.62;
    if (z < C.z - 4.3 || x > C.x + 5.8 || x < C.x - 7.3) continue;
    const s = 0.7 + rnd() * 0.7;
    blocks.box(x, heightAt(x, z) - 0.07 + rnd() * 0.04, z, s, 0.2, s * (0.7 + rnd() * 0.5), rnd() * 6.283, [0x77756f, 0x6c6b68, 0x7f7c73][(rnd() * 3) | 0], (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06);
  }
  // fallen masonry lying where the walls came down
  for (const [dx, dz, sc, ry] of [[-9.3, -0.2, 1.7, 0.3], [-6.2, 2.6, 1.3, 1.9], [0.8, 3.6, 1.15, 2.6], [7.7, 3.6, 1.6, 0.9], [-10.6, -3.6, 1.8, 0.2], [7.1, 1.3, 1.45, 4.0]]) {
    prop('rubble', { x: C.x + dx, z: C.z + dz, y: -0.1, ry, s: sc });
  }
  group.add(blocks.build(box, stoneMat));
  // fallen column, and the drum it broke off still standing
  {
    const col = CAMP.column;
    prop('column', { x: col.x, z: col.z, y: -0.07, ry: col.rot + Math.PI / 2, sx: 1.9, sy: 1.9, sz: 3.3 });
    // the model lies along z: tipped upright, its moulded base ring ends up at the bottom
    prop('column', { x: col.x + 3.3, z: col.z - 1.9 - 0.46, y: 0.6, rx: Math.PI / 2, ry: 0.4, sx: 1.9, sy: 1.9, sz: 1.3 });
  }
  // wall torches: the model's back plate is at +z and its head leans toward -z
  for (const t of CAMP.torches) {
    const face = t.face || 0, fx = Math.sin(face), fz = Math.cos(face), sc = 1.05;
    const y = t.y - 0.45;
    prop('torch', { x: t.x + fx * 0.3 * sc, z: t.z + fz * 0.3 * sc, y, ry: face + Math.PI, s: sc }).castShadow = false;
    fires.push({ x: t.x + fx * 0.52 * sc, y: heightAt(t.x, t.z) + y + 1.0 * sc, z: t.z + fz * 0.52 * sc, scale: 0.85, color: 0xff8a3a, intensity: 62, dist: 17, kind: 'torch', face });
  }
  // campfire
  {
    const f = CAMP.fire, y = heightAt(f.x, f.z);
    const ring = new Blocks();
    for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283; ring.box(f.x + Math.cos(a) * 0.62, y + 0.08, f.z + Math.sin(a) * 0.62, 0.34, 0.24, 0.26, -a + 1.57, STONES[i % STONES.length], 0, (rnd() - 0.5) * 0.3); }
    group.add(ring.build(box, stoneMat));
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.95, 6), woodMat);
      l.position.set(f.x, y + 0.22, f.z); l.rotation.set(0, i * 0.8, 1.1, 'YXZ'); l.castShadow = true;
      group.add(l);
    }
    fires.push({ x: f.x, y: y + 0.42, z: f.z, scale: 1.25, color: 0xff7a2a, intensity: 52, dist: 14, kind: 'campfire' });
    // seats: two short logs by the fire
    for (const [dx, dz, r] of [[-1.7, 0.5, 0.4], [1.4, 1.2, 1.9]]) prop('log', { x: f.x + dx, z: f.z + dz, y: -0.04, ry: r + Math.PI / 2, sx: 1.2, sy: 1.2, sz: 1.7 });
  }
  // merchant's corner: crates, barrel, lantern
  {
    const m = CAMP.merchant, y = heightAt(m.x, m.z);
    const crate = new THREE.BoxGeometry(1, 1, 1);
    for (const [dx, dz, s, r, up] of [[1.2, -0.5, 0.75, 0.2, 0], [1.9, 0.3, 0.6, 0.9, 0], [1.3, -0.45, 0.5, 0.6, 0.62], [-1.0, -1.1, 0.65, 0.4, 0]]) {
      const c = new THREE.Mesh(crate, woodMat);
      c.scale.setScalar(s); c.position.set(m.x + dx, y + s / 2 + up, m.z + dz); c.rotation.y = r; c.castShadow = c.receiveShadow = true;
      group.add(c);
    }
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.85, 10), woodMat);
    barrel.position.set(m.x - 1.4, y + 0.42, m.z + 0.2); barrel.castShadow = true;
    group.add(barrel);
    const lan = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.18), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.7) }));
    lan.position.set(m.x + 1.3, y + 1.25, m.z - 0.45);
    group.add(lan);
    lamps.push({ x: lan.position.x, y: lan.position.y + 0.2, z: lan.position.z, color: 0xffb060, intensity: 14, dist: 12 });
  }

  // ---------------- way-lights along the roads
  {
    const postGeo = mergeGeos([
      xform(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 6), { y: 1.3 }),
      xform(new THREE.BoxGeometry(0.07, 0.07, 0.7), { y: 2.5, z: 0.3 }),
      xform(new THREE.BoxGeometry(0.03, 0.3, 0.03), { y: 2.33, z: 0.58 }),
    ]);
    const lanGeo = new THREE.BoxGeometry(0.2, 0.28, 0.2);
    const lanMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.8, 0.65) });
    WAYLIGHTS.forEach((w, i) => {
      const y = heightAt(w.x, w.z), r = i * 1.7;
      const p = new THREE.Mesh(postGeo, woodMat); p.position.set(w.x, y - 0.1, w.z); p.rotation.y = r; p.castShadow = true;
      const l = new THREE.Mesh(lanGeo, lanMat); l.position.set(w.x + Math.sin(r) * 0.58, y + 2.0, w.z + Math.cos(r) * 0.58);
      group.add(p, l);
      lamps.push({ x: l.position.x, y: l.position.y, z: l.position.z, color: 0xffa550, intensity: 24, dist: 13, flicker: 0.12 });
    });
  }

  // ---------------- Sentinel's Gate
  {
    const gb = new Blocks();
    const gy = heightAt(G.x, G.z);
    // radial paving
    for (let ring = 0; ring < 7; ring++) {
      const r = 1.2 + ring * 1.55, n = Math.max(6, Math.round(r * 3.4));
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.1 + ring * 0.035) continue;
        const a = (i / n) * 6.283 + ring * 0.37, x = G.x + Math.cos(a) * r, z = G.z + Math.sin(a) * r;
        gb.box(x, heightAt(x, z) - 0.05 + rnd() * 0.03, z, 1.45, 0.22, (6.283 * r) / n - 0.06, -a, [0x6f6f72, 0x66676c, 0x77767a, 0x5e6066][(rnd() * 4) | 0], (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.04);
      }
    }
    for (const p of GATE.pillars) {
      const y = heightAt(p.x, p.z);
      gb.box(p.x, y + 0.2, p.z, 1.7, 0.5, 1.7, 0.2, 0x8a8a8c);
      const drums = Math.round(p.h / 0.7);
      for (let k = 0; k < drums; k++) gb.box(p.x + (rnd() - 0.5) * 0.06, y + 0.8 + k * 0.7, p.z + (rnd() - 0.5) * 0.06, 1.15, 0.69, 1.15, rnd() * 0.3, STONES[(rnd() * STONES.length) | 0], p.broken && k === drums - 1 ? 0.12 : 0, 0);
      if (!p.broken) gb.box(p.x, y + 0.75 + drums * 0.7, p.z, 1.5, 0.3, 1.5, 0.1, 0x9a9a98);
      else for (let k = 0; k < 3; k++) { const a = rnd() * 6.283, d = 1.5 + rnd() * 1.5; gb.box(p.x + Math.cos(a) * d, heightAt(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d) + 0.25, p.z + Math.sin(a) * d, 1.0, 0.6, 0.9, rnd() * 3, 0x86868a, rnd() * 0.5, rnd() * 0.5); }
    }
    // western arch
    for (const s of [-1, 1]) for (let k = 0; k < 9; k++) gb.box(G.x - 11.6, gy + 0.3 + k * 0.6, G.z + s * 2.3, 1.4, 0.59, 1.3, (rnd() - 0.5) * 0.06, STONES[(rnd() * STONES.length) | 0]);
    for (let k = 0; k < 7; k++) { const a = Math.PI * (k + 0.5) / 7; gb.box(G.x - 11.6, gy + 5.5 + Math.sin(a) * 1.5, G.z + Math.cos(a) * 2.5, 1.45, 0.62, 1.15, 0, 0x9c9a94, -(a - Math.PI / 2), 0); }
    group.add(gb.build(box, stoneMat));
    // rune circle
    const rune = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.85, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.9, 1.6), transparent: true, opacity: 0.85, depthWrite: false }));
    rune.position.set(G.x - 1.5, gy + 0.13, G.z);
    const rune2 = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.12, 6).rotateX(-Math.PI / 2), rune.material);
    rune2.position.copy(rune.position);
    group.add(rune, rune2);
    for (const b of GATE.braziers) {
      const y = heightAt(b.x, b.z);
      const stand = new THREE.Mesh(mergeGeos([
        xform(new THREE.CylinderGeometry(0.1, 0.24, 1.1, 8), { y: 0.55 }),
        xform(new THREE.CylinderGeometry(0.48, 0.2, 0.34, 10), { y: 1.25 }),
      ]), ironMat);
      stand.position.set(b.x, y, b.z); stand.castShadow = true;
      group.add(stand);
      fires.push({ x: b.x, y: y + 1.55, z: b.z, scale: 1.0, color: 0x49b6ff, intensity: 70, dist: 22, kind: 'brazier', blue: true });
    }
  }

  return { group, fires, lamps };
}
