/*
 * Word Buddies: everything that makes sound.
 *   Speech  - text-to-speech plus grown-up voice recordings, played in order
 *   Sfx     - cheerful sound effects made with Web Audio (no sound files)
 *   Mic     - microphone loudness for the "voice balloon" (nothing is saved)
 *   Rec     - record a grown-up saying a word
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
    if (root.speechSynthesis) {
      // A silent utterance inside the tap lets later speech play on iOS.
      var u = new root.SpeechSynthesisUtterance(' ');
      u.volume = 0;
      root.speechSynthesis.speak(u);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Speech                                                              */
  /* ------------------------------------------------------------------ */

  var NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;

  function voiceScore(v) {
    var s = 0;
    var lang = (v.lang || '').replace('_', '-').toLowerCase();
    if (lang.indexOf('en') !== 0) return -1;
    if (lang === 'en-us') s += 10; else s += 5;
    if (NOVELTY.test(v.name)) s -= 40;
    if (/premium|enhanced|natural|neural/i.test(v.name)) s += 40;
    if (/samantha|ava|allison|susan|nicky|zoe|karen|moira|tessa|serena|joelle|evan|nathan/i.test(v.name)) s += 20;
    if (/google us english/i.test(v.name)) s += 15;
    if (/aria|jenny|michelle|ana/i.test(v.name) && /microsoft/i.test(v.name)) s += 25;
    if (v.localService) s += 2;
    return s;
  }

  var Speech = {
    rate: 0.8,
    pitch: 1.1,
    voiceURI: '',
    voice: null,
    onTalk: null,
    token: 0,
    buffers: {},
    source: null,
    alive: [],

    supported: function () { return !!root.speechSynthesis; },

    voices: function () {
      if (!root.speechSynthesis) return [];
      return root.speechSynthesis.getVoices()
        .filter(function (v) { return voiceScore(v) >= 0; })
        .sort(function (a, b) { return voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name); });
    },

    pickVoice: function () {
      var list = this.voices();
      var chosen = null;
      var uri = this.voiceURI;
      if (uri) list.forEach(function (v) { if (v.voiceURI === uri) chosen = v; });
      this.voice = chosen || list[0] || null;
      return this.voice;
    },

    init: function () {
      var self = this;
      if (!root.speechSynthesis) return;
      self.pickVoice();
      if ('onvoiceschanged' in root.speechSynthesis) {
        root.speechSynthesis.onvoiceschanged = function () { self.pickVoice(); };
      }
    },

    talk: function (on) {
      if (this.onTalk) this.onTalk(on);
    },

    stop: function () {
      this.token += 1;
      var ss = root.speechSynthesis;
      // Only cancel when needed: cancel() right before speak() can drop speech on some browsers.
      if (ss && (ss.speaking || ss.pending)) ss.cancel();
      if (this.source) { try { this.source.stop(); } catch (e) { /* ignore */ } this.source = null; }
      this.talk(false);
    },

    speakText: function (text, opts) {
      var self = this;
      opts = opts || {};
      return new Promise(function (resolve) {
        if (!root.speechSynthesis || !text) { resolve(); return; }
        if (!self.voice) self.pickVoice();
        var u = new root.SpeechSynthesisUtterance(text);
        if (self.voice) { u.voice = self.voice; u.lang = self.voice.lang; } else u.lang = 'en-US';
        u.rate = Math.max(0.5, Math.min(1.3, (opts.rate || 1) * self.rate));
        u.pitch = opts.pitch || self.pitch;
        var done = false;
        var finish = function () {
          if (done) return;
          done = true;
          clearTimeout(timer);
          self.alive = self.alive.filter(function (x) { return x !== u; });
          self.talk(false);
          resolve();
        };
        // Some browsers never fire onend; don't let the game get stuck.
        var timer = setTimeout(finish, 1800 + text.length * 120 / u.rate);
        u.onstart = function () { self.talk(true); };
        u.onend = finish;
        u.onerror = finish;
        self.alive.push(u); // keep a reference so it isn't garbage collected mid-sentence
        root.speechSynthesis.speak(u);
      });
    },

    loadRecording: function (id) {
      var self = this;
      if (self.buffers[id]) return Promise.resolve(self.buffers[id]);
      var c = audioCtx();
      if (!c || !root.WB_STORE) return Promise.resolve(null);
      return root.WB_STORE.getMedia('rec:' + id).then(function (rec) {
        if (!rec) return null;
        return new Promise(function (resolve) {
          c.decodeAudioData(rec.data.slice(0), function (buf) {
            self.buffers[id] = buf;
            resolve(buf);
          }, function () { resolve(null); });
        });
      });
    },

    forgetRecording: function (id) { delete this.buffers[id]; },

    playBuffer: function (buf) {
      var self = this;
      var c = audioCtx();
      return new Promise(function (resolve) {
        if (!c || !buf) { resolve(); return; }
        if (c.state !== 'running') c.resume();
        var s = c.createBufferSource();
        var g = c.createGain();
        g.gain.value = 1.4;
        s.buffer = buf;
        s.connect(g);
        g.connect(c.destination);
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
        setTimeout(end, buf.duration * 1000 + 400);
        s.start(0);
      });
    },

    /*
     * Say a list of parts in order. A part is:
     *   'text'                          spoken with text-to-speech
     *   { text, rate }                  spoken slower/faster
     *   { word: id, text, useRec }      a grown-up recording if there is one, else text
     *   { pause: ms }
     *   { run: fn }                     call fn right now (to sync an animation)
     * Returns a promise that resolves when done (or when stop() is called).
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
        if (typeof p === 'string') step = self.speakText(p);
        else if (p.run) { p.run(); step = Promise.resolve(); }
        else if (p.pause) step = new Promise(function (r) { setTimeout(r, p.pause); });
        else if (p.word && p.useRec) {
          step = self.loadRecording(p.word).then(function (buf) {
            if (my !== self.token) return null;
            return buf ? self.playBuffer(buf) : self.speakText(p.text, p);
          });
        } else step = self.speakText(p.text, p);
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

  /* ------------------------------------------------------------------ */
  /* Microphone loudness (voice balloon)                                 */
  /* ------------------------------------------------------------------ */

  var Mic = {
    stream: null,
    analyser: null,
    data: null,

    supported: function () {
      return !!(root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia && audioCtx());
    },

    start: function () {
      var self = this;
      if (self.stream) return Promise.resolve(true);
      if (!self.supported()) return Promise.resolve(false);
      setSession('play-and-record');
      return root.navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      }).then(function (stream) {
        var c = audioCtx();
        if (c.state !== 'running') c.resume();
        self.stream = stream;
        var src = c.createMediaStreamSource(stream);
        self.analyser = c.createAnalyser();
        self.analyser.fftSize = 1024;
        self.data = new Uint8Array(self.analyser.fftSize);
        src.connect(self.analyser);
        return true;
      }).catch(function () {
        setSession('playback');
        return false;
      });
    },

    // 0 (quiet) .. 1 (loud)
    level: function () {
      if (!this.analyser) return 0;
      this.analyser.getByteTimeDomainData(this.data);
      var sum = 0;
      for (var i = 0; i < this.data.length; i++) {
        var v = (this.data[i] - 128) / 128;
        sum += v * v;
      }
      var rms = Math.sqrt(sum / this.data.length);
      return Math.min(1, rms * 6);
    },

    stop: function () {
      if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
      this.stream = null;
      this.analyser = null;
      setSession('playback');
    }
  };

  /* ------------------------------------------------------------------ */
  /* Record a grown-up's voice                                           */
  /* ------------------------------------------------------------------ */

  var Rec = {
    recorder: null,
    stream: null,

    supported: function () {
      return !!(root.MediaRecorder && root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia);
    },

    mimeType: function () {
      var types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      for (var i = 0; i < types.length; i++) {
        if (root.MediaRecorder.isTypeSupported && root.MediaRecorder.isTypeSupported(types[i])) return types[i];
      }
      return '';
    },

    // Resolves with a Blob when recording stops (after maxMs or stop()).
    start: function (maxMs) {
      var self = this;
      setSession('play-and-record');
      return root.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        .then(function (stream) {
          self.stream = stream;
          var type = self.mimeType();
          var rec = type ? new root.MediaRecorder(stream, { mimeType: type }) : new root.MediaRecorder(stream);
          self.recorder = rec;
          var chunks = [];
          return new Promise(function (resolve) {
            rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
            rec.onstop = function () {
              stream.getTracks().forEach(function (t) { t.stop(); });
              self.recorder = null;
              self.stream = null;
              setSession('playback');
              resolve(new Blob(chunks, { type: rec.mimeType || type || 'audio/mp4' }));
            };
            rec.start();
            setTimeout(function () { if (rec.state === 'recording') rec.stop(); }, maxMs || 3000);
          });
        });
    },

    stop: function () {
      if (this.recorder && this.recorder.state === 'recording') this.recorder.stop();
    }
  };

  root.WB_AUDIO = { unlock: unlock, audioCtx: audioCtx, Speech: Speech, Sfx: Sfx, Mic: Mic, Rec: Rec };
})(this);
