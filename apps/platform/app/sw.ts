/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { installSerwist } from "@serwist/sw";

declare const self: ServiceWorkerGlobalScope & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __SW_MANIFEST: any;
};

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
            handler: "NetworkOnly" as const,
        },
        // Also exclude our own API routes from caching
        {
            urlPattern: /\/api\//,
            handler: "NetworkOnly" as const,
        },
        ...defaultCache,
    ],
});
