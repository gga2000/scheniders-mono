"use client";

import Link from "next/link";
import { FileSpreadsheet, FileText, Download, ChevronRight } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { baghdadDayKey } from "@/lib/order-window";
import { SectionCard } from "../primitives/section-card";
import { cn } from "@/lib/utils";

interface Props {
    period: { start: Date; end: Date };
    /** Undefined while the order book is still loading. */
    onExport?: () => void;
    onPrint?: () => void;
}

/**
 * Both exports are the page header's: they are built from the same Overview
 * numbers, so a downloaded report always matches what is on screen.
 */
export function ReportsTab({ period, onExport, onPrint }: Props) {
    const { t } = useLanguage();

    return (
        <SectionCard
            title={t("finances.reports.title")}
            subtitle={t("finances.reports.sub", { start: baghdadDayKey(period.start), end: baghdadDayKey(period.end) })}
            icon={Download}
            accent="emerald"
        >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ActionTile
                    icon={FileSpreadsheet}
                    label={t("finances.reports.csv")}
                    description={onExport ? t("finances.reports.csvSub") : t("finances.reports.loading")}
                    onClick={onExport}
                    accent="violet"
                />
                <ActionTile
                    icon={FileText}
                    label={t("finances.reports.pdf")}
                    description={onPrint ? t("finances.reports.pdfSub") : t("finances.reports.loading")}
                    onClick={onPrint}
                    accent="emerald"
                />
                <Link
                    href="/finances?tab=expenses"
                    className="group flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3 hover:bg-[var(--background)] hover:border-amber-500/40 transition-all"
                >
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <FileText className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-foreground">{t("finances.reports.expenses")}</div>
                        <div className="text-[11.5px] text-muted truncate">{t("finances.reports.expensesSub")}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted shrink-0" />
                </Link>
            </div>
        </SectionCard>
    );
}

function ActionTile({
    icon: Icon, label, description, onClick, accent,
}: {
    icon: typeof FileText;
    label: string;
    description: string;
    onClick?: () => void;
    accent: "violet" | "emerald";
}) {
    const iconClr = accent === "violet"
        ? "text-violet-600 dark:text-violet-400 bg-violet-500/10"
        : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10";
    return (
        <button
            onClick={onClick}
            disabled={!onClick}
            className="group flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3 text-left hover:bg-[var(--background)] hover:border-violet-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconClr)}>
                <Icon className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-foreground">{label}</div>
                <div className="text-[11.5px] text-muted truncate">{description}</div>
            </div>
            <Download className="w-4 h-4 text-muted group-hover:text-violet-500 shrink-0 transition-colors" />
        </button>
    );
}
