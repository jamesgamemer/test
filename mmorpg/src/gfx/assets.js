// Loads the generated environment art in assets/env/ (see dev/build_env.py): prop models lifted from concept
// images, tileable ground textures and foliage cards. Nothing here is drawn in code.
import { THREE } from './common.js';
import { ENV } from './env-manifest.js';

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

// Every model stands on y = 0, centred on x/z, with its longest side one unit long; `size` is its extent in
// those units. The game scales props to metres when it places them.
export async function loadEnv(progress = () => {}) {
  const out = { models: {}, ground: {}, cards: {} };
  const jobs = [];
  const total = Object.keys(ENV.models).length + Object.keys(ENV.ground).length + Object.keys(ENV.cards).length;
  let done = 0;
  const step = () => progress(++done / total);
  for (const name in ENV.models) {
    const d = ENV.models[name];
    jobs.push((async () => {
      const [buf, map, normalMap] = await Promise.all([
        bytes(d.mesh),
        d.map ? texture(d.map, { flipY: false, aniso: 8 }) : null,
        d.normalMap ? texture(d.normalMap, { srgb: false, flipY: false }) : null,
      ]);
      out.models[name] = { geo: parseMesh(buf), map, normalMap, size: d.size, roughness: d.roughness ?? 0.9 };
      step();
    })());
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
  await Promise.all(jobs);
  return out;
}

// A lit material for one of the generated props.
export function propMaterial(model, opts = {}) {
  return new THREE.MeshStandardMaterial({ map: model.map, normalMap: model.normalMap, roughness: model.roughness, metalness: 0, ...opts });
}
