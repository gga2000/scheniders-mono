"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Check, X, ListChecks, Filter } from "lucide-react";
import type { TenantOnboarding } from "@/types/dashboard";

interface OnboardingTrackerProps {
  tenants: TenantOnboarding[] | undefined;
}

const STEPS = [
  { key: "has_orders", label: "Has Orders" },
  { key: "team", label: "Team" },
  { key: "branding", label: "Branding" },
  { key: "storefront", label: "Storefront" },
  { key: "wallet", label: "Wallet" },
];

function Skeleton() {
  return (
    <div className="space-y-2 mt-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-12 rounded-lg bg-gray-200/30 animate-pulse"
        />
      ))}
    </div>
  );
}

export function OnboardingTracker({ tenants }: OnboardingTrackerProps) {
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    if (!tenants) return [];
    let list = [...tenants];
    if (incompleteOnly) {
      list = list.filter((t) => t.completionPct < 100);
    }
    list.sort((a, b) =>
      sortAsc
        ? a.completionPct - b.completionPct
        : b.completionPct - a.completionPct,
    );
    return list;
  }, [tenants, incompleteOnly, sortAsc]);

  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)]/40 flex items-center justify-center">
            <ListChecks className="w-4 h-4 text-amber-700" />
          </div>
          <h3 className="font-bold text-foreground text-sm">
            Onboarding Progress
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIncompleteOnly(!incompleteOnly)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border ${
              incompleteOnly
                ? "bg-[var(--pastel-yellow)] border-amber-300 text-amber-900"
                : "bg-[var(--background)] border-[var(--card-border)] text-foreground/60 hover:text-foreground"
            }`}
          >
            <Filter className="h-3 w-3" />
            Incomplete
          </button>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--background)] border border-[var(--card-border)] text-foreground/60 hover:text-foreground transition-colors"
          >
            {sortAsc ? "Low first" : "High first"}
          </button>
        </div>
      </div>

      {!tenants ? (
        <Skeleton />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-foreground/50 text-center py-8">
          {incompleteOnly
            ? "All tenants have completed onboarding!"
            : "No onboarding data available"}
        </p>
      ) : (
        <>
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_100px_50px] gap-2 px-3 mb-2">
            <span className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">
              Business
            </span>
            <div className="flex gap-3">
              {STEPS.map((s) => (
                <span
                  key={s.key}
                  className="w-7 text-center text-[9px] font-semibold text-foreground/40 uppercase"
                  title={s.label}
                >
                  {s.label.slice(0, 3)}
                </span>
              ))}
            </div>
            <span className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider text-right">
              Progress
            </span>
            <span className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider text-right">
              %
            </span>
          </div>

          {/* Scrollable rows */}
          <div className="max-h-[420px] overflow-y-auto space-y-1">
            {filtered.slice(0, 10).map((tenant) => (
              <Link
                key={tenant.tenantId}
                href={`/merchants/${tenant.tenantId}`}
                className="grid grid-cols-1 sm:grid-cols-[1fr_auto_100px_50px] gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-[var(--background)]/80 transition-colors cursor-pointer border border-transparent hover:border-[var(--card-border)]/50"
              >
                {/* Business name */}
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tenant.primaryColor || "#9CA3AF" }}
                  />
                  <span className="text-sm font-medium text-foreground truncate">
                    {tenant.businessName}
                  </span>
                </div>

                {/* Step icons */}
                <div className="flex gap-3">
                  {STEPS.map((step) => {
                    const done = tenant.completedSteps.includes(step.key);
                    return (
                      <div
                        key={step.key}
                        className={`w-7 h-7 rounded-full flex items-center justify-center ${
                          done
                            ? "bg-green-100 text-green-700"
                            : "bg-red-50 text-red-400"
                        }`}
                        title={step.label}
                      >
                        {done ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-gray-200/50 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${tenant.completionPct}%`,
                      backgroundColor:
                        tenant.completionPct === 100
                          ? "var(--pastel-green)"
                          : tenant.completionPct >= 60
                            ? "var(--pastel-yellow)"
                            : "var(--pastel-pink)",
                    }}
                  />
                </div>

                {/* Percentage */}
                <span className="text-sm font-bold text-foreground text-right">
                  {tenant.completionPct}%
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
