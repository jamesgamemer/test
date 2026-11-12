// Motion data for a rigged character (assets/env/*.anim, packed by dev/build_char.py) and the edits laid
// over it. The clips come from a motion library; the edits are what an animator changes on top of them in
// dev/animator.html, kept apart from the clips so that nothing is ever lost:
//
//   { all:   { rot: { BoneName: [x, y, z, w] }, pos: { BoneName: [x, y, z] } },   on every clip (posture)
//     clips: { name: { rot, pos, keys: [{ t, rot, pos, ease }] } },      on one clip: all of it, and keyed moments
//     made:  { name: { from: 'rest' | { clip, t } | { copy: clip }, dur, loop } },   clips made in the editor
//     keyed: { name: { dur, loop, keys: [{ t, q: { BoneName: [x, y, z, w] }, p: { BoneName: [x, y, z] }, ease }] } },
//     moves, sword, params }                                               overrides of the manifest's values
//
// all / clips are laid OVER a clip: a rotation is laid on in the frame of the bone's parent (final = edit *
// clip), so 'the arm ten degrees closer to the body' means the same whatever the arm is doing; pos is added
// to a bone's position, in the rig's own units (the hips, and pieces such as a sword; `hips` is the old
// spelling of pos.Hips). Between keys the edit is interpolated; before the first and after the last it
// holds (in a looping clip it wraps round).
//
// keyed IS a clip: whole poses at moments in time (every bone's own rotation, and the positions of those
// that move), with a smooth curve drawn through them. A keyed clip replaces the library clip of the same
// name, or is a new clip. This is how a clip is made from nothing, and how a library clip - which comes
// as thirty poses a second with nothing to take hold of - is turned into one that can be reshaped
// (reduceKeys finds the few poses that carry its motion).
import { THREE } from './common.js';

export const qmul = (a, b, o = []) => {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + ax * bw + ay * bz - az * by; o[1] = aw * by - ax * bz + ay * bw + az * bx;
  o[2] = aw * bz + ax * by - ay * bx + az * bw; o[3] = aw * bw - ax * bx - ay * by - az * bz;
  return o;
};
export const qinv = (a, o = []) => { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; o[3] = a[3]; return o; };
export const qnorm = (a) => { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; a[3] /= l; return a; };
export const qslerp = (a, b, t, o = []) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = 1;
  if (d < 0) { d = -d; s = -1; }
  let ka = 1 - t, kb = t;
  if (d < 0.9995) { const th = Math.acos(d), sn = Math.sin(th); ka = Math.sin((1 - t) * th) / sn; kb = Math.sin(t * th) / sn; }
  o[0] = a[0] * ka + b[0] * kb * s; o[1] = a[1] * ka + b[1] * kb * s; o[2] = a[2] * ka + b[2] * kb * s; o[3] = a[3] * ka + b[3] * kb * s;
  return qnorm(o);
};
const ID = [0, 0, 0, 1], Z3 = [0, 0, 0];
const isId = (q) => !q || (Math.abs(q[0]) + Math.abs(q[1]) + Math.abs(q[2]) < 1e-6);

// .anim: 'NGA1', header length, JSON header, then per clip the bone rotations (16-bit) and the hips' travel.
// Returns the clips as plain arrays: { fps, clips: { name: { loop, additive, whole, frames, dur, rot: { bone: Float32Array }, pos } } }
export function parseAnim(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x3141474e) throw new Error('not an animation file');
  const hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl))), off = 8 + hl;
  const out = { fps: head.fps, clips: {} };
  for (const c of head.clips) {
    const rot = {}, pos = {};
    const src = new Int16Array(buf, off + c.rot, c.frames * c.bones.length * 4);
    c.bones.forEach((b, k) => {
      const v = rot[b] = new Float32Array(c.frames * 4);
      for (let f = 0; f < c.frames; f++) for (let j = 0; j < 4; j++) v[f * 4 + j] = src[(f * c.bones.length + k) * 4 + j] / 32767;
    });
    const ps = new Float32Array(buf, off + c.pos, c.frames * c.moved.length * 3);
    c.moved.forEach((b, k) => {
      const v = pos[b] = new Float32Array(c.frames * 3);
      for (let f = 0; f < c.frames; f++) for (let j = 0; j < 3; j++) v[f * 3 + j] = ps[(f * c.moved.length + k) * 3 + j];
    });
    // whole: a clip that carries the figure across the ground (dying) is never split between legs and upper body
    out.clips[c.name] = { name: c.name, loop: !!c.loop, additive: !!c.additive, whole: !c.loop && !c.additive && !(c.top >= 0), frames: c.frames, dur: (c.frames - 1) / head.fps, rot, pos };
  }
  return out;
}

