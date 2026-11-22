"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Award,
  Bell,
  Building2,
  Crosshair,
  Crown,
  Flame,
  Lock,
  Rocket,
  Store,
  Target,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ACHIEVEMENTS, type AchievementIcon, type AdminEmployee } from "@/types/leads";

/*
 * Round 17 (C-06): the wall drew each achievement as an emoji (a trophy, a
 * rocket, a crown), where the console uses icons only. Each achievement now
 * shows the Lucide icon its definition names, in ink; its colour stays on the tile.
 */
const ACHIEVEMENT_ICONS: Record<AchievementIcon, LucideIcon> = {
  Target,
  Crosshair,
  Zap,
  Trophy,
  Award,
  Store,
  Building2,
  Flame,
  Rocket,
  Bell,
  Crown,
  Users,
};

interface TeamAchievementWallProps {
  employees: AdminEmployee[];
}

export function TeamAchievementWall({ employees }: TeamAchievementWallProps) {
  const achievementMap = useMemo(() => {
    const map: Record<string, AdminEmployee[]> = {};
    for (const ach of ACHIEVEMENTS) {
      map[ach.key] = [];
    }
    for (const emp of employees) {
      for (const key of emp.achievements) {
        if (map[key]) {
          map[key].push(emp);
        }
      }
    }
    return map;
  }, [employees]);

  const totalUnlocked = useMemo(() => {
    return ACHIEVEMENTS.filter((ach) => achievementMap[ach.key].length > 0)
      .length;
  }, [achievementMap]);

  return (
    <div className="space-y-6">
      {/* Stats header */}
      <div className="pastel-card p-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[var(--ink-amber)]" />
          <h3 className="font-bold text-foreground">Achievement Wall</h3>
        </div>
        <p className="text-sm text-foreground/70">
          <span className="font-semibold text-foreground">
            {totalUnlocked}
          </span>{" "}
          of {ACHIEVEMENTS.length} achievements unlocked team-wide
        </p>
      </div>

      {/* Achievement Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {ACHIEVEMENTS.map((ach) => {
          const unlockers = achievementMap[ach.key];
          const unlocked = unlockers.length > 0;
          const Icon = ACHIEVEMENT_ICONS[ach.icon];

          return (
            <div
              key={ach.key}
              className={cn(
                "pastel-card p-5 transition-all",
                unlocked ? "" : "opacity-40 grayscale"
              )}
              style={
                unlocked
                  ? {
                      boxShadow: `0 0 16px ${ach.color}20, inset 0 0 0 1px ${ach.color}30`,
                    }
                  : undefined
              }
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{
                  backgroundColor: unlocked
                    ? `${ach.color}15`
                    : "var(--card-bg)",
                  border: `1px solid ${unlocked ? `${ach.color}30` : "var(--card-border)"}`,
                }}
              >
                {unlocked ? (
                  <Icon className="w-5 h-5 text-foreground" role="img" aria-label={ach.name} />
                ) : (
                  <Lock className="w-5 h-5 text-foreground/70" />
                )}
              </div>

              {/* Info */}
              <h4 className="text-sm font-bold text-foreground">{ach.name}</h4>
              <p className="text-xs text-foreground/70 mt-0.5">
                {ach.description}
              </p>

              {/* Unlockers */}
              {unlocked && unlockers.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                  <div className="flex items-center -space-x-2">
                    {unlockers.slice(0, 5).map((emp) => {
                      const initial = (emp.display_name ?? emp.email)
                        .charAt(0)
                        .toUpperCase();
                      return emp.avatar_url ? (
                        <img
                          key={emp.id}
                          src={emp.avatar_url}
                          alt={emp.display_name ?? ""}
                          className="w-6 h-6 rounded-full border-2 border-[var(--card-bg)] object-cover"
                          title={emp.display_name ?? emp.email}
                        />
                      ) : (
                        <div
                          key={emp.id}
                          className="w-6 h-6 rounded-full border-2 border-[var(--card-bg)] bg-foreground/10 flex items-center justify-center text-foreground text-xs font-bold"
                          title={emp.display_name ?? emp.email}
                        >
                          {initial}
                        </div>
                      );
                    })}
                    {unlockers.length > 5 && (
                      <div className="w-6 h-6 rounded-full border-2 border-[var(--card-bg)] bg-foreground/10 flex items-center justify-center text-xs font-bold text-foreground/70">
                        +{unlockers.length - 5}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-foreground/70 mt-1.5">
                    {unlockers.length} member{unlockers.length !== 1 ? "s" : ""}
                  </p>
                </div>
              )}

              {!unlocked && (
                <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                  <p className="text-xs text-foreground/70">
                    Not yet unlocked by any team member
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
