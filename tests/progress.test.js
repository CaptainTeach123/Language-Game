'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/progress.js');
const D = require('../js/words.js');

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 0, 5, 10, 0, 0).getTime(); // a Monday morning, local time
const day = (n) => T0 + n * DAY;

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

// Play one session for a word: results is a list like ['correct', 'error', 'prompted'].
function session(state, id, results, when, sid) {
  const s = sid || when;
  results.forEach((r, i) => P.recordTrial(state, id, r, { session: s, exemplar: id + '@3d' }, when + i));
  P.finishSession(state, s, 60, when + 100);
}

// Bring a word to Review: level 1 -> 2 -> 3 -> review across days.
function toReview(state, id, start) {
  P.introduce(state, id, start);
  session(state, id, ['correct', 'correct'], start);                  // level 1 -> 2 (two in a row)
  session(state, id, ['correct', 'correct'], start + 1000);           // level 2, session 1
  session(state, id, ['correct', 'correct'], start + 2000);           // level 2, session 2 -> level 3
  session(state, id, ['correct', 'correct'], start + 3000);           // level 3 day 0
  session(state, id, ['correct', 'correct'], start + DAY);            // level 3 day 1 -> review
}

test('a word starts as New and joins Learning at 2 pictures', () => {
  const s = fresh();
  assert.equal(P.peek(s, 'ball').state, 'new');
  P.introduce(s, 'ball', T0);
  const st = P.peek(s, 'ball');
  assert.equal(st.state, 'learning');
  assert.equal(P.fieldSize(st.level), 2);
  assert.equal(st.introduced, P.dayKey(T0));
});

test('2 pictures is a coin flip: move to 3 as soon as it is right twice in a row', () => {
  const s = fresh();
  P.introduce(s, 'ball', T0);
  P.recordTrial(s, 'ball', 'correct', { session: 1 }, T0);
  assert.equal(P.peek(s, 'ball').level, 1);
  P.recordTrial(s, 'ball', 'correct', { session: 1 }, T0 + 1);
  assert.equal(P.peek(s, 'ball').level, 2);
});

test('level up needs about 80% with no hint across 2 separate sessions', () => {
  const s = fresh();
  P.introduce(s, 'dog', T0);
  P.stat(s, 'dog').level = 2;
  session(s, 'dog', ['correct', 'correct', 'correct'], T0);
  assert.equal(P.peek(s, 'dog').level, 2, 'one session is not enough');
  session(s, 'dog', ['correct', 'correct'], T0 + 1000);
  assert.equal(P.peek(s, 'dog').level, 3);

  const t = fresh();
  P.introduce(t, 'cat', T0);
  P.stat(t, 'cat').level = 2;
  session(t, 'cat', ['correct', 'error', 'correct'], T0);
  session(t, 'cat', ['correct', 'prompted', 'correct'], T0 + 1000);
  assert.equal(P.peek(t, 'cat').level, 2, '4 of 6 (67%) stays put; a hinted find is not correct');
});

test('a level drops back after 2 sessions below 50%', () => {
  const s = fresh();
  P.introduce(s, 'car', T0);
  P.stat(s, 'car').level = 3;
  session(s, 'car', ['error', 'prompted', 'correct'], T0);
  assert.equal(P.peek(s, 'car').level, 3);
  session(s, 'car', ['error', 'error'], T0 + 1000);
  assert.equal(P.peek(s, 'car').level, 2);
});

test('Learning -> Review needs 4-picture success on 2 different days', () => {
  const s = fresh();
  P.introduce(s, 'milk', T0);
  P.stat(s, 'milk').level = 3;
  session(s, 'milk', ['correct', 'correct'], T0);
  session(s, 'milk', ['correct', 'correct'], T0 + 1000);
  assert.equal(P.peek(s, 'milk').state, 'learning', 'same day twice is not enough');
  session(s, 'milk', ['correct', 'correct'], day(1));
  const st = P.peek(s, 'milk');
  assert.equal(st.state, 'review');
  assert.equal(st.due, P.addDays(P.dayKey(day(1)), 2), 'first check 2 days later');
});

test('Review -> Mastered after checks 2 days and then 7 days later', () => {
  const s = fresh();
  toReview(s, 'book', T0);
  assert.equal(P.peek(s, 'book').state, 'review');
  P.recordTrial(s, 'book', 'correct', { session: 9, exemplar: 'book@alt1' }, day(3));
  let st = P.peek(s, 'book');
  assert.equal(st.state, 'review');
  assert.equal(st.due, P.addDays(P.dayKey(day(3)), 7));
  P.recordTrial(s, 'book', 'correct', { session: 10, exemplar: 'book@alt2' }, day(10));
  st = P.peek(s, 'book');
  assert.equal(st.state, 'mastered');
  assert.equal(st.masteredOn, P.dayKey(day(10)));
  assert.equal(st.due, P.addDays(P.dayKey(day(10)), P.MAINT_GAPS[0]));
});

