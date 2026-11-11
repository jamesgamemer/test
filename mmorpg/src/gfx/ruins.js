import { THREE, patch, foliage, mergeGeos, xform } from './common.js';
import { mulberry32, heightAt, vnoise, smoothstep, POIS, CAMP_WALLS, CAMP, GATE, WAYLIGHTS } from '../shared/world.js';

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
const WIN = { half: 0.95, sill: 1.25, spring: 3.25 };

function buildWall(w, blocks, ivy, rnd) {
  const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx);
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux; // n = local +z rotated: for ang=0 → (0, 1)
  let baseY = 1e9;
  for (let i = 0; i <= 8; i++) baseY = Math.min(baseY, heightAt(w.a[0] + dx * i / 8, w.a[1] + dz * i / 8));
  baseY -= 0.3;
  const frame = new THREE.Matrix4().compose(new THREE.Vector3(w.a[0], baseY, w.a[1]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0)), new THREE.Vector3(1, 1, 1));
  const local = (u, y, z, sx, sy, sz, rz = 0, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(u, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), new THREE.Vector3(sx, sy, sz)).premultiply(frame);
  const uw = w.window ? L * w.window : -99;
  const top = (u) => {
    const t = u / L, n = Math.floor(vnoise(u * 0.9, w.seed * 7.3, w.seed) * 3.2) * 0.5;
    let h = w.decay ? w.h * (1 - 0.74 * smoothstep(0.12, 1, t)) - n * 0.7 : w.h * (0.45 + 0.55 * smoothstep(0.02, 0.3, t)) - n;
    if (w.window && Math.abs(u - uw) < 2.3) h = Math.max(h, WIN.spring + 2.25 - Math.abs(u - uw) * 0.25);
    return h;
  };
  const ch = 0.5;
  for (let c = 0; c * ch < w.h + 0.6; c++) {
    const y0 = c * ch, y1 = y0 + ch, yc = y0 + ch / 2;
    // opening interval for this course
    let o0 = 1e9, o1 = -1e9;
    if (w.window && y1 > WIN.sill && y0 < WIN.spring + 1.65) {
      const half = y0 <= WIN.spring ? WIN.half : Math.sqrt(Math.max(0, 3.61 - (y0 - WIN.spring) ** 2)) - WIN.half;
      if (half > 0.02) { o0 = uw - half; o1 = uw + half; }
    }
    let u = -(c % 2) * 0.45 - rnd() * 0.25;
    while (u < L) {
      let bl = 0.8 + rnd() * 0.65, s = Math.max(0, u), e = Math.min(L, u + bl);
      const place = (s, e) => {
        if (e - s < 0.22) return;
        const uc = (s + e) / 2;
        if (yc > top(uc)) return;
        const th = 0.92 + rnd() * 0.12;
        blocks.add(local(uc, yc, (rnd() - 0.5) * 0.06, e - s - 0.025, ch - 0.02, th, (rnd() - 0.5) * 0.012, (rnd() - 0.5) * 0.03), STONES[(rnd() * STONES.length) | 0]);
      };
      if (e > o0 && s < o1) { place(s, Math.min(e, o0)); if (e > o1) place(o1, e); }
      else place(s, e);
      u += bl;
    }
  }
  // window dressing
  if (w.window) {
    const fc = 0xb5b0a2;
    blocks.add(local(uw, WIN.sill - 0.08, 0.04, WIN.half * 2 + 0.9, 0.24, 1.18), fc);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) blocks.add(local(uw + s * (WIN.half + 0.2), WIN.sill + 0.29 + k * 0.5, 0.02, 0.42, 0.49, 1.08), fc);
      const cx = uw - s * WIN.half;
      for (let k = 0; k < 5; k++) {
        const th = ((k + 0.5) / 5) * (Math.PI / 3), R = 2.12;
        const a = s > 0 ? th : Math.PI - th;
        blocks.add(local(cx + Math.cos(a) * R, WIN.spring + Math.sin(a) * R, 0.02, 0.46, 0.44, 1.08, a + Math.PI / 2), fc);
      }
      // tracery
      blocks.add(local(uw + s * 0.42, WIN.spring + 0.48, 0, 0.1, 1.1, 0.16, -s * 0.52), 0xa8a396);
    }
    blocks.add(local(uw, (WIN.sill + WIN.spring) / 2 + 0.1, 0, 0.11, WIN.spring - WIN.sill + 0.2, 0.18), 0xa8a396);
    blocks.add(local(uw, WIN.spring + 1.72, 0.02, 0.5, 0.5, 1.1, Math.PI / 4), fc);
  }
  // rubble at the foot
  for (let i = 0; i < L * 1.3; i++) {
    const u = rnd() * (L + 2) - 1, side = rnd() < 0.5 ? -1 : 1, off = 0.8 + rnd() * 2.2;
    const s = 0.3 + rnd() * 0.55;
    blocks.add(local(u, 0.3 + s * 0.2, side * off, s * (1 + rnd() * 0.6), s * 0.8, s, rnd() * 0.6 - 0.3, rnd() * 3), STONES[(rnd() * STONES.length) | 0]);
  }
  // ivy sheets: both faces, thicker on top and around the window
  const nIvy = Math.round(L * 5.5);
  for (let i = 0; i < nIvy; i++) {
    let u = rnd() * L, t = top(u);
    if (w.window && rnd() < 0.55) u = uw + (rnd() - 0.5) * 5.5;
    t = top(u);
    if (t < 0.6) continue;
    const y = t * (0.35 + 0.65 * Math.pow(rnd(), 0.6)), side = rnd() < 0.72 ? 1 : -1;
    if (w.window && Math.abs(u - uw) < WIN.half && y > WIN.sill && y < WIN.spring + 1.2) continue;
    const s = 0.7 + rnd() * 0.8;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(u, y, side * 0.56), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side > 0 ? 0 : Math.PI, rnd() * 6.283)), new THREE.Vector3(s, s, s)).premultiply(frame);
    ivy.add(m, [0x5f7a36, 0x506c34, 0x6c7e3a, 0x446638][(rnd() * 4) | 0]);
  }
  // ivy draped over the top edge
  for (let i = 0; i < L * 1.6; i++) {
    const u = rnd() * L, t = top(u);
    if (t < 1) continue;
    const s = 0.8 + rnd() * 0.7;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(u, t + 0.12, (rnd() - 0.5) * 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + (rnd() - 0.5) * 0.5, 0, rnd() * 6.283)), new THREE.Vector3(s, s, s)).premultiply(frame);
    ivy.add(m, [0x5f7a36, 0x506c34, 0x6c7e3a][(rnd() * 3) | 0]);
  }
  return { nx, nz };
}

