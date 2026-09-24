/*
 * Word Buddies: screens and games.
 *
 * A listening game (receptive language): the child hears a word and taps
 * the matching picture. Nothing asks the child to talk.
 *
 * Child screens:  home, play session (learn and find-it rounds, some as
 *                 "pop the bubble"), reward (pick a present), words picture
 *                 book, sticker book.
 * Grown-up area:  progress, word list + customising, settings, help.
 */
(function () {
  'use strict';

  var D = window.WB_DATA;
  var P = window.WB_PROGRESS;
  var S = window.WB_STORE;
  var A = window.WB_AUDIO;
  var Speech = A.Speech;
  var Sfx = A.Sfx;
  var WORDS = D.WORDS;

  var state = S.loadState();
  var app = document.getElementById('app');
  var audioReady = false;

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
  function article(name) { return /^[aeiou]/i.test(name) ? 'an' : 'a'; }
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
  /* Words, labels and speech phrases                                    */
  /* ------------------------------------------------------------------ */

  function customOf(id) { return state.custom[id] || {}; }
  function editCustom(id) {
    if (!state.custom[id]) state.custom[id] = {};
    return state.custom[id];
  }
  function label(w) { return customOf(w.id).label || w.word; }
  function hasRec(w) { return !!customOf(w.id).rec; }
  function hasPhoto(w) { return !!customOf(w.id).photo; }
  function fill(t, w) { return t.replace(/\{w\}/g, label(w)).replace(/\{W\}/g, cap(label(w))); }

  function wordPart(w, rate) {
    return { word: w.id, text: label(w), useRec: hasRec(w), rate: rate || 0.9 };
  }

  // "Where's the " + word + "?" as speech parts, using a grown-up's
  // recording for the word itself when there is one.
  function withWord(prefix, w, suffix, rate) {
    prefix = prefix || '';
    suffix = suffix || '';
    if (hasRec(w)) {
      var out = [];
      if (prefix.trim()) out.push(prefix.trim());
      out.push(wordPart(w, rate));
      if (/[a-z]/i.test(suffix)) out.push(suffix.trim());
      return out;
    }
    return [{ text: prefix + label(w) + suffix, rate: rate || 1 }];
  }

  // "the " before nouns, nothing before names and action words.
  function theWord(w) { return w.kind === 'noun' || w.kind === 'plural' ? 'the ' : ''; }

  // In Pop rounds, objects get "Pop the dog!"; names and action words keep
  // "Where's Mommy?" / "Find more!" so the sentence still makes sense.
  function popsWell(w, bubbles) { return bubbles && (w.kind === 'noun' || w.kind === 'plural'); }

  function findLead(w, bubbles) {
    if (popsWell(w, bubbles)) return 'Pop the ';
    if (w.kind === 'plural') return 'Where are the ';
    if (w.kind === 'noun') return 'Where\'s the ';
    if (w.kind === 'name') return 'Where\'s ';
    return 'Find ';
  }
  function findEnd(w, bubbles) { return popsWell(w, bubbles) || w.kind === 'core' ? '!' : '?'; }
  function findPrompt(w, bubbles) { return findLead(w, bubbles) + label(w) + findEnd(w, bubbles); }
  function findParts(w, bubbles) { return withWord(findLead(w, bubbles), w, findEnd(w, bubbles)); }

  function tapPrompt(w) { return 'Tap ' + theWord(w) + label(w) + '!'; }
  function tapParts(w) { return withWord('Tap ' + theWord(w), w, '!'); }

  function thatsLead(w) {
    if (w.kind === 'plural') return 'Those are the ';
    if (w.kind === 'noun') return 'That\'s the ';
    return 'That\'s ';
  }

  var PRAISE = ['Yay!', 'Great job!', 'You did it!', 'Hooray!', 'Awesome!', 'Super!', 'Wow!', 'Way to go!', 'Good job!'];
  function praise() {
    var p = pick(PRAISE);
    var name = state.settings.childName;
    if (name && Math.random() < 0.35) p = p.replace(/!$/, ', ' + name + '!');
    return p;
  }

  /* ------------------------------------------------------------------ */
  /* Pictures, stars, icons, mascot                                      */
  /* ------------------------------------------------------------------ */

  function imgPath(w) { return 'img/words/' + (w.img || w.id) + '.png'; }

  function picture(w) {
    var el = h('div', { class: 'pic' });
    if (hasPhoto(w)) {
      el.classList.add('photo');
      var img = h('img', { alt: label(w), draggable: 'false' });
      el.appendChild(img);
      S.getMediaURL('photo:' + w.id).then(function (url) {
        if (url) { img.src = url; return; }
        el.classList.remove('photo');
        img.src = imgPath(w);
      });
      return el;
    }
    var n = w.stack || 1;
    if (n > 1) el.classList.add('stack');
    for (var i = 0; i < n; i++) el.appendChild(h('img', { src: imgPath(w), alt: i === 0 ? label(w) : '', draggable: 'false' }));
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

  var STAR_PATH = 'M12 2.4l2.95 5.98 6.6.96-4.78 4.65 1.13 6.57L12 17.46 6.1 20.56l1.13-6.57-4.78-4.65 6.6-.96z';
  var STAR_COLORS = { fromTwo: '#2F7BFF', fromMany: '#FF8A00', mastered: '#22C55E' };
  function starSvg(on, color) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR_PATH + '" fill="' + (on ? color : '#DDE3EE') + '"/></svg>';
  }
  function starsHTML(lv) {
    return starSvg(lv.fromTwo, STAR_COLORS.fromTwo) + starSvg(lv.fromMany, STAR_COLORS.fromMany) + starSvg(lv.mastered, STAR_COLORS.mastered);
  }
  function starsTitle(lv) {
    return 'Picks from 2: ' + (lv.fromTwo ? 'yes' : 'not yet') + ', Picks from 3 or 4: ' + (lv.fromMany ? 'yes' : 'not yet') + ', Mastered: ' + (lv.mastered ? 'yes' : 'not yet');
  }

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

  var PIP_SVG =
    '<svg viewBox="0 0 200 210" aria-hidden="true">' +
    '<defs>' +
    '<radialGradient id="pipBody" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#E2C9FF"/><stop offset=".5" stop-color="#A56BF0"/><stop offset="1" stop-color="#6A2FC2"/></radialGradient>' +
    '<radialGradient id="pipBall" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#FFF3B0"/><stop offset=".6" stop-color="#FFC928"/><stop offset="1" stop-color="#F29D00"/></radialGradient>' +
    '</defs>' +
    '<ellipse cx="100" cy="202" rx="56" ry="7" fill="rgba(38,38,74,.18)"/>' +
    '<g class="pip-bob">' +
    '<path d="M100 50 Q 94 28 110 16" stroke="#6A2FC2" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="111" cy="14" r="11" fill="url(#pipBall)"/>' +
    '<ellipse cx="72" cy="188" rx="21" ry="11" fill="#5B22AE"/>' +
    '<ellipse cx="128" cy="188" rx="21" ry="11" fill="#5B22AE"/>' +
    '<g class="pip-arm-l"><ellipse cx="36" cy="122" rx="14" ry="23" fill="#8446DC" transform="rotate(28 36 122)"/></g>' +
    '<g class="pip-arm-r"><ellipse cx="164" cy="122" rx="14" ry="23" fill="#8446DC" transform="rotate(-28 164 122)"/></g>' +
    '<circle cx="100" cy="116" r="72" fill="url(#pipBody)"/>' +
    '<ellipse cx="100" cy="152" rx="40" ry="27" fill="#F5ECFF" opacity=".5"/>' +
    '<g class="pip-eyes">' +
    '<ellipse cx="76" cy="100" rx="17" ry="21" fill="#fff"/><ellipse cx="124" cy="100" rx="17" ry="21" fill="#fff"/>' +
    '<circle cx="79" cy="104" r="10.5" fill="#26264A"/><circle cx="121" cy="104" r="10.5" fill="#26264A"/>' +
    '<circle cx="83" cy="99" r="4" fill="#fff"/><circle cx="125" cy="99" r="4" fill="#fff"/>' +
    '</g>' +
    '<ellipse cx="57" cy="128" rx="11" ry="7" fill="#FF7EB6" opacity=".75"/>' +
    '<ellipse cx="143" cy="128" rx="11" ry="7" fill="#FF7EB6" opacity=".75"/>' +
    '<path class="pip-smile" d="M84 129 Q100 147 116 129" stroke="#26264A" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<g class="pip-mouth"><ellipse cx="100" cy="135" rx="13" ry="11.5" fill="#5A1033"/><ellipse cx="100" cy="141" rx="8" ry="4.5" fill="#FF6F91"/></g>' +
    '</g></svg>';

  function mascot(cls) {
    return h('div', { class: 'mascot' + (cls ? ' ' + cls : ''), html: PIP_SVG });
  }

  Speech.onTalk = function (on) {
    var list = document.querySelectorAll('.mascot');
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
  /* Confetti                                                            */
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
  function go(name, arg) {
    clearTimers();
    Speech.stop();
    cleanups.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
    cleanups = [];
    app.innerHTML = '';
    app.className = 'screen-' + name;
    SCREENS[name](arg);
  }

  function topbar(left, middle, right) {
    return h('div', { class: 'topbar' }, left, middle, right);
  }
  function homeButton(fn) {
    return h('button', {
      class: 'icon-btn', 'aria-label': 'Home',
      onclick: function () { Sfx.tap(); (fn || function () { go('home'); })(); }
    }, h('img', { src: 'img/ui/house.png', alt: '' }));
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

  /* ------------------------------------------------------------------ */
  /* Welcome (first run)                                                 */
  /* ------------------------------------------------------------------ */

  function installTip() {
    if (!isIOS || isStandalone()) return null;
    return h('div', { class: 'install-tip', html:
      '<b>Put it on your Home Screen:</b> tap ' + SHARE_SVG + ' <b>Share</b> in Safari, then <b>Add to Home Screen</b>. ' +
      'It opens full screen like an app, works offline, and keeps progress safe.' });
  }

  SCREENS.welcome = function () {
    var nameInput = h('input', { type: 'text', placeholder: 'e.g. Sam', autocomplete: 'off', autocapitalize: 'words', maxlength: '30' });
    var start = h('button', { class: 'btn green', style: 'width:100%;margin-top:6px' }, 'Let\'s play!');
    start.addEventListener('click', function () {
      A.unlock();
      audioReady = true;
      state.settings.childName = nameInput.value.trim();
      state.settings.welcomed = true;
      S.saveState(state, true);
      S.requestPersist();
      go('home');
    });
    app.appendChild(h('div', { class: 'welcome' },
      mascot('waving'),
      h('div', { class: 'panel' },
        h('h2', { text: 'Welcome to Word Buddies!' }),
        h('p', { text: 'A listening game that helps your little one understand 50 important first words. Pip says a word, and your child finds the matching picture.' }),
        h('p', { text: 'Best played together: sit with your child, let them do the tapping, and cheer them on.' }),
        h('label', { class: 'field' }, 'Your child\'s first name (optional)', nameInput),
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

  function greeting() {
    var name = state.settings.childName;
    return pick([
      name ? 'Hi ' + name + '! Let\'s play!' : 'Hi! Let\'s play!',
      name ? 'Hello ' + name + '! Tap the big green button!' : 'Hello! Tap the big green button!'
    ]);
  }

  function modeBtn(icon, text, color, fn) {
    return h('button', {
      class: 'mode-btn', style: '--mc:' + color, 'aria-label': text,
      onclick: function () { Sfx.tap(); fn(); }
    }, h('img', { src: 'img/ui/' + icon + '.png', alt: '' }), h('span', { text: text }));
  }

  SCREENS.home = function () {
    var gear = h('button', { class: 'icon-btn hold-btn', 'aria-label': 'Grown-ups: press and hold', html: GEAR_SVG + RING_SVG });
    holdToOpen(gear, 1600, function () { go('parent'); });

    var count = h('button', { class: 'sticker-count', 'aria-label': 'My stickers', onclick: function () { Sfx.tap(); go('stickers'); } },
      h('img', { src: 'img/ui/star.png', alt: '' }), String(stickerTotal()));

    var logo = h('h1', { class: 'logo', 'aria-label': 'Word Buddies' });
    var colors = ['#FF5C8A', '#FF8A00', '#FFC928', '#22C55E', '#2F7BFF', '#9B5DE5'];
    'Word Buddies'.split('').forEach(function (ch, i) {
      if (ch === ' ') { logo.appendChild(h('span', { class: 'gap' })); return; }
      logo.appendChild(h('span', { text: ch, style: 'color:' + colors[i % colors.length] + ';animation-delay:' + (i * 0.12) + 's', 'aria-hidden': 'true' }));
    });

    var pip = mascot('waving');
    var pipWrap = h('button', { class: 'home-mascot', 'aria-label': 'Say hi' }, pip);
    pipWrap.addEventListener('click', function () {
      Sfx.boing();
      cheerMascot();
      Speech.say([greeting()]);
    });

    var play = h('button', { class: 'play-btn', 'aria-label': 'Play', html: PLAY_SVG });
    play.addEventListener('click', function () { Sfx.pop(); startSession('mix'); });

    var modes = h('nav', { class: 'modes' },
      modeBtn('picture', 'Words', '#2F7BFF', function () { go('words'); }),
      modeBtn('search', 'Find', '#FF8A00', function () { startSession('find'); }),
      modeBtn('party', 'Pop', '#22C55E', function () { startSession('pop'); }),
      modeBtn('star', 'Stickers', '#FF5C8A', function () { go('stickers'); })
    );

    app.appendChild(h('div', { class: 'home' },
      topbar(count, null, h('div', {}, gear, h('div', { class: 'hold-label', text: 'Grown-ups' }))),
      logo, pipWrap, play, modes));

    if (audioReady) later(function () { Speech.say([greeting()]); }, 450);
  };

  /* ------------------------------------------------------------------ */
  /* Play session                                                        */
  /* ------------------------------------------------------------------ */

  var session = null;

  function startSession(mode) {
    var plan = P.planSession(state, D.START_ORDER, { mode: mode, rounds: state.settings.sessionRounds }, Date.now());
    save();
    session = { mode: mode, plan: plan, idx: 0, started: Date.now(), words: [], token: 0, el: {} };
    go('session');
  }

  SCREENS.session = function () {
    if (!session) { go('home'); return; }
    var trail = h('div', { class: 'trail', 'aria-hidden': 'true' });
    session.plan.forEach(function () { trail.appendChild(h('i')); });
    var repeat = h('button', { class: 'icon-btn', 'aria-label': 'Hear it again' }, h('img', { src: 'img/ui/speaker.png', alt: '' }));
    repeat.addEventListener('click', function () { if (session && session.repeat) session.repeat(); });
    var body = h('div', { class: 'session' }, topbar(homeButton(leaveSession), trail, repeat));
    session.el = { body: body, trail: trail };
    app.appendChild(body);
    showRound();
  };

  function leaveSession() {
    if (session && session.idx > 0) P.logSession(state, (Date.now() - session.started) / 1000, Date.now());
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
    var rc = roundContext();
    (r.type === 'learn' ? learnRound : findRound)(w, rc, r);
  }

  function roundContext() {
    var token = session.token;
    var moved = false;
    return {
      alive: function () { return session && session.token === token; },
      advance: function (delay) {
        if (moved || !session || session.token !== token) return;
        moved = true;
        later(nextRound, delay == null ? 600 : delay);
      }
    };
  }

  function nextRound() {
    if (!session) return;
    session.idx += 1;
    if (session.idx >= session.plan.length) {
      P.logSession(state, (Date.now() - session.started) / 1000, Date.now());
      save();
      go('reward');
    } else {
      showRound();
    }
  }

  function makeStage(text) {
    var pip = mascot();
    var bubble = h('div', { class: 'bubble', text: text || '' });
    var talk = h('div', { class: 'talk-row' }, pip, bubble);
    var main = h('div', { class: 'stage-main' });
    var stage = h('section', { class: 'stage enter' }, talk, main);
    session.el.body.appendChild(stage);
    return { stage: stage, talk: talk, main: main, bubble: bubble, pip: pip };
  }

  // A big picture card. Tapping it says the word, unless onTap() handles
  // the tap and returns true.
  function bigCard(w, onTap) {
    var cat = D.catById[w.cat];
    var pic = picture(w);
    var card = h('button', { class: 'card big-card', style: '--cc:' + cat.color, 'aria-label': label(w) },
      pic, h('div', { class: 'word-label', text: label(w) }));
    card.addEventListener('click', function () {
      Sfx.pop();
      animatePic(pic, w);
      if (onTap && onTap() === true) return;
      Speech.say([wordPart(w, 0.85)]);
    });
    return card;
  }

  function flyStar(fromEl) {
    if (!fromEl || !fromEl.animate) return;
    var dot = session && session.el.trail ? session.el.trail.children[session.idx] : null;
    var r1 = fromEl.getBoundingClientRect();
    var r2 = dot ? dot.getBoundingClientRect() : { left: window.innerWidth / 2, top: 0, width: 0, height: 0 };
    var size = 72;
    var img = h('img', { src: 'img/ui/star.png', alt: '', style:
      'position:fixed;z-index:55;pointer-events:none;width:' + size + 'px;height:' + size + 'px;left:' +
      (r1.left + r1.width / 2 - size / 2) + 'px;top:' + (r1.top + r1.height / 2 - size / 2) + 'px' });
    document.body.appendChild(img);
    var dx = (r2.left + r2.width / 2) - (r1.left + r1.width / 2);
    var dy = (r2.top + r2.height / 2) - (r1.top + r1.height / 2);
    var anim = img.animate([
      { transform: 'translate(0,0) scale(0.3) rotate(0deg)' },
      { transform: 'translate(0,-50px) scale(1.25) rotate(120deg)', offset: 0.35 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.3) rotate(360deg)' }
    ], { duration: 1100, easing: 'ease-in-out' });
    var gone = function () { if (img.parentNode) img.remove(); };
    anim.onfinish = gone;
    setTimeout(gone, 1600);
  }

  // The child picked the right picture: cheer, name it again, move on.
  function celebrate(el, pic, w, bubble, rc) {
    animatePic(pic, w);
    Sfx.correct();
    FX.fromEl(el, 50);
    cheerMascot();
    flyStar(el);
    var p = praise();
    bubble.textContent = p + ' ' + cap(label(w)) + '!';
    Speech.say([p, { pause: 120 }].concat(withWord('', w, '!', 0.85))).then(function () { rc.advance(700); });
    later(function () { rc.advance(0); }, 6000);
  }

  /* Learn: see and hear the word, then tap it. */
  function learnRound(w, rc) {
    var phrase = fill(w.phrase, w);
    var s = makeStage(phrase);
    var ready = false;
    var done = false;
    var card = bigCard(w, function () {
      if (!ready || done) return false;
      done = true;
      card.classList.remove('tap-me');
      celebrate(card, pic, w, s.bubble, rc);
      return true;
    });
    var pic = card.querySelector('.pic');
    var next = h('button', { class: 'next-btn hidden', 'aria-label': 'Next', html: arrowSvg('right', '#fff') });
    next.addEventListener('click', function () { Sfx.whoosh(); rc.advance(0); });
    s.main.appendChild(card);
    s.stage.appendChild(next);
    P.recordExposure(state, w.id, Date.now());
    save();

    function askToTap() {
      if (ready || done || !rc.alive()) return;
      ready = true;
      card.classList.add('tap-me');
      s.bubble.textContent = tapPrompt(w);
      next.classList.remove('hidden');
      Speech.say(tapParts(w));
    }

    var anim = { run: function () { animatePic(pic, w); } };
    var intro = function () {
      return Speech.say([anim, wordPart(w, 0.8), { pause: 350 }, phrase, { pause: 300 }, anim, wordPart(w, 0.8)]);
    };
    session.repeat = function () {
      if (ready) return Speech.say([anim].concat(withWord('', w, '!', 0.8), [{ pause: 250 }], tapParts(w)));
      return intro();
    };
    later(function () {
      intro().then(function (ok) { if (ok) later(askToTap, 300); });
    }, 350);
    later(askToTap, 7000); // in case speech never finishes
    later(function () { if (!done && ready) Speech.say(tapParts(w)); }, 16000);
  }

  /* Find it: hear the word, tap its picture. Only the first tap counts. */
  function findRound(w, rc, round) {
    var bubbles = round && round.style === 'bubbles';
    var n = P.choiceCount(P.peek(state, w.id));
    var ids = P.shuffle(P.pickDistractors(WORDS, w.id, n - 1, state).concat([w.id]), Math.random);
    n = ids.length;
    var s = makeStage(findPrompt(w, bubbles));
    var grid = h('div', { class: 'choices n' + n + (bubbles ? ' bubbles' : '') });
    var firstTap = true;
    var misses = 0;
    var done = false;
    var targetBtn = null;

    ids.forEach(function (id, i) {
      var ww = D.byId[id];
      var pic = picture(ww);
      var btn = bubbles
        ? h('button', { class: 'choice bubble-choice', style: 'animation-delay:' + (-i * 0.7) + 's', 'aria-label': label(ww) }, h('div', { class: 'shell' }), pic)
        : h('button', { class: 'card choice', 'aria-label': label(ww) }, pic);
      if (id === w.id) targetBtn = btn;
      btn.addEventListener('click', function () {
        if (done) return;
        if (id === w.id) {
          done = true;
          if (firstTap) { P.recordFind(state, w.id, true, n, Date.now()); save(); }
          firstTap = false;
          btn.classList.remove('hint');
          var ptr = btn.querySelector('.pointer');
          if (ptr) ptr.remove();
          btn.classList.add('right');
          if (bubbles) { btn.classList.add('popped'); Sfx.pop(); }
          Array.prototype.forEach.call(grid.children, function (c) { if (c !== btn) c.classList.add('fade'); });
          celebrate(btn, pic, w, s.bubble, rc);
        } else {
          if (firstTap) { P.recordFind(state, w.id, false, n, Date.now()); save(); }
          firstTap = false;
          misses += 1;
          btn.classList.remove('miss');
          void btn.offsetWidth;
          btn.classList.add('miss');
          animatePic(pic, ww);
          Sfx.soft();
          // Errorless help: name what they tapped, then show the right one.
          targetBtn.classList.add('hint');
          if (misses >= 2 && !targetBtn.querySelector('.pointer')) {
            targetBtn.appendChild(h('div', { class: 'pointer', 'aria-hidden': 'true', text: '👆' }));
          }
          Speech.say(withWord(thatsLead(ww), ww, '.').concat([{ pause: 250 }], findParts(w, bubbles)));
        }
      });
      grid.appendChild(btn);
    });

    s.main.appendChild(grid);
    session.repeat = function () { return Speech.say(findParts(w, bubbles)); };
    later(session.repeat, 350);
    // Ask again if the child is still looking. No visual hint, so the first tap stays independent.
    later(function () { if (firstTap) session.repeat(); }, 9000);
    later(function () { if (firstTap) session.repeat(); }, 18000);
  }

  /* ------------------------------------------------------------------ */
  /* Reward: pick a present                                              */
  /* ------------------------------------------------------------------ */

  SCREENS.reward = function () {
    var played = session ? session.words.slice() : [];
    session = null;
    var name = state.settings.childName;
    var title = h('h2', { class: 'big-title', text: 'You did it!' });
    var pip = mascot('happy');
    var hint = h('p', { class: 'prize-name', text: 'Pick a present!' });
    var gifts = h('div', { class: 'gifts' });
    var actions = h('div', { class: 'reward-actions' });
    var picked = false;

    for (var i = 0; i < 3; i++) {
      (function () {
        var g = h('button', { class: 'gift', 'aria-label': 'Present' }, h('img', { src: 'img/ui/gift.png', alt: '' }));
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
        var prize = h('div', { class: 'prize' }, h('img', { src: 'img/stickers/' + st.id + '.png', alt: st.name }));
        gifts.replaceWith(prize);
        hint.textContent = cap(st.name) + '!';
        Sfx.tada();
        FX.fromEl(prize, 80);
        cheerMascot();
        Speech.say(['You got ' + article(st.name) + ' ' + st.name + '!']);
        prize.addEventListener('click', function () {
          Sfx.boing();
          FX.fromEl(prize, 30);
          Speech.say([cap(st.name) + '!']);
        });
        actions.appendChild(h('button', { class: 'btn green', onclick: function () { Sfx.pop(); startSession('mix'); } },
          h('span', { html: PLAY_SVG, style: 'width:26px;height:26px;display:inline-flex' }), 'Again'));
        actions.appendChild(h('button', { class: 'btn white', onclick: function () { Sfx.tap(); go('home'); } },
          h('img', { src: 'img/ui/house.png', alt: '' }), 'Home'));
        actions.appendChild(h('button', { class: 'btn pink', onclick: function () { Sfx.tap(); go('stickers'); } },
          h('img', { src: 'img/ui/star.png', alt: '' }), 'Stickers'));
      }, 1000);
    }

    var strip = h('div', { class: 'practiced', 'aria-label': 'Words practiced' });
    played.forEach(function (id) {
      var w = D.byId[id];
      if (w) strip.appendChild(h('img', { src: imgPath(w), alt: label(w) }));
    });

    app.appendChild(h('div', { class: 'reward' }, title, pip, hint, gifts, actions, strip));
    Sfx.tada();
    FX.rain(180);
    later(cheerMascot, 200);
    Speech.say([name ? 'Yay, ' + name + '! You did it!' : 'Yay! You did it!', { pause: 250 }, 'Pick a present!']);
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
      var c = h('button', { class: 'chip' + (wordsCat === id ? ' on' : ''), style: '--cc:' + color },
        icon ? h('img', { src: icon, alt: '' }) : null, name);
      c.addEventListener('click', function () {
        Sfx.tap();
        wordsCat = id;
        Array.prototype.forEach.call(chips.children, function (x) { x.classList.remove('on'); });
        c.classList.add('on');
        renderGrid();
        scroller.scrollTop = 0;
        if (id !== 'all') Speech.say([name]);
      });
      return c;
    }
    chips.appendChild(chip('all', 'All', '#26264A', 'img/ui/star.png'));
    D.CATEGORIES.forEach(function (c) { chips.appendChild(chip(c.id, c.name, c.color, imgPath(D.byId[c.icon]))); });

    function renderGrid() {
      grid.innerHTML = '';
      var list = WORDS.filter(function (w) { return wordsCat === 'all' || w.cat === wordsCat; });
      list.forEach(function (w, i) {
        var cat = D.catById[w.cat];
        var lv = P.level(P.peek(state, w.id));
        var tile = h('button', { class: 'tile', style: '--cc:' + cat.color, 'aria-label': label(w) },
          picture(w),
          h('div', { class: 'name', text: label(w) }),
          h('div', { class: 'mini-stars', title: starsTitle(lv), html: starsHTML(lv) }));
        tile.addEventListener('click', function () { Sfx.pop(); openViewer(list, i, renderGrid); });
        grid.appendChild(tile);
      });
    }
    renderGrid();

    app.appendChild(topbar(homeButton(), h('h1', { class: 'screen-title', text: 'Words' }), spacer()));
    app.appendChild(chips);
    app.appendChild(scroller);
  };

  // Full-screen talking picture, swipe or use arrows to flip through.
  function openViewer(list, index, onClose) {
    var i = index;
    var ov = h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Word' });
    var close = h('button', { class: 'icon-btn', 'aria-label': 'Close', html: CLOSE_SVG });
    var counter = h('div', { class: 'screen-title', style: 'font-size:22px' });
    var body = h('div', { class: 'stage' });
    ov.appendChild(topbar(close, counter, spacer()));
    ov.appendChild(body);
    app.appendChild(ov);
    var token = 0;

    close.addEventListener('click', function () {
      Sfx.tap();
      Speech.stop();
      ov.remove();
      if (onClose) onClose();
    });

    function show(dir) {
      token += 1;
      var my = token;
      var w = list[i];
      counter.textContent = (i + 1) + ' / ' + list.length;
      body.innerHTML = '';
      var phrase = fill(w.phrase, w);
      var pip = mascot();
      var bubble = h('div', { class: 'bubble', text: phrase });
      var card = bigCard(w);
      var pic = card.querySelector('.pic');
      var prev = h('button', { class: 'arrow-btn', 'aria-label': 'Previous', html: arrowSvg('left', '#26264A') });
      var next = h('button', { class: 'arrow-btn', 'aria-label': 'Next', html: arrowSvg('right', '#26264A') });
      prev.addEventListener('click', function () { Sfx.whoosh(); i = (i - 1 + list.length) % list.length; show(-1); });
      next.addEventListener('click', function () { Sfx.whoosh(); i = (i + 1) % list.length; show(1); });
      body.appendChild(h('div', { class: 'talk-row' }, pip, bubble));
      body.appendChild(h('div', { class: 'stage-main' }, h('div', { class: 'viewer-row' }, prev, card, next)));
      if (dir) {
        body.classList.remove('enter');
        void body.offsetWidth;
        body.classList.add('enter');
      }
      P.recordExposure(state, w.id, Date.now());
      save();
      var anim = { run: function () { if (my === token) animatePic(pic, w); } };
      setTimeout(function () {
        if (my !== token || !ov.parentNode) return;
        Speech.say([anim, wordPart(w, 0.8), { pause: 350 }, phrase, { pause: 300 }, anim, wordPart(w, 0.8)]);
      }, 250);
    }

    // Swipe left / right on the picture area.
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
    D.STICKERS.forEach(function (s) {
      var n = state.stickers[s.id] || 0;
      var img = h('img', { src: 'img/stickers/' + s.id + '.png', alt: n ? s.name : 'Mystery sticker' });
      var el = h('button', { class: 'sticker' + (n ? '' : ' missing'), 'aria-label': n ? s.name : 'Mystery sticker' },
        img, n > 1 ? h('span', { class: 'count', text: 'x' + n }) : null);
      el.addEventListener('click', function () {
        if (!n) {
          Sfx.soft();
          Speech.say(['Play to find more stickers!']);
          return;
        }
        Sfx.boing();
        el.classList.remove('anim-wiggle');
        void el.offsetWidth;
        el.classList.add('anim-wiggle');
        FX.fromEl(el, 18);
        Speech.say([cap(s.name) + '!']);
      });
      grid.appendChild(el);
    });
    app.appendChild(topbar(homeButton(), h('h1', { class: 'screen-title', text: 'My Stickers' }),
      h('div', { class: 'sticker-count' }, have + '/' + D.STICKERS.length)));
    app.appendChild(h('div', { class: 'scroll' }, grid));
    if (audioReady) {
      later(function () {
        Speech.say([have ? 'Look at all your stickers!' : 'Play to win stickers!']);
      }, 300);
    }
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
    var TABS = [['progress', 'Progress'], ['words', 'Words'], ['settings', 'Settings'], ['help', 'Help']];
    TABS.forEach(function (t) {
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

  // Redraw the grown-ups screen without losing the scroll position.
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

  function progressTab(body) {
    var sum = P.summary(state, WORDS);
    var now = Date.now();
    var tip = installTip();
    if (tip) body.appendChild(pCard(null, tip));

    body.appendChild(pCard('Words mastered',
      h('div', { class: 'hero-num', html: sum.mastered + ' <small>of ' + sum.total + '</small>' }),
      h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round(sum.mastered / sum.total * 100) + '%' })),
      h('p', { class: 'p-muted', text: 'Mastered = hears the word and picks the right picture from 3 or 4 choices on ' + P.MASTER_DAYS + ' different days, getting 4 of the last 5 right.' }),
      h('div', { class: 'stat-tiles' },
        h('div', { class: 'stat-tile', style: '--tc:' + STAR_COLORS.fromTwo }, h('b', { text: String(sum.fromTwo) }), h('span', { text: 'Picks from 2' })),
        h('div', { class: 'stat-tile', style: '--tc:' + STAR_COLORS.fromMany }, h('b', { text: String(sum.fromMany) }), h('span', { text: 'Picks from 3-4' })),
        h('div', { class: 'stat-tile', style: '--tc:' + STAR_COLORS.mastered }, h('b', { text: String(sum.mastered) }), h('span', { text: 'Mastered' })))
    ));

    // Last 7 days
    var week = h('div', { class: 'week' });
    var max = 1;
    var days = [];
    for (var d = 6; d >= 0; d--) {
      var dt = new Date(now);
      dt.setDate(dt.getDate() - d);
      var log = state.days[P.dayKey(dt.getTime())];
      var rounds = log ? log.rounds : 0;
      max = Math.max(max, rounds);
      days.push({ label: 'SMTWTFS'.charAt(dt.getDay()), rounds: rounds });
    }
    days.forEach(function (dd) {
      week.appendChild(h('div', {},
        h('em', { text: dd.rounds ? String(dd.rounds) : '' }),
        h('i', { class: dd.rounds ? '' : 'zero', style: 'height:' + Math.max(4, Math.round(dd.rounds / max * 80)) + 'px' }),
        h('span', { text: dd.label })));
    });
    var today = state.days[P.dayKey(now)];
    var streak = P.streak(state, now);
    var todayText = null;
    if (today && today.rounds) {
      todayText = 'Today: ' + today.rounds + ' pictures to find, ' + today.correct + ' right on the first try (' +
        Math.round(today.correct / today.rounds * 100) + '%), about ' + Math.max(1, Math.round(today.seconds / 60)) + ' min.';
    }
    body.appendChild(pCard('Practice',
      h('p', { text: streak ? streak + '-day streak. Keep it going!' : 'No practice yet today. A few minutes counts!' }),
      todayText ? h('p', { class: 'p-muted', text: todayText }) : null,
      week,
      h('p', { class: 'p-muted', text: 'Pictures found each day this week.' })));

    // Learning now
    P.refreshFocus(state, D.START_ORDER);
    save();
    var chips = h('div', { class: 'focus-chips' });
    state.focus.forEach(function (id) {
      var w = D.byId[id];
      chips.appendChild(h('div', { class: 'focus-chip' }, h('img', { src: imgPath(w), alt: '' }), label(w)));
    });
    body.appendChild(pCard('Learning now', chips,
      h('p', { class: 'p-muted', text: 'Play practices these words most. When one is mastered, the next word joins automatically, and mastered words come back for quick checks.' }),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn purple small', onclick: function () { parentTab = 'words'; wordFilter = 'focus'; go('parent'); } }, 'Choose words'))));

    // Categories
    var cats = pCard('By category');
    D.CATEGORIES.forEach(function (c) {
      var bc = sum.byCat[c.id] || { total: 0, stars: 0, mastered: 0 };
      cats.appendChild(h('div', { class: 'cat-row' },
        h('img', { src: imgPath(D.byId[c.icon]), alt: '' }),
        h('span', { class: 'name', text: c.name }),
        h('div', { class: 'bar cat', style: '--cc:' + c.color }, h('i', { style: 'width:' + Math.round(bc.stars / (bc.total * 3) * 100) + '%' })),
        h('span', { class: 'n', text: bc.mastered + '/' + bc.total })));
    });
    body.appendChild(cats);

    body.appendChild(pCard('Share with your speech therapist',
      h('p', { text: 'Send a spreadsheet of every word: how often your child picks the right picture, recent accuracy, and which words are mastered.' }),
      h('div', { class: 'btn-row' }, h('button', {
        class: 'btn blue small',
        onclick: function () {
          shareFile('word-buddies-report-' + P.dayKey(Date.now()) + '.csv', P.reportCSV(state, WORDS, D.catById, label), 'text/csv');
        }
      }, 'Share report'))));
  }

  function wordStatsText(w) {
    var st = P.peek(state, w.id);
    var lv = P.level(st);
    if (st.known) return 'Already understood this word';
    var bits = [];
    if (lv.mastered) bits.push('Mastered');
    if (st.findTries) bits.push('Right first try ' + st.findOk + '/' + st.findTries);
    if (!lv.mastered && st.winDays.length) bits.push('Mastery days ' + Math.min(st.winDays.length, P.MASTER_DAYS) + '/' + P.MASTER_DAYS);
    if (!st.findTries) bits.push(st.seen ? 'Heard ' + st.seen + 'x' : 'Not started');
    return bits.join(' · ');
  }

  function wordsTab(body) {
    P.refreshFocus(state, D.START_ORDER);
    save();
    var filters = [['all', 'All 50'], ['focus', 'Learning now'], ['mastered', 'Mastered'], ['new', 'Not started']];
    var row = h('div', { class: 'filter-row' });
    filters.forEach(function (f) {
      row.appendChild(h('button', {
        class: 'filter' + (wordFilter === f[0] ? ' on' : ''),
        onclick: function () { wordFilter = f[0]; go('parent'); }
      }, f[1]));
    });
    body.appendChild(row);
    body.appendChild(h('p', { class: 'p-muted', style: 'margin:0 0 10px', text: 'Tap the pencil to rename a word ("Mama"), record your own voice, or use a real photo. Stars: blue = picks it from 2 pictures, orange = from 3 or 4, green = mastered.' }));

    D.CATEGORIES.forEach(function (c) {
      var list = WORDS.filter(function (w) {
        if (w.cat !== c.id) return false;
        var lv = P.level(P.peek(state, w.id));
        if (wordFilter === 'focus') return state.focus.indexOf(w.id) !== -1;
        if (wordFilter === 'mastered') return lv.mastered;
        if (wordFilter === 'new') return lv.stage === 'new';
        return true;
      });
      if (!list.length) return;
      var card = pCard(c.name);
      list.forEach(function (w) {
        var lv = P.level(P.peek(state, w.id));
        var inFocus = state.focus.indexOf(w.id) !== -1;
        var focusBtn = null;
        if (lv.mastered) {
          focusBtn = h('span', { class: 'pill-btn on', text: 'Mastered' });
        } else {
          focusBtn = h('button', {
            class: 'pill-btn' + (inFocus ? ' on' : ''),
            onclick: function () {
              if (inFocus) P.removeFocus(state, w.id);
              else P.addFocus(state, w.id);
              save();
              rerenderParent();
            }
          }, inFocus ? 'Learning ✓' : 'Learn now');
        }
        card.appendChild(h('div', { class: 'word-row' },
          h('div', { class: 'thumb' }, picture(w)),
          h('div', { class: 'info' },
            h('b', { text: label(w) }),
            h('span', { class: 'stars3', title: starsTitle(lv), html: starsHTML(lv) }),
            h('div', { class: 'p-muted', text: wordStatsText(w) })),
          focusBtn,
          h('button', { class: 'edit-btn', 'aria-label': 'Customize ' + label(w), html: PENCIL_SVG, onclick: function () { openCustomize(w); } })));
      });
      body.appendChild(card);
    });
  }

  // How to practice understanding a word away from the screen.
  function realLife(w) {
    if (w.life) return w.life;
    var l = label(w);
    var plural = w.kind === 'plural';
    if (w.cat === 'body') return 'Ask "' + (plural ? 'Where are your ' : 'Where\'s your ') + l + '?" and touch ' + (plural ? 'them' : 'it') + ' together. Soon your child will show you.';
    if (w.kind === 'name') return 'Ask "Where\'s ' + l + '?" and let your child look, point or go to them.';
    return 'Ask "' + (plural ? 'Where are the ' : 'Where\'s the ') + l + '?" and let your child point to ' + (plural ? 'them' : 'it') + ' or bring ' + (plural ? 'them' : 'it') + ' to you.';
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
    var back = h('div', { class: 'sheet-back' });
    var sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Customize ' + label(w) });
    back.appendChild(sheet);
    var thumb = h('div', { class: 'thumb' });
    var title = h('h2');

    function refreshTop() {
      thumb.innerHTML = '';
      thumb.appendChild(picture(w));
      title.textContent = label(w);
    }

    function closeSheet() {
      Speech.stop();
      A.Rec.stop();
      back.remove();
      rerenderParent();
    }
    back.addEventListener('click', function (e) { if (e.target === back) closeSheet(); });

    var nameInput = h('input', { type: 'text', value: customOf(w.id).label || '', placeholder: w.word, maxlength: '24', autocomplete: 'off' });
    nameInput.addEventListener('input', function () {
      var v = nameInput.value.trim();
      var c = editCustom(w.id);
      if (v) c.label = v; else delete c.label;
      save();
      title.textContent = label(w);
    });

    // Voice recording
    var recStatus = h('p', { class: 'p-muted' });
    var recRow = h('div', { class: 'btn-row' });
    function renderRec() {
      recRow.innerHTML = '';
      recStatus.textContent = hasRec(w) ? 'Using your recording.' : 'Using the app voice.';
      if (!A.Rec.supported()) {
        recStatus.textContent = 'Recording isn\'t available in this browser. On iPhone, open Word Buddies in Safari.';
        return;
      }
      var recBtn = h('button', { class: 'btn red small' }, h('span', { class: 'rec-dot' }), hasRec(w) ? 'Record again' : 'Record');
      recBtn.addEventListener('click', function () {
        recBtn.disabled = true;
        recRow.classList.add('recording');
        recStatus.textContent = 'Recording... say "' + label(w) + '" clearly.';
        A.unlock();
        A.Rec.start(2500).then(function (blob) {
          recRow.classList.remove('recording');
          if (!blob || !blob.size) throw new Error('empty');
          return S.putMedia('rec:' + w.id, blob);
        }).then(function () {
          editCustom(w.id).rec = true;
          Speech.forgetRecording(w.id);
          save();
          renderRec();
          Speech.say([wordPart(w)]);
        }).catch(function () {
          recRow.classList.remove('recording');
          recStatus.textContent = 'Couldn\'t record. Check that the microphone is allowed for this app in Settings.';
          recBtn.disabled = false;
        });
      });
      recRow.appendChild(recBtn);
      recRow.appendChild(h('button', { class: 'btn white small', onclick: function () { A.unlock(); Speech.say([wordPart(w)]); } }, 'Play'));
      if (hasRec(w)) {
        recRow.appendChild(h('button', {
          class: 'btn white small',
          onclick: function () {
            S.deleteMedia('rec:' + w.id);
            delete editCustom(w.id).rec;
            Speech.forgetRecording(w.id);
            save();
            renderRec();
          }
        }, 'Use app voice'));
      }
    }

    // Photo
    var fileInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    var photoRow = h('div', { class: 'btn-row' });
    var photoStatus = h('p', { class: 'p-muted' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      photoStatus.textContent = 'Saving photo...';
      squarePhoto(f).then(function (blob) {
        return S.putMedia('photo:' + w.id, blob);
      }).then(function () {
        editCustom(w.id).photo = true;
        save();
        refreshTop();
        renderPhoto();
      }).catch(function () {
        photoStatus.textContent = 'Couldn\'t use that photo. Try another one.';
      });
      fileInput.value = '';
    });
    function renderPhoto() {
      photoRow.innerHTML = '';
      photoStatus.textContent = hasPhoto(w) ? 'Using your photo.' : 'Using the cartoon picture.';
      photoRow.appendChild(h('button', { class: 'btn blue small', onclick: function () { fileInput.click(); } }, hasPhoto(w) ? 'Change photo' : 'Add a photo'));
      if (hasPhoto(w)) {
        photoRow.appendChild(h('button', {
          class: 'btn white small',
          onclick: function () {
            S.deleteMedia('photo:' + w.id);
            delete editCustom(w.id).photo;
            save();
            refreshTop();
            renderPhoto();
          }
        }, 'Use cartoon'));
      }
    }

    var known = !!P.peek(state, w.id).known;
    var knownSwitch = h('button', { class: 'switch' + (known ? ' on' : ''), role: 'switch', 'aria-checked': known ? 'true' : 'false', 'aria-label': 'Already understands this word' });
    knownSwitch.addEventListener('click', function () {
      known = !known;
      P.setKnown(state, w.id, known);
      P.refreshFocus(state, D.START_ORDER);
      save();
      knownSwitch.classList.toggle('on', known);
      knownSwitch.setAttribute('aria-checked', known ? 'true' : 'false');
    });

    var tips = h('div', { class: 'tipbox' },
      h('div', {}, h('b', { text: 'Say it in play: ' }), '"' + fill(w.phrase, w) + '"'),
      h('div', {}, h('b', { text: 'Practice in real life: ' }), realLife(w)),
      w.sign ? h('div', {}, h('b', { text: 'Baby sign: ' }), w.sign + ' Signing while you say the word helps connect word and meaning.') : null);

    sheet.appendChild(h('div', { class: 'sheet-top' }, thumb, title,
      h('button', { class: 'btn purple small', onclick: closeSheet }, 'Done')));
    sheet.appendChild(h('label', { class: 'field' }, 'What your family calls it', nameInput));
    sheet.appendChild(h('h3', { text: 'Your voice' }));
    sheet.appendChild(h('p', { class: 'p-muted', text: 'Record yourself saying the word. Many children listen best to a familiar voice.' }));
    sheet.appendChild(recRow);
    sheet.appendChild(recStatus);
    sheet.appendChild(h('h3', { text: 'Photo' }));
    sheet.appendChild(h('p', { class: 'p-muted', text: 'Use a photo of your child\'s own cup, dog, or Grandma. Real photos help words carry over to real life.' }));
    sheet.appendChild(photoRow);
    sheet.appendChild(photoStatus);
    sheet.appendChild(fileInput);
    sheet.appendChild(h('div', { class: 'setting' },
      h('div', { class: 'label' }, 'Already understands this word', h('small', { text: 'Counts it as mastered so practice time goes to new words. It still comes back for quick checks.' })),
      knownSwitch));
    sheet.appendChild(tips);

    refreshTop();
    renderRec();
    renderPhoto();
    app.appendChild(back);
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

    var nameInput = h('input', { type: 'text', value: st.childName || '', placeholder: 'e.g. Sam', maxlength: '30', autocomplete: 'off', autocapitalize: 'words' });
    nameInput.addEventListener('input', function () { st.childName = nameInput.value.trim(); save(); });
    body.appendChild(pCard('Your child', h('label', { class: 'field' }, 'First name (used in cheers)', nameInput)));

    body.appendChild(pCard('Game',
      setting('Words at a time', 'How many new words are practiced together. Fewer is easier.',
        segmented([[3, '3'], [5, '5'], [7, '7']], st.activeSize, function (v) {
          st.activeSize = v;
          P.refreshFocus(state, D.START_ORDER);
          save();
        })),
      setting('Play length', 'Rounds in one Play (about 3 to 6 minutes). Short and fun beats long.',
        segmented([[6, '6'], [10, '10'], [15, '15']], st.sessionRounds, function (v) { st.sessionRounds = v; save(); })),
      setting('Sound effects', null, toggle(st.sfx, function (on) { st.sfx = on; Sfx.enabled = on; save(); }))
    ));

    var voiceSelect = h('select');
    function fillVoices() {
      voiceSelect.innerHTML = '';
      voiceSelect.appendChild(h('option', { value: '' }, 'Automatic (best available)'));
      Speech.voices().forEach(function (v) {
        var o = h('option', { value: v.voiceURI }, v.name + ' (' + v.lang + ')');
        if (v.voiceURI === st.voiceURI) o.selected = true;
        voiceSelect.appendChild(o);
      });
    }
    fillVoices();
    if (window.speechSynthesis && window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', fillVoices);
      onLeave(function () { window.speechSynthesis.removeEventListener('voiceschanged', fillVoices); });
    }
    voiceSelect.addEventListener('change', function () {
      st.voiceURI = voiceSelect.value;
      Speech.voiceURI = st.voiceURI;
      Speech.pickVoice();
      save();
    });
    body.appendChild(pCard('Voice',
      setting('Speaking speed', 'Slower speech is easier to follow for new listeners.',
        segmented([[0.65, 'Slow'], [0.8, 'Medium'], [1, 'Normal']], st.rate, function (v) { st.rate = v; Speech.rate = v; save(); })),
      h('label', { class: 'field' }, 'Voice', voiceSelect),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn blue small', onclick: function () { A.unlock(); Speech.say(['Hi! Where\'s the ball?']); } }, 'Test voice')),
      h('p', { class: 'p-muted', text: 'Tip: iPhone has nicer voices you can download for free: Settings > Accessibility > Spoken Content > Voices > English. Pick one marked Enhanced or Premium, then choose it here.' })));

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
        // Photos and recordings live on the device, so keep this device's.
        state.custom = keepCustom;
        S.saveState(state, true);
        applySettings();
        toast('Backup restored');
        go('parent');
      }).catch(function () { toast('That file isn\'t a Word Buddies backup.'); });
      importInput.value = '';
    });
    body.appendChild(pCard('Backup',
      h('p', { text: 'Save a backup file (to Files, email, or AirDrop) and restore it on a new phone.' }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn blue small', onclick: function () {
          shareFile('word-buddies-backup-' + P.dayKey(Date.now()) + '.json', JSON.stringify(state), 'application/json');
        } }, 'Save backup'),
        h('button', { class: 'btn white small', onclick: function () { importInput.click(); } }, 'Restore backup')),
      importInput,
      h('p', { class: 'p-muted', text: 'Photos and voice recordings stay on this device and are not in the backup.' })));

    body.appendChild(pCard('Start over',
      h('p', { class: 'p-muted', text: 'Erases progress and stickers. Your settings, names, photos and recordings are kept.' }),
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
        h('li', { html: 'Open <b>Word Buddies</b> from your Home Screen. It runs full screen and works offline.' })),
      tip ? null : h('p', { class: 'p-muted', text: isStandalone() ? 'You\'re using the Home Screen app. You\'re all set!' : '' })));

    body.appendChild(pCard('How to play together',
      h('ol', {},
        h('li', { html: '<b>Sit together and let your child do the tapping.</b> Your job is to cheer.' }),
        h('li', { html: '<b>Give them time to look.</b> After "Where\'s the dog?", wait a few seconds. If they don\'t tap, the game asks again.' }),
        h('li', { html: '<b>Try not to point to the answer.</b> Only the first tap counts toward progress. After a wrong tap the game gently shows the right picture, so your child still ends with a win.' }),
        h('li', { html: '<b>Say it again after they choose:</b> "Yes, the dog! Woof woof!" Hearing a word many times is how understanding grows.' }),
        h('li', { html: '<b>Keep it short and happy.</b> One or two Play sessions (3 to 5 minutes) a few times a day. Stop while it\'s still fun.' }),
        h('li', { html: '<b>Practice in real life.</b> Ask "Where\'s your nose?" or "Where\'s the ball?" and let your child point, look or bring it. Tap the pencil next to any word for ideas.' }),
        h('li', { html: '<b>Talk about what your child is looking at,</b> using short phrases: "Ball! Big ball!"' }))));

    body.appendChild(pCard('What the stars mean',
      h('div', { class: 'word-row' }, h('span', { class: 'stars3', html: starSvg(true, STAR_COLORS.fromTwo) }),
        h('div', { class: 'info', html: '<b>Picks from 2</b><div class="p-muted">Picked the right picture on the first try at least twice.</div>' })),
      h('div', { class: 'word-row' }, h('span', { class: 'stars3', html: starSvg(true, STAR_COLORS.fromMany) }),
        h('div', { class: 'info', html: '<b>Picks from 3 or 4</b><div class="p-muted">Picked it on the first try at least twice with 3 or 4 pictures to choose from.</div>' })),
      h('div', { class: 'word-row' }, h('span', { class: 'stars3', html: starSvg(true, STAR_COLORS.mastered) }),
        h('div', { class: 'info', html: '<b>Mastered</b><div class="p-muted">Right with 3 or 4 pictures on ' + P.MASTER_DAYS + ' different days, and 4 of the last 5 tries right.</div>' })),
      h('p', { text: 'The number of pictures grows as your child gets a word right, so lucky guesses don\'t earn stars. When a word is mastered, a new one joins, and mastered words come back for a quick check after 1, 3, 7, 14 and 30 days.' })));

    body.appendChild(pCard('Why understanding first?',
      h('p', { text: 'Children understand words before they can say them. Each word your child understands is one they can later learn to say. Keep naming things all day; when your child starts trying to talk, the words will be ready.' })));

    body.appendChild(pCard('iPhone tips',
      h('ul', {},
        h('li', { html: '<b>No sound?</b> Check the ring/silent switch and the volume buttons.' }),
        h('li', { html: '<b>Keep little fingers in the game</b> with Guided Access: Settings > Accessibility > Guided Access. Triple-click the side button to start and stop it.' }),
        h('li', { html: '<b>Grown-ups area:</b> press and hold the purple gear on the home screen.' }),
        h('li', { html: '<b>Keep progress safe:</b> use the Home Screen app, and save a backup now and then (Settings tab).' }))));

    body.appendChild(pCard('Please note',
      h('p', { text: 'Word Buddies supports, but doesn\'t replace, speech therapy. If you have concerns about your child\'s speech or language, talk with your pediatrician or a speech-language pathologist. You can share the progress report from the Progress tab with your child\'s therapist.' }),
      h('p', { class: 'p-muted', text: 'Everything stays on this device. No accounts, no ads, no tracking.' })));

    body.appendChild(pCard('Credits',
      h('p', { class: 'p-muted', text: 'Pictures: Microsoft Fluent Emoji (MIT License). Font: Fredoka (SIL Open Font License).' })));
  }

  /* ------------------------------------------------------------------ */
  /* Start up                                                            */
  /* ------------------------------------------------------------------ */

  function applySettings() {
    Speech.rate = state.settings.rate;
    Speech.voiceURI = state.settings.voiceURI;
    Speech.pickVoice();
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

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
    });
  }

  Speech.init();
  applySettings();
  if (isStandalone()) S.requestPersist();
  go(state.settings.welcomed ? 'home' : 'welcome');

  // Handy for testing in the browser console.
  window.WB_APP = { go: go, state: function () { return state; }, session: function () { return session; }, startSession: startSession };
})();
