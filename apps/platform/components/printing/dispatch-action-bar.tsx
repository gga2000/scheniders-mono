"use client";

import { useState } from "react";
import { Download, Eye, FileText, ChevronDown, Printer, RefreshCw, Truck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface DispatchActionBarProps {
    selectedCount: number;
    pdfLoading: boolean;
    onPreview: () => void;
    onPrint: () => void;
    onPdf: () => void;
    onExport: (company: "prime" | "waseet") => void;
    onShip: () => void;
}

/**
 * Actions for the selected orders, pinned to the bottom of the viewport: full
 * width on phones, a floating bar under the queue on desktop. Keeping it next to
 * the list (not beside the page title) stops the header from jumping when the
 * first order is ticked.
 */
export function DispatchActionBar({
    selectedCount,
    pdfLoading,
    onPreview,
    onPrint,
    onPdf,
    onExport,
    onShip,
}: DispatchActionBarProps) {
    const { t } = useLanguage();
    const [exportOpen, setExportOpen] = useState(false);

    if (selectedCount === 0) return null;

    return (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-[var(--card-border)] bg-[var(--card-bg)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:sticky md:inset-x-auto md:bottom-4 md:mx-auto md:w-fit md:max-w-full md:rounded-2xl md:border md:px-4 md:py-3 md:shadow-xl">
            <span className="hidden whitespace-nowrap px-2 text-sm font-semibold text-foreground md:block">
                {t("printing.selectedCount").replace("{count}", String(selectedCount))}
            </span>
            <button
                onClick={onPdf}
                disabled={pdfLoading}
                aria-label={pdfLoading ? t("printing.generating") : t("printing.downloadPdf").replace("{count}", String(selectedCount))}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-white disabled:opacity-60 md:h-10 md:flex-none"
            >
                {pdfLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {pdfLoading ? t("printing.generating") : t("printing.downloadPdf").replace("{count}", String(selectedCount))}
            </button>
            <button
                onClick={onPreview}
                className="hidden h-10 items-center justify-center gap-2 rounded-xl bg-[var(--pastel-blue)] px-4 text-sm font-medium text-blue-900 md:flex"
            >
                <Eye className="h-4 w-4" />
                {t("printing.preview")}
            </button>
            <button
                onClick={onPrint}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--pastel-purple)] px-4 text-sm font-medium text-purple-900 md:h-10"
            >
                <Printer className="h-4 w-4" />
                {t("printing.print")}
            </button>
            <div className="relative hidden md:block">
                <button
                    onClick={() => setExportOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={exportOpen}
                    className="flex h-10 items-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-medium text-white"
                >
                    <FileText className="h-4 w-4" />
                    {t("printing.exportForDelivery")}
                    <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {exportOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                        <div
                            role="menu"
                            className="absolute bottom-full right-0 z-50 mb-2 min-w-[180px] rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] py-1 shadow-lg"
                        >
                            {(["prime", "waseet"] as const).map((company) => (
                                <button
                                    key={company}
                                    role="menuitem"
                                    onClick={() => {
                                        onExport(company);
                                        setExportOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm hover:bg-[var(--background)]"
                                >
                                    <FileText className="h-4 w-4 text-muted" />
                                    {company === "prime" ? t("printing.exportPrime") : t("printing.exportWaseet")}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
            <button
                onClick={onShip}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--pastel-green)] px-4 text-sm font-medium text-emerald-900 md:h-10"
            >
                <Truck className="h-4 w-4" />
                {t("printing.ship")}
            </button>
        </div>
    );
}
