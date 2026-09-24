/*
 * Word Buddies: mastery engine (receptive language).
 *
 * The child hears a word and picks its picture. Only the FIRST tap in a
 * round counts, so hints never inflate progress. Every word earns stars:
 *   1. Picks from 2:    right on the first try at least twice.
 *   2. Picks from 3-4:  right on the first try at least twice when there
 *                       were 3 or 4 pictures to choose from.
 *   3. Mastered:        right with 3+ pictures on 3 different days, AND
 *                       4 of the last 5 tries right (80%).
 * The number of pictures grows as the child gets a word right, so a lucky
 * guess can't earn mastery. Mastered words leave the "learning now" set
 * and come back for a quick check after 1, 3, 7, 14 and 30 days. If a
 * mastered word starts getting missed, it goes back to "learning now".
 *
 * Everything in here is plain data in, plain data out, so it can be unit
 * tested in Node (see tests/).
 */
(function (root) {
  'use strict';

  var RECENT_SIZE = 5;
  var MASTER_DAYS = 3;
  var MASTER_ACC = 0.8;
  var REVIEW_DAYS = [1, 3, 7, 14, 30];
  var DAY_MS = 24 * 60 * 60 * 1000;

  var DEFAULT_SETTINGS = {
    childName: '',
    activeSize: 5,       // words learned at the same time
    sessionRounds: 10,   // rounds in one "Play" session
    rate: 0.8,           // speaking speed (1 = normal)
    voiceURI: '',
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
    var ta = Date.UTC(a[0], a[1] - 1, a[2]);
    var tb = Date.UTC(b[0], b[1] - 1, b[2]);
    return Math.round((tb - ta) / DAY_MS);
  }

  function createState(now) {
    return {
      version: 2,
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
    var settings = Object.assign({}, DEFAULT_SETTINGS);
    var rs = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (k in rs) settings[k] = rs[k]; });
    s.settings = settings;
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
      seen: 0,          // times heard in Learn rounds or the picture book
      findTries: 0,     // Find it rounds (first taps)
      findOk: 0,        // right on the first try
      recent: [],       // last 5 first taps, 1 = right
      wins2: 0,         // right first try with 2 pictures
      wins3: 0,         // right first try with 3 or 4 pictures
      winDays: [],      // days with a first-try win among 3+ pictures
      last: 0,
      reviewStep: 0,
      lastReviewDay: '',
      known: false      // a grown-up says the child already understands it
    };
  }

  var STAT_KEYS = Object.keys(newStat());

  function normalizeStat(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var st = newStat();
    STAT_KEYS.forEach(function (k) { if (k in raw) st[k] = raw[k]; });
    // Saves from the first version kept "findDays" (same meaning as winDays).
    if (!('winDays' in raw) && Array.isArray(raw.findDays)) {
      st.winDays = raw.findDays.slice();
      st.wins3 = raw.findDays.length;
      st.wins2 = Math.max(0, (raw.findOk | 0) - st.wins3);
    }
    ['recent', 'winDays'].forEach(function (k) { if (!Array.isArray(st[k])) st[k] = []; });
    ['seen', 'findTries', 'findOk', 'wins2', 'wins3', 'last', 'reviewStep'].forEach(function (k) {
      st[k] = Number(st[k]) || 0;
    });
    st.known = !!st.known;
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
    if (!state.days[key]) state.days[key] = { rounds: 0, correct: 0, heard: 0, sessions: 0, seconds: 0 };
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
    var known = !!st.known;
    var mastered = known ||
      (st.winDays.length >= MASTER_DAYS && st.recent.length >= 4 && recentAcc(st) >= MASTER_ACC);
    var fromMany = known || mastered || st.wins3 >= 2;
    var fromTwo = fromMany || st.wins2 + st.wins3 >= 2;
    var stage;
    if (mastered) stage = 'mastered';
    else if (fromTwo) stage = 'learning';
    else if (st.seen > 0 || st.findTries > 0) stage = 'started';
    else stage = 'new';
    return {
      fromTwo: fromTwo,
      fromMany: fromMany,
      mastered: mastered,
      stars: (fromTwo ? 1 : 0) + (fromMany ? 1 : 0) + (mastered ? 1 : 0),
      stage: stage
    };
  }

  function isMastered(state, id) {
    return level(peek(state, id)).mastered;
  }

  // How many pictures to show in "Find it": start with 2, add more as the
  // child gets the word right, drop back to 2 if it gets hard.
  function choiceCount(st) {
    st = st || newStat();
    if (st.recent.length < 2) return 2;
    var acc = recentAcc(st);
    if (acc >= 0.75) return 4;
    if (acc >= 0.5) return 3;
    return 2;
  }

  function recordExposure(state, id, now) {
    var st = stat(state, id);
    st.seen += 1;
    st.last = now;
    dayLog(state, now).heard += 1;
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

  // Only the child's FIRST tap in a "Find it" round is recorded.
  function recordFind(state, id, correct, choices, now) {
    var st = stat(state, id);
    var wasMastered = level(st).mastered;
    st.findTries += 1;
    st.recent.push(correct ? 1 : 0);
    if (st.recent.length > RECENT_SIZE) st.recent.shift();
    if (correct) {
      st.findOk += 1;
      if (choices >= 3) {
        st.wins3 += 1;
        addDay(st.winDays, dayKey(now));
      } else {
        st.wins2 += 1;
      }
    }
    st.last = now;
    if (wasMastered) afterReview(st, correct, now);
    var log = dayLog(state, now);
    log.rounds += 1;
    if (correct) log.correct += 1;
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

  // Which activities a word gets this session, in order. A new word is
  // shown and named first ("learn"), then the child finds it.
  function roundSequence(st) {
    if (level(st).mastered) return ['find'];
    if (st.findTries === 0 && st.seen < 2) return ['learn', 'find', 'find'];
    var lastWrong = st.recent.length && !st.recent[st.recent.length - 1];
    if (lastWrong) return ['learn', 'find', 'find'];
    return ['find', 'find', 'learn'];
  }

  // Reorder so the same word never shows up twice in a row, while keeping
  // each word's own rounds in order (learn before find).
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
   *   opts.mode   'mix' (default: learn + find) | 'find' (find only) | 'pop' (find, bubble style)
   *   opts.rounds number of rounds
   *   opts.rng    random function (for tests)
   * Returns [{ type: 'learn'|'find', id, style: 'cards'|'bubbles' }]
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

    var reviewRounds = reviews.map(function (id) { return { id: id, type: 'find' }; });

    // Start with an easy win, then spread the other reviews out.
    var plan = [];
    if (reviewRounds.length) plan.push(reviewRounds.shift());
    var gap = reviewRounds.length ? Math.max(2, Math.floor(focusRounds.length / (reviewRounds.length + 1))) : 0;
    focusRounds.forEach(function (r, idx) {
      plan.push(r);
      if (gap && reviewRounds.length && (idx + 1) % gap === 0) plan.push(reviewRounds.shift());
    });
    while (reviewRounds.length) plan.push(reviewRounds.shift());
    plan = noBackToBack(plan.slice(0, rounds));

    plan.forEach(function (r) {
      if (mode !== 'mix') r.type = 'find';
      if (r.type === 'find') r.style = mode === 'pop' ? 'bubbles' : (mode === 'mix' && rng() < 0.35 ? 'bubbles' : 'cards');
    });
    return plan;
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
    var out = { total: words.length, mastered: 0, fromTwo: 0, fromMany: 0, started: 0, byCat: {} };
    words.forEach(function (w) {
      var lv = level(peek(state, w.id));
      if (!out.byCat[w.cat]) out.byCat[w.cat] = { total: 0, mastered: 0, stars: 0 };
      var c = out.byCat[w.cat];
      c.total += 1;
      c.stars += lv.stars;
      if (lv.mastered) { out.mastered += 1; c.mastered += 1; }
      if (lv.fromTwo) out.fromTwo += 1;
      if (lv.fromMany) out.fromMany += 1;
      if (lv.stage !== 'new') out.started += 1;
    });
    return out;
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function reportCSV(state, words, catById, labelOf) {
    var rows = [['Word', 'Category', 'Stage', 'Picks from 2', 'Picks from 3-4', 'Mastered',
      'Right first try', 'Find it tries', 'Recent accuracy', 'Days right with 3+ pictures', 'Times heard', 'Last practiced']];
    words.forEach(function (w) {
      var st = peek(state, w.id);
      var lv = level(st);
      rows.push([
        labelOf ? labelOf(w) : w.word,
        catById[w.cat] ? catById[w.cat].name : w.cat,
        st.known ? 'already understood' : lv.stage,
        lv.fromTwo ? 'yes' : 'no',
        lv.fromMany ? 'yes' : 'no',
        lv.mastered ? 'yes' : 'no',
        st.findOk, st.findTries,
        st.recent.length ? Math.round(recentAcc(st) * 100) + '%' : '',
        st.winDays.length, st.seen,
        st.last ? dayKey(st.last) : ''
      ]);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }

  var api = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    REVIEW_DAYS: REVIEW_DAYS,
    MASTER_DAYS: MASTER_DAYS,
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