// The clips the editor made: a held pose, or a copy of another clip, to be shaped with keys.
export function madeClips(H, edits) {
  const out = {}, made = (edits && edits.made) || {};
  for (const name in made) {
    const m = made[name], fps = H.raw.fps, frames = Math.max(2, Math.round(m.dur * fps) + 1);
    const c = out[name] = { name, loop: !!m.loop, additive: false, whole: false, frames, dur: (frames - 1) / fps, rot: {}, pos: {}, made: true };
    const src = m.from && (m.from.clip || m.from.copy) ? H.raw.clips[m.from.clip || m.from.copy] : null;
    if (!src) continue; // 'rest': every bone as it was bound
    const copy = !!m.from.copy, t0 = copy ? 0 : m.from.t || 0;
    for (const kind of ['rot', 'pos']) {
      const n = kind === 'rot' ? 4 : 3;
      for (const b in src[kind]) {
        const v = c[kind][b] = new Float32Array(frames * n), s = src[kind][b];
        for (let f = 0; f < frames; f++) {
          const sf = Math.min(src.frames - 1, Math.round(copy ? (f / (frames - 1)) * (src.frames - 1) : t0 * fps));
          for (let j = 0; j < n; j++) v[f * n + j] = s[sf * n + j];
        }
      }
    }
  }
  return out;
}

// bones that are part of the rig's scaffolding, never animated
export const helperBone = (name) => /armature|head_?end|headfront/i.test(name);
const r4 = (v) => Math.round(v * 1e4) / 1e4;

// One bone's rotation ('q') or position ('p') at time t of a keyed clip: a smooth curve through its keys
// (a cubic through each pair, its slope at a key set by the keys on either side). `base` is what a key that
// does not mention the bone stands for. A key's `ease` says how the curve arrives at it: 'smooth' (default),
// 'linear', or 'hold' (the pose before it stays until it, then jumps).
export function sampleKeyed(def, t, kind, name, base, out = []) {
  const K = def.keys, n = K.length, dim = kind === 'q' ? 4 : 3;
  const val = (key) => (key[kind] && key[kind][name]) || base;
  const put = (v) => { for (let j = 0; j < dim; j++) out[j] = v[j]; return out; };
  if (!n) return put(base);
  const loop = !!def.loop && n > 1, dur = def.dur;
  let i = -1;
  for (let j = 0; j < n; j++) if (K[j].t <= t + 1e-9) i = j;
  if (!loop) { if (i < 0) return put(val(K[0])); if (i >= n - 1) return put(val(K[n - 1])); }
  // key j of the list (in a loop the list goes round and round)
  const at = (j) => { if (!loop) { const c = Math.max(0, Math.min(n - 1, j)); return [K[c], K[c].t]; } const c = ((j % n) + n) % n; return [K[c], K[c].t + Math.floor(j / n) * dur]; };
  const [k0, t0] = at(i - 1), [k1, t1] = at(i), [k2, t2] = at(i + 1), [k3, t3] = at(i + 2);
  const h = t2 - t1, ease = k2.ease || 'smooth';
  if (h < 1e-9 || ease === 'hold') return put(val(k1));
  const u = Math.min(1, Math.max(0, (t - t1) / h));
  let p0 = val(k0), p1 = val(k1), p2 = val(k2), p3 = val(k3);
  if (kind === 'q') { // the same turn can be written two ways: keep to the one nearest its neighbour
    const near = (a, b) => (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b);
    p0 = near(p1, p0); p2 = near(p1, p2); p3 = near(p2, p3);
  }
  if (ease === 'linear') for (let j = 0; j < dim; j++) out[j] = p1[j] + (p2[j] - p1[j]) * u;
  else {
    const u2 = u * u, u3 = u2 * u, a = 2 * u3 - 3 * u2 + 1, b = u3 - 2 * u2 + u, c = -2 * u3 + 3 * u2, d = u3 - u2;
    const s1 = t2 - t0 > 1e-9 ? h / (t2 - t0) : 0, s2 = t3 - t1 > 1e-9 ? h / (t3 - t1) : 0;
    for (let j = 0; j < dim; j++) out[j] = a * p1[j] + b * (p2[j] - p0[j]) * s1 + c * p2[j] + d * (p3[j] - p1[j]) * s2;
  }
  return kind === 'q' ? qnorm(out) : out;
}

