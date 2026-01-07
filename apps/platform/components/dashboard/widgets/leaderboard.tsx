"use client";

import { Crown, TrendingUp } from "lucide-react";
import { LeaderboardMetrics } from "@/lib/analytics/dashboard-calculations";

interface LeaderboardProps {
    data: LeaderboardMetrics;
}

export function Leaderboard({ data }: LeaderboardProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            {/* Top Cities */}
            <div className="pastel-card p-6 flex flex-col">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                    <div className="p-1.5 bg-yellow-100 rounded-lg text-yellow-600">
                        <Crown className="w-4 h-4" />
                    </div>
                    Top Cities
                </h3>
                <div className="space-y-4 flex-1">
                    {data.topCities.map((city, i) => (
                        <div key={city.id} className="flex items-center gap-3">
                            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-500'}`}>
                                {i + 1}
                            </span>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm">{city.label}</span>
                                    <span className="font-bold text-sm">{city.value}</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                    <div
                                        className="h-full bg-yellow-400 rounded-full"
                                        style={{ width: `${(city.value / data.topCities[0].value) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top Products */}
            <div className="pastel-card p-6 flex flex-col">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                    <div className="p-1.5 bg-blue-100 rounded-lg text-blue-600">
                        <TrendingUp className="w-4 h-4" />
                    </div>
                    Top Products
                </h3>
                <div className="space-y-4 flex-1">
                    {data.topProducts.map((prod, i) => (
                        <div key={prod.id} className="flex items-center gap-3">
                            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-blue-400 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                {i + 1}
                            </span>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm truncate max-w-[150px]">{prod.label}</span>
                                    <span className="font-bold text-sm">{prod.value}</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                    <div
                                        className="h-full bg-blue-400 rounded-full"
                                        style={{ width: `${(prod.value / data.topProducts[0].value) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
