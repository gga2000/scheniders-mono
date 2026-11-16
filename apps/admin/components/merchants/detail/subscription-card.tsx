"use client";

import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useLiveTick } from "@/hooks/use-live-tick";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { formatDay, formatDayTime, formatUntil } from "@/lib/format";
import { postJson } from "./action-ui";

interface SubscriptionCardProps {
  merchantId: string;
  tenant: MerchantDetail["tenant"];
  subscription: MerchantDetail["subscription"];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The shop's time: the trial and when it ends, this month and when it
 * renews, and the renewal switch. The status line at the top says what that
 * means for money; this card gives the dates. Free days are under Give free
 * days at the top of the page.
 */
export function SubscriptionCard({ merchantId, tenant, subscription }: SubscriptionCardProps) {
  const queryClient = useQueryClient();
  const now = new Date(useLiveTick(60_000));

  const autoRenew = subscription?.auto_renew ?? true;
  const renew = useMutation({
    mutationFn: (next: boolean) => postJson(`/api/merchants/${merchantId}`, { auto_renew: next }, "PATCH"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
    },
  });

  const trialEnd = tenant.status === "trial" ? tenant.trial_ends_at : null;
  if (!trialEnd && !subscription) return null;

  const soon = (end: string) => new Date(end).getTime() - now.getTime() < DAY_MS;

  return (
    <section className="pastel-card p-5" aria-label="Trial and month">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-3">
        {trialEnd && (
          <Fact label="Trial ends">
            {formatDayTime(trialEnd, now)}
            <When end={trialEnd} now={now} soon={soon(trialEnd)} />
          </Fact>
        )}
        {subscription && tenant.status !== "trial" && (
          <Fact label="This month">
            {formatDay(subscription.current_period_start, now)} to {formatDay(subscription.current_period_end, now)}
            <When end={subscription.current_period_end} now={now} soon={soon(subscription.current_period_end)} />
          </Fact>
        )}
        {subscription && (
          <Fact label="Renewal">
            <span className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={autoRenew}
                aria-label="Renew each month"
                onClick={() => renew.mutate(!autoRenew)}
                disabled={renew.isPending}
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
                  autoRenew ? "bg-emerald-700" : "bg-foreground/20",
                )}
              >
                <span
                  className={cn(
                    "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                    autoRenew && "translate-x-4",
                  )}
                />
              </button>
              {autoRenew ? "On: charges the wallet each month" : "Off: the month ends and is not renewed"}
            </span>
            {renew.error && (
              <span role="alert" className="mt-1 block text-[13px] font-medium text-rose-700 dark:text-rose-300">
                {renew.error.message}
              </span>
            )}
          </Fact>
        )}
      </dl>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-foreground/60">{label}</dt>
      <dd className="mt-1 text-[15px] font-semibold text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

/** "in 3 days" beside a date, amber when it is under a day away. */
function When({ end, now, soon }: { end: string; now: Date; soon: boolean }) {
  return (
    <span className={cn("ml-2 text-[13px] font-medium", soon ? "text-amber-700 dark:text-amber-300" : "text-foreground/55")}>
      {formatUntil(end, now)}
    </span>
  );
}
