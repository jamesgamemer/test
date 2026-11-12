// Nightglade Animator: pose and animate a rigged character on top of its motion clips.
// It works on the same data the game plays (motion.js): every change is an edit laid over a clip - for the
// whole clip, at keyed moments, or on every clip - so the library's motion is never overwritten, and the game
// plays exactly what is shown here. `window.animator` exposes the same operations to scripts.
import { THREE } from '../gfx/common.js';
import { loadChar, applyEdits } from '../gfx/assets.js';
import { HeroActor } from '../gfx/hero.js';
import { CHAR } from '../gfx/char-manifest.js';
import { EDITS } from '../gfx/char-edits.js';
import { poseAt, editAt, posAt, qmul, qinv, qnorm, clipOf, reduceKeys, bakeKeyed, helperBone } from '../gfx/motion.js';

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const isId = (q) => !q || Math.abs(q[0]) + Math.abs(q[1]) + Math.abs(q[2]) < 1e-6;
const DEG = Math.PI / 180;
const LOOK = { id: 'ember', cloak: 0x333a8a, trim: 0xf0b07a, blade: 0xffa45c, tunic: 0x45362f, ramp: null };
const CLIP_TH = { ease: 'ยืนสบาย (ท่าปกติ)', idle: 'ยืนตั้งท่า (ถือดาบ)', stand: 'ยืนมองรอบ', run: 'วิ่ง', sprint: 'พุ่ง', slash: 'ฟัน 1', charged: 'ฟันย้อน / คลื่น', chop: 'สับลง', spin: 'หมุนฟัน', cast: 'ร่าย', collect: 'เก็บของ', flinch: 'สะดุ้ง', dead: 'ล้ม' };
const SIDE = (n, th) => (/^left/i.test(n) ? th + 'ซ้าย' : /^right/i.test(n) ? th + 'ขวา' : th);
const BONE_TH = (n) => {
  const k = n.replace(/^(left|right)/i, '').toLowerCase();
  const map = { hips: 'สะโพก', spine02: 'เอว', spine01: 'ลำตัว', spine: 'อก', neck: 'คอ', head: 'หัว', shoulder: 'ไหปลาร้า', arm: 'ต้นแขน', forearm: 'ปลายแขน', hand: 'มือ', upleg: 'ต้นขา', leg: 'แข้ง', foot: 'เท้า', toebase: 'ปลายเท้า', sword: 'ดาบ (ในมือ)', swordback: 'ดาบ (สะพายหลัง)' };
  return SIDE(n, map[k] || n);
};
const ACTIONS = [['atk.0', 'ฟัน 1'], ['atk.1', 'ฟัน 2'], ['atk.2', 'ฟัน 3'], ['atk.3', 'ฟันคลื่น'], ['cast', 'ร่าย'], ['ult', 'ไม้ตาย'], ['gather', 'เก็บของ'], ['hit', 'โดนตี']];

// ---------------------------------------------------------------- scene
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x10151f);
scene.add(new THREE.HemisphereLight(0xe6ecff, 0x4a4238, 1.9));
const sun = new THREE.DirectionalLight(0xfff2e0, 2.1); sun.position.set(2.5, 5, 3.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 }); scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x252c3a, roughness: 1 })); ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(28, 28, 0x40506e, 0x242e42); grid.position.y = 0.002; scene.add(grid);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
const cam = { yaw: 0.45, pitch: 0.14, dist: 4.8, target: new THREE.Vector3(0, 0.95, 0) };
const VIEWS = { front: [0, 0.06, 4.8], side: [Math.PI / 2, 0.06, 4.8], back: [Math.PI, 0.06, 4.8], top: [0, 1.5, 6], face: [0.2, 0.04, 1.9], game: [0.2, 0.8, 24] };

// ---------------------------------------------------------------- state
const A = { id: null, H: null, E: {}, clip: 'ease', t: 0, playing: false, speed: 1, scope: 'clip', sel: -1, mode: 'pose', ik: true, showSword: false, manual: false, dirty: false, rings: true, local: true, snap: false };
let actor = null, ghost = null, game = null, rest = null, handles = [], undo = [], redo = [], clipboard = null, db = null, downloads = null, assets = null;
const Q = new Float32Array(96 * 4), P = [0, 0, 0], PP = new Float32Array(96 * 3);
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const fps = () => A.H.raw.fps;
const clipInfo = (name = A.clip) => clipOf(A.H, name);
const clipNames = () => [...new Set([...Object.keys(A.E.made || {}), ...Object.keys(A.H.raw.clips), ...Object.keys(A.E.keyed || {})])].filter((n) => clipOf(A.H, n)); // in a steady order: a clip keeps its place when it is turned into keys
const hidden = helperBone;
const idx = (name) => A.H.bones.findIndex((b) => b.name === name);

function status(text, kind = '') { const s = $('#status'); s.textContent = text; s.className = kind; }

// ---------------------------------------------------------------- loading a character
async function open(id) {
  status('กำลังโหลด…');
  const saved = await loadSaved(id);
  const E = saved ? saved.edits : JSON.parse(JSON.stringify(EDITS[id] || {}));
  const H = A.H = await loadChar(id, E);
  if (new URLSearchParams(location.search).get('blank')) { H.raw.clips = {}; for (const k of ['clips', 'made', 'keyed']) delete E[k]; applyEdits(H, E); } // for trying the tool on a character that has no motion yet
  A.id = id; A.E = E; A.sel = -1; A.t = 0; undo = []; redo = [];
  const bare = !Object.keys(H.raw.clips).length && !Object.keys(E.keyed || {}).length;
  if (bare) { E.keyed = { idle: { dur: 2, loop: true, keys: [restKey(0)] } }; applyEdits(H, E); }
  if (!clipInfo(A.clip)) A.clip = clipInfo('idle') ? 'idle' : clipNames()[0];
  // the rest pose: every bone's world rotation with nothing played (the frame the angle sliders work in)
  rest = { q: [], pq: [] };
  H.bones.forEach((b, i) => { rest.q[i] = b.parent >= 0 ? qmul(rest.q[b.parent], b.r) : b.r.slice(); rest.pq[i] = b.parent >= 0 ? rest.q[b.parent] : [0, 0, 0, 1]; });
  for (const o of [actor, ghost, game]) if (o) scene.remove(o.group);
  actor = new HeroActor(H, LOOK); scene.add(actor.group);
  ghost = new HeroActor(H, LOOK, { npc: { robe: 0x4a2f5e } });
  ghost.mesh.material = new THREE.MeshBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.22, depthWrite: false });
  ghost.mesh.castShadow = false; ghost.group.visible = false; scene.add(ghost.group);
  game = null;
  buildHandles(); buildClipList(); buildBoneList(); buildMoves(); buildSword(); buildQuick(); setMode(bare ? 'keys' : 'pose'); selectClip(A.clip);
  status(saved ? 'โหลดงานที่บันทึกไว้ (' + saved.from + ')' : 'พร้อม', 'ok');
  A.dirty = false;
}

// ---------------------------------------------------------------- pose
function pose(target, edits) {
  const H = A.H;
  poseAt(H, edits, A.clip, A.t, Q, null, PP);
  target.bones.forEach((b, i) => { b.quaternion.set(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]); b.position.set(PP[i * 3], PP[i * 3 + 1], PP[i * 3 + 2]); });
  target.group.updateMatrixWorld(true);
}
function showSword(a, inHand) {
  if (!a.sword) return;
  const set = (m, on) => { m.visible = on; m.castShadow = on; m.material.userData.u.uShow.value = 1; };
  set(a.sword, inHand); set(a.sheathed, !inHand);
}
function refresh() {
  if (A.mode === 'game' || !actor) return;
  pose(actor, A.E); showSword(actor, A.showSword);
  if (ghost.group.visible) pose(ghost, null);
  placeHandles(); syncInspector(); syncTimeline();
  if (A.mode === 'keys') syncKeysTab();
}

