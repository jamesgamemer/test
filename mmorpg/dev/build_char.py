#!/usr/bin/env python3
"""Pack a generated, rigged character for the game.

The hero is not modelled or animated in code: the design is a generated model sheet, lifted to a sculpt with
Higgsfield (Tripo image-to-3D), brought down to game resolution by dev/make_lowpoly.py (which also bakes the
sculpt's colour and detail into maps), and every move is a clip from a motion library: the rigging service
gives the model a skeleton and plays the clip on it. The prompts and clip ids are in dev/char_prompts.json.

    python3 dev/build_char.py <dir>

<dir>/hero/<clip>.glb is the character with one clip, for each clip in CLIPS; <dir>/hero/albedo.png and
normal.png are the maps make_lowpoly.py wrote (without them the model in the clip files is unwrapped afresh
here and keeps only its colour). The service rigs the model anew for every clip, a little differently each
time, so one file (RIG) provides the mesh and skeleton and the other clips are carried over onto it; the
script prints how far each joint ends up from where its own file has it. Writes assets/env/hero.skin (mesh +
skeleton), hero.anim (all clips, resampled to a fixed rate), hero_c.webp, hero_n.webp, and
src/gfx/char-manifest.js.

Needs Pillow, numpy and scipy (and xatlas when the maps are not given).
"""
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

from build_env import accessor, image_of, node_matrix, read_glb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'env')
FPS = 30
RIG = 'run'     # the clip file whose mesh, skeleton and skin weights the game uses
HEIGHT = 1.8   # metres, head to heel, as the game scales the hero
TEX = 2048      # the colour map's size
NORMAL_TEX = 2048  # the detail (normal) map's size
LIFT = {}       # degrees by which a bone is raised in every clip, e.g. dict(neck=6, head=8). Posture is corrected in the edit layer now (src/gfx/char-edits.js), where it can be seen and changed
CREASE = 180   # degrees: edges sharper than this stay sharp when the normals are smoothed (180: none do)

# Clips: file stem -> options. loop: the clip repeats. root: keep the hips' travel (default: taken out, the
# game moves the character itself). additive: played on top of whatever else the body is doing, as the
# difference from the clip's own first frame.
CLIPS = {
    'idle': dict(loop=True),        # Idle_02: weight on both feet, ready
    'stand': dict(loop=True),       # Idle: at ease
    'run': dict(loop=True),         # Run_02
    'sprint': dict(loop=True),      # Lean_Forward_Sprint: the dash
    'slash': {},                    # Left_Slash: a level cut from the right across to the left
    'charged': {},                  # Charged_Slash: a wound-up forehand, then a backhand that opens wide
    'chop': {},                     # Attack: both hands overhead, down into a crouch
    'spin': {},                     # Axe_Spin_Attack: one full turn ending in a wide sweep
    'cast': {},                     # Charged_Spell_Cast: gather low, then both arms thrown up
    'collect': {},                  # Collect_Object: kneel, pick something up, stand
    'flinch': dict(additive=True),  # Hit_Reaction_1: a short recoil
    'dead': {'root': True, 'from': 1.42},  # Dead, from where the knees give way (before that it staggers and steadies itself)
}
# What the hero does for each of the game's actions. Nothing here is posed by hand: a move plays part of a
# clip against the action's own clock. keys are (seconds since the action began, seconds into the clip);
# after the last key the clip runs on at `rate` until it reaches `end`. `fade` is how long the move takes to
# blend in, `out` how long it takes to give way to standing or running again. 'atk' has one entry per step of
# the sword combo, then the cut that throws a wave.
# If the hero is running, a move takes only the upper body and the legs keep running - unless it is `whole`,
# a move that is nothing without its footwork. `gain` plays an additive clip at less than its full strength.
# In the game a blow lands the moment it is ordered, so every attack starts at the top of its swing.
MOVES = {
    'atk': [
        [dict(clip='slash', keys=[(0, 0.64), (0.11, 0.79)], rate=1.1, end=1.36, out=0.26)],
        [dict(clip='charged', keys=[(0, 1.06), (0.14, 1.26)], rate=1.0, end=1.9, out=0.26)],
        [dict(clip='chop', keys=[(0, 0.92), (0.12, 1.16)], rate=1.5, end=1.95, out=0.3)],
        [dict(clip='charged', keys=[(0, 0.3), (0.12, 0.48)], rate=0.7, end=0.98, out=0.25)],
    ],
    'cast': [dict(clip='cast', keys=[(0, 1.52), (0.2, 1.84)], rate=0.9, end=2.6, out=0.3)],
    'ult': [dict(clip='spin', keys=[(0, 0.12), (1.2, 1.3)], rate=1.25, end=2.3, fade=0.12, out=0.35, whole=True)],
    'gather': [dict(clip='collect', keys=[(0, 0.7), (0.4, 1.2), (0.8, 1.6), (0.9, 3.4)], rate=1.0, end=4.4, fade=0.15, out=0.35, sword=False)],
    'hit': [dict(clip='flinch', keys=[(0, 0.06), (0.3, 0.42)], rate=1.0, end=0.9, fade=0.05, out=0.3, gain=0.42)],
}
# The sword (its own model, packed by build_env.py): length in metres; hold: the point along it (0 = tip,
# 1 = pommel) that sits in the fist; tilt: how far the blade rises from the line of the forearm toward the
# thumb, in degrees; palm: how far in front of the palm the grip's centre sits, in metres; blade: the span that cuts
# (for sword trails); glow: the part of the texture (measured down from the pommel) below which it may glow.
# The clips for standing and running were made for empty hands, so the sword is in the hand only while a
# move is played and otherwise hangs across the back: lean is how far it tips from upright there, in degrees.
SWORD = dict(length=1.08, hold=0.879, tilt=22, palm=0.022, blade=[0.72, 0.02], glow=0.27, lean=38, tuck=9)


