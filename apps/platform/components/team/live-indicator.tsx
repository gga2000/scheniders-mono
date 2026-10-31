"use client";

import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

// Live Indicator
export function LiveIndicator({ isConnected }: { isConnected: boolean }) {
    const { t } = useLanguage();
    return (
        <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold",
            isConnected
                ? "bg-[#E8F8E0] text-green-700 dark:bg-green-500/20 dark:text-green-400"
                : "bg-[#FCEEF1] text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
        )}>
            <span className="relative flex h-2 w-2">
                {isConnected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                )}
                <span className={cn(
                    "relative inline-flex rounded-full h-2 w-2",
                    isConnected ? "bg-green-500" : "bg-rose-500"
                )} />
            </span>
            {isConnected ? t("team.page.live") : t("team.page.offline")}
        </div>
    );
}
