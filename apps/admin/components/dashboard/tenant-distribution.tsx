"use client";

import { PieChart } from "lucide-react";
import { useMemo } from "react";

interface TenantDistributionProps {
  byPlan: Record<string, number>;
  byStatus: Record<string, number>;
  byCity: Record<string, number>;
  isLoading?: boolean;
}

const PLAN_COLORS: Record<string, string> = {
  starter: "#A6C8FF",
  growth: "#C0EBA6",
  professional: "#E4C1F9",
  enterprise: "#FBE38E",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#C0EBA6",
  trial: "#FBE38E",
  suspended: "#F4C7CF",
  cancelled: "#9A9A9A",
};

function StackedBar({
  data,
  colorMap,
}: {
  data: Record<string, number>;
  colorMap: Record<string, string>;
}) {
  const total = Object.values(data).reduce((sum, v) => sum + v, 0);

  if (total === 0) {
    return (
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-200/50">
        <div className="w-full bg-gray-200/40" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        {Object.entries(data).map(([key, count]) => {
          if (count === 0) return null;
          const widthPercent = (count / total) * 100;
          return (
            <div
              key={key}
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${widthPercent}%`,
                backgroundColor: colorMap[key] || "#D1D5DB",
                minWidth: count > 0 ? "4px" : "0px",
              }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-2 text-xs">
        {Object.entries(data).map(([key, count]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: colorMap[key] || "#D1D5DB" }}
            />
            <span className="text-foreground/70 capitalize">{key}</span>
            <span className="font-semibold text-foreground">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonBar() {
  return (
    <div>
      <div className="h-3 rounded-full bg-gray-200/50 animate-pulse" />
      <div className="flex gap-3 mt-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-16 rounded bg-gray-200/40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function SkeletonCityRow() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-4 w-20 rounded bg-gray-200/40 animate-pulse" />
      <div className="flex-1 h-6 rounded-lg bg-gray-200/30 animate-pulse" />
      <div className="h-4 w-8 rounded bg-gray-200/40 animate-pulse" />
    </div>
  );
}

export function TenantDistribution({
  byPlan,
  byStatus,
  byCity,
  isLoading,
}: TenantDistributionProps) {
  const topCities = useMemo(() => {
    return Object.entries(byCity)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [byCity]);

  const maxCityCount = topCities.length > 0 ? topCities[0][1] : 0;

  return (
    <div className="pastel-card p-5 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <PieChart className="h-5 w-5 text-foreground/60" />
        <h3 className="text-lg font-bold text-foreground">
          Tenant Distribution
        </h3>
      </div>

      {/* By Plan */}
      <div>
        <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-3">
          By Plan
        </p>
        {isLoading ? <SkeletonBar /> : <StackedBar data={byPlan} colorMap={PLAN_COLORS} />}
      </div>

      {/* By Status */}
      <div>
        <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-3">
          By Status
        </p>
        {isLoading ? <SkeletonBar /> : <StackedBar data={byStatus} colorMap={STATUS_COLORS} />}
      </div>

      {/* Top Cities */}
      <div>
        <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-3">
          Top Cities
        </p>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonCityRow key={i} />
            ))}
          </div>
        ) : topCities.length === 0 ? (
          <p className="text-sm text-foreground/50">No city data available</p>
        ) : (
          <div className="space-y-2">
            {topCities.map(([city, count]) => (
              <div key={city} className="flex items-center gap-3">
                <span className="text-sm text-foreground/80 w-24 truncate flex-shrink-0 capitalize">
                  {city}
                </span>
                <div className="flex-1 h-6 rounded-lg bg-[var(--pastel-blue)]/20 relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-lg bg-[var(--pastel-blue)]/50 transition-all duration-500"
                    style={{
                      width: maxCityCount > 0 ? `${(count / maxCityCount) * 100}%` : "0%",
                    }}
                  />
                </div>
                <span className="text-sm font-semibold text-foreground w-8 text-right flex-shrink-0">
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