// ---------------------------------------------------------------- the layers of an edit
const fpsSnap = (t) => Math.round(t * fps()) / fps();
function layer(scope, create) {
  const E = A.E;
  if (scope === 'all') { if (!E.all && create) E.all = { rot: {} }; return E.all; }
  if (!E.clips && create) E.clips = {};
  let L = E.clips && E.clips[A.clip];
  if (!L && create) L = E.clips[A.clip] = { rot: {}, keys: [] };
  if (scope === 'clip' || !L) return L;
  if (!L.keys && create) L.keys = [];
  let k = (L.keys || []).find((key) => Math.abs(key.t - A.t) < 0.5 / fps());
  if (!k && create) k = addKey();
  return k;
}
// the keyed part of this clip's layer at the current time, for one bone
const keyedNow = (boneName) => { const L = A.E.clips && A.E.clips[A.clip]; return (L && L.keys && L.keys.length && editAt(A.H, { clips: { [A.clip]: { keys: L.keys } } }, A.clip, A.t, boneName)) || [0, 0, 0, 1]; };
function addKey() {
  const L = layer('clip', true); if (!L.keys) L.keys = [];
  const t = fpsSnap(A.t); let k = L.keys.find((key) => Math.abs(key.t - t) < 0.5 / fps());
  if (k) return k;
  // a new key starts as what the keys already give at this moment, so adding one changes nothing by itself
  const names = new Set(); for (const key of L.keys) for (const n in key.rot || {}) names.add(n);
  k = { t, rot: {} };
  for (const n of names) { const q = keyedNow(n); if (!isId(q)) k.rot[n] = q.map(r5); }
  const moved = new Set(); for (const key of L.keys) { for (const n in key.pos || {}) moved.add(n); if (key.hips) moved.add(A.H.bones[A.H.named.hips].name); }
  for (const n of moved) { const v = posAt(A.H, { clips: { [A.clip]: { keys: L.keys } } }, A.clip, A.t, n); if (v && (v[0] || v[1] || v[2])) { if (!k.pos) k.pos = {}; k.pos[n] = v.map(r5); } }
  L.keys.push(k); L.keys.sort((a, b) => a.t - b.t);
  return k;
}
// ---- a keyed clip: its own poses at moments in time (scope 'abs' edits these, not something laid over them)
const KD = (name = A.clip) => (A.E.keyed && A.E.keyed[name]) || null;
function rebake(name = A.clip) { if (!A.H.keyed) A.H.keyed = {}; const K = KD(name); if (K) A.H.keyed[name] = bakeKeyed(A.H, name, K); else delete A.H.keyed[name]; }
// a whole pose as a key: the model as it was bound...
function restKey(t) {
  const k = { t: r4(t), q: {}, p: {} };
  A.H.bones.forEach((b) => { if (!hidden(b.name)) k.q[b.name] = b.r.map(r4); });
  const h = A.H.bones[A.H.named.hips]; k.p[h.name] = h.t.map(r4);
  return k;
}
// ...or a clip as it stands at one moment (with what is laid over that clip, but not the posture laid over all)
function fullKey(t, at = t, clip = A.clip, edits = { ...A.E, all: null }) {
  const n = A.H.bones.length, q = new Float32Array(n * 4), p = new Float32Array(n * 3), k = restKey(t);
  poseAt(A.H, edits, clip, at, q, null, p);
  A.H.bones.forEach((b, i) => {
    if (hidden(b.name)) return;
    k.q[b.name] = [0, 1, 2, 3].map((j) => r4(q[i * 4 + j]));
    if (i === A.H.named.hips || Math.abs(p[i * 3] - b.t[0]) + Math.abs(p[i * 3 + 1] - b.t[1]) + Math.abs(p[i * 3 + 2] - b.t[2]) > 1e-4) k.p[b.name] = [0, 1, 2].map((j) => r4(p[i * 3 + j]));
  });
  return k;
}
const keyNear = (keys, t) => keys.find((key) => Math.abs(key.t - t) < 0.5 / fps());
// the clip's own key at the current time; made on demand as the pose the clip has there, so adding one changes nothing
function absKey(create) {
  const K = KD(); if (!K) return null;
  const t = fpsSnap(A.t); let k = keyNear(K.keys, t);
  if (!k && create) {
    const full = fullKey(t, t, A.clip, null); k = { t: r4(t), q: {}, p: {} };
    const qs = new Set(), ps = new Set(); for (const key of K.keys) { for (const n in key.q || {}) qs.add(n); for (const n in key.p || {}) ps.add(n); }
    for (const n of qs) if (full.q[n]) k.q[n] = full.q[n];
    for (const n of ps) if (full.p[n]) k.p[n] = full.p[n];
    K.keys.push(k); K.keys.sort((a, b) => a.t - b.t); rebake();
  }
  return k;
}
const pureQ = (i) => { poseAt(A.H, null, A.clip, A.t, Q, null, PP); return [Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]]; };
const pureP = (i) => { poseAt(A.H, null, A.clip, A.t, Q, null, PP); return [PP[i * 3], PP[i * 3 + 1], PP[i * 3 + 2]]; };
const getDelta = (scope, name) => {
  if (scope === 'abs') { const k = absKey(false); return (k && k.q && k.q[name]) || pureQ(idx(name)); }
  const L = layer(scope, false); return (L && L.rot && L.rot[name]) || [0, 0, 0, 1];
};
function setDelta(scope, name, q) {
  q = q[3] < 0 ? q.map((v) => -v) : q;
  if (scope === 'abs') { const k = absKey(true); if (!k) return; if (!k.q) k.q = {}; k.q[name] = q.map(r4); rebake(); A.dirty = true; return; }
  const L = layer(scope, true); if (!L.rot) L.rot = {};
  if (isId(q)) delete L.rot[name]; else L.rot[name] = q.map(r5);
  A.dirty = true;
}
// a bone's position: in scope 'abs' its own place in the key, otherwise what the layer adds to it
const hipsName = () => A.H.bones[A.H.named.hips].name;
const getPos = (scope, name) => {
  if (scope === 'abs') { const k = absKey(false); return (k && k.p && k.p[name]) || pureP(idx(name)); }
  const L = layer(scope, false); return (L && ((L.pos && L.pos[name]) || (name === hipsName() && L.hips))) || [0, 0, 0];
};
function setPos(scope, name, v) {
  A.dirty = true;
  if (scope === 'abs') { const k = absKey(true); if (!k) return; if (!k.p) k.p = {}; k.p[name] = v.map(r4); rebake(); return; }
  const L = layer(scope, true); if (!L.pos) L.pos = {};
  if (name === hipsName()) delete L.hips; // the old spelling
  if (Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]) < 1e-6) delete L.pos[name]; else L.pos[name] = v.map(r5);
}
// what the layers outside the active one add (they are laid on after it)
function outer(scope, name) {
  if (scope === 'abs') return editAt(A.H, A.E, A.clip, A.t, name) || [0, 0, 0, 1];
  if (scope === 'key') return [0, 0, 0, 1];
  const k = keyedNow(name);
  return scope === 'clip' ? k : qmul(k, getDelta('clip', name));
}
// turn bone i by a rotation given in world space
function rotateWorld(i, R) {
  const bone = actor.bones[i], name = A.H.bones[i].name;
  const Pw = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const X = Pw.clone().invert().multiply(R).multiply(Pw);
  const pre = outer(A.scope, name), cur = getDelta(A.scope, name);
  setDelta(A.scope, name, qnorm(qmul(qmul(qmul(qinv(pre), [X.x, X.y, X.z, X.w]), pre), cur)));
  pose(actor, A.E);
}
// move bone i (the hips, or a piece such as the sword) by a world-space offset in metres
function moveBone(i, d) {
  const bone = actor.bones[i], name = A.H.bones[i].name;
  const m = new THREE.Matrix4().copy(bone.parent.matrixWorld).invert(), v = d.clone().transformDirection(m).multiplyScalar(d.length() / bone.parent.getWorldScale(new THREE.Vector3()).x);
  const p = getPos(A.scope, name);
  setPos(A.scope, name, [p[0] + v.x, p[1] + v.y, p[2] + v.z]);
  pose(actor, A.E);
}
const moveHips = (d) => moveBone(A.H.named.hips, d);
const movable = (i) => i === A.H.named.hips || !!A.H.bones[i].piece;

// ---------------------------------------------------------------- handles: what can be clicked and dragged
function buildHandles() {
  const H = A.H, N = H.named; handles = [];
  const kids = H.bones.map(() => []); H.bones.forEach((b, i) => { if (b.parent >= 0) kids[b.parent].push(i); });
  pose(actor, null);
  const chains = {}; for (const e of [N.handL, N.handR, N.footL, N.footR]) { const m = H.bones[e].parent; chains[e] = [H.bones[m].parent, m, e]; }
  H.bones.forEach((b, i) => {
    if (hidden(b.name)) return;
    const piece = b.piece ? H.pieces.find((q) => q.bone === i) : null;
    const h = { bone: i, select: i, tip: null, piece, drag: i === N.hips || piece ? { type: 'move', bone: i } : chains[i] ? { type: 'ik', chain: chains[i], aim: b.parent } : b.parent > 0 ? { type: 'aim', bone: b.parent } : null, pos: new THREE.Vector3() };
    handles.push(h);
    if (piece) { // its far end: along the way the piece points, half its length out
      const len = (swordNow().length || 1) / actor.bones[i].getWorldScale(new THREE.Vector3()).x;
      handles.push({ bone: i, select: i, piece, tip: new THREE.Vector3(...(b.tip || [0, -0.5, 0])).multiplyScalar(len), drag: { type: 'aim', bone: i }, pos: new THREE.Vector3() });
    } else if (!kids[i].some((k) => !hidden(H.bones[k].name) && !H.bones[k].piece)) {
      // a bone with nothing after it gets a handle at its far end, so it can be aimed too
      const bone = actor.bones[i], at = bone.getWorldPosition(new THREE.Vector3()), from = bone.parent.getWorldPosition(new THREE.Vector3());
      const helper = kids[i].find((k) => /end/i.test(H.bones[k].name));
      const tipW = helper !== undefined ? actor.bones[helper].getWorldPosition(new THREE.Vector3()) : /foot|toe/i.test(b.name) ? at.clone().add(new THREE.Vector3(0, 0, 0.09 * H.scale)) : at.clone().add(at.clone().sub(from).normalize().multiplyScalar(0.11 * H.scale));
      handles.push({ bone: i, select: i, tip: bone.worldToLocal(tipW.clone()), drag: { type: 'aim', bone: i }, pos: new THREE.Vector3() });
    }
  });
  const n = handles.length;
  if (buildHandles.pts) { scene.remove(buildHandles.pts, buildHandles.lines, buildHandles.sel); }
  const dot = (size, color) => new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)), new THREE.PointsMaterial({ size, color, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0.95 }));
  const pts = buildHandles.pts = dot(9, 0xffe9a8), sel = buildHandles.sel = dot(15, 0x6fb4ff);
  sel.geometry.setDrawRange(0, 1);
  const lines = buildHandles.lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3)), new THREE.LineBasicMaterial({ color: 0xffe9a8, depthTest: false, transparent: true, opacity: 0.5 }));
  for (const o of [lines, pts, sel]) { o.renderOrder = 20; o.frustumCulled = false; scene.add(o); }
}
function placeHandles() {
  const pts = buildHandles.pts.geometry.attributes.position, ln = buildHandles.lines.geometry.attributes.position, v = new THREE.Vector3();
  handles.forEach((h, k) => {
    const bone = actor.bones[h.bone];
    if (h.tip) h.pos.copy(h.tip).applyMatrix4(bone.matrixWorld); else h.pos.setFromMatrixPosition(bone.matrixWorld);
    h.off = !!h.piece && (h.piece.when === 'drawn') !== A.showSword; // a piece that is not shown now has nothing to take hold of
    if (h.off) { pts.setXYZ(k, 0, -99, 0); ln.setXYZ(k * 2, 0, -99, 0); ln.setXYZ(k * 2 + 1, 0, -99, 0); return; }
    pts.setXYZ(k, h.pos.x, h.pos.y, h.pos.z);
    const from = h.tip ? v.setFromMatrixPosition(bone.matrixWorld) : hidden(A.H.bones[A.H.bones[h.bone].parent].name) ? h.pos : v.setFromMatrixPosition(bone.parent.matrixWorld);
    ln.setXYZ(k * 2, from.x, from.y, from.z); ln.setXYZ(k * 2 + 1, h.pos.x, h.pos.y, h.pos.z);
  });
  pts.needsUpdate = ln.needsUpdate = true;
  const s = handles.find((h) => h.bone === A.sel && !h.tip), sp = buildHandles.sel.geometry.attributes.position;
  buildHandles.sel.visible = !!s && buildHandles.pts.visible; if (s) { sp.setXYZ(0, s.pos.x, s.pos.y, s.pos.z); sp.needsUpdate = true; }
}
function pick(x, y, reach = 18) {
  const r = canvas.getBoundingClientRect(); let best = null, bd = reach;
  const v = new THREE.Vector3();
  for (const h of handles) {
    if (h.off) continue;
    v.copy(h.pos).project(camera);
    const d = Math.hypot((v.x * 0.5 + 0.5) * r.width - x, (-v.y * 0.5 + 0.5) * r.height - y);
    if (v.z < 1 && d < bd) { bd = d; best = h; }
  }
  return best;
}
// where the pointer is, on the plane through `through` that faces the camera
function onPlane(x, y, through) {
  const r = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1), camera);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), through);
  return ray.ray.intersectPlane(plane, new THREE.Vector3());
}
const wpos = (i) => actor.bones[i].getWorldPosition(new THREE.Vector3());
function aim(i, tipNow, target) { // turn bone i so that the point tipNow (carried by it) goes toward target
  const o = wpos(i), a = tipNow.clone().sub(o).normalize(), b = target.clone().sub(o).normalize();
  if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return;
  rotateWorld(i, new THREE.Quaternion().setFromUnitVectors(a, b));
}
function ik(chain, target) { // two bones: shoulder-elbow-wrist or hip-knee-ankle; the end keeps its own facing
  const [u, m, e] = chain, a = wpos(u), b = wpos(m), c = wpos(e);
  const endQ = actor.bones[e].getWorldQuaternion(new THREE.Quaternion());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c), to = target.clone().sub(a), d = clamp(to.length(), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const dir = to.clone().normalize();
  let n = b.clone().sub(a).cross(c.clone().sub(a));
  if (n.lengthSq() < 1e-10) n = dir.clone().cross(new THREE.Vector3(0, 1, 0)); // a straight limb has no bend plane yet
  n.normalize();
  let perp = n.clone().cross(dir).normalize();
  if (perp.dot(b.clone().sub(a)) < 0) perp.negate();
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const elbow = a.clone().addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * sinA);
  aim(u, b, elbow);
  aim(m, wpos(e), a.clone().addScaledVector(dir, d));
  const now = actor.bones[e].getWorldQuaternion(new THREE.Quaternion());
  rotateWorld(e, endQ.multiply(now.invert()));
}


