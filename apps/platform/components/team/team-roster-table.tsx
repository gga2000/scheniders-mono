"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { EmployeeStats } from "@/lib/team-types";

type SortKey = "name" | "total_actions" | "orders_created" | "status_changes" | "orders_printed" | "last_login_at";
type SortDir = "asc" | "desc";

const ONLINE_WINDOW_MS = 15 * 60 * 1000;

const ROLE_KEYS: Record<string, string> = {
    owner: "team.roster.role.owner",
    admin: "team.roster.role.admin",
    employee: "team.roster.role.employee",
    viewer: "team.roster.role.viewer",
};

function displayName(e: EmployeeStats): string {
    return e.display_name || e.user_email?.split("@")[0] || "—";
}

function loginTime(e: EmployeeStats): number {
    return e.last_login_at ? new Date(e.last_login_at).getTime() : 0;
}

function sortValue(e: EmployeeStats, key: SortKey): number | string {
    switch (key) {
        case "name":
            return displayName(e).toLocaleLowerCase();
        case "last_login_at":
            return loginTime(e);
        default:
            return e[key];
    }
}

type Presence = "active" | "online" | "away";

function presenceOf(e: EmployeeStats, activeUserIds: Set<string>, now: number): Presence {
    if (activeUserIds.has(e.user_id)) return "active";
    if (e.last_login_at && loginTime(e) > now - ONLINE_WINDOW_MS) return "online";
    return "away";
}

interface TeamRosterTableProps {
    members: EmployeeStats[];
    activeUserIds: Set<string>;
    /** Render time, passed in so presence is computed outside render. */
    now: number;
    onSelect: (userId: string) => void;
}

/**
 * Every active member of the store in one sortable table: who is working right now, who has
 * done nothing in the window, and each person's share of the team's work.
 */
