// Service Worker — App Shell & Dynamic Caching
//
// v2 change: do NOT precache the bare "/" HTML shell anymore. The shell embeds
// references to content-hashed /_next/static chunks; precaching a fixed copy of
// it strands those references after a deploy (the cached shell points at chunk
// hashes that no longer exist), forcing a full re-bootstrap. Navigation is
// NetworkFirst, so the freshest shell (with current chunk hashes) is always
// fetched when online; offline falls back to the last good navigation or /offline.
//
// Bumping the cache name makes the activate handler purge the old caches on the
// next deploy, giving every client a clean slate once. v3: the app icons
// (favicon + /icons/icon-*.png) changed; those PNGs are served Cache-First, so
// the bump is required to evict the stale v2-cached copies.
const CACHE_NAME = 'schenider-v3';
const DYNAMIC_CACHE = 'schenider-dynamic-v3';

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

// ─────────────────────────────────────────────────────────────────────────────
// Web Push — receive a push notification from the server and show it.
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
    if (!event.data) return;
    let payload;
    try {
        payload = event.data.json();
    } catch {
        return;
    }
    const title = payload.title || 'New message';
    const options = {
        body: payload.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: payload.tag || undefined,
        // Buttons let someone act without opening the app first. Chrome shows at
        // most two; anything beyond that is silently dropped, so the sender only
        // ever supplies two.
        actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : undefined,
        requireInteraction: payload.priority === 'urgent',
        data: {
            conversationId: payload.conversationId || null,
            url: payload.url || null,
            notificationId: payload.notificationId || null,
        },
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

// ─────────────────────────────────────────────────────────────────────────────
// notificationclick — focus an existing app tab or open a new one, then hand
// off the conversationId to the app via postMessage.
// ─────────────────────────────────────────────────────────────────────────────

// Where each action button leads. Unlisted actions fall back to the
// notification's own url, so adding a button never breaks an old client.
const ACTION_ROUTES = {
    confirm: '/orders?focus=confirm',
};

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const data = event.notification.data || {};
    const conversationId = data.conversationId;
    // An action button can send the viewer somewhere other than the default
    // target — "Top up" belongs on billing, not on the orders list.
    const action = event.action || '';
    const url = action && ACTION_ROUTES[action] ? ACTION_ROUTES[action] : data.url;

    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Focus the first open app window and route it.
                for (const client of clientList) {
                    if (client.url && 'focus' in client) {
                        client.focus();
                        if (conversationId) {
                            client.postMessage({ type: 'open-conversation', conversationId });
                        } else if (action) {
                            client.postMessage({ type: 'notification-action', action, url });
                            if (url && 'navigate' in client) client.navigate(url);
                        } else if (url && 'navigate' in client) {
                            client.navigate(url);
                        }
                        return;
                    }
                }
                // No open tab — open a new one at the right place.
                const target = conversationId
                    ? '/?chat=' + conversationId
                    : (url || '/');
                return self.clients.openWindow(target);
            })
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
