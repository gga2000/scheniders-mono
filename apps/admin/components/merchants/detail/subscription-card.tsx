"use client";

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, Plus, Sparkles, Zap, Repeat, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveTick } from "@/hooks/use-live-tick";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";

interface SubscriptionCardProps {
  merchantId: string;
  tenant: MerchantDetail["tenant"];
  subscription: MerchantDetail["subscription"];
}

const TRIAL_PRESETS = [3, 7, 14, 30];
const SUB_PRESETS = [7, 30, 90];

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function fineCountdown(now: number, target: Date): {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
} {
  const totalMs = target.getTime() - now;
  if (totalMs <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs };
  }
  const seconds = Math.floor((totalMs / 1000) % 60);
  const minutes = Math.floor((totalMs / (1000 * 60)) % 60);
  const hours = Math.floor((totalMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
  return { expired: false, days, hours, minutes, seconds, totalMs };
}

function formatFineCountdown(c: ReturnType<typeof fineCountdown>): string {
  if (c.expired) return "now";
  if (c.days >= 2) return `${c.days} days`;
  if (c.days === 1) return `1d ${c.hours}h`;
  if (c.hours >= 1) return `${c.hours}h ${c.minutes}m`;
  if (c.minutes >= 1) return `${c.minutes}m ${c.seconds}s`;
  return `${c.seconds}s`;
}

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SubscriptionCard({
  merchantId,
  tenant,
  subscription,
}: SubscriptionCardProps) {
  const queryClient = useQueryClient();
  const [customDays, setCustomDays] = useState("");
  const [customMode, setCustomMode] = useState<"trial" | "sub" | null>(null);

  const isTrial = tenant.status === "trial";
  const trialEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const periodEnd = subscription
    ? new Date(subscription.current_period_end)
    : null;
  const periodStart = subscription
    ? new Date(subscription.current_period_start)
    : null;

  // Switch to a 1s ticker when something is < 24h away, otherwise tick once a minute.
  const trialMsLeft = trialEnd ? trialEnd.getTime() - Date.now() : Infinity;
  const periodMsLeft = periodEnd ? periodEnd.getTime() - Date.now() : Infinity;
  const fastTick = Math.min(trialMsLeft, periodMsLeft) <= 24 * 60 * 60 * 1000;
  const tickNow = useLiveTick(fastTick ? 1_000 : 60_000);
  const now = useMemo(() => new Date(tickNow), [tickNow]);

  const trialDaysLeft = trialEnd ? daysBetween(now, trialEnd) : null;
  const periodDaysLeft = periodEnd ? daysBetween(now, periodEnd) : null;
  const trialFine = trialEnd ? fineCountdown(tickNow, trialEnd) : null;
  const periodFine = periodEnd ? fineCountdown(tickNow, periodEnd) : null;

  const trialProgress = useMemo(() => {
    if (!trialEnd || !tenant.created_at) return 0;
    const start = new Date(tenant.created_at);
    const total = trialEnd.getTime() - start.getTime();
    if (total <= 0) return 100;
    const elapsed = now.getTime() - start.getTime();
    return Math.max(0, Math.min(100, (elapsed / total) * 100));
  }, [trialEnd, tenant.created_at, now]);

  const periodProgress = useMemo(() => {
    if (!periodEnd || !periodStart) return 0;
    const total = periodEnd.getTime() - periodStart.getTime();
    if (total <= 0) return 100;
    const elapsed = now.getTime() - periodStart.getTime();
    return Math.max(0, Math.min(100, (elapsed / total) * 100));
  }, [periodEnd, periodStart, now]);

  const extendMutation = useMutation({
    mutationFn: async ({ kind, days }: { kind: "trial" | "sub"; days: number }) => {
      const url =
        kind === "trial"
          ? `/api/merchants/${merchantId}/extend-trial`
          : `/api/merchants/${merchantId}/extend-subscription`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
      setCustomMode(null);
      setCustomDays("");
    },
  });

  const autoRenew = subscription?.auto_renew ?? true;
  const autoRenewMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_renew: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update auto-renew");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
    },
  });

  const handleExtend = (kind: "trial" | "sub", days: number) => {
    if (extendMutation.isPending) return;
    extendMutation.mutate({ kind, days });
  };

  const handleCustom = () => {
    const n = parseInt(customDays, 10);
    if (!Number.isFinite(n) || n <= 0 || !customMode) return;
    handleExtend(customMode, n);
  };

  const trialUrgent = trialDaysLeft !== null && trialDaysLeft <= 3;
  const subUrgent = periodDaysLeft !== null && periodDaysLeft <= 7;
  const trialCritical = !!trialFine && !trialFine.expired && trialFine.totalMs <= 24 * 60 * 60 * 1000;
  const periodCritical = !!periodFine && !periodFine.expired && periodFine.totalMs <= 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-3">
      {/* ── TRIAL CARD ─────────────────────────────────────── */}
      {isTrial && trialEnd && (
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl p-5 border",
            trialUrgent
              ? "bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 dark:from-rose-400/10 dark:via-orange-400/10 dark:to-amber-400/10 border-rose-200 dark:border-rose-400/30"
              : "bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-400/10 dark:via-orange-400/10 dark:to-yellow-400/10 border-amber-200 dark:border-amber-400/30"
          )}
        >
          <div
            aria-hidden
            className={cn(
              "absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl opacity-30",
              trialUrgent ? "bg-rose-300" : "bg-amber-300"
            )}
          />

          <div className="relative flex items-start justify-between mb-4">
            <div>
              <p
                className={cn(
                  "text-[10px] uppercase tracking-[0.1em] font-black flex items-center gap-1.5",
                  trialUrgent
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-amber-700 dark:text-amber-300"
                )}
              >
                <Sparkles className="w-3 h-3" />
                {trialDaysLeft !== null && trialDaysLeft <= 0
                  ? "Trial expired"
                  : "Trial ends in"}
              </p>
              <p
                className={cn(
                  "text-4xl font-black tabular-nums leading-none mt-2 tracking-tight",
                  trialCritical && "animate-pulse-glow",
                  trialUrgent
                    ? "text-rose-900 dark:text-rose-200"
                    : "text-amber-900 dark:text-amber-200"
                )}
              >
                {trialFine && trialCritical ? (
                  <>
                    {trialFine.hours.toString().padStart(2, "0")}
                    <span className="opacity-50">:</span>
                    {trialFine.minutes.toString().padStart(2, "0")}
                    <span className="opacity-50">:</span>
                    {trialFine.seconds.toString().padStart(2, "0")}
                  </>
                ) : trialDaysLeft !== null ? (
                  <>
                    {trialDaysLeft <= 0 ? "0" : trialDaysLeft}
                    <span className="text-base font-bold opacity-60 ml-1.5">
                      {trialDaysLeft === 1 ? "day" : "days"}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </p>
              <p className="text-[11px] text-foreground/55 mt-2 font-medium">
                Ends {fmtDate(trialEnd)}
                {tenant.created_at && (
                  <>
                    <span className="mx-1.5 text-foreground/30">·</span>
                    Started {fmtDate(tenant.created_at)}
                  </>
                )}
              </p>
            </div>
            {trialUrgent && (
              <span className="px-2.5 py-1 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider shadow-sm shadow-rose-500/40 animate-pulse">
                Urgent
              </span>
            )}
          </div>

          {/* progress bar */}
          <div className="relative h-1.5 rounded-full bg-foreground/10 overflow-hidden mb-4">
            <div
              className={cn(
                "absolute left-0 top-0 bottom-0 rounded-full transition-all duration-500",
                trialUrgent
                  ? "bg-gradient-to-r from-rose-400 to-orange-500"
                  : "bg-gradient-to-r from-amber-400 to-orange-500"
              )}
              style={{ width: `${trialProgress}%` }}
            />
          </div>

          {/* extend actions */}
          <div className="relative">
            <p className="text-[10px] uppercase tracking-[0.1em] font-black text-foreground/50 mb-2">
              Extend trial
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {TRIAL_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={extendMutation.isPending}
                  onClick={() => handleExtend("trial", d)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 text-foreground text-[11px] font-bold ring-1 ring-foreground/10 hover:ring-foreground/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3 h-3" />
                  {d}d
                </button>
              ))}
              {customMode === "trial" ? (
                <div className="inline-flex items-center gap-1 bg-white/80 dark:bg-white/10 rounded-full ring-1 ring-foreground/20 pl-3 pr-1 py-0.5">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    autoFocus
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCustom()}
                    placeholder="Days"
                    className="w-14 bg-transparent outline-none text-[11px] font-bold tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={handleCustom}
                    disabled={!customDays || extendMutation.isPending}
                    className="p-1 rounded-full bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
                  >
                    <Zap className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCustomMode("trial")}
                  className="px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/70 hover:text-foreground text-[11px] font-bold transition-colors"
                >
                  Custom...
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SUBSCRIPTION CARD ──────────────────────────────── */}
      {subscription && periodEnd && periodStart && (
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl p-5 border",
            subUrgent
              ? "bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-amber-400/10 dark:via-orange-400/10 dark:to-rose-400/10 border-amber-200 dark:border-amber-400/30"
              : "bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 dark:from-violet-400/10 dark:via-fuchsia-400/10 dark:to-pink-400/10 border-violet-200 dark:border-violet-400/30"
          )}
        >
          <div
            aria-hidden
            className={cn(
              "absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl opacity-30",
              subUrgent ? "bg-amber-300" : "bg-violet-300"
            )}
          />

          <div className="relative flex items-start justify-between mb-4">
            <div>
              <p
                className={cn(
                  "text-[10px] uppercase tracking-[0.1em] font-black flex items-center gap-1.5",
                  subUrgent
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-violet-700 dark:text-violet-300"
                )}
              >
                <Calendar className="w-3 h-3" />
                Next renewal
              </p>
              <p
                className={cn(
                  "text-2xl font-black leading-none mt-2 tracking-tight",
                  subUrgent
                    ? "text-amber-900 dark:text-amber-200"
                    : "text-violet-900 dark:text-violet-200"
                )}
              >
                {fmtDate(periodEnd)}
              </p>
              <p className="text-[11px] text-foreground/55 mt-2 font-medium flex items-center gap-1.5">
                <Clock className={cn("w-3 h-3", periodCritical && "text-rose-500")} />
                {periodFine && periodCritical ? (
                  <span
                    className={cn(
                      "tabular-nums font-bold",
                      periodCritical && "text-rose-600 dark:text-rose-300"
                    )}
                  >
                    {formatFineCountdown(periodFine)}
                  </span>
                ) : periodDaysLeft !== null && periodDaysLeft > 0 ? (
                  `in ${periodDaysLeft} ${periodDaysLeft === 1 ? "day" : "days"}`
                ) : (
                  "Renewal due"
                )}
                <span className="text-foreground/30">·</span>
                {fmtDate(periodStart)} — {fmtDate(periodEnd)}
              </p>
            </div>
            <span
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                subscription.status === "active"
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/40"
                  : "bg-foreground/10 text-foreground/70"
              )}
            >
              {subscription.status}
            </span>
          </div>

          <div className="relative h-1.5 rounded-full bg-foreground/10 overflow-hidden mb-4">
            <div
              className={cn(
                "absolute left-0 top-0 bottom-0 rounded-full transition-all duration-500",
                subUrgent
                  ? "bg-gradient-to-r from-amber-400 to-rose-500"
                  : "bg-gradient-to-r from-violet-500 to-fuchsia-500"
              )}
              style={{ width: `${periodProgress}%` }}
            />
          </div>

          {/* Auto-renew toggle */}
          <div className="relative mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/60 dark:bg-white/5 ring-1 ring-foreground/[0.08]">
            <div className="flex items-center gap-2 min-w-0">
              {autoRenew ? (
                <Repeat className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-foreground leading-none">Auto-renew</p>
                <p className="text-[10px] text-foreground/50 mt-0.5">
                  {autoRenew
                    ? "Charges automatically on renewal"
                    : "Will not charge on renewal"}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoRenew}
              onClick={() => autoRenewMutation.mutate(!autoRenew)}
              disabled={autoRenewMutation.isPending}
              className={cn(
                "relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50",
                autoRenew
                  ? "bg-emerald-500"
                  : "bg-foreground/15 dark:bg-foreground/20"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                  autoRenew && "translate-x-4"
                )}
              />
            </button>
          </div>

          <div className="relative">
            <p className="text-[10px] uppercase tracking-[0.1em] font-black text-foreground/50 mb-2">
              Extend subscription
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {SUB_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={extendMutation.isPending}
                  onClick={() => handleExtend("sub", d)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 text-foreground text-[11px] font-bold ring-1 ring-foreground/10 hover:ring-foreground/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3 h-3" />
                  {d}d
                </button>
              ))}
              {customMode === "sub" ? (
                <div className="inline-flex items-center gap-1 bg-white/80 dark:bg-white/10 rounded-full ring-1 ring-foreground/20 pl-3 pr-1 py-0.5">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    autoFocus
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCustom()}
                    placeholder="Days"
                    className="w-14 bg-transparent outline-none text-[11px] font-bold tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={handleCustom}
                    disabled={!customDays || extendMutation.isPending}
                    className="p-1 rounded-full bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
                  >
                    <Zap className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCustomMode("sub")}
                  className="px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/70 hover:text-foreground text-[11px] font-bold transition-colors"
                >
                  Custom...
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {extendMutation.isError && (
        <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-400/10 border border-rose-200 dark:border-rose-400/30 text-xs text-rose-700 dark:text-rose-300 font-medium">
          {extendMutation.error?.message ?? "Something went wrong"}
        </div>
      )}
    </div>
  );
}
