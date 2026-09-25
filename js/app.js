/*
 * Word Wizard: screens and games, made for Anthony.
 *
 * A listening game (receptive language) designed from the research brief
 * "Designing a receptive hear-the-word, tap-the-picture game for a 2-year-old
 * with speech delay". Anthony hears "Where's the ball?" and taps the ball.
 *
 * Key rules from the research, and where they live:
 *   - Played together: a co-play card before every session, a carryover
 *     card after it, and a "Real things" mode (coplay, reward, real screens).
 *   - The tap must mean attention to the named picture: taps are ignored
 *     until the word has been said, and only the right picture gets praise.
 *   - Trial script: 0.5 s quiet look, "Where's the ball?", wait, "Find the
 *     ball!", wait, then a glowing hint ("Here's the ball!") logged as
 *     prompted. Wrong tap: "Hmm, let's look. This is the ball." and a do-over
 *     with the pictures moved. Correct: "Yes! That's the ball!"
 *   - Calm screen during trials: no confetti per trial, no moving mascot or
 *     clouds, a small celebration every 5 trials and a sticker at the end.
 *   - Real photos, several per word, with a grown-up's own photos first.
 *   - Every spoken line is a recorded ElevenLabs clip (audio/, tools/voice/).
 * The learning schedule itself (levels, review, mastery) is in progress.js.
 */
