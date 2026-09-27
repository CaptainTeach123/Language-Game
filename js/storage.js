/*
 * Word Wizard: saving progress on the device.
 * (The storage names below keep the app's first name, so saved progress carries over.)
 *   - Progress and settings: localStorage (small JSON).
 *   - Grown-up photos: IndexedDB, stored as
 *     ArrayBuffers (most reliable across iOS Safari versions).
 * Nothing ever leaves the device.
 */
(function (root) {
  'use strict';

  var KEY = 'wordbuddies.v1';
  var DB_NAME = 'wordbuddies';
  var STORE = 'media';
  var P = root.WB_PROGRESS;

  function loadState() {
    try {
      var raw = root.localStorage.getItem(KEY);
      return P.normalizeState(raw ? JSON.parse(raw) : null, Date.now());
    } catch (e) {
      return P.createState(Date.now());
    }
  }

  var saveTimer = null;
  function saveState(state, immediate) {
    var write = function () {
      saveTimer = null;
      try { root.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
    };
    if (saveTimer) clearTimeout(saveTimer);
    if (immediate) write();
    else saveTimer = setTimeout(write, 250);
  }

  function clearState() {
    try { root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  // Ask the browser not to evict our data (home-screen apps are already safe on iOS).
  function requestPersist() {
    try {
      if (root.navigator.storage && root.navigator.storage.persist) root.navigator.storage.persist();
    } catch (e) { /* ignore */ }
  }

  var dbPromise = null;
  // Drop a cached connection so the next call opens a fresh one. The browser
  // can close it behind our back (Safari does once the app has sat in the
  // background or under memory pressure), and a newer version of the database
  // opened elsewhere asks us to let go.
  function forget(p) {
    if (dbPromise === p) dbPromise = null;
  }
  function db() {
    if (dbPromise) return dbPromise;
    var p = new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('no indexedDB')); return; }
      var req = root.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () {
        var d = req.result;
        d.onclose = function () { forget(p); };
        d.onversionchange = function () { forget(p); d.close(); };
        resolve(d);
      };
      req.onerror = function () { reject(req.error); };
    });
    dbPromise = p;
    p.catch(function () { forget(p); });
    return p;
  }

  function tx(mode, fn) {
    var attempt = function (retry) {
      var p = db();
      return p.then(function (d) {
        return new Promise(function (resolve, reject) {
          var t;
          try {
            t = d.transaction(STORE, mode);
          } catch (e) {
            // The connection was closed under us (no close event is sent for that): reopen and try once more.
            if (retry && e && e.name === 'InvalidStateError') { forget(p); resolve(attempt(false)); return; }
            reject(e);
            return;
          }
          var result;
          t.oncomplete = function () { resolve(result); };
          t.onerror = function () { reject(t.error); };
          t.onabort = function () { reject(t.error); };
          var store = t.objectStore(STORE);
          var req = fn(store);
          if (req) req.onsuccess = function () { result = req.result; };
        });
      });
    };
    return attempt(true);
  }

  var urlCache = {};

  function putMedia(key, blob) {
    return blob.arrayBuffer().then(function (buf) {
      return tx('readwrite', function (s) { return s.put({ type: blob.type, data: buf }, key); });
    }).then(function () {
      if (urlCache[key]) { URL.revokeObjectURL(urlCache[key]); delete urlCache[key]; }
    });
  }

  function getMedia(key) {
    return tx('readonly', function (s) { return s.get(key); }).then(function (rec) {
      return rec || null;
    }).catch(function () { return null; });
  }

  function getMediaURL(key) {
    if (urlCache[key]) return Promise.resolve(urlCache[key]);
    return getMedia(key).then(function (rec) {
      if (!rec) return null;
      var url = URL.createObjectURL(new Blob([rec.data], { type: rec.type }));
      urlCache[key] = url;
      return url;
    });
  }

  function deleteMedia(key) {
    if (urlCache[key]) { URL.revokeObjectURL(urlCache[key]); delete urlCache[key]; }
    return tx('readwrite', function (s) { return s.delete(key); }).catch(function () { /* ignore */ });
  }

  function clearMedia() {
    Object.keys(urlCache).forEach(function (k) { URL.revokeObjectURL(urlCache[k]); delete urlCache[k]; });
    return tx('readwrite', function (s) { return s.clear(); }).catch(function () { /* ignore */ });
  }

  root.WB_STORE = {
    loadState: loadState,
    saveState: saveState,
    clearState: clearState,
    requestPersist: requestPersist,
    putMedia: putMedia,
    getMedia: getMedia,
    getMediaURL: getMediaURL,
    deleteMedia: deleteMedia,
    clearMedia: clearMedia
  };
})(this);
