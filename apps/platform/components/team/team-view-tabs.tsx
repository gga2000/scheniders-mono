"use client";

import { BarChart3, Target, Users } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

export type TeamViewMode = "team" | "insights" | "goals";

const TABS: { id: TeamViewMode; labelKey: string; icon: React.ElementType }[] = [
    { id: "team", labelKey: "team.tabs.team", icon: Users },
    { id: "insights", labelKey: "team.tabs.insights", icon: BarChart3 },
    { id: "goals", labelKey: "team.tabs.goals", icon: Target },
];

/** Team / Insights / Goals switch. */
export function TeamViewTabs({ value, onChange }: { value: TeamViewMode; onChange: (mode: TeamViewMode) => void }) {
    const { t } = useLanguage();
    return (
        <div role="tablist" className="flex gap-6 border-b border-[#E8E4DC] dark:border-white/10 overflow-x-auto">
            {TABS.map((tab) => {
                const active = value === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(tab.id)}
                        className={cn(
                            "-mb-px flex items-center gap-2 py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-colors",
                            active
                                ? "border-[#1E1E1E] dark:border-white text-[#1E1E1E] dark:text-white"
                                : "border-transparent text-[#6B6B6B] dark:text-gray-400 hover:text-[#1E1E1E] dark:hover:text-white",
                        )}
                    >
                        <tab.icon className="w-4 h-4" aria-hidden="true" />
                        {t(tab.labelKey)}
                    </button>
                );
            })}
        </div>
    );
}
