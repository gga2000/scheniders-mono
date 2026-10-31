"use client";

import { motion } from "framer-motion";
import { Clock, RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { ActivityLogEntry } from "@/lib/activity-logger";
import { ActivityTimeline } from "./activity-timeline";
import { PastelCard } from "./shared-pastel-components";

// Action filter options
export const ACTION_FILTERS = [
    { value: "all", labelKey: "team.filters.all" },
    { value: "order.create", labelKey: "team.filters.orders" },
    { value: "order.status_change", labelKey: "team.filters.statusChanges" },
    { value: "order.print", labelKey: "team.filters.print" },
    { value: "order.edit", labelKey: "team.filters.edit" },
    { value: "user.login", labelKey: "team.filters.login" },
];

interface TeamActivityFeedProps {
    feed: {
        activities: ActivityLogEntry[];
        isLoading: boolean;
        isLoadingMore: boolean;
        hasMore: boolean;
        totalCount: number;
        error: string | null;
        loadMore: () => Promise<void>;
    };
    actionFilter: string;
    onActionFilterChange: (value: string) => void;
    isNew: (activityId: string) => boolean;
    /** Maps an entry to the member's display name, so the feed and the roster name people the same way. */
    resolveName?: (activity: ActivityLogEntry) => string | null;
}

/** Live, filterable activity feed for the whole store. */
export function TeamActivityFeed({ feed, actionFilter, onActionFilterChange, isNew, resolveName }: TeamActivityFeedProps) {
    const { t } = useLanguage();
    return (
            <PastelCard className="overflow-hidden">
                <div className="p-4 border-b border-[#E8E4DC] dark:border-white/10">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-[#E5F6F3] dark:bg-teal-500/15 flex items-center justify-center">
                                <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                            </div>
                            <h2 className="font-bold text-[#1E1E1E] dark:text-white">{t("team.activities.latest")}</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            {feed.totalCount > 0 && (
                                <span className="text-xs text-[#9A9A9A] dark:text-gray-500">
                                    {feed.totalCount}
                                </span>
                            )}
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                            </span>
                        </div>
                    </div>

                    {/* Action Filter Chips (Step 8) */}
                    <div className="flex flex-wrap gap-1.5">
                        {ACTION_FILTERS.map((filter) => (
                            <button
                                key={filter.value}
                                onClick={() => onActionFilterChange(filter.value)}
                                className={cn(
                                    "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                                    actionFilter === filter.value
                                        ? "bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] shadow-sm"
                                        : "bg-gray-100 dark:bg-white/5 text-[#6B6B6B] dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"
                                )}
                            >
                                {t(filter.labelKey)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="max-h-[600px] overflow-y-auto p-4">
                    {feed.error ? (
                        <p role="alert" className="py-8 text-center text-sm font-medium text-rose-600">
                            {t("team.activities.loadFailed")}
                        </p>
                    ) : feed.isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex gap-3 animate-pulse">
                                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 shrink-0" />
                                    <div className="flex-1">
                                        <div className="h-4 w-3/4 bg-gray-100 dark:bg-gray-800 rounded mb-2" />
                                        <div className="h-3 w-1/2 bg-gray-50 dark:bg-gray-800/50 rounded" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : feed.activities.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-[#F5F0E8] dark:bg-white/5 flex items-center justify-center mb-3">
                                <Clock className="w-6 h-6 text-[#9A9A9A] dark:text-gray-500" />
                            </div>
                            <p className="text-sm font-semibold text-[#1E1E1E] dark:text-white">
                                {t("team.activities.emptyTitle")}
                            </p>
                            <p className="text-xs text-[#6B6B6B] dark:text-gray-400 mt-1 max-w-[220px]">
                                {actionFilter === "all"
                                    ? t("team.activities.emptyAll")
                                    : t("team.activities.emptyFiltered")}
                            </p>
                            {actionFilter !== "all" && (
                                <button
                                    onClick={() => onActionFilterChange("all")}
                                    className="mt-3 px-3 py-1.5 rounded-lg bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] text-xs font-semibold"
                                >
                                    {t("team.activities.clearFilter")}
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <ActivityTimeline
                                activities={feed.activities}
                                groupBy="hour"
                                showUserInfo={true}
                                maxItems={50}
                                isNew={isNew}
                                resolveName={resolveName}
                            />

                            {/* Load More */}
                            {feed.hasMore && (
                                <motion.button
                                    onClick={feed.loadMore}
                                    disabled={feed.isLoadingMore}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="w-full mt-4 py-3 rounded-xl bg-gray-100 dark:bg-white/5 text-sm font-semibold text-[#6B6B6B] dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                                >
                                    {feed.isLoadingMore ? (
                                        <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                                    ) : (
                                        t("team.activities.loadMore")
                                    )}
                                </motion.button>
                            )}
                        </>
                    )}
                </div>
            </PastelCard>
    );
}
