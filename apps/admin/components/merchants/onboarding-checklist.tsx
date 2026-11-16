"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCount, formatIQD } from "@/lib/format";

interface OnboardingChecklistProps {
  tenant: {
    branding?: {
      logo_url: string | null;
    } | null;
  };
  orderCount: number;
  teamCount: number;
  walletBalance: number;
  hasStorefront: boolean;
}

/**
 * How far the shop is in setting itself up, in plain words, so staff know what
 * to help with on a call. The steps are the merchant's to do in their own app;
 * the console only shows them.
 */
export function OnboardingChecklist({ tenant, orderCount, teamCount, walletBalance, hasStorefront }: OnboardingChecklistProps) {
  // The merchant's Business settings save the logo here; every shop starts without one.
  const hasLogo = !!tenant.branding?.logo_url;
  const steps = [
    {
      title: "First order",
      done: orderCount > 0,
      line: orderCount > 0 ? `${formatCount(orderCount)} orders so far` : "No order yet",
    },
    {
      title: "Store set up",
      done: hasStorefront,
      line: hasStorefront ? "The store has its pages and settings" : "The store still has the starting pages",
    },
    {
      title: "Logo",
      done: hasLogo,
      line: hasLogo ? "The shop has its own logo" : "No logo yet",
    },
    {
      title: "Money in the wallet",
      done: walletBalance > 0,
      line: walletBalance > 0 ? `${formatIQD(walletBalance)} now` : "The wallet is empty",
    },
    {
      title: "A second person on the team",
      done: teamCount > 1,
      line: teamCount > 1 ? `${formatCount(teamCount)} people on the team` : "The owner works alone",
    },
  ];
  const done = steps.filter((step) => step.done).length;

  return (
    <section className="pastel-card p-5" aria-label="Setting up">
      <p className="text-[13px] text-foreground/70">Setting up</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums text-foreground">
        {done} of {steps.length} steps done
      </p>
      <div className="mt-3 h-1.5 rounded-full bg-foreground/[0.08]" aria-hidden>
        <div className="h-1.5 rounded-full bg-emerald-700" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-4 divide-y divide-[var(--card-border)]">
        {steps.map((step) => (
          <li key={step.title} className="flex items-center gap-3 py-3">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                step.done ? "bg-emerald-700 text-white" : "border border-foreground/25",
              )}
            >
              {step.done && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className={cn("text-[15px] font-semibold", step.done ? "text-foreground" : "text-foreground/80")}>
                {step.title}
                <span className="sr-only">{step.done ? ", done" : ", not done"}</span>
              </p>
              <p className="text-[13px] text-foreground/70">{step.line}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
