"use client";

import { useState } from "react";
import { Download, Printer, RefreshCw, Truck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { useLanguage } from "@/hooks/use-language";

interface DispatchActionBarProps {
    selectedCount: number;
    pdfLoading: boolean;
    shipping: boolean;
    onPdf: () => void;
    onPrint: () => void;
    onHandToPrime: () => void;
}

/**
 * The run's actions, pinned under the queue: the label PDF first (what the team
 * prints from), a direct print, and the Prime hand-off, which asks once because
 * it moves the orders out of the desk.
 */
export function DispatchActionBar({ selectedCount, pdfLoading, shipping, onPdf, onPrint, onHandToPrime }: DispatchActionBarProps) {
    const { t } = useLanguage();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const none = selectedCount === 0;

    return (
        <div className="sticky bottom-4 z-30 flex items-center gap-2 rounded-2xl bg-[var(--ink)] px-3 py-2.5 text-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.45)]">
            <span className="px-2 text-sm font-semibold">{t("printing.selectedCount", { count: selectedCount })}</span>
            <span className="flex-1" />
            <button
                type="button"
                onClick={onPrint}
                disabled={none}
                title={t("printing.printDirect")}
                aria-label={t("printing.printDirect")}
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/25 hover:bg-white/10 disabled:opacity-40"
            >
                <Printer className="h-4 w-4" />
            </button>
            <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        disabled={none || shipping}
                        className="flex h-10 items-center gap-2 rounded-xl border border-white/25 px-4 text-sm font-semibold hover:bg-white/10 disabled:opacity-40"
                    >
                        {shipping ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                        {t("printing.handToPrime")}
                    </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" sideOffset={10} className="w-[360px] rounded-2xl border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-xl">
                    <p className="font-semibold text-foreground">{t("printing.handOffTitle", { count: selectedCount })}</p>
                    <ol className="mt-2 list-decimal space-y-1.5 ps-5 text-sm text-muted">
                        <li>{t("printing.handOffFile")}</li>
                        <li>{t("printing.handOffTransit")}</li>
                        <li>{t("printing.handOffSaved")}</li>
                    </ol>
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setConfirmOpen(false);
                                onHandToPrime();
                            }}
                            className="h-10 rounded-xl bg-[var(--ink)] px-4 text-sm font-semibold text-white"
                        >
                            {t("printing.handOffConfirm")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmOpen(false)}
                            className="h-10 rounded-xl border border-[var(--card-border)] px-4 text-sm font-medium text-foreground"
                        >
                            {t("common.cancel")}
                        </button>
                    </div>
                </PopoverContent>
            </Popover>
            <button
                type="button"
                onClick={onPdf}
                disabled={none || pdfLoading}
                className="flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[var(--ink)] disabled:opacity-60"
            >
                {pdfLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {pdfLoading ? t("printing.generating") : t("printing.downloadPdf", { count: selectedCount })}
            </button>
        </div>
    );
}
