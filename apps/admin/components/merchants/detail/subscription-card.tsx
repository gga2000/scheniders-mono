"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useLiveTick } from "@/hooks/use-live-tick";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { hasPermission } from "@/lib/admin-permissions";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { formatDay, formatDayTime, formatUntil } from "@/lib/format";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { ConfirmButton, postJson } from "./action-ui";

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
 *
 * Only a super admin may turn renewal on or off (change_plan); everyone else
 * reads whether it is on, with no switch that would only answer "Forbidden".
 * Turning it off ends the shop's paid months, so the switch first asks why,
 * as a hold does; turning it back on needs no reason.
 */
export function SubscriptionCard({ merchantId, tenant, subscription }: SubscriptionCardProps) {
  const queryClient = useQueryClient();
  const now = new Date(useLiveTick(60_000));
  const { role } = useAdminAuth();
  const canSwitch = role ? hasPermission(role, "change_plan") : false;

  const autoRenew = subscription?.auto_renew ?? true;
  const [stopping, setStopping] = useState(false);
  const [why, setWhy] = useState("");
  const renew = useMutation({
    mutationFn: (change: { auto_renew: boolean; reason?: string }) =>
      postJson(`/api/merchants/${merchantId}`, change, "PATCH"),
    onSuccess: () => {
      setStopping(false);
      setWhy("");
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
    },
  });

  const trialEnd = tenant.status === "trial" ? tenant.trial_ends_at : null;
  if (!trialEnd && !subscription) return null;

  // Our own shop is never billed: its month and renewal switch mean nothing.
  if (tenant.plan === "internal") {
    return (
      <section className="pastel-card p-5" aria-label="Trial and month">
        <dl>
          <Fact label="Monthly fee">None: our own shop is never billed.</Fact>
        </dl>
      </section>
    );
  }

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
              {canSwitch && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoRenew}
                  aria-label="Renew each month"
                  onClick={() => (autoRenew ? setStopping((open) => !open) : renew.mutate({ auto_renew: true }))}
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
              )}
              {autoRenew ? "On: charges the wallet each month" : "Off: the month ends and is not renewed"}
            </span>
            {stopping && autoRenew && (
              <span className="mt-3 block max-w-sm font-normal">
                <StaffReasonInput
                  value={why}
                  onChange={setWhy}
                  placeholder="Why stop renewing? (the shop's timeline shows it)"
                  className="mb-2"
                />
                <span className="mb-2 block text-[13px] leading-snug text-foreground/75">
                  This month runs to its end, then the shop is not charged again and its paid time ends.
                </span>
                <span className="flex gap-2">
                  <ConfirmButton
                    tone="stop"
                    disabled={!isStaffReason(why) || renew.isPending}
                    onClick={() => renew.mutate({ auto_renew: false, reason: why.trim() })}
                  >
                    {renew.isPending ? "Saving..." : "Stop renewing"}
                  </ConfirmButton>
                  <button
                    type="button"
                    onClick={() => {
                      setStopping(false);
                      setWhy("");
                    }}
                    className="shrink-0 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-foreground ring-1 ring-foreground/15 hover:bg-foreground/5"
                  >
                    Keep renewing
                  </button>
                </span>
              </span>
            )}
            {renew.error && (
              <span role="alert" className="mt-1 block text-[13px] font-medium text-[var(--ink-red)]">
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
      <dt className="text-[13px] text-foreground/70">{label}</dt>
      <dd className="mt-1 text-[15px] font-semibold text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

/** "in 3 days" beside a date, amber when it is under a day away. */
function When({ end, now, soon }: { end: string; now: Date; soon: boolean }) {
  return (
    <span className={cn("ml-2 text-[13px] font-medium", soon ? "text-[var(--ink-amber)]" : "text-foreground/70")}>
      {formatUntil(end, now)}
    </span>
  );
}
