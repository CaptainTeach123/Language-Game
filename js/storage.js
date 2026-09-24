/*
 * Word Buddies: saving progress on the device.
 *   - Progress and settings: localStorage (small JSON).
 *   - Grown-up photos and voice recordings: IndexedDB, stored as
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
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('no indexedDB')); return; }
      var req = root.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode);
        var result;
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
        var store = t.objectStore(STORE);
        var req = fn(store);
        if (req) req.onsuccess = function () { result = req.result; };
      });
    });
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
