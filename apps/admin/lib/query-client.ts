import { QueryClient } from "@tanstack/react-query";

/**
 * Global Query Client configuration for Admin Console.
 *
 * Mirrors the platform config: 30s staleTime, 10min gcTime, 2 retries.
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
