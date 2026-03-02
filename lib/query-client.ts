import { QueryClient } from "@tanstack/react-query";
import { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { get, set, del } from "idb-keyval";

/**
 * Creates an IDB persister for React Query
 */
export function createIDBPersister(idbValidKey: IDBValidKey = "reactQuery"): Persister {
    return {
        persistClient: async (client: PersistedClient) => {
            await set(idbValidKey, client);
        },
        restoreClient: async () => {
            return await get<PersistedClient>(idbValidKey);
        },
        removeClient: async () => {
            await del(idbValidKey);
        },
    };
}

/**
 * Global Query Client configuration
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            gcTime: 1000 * 60 * 60, // 1 hour (garbage collection time)
            staleTime: 1000 * 60, // 1 minute (data considered fresh)
            retry: 1,
            // networkMode: "online" is the default — fetches from network,
            // falls back to cache only when offline.
            // "offlineFirst" was causing stale IndexedDB data to be served
            // without ever hitting the network.
        },
    },
});

export const persister = createIDBPersister("scheniders-query-cache");