test('a review word missed twice in a row goes back to Learning; one miss retries tomorrow', () => {
  const s = fresh();
  toReview(s, 'hat', T0);
  P.recordTrial(s, 'hat', 'error', { session: 9 }, day(3));
  assert.equal(P.peek(s, 'hat').state, 'review');
  assert.equal(P.peek(s, 'hat').due, P.addDays(P.dayKey(day(3)), 1));
  P.recordTrial(s, 'hat', 'prompted', { session: 10 }, day(4));
  const st = P.peek(s, 'hat');
  assert.equal(st.state, 'learning');
  assert.equal(P.fieldSize(st.level), 4);
});

test('a mastered word missed twice in a row goes back to Learning', () => {
  const s = fresh();
  P.setKnown(s, 'cup', true, T0);
  assert.equal(P.peek(s, 'cup').state, 'mastered');
  P.recordTrial(s, 'cup', 'error', { session: 1 }, T0);
  assert.equal(P.peek(s, 'cup').state, 'mastered');
  P.recordTrial(s, 'cup', 'error', { session: 2 }, day(1));
  const st = P.peek(s, 'cup');
  assert.equal(st.state, 'learning');
  assert.equal(st.known, false, 'the grown-up\'s "already knows" is overruled by two misses');
});

test('only a first tap with no hint counts as correct', () => {
  const s = fresh();
  P.introduce(s, 'duck', T0);
  P.recordTrial(s, 'duck', 'prompted', { session: 1 }, T0);
  P.recordTrial(s, 'duck', 'error', { session: 1 }, T0 + 1);
  P.recordCorrection(s, 'duck', true);
  const st = P.peek(s, 'duck');
  assert.equal(st.trials, 2);
  assert.equal(st.correct, 0);
  assert.equal(st.prompted, 1);
  assert.equal(st.errors, 1);
  assert.equal(st.corrections, 1, 'do-overs are tallied separately');
  assert.deepEqual(st.hist[0], { s: 1, d: P.dayKey(T0), l: 1, n: 2, ok: 0 });
  assert.equal(s.days[P.dayKey(T0)].trials, 2);
  assert.equal(s.days[P.dayKey(T0)].correct, 0);
});

test('sessions add 1-2 new words only while the learning set has room', () => {
  const s = fresh();
  s.settings.learningCap = 4;
  let r = P.planSession(s, D.START_ORDER, { trials: 10, rng: seeded(1) }, T0);
  assert.deepEqual(r.newWords, ['mommy', 'daddy']);
  r = P.planSession(s, D.START_ORDER, { trials: 10, rng: seeded(2) }, T0 + 1000);
  assert.deepEqual(r.newWords, ['ball', 'dog']);
  r = P.planSession(s, D.START_ORDER, { trials: 10, rng: seeded(3) }, T0 + 2000);
  assert.deepEqual(r.newWords, [], 'learning set is full (4)');
});

test('a session has the right length, never repeats a word back to back, and names new words first', () => {
  for (let seed = 1; seed < 30; seed++) {
    const s = fresh();
    ['ball', 'dog', 'milk'].forEach((id) => P.introduce(s, id, T0));
    P.stat(s, 'ball').trials = 3; // not the first session ever
    const { plan, newWords } = P.planSession(s, D.START_ORDER, { trials: 12, rng: seeded(seed) }, T0);
    assert.equal(plan.length, 12);
    for (let i = 1; i < plan.length; i++) assert.notEqual(plan[i].id, plan[i - 1].id);
    newWords.forEach((id) => {
      const first = plan.find((r) => r.id === id);
      assert.equal(first.type, 'learn', `${id} is met before it is tested`);
    });
    plan.forEach((r) => assert.ok(r.type === 'find' || r.check === 'intro'));
  }
});

test('the very first session starts with one-picture trials to teach tapping', () => {
  const s = fresh();
  ['ball', 'dog', 'milk', 'car'].forEach((id) => P.introduce(s, id, T0));
  const { plan } = P.planSession(s, D.START_ORDER, { trials: 10, rng: seeded(5) }, T0);
  const intros = plan.filter((r) => r.type === 'learn');
  assert.ok(intros.length >= 2 && intros.length <= 4, `${intros.length} intro trials`);
});

