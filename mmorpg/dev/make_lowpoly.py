#!/usr/bin/env python3
"""Make the game-resolution model from a high-resolution generated sculpt, the way a studio does it.

    python3 dev/make_lowpoly.py <sculpt.glb> <out dir> [--tris 45000] [--tex 2048] [--height 1.6] [--yaw 0] [--head 1.5]

The generator gives a sculpt of a few hundred thousand triangles: far too heavy to animate in a browser, and
its texture is cut into scraps. So:
  1. the sculpt is simplified to a few tens of thousands of triangles (quadric edge collapse)
  2. that model is unwrapped into a clean texture layout (xatlas)
  3. the sculpt's colour, and its surface detail as a tangent-space normal map, are baked down onto it:
     every texel looks up the nearest point of the sculpt
Writes <out>/lowpoly.glb (the model with a copy of its colour, ready to be rigged: it stands on y = 0 and
must face +z, so turn it with --yaw if the sculpt does not), <out>/albedo.png and <out>/normal.png (the colour
and detail maps, which dev/build_char.py picks up from beside the rigged clips). --head gives the head more of
the texture than its size alone would earn it. The same input always gives the same output.

Needs Pillow, numpy, scipy, xatlas and fast-simplification.
"""
import argparse
import io
import json
import os
import struct

import numpy as np
from PIL import Image

from build_env import bleed, load_model
from build_char import smooth_normals


def weld(P, I):
    key = np.round(P / 1e-6).astype(np.int64)
    _, first, at = np.unique(key, axis=0, return_index=True, return_inverse=True)
    W = at.reshape(-1)[I]
    keep = (W[:, 0] != W[:, 1]) & (W[:, 1] != W[:, 2]) & (W[:, 0] != W[:, 2])
    return first, W, keep


def tangents(P, N, T, I):
    """Per-vertex tangent frames for a normal map: tangent (xyz) and the side the bitangent lies on (w)."""
    e1, e2 = P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]]
    d1, d2 = T[I[:, 1]] - T[I[:, 0]], T[I[:, 2]] - T[I[:, 0]]
    det = d1[:, 0] * d2[:, 1] - d2[:, 0] * d1[:, 1]
    det = np.where(np.abs(det) < 1e-12, 1e-12, det)[:, None]
    t = (e1 * d2[:, 1:2] - e2 * d1[:, 1:2]) / det
    b = (e2 * d1[:, 0:1] - e1 * d2[:, 0:1]) / det
    tv, bv = np.zeros_like(P), np.zeros_like(P)
    for k in range(3):
        np.add.at(tv, I[:, k], t)
        np.add.at(bv, I[:, k], b)
    tv -= N * (tv * N).sum(axis=1, keepdims=True)
    ln = np.linalg.norm(tv, axis=1, keepdims=True)
    # a vertex whose triangles cancel out gets any direction square to its normal
    spare = np.cross(N, np.where(np.abs(N[:, 1:2]) < 0.9, [[0.0, 1.0, 0.0]], [[1.0, 0.0, 0.0]]))
    tv = np.where(ln > 1e-9, tv / np.maximum(ln, 1e-9), spare / np.linalg.norm(spare, axis=1, keepdims=True))
    w = np.where((np.cross(N, tv) * bv).sum(axis=1) < 0, -1.0, 1.0)
    return tv, w


