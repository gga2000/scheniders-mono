"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";

interface QCErrorStateProps {
    error: unknown;
    onRetry: () => void;
}

export function QCErrorState({ error, onRetry }: QCErrorStateProps) {
    const { t } = useLanguage();
    const message = error instanceof Error ? error.message : t("qc.error.fallback");
    return (
        <div className="py-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/10 mb-4">
                <AlertCircle className="w-8 h-8 text-rose-500" />
            </div>
            <h3 className="text-lg font-bold mb-1">{t("qc.error.title")}</h3>
            <p className="text-sm text-muted mb-4 max-w-md mx-auto break-words">{message}</p>
            <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--ink)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition"
            >
                <RefreshCw className="w-4 h-4" />
                {t("qc.error.retry")}
            </button>
        </div>
    );
}
