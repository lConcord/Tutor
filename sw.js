/*
 * Student app service worker: makes the tutor installable and usable offline.
 * It never touches the backend (/api) or the admin app (/admin) — those always
 * go straight to the network so nothing private is ever cached.
 */
const CACHE = 'concord-tutor-v2';
const SHELL = [
  'index.html', 'student.html', 'profile.html', 'upload.html', 'questions.html', 'quiz.html',
  'results.html', 'progress.html', 'about.html',
  'styles.css', 'app.js', 'config.js', 'tracker.js', 'pwa.js', 'globe.js',
  'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('concord-tutor-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                                   // tracker POSTs etc. pass through
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                    // CDN libraries etc.
  if (/^\/(api|admin|backend)(\/|$)/.test(url.pathname)) return;      // never cache backend / admin

  // Pages: network first (so updates show up), cached copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() =>
        caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))
      )
    );
    return;
  }

  // Everything else (css, js, icons): cached copy first, refreshed in the background.
  event.respondWith(
    caches.match(req).then(hit => {
      const refresh = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => hit);
      return hit || refresh;
    })
  );
});
