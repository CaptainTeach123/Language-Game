#!/usr/bin/env python3
"""
Re-trim voice clips that are already split, with the current rules from
split_voice.py: squeeze long pauses inside a line to MAX_PAUSE and cut
trailing dead air down to PAD_AFTER. Only clips that get shorter are rewritten.

Usage:
    python3 tools/voice/tighten.py OUT_DIR [clip ...]
      OUT_DIR  the app's audio/ folder
      clip     names without .mp3 (default: every clip in OUT_DIR)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import split_voice as sv  # noqa: E402


def main():
    out_dir = sys.argv[1]
    names = sys.argv[2:] or sorted(f[:-4] for f in os.listdir(out_dir) if f.endswith('.mp3'))
    changed = 0
    for name in names:
        path = os.path.join(out_dir, name + '.mp3')
        samples = sv.decode(path)
        regions = sv.speech_regions(samples)
        if not regions:
            print('%-28s no speech found, left alone' % name)
            continue
        seg = sv.cut(samples, regions[0][0], regions[-1][1])
        before, after = len(samples) / sv.RATE, len(seg) / sv.RATE
        if before - after < 0.1:
            continue
        with open(path, 'wb') as fh:
            fh.write(sv.encode(seg))
        changed += 1
        print('%-28s %.2fs -> %.2fs' % (name, before, after))
    print('%d clip(s) tightened' % changed)


if __name__ == '__main__':
    main()
