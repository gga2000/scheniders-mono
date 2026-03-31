"use client";

import { StaffEntry } from "@/lib/analytics/dashboard-calculations";
import { Trophy, Users } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

const RANK_BADGES = [
    { bg: 'bg-amber-400',  text: 'text-amber-900', emoji: '🥇' },
    { bg: 'bg-gray-300',   text: 'text-gray-700',  emoji: '🥈' },
    { bg: 'bg-amber-600',  text: 'text-amber-100', emoji: '🥉' },
];

interface StaffLeaderboardProps {
    staff: StaffEntry[];
}

export function StaffLeaderboard({ staff }: StaffLeaderboardProps) {
    const { t } = useLanguage();

    if (staff.length === 0) {
        return (
            <div className="pastel-card pastel-card-yellow p-5 md:p-6 h-full flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-xl bg-white/40 flex items-center justify-center">
                        <Trophy className="w-4 h-4 text-amber-700" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-amber-950">{t("dashboard.staff.title")}</h3>
                        <p className="text-xs text-amber-900/50">{t("dashboard.staff.adminOnly")}</p>
                    </div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-amber-900/40">
                    <Users className="w-8 h-8" />
                    <p className="text-sm">{t("dashboard.staff.noActivity")}</p>
                    <p className="text-xs text-center">{t("dashboard.staff.noActivityDesc")}</p>
                </div>
            </div>
        );
    }

    const maxToday = Math.max(1, ...staff.map(s => s.ordersToday));

    return (
        <div className="pastel-card pastel-card-yellow p-5 md:p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-white/40 flex items-center justify-center">
                        <Trophy className="w-4 h-4 text-amber-700" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-amber-950">{t("dashboard.staff.title")}</h3>
                        <p className="text-xs text-amber-900/50">{t("dashboard.staff.adminOnlyProcessed")}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-bold text-amber-900/50 uppercase tracking-wider">
                    <span>{t("dashboard.staff.today")}</span>
                    <span>{t("dashboard.staff.week")}</span>
                </div>
            </div>

            <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                {staff.map((member) => {
                    const badge = RANK_BADGES[member.rank - 1];
                    const barPct = (member.ordersToday / maxToday) * 100;

                    return (
                        <div key={member.name} className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                {/* Rank */}
                                {badge ? (
                                    <span className="text-base leading-none shrink-0">{badge.emoji}</span>
                                ) : (
                                    <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold flex items-center justify-center shrink-0">
                                        {member.rank}
                                    </span>
                                )}

                                {/* Name */}
                                <span className="text-xs font-semibold text-amber-950 flex-1 truncate">{member.name}</span>

                                {/* Today count */}
                                <span className="text-sm font-bold text-amber-950 tabular-nums w-7 text-center shrink-0">
                                    {member.ordersToday}
                                </span>

                                {/* Week count */}
                                <span className="text-xs text-amber-900/60 tabular-nums w-7 text-center shrink-0">
                                    {member.ordersThisWeek}
                                </span>
                            </div>

                            {/* Progress bar for today */}
                            <div className="flex items-center gap-2">
                                <div className="w-5 shrink-0" />
                                <div className="flex-1 h-1.5 rounded-full bg-amber-200/60 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-amber-500/70 transition-all duration-500"
                                        style={{ width: `${barPct}%` }}
                                    />
                                </div>
                                <div className="w-7 shrink-0" />
                                <div className="w-7 shrink-0" />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
