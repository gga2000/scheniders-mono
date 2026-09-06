"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reportOrderError } from "@/lib/order-telemetry";

export default function OrdersError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Previously console-only, so a crash on the busiest screen in the product
        // left no trace anyone could act on.
        reportOrderError(error, {
            operation: "orders-segment-render",
            extra: { digest: error.digest },
        });
    }, [error]);

    return (
        <div className="flex h-[60vh] w-full flex-col items-center justify-center p-6 text-center">
            <div className="rounded-full bg-rose-100 p-4 dark:bg-rose-900/20 mb-4">
                <AlertTriangle className="h-8 w-8 text-rose-600" />
            </div>

            <h2 className="mb-2 text-xl font-bold text-foreground">
                Orders Data Error
            </h2>

            <p className="mb-6 max-w-md text-muted">
                We encountered an error loading the orders dashboard. This could be a temporary network issue.
            </p>

            <button
                onClick={reset}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
                <RefreshCw className="h-4 w-4" />
                Try Again
            </button>
        </div>
    );
}