def write_glb(path, P, N, T, I, colour):
    # the model carries a JPEG copy of its colour (it only has to be recognised and rigged);
    # the maps the game is built from are the lossless ones written beside it
    jpg = io.BytesIO()
    colour.save(jpg, 'JPEG', quality=90)
    parts = [P.astype('<f4').tobytes(), N.astype('<f4').tobytes(), T.astype('<f4').tobytes(), I.astype('<u4').tobytes(), jpg.getvalue()]
    views, blob = [], b''
    for raw in parts:
        views.append(dict(buffer=0, byteOffset=len(blob), byteLength=len(raw)))
        blob += raw + b'\0' * (-len(raw) % 4)
    gltf = dict(
        asset=dict(version='2.0', generator='nightglade make_lowpoly'), scene=0, scenes=[dict(nodes=[0])], nodes=[dict(mesh=0, name='hero')],
        meshes=[dict(primitives=[dict(attributes=dict(POSITION=0, NORMAL=1, TEXCOORD_0=2), indices=3, material=0)])],
        materials=[dict(name='hero', pbrMetallicRoughness=dict(baseColorTexture=dict(index=0), metallicFactor=0.0, roughnessFactor=0.9))],
        textures=[dict(source=0, sampler=0)], samplers=[dict(magFilter=9729, minFilter=9987, wrapS=33071, wrapT=33071)], images=[dict(bufferView=4, mimeType='image/jpeg')],
        accessors=[dict(bufferView=0, componentType=5126, count=len(P), type='VEC3', min=[float(v) for v in P.min(axis=0)], max=[float(v) for v in P.max(axis=0)]),
                   dict(bufferView=1, componentType=5126, count=len(N), type='VEC3'), dict(bufferView=2, componentType=5126, count=len(T), type='VEC2'),
                   dict(bufferView=3, componentType=5125, count=I.size, type='SCALAR')],
        bufferViews=views, buffers=[dict(byteLength=len(blob))])
    js = json.dumps(gltf).encode()
    js += b' ' * (-len(js) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(blob), b'BIN\0') + blob)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sculpt')
    ap.add_argument('out')
    ap.add_argument('--tris', type=int, default=45000)
    ap.add_argument('--tex', type=int, default=2048)
    ap.add_argument('--height', type=float, default=1.6)
    ap.add_argument('--head', type=float, default=1.5, help='how much more texture the head gets than the body, per unit of surface')
    ap.add_argument('--neck', type=float, default=0.64, help='where the head starts, as a part of the height')
    ap.add_argument('--yaw', type=float, default=0.0, help='degrees to turn the sculpt so that it faces +z')
    a = ap.parse_args()
    import fast_simplification
    import xatlas
    from scipy.spatial import cKDTree

    # ---- the sculpt: standing on y = 0, facing +z, at the given height
    P, _, T, I, colour, _, _, _ = load_model(a.sculpt)
    if a.yaw:
        c, s = np.cos(np.radians(a.yaw)), np.sin(np.radians(a.yaw))
        P = P @ np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]).T
    lo, hi = P.min(axis=0), P.max(axis=0)
    P = (P - [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]) * (a.height / (hi[1] - lo[1]))
    first, W, keep = weld(P, I)
    I, W = I[keep], W[keep]
    HN = smooth_normals(P, I)
    hfn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
    hfn /= np.maximum(np.linalg.norm(hfn, axis=1, keepdims=True), 1e-20)
    src = np.asarray(colour.convert('RGB')).astype(np.float32)
    sh, sw = src.shape[:2]
    print(f'sculpt: {len(first)} points, {len(I)} triangles, texture {sw}x{sh}')

    # ---- 1. simplify
    LP, LI = fast_simplification.simplify(P[first].astype(np.float32), W.astype(np.int32), target_count=a.tris, agg=5)
    LP, LI = LP.astype(np.float64), LI.astype(np.int64)
    ok = (LI[:, 0] != LI[:, 1]) & (LI[:, 1] != LI[:, 2]) & (LI[:, 0] != LI[:, 2])
    LI = LI[ok]
    LN = smooth_normals(LP, LI)

    # ---- 2. unwrap. The head is handed over enlarged, so that the face gets more of the texture than its
    #         size alone would earn it (it is what the player looks at); then the layout is packed as tightly
    #         as one texture allows.
    top = LP[:, 1].max()
    grow = 1 + (a.head - 1) * np.clip((LP[:, 1] / top - a.neck + 0.03) / 0.06, 0, 1)[:, None]
    UP = (LP - [0, a.neck * top, 0]) * grow
    co = xatlas.ChartOptions()
    co.max_cost, co.max_iterations = 6.0, 2

    def layout(per_unit):
        atlas = xatlas.Atlas()
        atlas.add_mesh(UP.astype(np.float32), LI.astype(np.uint32))
        po = xatlas.PackOptions()
        po.resolution, po.padding, po.bilinear, po.create_image = a.tex, 5, True, False
        if per_unit:
            po.texels_per_unit = per_unit
        atlas.generate(co, po)
        return atlas

    atlas = layout(0)
    for more in (1.3, 1.22, 1.15, 1.08):
        tighter = layout(atlas.texels_per_unit * more)
        if tighter.atlas_count == 1 and max(tighter.width, tighter.height) <= a.tex:
            atlas = tighter
            break
    vm, ind, uv = atlas[0]
    ind = ind.astype(np.int64)
    VP, VN, VT = LP[vm], LN[vm], uv.astype(np.float64)
    tan, tw = tangents(VP, VN, VT, ind)
    print(f'game model: {len(VP)} vertices, {len(ind)} triangles, {atlas.chart_count} charts, {atlas.texels_per_unit:.0f} texels a metre ({atlas.texels_per_unit * a.head:.0f} on the head)')

    # ---- 3. bake: which texel belongs to which triangle, and where on it
    S = a.tex
    best = np.full((S, S), -1e9, np.float32)
    tri = np.full((S, S), -1, np.int64)
    bary = np.zeros((S, S, 3), np.float32)
    px = VT[ind] * S - 0.5
    for t in range(len(ind)):
        p0, p1, p2 = px[t]
        den = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
        if abs(den) < 1e-9:
            continue
        x0, x1 = max(0, int(np.floor(min(p0[0], p1[0], p2[0]))) - 1), min(S - 1, int(np.ceil(max(p0[0], p1[0], p2[0]))) + 1)
        y0, y1 = max(0, int(np.floor(min(p0[1], p1[1], p2[1]))) - 1), min(S - 1, int(np.ceil(max(p0[1], p1[1], p2[1]))) + 1)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        l0 = ((p1[1] - p2[1]) * (xs - p2[0]) + (p2[0] - p1[0]) * (ys - p2[1])) / den
        l1 = ((p2[1] - p0[1]) * (xs - p2[0]) + (p0[0] - p2[0]) * (ys - p2[1])) / den
        l2 = 1 - l0 - l1
        inside = np.minimum(np.minimum(l0, l1), l2)
        take = (inside > -0.8 / np.sqrt(abs(den))) & (inside > best[ys, xs])
        if take.any():
            yy, xx = ys[take], xs[take]
            best[yy, xx], tri[yy, xx] = inside[take], t
            L = np.clip(np.stack([l0[take], l1[take], l2[take]], axis=1), 0, 1)
            bary[yy, xx] = L / L.sum(axis=1, keepdims=True)
    ys, xs = np.nonzero(tri >= 0)
    t, L = tri[ys, xs], bary[ys, xs].astype(np.float64)
    corners = ind[t]
    mix = lambda A: (A[corners] * L[:, :, None]).sum(axis=1)
    pos, nrm, tg = mix(VP), mix(VN), mix(tan)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
    tg /= np.maximum(np.linalg.norm(tg, axis=1, keepdims=True), 1e-9)
    bt = (np.cross(VN, tan) * tw[:, None])
    bt = mix(bt)
    bt /= np.maximum(np.linalg.norm(bt, axis=1, keepdims=True), 1e-9)

    # the nearest triangle of the sculpt that faces the same way (cloth lies in layers: not the one underneath)
    cen = P[I].mean(axis=1)
    _, near = cKDTree(cen).query(pos, k=6)
    facing = (hfn[near] * nrm[:, None, :]).sum(axis=2) > 0.15
    pickk = np.where(facing.any(axis=1), facing.argmax(axis=1), 0)
    f = near[np.arange(len(pos)), pickk]
    A, B, C = P[I[f, 0]], P[I[f, 1]], P[I[f, 2]]
    v0, v1, v2 = B - A, C - A, pos - A
    d00, d01, d11 = (v0 * v0).sum(1), (v0 * v1).sum(1), (v1 * v1).sum(1)
    d20, d21 = (v2 * v0).sum(1), (v2 * v1).sum(1)
    den = np.maximum(d00 * d11 - d01 * d01, 1e-20)
    b1, b2 = (d11 * d20 - d01 * d21) / den, (d00 * d21 - d01 * d20) / den
    hb = np.clip(np.stack([1 - b1 - b2, b1, b2], axis=1), 0, 1)
    hb = hb / hb.sum(axis=1, keepdims=True)
    hb_in = hb * 0.94 + 0.02  # a little toward the middle: clear of the edge of the sculpt's own texture scrap
    huv = (T[I[f]] * hb_in[:, :, None]).sum(axis=1)
    fx, fy = np.clip(huv[:, 0] * sw - 0.5, 0, sw - 1.001), np.clip(huv[:, 1] * sh - 0.5, 0, sh - 1.001)
    ix, iy = fx.astype(int), fy.astype(int)
    gx, gy = (fx - ix)[:, None], (fy - iy)[:, None]
    col = (src[iy, ix] * (1 - gx) + src[iy, ix + 1] * gx) * (1 - gy) + (src[iy + 1, ix] * (1 - gx) + src[iy + 1, ix + 1] * gx) * gy
    hn = (HN[I[f]] * hb[:, :, None]).sum(axis=1)
    hn /= np.maximum(np.linalg.norm(hn, axis=1, keepdims=True), 1e-9)
    hn = np.where((hn * nrm).sum(axis=1, keepdims=True) < -0.2, nrm, hn)  # looked up the wrong side: keep the model's own
    ts = np.stack([(hn * tg).sum(1), (hn * bt).sum(1), np.maximum((hn * nrm).sum(1), 0.05)], axis=1)
    ts /= np.linalg.norm(ts, axis=1, keepdims=True)

    cover = (tri >= 0).astype(np.float32)[..., None]
    alb = np.zeros((S, S, 3), np.float32)
    alb[ys, xs] = col
    alb = np.where(cover > 0.5, alb, bleed(alb, cover, 14))
    nm = np.zeros((S, S, 3), np.float32)
    nm[ys, xs] = (ts * 0.5 + 0.5) * 255
    nm = np.where(cover > 0.5, nm, bleed(nm, cover, 14))
    nm = np.where(bleed(cover.repeat(3, axis=2), cover, 14) > 1e-3, nm, [127.5, 127.5, 255.0])
    os.makedirs(a.out, exist_ok=True)
    albedo = Image.fromarray(np.clip(alb, 0, 255).astype(np.uint8), 'RGB')
    Image.fromarray(np.clip(nm, 0, 255).astype(np.uint8), 'RGB').save(os.path.join(a.out, 'normal.png'))
    albedo.save(os.path.join(a.out, 'albedo.png'))
    write_glb(os.path.join(a.out, 'lowpoly.glb'), VP, VN, VT, ind, albedo)
    print(f'baked {len(ys)} texels ({100 * cover.mean():.0f}% of the texture); wrote lowpoly.glb ({os.path.getsize(os.path.join(a.out, "lowpoly.glb")) // 1024} KB), albedo.png, normal.png')


if __name__ == '__main__':
    main()
