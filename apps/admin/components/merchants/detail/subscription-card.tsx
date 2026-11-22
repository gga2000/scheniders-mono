"use client";

import { useState, type ReactNode } from "react";
import { useIsMutating, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useLiveTick } from "@/hooks/use-live-tick";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { hasPermission } from "@/lib/admin-permissions";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { formatDay, formatDayTime, formatUntilDay } from "@/lib/format";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { RENEWAL_STOP_WORDS } from "@/lib/billing-lock-label";
import { effectiveStatus } from "@/lib/effective-status";
import { renewalOnWords, renewalWords, shopActionKey } from "@/lib/shop-actions";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { ConfirmButton, PanelFields, postJson, useRereadShop, useWriteFailed } from "./action-ui";

interface SubscriptionCardProps {
  merchantId: string;
  tenant: MerchantDetail["tenant"];
  subscription: MerchantDetail["subscription"];
  /** The billing lock: turning renewal on for a locked shop charges its month. */
  billingLock: MerchantDetail["billingLock"];
  /** What the wallet holds now, said before renewal turns on. */
  walletIqd: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from the period's start to its end. */
function periodDays(subscription: { current_period_start: string; current_period_end: string }): number {
  return Math.round((Date.parse(subscription.current_period_end) - Date.parse(subscription.current_period_start)) / DAY_MS);
}

/**
 * The shop's time: the trial and when it ends, this month and when it
 * renews, and the renewal switch. The status line at the top says what that
 * means for money; this card gives the dates. Free days are under Give free
 * days at the top of the page.
 *
 * Only a super admin may turn renewal on or off (change_plan); everyone else
 * reads whether it is on, with no switch that would only answer "Forbidden".
 * Either way the switch first says what will happen and asks why, as a hold
 * does: turning it off ends the shop's paid months, and turning it back on
 * charges a shop that renewal off locked, within the hour (round 21, UX new
 * 2). It waits while another write on this shop runs (UX new 3).
 */
export function SubscriptionCard({ merchantId, tenant, subscription, billingLock, walletIqd }: SubscriptionCardProps) {
  const now = new Date(useLiveTick(60_000));
  const { role } = useAdminAuth();
  const canSwitch = role ? hasPermission(role, "change_plan") : false;
  const rereadShop = useRereadShop(merchantId);
  const failed = useWriteFailed(merchantId, "Renewal was not changed.");

  const autoRenew = subscription?.auto_renew ?? true;
  // The step the switch asks about: the opposite of what renewal is now.
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState("");
  const close = () => {
    setAsking(false);
    setWhy("");
  };
  const renew = useMutation({
    // A shop write: the page's other action buttons wait while it runs, and this switch waits for theirs.
    mutationKey: shopActionKey(merchantId),
    mutationFn: (change: { auto_renew: boolean; reason: string }) =>
      postJson(`/api/merchants/${merchantId}`, change, "PATCH"),
    onSuccess: () => {
      close();
      rereadShop();
    },
    onError: failed,
  });
  const writing = useIsMutating({ mutationKey: shopActionKey(merchantId) }) > 0;

  // A paused trial is still a trial: its end day stands, and it has no month yet.
  const onTrial = effectiveStatus(tenant.status, tenant.restrictions) === "trial";
  const trialEnd = onTrial ? tenant.trial_ends_at : null;
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
  const turnsOn = renewalOnWords(
    {
      demo: tenant.is_demo,
      status: tenant.status,
      onTrial,
      periodEnd: trialEnd ?? subscription?.current_period_end ?? null,
      lock: billingLock?.locked ? { price_iqd: billingLock.price_iqd } : null,
      walletIqd,
    },
    now,
  );

  return (
    <section className="pastel-card p-5" aria-label="Trial and month">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-3">
        {trialEnd && (
          <Fact label="Trial ends">
            {formatDayTime(trialEnd, now)}
            <When end={trialEnd} now={now} soon={soon(trialEnd)} />
          </Fact>
        )}
        {subscription && !onTrial && (
          // Free time can run a year (convert trial): "This month" then misread it.
          <Fact label={periodDays(subscription) > 31 ? "This period" : "This month"}>
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
                  aria-expanded={asking}
                  aria-label="Renew each month"
                  onClick={() => (asking ? close() : setAsking(true))}
                  disabled={writing}
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
              {renewalWords(autoRenew, tenant.is_demo, tenant.status)}
            </span>
            {asking && canSwitch && (
              <span className="mt-3 block max-w-sm font-normal">
                <PanelFields busy={writing}>
                  <StaffReasonInput
                    value={why}
                    onChange={setWhy}
                    placeholder={
                      autoRenew
                        ? "Why stop renewing? (the shop's timeline shows it)"
                        : "Why turn renewal on? (the shop's timeline shows it)"
                    }
                    className="mb-2"
                  />
                </PanelFields>
                <span className="mb-2 block text-[13px] leading-snug text-foreground/75">
                  {autoRenew
                    ? RENEWAL_STOP_WORDS
                    : turnsOn}
                </span>
                <span className="flex gap-2">
                  <ConfirmButton
                    tone={autoRenew ? "stop" : "go"}
                    disabled={!isStaffReason(why) || writing}
                    onClick={() => renew.mutate({ auto_renew: !autoRenew, reason: why.trim() })}
                  >
                    {renew.isPending ? "Saving..." : autoRenew ? "Stop renewing" : "Turn renewal on"}
                  </ConfirmButton>
                  <button
                    type="button"
                    onClick={close}
                    disabled={writing}
                    className="shrink-0 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-foreground ring-1 ring-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
                  >
                    {autoRenew ? "Keep renewing" : "Keep it off"}
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

/** "in 3 days" beside a date (Baghdad days, as Trials counts), amber when it is under a day away. */
function When({ end, now, soon }: { end: string; now: Date; soon: boolean }) {
  return (
    <span className={cn("ml-2 text-[13px] font-medium", soon ? "text-[var(--ink-amber)]" : "text-foreground/70")}>
      {formatUntilDay(end, now)}
    </span>
  );
}
