"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Trophy, Medal, ChevronUp, ChevronDown } from "lucide-react";
import type { AdminEmployee } from "@/types/leads";

interface TeamLeaderboardProps {
  employees: AdminEmployee[];
}

type SortKey =
  | "leads_added"
  | "leads_converted"
  | "stores_built"
  | "commission_earned"
  | "total_actions";

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

const podiumOrder = [1, 0, 2] as const;
const podiumHeights = ["h-28", "h-36", "h-24"] as const;
const podiumColors = [
  "from-gray-300 to-gray-400",
  "from-yellow-300 to-amber-400",
  "from-orange-300 to-orange-400",
] as const;
const podiumLabels = ["2nd", "1st", "3rd"] as const;
const podiumRingColors = [
  "ring-gray-300",
  "ring-yellow-400",
  "ring-orange-400",
] as const;

export function TeamLeaderboard({ employees }: TeamLeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("leads_converted");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    return [...employees].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [employees, sortKey, sortDir]);

  const top3 = sorted.slice(0, 3);
  const hasTop3 = top3.length >= 3;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return null;
    return sortDir === "desc" ? (
      <ChevronDown className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ChevronUp className="w-3 h-3 inline ml-0.5" />
    );
  }

  return (
    <div className="space-y-6">
      {/* Podium Section */}
      {hasTop3 && (
        <div className="pastel-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-foreground">Top Performers</h3>
          </div>

          <div className="flex items-end justify-center gap-4 md:gap-8">
            {podiumOrder.map((idx, visualIdx) => {
              const emp = top3[idx];
              if (!emp) return null;
              const initial = (emp.display_name ?? emp.email)
                .charAt(0)
                .toUpperCase();

              return (
                <Link
                  key={emp.id}
                  href={`/team/${emp.id}`}
                  className="flex flex-col items-center group"
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      "w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center text-white font-bold text-lg ring-4 mb-2 transition-transform group-hover:scale-105",
                      podiumRingColors[visualIdx]
                    )}
                    style={{
                      background: emp.avatar_url
                        ? `url(${emp.avatar_url}) center/cover`
                        : undefined,
                      backgroundColor: emp.avatar_url
                        ? undefined
                        : "var(--primary)",
                    }}
                  >
                    {!emp.avatar_url && initial}
                  </div>

                  {/* Name */}
                  <p className="text-xs font-bold text-foreground text-center truncate max-w-[100px]">
                    {emp.display_name ?? emp.email.split("@")[0]}
                  </p>

                  {/* Stats */}
                  <p className="text-[10px] text-foreground/50 mt-0.5">
                    {emp.leads_converted} conversions
                  </p>
                  <p className="text-[10px] font-semibold text-green-600 mt-0.5">
                    {fmt(emp.commission_earned)} IQD
                  </p>

                  {/* Podium bar */}
                  <div
                    className={cn(
                      "w-20 md:w-24 rounded-t-xl mt-3 flex items-start justify-center pt-2 bg-gradient-to-b",
                      podiumHeights[visualIdx],
                      podiumColors[visualIdx]
                    )}
                  >
                    <span className="text-sm font-bold text-white/90">
                      {podiumLabels[visualIdx]}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Ranking Table */}
      <div className="pastel-card overflow-hidden">
        <div className="p-4 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2">
            <Medal className="w-5 h-5 text-foreground/50" />
            <h3 className="font-bold text-foreground">Full Rankings</h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/50 w-12">
                  #
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/50">
                  Employee
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-foreground/50 cursor-pointer hover:text-foreground transition-colors select-none"
                  onClick={() => handleSort("leads_added")}
                >
                  Leads Added
                  <SortIcon column="leads_added" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-foreground/50 cursor-pointer hover:text-foreground transition-colors select-none"
                  onClick={() => handleSort("leads_converted")}
                >
                  Converted
                  <SortIcon column="leads_converted" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-foreground/50 cursor-pointer hover:text-foreground transition-colors select-none"
                  onClick={() => handleSort("stores_built")}
                >
                  Stores Built
                  <SortIcon column="stores_built" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-foreground/50 cursor-pointer hover:text-foreground transition-colors select-none"
                  onClick={() => handleSort("commission_earned")}
                >
                  Commission
                  <SortIcon column="commission_earned" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-foreground/50 cursor-pointer hover:text-foreground transition-colors select-none"
                  onClick={() => handleSort("total_actions")}
                >
                  Actions
                  <SortIcon column="total_actions" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-foreground/40 text-sm"
                  >
                    No team members yet
                  </td>
                </tr>
              ) : (
                sorted.map((emp, i) => {
                  const initial = (emp.display_name ?? emp.email)
                    .charAt(0)
                    .toUpperCase();
                  return (
                    <tr
                      key={emp.id}
                      className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "text-xs font-bold",
                            i === 0
                              ? "text-amber-500"
                              : i === 1
                                ? "text-gray-400"
                                : i === 2
                                  ? "text-orange-400"
                                  : "text-foreground/40"
                          )}
                        >
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/team/${emp.id}`}
                          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                        >
                          {emp.avatar_url ? (
                            <img
                              src={emp.avatar_url}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {initial}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {emp.display_name ?? emp.email.split("@")[0]}
                            </p>
                            <p className="text-[10px] text-foreground/40 truncate">
                              {emp.email}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-foreground/70 tabular-nums">
                        {fmt(emp.leads_added)}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground/70 tabular-nums">
                        {fmt(emp.leads_converted)}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground/70 tabular-nums">
                        {fmt(emp.stores_built)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">
                        {fmt(emp.commission_earned)}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground/70 tabular-nums">
                        {fmt(emp.total_actions)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
