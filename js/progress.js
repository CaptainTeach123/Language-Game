/*
 * Word Buddies: mastery engine.
 *
 * Every word earns three stars:
 *   1. Understands: picks the right picture on the first try when there
 *      are 3 or more choices, on at least 2 different days, and is
 *      getting at least 75% of recent tries right.
 *   2. Tries it:    the child has attempted the word (any sound, sign or
 *      part of the word) or said it.
 *   3. Says it:     a grown-up marked "Said it!" on 3 different days.
 *      The child's own consistent version counts ("ba" for ball).
 * A word is mastered when it has stars 1 and 3. Mastered words leave the
 * "learning now" set and come back for review on a widening schedule
 * (1, 3, 7, 14, 30 days) so they stay fresh.
 *
 * Everything in here is plain data in, plain data out, so it can be unit
 * tested in Node (see tests/).
 */
(function (root) {
  'use strict';

  var RECENT_SIZE = 5;
  var UNDERSTAND_DAYS = 2;
  var SAY_DAYS = 3;
  var REVIEW_DAYS = [1, 3, 7, 14, 30];
  var DAY_MS = 24 * 60 * 60 * 1000;

  var DEFAULT_SETTINGS = {
    childName: '',
    activeSize: 5,       // words learned at the same time
    sessionRounds: 10,   // rounds in one "Play" session
    rate: 0.8,           // speaking speed (1 = normal)
    voiceURI: '',
    sfx: true,
    cloze: true,         // fill-in-the-blank prompts in "Say it"
    mic: false,          // voice balloon (microphone level only, nothing recorded)
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
    var ta = Date.UTC(a[0], a[1] - 1, a[2]);
    var tb = Date.UTC(b[0], b[1] - 1, b[2]);
    return Math.round((tb - ta) / DAY_MS);
  }

  function createState(now) {
    return {
      version: 1,
      created: now || Date.now(),
      settings: Object.assign({}, DEFAULT_SETTINGS),
      words: {},
      focus: [],
      paused: [],
      custom: {},
      stickers: {},
      days: {}
    };
  }

  // Fill in anything missing from an older or partial save.
  function normalizeState(raw, now) {
    var s = createState(now);
    if (!raw || typeof raw !== 'object') return s;
    s.created = raw.created || s.created;
    s.settings = Object.assign({}, DEFAULT_SETTINGS, raw.settings || {});
    s.focus = Array.isArray(raw.focus) ? raw.focus.slice() : [];
    s.paused = Array.isArray(raw.paused) ? raw.paused.slice() : [];
    s.custom = raw.custom && typeof raw.custom === 'object' ? raw.custom : {};
    s.stickers = raw.stickers && typeof raw.stickers === 'object' ? raw.stickers : {};
    s.days = raw.days && typeof raw.days === 'object' ? raw.days : {};
    var words = raw.words && typeof raw.words === 'object' ? raw.words : {};
    Object.keys(words).forEach(function (id) { s.words[id] = normalizeStat(words[id]); });
    return s;
  }

  function newStat() {
    return {
      seen: 0,
      findTries: 0,
      findOk: 0,
      recent: [],
      findDays: [],
      said: 0,
      tried: 0,
      notYet: 0,
      saidDays: [],
      last: 0,
      reviewStep: 0,
      lastReviewDay: '',
      known: false
    };
  }

  function normalizeStat(raw) {
    var st = Object.assign(newStat(), raw || {});
    ['recent', 'findDays', 'saidDays'].forEach(function (k) {
      if (!Array.isArray(st[k])) st[k] = [];
    });
    return st;
  }

  function stat(state, id) {
    if (!state.words[id]) state.words[id] = newStat();
    return state.words[id];
  }

  function peek(state, id) {
    return state.words[id] || newStat();
  }

  function addDay(list, key) {
    if (list.indexOf(key) === -1) list.push(key);
  }

  function dayLog(state, now) {
    var key = dayKey(now);
    if (!state.days[key]) state.days[key] = { rounds: 0, correct: 0, said: 0, tried: 0, sessions: 0, seconds: 0 };
    return state.days[key];
  }

  function recentAcc(st) {
    if (!st.recent.length) return 0;
    var ok = 0;
    st.recent.forEach(function (r) { ok += r ? 1 : 0; });
    return ok / st.recent.length;
  }

  function level(st) {
    st = st || newStat();
    var understands = !!st.known ||
      (st.findDays.length >= UNDERSTAND_DAYS && st.recent.length >= 3 && recentAcc(st) >= 0.75);
    var says = !!st.known || st.saidDays.length >= SAY_DAYS;
    var tries = says || st.tried > 0 || st.said > 0;
    var mastered = understands && says;
    var stage;
    if (mastered) stage = 'mastered';
    else if (understands || tries) stage = 'learning';
    else if (st.seen > 0 || st.findTries > 0) stage = 'started';
    else stage = 'new';
    return {
      understands: understands,
      tries: tries,
      says: says,
      mastered: mastered,
      stars: (understands ? 1 : 0) + (tries ? 1 : 0) + (says ? 1 : 0),
      stage: stage
    };
  }

  function isMastered(state, id) {
    return level(peek(state, id)).mastered;
  }

  // How many pictures to show in "Find it": start easy, get harder as the
  // child gets them right so a lucky guess can't earn the star.
  function choiceCount(st) {
    st = st || newStat();
    if (st.recent.length < 2) return 2;
    var acc = recentAcc(st);
    if (acc >= 0.75) return 4;
    if (acc >= 0.5) return 3;
    return 2;
  }

  function touch(st, now) {
    st.last = now;
  }

  function recordExposure(state, id, now) {
    var st = stat(state, id);
    st.seen += 1;
    touch(st, now);
    return st;
  }

  function afterReview(st, success, now) {
    // Only counts once per day, and only for words that were already mastered.
    var key = dayKey(now);
    if (st.lastReviewDay === key) return;
    st.lastReviewDay = key;
    if (success) st.reviewStep = Math.min(st.reviewStep + 1, REVIEW_DAYS.length - 1);
    else st.reviewStep = Math.max(st.reviewStep - 1, 0);
  }

  // Only the child's FIRST tap on a "Find it" round is recorded.
  function recordFind(state, id, correct, choices, now) {
    var st = stat(state, id);
    var wasMastered = level(st).mastered;
    st.findTries += 1;
    if (correct) st.findOk += 1;
    st.recent.push(correct ? 1 : 0);
    if (st.recent.length > RECENT_SIZE) st.recent.shift();
    if (correct && choices >= 3) addDay(st.findDays, dayKey(now));
    touch(st, now);
    if (wasMastered) afterReview(st, correct, now);
    var log = dayLog(state, now);
    log.rounds += 1;
    if (correct) log.correct += 1;
    return st;
  }

  // result: 'said' | 'tried' | 'notyet'
  function recordSay(state, id, result, now) {
    var st = stat(state, id);
    var wasMastered = level(st).mastered;
    var log = dayLog(state, now);
    log.rounds += 1;
    if (result === 'said') {
      st.said += 1;
      addDay(st.saidDays, dayKey(now));
      log.said += 1;
    } else if (result === 'tried') {
      st.tried += 1;
      log.tried += 1;
    } else {
      st.notYet += 1;
    }
    touch(st, now);
    if (wasMastered && result !== 'tried') afterReview(st, result === 'said', now);
    return st;
  }

  function setKnown(state, id, known) {
    var st = stat(state, id);
    st.known = !!known;
    return st;
  }

  function isDue(st, now) {
    if (!st.last) return true;
    var wait = REVIEW_DAYS[Math.min(st.reviewStep, REVIEW_DAYS.length - 1)];
    return dayDiff(dayKey(st.last), dayKey(now)) >= wait;
  }

  // Keep the "learning now" set topped up: drop mastered words and add the
  // next ones from the introduction order (skipping words a grown-up paused).
  function refreshFocus(state, order) {
    var valid = {};
    order.forEach(function (id) { valid[id] = true; });
    var focus = [];
    state.focus.forEach(function (id) {
      if (valid[id] && focus.indexOf(id) === -1 && !isMastered(state, id)) focus.push(id);
    });
    var size = Math.max(1, state.settings.activeSize | 0);
    for (var i = 0; i < order.length && focus.length < size; i++) {
      var id = order[i];
      if (focus.indexOf(id) !== -1) continue;
      if (state.paused.indexOf(id) !== -1) continue;
      if (isMastered(state, id)) continue;
      focus.push(id);
    }
    state.focus = focus;
    return focus;
  }

  function addFocus(state, id) {
    state.paused = state.paused.filter(function (p) { return p !== id; });
    if (state.focus.indexOf(id) === -1) state.focus.unshift(id);
  }

  function removeFocus(state, id) {
    state.focus = state.focus.filter(function (f) { return f !== id; });
    if (state.paused.indexOf(id) === -1) state.paused.push(id);
  }

  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Which activities a word should get this session, in order.
  function roundSequence(st) {
    var lv = level(st);
    if (lv.mastered) return st.reviewStep % 2 === 0 ? ['find', 'say'] : ['say', 'find'];
    if (st.seen < 2 && st.findTries === 0) return ['learn', 'find', 'say'];
    if (!lv.understands) {
      var lastWrong = st.recent.length && !st.recent[st.recent.length - 1];
      return lastWrong ? ['learn', 'find', 'say'] : ['find', 'say', 'find'];
    }
    return ['say', 'find', 'say'];
  }

  // Reorder so the same word never shows up twice in a row, while keeping
  // each word's own rounds in order (learn before find before say).
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

  /*
   * Build one play session.
   *   opts.mode   'mix' (default) | 'find' | 'say'
   *   opts.rounds number of rounds
   *   opts.rng    random function (for tests)
   * Returns [{ type: 'learn'|'find'|'say', id }]
   */
  function planSession(state, order, opts, now) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var mode = opts.mode || 'mix';
    var rounds = Math.max(1, opts.rounds || state.settings.sessionRounds || 10);
    now = now || Date.now();

    var focus = refreshFocus(state, order).slice();
    var mastered = order.filter(function (id) { return isMastered(state, id); });
    var due = mastered.filter(function (id) { return isDue(peek(state, id), now); });
    due.sort(function (a, b) { return peek(state, a).last - peek(state, b).last; });

    var reviewCount = Math.min(due.length, Math.round(rounds * 0.3));
    var reviews = due.slice(0, reviewCount);
    // One easy win to start with, even if nothing is due yet.
    if (!reviews.length && mastered.length && rounds >= 6) {
      reviews = [mastered[Math.floor(rng() * mastered.length)]];
    }
    if (!focus.length) {
      // Everything is mastered: keep reviewing all of it.
      focus = shuffle(mastered.length ? mastered : order, rng).slice(0, 6);
      reviews = [];
    }

    var focusSlots = rounds - reviews.length;
    var seqs = {};
    focus.forEach(function (id) { seqs[id] = roundSequence(peek(state, id)); });

    // Pass 0 gives every focus word its first activity, pass 1 its second...
    var focusRounds = [];
    var pass = 0;
    while (focusRounds.length < focusSlots) {
      var batch = shuffle(focus, rng);
      for (var i = 0; i < batch.length && focusRounds.length < focusSlots; i++) {
        var id = batch[i];
        var seq = seqs[id];
        focusRounds.push({ id: id, type: seq[pass % seq.length] });
      }
      pass += 1;
    }

    var reviewRounds = reviews.map(function (id) {
      return { id: id, type: roundSequence(peek(state, id))[0] };
    });

    // Start with an easy win, then spread the other reviews out.
    var plan = [];
    if (reviewRounds.length) plan.push(reviewRounds.shift());
    var gap = reviewRounds.length ? Math.max(2, Math.floor(focusRounds.length / (reviewRounds.length + 1))) : 0;
    focusRounds.forEach(function (r, idx) {
      plan.push(r);
      if (gap && reviewRounds.length && (idx + 1) % gap === 0) plan.push(reviewRounds.shift());
    });
    while (reviewRounds.length) plan.push(reviewRounds.shift());
    plan = plan.slice(0, rounds);

    if (mode === 'find' || mode === 'say') {
      plan.forEach(function (r) { r.type = mode; });
    }
    return noBackToBack(plan);
  }

  // Pick look-different wrong answers for "Find it".
  function pickDistractors(words, targetId, count, state, rng) {
    rng = rng || Math.random;
    var target = null;
    words.forEach(function (w) { if (w.id === targetId) target = w; });
    if (!target) return [];
    var imgOf = function (w) { return w.img || w.id; };
    var pool = words.filter(function (w) {
      if (w.id === target.id) return false;
      if (imgOf(w) === imgOf(target)) return false;
      if (w.look && w.look === target.look) return false;
      return true;
    });
    // Prefer pictures the child has already met; new ones are fine too.
    var familiar = shuffle(pool.filter(function (w) { return peek(state, w.id).seen > 0 || peek(state, w.id).findTries > 0; }), rng);
    var fresh = shuffle(pool.filter(function (w) { return familiar.indexOf(w) === -1; }), rng);
    var ordered = familiar.concat(fresh);
    var picked = [];
    for (var i = 0; i < ordered.length && picked.length < count; i++) {
      var w = ordered[i];
      // First pass: every picture from a different category, so early
      // rounds are about the word, not about telling a cat from a dog.
      var clash = w.cat === target.cat || picked.some(function (p) {
        return imgOf(p) === imgOf(w) || (p.look && p.look === w.look) || p.cat === w.cat;
      });
      if (!clash) picked.push(w);
    }
    // Relax the category rule if we still need more.
    for (var k = 0; k < ordered.length && picked.length < count; k++) {
      var c = ordered[k];
      if (picked.indexOf(c) !== -1) continue;
      var clash2 = picked.some(function (p) { return imgOf(p) === imgOf(c) || (p.look && p.look === c.look); });
      if (!clash2) picked.push(c);
    }
    return picked.map(function (w) { return w.id; });
  }

  function awardSticker(state, stickers, rng) {
    rng = rng || Math.random;
    var missing = stickers.filter(function (s) { return !state.stickers[s.id]; });
    var pool = missing.length ? missing : stickers;
    var pick = pool[Math.floor(rng() * pool.length)];
    state.stickers[pick.id] = (state.stickers[pick.id] || 0) + 1;
    return pick;
  }

  function logSession(state, seconds, now) {
    var log = dayLog(state, now);
    log.sessions += 1;
    log.seconds += Math.max(0, Math.round(seconds));
  }

  function streak(state, now) {
    var key = dayKey(now);
    var count = 0;
    var d = new Date(now);
    // Today counts if practiced; otherwise the streak can still be alive from yesterday.
    if (!state.days[key]) d.setDate(d.getDate() - 1);
    while (state.days[dayKey(d.getTime())]) {
      count += 1;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }

  function summary(state, words) {
    var out = { total: words.length, mastered: 0, understands: 0, tries: 0, says: 0, started: 0, byCat: {} };
    words.forEach(function (w) {
      var lv = level(peek(state, w.id));
      if (!out.byCat[w.cat]) out.byCat[w.cat] = { total: 0, mastered: 0, stars: 0 };
      var c = out.byCat[w.cat];
      c.total += 1;
      c.stars += lv.stars;
      if (lv.mastered) { out.mastered += 1; c.mastered += 1; }
      if (lv.understands) out.understands += 1;
      if (lv.tries) out.tries += 1;
      if (lv.says) out.says += 1;
      if (lv.stage !== 'new') out.started += 1;
    });
    return out;
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function reportCSV(state, words, catById, labelOf) {
    var rows = [['Word', 'Category', 'Stage', 'Understands', 'Tries it', 'Says it',
      'Find it first-try correct', 'Find it tries', 'Times said', 'Days said', 'Times tried', 'Last practiced']];
    words.forEach(function (w) {
      var st = peek(state, w.id);
      var lv = level(st);
      rows.push([
        labelOf ? labelOf(w) : w.word,
        catById[w.cat] ? catById[w.cat].name : w.cat,
        st.known ? 'already knew' : lv.stage,
        lv.understands ? 'yes' : 'no',
        lv.tries ? 'yes' : 'no',
        lv.says ? 'yes' : 'no',
        st.findOk, st.findTries, st.said, st.saidDays.length, st.tried,
        st.last ? dayKey(st.last) : ''
      ]);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }

  var api = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    REVIEW_DAYS: REVIEW_DAYS,
    dayKey: dayKey,
    dayDiff: dayDiff,
    createState: createState,
    normalizeState: normalizeState,
    newStat: newStat,
    stat: stat,
    peek: peek,
    level: level,
    isMastered: isMastered,
    recentAcc: recentAcc,
    choiceCount: choiceCount,
    recordExposure: recordExposure,
    recordFind: recordFind,
    recordSay: recordSay,
    setKnown: setKnown,
    isDue: isDue,
    refreshFocus: refreshFocus,
    addFocus: addFocus,
    removeFocus: removeFocus,
    roundSequence: roundSequence,
    planSession: planSession,
    pickDistractors: pickDistractors,
    awardSticker: awardSticker,
    logSession: logSession,
    streak: streak,
    summary: summary,
    reportCSV: reportCSV,
    shuffle: shuffle
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WB_PROGRESS = api;
})(this);
