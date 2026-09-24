'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const D = require('../js/words.js');
const V = require('../tools/voice/lines.js');

const ROOT = path.join(__dirname, '..');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('50 words: 35 picture words for the game and 15 everyday words', () => {
  assert.equal(D.WORDS.length, 50);
  assert.equal(D.PICTURE_WORDS.length, 35);
  assert.equal(D.EVERYDAY_WORDS.length, 15);
  assert.equal(new Set(D.WORDS.map((w) => w.id)).size, 50);
});

test('the introduction order covers every picture word exactly once', () => {
  assert.deepEqual([...D.START_ORDER].sort(), D.PICTURE_WORDS.map((w) => w.id).sort());
});

test('every picture word is concrete and has real photos: 3 similar, 1 different-looking', () => {
  const kinds = new Set(['name', 'noun', 'plural']);
  D.PICTURE_WORDS.forEach((w) => {
    assert.ok(D.catById[w.cat] && !D.catById[w.cat].everyday, `${w.id}: category`);
    assert.ok(kinds.has(w.kind), `${w.id}: kind`);
    assert.ok(/\{[wW]\}/.test(w.phrase), `${w.id}: phrase should include the word`);
    const ex = D.photos(w);
    if (w.personal) {
      assert.equal(ex.length, 0, 'Anthony is only ever shown in a grown-up\'s photo');
      return;
    }
    assert.equal(ex.filter((e) => e.tier === 'narrow').length, 3, `${w.id}: 3 similar photos`);
    assert.equal(ex.filter((e) => e.tier === 'wide').length, 1, `${w.id}: 1 different-looking photo`);
    ex.forEach((e) => {
      assert.equal(e.style, 'photo');
      assert.ok(exists(e.src), `${w.id}: missing ${e.src}`);
    });
  });
  assert.equal(D.byId.me.word, 'Anthony');
});

test('everyday words have a routine tip and a photo, and are never game targets', () => {
  D.EVERYDAY_WORDS.forEach((w) => {
    assert.ok(w.life, `${w.id}: needs a real-life tip`);
    assert.ok(exists(D.everydayPhoto(w)), `${w.id}: missing photo`);
    assert.ok(!D.START_ORDER.includes(w.id));
  });
});

test('sound-alike pairs are real picture words', () => {
  D.SOUND_ALIKE.forEach(([a, b]) => {
    assert.ok(D.byId[a] && !D.byId[a].everyday, a);
    assert.ok(D.byId[b] && !D.byId[b].everyday, b);
    assert.ok(D.soundAlike(a, b) && D.soundAlike(b, a));
  });
  assert.ok(!D.soundAlike('ball', 'banana'), 'sharing a first sound is fine');
});

test('face close-ups are never shown side by side', () => {
  ['nose', 'eyes', 'mouth', 'ears'].forEach((id) => assert.equal(D.byId[id].look, 'face', id));
});

test('every photo file is used, and every sticker has a picture', () => {
  const used = new Set();
  D.PICTURE_WORDS.forEach((w) => D.photos(w).forEach((e) => used.add(path.basename(e.src))));
  D.EVERYDAY_WORDS.forEach((w) => used.add(path.basename(D.everydayPhoto(w))));
  fs.readdirSync(path.join(ROOT, 'img/photos')).forEach((f) => assert.ok(used.has(f), `unused photo ${f}`));
  assert.ok(!exists('img/words'), 'the old cartoon word pictures are gone');
  D.STICKERS.forEach((s) => assert.ok(exists(`img/stickers/${s.id}.png`), `${s.id}: missing picture`));
});

test('photo prompts cover every photo', () => {
  const sheets = require('../tools/photos/prompts.js').sheets();
  const cells = new Set([].concat(...Object.values(sheets).map((s) => s.cells)).filter(Boolean));
  fs.readdirSync(path.join(ROOT, 'img/photos')).forEach((f) => assert.ok(cells.has(f.replace('.jpg', '')), f));
});

test('every picture animation has CSS', () => {
  const css = read('css/app.css');
  new Set(D.WORDS.map((w) => w.anim)).forEach((a) => {
    assert.ok(css.includes(`.anim-${a} {`), `missing .anim-${a}`);
  });
});

test('the game never asks the child to talk, and has no engagement tricks', () => {
  const src = read('js/app.js');
  assert.ok(!/Said it|Not yet|sayRound|recordSay|getUserMedia/.test(src));
  assert.ok(!/P\.streak|-day streak|keep it going/i.test(src), 'no streaks');
  assert.ok(!/Notification|setInterval/.test(src), 'no notifications or background timers');
});