// ---------------------------------------------------------------- quick adjustments
// The changes people ask for in words ("arms closer to the body", "stand straighter"), each as one small step
// in the scope being edited. They use the same operations as the handles and sliders.
const both = (fn) => { fn('Left', 1); fn('Right', -1); };
const turnBy = (name, d) => { const i = idx(name); if (i < 0) return; const e = eulerOf(i); setEuler(i, [e[0] + d[0], e[1] + d[1], e[2] + d[2]]); pose(actor, A.E); };
const reachBy = (name, d) => { const i = idx(name), h = handles.find((k) => k.bone === i && !k.tip); if (!h || !h.drag || !h.drag.chain) return; placeHandles(); ik(h.drag.chain, h.pos.clone().add(new THREE.Vector3(d[0], d[1], d[2]))); pose(actor, A.E); };
const QUICK = [
  ['หัว', 'เงย', 'ก้ม', (k) => turnBy('Head', [3 * k, 0, 0]), -1],
  ['หัว หัน', 'ซ้าย', 'ขวา', (k) => turnBy('Head', [0, 4 * k, 0]), 1],
  ['ลำตัว', 'ยืดตรง', 'โน้มหน้า', (k) => { for (const b of ['Spine02', 'Spine01', 'Spine']) turnBy(b, [1.5 * k, 0, 0]); }, -1],
  ['ลำตัว บิด', 'ซ้าย', 'ขวา', (k) => { for (const b of ['Spine02', 'Spine01', 'Spine']) turnBy(b, [0, 2 * k, 0]); }, 1],
  ['แขน', 'แนบตัว', 'กางออก', (k) => both((s, m) => reachBy(s + 'Hand', [0.02 * k * m, 0, 0])), -1],
  ['มือ', 'ยกขึ้น', 'ลดลง', (k) => both((s) => reachBy(s + 'Hand', [0, 0.02 * k, 0])), 1],
  ['มือ', 'มาข้างหน้า', 'ไปข้างหลัง', (k) => both((s) => reachBy(s + 'Hand', [0, 0, 0.02 * k])), 1],
  ['เท้า', 'ชิด', 'ห่าง', (k) => both((s, m) => reachBy(s + 'Foot', [0.015 * k * m, 0, 0])), -1],
  ['สะโพก', 'ยืดขึ้น', 'ย่อลง', (k) => { placeHandles(); const feet = ['LeftFoot', 'RightFoot'].map((n) => [n, wpos(idx(n))]); moveHips(new THREE.Vector3(0, 0.012 * k, 0)); for (const [n, at] of feet) { const i = idx(n), h = handles.find((q) => q.bone === i && !q.tip); placeHandles(); ik(h.drag.chain, at); pose(actor, A.E); } }, 1],
  ['สะโพก', 'เลื่อนซ้าย', 'เลื่อนขวา', (k) => { placeHandles(); const feet = ['LeftFoot', 'RightFoot'].map((n) => [n, wpos(idx(n))]); moveHips(new THREE.Vector3(0.012 * k, 0, 0)); for (const [n, at] of feet) { const i = idx(n), h = handles.find((q) => q.bone === i && !q.tip); placeHandles(); ik(h.drag.chain, at); pose(actor, A.E); } }, 1],
];
function buildQuick() {
  const box = $('#quick'); box.textContent = '';
  for (const [label, a, b, fn, sign] of QUICK) {
    const mk = (text, k) => { const btn = el('button', { textContent: text }); btn.onclick = () => { if (A.mode === 'game') setMode('pose'); remember(); pose(actor, A.E); placeHandles(); fn(k * sign); A.dirty = true; refresh(); syncInspector(true); buildClipList(); }; return btn; };
    box.append(el('div', { className: 'qrow' }, el('span', { textContent: label }), mk(a, 1), mk(b, -1)));
  }
}

// ---------------------------------------------------------------- history
const snapshot = () => JSON.stringify(A.E);
function remember() {
  undo.push(snapshot()); if (undo.length > 120) undo.shift(); redo = [];
  if (A.mode === 'keys' && !KD()) { const def = convertClip(); if (def) status('แปลงท่านี้เป็นคีย์แล้ว (' + def.keys.length + ' คีย์) แก้ได้เลย', 'ok'); }
}
function restore(json) { A.E = JSON.parse(json); A.dirty = true; applyEdits(A.H, A.E); if (!clipInfo()) A.clip = clipNames()[0]; if (A.mode === 'game') rebuildGame(); refresh(); buildClipList(); buildMoves(); buildSword(); syncInspector(true); }
function doUndo() { if (!undo.length) return; redo.push(snapshot()); restore(undo.pop()); }
function doRedo() { if (!redo.length) return; undo.push(snapshot()); restore(redo.pop()); }

// ---------------------------------------------------------------- the turning rings
// Round the selected part: one ring for each of its three axes (or the character's, if asked), and a pale
// outer ring that turns it about the line of sight. Dragging a ring turns the part about that axis, in
// whichever room and scope is open; the angle turned shows beside the pointer.
const RING_PX = 78; // the rings' radius on screen
const gizmo = new THREE.Group(), gizmoV = new THREE.Group(), ringGrabs = [], ringLook = {};
for (const [axis, color] of [['x', 0xff6470], ['y', 0x64dc86], ['z', 0x62a4ff], ['v', 0xdfe6f3]]) {
  const r = axis === 'v' ? 1.2 : 1;
  const show = new THREE.Mesh(new THREE.TorusGeometry(r, 0.019, 8, 80), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
  const grab = new THREE.Mesh(new THREE.TorusGeometry(r, 0.085, 6, 48), new THREE.MeshBasicMaterial({ visible: false })); // wider than it looks: easy to take hold of
  for (const m of [show, grab]) { if (axis === 'x') m.rotation.y = Math.PI / 2; if (axis === 'y') m.rotation.x = Math.PI / 2; m.renderOrder = 30; }
  grab.userData.axis = axis; ringGrabs.push(grab); ringLook[axis] = show;
  (axis === 'v' ? gizmoV : gizmo).add(show, grab);
}
gizmo.visible = gizmoV.visible = false; scene.add(gizmo, gizmoV);
let ringDrag = null, ringHot = null;
function placeGizmo() {
  const i = A.sel, h = i >= 0 && handles.find((k) => k.bone === i && !k.tip);
  const on = A.mode !== 'game' && A.rings && !!h && !h.off;
  gizmo.visible = gizmoV.visible = on;
  if (!on) return;
  const bone = actor.bones[i];
  bone.getWorldPosition(gizmo.position); gizmoV.position.copy(gizmo.position);
  const s = camera.position.distanceTo(gizmo.position) * Math.tan((camera.fov * DEG) / 2) * 2 * (RING_PX / Math.max(1, canvas.clientHeight));
  gizmo.scale.setScalar(s); gizmoV.scale.setScalar(s);
  if (!ringDrag) { if (A.local) bone.getWorldQuaternion(gizmo.quaternion); else gizmo.quaternion.identity(); } // while one is dragged the rings stay as they were taken hold of
  gizmoV.quaternion.copy(camera.quaternion);
  gizmo.updateMatrixWorld(true); gizmoV.updateMatrixWorld(true);
  for (const k in ringLook) ringLook[k].material.opacity = (ringDrag ? ringDrag.axis === k : ringHot === k) ? 1 : ringDrag ? 0.22 : 0.85;
}
function pickRing(x, y) {
  if (!gizmo.visible) return null;
  const r = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1), camera);
  const hits = ray.intersectObjects(ringGrabs, false);
  return hits.length ? hits[0] : null;
}
const toScreen = (p) => { const q = p.clone().project(camera), r = canvas.getBoundingClientRect(); return new THREE.Vector2((q.x * 0.5 + 0.5) * r.width, (-q.y * 0.5 + 0.5) * r.height); };
function startRing(hit, x, y) {
  const axis = hit.object.userData.axis, c = gizmo.position.clone();
  const n = axis === 'v' ? camera.getWorldDirection(new THREE.Vector3()).negate() : new THREE.Vector3(+(axis === 'x'), +(axis === 'y'), +(axis === 'z')).applyQuaternion(gizmo.quaternion);
  const r = hit.point.clone().sub(c); r.addScaledVector(n, -r.dot(n));
  // the way the grabbed point of the ring travels on screen when the part turns the positive way about the axis
  const a = toScreen(c.clone().add(r)), tan = toScreen(c.clone().add(r).addScaledVector(n.clone().cross(r), 0.2)).sub(a);
  if (tan.length() < 1e-3) tan.set(1, 0); // seen dead edge-on at that point: sideways will do
  ringDrag = { axis, n, tan: tan.normalize(), x, y, turned: 0, moved: false };
}
function moveRing(x, y, fine) {
  const d = ringDrag;
  let a = ((x - d.x) * d.tan.x + (y - d.y) * d.tan.y) / RING_PX; // radians: a drag of one ring radius is one radian
  if (!d.moved) { if (Math.hypot(x - d.x, y - d.y) < 3) return; d.moved = true; remember(); pose(actor, A.E); }
  if (A.snap !== fine) a = Math.round(a / (5 * DEG)) * 5 * DEG; // steps of five degrees (Shift does the opposite of the switch)
  if (Math.abs(a - d.turned) < 1e-6) return;
  rotateWorld(A.sel, new THREE.Quaternion().setFromAxisAngle(d.n, a - d.turned));
  d.turned = a;
  const read = $('#ring-read');
  read.hidden = false; read.textContent = (a >= 0 ? '+' : '−') + Math.abs(a / DEG).toFixed(1) + '°';
  read.style.left = x + 14 + 'px'; read.style.top = y - 30 + 'px'; read.dataset.axis = d.axis;
  refresh();
}
function endRing() { const moved = ringDrag && ringDrag.moved; ringDrag = null; $('#ring-read').hidden = true; if (moved) { buildClipList(); syncInspector(true); } }

