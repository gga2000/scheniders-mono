"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Wallet,
  Ban,
  CheckCircle2,
  Zap,
  ChevronDown,
  CreditCard,
  Check,
  ArrowRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui";
import { cn } from "@/lib/utils";
import { PauseButton } from "./pause-button";
import { ConvertTrialButton } from "./convert-trial-button";
import type { TenantStatus, PlanTier } from "@/types/admin";

interface MerchantActionBarProps {
  merchantId: string;
  status: TenantStatus;
  plan: PlanTier;
  walletBalance: number;
}

const TOPUP_PRESETS = [5_000, 10_000, 50_000, 100_000];

const PLAN_OPTIONS: Array<{ value: PlanTier; label: string; gradient: string }> = [
  {
    value: "starter",
    label: "Starter",
    gradient: "bg-gradient-to-br from-sky-400 to-cyan-500",
  },
  {
    value: "growth",
    label: "Growth",
    gradient: "bg-gradient-to-br from-emerald-400 to-teal-500",
  },
  {
    value: "professional",
    label: "Pro",
    gradient: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
  },
  {
    value: "enterprise",
    label: "Enterprise",
    gradient: "bg-gradient-to-br from-amber-400 to-orange-500",
  },
];

function fmtIQD(n: number): string {
  return new Intl.NumberFormat("en-IQ").format(n);
}

