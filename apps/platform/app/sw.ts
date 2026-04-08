/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { installSerwist } from "@serwist/sw";

declare const self: ServiceWorkerGlobalScope & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __SW_MANIFEST: any;
};

console.log("[SW] Serwist SW loaded (v2 — with session check + cache cleanup)");

// Clean up old manual service worker caches on activation.
// A previous SW used "schenider-v1" and "schenider-dynamic-v1" caches
// which may still be serving stale assets.
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key.startsWith("schenider-"))
                    .map((key) => {
                        console.log(`[SW] Deleting old cache: ${key}`);
                        return caches.delete(key);
                    })
            )
        )
    );
});

installSerwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: [
        // CRITICAL: Ensure Supabase API calls are NEVER cached.
        // These must always go to the network.
        {
            urlPattern: /\.supabase\.co/,
            // @ts-expect-error - Serwist typing compatibility
            handler: "NetworkOnly" as const,
        },
        // Also exclude our own API routes from caching
        {
            urlPattern: /\/api\//,
            // @ts-expect-error - Serwist typing compatibility
            handler: "NetworkOnly" as const,
        },
        ...defaultCache,
    ],
});
