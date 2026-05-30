"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Target, TrendingUp, DollarSign, Award } from "lucide-react";
import type { AdminEmployee } from "@/types/leads";

interface TeamMemberCardProps {
  employee: AdminEmployee;
  rank?: number;
  isPodium?: boolean;
}

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

const rankColors: Record<number, string> = {
  1: "text-amber-500",
  2: "text-gray-400",
  3: "text-orange-400",
};

const rankBorders: Record<number, string> = {
  1: "border-l-amber-400",
  2: "border-l-gray-300",
  3: "border-l-orange-300",
};

export function TeamMemberCard({
  employee,
  rank,
  isPodium,
}: TeamMemberCardProps) {
  const initial = (employee.display_name ?? employee.email)
    .charAt(0)
    .toUpperCase();

  return (
    <Link href={`/team/${employee.id}`} className="block group">
      <div
        className={cn(
          "pastel-card p-4 hover:shadow-[var(--card-shadow-hover)] transition-all duration-200",
          isPodium && rank ? `border-l-4 ${rankBorders[rank] ?? ""}` : ""
        )}
      >
        {/* Top: Avatar + Name + Rank */}
        <div className="flex items-center gap-3">
          {employee.avatar_url ? (
            <img
              src={employee.avatar_url}
              alt={employee.display_name ?? ""}
              className="w-10 h-10 rounded-xl object-cover shrink-0 group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0 group-hover:scale-105 transition-transform">
              {initial}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground truncate">
              {employee.display_name ?? employee.email.split("@")[0]}
            </p>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize",
                employee.role === "admin"
                  ? "bg-purple-100 text-purple-800"
                  : employee.role === "manager"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-green-100 text-green-800"
              )}
            >
              {employee.role}
            </span>
          </div>

          {rank && (
            <span
              className={cn(
                "text-lg font-bold shrink-0",
                rankColors[rank] ?? "text-foreground/30"
              )}
            >
              #{rank}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[var(--card-border)]">
          <div className="flex items-center gap-1.5">
            <Target className="w-3 h-3 text-blue-500 shrink-0" />
            <span className="text-xs text-foreground/60">
              {employee.leads_added}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-green-500 shrink-0" />
            <span className="text-xs text-foreground/60">
              {employee.leads_converted}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="text-xs text-foreground/60 truncate">
              {fmt(employee.commission_earned)}
            </span>
          </div>
        </div>

        {/* Achievement badges */}
        {employee.achievements.length > 0 && (
          <div className="flex items-center gap-1 mt-2">
            <Award className="w-3 h-3 text-foreground/30 shrink-0" />
            <span className="text-[10px] text-foreground/40">
              {employee.achievements.length} achievement
              {employee.achievements.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