// ---------------------------------------------------------------- pointer: handles and camera
let drag = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  canvas.setPointerCapture(e.pointerId);
  const can = e.button === 0 && A.mode !== 'game', dots = can && buildHandles.pts.visible;
  // a joint's dot right under the pointer comes first, then a ring, then a dot that is merely near
  let h = dots ? pick(x, y, 8) : null;
  const ring = !h && can ? pickRing(x, y) : null;
  if (ring) { startRing(ring, x, y); drag = { kind: 'ring', x, y }; return; }
  if (!h && dots) h = pick(x, y);
  if (h) {
    select(h.select);
    drag = { kind: 'handle', h, moved: false, x, y, last: h.pos.clone(), hipsAt: h.pos.clone() };
  } else drag = { kind: e.button === 1 || e.shiftKey ? 'pan' : 'orbit', x, y };
});
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (!drag) { const hit = A.mode !== 'game' ? pickRing(x, y) : null; ringHot = hit ? hit.object.userData.axis : null; canvas.style.cursor = hit ? 'grab' : ''; return; }
  if (drag.kind === 'ring') { moveRing(x, y, e.shiftKey); return; }
  const dx = x - drag.x, dy = y - drag.y;
  if (drag.kind === 'orbit') { cam.yaw -= dx * 0.008; cam.pitch = clamp(cam.pitch + dy * 0.006, -0.6, 1.52); drag.x = x; drag.y = y; }
  else if (drag.kind === 'pan') {
    const k = cam.dist * 0.0011, right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    cam.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k); drag.x = x; drag.y = y;
  } else {
    const d = drag.h.drag; if (!d) return;
    if (!drag.moved) { if (Math.hypot(dx, dy) < 4) return; drag.moved = true; remember(); }
    const target = onPlane(x, y, drag.h.pos); if (!target) return;
    if (d.type === 'move') moveBone(d.bone, target.clone().sub(drag.h.pos));
    else if (d.type === 'ik' && A.ik) ik(d.chain, target);
    else aim(d.type === 'ik' ? d.aim : d.bone, drag.h.pos.clone(), target);
    refresh();
  }
});
const endDrag = () => { if (drag && drag.kind === 'ring') endRing(); if (drag && drag.kind === 'handle' && drag.moved) { buildClipList(); } drag = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 0.6, 60); }, { passive: false });

// ---------------------------------------------------------------- panels
function select(i) { A.sel = i; buildBoneList(); syncInspector(true); placeHandles(); }
function selectClip(name) {
  A.clip = name; A.t = clamp(A.t, 0, clipInfo().dur); A.playing = false;
  const s = $('#tl-scrub'); s.max = clipInfo().dur; s.step = 1 / fps();
  buildClipList(); syncKeysTab(); refresh();
}
function buildClipList() {
  const box = $('#clips'); box.textContent = '';
  for (const name of clipNames()) {
    const c = clipInfo(name); if (!c) continue;
    const L = A.E.clips && A.E.clips[name], edited = !!KD(name) || (L && ((L.rot && Object.keys(L.rot).length) || (L.pos && Object.keys(L.pos).length) || (L.keys && L.keys.length) || (L.hips && L.hips.some(Boolean))));
    // where the clip's motion comes from: the motion library, or keys that can be reshaped
    const kind = KD(name) ? 'คีย์ ' + KD(name).keys.length : 'คลัง';
    const b = el('button', { className: (name === A.clip ? 'on ' : '') + (edited ? 'edited' : '') }, el('span', { textContent: CLIP_TH[name] || name }), el('small', { textContent: kind + ' · ' + c.dur.toFixed(2) + 's' }));
    b.onclick = () => selectClip(name); box.append(b);
  }
}
function buildBoneList() {
  const box = $('#bones'); box.textContent = '';
  const depth = (i) => { let d = 0; for (let p = A.H.bones[i].parent; p > 0; p = A.H.bones[p].parent) d++; return d; };
  A.H.bones.forEach((b, i) => {
    if (hidden(b.name)) return;
    const btn = el('button', { className: i === A.sel ? 'on' : '', textContent: BONE_TH(b.name) }); btn.style.paddingLeft = 6 + depth(i) * 10 + 'px';
    btn.onclick = () => select(i); box.append(btn);
  });
}
// a slider with a number box beside it
function slider(box, label, min, max, step, get, set, begin) {
  const range = el('input', { type: 'range', min, max, step }), num = el('input', { type: 'number', min, max, step });
  const row = el('div', { className: 'sl' }, el('span', { textContent: label }), range, num); box.append(row);
  const sync = () => { const v = get(); range.value = v; if (document.activeElement !== num) num.value = Math.round(v * 100) / 100; };
  let active = false;
  const start = () => { if (!active) { active = true; begin && begin(); } }, stop = () => { active = false; };
  range.addEventListener('pointerdown', start); range.addEventListener('change', stop);
  num.addEventListener('focus', start); num.addEventListener('blur', stop);
  range.addEventListener('input', () => { start(); set(+range.value); num.value = range.value; });
  num.addEventListener('input', () => { if (num.value === '' || isNaN(+num.value)) return; set(clamp(+num.value, min, max)); range.value = num.value; });
  sync(); return sync;
}
// the selected bone's edit as three angles about the character's own axes (rest pose): x nod, y turn, z tilt
let syncSliders = [], twist = 0;
// what turns bone i: in the keyframe room its turn away from how the model was bound, otherwise what the layer adds
const relOf = (i) => { const b = A.H.bones[i], c = getDelta(A.scope, b.name); return A.scope === 'abs' ? qmul(c, qinv(b.r)) : c; };
const setRel = (i, d) => { const b = A.H.bones[i]; setDelta(A.scope, b.name, A.scope === 'abs' ? qnorm(qmul(d, b.r)) : d); };
function eulerOf(i) {
  const d = relOf(i), p = rest.pq[i], a = qmul(qmul(p, d), qinv(p));
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(a[0], a[1], a[2], a[3]), 'YXZ');
  return [e.x / DEG, e.y / DEG, e.z / DEG];
}
function setEuler(i, deg) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(deg[0] * DEG, deg[1] * DEG, deg[2] * DEG, 'YXZ')), p = rest.pq[i];
  setRel(i, qnorm(qmul(qmul(qinv(p), [q.x, q.y, q.z, q.w]), p)));
}
// where a movable bone is: in the keyframe room measured from where it was bound, otherwise what the layer adds
const shiftOf = (i) => { const b = A.H.bones[i], v = getPos(A.scope, b.name); return A.scope === 'abs' ? [v[0] - b.t[0], v[1] - b.t[1], v[2] - b.t[2]] : v.slice(); };
const setShift = (i, v) => { const b = A.H.bones[i]; setPos(A.scope, b.name, A.scope === 'abs' ? [v[0] + b.t[0], v[1] + b.t[1], v[2] + b.t[2]] : v); };
function boneAxis(i) { // the way the bone points, in world space
  const h = handles.find((k) => k.bone === i && k.tip); const kid = handles.find((k) => !k.tip && A.H.bones[k.bone].parent === i);
  const to = h ? h.pos : kid ? kid.pos : null;
  return to ? to.clone().sub(wpos(i)).normalize() : new THREE.Vector3(0, 1, 0);
}
function syncInspector(rebuild) {
  const i = A.sel, box = $('#sliders');
  $('#bone-name').textContent = i < 0 ? 'ยังไม่ได้เลือกกระดูก' : BONE_TH(A.H.bones[i].name) + '  (' + A.H.bones[i].name + ')';
  if (rebuild || !syncSliders.length) {
    box.textContent = ''; syncSliders = []; twist = 0;
    if (i < 0) return;
    const labels = ['ก้ม / เงย', 'หันซ้าย / ขวา', 'เอียง / กาง'];
    labels.forEach((label, k) => syncSliders.push(slider(box, label, -180, 180, 0.5, () => eulerOf(A.sel)[k], (v) => { const e = eulerOf(A.sel); e[k] = v; setEuler(A.sel, e); refreshKeep(); }, remember)));
    syncSliders.push(slider(box, 'บิดรอบแกน', -180, 180, 0.5, () => twist, (v) => { rotateWorld(A.sel, new THREE.Quaternion().setFromAxisAngle(boneAxis(A.sel), (v - twist) * DEG)); twist = v; refreshKeep(); }, remember));
    if (movable(i)) ['แกน 1', 'แกน 2', 'แกน 3'].forEach((label, k) => syncSliders.push(slider(box, 'เลื่อน ' + (i === A.H.named.hips ? ['ซ้าย-ขวา', 'ขึ้น-ลง', 'หน้า-หลัง'][k] : label), -60, 60, 0.25, () => shiftOf(A.sel)[k], (v) => { const p = shiftOf(A.sel); p[k] = v; setShift(A.sel, p); refreshKeep(); }, remember)));
  } else for (const s of syncSliders) s();
}
const refreshKeep = () => refresh();

