"use client";

import { Crown } from "lucide-react";
import { LeaderboardItem } from "@/lib/analytics/dashboard-calculations";
import { useLanguage } from "@/hooks/use-language";

interface CityLeaderboardProps {
    /** Top cities by order count, already sorted descending. */
    cities: LeaderboardItem[];
}

/**
 * Top Cities leaderboard. Products live in the separate ProductLeaderboard
 * widget below, so this card is cities-only and spans its full container.
 */
export function Leaderboard({ cities }: CityLeaderboardProps) {
    const { t } = useLanguage();
    const max = cities[0]?.value ?? 1;

    return (
        <div className="pastel-card p-6 flex flex-col h-full min-h-[400px]">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <div className="p-1.5 bg-yellow-100 rounded-lg text-yellow-600">
                    <Crown className="w-4 h-4" />
                </div>
                {t("dashboard.leaderboard.topCities")}
            </h3>
            <div className="flex flex-col justify-between flex-1 gap-3">
                {cities.map((city, i) => (
                    <div key={city.id} className="flex items-center gap-3">
                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shrink-0 ${i === 0 ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-500'}`}>
                            {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-sm truncate">{city.label}</span>
                                <span className="font-bold text-sm shrink-0">{city.value}</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                <div
                                    className="h-full bg-yellow-400 rounded-full"
                                    style={{ width: `${(city.value / max) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
