import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { leaveIfSignedOut } from "./admin-fetch";
import { shouldRetryLoad } from "./load-failure";

/**
 * Global Query Client configuration for Admin Console.
 *
 * Mirrors the platform config: 30s staleTime, 10min gcTime, 2 retries. A read
 * the server refuses (signed out, role not allowed, nothing there) is not
 * asked again: its answer cannot change. Any failure on a browser that no
 * longer holds a session takes the page to the login page (leaveIfSignedOut).
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: () => void leaveIfSignedOut() }),
  mutationCache: new MutationCache({ onError: () => void leaveIfSignedOut() }),
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 10, // 10 minutes (garbage collection time)
      staleTime: 1000 * 30, // 30 seconds (data considered fresh)
      retry: shouldRetryLoad,
    },
  },
});
