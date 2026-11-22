/* Makes the student app installable ("Add to Home screen" / "Install app"). */
(function () {
  'use strict';
  try {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }

    var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (standalone) return;

    var deferred = null, btn = null;
    function show() {
      if (btn || !deferred) return;
      btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '⬇ Install app';
      btn.setAttribute('aria-label', 'Install Concord Tutor as an app');
      btn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:50;padding:11px 16px;border:0;border-radius:999px;' +
        'font:700 .9rem system-ui,sans-serif;color:#fff;cursor:pointer;background:linear-gradient(135deg,#7c5cff,#21d4fd);' +
        'box-shadow:0 10px 30px rgba(0,0,0,.35)';
      btn.onclick = function () {
        var p = deferred; deferred = null;
        btn.remove(); btn = null;
        p.prompt();
      };
      document.body.appendChild(btn);
    }
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
    });
    window.addEventListener('appinstalled', function () { deferred = null; if (btn) { btn.remove(); btn = null; } });
  } catch (e) { /* never break the app */ }
})();