export function MerchantActionBar({
  merchantId,
  status,
  plan,
  walletBalance,
}: MerchantActionBarProps) {
  const queryClient = useQueryClient();
  const [topupOpen, setTopupOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [topupReason, setTopupReason] = useState("");
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PlanTier | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
  };

  const topupMutation = useMutation({
    mutationFn: async ({ amount, description }: { amount: number; description: string }) => {
      const res = await fetch(`/api/billing/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: merchantId,
          amount,
          description: description || "Admin top-up",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Top-up failed");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setTopupOpen(false);
      setTopupAmount(null);
      setCustomAmount("");
      setTopupReason("");
    },
  });

  const planMutation = useMutation({
    mutationFn: async (newPlan: PlanTier) => {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Plan change failed");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setPlanOpen(false);
      setPendingPlan(null);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: TenantStatus) => {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Status change failed");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setConfirmSuspend(false);
    },
  });

  const handleTopUp = () => {
    const amount = topupAmount ?? parseInt(customAmount.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(amount) || amount <= 0) return;
    topupMutation.mutate({ amount, description: topupReason });
  };

  const isSuspended = status === "suspended";
  const isLimited = status === "limited";
  const isTrial = status === "trial";
  const error =
    topupMutation.error ?? planMutation.error ?? statusMutation.error ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isTrial && <ConvertTrialButton merchantId={merchantId} />}
      {/* TOP UP */}
      <Popover open={topupOpen} onOpenChange={setTopupOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-xs font-bold shadow-sm shadow-emerald-500/30 ring-1 ring-white/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Wallet className="w-3.5 h-3.5" />
            Top Up
            <ChevronDown
              className={cn(
                "w-3 h-3 transition-transform opacity-80",
                topupOpen && "rotate-180"
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-foreground/50">
              Top Up Wallet
            </p>
            <p className="text-[10px] font-medium text-foreground/40 tabular-nums">
              Current: {fmtIQD(walletBalance)} IQD
            </p>
          </div>

          {/* preset amounts */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {TOPUP_PRESETS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setTopupAmount(amt);
                  setCustomAmount("");
                }}
                className={cn(
                  "px-3 py-2 rounded-xl text-xs font-bold tabular-nums transition-all",
                  topupAmount === amt
                    ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm shadow-emerald-500/30 ring-1 ring-white/20"
                    : "bg-foreground/[0.04] hover:bg-foreground/10 text-foreground"
                )}
              >
                +{fmtIQD(amt)}
                <span className="text-[9px] font-medium opacity-60 ml-0.5">IQD</span>
              </button>
            ))}
          </div>

          {/* custom */}
          <div className="relative mb-3">
            <input
              type="text"
              inputMode="numeric"
              value={customAmount}
              placeholder="Custom amount..."
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                setCustomAmount(v);
                setTopupAmount(null);
              }}
              className="w-full px-3 py-2 pr-12 rounded-xl bg-foreground/[0.04] border border-transparent focus:border-foreground/20 outline-none text-xs font-bold tabular-nums placeholder:font-medium placeholder:text-foreground/40"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-foreground/40">
              IQD
            </span>
          </div>

          {/* reason */}
          <input
            type="text"
            value={topupReason}
            placeholder="Reason (optional)..."
            onChange={(e) => setTopupReason(e.target.value)}
            className="w-full px-3 py-2 mb-3 rounded-xl bg-foreground/[0.04] border border-transparent focus:border-foreground/20 outline-none text-xs placeholder:text-foreground/40"
          />

          <button
            type="button"
            onClick={handleTopUp}
            disabled={
              topupMutation.isPending ||
              (!topupAmount && !customAmount)
            }
            className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-black shadow-sm shadow-emerald-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
          >
            {topupMutation.isPending ? (
              <>Processing...</>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                Confirm Top Up
              </>
            )}
          </button>
        </PopoverContent>
      </Popover>

      {/* CHANGE PLAN */}
      <Popover open={planOpen} onOpenChange={setPlanOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-xs font-bold shadow-sm shadow-violet-500/30 ring-1 ring-white/20 hover:scale-105 active:scale-95 transition-all"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Change Plan
            <ChevronDown
              className={cn(
                "w-3 h-3 transition-transform opacity-80",
                planOpen && "rotate-180"
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 p-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl"
        >
          {pendingPlan ? (
            <div className="p-3 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-foreground/50">
                Confirm Plan Change
              </p>
              <div className="flex items-center gap-2.5">
                {(() => {
                  const fromPlan = PLAN_OPTIONS.find((o) => o.value === plan);
                  const toPlan = PLAN_OPTIONS.find((o) => o.value === pendingPlan);
                  return (
                    <>
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white ring-1 ring-white/20 shadow-sm",
                          fromPlan?.gradient ?? "bg-foreground/30"
                        )}
                      >
                        {fromPlan?.label ?? plan}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white ring-1 ring-white/20 shadow-sm",
                          toPlan?.gradient ?? "bg-foreground/30"
                        )}
                      >
                        {toPlan?.label ?? pendingPlan}
                      </span>
                    </>
                  );
                })()}
              </div>
              <p className="text-[11px] text-foreground/60 leading-snug">
                The merchant&rsquo;s subscription tier will change immediately. Billing
                may be prorated by your payment provider.
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => planMutation.mutate(pendingPlan)}
                  disabled={planMutation.isPending}
                  className="flex-1 px-3 py-2 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 text-white text-[11px] font-black shadow-sm shadow-violet-500/40 ring-1 ring-white/20 disabled:opacity-50 transition-all"
                >
                  {planMutation.isPending ? "Changing..." : "Confirm Change"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPlan(null)}
                  disabled={planMutation.isPending}
                  className="px-3 py-2 rounded-xl text-[11px] font-bold text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-wider text-foreground/50 px-2 py-1.5">
                Change Plan
              </p>
              {PLAN_OPTIONS.map((opt) => {
                const isCurrent = opt.value === plan;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      if (!isCurrent) setPendingPlan(opt.value);
                    }}
                    disabled={isCurrent || planMutation.isPending}
                    className={cn(
                      "w-full px-2 py-2 rounded-xl flex items-center gap-2.5 text-left transition-colors",
                      isCurrent
                        ? "bg-foreground/[0.04]"
                        : "hover:bg-foreground/[0.06]"
                    )}
                  >
                    <span
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-black uppercase ring-1 ring-white/20 shadow-sm",
                        opt.gradient
                      )}
                    >
                      {opt.label.charAt(0)}
                    </span>
                    <span className="flex-1 text-xs font-bold text-foreground">
                      {opt.label}
                    </span>
                    {isCurrent && (
                      <Check className="w-3.5 h-3.5 text-foreground/50" />
                    )}
                  </button>
                );
              })}
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* SUSPEND / REACTIVATE */}
      {confirmSuspend ? (
        <div className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-rose-50 dark:bg-rose-400/10 border border-rose-200 dark:border-rose-400/30">
          <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
            Suspend?
          </span>
          <button
            type="button"
            onClick={() => statusMutation.mutate("suspended")}
            disabled={statusMutation.isPending}
            className="px-2 py-1 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-black disabled:opacity-50"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setConfirmSuspend(false)}
            className="px-2 py-1 rounded-full text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-400/15 text-[11px] font-bold"
          >
            No
          </button>
        </div>
      ) : confirmReactivate ? (
        <div className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-emerald-50 dark:bg-emerald-400/10 border border-emerald-200 dark:border-emerald-400/30">
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            Reactivate?
          </span>
          <button
            type="button"
            onClick={() => {
              statusMutation.mutate("active");
              setConfirmReactivate(false);
            }}
            disabled={statusMutation.isPending}
            className="px-2 py-1 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black disabled:opacity-50"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setConfirmReactivate(false)}
            className="px-2 py-1 rounded-full text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-400/15 text-[11px] font-bold"
          >
            No
          </button>
        </div>
      ) : isSuspended ? (
        <button
          type="button"
          onClick={() => setConfirmReactivate(true)}
          disabled={statusMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-xs font-bold shadow-sm shadow-emerald-500/30 ring-1 ring-white/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Reactivate
        </button>
      ) : (
        <>
          {!isLimited && <PauseButton merchantId={merchantId} />}
          <button
            type="button"
            onClick={() => setConfirmSuspend(true)}
            disabled={statusMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-foreground/[0.04] hover:bg-rose-50 dark:hover:bg-rose-400/10 text-foreground/70 hover:text-rose-700 dark:hover:text-rose-300 text-xs font-bold transition-all disabled:opacity-50"
          >
            <Ban className="w-3.5 h-3.5" />
            Suspend
          </button>
        </>
      )}

      {error && (
        <span className="text-[11px] font-medium text-rose-700 dark:text-rose-300 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-400/10">
          {error.message}
        </span>
      )}
    </div>
  );
}
