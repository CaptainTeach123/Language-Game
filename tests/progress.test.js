'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/progress.js');
const D = require('../js/words.js');

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 0, 5, 10, 0, 0).getTime(); // a Monday morning, local time

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fresh() {
  return P.createState(T0);
}

// Make a word mastered: right with 4 pictures on 3 different days.
function master(state, id, start) {
  const t = start || T0;
  for (let d = 0; d < 3; d++) {
    P.recordFind(state, id, true, 4, t + d * DAY);
    P.recordFind(state, id, true, 4, t + d * DAY + 1000);
  }
}

test('a brand new word has no stars', () => {
  const lv = P.level(P.newStat());
  assert.equal(lv.stars, 0);
  assert.equal(lv.stage, 'new');
  assert.equal(lv.mastered, false);
});

test('hearing a word starts it but earns no stars', () => {
  const s = fresh();
  P.recordExposure(s, 'ball', T0);
  const lv = P.level(P.peek(s, 'ball'));
  assert.equal(lv.stage, 'started');
  assert.equal(lv.stars, 0);
  assert.equal(s.days[P.dayKey(T0)].heard, 1);
});

test('star 1: right on the first try twice', () => {
  const s = fresh();
  P.recordFind(s, 'ball', true, 2, T0);
  assert.equal(P.level(P.peek(s, 'ball')).fromTwo, false);
  P.recordFind(s, 'ball', true, 2, T0 + 1000);
  const lv = P.level(P.peek(s, 'ball'));
  assert.equal(lv.fromTwo, true);
  assert.equal(lv.fromMany, false);
  assert.equal(lv.stars, 1);
});

test('star 2: right twice with 3 or 4 pictures', () => {
  const s = fresh();
  P.recordFind(s, 'dog', true, 3, T0);
  P.recordFind(s, 'dog', true, 4, T0 + 1000);
  const lv = P.level(P.peek(s, 'dog'));
  assert.equal(lv.fromMany, true);
  assert.equal(lv.fromTwo, true, 'picking from more pictures implies picking from 2');
  assert.equal(lv.mastered, false, 'one day is not mastery');
});

test('mastery needs wins with 3+ pictures on 3 different days', () => {
  const s = fresh();
  for (let d = 0; d < 2; d++) {
    P.recordFind(s, 'cat', true, 4, T0 + d * DAY);
    P.recordFind(s, 'cat', true, 4, T0 + d * DAY + 1);
  }
  assert.equal(P.level(P.peek(s, 'cat')).mastered, false, 'two days is not enough');
  P.recordFind(s, 'cat', true, 4, T0 + 2 * DAY);
  const lv = P.level(P.peek(s, 'cat'));
  assert.equal(lv.mastered, true);
  assert.equal(lv.stars, 3);
});

test('wins with only 2 pictures never reach mastery (could be luck)', () => {
  const s = fresh();
  for (let d = 0; d < 6; d++) P.recordFind(s, 'duck', true, 2, T0 + d * DAY);
  const lv = P.level(P.peek(s, 'duck'));
  assert.equal(lv.fromTwo, true);
  assert.equal(lv.fromMany, false);
  assert.equal(lv.mastered, false);
});

test('mastery needs 4 of the last 5 right, and is lost if the word starts getting missed', () => {
  const s = fresh();
  master(s, 'milk');
  assert.equal(P.isMastered(s, 'milk'), true);
  P.recordFind(s, 'milk', false, 4, T0 + 5 * DAY);
  assert.equal(P.isMastered(s, 'milk'), true, 'one miss: 4 of 5 is still fine');
  P.recordFind(s, 'milk', false, 4, T0 + 5 * DAY + 1);
  assert.equal(P.isMastered(s, 'milk'), false, 'two misses: back to learning');
  const lv = P.level(P.peek(s, 'milk'));
  assert.equal(lv.fromMany, true, 'earlier stars stay');
});

test('only the first tap is recorded as a round', () => {
  const s = fresh();
  P.recordFind(s, 'car', false, 3, T0);
  const st = P.peek(s, 'car');
  assert.equal(st.findTries, 1);
  assert.equal(st.findOk, 0);
  assert.deepEqual(st.recent, [0]);
  assert.equal(s.days[P.dayKey(T0)].rounds, 1);
  assert.equal(s.days[P.dayKey(T0)].correct, 0);
});

test('"already understands this word" counts as mastered', () => {
  const s = fresh();
  P.setKnown(s, 'mommy', true);
  assert.equal(P.isMastered(s, 'mommy'), true);
  P.setKnown(s, 'mommy', false);
  assert.equal(P.isMastered(s, 'mommy'), false);
});

