"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactNode } from "react";
import { queryClient, persister } from "@/lib/query-client";

export function QueryProvider({ children }: { children: ReactNode }) {
    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
                persister,
                maxAge: 1000 * 60 * 60, // 1 hour — discard stale IndexedDB data
            }}
        >
            {children}
            {/* DevTools could be added here if needed */}
        </PersistQueryClientProvider>
    );
}
