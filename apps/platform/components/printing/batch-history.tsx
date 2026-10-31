"use client";

import { Eye, Package } from "lucide-react";
import type { PrintBatch } from "@/lib/supabase";
import { formatDate, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface BatchHistoryProps {
    batches: PrintBatch[];
    onOpen: (batch: PrintBatch) => void;
}

/** Every recorded print, PDF and courier export, newest first; open one to reprint it. */
export function BatchHistory({ batches, onOpen }: BatchHistoryProps) {
    const { t } = useLanguage();

    if (batches.length === 0) {
        return (
            <div className="pastel-card p-12 text-center">
                <Package className="mx-auto mb-3 h-10 w-10 text-muted opacity-60" />
                <p className="text-sm text-muted">{t("printing.history_empty")}</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <p className="px-2 text-sm text-muted">{t("printing.history_reprintHint")}</p>
            {batches.map((batch) => (
                <button
                    key={batch.id}
                    onClick={() => onOpen(batch)}
                    className="group flex w-full flex-col items-start justify-between gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 text-start transition-colors hover:border-[var(--pastel-purple)] sm:flex-row sm:items-center sm:gap-3"
                >
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--pastel-purple)]">
                            <Package className="h-5 w-5 text-purple-700" />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{batch.name}</p>
                            <p className="text-xs text-muted">
                                {t("printing.batch_orders").replace("{count}", String(batch.order_count))}
                                {" • "}
                                {formatIQD(batch.total_value)}
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                        {formatDate(batch.created_at)}
                        <Eye className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                </button>
            ))}
        </div>
    );
}
