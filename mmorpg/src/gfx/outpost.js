// The Old Palisade: an abandoned checkpoint on the east road. Every prop is a generated model (assets/env);
// this file only stands them where src/shared/world.js (OUTPOST) says they are, so what you see matches what
// the server collides with.
import { THREE, foliage, chunked } from './common.js';
import { propMaterial } from './assets.js';
import { buildPlantCards } from './vegetation.js';
import { heightAt, mulberry32, OUTPOST, outpostAt, POIS } from '../shared/world.js';

export function createOutpost(T, A) {
  const group = new THREE.Group(), fires = [];
  const P = OUTPOST, yaw = P.yaw, rnd = mulberry32(9051);
  const mats = {};
  const mat = (name) => mats[name] || (mats[name] = propMaterial(A.models[name]));
  // One prop at (u, v) of the outpost. ry turns it away from the road direction; sizes are in metres because
  // every model's longest side is one unit. Each model's own orientation is fixed in dev/build_env.py:
  // the palisade and the log pile run along x, the gateway is walked through along z, the cart's shafts and
  // the lean-to's open front point to +z.
  const prop = (name, u, v, { y = 0, rx = 0, ry = 0, rz = 0, s = 1, sx, sy, sz, cast = true, geo = null } = {}) => {
    const p = outpostAt(u, v);
    const mesh = new THREE.Mesh(geo || A.models[name].geo, mat(name));
    mesh.position.set(p.x, heightAt(p.x, p.z) + y, p.z);
    mesh.rotation.set(rx, yaw + ry, rz, 'YXZ');
    mesh.scale.set(sx ?? s, sy ?? s, sz ?? s);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // ---------------- gate and palisade
  prop('gateway', P.gate.u, P.gate.v, { y: -0.25, s: 5.6 });
  for (const w of P.walls) prop('palisade', w.u, w.v, { y: -0.3, ry: w.turn || 0, rx: w.lean || 0, s: 3.25 * (0.95 + rnd() * 0.12), sy: 3.25 * (0.95 + rnd() * 0.2) });
  // stakes that have fallen out of the broken end of the wall
  for (const [u, v, ry, len] of [[1.4, -9.2, 0.5, 3.0], [4.6, -12.4, 1.9, 2.6], [5.8, -9.4, 2.7, 3.2]]) prop('log', u, v, { y: -0.05, ry, sx: 0.75, sy: 0.75, sz: len });

  // ---------------- stores
  {
    // a barrel on its side: the same model laid over and set back on the ground
    const b = A.models.barrel, lying = b.geo.clone();
    lying.translate(0, -b.size[1] / 2, 0).rotateZ(Math.PI / 2).translate(0, b.size[0] / 2, 0);
    for (const it of P.barrels) {
      const s = 1.15 * (it.s || 1);
      if (it.lying) prop('barrel', it.u, it.v, { y: -0.04, ry: it.rot || 0, s, geo: lying });
      else prop('barrel', it.u, it.v, { y: -0.03, ry: rnd() * 6.283, s });
    }
  }
  for (const c of P.crates) { const s = 1.05 * (c.s || 1); prop('crate', c.u, c.v, { y: c.up ? 1.05 * 0.72 : -0.02, ry: c.rot || 0, s }); }
  for (const k of P.planks) prop('planks', k.u, k.v, { y: -0.05, ry: k.rot || 0, s: 1.9, cast: false });
  prop('cart', P.cart.u, P.cart.v, { y: -0.04, ry: P.cart.rot, s: 2.55 });
  prop('leanto', P.leanto.u, P.leanto.v, { y: -0.05, ry: P.leanto.rot, s: 3.1 });
  prop('logpile', P.logpile.u, P.logpile.v, { y: -0.03, ry: P.logpile.rot, s: 2.2 });
  prop('stump', P.block.u, P.block.v, { y: -0.1, ry: 1.3, s: 1.25 });
  for (const m of P.shrooms) prop('shrooms_tan', m.u, m.v, { y: -0.03, ry: rnd() * 6.283, s: 0.62 * m.s, cast: false });
  // mossy stones trodden into the yard
  for (const [u, v, s] of [[-2.6, -3.1, 1.1], [1.6, 3.6, 0.9], [7.4, 2.2, 1.2], [-8.8, -0.9, 1.0], [5.2, -6.4, 1.4], [-5.4, 9.6, 1.3], [9.8, -5.8, 1.1]]) {
    prop('rock', u, v, { y: -0.16 * s, ry: rnd() * 6.283, sx: s * 1.25, sy: s * 0.45, sz: s });
  }

  // ---------------- torches: on posts in the yard and on two of the old trees
  {
    const postGeo = new THREE.CylinderGeometry(0.15, 0.2, 2.9, 9, 3).translate(0, 1.4, 0);
    const postMat = new THREE.MeshStandardMaterial({ map: T.bark, normalMap: T.barkN, roughness: 0.92, color: 0xb8a48c });
    const mount = (x, z, fx, fz, off, top) => {
      // the torch model's back plate is at +z and its head leans toward -z: turn it to face (fx, fz)
      const sc = 1.05, y = heightAt(x, z);
      const m = new THREE.Mesh(A.models.torch.geo, mat('torch'));
      m.position.set(x + fx * (off + 0.3 * sc), y + top - 0.45, z + fz * (off + 0.3 * sc));
      m.rotation.y = Math.atan2(fx, fz) + Math.PI; m.scale.setScalar(sc);
      m.receiveShadow = true;
      group.add(m);
      fires.push({ x: x + fx * (off + 0.52 * sc), y: y + top - 0.45 + 1.0 * sc, z: z + fz * (off + 0.52 * sc), scale: 0.78, color: 0xff9648, intensity: 40, dist: 11.5, kind: 'torch', post: true });
    };
    const face = (x, z) => { const dx = POIS.outpost.x - x, dz = POIS.outpost.z - z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    for (const t of P.torches) {
      const p = outpostAt(t.u, t.v), [fx, fz] = face(p.x, p.z);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(p.x, heightAt(p.x, p.z) - 0.1, p.z); post.rotation.set((rnd() - 0.5) * 0.08, rnd() * 6.283, (rnd() - 0.5) * 0.08);
      post.castShadow = post.receiveShadow = true;
      group.add(post);
      mount(p.x, p.z, fx, fz, 0.15, 2.75);
    }
    for (const i of [0, 2]) {
      const t = P.trees[i], p = outpostAt(t.u, t.v), [fx, fz] = face(p.x, p.z);
      mount(p.x, p.z, fx, fz, t.r * 0.92, 3.1);
    }
  }

  // ---------------- undergrowth that catches the torchlight: leafy shrubs along the wall and round the torches
  {
    const plants = A.cards.plants;
    const shrubMat = foliage(new THREE.MeshLambertMaterial({ map: plants.map, alphaTest: 0.4, side: THREE.DoubleSide }), { wind: 'uv.y * 0.16', noFlip: true });
    const fernMat = shrubMat;
    const shrubs = [], ferns = [], hostas = [];
    const tone = () => [0xc8d8be, 0xb4ccb8, 0xd6d6b4, 0xb8d0c8][(rnd() * 4) | 0];
    const scatter = (u, v, n, r, list, s0, s1) => {
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r, p = outpostAt(u + Math.cos(a) * d, v + Math.sin(a) * d);
        list.push({ x: p.x, y: heightAt(p.x, p.z) - 0.05, z: p.z, ry: rnd() * 6.283, s: s0 + rnd() * (s1 - s0), color: tone() });
      }
    };
    for (const w of P.walls) { scatter(w.u + 1.3, w.v, 3, 1.3, shrubs, 1.3, 2.1); scatter(w.u - 1.2, w.v, 2, 1.2, ferns, 0.9, 1.4); }
    for (const t of P.torches) { scatter(t.u, t.v, 4, 1.9, shrubs, 1.2, 2.0); scatter(t.u, t.v, 3, 2.2, hostas, 0.9, 1.5); }
    for (const t of P.trees) { scatter(t.u, t.v, 5, t.r + 2.2, shrubs, 1.4, 2.3); scatter(t.u, t.v, 4, t.r + 2.6, ferns, 1.0, 1.6); }
    scatter(-8.4, 7.4, 4, 1.8, ferns, 0.9, 1.4); scatter(-7.6, -6.2, 4, 2.0, hostas, 0.9, 1.5); scatter(9.5, -2.5, 5, 2.4, shrubs, 1.2, 1.9);
    group.add(chunked(buildPlantCards(2, plants.cells, 1.2), shrubMat, shrubs, { cast: false, colors: true }));
    group.add(chunked(buildPlantCards(0, plants.cells, 1.15), fernMat, ferns, { cast: false, colors: true }));
    group.add(chunked(buildPlantCards(1, plants.cells, 0.9), fernMat, hostas, { cast: false, colors: true }));
  }

  return { group, fires };
}