function syncTimeline() {
  const c = clipInfo(), s = $('#tl-scrub');
  if (document.activeElement !== s || A.playing) s.value = A.t;
  $('#tl-time').textContent = A.t.toFixed(2) + ' / ' + c.dur.toFixed(2) + ' วินาที · เฟรม ' + Math.round(A.t * fps());
  $('#tl-play').textContent = A.playing ? '⏸' : '▶';
  const ticks = $('#ticks'), keys = shownKeys();
  if (!keyDrag) {
    ticks.textContent = '';
    keys.forEach((k, n) => { const i = el('i', { title: 'คีย์ที่ ' + k.t.toFixed(2) + ' วิ — คลิกเพื่อไปที่คีย์ ลากเพื่อย้ายเวลา' }); i.dataset.n = n; i.style.left = (k.t / c.dur) * 100 + '%'; ticks.append(i); });
  }
  [...ticks.children].forEach((i, n) => { if (keys[n]) { i.style.left = (keys[n].t / c.dur) * 100 + '%'; i.classList.toggle('now', Math.abs(keys[n].t - A.t) < 0.5 / fps()); } });
}
// the keys the timeline shows: the clip's own (keyframe room) or the ones laid over it (adjusting room)
function shownKeys() {
  if (A.mode === 'keys') return (KD() && KD().keys) || [];
  const L = A.E.clips && A.E.clips[A.clip];
  return (L && L.keys) || [];
}
let keyDrag = null;
$('#ticks').addEventListener('pointerdown', (e) => {
  const n = e.target.dataset && e.target.dataset.n; if (n === undefined) return;
  const key = shownKeys()[+n]; if (!key) return;
  e.preventDefault(); e.target.setPointerCapture(e.pointerId);
  const all = shownKeys(), at = all.indexOf(key), c = clipInfo(), f = 1 / fps();
  // it moves between its neighbours (a loop's end is its beginning: no key sits there)
  keyDrag = { key, x: e.clientX, t0: key.t, moved: false, lo: at > 0 ? all[at - 1].t + f : 0, hi: at < all.length - 1 ? all[at + 1].t - f : c.loop && A.mode === 'keys' ? c.dur - f : c.dur };
  A.playing = false; A.t = key.t; refresh();
});
$('#ticks').addEventListener('pointermove', (e) => {
  if (!keyDrag) return;
  const c = clipInfo(), w = $('#ticks').clientWidth || 1, dx = e.clientX - keyDrag.x;
  if (!keyDrag.moved) { if (Math.abs(dx) < 4) return; keyDrag.moved = true; remember(); }
  if (keyDrag.hi < keyDrag.lo - 1e-6) return; // no room between its neighbours
  const t = r4(clamp(fpsSnap(keyDrag.t0 + (dx / w) * c.dur), keyDrag.lo, keyDrag.hi));
  keyDrag.key.t = t; A.t = t; A.dirty = true;
  if (A.mode === 'keys') rebake();
  refresh();
});
const endKeyDrag = () => {
  if (!keyDrag) return;
  const moved = keyDrag.moved; keyDrag = null;
  if (moved) { shownKeys().sort((a, b) => a.t - b.t); if (A.mode === 'keys') rebake(); buildClipList(); }
  refresh(); syncKeysTab();
};
$('#ticks').addEventListener('pointerup', endKeyDrag); $('#ticks').addEventListener('pointercancel', endKeyDrag);

// ---------------------------------------------------------------- the keyframe room
// Turn the open clip into keys of its own (see reduceKeys). What was laid over it goes into the keys.
// how closely the keys must follow the clip (the furthest a joint may be off, in metres) and how many keys a second at most
const LEVELS = { fine: { tol: 0.008, rate: 20 }, mid: { tol: 0.02, rate: 12 }, rough: { tol: 0.045, rate: 7 } };
const levelOf = (name, level) => { const L = LEVELS[level] || LEVELS.mid, c = clipInfo(name); return { tol: L.tol, max: clamp(Math.ceil(c.dur * L.rate), 4, Math.floor(c.frames / 2)) }; };
function convertClip(name = A.clip, level = $('#kf-level').value) {
  if (!clipInfo(name)) return null;
  const def = reduceKeys(A.H, A.E, name, levelOf(name, level));
  if (!def) return null;
  if (!A.E.keyed) A.E.keyed = {};
  A.E.keyed[name] = def;
  if (A.E.clips) delete A.E.clips[name];
  if (A.E.made) delete A.E.made[name];
  applyEdits(A.H, A.E); A.dirty = true;
  buildClipList(); buildMoves(); syncKeysTab();
  return def;
}
function syncKeysTab() {
  const K = KD(), c = clipInfo(); if (!c) return;
  $('#kf-none').hidden = !!K; $('#kf-have').hidden = !K;
  if (!K) return;
  const k = keyNear(K.keys, fpsSnap(A.t)), lib = !!A.H.raw.clips[A.clip];
  $('#kf-info').textContent = (CLIP_TH[A.clip] || A.clip) + ': ' + K.keys.length + ' คีย์' + (k ? ' · อยู่บนคีย์ที่ ' + k.t.toFixed(2) + ' วิ' : ' · ขยับอะไรตอนนี้จะเกิดคีย์ใหม่ที่ ' + fpsSnap(A.t).toFixed(2) + ' วิ');
  if (document.activeElement !== $('#kf-dur')) $('#kf-dur').value = K.dur.toFixed(2);
  $('#kf-loop').checked = !!K.loop;
  $('#kf-ease').value = (k && k.ease) || 'smooth'; $('#kf-ease').disabled = !k;
  $('#kf-revert').textContent = lib ? 'คืนเป็นท่าเดิมจากคลัง (ทิ้งคีย์)' : 'ลบท่านี้';
}

// ---------------------------------------------------------------- playing as the game does
function rebuildGame() {
  applyEdits(A.H, A.E);
  if (game) scene.remove(game.group);
  game = new HeroActor(A.H, LOOK); scene.add(game.group);
  game.speed = 0;
}
function setMode(mode) {
  A.mode = mode;
  for (const b of $('#mode').children) b.classList.toggle('on', b.dataset.mode === mode);
  const g = mode === 'game', k = mode === 'keys';
  // the keyframe room works on the clip's own poses; the adjusting room on what is laid over the clip
  if (k) { if (A.scope !== 'abs') A.wasScope = A.scope; A.scope = 'abs'; } else if (A.scope === 'abs') A.scope = A.wasScope || 'clip';
  if (A.scope !== 'abs') $('#scope').value = A.scope;
  $('#scope-row').hidden = k; $('#keys-note').hidden = !k;
  for (const b of $('#tabs').children) if (b.dataset.tab === 'keys') b.hidden = !k;
  showTab(k ? 'keys' : $('#tabs .on') && $('#tabs .on').dataset.tab !== 'keys' ? $('#tabs .on').dataset.tab : 'quick');
  if (g) rebuildGame(); else if (game) { scene.remove(game.group); game = null; }
  actor.group.visible = !g; ghost.group.visible = !g && $('#t-ghost').checked;
  for (const o of [buildHandles.pts, buildHandles.lines, buildHandles.sel]) o.visible = !g && $('#t-bones').checked;
  $('#game-panel').hidden = !g; $('#clips').parentElement.querySelector('#new-clip').hidden = g; $('#clips').hidden = g; $('#left h3').hidden = g; $('#timeline').style.visibility = g ? 'hidden' : '';
  if (!g) { syncInspector(true); syncKeysTab(); refresh(); }
}
function showTab(t) { for (const b of $('#tabs').children) b.classList.toggle('on', b.dataset.tab === t); for (const s of ['keys', 'quick', 'bone', 'moves', 'sword', 'file']) $('#tab-' + s).hidden = s !== t; }
function act(path) {
  if (A.mode !== 'game') setMode('game');
  const [name, k] = path.split('.');
  if (name === 'hit') game.hit(); else game.play(name, name === 'ult' ? 1.5 : name === 'cast' ? 0.6 : name === 'gather' ? 1.2 : 0.36, +k || 0);
}

