"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

export default function ProductsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const { t } = useLanguage();

    useEffect(() => {
        Sentry.captureException(error, {
            tags: { area: "products", operation: "products-segment-render" },
            extra: { digest: error.digest },
        });
    }, [error]);

    return (
        <div className="flex h-[60vh] w-full flex-col items-center justify-center p-6 text-center">
            <div className="rounded-full bg-rose-100 p-4 dark:bg-rose-900/20 mb-4">
                <AlertTriangle className="h-8 w-8 text-rose-600" />
            </div>

            <h2 className="mb-2 text-xl font-bold text-foreground">
                {t("products.errorTitle")}
            </h2>

            <p className="mb-6 max-w-md text-muted">
                {t("products.errorBody")}
            </p>

            <button
                onClick={reset}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
                <RefreshCw className="h-4 w-4" />
                {t("products.errorRetry")}
            </button>
        </div>
    );
}
