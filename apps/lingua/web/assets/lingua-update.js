/* Lingua web/phone app: service-worker registration + "Update available" prompt.
 *
 * A new deploy installs a new service worker in the background. Instead of
 * swapping silently, Lingua shows a small bar: "A new version of Lingua is
 * ready · Update". Tapping Update activates it and reloads once.
 * Also checks for a new version every 30 minutes and when the app comes back
 * to the foreground (phones keep PWAs open for days).
 */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  var reloading = false;
  var hadController = !!navigator.serviceWorker.controller;

  function injectStyle() {
    if (document.getElementById('lingua-update-style')) return;
    var css = document.createElement('style');
    css.id = 'lingua-update-style';
    css.textContent =
      '.lu-bar{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);' +
      'z-index:9999;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);' +
      'padding:10px 10px 10px 16px;border-radius:14px;background:#0f2a3d;color:#f3f7fb;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.35);font:14px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;' +
      'animation:lu-in .25s ease-out}' +
      '.lu-bar[hidden]{display:none!important}' +
      '.lu-bar b{font-weight:600}' +
      '.lu-go{border:0;border-radius:10px;padding:8px 14px;background:#7dd3fc;color:#04202e;font-weight:600;cursor:pointer}' +
      '.lu-x{border:0;background:transparent;color:#8ba0b6;font-size:18px;cursor:pointer;padding:4px 6px}' +
      '@keyframes lu-in{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}' +
      '[data-theme="light"] .lu-bar{background:#e0f2fe;color:#1e293b}' +
      '[data-theme="light"] .lu-go{background:#0284c7;color:#fff}';
    document.head.appendChild(css);
  }

  function showBar(worker) {
    injectStyle();
    var bar = document.getElementById('lingua-update-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'lingua-update-bar';
      bar.className = 'lu-bar';
      bar.setAttribute('role', 'status');
      bar.innerHTML =
        '<span>\u2728 <b>A new version of Lingua is ready</b></span>' +
        '<button type="button" class="lu-go" id="lingua-update-go">Update</button>' +
        '<button type="button" class="lu-x" id="lingua-update-later" aria-label="Later">\u00d7</button>';
      document.body.appendChild(bar);
      document.getElementById('lingua-update-later').addEventListener('click', function () {
        bar.hidden = true;
      });
    }
    document.getElementById('lingua-update-go').onclick = function () {
      this.disabled = true;
      this.textContent = 'Updating\u2026';
      worker.postMessage({ type: 'SKIP_WAITING' });
    };
    bar.hidden = false;
    window.__linguaUpdateReady = true;
  }

  function watch(reg) {
    if (reg.waiting && navigator.serviceWorker.controller) {
      showBar(reg.waiting);
    }
    reg.addEventListener('updatefound', function () {
      var nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', function () {
        // Only prompt when replacing an existing version (not on first install).
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          showBar(nw);
        }
      });
    });
    setInterval(function () { reg.update().catch(function () {}); }, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') reg.update().catch(function () {});
    });
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').then(watch).catch(function () { /* offline-only */ });
  });
})();
