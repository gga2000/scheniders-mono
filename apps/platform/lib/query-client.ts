import { isServer, QueryClient } from "@tanstack/react-query";

/**
 * Global Query Client configuration
 *
 * NOTE: IndexedDB persistence (PersistQueryClientProvider + idb-keyval) was
 * removed because it served stale cached data with old `updated_at` timestamps,
 * causing the conflict-detection layer to reject legitimate writes as "conflicts".
 * This was the primary root cause of mutations not persisting to Supabase.
 */
function makeQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                gcTime: 1000 * 60 * 10, // 10 minutes (garbage collection time)
                staleTime: 1000 * 30, // 30 seconds (data considered fresh)
                retry: 2,
            },
        },
    });
}

let browserQueryClient: QueryClient | undefined;

/**
 * One client for the browser's whole visit. Each server render gets its own,
 * so nothing one request put in the cache can reach another (another shop's
 * request on the same server).
 */
export function getQueryClient(): QueryClient {
    if (isServer) return makeQueryClient();
    browserQueryClient ??= makeQueryClient();
    return browserQueryClient;
}
