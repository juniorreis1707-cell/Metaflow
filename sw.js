/* MetaFlow — service worker: guarda o app para abrir offline. */
var CACHE = 'metaflow-v4';
var SHELL = [
    'index.html', 'login.html', 'style.css', 'auth.css', 'extras.css',
    'script.js', 'auth.js', 'extras.js', 'manifest.webmanifest', 'favicon.svg',
    'icons/logo.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE).then(function (cache) {
            return Promise.all(SHELL.map(function (url) {
                return cache.add(url).catch(function () { /* ignora arquivo ausente */ });
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
        }).then(function () { return self.clients.claim(); })
    );
});

// Rede primeiro (para você sempre ver a versão mais nova); cache quando offline.
self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) { return; }
    event.respondWith(
        fetch(req).then(function (res) {
            var copy = res.clone();
            caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
            return res;
        }).catch(function () {
            return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); });
        })
    );
});
