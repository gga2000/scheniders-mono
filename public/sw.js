// Schenider OMS Service Worker
// Provides offline support and caching

const CACHE_NAME = 'schenider-oms-v1';
const STATIC_CACHE = 'schenider-static-v1';
const DYNAMIC_CACHE = 'schenider-dynamic-v1';

// Assets to cache immediately on install
const STATIC_ASSETS = [
    '/',
    '/offline',
    '/manifest.json',
];

// API routes that should use network-first strategy
const API_ROUTES = [
    '/api/',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Static assets cached');
                return self.skipWaiting();
            })
            .catch((err) => {
                console.error('[SW] Failed to cache static assets:', err);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Service worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip Chrome extension requests
    if (url.protocol === 'chrome-extension:') {
        return;
    }

    // API routes - network first, then cache
    if (API_ROUTES.some(route => url.pathname.startsWith(route))) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Static assets - cache first
    if (isStaticAsset(url.pathname)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Navigation requests - network first with offline fallback
    if (request.mode === 'navigate') {
        event.respondWith(navigationHandler(request));
        return;
    }

    // Default - stale while revalidate
    event.respondWith(staleWhileRevalidate(request));
});

// Cache first strategy
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        console.error('[SW] Cache first failed:', err);
        throw err;
    }
}

// Network first strategy
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        console.log('[SW] Network failed, trying cache:', request.url);
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        throw err;
    }
}

// Stale while revalidate strategy
async function staleWhileRevalidate(request) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cached = await cache.match(request);

    const networkPromise = fetch(request)
        .then((response) => {
            if (response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch((err) => {
            console.error('[SW] Network request failed:', err);
            throw err;
        });

    return cached || networkPromise;
}

// Navigation handler with offline fallback
async function navigationHandler(request) {
    try {
        const response = await fetch(request);
        return response;
    } catch (err) {
        console.log('[SW] Navigation failed, serving offline page');
        const cached = await caches.match('/offline');
        if (cached) {
            return cached;
        }
        // Fallback to cached homepage
        return caches.match('/');
    }
}

// Check if request is for a static asset
function isStaticAsset(pathname) {
    const staticExtensions = [
        '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
        '.woff', '.woff2', '.ttf', '.eot', '.webp'
    ];
    return staticExtensions.some(ext => pathname.endsWith(ext));
}

// Push notification event
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');

    let data = {
        title: 'Schenider OMS',
        body: 'لديك إشعار جديد',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        tag: 'default',
        data: { url: '/' }
    };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (err) {
            data.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: data.badge,
            tag: data.tag,
            data: data.data,
            vibrate: [200, 100, 200],
            requireInteraction: true,
            actions: [
                { action: 'view', title: 'عرض' },
                { action: 'dismiss', title: 'تجاهل' }
            ]
        })
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action);
    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // If app is already open, focus it
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.navigate(urlToOpen);
                        return client.focus();
                    }
                }
                // Otherwise open new window
                return clients.openWindow(urlToOpen);
            })
    );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'sync-orders') {
        event.waitUntil(syncOfflineOrders());
    }
});

// Sync offline orders when back online
async function syncOfflineOrders() {
    try {
        // Get pending actions from IndexedDB
        const db = await openDB();
        const pendingActions = await getAllPendingActions(db);

        for (const action of pendingActions) {
            try {
                await fetch(action.url, {
                    method: action.method,
                    headers: action.headers,
                    body: action.body
                });
                await deletePendingAction(db, action.id);
            } catch (err) {
                console.error('[SW] Failed to sync action:', action.id, err);
            }
        }

        console.log('[SW] Synced', pendingActions.length, 'offline actions');
    } catch (err) {
        console.error('[SW] Sync failed:', err);
    }
}

// IndexedDB helpers for offline sync
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('schenider-offline', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pending-actions')) {
                db.createObjectStore('pending-actions', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

function getAllPendingActions(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('pending-actions', 'readonly');
        const store = transaction.objectStore('pending-actions');
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

function deletePendingAction(db, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('pending-actions', 'readwrite');
        const store = transaction.objectStore('pending-actions');
        const request = store.delete(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}
