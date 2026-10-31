"use client";

import { motion } from "framer-motion";
import { Award, Crown, Medal } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { EmployeeStats } from "@/lib/team-types";

// Top Performer Podium (Compact Style)
export function TopPerformerPodium({ performers }: { performers: EmployeeStats[] }) {
    const { t } = useLanguage();
    const top3 = performers.slice(0, 3);
    if (top3.length === 0) return null;

    const podiumConfig = [
        { color: "from-[#FBE38E] to-[#FDF5D4] dark:from-amber-500/30 dark:to-amber-500/10", ring: "ring-[#FBE38E] dark:ring-amber-500/40", icon: Crown },
        { color: "from-[#E5E7EB] to-[#F3F4F6] dark:from-gray-600/30 dark:to-gray-600/10", ring: "ring-gray-300 dark:ring-gray-500/40", icon: Medal },
        { color: "from-[#F4C7CF] to-[#FCEEF1] dark:from-rose-500/30 dark:to-rose-500/10", ring: "ring-[#F4C7CF] dark:ring-rose-500/40", icon: Award },
    ];

    const displayOrder = [top3[1], top3[0], top3[2]].filter(Boolean); // 2nd, 1st, 3rd

    return (
        <div className="relative py-4">
            <div className="flex items-stretch justify-center gap-4">
                {displayOrder.map((emp) => {
                    const originalIndex = top3.findIndex(p => p.user_id === emp.user_id);
                    const config = podiumConfig[originalIndex];

                    return (
                        <motion.div
                            key={emp.user_id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: "spring" }}
                            className="relative flex-1 max-w-[200px]"
                        >
                            <div className={cn(
                                "relative p-4 rounded-3xl h-full flex flex-col items-center",
                                "bg-gradient-to-br",
                                config.color,
                                "ring-2",
                                config.ring,
                                "shadow-md dark:shadow-xl"
                            )}>
                                <div className={cn(
                                    "absolute -top-3",
                                    "w-8 h-8 rounded-full bg-white dark:bg-[#1A1A1A] flex items-center justify-center",
                                    "shadow-sm border border-white dark:border-[#1A1A1A]"
                                )}>
                                    <config.icon className={cn(
                                        "w-4 h-4",
                                        originalIndex === 0 ? "text-amber-600" : originalIndex === 1 ? "text-gray-500" : "text-rose-500"
                                    )} />
                                </div>

                                <div className="w-16 h-16 mt-3 rounded-2xl overflow-hidden bg-white dark:bg-[#1A1A1A] flex items-center justify-center border-2 border-white dark:border-[#1A1A1A] shadow-sm">
                                    {emp.avatar_url ? (
                                        <img src={emp.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-xl font-bold text-[#1E1E1E] dark:text-white">
                                            {(emp.display_name || emp.user_email)?.[0]?.toUpperCase()}
                                        </span>
                                    )}
                                </div>

                                <div className="mt-3 text-center">
                                    <p className="font-bold text-[#1E1E1E] dark:text-white truncate max-w-[120px] text-sm">
                                        {emp.display_name || emp.user_email?.split("@")[0]}
                                    </p>
                                    <p className={cn(
                                        "text-xl font-bold",
                                        originalIndex === 0 ? "text-amber-700 dark:text-amber-400" : originalIndex === 1 ? "text-gray-600 dark:text-gray-300" : "text-rose-600 dark:text-rose-400"
                                    )}>
                                        {emp.total_actions}
                                    </p>
                                    <p className="text-[10px] text-[#6B6B6B] dark:text-gray-400">{t("team.stats.sessionLabel")}</p>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
