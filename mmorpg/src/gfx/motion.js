// Motion data for a rigged character (assets/env/*.anim, packed by dev/build_char.py) and the edits laid
// over it. The clips come from a motion library; the edits are what an animator changes on top of them in
// dev/animator.html, kept apart from the clips so that nothing is ever lost:
//
//   { all:   { rot: { BoneName: [x, y, z, w] }, hips: [x, y, z] },          on every clip (posture)
//     clips: { name: { rot, hips, keys: [{ t, rot, hips, ease }] } },      on one clip: all of it, and keyed moments
//     made:  { name: { from: 'rest' | { clip, t } | { copy: clip }, dur, loop } },   clips made in the editor
//     moves, sword, params }                                               overrides of the manifest's values
//
// A rotation is laid on in the frame of the bone's parent (final = edit * clip), so 'the arm ten degrees
// closer to the body' means the same whatever the arm is doing. hips is added to the hips' position, in the
// rig's own units. Between keys the edit is interpolated; before the first and after the last it holds
// (in a looping clip it wraps round).
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

const clipOf = (H, name) => H.raw.clips[name] || (H.made && H.made[name]) || null;

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
export function hipsAt(H, edits, clipName, t, out = [0, 0, 0]) {
  out[0] = out[1] = out[2] = 0;
  if (!edits) return out;
  const add = (v) => { if (v) { out[0] += v[0]; out[1] += v[1]; out[2] += v[2]; } };
  add(edits.all && edits.all.hips);
  const L = edits.clips && edits.clips[clipName];
  if (L) { add(L.hips); if (L.keys && L.keys.length) add(keyed(H, L.keys, clipName, t, (key) => key.hips || Z3, (a, b, f, o) => { o[0] = a[0] + (b[0] - a[0]) * f; o[1] = a[1] + (b[1] - a[1]) * f; o[2] = a[2] + (b[2] - a[2]) * f; return o; }, _h)); }
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

// Every bone's rotation in one clip at one moment, edits included: Q (bones * 4) and the hips' position P (3).
export function poseAt(H, edits, clipName, t, Q, P) {
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
  const out = {}, hr = qinv(B[hips].r), Q = new Float32Array(N * 4), P = [0, 0, 0], q = [], h = [];
  const edited = (name) => {
    const s = new Set(), add = (o) => { if (o) for (const k in o) s.add(k); };
    if (edits) { add(edits.all && edits.all.rot); const L = edits.clips && edits.clips[name]; if (L) { add(L.rot); for (const key of L.keys || []) add(key.rot); } }
    return s;
  };
  for (const name of [...Object.keys(H.raw.clips), ...Object.keys(H.made)]) {
    const c = clipOf(H, name), E = c.additive ? new Set() : edited(name);
    const times = new Float32Array(c.frames);
    for (let f = 0; f < c.frames; f++) times[f] = f / fps;
    const has = (i) => !!c.rot[i] || E.has(B[i].name);
    const rot = {}; for (let i = 0; i < N; i++) if (has(i)) rot[i] = new Float32Array(c.frames * 4);
    const pos = new Float32Array(c.frames * 3), top = new Float32Array(c.frames * 4);
    for (let f = 0; f < c.frames; f++) {
      poseAt(H, edits, name, times[f], Q, P);
      for (const i in rot) for (let j = 0; j < 4; j++) rot[i][f * 4 + j] = Q[i * 4 + j];
      pos[f * 3] = P[0]; pos[f * 3 + 1] = P[1]; pos[f * 3 + 2] = P[2];
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
    const moved = !!c.pos[hips] || pos.some((v, k) => Math.abs(v - B[hips].t[k % 3]) > 1e-6);
    if (moved) low.push(new THREE.VectorKeyframeTrack(B[hips].id + '.position', times, pos));
    const entry = out[name] = { name, loop: c.loop, additive: c.additive, dur: c.dur };
    const clip = (part, tracks) => new THREE.AnimationClip(name + '.' + part, c.dur, tracks);
    if (c.additive) entry.up = THREE.AnimationUtils.makeClipAdditive(clip('up', up), 0, undefined, fps);
    else if (c.whole) entry.whole = clip('whole', low.concat(up));
    else { entry.low = clip('low', low); entry.up = clip('up', up); if (!c.loop) entry.top = clip('top', over); }
  }
  return out;
}
