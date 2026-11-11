#!/usr/bin/env python3
"""Check generated VFX animations before packing: is every frame whole?

    python3 dev/check_vfx.py <dir with *.gif / *.png>

For each effect in build_vfx.SPEC it reports the number of frames, the box the art occupies (y measured up
from the bottom) and two kinds of fault:
  CUT at 5:T 8:R   frame 5 touches the top border, frame 8 the right one - the generator cropped the effect
  still lit ...    a one-shot effect has not burned out by its last frame, so it would vanish with a pop
Exits 1 if anything is wrong. build_vfx.py runs the same inspection and refuses to pack a faulty animation.
"""
import sys

from build_vfx import SPEC, inspect, problems, source

if __name__ == '__main__':
    src, bad = sys.argv[1] if len(sys.argv) > 1 else '.', 0
    for name, spec in SPEC.items():
        path = source(src, name)
        if not path:
            print(f'{name:8s} missing')
            bad += 1
            continue
        info = inspect(path, spec.get('spans', ''))
        issues = problems(name, info)
        bad += bool(issues)
        b = info['box']
        print(f'{name:8s} {info["n"]:2d} frames  art x {b[0]:.2f}-{b[2]:.2f}  y {b[1]:.2f}-{b[3]:.2f}  last frame {info["tail"] * 100:3.0f}%  ' + ('; '.join(issues) if issues else 'ok'))
    sys.exit(1 if bad else 0)
