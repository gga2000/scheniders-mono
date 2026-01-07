// SELF-DESTRUCTING SERVICE WORKER
// This script replaces the existing Serwist service worker.
// It immediately unregisters itself and reloads the page to clear the cache.

self.addEventListener('install', function (e) {
    self.skipWaiting();
});

self.addEventListener('activate', function (e) {
    self.registration.unregister()
        .then(function () {
            return self.clients.matchAll();
        })
        .then(function (clients) {
            clients.forEach(client => client.navigate(client.url));
        });
});
