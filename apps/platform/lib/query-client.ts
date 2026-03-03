import { QueryClient } from "@tanstack/react-query";

/**
 * Global Query Client configuration
 *
 * NOTE: IndexedDB persistence (PersistQueryClientProvider + idb-keyval) was
 * removed because it served stale cached data with old `updated_at` timestamps,
 * causing the conflict-detection layer to reject legitimate writes as "conflicts".
 * This was the primary root cause of mutations not persisting to Supabase.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            gcTime: 1000 * 60 * 10, // 10 minutes (garbage collection time)
            staleTime: 1000 * 30, // 30 seconds (data considered fresh)
            retry: 2,
        },
    },
});
