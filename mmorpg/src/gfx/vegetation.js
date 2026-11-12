import { THREE, foliage, chunked, mergeGeos, tint, xform } from './common.js';
import { propMaterial } from './assets.js';
import { mulberry32, heightAt, vnoise, PLAY_R, POND_LEVEL, nearPond, smoothstep } from '../shared/world.js';

// Generic tube along a spine. spine(t) -> [x,y,z], radius(t, angle) -> r, color(t, angle, y, out)
function tube({ spine, radius, segH, segR, uRep = 2, vRep = 4, color = null, ref = [1, 0, 0] }) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), R = new THREE.Vector3(...ref), c = [0, 0, 0];
  for (let i = 0; i <= segH; i++) {
    const t = i / segH;
    const p = spine(t), a = spine(Math.max(0, t - 0.02)), b = spine(Math.min(1, t + 0.02));
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    N.crossVectors(R, T).normalize();
    B.crossVectors(T, N);
    for (let j = 0; j <= segR; j++) {
      const ang = (j / segR) * Math.PI * 2, r = radius(t, ang);
      const dx = N.x * Math.cos(ang) + B.x * Math.sin(ang), dy = N.y * Math.cos(ang) + B.y * Math.sin(ang), dz = N.z * Math.cos(ang) + B.z * Math.sin(ang);
      pos.push(p[0] + dx * r, p[1] + dy * r, p[2] + dz * r);
      nor.push(dx, dy, dz);
      uv.push((j / segR) * uRep, t * vRep);
      if (color) { color(t, ang, p[1] + dy * r, c); col.push(c[0], c[1], c[2]); } else col.push(1, 1, 1);
    }
  }
  const w = segR + 1;
  for (let i = 0; i < segH; i++) for (let j = 0; j < segR; j++) {
    const a = i * w + j, b = a + 1, c2 = a + w, d = c2 + 1;
    idx.push(a, b, c2, b, d, c2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

const barkColor = (t, ang, y, out) => {
  const moss = 1 - smoothstep(0.2, 3.4, y + Math.sin(ang * 3) * 0.6);
  const ao = 0.45 + 0.55 * smoothstep(-0.2, 1.6, y);
  out[0] = (1 - moss * 0.55) * ao; out[1] = (1 + moss * 0.25) * ao; out[2] = (1 - moss * 0.6) * ao;
};

function buildTree(type, rnd) {
  const H = type === 0 ? 30 : type === 1 ? 28 : 24;
  const R0 = type === 0 ? 1.0 : type === 1 ? 0.55 : 0.2;
  const lx = (rnd() - 0.5) * 2, lz = (rnd() - 0.5) * 2, wob = type === 2 ? 1.5 : 0.7, ph = rnd() * 6;
  const spine = (t) => [lx * Math.sin(t * 2.4 + ph) * wob + lx * t * 1.2, t * H, lz * Math.sin(t * 2.0 + ph * 1.7) * wob + lz * t * 1.2];
  const lobes = 4 + ((rnd() * 3) | 0), lp = rnd() * 6;
  const radius = (t, a) => {
    const y = t * H;
    const taper = R0 * (0.52 + 0.48 * Math.pow(1 - t, 0.9));
    const lumps = 1 + 0.09 * Math.sin(a * 3 + y * 0.9 + lp) + 0.05 * Math.sin(a * 7 - y * 1.7);
    const flare = type === 2 ? R0 * 0.5 * Math.exp(-y * 2.2)
      : R0 * 0.95 * Math.exp(-y * (type === 0 ? 0.75 : 1.0)) * (0.35 + 0.65 * Math.pow(Math.max(0, Math.cos(a * lobes * 0.5 + lp)), 2));
    return taper * lumps + flare;
  };
  const parts = [tube({ spine, radius, segH: type === 2 ? 22 : 30, segR: type === 2 ? 7 : 14, uRep: type === 2 ? 1 : 3, vRep: H / 4, color: barkColor })];
  const anchors = [];
  if (type !== 2) {
    // surface roots
    const nr = type === 0 ? 6 : 4;
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * 6.283 + rnd() * 0.7, len = R0 * (2.0 + rnd() * 1.6), r0 = R0 * (0.3 + rnd() * 0.14);
      const cx = Math.cos(a), cz = Math.sin(a), curl = (rnd() - 0.5) * 1.2;
      parts.push(tube({
        spine: (t) => { const d = R0 * 0.55 + len * t; const sw = curl * t * t; return [cx * d - cz * sw, R0 * 0.75 * (1 - t) * (1 - t) - 0.22 * t, cz * d + cx * sw]; },
        radius: (t) => r0 * (1 - t * 0.78), segH: 6, segR: 6, uRep: 1, vRep: 1.5, color: barkColor, ref: [0, 1, 0],
      }));
    }
  }
  // limbs
  const limbs = [];
  const nb = type === 0 ? 4 : type === 1 ? 3 : 2;
  for (let i = 0; i < nb; i++) {
    const y0 = (type === 2 ? 3.6 : 4.4) + i * (type === 2 ? 2.4 : 1.7) + rnd() * 1.2;
    const a = rnd() * 6.283 + i * 1.9, len = (type === 2 ? 2.2 : 3.6) + rnd() * 2.2, rise = 0.8 + rnd() * 2.2;
    const s0 = spine(y0 / H), cx = Math.cos(a), cz = Math.sin(a), r0 = R0 * (type === 2 ? 0.45 : 0.24);
    limbs.push(tube({
      spine: (t) => [s0[0] + cx * (R0 * 0.4 + len * t), y0 + rise * Math.sqrt(t), s0[2] + cz * (R0 * 0.4 + len * t)],
      radius: (t) => r0 * (1 - t * 0.7), segH: 5, segR: 5, uRep: 1, vRep: 1.5, color: null, ref: [0, 1, 0],
    }));
    anchors.push({ x: s0[0] + cx * (R0 * 0.4 + len), y: y0 + rise, z: s0[2] + cz * (R0 * 0.4 + len), size: (type === 2 ? 1.5 : 2.3) + rnd() * 1.1 });
  }
  return { geo: mergeGeos(parts.concat(limbs)), limbs: mergeGeos(limbs), anchors, R0, H };
}

function buildLeafCluster(rnd, n = 11) {
  const pos = [], nor = [], uv = [], idx = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    c.set(rnd() - 0.5, (rnd() - 0.5) * 0.7, rnd() - 0.5).multiplyScalar(1.1);
    e.set((rnd() - 0.5) * 2.2, rnd() * 6.283, (rnd() - 0.5) * 1.2);
    q.setFromEuler(e);
    const s = 0.75 + rnd() * 0.5, b = pos.length / 3;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      v.set(x * s * 0.6, 0, y * s * 0.6).applyQuaternion(q).add(c);
      pos.push(v.x, v.y, v.z);
      nn.copy(v).normalize().multiplyScalar(0.75); nn.y += 0.55; nn.normalize();
      nor.push(nn.x, nn.y, nn.z);
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

function buildShroomCluster(rnd, glow) {
  const parts = [];
  const n = 5 + ((rnd() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, d = i === 0 ? 0 : 0.08 + rnd() * 0.24, h = 0.12 + rnd() * 0.3 * (i === 0 ? 1.5 : 1), r = 0.05 + h * 0.34;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, tilt = (rnd() - 0.5) * 0.5;
    const stem = new THREE.CylinderGeometry(r * 0.22, r * 0.3, h, 5, 1, true);
    tint(stem, glow ? 0x3f8fd8 : 0xb7a48c);
    xform(stem, { x, y: h / 2, z });
    const cap = new THREE.SphereGeometry(r, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.62, 1);
    tint(cap, 0xffffff, (c, px, py) => {
      const k = py / (r * 0.62);
      if (glow) c.setRGB(0.02 + 0.08 * k, 0.13 + 0.25 * k, 0.78 + 0.3 * k); else c.setRGB(0.5 - 0.2 * k, 0.26 - 0.1 * k, 0.16 - 0.06 * k);
    });
    xform(cap, { x: x + tilt * 0.03, y: h - 0.01, z, rz: tilt });
    // glowing gills / dark underside disc
    const under = new THREE.CircleGeometry(r * 0.98, 9).rotateX(Math.PI / 2);
    tint(under, glow ? 0x5fb8ff : 0x2a1c14);
    xform(under, { x: x + tilt * 0.03, y: h - 0.012, z, rz: tilt });
    parts.push(stem, cap, under);
  }
  return mergeGeos(parts);
}

function buildGiantShroom(rnd) {
  const h = 1, lean = (rnd() - 0.5) * 0.25;
  const stem = tube({
    spine: (t) => [lean * t * t, t * h, 0], radius: (t) => 0.075 + 0.05 * Math.pow(1 - t, 2) + 0.012 * Math.sin(t * 9),
    segH: 8, segR: 8, color: (t, a, y, o) => { const k = 0.25 + t * 0.75; o[0] = 0.16 * k; o[1] = 0.6 * k; o[2] = 0.85 * k; },
  });
  const pts = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI * 0.5; pts.push(new THREE.Vector2(Math.sin(a) * 0.46 + 0.001, Math.cos(a) * 0.2)); }
  const cap = new THREE.LatheGeometry(pts, 16);
  tint(cap, 0xffffff, (c, x, y, z) => {
    const rr = Math.hypot(x, z) / 0.46, spot = Math.pow(vnoise(x * 14, z * 14, 5), 3) * 1.1;
    c.setRGB(0.012 + rr * rr * 0.07 + spot * 0.25, 0.09 + rr * rr * 0.36 + spot * 0.75, 0.18 + rr * rr * 0.55 + spot);
  });
  xform(cap, { x: lean, y: h - 0.02 });
  const gill = new THREE.CircleGeometry(0.455, 16).rotateX(Math.PI / 2);
  tint(gill, 0xffffff, (c, x, y, z) => { const rr = Math.hypot(x, z) / 0.455; c.setRGB(0.25 + rr * 0.3, 0.8 + rr * 0.2, 1.25); });
  xform(gill, { x: lean, y: h - 0.02 });
  for (const g of [stem, cap, gill]) { if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); }
  return mergeGeos([stem, cap, gill]);
}

// Two upright painted cards crossed at right angles: one cell of the plants atlas, standing on its bottom edge.
export function buildPlantCards(cell, cells, size) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI / 2 + 0.4, cx = Math.cos(a), cz = Math.sin(a), b = pos.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const x = (u - 0.5) * size;
      pos.push(cx * x, v * size, cz * x);
      nor.push(cx * (u - 0.5) * 0.6, 1, cz * (u - 0.5) * 0.6);
      uv.push((cell + u) / cells, v);
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

function buildFlower() {
  const pos = [], col = [], idx = [];
  const blooms = [[0, 0.3, 0], [0.09, 0.22, 0.05], [-0.07, 0.25, -0.06]];
  for (const [bx, by, bz] of blooms) {
    let b = pos.length / 3;
    pos.push(bx * 0.4, 0, bz * 0.4, bx * 0.4 + 0.012, 0, bz * 0.4, bx, by, bz);
    col.push(0.02, 0.07, 0.04, 0.02, 0.07, 0.04, 0.05, 0.16, 0.1);
    idx.push(b, b + 1, b + 2);
    b = pos.length / 3;
    pos.push(bx, by + 0.012, bz); col.push(0.8, 1.15, 1.6);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.283, a2 = a + 0.42;
      pos.push(bx + Math.cos(a) * 0.065, by, bz + Math.sin(a) * 0.065, bx + Math.cos(a2) * 0.03, by + 0.008, bz + Math.sin(a2) * 0.03);
      col.push(0.16, 0.4, 1.15, 0.35, 0.6, 1.25);
      idx.push(b, b + 1 + i * 2, b + 2 + i * 2);
      idx.push(b, b + 2 + i * 2, b + 1 + ((i + 1) % 5) * 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildCrystal(rnd) {
  const parts = [];
  const n = 4 + ((rnd() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const h = i === 0 ? 1.5 : 0.5 + rnd() * 0.8, r = (i === 0 ? 0.24 : 0.1 + rnd() * 0.1);
    const g = new THREE.CylinderGeometry(r * 0.08, r, h, 6, 1);
    tint(g, 0xffffff, (c, x, y) => { const k = (y + h / 2) / h; c.setRGB(0.04 + k * 0.22, 0.25 + k * 0.45, 0.8 + k * 0.4); });
    const a = rnd() * 6.283, d = i === 0 ? 0 : 0.2 + rnd() * 0.25;
    xform(g, { x: Math.cos(a) * d, y: h * 0.42, z: Math.sin(a) * d, rx: (rnd() - 0.5) * (i === 0 ? 0.2 : 0.9), rz: (rnd() - 0.5) * (i === 0 ? 0.2 : 0.9) });
    parts.push(g);
  }
  return mergeGeos(parts);
}

export function createVegetation(layout, maps, T, quality, A) {
  const group = new THREE.Group();
  const rnd = mulberry32(777);
  const glowLights = []; // candidate positions for the pooled point lights

  // ---------------- trees
  // The big trees stand on generated trunk models: a thick base with buttress roots (tree_a) and a slender
  // leaning trunk with sprawling roots (tree_b). A model ends a few metres up, where the game dissolves trunks
  // into the dark canopy anyway; the part above the roots is stretched so the cut top always sits above that fade.
  const mkBark = (fade) => foliage(new THREE.MeshStandardMaterial({ map: T.bark, normalMap: T.barkN, vertexColors: true, roughness: 0.94, normalScale: new THREE.Vector2(1.3, 1.3) }), { fade });
  const barkMat = mkBark([6.5, 8.8]), thinBarkMat = mkBark([8, 10.5]);
  const TRUNK_TOP = 11;
  // r: trunk radius of the model, rootTop: where its roots end (both in model units)
  const trunks = [{ model: A.models.tree_a, r: 0.185, rootTop: 0.2, stretch: 2.6 }, { model: A.models.tree_b, r: 0.062, rootTop: 0.2, stretch: 1.15 }].map((d) => {
    const geo = d.model.geo.clone(), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > d.rootTop) p.setY(i, d.rootTop + (y - d.rootTop) * d.stretch); }
    geo.computeBoundingSphere();
    return { ...d, geo, h: d.rootTop + (d.model.size[1] - d.rootTop) * d.stretch, mat: foliage(propMaterial(d.model), { fade: [6.5, 8.8] }) };
  });
  // the painted leaf clumps are dense, so they dissolve lower than the trunks do: the canopy must not hide the fight
  const leafMat = foliage(new THREE.MeshLambertMaterial({ map: T.leaf, alphaTest: 0.42, side: THREE.DoubleSide }), { wind: '0.22', fade: [4.4, 7.0], ghost: 1, noFlip: true });
  const canopyMat = new THREE.MeshBasicMaterial({ map: T.leaf, alphaTest: 0.42, side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
  const leafGeo = [buildLeafCluster(rnd), buildLeafCluster(rnd, 13)];
  const leafItems = [[], []], canopyItems = [[], []];
  // the leaf card is already painted green: these only vary it a little from clump to clump
  const leafTones = [0xa4bea6, 0x92b0a2, 0xb0ba9a, 0x8cb0a8, 0xb6be9e];
  for (let type = 0; type < 3; type++) {
    for (let v = 0; v < 2; v++) {
      const tree = buildTree(type, rnd);
      const items = [], trunkItems = [];
      const trunk = type < 2 ? trunks[type] : null;
      layout.trees.forEach((t, i) => {
        if (t.type !== type || i % 2 !== v) return;
        const y = heightAt(t.x, t.z) - 0.35;
        const sxz = t.r / tree.R0;
        items.push({ x: t.x, y, z: t.z, ry: t.rot, sx: sxz, sy: t.s, sz: sxz });
        if (trunk) {
          const k = t.r / trunk.r;
          trunkItems.push({ x: t.x, y: y + 0.2, z: t.z, ry: t.rot * 3.1 + i, sx: k, sy: Math.max(k, TRUNK_TOP / trunk.h), sz: k });
        }
        const cs = Math.cos(t.rot), sn = Math.sin(t.rot);
        const inPlay = Math.hypot(t.x, t.z) < PLAY_R + 14;
        if (inPlay && type !== 2) for (const a of tree.anchors) {
          const lx = a.x * sxz, lz = a.z * sxz;
          const wx = t.x + lx * cs + lz * sn, wz = t.z - lx * sn + lz * cs;
          const s = a.size * (0.85 + rnd() * 0.4);
          leafItems[(rnd() * 2) | 0].push({ x: wx, y: y + a.y * t.s, z: wz, ry: rnd() * 6.283, sx: s, sy: s * 0.62, sz: s, color: leafTones[(rnd() * leafTones.length) | 0] });
        }
        // invisible canopy that only exists to break the moonlight into shafts and dapples
        const nc = type === 0 ? 2 : type === 1 ? (rnd() < 0.6 ? 2 : 1) : (rnd() < 0.4 ? 1 : 0);
        for (let k = 0; k < nc; k++) {
          const a = rnd() * 6.283, d = rnd() * (type === 0 ? 7 : 5), s = (type === 0 ? 5.6 : type === 1 ? 4.6 : 3.4) * (0.8 + rnd() * 0.5);
          canopyItems[(rnd() * 2) | 0].push({ x: t.x + Math.cos(a) * d, y: y + 27 + rnd() * 6, z: t.z + Math.sin(a) * d, ry: rnd() * 6.283, sx: s, sy: s * 0.5, sz: s });
        }
      });
      if (trunk) {
        group.add(chunked(trunk.geo, trunk.mat, trunkItems));
        group.add(chunked(tree.limbs, barkMat, items)); // the boughs the leaf clumps hang from
      } else group.add(chunked(tree.geo, thinBarkMat, items));
    }
  }
  for (let v = 0; v < 2; v++) {
    group.add(chunked(leafGeo[v], leafMat, leafItems[v], { colors: true }));
    group.add(chunked(leafGeo[v], canopyMat, canopyItems[v], { receive: false }));
  }

  // ---------------- rocks, stumps & logs (generated models)
  {
    const rock = A.models.rock, stump = A.models.stump, log = A.models.log;
    const rocks = [], stumps = [];
    for (const r of layout.rocks) {
      const y = heightAt(r.x, r.z);
      if (r.type === 2 && r.r < 1.5) stumps.push({ x: r.x, y: y - 0.12, z: r.z, ry: r.rot, s: r.r * 2.7 });
      else { const sy = r.r * r.sy * 2.5; rocks.push({ x: r.x, y: y - sy * 0.13, z: r.z, ry: r.rot, sx: r.r * 2.15, sy, sz: r.r * 2.15 * (0.8 + (r.rot % 1) * 0.4) }); }
    }
    group.add(chunked(rock.geo, propMaterial(rock), rocks));
    group.add(chunked(stump.geo, propMaterial(stump), stumps));
    // the model lies along z; a layout log runs along its own x
    const logs = layout.logs.map((l) => ({ x: l.x, y: heightAt(l.x, l.z) - l.rad * 0.25, z: l.z, ry: l.rot + Math.PI / 2, sx: l.rad * 5.6, sy: l.rad * 5.6, sz: l.len * 1.05 }));
    group.add(chunked(log.geo, propMaterial(log), logs));
  }

  // ---------------- mushrooms
  const dullMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  {
    // glowing clusters are a generated model whose painted caps also light themselves
    const m = A.models.mushrooms;
    const mat = new THREE.MeshStandardMaterial({ map: m.map, normalMap: m.normalMap, roughness: 0.6, emissive: 0xffffff, emissiveMap: m.map, emissiveIntensity: 1.25 });
    const items = layout.shrooms.filter((s) => s.glow).map((s) => ({ x: s.x, y: heightAt(s.x, s.z) + s.lift - 0.05, z: s.z, ry: s.rot, s: s.s * 0.8 }));
    group.add(chunked(m.geo, mat, items, { cast: false }));
  }
  for (let v = 0; v < 2; v++) {
    const items = layout.shrooms.filter((s, i) => !s.glow && i % 2 === v).map((s) => ({ x: s.x, y: heightAt(s.x, s.z) + s.lift - 0.02, z: s.z, ry: s.rot, s: s.s * 1.5 }));
    group.add(chunked(buildShroomCluster(rnd, false), dullMat, items, { cast: false }));
  }
  layout.shrooms.forEach((s, i) => { if (s.glow && s.s > 0.95 && i % 3 === 0) glowLights.push({ x: s.x, y: heightAt(s.x, s.z) + s.lift + 0.45, z: s.z, color: 0x3fa8ff, intensity: 2.2 * s.s, dist: 7 }); });
  {
    const items = layout.giants.map((g) => ({ x: g.x, y: heightAt(g.x, g.z) - 0.1, z: g.z, ry: g.rot, s: g.s }));
    const gm = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0.85, 0.85, 0.85), side: THREE.DoubleSide });
    group.add(chunked(buildGiantShroom(rnd), gm, items, { cast: true }));
    for (const g of layout.giants) glowLights.push({ x: g.x, y: heightAt(g.x, g.z) + g.s * 0.8, z: g.z, color: 0x35c8ff, intensity: 5 * g.s, dist: 12 + g.s * 2 });
  }
  {
    const cm = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.0, 1.0, 1.0) });
    const items = layout.crystals.map((c) => ({ x: c.x, y: (nearPond(c.x, c.z) ? Math.max(heightAt(c.x, c.z), POND_LEVEL - 0.3) : heightAt(c.x, c.z)) - 0.1, z: c.z, ry: c.rot, s: c.s }));
    group.add(chunked(buildCrystal(rnd), cm, items, { cast: false }));
    for (const c of layout.crystals) glowLights.push({ x: c.x, y: heightAt(c.x, c.z) + 0.9, z: c.z, color: 0x4f9cff, intensity: 5 * c.s, dist: 10 });
  }

  // ---------------- undergrowth
  const ferns = [[], []], broad = [[], []], bushes = [[], []], flowers = [];
  const R = PLAY_R + 10;
  const nUnder = Math.round(9000 * quality.undergrowth);
  for (let i = 0; i < nUnder; i++) {
    const x = (rnd() * 2 - 1) * R, z = (rnd() * 2 - 1) * R;
    const d = maps.dens(x, z);
    if (d < 0.12) continue;
    const y = heightAt(x, z), k = rnd();
    const tone = [0xb8ccb2, 0xa0bcaa, 0xc4c8a8, 0xa4c0b8][(rnd() * 4) | 0];
    if (k < 0.5) ferns[i % 2].push({ x, y: y - 0.04, z, ry: rnd() * 6.283, s: 0.7 + rnd() * 0.7, color: tone });
    else if (k < 0.86) broad[i % 2].push({ x, y: y - 0.04, z, ry: rnd() * 6.283, s: 0.7 + rnd() * 0.6, color: tone });
    else { const s = 0.9 + rnd() * 0.9; bushes[i % 2].push({ x, y: y + s * 0.35, z, ry: rnd() * 6.283, sx: s, sy: s * 0.6, sz: s, color: leafTones[(rnd() * leafTones.length) | 0] }); }
  }
  // moonpetal flowers grow in drifts
  for (let i = 0; i < 26000 * quality.undergrowth; i++) {
    const x = (rnd() * 2 - 1) * R, z = (rnd() * 2 - 1) * R;
    if (vnoise(x * 0.09, z * 0.09, 303) < 0.63 || maps.dens(x, z) < 0.1) continue;
    flowers.push({ x, y: heightAt(x, z) + 0.12 + rnd() * 0.25, z, ry: rnd() * 6.283, s: 0.9 + rnd() * 0.9 });
  }
  // ferns, broad-leaved plants and sprigs are painted cards (assets/env/plants.webp), two crossed per plant
  const plants = A.cards.plants;
  const fernMat = foliage(new THREE.MeshLambertMaterial({ map: plants.map, alphaTest: 0.4, side: THREE.DoubleSide }), { wind: 'uv.y * 0.2', noFlip: true });
  const plantGeo = [buildPlantCards(0, plants.cells, 1.15), buildPlantCards(1, plants.cells, 0.9), buildPlantCards(2, plants.cells, 1.2)];
  const bushMat = foliage(new THREE.MeshLambertMaterial({ map: T.leaf, alphaTest: 0.42, side: THREE.DoubleSide }), { wind: '0.1', noFlip: true });
  for (let v = 0; v < 2; v++) {
    group.add(chunked(plantGeo[0], fernMat, ferns[v], { cast: false, colors: true }));
    group.add(chunked(plantGeo[1 + v], fernMat, broad[v], { cast: false, colors: true }));
    group.add(chunked(leafGeo[v], bushMat, bushes[v], { cast: false, colors: true }));
  }
  const flowerMat = foliage(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), { wind: 'position.y * 0.5' });
  group.add(chunked(buildFlower(), flowerMat, flowers, { cast: false, receive: false }));

  return { group, glowLights };
}