test('every spoken line is a recorded voice clip (no computer voice)', () => {
  ['js/app.js', 'js/audio.js'].forEach((f) => {
    assert.ok(!/speechSynthesis|SpeechSynthesisUtterance|getUserMedia|MediaRecorder/.test(read(f)), f);
  });
  const groups = V.groups();
  const expected = new Set();
  Object.keys(groups).forEach((g) => {
    const prefix = g.startsWith('_') ? 'common' : g;
    groups[g].lines.forEach((l) => expected.add(`${prefix}-${l.key}.mp3`));
  });
  expected.forEach((f) => assert.ok(exists(`audio/${f}`), `missing clip audio/${f}`));
  fs.readdirSync(path.join(ROOT, 'audio')).forEach((f) => assert.ok(expected.has(f), `stray clip audio/${f}`));
});

test('every clip the app asks for exists', () => {
  const src = read('js/app.js');
  const clip = (name) => assert.ok(exists(`audio/${name}.mp3`), `missing clip audio/${name}.mp3`);
  const list = (name) => {
    const m = src.match(new RegExp(`var ${name} = \\[([^\\]]*)\\]`));
    assert.ok(m, name);
    return m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  };
  // Word clips: app and generator agree on the keys.
  const keys = list('WORD_CLIPS');
  assert.deepEqual(keys, V.wordLines(D.byId.ball).map((l) => l.key));
  D.PICTURE_WORDS.forEach((w) => keys.forEach((k) => clip(`${w.id}-${k}`)));
  ['PRAISE', 'PRAISE_NAME', 'CELEBRATE', 'GREET'].forEach((n) => list(n).forEach((k) => clip(`common-${k}`)));
  (src.match(/shared\('([a-z-]+)'\)/g) || []).forEach((m) => clip(`common-${m.slice(8, -2)}`));
  D.CATEGORIES.forEach((c) => clip(`common-cat-${c.id}`));
  D.STICKERS.forEach((s) => { clip(`common-got-${s.id}`); clip(`common-name-${s.id}`); });
  D.EVERYDAY_WORDS.forEach((w) => { clip(`common-${w.id}-word`); clip(`common-${w.id}-phrase`); });
  (src.match(/Speech\.say\(\['([a-z-]+)'\]\)/g) || []).forEach((m) => clip(m.slice(13, -3)));
});

test('the praise uses Anthony\'s name and there is no name screen', () => {
  const src = read('js/app.js');
  assert.ok(!/childName/.test(src), 'no child-name setting');
  assert.equal(V.CHILD, 'Anthony');
  assert.ok(V.SHARED.filter((l) => /Anthony/.test(l.text)).length >= 6);
  assert.ok(V.wordLines(D.byId.me).every((l) => /Anthony/.test(l.text)), '"me" is said as Anthony');
});

test('the app is called Word Wizard and the mascot is a wizard', () => {
  ['index.html', 'manifest.webmanifest', 'js/app.js', 'README.md'].forEach((f) => {
    assert.ok(read(f).includes('Word Wizard'), f);
    assert.ok(!/Word Buddies|\bPip\b/.test(read(f)), `${f} still mentions the old name`);
  });
  assert.ok(read('js/app.js').includes('img/ui/wizard.png') && exists('img/ui/wizard.png'), 'the wizard picture');
});

test('images referenced by the app exist', () => {
  const src = read('js/app.js');
  const refs = src.match(/img\/ui\/[a-z-]+\.png/g) || [];
  assert.ok(refs.length > 0);
  refs.forEach((r) => assert.ok(exists(r), `missing ${r}`));
  (src.match(/modeBtn\('([a-z-]+)'/g) || []).forEach((m) => {
    const icon = m.slice(9, -1);
    assert.ok(exists(`img/ui/${icon}.png`), `missing mode icon ${icon}`);
  });
  const html = read('index.html');
  (html.match(/(?:href|src)="([^"]+)"/g) || []).forEach((m) => {
    const rel = m.replace(/^(?:href|src)="/, '').replace(/"$/, '');
    assert.ok(exists(rel), `index.html references missing ${rel}`);
  });
  const manifest = JSON.parse(read('manifest.webmanifest'));
  manifest.icons.forEach((i) => assert.ok(exists(i.src), `manifest icon missing ${i.src}`));
  const css = read('css/app.css');
  fs.readdirSync(path.join(ROOT, 'img/ui')).forEach((f) => assert.ok(src.includes(`img/ui/${f}`) || css.includes(`img/ui/${f}`) || src.includes(`modeBtn('${f.replace('.png', '')}'`), `unused icon ${f}`));
});

test('the offline file list is up to date', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-sw.js'), '--check'], { stdio: 'pipe' });
  const sw = read('sw.js');
  const listed = (sw.match(/^ {2}'([^']+)'/gm) || []).map((l) => l.trim().slice(1, -1));
  assert.ok(listed.includes('index.html'));
  assert.ok(listed.includes('img/photos/ball-1.jpg'), 'photos are cached for offline use');
  assert.ok(listed.includes('audio/ball-where.mp3'), 'voice clips are cached for offline use');
  listed.filter((f) => f !== './').forEach((f) => assert.ok(exists(f), `sw.js lists missing ${f}`));
});
