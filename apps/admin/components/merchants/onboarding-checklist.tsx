"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCount, formatIQD } from "@/lib/format";
import { onboardingDone, type OnboardingFacts } from "@/lib/onboarding-steps";

interface OnboardingChecklistProps {
  facts: OnboardingFacts;
  /** What is in the wallet now, for the wallet line. */
  walletBalance: number;
}

/**
 * How far the shop is in setting itself up, in plain words, so staff know what
 * to help with on a call. The steps are the merchant's to do in their own app;
 * the console only shows them. Ticked by the same rule as Home's onboarding
 * widget (onboardingDone), so both show the same progress.
 */
export function OnboardingChecklist({ facts, walletBalance }: OnboardingChecklistProps) {
  const done = onboardingDone(facts);
  const steps = [
    {
      title: "First order",
      done: done.has_orders,
      line: done.has_orders ? `${formatCount(facts.orders)} orders so far` : "No order yet",
    },
    {
      title: "Store published",
      done: done.has_storefront,
      line: done.has_storefront ? "The store builder is published" : "The store still has the starting pages",
    },
    {
      title: "Logo",
      done: done.has_branding,
      line: done.has_branding ? "The shop has its own logo" : "No logo yet",
    },
    {
      title: "Money added to the wallet",
      done: done.wallet_funded,
      line: done.wallet_funded
        ? `${formatIQD(facts.toppedUpIqd)} added so far, ${formatIQD(walletBalance)} now`
        : "No money added yet",
    },
    {
      title: "A second person on the team",
      done: done.has_team,
      line: done.has_team ? `${formatCount(facts.activeMembers)} people on the team` : "The owner works alone",
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <section className="pastel-card p-5" aria-label="Setting up">
      <p className="text-[13px] text-foreground/70">Setting up</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums text-foreground">
        {doneCount} of {steps.length} steps done
      </p>
      <div className="mt-3 h-1.5 rounded-full bg-foreground/[0.08]" aria-hidden>
        <div className="h-1.5 rounded-full bg-emerald-700" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
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
