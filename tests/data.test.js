'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const D = require('../js/words.js');

const ROOT = path.join(__dirname, '..');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

test('there are exactly 50 words with unique ids', () => {
  assert.equal(D.WORDS.length, 50);
  assert.equal(new Set(D.WORDS.map((w) => w.id)).size, 50);
});

test('the introduction order covers every word exactly once', () => {
  assert.equal(D.START_ORDER.length, 50);
  assert.deepEqual([...D.START_ORDER].sort(), D.WORDS.map((w) => w.id).sort());
});

test('every word is complete', () => {
  const kinds = new Set(['name', 'noun', 'plural', 'core']);
  D.WORDS.forEach((w) => {
    assert.ok(D.catById[w.cat], `${w.id}: unknown category`);
    assert.ok(kinds.has(w.kind), `${w.id}: unknown kind`);
    assert.ok(/\{[wW]\}/.test(w.phrase), `${w.id}: phrase should include the word`);
    assert.ok(Array.isArray(w.easy) && w.easy.length > 0, `${w.id}: needs close tries`);
    assert.ok(exists(`img/words/${w.img || w.id}.png`), `${w.id}: missing picture`);
  });
});

test('every category has words and an icon', () => {
  D.CATEGORIES.forEach((c) => {
    assert.ok(D.byId[c.icon], `${c.id}: icon word missing`);
    assert.ok(D.WORDS.some((w) => w.cat === c.id), `${c.id}: empty category`);
  });
});

test('every sticker has a picture', () => {
  assert.equal(new Set(D.STICKERS.map((s) => s.id)).size, D.STICKERS.length);
  D.STICKERS.forEach((s) => assert.ok(exists(`img/stickers/${s.id}.png`), `${s.id}: missing picture`));
});

test('every picture animation has CSS', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
  new Set(D.WORDS.map((w) => w.anim)).forEach((a) => {
    assert.ok(css.includes(`.anim-${a} {`), `missing .anim-${a}`);
  });
});

test('images referenced by the app exist', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const refs = src.match(/img\/ui\/[a-z-]+\.png/g) || [];
  assert.ok(refs.length > 0);
  refs.forEach((r) => assert.ok(exists(r), `missing ${r}`));
  const icons = src.match(/'img\/ui\/' \+ icon/) ? ['picture', 'search', 'speaking', 'star'] : [];
  icons.forEach((i) => assert.ok(exists(`img/ui/${i}.png`)));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  (html.match(/(?:href|src)="([^"]+)"/g) || []).forEach((m) => {
    const rel = m.replace(/^(?:href|src)="/, '').replace(/"$/, '');
    assert.ok(exists(rel), `index.html references missing ${rel}`);
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  manifest.icons.forEach((i) => assert.ok(exists(i.src), `manifest icon missing ${i.src}`));
});

test('the offline file list is up to date', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-sw.js'), '--check'], { stdio: 'pipe' });
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const listed = (sw.match(/^ {2}'([^']+)'/gm) || []).map((l) => l.trim().slice(1, -1));
  assert.ok(listed.includes('index.html'));
  listed.filter((f) => f !== './').forEach((f) => assert.ok(exists(f), `sw.js lists missing ${f}`));
});