// ---------------------------------------------------------------- moves and sword
const movePath = () => $('#mv-action').value.split('.');
function moveDef(create) {
  const [name, k] = movePath(), H = A.H;
  if (create && H.meta.moves[name]) { if (!A.E.moves) A.E.moves = {}; if (!A.E.moves[name]) A.E.moves[name] = JSON.parse(JSON.stringify(H.meta.moves[name])); A.dirty = true; }
  const M = (A.E.moves && A.E.moves[name]) || H.meta.moves[name];
  if (!M) return null; // a character the game does not play has no moves
  return k !== undefined ? M[+k][0] : M[0];
}
function buildMoves() {
  const sel = $('#mv-action'); if (!sel.options.length) for (const [v, t] of ACTIONS) sel.append(el('option', { value: v, textContent: t }));
  const box = $('#mv-form'); box.textContent = '';
  const d = moveDef(false); if (!d) return;
  const clipSel = el('select'); for (const n of clipNames()) clipSel.append(el('option', { value: n, textContent: (CLIP_TH[n] || n) + ' (' + n + ')' }));
  clipSel.value = d.clip; clipSel.onchange = () => { remember(); moveDef(true).clip = clipSel.value; };
  const keys = el('input', { value: d.keys.map((k) => k[0] + ':' + k[1]).join(', '), title: 'เวลาในเกม:เวลาในคลิป คั่นด้วยจุลภาค' });
  keys.onchange = () => { const v = keys.value.split(',').map((s) => s.split(':').map(Number)).filter((k) => k.length === 2 && k.every(isFinite)); if (v.length >= 2) { remember(); moveDef(true).keys = v; } };
  box.append(el('label', {}, 'ใช้คลิป', clipSel), el('label', {}, 'จุดจับจังหวะ (วินาทีในเกม : วินาทีในคลิป)', keys));
  const num = (label, key, min, max, step, dflt) => slider(box, label, min, max, step, () => moveDef(false)[key] ?? dflt, (v) => { moveDef(true)[key] = v; }, remember);
  num('เร็วช่วงท้าย', 'rate', -3, 3, 0.05, 1); num('จบที่ (คลิป)', 'end', 0, clipInfo(d.clip) ? clipInfo(d.clip).dur : 6, 0.01, 1);
  num('เข้าท่า (วิ)', 'fade', 0.02, 0.6, 0.01, 0.07); num('ออกท่า (วิ)', 'out', 0.05, 1, 0.01, 0.2); num('แรง (ซ้อนทับ)', 'gain', 0, 1, 0.01, 1);
  const chk = (label, key, dflt) => { const c = el('input', { type: 'checkbox', checked: moveDef(false)[key] ?? dflt }); c.onchange = () => { remember(); moveDef(true)[key] = c.checked; }; box.append(el('label', { className: 'check' }, c, label)); };
  chk('ใช้ทั้งตัวเสมอ (ขาไม่วิ่งต่อ)', 'whole', false); chk('ชักดาบมาไว้ในมือ', 'sword', true);
}
function swordNow() { return { ...A.H.meta.sword, ...(A.E.sword || {}) }; }
function applySword() {
  const S = swordNow(); if (!actor.sword) return;
  const k = S.length / actor.hand.getWorldScale(new THREE.Vector3()).x;
  actor.sword.parent.scale.setScalar(k); actor.sheathed.parent.scale.setScalar(k);
}
function buildSword() {
  const box = $('#sw-form'); box.textContent = ''; if (!A.H.meta.sword) return;
  const put = (k, v) => { if (!A.E.sword) A.E.sword = {}; A.E.sword[k] = v; A.dirty = true; applySword(); };
  slider(box, 'ยาว (ม.)', 0.5, 2.2, 0.01, () => swordNow().length, (v) => put('length', v), remember);
  applySword();
}

// ---------------------------------------------------------------- saving
const KEY = (id) => 'ng-animator:' + id;
const docData = async (path) => { const snap = await db.doc(path).get(); return snap && typeof snap.data === 'function' ? snap.data() : snap; };
let savedKeyed = {}; // what the page's store holds of each keyed clip, to write only what changed
async function loadSaved(id) {
  let best = null;
  try { const s = JSON.parse(localStorage.getItem(KEY(id)) || 'null'); if (s && s.edits) best = { ...s, from: 'ในเบราว์เซอร์นี้' }; } catch { /* no storage here */ }
  savedKeyed = {};
  if (db) try {
    const d = await docData('rigs/' + id);
    if (d && d.json) {
      const edits = JSON.parse(d.json), names = edits.keyedNames || []; delete edits.keyedNames;
      for (const name of names) { const k = await docData('rigs/' + id + '/keyed/' + name); if (k && k.json) { if (!edits.keyed) edits.keyed = {}; edits.keyed[name] = JSON.parse(k.json); savedKeyed[name] = k.json; } }
      if (!best || d.savedAt >= best.savedAt) best = { edits, savedAt: d.savedAt, from: 'ที่บันทึกไว้กับหน้านี้' };
    }
  } catch { /* unreadable: fall back */ }
  return best;
}
async function save() {
  const json = JSON.stringify(A.E), savedAt = Date.now(); let where = [];
  try { localStorage.setItem(KEY(A.id), JSON.stringify({ edits: A.E, savedAt })); where.push('เบราว์เซอร์นี้'); } catch { /* no storage here */ }
  if (db) try {
    const { keyed = {}, ...rest } = A.E, main = JSON.stringify({ ...rest, keyedNames: Object.keys(keyed) });
    for (const name in keyed) { const j = JSON.stringify(keyed[name]); if (savedKeyed[name] !== j) { await db.doc('rigs/' + A.id + '/keyed/' + name).set({ json: j, savedAt, bytes: j.length }); savedKeyed[name] = j; } }
    for (const name of Object.keys(savedKeyed)) if (!keyed[name]) { await db.doc('rigs/' + A.id + '/keyed/' + name).delete(); delete savedKeyed[name]; }
    await db.doc('rigs/' + A.id).set({ json: main, savedAt, bytes: main.length });
    where.push('หน้านี้ (Claude อ่านได้)');
  } catch (e) { status('บันทึกกับหน้านี้ไม่ได้: ' + ((e && e.code) || 'ผิดพลาด'), 'bad'); }
  if (where.length) { A.dirty = false; status('บันทึกแล้ว: ' + where.join(' + '), 'ok'); } else status('บันทึกไม่ได้ ใช้ “คัดลอกข้อมูล” ในแท็บไฟล์แทน', 'bad');
  $('#f-info').textContent = 'ขนาดข้อมูล ' + (json.length / 1024).toFixed(1) + ' KB';
}
function loadEdits(obj) { remember(); A.E = JSON.parse(JSON.stringify(obj || {})); A.H.edits = A.E; A.dirty = true; applyEdits(A.H, A.E); if (!clipInfo()) A.clip = clipNames()[0]; buildClipList(); buildMoves(); buildSword(); syncKeysTab(); if (A.mode === 'game') rebuildGame(); refresh(); }


// ---------------------------------------------------------------- sending a new model in
// A model file picked from the owner's computer is kept with this page (its asset store takes text, so the
// file goes in as base64, in pieces small enough for one asset each) and a row in `inbox` says what it is.
// Claude reads the row and the pieces, rigs the model and adds it to the characters this tool opens.
const PIECE = 12 * 1024 * 1024; // bytes of the file in one piece (16 MiB once written as base64)
function base64Of(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000 * 3) out += btoa(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000 * 3))); // whole groups of three bytes: the pieces join up
  return out;
}
const WHY = { too_large: 'ไฟล์ใหญ่เกินไป', quota_or_state: 'ที่เก็บของหน้านี้เต็ม', rate_limited: 'ส่งถี่เกินไป รอสักครู่แล้วลองใหม่', not_granted: 'หน้านี้ยังไม่ได้รับอนุญาตให้เก็บไฟล์', upstream_auth: 'ต้องโหลดหน้าใหม่หรือเข้าสู่ระบบอีกครั้ง', store_unavailable: 'ที่เก็บไฟล์ติดขัดชั่วคราว ลองใหม่อีกครั้ง' };
async function showInbox() {
  const box = $('#imp-list'); if (!db) return;
  try {
    const snap = await db.collection('inbox').get(), rows = snap.docs.map((d) => d.data()).filter(Boolean).sort((a, b) => b.sentAt - a.sentAt);
    box.textContent = '';
    for (const r of rows) box.append(el('div', {}, el('b', { textContent: r.name }), el('span', { textContent: (r.bytes / 1048576).toFixed(1) + ' MB · ' + (r.state === 'added' ? 'เพิ่มเป็นตัวละครแล้ว' : 'ส่งแล้ว รอ Claude') })));
  } catch { /* the list is a convenience */ }
}
async function sendModel() {
  const info = (t, bad) => { const e = $('#imp-info'); e.textContent = t; e.style.color = bad ? 'var(--warn)' : ''; };
  const f = $('#imp-file').files[0];
  if (!f) { info('เลือกไฟล์ก่อน', true); return; }
  if (!assets || !db) { info('ส่งจากที่นี่ไม่ได้: ต้องเปิดหน้านี้จากลิงก์ของคุณเอง (เจ้าของหน้า) ขณะเข้าสู่ระบบ', true); return; }
  if (f.size > 120 * 1048576) { info('ไฟล์ใหญ่เกิน 120 MB', true); return; }
  $('#imp-send').disabled = true;
  try {
    const bytes = new Uint8Array(await f.arrayBuffer()), parts = [], total = Math.ceil(bytes.length / PIECE);
    for (let o = 0; o < bytes.length; o += PIECE) {
      info('กำลังส่ง… ' + (parts.length + 1) + ' / ' + total);
      const text = base64Of(bytes.subarray(o, o + PIECE));
      let r;
      try { r = await assets.upload(new Blob([text], { type: 'text/plain' }), { type: 'text/plain' }); }
      catch (e) { if (e && e.code === 'store_unavailable') { await new Promise((ok) => setTimeout(ok, 1500)); r = await assets.upload(new Blob([text], { type: 'text/plain' }), { type: 'text/plain' }); } else throw e; }
      parts.push(r.id);
    }
    await db.doc('inbox/m' + Date.now().toString(36)).set({ name: f.name, bytes: bytes.length, parts, encoding: 'base64', note: $('#imp-note').value.trim(), sentAt: Date.now(), state: 'sent' });
    info('ส่ง “' + f.name + '” แล้ว บอก Claude ในแชตว่า “ส่งโมเดลแล้ว” ได้เลย');
    $('#imp-file').value = ''; showInbox();
  } catch (e) { info('ส่งไม่สำเร็จ: ' + (WHY[e && e.code] || (e && e.code) || 'ผิดพลาด'), true); }
  $('#imp-send').disabled = false;
}

