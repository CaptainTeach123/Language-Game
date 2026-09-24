/*
 * Word Wizard: learning engine for "hear the word, tap the picture".
 *
 * Built on the design guidelines in the research brief (receptive picture
 * identification for toddlers with language delay):
 *
 * Each word moves New -> Learning -> Review -> Mastered.
 *   Learning has three levels, which set how many pictures are shown:
 *     level 1: 2 pictures (target + an unrelated, already-known picture when possible)
 *     level 2: 3 pictures
 *     level 3: 4 pictures, including other words still being learned, so the
 *              child can't win just by ruling out pictures they already know
 *   Level 1 -> 2 as soon as the child is right twice in a row (2 pictures is a
 *   50% guess, so we move on quickly). Level 2 -> 3 at 80% correct across the
 *   word's last 2 sessions. A level drops back after 2 sessions below 50%.
 *   Learning -> Review at 80% across 2 level-3 sessions on different days.
 *   Review -> Mastered after it is right again 2 days later, then 7 days
 *   later, each time with a picture the child hasn't been tested on.
 *   A reviewed or mastered word missed twice in a row goes back to Learning.
 * Only UNPROMPTED first taps count as correct. If the child needed a hint,
 * the trial is logged as "prompted", which doesn't count toward progress.
 * Sessions are about 60% learning words, 30% review, 10% mastered, and new
 * words join 1-2 at a time, only while few words are being learned.
 *
 * Plain data in, plain data out, so it is unit tested in Node (tests/).
 */