export function TeamRosterTable({ members, activeUserIds, now, onSelect }: TeamRosterTableProps) {
    const { t, language } = useLanguage();
    const [sortKey, setSortKey] = useState<SortKey>("total_actions");
    const [sortDir, setSortDir] = useState<SortDir>("desc");

    const teamTotal = useMemo(() => members.reduce((s, m) => s + m.total_actions, 0), [members]);
    const idleCount = useMemo(() => members.filter((m) => m.total_actions === 0).length, [members]);

    const sorted = useMemo(() => {
        const dir = sortDir === "asc" ? 1 : -1;
        return [...members].sort((a, b) => {
            const av = sortValue(a, sortKey);
            const bv = sortValue(b, sortKey);
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return displayName(a).localeCompare(displayName(b));
        });
    }, [members, sortKey, sortDir]);

    function toggleSort(key: SortKey) {
        if (key === sortKey) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir(key === "name" ? "asc" : "desc");
        }
    }

    const numericColumns: { key: SortKey; label: string; className?: string }[] = [
        { key: "total_actions", label: t("team.roster.actions") },
        { key: "orders_created", label: t("team.stats.newOrders"), className: "hidden md:table-cell" },
        { key: "status_changes", label: t("team.stats.statusChanges"), className: "hidden md:table-cell" },
        { key: "orders_printed", label: t("team.roster.printed"), className: "hidden lg:table-cell" },
    ];

    function sortHeader(k: SortKey, label: string, className?: string, alignEnd?: boolean) {
        const active = sortKey === k;
        return (
            <th
                key={k}
                scope="col"
                aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                className={cn("px-3 py-2.5 font-semibold", alignEnd ? "text-right" : "text-left", className)}
            >
                <button
                    type="button"
                    onClick={() => toggleSort(k)}
                    className={cn(
                        "inline-flex items-center gap-1 text-[11px] uppercase tracking-wide transition-colors",
                        active ? "text-[#1E1E1E] dark:text-white" : "text-[#9A9A9A] dark:text-gray-500 hover:text-[#1E1E1E] dark:hover:text-white",
                    )}
                >
                    {label}
                    {active && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                </button>
            </th>
        );
    }

    return (
        <div className="bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 rounded-3xl overflow-hidden">
            <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3">
                <h2 className="text-lg font-bold text-[#1E1E1E] dark:text-white">{t("team.roster.title")}</h2>
                <p className="text-xs text-[#6B6B6B] dark:text-gray-400 tabular-nums">
                    {t("team.roster.summary", { count: members.length, idle: idleCount })}
                </p>
            </div>

            {members.length === 0 ? (
                <p className="px-5 pb-6 text-sm text-[#6B6B6B] dark:text-gray-400">{t("team.roster.empty")}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-y border-[#F0ECE4] dark:border-white/5 bg-[#FAF8F5] dark:bg-white/[0.02]">
                            <tr>
                                {sortHeader("name", t("team.roster.member"))}
                                {numericColumns.map((c) => sortHeader(c.key, c.label, c.className, true))}
                                {sortHeader("last_login_at", t("team.roster.lastSeen"), "hidden sm:table-cell", true)}
                                <th scope="col" className="w-8"><span className="sr-only">{t("team.roster.open")}</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0ECE4] dark:divide-white/5">
                            {sorted.map((m) => {
                                const presence = presenceOf(m, activeUserIds, now);
                                const idle = m.total_actions === 0;
                                const share = teamTotal > 0 ? m.total_actions / teamTotal : 0;
                                const roleKey = ROLE_KEYS[m.role.toLowerCase()];
                                return (
                                    <tr
                                        key={m.user_id}
                                        onClick={() => onSelect(m.user_id)}
                                        className="group cursor-pointer hover:bg-[#FAF8F5] dark:hover:bg-white/[0.03] transition-colors"
                                    >
                                        <td className="px-3 py-3">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); onSelect(m.user_id); }}
                                                className="flex items-center gap-3 text-left min-w-0"
                                            >
                                                <span className="relative shrink-0">
                                                    <span className={cn(
                                                        "w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center text-sm font-bold",
                                                        "bg-[#F5F0E8] dark:bg-white/10 text-[#1E1E1E] dark:text-white",
                                                        idle && "opacity-60",
                                                    )}>
                                                        {m.avatar_url ? (
                                                            // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from arbitrary storage hosts not configured for next/image
                                                            <img src={m.avatar_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                                                        ) : (
                                                            displayName(m)[0]?.toUpperCase()
                                                        )}
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#1A1A1A]",
                                                            presence === "away" ? "bg-gray-300 dark:bg-gray-600" : "bg-emerald-500",
                                                        )}
                                                        aria-hidden="true"
                                                    >
                                                        {presence === "active" && (
                                                            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60 motion-reduce:hidden" />
                                                        )}
                                                    </span>
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="flex items-center gap-2">
                                                        <span className={cn("font-semibold truncate", idle ? "text-[#6B6B6B] dark:text-gray-400" : "text-[#1E1E1E] dark:text-white")}>
                                                            {displayName(m)}
                                                        </span>
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[#F5F0E8] dark:bg-white/10 text-[#6B6B6B] dark:text-gray-300">
                                                            {roleKey ? t(roleKey) : m.role}
                                                        </span>
                                                    </span>
                                                    <span className={cn(
                                                        "block text-[11px] font-medium",
                                                        presence === "away" ? "text-[#9A9A9A] dark:text-gray-500" : "text-emerald-700 dark:text-emerald-400",
                                                    )}>
                                                        {presence === "active"
                                                            ? t("team.roster.workingNow")
                                                            : presence === "online"
                                                                ? t("team.roster.online")
                                                                : idle
                                                                    ? t("team.roster.noActivity")
                                                                    : t("team.roster.away")}
                                                    </span>
                                                </span>
                                            </button>
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            <span className={cn("font-bold tabular-nums", idle ? "text-[#9A9A9A] dark:text-gray-500" : "text-[#1E1E1E] dark:text-white")}>
                                                {m.total_actions.toLocaleString()}
                                            </span>
                                            <span className="mt-1 ml-auto block h-1 w-16 rounded-full bg-[#F0ECE4] dark:bg-white/10 overflow-hidden" aria-hidden="true">
                                                <span className="block h-full rounded-full bg-[#1E1E1E] dark:bg-white" style={{ width: `${Math.round(share * 100)}%` }} />
                                            </span>
                                        </td>
                                        {numericColumns.slice(1).map((c) => (
                                            <td key={c.key} className={cn("px-3 py-3 text-right tabular-nums text-[#1E1E1E] dark:text-gray-200", c.className)}>
                                                {(m[c.key as "orders_created" | "status_changes" | "orders_printed"]).toLocaleString()}
                                            </td>
                                        ))}
                                        <td className="hidden sm:table-cell px-3 py-3 text-right text-xs text-[#6B6B6B] dark:text-gray-400 whitespace-nowrap">
                                            {m.last_login_at
                                                ? formatDistanceToNow(new Date(m.last_login_at), { addSuffix: true, locale: language === "ar" ? ar : undefined })
                                                : t("team.roster.never")}
                                        </td>
                                        <td className="pr-3 py-3 text-[#C9C3B8] group-hover:text-[#1E1E1E] dark:group-hover:text-white transition-colors">
                                            <ChevronRight className="w-4 h-4" aria-hidden="true" />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