test('Find it gets harder as the child gets it right', () => {
  const st = P.newStat();
  assert.equal(P.choiceCount(st), 2);
  st.recent = [1, 0];
  assert.equal(P.choiceCount(st), 3);
  st.recent = [1, 1, 1, 1];
  assert.equal(P.choiceCount(st), 4);
  st.recent = [0, 0, 1];
  assert.equal(P.choiceCount(st), 2);
});

test('learning set fills in introduction order and skips paused and mastered words', () => {
  const s = fresh();
  s.settings.activeSize = 3;
  assert.deepEqual(P.refreshFocus(s, D.START_ORDER), ['mommy', 'daddy', 'ball']);
  master(s, 'daddy');
  P.removeFocus(s, 'ball');
  assert.deepEqual(P.refreshFocus(s, D.START_ORDER), ['mommy', 'more', 'dog']);
  assert.ok(s.paused.includes('ball'));
  P.addFocus(s, 'ball');
  assert.equal(s.focus[0], 'ball');
  assert.ok(!s.paused.includes('ball'));
});

test('a session only has listening activities, never repeats a word back to back, and names new words first', () => {
  const s = fresh();
  for (let seed = 1; seed < 40; seed++) {
    const plan = P.planSession(s, D.START_ORDER, { rounds: 10, rng: seeded(seed) }, T0);
    assert.equal(plan.length, 10);
    plan.forEach((r) => assert.ok(r.type === 'learn' || r.type === 'find', r.type));
    plan.filter((r) => r.type === 'find').forEach((r) => assert.ok(r.style === 'cards' || r.style === 'bubbles'));
    for (let i = 1; i < plan.length; i++) assert.notEqual(plan[i].id, plan[i - 1].id);
    const firstType = {};
    plan.forEach((r) => { if (!firstType[r.id]) firstType[r.id] = r.type; });
    Object.values(firstType).forEach((t) => assert.equal(t, 'learn', 'new words start with a learn round'));
    plan.forEach((r) => assert.ok(s.focus.includes(r.id)));
  }
});

test('words the child already found start with Find it', () => {
  const s = fresh();
  P.recordFind(s, 'mommy', true, 2, T0);
  assert.deepEqual(P.roundSequence(P.peek(s, 'mommy')), ['find', 'find', 'learn']);
  P.recordFind(s, 'mommy', false, 2, T0 + 1);
  assert.equal(P.roundSequence(P.peek(s, 'mommy'))[0], 'learn', 'after a miss, show and name it again first');
});

test('mastered words come back for review when due', () => {
  const s = fresh();
  s.settings.activeSize = 3;
  master(s, 'mommy', T0 - 10 * DAY);
  master(s, 'daddy', T0 - 10 * DAY);
  const plan = P.planSession(s, D.START_ORDER, { rounds: 10, rng: seeded(7) }, T0);
  const ids = plan.map((r) => r.id);
  assert.ok(ids.includes('mommy') || ids.includes('daddy'), 'a due review is included');
  assert.ok(['mommy', 'daddy'].includes(plan[0].id), 'session starts with an easy win');
  assert.equal(plan[0].type, 'find');
  assert.ok(!s.focus.includes('mommy'));
});

test('review schedule widens after each successful review', () => {
  const s = fresh();
  master(s, 'ball', T0);
  const st = P.peek(s, 'ball');
  const last = st.last;
  assert.equal(P.isDue(st, last), false);
  assert.equal(P.isDue(st, last + P.REVIEW_DAYS[st.reviewStep] * DAY), true);
  const before = st.reviewStep;
  P.recordFind(s, 'ball', true, 4, T0 + 10 * DAY);
  assert.equal(st.reviewStep, before + 1);
  P.recordFind(s, 'ball', true, 4, T0 + 10 * DAY + 1000);
  assert.equal(st.reviewStep, before + 1, 'only one step per day');
});

test('Find and Pop modes are all Find it rounds; Pop uses bubbles', () => {
  const s = fresh();
  const find = P.planSession(s, D.START_ORDER, { mode: 'find', rounds: 8, rng: seeded(3) }, T0);
  find.forEach((r) => { assert.equal(r.type, 'find'); assert.equal(r.style, 'cards'); });
  const pop = P.planSession(s, D.START_ORDER, { mode: 'pop', rounds: 8, rng: seeded(3) }, T0);
  pop.forEach((r) => { assert.equal(r.type, 'find'); assert.equal(r.style, 'bubbles'); });
  assert.equal(pop.length, 8);
});

