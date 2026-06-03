// Service Worker — App Shell & Dynamic Caching
//
// v2 change: do NOT precache the bare "/" HTML shell anymore. The shell embeds
// references to content-hashed /_next/static chunks; precaching a fixed copy of
// it strands those references after a deploy (the cached shell points at chunk
// hashes that no longer exist), forcing a full re-bootstrap. Navigation is
// NetworkFirst, so the freshest shell (with current chunk hashes) is always
// fetched when online; offline falls back to the last good navigation or /offline.
//
// Bumping the cache name to v2 makes the activate handler purge the old v1
// caches on the next deploy, giving every client a clean slate once.
const CACHE_NAME = 'schenider-v2';
const DYNAMIC_CACHE = 'schenider-dynamic-v2';

// Truly-static, version-independent assets safe to precache. NOTE: "/" is
// intentionally excluded (see header) — never precache the HTML shell.
const CORE_ASSETS = [
    '/offline',
    '/manifest.json',
    '/favicon.ico',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            // Resilient precache: don't let one missing asset abort the whole install.
            Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url)))
        )
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    // Delete every cache that isn't the current version (purges v1).
                    if (key !== CACHE_NAME && key !== DYNAMIC_CACHE) {
                        return caches.delete(key);
                    }
                    return undefined;
                })
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin)) return;

    // Supabase / API requests: network only, never cache.
    if (event.request.url.includes('/supabase') || event.request.url.includes('/api/')) {
        return;
    }

    // Content-hashed build assets + media -> Cache First (immutable; the hash
    // changes when content changes, so a stale cache entry is impossible).
    if (event.request.url.includes('/_next/static/') || event.request.url.match(/\.(png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot)$/)) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    if (!response || response.status !== 200 || response.type !== 'basic') return response;
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                    return response;
                });
            })
        );
        return;
    }

    // HTML / page navigations -> Network First (always get the latest shell with
    // current chunk hashes), falling back to the last good page, then /offline.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    return caches.open(DYNAMIC_CACHE).then((cache) => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                })
                .catch(() =>
                    caches.match(event.request).then((cached) => cached || caches.match('/offline'))
                )
        );
        return;
    }
});
