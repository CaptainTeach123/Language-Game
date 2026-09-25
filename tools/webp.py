#!/usr/bin/env python3
"""
Convert pictures to WebP, which is 3 to 8 times smaller than PNG or JPEG at
the same look (iPhones have shown WebP since iOS 14):

    pip install pillow
    python3 tools/webp.py [-q QUALITY] [--keep] FILE.png FILE.jpg ...

Each file becomes FILE.webp next to it and the original is removed unless
--keep is given. Quality 85 suits the wizard and scenery, 80 the photos,
90 the small icons and stickers.
"""
import os
import sys

from PIL import Image


def convert(src, quality, keep):
    im = Image.open(src)
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA' if 'transparency' in im.info or im.mode in ('P', 'LA') else 'RGB')
    dst = os.path.splitext(src)[0] + '.webp'
    im.save(dst, 'WEBP', quality=quality, method=6)
    before, after = os.path.getsize(src), os.path.getsize(dst)
    if not keep:
        os.remove(src)
    return before, after


def main():
    args = sys.argv[1:]
    quality, keep, files = 85, False, []
    while args:
        a = args.pop(0)
        if a == '-q':
            quality = int(args.pop(0))
        elif a == '--keep':
            keep = True
        else:
            files.append(a)
    total = [0, 0]
    for f in files:
        b, a = convert(f, quality, keep)
        total[0] += b
        total[1] += a
    print('%d files: %.0f KB -> %.0f KB (quality %d)' % (len(files), total[0] / 1024, total[1] / 1024, quality))


if __name__ == '__main__':
    main()
