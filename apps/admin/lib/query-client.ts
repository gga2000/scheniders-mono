import { isServer, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { leaveIfSignedOut } from "./admin-fetch";
import { shouldRetryLoad } from "./load-failure";

/**
 * Query Client configuration for the Admin Console.
 *
 * Mirrors the platform config: 30s staleTime, 10min gcTime, 2 retries. A read
 * the server refuses (signed out, role not allowed, nothing there) is not
 * asked again: its answer cannot change. Any failure on a browser that no
 * longer holds a session takes the page to the login page (leaveIfSignedOut);
 * a server render holds no session and has no page to leave, so its client
 * never does.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: isServer ? undefined : new QueryCache({ onError: () => void leaveIfSignedOut() }),
    mutationCache: isServer ? undefined : new MutationCache({ onError: () => void leaveIfSignedOut() }),
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 10, // 10 minutes (garbage collection time)
        staleTime: 1000 * 30, // 30 seconds (data considered fresh)
        retry: shouldRetryLoad,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * One client for the browser's whole visit. Each server render gets its own,
 * so nothing one request put in the cache is kept for the next.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
