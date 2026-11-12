#!/usr/bin/env python3
"""Give a bare, unrigged figure a skeleton and skin weights, by its shape alone.

    python3 dev/auto_rig.py <model.glb> <out dir> [--yaw 0] [--height 1.6]

For a clean body standing in an A-pose (arms held away from the sides, legs apart): a base figure, a doll,
anything without loose clothing that would join its limbs together. The figure must face +z (turn it with
--yaw; a Tripo sculpt faces +x, so --yaw -90). Nothing is sent anywhere and nothing is guessed from
pictures: every joint is found on the mesh itself.

  1. The mesh is read as a surface that can be walked on (points that share a place are one point). Raising
     a water level from the floor, the two feet stay on separate islands until the level reaches the
     crotch, and a hand stays apart from the body until it reaches the armpit: those two levels, and the
     narrowest ring above the shoulders (the neck), give the figure's build.
  2. Joints are put on the middle line of each limb: hip, knee, ankle and toe down a leg; shoulder, elbow
     and wrist along an arm; pelvis, three spine joints, neck and head up the trunk. The skeleton has the
     same bones and names as the one the rigging service makes, so everything written for that one - the
     game, the animator, clips carried over from another character - works on this one too.
  3. Every point follows the bone of the part it belongs to, and near a joint it is shared between the two
     bones that meet there, a little wider on a thick limb than on a thin one; the result is then smoothed
     along the surface.

Writes <out>/rig.glb: the figure with its skeleton and skin, as dev/build_char.py reads it. Prints what it
found, as shares of the figure's height, so that it can be checked against the drawing.

Needs Pillow, numpy and scipy.
"""
import argparse
import io
import json
import os
import struct

import numpy as np

from build_env import load_model, rot_y
from build_char import smooth_normals

# name, parent: the same bones, in the same order, as the rigging service's skeleton
BONES = [('Armature', None), ('Hips', 'Armature'), ('Spine02', 'Hips'), ('Spine01', 'Spine02'), ('Spine', 'Spine01'), ('neck', 'Spine'), ('Head', 'neck'),
         ('head_end', 'Head'), ('headfront', 'Head'),
         ('LeftShoulder', 'Spine'), ('LeftArm', 'LeftShoulder'), ('LeftForeArm', 'LeftArm'), ('LeftHand', 'LeftForeArm'),
         ('RightShoulder', 'Spine'), ('RightArm', 'RightShoulder'), ('RightForeArm', 'RightArm'), ('RightHand', 'RightForeArm'),
         ('LeftUpLeg', 'Hips'), ('LeftLeg', 'LeftUpLeg'), ('LeftFoot', 'LeftLeg'), ('LeftToeBase', 'LeftFoot'),
         ('RightUpLeg', 'Hips'), ('RightLeg', 'RightUpLeg'), ('RightFoot', 'RightLeg'), ('RightToeBase', 'RightFoot')]


