"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactNode } from "react";
import { queryClient, persister } from "@/lib/query-client";

export function QueryProvider({ children }: { children: ReactNode }) {
    console.log("QueryProvider: Initializing with persistence");
    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister }}
        >
            {children}
            {/* DevTools could be added here if needed */}
        </PersistQueryClientProvider>
    );
}
