"use client";

import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { TeamTimeRange } from "@/lib/team-time-window";
import { LiveIndicator } from "./live-indicator";

const RANGES: TeamTimeRange[] = ["today", "week", "month", "all"];

interface TeamPageHeaderProps {
    isConnected: boolean;
    refreshing: boolean;
    onRefresh: () => void;
    timeRange: TeamTimeRange;
    onTimeRangeChange: (range: TeamTimeRange) => void;
}

/** Title, live status, refresh and the time-range switch for /team. */
export function TeamPageHeader({ isConnected, refreshing, onRefresh, timeRange, onTimeRangeChange }: TeamPageHeaderProps) {
    const { t } = useLanguage();
    return (
        <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
            <div>
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-[#1E1E1E] dark:text-white">{t("team.title")}</h1>
                    <LiveIndicator isConnected={isConnected} />
                </div>
                <p className="text-sm text-[#6B6B6B] dark:text-gray-400 mt-0.5">{t("team.subtitle")}</p>
            </div>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={refreshing}
                    className="p-2.5 rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 hover:border-[#1E1E1E]/30 transition-colors disabled:opacity-60"
                    aria-label={t("team.page.refresh")}
                >
                    <RefreshCw className={cn("w-4 h-4 text-[#1E1E1E] dark:text-white", refreshing && "animate-spin")} />
                </button>

                <div className="flex flex-1 sm:flex-none bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 rounded-xl p-1">
                    {RANGES.map((range) => (
                        <button
                            key={range}
                            type="button"
                            aria-pressed={timeRange === range}
                            onClick={() => onTimeRangeChange(range)}
                            className={cn(
                                "flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                                timeRange === range
                                    ? "bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E]"
                                    : "text-[#6B6B6B] dark:text-gray-400 hover:text-[#1E1E1E] dark:hover:text-white",
                            )}
                        >
                            {t(`team.page.${range}`)}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
