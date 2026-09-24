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

// Make a word mastered: understood on 2 days (3+ choices) and said on 3 days.
function master(state, id, start) {
  const t = start || T0;
  for (let d = 0; d < 3; d++) {
    P.recordFind(state, id, true, 4, t + d * DAY);
    P.recordSay(state, id, 'said', t + d * DAY);
  }
}

test('a brand new word has no stars', () => {
  const lv = P.level(P.newStat());
  assert.equal(lv.stars, 0);
  assert.equal(lv.stage, 'new');
  assert.equal(lv.mastered, false);
});

test('understands needs first-try wins with 3+ choices on 2 different days', () => {
  const s = fresh();
  P.recordFind(s, 'ball', true, 4, T0);
  P.recordFind(s, 'ball', true, 4, T0 + 1000);
  P.recordFind(s, 'ball', true, 4, T0 + 2000);
  assert.equal(P.level(P.peek(s, 'ball')).understands, false, 'one day is not enough');
  P.recordFind(s, 'ball', true, 4, T0 + DAY);
  assert.equal(P.level(P.peek(s, 'ball')).understands, true);
});

test('wins with only 2 choices do not count as understanding (could be luck)', () => {
  const s = fresh();
  for (let d = 0; d < 4; d++) P.recordFind(s, 'dog', true, 2, T0 + d * DAY);
  assert.equal(P.level(P.peek(s, 'dog')).understands, false);
});

test('recent misses take the understands star away again', () => {
  const s = fresh();
  P.recordFind(s, 'cat', true, 4, T0);
  P.recordFind(s, 'cat', true, 4, T0 + DAY);
  P.recordFind(s, 'cat', true, 4, T0 + DAY + 1);
  assert.equal(P.level(P.peek(s, 'cat')).understands, true);
  P.recordFind(s, 'cat', false, 4, T0 + 2 * DAY);
  P.recordFind(s, 'cat', false, 4, T0 + 2 * DAY + 1);
  assert.equal(P.level(P.peek(s, 'cat')).understands, false);
});

test('says needs "Said it!" on 3 different days; any try earns the tries star', () => {
  const s = fresh();
  P.recordSay(s, 'milk', 'tried', T0);
  let lv = P.level(P.peek(s, 'milk'));
  assert.equal(lv.tries, true);
  assert.equal(lv.says, false);
  P.recordSay(s, 'milk', 'said', T0);
  P.recordSay(s, 'milk', 'said', T0 + 5000);
  P.recordSay(s, 'milk', 'said', T0 + DAY);
  assert.equal(P.level(P.peek(s, 'milk')).says, false, 'same day twice counts once');
  P.recordSay(s, 'milk', 'said', T0 + 2 * DAY);
  lv = P.level(P.peek(s, 'milk'));
  assert.equal(lv.says, true);
  assert.equal(lv.mastered, false, 'still needs the understands star');
});

test('mastered = understands + says', () => {
  const s = fresh();
  master(s, 'more');
  const lv = P.level(P.peek(s, 'more'));
  assert.equal(lv.mastered, true);
  assert.equal(lv.stars, 3);
});

test('"already says this word" counts as mastered', () => {
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

test('a session has the right length, never repeats a word back to back, and teaches before testing', () => {
  const s = fresh();
  for (let seed = 1; seed < 40; seed++) {
    const plan = P.planSession(s, D.START_ORDER, { rounds: 10, rng: seeded(seed) }, T0);
    assert.equal(plan.length, 10);
    for (let i = 1; i < plan.length; i++) assert.notEqual(plan[i].id, plan[i - 1].id);
    const firstType = {};
    plan.forEach((r) => { if (!firstType[r.id]) firstType[r.id] = r.type; });
    Object.values(firstType).forEach((t) => assert.equal(t, 'learn', 'new words start with a learn round'));
    plan.forEach((r) => assert.ok(s.focus.includes(r.id)));
  }
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
  assert.ok(!s.focus.includes('mommy'));
});

test('review schedule widens after each successful review', () => {
  const s = fresh();
  master(s, 'ball', T0);
  const st = P.peek(s, 'ball');
  const last = T0 + 2 * DAY;
  assert.equal(P.isDue(st, last), false);
  assert.equal(P.isDue(st, last + P.REVIEW_DAYS[st.reviewStep] * DAY), true);
  const before = st.reviewStep;
  P.recordFind(s, 'ball', true, 4, T0 + 10 * DAY);
  assert.equal(st.reviewStep, before + 1);
  P.recordFind(s, 'ball', true, 4, T0 + 10 * DAY + 1000);
  assert.equal(st.reviewStep, before + 1, 'only one step per day');
});

test('Find it and Say it modes only use that activity', () => {
  const s = fresh();
  ['find', 'say'].forEach((mode) => {
    const plan = P.planSession(s, D.START_ORDER, { mode, rounds: 8, rng: seeded(3) }, T0);
    assert.equal(plan.length, 8);
    plan.forEach((r) => assert.equal(r.type, mode));
  });
});

test('when everything is mastered, sessions keep reviewing', () => {
  const s = fresh();
  D.START_ORDER.forEach((id) => P.setKnown(s, id, true));
  const plan = P.planSession(s, D.START_ORDER, { rounds: 6, rng: seeded(9) }, T0);
  assert.equal(plan.length, 6);
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

test('report has a row per word and quotes commas', () => {
  const s = fresh();
  s.custom.mommy = { label: 'Mama, Mom' };
  const csv = P.reportCSV(s, D.WORDS, D.catById, (w) => (s.custom[w.id] && s.custom[w.id].label) || w.word);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, D.WORDS.length + 1);
  assert.ok(lines[1].startsWith('"Mama, Mom",People'));
});

test('saved data is repaired instead of crashing', () => {
  const s = P.normalizeState({ words: { ball: { seen: 2, recent: 'oops' } }, settings: { rate: 1 }, focus: 'x' }, T0);
  assert.deepEqual(s.words.ball.recent, []);
  assert.equal(s.words.ball.seen, 2);
  assert.equal(s.settings.rate, 1);
  assert.equal(s.settings.activeSize, P.DEFAULT_SETTINGS.activeSize);
  assert.deepEqual(s.focus, []);
  assert.deepEqual(P.normalizeState(null, T0).words, {});
  assert.deepEqual(P.normalizeState('garbage', T0).focus, []);
});

test('dayDiff works across month and DST boundaries', () => {
  assert.equal(P.dayDiff('2026-01-31', '2026-02-01'), 1);
  assert.equal(P.dayDiff('2026-03-07', '2026-03-09'), 2);
  assert.equal(P.dayDiff('2026-11-01', '2026-11-01'), 0);
});
