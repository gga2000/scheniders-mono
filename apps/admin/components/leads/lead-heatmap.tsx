"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Lead, Industry } from "@/types/leads";
import { Map, BarChart3, Trophy, Globe } from "lucide-react";

// ── Governorate definitions ────────────────────────────────────────────

const GOVERNORATES = [
  { code: "DH", name: "Duhok" },
  { code: "AR", name: "Erbil" },
  { code: "SU", name: "Sulaymaniyah" },
  { code: "NI", name: "Nineveh" },
  { code: "KI", name: "Kirkuk" },
  { code: "SA", name: "Saladin" },
  { code: "AN", name: "Anbar" },
  { code: "DI", name: "Diyala" },
  { code: "BG", name: "Baghdad" },
  { code: "KA", name: "Karbala" },
  { code: "BB", name: "Babylon" },
  { code: "WA", name: "Wasit" },
  { code: "NA", name: "Najaf" },
  { code: "QA", name: "Qadisiyyah" },
  { code: "DQ", name: "Dhi Qar" },
  { code: "MU", name: "Muthanna" },
  { code: "MY", name: "Maysan" },
  { code: "BA", name: "Basra" },
] as const;

type ViewMode = "density" | "industry";

interface LeadHeatmapProps {
  leads: Lead[];
  industries: Industry[];
}

// ── Helpers ────────────────────────────────────────────────────────────

function getIntensityColor(intensity: number): string {
  if (intensity <= 0) return "rgba(var(--primary-rgb, 99,102,241), 0.04)";
  // Scale from 0.1 to 0.85 opacity of the primary color
  const alpha = 0.1 + intensity * 0.75;
  return `rgba(var(--primary-rgb, 99,102,241), ${alpha.toFixed(2)})`;
}

function getIntensityTextClass(intensity: number): string {
  return intensity > 0.55 ? "text-[var(--primary-fg)]" : "text-[var(--foreground)]";
}

function getIntensityMutedClass(intensity: number): string {
  return intensity > 0.55 ? "text-[var(--primary-fg)] opacity-70" : "text-[var(--muted)]";
}

// ── Component ──────────────────────────────────────────────────────────

