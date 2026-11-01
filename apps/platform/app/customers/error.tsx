"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

export default function CustomersError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const { t } = useLanguage();

    useEffect(() => {
        console.error("Customers segment error:", error);
    }, [error]);

    return (
        <div className="flex h-[60vh] w-full flex-col items-center justify-center p-6 text-center">
            <div className="rounded-full bg-rose-100 p-4 dark:bg-rose-900/20 mb-4">
                <AlertTriangle className="h-8 w-8 text-rose-600" />
            </div>

            <h2 dir="auto" className="mb-2 text-xl font-bold text-foreground">{t("customers.loadFailed")}</h2>

            <p dir="auto" className="mb-6 max-w-md text-muted-foreground">{t("customers.loadFailedHint")}</p>

            <button
                onClick={reset}
                className="flex items-center gap-2 h-11 rounded-xl bg-foreground px-5 font-semibold text-background transition-opacity hover:opacity-90"
            >
                <RefreshCw className="h-4 w-4" />
                {t("customers.profile.retry")}
            </button>
        </div>
    );
}
