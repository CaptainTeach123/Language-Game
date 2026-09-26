#!/usr/bin/env python3
"""
Cut the generated 2x2 photo sheets (see tools/photos/prompts.js) into one
small WebP per photo:

    img/photos/<word>-1.webp ... <word>-4.webp   picture words (1-3 similar, 4 different-looking)
    img/photos/<everyday word>.webp              everyday words

Usage:
    pip install pillow
    node tools/photos/prompts.js > sheets.json
    python3 tools/photos/crop.py RAW_DIR sheets.json OUT_DIR
      RAW_DIR  one PNG per sheet, named <sheet>.png (e.g. dog.png, _everyday1.png)
"""
import json
import os
import sys

from PIL import Image

SIZE = 520        # plenty for a picture card on a phone at 3x
INSET = 0.012     # always trim a sliver off each edge
WHITE = 238       # a row or column this bright is gutter, not photo...
MAX_GUTTER = 0.08 # ...unless the white goes on this far: then it's the photo's own white background
SAFE = 3          # extra pixels past the gutter
QUALITY = 80


def white_edges(tile):
    """How many rows/columns of white gutter sit at each edge (left, top, right, bottom).

    Sky and night-sky photos show the gutter as a bright line if it isn't found
    and cut off; white-background photos are simply white all the way in.
    """
    g = tile.convert('L')
    w, h = g.size
    rows = list(g.resize((1, h), Image.BOX).getdata())
    cols = list(g.resize((w, 1), Image.BOX).getdata())

    def run(vals, cap):
        n = 0
        while n < cap and vals[n] >= WHITE:
            n += 1
        return n if n < cap else 0

    return (run(cols, int(w * MAX_GUTTER)), run(rows, int(h * MAX_GUTTER)),
            run(cols[::-1], int(w * MAX_GUTTER)), run(rows[::-1], int(h * MAX_GUTTER)))


def main():
    raw_dir, sheets_json, out_dir = sys.argv[1:4]
    sheets = json.load(open(sheets_json))
    os.makedirs(out_dir, exist_ok=True)
    total = 0
    missing = []
    for name, sheet in sheets.items():
        path = os.path.join(raw_dir, name + '.png')
        if not os.path.exists(path):
            missing.append(name)
            continue
        im = Image.open(path).convert('RGB')
        w, h = im.size
        cw, ch = w // 2, h // 2
        for i, cell in enumerate(sheet['cells']):
            if not cell:
                continue
            x, y = (i % 2) * cw, (i // 2) * ch
            dx, dy = int(cw * INSET), int(ch * INSET)
            l, t, r, b = white_edges(im.crop((x, y, x + cw, y + ch)))
            l, t = max(dx, l + SAFE if l else 0), max(dy, t + SAFE if t else 0)
            r, b = max(dx, r + SAFE if r else 0), max(dy, b + SAFE if b else 0)
            # Keep the photo square: trim the longer side evenly.
            tw, th = cw - l - r, ch - t - b
            side = min(tw, th)
            l += (tw - side) // 2
            t += (th - side) // 2
            tile = im.crop((x + l, y + t, x + l + side, y + t + side)).resize((SIZE, SIZE), Image.LANCZOS)
            out = os.path.join(out_dir, cell + '.webp')
            tile.save(out, 'WEBP', quality=QUALITY, method=6)
            total += os.path.getsize(out)
    print('total %.0f KB' % (total / 1024))
    if missing:
        print('MISSING: ' + ', '.join(missing))
        sys.exit(1)


if __name__ == '__main__':
    main()
