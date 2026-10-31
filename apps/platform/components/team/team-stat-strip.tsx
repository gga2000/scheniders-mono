"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { TeamTimeRange } from "@/lib/team-time-window";

export interface TeamStat {
    current: number;
    /** Percent change against the previous window of the same length; null when there is no baseline. */
    trend: number | null;
}

interface TeamStatStripProps {
    range: TeamTimeRange;
    totalActions: TeamStat;
    ordersCreated: TeamStat;
    statusChanges: TeamStat;
    ordersPrinted: TeamStat;
    /** Team actions per Baghdad day, oldest first (7 points). */
    actionsByDay: { day: string; value: number }[];
}

function TrendChip({ trend, range }: { trend: number | null; range: TeamTimeRange }) {
    const { t } = useLanguage();
    if (trend === null || range === "all") return null;
    const up = trend >= 0;
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    return (
        <span className="inline-flex items-center gap-1 text-xs text-[#6B6B6B] dark:text-gray-400">
            <span className={cn("inline-flex items-center font-semibold tabular-nums", up ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {Math.abs(trend)}%
            </span>
            {t(`team.strip.vs.${range}`)}
        </span>
    );
}

/** Seven thin bars, one per day; the last bar is today. */
function WeekBars({ data }: { data: { day: string; value: number }[] }) {
    const { t } = useLanguage();
    const max = Math.max(1, ...data.map((d) => d.value));
    return (
        <div className="flex items-end gap-[3px] h-8" role="img" aria-label={t("team.strip.last7")}>
            {data.map((d, i) => (
                <span
                    key={d.day}
                    title={`${d.day}: ${d.value.toLocaleString("en-US")}`}
                    className={cn("w-1.5 rounded-sm", i === data.length - 1 ? "bg-[#1E1E1E] dark:bg-white" : "bg-[#D9D3C7] dark:bg-white/25")}
                    style={{ height: `${Math.max(8, Math.round((d.value / max) * 100))}%` }}
                />
            ))}
        </div>
    );
}

/** One quiet row of the team's totals for the chosen window, each against the previous window. */
export function TeamStatStrip({ range, totalActions, ordersCreated, statusChanges, ordersPrinted, actionsByDay }: TeamStatStripProps) {
    const { t } = useLanguage();
    const cells: { key: string; label: string; stat: TeamStat }[] = [
        { key: "actions", label: t("team.stats.totalActions"), stat: totalActions },
        { key: "orders", label: t("team.stats.newOrders"), stat: ordersCreated },
        { key: "status", label: t("team.stats.statusChanges"), stat: statusChanges },
        { key: "printed", label: t("team.stats.printOps"), stat: ordersPrinted },
    ];
    return (
        <section
            aria-label={t("team.strip.label")}
            className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-[#E8E4DC] dark:border-white/10 bg-[#F0ECE4] dark:bg-white/5"
        >
            {cells.map((c, i) => (
                <div key={c.key} className="p-4 sm:px-5 min-w-0 bg-white dark:bg-[#1A1A1A]">
                    <p className="text-xs font-medium text-[#6B6B6B] dark:text-gray-400 truncate">{c.label}</p>
                    <div className="mt-1 flex items-end justify-between gap-2">
                        <p className="text-2xl font-bold tabular-nums text-[#1E1E1E] dark:text-white leading-none">
                            {c.stat.current.toLocaleString("en-US")}
                        </p>
                        {i === 0 && actionsByDay.length > 0 && <WeekBars data={actionsByDay} />}
                    </div>
                    <div className="mt-2 min-h-4">
                        <TrendChip trend={c.stat.trend} range={range} />
                    </div>
                </div>
            ))}
        </section>
    );
}
