"use client";

import { CheckCircle, RefreshCw, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { OrderAttributionMode, PeriodMode } from "@/hooks/use-salaries";

interface SalariesCommandBarProps {
    periodMode: PeriodMode;
    onPeriodModeChange: (mode: PeriodMode) => void;
    customStart: string;
    customEnd: string;
    onCustomStartChange: (value: string) => void;
    onCustomEndChange: (value: string) => void;
    attributionMode: OrderAttributionMode;
    onAttributionModeChange: (mode: OrderAttributionMode) => void;
    onRefresh: () => void;
    onOpenRoleDefaults: () => void;
    /** Members with something left to pay in this period; Pay all is off at 0. */
    payableCount: number;
    onPayAll: () => void;
}

const segment = "flex rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-0.5";
const segmentButton = (active: boolean) =>
    cn(
        "h-8 px-3 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap",
        active ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground",
    );
const dateInput =
    "h-9 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[13px] tabular-nums text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/30";
const iconButton =
    "inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-[var(--card-bg)] hover:text-foreground transition-colors";

/** /salaries top row: which period is paid, how orders are counted, and the page actions. */
export function SalariesCommandBar({
    periodMode,
    onPeriodModeChange,
    customStart,
    customEnd,
    onCustomStartChange,
    onCustomEndChange,
    attributionMode,
    onAttributionModeChange,
    onRefresh,
    onOpenRoleDefaults,
    payableCount,
    onPayAll,
}: SalariesCommandBarProps) {
    const { t } = useLanguage();

    return (
        <div className="flex flex-wrap items-center gap-3">
            <div className={segment} role="group" aria-label={t("payroll.period.label")}>
                <button type="button" aria-pressed={periodMode === "since_last"} onClick={() => onPeriodModeChange("since_last")} className={segmentButton(periodMode === "since_last")}>
                    {t("payroll.period.sinceLast")}
                </button>
                <button type="button" aria-pressed={periodMode === "custom"} onClick={() => onPeriodModeChange("custom")} className={segmentButton(periodMode === "custom")}>
                    {t("payroll.period.custom")}
                </button>
            </div>

            {periodMode === "custom" ? (
                <div className="flex items-center gap-2">
                    <input type="date" aria-label={t("payroll.period.from")} value={customStart} max={customEnd} onChange={(e) => onCustomStartChange(e.target.value)} className={dateInput} />
                    <span className="text-muted" aria-hidden="true">–</span>
                    <input type="date" aria-label={t("payroll.period.to")} value={customEnd} min={customStart} onChange={(e) => onCustomEndChange(e.target.value)} className={dateInput} />
                </div>
            ) : (
                <p className="text-[13px] text-muted">{t("payroll.period.sinceLastHint")}</p>
            )}

            <div className="flex-1" />

            <div className="flex items-center gap-2">
                <span className="text-[13px] text-muted" id="payroll-attribution-label">{t("payroll.attribution.label")}</span>
                <div className={segment} role="group" aria-labelledby="payroll-attribution-label" title={t("payroll.attribution.hint")}>
                    <button type="button" aria-pressed={attributionMode === "all"} onClick={() => onAttributionModeChange("all")} className={segmentButton(attributionMode === "all")}>
                        {t("payroll.attribution.all")}
                    </button>
                    <button type="button" aria-pressed={attributionMode === "last_touched"} onClick={() => onAttributionModeChange("last_touched")} className={segmentButton(attributionMode === "last_touched")}>
                        {t("payroll.attribution.byEmployee")}
                    </button>
                </div>
            </div>

            <div className="flex items-center">
                <button type="button" onClick={onRefresh} className={iconButton} aria-label={t("common.refresh")} title={t("common.refresh")}>
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={onOpenRoleDefaults} className={iconButton} aria-label={t("payroll.roleDefaults")} title={t("payroll.roleDefaults")}>
                    <Settings2 className="w-4 h-4" aria-hidden="true" />
                </button>
            </div>

            <button
                type="button"
                onClick={onPayAll}
                disabled={payableCount === 0}
                className="inline-flex h-9 items-center gap-2 px-4 rounded-xl bg-[var(--ink)] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
                <CheckCircle className="w-4 h-4" aria-hidden="true" />
                {t("payroll.payAll")}
                {payableCount > 0 && (
                    <span className="rounded-md bg-white/15 px-1.5 text-xs tabular-nums">{payableCount.toLocaleString("en-US")}</span>
                )}
            </button>
        </div>
    );
}
