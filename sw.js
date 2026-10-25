// Offline support. Bump VERSION when you rebuild data/bestiary.json or change files so installed copies refresh.
const VERSION = 'dm-toolkit-v3';
const SHELL = [
  './', 'index.html', 'manifest.json', 'css/style.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/main.js', 'js/store.js', 'js/nav.js', 'js/ui.js', 'js/theme.js', 'js/calc.js', 'js/data.js', 'js/fmt.js',
  'js/creatures.js', 'js/updater.js', 'js/hp.js', 'js/addpopup.js',
  'js/pages/bestiary.js', 'js/pages/encounters.js', 'js/pages/initiative.js', 'js/pages/players.js', 'js/pages/settings.js',
];
const DATA = 'data/bestiary.json';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).then(() => c.add(DATA).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isData = req.url.includes('/data/');
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    // data: cache first (big file). shell: serve cache but refresh in the background.
    const net = fetch(req).then(r => { if (r && r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; });
    if (hit) { if (!isData) net.catch(() => {}); return hit; }
    return net.catch(() => caches.match('index.html'));
  }));
});