// A keyed clip, sampled into the same form as a library clip (a pose for every frame)
export function bakeKeyed(H, name, def) {
  const fps = H.raw.fps, frames = Math.max(2, Math.round(def.dur * fps) + 1), raw = H.raw.clips[name], o = [];
  const c = { name, loop: !!def.loop, additive: !!(raw && raw.additive), whole: !!(raw && raw.whole), frames, dur: (frames - 1) / fps, rot: {}, pos: {}, keyed: true };
  const qs = new Set(), ps = new Set();
  for (const k of def.keys) { for (const b in k.q || {}) qs.add(b); for (const b in k.p || {}) ps.add(b); }
  H.bones.forEach((b, i) => {
    if (qs.has(b.name)) { const v = c.rot[i] = new Float32Array(frames * 4); for (let f = 0; f < frames; f++) { sampleKeyed(def, f / fps, 'q', b.name, b.r, o); for (let j = 0; j < 4; j++) v[f * 4 + j] = o[j]; } }
    if (ps.has(b.name)) { const v = c.pos[i] = new Float32Array(frames * 3); for (let f = 0; f < frames; f++) { sampleKeyed(def, f / fps, 'p', b.name, b.t, o); for (let j = 0; j < 3; j++) v[f * 3 + j] = o[j]; } }
  });
  return c;
}
export function keyedClips(H, edits) {
  const out = {}, K = (edits && edits.keyed) || {};
  for (const name in K) out[name] = bakeKeyed(H, name, K[name]);
  return out;
}

export const clipOf = (H, name) => (H.keyed && H.keyed[name]) || H.raw.clips[name] || (H.made && H.made[name]) || null;

