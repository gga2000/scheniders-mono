"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

/**
 * Loading and failure states for a dashboard widget whose data is still on its
 * way from the server, or did not arrive.
 *
 * A widget never substitutes a number of its own while it waits (ORD-2): it shows
 * a placeholder, and on failure it says so and offers a retry. An empty chart or a
 * zero would read as "nothing happened", which is a different and false statement.
 */
export function WidgetPending({ className = "h-full min-h-[200px]" }: { className?: string }) {
    return <div className={`${className} bg-[var(--card-bg)] rounded-3xl animate-pulse`} aria-busy="true" />;
}

export function WidgetLoadError({ onRetry, className = "h-full" }: { onRetry: () => void; className?: string }) {
    const { t } = useLanguage();
    return (
        <div className={`pastel-card p-5 ${className} flex flex-col items-center justify-center gap-2 text-center`} role="alert">
            <AlertTriangle className="w-6 h-6 text-rose-500/70" />
            <p className="text-sm font-semibold text-foreground">{t("dashboard.widget.failed")}</p>
            <p className="text-xs text-muted">{t("dashboard.loadError.detail")}</p>
            <button
                type="button"
                onClick={onRetry}
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--background)] border border-[var(--card-border)] hover:bg-[var(--card-bg)] transition-colors"
            >
                <RotateCw className="w-3.5 h-3.5" />
                {t("dashboard.retry")}
            </button>
        </div>
    );
}