def trs_of(node):
    t = np.array(node.get('translation', [0, 0, 0]), dtype=np.float64)
    r = np.array(node.get('rotation', [0, 0, 0, 1]), dtype=np.float64)
    s = np.array(node.get('scale', [1, 1, 1]), dtype=np.float64)
    if 'matrix' in node:  # decompose (no shear expected)
        m = np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
        t = m[:3, 3].copy()
        s = np.linalg.norm(m[:3, :3], axis=0)
        r = quat_from_matrix(m[:3, :3] / s)
    return t, r, s


def quat_from_matrix(m):
    tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0:
        k = np.sqrt(tr + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / k, (m[0, 2] - m[2, 0]) / k, (m[1, 0] - m[0, 1]) / k, 0.25 * k]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        k = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * k, (m[0, 1] + m[1, 0]) / k, (m[0, 2] + m[2, 0]) / k, (m[2, 1] - m[1, 2]) / k]
    elif m[1, 1] > m[2, 2]:
        k = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / k, 0.25 * k, (m[1, 2] + m[2, 1]) / k, (m[0, 2] - m[2, 0]) / k]
    else:
        k = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / k, (m[1, 2] + m[2, 1]) / k, 0.25 * k, (m[1, 0] - m[0, 1]) / k]
    return np.array(q)


def smooth_normals(P, I, crease=CREASE):
    """Vertex normals that ignore how the mesh was cut up for texturing.

    The generator unwraps the model into thousands of little texture islands and gives every island its own
    copy of the vertices on its border, each with the normal of its own patch: lit, the model looks faceted,
    like folded paper. Here every copy of a point gets the same normal - the average of all the faces that
    meet there, weighted by the angle each takes up - except across a real crease sharper than `crease` degrees."""
    key = np.round(P / 1e-5).astype(np.int64)
    _, at = np.unique(key, axis=0, return_inverse=True)
    at = at.reshape(-1)
    A, B, C = P[I[:, 0]], P[I[:, 1]], P[I[:, 2]]
    fn = np.cross(B - A, C - A)
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-20)

    def angle(u, v):
        u = u / np.maximum(np.linalg.norm(u, axis=1, keepdims=True), 1e-20)
        v = v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-20)
        return np.arccos(np.clip((u * v).sum(axis=1), -1, 1))
    corner = np.stack([angle(B - A, C - A), angle(C - B, A - B), angle(A - C, B - C)], axis=1)
    # the smooth normal of each point: every face around it
    full = np.zeros((at.max() + 1, 3))
    for k in range(3):
        np.add.at(full, at[I[:, k]], fn * corner[:, k:k + 1])
    full /= np.maximum(np.linalg.norm(full, axis=1, keepdims=True), 1e-20)
    out = full[at]
    if crease < 180:
        # a copy whose own faces turn away from that average by more than the crease angle keeps to its own side:
        # it averages only the faces around the point that lie within the crease angle of its own
        own = np.zeros((len(P), 3))
        for k in range(3):
            np.add.at(own, I[:, k], fn * corner[:, k:k + 1])
        own /= np.maximum(np.linalg.norm(own, axis=1, keepdims=True), 1e-20)
        sharp = np.nonzero((own * out).sum(axis=1) < np.cos(np.radians(crease) / 2))[0]
        if len(sharp):
            faces_at = {}
            for f in range(len(I)):
                for k in range(3):
                    faces_at.setdefault(at[I[f, k]], []).append((f, k))
            lim = np.cos(np.radians(crease))
            for v in sharp:
                acc = np.zeros(3)
                for f, k in faces_at[at[v]]:
                    if fn[f] @ own[v] > lim:
                        acc += fn[f] * corner[f, k]
                n = np.linalg.norm(acc)
                out[v] = acc / n if n > 1e-9 else own[v]
    return out


def load_rig(path):
    """The skinned mesh, its skeleton (every node from the scene root down to the joints) and its skin."""
    gltf, blob = read_glb(path)
    nodes = gltf['nodes']
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    mesh_node = next(i for i, n in enumerate(nodes) if 'mesh' in n and 'skin' in n)
    skin = gltf['skins'][nodes[mesh_node]['skin']]
    joints = skin['joints']
    # every joint plus its ancestors: the armature nodes above the hips carry the rig's scale and orientation
    keep = set()
    for j in joints:
        k = j
        while k is not None and k not in keep:
            keep.add(k)
            k = parent.get(k)
    order = []

    def walk(i):
        if i in keep:
            order.append(i)
            for c in nodes[i].get('children', []):
                walk(c)
    for r in gltf['scenes'][gltf.get('scene', 0)]['nodes']:
        walk(r)
    index = {n: k for k, n in enumerate(order)}
    bones = []
    for n in order:
        t, r, s = trs_of(nodes[n])
        bones.append(dict(name=nodes[n].get('name', f'node{n}'), parent=index.get(parent.get(n), -1), t=t, r=r, s=s))
    ibm = accessor(gltf, blob, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major -> row matrices
    prims = gltf['meshes'][nodes[mesh_node]['mesh']]['primitives']
    P, N, T, J, W, I, base = [], [], [], [], [], [], 0
    for prim in prims:
        at = prim['attributes']
        p = accessor(gltf, blob, at['POSITION'])
        P.append(p)
        N.append(accessor(gltf, blob, at['NORMAL']))
        T.append(accessor(gltf, blob, at['TEXCOORD_0']))
        J.append(accessor(gltf, blob, at['JOINTS_0']).astype(np.int64))
        W.append(accessor(gltf, blob, at['WEIGHTS_0']))
        I.append(accessor(gltf, blob, prim['indices']).astype(np.int64).reshape(-1) + base)
        base += len(p)
    P, N, T, J, W, I = np.concatenate(P), np.concatenate(N), np.concatenate(T), np.concatenate(J), np.concatenate(W), np.concatenate(I).reshape(-1, 3)
    N = smooth_normals(P, I)
    W = W / np.maximum(W.sum(axis=1, keepdims=True), 1e-9)
    J = np.vectorize(lambda j: index[joints[j]])(J)  # skin joint slot -> bone index
    full_ibm = np.tile(np.eye(4), (len(bones), 1, 1))
    for slot, n in enumerate(joints):
        full_ibm[index[n]] = ibm[slot]
    mat = gltf['materials'][prims[0].get('material', 0)]
    pbr = mat.get('pbrMetallicRoughness', {})
    colour = image_of(gltf, blob, pbr['baseColorTexture']['index']) if 'baseColorTexture' in pbr else None
    normal = image_of(gltf, blob, mat['normalTexture']['index']) if 'normalTexture' in mat else None
    return dict(gltf=gltf, blob=blob, nodes=nodes, order=order, index=index, bones=bones, ibm=full_ibm, P=P, N=N, T=T, J=J, W=W, I=I, colour=colour, normal=normal)


def world_matrices(bones, pose=None):
    out = []
    for k, b in enumerate(bones):
        t, r, s = pose[k] if pose is not None else (b['t'], b['r'], b['s'])
        m = node_matrix(dict(translation=list(t), rotation=list(r), scale=list(s)))
        out.append(out[b['parent']] @ m if b['parent'] >= 0 else m)
    return np.array(out)


def skinned(rig, world):
    """Vertex positions with the skeleton in the given world matrices (rest pose: where the model stands)."""
    M = world @ rig['ibm']
    P1 = np.c_[rig['P'], np.ones(len(rig['P']))]
    out = np.zeros((len(P1), 3))
    for k in range(4):
        out += rig['W'][:, k:k + 1] * np.einsum('nij,nj->ni', M[rig['J'][:, k]], P1)[:, :3]
    return out


def slerp(a, b, t):
    d = np.sum(a * b, axis=-1, keepdims=True)
    b = np.where(d < 0, -b, b)
    d = np.abs(d)
    th = np.arccos(np.clip(d, -1, 1))
    s = np.sin(th)
    near = s < 1e-5
    wa = np.where(near, 1 - t, np.sin((1 - t) * th) / np.where(near, 1, s))
    wb = np.where(near, t, np.sin(t * th) / np.where(near, 1, s))
    q = wa * a + wb * b
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def sample(times, values, at, quat=False):
    i = np.clip(np.searchsorted(times, at, side='right') - 1, 0, len(times) - 2) if len(times) > 1 else np.zeros(len(at), dtype=int)
    if len(times) == 1:
        return np.repeat(values[:1], len(at), axis=0)
    t0, t1 = times[i], times[i + 1]
    k = np.clip((at - t0) / np.maximum(t1 - t0, 1e-9), 0, 1)[:, None]
    return slerp(values[i], values[i + 1], k) if quat else values[i] * (1 - k) + values[i + 1] * k


def qmul(a, b):
    ax, ay, az, aw = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    bx, by, bz, bw = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz], axis=-1)


