import { QueryClient } from "@tanstack/react-query";
import { shouldRetryLoad } from "./load-failure";

/**
 * Global Query Client configuration for Admin Console.
 *
 * Mirrors the platform config: 30s staleTime, 10min gcTime, 2 retries. A read
 * the server refuses (signed out, role not allowed, nothing there) is not
 * asked again: its answer cannot change.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 10, // 10 minutes (garbage collection time)
      staleTime: 1000 * 30, // 30 seconds (data considered fresh)
      retry: shouldRetryLoad,
    },
  },
});