// ---------------------------------------------------------------- wiring
$('#mode').onclick = (e) => { if (e.target.dataset.mode) setMode(e.target.dataset.mode); };
$('#undo').onclick = doUndo; $('#redo').onclick = doRedo; $('#save').onclick = save;
$('#scope').onchange = (e) => { A.scope = e.target.value; syncInspector(true); };
$('#tl-scrub').addEventListener('change', syncKeysTab);
$('#views').onclick = (e) => { const k = e.target.dataset.view, v = VIEWS[k]; if (v) { cam.yaw = v[0]; cam.pitch = v[1]; cam.dist = v[2]; cam.target.set(actor.group.position.x, k === 'face' ? 1.45 : 0.95, actor.group.position.z); } };
$('#t-bones').onchange = (e) => { for (const o of [buildHandles.pts, buildHandles.lines, buildHandles.sel]) o.visible = e.target.checked && A.mode !== 'game'; placeHandles(); };
$('#t-ghost').onchange = (e) => { ghost.group.visible = e.target.checked && A.mode !== 'game'; refresh(); };
$('#t-sword').onchange = (e) => { A.showSword = e.target.checked; refresh(); };
$('#t-ik').onchange = (e) => { A.ik = e.target.checked; };
$('#t-rings').onchange = (e) => { A.rings = e.target.checked; };
$('#t-local').onchange = (e) => { A.local = e.target.checked; };
$('#t-snap').onchange = (e) => { A.snap = e.target.checked; };
$('#tabs').onclick = (e) => { const t = e.target.dataset.tab; if (t) showTab(t); };
$('#b-reset').onclick = () => { if (A.sel < 0) return; remember(); setRel(A.sel, [0, 0, 0, 1]); if (movable(A.sel)) setShift(A.sel, [0, 0, 0]); refresh(); syncInspector(true); buildClipList(); };
$('#b-mirror').onclick = () => {
  if (A.sel < 0) return; const name = A.H.bones[A.sel].name, other = /^left/i.test(name) ? name.replace(/^left/i, 'Right') : /^right/i.test(name) ? name.replace(/^right/i, 'Left') : null, j = other ? idx(other) : -1;
  if (j < 0) return; remember();
  const p = rest.pq[A.sel], a = qmul(qmul(p, relOf(A.sel)), qinv(p)), m = [a[0], -a[1], -a[2], a[3]], pj = rest.pq[j];
  setRel(j, qnorm(qmul(qmul(qinv(pj), m), pj))); refresh(); buildClipList();
};
const cloneKey = (k) => JSON.parse(JSON.stringify({ q: k.q || {}, p: k.p || {} }));
$('#p-copy').onclick = () => {
  if (A.scope === 'abs') { if (!KD()) return; clipboard = JSON.stringify({ abs: cloneKey(fullKey(A.t, A.t, A.clip, null)) }); status('คัดลอกท่าของเวลานี้แล้ว'); return; }
  const L = layer(A.scope, false); clipboard = L ? JSON.stringify({ rot: L.rot || {}, pos: L.pos || {}, hips: L.hips || null }) : null; status(clipboard ? 'คัดลอกท่าแล้ว' : 'ยังไม่มีการแก้ให้คัดลอก');
};
$('#p-paste').onclick = () => {
  if (!clipboard) return; const c = JSON.parse(clipboard);
  if ((A.scope === 'abs') !== !!c.abs) { status('ท่าที่คัดลอกมาจากอีกห้อง วางที่นี่ไม่ได้', 'bad'); return; }
  remember();
  if (c.abs) { const k = absKey(true); k.q = c.abs.q; k.p = c.abs.p; rebake(); }
  else { const L = layer(A.scope, true); L.rot = c.rot; L.pos = c.pos || {}; if (c.hips) L.hips = c.hips; else delete L.hips; }
  A.dirty = true; refresh(); syncInspector(true); buildClipList(); syncKeysTab();
};
$('#p-reset').onclick = () => {
  if (A.scope === 'abs') { const K = KD(), k = K && keyNear(K.keys, fpsSnap(A.t)); if (!k) return; remember(); Object.assign(k, { q: restKey(0).q, p: restKey(0).p }); rebake(); A.dirty = true; refresh(); syncInspector(true); return; }
  const L = layer(A.scope, false); if (!L) return; remember(); L.rot = {}; L.pos = {}; delete L.hips; if (A.scope === 'clip') L.keys = []; A.dirty = true; refresh(); syncInspector(true); buildClipList();
};
$('#tl-play').onclick = () => { A.playing = !A.playing; syncTimeline(); };
$('#tl-first').onclick = () => { A.t = 0; refresh(); };
const stepFrame = (d) => { A.playing = false; A.t = clamp(fpsSnap(A.t) + d / fps(), 0, clipInfo().dur); refresh(); };
$('#tl-prev').onclick = () => stepFrame(-1); $('#tl-next').onclick = () => stepFrame(1);
$('#tl-speed').onchange = (e) => { A.speed = +e.target.value; };
$('#tl-scrub').oninput = (e) => { A.playing = false; A.t = +e.target.value; refresh(); };
$('#k-add').onclick = () => {
  remember();
  if (A.mode === 'keys') absKey(true); else { addKey(); A.scope = 'key'; $('#scope').value = 'key'; }
  A.dirty = true; refresh(); syncInspector(true); buildClipList(); syncKeysTab();
};
$('#k-del').onclick = () => {
  const keys = shownKeys(), i = keys.findIndex((k) => Math.abs(k.t - A.t) < 0.5 / fps()); if (i < 0) return;
  if (A.mode === 'keys' && keys.length < 2) { status('ท่าต้องมีอย่างน้อยหนึ่งคีย์', 'bad'); return; }
  remember(); keys.splice(i, 1); if (A.mode === 'keys') rebake(); A.dirty = true; refresh(); buildClipList(); syncKeysTab();
};
const jumpKey = (dir) => { const ks = shownKeys().map((k) => k.t); const t = dir > 0 ? ks.find((v) => v > A.t + 1e-4) : [...ks].reverse().find((v) => v < A.t - 1e-4); if (t !== undefined) { A.playing = false; A.t = t; refresh(); syncKeysTab(); } };
$('#k-prev').onclick = () => jumpKey(-1); $('#k-next').onclick = () => jumpKey(1);
// ---- the keyframe room's own controls
$('#kf-convert').onclick = () => { undo.push(snapshot()); redo = []; const def = convertClip(); if (def) { status('แปลงแล้ว: ' + def.keys.length + ' คีย์ ลากคีย์บนเส้นเวลาหรือขยับตัวละครได้เลย', 'ok'); refresh(); } };
$('#kf-dur').onchange = (e) => {
  const K = KD(), d = clamp(+e.target.value || 0, 0.1, 30); if (!K || Math.abs(d - K.dur) < 1e-4) return;
  remember();
  if ($('#kf-stretch').checked) { const f = d / K.dur; for (const k of K.keys) k.t = r4(fpsSnap(k.t * f)); } else K.keys = K.keys.filter((k) => k.t <= d + 1e-6);
  if (!K.keys.length) K.keys.push(restKey(0));
  K.dur = d; rebake(); A.dirty = true; A.t = Math.min(A.t, clipInfo().dur); selectClip(A.clip);
};
$('#kf-loop').onchange = (e) => { const K = KD(); if (!K) return; remember(); K.loop = e.target.checked; if (K.loop) K.keys = K.keys.filter((k, i) => i === 0 || k.t < K.dur - 0.5 / fps()); rebake(); A.dirty = true; selectClip(A.clip); };
$('#kf-ease').onchange = (e) => { const K = KD(), k = K && keyNear(K.keys, fpsSnap(A.t)); if (!k) return; remember(); if (e.target.value === 'smooth') delete k.ease; else k.ease = e.target.value; rebake(); A.dirty = true; refresh(); };
$('#kf-dup').onclick = () => { // the pose of this moment again, a quarter of a second on: the start of a hold, or of a variation
  const K = KD(); if (!K) return; const c = clipInfo(), t = fpsSnap(Math.min(c.dur - (c.loop ? 1 / fps() : 0), A.t + 0.25));
  if (keyNear(K.keys, t)) { status('มีคีย์อยู่ที่เวลานั้นแล้ว', 'bad'); return; }
  remember(); const src = cloneKey(fullKey(A.t, A.t, A.clip, null)); A.t = t; const k = absKey(true); k.q = src.q; k.p = src.p; rebake(); A.dirty = true; refresh(); buildClipList(); syncKeysTab();
};
$('#kf-revert').onclick = () => { $('#kf-confirm').hidden = false; };
$('#kf-no').onclick = () => { $('#kf-confirm').hidden = true; };
$('#kf-yes').onclick = () => {
  $('#kf-confirm').hidden = true; undo.push(snapshot()); redo = [];
  delete A.E.keyed[A.clip]; if (A.E.clips) delete A.E.clips[A.clip];
  if (A.E.moves) for (const m in A.E.moves) { /* a move that used a deleted clip keeps its name: the game skips clips it does not have */ }
  applyEdits(A.H, A.E); A.dirty = true; if (!clipInfo()) A.clip = clipNames()[0]; A.t = 0; selectClip(A.clip); buildMoves(); status('คืนท่าเดิมแล้ว');
};
$('#new-clip').onclick = () => { $('#new-form').hidden = false; $('#nf-name').focus(); };
$('#nf-cancel').onclick = () => { $('#new-form').hidden = true; };
$('#new-form').onsubmit = (e) => {
  e.preventDefault();
  const name = $('#nf-name').value.trim().replace(/[^A-Za-z0-9_]/g, ''), from = $('#nf-from').value;
  if (!name || clipInfo(name)) { status('ตั้งชื่อใหม่ที่ยังไม่ซ้ำ (ตัวอักษรอังกฤษ/ตัวเลข)', 'bad'); return; }
  if (A.mode === 'keys') {
    undo.push(snapshot()); redo = [];
    const dur = clamp(+$('#nf-dur').value || 1.5, 0.1, 30), loop = $('#nf-loop').checked;
    let def;
    if (from === 'copy') { def = JSON.parse(JSON.stringify(KD() || reduceKeys(A.H, A.E, A.clip, levelOf(A.clip, 'mid')))); const f = dur / def.dur; for (const k of def.keys) k.t = r4(fpsSnap(k.t * f)); def.dur = dur; def.loop = loop; }
    else { const k0 = from === 'rest' ? restKey(0) : fullKey(0, A.t); def = { dur, loop, keys: loop ? [k0] : [k0, { ...JSON.parse(JSON.stringify(k0)), t: r4(dur) }] }; }
    if (!A.E.keyed) A.E.keyed = {};
    A.E.keyed[name] = def; applyEdits(A.H, A.E); A.dirty = true; $('#new-form').hidden = true; A.t = 0; selectClip(name); buildMoves();
    status('สร้างท่า “' + name + '” แล้ว: เลื่อนเวลา ขยับตัวละคร แล้วคีย์จะเกิดเอง', 'ok');
    return;
  }
  remember(); if (!A.E.made) A.E.made = {};
  A.E.made[name] = { from: from === 'rest' ? 'rest' : from === 'copy' ? { copy: A.clip } : { clip: A.clip, t: r5(A.t) }, dur: +$('#nf-dur').value || 1.5, loop: $('#nf-loop').checked };
  // what was laid over the source comes along, so the new clip starts out looking the same
  const src = A.E.clips && A.E.clips[A.clip];
  if (from !== 'rest' && src) { if (!A.E.clips) A.E.clips = {}; A.E.clips[name] = from === 'copy' ? JSON.parse(JSON.stringify(src)) : { rot: Object.fromEntries(Object.keys({ ...(src.rot || {}), ...Object.assign({}, ...(src.keys || []).map((k) => k.rot || {})) }).map((n) => [n, qmul(keyedNow(n), getDelta('clip', n)).map(r5)]).filter(([, q]) => !isId(q))), keys: [] }; }
  applyEdits(A.H, A.E); A.dirty = true; $('#new-form').hidden = true; A.t = 0; selectClip(name); buildMoves();
};
$('#actions').append(...[...ACTIONS, ['dash', 'พุ่ง'], ['dead', 'ล้ม / ลุก']].map(([path, label]) => { const b = el('button', { textContent: label }); b.onclick = () => { if (path === 'dead') { if (A.mode !== 'game') setMode('game'); game.setDead(!game.dead); } else if (path === 'dash') { if (A.mode !== 'game') setMode('game'); game.play('dash', 0.28); } else act(path); }; return b; }));
$('#mv-action').onchange = buildMoves;
$('#mv-play').onclick = () => { setMode('game'); act($('#mv-action').value); };
$('#mv-reset').onclick = () => { const [name] = movePath(); if (A.E.moves && A.E.moves[name]) { remember(); delete A.E.moves[name]; A.dirty = true; buildMoves(); } };
$('#sw-reset').onclick = () => { if (A.E.sword) { remember(); delete A.E.sword; A.dirty = true; buildSword(); } };
$('#f-copy').onclick = async () => { const text = JSON.stringify(A.E); $('#f-text').value = text; try { await navigator.clipboard.writeText(text); status('คัดลอกแล้ว', 'ok'); } catch { $('#f-text').select(); status('เลือกข้อความไว้ให้แล้ว กด Ctrl+C'); } };
$('#f-load').onclick = () => { try { loadEdits(JSON.parse($('#f-text').value)); status('โหลดจากข้อความแล้ว', 'ok'); } catch { status('ข้อความไม่ใช่ JSON ที่ถูกต้อง', 'bad'); } };
$('#f-clear').onclick = () => { $('#f-confirm').hidden = false; };
$('#f-no').onclick = () => { $('#f-confirm').hidden = true; };
$('#f-yes').onclick = () => { $('#f-confirm').hidden = true; loadEdits({}); status('ล้างการแก้ทั้งหมดแล้ว (ยังไม่ได้บันทึก)'); };
$('#f-download').onclick = async () => { try { await downloads.save({ filename: A.id + '.edits.json', data: JSON.stringify(A.E, null, 1) }); } catch { status('ไม่ได้บันทึกไฟล์'); } };
$('#char').onchange = (e) => open(e.target.value);
$('#imp-send').onclick = sendModel;
$('#help-btn').onclick = () => { $('#help').hidden = !$('#help').hidden; };
$('#help-close').onclick = () => { $('#help').hidden = true; try { localStorage.setItem('ng-animator:seen', '1'); } catch { /* no storage here */ } };
addEventListener('keydown', (e) => {
  if (/input|textarea|select/i.test(e.target.tagName) && e.target.type !== 'range') return;
  if (e.code === 'Space') { e.preventDefault(); $('#tl-play').click(); }
  else if (e.code === 'ArrowLeft') stepFrame(-1); else if (e.code === 'ArrowRight') stepFrame(1);
  else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
  else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); doRedo(); }
});