export function LeadHeatmap({ leads, industries }: LeadHeatmapProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("density");

  // Count leads per governorate
  const governorateData = useMemo(() => {
    const counts: Record<string, number> = {};
    const industryMap: Record<string, Record<string, number>> = {};

    for (const lead of leads) {
      const code = lead.governorate_code;
      if (!code) continue;
      counts[code] = (counts[code] || 0) + 1;

      // Track industry per governorate
      const indId = lead.industry_id || "__none__";
      if (!industryMap[code]) industryMap[code] = {};
      industryMap[code][indId] = (industryMap[code][indId] || 0) + 1;
    }

    const maxCount = Math.max(...Object.values(counts), 1);

    return { counts, maxCount, industryMap };
  }, [leads]);

  // Build industry lookup
  const industryLookup = useMemo(() => {
    const map: Record<string, Industry> = {};
    for (const ind of industries) {
      map[ind.id] = ind;
    }
    return map;
  }, [industries]);

  // Get top industry for a governorate
  const getTopIndustry = (code: string): Industry | null => {
    const indMap = governorateData.industryMap[code];
    if (!indMap) return null;

    let topId = "";
    let topCount = 0;
    for (const [id, count] of Object.entries(indMap)) {
      if (count > topCount && id !== "__none__") {
        topId = id;
        topCount = count;
      }
    }

    return topId ? industryLookup[topId] || null : null;
  };

  // Stats
  const stats = useMemo(() => {
    const sorted = GOVERNORATES.map((g) => ({
      ...g,
      count: governorateData.counts[g.code] || 0,
    })).sort((a, b) => b.count - a.count);

    const withLeads = sorted.filter((g) => g.count > 0).length;
    const top3 = sorted.slice(0, 3);
    const totalLeads = leads.filter((l) => l.governorate_code).length;

    return { top3, coverage: withLeads, totalLeads };
  }, [governorateData, leads]);

  // Unique active industries for legend
  const activeIndustries = useMemo(() => {
    const ids = new Set<string>();
    for (const gov of GOVERNORATES) {
      const topInd = getTopIndustry(gov.code);
      if (topInd) ids.add(topInd.id);
    }
    return Array.from(ids)
      .map((id) => industryLookup[id])
      .filter(Boolean) as Industry[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [governorateData, industryLookup]);

  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
            <Map className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">
              Lead Heatmap
            </h3>
            <p className="text-[11px] text-[var(--muted)]">
              {stats.totalLeads} leads across {stats.coverage} of 18 governorates
            </p>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.04] rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("density")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              viewMode === "density"
                ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            <Map className="w-3.5 h-3.5" />
            Density
          </button>
          <button
            onClick={() => setViewMode("industry")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              viewMode === "industry"
                ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Industry
          </button>
        </div>
      </div>

      {/* ── Grid Heatmap ───────────────────────────────── */}
      <div className="p-5">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {GOVERNORATES.map((gov) => {
            const count = governorateData.counts[gov.code] || 0;
            const intensity = governorateData.maxCount > 0
              ? Math.min(count / governorateData.maxCount, 1)
              : 0;
            const topIndustry = getTopIndustry(gov.code);

            return (
              <div
                key={gov.code}
                className={cn(
                  "relative rounded-xl p-3 transition-all duration-200 group/cell cursor-default",
                  "border border-transparent hover:border-[var(--card-border)] hover:shadow-sm"
                )}
                style={{
                  backgroundColor:
                    viewMode === "density"
                      ? getIntensityColor(intensity)
                      : count > 0
                        ? "rgba(var(--primary-rgb, 99,102,241), 0.04)"
                        : "rgba(var(--primary-rgb, 99,102,241), 0.02)",
                }}
                title={`${gov.name}: ${count} lead${count !== 1 ? "s" : ""}${
                  topIndustry ? ` | Top: ${topIndustry.name}` : ""
                }`}
              >
                {/* Governorate code */}
                <div
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider mb-1",
                    viewMode === "density"
                      ? getIntensityMutedClass(intensity)
                      : "text-[var(--muted)]"
                  )}
                >
                  {gov.code}
                </div>

                {/* Governorate name */}
                <div
                  className={cn(
                    "text-xs font-semibold truncate mb-1",
                    viewMode === "density"
                      ? getIntensityTextClass(intensity)
                      : "text-[var(--foreground)]"
                  )}
                >
                  {gov.name}
                </div>

                {/* Density mode: show count */}
                {viewMode === "density" && (
                  <div
                    className={cn(
                      "text-lg font-extrabold leading-none",
                      count === 0
                        ? "text-[var(--muted)] opacity-40"
                        : getIntensityTextClass(intensity)
                    )}
                  >
                    {count}
                  </div>
                )}

                {/* Industry mode: show top industry dot + name */}
                {viewMode === "industry" && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {topIndustry ? (
                      <>
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: topIndustry.color }}
                        />
                        <span className="text-[10px] text-[var(--foreground)] font-medium truncate">
                          {topIndustry.name}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] text-[var(--muted)] italic">
                        {count > 0 ? "Mixed" : "None"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Industry Legend (industry mode) ──────────── */}
        {viewMode === "industry" && activeIndustries.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
            <div className="text-[10px] uppercase tracking-wider font-medium text-[var(--muted)] mb-2">
              Industries
            </div>
            <div className="flex flex-wrap gap-3">
              {activeIndustries.map((ind) => (
                <div key={ind.id} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: ind.color }}
                  />
                  <span className="text-xs text-[var(--foreground)]">
                    {ind.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Density Legend (density mode) ────────────── */}
        {viewMode === "density" && (
          <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--muted)]">
                Density Scale
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[var(--muted)]">0</span>
                <div className="flex h-2 rounded-full overflow-hidden">
                  {[0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((v) => (
                    <div
                      key={v}
                      className="w-5 h-2"
                      style={{ backgroundColor: getIntensityColor(v) }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-[var(--muted)]">
                  {governorateData.maxCount}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Stats Summary ──────────────────────────────── */}
      <div className="grid grid-cols-3 border-t border-[var(--card-border)] divide-x divide-[var(--card-border)]">
        {/* Total leads */}
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Globe className="w-3.5 h-3.5 text-[var(--muted)]" />
            <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--muted)]">
              Total Mapped
            </span>
          </div>
          <div className="text-lg font-bold text-[var(--foreground)]">
            {stats.totalLeads}
          </div>
        </div>

        {/* Coverage */}
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Map className="w-3.5 h-3.5 text-[var(--muted)]" />
            <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--muted)]">
              Coverage
            </span>
          </div>
          <div className="text-lg font-bold text-[var(--foreground)]">
            {stats.coverage}
            <span className="text-sm font-normal text-[var(--muted)]"> / 18</span>
          </div>
        </div>

        {/* Top 3 */}
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Trophy className="w-3.5 h-3.5 text-[var(--muted)]" />
            <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--muted)]">
              Top Governorates
            </span>
          </div>
          <div className="space-y-0.5">
            {stats.top3.map((g, i) => (
              <div key={g.code} className="flex items-center gap-1.5 text-xs">
                <span className="text-[var(--muted)] font-mono w-3">{i + 1}.</span>
                <span className="font-semibold text-[var(--foreground)] truncate">
                  {g.name}
                </span>
                <span className="text-[var(--muted)] ml-auto shrink-0">
                  {g.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
