"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { runKind, runOrderStatuses, runProgress, type RunKind } from "@/lib/print-runs";
import { DeskChip } from "@/components/printing/desk-chip";
import { useLanguage } from "@/hooks/use-language";
import type { PrintBatch } from "@/lib/supabase";

interface RunHistoryProps {
    batches: readonly PrintBatch[];
    /** The run whose PDF or file is being made right now. */
    busyId: string | null;
    onPdf: (batch: PrintBatch) => void;
    onPrimeFile: (batch: PrintBatch) => void;
}

const KIND_KEY: Record<RunKind, string> = {
    labels: "printing.runKindLabels",
    prime: "printing.runKindPrime",
    waseet: "printing.runKindWaseet",
};

/** Every saved run: print its labels again or download its Prime file again. Neither moves an order. */
export function RunHistory({ batches, busyId, onPdf, onPrimeFile }: RunHistoryProps) {
    const { t, language } = useLanguage();
    const statuses = useQuery({
        queryKey: ["print-run-statuses", batches.map((b) => b.id)],
        enabled: batches.length > 0,
        queryFn: () => runOrderStatuses(batches),
    });
    const when = new Intl.DateTimeFormat(language === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Baghdad",
    });

    if (batches.length === 0) {
        return (
            <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-10 text-center text-sm text-muted">
                {t("printing.history_empty")}
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
            <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                    <tr className="border-b border-[var(--card-border)] text-start text-xs text-muted">
                        <th className="px-5 py-3 text-start font-medium">{t("printing.historyRun")}</th>
                        <th className="px-5 py-3 text-start font-medium">{t("printing.historyOrders")}</th>
                        <th className="px-5 py-3 text-start font-medium">{t("printing.historyNow")}</th>
                        <th className="px-5 py-3" />
                    </tr>
                </thead>
                <tbody>
                    {batches.map((batch) => {
                        const progress = statuses.data ? runProgress(batch, statuses.data) : null;
                        const known = progress ? progress.delivered + progress.out + progress.back + progress.waiting : 0;
                        const busy = busyId === batch.id;
                        return (
                            <tr key={batch.id} className="border-b border-[var(--card-border)] last:border-b-0">
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-foreground">{when.format(new Date(batch.created_at))}</span>
                                        <DeskChip tone="mute">{t(KIND_KEY[runKind(batch)])}</DeskChip>
                                    </div>
                                </td>
                                <td className="px-5 py-3 font-mono tabular-nums">{batch.order_count}</td>
                                <td className="px-5 py-3">
                                    {progress && known > 0 ? (
                                        <div className="flex flex-col gap-1">
                                            <div className="flex h-1.5 w-40 overflow-hidden rounded-full bg-[var(--background)]">
                                                <span className="bg-emerald-600" style={{ width: `${(progress.delivered / known) * 100}%` }} />
                                                <span className="bg-stone-400" style={{ width: `${(progress.out / known) * 100}%` }} />
                                                <span className="bg-rose-600" style={{ width: `${(progress.back / known) * 100}%` }} />
                                            </div>
                                            <span className="text-xs text-muted">
                                                {t("printing.historyProgress", {
                                                    delivered: progress.delivered,
                                                    out: progress.out,
                                                    back: progress.back,
                                                })}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-muted">—</span>
                                    )}
                                </td>
                                <td className="px-5 py-3">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => onPdf(batch)}
                                            className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3 text-xs font-semibold hover:bg-[var(--background)] disabled:opacity-50"
                                        >
                                            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                            {t("printing.historyPdfAgain")}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => onPrimeFile(batch)}
                                            className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3 text-xs font-semibold hover:bg-[var(--background)] disabled:opacity-50"
                                        >
                                            <FileSpreadsheet className="h-3.5 w-3.5" />
                                            {t("printing.historyPrimeFile")}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
