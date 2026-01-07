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
            gcTime: 1000 * 60 * 60 * 24, // 24 hours (garbage collection time)
            staleTime: 1000 * 60 * 5, // 5 minutes (data considered fresh)
            retry: 1,
            networkMode: "offlineFirst", // If offline, return cache immediately
        },
        mutations: {
            networkMode: "offlineFirst",
        }
    },
});

export const persister = createIDBPersister("scheniders-query-cache");