// Turn a clip as it stands (what is laid over it included, but not the posture laid over every clip, which
// stays a layer of its own) into keys: start from its ends and keep adding the frame the curve misses by
// most, until it misses nowhere by more than `tol` degrees (or `ptol` rig units of position), or `max` keys.
export function reduceKeys(H, edits, clipName, { tol = 3, ptol = 1, max = 24 } = {}) {
  const c = clipOf(H, clipName);
  if (!c) return null;
  const fps = H.raw.fps, F = c.frames, N = H.bones.length, E = edits ? { ...edits, all: null } : null;
  const QQ = [], PP = [];
  for (let f = 0; f < F; f++) { const q = new Float32Array(N * 4), p = new Float32Array(N * 3); poseAt(H, E, clipName, f / fps, q, null, p); QQ.push(q); PP.push(p); }
  const turn = [], move = [];
  H.bones.forEach((b, i) => {
    if (helperBone(b.name)) return;
    if (QQ.some((q) => Math.abs(q[i * 4] * b.r[0] + q[i * 4 + 1] * b.r[1] + q[i * 4 + 2] * b.r[2] + q[i * 4 + 3] * b.r[3]) < 0.999995)) turn.push(i);
    if (PP.some((p) => Math.abs(p[i * 3] - b.t[0]) + Math.abs(p[i * 3 + 1] - b.t[1]) + Math.abs(p[i * 3 + 2] - b.t[2]) > 1e-4)) move.push(i);
  });
  const keyOf = (f) => {
    const k = { t: r4(f / fps), q: {}, p: {} };
    for (const i of turn) k.q[H.bones[i].name] = [0, 1, 2, 3].map((j) => r4(QQ[f][i * 4 + j]));
    for (const i of move) k.p[H.bones[i].name] = [0, 1, 2].map((j) => r4(PP[f][i * 3 + j]));
    return k;
  };
  const last = c.loop ? F - 2 : F - 1; // a loop's last frame is its first one again
  const picks = c.loop ? [0] : [0, F - 1], o = [];
  let def;
  for (;;) {
    def = { dur: c.dur, loop: c.loop, keys: picks.slice().sort((a, b) => a - b).map(keyOf) };
    if (picks.length >= max) break;
    let worst = -1, at = -1;
    for (let f = 1; f <= last; f++) {
      if (picks.includes(f)) continue;
      let e = 0;
      for (const i of turn) { const b = H.bones[i]; sampleKeyed(def, f / fps, 'q', b.name, b.r, o); const d = Math.abs(o[0] * QQ[f][i * 4] + o[1] * QQ[f][i * 4 + 1] + o[2] * QQ[f][i * 4 + 2] + o[3] * QQ[f][i * 4 + 3]); e = Math.max(e, 2 * Math.acos(Math.min(1, d)) * 57.2958 / tol); }
      for (const i of move) { const b = H.bones[i]; sampleKeyed(def, f / fps, 'p', b.name, b.t, o); e = Math.max(e, Math.hypot(o[0] - PP[f][i * 3], o[1] - PP[f][i * 3 + 1], o[2] - PP[f][i * 3 + 2]) / ptol); }
      if (e > worst) { worst = e; at = f; }
    }
    if (worst <= 1 || at < 0) break;
    picks.push(at);
  }
  return def;
}

// the edit to one bone of one clip at time t, as [x, y, z, w] in its parent's frame (null: none)
export function editAt(H, edits, clipName, t, boneName, out = []) {
  if (!edits) return null;
  const g = edits.all && edits.all.rot && edits.all.rot[boneName], L = edits.clips && edits.clips[clipName];
  const c = L && L.rot && L.rot[boneName];
  let k = null;
  if (L && L.keys && L.keys.length) k = keyed(H, L.keys, clipName, t, (key) => (key.rot && key.rot[boneName]) || ID, qslerp, _k);
  if (isId(g) && isId(c) && isId(k)) return null;
  out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1;
  if (!isId(g)) qmul(g, out, out);
  if (!isId(c)) qmul(c, out, out);
  if (!isId(k)) qmul(k, out, out);
  return qnorm(out);
}
const _k = [], _h = [];
const lerp3 = (a, b, f, o) => { o[0] = a[0] + (b[0] - a[0]) * f; o[1] = a[1] + (b[1] - a[1]) * f; o[2] = a[2] + (b[2] - a[2]) * f; return o; };
// what is added to one bone's position in one clip at time t, in the rig's units (null: nothing)
export function posAt(H, edits, clipName, t, boneName, out = [0, 0, 0]) {
  if (!edits) return null;
  const hips = boneName === H.bones[H.named.hips].name; // `hips` is the old spelling of pos.<the hips bone>
  const of = (o) => (o && ((o.pos && o.pos[boneName]) || (hips && o.hips))) || null;
  const g = of(edits.all), L = edits.clips && edits.clips[clipName], c = of(L);
  const keys = L && L.keys && L.keys.length && L.keys.some((k) => of(k)) ? L.keys : null;
  if (!g && !c && !keys) return null;
  out[0] = out[1] = out[2] = 0;
  const add = (v) => { if (v) { out[0] += v[0]; out[1] += v[1]; out[2] += v[2]; } };
  add(g); add(c);
  if (keys) add(keyed(H, keys, clipName, t, (key) => of(key) || Z3, lerp3, _h));
  return out;
}
export function hipsAt(H, edits, clipName, t, out = [0, 0, 0]) {
  const v = posAt(H, edits, clipName, t, H.bones[H.named.hips].name, out);
  if (!v) out[0] = out[1] = out[2] = 0;
  return out;
}
function keyed(H, keys, clipName, t, get, mix, out) {
  const n = keys.length;
  if (n === 1) return get(keys[0]);
  const clip = clipOf(H, clipName), loop = clip && clip.loop, dur = clip ? clip.dur : 0;
  let i = -1;
  for (let j = 0; j < n; j++) if (keys[j].t <= t) i = j;
  let a, b, ta, tb;
  if (i < 0) { if (!loop) return get(keys[0]); a = keys[n - 1]; b = keys[0]; ta = a.t - dur; tb = b.t; }
  else if (i === n - 1) { if (!loop) return get(keys[n - 1]); a = keys[n - 1]; b = keys[0]; ta = a.t; tb = b.t + dur; }
  else { a = keys[i]; b = keys[i + 1]; ta = a.t; tb = b.t; }
  let f = tb > ta ? (t - ta) / (tb - ta) : 0;
  if ((b.ease || 'smooth') === 'smooth') f = f * f * (3 - 2 * f);
  return mix(get(a), get(b), f, out);
}