// ---------------------------------------------------------------- frame
let last = performance.now(), ang = 0;
function frame(dt) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
  if (actor) {
    if (A.mode === 'game' && game) {
      const run = $('#g-run').checked || $('#g-circle').checked, k = $('#g-slow').checked ? 0.25 : 1, step = dt * k;
      if ($('#g-circle').checked) { ang += (6.2 / 3.2) * step; game.group.position.set(Math.cos(ang) * 3.2, 0, -Math.sin(ang) * 3.2); game.group.rotation.y = ang + Math.PI; }
      else { game.group.position.set(0, 0, 0); game.group.rotation.y = 0; }
      game.update(step, run ? 6.2 : 0);
      cam.target.x += (game.group.position.x - cam.target.x) * 0.2; cam.target.z += (game.group.position.z - cam.target.z) * 0.2;
    } else if (A.playing) {
      const c = clipInfo(); A.t += dt * A.speed;
      if (A.t >= c.dur) { if (c.loop) A.t %= c.dur; else { A.t = c.dur; A.playing = false; } }
      refresh();
    }
  }
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.target.x + Math.sin(cam.yaw) * cp * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * cp * cam.dist);
  camera.lookAt(cam.target); camera.updateMatrixWorld();
  sun.position.set(cam.target.x + 2.5, 5, cam.target.z + 3.5); sun.target.position.set(cam.target.x, 0, cam.target.z);
  if (actor && A.mode !== 'game') placeHandles();
  if (actor) placeGizmo();
  renderer.render(scene, camera);
}
function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!A.manual) frame(dt); requestAnimationFrame(loop); }

// ---------------------------------------------------------------- for scripts (and for Claude): the same operations by name
window.animator = {
  state: A, frame, refresh, open, save, loadEdits, act,
  get edits() { return A.E; }, get hero() { return A.H; }, get actor() { return A.mode === 'game' ? game : actor; },
  clip(name, t = 0) { A.t = t; selectClip(name); }, time(t) { A.t = clamp(t, 0, clipInfo().dur); refresh(); },
  scope(s) { A.scope = s; $('#scope').value = s; syncInspector(true); }, mode: setMode, select: (name) => select(idx(name)),
  // the keyframe room: turn a clip into keys, list them, move one in time, remove one, make a clip from nothing
  convert(name = A.clip, level = 'mid') { undo.push(snapshot()); redo = []; A.clip = name; const def = convertClip(name, level); selectClip(name); return def; },
  keys(name = A.clip) { const K = KD(name); return K ? K.keys.map((k) => k.t) : null; },
  moveKey(from, to) { const K = KD(), k = K && keyNear(K.keys, from); if (!k) return false; remember(); k.t = r4(fpsSnap(to)); K.keys.sort((a, b) => a.t - b.t); rebake(); A.dirty = true; refresh(); return true; },
  removeKey(t) { const K = KD(), i = K ? K.keys.findIndex((k) => Math.abs(k.t - t) < 0.5 / fps()) : -1; if (i < 0 || K.keys.length < 2) return false; remember(); K.keys.splice(i, 1); rebake(); A.dirty = true; refresh(); return true; },
  newClip(name, { dur = 1.5, loop = false, from = 'rest' } = {}) { undo.push(snapshot()); redo = []; const k0 = from === 'rest' ? restKey(0) : fullKey(0, A.t); if (!A.E.keyed) A.E.keyed = {}; A.E.keyed[name] = { dur, loop, keys: loop ? [k0] : [k0, { ...JSON.parse(JSON.stringify(k0)), t: r4(dur) }] }; applyEdits(A.H, A.E); A.dirty = true; A.t = 0; selectClip(name); buildMoves(); },
  move(name, offset) { remember(); pose(actor, A.E); moveBone(idx(name), new THREE.Vector3(...offset)); refresh(); },
  ringAt(x, y) { const h = pickRing(x, y); return h ? h.object.userData.axis : null; }, // which ring is under a point of the view (for tests)
  // turn a part by `deg` about axis 'x' | 'y' | 'z': its own axes, or the character's with local false (what the rings do)
  spin(name, axis, deg, local = true) { const i = idx(name); remember(); pose(actor, A.E); const n = new THREE.Vector3(+(axis === 'x'), +(axis === 'y'), +(axis === 'z')); if (local) n.applyQuaternion(actor.bones[i].getWorldQuaternion(new THREE.Quaternion())); rotateWorld(i, new THREE.Quaternion().setFromAxisAngle(n, deg * DEG)); refresh(); },
  // angles in degrees about the character's own axes: [nod, turn, tilt]; added to what is there unless absolute
  turn(name, deg, absolute = false) { const i = idx(name); remember(); const e = absolute ? [0, 0, 0] : eulerOf(i); setEuler(i, [e[0] + deg[0], e[1] + deg[1], e[2] + deg[2]]); refresh(); },
  twist(name, deg) { const i = idx(name); remember(); pose(actor, A.E); placeHandles(); rotateWorld(i, new THREE.Quaternion().setFromAxisAngle(boneAxis(i), deg * DEG)); refresh(); },
  reach(name, offset) { const i = idx(name), h = handles.find((k) => k.bone === i && !k.tip); remember(); pose(actor, A.E); placeHandles(); ik(h.drag.chain, h.pos.clone().add(new THREE.Vector3(...offset))); refresh(); },
  hips(offset) { remember(); moveHips(new THREE.Vector3(...offset)); refresh(); },
  key() { remember(); addKey(); A.dirty = true; refresh(); },
  view(v) { if (typeof v === 'string') [cam.yaw, cam.pitch, cam.dist] = VIEWS[v]; else Object.assign(cam, v.target ? { ...v, target: new THREE.Vector3(...v.target) } : v); },
  where(name) { pose(actor, A.E); return wpos(idx(name)).toArray().map((v) => +v.toFixed(4)); },
};

(async () => {
  try { db = await Promise.race([window.claude ? window.claude.use('db') : null, new Promise((r) => setTimeout(() => r(null), 4000))]); } catch { db = null; }
  try { downloads = window.claude ? await Promise.race([window.claude.use('downloads'), new Promise((r) => setTimeout(() => r(null), 1500))]) : null; } catch { downloads = null; }
  try { assets = window.claude ? await Promise.race([window.claude.use('assets'), new Promise((r) => setTimeout(() => r(null), 2500))]) : null; } catch { assets = null; }
  showInbox();
  $('#f-download').hidden = !downloads;
  const sel = $('#char'); for (const id of Object.keys(CHAR)) sel.append(el('option', { value: id, textContent: CHAR[id].label || id }));
  await open(new URLSearchParams(location.search).get('char') || Object.keys(CHAR)[0]);
  try { if (!localStorage.getItem('ng-animator:seen')) $('#help').hidden = false; } catch { /* no storage here */ }
  window.animatorReady = true;
  requestAnimationFrame(loop);
})().catch((e) => { console.error(e); status('เปิดไม่ได้: ' + (e && e.message || e), 'bad'); });
