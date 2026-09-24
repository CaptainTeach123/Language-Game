/*
 * Word Wizard: everything that makes sound.
 *   Speech  - the voice: bundled ElevenLabs clips, played in order
 *   Sfx     - cheerful sound effects made with Web Audio (no sound files)
 *
 * iPhone notes: Safari only allows sound after the first tap, so unlock()
 * runs on the first touch. Web Audio follows the ring/silent switch unless
 * the page asks for "playback" audio, which we do where Safari supports it.
 */
(function (root) {
  'use strict';

  var ctx = null;
  function audioCtx() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  }

  function setSession(type) {
    try { if (root.navigator.audioSession) root.navigator.audioSession.type = type; } catch (e) { /* ignore */ }
  }

  // Called from touchend/click handlers (the events iOS treats as a real tap).
  // Primes twice in case the first event doesn't count as a gesture.
  var primed = 0;
  function unlock() {
    var c = audioCtx();
    if (c && c.state !== 'running') c.resume();
    if (primed >= 2) return;
    primed += 1;
    setSession('playback');
    if (c) {
      var b = c.createBuffer(1, 1, 22050);
      var s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Speech: bundled voice clips                                         */
  /* ------------------------------------------------------------------ */

  // Every spoken line is a small MP3 recorded with ElevenLabs (see tools/voice/),
  // e.g. audio/ball-where.mp3 ("Where's the ball?"). Clips are decoded once and kept.
  var Speech = {
    base: 'audio/',
    onTalk: null,
    token: 0,
    buffers: {},
    loading: {},
    source: null,
    element: null,

    talk: function (on) {
      if (this.onTalk) this.onTalk(on);
    },

    // Fetch and decode clips ahead of time so there's no gap before a prompt.
    load: function (name) {
      var self = this;
      if (self.buffers[name]) return Promise.resolve(self.buffers[name]);
      if (self.loading[name]) return self.loading[name];
      var c = audioCtx();
      if (!c || !root.fetch) return Promise.resolve(null);
      var p = root.fetch(self.base + name + '.mp3')
        .then(function (r) { if (!r.ok) throw new Error(name); return r.arrayBuffer(); })
        .then(function (data) {
          return new Promise(function (resolve, reject) {
            // Older Safari only has the callback form of decodeAudioData.
            var q = c.decodeAudioData(data, resolve, reject);
            if (q && q.then) q.then(resolve, reject);
          });
        })
        .then(function (buf) { self.buffers[name] = buf; return buf; })
        .catch(function () { return null; })
        .then(function (buf) { delete self.loading[name]; return buf; });
      self.loading[name] = p;
      return p;
    },

    preload: function (names) {
      var self = this;
      return Promise.all(names.map(function (n) { return self.load(n); }));
    },

    stop: function () {
      this.token += 1;
      if (this.source) { try { this.source.stop(); } catch (e) { /* ignore */ } this.source = null; }
      this.talk(false);
    },

    playBuffer: function (buf) {
      var self = this;
      var c = audioCtx();
      return new Promise(function (resolve) {
        if (!c || !buf) { resolve(); return; }
        if (c.state !== 'running') c.resume();
        var s = c.createBufferSource();
        s.buffer = buf;
        s.connect(c.destination);
        self.source = s;
        self.talk(true);
        var finished = false;
        var end = function () {
          if (finished) return;
          finished = true;
          if (self.source === s) self.source = null;
          self.talk(false);
          resolve();
        };
        s.onended = end;
        // Don't let the game wait forever if onended never fires.
        setTimeout(end, buf.duration * 1000 + 400);
        s.start(0);
      });
    },

    /*
     * Say a list of parts in order. A part is:
     *   'ball-where'     a clip name (audio/ball-where.mp3)
     *   { pause: ms }
     *   { run: fn }      call fn right now (to sync an animation)
     * Resolves true when finished, false if stop() or another say() cut it short.
     */
    say: function (parts) {
      var self = this;
      self.stop();
      var my = self.token;
      var i = 0;
      var next = function () {
        if (my !== self.token || i >= parts.length) return Promise.resolve(my === self.token);
        var p = parts[i++];
        var step;
        if (typeof p === 'string') {
          step = self.load(p).then(function (buf) { return my === self.token ? self.playBuffer(buf) : null; });
        } else if (p.run) { p.run(); step = Promise.resolve(); }
        else step = new Promise(function (r) { setTimeout(r, p.pause || 0); });
        return step.then(next);
      };
      return next();
    }
  };

  /* ------------------------------------------------------------------ */
  /* Sound effects                                                       */
  /* ------------------------------------------------------------------ */

  var Sfx = {
    enabled: true,

    tone: function (freq, start, dur, type, vol, slideTo) {
      var c = audioCtx();
      if (!c || !this.enabled) return;
      var t = c.currentTime + start;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    noise: function (start, dur, vol, fromHz, toHz) {
      var c = audioCtx();
      if (!c || !this.enabled) return;
      var t = c.currentTime + start;
      var len = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, len, c.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      var s = c.createBufferSource();
      var f = c.createBiquadFilter();
      var g = c.createGain();
      s.buffer = buf;
      f.type = 'bandpass';
      f.frequency.setValueAtTime(fromHz || 800, t);
      if (toHz) f.frequency.exponentialRampToValueAtTime(toHz, t + dur);
      g.gain.setValueAtTime(vol || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(c.destination);
      s.start(t);
    },

    tap: function () { this.tone(660, 0, 0.08, 'triangle', 0.12, 990); },
    pop: function () { this.tone(420, 0, 0.12, 'sine', 0.25, 1400); },
    boing: function () { this.tone(220, 0, 0.35, 'sine', 0.2, 520); },
    soft: function () { this.tone(392, 0, 0.18, 'sine', 0.14, 330); this.tone(330, 0.16, 0.22, 'sine', 0.12, 294); },
    whoosh: function () { this.noise(0, 0.35, 0.18, 300, 3000); },
    correct: function () {
      var self = this;
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { self.tone(f, i * 0.08, 0.25, 'triangle', 0.18); });
    },
    cheer: function () {
      var self = this;
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) { self.tone(f, i * 0.07, 0.3, 'triangle', 0.16); });
      [1568, 2093, 2637].forEach(function (f, i) { self.tone(f, 0.4 + i * 0.06, 0.2, 'sine', 0.08); });
    },
    sparkle: function () {
      var self = this;
      [1318.5, 1760, 2093, 2637, 3136].forEach(function (f, i) { self.tone(f, i * 0.05, 0.15, 'sine', 0.07); });
    },
    drumroll: function () {
      for (var i = 0; i < 12; i++) this.noise(i * 0.06, 0.05, 0.12, 180, 120);
    },
    tada: function () {
      var self = this;
      self.tone(523.25, 0, 0.15, 'square', 0.08);
      [659.25, 783.99, 1046.5].forEach(function (f) { self.tone(f, 0.16, 0.6, 'triangle', 0.13); });
      self.sparkle();
    }
  };

  root.WB_AUDIO = { unlock: unlock, audioCtx: audioCtx, Speech: Speech, Sfx: Sfx };
})(this);