// Every bone's rotation in one clip at one moment, edits included: Q (bones * 4), the hips' position P (3)
// and, if asked for, every bone's position PP (bones * 3).
export function poseAt(H, edits, clipName, t, Q, P, PP) {
  const clip = clipOf(H, clipName), B = H.bones, fps = H.raw.fps;
  let f0 = 0, f1 = 0, a = 0;
  if (clip) { const f = Math.max(0, Math.min(clip.frames - 1, t * fps)); f0 = Math.floor(f); f1 = Math.min(clip.frames - 1, f0 + 1); a = f - f0; }
  const qa = [], qb = [], q = [], d = [];
  for (let i = 0; i < B.length; i++) {
    const v = clip && clip.rot[i];
    if (v) { for (let j = 0; j < 4; j++) { qa[j] = v[f0 * 4 + j]; qb[j] = v[f1 * 4 + j]; } qslerp(qa, qb, a, q); }
    else { q[0] = B[i].r[0]; q[1] = B[i].r[1]; q[2] = B[i].r[2]; q[3] = B[i].r[3]; }
    const e = clip && clip.additive ? null : editAt(H, edits, clipName, t, B[i].name, d);
    if (e) qmul(e, q, q);
    Q[i * 4] = q[0]; Q[i * 4 + 1] = q[1]; Q[i * 4 + 2] = q[2]; Q[i * 4 + 3] = q[3];
  }
  if (P) {
    const h = H.named.hips, v = clip && clip.pos[h], e = clip && clip.additive ? Z3 : hipsAt(H, edits, clipName, t, d);
    for (let j = 0; j < 3; j++) P[j] = (v ? v[f0 * 3 + j] * (1 - a) + v[f1 * 3 + j] * a : B[h].t[j]) + e[j];
  }
  if (PP) for (let i = 0; i < B.length; i++) {
    const v = clip && clip.pos[i], e = clip && clip.additive ? null : posAt(H, edits, clipName, t, B[i].name, d);
    for (let j = 0; j < 3; j++) PP[i * 3 + j] = (v ? v[f0 * 3 + j] * (1 - a) + v[f1 * 3 + j] * a : B[i].t[j]) + (e ? e[j] : 0);
  }
}

