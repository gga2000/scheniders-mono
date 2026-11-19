"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatDay } from "@/lib/format";
import { endAfterDays, shopActionKey } from "@/lib/shop-actions";
import { isStaffReason } from "@/lib/billing-lock-tools";
import type { RequestIds } from "@/lib/request-ids";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { Choice, ConfirmButton, ErrorLine, PanelTitle, postJson, useLateRefusal, WillHappen } from "./action-ui";

const PERIODS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

interface ConvertTrialFormProps {
  shopId: string;
  shopName: string;
  /** Held by the page: one id per ask, so a retry, even from a reopened form, starts the paid time once. */
  requestIds: RequestIds;
  onDone: () => void;
}

/**
 * End a trial and start paid time with no charge, for a shop that paid us
 * some other way (a sales call, cash for a year). The first charge falls on
 * the day the paid time ends.
 */
export function ConvertTrialForm({ shopId, shopName, requestIds, onDone }: ConvertTrialFormProps) {
  const [days, setDays] = useState(30);
  const [why, setWhy] = useState("");
  const ready = isStaffReason(why);

  const sayLate = useLateRefusal(`Paid time was not started for ${shopName}.`);

  const convert = useMutation({
    mutationKey: shopActionKey(shopId),
    mutationFn: () => {
      const reason = why.trim();
      const request_id = requestIds.idFor(`${shopId}:${days}:${reason}`);
      return postJson(`/api/merchants/${shopId}/convert-trial`, { period_days: days, reason, request_id });
    },
    onSuccess: () => {
      requestIds.done();
      onDone();
    },
    onError: sayLate,
  });

  return (
    <div>
      <PanelTitle>Start paid time, no charge</PanelTitle>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {PERIODS.map((p) => (
          <Choice key={p.days} selected={days === p.days} onClick={() => setDays(p.days)}>
            {p.label}
          </Choice>
        ))}
      </div>
      <StaffReasonInput value={why} onChange={setWhy} placeholder="Why? Paid in cash for a year..." className="mb-3" />
      {ready && (
        <WillHappen>
          The trial ends now and paid time runs to {formatDay(endAfterDays(null, days))}. Nothing is charged
          today; the first charge is on that day.
        </WillHappen>
      )}
      <ErrorLine error={convert.error} />
      <ConfirmButton disabled={!ready || convert.isPending} onClick={() => convert.mutate()}>
        {convert.isPending ? "Starting..." : `Start ${PERIODS.find((p) => p.days === days)?.label ?? `${days} days`} free`}
      </ConfirmButton>
    </div>
  );
}