(function () {
  'use strict';

  var D = window.WB_DATA;
  var P = window.WB_PROGRESS;
  var S = window.WB_STORE;
  var A = window.WB_AUDIO;
  var Speech = A.Speech;
  var Sfx = A.Sfx;
  var PICTURE_WORDS = D.PICTURE_WORDS;

  var state = S.loadState();
  var app = document.getElementById('app');
  var audioReady = false;

  var LOOK_MS = 500;        // quiet look before the prompt
  var WAIT_MS = 6000;       // wait for a tap (research: 5-7 s)
  var TAP_GAP_MS = 400;     // ignore rapid repeat taps
  var MAX_PHOTOS = 4;
  var CHILD = 'Anthony';

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    el.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function save() { S.saveState(state); }

  var timers = [];
  function later(fn, ms) {
    var t = setTimeout(fn, ms);
    timers.push(t);
    return t;
  }
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2400);
  }

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function isStandalone() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  /* ------------------------------------------------------------------ */
  /* Words, photos and pictures                                          */
  /* ------------------------------------------------------------------ */

  function customOf(id) { return state.custom[id] || {}; }
  function editCustom(id) {
    if (!state.custom[id]) state.custom[id] = {};
    return state.custom[id];
  }
  function label(w) { return w.word; }
  function fill(t, w) { return t.replace(/\{w\}/g, label(w)).replace(/\{W\}/g, cap(label(w))); }
  function theWord(w) { return w.kind === 'noun' || w.kind === 'plural' ? 'the ' : ''; }

  function photoKeys(w) {
    var c = customOf(w.id);
    var keys = [];
    if (c.photo) keys.push('photo:' + w.id); // single photo from version 1-2
    (c.photos || []).forEach(function (n) { keys.push('photo:' + w.id + ':' + n); });
    return keys;
  }
  function hasPhoto(w) { return photoKeys(w).length > 0; }
  // "me" (Anthony) can only be played once there's a photo of him.
  function available(id) {
    var w = D.byId[id];
    if (!w || w.everyday) return false;
    return !w.personal || hasPhoto(w);
  }
  function photoWordCount() {
    return PICTURE_WORDS.filter(function (w) { return hasPhoto(w); }).length;
  }

  // Every picture of a word the game can test: grown-up photos first, then the
  // built-in photos. For people, a grown-up's photos replace the stock ones
  // (Anthony's Mommy, not a stranger).
  function exemplarsFor(w) {
    var own = photoKeys(w).map(function (k) { return { key: k, photo: k, style: 'photo', tier: 'narrow' }; });
    if (own.length && w.look === 'person') return own;
    return own.concat(D.photos(w));
  }

  function displayExemplar(w) {
    if (w.everyday) return { key: w.id, src: D.everydayPhoto(w), style: 'photo' };
    return exemplarsFor(w)[0] || { key: w.id, src: 'img/ui/me.webp', style: 'art' };
  }

  // A built-in picture, for icons (never a grown-up's photo).
  function iconSrc(w) {
    if (w.everyday) return D.everydayPhoto(w);
    var ex = D.photos(w)[0];
    return ex ? ex.src : 'img/ui/me.webp';
  }

  // The picture of a word when it's a wrong choice: one of its similar pictures.
  function foilExemplar(w) {
    return pick(exemplarsFor(w).filter(function (e) { return e.tier === 'narrow'; }));
  }

  function picture(w, ex) {
    ex = ex || displayExemplar(w);
    var el = h('div', { class: 'pic' + (ex.style === 'photo' ? ' photo' : '') });
    var img = h('img', { alt: label(w), draggable: 'false', decoding: 'async' });
    el.appendChild(img);
    if (ex.photo) {
      S.getMediaURL(ex.photo).then(function (url) { img.src = url || iconSrc(w); });
    } else img.src = ex.src;
    return el;
  }

  function animatePic(el, w) {
    if (!el) return;
    var cls = 'anim-' + (w.anim || 'bounce');
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    var done = function () { el.classList.remove(cls); el.removeEventListener('animationend', done); };
    el.addEventListener('animationend', done);
  }

  /* ------------------------------------------------------------------ */
  /* Voice: recorded ElevenLabs clips (audio/<name>.mp3)                 */
  /* ------------------------------------------------------------------ */

  // Clip names match tools/voice/lines.js: audio/ball-where.mp3 is "Where's the ball?"
  var WORD_CLIPS = ['word', 'where', 'find', 'here', 'touch', 'thats', 'this', 'phrase'];
  function shared(key) { return 'common-' + key; }
  function wordClip(w) { return w.everyday ? shared(w.id + '-word') : w.id + '-word'; }
  function phraseClip(w) { return w.everyday ? shared(w.id + '-phrase') : w.id + '-phrase'; }

  // Short, varied praise, now and then with Anthony's name.
  var PRAISE = ['yes', 'found', 'yay'];
  var PRAISE_NAME = ['yes-name', 'great-name', 'found-name', 'way-name'];
  var CELEBRATE = ['listener-name', 'high-five-name', 'magic-name'];
  var GREET = ['hi-name', 'hello-name', 'wizard-name'];
  function praise() { return shared(Math.random() < 0.35 ? pick(PRAISE_NAME) : pick(PRAISE)); }

  // Everything the wizard says about a word during the game.
  function speech(w) {
    var c = function (key) { return w.id + '-' + key; };
    var l = label(w);
    var t = theWord(w);
    var plural = w.kind === 'plural';
    return {
      text: {
        prompt: (plural ? 'Where are the ' : 'Where\'s ' + t) + l + '?',
        learn: (plural ? 'Here are the ' : 'Here\'s ' + t) + l + '! Touch ' + t + l + '.'
      },
      learn: [c('here'), { pause: 350 }, c('touch')],
      prompt: [c('where')],
      repeat: [c('find')],
      hint: [c('here')],
      correct: [praise(), { pause: 150 }, c('thats')],
      look: [shared('look')],
      thisIs: [c('this')],
      word: [c('word')],
      phrase: [c('phrase')]
    };
  }

  // Fetch a session's clips while the grown-up reads the co-play card.
  function preloadSession() {
    var names = [shared('look'), shared('did-it-name'), shared('present')]
      .concat(PRAISE.map(shared), PRAISE_NAME.map(shared), CELEBRATE.map(shared));
    sessionWordIds().forEach(function (id) {
      WORD_CLIPS.forEach(function (k) { names.push(id + '-' + k); });
    });
    Speech.preload(names);
  }

  /* ------------------------------------------------------------------ */
  /* Icons and mascot                                                    */
  /* ------------------------------------------------------------------ */

  function arrowSvg(dir, color) {
    var d = dir === 'left' ? 'M19 12H7M12 5l-7 7 7 7' : 'M5 12h12M12 5l7 7-7 7';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" stroke="' + color + '" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  var PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="#fff"/></svg>';
  var CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="#26264A" stroke-width="3.4" stroke-linecap="round"/></svg>';
  var GEAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6" fill="none" stroke="#9B5DE5" stroke-width="3.2" stroke-dasharray="3.4 3.355"/><circle cx="12" cy="12" r="6.3" fill="#9B5DE5"/><circle cx="12" cy="12" r="2.6" fill="#fff"/></svg>';
  var RING_SVG = '<svg class="ring" viewBox="0 0 66 66" aria-hidden="true"><circle cx="33" cy="33" r="30"/></svg>';
  var PENCIL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.2-4.2L15.8 5.2a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L8.2 18.8 4 20z" fill="none" stroke="#5C5C80" stroke-width="2" stroke-linejoin="round"/></svg>';
  var SHARE_SVG = '<svg class="share-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" stroke="#2F7BFF" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6v11h12V10h-2" stroke="#2F7BFF" stroke-width="2.2" fill="none" stroke-linejoin="round"/></svg>';

  // Anthony's guide: the Word Wizard. Two pictures that differ only in the
  // mouth (img/ui/wizard.webp, wizard-talk.webp) take turns while he talks.
  // tools/make-icons.js makes the app icon from the first one.
  function mascot(cls) {
    var base = h('img', { src: 'img/ui/wizard.webp', alt: '', draggable: 'false', fetchpriority: 'high', decoding: 'async' });
    var talk = h('img', { class: 'talk', alt: '', draggable: 'false', decoding: 'async' });
    var blink = h('img', { class: 'blink', alt: '', draggable: 'false', decoding: 'async' });
    // The talking and blinking pictures load once the first one is up, so he shows sooner.
    function more() { talk.src = 'img/ui/wizard-talk.webp'; blink.src = 'img/ui/wizard-blink.webp'; }
    if (base.complete && base.naturalWidth) more();
    else { base.addEventListener('load', more); base.addEventListener('error', more); }
    return h('div', { class: 'mascot' + (cls ? ' ' + cls : '') },
      h('div', { class: 'frames' },
        base, talk, blink,
        h('div', { class: 'wand', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'))));
  }

  // The wizard's mouth moves (and he nods along) while talking, except during find-the-picture rounds,
  // where nothing on screen should move while the word is being said.
  Speech.onTalk = function (on) {
    var list = document.querySelectorAll('.mascot:not(.still)');
    for (var i = 0; i < list.length; i++) list[i].classList.toggle('talking', on);
  };

  function cheerMascot() {
    var list = document.querySelectorAll('.mascot');
    Array.prototype.forEach.call(list, function (m) {
      m.classList.remove('happy');
      void m.offsetWidth;
      m.classList.add('happy');
      setTimeout(function () { m.classList.remove('happy'); }, 1100);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Confetti (session end and every few finds only)                     */
  /* ------------------------------------------------------------------ */

  var FX = (function () {
    var canvas = document.getElementById('fx');
    var ctx = canvas.getContext('2d');
    var parts = [];
    var running = false;
    var dpr = 1;
    var COLORS = ['#FF5C8A', '#FF8A00', '#FFC928', '#22C55E', '#2F7BFF', '#9B5DE5', '#00C2E0'];

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    }
    window.addEventListener('resize', resize);
    resize();

    function add(p) {
      if (parts.length < 320) parts.push(p);
    }

    function particle(x, y, vx, vy, g, life) {
      var r = Math.random();
      return {
        x: x, y: y, vx: vx, vy: vy, g: g, life: life, age: 0,
        size: 7 + Math.random() * 8,
        color: pick(COLORS),
        shape: r < 0.4 ? 'rect' : (r < 0.75 ? 'circle' : 'star'),
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.3
      };
    }

    function burst(x, y, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2;
        var sp = 4 + Math.random() * 9;
        add(particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 5, 0.32, 55 + Math.random() * 35));
      }
      start();
    }

    function rain(n) {
      var w = window.innerWidth;
      for (var i = 0; i < n; i++) {
        add(particle(Math.random() * w, -20 - Math.random() * window.innerHeight * 0.6,
          (Math.random() - 0.5) * 2, 2 + Math.random() * 3, 0.06, 150 + Math.random() * 80));
      }
      start();
    }

    function fromEl(el, n) {
      if (!el || !el.getBoundingClientRect) return;
      var r = el.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, n || 40);
    }

    function start() {
      if (running) return;
      running = true;
      requestAnimationFrame(tick);
    }

    function drawStar(s) {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var rad = i % 2 ? s * 0.45 : s;
        var a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
    }

    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var h2 = window.innerHeight + 40;
      parts = parts.filter(function (p) { return p.age < p.life && p.y < h2; });
      parts.forEach(function (p) {
        p.age += 1;
        p.vy += p.g;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        var fade = Math.min(1, (p.life - p.age) / 20);
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.fillStyle = p.color;
        ctx.translate(p.x * dpr, p.y * dpr);
        ctx.rotate(p.rot);
        var s = p.size * dpr;
        if (p.shape === 'rect') ctx.fillRect(-s / 2, -s / 3, s, s * 0.66);
        else if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, 6.283); ctx.fill(); }
        else drawStar(s * 0.7);
        ctx.restore();
      });
      if (parts.length) requestAnimationFrame(tick);
      else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }

    return { burst: burst, rain: rain, fromEl: fromEl };
  })();

  /* ------------------------------------------------------------------ */
  /* Navigation                                                          */
  /* ------------------------------------------------------------------ */

  var cleanups = [];
  function onLeave(fn) { cleanups.push(fn); }

  var SCREENS = {};
  var screenName = '';
  function go(name, arg) {
    clearTimers();
    Speech.stop();
    cleanups.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
    cleanups = [];
    app.innerHTML = '';
    app.className = 'screen-' + name;
    // Keep the background still while a game is on screen.
    document.body.classList.toggle('calm', name === 'session' || name === 'coplay');
    document.body.setAttribute('data-screen', name);
    screenName = name;
    SCREENS[name](arg);
    if (name === 'home') applyUpdate();
  }

  function topbar(left, middle, right) {
    return h('div', { class: 'topbar' }, left, middle, right);
  }
  function homeButton(fn) {
    return h('button', {
      class: 'icon-btn', 'aria-label': 'Home',
      onclick: function () { Sfx.tap(); (fn || function () { go('home'); })(); }
    }, h('img', { src: 'img/ui/house.webp', alt: '' }));
  }
  function spacer() { return h('div', { style: 'width:58px;flex:none' }); }

  function holdToOpen(el, ms, fn) {
    var timer = null;
    var fired = false;
    el.addEventListener('pointerdown', function () {
      fired = false;
      el.classList.add('holding');
      timer = setTimeout(function () {
        fired = true;
        el.classList.remove('holding');
        Sfx.pop();
        fn();
      }, ms);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      el.addEventListener(ev, function () { clearTimeout(timer); el.classList.remove('holding'); });
    });
    el.addEventListener('click', function () { if (!fired) toast('Grown-ups: press and hold the button'); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function installTip() {
    if (!isIOS || isStandalone()) return null;
    return h('div', { class: 'install-tip', html:
      '<b>Put it on your Home Screen:</b> tap ' + SHARE_SVG + ' <b>Share</b> in Safari, then <b>Add to Home Screen</b>. ' +
      'It opens full screen like an app, works offline, and keeps progress safe.' });
  }

  /* ------------------------------------------------------------------ */
  /* Welcome (first run)                                                 */
  /* ------------------------------------------------------------------ */

  // Research: start with 4-6 words the child partly knows, plus 1-2 new ones.
  SCREENS.welcome = function () {
    var chosen = [];
    var grid = h('div', { class: 'pick-grid' });
    PICTURE_WORDS.filter(function (w) { return !w.personal; }).forEach(function (w, i) {
      var tile = h('button', { class: 'pick', style: '--i:' + Math.min(i, 14), 'aria-pressed': 'false', 'aria-label': label(w) }, picture(w), h('span', { text: label(w) }));
      // Small thumbnails, many of them below the fold: let the wizard load first.
      tile.querySelector('img').setAttribute('loading', 'lazy');
      tile.querySelector('img').setAttribute('fetchpriority', 'low');
      tile.addEventListener('click', function () {
        var i = chosen.indexOf(w.id);
        if (i !== -1) chosen.splice(i, 1);
        else if (chosen.length < 4) chosen.push(w.id);
        else { toast('Up to 4 to start. You can change words later.'); return; }
        tile.classList.toggle('on', chosen.indexOf(w.id) !== -1);
        tile.setAttribute('aria-pressed', chosen.indexOf(w.id) !== -1 ? 'true' : 'false');
        Sfx.tap();
      });
      grid.appendChild(tile);
    });
    var start = h('button', { class: 'btn green', style: 'width:100%' }, 'Start');
    start.addEventListener('click', function () {
      A.unlock();
      audioReady = true;
      chosen.forEach(function (id) { P.introduce(state, id, Date.now()); });
      state.settings.welcomed = true;
      S.saveState(state, true);
      S.requestPersist();
      go('home');
    });
    app.appendChild(h('div', { class: 'welcome' },
      mascot('waving'),
      h('div', { class: 'panel' },
        h('h2', { text: 'Welcome to Word Wizard!' }),
        h('p', { text: 'A listening game for ' + CHILD + ': the wizard says a word and ' + CHILD + ' taps the matching picture. It\'s made to be played together, for 5 to 10 minutes at a time, alongside everyday talk, play and reading.' }),
        h('h3', { text: 'Which words does ' + CHILD + ' partly understand?' }),
        h('p', { class: 'p-muted', text: 'Pick up to 4. We\'ll start with these and add 1 or 2 new words at a time. Not sure? Just tap Start.' }),
        grid,
        start,
        installTip()
      )
    ));
  };

  /* ------------------------------------------------------------------ */
  /* Home                                                                */
  /* ------------------------------------------------------------------ */

  function stickerTotal() {
    var n = 0;
    Object.keys(state.stickers).forEach(function (k) { n += state.stickers[k]; });
    return n;
  }

  function greeting() { return shared(pick(GREET)); }

  function modeBtn(icon, text, color, fn) {
    return h('button', {
      class: 'mode-btn', style: '--mc:' + color, 'aria-label': text,
      onclick: function () { Sfx.tap(); fn(); }
    }, h('img', { src: 'img/ui/' + icon + '.webp', alt: '' }), h('span', { text: text }));
  }

  SCREENS.home = function () {
    var gear = h('button', { class: 'icon-btn hold-btn', 'aria-label': 'Grown-ups: press and hold', html: GEAR_SVG + RING_SVG });
    holdToOpen(gear, 1600, function () { go('parent'); });

    var count = h('button', { class: 'sticker-count', 'aria-label': 'My stickers', onclick: function () { Sfx.tap(); go('stickers'); } },
      h('img', { src: 'img/ui/star.webp', alt: '' }), String(stickerTotal()));

    var logo = h('h1', { class: 'logo', 'aria-label': 'Word Wizard' });
    var colors = ['#FFC928', '#B07CFF', '#FFD84A', '#9B5DE5']; // wizard gold and purple
    'Word Wizard'.split('').forEach(function (ch, i) {
      if (ch === ' ') { logo.appendChild(h('span', { class: 'gap' })); return; }
      logo.appendChild(h('span', { text: ch, style: 'color:' + colors[i % colors.length] + ';animation-delay:' + (i * 0.12) + 's', 'aria-hidden': 'true' }));
    });

    var wizard = h('button', { class: 'home-mascot', 'aria-label': 'Say hi' }, mascot('waving'));
    wizard.addEventListener('click', function () {
      Sfx.boing();
      cheerMascot();
      Speech.say([greeting()]);
    });

    var play = h('button', { class: 'play-btn', 'aria-label': 'Play', html: PLAY_SVG });
    play.addEventListener('click', function () { Sfx.pop(); startSession(); });

    var modes = h('nav', { class: 'modes' },
      modeBtn('picture', 'Words', '#2F7BFF', function () { go('words'); }),
      modeBtn('search', 'Real things', '#FF8A00', function () { go('real'); }),
      modeBtn('chest', 'Stickers', '#FF5C8A', function () { go('stickers'); })
    );
    Array.prototype.forEach.call(modes.children, function (b, i) { b.style.setProperty('--i', i); });

    app.appendChild(h('div', { class: 'home' },
      topbar(count, null, h('div', {}, gear, h('div', { class: 'hold-label', text: 'Grown-ups' }))),
      logo, wizard, play, modes));

    if (audioReady) later(function () { Speech.say([greeting()]); }, 450);
  };

  /* ------------------------------------------------------------------ */
  /* Play session                                                        */
  /* ------------------------------------------------------------------ */

  var session = null;

  function startSession() {
    var planned = P.planSession(state, D.START_ORDER, { trials: state.settings.sessionTrials, available: available }, Date.now());
    save();
    if (!planned.plan.length) { toast('No words to play yet. Add some in Grown-ups > Words.'); return; }
    session = {
      id: Date.now(), plan: planned.plan, newWords: planned.newWords, idx: 0, started: 0,
      words: [], token: 0, el: {}, lastPos: -1, done: 0, lastOk: true, bonus: false
    };
    go('coplay');
  }

  function sessionWordIds() {
    var ids = [];
    session.plan.forEach(function (r) { if (ids.indexOf(r.id) === -1) ids.push(r.id); });
    return ids;
  }

  /* Before each session: a short card for the grown-up (research: co-use helps). */
  SCREENS.coplay = function () {
    if (!session) { go('home'); return; }
    var chips = h('div', { class: 'focus-chips' });
    sessionWordIds().forEach(function (id) {
      var w = D.byId[id];
      chips.appendChild(h('div', { class: 'focus-chip' }, h('div', { class: 'chip-pic' }, picture(w)), label(w),
        session.newWords.indexOf(id) !== -1 ? h('span', { class: 'badge-new', text: 'new' }) : null));
    });
    var tips = [];
    if (!sessionWordIds().some(function (id) { return hasPhoto(D.byId[id]); })) {
      tips.push('Add photos of ' + CHILD + '\'s own things and people (his ball, his cup, Mommy). Photos of his own world help words carry over to real life.');
    }
    preloadSession();
    var ready = h('button', { class: 'btn green', style: 'flex:1' }, 'We\'re ready!');
    ready.addEventListener('click', function () {
      A.unlock();
      audioReady = true;
      session.started = Date.now();
      go('session');
    });
    app.appendChild(h('div', { class: 'welcome' },
      h('div', { class: 'panel coplay' },
        h('h2', { text: 'Play together' }),
        h('ol', {},
          h('li', { html: '<b>Sit beside ' + CHILD + '</b>, with the phone between you.' }),
          h('li', { html: 'After the wizard asks, <b>say it too</b>: "Where\'s the ball?" Then <b>wait</b>.' }),
          h('li', { html: '<b>Let ' + CHILD + ' tap.</b> Try not to point; if he needs help, the game shows the answer.' }),
          h('li', { html: '<b>Cheer when they find it</b> and say the word again: "Ball!"' })),
        h('h3', { text: 'Today\'s words' }),
        chips,
        tips.length ? h('div', { class: 'install-tip' }, h('b', { text: 'Tip: ' }), tips[0], ' ', h('button', {
          class: 'link-btn', onclick: function () { session = null; go('parent', 'words'); }
        }, 'Grown-ups > Words')) : null,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn white', onclick: function () { session = null; go('home'); } }, 'Not now'),
          ready))));
  };

  SCREENS.session = function () {
    if (!session) { go('home'); return; }
    var trail = h('div', { class: 'trail', 'aria-hidden': 'true' });
    session.plan.forEach(function () { trail.appendChild(h('i')); });
    var repeat = h('button', { class: 'icon-btn', 'aria-label': 'Hear it again' }, h('img', { src: 'img/ui/speaker.webp', alt: '' }));
    repeat.addEventListener('click', function () { if (session && session.repeat) session.repeat(); });
    var body = h('div', { class: 'session' }, topbar(homeButton(leaveSession), trail, repeat));
    session.el = { body: body, trail: trail };
    app.appendChild(body);
    showRound();
  };

  function leaveSession() {
    if (session && session.started && session.done) {
      P.finishSession(state, session.id, (Date.now() - session.started) / 1000, Date.now());
    }
    save();
    session = null;
    go('home');
  }

  function updateTrail() {
    var dots = session.el.trail.children;
    for (var i = 0; i < dots.length; i++) {
      dots[i].className = i < session.idx ? 'done' : (i === session.idx ? 'now' : '');
    }
  }

  function showRound() {
    clearTimers();
    Speech.stop();
    session.token += 1;
    session.repeat = null;
    var old = session.el.body.querySelectorAll('.stage');
    Array.prototype.forEach.call(old, function (n) { n.remove(); });
    var r = session.plan[session.idx];
    var w = D.byId[r.id];
    if (session.words.indexOf(w.id) === -1) session.words.push(w.id);
    updateTrail();
    (r.type === 'learn' ? learnTrial : findTrial)(w, roundContext(), r);
  }

  function roundContext() {
    var token = session.token;
    var moved = false;
    return {
      alive: function () { return !!session && session.token === token; },
      // ok: did the round end with the child finding the picture?
      done: function (ok, delay) {
        if (moved || !session || session.token !== token) return;
        moved = true;
        session.done += 1;
        session.lastOk = ok;
        var extra = 0;
        // A small celebration every 5 pictures (research: about every 4-5 trials).
        if (ok && session.done % 5 === 0) {
          extra = 2200;
          Sfx.sparkle();
          cheerMascot();
          later(function () { Speech.say([shared(pick(CELEBRATE))]); }, 300);
          var stage = session.el.body.querySelector('.stage');
          if (stage) FX.fromEl(stage.querySelector('.right') || stage, 30);
        }
        later(nextRound, (delay == null ? 900 : delay) + extra);
      }
    };
  }

  function nextRound() {
    if (!session) return;
    session.idx += 1;
    var timeUp = Date.now() - session.started > state.settings.maxMinutes * 60000;
    var over = session.idx >= session.plan.length || timeUp;
    if (over) {
      // End on a success: one easy picture if the last one didn't end in a find.
      if (!session.lastOk && !session.bonus) {
        var easy = easyWord();
        if (easy) {
          session.bonus = true;
          session.plan = session.plan.slice(0, session.idx).concat([{ id: easy, type: 'find', check: 'bonus' }]);
          syncTrail();
          showRound();
          return;
        }
      }
      endSession();
      return;
    }
    showRound();
  }

  function syncTrail() {
    var trail = session.el.trail;
    while (trail.children.length > session.plan.length) trail.removeChild(trail.lastChild);
    while (trail.children.length < session.plan.length) trail.appendChild(h('i'));
  }

  // A word the child reliably finds, for ending on a win.
  function easyWord() {
    var best = null;
    var bestScore = -1;
    PICTURE_WORDS.forEach(function (w) {
      if (!available(w.id)) return;
      var st = P.peek(state, w.id);
      if (!st.trials && st.state !== 'mastered') return;
      var score = st.state === 'mastered' ? 2 : (st.trials ? st.correct / st.trials : 0);
      if (score > bestScore) { bestScore = score; best = w.id; }
    });
    return best;
  }

  function endSession() {
    P.finishSession(state, session.id, (Date.now() - session.started) / 1000, Date.now());
    save();
    go('reward');
  }

  function makeStage(text) {
    var guide = mascot('still');
    var bubble = h('div', { class: 'bubble', text: text || '' });
    var talk = h('div', { class: 'talk-row' }, guide, bubble);
    var main = h('div', { class: 'stage-main' });
    var stage = h('section', { class: 'stage enter' }, talk, main);
    session.el.body.appendChild(stage);
    return { stage: stage, talk: talk, main: main, bubble: bubble, guide: guide };
  }

  // Ignore two-finger or palm touches and rapid repeat taps.
  function tapFilter(area) {
    var down = 0;
    var multi = false;
    var lastTap = 0;
    area.addEventListener('pointerdown', function (e) {
      down += 1;
      if (down > 1 || (e.width || 0) > 80 || (e.height || 0) > 80) multi = true;
    }, true);
    var up = function () {
      down = Math.max(0, down - 1);
      if (!down) setTimeout(function () { multi = false; }, 60);
    };
    area.addEventListener('pointerup', up, true);
    area.addEventListener('pointercancel', up, true);
    return function () {
      var now = Date.now();
      if (multi || now - lastTap < TAP_GAP_MS) return false;
      lastTap = now;
      return true;
    };
  }

  /* Meet the word: one picture, "Here's the ball! Touch the ball." */
  function learnTrial(w, rc) {
    var st = P.peek(state, w.id);
    var ex = P.chooseExemplar(st, exemplarsFor(w), 'intro', Math.random) || displayExemplar(w);
    var L = speech(w);
    var s = makeStage(L.text.learn);
    var cat = D.catById[w.cat];
    var pic = picture(w, ex);
    var card = h('button', { class: 'card big-card', style: '--cc:' + cat.color, 'aria-label': label(w) }, pic);
    var next = h('button', { class: 'next-btn hidden', 'aria-label': 'Next', html: arrowSvg('right', '#fff') });
    var accept = tapFilter(card);
    var ready = false;
    var finished = false;
    s.main.appendChild(card);
    s.stage.appendChild(next);
    P.recordExposure(state, w.id, Date.now());
    save();

    next.addEventListener('click', function () { if (!finished) { finished = true; Sfx.whoosh(); rc.done(false, 0); } });
    card.addEventListener('click', function () {
      if (!ready || finished || !accept()) return;
      finished = true;
      card.classList.remove('tap-me');
      card.classList.add('right');
      animatePic(pic, w);
      Sfx.correct();
      Speech.say(L.correct).then(function () { rc.done(true); });
      later(function () { rc.done(true); }, 6000);
    });

    var begin = function () {
      if (ready || !rc.alive()) return;
      ready = true;
      card.classList.add('tap-me');
      card.parentNode && card.parentNode.setAttribute('data-ready', '1');
      later(function () { if (!finished) Speech.say(L.repeat); }, WAIT_MS);
      later(function () { if (!finished) next.classList.remove('hidden'); }, WAIT_MS * 2);
    };
    session.repeat = function () { return Speech.say(L.learn); };
    later(function () {
      Speech.say(L.learn).then(function (ok) { if (ok) begin(); });
    }, LOOK_MS);
    later(begin, 5000); // in case speech never finishes
  }

  /* Find it: "Where's the ball?" among 2-4 pictures. */
  function findTrial(w, rc, round) {
    var st = P.peek(state, w.id);
    var check = round.check;
    var level = check === 'learning' ? st.level : (check === 'bonus' ? 1 : 3);
    var field = P.fieldSize(level);
    var pool = PICTURE_WORDS.filter(function (x) { return available(x.id); });
    var foils = P.pickFoils(pool, w, field - 1, state, { level: level, soundAlike: D.soundAlike });
    field = foils.length + 1;
    var ex = P.chooseExemplar(st, exemplarsFor(w), check, Math.random) || exemplarsFor(w)[0];

    var L = speech(w);
    var s = makeStage(L.text.prompt);
    var grid = h('div', { class: 'choices n' + field });
    var accept = tapFilter(grid);
    var buttons = {};
    var targetBtn = null;
    var locked = true;
    var mode = 'first';        // 'first' | 'hint' | 'correction' | 'over'
    var responded = false;     // first response logged?
    var waitToken = 0;

    function build(pos) {
      var order = P.shuffle(foils, Math.random);
      order.splice(pos, 0, w.id);
      grid.innerHTML = '';
      order.forEach(function (id) {
        if (!buttons[id]) {
          var ww = D.byId[id];
          var btn = h('button', { class: 'card choice', 'aria-label': label(ww) }, picture(ww, id === w.id ? ex : foilExemplar(ww)));
          btn.addEventListener('click', function () { tap(id, btn); });
          buttons[id] = btn;
          if (id === w.id) targetBtn = btn;
        }
        buttons[id].className = 'card choice';
        buttons[id].style.setProperty('--i', grid.children.length);
        grid.appendChild(buttons[id]);
      });
    }

    var pos = P.placeTarget(field, session.lastPos, Math.random);
    session.lastPos = pos;
    build(pos);
    s.main.appendChild(grid);

    function log(outcome) {
      if (responded || check === 'bonus') return;
      responded = true;
      P.recordTrial(state, w.id, outcome, { session: session.id, exemplar: ex.key }, Date.now());
      save();
    }

    function unlock() {
      if (!rc.alive() || mode === 'over') return;
      locked = false;
      grid.setAttribute('data-ready', '1');
    }

    // Ask, then wait; ask again; then show the answer as a hint.
    function ask(parts) {
      locked = true;
      grid.removeAttribute('data-ready');
      var my = ++waitToken;
      later(function () { if (my === waitToken) unlock(); }, 5000); // in case speech never finishes
      return Speech.say(parts).then(function () {
        if (my !== waitToken || !rc.alive()) return;
        unlock();
        later(function () {
          if (my !== waitToken || mode === 'over') return;
          Speech.say(L.repeat);
          later(function () { if (my === waitToken && mode !== 'over') showHint(); }, WAIT_MS + 1500);
        }, WAIT_MS);
      });
    }

    function showHint() {
      if (mode === 'first') { mode = 'hint'; log('prompted'); }
      waitToken += 1;
      targetBtn.classList.add('hint');
      Speech.say(L.hint);
      var my = waitToken;
      later(function () {
        if (my !== waitToken || mode === 'over') return;
        mode = 'over';
        Speech.say(L.word).then(function () { rc.done(false); });
        later(function () { rc.done(false); }, 4000);
      }, 9000);
    }

    function found(btn) {
      mode = 'over';
      waitToken += 1;
      locked = true;
      btn.classList.remove('hint');
      btn.classList.add('right');
      Object.keys(buttons).forEach(function (id) { if (buttons[id] !== btn) buttons[id].classList.add('fade'); });
      animatePic(btn.querySelector('.pic'), w);
      Sfx.correct();
      Speech.say(L.correct).then(function () { rc.done(true); });
      later(function () { rc.done(true); }, 6000);
    }

    function tap(id, btn) {
      if (locked || mode === 'over' || !accept()) return;
      if (id === w.id) {
        if (mode === 'first') log('correct');
        if (mode === 'correction') P.recordCorrection(state, w.id, true);
        found(btn);
        return;
      }
      // Wrong picture: no sound effect, no animation on it.
      if (mode === 'hint') {
        targetBtn.classList.remove('hint');
        void targetBtn.offsetWidth;
        targetBtn.classList.add('hint');
        Speech.say(L.hint);
        return;
      }
      if (mode === 'correction') {
        // Second miss: show the answer calmly and move on.
        mode = 'over';
        waitToken += 1;
        locked = true;
        btn.classList.add('dim');
        targetBtn.classList.add('hint');
        Speech.say(L.thisIs).then(function () { rc.done(false, 1200); });
        later(function () { rc.done(false); }, 5000);
        return;
      }
      log('error');
      mode = 'look';
      waitToken += 1;
      locked = true;
      btn.classList.add('dim');
      Speech.say(L.look).then(function () {
        if (!rc.alive()) return null;
        targetBtn.classList.add('hint');
        return Speech.say(L.thisIs);
      }).then(function () {
        if (!rc.alive()) return;
        later(correction, 700);
      });
    }

    // Do-over: same word, pictures in new places (research: correction trial).
    function correction() {
      if (!rc.alive()) return;
      mode = 'correction';
      var newPos = P.placeTarget(field, Array.prototype.indexOf.call(grid.children, targetBtn), Math.random);
      build(newPos);
      grid.classList.remove('reshow');
      void grid.offsetWidth;
      grid.classList.add('reshow');
      grid.removeAttribute('data-ready');
      later(function () { ask(L.prompt); }, LOOK_MS); // a quiet look at the moved pictures first
    }

    session.repeat = function () { if (mode !== 'over' && !locked) Speech.say(L.prompt); };
    later(function () { ask(L.prompt); }, LOOK_MS);
  }

  /* ------------------------------------------------------------------ */
  /* Reward, then carryover ideas for the grown-up                       */
  /* ------------------------------------------------------------------ */

  // How to use a word away from the screen.
  function realLife(w) {
    if (w.life) return w.life;
    var l = label(w);
    if (w.personal) return 'Point to ' + CHILD + ' in a mirror and say "' + l + '!"';
    if (w.kind === 'name') return 'When ' + l + ' comes in, point and say "' + cap(l) + '!"';
    if (w.cat === 'body') return 'Touch your ' + l + ' and say "' + l + '!", then touch ' + CHILD + '\'s.';
    var plural = w.kind === 'plural';
    return 'Find the real ' + l + '. Hold ' + (plural ? 'them' : 'it') + ' up, say "' + l + '!", and let ' + CHILD + ' touch ' + (plural ? 'them' : 'it') + '.';
  }

  SCREENS.reward = function () {
    var played = session ? session.words.filter(function (id) { return D.byId[id] && !D.byId[id].everyday; }) : [];
    session = null;
    var title = h('h2', { class: 'big-title', text: 'You did it, ' + CHILD + '!' });
    var guide = mascot('happy');
    var hint = h('p', { class: 'prize-name', text: 'Pick a present!' });
    var gifts = h('div', { class: 'gifts' });
    var after = h('div', { class: 'reward-after' });
    var picked = false;

    for (var i = 0; i < 3; i++) {
      (function () {
        var g = h('button', { class: 'gift', style: '--i:' + i, 'aria-label': 'Present' }, h('img', { src: 'img/ui/gift.webp', alt: '' }));
        g.addEventListener('click', function () { open(g); });
        gifts.appendChild(g);
      })();
    }

    function open(g) {
      if (picked) return;
      picked = true;
      Array.prototype.forEach.call(gifts.children, function (c) { if (c !== g) c.classList.add('gone'); });
      g.classList.add('shaking');
      Sfx.drumroll();
      Speech.stop();
      later(function () {
        var st = P.awardSticker(state, D.STICKERS);
        save();
        var burst = h('div', { class: 'burst', 'aria-hidden': 'true' });
        for (var b = 0; b < 8; b++) burst.appendChild(h('i', { style: '--a:' + (b * 45 + 20) + 'deg' }));
        var prize = h('div', { class: 'prize' }, burst, h('img', { src: 'img/stickers/' + st.id + '.webp', alt: st.name }));
        gifts.replaceWith(prize);
        hint.textContent = cap(st.name) + '!';
        Sfx.tada();
        FX.fromEl(prize, 60);
        cheerMascot();
        Speech.say([shared('got-' + st.id)]);
        after.appendChild(carryover(played));
      }, 1000);
    }

    app.appendChild(h('div', { class: 'reward' }, title, guide, hint, gifts, after));
    Sfx.tada();
    FX.rain(120);
    later(cheerMascot, 200);
    Speech.say([shared('did-it-name'), { pause: 250 }, shared('present')]);
  };

  // Research: help the child use the words off the screen.
  function carryover(ids) {
    var words = ids.map(function (id) { return D.byId[id]; }).slice(0, 5);
    var list = h('ul', { class: 'carry-list' });
    words.forEach(function (w) {
      list.appendChild(h('li', {}, h('div', { class: 'thumb' }, picture(w)), h('div', {}, h('b', { text: label(w) + ': ' }), realLife(w))));
    });
    return h('div', { class: 'panel carry' },
      h('h3', { text: 'For grown-ups: today\'s words' }),
      h('p', { text: 'Find the real things and say each word three times today, at bath, meals and play.' }),
      list,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn purple small', onclick: function () { go('real', ids); } }, 'Real things'),
        h('button', { class: 'btn white small', onclick: function () { go('home'); } }, 'Home'),
        h('button', { class: 'btn pink small', onclick: function () { go('stickers'); } }, 'Stickers')));
  }

  /* ------------------------------------------------------------------ */
  /* Real things: bridge from picture to object                          */
  /* ------------------------------------------------------------------ */

  SCREENS.real = function (ids) {
    var list = (ids && ids.length ? ids : PICTURE_WORDS.filter(function (w) {
      var s = P.stateOf(state, w.id);
      return available(w.id) && (s === 'learning' || s === 'review');
    }).map(function (w) { return w.id; })).map(function (id) { return D.byId[id]; });
    if (!list.length) list = PICTURE_WORDS.filter(function (w) { return available(w.id); }).slice(0, 6);
    var i = 0;
    var counter = h('div', { class: 'screen-title', style: 'font-size:22px' });
    var body = h('div', { class: 'stage' });
    app.appendChild(topbar(homeButton(), counter, spacer()));
    app.appendChild(body);

    function show() {
      var w = list[i];
      var L = speech(w);
      counter.textContent = 'Real things ' + (i + 1) + ' / ' + list.length;
      body.innerHTML = '';
      var pic = picture(w);
      var card = h('button', { class: 'card big-card', style: '--cc:' + D.catById[w.cat].color, 'aria-label': label(w) },
        pic, h('div', { class: 'word-label', text: label(w) }));
      card.addEventListener('click', function () { Sfx.pop(); animatePic(pic, w); Speech.say(L.word); });
      var prev = h('button', { class: 'arrow-btn', 'aria-label': 'Previous', html: arrowSvg('left', '#26264A') });
      var next = h('button', { class: 'arrow-btn', 'aria-label': 'Next', html: arrowSvg('right', '#26264A') });
      prev.addEventListener('click', function () { Sfx.whoosh(); i = (i - 1 + list.length) % list.length; show(); });
      next.addEventListener('click', function () { Sfx.whoosh(); i = (i + 1) % list.length; show(); });
      var note = w.kind === 'name' || w.cat === 'body' ? realLife(w)
        : 'Hold up a real ' + label(w) + ' next to the picture. Say "' + label(w) + '!" and let ' + CHILD + ' touch the real one.';
      body.appendChild(h('div', { class: 'real-note' }, h('b', { text: 'Grown-ups: ' }), note));
      body.appendChild(h('div', { class: 'stage-main' }, h('div', { class: 'viewer-row' }, prev, card, next)));
      P.recordExposure(state, w.id, Date.now());
      save();
      Speech.say(L.word.concat([{ pause: 300 }], L.phrase));
    }
    show();
  };

  /* ------------------------------------------------------------------ */
  /* Words picture book                                                  */
  /* ------------------------------------------------------------------ */

  var wordsCat = 'all';

  SCREENS.words = function () {
    var chips = h('div', { class: 'chips' });
    var grid = h('div', { class: 'grid' });
    var scroller = h('div', { class: 'scroll' }, grid);

    function chip(id, name, color, icon) {
      var c = h('button', { class: 'chip' + (wordsCat === id ? ' on' : ''), style: '--cc:' + color + ';--i:' + chips.children.length },
        icon ? h('img', { src: icon, alt: '' }) : null, name);
      c.addEventListener('click', function () {
        Sfx.tap();
        wordsCat = id;
        Array.prototype.forEach.call(chips.children, function (x) { x.classList.remove('on'); });
        c.classList.add('on');
        renderGrid();
        scroller.scrollTop = 0;
        if (id !== 'all') Speech.say([shared('cat-' + id)]);
      });
      return c;
    }
    chips.appendChild(chip('all', 'All', '#26264A', 'img/ui/star.webp'));
    D.CATEGORIES.forEach(function (c) { chips.appendChild(chip(c.id, c.name, c.color, iconSrc(D.byId[c.icon]))); });

    function renderGrid() {
      grid.innerHTML = '';
      var list = D.WORDS.filter(function (w) { return wordsCat === 'all' || w.cat === wordsCat; });
      list.forEach(function (w, idx) {
        var cat = D.catById[w.cat];
        var tile = h('button', { class: 'tile', style: '--cc:' + cat.color + ';--i:' + Math.min(idx, 14), 'aria-label': label(w) },
          picture(w), h('div', { class: 'name', text: label(w) }));
        tile.addEventListener('click', function () { Sfx.pop(); openViewer(list, idx); });
        grid.appendChild(tile);
      });
    }
    renderGrid();

    app.appendChild(topbar(homeButton(), h('h1', { class: 'screen-title', text: 'Words' }), spacer()));
    app.appendChild(chips);
    app.appendChild(scroller);
  };

  // Full-screen talking picture; arrows (or a swipe) flip through.
  function openViewer(list, index) {
    var i = index;
    var ov = h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Word' });
    var close = h('button', { class: 'icon-btn', 'aria-label': 'Close', html: CLOSE_SVG });
    var counter = h('div', { class: 'screen-title', style: 'font-size:22px' });
    var body = h('div', { class: 'stage' });
    ov.appendChild(topbar(close, counter, spacer()));
    ov.appendChild(body);
    app.appendChild(ov);
    var token = 0;

    close.addEventListener('click', function () { Sfx.tap(); Speech.stop(); ov.remove(); });

    function show(dir) {
      token += 1;
      var my = token;
      var w = list[i];
      counter.textContent = (i + 1) + ' / ' + list.length;
      body.innerHTML = '';
      var phrase = fill(w.phrase, w);
      var pic = picture(w);
      var card = h('button', { class: 'card big-card', style: '--cc:' + D.catById[w.cat].color, 'aria-label': label(w) },
        pic, h('div', { class: 'word-label', text: label(w) }));
      var word = [wordClip(w)];
      card.addEventListener('click', function () { Sfx.pop(); animatePic(pic, w); Speech.say(word); });
      var prev = h('button', { class: 'arrow-btn', 'aria-label': 'Previous', html: arrowSvg('left', '#26264A') });
      var next = h('button', { class: 'arrow-btn', 'aria-label': 'Next', html: arrowSvg('right', '#26264A') });
      prev.addEventListener('click', function () { Sfx.whoosh(); i = (i - 1 + list.length) % list.length; show(-1); });
      next.addEventListener('click', function () { Sfx.whoosh(); i = (i + 1) % list.length; show(1); });
      body.appendChild(h('div', { class: 'talk-row' }, mascot(), h('div', { class: 'bubble', text: phrase })));
      body.appendChild(h('div', { class: 'stage-main' }, h('div', { class: 'viewer-row' }, prev, card, next)));
      if (dir) {
        body.classList.remove('enter');
        void body.offsetWidth;
        body.classList.add('enter');
      }
      if (!w.everyday) { P.recordExposure(state, w.id, Date.now()); save(); }
      setTimeout(function () {
        if (my !== token || !ov.parentNode) return;
        Speech.say(word.concat([{ pause: 350 }, phraseClip(w), { pause: 300 }], word));
      }, 250);
    }

    var sx = null;
    var sy = null;
    body.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
    body.addEventListener('pointerup', function (e) {
      if (sx == null) return;
      var dx = e.clientX - sx;
      var dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        Sfx.whoosh();
        i = dx < 0 ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        show(dx < 0 ? 1 : -1);
      }
    });

    show(0);
  }

  /* ------------------------------------------------------------------ */
  /* Sticker book                                                        */
  /* ------------------------------------------------------------------ */

  SCREENS.stickers = function () {
    var have = D.STICKERS.filter(function (s) { return state.stickers[s.id]; }).length;
    var grid = h('div', { class: 'grid' });
    D.STICKERS.forEach(function (s, i) {
      var n = state.stickers[s.id] || 0;
      var img = h('img', { src: 'img/stickers/' + s.id + '.webp', alt: n ? s.name : 'Mystery sticker', decoding: 'async' });
      var el = h('button', { class: 'sticker' + (n ? '' : ' missing'), style: '--i:' + Math.min(i, 14), 'aria-label': n ? s.name : 'Mystery sticker' },
        img, n > 1 ? h('span', { class: 'count', text: 'x' + n }) : null);
      el.addEventListener('click', function () {
        if (!n) { Speech.say([shared('more-stickers')]); return; }
        Sfx.boing();
        el.classList.remove('anim-wiggle');
        void el.offsetWidth;
        el.classList.add('anim-wiggle');
        Speech.say([shared('name-' + s.id)]);
      });
      grid.appendChild(el);
    });
    app.appendChild(topbar(homeButton(), h('h1', { class: 'screen-title', text: 'My Stickers' }),
      h('div', { class: 'sticker-count' }, have + '/' + D.STICKERS.length)));
    app.appendChild(h('div', { class: 'scroll' }, grid));
    if (have && audioReady) later(function () { Speech.say([shared('stickers-name')]); }, 400);
  };

  /* ------------------------------------------------------------------ */
  /* Grown-ups area                                                      */
  /* ------------------------------------------------------------------ */

  var parentTab = 'progress';
  var wordFilter = 'all';

  SCREENS.parent = function (tab) {
    if (tab) parentTab = tab;
    var body = h('div', { class: 'parent-body' });
    var tabs = h('div', { class: 'tabs', role: 'tablist' });
    [['progress', 'Progress'], ['words', 'Words'], ['settings', 'Settings'], ['help', 'Help']].forEach(function (t) {
      tabs.appendChild(h('button', {
        class: 'tab' + (parentTab === t[0] ? ' on' : ''), role: 'tab',
        onclick: function () { parentTab = t[0]; go('parent'); }
      }, t[1]));
    });
    var done = h('button', { class: 'btn purple small', onclick: function () { go('home'); } }, 'Done');
    app.appendChild(h('div', { class: 'parent' },
      h('div', { class: 'parent-head' }, h('h1', { text: 'Grown-ups' }), done),
      tabs, body));
    ({ progress: progressTab, words: wordsTab, settings: settingsTab, help: helpTab })[parentTab](body);
  };

  function rerenderParent() {
    var body = app.querySelector('.parent-body');
    var y = body ? body.scrollTop : 0;
    go('parent');
    var nb = app.querySelector('.parent-body');
    if (nb) nb.scrollTop = y;
  }

  function pCard(title) {
    var c = h('div', { class: 'p-card' });
    if (title) c.appendChild(h('h2', { text: title }));
    for (var i = 1; i < arguments.length; i++) append(c, arguments[i]);
    return c;
  }

  function shareFile(name, text, type) {
    var blob = new Blob([text], { type: type });
    try {
      var file = new File([blob], name, { type: type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).catch(function () { /* cancelled */ });
        return;
      }
    } catch (e) { /* fall back to download */ }
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  var STAGE_COLORS = { new: '#8A94A6', learning: '#2F7BFF', review: '#FF8A00', mastered: '#22C55E' };
  function stageChip(st) {
    var text = st.known ? 'Already knows' : (st.state === 'learning' ? 'Learning · ' + P.fieldSize(st.level) + ' pictures' : cap(st.state));
    return h('span', { class: 'stage-chip', style: '--sc:' + STAGE_COLORS[st.state], text: text });
  }

  function reportExtra(w) {
    return { label: label(w), exemplars: exemplarsFor(w).length, notes: customOf(w.id).notes || '' };
  }

  function printReport() {
    var rows = P.reportRows(state, PICTURE_WORDS.filter(function (w) { return available(w.id); }), D.catById, reportExtra);
    var table = h('table');
    rows.forEach(function (r, i) {
      var tr = h('tr');
      r.forEach(function (c) { tr.appendChild(h(i ? 'td' : 'th', { text: String(c) })); });
      table.appendChild(tr);
    });
    var sum = P.summary(state, PICTURE_WORDS);
    var div = h('div', { id: 'print-report' },
      h('h1', { text: 'Word Wizard progress report' }),
      h('p', { text: CHILD + ' · ' + new Date().toLocaleDateString() +
        ' · Mastered ' + sum.mastered + ', review ' + sum.review + ', learning ' + sum.learning + ' of ' + sum.total + ' picture words' }),
      h('p', { text: '"Correct (no hint)" counts only the child\'s first tap with no help. Pictures shown = how many pictures the child chooses from (2-4).' }),
      table);
    document.body.appendChild(div);
    var cleanup = function () { if (div.parentNode) div.remove(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    setTimeout(function () { window.print(); }, 50);
  }

  function progressTab(body) {
    var sum = P.summary(state, PICTURE_WORDS);
    var now = Date.now();
    var tip = installTip();
    if (tip) body.appendChild(pCard(null, tip));

    body.appendChild(pCard('Picture words',
      h('div', { class: 'hero-num', html: sum.mastered + ' <small>of ' + sum.total + ' mastered</small>' }),
      h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round(sum.mastered / sum.total * 100) + '%' })),
      h('div', { class: 'stat-tiles' },
        h('div', { class: 'stat-tile', style: '--tc:' + STAGE_COLORS.learning }, h('b', { text: String(sum.learning) }), h('span', { text: 'Learning' })),
        h('div', { class: 'stat-tile', style: '--tc:' + STAGE_COLORS.review }, h('b', { text: String(sum.review) }), h('span', { text: 'Review' })),
        h('div', { class: 'stat-tile', style: '--tc:' + STAGE_COLORS.mastered }, h('b', { text: String(sum.mastered) }), h('span', { text: 'Mastered' }))),
      h('p', { class: 'p-muted', text: 'Mastered = found with no hint among 4 pictures on 2 days, then again 2 and 7 days later with different pictures. See Help for details.' })));

    var chips = h('div', { class: 'focus-chips' });
    PICTURE_WORDS.forEach(function (w) {
      var st = P.peek(state, w.id);
      if (st.state !== 'learning' && st.state !== 'review') return;
      chips.appendChild(h('div', { class: 'focus-chip' }, h('div', { class: 'chip-pic' }, picture(w)), label(w),
        h('span', { class: 'badge-level', text: st.state === 'review' ? 'review' : P.fieldSize(st.level) + ' pics' })));
    });
    body.appendChild(pCard('Learning now', chips.children.length ? chips : h('p', { class: 'p-muted', text: 'Words join when you press Play.' }),
      h('p', { class: 'p-muted', text: 'New words join 1 or 2 at a time, only while ' + state.settings.learningCap + ' or fewer are being learned.' }),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn purple small', onclick: function () { parentTab = 'words'; wordFilter = 'learning'; go('parent'); } }, 'Choose words'))));

    // This week
    var week = h('div', { class: 'week' });
    var max = 1;
    var days = [];
    for (var d = 6; d >= 0; d--) {
      var dt = new Date(now);
      dt.setDate(dt.getDate() - d);
      var log = state.days[P.dayKey(dt.getTime())];
      var n = log ? log.trials : 0;
      max = Math.max(max, n);
      days.push({ label: 'SMTWTFS'.charAt(dt.getDay()), n: n });
    }
    days.forEach(function (dd) {
      week.appendChild(h('div', {},
        h('em', { text: dd.n ? String(dd.n) : '' }),
        h('i', { class: dd.n ? '' : 'zero', style: 'height:' + Math.max(4, Math.round(dd.n / max * 80)) + 'px' }),
        h('span', { text: dd.label })));
    });
    var today = state.days[P.dayKey(now)];
    var todayText = today && today.trials
      ? 'Today: about ' + Math.max(1, Math.round(today.seconds / 60)) + ' min, ' + today.trials + ' pictures, ' +
        Math.round(today.correct / today.trials * 100) + '% found with no hint.'
      : 'Not played yet today.';
    body.appendChild(pCard('This week',
      h('p', { text: 'Played on ' + P.daysPracticed(state, now, 7) + ' of the last 7 days. ' + todayText }),
      week,
      h('p', { class: 'p-muted', text: 'Pictures to find each day. Spreading short sessions across days helps words stick better than one long session.' }),
      h('p', { class: 'p-muted', text: 'Screen time: health guidance for 2-year-olds is no more than 1 hour a day (less is better), used together. Each session stops after ' + state.settings.maxMinutes + ' minutes.' })));

    var cats = pCard('By category');
    D.CATEGORIES.filter(function (c) { return !c.everyday; }).forEach(function (c) {
      var bc = sum.byCat[c.id] || { total: 0, mastered: 0, started: 0 };
      cats.appendChild(h('div', { class: 'cat-row' },
        h('img', { src: iconSrc(D.byId[c.icon]), alt: '' }),
        h('span', { class: 'name', text: c.name }),
        h('div', { class: 'bar cat', style: '--cc:' + c.color }, h('i', { style: 'width:' + Math.round(bc.mastered / bc.total * 100) + '%' })),
        h('span', { class: 'n', text: bc.mastered + '/' + bc.total })));
    });
    body.appendChild(cats);

    body.appendChild(pCard('Report for your speech therapist',
      h('p', { text: 'Every word with trials, % found with no hint vs. with a hint, pictures shown, how many different pictures were used, dates introduced and mastered, and your notes.' }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn blue small', onclick: function () {
          shareFile('word-wizard-report-' + P.dayKey(Date.now()) + '.csv',
            P.reportCSV(state, PICTURE_WORDS.filter(function (w) { return available(w.id); }), D.catById, reportExtra), 'text/csv');
        } }, 'Share spreadsheet'),
        h('button', { class: 'btn white small', onclick: printReport }, 'Print or save PDF'))));
  }

  function wordStatsText(w) {
    var st = P.peek(state, w.id);
    if (w.personal && !hasPhoto(w)) return 'Add a photo of ' + CHILD + ' to use this word';
    var bits = [];
    if (st.trials) bits.push('No hint ' + st.correct + '/' + st.trials + ' (' + Math.round(st.correct / st.trials * 100) + '%)');
    if (st.prompted) bits.push('hint ' + st.prompted);
    var photos = photoKeys(w).length;
    if (photos) bits.push(photos + (photos === 1 ? ' photo' : ' photos'));
    if (P.isPaused(state, w.id)) bits.push('paused');
    return bits.join(' · ') || 'Not started';
  }

  function wordsTab(body) {
    body.appendChild(pCard('Photos of ' + CHILD + '\'s world',
      h('p', { text: 'Every word comes with real photos. Photos of ' + CHILD + '\'s own things and people are even better: they help words carry over to real life.' }),
      h('p', { class: 'p-muted', text: 'Tap the pencil on a word to add up to ' + MAX_PHOTOS + ' photos. For Mommy, Daddy and baby, your photos replace the stock ones. ' +
        'Words with your photos: ' + photoWordCount() + '.' })));

    var filters = [['all', 'All'], ['learning', 'Learning'], ['review', 'Review'], ['mastered', 'Mastered'], ['new', 'Not started']];
    var row = h('div', { class: 'filter-row' });
    filters.forEach(function (f) {
      row.appendChild(h('button', {
        class: 'filter' + (wordFilter === f[0] ? ' on' : ''),
        onclick: function () { wordFilter = f[0]; go('parent'); }
      }, f[1]));
    });
    body.appendChild(row);

    D.CATEGORIES.filter(function (c) { return !c.everyday; }).forEach(function (c) {
      var list = PICTURE_WORDS.filter(function (w) {
        return w.cat === c.id && (wordFilter === 'all' || P.stateOf(state, w.id) === wordFilter);
      });
      if (!list.length) return;
      var card = pCard(c.name);
      list.forEach(function (w) {
        var st = P.peek(state, w.id);
        var action = null;
        if (!available(w.id)) action = null;
        else if (st.state === 'new') {
          action = h('button', { class: 'pill-btn', onclick: function () { P.introduce(state, w.id, Date.now()); save(); rerenderParent(); } }, 'Start');
        } else if (st.state === 'learning' || st.state === 'review') {
          var paused = P.isPaused(state, w.id);
          action = h('button', { class: 'pill-btn' + (paused ? '' : ' on'), onclick: function () {
            if (paused) P.unpause(state, w.id); else P.pause(state, w.id);
            save();
            rerenderParent();
          } }, paused ? 'Resume' : 'Pause');
        }
        card.appendChild(h('div', { class: 'word-row' },
          h('div', { class: 'thumb' }, picture(w)),
          h('div', { class: 'info' },
            h('b', { text: label(w) }), ' ', stageChip(st),
            h('div', { class: 'p-muted', text: wordStatsText(w) })),
          action,
          h('button', { class: 'edit-btn', 'aria-label': 'Customize ' + label(w), html: PENCIL_SVG, onclick: function () { openCustomize(w); } })));
      });
      body.appendChild(card);
    });

    if (wordFilter === 'all') {
      var every = pCard('Everyday words: practice in daily routines',
        h('p', { class: 'p-muted', text: 'Words like "up", "more" and "all done" are hard to show in a picture, so the game doesn\'t test them. They\'re learned best when you say them at the moment they happen.' }));
      D.EVERYDAY_WORDS.forEach(function (w) {
        every.appendChild(h('div', { class: 'word-row' },
          h('div', { class: 'thumb' }, picture(w)),
          h('div', { class: 'info' }, h('b', { text: w.word }),
            h('div', { class: 'p-muted wrap', text: w.life + (w.sign ? ' Baby sign: ' + w.sign : '') }))));
      });
      body.appendChild(every);
    }
  }

  function sheet(titleText, onClose) {
    var back = h('div', { class: 'sheet-back' });
    var box = h('div', { class: 'sheet', role: 'dialog', 'aria-label': titleText });
    back.appendChild(box);
    var close = function () {
      Speech.stop();
      back.remove();
      if (onClose) onClose();
    };
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    app.appendChild(back);
    return { box: box, close: close };
  }

  // Make a square, phone-friendly JPEG from a picked photo.
  function squarePhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = Math.min(img.naturalWidth, img.naturalHeight);
        var size = Math.min(640, s);
        var c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { if (b) resolve(b); else reject(new Error('photo')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('photo')); };
      img.src = url;
    });
  }

  function openCustomize(w) {
    var sh = sheet('Customize ' + label(w), rerenderParent);
    var thumb = h('div', { class: 'thumb' });
    var title = h('h2');
    function refreshTop() {
      thumb.innerHTML = '';
      thumb.appendChild(picture(w));
      title.textContent = label(w);
    }

    var intro = h('p', { class: 'p-muted', text: w.personal
      ? 'This word is ' + CHILD + '. Add a photo of him to include it in the game.'
      : (w.look === 'person' ? 'Your photos replace the stock photos of this word.' : 'Your photos are shown first, then the built-in photos.') });

    // Photos (several per word)
    var photoGrid = h('div', { class: 'photo-grid' });
    var fileInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    var photoStatus = h('p', { class: 'p-muted' });
    function renderPhotos() {
      photoGrid.innerHTML = '';
      photoKeys(w).forEach(function (key) {
        var cell = h('div', { class: 'photo-cell' }, picture(w, { key: key, photo: key, style: 'photo' }));
        cell.appendChild(h('button', { class: 'photo-remove', 'aria-label': 'Remove photo', text: '×', onclick: function () {
          S.deleteMedia(key);
          var c = editCustom(w.id);
          if (key === 'photo:' + w.id) delete c.photo;
          else c.photos = (c.photos || []).filter(function (n) { return 'photo:' + w.id + ':' + n !== key; });
          save();
          refreshTop();
          renderPhotos();
        } }));
        photoGrid.appendChild(cell);
      });
      if (photoKeys(w).length < MAX_PHOTOS) {
        photoGrid.appendChild(h('button', { class: 'photo-add', onclick: function () { fileInput.click(); } }, '+ Add photo'));
      }
      photoStatus.textContent = 'Use 2 or 3 photos of the real thing (' + CHILD + '\'s own ball, his cup, Grandma) on a plain background.';
    }
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      photoStatus.textContent = 'Saving photo...';
      var n = String(Date.now());
      squarePhoto(f).then(function (blob) {
        return S.putMedia('photo:' + w.id + ':' + n, blob);
      }).then(function () {
        var c = editCustom(w.id);
        c.photos = (c.photos || []).concat([n]);
        save();
        refreshTop();
        renderPhotos();
      }).catch(function () { photoStatus.textContent = 'Couldn\'t use that photo. Try another one.'; });
      fileInput.value = '';
    });

    var known = !!P.peek(state, w.id).known;
    var knownSwitch = h('button', { class: 'switch' + (known ? ' on' : ''), role: 'switch', 'aria-checked': known ? 'true' : 'false', 'aria-label': 'Already understands this word' });
    knownSwitch.addEventListener('click', function () {
      known = !known;
      P.setKnown(state, w.id, known, Date.now());
      save();
      knownSwitch.classList.toggle('on', known);
      knownSwitch.setAttribute('aria-checked', known ? 'true' : 'false');
    });

    var notes = h('textarea', { class: 'notes', rows: '3', placeholder: 'e.g. Pointed to the real ball at the park. Said "ba".' });
    notes.value = customOf(w.id).notes || '';
    notes.addEventListener('input', function () { editCustom(w.id).notes = notes.value; save(); });

    sh.box.appendChild(h('div', { class: 'sheet-top' }, thumb, title, h('button', { class: 'btn purple small', onclick: sh.close }, 'Done')));
    sh.box.appendChild(intro);
    sh.box.appendChild(h('h3', { text: 'Photos' }));
    sh.box.appendChild(photoGrid);
    sh.box.appendChild(photoStatus);
    sh.box.appendChild(fileInput);
    if (!w.personal) {
      sh.box.appendChild(h('div', { class: 'setting' },
        h('div', { class: 'label' }, 'Already understands this word', h('small', { text: 'Counts it as mastered so practice goes to new words. It still comes back for quick checks, and returns to learning if it\'s missed twice in a row.' })),
        knownSwitch));
    }
    sh.box.appendChild(h('label', { class: 'field' }, 'Notes for you and your speech therapist', notes));
    sh.box.appendChild(h('div', { class: 'tipbox' },
      h('div', {}, h('b', { text: 'Say it in play: ' }), '"' + fill(w.phrase, w) + '"'),
      h('div', {}, h('b', { text: 'Practice in real life: ' }), realLife(w))));

    refreshTop();
    renderPhotos();
  }

  function segmented(options, value, onPick) {
    var seg = h('div', { class: 'seg' });
    options.forEach(function (o) {
      var b = h('button', { class: o[0] === value ? 'on' : '' }, o[1]);
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(seg.children, function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        onPick(o[0]);
      });
      seg.appendChild(b);
    });
    return seg;
  }

  function toggle(on, onChange) {
    var sw = h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false' });
    sw.addEventListener('click', function () {
      on = !on;
      sw.classList.toggle('on', on);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      onChange(on, sw);
    });
    return sw;
  }

  function setting(labelText, small, control) {
    return h('div', { class: 'setting' }, h('div', { class: 'label' }, labelText, small ? h('small', { text: small }) : null), control);
  }

  function settingsTab(body) {
    var st = state.settings;

    body.appendChild(pCard('Game',
      setting('Words learning at once', 'New words only join while this many or fewer are being learned. 4 to 6 is recommended.',
        segmented([[4, '4'], [5, '5'], [6, '6']], st.learningCap, function (v) { st.learningCap = v; save(); })),
      setting('Pictures per session', 'About 10 to 20 is plenty for a 2-year-old.',
        segmented([[10, '10'], [15, '15'], [20, '20']], st.sessionTrials, function (v) { st.sessionTrials = v; save(); })),
      setting('Stop after', 'A session always ends at this time limit.',
        segmented([[5, '5 min'], [10, '10 min']], st.maxMinutes, function (v) { st.maxMinutes = v; save(); })),
      setting('Sound effects', null, toggle(st.sfx, function (on) { st.sfx = on; Sfx.enabled = on; save(); })),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn blue small', onclick: function () { A.unlock(); Speech.say(['ball-where']); } }, 'Test sound'))
    ));

    var importInput = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    importInput.addEventListener('change', function () {
      var f = importInput.files && importInput.files[0];
      if (!f) return;
      f.text().then(function (txt) {
        var data = JSON.parse(txt);
        if (!data || !data.words || !data.settings) throw new Error('bad');
        if (!window.confirm('Replace the progress on this device with this backup?')) return;
        var keepCustom = state.custom;
        state = P.normalizeState(data, Date.now());
        // Photos live on the device, so keep this device's.
        state.custom = keepCustom;
        S.saveState(state, true);
        applySettings();
        toast('Backup restored');
        go('parent');
      }).catch(function () { toast('That file isn\'t a Word Wizard backup.'); });
      importInput.value = '';
    });
    body.appendChild(pCard('Backup',
      h('p', { text: 'Save a backup file (to Files, email, or AirDrop) and restore it on a new phone.' }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn blue small', onclick: function () {
          shareFile('word-wizard-backup-' + P.dayKey(Date.now()) + '.json', JSON.stringify(state), 'application/json');
        } }, 'Save backup'),
        h('button', { class: 'btn white small', onclick: function () { importInput.click(); } }, 'Restore backup')),
      importInput,
      h('p', { class: 'p-muted', text: 'Your photos stay on this device and are not in the backup.' })));

    body.appendChild(pCard('Start over',
      h('p', { class: 'p-muted', text: 'Erases progress and stickers. Your settings, notes and photos are kept.' }),
      h('div', { class: 'btn-row' }, h('button', {
        class: 'btn red small',
        onclick: function () {
          if (!window.confirm('Erase all progress and stickers? This can\'t be undone.')) return;
          var fresh = P.createState(Date.now());
          fresh.settings = state.settings;
          fresh.custom = state.custom;
          state = fresh;
          S.saveState(state, true);
          toast('Progress reset');
          go('parent');
        }
      }, 'Reset progress'))));
  }

  function helpTab(body) {
    var tip = installTip();
    body.appendChild(pCard('Use it like an app on iPhone',
      h('ol', {},
        h('li', { html: 'Open this page in <b>Safari</b>.' }),
        h('li', { html: 'Tap the ' + SHARE_SVG + ' <b>Share</b> button.' }),
        h('li', { html: 'Choose <b>Add to Home Screen</b>, then <b>Add</b>.' }),
        h('li', { html: 'Open <b>Word Wizard</b> from your Home Screen. It runs full screen and works offline.' })),
      tip ? null : h('p', { class: 'p-muted', text: isStandalone() ? 'You\'re using the Home Screen app. You\'re all set!' : '' })));

    body.appendChild(pCard('How to play together',
      h('p', { text: 'Toddlers learn much less from screens alone than from people. Playing together is what makes this game work.' }),
      h('ol', {},
        h('li', { html: '<b>Sit beside ' + CHILD + '</b> for every session.' }),
        h('li', { html: '<b>Say the word after the wizard does</b>, then <b>wait</b>. Give ' + CHILD + ' time to look and choose.' }),
        h('li', { html: '<b>Don\'t point to the answer.</b> Only a tap with no help counts as progress. If ' + CHILD + ' needs help, the game shows the right picture.' }),
        h('li', { html: '<b>Cheer, then say the word again:</b> "Yes, the ball! Ball!"' }),
        h('li', { html: '<b>Keep it short:</b> 5 to 10 minutes, once or twice a day, most days. Stop while ' + CHILD + ' still wants more.' }),
        h('li', { html: '<b>Bring the words off the screen.</b> After each session you\'ll get ideas for today\'s words. Use <b>Real things</b> to hold up the real ball next to the picture.' }),
        h('li', { html: '<b>Add your photos.</b> Photos of ' + CHILD + '\'s own things and people help the most (Words tab).' }))));

    body.appendChild(pCard('How Word Wizard teaches',
      h('ul', {},
        h('li', { html: '<b>"Where\'s the ___?" with the word last.</b> A short, familiar sentence helps toddlers pick out the word.' }),
        h('li', { html: '<b>Taps count only after the word is said.</b> The tap should mean "I heard you", so the game ignores taps while it\'s talking.' }),
        h('li', { html: '<b>2, then 3, then 4 pictures.</b> Two pictures is a 50% guess, so a word moves to 3 pictures as soon as it\'s found twice in a row.' }),
        h('li', { html: '<b>No elimination shortcuts.</b> At 4 pictures, other words still being learned are included, so ' + CHILD + ' can\'t win by ruling out pictures he already knows.' }),
        h('li', { html: '<b>Real photos, several of each word</b>, starting with similar ones (and your photos) and moving to different-looking ones later.' }),
        h('li', { html: '<b>One warm, clear voice</b> says every line, always the same way, with ' + CHILD + '\'s name in the cheers.' }),
        h('li', { html: '<b>Gentle mistakes.</b> A wrong tap gets "Hmm, let\'s look" and the right picture, then a do-over with the pictures moved. No buzzers, no lost points, no timers.' }),
        h('li', { html: '<b>Spread over days.</b> Words come back across sessions and days instead of being drilled all at once. Only 1 or 2 new words join at a time.' }))));

    body.appendChild(pCard('What the word stages mean',
      h('div', { class: 'word-row' }, stageChip({ state: 'learning', level: 1 }),
        h('div', { class: 'info p-muted wrap', text: 'Finding the word among 2, then 3, then 4 pictures. It moves up at about 80% found with no hint across 2 sessions, and back down after 2 sessions under 50%.' })),
      h('div', { class: 'word-row' }, stageChip({ state: 'review' }),
        h('div', { class: 'info p-muted wrap', text: 'Found with no hint among 4 pictures at about 80% on 2 different days. Checked again 2 days later, then 7 days later, each time with a different picture.' })),
      h('div', { class: 'word-row' }, stageChip({ state: 'mastered' }),
        h('div', { class: 'info p-muted wrap', text: 'Passed both checks. It still comes back now and then, and goes back to learning if it\'s missed twice in a row.' }))));

    body.appendChild(pCard('Screen time',
      h('p', { text: 'Pediatric and WHO guidance for age 2: keep screen time to 1 hour a day or less (less is better), use it together, and don\'t let it replace talking, reading, play and sleep. A 5 to 10 minute session fits within that. Word Wizard has no ads, no notifications and no streaks, and each session stops on its own.' })));

    body.appendChild(pCard('When to ask for an evaluation',
      h('p', { text: 'Understanding words is one of the best predictors of how language develops. Ask your pediatrician for a speech-language evaluation and a hearing test if your 2-year-old:' }),
      h('ul', {},
        h('li', { text: 'has trouble understanding words or simple directions ("Get your shoes")' }),
        h('li', { text: 'uses few gestures, like pointing, waving or showing' }),
        h('li', { text: 'seems less interested in people, or you have other social-communication concerns' }))));

    body.appendChild(pCard('iPhone tips',
      h('ul', {},
        h('li', { html: '<b>No sound?</b> Check the ring/silent switch and the volume buttons.' }),
        h('li', { html: '<b>Keep little fingers in the game</b> with Guided Access: Settings > Accessibility > Guided Access. Triple-click the side button to start and stop it.' }),
        h('li', { html: '<b>Grown-ups area:</b> press and hold the purple gear on the home screen.' }),
        h('li', { html: '<b>Keep progress safe:</b> use the Home Screen app, and save a backup now and then (Settings tab).' }))));

    body.appendChild(pCard('Please note',
      h('p', { text: 'If you have concerns about ' + CHILD + '\'s speech or language, talk with your pediatrician or a speech-language pathologist, and share the progress report with them.' }),
      h('p', { class: 'p-muted', text: 'Everything stays on this device. No accounts, no ads, no tracking.' })));

    body.appendChild(pCard('Credits',
      h('p', { class: 'p-muted', text: 'Voice and word photos: made with ElevenLabs. Stickers and icons: Microsoft Fluent Emoji (MIT License). Font: Fredoka (SIL Open Font License). Game design follows published research on toddler word learning and receptive language teaching.' })));
  }

  /* ------------------------------------------------------------------ */
  /* Start up                                                            */
  /* ------------------------------------------------------------------ */

  function applySettings() {
    Sfx.enabled = state.settings.sfx;
  }

  function firstTouch() {
    A.unlock();
    audioReady = true;
  }
  document.addEventListener('touchend', firstTouch, true);
  document.addEventListener('click', firstTouch, true);

  // No pinch-zoom or double-tap zoom in the game.
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      Speech.stop();
      S.saveState(state, true);
    }
  });
  window.addEventListener('pagehide', function () { S.saveState(state, true); });

  // Updates: the offline cache keeps serving the old version until a new
  // service worker takes over. When one does, reload on the home screen so
  // the new version shows up right away (never in the middle of a session).
  var updateReady = false;
  function applyUpdate() {
    if (!updateReady || (screenName !== 'home' && screenName !== 'welcome')) return;
    updateReady = false;
    location.reload();
  }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    var hadController = !!navigator.serviceWorker.controller;
    // Once the screen is up, ask the offline cache to fetch the photos, stickers and
    // voice clips in the background (it picks up where it left off on every open).
    function askPrecache() {
      var sw = navigator.serviceWorker.controller;
      if (sw) sw.postMessage({ type: 'precache' });
    }
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        setTimeout(askPrecache, 3000);
        // Look for a new version each time the app comes back to the front.
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) return;
          reg.update().catch(function () { /* offline */ });
          askPrecache();
        });
      }).catch(function () { /* offline support is optional */ });
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; setTimeout(askPrecache, 3000); return; } // first install: nothing to swap
      updateReady = true;
      applyUpdate();
    });
  }

  applySettings();
  if (isStandalone()) S.requestPersist();
  go(state.settings.welcomed ? 'home' : 'welcome');

  // Handy for testing in the browser console.
  window.WB_APP = { go: go, state: function () { return state; }, session: function () { return session; }, startSession: startSession };
})();
