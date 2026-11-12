// Loads the generated environment art in assets/env/ (see dev/build_env.py): prop models lifted from concept
// images, tileable ground textures and foliage cards. Nothing here is drawn in code.
import { THREE } from './common.js';
import { ENV } from './env-manifest.js';
import { CHAR } from './char-manifest.js';
import { parseSkin } from './hero.js';
import { parseAnim, buildClips } from './motion.js';
import { EDITS } from './char-edits.js';

const BASE = (() => { try { return new URL('../../assets/env/', import.meta.url).href; } catch { return 'assets/env/'; } })();
const embedded = () => (typeof window !== 'undefined' && window.NG_ASSETS) || {};

async function bytes(file) {
  const e = embedded()[file];
  if (e) { // single-file build: the asset travels inside the page as a data URI
    const b = atob(e.slice(e.indexOf(',') + 1)), u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u.buffer;
  }
  const r = await fetch(BASE + file);
  if (!r.ok) throw new Error(`could not load ${file} (${r.status})`);
  return r.arrayBuffer();
}

const loader = new THREE.TextureLoader();
function texture(file, { srgb = true, repeat = false, flipY = true, aniso = 4 } = {}) {
  return new Promise((resolve, reject) => {
    loader.load(embedded()[file] || BASE + file, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      t.flipY = flipY;
      t.anisotropy = aniso;
      t.needsUpdate = true;
      resolve(t);
    }, undefined, () => reject(new Error('could not load ' + file)));
  });
}

// .mesh: 'NGM1', header length, JSON header, then quantised blocks (positions and uvs 16 bit, normals 8 bit)
function parseMesh(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x314d474e) throw new Error('not a mesh file');
  const hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl))), off = 8 + hl;
  const n = head.verts, B = head.blocks;
  const qp = new Uint16Array(buf, off + B.pos[0], n * 3), qn = new Int8Array(buf, off + B.nrm[0], n * 4), qt = new Uint16Array(buf, off + B.uv[0], n * 2);
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = head.min[k] + (qp[i * 3 + k] / 65535) * head.size[k];
      nrm[i * 3 + k] = qn[i * 4 + k] / 127;
    }
    uv[i * 2] = head.uvMin[0] + (qt[i * 2] / 65535) * head.uvSize[0];
    uv[i * 2 + 1] = head.uvMin[1] + (qt[i * 2 + 1] / 65535) * head.uvSize[1];
  }
  const idx = head.wide ? new Uint32Array(buf, off + B.idx[0], head.tris * 3) : new Uint16Array(buf, off + B.idx[0], head.tris * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

async function loadModel(name) {
  const d = ENV.models[name];
  const [buf, map, normalMap] = await Promise.all([
    bytes(d.mesh),
    d.map ? texture(d.map, { flipY: false, aniso: 8 }) : null,
    d.normalMap ? texture(d.normalMap, { srgb: false, flipY: false }) : null,
  ]);
  return { geo: parseMesh(buf), map, normalMap, size: d.size, roughness: d.roughness ?? 0.9, alpha: !!d.alpha };
}

// A rigged character: skinned mesh, skeleton, motion clips (packed by dev/build_char.py), the animator's
// edits worked into the clips (char-edits.js), and the sword it carries. The game and dev/animator.html
// both load it through here.
export async function loadChar(name, edits = EDITS[name] || {}) {
  const d = CHAR[name];
  if (!d) return null;
  const [skin, anim, map, normalMap, sword] = await Promise.all([bytes(d.skin), bytes(d.anim), texture(d.map, { flipY: false, aniso: 8 }),
    d.normal ? texture(d.normal, { srgb: false, flipY: false, aniso: 4 }) : null, d.sword && ENV.models.sword ? loadModel('sword') : null]);
  const H = { id: name, ...parseSkin(skin), raw: parseAnim(anim), map, normalMap, sword, meta: d };
  addPieces(H, d);
  applyEdits(H, edits);
  return H;
}
// Equipment is carried on bones of its own, so that a piece can be turned, moved and keyed like any other
// part of the body (in the animator, and by the clips): the sword in the hand, and the same sword across
// the back. A piece's bone hangs from the body bone that carries it and starts where the build mounted it.
function addPieces(H, d) {
  H.pieces = [];
  if (!d.sword || !H.sword) return;
  const S = d.sword;
  const add = (name, parent, at, tip) => {
    H.bones.push({ id: 'b' + H.bones.length, name, parent, t: at.grip.slice(), r: at.quat.slice(), s: [1, 1, 1], piece: true, tip });
    return H.bones.length - 1;
  };
  H.named.sword = add('Sword', H.named.handR, S, [0, -0.55, 0]);          // tip: the way the piece points, in units of its length
  H.named.swordBack = add('SwordBack', H.named.chest, S.back, [0, -0.55, 0]);
  H.pieces.push({ id: 'sword', bone: H.named.sword, when: 'drawn' }, { id: 'swordBack', bone: H.named.swordBack, when: 'sheathed' });
  const ibm = new Float32Array(H.bones.length * 16);
  ibm.set(H.ibm);
  for (const p of H.pieces) ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], p.bone * 16); // nothing is skinned to a piece's bone
  H.ibm = ibm;
}
// (re)build what depends on the edits: the clips, the table of moves, how the sword is held
export function applyEdits(H, edits) {
  const d = H.meta;
  H.edits = edits;
  H.clips = buildClips(H, edits);
  for (const name in H.clips) Object.assign(H.clips[name], d.clips[name] || {});
  H.moves = { ...d.moves, ...(edits.moves || {}) };
  H.sword_ = d.sword ? { ...d.sword, ...(edits.sword || {}) } : null;
  H.params = { ...(d.params || {}), ...(edits.params || {}) };
  return H;
}

// Every model stands on y = 0, centred on x/z, with its longest side one unit long; `size` is its extent in
// those units. The game scales props to metres when it places them.
export async function loadEnv(progress = () => {}) {
  const out = { models: {}, ground: {}, cards: {} };
  const jobs = [];
  const total = Object.keys(ENV.models).length + Object.keys(ENV.ground).length + Object.keys(ENV.cards).length;
  let done = 0;
  const step = () => progress(++done / total);
  for (const name in ENV.models) {
    jobs.push(loadModel(name).then((m) => { out.models[name] = m; step(); }));
  }
  for (const name in ENV.ground) {
    const d = ENV.ground[name];
    jobs.push((async () => {
      const [map, normalMap] = await Promise.all([texture(d.map, { repeat: true, aniso: 8 }), texture(d.normalMap, { srgb: false, repeat: true, aniso: 4 })]);
      out.ground[name] = { map, normalMap };
      step();
    })());
  }
  for (const name in ENV.cards) {
    const d = ENV.cards[name];
    jobs.push((async () => { out.cards[name] = { ...d, map: await texture(d.map, { aniso: 4 }) }; step(); })());
  }
  jobs.push(loadChar('hero').then((H) => { out.hero = H; }));
  await Promise.all(jobs);
  return out;
}

// A lit material for one of the generated props.
export function propMaterial(model, opts = {}) {
  return new THREE.MeshStandardMaterial({ map: model.map, normalMap: model.normalMap, roughness: model.roughness, metalness: 0, alphaTest: model.alpha ? 0.5 : 0, ...opts });
}
