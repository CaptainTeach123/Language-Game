#!/usr/bin/env python3
"""
Split generated voice recordings into one small MP3 per line.

Each ElevenLabs generation (see tools/voice/lines.js) says several lines with
1.5 s of silence between them. This finds the speech between the silences,
trims it, fades the edges and re-encodes each line as a small mono MP3:

    audio/<word>-<line>.mp3        e.g. audio/ball-where.mp3 ("Where's the ball?")
    audio/common-<line>.mp3        praise, greetings, sticker names, everyday words
                                   (not "_...": GitHub Pages' Jekyll build skips files starting with _)

Usage:
    pip install miniaudio lameenc
    python3 tools/voice/split_voice.py RAW_DIR GROUPS_JSON OUT_DIR
      RAW_DIR      one MP3 per group, named <group>.mp3 (e.g. ball.mp3, _shared1.mp3)
      GROUPS_JSON  output of `node tools/voice/lines.js`
      OUT_DIR      where the per-line MP3s go (the app's audio/ folder)
Exits with an error if a recording doesn't split into the expected number of lines.
"""
import array
import json
import math
import os
import sys

import lameenc
import miniaudio

RATE = 22050           # plenty for speech, half the size of 44.1 kHz
WIN = 0.01             # 10 ms analysis windows
MIN_GAP = 0.8          # silence this long separates two lines
MAX_INNER_PAUSE = 1.45 # ...unless there are too many, then pauses shorter than this are joined
PAD_BEFORE = 0.06
PAD_AFTER = 0.12
FADE = 0.012
BITRATE = 48


def decode(path):
    d = miniaudio.decode_file(path, output_format=miniaudio.SampleFormat.SIGNED16, nchannels=1, sample_rate=RATE)
    return array.array('h', d.samples)


def rms_windows(samples):
    n = int(RATE * WIN)
    out = []
    for i in range(0, len(samples), n):
        chunk = samples[i:i + n]
        if not chunk:
            break
        out.append(math.sqrt(sum(s * s for s in chunk) / len(chunk)) / 32768.0)
    return out


def speech_regions(samples):
    rms = rms_windows(samples)
    loud = sorted(rms)[int(len(rms) * 0.95)] if rms else 0
    threshold = max(0.004, loud * 0.06)
    active = [r > threshold for r in rms]
    regions = []
    start = None
    quiet = 0
    gap = int(MIN_GAP / WIN)
    for i, a in enumerate(active):
        if a:
            if start is None:
                start = i
            quiet = 0
            end = i
        elif start is not None:
            quiet += 1
            if quiet >= gap:
                regions.append((start, end))
                start = None
    if start is not None:
        regions.append((start, end))
    # Ignore tiny blips (clicks, breaths) shorter than 80 ms.
    regions = [(s, e) for s, e in regions if (e - s + 1) * WIN >= 0.08]
    # Grow each region outwards while it's still above a much lower level, so soft
    # starts ("You...") and trailing sounds aren't cut off. Never cross into a neighbour.
    low = max(0.0015, loud * 0.012)
    grown = []
    for i, (s, e) in enumerate(regions):
        floor = grown[-1][1] + 1 if grown else 0
        ceil = regions[i + 1][0] - 1 if i + 1 < len(regions) else len(rms) - 1
        while s > floor and rms[s - 1] > low:
            s -= 1
        while e < ceil and rms[e + 1] > low:
            e += 1
        grown.append((s, e))
    return [(s * WIN, (e + 1) * WIN) for s, e in grown]


def cut(samples, start, end):
    a = max(0, int((start - PAD_BEFORE) * RATE))
    b = min(len(samples), int((end + PAD_AFTER) * RATE))
    seg = array.array('h', samples[a:b])
    f = int(FADE * RATE)
    for i in range(min(f, len(seg))):
        seg[i] = int(seg[i] * i / f)
        seg[-1 - i] = int(seg[-1 - i] * i / f)
    return seg


def encode(seg):
    enc = lameenc.Encoder()
    enc.set_bit_rate(BITRATE)
    enc.set_in_sample_rate(RATE)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode(seg.tobytes()) + enc.flush()


def main():
    raw_dir, groups_json, out_dir = sys.argv[1:4]
    groups = json.load(open(groups_json))
    os.makedirs(out_dir, exist_ok=True)
    problems = []
    total = 0
    for name, group in groups.items():
        path = os.path.join(raw_dir, name + '.mp3')
        if not os.path.exists(path):
            problems.append('%s: no recording' % name)
            continue
        samples = decode(path)
        regions = speech_regions(samples)
        lines = group['lines']
        # A line with two sentences ("All done! No more.") can have a pause inside it.
        # The breaks between lines are longer, so join the closest pairs.
        while len(regions) > len(lines):
            gaps = [regions[i + 1][0] - regions[i][1] for i in range(len(regions) - 1)]
            i = gaps.index(min(gaps))
            if gaps[i] > MAX_INNER_PAUSE:
                break
            regions[i:i + 2] = [(regions[i][0], regions[i + 1][1])]
        if len(regions) != len(lines):
            problems.append('%s: found %d lines, expected %d (%s)' % (
                name, len(regions), len(lines), ', '.join('%.2f-%.2f' % r for r in regions)))
            continue
        prefix = 'common' if name.startswith('_') else name
        for line, (start, end) in zip(lines, regions):
            data = encode(cut(samples, start, end))
            with open(os.path.join(out_dir, '%s-%s.mp3' % (prefix, line['key'])), 'wb') as fh:
                fh.write(data)
            total += len(data)
        print('%-12s %d lines' % (name, len(lines)))
    print('total %.0f KB' % (total / 1024))
    if problems:
        print('PROBLEMS:\n  ' + '\n  '.join(problems))
        sys.exit(1)


if __name__ == '__main__':
    main()
