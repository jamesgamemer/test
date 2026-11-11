#!/usr/bin/env python3
"""Pack the generated environment art for the game.

The forest props are not modelled in code: each is a concept image generated with Higgsfield (GPT Image 2.6)
and lifted to a textured 3D model (Tripo image-to-3D). Ground textures and foliage cards are generated images
too. The prompts are in dev/env_prompts.json.

    python3 dev/build_env.py <dir>

<dir> holds models/<name>.glb, tex/<name>.png and cards/<name>.png as listed in MODELS, GROUND and CARDS below.
Writes assets/env/* and src/gfx/env-manifest.js. Needs Pillow and numpy.

Models become a small binary mesh (quantised positions, normals, uvs; see src/gfx/assets.js for the reader)
plus a colour and a normal map, so the game needs no glTF loader and the files stay small enough to embed.
"""
import io
import json
import os
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'env')

# tex:    size of the colour map (the normal map is half that).
# yaw:    degrees to turn the model about the vertical axis before it is centred.
# origin: where the model's own origin goes, in units of its longest side from the centre of its footprint
#         (the trunks are centred on the trunk rather than on the sprawl of their roots).
# How the generator happened to orient each prop (found with dev/env.html's plan view):
#   ruin_arch    wall runs along z, tall end with the window at +z, stepping down toward -z
#   ruin_corner  after the yaw its two arms run along +x and +z from the corner at the -x/-z end
#   column, log  lie along z            torch   back plate at +z, head leaning toward -z
MODELS = {
    'tree_a': dict(tex=1024, origin=(-0.065, 0.02)),
    'tree_b': dict(tex=1024, origin=(-0.05, 0.03)),
    'stump': dict(tex=512, origin=(-0.06, 0.0)),
    'ruin_arch': dict(tex=1024),
    'ruin_corner': dict(tex=1024, yaw=-34),
    'column': dict(tex=512),
    'rubble': dict(tex=512),
    'rock': dict(tex=512),
    'log': dict(tex=512),
    'mushrooms': dict(tex=512),
    'torch': dict(tex=256),
    # the Old Palisade
    #   palisade, logpile  run along x          gateway  posts on the x axis, walked through along z
    #   cart               shafts point to +z   leanto   open, tall front faces +z
    'palisade': dict(tex=1024, yaw=90),
    'gateway': dict(tex=1024, yaw=90),
    'barrel': dict(tex=512),
    'crate': dict(tex=512),
    'planks': dict(tex=512),
    'cart': dict(tex=1024, yaw=-90),
    'leanto': dict(tex=1024, yaw=-90),
    'logpile': dict(tex=512, yaw=90),
    'shrooms_tan': dict(tex=512),
}
GROUND = {
    'ground_mud': dict(size=1024, bump=3.4),
    'ground_forest': dict(size=1024, bump=2.6),
    'stone': dict(size=512, bump=2.0),
    'bark': dict(size=512, bump=3.0),
}
# cells: how many separate plants stand side by side in the source image
CARDS = {
    'grass': dict(cells=3, cell=(256, 384)),
    'plants': dict(cells=3, cell=(320, 320)),
    'leaves': dict(cells=1, cell=(512, 512)),
}

COMP = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NUM = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


# ---------------------------------------------------------------- glb
def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, _ = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF' and version == 2, 'not a glb v2 file'
    off, gltf, blob = 12, None, b''
    while off < len(data):
        n, kind = struct.unpack_from('<I4s', data, off)
        chunk = data[off + 8:off + 8 + n]
        if kind == b'JSON':
            gltf = json.loads(chunk)
        elif kind[:3] == b'BIN':
            blob = chunk
        off += 8 + n
    return gltf, blob


def accessor(gltf, blob, i):
    a = gltf['accessors'][i]
    v = gltf['bufferViews'][a['bufferView']]
    fmt, size = COMP[a['componentType']]
    n = NUM[a['type']]
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride') or size * n
    raw = np.frombuffer(blob, dtype=np.uint8, count=stride * (a['count'] - 1) + size * n, offset=start)
    if stride != size * n:
        raw = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], size * n), strides=(stride, 1)).copy().reshape(-1)
    out = np.frombuffer(raw.tobytes(), dtype=np.dtype('<' + fmt)).reshape(a['count'], n).astype(np.float64)
    if a.get('normalized'):
        out /= {'b': 127.0, 'B': 255.0, 'h': 32767.0, 'H': 65535.0}[fmt]
    return out


