"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

/**
 * Route-level error boundary for the store builder (BUG5). The editor renders
 * arbitrary merchant config through ~60 components; without this, a single
 * thrown render white-screens the whole editor. Here we keep the merchant
 * oriented, reassure them their draft is auto-saved (and locally backed up),
 * and offer a one-click reload that re-hydrates from the saved draft.
 */
export default function StoreEditError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Store builder error:", error);
        Sentry.captureException(error, { tags: { area: "store-builder" } });
    }, [error]);

    return (
        <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center p-6 text-center">
            <div className="mb-4 rounded-full bg-rose-100 p-4 dark:bg-rose-900/20">
                <AlertTriangle className="h-8 w-8 text-rose-600" />
            </div>

            <h2 className="mb-2 text-xl font-bold text-foreground">
                The editor hit a snag
            </h2>

            <p className="mb-6 max-w-md text-muted-foreground">
                Your work is safe — your draft is auto-saved. Reload the editor to
                pick up where you left off.
            </p>

            <div className="flex items-center gap-3">
                <button
                    onClick={reset}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <RefreshCw className="h-4 w-4" />
                    Reload editor
                </button>
                <Link
                    href="/store"
                    className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted/40"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to store
                </Link>
            </div>
        </div>
    );
}
