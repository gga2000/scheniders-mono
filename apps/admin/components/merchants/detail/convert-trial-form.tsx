"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatDay } from "@/lib/format";
import { CONVERT_ACTION, endAfterDays, shopActionKey } from "@/lib/shop-actions";
import { isStaffReason } from "@/lib/billing-lock-tools";
import type { RequestIds } from "@/lib/request-ids";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { Choice, ConfirmButton, ErrorLine, PanelFields, PanelTitle, postJson, useWriteFailed, WillHappen } from "./action-ui";

const PERIODS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

interface ConvertTrialFormProps {
  shopId: string;
  shopName: string;
  /** Held by the page: one id per ask, so a retry, even from a reopened form, starts the free time once. */
  requestIds: RequestIds;
  /** A locked trial opens again with the free time: the sentence says so. */
  locked: boolean;
  /** Staff turned monthly renewal off: free time turns it back on, and the sentence says so (audit round 21). */
  renewalOff: boolean;
  onDone: () => void;
}

/**
 * End a trial and start free time with no charge, for a shop that paid us
 * some other way (a sales call, cash for a year). The first charge falls on
 * the day the free time ends. One name, "free time", from this form to the
 * status line and the timeline (round 19: it had four).
 */
export function ConvertTrialForm({ shopId, shopName, requestIds, locked, renewalOff, onDone }: ConvertTrialFormProps) {
  const [days, setDays] = useState(30);
  const [why, setWhy] = useState("");
  const ready = isStaffReason(why);

  const failed = useWriteFailed(shopId, `Free time was not started for ${shopName}.`);

  const convert = useMutation({
    mutationKey: shopActionKey(shopId),
    mutationFn: () => {
      const reason = why.trim();
      // Keyed by what is given, not the words, as the other panels are.
      const request_id = requestIds.idFor(`${shopId}:${days}`);
      return postJson(`/api/merchants/${shopId}/convert-trial`, { period_days: days, reason, request_id });
    },
    onSuccess: () => {
      requestIds.done();
      onDone();
    },
    onError: failed,
  });

  return (
    <PanelFields busy={convert.isPending}>
      <PanelTitle>{CONVERT_ACTION}</PanelTitle>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {PERIODS.map((p) => (
          <Choice key={p.days} selected={days === p.days} onClick={() => setDays(p.days)}>
            {p.label}
          </Choice>
        ))}
      </div>
      <WillHappen>
        The trial ends now and free time runs to {formatDay(endAfterDays(null, days))}.
        {locked && " The store opens again now."} Nothing is charged today; the first charge is on that day.
        {renewalOff && " Monthly renewal is off now: this turns it back on, so the shop is charged every month after the free time."}
      </WillHappen>
      <StaffReasonInput value={why} onChange={setWhy} placeholder="Why? Paid in cash for a year..." className="mb-3" />
      <ErrorLine error={convert.error} />
      <ConfirmButton disabled={!ready || convert.isPending} onClick={() => convert.mutate()}>
        {convert.isPending ? "Starting..." : `Start ${PERIODS.find((p) => p.days === days)?.label ?? `${days} days`} free`}
      </ConfirmButton>
    </PanelFields>
  );
}
