// Service Worker for Schneiders Order Management
// Version: 1.0.0

const CACHE_NAME = 'schneiders-v1';
const STATIC_CACHE_NAME = 'schneiders-static-v1';
const DYNAMIC_CACHE_NAME = 'schneiders-dynamic-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/orders',
    '/customers',
    '/analytics',
    '/printing',
    '/offline',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
];

// API routes to cache with network-first strategy
const API_CACHE_ROUTES = [
    '/api/',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                // Don't fail install if some assets fail to cache
                return Promise.allSettled(
                    STATIC_ASSETS.map(url =>
                        cache.add(url).catch(err => console.log('[SW] Failed to cache:', url))
                    )
                );
            })
            .then(() => {
                console.log('[SW] Static assets cached');
                return self.skipWaiting();
            })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== STATIC_CACHE_NAME && name !== DYNAMIC_CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
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

    // Skip external requests
    if (url.origin !== self.location.origin) {
        return;
    }

    // Skip Supabase requests (realtime needs direct connection)
    if (url.hostname.includes('supabase')) {
        return;
    }

    // Skip Next.js development requests
    if (url.pathname.startsWith('/_next/webpack-hmr') ||
        url.pathname.startsWith('/__nextjs') ||
        url.pathname.includes('hot-update')) {
        return;
    }

    // API routes: Network first, fallback to cache
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Static assets (_next/static): Cache first
    if (url.pathname.startsWith('/_next/static/')) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Images: Cache first with network fallback
    if (request.destination === 'image') {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Pages: Stale-while-revalidate
    if (request.destination === 'document' ||
        request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    // Default: Network first
    event.respondWith(networkFirst(request));
});

// Cache-first strategy
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.log('[SW] Cache-first fetch failed:', request.url);
        throw error;
    }
}

// Network-first strategy
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.log('[SW] Network-first falling back to cache:', request.url);
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        // Return offline page for navigation requests
        if (request.destination === 'document') {
            return caches.match('/offline');
        }
        throw error;
    }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request) {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cached = await caches.match(request);

    // Fetch in background
    const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => {
        // Return cached version or offline page
        return cached || caches.match('/offline');
    });

    // Return cached version immediately, or wait for network
    return cached || fetchPromise;
}

// Listen for skip waiting message
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[SW] Service worker script loaded');
