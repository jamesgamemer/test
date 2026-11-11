#!/usr/bin/env python3
"""Pack generated VFX animations into sprite-sheet atlases for the game.

The effects themselves are not drawn in code: they are hand-painted-style animations generated with
Higgsfield (GPT Image 2.6, animated GIF output). The prompts are in dev/vfx_prompts.json.

    python3 dev/build_vfx.py <dir with slash_a.gif, nova.gif, scorch.png, ...>

Every source frame is inspected first (see inspect()): the build stops if any frame is cut off by the
frame edge, or if a one-shot effect still burns on its last frame. Then it writes assets/vfx/<name>.webp
and src/gfx/vfx-manifest.js. Needs Pillow and numpy.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'vfx')

# cell:  size of one frame in the atlas.
# pivot: the point of the art (u from the left, v up from the bottom) that sits on the effect's origin in the
#        world: the swordsman for a slash, the centre of a ring, the foot of a pillar, the head of a comet.
# reach: how far the art extends from the pivot, in frame widths. The game sizes a sheet by saying how many
#        metres that distance should be, so the numbers below are the only place that knows the art's framing.
# spans: borders the art is meant to touch (the sword-trail strip runs edge to edge).
SPEC = {
    'slash_a': dict(cell=(384, 384), fps=36, pivot=(0.5, 0.5), reach=0.44),
    'slash_b': dict(cell=(384, 384), fps=38, pivot=(0.5, 0.5), reach=0.44),
    'slam': dict(cell=(384, 384), fps=32, pivot=(0.5, 0.22), reach=0.58),       # reach: to the middle of the burst
    'wave': dict(cell=(320, 320), fps=18, loop=True, pivot=(0.5, 0.64), reach=0.34),  # reach: half the crescent's width
    'dash': dict(cell=(192, 384), fps=34, pivot=(0.5, 0.06), reach=1.78),       # reach: length of the streak
    'nova': dict(cell=(384, 384), fps=30, pivot=(0.506, 0.507), reach=0.40),
    'burst': dict(cell=(320, 320), fps=26, pivot=(0.5, 0.51), reach=0.36),
    'pillar': dict(cell=(256, 512), fps=26, pivot=(0.5, 0.09), reach=1.62),     # reach: height of the column
    'hit': dict(cell=(192, 192), fps=30, pivot=(0.5, 0.5), reach=0.33),
    'meteor': dict(cell=(128, 256), fps=18, loop=True, pivot=(0.5, 0.2), reach=0.21),  # reach: radius of the head
    'vortex': dict(cell=(384, 384), fps=18, loop=True, pivot=(0.505, 0.5), reach=0.37),
    'scorch': dict(cell=(512, 512), pivot=(0.49, 0.515), reach=0.38),
    'eclipse': dict(cell=(512, 512), pivot=(0.49, 0.5), reach=0.36),
    'ribbon': dict(cell=(1024, 256), band=(0.22, 0.78), spans='LR', mask=False),
}


def source(src, name):
    return next((os.path.join(src, name + e) for e in ('.gif', '.png') if os.path.exists(os.path.join(src, name + e))), None)


def luma_frames(path):
    im = Image.open(path)
    for i in range(getattr(im, 'n_frames', 1)):
        im.seek(i)
        yield np.asarray(im.convert('RGB')).astype(np.float32).max(axis=2)


def inspect(path, spans=''):
    """Look at every frame of one animation.

    cut:  frames whose art touches a border (a thin strip along each edge is not black) - the generator cropped
          the effect there and it would end on a hard line in game.
    box:  the part of the frame the effect ever occupies: x0, y0, x1, y1 with y measured up from the bottom.
    tail: brightness of the last frame as a fraction of the brightest one; a one-shot must end near zero or it pops.
    """
    cut, box, energy = [], [1.0, 1.0, 0.0, 0.0], []
    for i, a in enumerate(luma_frames(path)):
        h, w = a.shape
        b = max(2, int(min(w, h) * 0.012))
        strips = {'L': a[:, :b], 'R': a[:, -b:], 'T': a[:b, :], 'B': a[-b:, :]}
        hit = ''.join(k for k, s in strips.items() if k not in spans and s.max() > 60 and (s > 40).mean() > 0.01)
        if hit:
            cut.append(f'{i + 1}:{hit}')
        ys, xs = np.nonzero(a > 28)
        if len(xs):
            box = [min(box[0], xs.min() / w), min(box[1], 1 - (ys.max() + 1) / h), max(box[2], (xs.max() + 1) / w), max(box[3], 1 - ys.min() / h)]
        energy.append(float(np.clip(a - 28, 0, None).mean()))
    return dict(n=len(energy), cut=cut, box=[round(float(v), 3) for v in box], tail=energy[-1] / max(energy) if max(energy) > 0 else 0.0)


def problems(name, info):
    spec, out = SPEC.get(name, {}), []
    if info['cut']:
        out.append('CUT at ' + ' '.join(info['cut']))
    if info['n'] > 1 and not spec.get('loop') and info['tail'] > 0.04:
        out.append(f'still lit on the last frame ({info["tail"] * 100:.0f}% of peak)')
    return out


def edge_mask(w, h):
    """A 2% feather at the cell border. The art never reaches it (inspect() guarantees that); it only makes sure
    the faint glow some frames leave near the edge ends in black instead of a line."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = (x + 0.5) / w, (y + 0.5) / h
    m = np.clip(np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v)) / 0.02, 0, 1)
    return (m * m * (3 - 2 * m))[..., None]


