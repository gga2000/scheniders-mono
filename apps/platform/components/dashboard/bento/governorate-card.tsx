"use client";

import { useCallback, useMemo, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useTrendFacts } from "@/hooks/use-dashboard-order-facts";
import { WidgetLoadError, WidgetPending } from "@/components/dashboard/widget-query-state";
import { getGovernorateByCode } from "@/lib/address-validator";
import {
    BENTO_FACT_DAYS,
    GOVERNORATE_REGION,
    GOV_PERIODS,
    REGIONS,
    UNKNOWN_GOVERNORATE,
    governoratePeriods,
    type GovPeriod,
    type RegionId,
} from "@/lib/analytics/dashboard-bento";
import { BentoCard } from "./bento-card";
import { CountUp } from "./count-up";
import { Delta } from "./delta";
import { GovernorateTreemap, type TreemapTile } from "./governorate-treemap";
import { useChartTooltip } from "./chart-tooltip";

/** Tile colour and the ink that reads on it, per region (tokens in globals.css). */
const REGION_STYLE: Record<RegionId | "unknown", { color: string; ink: string }> = {
    baghdad: { color: "var(--bento-region-baghdad)", ink: "#0a0a0a" },
    south: { color: "var(--bento-region-south)", ink: "#ffffff" },
    euphrates: { color: "var(--bento-region-euphrates)", ink: "#0a0a0a" },
    north: { color: "var(--bento-region-north)", ink: "var(--foreground)" },
    kurdistan: { color: "var(--bento-region-kurdistan)", ink: "#0a0a0a" },
    unknown: { color: "var(--bento-region-unknown)", ink: "var(--foreground-muted)" },
};

const PERIOD_KEY: Record<GovPeriod, string> = {
    today: "dashboard.bento.periodToday",
    "7d": "dashboard.bento.period7d",
    "30d": "dashboard.bento.period30d",
};
const PREVIOUS_KEY: Record<GovPeriod, string> = {
    today: "dashboard.bento.vsYesterday",
    "7d": "dashboard.bento.vsPrev7",
    "30d": "dashboard.bento.vsPrev30",
};
const whole = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Where orders come from: governorates sized by orders created in the period,
 * coloured by region. Three periods side by side (the button is the total), the
 * map re-flows on a switch. Replaces the Top Cities list, which ranked free-text
 * city names and so split one place across spellings; this groups on the
 * validated governorate code.
 *
 * Counts only, never money: every role may see it, and order volume is the
 * question a merchant asks of a region.
 */