(function (root) {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;
  var ADVANCE = 0.8;
  var DROP = 0.5;
  var REVIEW_GAPS = [2, 7];        // days until each review check
  var MAINT_GAPS = [14, 30, 60];   // days between checks once mastered
  var HIST_MAX = 12;
  var MAX_LEVEL = 3;

  var DEFAULT_SETTINGS = {
    learningCap: 6,      // most words in Learning at once (new words wait)
    sessionTrials: 10,   // pictures to find per session (10-20 suggested)
    maxMinutes: 10,      // a session always stops after this long
    sfx: true,
    welcomed: false
  };

  function dayKey(ts) {
    var d = new Date(ts);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function dayDiff(fromKey, toKey) {
    var a = fromKey.split('-').map(Number);
    var b = toKey.split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / DAY_MS);
  }

  function addDays(key, n) {
    var a = key.split('-').map(Number);
    return dayKey(new Date(a[0], a[1] - 1, a[2] + n, 12).getTime());
  }

  function fieldSize(level) { return Math.min(MAX_LEVEL, Math.max(1, level)) + 1; }

  function createState(now) {
    return {
      version: 3,
      created: now || Date.now(),
      settings: Object.assign({}, DEFAULT_SETTINGS),
      words: {},
      paused: [],
      custom: {},
      stickers: {},
      days: {},
      sessionCount: 0
    };
  }

  function newStat() {
    return {
      state: 'new',      // new | learning | review | mastered
      level: 1,          // learning level: 1, 2, 3 -> 2, 3, 4 pictures
      introduced: '',
      masteredOn: '',
      seen: 0,           // named with one picture (intro, picture book, real things)
      trials: 0,         // find-the-picture trials (each counted once)
      correct: 0,        // right on the first tap, no hint
      errors: 0,         // wrong first tap
      prompted: 0,       // no tap until the hint
      corrections: 0,    // right on the do-over after a miss (not counted as correct)
      run: 0,            // correct in a row
      missRun: 0,        // missed in a row
      hist: [],          // per session: { s: session id, d: day, l: level, n: trials, ok: correct }
      reviewStep: 0,
      due: '',           // day the next review or maintenance check is due
      exSeen: [],        // pictures this word has been tested with
      lastEx: '',
      last: 0,
      known: false       // a grown-up says the child already understands it
    };
  }

  var STAT_KEYS = Object.keys(newStat());
  var NUM_KEYS = ['level', 'seen', 'trials', 'correct', 'errors', 'prompted', 'corrections', 'run', 'missRun', 'reviewStep', 'last'];

  function recentAcc(recent) {
    if (!recent || !recent.length) return 0;
    return recent.reduce(function (a, b) { return a + (b ? 1 : 0); }, 0) / recent.length;
  }

  // Bring a saved word record up to date (including saves from older versions).
  function normalizeStat(raw, today) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var st = newStat();
    if (typeof raw.state === 'string') {
      STAT_KEYS.forEach(function (k) { if (k in raw) st[k] = raw[k]; });
    } else {
      // Version 1-2 kept star counters instead of stages.
      st.seen = raw.seen | 0;
      st.trials = raw.findTries | 0;
      st.correct = raw.findOk | 0;
      st.errors = Math.max(0, st.trials - st.correct);
      st.last = raw.last || 0;
      st.known = !!raw.known;
      var days = Array.isArray(raw.winDays) ? raw.winDays : (Array.isArray(raw.findDays) ? raw.findDays : []);
      var acc = recentAcc(raw.recent);
      if (st.known) st.state = 'mastered';
      else if (days.length >= 2 && acc >= 0.75) { st.state = 'review'; st.due = today; }
      else if (st.trials > 0 || st.seen > 0) {
        st.state = 'learning';
        st.level = acc >= 0.75 ? 3 : (acc >= 0.5 ? 2 : 1);
      }
      if (st.state !== 'new') st.introduced = st.last ? dayKey(st.last) : today;
    }
    if (['new', 'learning', 'review', 'mastered'].indexOf(st.state) === -1) st.state = 'new';
    NUM_KEYS.forEach(function (k) { st[k] = Number(st[k]) || 0; });
    st.level = Math.min(MAX_LEVEL, Math.max(1, st.level));
    ['hist', 'exSeen'].forEach(function (k) { if (!Array.isArray(st[k])) st[k] = []; });
    ['introduced', 'masteredOn', 'due', 'lastEx'].forEach(function (k) { if (typeof st[k] !== 'string') st[k] = ''; });
    st.known = !!st.known;
    return st;
  }

  function normalizeState(raw, now) {
    now = now || Date.now();
    var today = dayKey(now);
    var s = createState(now);
    if (!raw || typeof raw !== 'object') return s;
    s.created = raw.created || s.created;
    var rs = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (k in rs) s.settings[k] = rs[k]; });
    s.paused = Array.isArray(raw.paused) ? raw.paused.slice() : [];
    s.custom = raw.custom && typeof raw.custom === 'object' ? raw.custom : {};
    s.stickers = raw.stickers && typeof raw.stickers === 'object' ? raw.stickers : {};
    s.sessionCount = raw.sessionCount | 0;
    var days = raw.days && typeof raw.days === 'object' ? raw.days : {};
    Object.keys(days).forEach(function (k) {
      var d = days[k] || {};
      s.days[k] = {
        trials: (d.trials != null ? d.trials : d.rounds) | 0,
        correct: d.correct | 0,
        heard: d.heard | 0,
        sessions: d.sessions | 0,
        seconds: d.seconds | 0
      };
      if (!raw.sessionCount) s.sessionCount += d.sessions | 0;
    });
    var words = raw.words && typeof raw.words === 'object' ? raw.words : {};
    Object.keys(words).forEach(function (id) { s.words[id] = normalizeStat(words[id], today); });
    // Version 2 kept a "learning now" list; carry it over.
    if (Array.isArray(raw.focus)) {
      raw.focus.forEach(function (id) {
        var st = s.words[id] || (s.words[id] = newStat());
        if (st.state === 'new') { st.state = 'learning'; st.introduced = today; }
      });
    }
    return s;
  }

  function stat(state, id) {
    if (!state.words[id]) state.words[id] = newStat();
    return state.words[id];
  }

  function peek(state, id) {
    return state.words[id] || newStat();
  }

  function stateOf(state, id) { return peek(state, id).state; }
  function isPaused(state, id) { return state.paused.indexOf(id) !== -1; }

  function dayLog(state, now) {
    var key = dayKey(now);
    if (!state.days[key]) state.days[key] = { trials: 0, correct: 0, heard: 0, sessions: 0, seconds: 0 };
    return state.days[key];
  }

  function introduce(state, id, now) {
    var st = stat(state, id);
    state.paused = state.paused.filter(function (p) { return p !== id; });
    if (st.state === 'new') {
      st.state = 'learning';
      st.level = 1;
      st.introduced = dayKey(now);
    }
    return st;
  }

  function pause(state, id) {
    if (state.paused.indexOf(id) === -1) state.paused.push(id);
  }

  function unpause(state, id) {
    state.paused = state.paused.filter(function (p) { return p !== id; });
  }

  function setKnown(state, id, known, now) {
    var st = stat(state, id);
    var today = dayKey(now);
    st.known = !!known;
    if (known) {
      st.state = 'mastered';
      st.masteredOn = st.masteredOn || today;
      st.reviewStep = 0;
      st.due = addDays(today, MAINT_GAPS[0]);
      st.missRun = 0;
    } else if (st.state === 'mastered') {
      st.state = st.trials || st.seen ? 'learning' : 'new';
      st.masteredOn = '';
      st.due = '';
      if (st.state === 'learning' && !st.introduced) st.introduced = today;
    }
    return st;
  }

  function demote(st, level) {
    st.state = 'learning';
    st.level = level;
    st.reviewStep = 0;
    st.due = '';
    st.masteredOn = '';
    st.known = false;
    st.run = 0;
    st.missRun = 0;
  }

  function recordExposure(state, id, now) {
    var st = stat(state, id);
    st.seen += 1;
    st.last = now;
    dayLog(state, now).heard += 1;
    return st;
  }

  /*
   * One find-the-picture trial.
   *   outcome: 'correct' (first tap, no hint) | 'error' (wrong first tap) | 'prompted' (needed the hint)
   *   info: { session, exemplar }
   */
  function recordTrial(state, id, outcome, info, now) {
    info = info || {};
    var st = stat(state, id);
    var today = dayKey(now);
    var ok = outcome === 'correct';
    if (st.state === 'new') introduce(state, id, now);

    st.trials += 1;
    if (ok) { st.correct += 1; st.run += 1; st.missRun = 0; }
    else { st.run = 0; st.missRun += 1; }
    if (outcome === 'error') st.errors += 1;
    if (outcome === 'prompted') st.prompted += 1;
    st.last = now;
    if (info.exemplar && st.exSeen.indexOf(info.exemplar) === -1) st.exSeen.push(info.exemplar);

    var log = dayLog(state, now);
    log.trials += 1;
    if (ok) log.correct += 1;

    if (st.state === 'learning') {
      var h = null;
      st.hist.forEach(function (x) { if (x.s === info.session && x.l === st.level) h = x; });
      if (!h) {
        h = { s: info.session || 0, d: today, l: st.level, n: 0, ok: 0 };
        st.hist.push(h);
        if (st.hist.length > HIST_MAX) st.hist.shift();
      }
      h.n += 1;
      if (ok) h.ok += 1;
      // Two pictures is a coin flip, so move on quickly.
      if (st.level === 1 && st.run >= 2) { st.level = 2; st.run = 0; }
    } else if (st.state === 'review') {
      if (ok) {
        st.reviewStep += 1;
        st.lastEx = info.exemplar || '';
        if (st.reviewStep >= REVIEW_GAPS.length) {
          st.state = 'mastered';
          st.masteredOn = today;
          st.reviewStep = 0;
          st.due = addDays(today, MAINT_GAPS[0]);
        } else {
          st.due = addDays(today, REVIEW_GAPS[st.reviewStep]);
        }
      } else if (st.missRun >= 2) {
        demote(st, MAX_LEVEL);
      } else {
        st.due = addDays(today, 1);
      }
    } else if (st.state === 'mastered') {
      if (ok) {
        st.reviewStep = Math.min(st.reviewStep + 1, MAINT_GAPS.length - 1);
        st.due = addDays(today, MAINT_GAPS[st.reviewStep]);
        st.lastEx = info.exemplar || '';
      } else if (st.missRun >= 2) {
        demote(st, 2);
      } else {
        st.due = addDays(today, 1);
      }
    }
    return st;
  }

  // The do-over after a miss. It shows the child the answer, so it never
  // counts as correct; we only keep a tally for grown-ups.
  function recordCorrection(state, id, ok) {
    if (ok) stat(state, id).corrections += 1;
  }

  // After each session: move learning words up or down a level, or on to Review.
  function applyLevelRules(st, now) {
    if (st.state !== 'learning') return;
    var atLevel = st.hist.filter(function (h) { return h.l === st.level && h.n > 0; });
    var last2 = atLevel.slice(-2);
    if (last2.length < 2) return;
    var n = last2[0].n + last2[1].n;
    var ok = last2[0].ok + last2[1].ok;
    if (n >= 3 && ok / n >= ADVANCE) {
      if (st.level < MAX_LEVEL) {
        st.level += 1;
        st.run = 0;
      } else if (last2[0].d !== last2[1].d) {
        st.state = 'review';
        st.reviewStep = 0;
        st.due = addDays(dayKey(now), REVIEW_GAPS[0]);
        st.lastEx = '';
        st.missRun = 0;
      }
    } else if (st.level > 1 && last2.every(function (h) { return h.ok / h.n < DROP; })) {
      st.level -= 1;
      st.run = 0;
    }
  }

  function finishSession(state, sessionId, seconds, now) {
    Object.keys(state.words).forEach(function (id) {
      var st = state.words[id];
      var played = st.hist.some(function (h) { return h.s === sessionId; });
      if (played) applyLevelRules(st, now);
    });
    var log = dayLog(state, now);
    log.sessions += 1;
    log.seconds += Math.max(0, Math.round(seconds || 0));
    state.sessionCount += 1;
  }

  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Same word never twice in a row; each word's own trials keep their order.
  function noBackToBack(list) {
    var rest = list.slice();
    var out = [];
    while (rest.length) {
      var idx = 0;
      if (out.length) {
        var lastId = out[out.length - 1].id;
        while (idx < rest.length && rest[idx].id === lastId) idx++;
        if (idx === rest.length) idx = 0;
      }
      out.push(rest.splice(idx, 1)[0]);
    }
    return out;
  }

  // Spread `extra` items evenly through `base`.
  function spread(base, extra) {
    if (!extra.length) return base.slice();
    var out = [];
    var gap = Math.max(1, Math.floor(base.length / (extra.length + 1)));
    var e = extra.slice();
    base.forEach(function (b, i) {
      out.push(b);
      if (e.length && (i + 1) % gap === 0) out.push(e.shift());
    });
    return out.concat(e);
  }

  /*
   * Plan one session.
   *   order:  picture word ids in introduction order
   *   opts.trials     how many trials (default: settings.sessionTrials)
   *   opts.available  fn(id) -> false for words that can't be played yet ("me" without a photo)
   *   opts.rng
   * Introduces 1-2 new words when there is room (this changes state).
   * Returns { plan: [{ id, type: 'learn'|'find', check: 'intro'|'learning'|'review'|'maint' }], newWords }
   */
  function planSession(state, order, opts, now) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var available = opts.available || function () { return true; };
    var N = Math.max(4, opts.trials || state.settings.sessionTrials || 10);
    var today = dayKey(now);
    var ids = order.filter(function (id) { return available(id) && !isPaused(state, id); });
    var by = function (s) { return ids.filter(function (id) { return stateOf(state, id) === s; }); };

    var learning = by('learning');
    var cap = Math.max(1, state.settings.learningCap | 0);
    var newWords = [];
    if (learning.length < cap) {
      var room = Math.min(2, cap - learning.length);
      by('new').slice(0, room).forEach(function (id) { introduce(state, id, now); newWords.push(id); });
      learning = learning.concat(newWords);
    }

    var reviewDue = by('review').filter(function (id) { var d = peek(state, id).due; return !d || d <= today; });
    reviewDue.sort(function (a, b) { return peek(state, a).due < peek(state, b).due ? -1 : 1; });
    var mastered = by('mastered');
    mastered.sort(function (a, b) { return (peek(state, a).due || '') < (peek(state, b).due || '') ? -1 : 1; });

    var nMaint = mastered.length ? Math.min(mastered.length, Math.max(1, Math.round(N * 0.1))) : 0;
    var nReview = Math.min(reviewDue.length, Math.round(N * 0.3));
    if (!learning.length) nReview = Math.min(reviewDue.length, N - nMaint);
    var nLearn = learning.length ? N - nMaint - nReview : 0;
    if (!learning.length && !reviewDue.length) nMaint = mastered.length ? N : 0;

    // One-picture "meet the word" trials: new words, plus two in the very
    // first session so the child learns what tapping does.
    var intro = newWords.slice();
    var firstEver = state.sessionCount === 0 && ids.every(function (id) { return !peek(state, id).trials; });
    if (firstEver) {
      learning.forEach(function (id) { if (intro.length < 2 && intro.indexOf(id) === -1) intro.push(id); });
    }
    intro = intro.slice(0, Math.max(0, nLearn - 1));

    var learnRounds = intro.map(function (id) { return { id: id, type: 'learn', check: 'intro' }; });
    var findSlots = nLearn - learnRounds.length;
    var findRounds = [];
    while (findRounds.length < findSlots && learning.length) {
      var batch = shuffle(learning, rng);
      for (var i = 0; i < batch.length && findRounds.length < findSlots; i++) {
        findRounds.push({ id: batch[i], type: 'find', check: 'learning' });
      }
    }
    // Intros come before that word's find trials (noBackToBack keeps per-word order).
    var learnPart = learnRounds.concat(findRounds);

    var reviewRounds = reviewDue.slice(0, nReview).map(function (id) { return { id: id, type: 'find', check: 'review' }; });
    var maintRounds = [];
    for (var m = 0; m < nMaint; m++) maintRounds.push({ id: mastered[m % mastered.length], type: 'find', check: 'maint' });

    // Start with an easy win when there is one, spread the checks out.
    var plan = [];
    if (maintRounds.length) plan.push(maintRounds.shift());
    plan = plan.concat(spread(learnPart, reviewRounds.concat(maintRounds)));
    plan = noBackToBack(plan.slice(0, N));
    return { plan: plan, newWords: newWords };
  }

  /*
   * Wrong-answer pictures for a trial.
   *   opts.level      learning level (1-3)
   *   opts.hasStyle   fn(id) -> can this word be drawn in the trial's picture style?
   *   opts.soundAlike fn(a, b)
   * Always unrelated to the target (different category, doesn't sound alike,
   * not a look-alike). Levels 1-2 prefer pictures the child already knows.
   * Level 3 includes at least one word that is still being learned, so the
   * target can't be found just by ruling out the known pictures.
   */
  function pickFoils(words, target, count, state, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var level = opts.level || 1;
    var hasStyle = opts.hasStyle || function () { return true; };
    var alike = opts.soundAlike || function () { return false; };
    var ok = function (w) {
      return w.id !== target.id && w.cat !== target.cat && !(w.look && w.look === target.look) &&
        !alike(w.id, target.id) && hasStyle(w.id);
    };
    var pool = words.filter(ok);
    var st = function (w) { return stateOf(state, w.id); };
    var known = shuffle(pool.filter(function (w) { return st(w) === 'mastered'; }), rng);
    var learningSet = shuffle(pool.filter(function (w) { return st(w) === 'learning' || st(w) === 'review'; }), rng);
    var fresh = shuffle(pool.filter(function (w) { return st(w) === 'new'; }), rng);
    var ordered = level >= 3
      ? learningSet.slice(0, 1).concat(known, fresh, learningSet.slice(1))
      : known.concat(fresh, learningSet);

    var picked = [];
    var fits = function (w, strict) {
      return picked.every(function (p) {
        return p !== w && !(p.look && p.look === w.look) && !alike(p.id, w.id) && (!strict || p.cat !== w.cat);
      });
    };
    [true, false].forEach(function (strict) {
      ordered.forEach(function (w) { if (picked.length < count && fits(w, strict)) picked.push(w); });
    });
    return picked.map(function (w) { return w.id; });
  }

  // Where the target goes: never the same spot as last time.
  function placeTarget(field, lastPos, rng) {
    rng = rng || Math.random;
    var spots = [];
    for (var i = 0; i < field; i++) if (i !== lastPos || field === 1) spots.push(i);
    return spots[Math.floor(rng() * spots.length)];
  }

  /*
   * Which picture of the target to show.
   *   exemplars: [{ key, tier: 'narrow'|'wide', style }]
   * Learning uses the similar ("narrow") pictures, including grown-up photos.
   * Review and mastery checks use a picture the child hasn't been tested
   * with, preferring the different-looking ("wide") ones.
   */
  function chooseExemplar(st, exemplars, check, rng) {
    rng = rng || Math.random;
    if (!exemplars.length) return null;
    var pickFrom = function (list) { return list[Math.floor(rng() * list.length)]; };
    if (check === 'review' || check === 'maint') {
      var unseen = exemplars.filter(function (e) { return st.exSeen.indexOf(e.key) === -1; });
      var wideUnseen = unseen.filter(function (e) { return e.tier === 'wide'; });
      if (wideUnseen.length) return pickFrom(wideUnseen);
      if (unseen.length) return pickFrom(unseen);
      var notLast = exemplars.filter(function (e) { return e.key !== st.lastEx; });
      return pickFrom(notLast.length ? notLast : exemplars);
    }
    var narrow = exemplars.filter(function (e) { return e.tier !== 'wide'; });
    return pickFrom(narrow.length ? narrow : exemplars);
  }

  function awardSticker(state, stickers, rng) {
    rng = rng || Math.random;
    var missing = stickers.filter(function (s) { return !state.stickers[s.id]; });
    var pool = missing.length ? missing : stickers;
    var pick = pool[Math.floor(rng() * pool.length)];
    state.stickers[pick.id] = (state.stickers[pick.id] || 0) + 1;
    return pick;
  }

  function daysPracticed(state, now, span) {
    var n = 0;
    for (var i = 0; i < (span || 7); i++) {
      var log = state.days[dayKey(now - i * DAY_MS)];
      if (log && (log.sessions || log.trials)) n += 1;
    }
    return n;
  }

  function summary(state, words) {
    var out = { total: words.length, new: 0, learning: 0, review: 0, mastered: 0, levels: { 1: 0, 2: 0, 3: 0 }, byCat: {} };
    words.forEach(function (w) {
      var st = peek(state, w.id);
      out[st.state] += 1;
      if (st.state === 'learning') out.levels[st.level] += 1;
      if (!out.byCat[w.cat]) out.byCat[w.cat] = { total: 0, mastered: 0, started: 0 };
      var c = out.byCat[w.cat];
      c.total += 1;
      if (st.state === 'mastered') c.mastered += 1;
      if (st.state !== 'new') c.started += 1;
    });
    return out;
  }

  function stageLabel(st) {
    if (st.known) return 'already understood';
    if (st.state === 'learning') return 'learning (' + fieldSize(st.level) + ' pictures)';
    return st.state;
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function pct(a, b) { return b ? Math.round(a / b * 100) + '%' : ''; }

  // One row per word for a speech-language pathologist.
  function reportRows(state, words, catById, extra) {
    var rows = [['Word', 'Category', 'Stage', 'Pictures shown', 'Trials', 'Correct (no hint)', '% correct (no hint)',
      'Needed a hint', 'Wrong first tap', 'Right on do-over', 'Pictures available', 'Pictures tested',
      'First introduced', 'Mastered on', 'Last practiced', 'Notes']];
    words.forEach(function (w) {
      var st = peek(state, w.id);
      var x = extra ? extra(w) : {};
      rows.push([
        x.label || w.word,
        catById[w.cat] ? catById[w.cat].name : w.cat,
        stageLabel(st),
        st.state === 'learning' ? fieldSize(st.level) : (st.state === 'new' ? '' : 4),
        st.trials, st.correct, pct(st.correct, st.trials), st.prompted, st.errors, st.corrections,
        x.exemplars != null ? x.exemplars : '', st.exSeen.length,
        st.introduced, st.masteredOn, st.last ? dayKey(st.last) : '',
        x.notes || ''
      ]);
    });
    return rows;
  }

  function reportCSV(state, words, catById, extra) {
    return reportRows(state, words, catById, extra).map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }

  var api = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    REVIEW_GAPS: REVIEW_GAPS,
    MAINT_GAPS: MAINT_GAPS,
    dayKey: dayKey,
    dayDiff: dayDiff,
    addDays: addDays,
    fieldSize: fieldSize,
    createState: createState,
    normalizeState: normalizeState,
    newStat: newStat,
    stat: stat,
    peek: peek,
    stateOf: stateOf,
    isPaused: isPaused,
    introduce: introduce,
    pause: pause,
    unpause: unpause,
    setKnown: setKnown,
    recordExposure: recordExposure,
    recordTrial: recordTrial,
    recordCorrection: recordCorrection,
    applyLevelRules: applyLevelRules,
    finishSession: finishSession,
    planSession: planSession,
    pickFoils: pickFoils,
    placeTarget: placeTarget,
    chooseExemplar: chooseExemplar,
    awardSticker: awardSticker,
    daysPracticed: daysPracticed,
    summary: summary,
    stageLabel: stageLabel,
    reportRows: reportRows,
    reportCSV: reportCSV,
    shuffle: shuffle
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WB_PROGRESS = api;
})(this);