function buildIvyPatch(rnd) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < 7; i++) {
    const cx = (rnd() - 0.5) * 0.9, cy = (rnd() - 0.5) * 0.9, cz = rnd() * 0.12, a = rnd() * 6.283, s = 0.3 + rnd() * 0.25, tilt = (rnd() - 0.5) * 0.7;
    const b = pos.length / 3;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = (x * Math.cos(a) - y * Math.sin(a)) * s, py = (x * Math.sin(a) + y * Math.cos(a)) * s;
      pos.push(cx + px, cy + py, cz + px * tilt * 0.4);
      nor.push(0.0, 0.35, 0.94);
      uv.push(x * 0.5 + 0.5, y * 0.5 + 0.5);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function createRuins(T) {
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
  const plainStone = new THREE.MeshStandardMaterial({ map: T.stone, normalMap: T.stoneN, roughness: 0.86, color: 0xa9a59a });
  const woodMat = new THREE.MeshStandardMaterial({ map: T.bark, roughness: 0.9, color: 0x9a8468 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.55, metalness: 0.7 });
  const box = chamferBox(0.07);

  // ---------------- camp
  const blocks = new Blocks(), ivy = new Blocks();
  for (const w of CAMP_WALLS) buildWall(w, blocks, ivy, rnd);
  const campY = heightAt(C.x, C.z);
  // flagstones
  for (let i = 0; i < 70; i++) {
    const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 8.5;
    const x = C.x - 0.5 + Math.cos(a) * d, z = C.z - 0.6 + Math.sin(a) * d * 0.62;
    if (z < C.z - 4.3 || x > C.x + 5.8 || x < C.x - 7.3) continue;
    const s = 0.7 + rnd() * 0.7;
    blocks.box(x, heightAt(x, z) - 0.07 + rnd() * 0.04, z, s, 0.2, s * (0.7 + rnd() * 0.5), rnd() * 6.283, [0x77756f, 0x6c6b68, 0x7f7c73][(rnd() * 3) | 0], (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06);
  }
  // scattered fallen blocks, as in the key art
  for (const [dx, dz, s, ry, tilt] of [[-9.2, -0.2, 0.95, 0.3, 0.1], [-8.4, 1.2, 0.8, 1.1, 0.4], [-9.8, 2.6, 0.7, 2.2, 0.2], [-6.2, 2.4, 0.75, 0.6, 0.5], [0.8, 3.4, 0.7, 2.6, 0.15], [7.6, 3.6, 0.9, 0.9, 0.3], [5.2, 4.8, 0.6, 1.9, 0.6], [-10.4, -3.2, 1.0, 0.2, 0.0], [-9.6, -4.4, 0.9, 0.5, 0.0]]) {
    const x = C.x + dx, z = C.z + dz;
    blocks.box(x, heightAt(x, z) + s * 0.28, z, s * 1.25, s * 0.7, s * 0.9, ry, STONES[(rnd() * STONES.length) | 0], tilt * 0.4, tilt * 0.5);
  }
  group.add(blocks.build(box, stoneMat));
  const ivyMat = foliage(new THREE.MeshLambertMaterial({ map: T.leaf, alphaTest: 0.4, side: THREE.DoubleSide }), { wind: '0.03', noFlip: true });
  const ivyMesh = ivy.build(buildIvyPatch(rnd), ivyMat);
  ivyMesh.castShadow = false;
  group.add(ivyMesh);

  // fallen column + standing stump
  {
    const col = CAMP.column, y = heightAt(col.x, col.z);
    const shaft = new THREE.CylinderGeometry(0.44, 0.48, 3.1, 14, 3).toNonIndexed();
    shaft.computeVertexNormals();
    const cap = new THREE.CylinderGeometry(0.62, 0.5, 0.26, 14).toNonIndexed(); cap.computeVertexNormals(); cap.translate(0, 1.66, 0);
    const base = new THREE.BoxGeometry(1.15, 0.3, 1.15).toNonIndexed(); base.translate(0, 1.92, 0);
    const g = mergeGeos([shaft, cap, base]);
    const m = new THREE.Mesh(g, plainStone);
    m.position.set(col.x, y + 0.44, col.z);
    m.rotation.set(0, col.rot, Math.PI / 2 + 0.03, 'YXZ');
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.9, 14).toNonIndexed(), plainStone);
    stump.geometry.computeVertexNormals();
    stump.position.set(col.x + 3.3, heightAt(col.x + 3.3, col.z - 1.9) + 0.4, col.z - 1.9);
    stump.rotation.set(0.06, 0.4, -0.05);
    stump.castShadow = stump.receiveShadow = true;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.28, 1.25), plainStone);
    plinth.position.set(stump.position.x, stump.position.y - 0.5, stump.position.z); plinth.rotation.y = 0.4;
    plinth.castShadow = plinth.receiveShadow = true;
    group.add(stump, plinth);
  }
  // wall torches
  for (const t of CAMP.torches) {
    const y = heightAt(t.x, t.z) + t.y, face = t.face || 0;
    const g = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.5), ironMat); arm.position.set(0, -0.32, 0.1);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.72, 6), woodMat); stick.position.set(0, -0.18, 0.34); stick.rotation.x = 0.3;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.06, 0.16, 8), ironMat); cup.position.set(0, 0.18, 0.44); cup.rotation.x = 0.3;
    g.add(arm, stick, cup);
    g.position.set(t.x, y, t.z); g.rotation.y = face;
    group.add(g);
    const fx = t.x + Math.sin(face) * 0.48, fz = t.z + Math.cos(face) * 0.48;
    fires.push({ x: fx, y: y + 0.52, z: fz, scale: 0.85, color: 0xff8a3a, intensity: 95, dist: 26, kind: 'torch' });
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
    fires.push({ x: f.x, y: y + 0.42, z: f.z, scale: 1.25, color: 0xff7a2a, intensity: 80, dist: 24, kind: 'campfire' });
    // seats
    for (const [dx, dz, r] of [[-1.7, 0.5, 0.4], [1.4, 1.2, 1.9]]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.5, 8).rotateZ(Math.PI / 2), woodMat);
      s.position.set(f.x + dx, heightAt(f.x + dx, f.z + dz) + 0.18, f.z + dz); s.rotation.y = r; s.castShadow = s.receiveShadow = true;
      group.add(s);
    }
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
      lamps.push({ x: l.position.x, y: l.position.y, z: l.position.z, color: 0xffa550, intensity: 34, dist: 18, flicker: 0.12 });
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
