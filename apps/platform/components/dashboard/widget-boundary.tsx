"use client";

import { AlertTriangle } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { useLanguage } from "@/hooks/use-language";

/**
 * REL-D2. Widget-sized failure containment for the dashboard.
 *
 * Without this, one widget throwing during render takes the whole page to the
 * root error screen — a merchant loses every number because one chart hit a bad
 * row. The rest of the dashboard is still perfectly good data, so the failure is
 * contained to the card that failed, and that card says so rather than rendering
 * an empty shell that reads like "no data".
 *
 * The generic ErrorBoundary's own fallback is full-screen (reload / go home),
 * which is wrong inside a grid cell, so this passes a compact one and a label so
 * the Sentry report names the widget.
 */
export function WidgetBoundary({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <ErrorBoundary label={label} fallback={<WidgetErrorCard label={label} />}>
            {children}
        </ErrorBoundary>
    );
}

function WidgetErrorCard({ label }: { label: string }) {
    const { t } = useLanguage();
    return (
        <div className="pastel-card p-5 h-full flex flex-col items-center justify-center gap-2 text-center">
            <AlertTriangle className="w-6 h-6 text-rose-500/70" />
            <p className="text-sm font-semibold text-foreground">{t("dashboard.widget.failed")}</p>
            <p className="text-xs text-muted">{t("dashboard.widget.failedDetail")}</p>
            <p className="text-[10px] text-muted/60 font-mono">{label}</p>
        </div>
    );
}