test('session mix: about 60% learning, 30% review, 10% mastered', () => {
  const s = fresh();
  s.settings.learningCap = 3;
  ['ball', 'dog', 'milk'].forEach((id) => { P.introduce(s, id, T0); P.stat(s, id).trials = 2; });
  ['book', 'car', 'cat', 'hat'].forEach((id) => toReview(s, id, day(-10)));
  ['cup', 'apple'].forEach((id) => P.setKnown(s, id, true, day(-40)));
  const { plan } = P.planSession(s, D.START_ORDER, { trials: 10, rng: seeded(7) }, T0);
  const count = (c) => plan.filter((r) => r.check === c).length;
  assert.equal(plan.length, 10);
  assert.equal(count('review'), 3);
  assert.equal(count('maint'), 1);
  assert.equal(count('learning') + count('intro'), 6);
  assert.equal(plan[0].check, 'maint', 'starts with an easy win');
});

test('paused words and unavailable words are left out', () => {
  const s = fresh();
  s.settings.learningCap = 6;
  P.introduce(s, 'ball', T0);
  P.pause(s, 'ball');
  const available = (id) => id !== 'mommy' && id !== 'me';
  const { plan, newWords } = P.planSession(s, D.START_ORDER, { trials: 10, rng: seeded(1), available }, T0);
  assert.ok(!plan.some((r) => r.id === 'ball' || r.id === 'mommy'));
  assert.deepEqual(newWords, ['daddy', 'dog']);
});

test('wrong-answer pictures are unrelated: other category, not sound-alike, not look-alike', () => {
  const s = fresh();
  for (let seed = 1; seed < 40; seed++) {
    D.PICTURE_WORDS.forEach((w) => {
      [1, 2, 3].forEach((level) => {
        const ids = P.pickFoils(D.PICTURE_WORDS, w, P.fieldSize(level) - 1, s, { level, rng: seeded(seed), soundAlike: D.soundAlike });
        assert.equal(ids.length, P.fieldSize(level) - 1);
        ids.forEach((id) => {
          const f = D.byId[id];
          assert.notEqual(f.cat, w.cat, `${w.id} vs ${id}: same category`);
          assert.ok(!D.soundAlike(w.id, id), `${w.id} vs ${id}: sounds alike`);
          assert.ok(!(w.look && f.look === w.look), `${w.id} vs ${id}: look alike`);
        });
      });
    });
  }
});

test('levels 1-2 prefer known pictures; level 3 mixes in a word still being learned', () => {
  const s = fresh();
  ['apple', 'car', 'hat', 'bed', 'nose'].forEach((id) => P.setKnown(s, id, true, T0));
  ['cookie', 'book', 'socks'].forEach((id) => P.introduce(s, id, T0));
  const dog = D.byId.dog;
  for (let seed = 1; seed < 30; seed++) {
    const easy = P.pickFoils(D.PICTURE_WORDS, dog, 1, s, { level: 1, rng: seeded(seed), soundAlike: D.soundAlike });
    assert.equal(P.stateOf(s, easy[0]), 'mastered');
    const hard = P.pickFoils(D.PICTURE_WORDS, dog, 3, s, { level: 3, rng: seeded(seed), soundAlike: D.soundAlike });
    assert.ok(hard.some((id) => P.stateOf(s, id) === 'learning'), 'no elimination shortcut at 4 pictures');
  }
});

test('all pictures in a round share one style (e.g. only words with photos)', () => {
  const s = fresh();
  const withPhotos = new Set(['mommy', 'ball', 'cup', 'bed']);
  const ids = P.pickFoils(D.PICTURE_WORDS, D.byId.dog, 3, s, { level: 3, rng: seeded(1), hasStyle: (id) => withPhotos.has(id) });
  assert.ok(ids.length > 0);
  ids.forEach((id) => assert.ok(withPhotos.has(id)));
});

test('the target never sits in the same spot twice in a row', () => {
  for (let seed = 1; seed < 200; seed++) {
    const rng = seeded(seed);
    let last = -1;
    for (let i = 0; i < 20; i++) {
      const field = 2 + (i % 3);
      const pos = P.placeTarget(field, last, rng);
      assert.ok(pos >= 0 && pos < field);
      assert.notEqual(pos, last);
      last = pos;
    }
  }
});

