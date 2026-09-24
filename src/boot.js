// Start-up checks. This is a classic script that runs before three.js and the game module,
// so it still works in the situations where they can't: a page opened from a file, a browser
// without WebGL, or a game script that failed to download.
(function () {
  'use strict';

  var CARDS = ['loadingCard', 'noWebgl', 'fileProtocol', 'loadFailed', 'crashed'];
  var STALL_MS = 10000;

  var lastProgressAt = Date.now();
  var lastFraction = -1;
  /** @type {ReturnType<typeof setInterval> | null} */
  var stallTimer = null;

  /** @param {string} id */
  function byId(id) {
    return document.getElementById(id);
  }

  /** @param {string} id the card to show */
  function show(id) {
    CARDS.forEach(function (card) {
      var el = byId(card);
      if (el) el.hidden = card !== id;
    });
    var screen = byId('loadingScreen');
    if (screen) screen.hidden = false;
    if (id !== 'loadingCard' && stallTimer) {
      clearInterval(stallTimer);
      stallTimer = null;
    }
  }

  function supportsWebGL() {
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!gl;
    } catch {
      return false;
    }
  }

  /** @type {SubstituteBoot} */
  var boot = {
    blocked: false,
    reason: null,
    show: show,
    // fraction: 0..1 of the download; detail: optional status text
    progress: function (fraction, detail) {
      if (boot.blocked) return;
      if (fraction > lastFraction + 0.0005) {
        lastFraction = fraction;
        lastProgressAt = Date.now();
        var slow = byId('loadingSlow');
        if (slow) slow.hidden = true;
      }
      var pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
      var bar = byId('loadBar');
      if (bar) bar.style.width = pct + '%';
      var progress = byId('loadProgress');
      if (progress) progress.setAttribute('aria-valuenow', String(pct));
      if (detail != null) {
        var d = byId('loadingDetail');
        if (d) d.textContent = detail;
      }
    },
    fail: function (err) {
      if (boot.blocked) return;
      boot.blocked = true;
      boot.reason = 'load-failed';
      if (err) console.error('The Substitute failed to load:', err);
      show('loadFailed');
      var retry = byId('retryBtn');
      if (retry) retry.focus();
    },
    // an error while the game was running: stop, say so, and offer a reload
    crash: function (err) {
      if (boot.blocked) return;
      boot.blocked = true;
      boot.reason = 'crashed';
      if (err) console.error('The Substitute stopped after an error:', err);
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      show('crashed');
      var retry = byId('crashRetryBtn');
      if (retry) retry.focus();
    },
    ready: function () {
      if (stallTimer) clearInterval(stallTimer);
      stallTimer = null;
      var screen = byId('loadingScreen');
      if (screen) screen.hidden = true;
    },
  };
  window.SubstituteBoot = boot;

  document.addEventListener('click', function (e) {
    var target = e.target instanceof Element ? e.target.closest('[data-action="reload"]') : null;
    if (target) window.location.reload();
  });

  if (window.location.protocol === 'file:') {
    boot.blocked = true;
    boot.reason = 'file';
    show('fileProtocol');
    return;
  }
  if (!supportsWebGL()) {
    boot.blocked = true;
    boot.reason = 'no-webgl';
    show('noWebgl');
    return;
  }

  show('loadingCard');
  // if the download stops moving for a while, say so and offer a way out
  stallTimer = setInterval(function () {
    if (boot.blocked) return;
    if (Date.now() - lastProgressAt > STALL_MS) {
      var slow = byId('loadingSlow');
      if (slow) slow.hidden = false;
    }
  }, 1000);
})();
