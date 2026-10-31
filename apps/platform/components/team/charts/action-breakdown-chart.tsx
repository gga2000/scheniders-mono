"use client";

import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

interface ActionBreakdown {
    action: string;
    count: number;
}

interface ActionBreakdownChartProps {
    data: ActionBreakdown[];
    className?: string;
}

const ACTION_LABEL_KEYS: Record<string, string> = {
    "order.create": "team.drawer.actionCreate",
    "order.status_change": "team.drawer.actionStatus",
    "order.edit": "team.drawer.actionEdit",
    "order.print": "team.drawer.actionPrint",
    "order.delete": "team.drawer.actionDelete",
    "order.assign": "team.drawer.actionAssign",
    "user.login": "team.drawer.actionLogin",
    "customer.blacklist": "team.drawer.actionBlacklist",
    "settings.update": "team.drawer.actionSettings",
    "mcp.tool_call": "team.drawer.actionClaude",
};

/** What the work was made of: one ranked row per action type with its share of the total. */
export function ActionBreakdownChart({ data, className }: ActionBreakdownChartProps) {
    const { t } = useLanguage();
    const rows = [...data].sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    const max = Math.max(1, ...rows.map((r) => r.count));

    if (total === 0) {
        return <p className={cn("py-20 text-center text-sm text-[#6B6B6B] dark:text-gray-400", className)}>{t("team.charts.noData")}</p>;
    }

    return (
        <ul className={cn("space-y-3", className)}>
            {rows.map((r, i) => {
                const key = ACTION_LABEL_KEYS[r.action];
                return (
                    <li key={r.action} className="grid grid-cols-[160px_1fr_56px_44px] items-center gap-3 text-sm">
                        <span className="truncate text-[#1E1E1E] dark:text-gray-100">{key ? t(key) : r.action}</span>
                        <span className="h-2.5 rounded-full bg-[#F0ECE4] dark:bg-white/10 overflow-hidden">
                            <span
                                className={cn("block h-full rounded-full", i === 0 ? "bg-[#1E1E1E] dark:bg-white" : "bg-[#C9C3B8] dark:bg-white/30")}
                                style={{ width: `${Math.round((r.count / max) * 100)}%` }}
                            />
                        </span>
                        <span className="text-right font-semibold tabular-nums text-[#1E1E1E] dark:text-white">{r.count.toLocaleString("en-US")}</span>
                        <span className="text-right text-xs tabular-nums text-[#6B6B6B] dark:text-gray-400">{Math.round((r.count / total) * 100)}%</span>
                    </li>
                );
            })}
        </ul>
    );
}
