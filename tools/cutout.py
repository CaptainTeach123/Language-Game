#!/usr/bin/env python3
"""
Cut a cartoon character out of a plain white background and save it as a
transparent PNG, trimmed and sized for the app:

    pip install pillow
    python3 tools/cutout.py IN.png img/ui/wizard.png [HEIGHT]   (HEIGHT 0 keeps the size)

The white is removed by flooding in from the edges, so white inside the
character (eyes, teeth, beard) is kept. Edges get a 1 px soft fade.
"""
import sys
from collections import deque

from PIL import Image, ImageFilter

TOL = 28          # how far from pure white still counts as background
PAD = 12          # transparent margin around the character
DEFAULT_H = 720   # tall enough for the home screen at 3x


def cutout(src, dst, height):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    px = im.load()

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        return a < 8 or (255 - r < TOL and 255 - g < TOL and 255 - b < TOL)

    # Flood fill from every edge pixel.
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i] or not is_bg(x, y):
            continue
        seen[i] = 1
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))

    alpha = Image.new('L', (w, h), 255)
    ap = alpha.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            if seen[row + x]:
                ap[x, y] = 0
    # Soften the edge so the outline doesn't look jagged on the sky.
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    im.putalpha(alpha)

    box = alpha.getbbox()
    im = im.crop((max(0, box[0] - PAD), max(0, box[1] - PAD), min(w, box[2] + PAD), min(h, box[3] + PAD)))
    if height > 0:
        scale = height / im.height
        im = im.resize((max(1, round(im.width * scale)), height), Image.LANCZOS)
    im.save(dst, 'PNG', optimize=True)
    print('%s: %dx%d, %.0f KB' % (dst, im.width, im.height, __import__('os').path.getsize(dst) / 1024))


if __name__ == '__main__':
    cutout(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_H)
