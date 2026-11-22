/*
 * Admin app service worker. It exists so the admin app can be installed, but it
 * deliberately caches NOTHING: the dashboard shows private student data and must
 * always come straight from the server (and require a signed-in admin).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="font-family:system-ui;background:#0b1020;color:#eef3ff;display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
      '<div><h2>You are offline</h2><p style="color:#9aa8c7">The admin dashboard needs a connection to show live student activity.</p></div>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  );
});
