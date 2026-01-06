"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
    // Create a single QueryClient instance that persists across re-renders
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Data is considered fresh for 5 minutes
                        staleTime: 5 * 60 * 1000,
                        // Keep unused data in cache for 30 minutes
                        gcTime: 30 * 60 * 1000,
                        // Retry failed requests up to 2 times
                        retry: 2,
                        // Don't refetch on window focus for less network usage
                        refetchOnWindowFocus: false,
                        // Keep previous data while fetching new data
                        placeholderData: (previousData: unknown) => previousData,
                    },
                    mutations: {
                        // Retry mutations once on failure
                        retry: 1,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