def prep(im, cell, mask, band=None):
    im = im.convert('RGB')
    if band:
        im = im.crop((0, int(im.height * band[0]), im.width, int(im.height * band[1])))
    a = np.asarray(im.resize(cell, Image.LANCZOS)).astype(np.float32)
    a = np.clip((a - 9.0) * (255.0 / 246.0), 0, 255)  # crush the near-black floor to true black
    return a * mask


def main(src):
    os.makedirs(OUT, exist_ok=True)
    manifest, bad = {}, 0
    for name, spec in SPEC.items():
        path = source(src, name)
        if not path:
            print('missing', name)
            bad += 1
            continue
        info = inspect(path, spec.get('spans', ''))
        issues = problems(name, info)
        if issues:
            print(f'{name:8s} NOT PACKED: ' + '; '.join(issues))
            bad += 1
            continue
        im = Image.open(path)
        w, h = spec['cell']
        mask = edge_mask(w, h) if spec.get('mask', True) else 1.0
        frames = []
        for i in range(getattr(im, 'n_frames', 1)):
            im.seek(i)
            frames.append(prep(im, (w, h), mask, spec.get('band')))
        n = len(frames)
        if spec.get('loop') and n > 4:  # ease the last frames toward the first so the loop point does not pop
            frames[-1] = frames[-1] * 0.4 + frames[0] * 0.6
            frames[-2] = frames[-2] * 0.75 + frames[0] * 0.25
        cols = max(1, round(math.sqrt(n * h / w)))
        rows = math.ceil(n / cols)
        atlas = np.zeros((rows * h, cols * w, 3), np.float32)
        for i, f in enumerate(frames):
            atlas[(i // cols) * h:(i // cols + 1) * h, (i % cols) * w:(i % cols + 1) * w] = f
        out = os.path.join(OUT, name + '.webp')
        Image.fromarray(atlas.astype(np.uint8)).save(out, 'WEBP', quality=86, method=6)
        entry = dict(file=name + '.webp', cols=cols, rows=rows, n=n, fps=spec.get('fps', 1), loop=bool(spec.get('loop')), aspect=round(w / h, 4), box=info['box'])
        if 'pivot' in spec:
            entry.update(pivot=list(spec['pivot']), reach=spec['reach'])
        manifest[name] = entry
        b = info['box']
        print(f'{name:8s} {n:2d} frames  {cols}x{rows}  {atlas.shape[1]}x{atlas.shape[0]}  {os.path.getsize(out) // 1024:4d} KB  art x {b[0]:.2f}-{b[2]:.2f} y {b[1]:.2f}-{b[3]:.2f}')
    if bad:
        print(f'{bad} effect(s) need regenerating; the manifest was not written.')
        sys.exit(1)
    with open(os.path.join(ROOT, 'src', 'gfx', 'vfx-manifest.js'), 'w') as f:
        f.write('// Generated by dev/build_vfx.py — sprite-sheet layout of each effect in assets/vfx/.\n')
        f.write('// box: the part of a frame the art occupies (x0, y0, x1, y1; y up from the bottom). pivot: the point of the art\n')
        f.write('// that sits on the effect\'s origin. reach: how far the art extends from the pivot, in frame widths.\n')
        f.write('export const VFX = {\n' + ''.join(f'  {k}: {json.dumps(v)},\n' for k, v in manifest.items()) + '};\n')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
