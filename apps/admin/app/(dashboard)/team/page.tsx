"use client";

import { useState } from "react";
import { useAdminTeam } from "@/hooks/use-admin-team";
import { TeamLeaderboard } from "@/components/team/team-leaderboard";
import { TeamCommissionDashboard } from "@/components/team/team-commission-dashboard";
import { TeamAchievementWall } from "@/components/team/team-achievement-wall";
import { cn } from "@/lib/utils";
import { Users, Loader2 } from "lucide-react";

const tabs = ["Leaderboard", "Commissions", "Achievements"] as const;
type Tab = (typeof tabs)[number];

export default function TeamPage() {
  const { data: employees, isLoading } = useAdminTeam();
  const [activeTab, setActiveTab] = useState<Tab>("Leaderboard");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
      </div>
    );
  }

  const team = employees ?? [];

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6" />
          Team Management
        </h1>
        <p className="text-foreground/50 mt-1">
          {team.length} employee{team.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-[var(--card-border)]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold transition-colors",
              activeTab === tab
                ? "text-foreground border-b-2 border-[#1E1E1E]"
                : "text-foreground/50 hover:text-foreground/70"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Leaderboard" && <TeamLeaderboard employees={team} />}
      {activeTab === "Commissions" && (
        <TeamCommissionDashboard employees={team} />
      )}
      {activeTab === "Achievements" && (
        <TeamAchievementWall employees={team} />
      )}
    </div>
  );
}