export function GovernorateCard() {
    const { t, language } = useLanguage();
    const facts = useTrendFacts(BENTO_FACT_DAYS);
    const tip = useChartTooltip();
    const [period, setPeriod] = useState<GovPeriod>("7d");
    const periods = useMemo(() => (facts.data ? governoratePeriods(facts.data) : null), [facts.data]);

    const nameOf = useCallback((code: string) => {
        if (code === UNKNOWN_GOVERNORATE) return t("dashboard.bento.unknownGov");
        const g = getGovernorateByCode(code);
        if (!g) return code;
        return language === "ar" ? g.alternativeName || g.nameAr : g.nameEn;
    }, [language, t]);

    const tiles: TreemapTile[] = useMemo(() => {
        if (!periods) return [];
        return [...periods[period].counts.entries()].map(([code, value]) => {
            const style = REGION_STYLE[code === UNKNOWN_GOVERNORATE ? "unknown" : GOVERNORATE_REGION[code]];
            return { key: code, name: nameOf(code), value, color: style.color, ink: style.ink };
        });
    }, [periods, period, nameOf]);

    const top = useMemo(() => {
        if (!periods) return [];
        return [...periods["30d"].counts.entries()]
            .filter(([code]) => code !== UNKNOWN_GOVERNORATE)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([code]) => code);
    }, [periods]);

    const describe = useCallback((tile: TreemapTile, share: string) => ({
        title: tile.key === UNKNOWN_GOVERNORATE
            ? t(PERIOD_KEY[period])
            : `${t(PERIOD_KEY[period])} · ${t(`dashboard.bento.region.${GOVERNORATE_REGION[tile.key]}`)}`,
        rows: [
            { label: tile.name, value: whole(tile.value), color: tile.color },
            { label: t("dashboard.bento.share"), value: share },
        ],
    }), [period, t]);

    return (
        <BentoCard label={t("dashboard.bento.govTitle")} order={2}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="m-0 text-[17px] font-semibold tracking-[-0.02em] text-foreground">{t("dashboard.bento.govTitle")}</h3>
                <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs tracking-[-0.01em] text-[var(--foreground-muted)]">
                    {REGIONS.map((r) => (
                        <li key={r} className="inline-flex items-center gap-1.5">
                            <i className="size-2 rounded-[2px]" style={{ background: REGION_STYLE[r].color }} />
                            {t(`dashboard.bento.region.${r}`)}
                        </li>
                    ))}
                </ul>
            </div>

            {facts.isError && !facts.data ? (
                <WidgetLoadError onRetry={() => void facts.refetch()} className="mt-4 min-h-[420px]" />
            ) : !periods ? (
                <WidgetPending className="mt-4 min-h-[420px]" />
            ) : (
                <>
                    <div className="my-[18px] grid grid-cols-3 gap-3">
                        {GOV_PERIODS.map((p) => (
                            <button
                                key={p}
                                type="button"
                                aria-pressed={p === period}
                                onClick={() => setPeriod(p)}
                                className="-m-2.5 rounded-[14px] p-2.5 text-start outline-none transition-colors hover:bg-[var(--background-soft)]/70 focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                            >
                                <span className="flex items-center gap-1.5 text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                                    <i className={`size-1.5 rounded-full transition-colors ${p === period ? "bg-[var(--bento-up)]" : "bg-[var(--foreground-muted)]/60"}`} />
                                    {t(PERIOD_KEY[p])}
                                </span>
                                <span className="mt-1.5 flex items-baseline gap-1.5 font-mono text-[28px] font-medium leading-none tracking-[-0.04em] tabular-nums text-foreground">
                                    <CountUp value={periods[p].total} />
                                    <Delta pct={periods[p].deltaPct} className="self-center text-xs" />
                                </span>
                                <span className="mt-1.5 block text-xs tracking-[-0.01em] text-[var(--foreground-muted)]">
                                    {t(PREVIOUS_KEY[p], { n: whole(periods[p].previousTotal) })}
                                </span>
                            </button>
                        ))}
                    </div>

                    {periods[period].total === 0 ? (
                        <div className="flex h-[320px] items-center justify-center rounded-[18px] border border-dashed border-[var(--card-border)] text-sm text-[var(--foreground-muted)]">
                            {t("dashboard.bento.noOrdersPeriod")}
                        </div>
                    ) : (
                        <GovernorateTreemap
                            tiles={tiles}
                            label={`${t("dashboard.bento.govTitle")}, ${t(PERIOD_KEY[period])}`}
                            describe={describe}
                            onTip={tip.show}
                            onTipEnd={tip.hide}
                        />
                    )}

                    {top.length > 0 && (
                        <table className="mt-[18px] w-full border-collapse text-sm">
                            <thead>
                                <tr>
                                    <th className="pb-2 text-start text-xs font-medium tracking-[-0.01em] text-[var(--foreground-muted)]">{t("dashboard.bento.governorate")}</th>
                                    {GOV_PERIODS.map((p) => (
                                        <th key={p} className="pb-2 text-end text-xs font-medium tracking-[-0.01em] text-[var(--foreground-muted)]">{t(PERIOD_KEY[p])}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {top.map((code) => (
                                    <tr key={code} className="border-t border-[var(--card-border)]">
                                        <td className="py-[11px] text-start tracking-[-0.01em] text-[var(--foreground-muted)]">{nameOf(code)}</td>
                                        {GOV_PERIODS.map((p) => (
                                            <td key={p} className="py-[11px] text-end font-mono tracking-[-0.04em] tabular-nums text-foreground">
                                                {whole(periods[p].counts.get(code) ?? 0)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}
            {tip.element}
        </BentoCard>
    );
}
