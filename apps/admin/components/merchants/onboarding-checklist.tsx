"use client";

import {
  Check,
  CircleDashed,
  Globe,
  Link2,
  Palette,
  Rocket,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmtCurrency = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

interface OnboardingChecklistProps {
  tenant: {
    id: string;
    business_name: string;
    branding?: {
      logo_url: string | null;
      primary_color: string;
    } | null;
  };
  orderCount: number;
  teamCount: number;
  walletBalance: number;
  hasStorefront: boolean;
  hasCustomDomain: boolean;
}

interface OnboardingStep {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof ShoppingBag;
  tile: string;
  completed: boolean;
  cta?: { label: string; href: string };
}

export function OnboardingChecklist({
  tenant,
  orderCount,
  teamCount,
  walletBalance,
  hasStorefront,
  hasCustomDomain,
}: OnboardingChecklistProps) {
  const steps: OnboardingStep[] = [
    {
      id: "orders",
      title: "First order created",
      subtitle:
        orderCount > 0
          ? `${orderCount.toLocaleString("en-US")} orders processed so far`
          : "Help the merchant land their first sale",
      icon: ShoppingBag,
      tile: "bg-gradient-to-br from-emerald-400 to-teal-500",
      completed: orderCount > 0,
      cta: { label: "View orders", href: `/orders?tenant=${tenant.id}` },
    },
    {
      id: "team",
      title: "Team member invited",
      subtitle:
        teamCount > 1
          ? `${teamCount} members on the team`
          : "Currently solo — invite a teammate to collaborate",
      icon: Users,
      tile: "bg-gradient-to-br from-sky-400 to-cyan-500",
      completed: teamCount > 1,
      cta: { label: "Invite teammate", href: `/team?invite=${tenant.id}` },
    },
    {
      id: "branding",
      title: "Branding configured",
      subtitle:
        tenant.branding?.logo_url && tenant.branding.primary_color !== "#1E1E1E"
          ? "Logo uploaded and brand color set"
          : "Upload a logo and pick a brand color",
      icon: Palette,
      tile: "bg-gradient-to-br from-fuchsia-400 to-pink-500",
      completed: !!(
        tenant.branding?.logo_url &&
        tenant.branding.primary_color !== "#1E1E1E"
      ),
      cta: { label: "Open builder", href: `/store-builder?tenant=${tenant.id}` },
    },
    {
      id: "storefront",
      title: "Storefront published",
      subtitle: hasStorefront
        ? "Storefront is live and accepting visitors"
        : "Publish the storefront to start receiving traffic",
      icon: Globe,
      tile: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
      completed: hasStorefront,
      cta: { label: "Open dashboard", href: `/merchants/${tenant.id}` },
    },
    {
      id: "wallet",
      title: "Wallet funded",
      subtitle:
        walletBalance > 0
          ? `Balance: ${fmtCurrency(walletBalance)} IQD`
          : "Top up the wallet to enable paid features",
      icon: Wallet,
      tile: "bg-gradient-to-br from-amber-400 to-orange-500",
      completed: walletBalance > 0,
      cta: { label: "Top up", href: `/merchants/${tenant.id}#wallet` },
    },
    {
      id: "domain",
      title: "Custom domain connected",
      subtitle: hasCustomDomain
        ? "Custom domain is live and routing traffic"
        : "Optional — connect a custom domain for stronger branding",
      icon: Link2,
      tile: "bg-gradient-to-br from-rose-400 to-pink-500",
      completed: hasCustomDomain,
      cta: { label: "Manage domain", href: `/merchants/${tenant.id}#domain` },
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const total = steps.length;
  const percentage = Math.round((completedCount / total) * 100);
  const isComplete = completedCount === total;
  const remaining = total - completedCount;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl p-5 border",
          isComplete
            ? "bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-400/10 dark:via-teal-400/10 dark:to-cyan-400/10 border-emerald-200 dark:border-emerald-400/30"
            : "bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 dark:from-violet-400/10 dark:via-fuchsia-400/10 dark:to-pink-400/10 border-violet-200 dark:border-violet-400/30",
        )}
      >
        <div
          aria-hidden
          className={cn(
            "absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl opacity-30",
            isComplete ? "bg-emerald-300" : "bg-violet-300",
          )}
        />

        <div className="relative flex items-start justify-between mb-5 gap-3">
          <div className="min-w-0">
            <p
              className={cn(
                "text-[10px] uppercase tracking-[0.1em] font-black flex items-center gap-1.5",
                isComplete
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-violet-700 dark:text-violet-300",
              )}
            >
              {isComplete ? (
                <Sparkles className="w-3 h-3" />
              ) : (
                <Rocket className="w-3 h-3" />
              )}
              {isComplete ? "Onboarding complete" : "Onboarding progress"}
            </p>
            <p
              className={cn(
                "text-4xl font-black tabular-nums leading-none mt-2 tracking-tight",
                isComplete
                  ? "text-emerald-900 dark:text-emerald-200"
                  : "text-violet-900 dark:text-violet-200",
              )}
            >
              {completedCount}
              <span className="text-base font-bold opacity-60 ml-1.5">
                of {total} done
              </span>
            </p>
            <p className="text-[11px] text-foreground/55 mt-2 font-medium">
              {isComplete
                ? "Every onboarding milestone has been hit. Time to celebrate."
                : `${remaining} ${remaining === 1 ? "step" : "steps"} remaining to fully activate this merchant`}
            </p>
          </div>
          <span
            className={cn(
              "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ring-1 ring-white/20 shadow-sm",
              isComplete
                ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-emerald-500/30"
                : "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-violet-500/30",
            )}
          >
            {percentage}%
          </span>
        </div>

        <div className="relative h-2 rounded-full bg-foreground/10 overflow-hidden">
          <div
            className="absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-500 transition-all duration-500 shadow-sm shadow-emerald-500/30"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="relative grid grid-cols-3 gap-2 mt-4">
          <div className="rounded-2xl border border-foreground/[0.06] bg-white/70 dark:bg-white/5 backdrop-blur-sm p-2.5">
            <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45">
              Done
            </p>
            <p className="text-lg font-black tabular-nums mt-1 text-emerald-700 dark:text-emerald-300 leading-none">
              {completedCount}
            </p>
          </div>
          <div className="rounded-2xl border border-foreground/[0.06] bg-white/70 dark:bg-white/5 backdrop-blur-sm p-2.5">
            <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45">
              Pending
            </p>
            <p className="text-lg font-black tabular-nums mt-1 text-foreground/70 leading-none">
              {remaining}
            </p>
          </div>
          <div className="rounded-2xl border border-foreground/[0.06] bg-white/70 dark:bg-white/5 backdrop-blur-sm p-2.5">
            <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45">
              Total
            </p>
            <p className="text-lg font-black tabular-nums mt-1 text-foreground/70 leading-none">
              {total}
            </p>
          </div>
        </div>
      </div>

      <div className="pastel-card p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1.5">
            <CircleDashed className="w-3 h-3" />
            Activation steps
          </h2>
          <span className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 tabular-nums">
            {completedCount} / {total}
          </span>
        </div>

        <div className="space-y-1.5">
          {steps.map((step, idx) => {
            const StepIcon = step.icon;
            return (
              <div
                key={step.id}
                className={cn(
                  "group relative flex items-center gap-3 rounded-2xl border p-3 transition-colors",
                  step.completed
                    ? "border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-400/15 dark:bg-emerald-400/[0.04] hover:bg-emerald-50/60 dark:hover:bg-emerald-400/[0.06]"
                    : "border-foreground/[0.06] bg-foreground/[0.025] hover:bg-foreground/[0.04]",
                )}
              >
                <div className="relative shrink-0">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center transition-all",
                      step.completed
                        ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-white ring-2 ring-emerald-300/40 dark:ring-emerald-400/20 shadow-sm shadow-emerald-500/30"
                        : "bg-foreground/[0.04] text-foreground/35 ring-2 ring-foreground/[0.08]",
                    )}
                  >
                    {step.completed ? (
                      <Check className="w-4.5 h-4.5" strokeWidth={3} />
                    ) : (
                      <span className="text-[11px] font-black tabular-nums">
                        {idx + 1}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center text-white ring-1 ring-white/20 shadow-sm shrink-0",
                    step.completed ? step.tile : "bg-foreground/15 grayscale opacity-70",
                  )}
                >
                  <StepIcon className="w-4 h-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-bold truncate",
                      step.completed ? "text-foreground" : "text-foreground/75",
                    )}
                  >
                    {step.title}
                  </p>
                  <p
                    className={cn(
                      "text-[11px] mt-0.5 font-medium line-clamp-1",
                      step.completed ? "text-foreground/55" : "text-foreground/45",
                    )}
                  >
                    {step.subtitle}
                  </p>
                </div>

                {step.completed ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-emerald-500/30 ring-1 ring-white/20 shrink-0">
                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                    Done
                  </span>
                ) : step.cta ? (
                  <a
                    href={step.cta.href}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[10px] font-black uppercase tracking-wider shadow-sm shadow-violet-500/30 ring-1 ring-white/20 hover:scale-105 active:scale-95 transition-all shrink-0"
                  >
                    {step.cta.label}
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