def qinv(q):
    return q * np.array([-1.0, -1.0, -1.0, 1.0])


def world_rotations(bones, local):
    """local: (frames, bones, 4) rotations -> the same in world space (parents come before children)."""
    out = np.zeros_like(local)
    for k, b in enumerate(bones):
        out[:, k] = qmul(out[:, b['parent']], local[:, k]) if b['parent'] >= 0 else local[:, k]
    return out


def load_clip(path, rig, spec):
    """One clip resampled at FPS and retargeted onto the base rig.

    Every clip file carries its own copy of the skeleton, and the service does not place the joints quite the
    same way twice. So the clip is not copied bone for bone: each bone's turn away from its own rest pose is
    measured in world space and applied to the base rig's rest pose, and the hips' travel is carried over as an
    offset from rest."""
    src = load_rig(path)
    gltf, blob, sb = src['gltf'], src['blob'], src['bones']
    if not gltf.get('animations'):
        return None
    anim = max(gltf['animations'], key=lambda a: len(a['channels']))
    node_bone = {n: k for k, n in enumerate(src['order'])}
    tracks, end = {}, 0.0
    for ch in anim['channels']:
        sm = anim['samplers'][ch['sampler']]
        bone = node_bone.get(ch['target']['node'])
        if bone is None or ch['target']['path'] == 'scale':
            continue
        t = accessor(gltf, blob, sm['input']).reshape(-1)
        v = accessor(gltf, blob, sm['output'])
        if sm.get('interpolation') == 'CUBICSPLINE':
            v = v.reshape(len(t), 3, -1)[:, 1]
        tracks[(bone, ch['target']['path'])] = (t, v)
        end = max(end, float(t[-1]))
    t0, t1 = spec.get('from', 0.0), spec.get('to', end)
    n = max(2, int(round((t1 - t0) * FPS)) + 1)
    at = np.linspace(t0, t1, n)
    s_rest = np.array([b['r'] for b in sb])
    s_rot = np.tile(s_rest[None], (n, 1, 1))
    s_hips = None
    hips_name = rig['bones'][name_bones(rig['bones'])['hips']]['name']
    for (bone, path_), (t, v) in tracks.items():
        if path_ == 'rotation':
            s_rot[:, bone] = sample(t, v / np.linalg.norm(v, axis=1, keepdims=True), at, quat=True)
        elif path_ == 'translation' and sb[bone]['name'] == hips_name:
            s_hips = sample(t, v, at) - sb[bone]['t']
    bones = rig['bones']
    b_rest = np.array([b['r'] for b in bones])
    sw, sw0 = world_rotations(sb, s_rot), world_rotations(sb, s_rest[None])[0]
    bw0 = world_rotations(bones, b_rest[None])[0]
    by_name = {b['name']: k for k, b in enumerate(sb)}
    bw = np.tile(bw0[None], (n, 1, 1))
    for k, b in enumerate(bones):
        j = by_name.get(b['name'])
        if j is not None:
            bw[:, k] = qmul(qmul(sw[:, j], qinv(sw0[j])), bw0[k])
        elif b['parent'] >= 0:  # a bone the clip does not know keeps its rest pose relative to its parent
            bw[:, k] = qmul(bw[:, b['parent']], b_rest[k])
    rot = np.zeros_like(bw)
    for k, b in enumerate(bones):
        rot[:, k] = qmul(qinv(bw[:, b['parent']]), bw[:, k]) if b['parent'] >= 0 else bw[:, k]
    rot /= np.linalg.norm(rot, axis=-1, keepdims=True)
    for f in range(1, n):  # keep neighbouring frames on the same side of the quaternion sphere
        flip = np.sum(rot[f] * rot[f - 1], axis=-1) < 0
        rot[f, flip] *= -1
    pos = np.tile(np.array([b['t'] for b in bones])[None], (n, 1, 1))
    moved = np.zeros(len(bones), bool)
    h = name_bones(bones)['hips']
    if s_hips is not None:
        pos[:, h] += s_hips
        moved[h] = True
    # how well did it carry over? joints of the clip's own skeleton against ours, frame by frame (hips' travel aside)
    worst, mean = 0.0, []
    for f in range(0, n, max(1, n // 24)):
        own = world_matrices(sb, [(sb[j]['t'], s_rot[f, j], sb[j]['s']) for j in range(len(sb))])
        ours = world_matrices(bones, [(bones[k]['t'], rot[f, k], bones[k]['s']) for k in range(len(bones))])
        d = [np.linalg.norm(own[by_name[b['name']]][:3, 3] - ours[k][:3, 3]) for k, b in enumerate(bones) if b['name'] in by_name]
        worst, mean = max(worst, max(d)), mean + [np.mean(d)]
    if not spec.get('root'):  # chin up: a fixed correction of posture, the same in every frame
        named = name_bones(bones)
        for key, deg in LIFT.items():
            k = named[key]
            # the hero's own sideways axis (x), seen from the bone's parent at rest
            pw = bw0[bones[k]['parent']]
            axis = np.array([1.0, 0.0, 0.0, 0.0])
            axis = qmul(qmul(qinv(pw), axis), pw)[:3]
            a = np.radians(-deg) / 2
            lift = np.append(axis / np.linalg.norm(axis) * np.sin(a), np.cos(a))
            rot[:, k] = qmul(lift[None], rot[:, k])
        rot /= np.linalg.norm(rot, axis=-1, keepdims=True)
    return dict(n=n, dur=float(t1 - t0), rot=rot, pos=pos, moved=moved, off=(float(np.mean(mean)), worst))


def stride_speed(rig, c, named, scale):
    """The speed a run clip was made for: how fast its planted foot travels backward under the hips."""
    bones = rig['bones']
    best = []
    for foot in (named['footL'], named['footR']):
        pos = []
        for f in range(c['n']):
            pose = [(c['pos'][f, k], c['rot'][f, k], b['s']) for k, b in enumerate(bones)]
            pos.append(world_matrices(bones, pose)[foot][:3, 3])
        pos = np.array(pos)
        low = pos[:, 1] < pos[:, 1].min() + 0.25 * (pos[:, 1].max() - pos[:, 1].min())   # frames where it is planted
        v = -(np.roll(pos[:, 2], -1) - pos[:, 2]) * FPS
        best.append(np.median(v[low & np.roll(low, -1)]))
    return float(np.mean(best) * scale)


def find(bones, *keys, avoid=()):
    """Index of the first bone whose name contains every key (names differ a little between rigs)."""
    for k, b in enumerate(bones):
        n = b['name'].lower().replace('_', '').replace(' ', '').replace('.', '')
        if all(key in n for key in keys) and not any(a in n for a in avoid):
            return k
    return None


FINGERS = ('thumb', 'index', 'middle', 'ring', 'pinky', 'little', 'finger', 'end')


def name_bones(bones):
    spines = [k for k, b in enumerate(bones) if 'spine' in b['name'].lower() or 'chest' in b['name'].lower()]
    return dict(
        hips=find(bones, 'hip') if find(bones, 'hip') is not None else find(bones, 'pelvis'),
        spine=spines[0], chest=spines[-1],
        neck=find(bones, 'neck'),
        head=find(bones, 'head', avoid=('end', 'top')),
        handR=find(bones, 'right', 'hand', avoid=FINGERS), handL=find(bones, 'left', 'hand', avoid=FINGERS),
        footR=find(bones, 'right', 'foot', avoid=FINGERS), footL=find(bones, 'left', 'foot', avoid=FINGERS),
    )


def segment_distance(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(float(ab @ ab), 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def cloth_weights(rig, rest, world, named, up, height):
    """How freely each vertex hangs (0..1). The rig has bones for the body only, so cloth is found by shape:
    a vertex well clear of every bone of the limb it is skinned to is mantle, waist cloth, pouch or hair."""
    bones = rig['bones']
    head = np.array([world[k][:3, 3] for k in range(len(bones))])
    children = {}
    for k, b in enumerate(bones):
        children.setdefault(b['parent'], []).append(k)
    # distance from each vertex to the nearest bone segment (a bone runs to each of its children)
    d = np.full(len(rest), 1e9)
    for k in range(len(bones)):
        for c in children.get(k, []):
            if np.linalg.norm(head[c] - head[k]) > 1e-6:
                d = np.minimum(d, segment_distance(rest, head[k], head[c]))
    dom = rig['J'][np.arange(len(rest)), rig['W'].argmax(axis=1)]
    names = [b['name'].lower() for b in bones]
    y = rest @ up
    region = np.array(['head' if ('head' in names[j] or 'neck' in names[j]) else
                       'leg' if any(s in names[j] for s in ('leg', 'foot', 'toe', 'thigh', 'calf', 'shin')) else
                       'arm' if any(s in names[j] for s in ('arm', 'hand', 'shoulder', 'clavicle')) or any(f in names[j] for f in FINGERS[:-1]) else
                       'body' for j in dom])
    u = height / 1.6  # the numbers below were measured on a hero 1.6 units tall
    # how thick the body itself is around its bones, per region; anything further out hangs loose
    thick = dict(body=0.11 * u, leg=0.105 * u, arm=0.075 * u, head=0.19 * u)
    reach = dict(body=0.07 * u, leg=0.07 * u, arm=0.06 * u, head=0.08 * u)
    gain = dict(body=1.0, leg=1.0, arm=1.0, head=0.35)
    # where each kind of cloth is sewn on, and how far below that it swings freely
    seam = dict(body=(1.12 * u, 0.35 * u), arm=(1.12 * u, 0.35 * u), leg=(0.80 * u, 0.30 * u))
    yy = y - y.min()
    w = np.zeros(len(rest))
    for r in thick:
        m = region == r
        k = np.clip((d[m] - thick[r]) / reach[r], 0, 1)
        k = k * k * (3 - 2 * k) * gain[r]
        if r in seam:
            top, span = seam[r]
            k *= np.clip((top - yy[m]) / span, 0.12, 1)
        w[m] = k
    # forearms, gauntlets and hands are rigid; so are the boots
    rigid = np.array([any(s in names[j] for s in ('forearm', 'hand')) or any(f in names[j] for f in FINGERS[:-1]) for j in dom])
    w[rigid] = 0
    w[yy < 0.16 * u] = 0
    return np.clip(w, 0, 1), region


def reatlas(rig, size, pad=6):
    """Unwrap the model afresh and repaint its texture into the new layout.

    The generator's own unwrapping cuts the surface into many thousands of scraps a few texels across, packed
    edge to edge. At any distance the scraps blur into one another and the figure turns to noise, and every
    scrap costs extra vertices. xatlas lays the surface out again in far fewer, larger charts with a margin
    round each; the painting is carried across triangle by triangle, so nothing is redrawn."""
    try:
        import xatlas
    except ImportError:
        print('xatlas is not installed: keeping the generator\'s own unwrapping (pip install xatlas)')
        return
    from build_env import bleed
    P, N, T, J, W, I = (rig[k] for k in 'PNTJWI')
    key = np.round(P / 1e-5).astype(np.int64)
    _, first, at = np.unique(key, axis=0, return_index=True, return_inverse=True)
    at = at.reshape(-1)
    atlas = xatlas.Atlas()
    atlas.add_mesh(P[first].astype(np.float32), at[I].astype(np.uint32))
    co, po = xatlas.ChartOptions(), xatlas.PackOptions()
    co.max_cost, co.max_iterations = 6.0, 2
    po.resolution, po.padding, po.bilinear, po.create_image = size, pad, True, False
    atlas.generate(co, po)
    vm, ind, uv = atlas[0]
    assert (vm[ind] == at[I]).all(), 'xatlas is expected to keep the triangles in order'
    src = np.asarray(rig['colour'].convert('RGB')).astype(np.float32)
    sh, sw = src.shape[:2]
    out = np.zeros((size, size, 3), np.float32)
    best = np.full((size, size), -1e9, np.float32)  # how far inside its triangle the texel that was written lies
    new, old = uv[ind] * size - 0.5, T[I]
    for t in range(len(ind)):
        a, b, c = new[t]
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-9:
            continue
        x0, x1 = max(0, int(np.floor(min(a[0], b[0], c[0]))) - 1), min(size - 1, int(np.ceil(max(a[0], b[0], c[0]))) + 1)
        y0, y1 = max(0, int(np.floor(min(a[1], b[1], c[1]))) - 1), min(size - 1, int(np.ceil(max(a[1], b[1], c[1]))) + 1)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        l0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / den
        l1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / den
        l2 = 1 - l0 - l1
        inside = np.minimum(np.minimum(l0, l1), l2)
        # texels just outside count too (so that edges and slivers are covered), but never over one that lies inside
        take = (inside > -0.8 / np.sqrt(abs(den))) & (inside > best[ys, xs])
        if not take.any():
            continue
        L = np.clip(np.stack([l0[take], l1[take], l2[take]], axis=1), 0, 1)
        L = L / L.sum(axis=1, keepdims=True) * 0.96 + 0.04 / 3   # a little toward the middle: stay clear of the old scrap's edge
        q = L @ old[t]
        fx, fy = np.clip(q[:, 0] * sw - 0.5, 0, sw - 1.001), np.clip(q[:, 1] * sh - 0.5, 0, sh - 1.001)
        ix, iy = fx.astype(int), fy.astype(int)
        gx, gy = (fx - ix)[:, None], (fy - iy)[:, None]
        col = (src[iy, ix] * (1 - gx) + src[iy, ix + 1] * gx) * (1 - gy) + (src[iy + 1, ix] * (1 - gx) + src[iy + 1, ix + 1] * gx) * gy
        out[ys[take], xs[take]] = col
        best[ys[take], xs[take]] = inside[take]
    cover = (best > -1e8).astype(np.float32)[..., None]
    out = np.where(cover > 0.5, out, bleed(out, cover, 2 * pad))
    print(f'unwrapped again: {len(P)} -> {len(vm)} vertices, {atlas.chart_count} charts, {100 * cover.mean():.0f}% of the texture used')
    rig.update(P=P[first][vm], N=N[first][vm], J=J[first][vm], W=W[first][vm], T=uv.astype(np.float64), I=ind.astype(np.int64),
               colour=Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB'))


def soften_face(rig, world, named):
    """Light the face the way drawn characters are lit: as if it were part of a ball.

    A sculpted face has eye sockets, a nose and a mouth, and a light from the side throws small hard shadows
    into each of them: right for a statue, wrong for a drawn face, whose features are painted. So the skin of
    the face (not the hair in front of it) leans its normals toward a ball fitted through it - the usual trick
    for anime-style faces - and the detail map is turned down there (the weight is returned for that).

    The face is found by colour and shape together: the skin-coloured part of the head's front gives a smooth
    surface, and whatever lies on that surface (eyes, brows and mouth are painted on it) is face; the fringe
    stands in front of it and is not."""
    from scipy.spatial import Delaunay
    bones, P, N, T = rig['bones'], rig['P'], rig['N'], rig['T']
    head, front = named['head'], find(bones, 'head', 'front')
    hb = world[head][:3, 3]
    up = np.array([0.0, 1.0, 0.0])
    fwd = world[front][:3, 3] - hb if front is not None else np.array([0.0, 0.0, 1.0])
    fwd = fwd - up * (fwd @ up)
    fwd /= np.linalg.norm(fwd)
    right = np.cross(up, fwd)
    names = [b['name'].lower() for b in bones]
    heads = [k for k, n in enumerate(names) if 'head' in n]
    share = np.zeros(len(P))  # how much of each vertex follows the head
    for k in range(4):
        share += rig['W'][:, k] * np.isin(rig['J'][:, k], heads)
    img = np.asarray(rig['colour'].convert('RGB')).astype(np.float32)
    ih, iw = img.shape[:2]
    c = img[np.clip((T[:, 1] * ih).astype(int), 0, ih - 1), np.clip((T[:, 0] * iw).astype(int), 0, iw - 1)]
    r, g, bl = c.T
    rel = P - hb
    x, y, z = rel @ right, rel @ up, rel @ fwd
    skin = (r > 165) & (g > 115) & (bl > 90) & (r >= g) & (g >= bl * 0.97) & (r - bl > 16) & (r - bl < 115) & (N @ fwd > 0.3) & (share > 0.6) & (y > 0)
    if skin.sum() < 200:
        return N, np.zeros(len(P))
    u = float(P[:, 1].max() - P[:, 1].min()) / 1.6  # the lengths below are for a figure 1.6 tall

    def basis(x, y):
        return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y, x ** 3, x * x * y, x * y * y, y ** 3, x ** 4, x * x * y * y, y ** 4], axis=1)
    keep = skin.copy()
    for _ in range(4):  # a smooth surface through the skin; points off it (a lock's edge, an ear) are dropped and it is fitted again
        coef = np.linalg.lstsq(basis(x[keep], y[keep]), z[keep], rcond=None)[0]
        res = z - basis(x, y) @ coef
        keep = skin & (np.abs(res) < max(0.004 * u, 2.2 * res[keep].std()))
    pts = np.stack([x[keep], y[keep]], axis=1)
    inside = Delaunay(pts[::max(1, len(pts) // 3000)]).find_simplex(np.stack([x, y], axis=1)) >= 0

    def step(a, b, v):
        t = np.clip((v - a) / (b - a), 0, 1)
        return t * t * (3 - 2 * t)
    w = inside * (share > 0.5) * (1 - step(0.005 * u, 0.012 * u, res)) * step(-0.035 * u, -0.018 * u, res)
    # soften the edge of the patch: a few rounds of averaging each point with its neighbours
    key = np.round(P / 1e-5).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    I = inv[rig['I']]
    n = inv.max() + 1
    ww = np.zeros(n)
    np.maximum.at(ww, inv, w)
    for _ in range(3):
        acc, cnt = ww.copy(), np.ones(n)
        for a_, b_ in ((0, 1), (1, 2), (2, 0)):
            np.add.at(acc, I[:, a_], ww[I[:, b_]]); np.add.at(cnt, I[:, a_], 1)
            np.add.at(acc, I[:, b_], ww[I[:, a_]]); np.add.at(cnt, I[:, b_], 1)
        ww = acc / cnt
    w = ww[inv]
    # the ball: fitted through the face's skin
    F = P[keep]
    A = np.c_[2 * F, np.ones(len(F))]
    sol = np.linalg.lstsq(A, (F * F).sum(axis=1), rcond=None)[0]
    centre = sol[:3]
    radius = float(np.sqrt(max(sol[3] + centre @ centre, 1e-12)))
    centre = centre - fwd * 0.25 * radius  # a little further back: a rounder, softer turn of the light across the cheeks
    ball = P - centre
    ball /= np.maximum(np.linalg.norm(ball, axis=1, keepdims=True), 1e-9)
    k = (w * 0.85)[:, None]
    out = N * (1 - k) + ball * k
    print(f'face: {int(keep.sum())} skin points, {int((w > 0.5).sum())} vertices lit as a ball of radius {radius:.3f}')
    return out / np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9), w


def sword_mount(rig, rest, world, named):
    """Where the sword's grip goes in the right hand, in that bone's own space.

    The rig has no finger bones and nothing says which way the palm faces, so it is read from the hand's
    shape: the hand is a slab, its thin direction is the palm's normal (turned toward the body), and the thumb
    side is forearm x palm. The motion library holds a sword as a continuation of the forearm, raised a little
    toward the thumb, with the glowing edge on the far side from the thumb - so that is how it sits here."""
    bones = rig['bones']
    h = named['handR']
    wrist, elbow = world[h][:3, 3], world[bones[h]['parent']][:3, 3]
    f = (wrist - elbow) / np.linalg.norm(wrist - elbow)
    dom = rig['J'][np.arange(len(rest)), rig['W'].argmax(axis=1)]
    V = rest[dom == h]
    c = V.mean(axis=0)
    _, axes = np.linalg.eigh(np.cov((V - c).T))
    n = axes[:, 0] - f * (axes[:, 0] @ f)
    n /= np.linalg.norm(n)
    if n @ (rest.mean(axis=0) - c) < 0:
        n = -n
    thumb = np.cross(f, n)
    tilt = np.radians(SWORD['tilt'])
    tip = f * np.cos(tilt) + thumb * np.sin(tilt)       # the way the blade points
    spine = thumb - tip * (thumb @ tip)
    spine /= np.linalg.norm(spine)                      # the model's +x, the back of the blade: on the thumb's side
    X, Y = spine, -tip                                  # the model stands point down: +y runs to the pommel
    R = np.stack([X, Y, np.cross(X, Y)], axis=1)
    hw = world[h]
    scale = np.linalg.norm(hw[:3, :3], axis=0)
    local = (hw[:3, :3] / scale).T @ R
    palm = c - f * 0.02 * (rest[:, 1].max() - rest[:, 1].min()) / 1.6 + n * SWORD['palm']
    grip = np.linalg.inv(hw) @ np.append(palm, 1.0)
    out = dict(grip=[round(float(v), 4) for v in grip[:3]], quat=[round(float(v), 5) for v in quat_from_matrix(local)])
    # across the back: flat against it behind the chest, grip over the right shoulder, point down to the left
    ci = named['chest']
    cw = world[ci]
    shoulder = world[find(bones, 'right', 'arm', avoid=('fore',))][:3, 3]
    near = (np.abs(rest[:, 0]) < 0.12) & (np.abs(rest[:, 1] - shoulder[1]) < 0.12)
    back = np.percentile(rest[near][:, 2], 2) - 0.03
    a, t = np.radians(SWORD['lean']), np.radians(SWORD.get('tuck', 0))
    X, Y = np.array([np.cos(a), np.sin(a), 0.0]), np.array([-np.sin(a), np.cos(a), 0.0])
    Y = Y * np.cos(t) + np.array([0.0, 0.0, -1.0]) * np.sin(t)  # the point tucked in toward the legs: the hood stands out further than the back below it
    R = np.stack([X, Y, np.cross(X, Y)], axis=1)
    at = np.array([shoulder[0] - 0.02, shoulder[1] + 0.05, back])
    out['back'] = dict(grip=[round(float(v), 4) for v in (np.linalg.inv(cw) @ np.append(at, 1.0))[:3]],
                       quat=[round(float(v), 5) for v in quat_from_matrix((cw[:3, :3] / np.linalg.norm(cw[:3, :3], axis=0)).T @ R)])
    return out


def main(src):
    os.makedirs(OUT, exist_ok=True)
    d = os.path.join(src, 'hero')
    rig = load_rig(os.path.join(d, RIG + '.glb'))
    if os.path.exists(os.path.join(d, 'albedo.png')):
        # the model was made by dev/make_lowpoly.py: it is unwrapped already, and its colour and its detail map
        # were baked from the sculpt into that layout (the rigging service gives the mesh back as it got it)
        rig['colour'] = Image.open(os.path.join(d, 'albedo.png')).convert('RGB')
        rig['normal'] = Image.open(os.path.join(d, 'normal.png')).convert('RGB') if os.path.exists(os.path.join(d, 'normal.png')) else None
    else:
        reatlas(rig, TEX)
        rig['normal'] = None
    bones = rig['bones']
    world = world_matrices(bones)
    rest = skinned(rig, world)
    named = name_bones(bones)
    # the rig's own up axis and size, so the game can stand the hero on y = 0 at HEIGHT metres
    lo, hi = rest.min(axis=0), rest.max(axis=0)
    up = np.array([0.0, 1.0, 0.0])
    scale = HEIGHT / (hi[1] - lo[1])
    print(f'{len(bones)} bones, {len(rest)} verts, {len(rig["I"])} tris; stands {hi[1] - lo[1]:.3f} tall from y {lo[1]:.3f}; x {lo[0]:.3f}..{hi[0]:.3f} z {lo[2]:.3f}..{hi[2]:.3f}')
    print('bones:', ' '.join(f'{k}:{b["name"]}' for k, b in enumerate(bones)))
    print('named:', {k: (bones[v]['name'] if v is not None else None) for k, v in named.items()})
    cloth, region = cloth_weights(rig, rest, world, named, up, hi[1] - lo[1])
    names = [b['name'].lower() for b in bones]
    share = lambda keys: sum(rig['W'][:, k] * np.isin(rig['J'][:, k], [i for i, n in enumerate(names) if any(key in n for key in keys)]) for k in range(4))
    # the chest rises with each breath (the ribs most, the belly and shoulders a little)
    breath = np.zeros(len(rest))
    chest_i, mid_i = named['chest'], bones[named['chest']]['parent']
    for k in range(4):
        breath += rig['W'][:, k] * ((rig['J'][:, k] == chest_i) * 1.0 + (rig['J'][:, k] == mid_i) * 0.55)
    breath = np.clip(breath + 0.3 * share(('shoulder',)), 0, 1)
    # loose cloth hangs from the chest and shoulders (the mantle, the hair) or from the hips (the waist cloth)
    upper = np.clip(share(('spine', 'neck', 'head', 'shoulder', 'arm', 'hand')) - (rig['W'] * (rig['J'] == named['spine'])).sum(axis=1), 0, 1)
    rig['N'], face = soften_face(rig, world, named)
    print('cloth: %.1f%% of vertices hang free (weight > 0.3)' % (100 * (cloth > 0.3).mean()), {r: int((region == r).sum()) for r in set(region)})

    # ---- skin
    P, N, T = rig['P'], rig['N'], rig['T']
    plo, phi = P.min(axis=0), P.max(axis=0)
    psize = np.maximum(phi - plo, 1e-9)
    tlo, thi = T.min(axis=0), T.max(axis=0)
    tsize = np.maximum(thi - tlo, 1e-9)
    q_nrm = np.zeros((len(N), 4), dtype='i1'); q_nrm[:, :3] = np.round(np.clip(N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9), -1, 1) * 127)
    # the four weights as bytes that sum to exactly 255
    wq = np.floor(rig['W'] * 255).astype(np.int64)
    wq[np.arange(len(wq)), rig['W'].argmax(axis=1)] += 255 - wq.sum(axis=1)
    wide = len(P) > 65535
    blocks, body = {}, b''
    for key, arr in (('pos', np.round((P - plo) / psize * 65535).astype('<u2')), ('nrm', q_nrm), ('uv', np.round((T - tlo) / tsize * 65535).astype('<u2')),
                     ('joints', rig['J'].astype('u1')), ('weights', wq.astype('u1')), ('soft', np.round(np.stack([cloth, breath, upper, face], axis=1) * 255).astype('u1')),
                     ('idx', rig['I'].astype('<u4' if wide else '<u2')), ('ibm', rig['ibm'].transpose(0, 2, 1).astype('<f4'))):
        raw = arr.tobytes()
        blocks[key] = [len(body), len(raw)]
        body += raw + b'\0' * (-len(raw) % 4)
    head = dict(verts=len(P), tris=len(rig['I']), min=[float(v) for v in plo], size=[float(v) for v in psize], uvMin=[float(v) for v in tlo], uvSize=[float(v) for v in tsize], wide=wide,
                bones=[dict(id=f'b{k}', name=b['name'], parent=b['parent'], t=[float(v) for v in b['t']], r=[float(v) for v in b['r']], s=[float(v) for v in b['s']]) for k, b in enumerate(bones)],
                named=named, scale=float(scale), lift=float(-lo[1] * scale), height=HEIGHT, blocks=blocks)
    hj = json.dumps(head).encode(); hj += b' ' * (-len(hj) % 4)
    with open(os.path.join(OUT, 'hero.skin'), 'wb') as f:
        f.write(b'NGS1' + struct.pack('<I', len(hj)) + hj + body)
    if rig['colour'] is not None:
        rig['colour'].convert('RGB').resize((TEX, TEX), Image.LANCZOS).save(os.path.join(OUT, 'hero_c.webp'), 'WEBP', quality=90, method=6)
    if rig['normal'] is not None:
        rig['normal'].resize((NORMAL_TEX, NORMAL_TEX), Image.LANCZOS).save(os.path.join(OUT, 'hero_n.webp'), 'WEBP', quality=90, method=6)

    # ---- clips
    hips = named['hips']
    parent_world = world[bones[hips]['parent']] if bones[hips]['parent'] >= 0 else np.eye(4)
    up_local = np.linalg.inv(parent_world[:3, :3]) @ up
    up_local /= np.linalg.norm(up_local)
    rest_r = np.array([b['r'] for b in bones])
    rest_world = world_rotations(bones, rest_r[None])[0]
    spine = named['spine']
    assert bones[spine]['parent'] == hips, 'the lowest spine bone is expected to hang from the hips'
    clips, data, meta = [], b'', {}
    for name, spec in CLIPS.items():
        path = os.path.join(d, name + '.glb')
        if not os.path.exists(path):
            print('missing clip', name); continue
        c = load_clip(path, rig, spec)
        if c is None:
            print('no animation in', path); continue
        # how fast the clip travels (before the travel is taken out): the game matches its playback to the hero's speed
        travel = c['pos'][-1, hips] - c['pos'][0, hips]
        travel = travel - up_local * (travel @ up_local)
        speed = float(np.linalg.norm(parent_world[:3, :3] @ travel) * scale / max(c['dur'], 1e-6))
        if not spec.get('root'):  # the game moves the character itself: keep only the hips' rise and fall
            off = c['pos'][:, hips] - bones[hips]['t']
            c['pos'][:, hips] = bones[hips]['t'] + np.outer(off @ up_local, up_local)
        if spec.get('loop'):  # make the last frame the first, so the cycle closes without a hitch
            k = min(6, c['n'] // 4)
            for f in range(k):
                a = (f + 1) / (k + 1)
                c['rot'][c['n'] - k + f] = slerp(c['rot'][c['n'] - k + f], c['rot'][0], a)
                c['pos'][c['n'] - k + f] = c['pos'][c['n'] - k + f] * (1 - a) + c['pos'][0] * a
        dots = np.abs(np.sum(c['rot'] * rest_r[None], axis=-1))
        used = [k for k in range(len(bones)) if dots[:, k].min() < 0.99999]
        moved = [k for k in range(len(bones)) if c['moved'][k] and np.abs(c['pos'][:, k] - bones[k]['t']).max() > 1e-5]
        rot = np.round(c['rot'][:, used] * 32767).astype('<i2').tobytes()
        pos = c['pos'][:, moved].astype('<f4').tobytes()
        entry = dict(name=name, frames=c['n'], loop=bool(spec.get('loop')), additive=bool(spec.get('additive')), bones=used, moved=moved, rot=len(data), top=-1)
        data += rot + b'\0' * (-len(rot) % 4)
        entry['pos'] = len(data)
        data += pos + b'\0' * (-len(pos) % 4)
        if not spec.get('loop') and not spec.get('root') and not spec.get('additive'):
            # A move's upper body on top of running legs: in the clip the hips may be turned (a fighting stance) and
            # the spine turned back against them. On legs that run straight ahead the spine must carry the hips' turn
            # too, so that the chest still faces where it faced in the clip.
            wr = world_rotations(bones, c['rot'])
            top = qmul(qmul(qinv(rest_world[hips])[None], wr[:, hips]), c['rot'][:, spine])
            top /= np.linalg.norm(top, axis=-1, keepdims=True)
            for f in range(1, c['n']):
                if top[f] @ top[f - 1] < 0:
                    top[f] *= -1
            entry['top'] = len(data)
            data += np.round(top * 32767).astype('<i2').tobytes()
        clips.append(entry)
        meta[name] = {}
        if name == 'run':  # how fast the ground has to pass under the feet for them not to slide
            meta[name]['speed'] = round(stride_speed(rig, c, named, scale), 2)
            speed = meta[name]['speed']
        print(f'{name:7s} {c["n"]:4d} frames {c["dur"]:.2f}s  {len(used)} bones turn, {len(moved)} move  travel {speed:.2f} m/s  joints off by {c["off"][0] * 100:.1f} cm on average, {c["off"][1] * 100:.1f} cm at worst')
    hj = json.dumps(dict(fps=FPS, clips=clips)).encode(); hj += b' ' * (-len(hj) % 4)
    with open(os.path.join(OUT, 'hero.anim'), 'wb') as f:
        f.write(b'NGA1' + struct.pack('<I', len(hj)) + hj + data)
    man = dict(skin='hero.skin', anim='hero.anim', map='hero_c.webp', normal='hero_n.webp' if rig['normal'] is not None else None, clips=meta, moves=MOVES, sword=dict(SWORD, **sword_mount(rig, rest, world, named)))
    with open(os.path.join(ROOT, 'src', 'gfx', 'char-manifest.js'), 'w') as f:
        f.write('// Generated by dev/build_char.py — the rigged hero in assets/env/.\n')
        f.write('// moves: for each of the game\'s actions, which part of which clip plays when (see MOVES in the build script).\n')
        f.write('// sword: how the sword model sits in the right-hand bone.\n')
        f.write('export const CHAR = { hero: {\n')
        for key, val in man.items():
            if key in ('clips', 'moves'):
                f.write(f'  {key}: {{\n' + ''.join(f'    {k}: {json.dumps(v)},\n' for k, v in val.items()) + '  },\n')
            else:
                f.write(f'  {key}: {json.dumps(val)},\n')
        f.write('} };\n')
    kb = sum(os.path.getsize(os.path.join(OUT, f)) for f in ('hero.skin', 'hero.anim', 'hero_c.webp', 'hero_n.webp') if os.path.exists(os.path.join(OUT, f))) // 1024
    print(f'hero: {kb} KB')
    return rig, rest, cloth


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
