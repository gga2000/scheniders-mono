"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

/**
 * Global Error Page
 * 
 * This Next.js error page catches all unhandled errors in the app
 * and displays a user-friendly error message with recovery options.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to console
        console.error("Global error caught:", error);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6">
            <div className="max-w-md w-full bg-[var(--card-bg)] rounded-2xl shadow-xl border border-[var(--card-border)] p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-rose-100 dark:bg-rose-900/20 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-rose-600" />
                </div>

                <h2 className="text-xl font-bold text-foreground mb-2">
                    Something went wrong
                </h2>

                <p className="text-muted mb-6">
                    An unexpected error occurred. Please try again or return to the orders page.
                </p>

                {process.env.NODE_ENV === "development" && (
                    <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/10 rounded-xl text-left overflow-auto max-h-32">
                        <p className="text-sm font-mono text-rose-700 dark:text-rose-400 break-all">
                            {error.message}
                        </p>
                        {error.digest && (
                            <p className="text-xs text-rose-500 mt-2">
                                Error ID: {error.digest}
                            </p>
                        )}
                    </div>
                )}

                <div className="flex gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="flex items-center gap-2 px-4 py-3 bg-[var(--foreground)] text-white rounded-xl font-medium hover:opacity-90 transition-all"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Try Again
                    </button>

                    <a
                        href="/orders"
                        className="flex items-center gap-2 px-4 py-3 bg-[var(--card-border)] text-foreground rounded-xl font-medium hover:bg-[var(--background)] transition-all"
                    >
                        <Home className="w-4 h-4" />
                        Go to Orders
                    </a>
                </div>
            </div>
        </div>
    );
}