def node_matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if 'scale' in node:
        m = np.diag(list(node['scale']) + [1.0]) @ m
    if 'rotation' in node:
        x, y, z, w = node['rotation']
        r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
                      [0, 0, 0, 1]])
        m = r @ m
    if 'translation' in node:
        t = np.eye(4)
        t[:3, 3] = node['translation']
        m = t @ m
    return m


def image_of(gltf, blob, tex_index):
    img = gltf['images'][gltf['textures'][tex_index]['source']]
    v = gltf['bufferViews'][img['bufferView']]
    start = v.get('byteOffset', 0)
    return Image.open(io.BytesIO(blob[start:start + v['byteLength']]))


def load_model(path):
    """Flatten a glb into one triangle list in world space, with the first material's colour and normal maps."""
    gltf, blob = read_glb(path)
    pos, nrm, uv, idx, mats = [], [], [], [], []
    base = 0

    def walk(i, parent):
        nonlocal base
        node = gltf['nodes'][i]
        m = parent @ node_matrix(node)
        if 'mesh' in node:
            for prim in gltf['meshes'][node['mesh']]['primitives']:
                if prim.get('mode', 4) != 4:
                    continue
                at = prim['attributes']
                p = accessor(gltf, blob, at['POSITION'])
                p = (np.c_[p, np.ones(len(p))] @ m.T)[:, :3]
                nm = np.linalg.inv(m[:3, :3]).T
                n = accessor(gltf, blob, at['NORMAL']) @ nm.T if 'NORMAL' in at else None
                t = accessor(gltf, blob, at['TEXCOORD_0']) if 'TEXCOORD_0' in at else np.zeros((len(p), 2))
                ix = accessor(gltf, blob, prim['indices']).astype(np.int64).reshape(-1) if 'indices' in prim else np.arange(len(p))
                if np.linalg.det(m[:3, :3]) < 0:  # a mirrored node flips the winding
                    ix = ix.reshape(-1, 3)[:, ::-1].reshape(-1)
                pos.append(p); nrm.append(n); uv.append(t); idx.append(ix + base); mats.append(prim.get('material', 0))
                base += len(p)
        for c in node.get('children', []):
            walk(c, m)

    scene = gltf['scenes'][gltf.get('scene', 0)]
    for r in scene['nodes']:
        walk(r, np.eye(4))
    P, T, I = np.concatenate(pos), np.concatenate(uv), np.concatenate(idx).reshape(-1, 3)
    if any(n is None for n in nrm):  # smooth normals from the faces
        N = np.zeros_like(P)
        fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
        for k in range(3):
            np.add.at(N, I[:, k], fn)
    else:
        N = np.concatenate(nrm)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    mat = gltf['materials'][mats[0]] if gltf.get('materials') else {}
    pbr = mat.get('pbrMetallicRoughness', {})
    colour = image_of(gltf, blob, pbr['baseColorTexture']['index']) if 'baseColorTexture' in pbr else None
    normal = image_of(gltf, blob, mat['normalTexture']['index']) if 'normalTexture' in mat else None
    rough = image_of(gltf, blob, pbr['metallicRoughnessTexture']['index']) if 'metallicRoughnessTexture' in pbr else None
    return P, N, T, I, colour, normal, rough, len(set(mats))


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def pack_model(name, spec, src):
    P, N, T, I, colour, normal, rough, nmat = load_model(os.path.join(src, 'models', name + '.glb'))
    R = np.eye(3)
    if spec.get('up') == 'z':
        R = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]]) @ R
    if spec.get('yaw'):
        R = rot_y(np.radians(spec['yaw'])) @ R
    P, N = P @ R.T, N @ R.T
    lo, hi = P.min(axis=0), P.max(axis=0)
    # stand it on the ground, centred, and scale so the longest side is one unit: the game sizes props in metres
    P = P - [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]
    unit = (hi - lo).max()
    P /= unit
    if spec.get('origin'):
        P[:, 0] -= spec['origin'][0]
        P[:, 2] -= spec['origin'][1]
    lo, hi = P.min(axis=0), P.max(axis=0)
    size = np.maximum(hi - lo, 1e-9)
    q_pos = np.round((P - lo) / size * 65535).astype('<u2')
    q_nrm = np.zeros((len(N), 4), dtype='i1')
    q_nrm[:, :3] = np.round(np.clip(N, -1, 1) * 127)
    tlo, thi = T.min(axis=0), T.max(axis=0)
    tsize = np.maximum(thi - tlo, 1e-9)
    q_uv = np.round((T - tlo) / tsize * 65535).astype('<u2')
    wide = len(P) > 65535
    q_idx = I.astype('<u4' if wide else '<u2')
    blocks, body = {}, b''
    for key, arr in (('pos', q_pos), ('nrm', q_nrm), ('uv', q_uv), ('idx', q_idx)):
        raw = arr.tobytes()
        blocks[key] = [len(body), len(raw)]
        body += raw + b'\0' * (-len(raw) % 4)
    head = dict(verts=len(P), tris=len(I), min=[round(float(v), 5) for v in lo], size=[round(float(v), 5) for v in size],
                uvMin=[float(v) for v in tlo], uvSize=[float(v) for v in tsize], wide=wide, blocks=blocks)
    hj = json.dumps(head).encode()
    hj += b' ' * (-len(hj) % 4)
    with open(os.path.join(OUT, name + '.mesh'), 'wb') as f:
        f.write(b'NGM1' + struct.pack('<I', len(hj)) + hj + body)
    entry = dict(mesh=name + '.mesh', verts=len(P), tris=len(I), size=head['size'], min=head['min'])
    s = spec['tex']
    if colour is not None:
        colour.convert('RGB').resize((s, s), Image.LANCZOS).save(os.path.join(OUT, name + '_c.webp'), 'WEBP', quality=84, method=6)
        entry['map'] = name + '_c.webp'
    if normal is not None:
        n = max(128, s // 2)
        normal.convert('RGB').resize((n, n), Image.LANCZOS).save(os.path.join(OUT, name + '_n.webp'), 'WEBP', quality=88, method=6)
        entry['normalMap'] = name + '_n.webp'
    if rough is not None:  # glTF packs roughness in G; report its average so the material can use one sensible value
        g = np.asarray(rough.convert('RGB').resize((64, 64)))[..., 1].astype(np.float32) / 255
        entry['roughness'] = round(float(np.clip(g.mean(), 0.35, 1.0)), 2)
    kb = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.startswith(name + '.') or f.startswith(name + '_')) // 1024
    print(f'{name:12s} {len(P):6d} verts {len(I):6d} tris  size {size[0]:.2f} x {size[1]:.2f} x {size[2]:.2f}  materials {nmat}  {kb} KB')
    return entry


