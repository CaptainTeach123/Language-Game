#!/usr/bin/env python3
"""
Cut the generated 2x2 photo sheets (see tools/photos/prompts.js) into one
small JPEG per photo:

    img/photos/<word>-1.jpg ... <word>-4.jpg   picture words (1-3 similar, 4 different-looking)
    img/photos/<everyday word>.jpg             everyday words

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

SIZE = 520     # plenty for a picture card on a phone at 3x
INSET = 0.012  # trim a sliver off each edge so the gutter lines never show
QUALITY = 80


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
            tile = im.crop((x + dx, y + dy, x + cw - dx, y + ch - dy)).resize((SIZE, SIZE), Image.LANCZOS)
            out = os.path.join(out_dir, cell + '.jpg')
            tile.save(out, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
            total += os.path.getsize(out)
    print('total %.0f KB' % (total / 1024))
    if missing:
        print('MISSING: ' + ', '.join(missing))
        sys.exit(1)


if __name__ == '__main__':
    main()