test('pictures: similar ones while learning, a new one for each review check', () => {
  const ex = D.photos(D.byId.ball);
  const st = P.newStat();
  for (let seed = 1; seed < 30; seed++) {
    assert.equal(P.chooseExemplar(st, ex, 'learning', seeded(seed)).tier, 'narrow');
  }
  st.exSeen = ['ball@1', 'ball@2', 'ball@3'];
  const r = P.chooseExemplar(st, ex, 'review', seeded(3));
  assert.equal(r.key, 'ball@4', 'unseen, different-looking picture first');
  st.exSeen = ex.map((e) => e.key);
  st.lastEx = 'ball@4';
  for (let seed = 1; seed < 30; seed++) {
    assert.notEqual(P.chooseExemplar(st, ex, 'review', seeded(seed)).key, 'ball@4');
  }
});

test('days practiced counts the last 7 days (no streaks)', () => {
  const s = fresh();
  P.finishSession(s, 1, 60, day(-3));
  P.finishSession(s, 2, 60, day(-1));
  P.finishSession(s, 3, 60, T0);
  assert.equal(P.daysPracticed(s, T0, 7), 3);
  assert.equal(P.daysPracticed(s, day(10), 7), 0);
  assert.equal(s.sessionCount, 3);
});

test('report has a row per word with hint vs no-hint numbers, and quotes commas', () => {
  const s = fresh();
  P.introduce(s, 'ball', T0);
  session(s, 'ball', ['correct', 'prompted', 'error', 'correct'], T0);
  const extra = (w) => ({ label: w.id === 'mommy' ? 'Mama, Mom' : w.word, exemplars: 5, notes: w.id === 'ball' ? 'Said "ba"' : '' });
  const csv = P.reportCSV(s, D.PICTURE_WORDS, D.catById, extra);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, D.PICTURE_WORDS.length + 1);
  assert.ok(lines[0].startsWith('Word,Category,Stage,Pictures shown,Trials,Correct (no hint)'));
  assert.ok(lines[1].startsWith('"Mama, Mom",People,new'));
  const ball = lines.find((l) => l.startsWith('ball,'));
  assert.ok(ball.startsWith('ball,Toys,learning (2 pictures),2,4,2,50%,1,1,0,5,1,2026-01-05,'), ball);
  assert.ok(ball.endsWith(',"Said ""ba"""'));
});

test('saves from earlier versions carry over', () => {
  const v2 = P.normalizeState({
    settings: { rate: 1, mic: true, activeSize: 5 },
    focus: ['ball'],
    words: {
      dog: { findOk: 5, findTries: 6, recent: [1, 1, 1, 1], winDays: ['2026-01-01', '2026-01-02', '2026-01-03'] },
      cat: { findOk: 1, findTries: 3, recent: [0, 1, 0] },
      milk: { known: true }
    },
    days: { '2026-01-02': { rounds: 8, correct: 6, sessions: 1, seconds: 200 } }
  }, T0);
  assert.ok(!('rate' in v2.settings) && !('mic' in v2.settings) && !('activeSize' in v2.settings), 'retired settings are dropped');
  assert.equal(v2.words.dog.state, 'review');
  assert.equal(v2.words.cat.state, 'learning');
  assert.equal(v2.words.milk.state, 'mastered');
  assert.equal(v2.words.ball.state, 'learning', 'old "learning now" list carries over');
  assert.equal(v2.days['2026-01-02'].trials, 8);
  assert.equal(v2.sessionCount, 1);
});

test('broken saved data is repaired instead of crashing', () => {
  const s = P.normalizeState({ words: { ball: { state: 'learning', level: 9, hist: 'x', trials: '3' } }, paused: 'x' }, T0);
  assert.equal(s.words.ball.level, 3);
  assert.deepEqual(s.words.ball.hist, []);
  assert.equal(s.words.ball.trials, 3);
  assert.deepEqual(s.paused, []);
  assert.deepEqual(P.normalizeState(null, T0).words, {});
  assert.deepEqual(P.normalizeState('garbage', T0).paused, []);
});

test('stickers: new ones first, then repeats', () => {
  const s = fresh();
  const got = new Set();
  for (let i = 0; i < D.STICKERS.length; i++) got.add(P.awardSticker(s, D.STICKERS, seeded(i + 1)).id);
  assert.equal(got.size, D.STICKERS.length);
});

test('date math works across month ends and daylight saving changes', () => {
  assert.equal(P.dayDiff('2026-01-31', '2026-02-01'), 1);
  assert.equal(P.dayDiff('2026-03-07', '2026-03-09'), 2);
  assert.equal(P.addDays('2026-03-07', 2), '2026-03-09');
  assert.equal(P.addDays('2026-10-31', 2), '2026-11-02');
  assert.equal(P.addDays('2026-12-31', 1), '2027-01-01');
});