def step(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def weld(P, I):
    key = np.round(P / 1e-5).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    W = inv[I]
    return P[first], inv, W[(W[:, 0] != W[:, 1]) & (W[:, 1] != W[:, 2]) & (W[:, 0] != W[:, 2])]


class Islands:
    """Points joined into islands as they are added (union-find)."""

    def __init__(self, n):
        self.p = np.arange(n)

    def find(self, i):
        p = self.p
        while p[i] != i:
            p[i] = p[p[i]]
            i = p[i]
        return i

    def join(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            self.p[b] = a


def flood_levels(P, nbr, pairs):
    """Raise a level from the floor: for each pair of points, the height at which they first stand on one island."""
    order = np.argsort(P[:, 1])
    isl, wet, out = Islands(len(P)), np.zeros(len(P), bool), [None] * len(pairs)
    for v in order:
        wet[v] = True
        for u in nbr[v]:
            if wet[u]:
                isl.join(v, u)
        for k, (a, b) in enumerate(pairs):
            if out[k] is None and wet[a] and wet[b] and isl.find(a) == isl.find(b):
                out[k] = float(P[v, 1])
        if all(o is not None for o in out):
            break
    return out


def island_of(P, nbr, seed, keep):
    """Every kept point that can be reached from the seed through kept points."""
    seen = np.zeros(len(P), bool)
    if not keep[seed]:
        return seen
    stack, seen[seed] = [seed], True
    while stack:
        v = stack.pop()
        for u in nbr[v]:
            if keep[u] and not seen[u]:
                seen[u] = True
                stack.append(u)
    return seen


def ring(P, m, y, h):
    """The middle (x, z) of the part's points in a thin slice at height y."""
    s = m & (np.abs(P[:, 1] - y) < h)
    if s.sum() < 3:
        s = m & (np.abs(P[:, 1] - y) < h * 3)
    if s.sum() < 3:
        return None
    q = P[s]
    return np.array([(q[:, 0].min() + q[:, 0].max()) / 2, y, (q[:, 2].min() + q[:, 2].max()) / 2])


def find_build(P, nbr, H):
    """The figure's build: crotch, armpits, neck; which points are leg, arm, head and trunk; the joints."""
    h = H / 100
    x, y, z = P.T
    low = y < 0.04 * H
    footL, footR = int(np.argmax(np.where(low, x, -1e9))), int(np.argmin(np.where(low, x, 1e9)))
    handL, handR = int(np.argmax(x)), int(np.argmin(x))
    crotch, pitL, pitR = flood_levels(P, nbr, [(footL, footR), (handL, footL), (handR, footR)])
    legL, legR = island_of(P, nbr, footL, y < crotch), island_of(P, nbr, footR, y < crotch)
    armL, armR = island_of(P, nbr, handL, y < pitL), island_of(P, nbr, handR, y < pitR)
    pit = (pitL + pitR) / 2
    # the neck: the narrowest ring above the shoulders, below the widest part of the head
    ys = np.arange(pit + 0.04 * H, y.max() - 0.08 * H, h)
    width = np.array([np.ptp(x[np.abs(y - yy) < h]) if (np.abs(y - yy) < h).sum() > 3 else 1e9 for yy in ys])
    head_w = width[len(width) // 2:].max() if len(width) else 0
    top_half = ys[np.argmax(np.where(width < 1e8, width, -1))] if len(ys) else y.max()
    below = ys < top_half
    neck = float(ys[below][np.argmin(width[below])]) if below.any() else float(pit + 0.1 * H)
    head = y > neck
    trunk = ~(legL | legR | armL | armR | head)
    out = dict(crotch=crotch, pit=(pitL, pitR), neck=neck, parts=dict(legL=legL, legR=legR, armL=armL, armR=armR, head=head, trunk=trunk))

    J = {}
    body = trunk | head
    mid = lambda yy: ring(P, body, yy, h)
    # ---- legs
    for side, leg in (('Left', legL), ('Right', legR)):
        hip = ring(P, leg, crotch - 1.5 * h, h)
        hip[1] = crotch + 0.012 * H
        ankle_y = 0.075 * H
        ankle = ring(P, leg & (z < np.percentile(z[leg & (y < 0.2 * H) & (y > 0.1 * H)], 98) + 0.01 * H), ankle_y, h)
        knee_y = hip[1] - 0.43 * (hip[1] - ankle_y)
        knee = ring(P, leg, knee_y, h)
        toe_tip = z[leg & (y < 0.05 * H)].max()
        toe = np.array([ankle[0], 0.02 * H, ankle[2] + 0.55 * (toe_tip - ankle[2])])
        J[side + 'UpLeg'], J[side + 'Leg'], J[side + 'Foot'], J[side + 'ToeBase'] = hip, knee, ankle, toe
        J[side + 'ToeEnd'] = np.array([ankle[0], 0.02 * H, toe_tip])
    # ---- trunk
    hips_y = crotch + 0.045 * H
    sh_y = pit + 0.03 * H                                     # the shoulder joints stand a little above the armpits
    J['Hips'] = mid(hips_y)
    J['Hips'][0] = (J['LeftUpLeg'][0] + J['RightUpLeg'][0]) / 2
    for k, name in enumerate(('Spine02', 'Spine01', 'Spine')):
        J[name] = mid(hips_y + (sh_y - 0.015 * H - hips_y) * (k + 1) / 3.2)
        J[name][0] = J['Hips'][0]
    J['neck'] = mid(max(neck - 0.045 * H, sh_y + 0.02 * H))
    J['Head'] = mid(neck)
    for name in ('neck', 'Head'):
        J[name][0] = J['Hips'][0]
    top = y.max()
    J['head_end'] = np.array([J['Head'][0], top, J['Head'][2]])
    J['headfront'] = np.array([J['Head'][0], J['Head'][1], z[head].max()])
    # ---- arms: the middle line of the free part of the arm, carried up to shoulder height
    for side, arm, sgn in (('Left', armL, 1), ('Right', armR, -1)):
        q = P[arm]
        c = q.mean(axis=0)
        _, _, vt = np.linalg.svd(q - c, full_matrices=False)
        d = vt[0] if vt[0][1] < 0 else -vt[0]                 # along the arm, toward the hand
        along = (q - c) @ d
        tip = c + d * along.max()
        k = (sh_y - c[1]) / d[1] if abs(d[1]) > 1e-6 else along.min()
        shoulder = c + d * k
        if sgn * (shoulder[0] - J['Hips'][0]) < 0.03 * H:     # an arm that hangs straight down: keep the joint off the spine
            shoulder[0] = J['Hips'][0] + sgn * 0.03 * H
        L = np.linalg.norm(tip - shoulder)
        J[side + 'Arm'], J[side + 'ForeArm'], J[side + 'Hand'] = shoulder, shoulder + d * 0.47 * L, shoulder + d * 0.8 * L
        J[side + 'HandEnd'] = tip
        chest = J['Spine']
        J[side + 'Shoulder'] = np.array([chest[0] + sgn * 0.3 * abs(shoulder[0] - chest[0]), shoulder[1] - 0.005 * H, chest[2]])
        out[side + 'ArmOut'] = float(np.degrees(np.arctan2(abs(d[0]), -d[1])))
        out[side + 'ArmLen'] = float(L)
    out['joints'] = J
    return out


def skin(P, nbr, B, H):
    """Skin weights: a point follows the bone of its part, shared across each joint; smoothed along the surface."""
    J, parts = B['joints'], B['parts']
    names = [n for n, _ in BONES]
    W = np.zeros((len(P), len(names)))
    put = lambda name, w: W.__setitem__((slice(None), names.index(name)), W[:, names.index(name)] + w)
    x, y, z = P.T
    cx = J['Hips'][0]

    def along(a, b):  # how far each point is along the line from a to b, in units of length from a
        d = b - a
        L = np.linalg.norm(d)
        return (P - a) @ (d / L), L

    # ---- legs: thigh, shin, foot, toes; the top of the thigh shared with the pelvis
    for side, leg, sgn in (('Left', parts['legL'], 1), ('Right', parts['legR'], -1)):
        hip, knee, ankle, toe = J[side + 'UpLeg'], J[side + 'Leg'], J[side + 'Foot'], J[side + 'ToeBase']
        m = leg.astype(float)
        shin = step(-0.035 * H, 0.035 * H, knee[1] - y)                       # below the knee
        foot = step(-0.02 * H, 0.025 * H, ankle[1] - y)                       # below the ankle
        toes = foot * step(-0.012 * H, 0.02 * H, z - toe[2])
        pelvis = 0.3 * step(B['crotch'] - 0.06 * H, B['crotch'], y)          # the very top of the thigh also follows the pelvis
        put(side + 'UpLeg', m * (1 - shin) * (1 - pelvis))
        put('Hips', m * (1 - shin) * pelvis)
        put(side + 'Leg', m * shin * (1 - foot))
        put(side + 'Foot', m * foot * (1 - toes))
        put(side + 'ToeBase', m * toes)
    # ---- arms: upper arm, forearm, hand
    for side, arm, sgn in (('Left', parts['armL'], 1), ('Right', parts['armR'], -1)):
        sh, el, wr = J[side + 'Arm'], J[side + 'ForeArm'], J[side + 'Hand']
        s, _ = along(sh, J[side + 'HandEnd'])
        se, sw = np.linalg.norm(el - sh), np.linalg.norm(wr - sh)
        m = arm.astype(float)
        fore = step(-0.03 * H, 0.03 * H, s - se)
        hand = step(-0.018 * H, 0.018 * H, s - sw)
        put(side + 'Arm', m * (1 - fore))
        put(side + 'ForeArm', m * fore * (1 - hand))
        put(side + 'Hand', m * hand)
    # ---- trunk and head: bands up the spine; the hips and shoulders reach into it
    t = (parts['trunk'] | parts['head']).astype(float)
    ys = [J[n][1] for n in ('Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head')]
    order = ('Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head')
    w = 0.03 * H
    above = [step(-w, w, y - yy) for yy in ys[1:]]                             # how far past each joint, going up
    spine = np.zeros((len(P), 6))
    for k in range(6):
        spine[:, k] = (above[k - 1] if k > 0 else 1) * ((1 - above[k]) if k < 5 else 1)
    spine /= spine.sum(axis=1, keepdims=True)
    reach = np.zeros(len(P))                                                   # what the limbs take of the trunk
    for side, sgn in (('Left', 1), ('Right', -1)):
        # the hip: the pelvis below the hip crease, on that side, goes with the thigh
        hipj = J[side + 'UpLeg']
        lw = t * (1 - step(B['crotch'], B['crotch'] + 0.085 * H, y)) * step(-0.012 * H, 0.045 * H, sgn * (x - cx)) * 0.8
        # the shoulder: the cap round the joint goes with the upper arm, the rest of the chest's side a little with the collar bone
        sh = J[side + 'Arm']
        s, _ = along(sh, J[side + 'HandEnd'])
        d = np.linalg.norm(P - sh, axis=1)
        aw = t * step(-0.05 * H, 0.03 * H, s) * (1 - step(0.045 * H, 0.105 * H, d)) * step(0.0, 0.035 * H, sgn * (x - cx))
        cw = t * 0.45 * step(0.02 * H, max(0.05 * H, abs(sh[0] - cx)), sgn * (x - cx)) * (1 - step(0.03 * H, 0.09 * H, np.abs(y - sh[1]))) * (1 - aw)
        put(side + 'UpLeg', lw)
        put(side + 'Arm', aw)
        put(side + 'Shoulder', cw)
        reach += lw + aw + cw
    reach = np.minimum(reach, 1)
    for k, name in enumerate(order):
        put(name, t * spine[:, k] * (1 - reach))
    W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-9)
    # ---- smooth along the surface (a few rounds of sharing with the neighbours), so no part ends in a line
    a = np.repeat(np.arange(len(P)), [len(n) for n in nbr])
    b = np.concatenate([np.asarray(n, dtype=np.int64) for n in nbr])
    cnt = np.bincount(a, minlength=len(P))[:, None] + 1.0
    for _ in range(6):
        acc = W.copy()
        np.add.at(acc, a, W[b])
        W = acc / cnt
    # at most four bones to a point
    keep = np.argsort(-W, axis=1)[:, :4]
    Wk = np.take_along_axis(W, keep, axis=1)
    Wk /= Wk.sum(axis=1, keepdims=True)
    return keep, Wk


def quat_from_y(d):
    """A rotation that turns +y onto d, keeping the bone's own front as near +z as it can."""
    Y = d / np.linalg.norm(d)
    F = np.array([0.0, 0.0, 1.0])
    X = np.cross(Y, F)
    if np.linalg.norm(X) < 1e-4:
        X = np.array([1.0, 0.0, 0.0])
    X /= np.linalg.norm(X)
    Z = np.cross(X, Y)
    return np.stack([X, Y, Z], axis=1)


def mat_quat(R):
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1) * 2
        q = [(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, 0.25 * s]
    else:
        i = int(np.argmax(np.diag(R)))
        j, k = (i + 1) % 3, (i + 2) % 3
        s = np.sqrt(1 + R[i, i] - R[j, j] - R[k, k]) * 2
        q = [0, 0, 0, (R[k, j] - R[j, k]) / s]
        q[i], q[j], q[k] = 0.25 * s, (R[j, i] + R[i, j]) / s, (R[k, i] + R[i, k]) / s
    return [float(v) for v in q]


def skeleton(J):
    """Each bone's place and rest turn, in its parent's frame: +y runs along the bone to the joint after it."""
    names = [n for n, _ in BONES]
    after = dict(Hips='Spine02', Spine02='Spine01', Spine01='Spine', Spine='neck', neck='Head', Head='head_end')
    for s in ('Left', 'Right'):
        after.update({s + 'Shoulder': s + 'Arm', s + 'Arm': s + 'ForeArm', s + 'ForeArm': s + 'Hand', s + 'Hand': s + 'HandEnd',
                      s + 'UpLeg': s + 'Leg', s + 'Leg': s + 'Foot', s + 'Foot': s + 'ToeBase', s + 'ToeBase': s + 'ToeEnd'})
    pos = {n: (J[n] if n in J else np.zeros(3)) for n in names}
    world = {}
    for n, parent in BONES:
        if n in after:
            R = quat_from_y(J[after[n]] - pos[n])
        else:
            R = world[parent][0] if parent and n in ('head_end', 'headfront') else np.eye(3)
        world[n] = (R, pos[n])
    nodes, ibm = [], []
    for n, parent in BONES:
        R, p = world[n]
        if parent:
            Rp, pp = world[parent]
            lr, lt = Rp.T @ R, Rp.T @ (p - pp)
        else:
            lr, lt = R, p
        nodes.append(dict(name=n, translation=[float(v) for v in lt], rotation=mat_quat(lr)))
        M = np.eye(4)
        M[:3, :3], M[:3, 3] = R, p
        ibm.append(np.linalg.inv(M))
    return nodes, np.array(ibm)


def write_glb(path, P, N, T, I, Jn, Wt, nodes, ibm, colour):
    img = io.BytesIO()
    colour.convert('RGB').save(img, 'PNG')
    parts = [P.astype('<f4').tobytes(), N.astype('<f4').tobytes(), T.astype('<f4').tobytes(), Jn.astype('<u2').tobytes(), Wt.astype('<f4').tobytes(),
             I.astype('<u4').tobytes(), ibm.transpose(0, 2, 1).astype('<f4').tobytes(), img.getvalue()]
    views, blob = [], b''
    for raw in parts:
        views.append(dict(buffer=0, byteOffset=len(blob), byteLength=len(raw)))
        blob += raw + b'\0' * (-len(raw) % 4)
    names = [n for n, _ in BONES]
    kids = {n: [names.index(c) for c, p in BONES if p == n] for n in names}
    gl_nodes = [dict(nodes[k], **({'children': kids[n]} if kids[n] else {})) for k, n in enumerate(names)]
    gl_nodes.append(dict(name='body', mesh=0, skin=0))
    gltf = dict(
        asset=dict(version='2.0', generator='nightglade auto_rig'), scene=0, scenes=[dict(nodes=[0, len(names)])], nodes=gl_nodes,
        meshes=[dict(primitives=[dict(attributes=dict(POSITION=0, NORMAL=1, TEXCOORD_0=2, JOINTS_0=3, WEIGHTS_0=4), indices=5, material=0)])],
        skins=[dict(joints=list(range(1, len(names))), inverseBindMatrices=6, skeleton=0)],
        materials=[dict(name='body', pbrMetallicRoughness=dict(baseColorTexture=dict(index=0), metallicFactor=0.0, roughnessFactor=0.9))],
        textures=[dict(source=0, sampler=0)], samplers=[dict(magFilter=9729, minFilter=9987, wrapS=33071, wrapT=33071)], images=[dict(bufferView=7, mimeType='image/png')],
        accessors=[dict(bufferView=0, componentType=5126, count=len(P), type='VEC3', min=[float(v) for v in P.min(axis=0)], max=[float(v) for v in P.max(axis=0)]),
                   dict(bufferView=1, componentType=5126, count=len(P), type='VEC3'), dict(bufferView=2, componentType=5126, count=len(P), type='VEC2'),
                   dict(bufferView=3, componentType=5123, count=len(P), type='VEC4'), dict(bufferView=4, componentType=5126, count=len(P), type='VEC4'),
                   dict(bufferView=5, componentType=5125, count=I.size, type='SCALAR'), dict(bufferView=6, componentType=5126, count=len(names) - 1, type='MAT4')],
        bufferViews=views, buffers=[dict(byteLength=len(blob))])
    js = json.dumps(gltf).encode()
    js += b' ' * (-len(js) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(blob), b'BIN\0') + blob)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('model')
    ap.add_argument('out')
    ap.add_argument('--yaw', type=float, default=0.0, help='degrees to turn the model so that it faces +z')
    ap.add_argument('--height', type=float, default=1.6)
    a = ap.parse_args()
    P, _, T, I, colour, _, _, _ = load_model(a.model)
    if a.yaw:
        P = P @ rot_y(np.radians(a.yaw)).T
    lo, hi = P.min(axis=0), P.max(axis=0)
    H = a.height
    P = (P - [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]) * (H / (hi[1] - lo[1]))
    Pw, inv, Iw = weld(P, I)
    nbr = [set() for _ in range(len(Pw))]
    for tri in Iw:
        for u, v in ((0, 1), (1, 2), (2, 0)):
            nbr[tri[u]].add(int(tri[v]))
            nbr[tri[v]].add(int(tri[u]))
    nbr = [sorted(s) for s in nbr]
    B = find_build(Pw, nbr, H)
    pr = lambda v: '(' + ', '.join(f'{c / H:+.3f}' for c in v) + ')'
    print(f'{len(P)} points ({len(Pw)} places), {len(I)} triangles; as shares of the height:')
    print(f'  legs part below {B["crotch"] / H:.3f}; arms free below {B["pit"][0] / H:.3f} (left) and {B["pit"][1] / H:.3f} (right); neck at {B["neck"] / H:.3f}')
    for s in ('Left', 'Right'):
        J = B['joints']
        print(f'  {s}: arm {B[s + "ArmOut"]:.0f} deg out from straight down, length {B[s + "ArmLen"] / H:.3f}, shoulder {pr(J[s + "Arm"])}, hand tip {pr(J[s + "HandEnd"])}; hip {pr(J[s + "UpLeg"])}, knee {pr(J[s + "Leg"])}, ankle {pr(J[s + "Foot"])}')
    print('  parts:', {k: int(v.sum()) for k, v in B['parts'].items()})
    keep, Wk = skin(Pw, nbr, B, H)
    nodes, ibm = skeleton(B['joints'])
    os.makedirs(a.out, exist_ok=True)
    N = smooth_normals(P, I)
    slot = np.where(Wk > 0, keep, 1) - 1          # the skin lists every bone but the first (the armature itself)
    write_glb(os.path.join(a.out, 'rig.glb'), P, N, T, I, slot[inv], Wk[inv], nodes, ibm[1:], colour)
    print(f'wrote {os.path.join(a.out, "rig.glb")} ({os.path.getsize(os.path.join(a.out, "rig.glb")) // 1024} KB)')


if __name__ == '__main__':
    main()