// The clips as the game plays them, with the edits worked in. Each comes in parts, so that the legs can do
// one thing while the upper body does another: low (hips and legs), up (spine, arms, head) and, for a move,
// top - the upper body as it has to be played over legs that are running. A clip that carries the figure
// across the ground stays whole; an additive clip is kept as its difference from its own first frame.
export function buildClips(H, edits) {
  const B = H.bones, N = B.length, fps = H.raw.fps, hips = H.named.hips, spine = H.named.spine;
  const upper = new Set([spine]);
  B.forEach((b, i) => { if (upper.has(b.parent)) upper.add(i); }); // parents come before their children
  H.made = madeClips(H, edits);
  H.keyed = keyedClips(H, edits);
  const out = {}, hr = qinv(B[hips].r), Q = new Float32Array(N * 4), PP = new Float32Array(N * 3), q = [], h = [];
  const edited = (name) => {
    const s = new Set(), add = (o) => { if (o) for (const k in o) s.add(k); };
    if (edits) { add(edits.all && edits.all.rot); const L = edits.clips && edits.clips[name]; if (L) { add(L.rot); for (const key of L.keys || []) add(key.rot); } }
    return s;
  };
  // bones whose position something laid over the clips changes
  const shifted = (name) => {
    const s = new Set(), add = (o) => { if (o) { for (const k in o.pos || {}) s.add(k); if (o.hips) s.add(B[hips].name); } };
    if (edits) { add(edits.all); const L = edits.clips && edits.clips[name]; if (L) { add(L); for (const key of L.keys || []) add(key); } }
    return s;
  };
  for (const name of new Set([...Object.keys(H.raw.clips), ...Object.keys(H.made), ...Object.keys(H.keyed)])) {
    const c = clipOf(H, name), E = c.additive ? new Set() : edited(name), S = c.additive ? new Set() : shifted(name);
    const times = new Float32Array(c.frames);
    for (let f = 0; f < c.frames; f++) times[f] = f / fps;
    const has = (i) => !!c.rot[i] || E.has(B[i].name);
    const rot = {}; for (let i = 0; i < N; i++) if (has(i)) rot[i] = new Float32Array(c.frames * 4);
    const pos = {}; for (let i = 0; i < N; i++) if (c.pos[i] || S.has(B[i].name) || i === hips) pos[i] = new Float32Array(c.frames * 3);
    const top = new Float32Array(c.frames * 4);
    for (let f = 0; f < c.frames; f++) {
      poseAt(H, edits, name, times[f], Q, null, PP);
      for (const i in rot) for (let j = 0; j < 4; j++) rot[i][f * 4 + j] = Q[i * 4 + j];
      for (const i in pos) for (let j = 0; j < 3; j++) pos[i][f * 3 + j] = PP[i * 3 + j];
      // the spine over running legs: the hips' own turn (a fighting stance) goes into it, so the chest faces as it did
      for (let j = 0; j < 4; j++) { h[j] = Q[hips * 4 + j]; q[j] = Q[spine * 4 + j]; }
      qmul(qmul(hr, h, h), q, q);
      if (f > 0 && q[0] * top[f * 4 - 4] + q[1] * top[f * 4 - 3] + q[2] * top[f * 4 - 2] + q[3] * top[f * 4 - 1] < 0) { q[0] = -q[0]; q[1] = -q[1]; q[2] = -q[2]; q[3] = -q[3]; }
      for (let j = 0; j < 4; j++) top[f * 4 + j] = q[j];
    }
    const low = [], up = [], over = [];
    for (const i in rot) {
      const track = new THREE.QuaternionKeyframeTrack(B[i].id + '.quaternion', times, rot[i]);
      (upper.has(+i) ? up : low).push(track);
      if (upper.has(+i) && +i !== spine) over.push(track);
    }
    over.push(new THREE.QuaternionKeyframeTrack(B[spine].id + '.quaternion', times, top));
    for (const i in pos) {
      if (!c.pos[i] && !pos[i].some((v, k) => Math.abs(v - B[i].t[k % 3]) > 1e-6)) continue; // it never leaves its place
      const track = new THREE.VectorKeyframeTrack(B[i].id + '.position', times, pos[i]);
      (upper.has(+i) ? up : low).push(track);
      if (upper.has(+i)) over.push(track);
    }
    const entry = out[name] = { name, loop: c.loop, additive: c.additive, dur: c.dur };
    const clip = (part, tracks) => new THREE.AnimationClip(name + '.' + part, c.dur, tracks);
    if (c.additive) entry.up = THREE.AnimationUtils.makeClipAdditive(clip('up', up), 0, undefined, fps);
    else if (c.whole) entry.whole = clip('whole', low.concat(up));
    else { entry.low = clip('low', low); entry.up = clip('up', up); if (!c.loop) entry.top = clip('top', over); }
  }
  return out;
}
