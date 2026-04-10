"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  AlertTriangle,
  Calendar,
  Plus,
  ChevronRight,
  Timer,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Trial {
  id: string;
  business_name: string;
  slug: string;
  plan: string;
  status: string;
  trial_ends_at: string;
  city: string | null;
  contact_email: string | null;
  created_at: string;
  balance_iqd: number;
  days_remaining: number;
  is_expired: boolean;
}

interface TrialsSummary {
  total: number;
  expiringSoon: number;
  expired: number;
  healthy: number;
}

interface TrialsResponse {
  trials: Trial[];
  summary: TrialsSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount) + " IQD";
}

function getBarColor(days: number): string {
  if (days <= 0) return "bg-gray-400";
  if (days <= 3) return "bg-red-500";
  if (days <= 7) return "bg-amber-500";
  return "bg-green-500";
}

function getBarBg(days: number): string {
  if (days <= 0) return "bg-gray-200";
  if (days <= 3) return "bg-red-100";
  if (days <= 7) return "bg-amber-100";
  return "bg-green-100";
}

function getBarPercent(days: number): number {
  if (days <= 0) return 100;
  // Assume 30-day max for visual scale
  return Math.min(100, Math.max(5, (days / 30) * 100));
}

// ---------------------------------------------------------------------------
// Extend Button Component
// ---------------------------------------------------------------------------

