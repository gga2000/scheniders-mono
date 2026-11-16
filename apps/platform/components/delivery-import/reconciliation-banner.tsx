"use client";

import { CheckCircle, AlertTriangle, Wallet, ArrowRight } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { MatchedRow, MatchCategory } from "@/types/delivery-import";

interface ReconciliationBannerProps {
    matches: MatchedRow[];
    selectedRows: Set<number>;
    footerTotal: number;
}

/**
 * Live financial reconciliation (#1) + unselected breakdown (#4).
 * - Verifies the statement's own math: Σ(row net) should equal the PDF footer.
 * - Shows how much of the payout the current selection accounts for.
 * - Breaks down what is NOT selected, by category, so nothing is silently dropped.
 */
export function ReconciliationBanner({ matches, selectedRows, footerTotal }: ReconciliationBannerProps) {
    const { t } = useLanguage();
    const rowsNetSum = matches.reduce((s, m) => s + m.pdfRow.netToMerchant, 0);
    const integrityDiff = rowsNetSum - footerTotal;
    const integrityOk = footerTotal === 0 || integrityDiff === 0;

    const selected = matches.filter((m) => selectedRows.has(m.pdfRow.rowNumber));
    const unselected = matches.filter((m) => !selectedRows.has(m.pdfRow.rowNumber));
    const selectedNet = selected.reduce((s, m) => s + m.pdfRow.netToMerchant, 0);
    const unselectedNet = unselected.reduce((s, m) => s + m.pdfRow.netToMerchant, 0);

    const byCat = new Map<MatchCategory, number>();
    for (const m of unselected) byCat.set(m.category, (byCat.get(m.category) || 0) + 1);
    const chips = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

    return (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 mb-4">
            <div className="flex flex-wrap items-stretch gap-3">
                {/* Statement net + integrity */}
                <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Wallet className="w-4 h-4 text-muted" />
                        <span className="text-xs text-muted">{t("deliveryImport.banner.statementNet")}</span>
                    </div>
                    <p className="text-xl font-bold text-foreground tabular-nums">{formatIQD(footerTotal)}</p>
                    <div
                        className={cn(
                            "mt-1 inline-flex items-center gap-1 text-xs font-medium",
                            integrityOk ? "text-emerald-600" : "text-rose-600"
                        )}
                    >
                        {integrityOk ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        {integrityOk
                            ? t("deliveryImport.banner.reconciles")
                            : t("deliveryImport.banner.offBy", { amount: formatIQD(Math.abs(integrityDiff)) })}
                    </div>
                </div>

                <div className="w-px bg-[var(--card-border)] self-stretch" />

                {/* Selected coverage */}
                <div className="flex-1 min-w-[150px]">
                    <span className="text-xs text-muted">{t("deliveryImport.banner.selected")}</span>
                    <p className="text-xl font-bold text-emerald-600 tabular-nums">{selected.length}</p>
                    <p className="text-xs text-muted tabular-nums">{t("deliveryImport.banner.net", { amount: formatIQD(selectedNet) })}</p>
                </div>

                <div className="w-px bg-[var(--card-border)] self-stretch" />

                {/* Unaccounted */}
                <div className="flex-1 min-w-[150px]">
                    <span className="text-xs text-muted">{t("deliveryImport.banner.notSelected")}</span>
                    <p className={cn("text-xl font-bold tabular-nums", unselected.length ? "text-amber-600" : "text-muted")}>
                        {unselected.length}
                    </p>
                    <p className="text-xs text-muted tabular-nums">{t("deliveryImport.banner.net", { amount: formatIQD(unselectedNet) })}</p>
                </div>
            </div>

            {/* Unselected breakdown chips (#4) */}
            {chips.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--card-border)] flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <ArrowRight className="w-3 h-3" /> {t("deliveryImport.banner.notSelectedList")}
                    </span>
                    {chips.map(([cat, count]) => (
                        <span
                            key={cat}
                            className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--background)] border border-[var(--card-border)] text-foreground"
                        >
                            {count} {t(`deliveryImport.category.${cat}`)}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
