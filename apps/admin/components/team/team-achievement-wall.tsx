"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Trophy, Lock } from "lucide-react";
import { ACHIEVEMENTS, type AdminEmployee } from "@/types/leads";

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
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-foreground">Achievement Wall</h3>
        </div>
        <p className="text-sm text-foreground/50">
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
                  <span
                    className="text-xl"
                    style={{ color: ach.color }}
                    role="img"
                    aria-label={ach.name}
                  >
                    {ach.icon === "Target"
                      ? "\u25CE"
                      : ach.icon === "Crosshair"
                        ? "\u2316"
                        : ach.icon === "Zap"
                          ? "\u26A1"
                          : ach.icon === "Trophy"
                            ? "\uD83C\uDFC6"
                            : ach.icon === "Award"
                              ? "\uD83C\uDFC5"
                              : ach.icon === "Store"
                                ? "\uD83C\uDFEA"
                                : ach.icon === "Building2"
                                  ? "\uD83C\uDFD7"
                                  : ach.icon === "Flame"
                                    ? "\uD83D\uDD25"
                                    : ach.icon === "Rocket"
                                      ? "\uD83D\uDE80"
                                      : ach.icon === "Bell"
                                        ? "\uD83D\uDD14"
                                        : ach.icon === "Crown"
                                          ? "\uD83D\uDC51"
                                          : ach.icon === "Users"
                                            ? "\uD83D\uDC65"
                                            : "\u2B50"}
                  </span>
                ) : (
                  <Lock className="w-5 h-5 text-foreground/30" />
                )}
              </div>

              {/* Info */}
              <h4 className="text-sm font-bold text-foreground">{ach.name}</h4>
              <p className="text-xs text-foreground/50 mt-0.5">
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
                          className="w-6 h-6 rounded-full border-2 border-[var(--card-bg)] bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center text-white text-[8px] font-bold"
                          title={emp.display_name ?? emp.email}
                        >
                          {initial}
                        </div>
                      );
                    })}
                    {unlockers.length > 5 && (
                      <div className="w-6 h-6 rounded-full border-2 border-[var(--card-bg)] bg-foreground/10 flex items-center justify-center text-[8px] font-bold text-foreground/60">
                        +{unlockers.length - 5}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-foreground/40 mt-1.5">
                    {unlockers.length} member{unlockers.length !== 1 ? "s" : ""}
                  </p>
                </div>
              )}

              {!unlocked && (
                <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                  <p className="text-[10px] text-foreground/30">
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