test('when everything is mastered, sessions keep reviewing', () => {
  const s = fresh();
  D.START_ORDER.forEach((id) => P.setKnown(s, id, true));
  const plan = P.planSession(s, D.START_ORDER, { rounds: 6, rng: seeded(9) }, T0);
  assert.equal(plan.length, 6);
  plan.forEach((r) => assert.equal(r.type, 'find'));
});

test('distractors never look like the answer', () => {
  const s = fresh();
  for (let seed = 1; seed < 60; seed++) {
    D.WORDS.forEach((w) => {
      const ids = P.pickDistractors(D.WORDS, w.id, 3, s, seeded(seed));
      assert.equal(ids.length, 3);
      assert.ok(!ids.includes(w.id));
      const all = ids.concat([w.id]).map((id) => D.byId[id]);
      const imgs = all.map((x) => x.img || x.id);
      assert.equal(new Set(imgs).size, 4, 'no repeated pictures');
      const looks = all.filter((x) => x.look).map((x) => x.look);
      assert.equal(new Set(looks).size, looks.length, 'no two look-alikes');
    });
  }
  const forMore = P.pickDistractors(D.WORDS, 'more', 3, s, seeded(1));
  assert.ok(!forMore.includes('cookie'), '"more" uses the cookie picture');
});

test('stickers: new ones first, then repeats', () => {
  const s = fresh();
  const got = new Set();
  for (let i = 0; i < D.STICKERS.length; i++) got.add(P.awardSticker(s, D.STICKERS, seeded(i + 1)).id);
  assert.equal(got.size, D.STICKERS.length);
  P.awardSticker(s, D.STICKERS, seeded(99));
  const total = Object.values(s.stickers).reduce((a, b) => a + b, 0);
  assert.equal(total, D.STICKERS.length + 1);
});

test('practice streak counts consecutive days', () => {
  const s = fresh();
  P.logSession(s, 60, T0 - 2 * DAY);
  P.logSession(s, 60, T0 - DAY);
  assert.equal(P.streak(s, T0), 2, 'streak is still alive before practicing today');
  P.logSession(s, 60, T0);
  assert.equal(P.streak(s, T0), 3);
  assert.equal(P.streak(s, T0 + 3 * DAY), 0);
});

test('report has a row per word, listening columns only, and quotes commas', () => {
  const s = fresh();
  s.custom.mommy = { label: 'Mama, Mom' };
  master(s, 'ball');
  const csv = P.reportCSV(s, D.WORDS, D.catById, (w) => (s.custom[w.id] && s.custom[w.id].label) || w.word);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, D.WORDS.length + 1);
  assert.ok(!/say|said|tried/i.test(lines[0]), 'no speaking columns');
  assert.ok(lines[1].startsWith('"Mama, Mom",People'));
  const ball = lines.find((l) => l.startsWith('ball,'));
  assert.ok(ball.includes('mastered,yes,yes,yes,6,6,100%'), ball);
});

test('saved data is repaired instead of crashing, and old saves carry over', () => {
  const s = P.normalizeState({ words: { ball: { seen: 2, recent: 'oops' } }, settings: { rate: 1, mic: true }, focus: 'x' }, T0);
  assert.deepEqual(s.words.ball.recent, []);
  assert.equal(s.words.ball.seen, 2);
  assert.equal(s.settings.rate, 1);
  assert.ok(!('mic' in s.settings), 'retired settings are dropped');
  assert.equal(s.settings.activeSize, P.DEFAULT_SETTINGS.activeSize);
  assert.deepEqual(s.focus, []);
  assert.deepEqual(P.normalizeState(null, T0).words, {});
  assert.deepEqual(P.normalizeState('garbage', T0).focus, []);

  // A save from the first version (with speaking stats) keeps its listening progress.
  const old = P.normalizeState({ words: { dog: { findOk: 5, findTries: 6, recent: [1, 1, 1, 1], findDays: ['2026-01-01', '2026-01-02', '2026-01-03'], said: 2, saidDays: ['2026-01-01'] } } }, T0);
  const dog = old.words.dog;
  assert.deepEqual(dog.winDays, ['2026-01-01', '2026-01-02', '2026-01-03']);
  assert.equal(dog.wins3, 3);
  assert.equal(dog.wins2, 2);
  assert.ok(!('said' in dog));
  assert.equal(P.level(dog).mastered, true);
});

test('dayDiff works across month and DST boundaries', () => {
  assert.equal(P.dayDiff('2026-01-31', '2026-02-01'), 1);
  assert.equal(P.dayDiff('2026-03-07', '2026-03-09'), 2);
  assert.equal(P.dayDiff('2026-11-01', '2026-11-01'), 0);
});