function ExtendTrialButton({ tenantId }: { tenantId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await fetch("/api/trials/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, days }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to extend trial");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "trials"] });
      setIsOpen(false);
    },
  });

  const presets = [
    { label: "+3 days", days: 3 },
    { label: "+7 days", days: 7 },
    { label: "+14 days", days: 14 },
    { label: "+30 days", days: 30 },
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground/70 hover:text-foreground text-xs font-semibold transition-all border border-[var(--card-border)]"
      >
        <Plus className="w-3.5 h-3.5" />
        Extend
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {presets.map((p) => (
        <button
          key={p.days}
          onClick={() => mutation.mutate(p.days)}
          disabled={mutation.isPending}
          className="px-2.5 py-1 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-xs font-semibold text-foreground/70 hover:text-foreground transition-all border border-[var(--card-border)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => setIsOpen(false)}
        className="px-2 py-1 rounded-lg text-xs text-foreground/40 hover:text-foreground/70 transition-colors"
      >
        Cancel
      </button>
      {mutation.isPending && (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground/40" />
      )}
      {mutation.isError && (
        <span className="text-[10px] text-red-600 font-medium">
          {mutation.error.message}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TrialsPage() {
  const { data, isLoading } = useQuery<TrialsResponse>({
    queryKey: ["admin", "trials"],
    queryFn: async () => {
      const res = await fetch("/api/trials");
      if (!res.ok) throw new Error("Failed to fetch trials");
      return res.json();
    },
    staleTime: 30_000,
  });

  const trials = data?.trials ?? [];
  const summary = data?.summary ?? { total: 0, expiringSoon: 0, expired: 0, healthy: 0 };

  // Sort: expired first, then by days_remaining ascending (most urgent first)
  const sortedTrials = [...trials].sort((a, b) => {
    if (a.is_expired && !b.is_expired) return -1;
    if (!a.is_expired && b.is_expired) return 1;
    return a.days_remaining - b.days_remaining;
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Clock className="w-6 h-6" />
          Trial Management
        </h1>
        <p className="text-foreground-muted mt-1">
          {isLoading
            ? "Loading..."
            : `${summary.total} active trial${summary.total !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 md:gap-6 grid-cols-1 sm:grid-cols-3">
        {/* Active Trials - Yellow */}
        <div className="pastel-card pastel-card-yellow p-4 md:p-6 relative overflow-hidden">
          <div className="flex items-start justify-between mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <Timer className="h-5 w-5 md:h-6 md:w-6 text-amber-700" />
            </div>
            <span className="px-2.5 md:px-3 py-1 rounded-full bg-amber-600/20 text-amber-800 text-[10px] md:text-xs font-bold uppercase tracking-wider">
              Active
            </span>
          </div>
          <div className="space-y-1 md:space-y-2">
            <h3 className="text-xs md:text-sm font-semibold text-amber-900/70 uppercase tracking-wider">
              Active Trials
            </h3>
            {isLoading ? (
              <div className="h-10 md:h-14 w-24 md:w-32 rounded-lg bg-white/40 animate-pulse" />
            ) : (
              <p className="text-3xl md:text-5xl font-bold text-amber-950 tracking-tight">
                {summary.total}
              </p>
            )}
          </div>
          <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
            <Timer className="h-24 w-24 text-amber-900" />
          </div>
        </div>

        {/* Expiring Soon - Pink */}
        <div className="pastel-card pastel-card-pink p-4 md:p-6 relative overflow-hidden">
          <div className="flex items-start justify-between mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-rose-700" />
            </div>
            <span className="px-2.5 md:px-3 py-1 rounded-full bg-rose-600/20 text-rose-800 text-[10px] md:text-xs font-bold uppercase tracking-wider">
              Urgent
            </span>
          </div>
          <div className="space-y-1 md:space-y-2">
            <h3 className="text-xs md:text-sm font-semibold text-rose-900/70 uppercase tracking-wider">
              Expiring Soon
            </h3>
            {isLoading ? (
              <div className="h-10 md:h-14 w-24 md:w-32 rounded-lg bg-white/40 animate-pulse" />
            ) : (
              <p className="text-3xl md:text-5xl font-bold text-rose-950 tracking-tight">
                {summary.expiringSoon}
              </p>
            )}
            <p className="text-xs md:text-sm text-rose-800/70 font-medium">
              &le; 3 days
            </p>
          </div>
          <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
            <AlertTriangle className="h-24 w-24 text-rose-900" />
          </div>
        </div>

        {/* Expired - Gray */}
        <div className="pastel-card p-4 md:p-6 relative overflow-hidden">
          <div className="flex items-start justify-between mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-foreground/5 flex items-center justify-center shadow-sm">
              <Calendar className="h-5 w-5 md:h-6 md:w-6 text-foreground/50" />
            </div>
            <span className="px-2.5 md:px-3 py-1 rounded-full bg-foreground/5 text-foreground/60 text-[10px] md:text-xs font-bold uppercase tracking-wider">
              Expired
            </span>
          </div>
          <div className="space-y-1 md:space-y-2">
            <h3 className="text-xs md:text-sm font-semibold text-foreground/50 uppercase tracking-wider">
              Expired
            </h3>
            {isLoading ? (
              <div className="h-10 md:h-14 w-24 md:w-32 rounded-lg bg-foreground/5 animate-pulse" />
            ) : (
              <p className="text-3xl md:text-5xl font-bold text-foreground/70 tracking-tight">
                {summary.expired}
              </p>
            )}
            <p className="text-xs md:text-sm text-foreground/40 font-medium">
              needs action
            </p>
          </div>
          <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
            <Calendar className="h-24 w-24 text-foreground/30" />
          </div>
        </div>
      </div>

      {/* Trial List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
        </div>
      ) : sortedTrials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-foreground/40">
          <Clock className="w-12 h-12 mb-3" />
          <p className="text-lg font-semibold">No active trials</p>
          <p className="text-sm mt-1">All merchants have been converted or there are no trials yet</p>
        </div>
      ) : (
        <div className="pastel-card divide-y divide-[var(--card-border)]">
          {sortedTrials.map((trial) => (
            <div
              key={trial.id}
              className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4"
            >
              {/* Left: Business info */}
              <div className="md:w-1/4 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center text-foreground/60 font-bold text-xs shrink-0">
                    {trial.business_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {trial.business_name}
                    </p>
                    <p className="text-[11px] text-foreground/50 truncate">
                      {trial.slug}
                      {trial.city ? ` \u00b7 ${trial.city}` : ""}
                    </p>
                  </div>
                </div>
              </div>

              {/* Center: Countdown bar */}
              <div className="md:flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className={`h-2.5 rounded-full ${getBarBg(trial.days_remaining)} overflow-hidden`}>
                      <div
                        className={`h-full rounded-full ${getBarColor(trial.days_remaining)} transition-all duration-500`}
                        style={{
                          width: trial.is_expired
                            ? "100%"
                            : `${getBarPercent(trial.days_remaining)}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <p
                        className={`text-xs font-semibold ${
                          trial.is_expired
                            ? "text-foreground/40"
                            : trial.days_remaining <= 3
                              ? "text-red-600"
                              : trial.days_remaining <= 7
                                ? "text-amber-600"
                                : "text-green-600"
                        }`}
                      >
                        {trial.is_expired
                          ? `Expired ${Math.abs(trial.days_remaining)} day${Math.abs(trial.days_remaining) !== 1 ? "s" : ""} ago`
                          : `${trial.days_remaining} day${trial.days_remaining !== 1 ? "s" : ""} remaining`}
                      </p>
                      <p className="text-[10px] text-foreground/40">
                        {new Date(trial.trial_ends_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-foreground/20 hidden md:block shrink-0" />
                </div>
              </div>

              {/* Right: Balance + Extend */}
              <div className="md:w-1/4 flex items-center justify-between md:justify-end gap-3">
                <span className="text-sm font-medium text-foreground/70">
                  {formatIQD(trial.balance_iqd)}
                </span>
                <ExtendTrialButton tenantId={trial.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