# ---------------------------------------------------------------- ground textures
def seamless(a):
    """Make an image tile: cross-fade it with a copy shifted by half its size, so every edge meets its own middle."""
    h, w = a.shape[:2]
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.minimum(np.minimum(x, w - 1 - x) / (w * 0.5), np.minimum(y, h - 1 - y) / (h * 0.5))  # 0 at the edge, 1 in the middle
    k = np.clip(d / 0.3, 0, 1)
    k = (k * k * (3 - 2 * k))[..., None]
    return a * k + np.roll(a, (h // 2, w // 2), axis=(0, 1)) * (1 - k)


def pack_ground(name, spec, src):
    s = spec['size']
    im = Image.open(os.path.join(src, 'tex', name + '.png')).convert('RGB').resize((s, s), Image.LANCZOS)
    a = seamless(np.asarray(im).astype(np.float32))
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=84, method=6)
    # bump from brightness: lighter grit and leaves stand proud of the dark soil
    n = s // 2
    lum = np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('L').resize((n, n), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
    dx = (np.roll(lum, -1, axis=1) - np.roll(lum, 1, axis=1)) * spec['bump'] * 4
    dy = (np.roll(lum, -1, axis=0) - np.roll(lum, 1, axis=0)) * spec['bump'] * 4
    l = np.sqrt(dx * dx + dy * dy + 1)
    nm = np.stack([-dx / l * 0.5 + 0.5, dy / l * 0.5 + 0.5, 1 / l * 0.5 + 0.5], axis=-1)
    Image.fromarray((nm * 255).astype(np.uint8)).save(os.path.join(OUT, name + '_n.webp'), 'WEBP', quality=88, method=6)
    print(f'{name:12s} {s}px tileable + normal map')
    return dict(map=name + '.webp', normalMap=name + '_n.webp')


# ---------------------------------------------------------------- foliage cards
def pack_cards(name, spec, src):
    im = Image.open(os.path.join(src, 'cards', name + '.png')).convert('RGBA')
    a = np.asarray(im).astype(np.float32)
    # the plants stand apart but their leaves overlap when projected onto the x axis, so separate them as
    # connected blobs: label a small copy of the alpha mask with flood fills, keep the largest `cells` blobs
    f = 4
    small = im.getchannel('A').resize((im.width // f, im.height // f), Image.BOX).point(lambda v: 255 if v > 40 else 0).convert('L')
    lab = small.copy()
    px, nlab = lab.load(), 0
    for y in range(lab.height):
        for x in range(lab.width):
            if px[x, y] == 255 and nlab < 250:
                nlab += 1
                ImageDraw.floodfill(lab, (x, y), nlab)
    L = np.asarray(lab)
    area = {k: int((L == k).sum()) for k in range(1, nlab + 1)}
    box = {}
    for k in area:
        ys, xs = np.nonzero(L == k)
        box[k] = (xs.min(), ys.min(), xs.max(), ys.max())
    keep = sorted(sorted(area, key=area.get, reverse=True)[:spec['cells']], key=lambda k: box[k][0] + box[k][2])
    # a crumb (a blade tip cut loose by the threshold) joins the plant whose box it is nearest to
    home = {k: k for k in keep}
    for k in area:
        if k in home:
            continue
        cx, cy = (box[k][0] + box[k][2]) / 2, (box[k][1] + box[k][3]) / 2
        dist = {j: max(box[j][0] - cx, cx - box[j][2], 0) + max(box[j][1] - cy, cy - box[j][3], 0) for j in keep}
        j = min(dist, key=dist.get)
        if dist[j] < 0.03 * L.shape[1]:
            home[k] = j
    big = np.asarray(lab.resize(im.size, Image.NEAREST))
    spans = []
    for j in keep:
        m = np.isin(big, [k for k, h in home.items() if h == j])
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * f + 1))) > 0  # recover the soft edge lost by the small copy
        spans.append(m)
    cw, ch = spec['cell']
    atlas = np.zeros((ch, cw * len(spans), 4), np.float32)
    info = []
    for k, m in enumerate(spans):
        part = a * m[..., None]
        ys, xs = np.nonzero(part[..., 3] > 20)
        part = part[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        ph, pw = part.shape[:2]
        f = min((cw - 8) / pw, (ch - 6) / ph)
        w, h = max(1, int(pw * f)), max(1, int(ph * f))
        img = np.asarray(Image.fromarray(part.astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.float32)
        ox, oy = k * cw + (cw - w) // 2, ch - h - 2  # stand on the bottom edge, centred
        atlas[oy:oy + h, ox:ox + w] = img
        info.append(dict(w=round(w / cw, 3), h=round(h / ch, 3)))
    # spread the plant colour into the transparent pixels so mip-mapping never pulls in black fringes
    rgb, al = atlas[..., :3], atlas[..., 3:4] / 255
    acc, wgt = rgb * al, al.copy()
    for _ in range(24):
        acc = sum(np.roll(acc, s, axis=ax) for ax in (0, 1) for s in (-1, 1)) / 4 + acc * (wgt > 0.02)
        wgt = sum(np.roll(wgt, s, axis=ax) for ax in (0, 1) for s in (-1, 1)) / 4 + wgt * (wgt > 0.02)
    fill = acc / np.maximum(wgt, 1e-4)
    mean = (rgb * al).sum(axis=(0, 1)) / max(al.sum(), 1)
    fill = np.where(wgt > 1e-3, fill, mean)
    out = np.concatenate([np.where(al > 0.5, rgb, fill), atlas[..., 3:4]], axis=-1)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=86, method=6)
    print(f'{name:12s} {len(spans)} cards of {cw}x{ch}')
    return dict(map=name + '.webp', cells=len(spans), aspect=round(cw / ch, 4), fill=info)


def main(src):
    os.makedirs(OUT, exist_ok=True)
    man = dict(models={}, ground={}, cards={})
    for name, spec in MODELS.items():
        if os.path.exists(os.path.join(src, 'models', name + '.glb')):
            man['models'][name] = pack_model(name, spec, src)
        else:
            print('missing model', name)
    for name, spec in GROUND.items():
        if os.path.exists(os.path.join(src, 'tex', name + '.png')):
            man['ground'][name] = pack_ground(name, spec, src)
        else:
            print('missing texture', name)
    for name, spec in CARDS.items():
        if os.path.exists(os.path.join(src, 'cards', name + '.png')):
            man['cards'][name] = pack_cards(name, spec, src)
        else:
            print('missing cards', name)
    with open(os.path.join(ROOT, 'src', 'gfx', 'env-manifest.js'), 'w') as f:
        f.write('// Generated by dev/build_env.py — the generated environment art in assets/env/.\n')
        f.write('// models: mesh file, colour and normal map, and the model\'s size with its longest side scaled to 1.\n')
        f.write('export const ENV = {\n')
        for group, items in man.items():
            f.write(f'  {group}: {{\n' + ''.join(f'    {k}: {json.dumps(v)},\n' for k, v in items.items()) + '  },\n')
        f.write('};\n')
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'assets/env: {total // 1024} KB')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
