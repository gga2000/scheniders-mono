"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatDayTime } from "@/lib/format";
import { endAfterDays, shopActionKey, type FreeDaysKind } from "@/lib/shop-actions";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { RENEWAL_OFF_THEN_LOCKS } from "@/lib/billing-lock-label";
import type { RequestIds } from "@/lib/request-ids";
import { MAX_TRIAL_EXTENSION_DAYS } from "@/lib/trial-extension";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { Choice, ConfirmButton, ErrorLine, FieldInput, PanelFields, PanelTitle, postJson, useWriteFailed, WillHappen } from "./action-ui";

const PRESETS: Record<FreeDaysKind, number[]> = { trial: [3, 7, 14], month: [7, 30] };
const MAX_DAYS: Record<FreeDaysKind, number> = { trial: MAX_TRIAL_EXTENSION_DAYS, month: 365 };

interface FreeDaysFormProps {
  shopId: string;
  shopName: string;
  kind: FreeDaysKind;
  /** When the trial or the month ends today. */
  endsAt: string | null;
  locked: boolean;
  /** Staff turned monthly renewal off: free days this month end in a lock, not a charge. */
  renewalOff: boolean;
  /** Held by the page: one id per ask, so a retry after a lost answer, even from a reopened form, gives the days once. */
  requestIds: RequestIds;
  onDone: () => void;
}

/**
 * Days with no charge: a longer trial for a shop on trial, a longer month for
 * a paying shop. The line above the button gives the new end, counted the way
 * the database counts it (from the end, or from now when the end has passed).
 */
export function FreeDaysForm({ shopId, shopName, kind, endsAt, locked, renewalOff, requestIds, onDone }: FreeDaysFormProps) {
  const [preset, setPreset] = useState<number | null>(PRESETS[kind][1] ?? null);
  const [typed, setTyped] = useState("");
  const [why, setWhy] = useState("");

  const typedDays = /^\d+$/.test(typed.trim()) ? Number(typed.trim()) : null;
  const days = preset ?? typedDays;
  const daysOk = days !== null && days >= 1 && days <= MAX_DAYS[kind];
  // Both kinds ask why: it goes on the staff log row and the timeline (round 20).
  const ready = daysOk && isStaffReason(why);

  const failed = useWriteFailed(shopId, `${shopName} was not given free days.`);

  const give = useMutation({
    mutationKey: shopActionKey(shopId),
    mutationFn: (value: number) => {
      // Keyed by what is given, not the words: a reopened panel with the reason
      // typed anew sends the same ask with the same id, so the days come once.
      const request_id = requestIds.idFor(`${shopId}:${kind}:${value}`);
      const url = kind === "trial" ? "extend-trial" : "extend-subscription";
      return postJson(`/api/merchants/${shopId}/${url}`, { days: value, reason: why.trim(), request_id });
    },
    onSuccess: () => {
      requestIds.done();
      onDone();
    },
    onError: failed,
  });

  const what = kind === "trial" ? "The trial" : "This month";

  return (
    <PanelFields busy={give.isPending}>
      <PanelTitle aside={endsAt ? `ends ${formatDayTime(endsAt)}` : undefined}>
        {kind === "trial" ? "Give free trial days" : "Give free days this month"}
      </PanelTitle>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS[kind].map((value) => (
          <Choice
            key={value}
            selected={preset === value}
            onClick={() => {
              setPreset(value);
              setTyped("");
            }}
          >
            {value} days
          </Choice>
        ))}
        <FieldInput
          inputMode="numeric"
          aria-label="Other number of days"
          placeholder="Other"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setPreset(null);
          }}
          className="w-24 tabular-nums"
        />
      </div>
      <StaffReasonInput value={why} onChange={setWhy} placeholder="Why? (saved in the log)" className="mb-3" />
      {days !== null && !daysOk && (
        <p className="mb-2 text-[13px] text-[var(--ink-red)]">From 1 to {MAX_DAYS[kind]} days.</p>
      )}
      {daysOk && (
        <WillHappen>
          {what} then ends {formatDayTime(endAfterDays(endsAt, days))}.{" "}
          {kind === "trial"
            ? locked
              ? "The shop opens again and stays on trial."
              : "The shop stays on trial."
            : monthWords(locked, renewalOff)}
        </WillHappen>
      )}
      <ErrorLine error={give.error} />
      <ConfirmButton disabled={!ready || give.isPending} onClick={() => daysOk && give.mutate(days)}>
        {give.isPending ? "Giving..." : daysOk ? `Give ${days} free days` : "Give free days"}
      </ConfirmButton>
    </PanelFields>
  );
}

/**
 * What free days this month do to the charge. admin_extend_subscription makes
 * an unpaid month active again, so a locked shop opens now, with no charge.
 * With renewal off no charge comes at the new end: the daily renewal after it
 * locks the shop again (round 21, data new 1).
 */
function monthWords(locked: boolean, renewalOff: boolean): string {
  const now = locked ? "The shop opens again now, with no charge" : "Nothing is charged";
  return renewalOff ? `${now}. ${RENEWAL_OFF_THEN_LOCKS}` : `${now}; the next charge moves to that day.`;
}
