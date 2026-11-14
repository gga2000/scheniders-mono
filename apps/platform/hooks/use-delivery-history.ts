import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/hooks/use-toast";
import type { DeliveryImport } from "@/types/delivery-import";
import { authedFetch } from "@/lib/authed-fetch";

export function useDeliveryHistory() {
    const { session } = useAuth();
    const { toast } = useToast();

    const [imports, setImports] = useState<DeliveryImport[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchImports = useCallback(async () => {
        if (!session?.access_token) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await authedFetch("/api/delivery-import/history");

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || "Failed to fetch import history");
            }

            setImports(result.data);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to fetch history";
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    }, [session]);

    useEffect(() => {
        fetchImports();
    }, [fetchImports]);

    const completeImport = useCallback(
        async (importId: string, actualAmountReceived: number) => {
            if (!session?.access_token) return;

            try {
                const response = await authedFetch("/api/delivery-import/complete", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ importId, actualAmountReceived }),
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.error || "Failed to complete import");
                }

                toast({
                    variant: "success",
                    title: "Import Completed",
                    description: `${result.data.updatedCount} orders marked as completed`,
                });

                await fetchImports();
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Failed to complete import";
                toast({
                    variant: "error",
                    title: "Error",
                    description: msg,
                });
            }
        },
        [session, toast, fetchImports]
    );

    const rollbackImport = useCallback(
        async (importId: string) => {
            if (!session?.access_token) return;

            try {
                const response = await authedFetch("/api/delivery-import/rollback", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ importId }),
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.error || "Failed to roll back import");
                }

                toast({
                    variant: "success",
                    title: "Import undone",
                    description: `${result.data.restored} orders restored${result.data.changedSince > 0 ? `, ${result.data.changedSince} left as they are (changed after the import)` : ""}`,
                });

                await fetchImports();
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Failed to roll back import";
                toast({
                    variant: "error",
                    title: "Undo failed",
                    description: msg,
                });
            }
        },
        [session, toast, fetchImports]
    );

    return {
        imports,
        isLoading,
        error,
        fetchImports,
        completeImport,
        rollbackImport,
    };
}
