"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatDayTime } from "@/lib/format";
import { endAfterDays, type FreeDaysKind } from "@/lib/shop-actions";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { MAX_TRIAL_EXTENSION_DAYS } from "@/lib/trial-extension";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { Choice, ConfirmButton, ErrorLine, FieldInput, PanelTitle, postJson, WillHappen } from "./action-ui";

const PRESETS: Record<FreeDaysKind, number[]> = { trial: [3, 7, 14], month: [7, 30] };
const MAX_DAYS: Record<FreeDaysKind, number> = { trial: MAX_TRIAL_EXTENSION_DAYS, month: 365 };

interface FreeDaysFormProps {
  shopId: string;
  kind: FreeDaysKind;
  /** When the trial or the month ends today. */
  endsAt: string | null;
  locked: boolean;
  onDone: () => void;
}

/**
 * Days with no charge: a longer trial for a shop on trial, a longer month for
 * a paying shop. The line above the button gives the new end, counted the way
 * the database counts it (from the end, or from now when the end has passed).
 */
export function FreeDaysForm({ shopId, kind, endsAt, locked, onDone }: FreeDaysFormProps) {
  const [preset, setPreset] = useState<number | null>(PRESETS[kind][1] ?? null);
  const [typed, setTyped] = useState("");
  const [why, setWhy] = useState("");

  const typedDays = /^\d+$/.test(typed.trim()) ? Number(typed.trim()) : null;
  const days = preset ?? typedDays;
  const daysOk = days !== null && days >= 1 && days <= MAX_DAYS[kind];
  // A trial's free days are logged with the reason; the month's log keeps the old and new end.
  const ready = daysOk && (kind === "month" || isStaffReason(why));

  const give = useMutation({
    mutationFn: (value: number) =>
      kind === "trial"
        ? postJson(`/api/merchants/${shopId}/extend-trial`, { days: value, reason: why.trim() })
        : postJson(`/api/merchants/${shopId}/extend-subscription`, { days: value }),
    onSuccess: onDone,
  });

  const what = kind === "trial" ? "The trial" : "This month";

  return (
    <div>
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
      {kind === "trial" && (
        <StaffReasonInput value={why} onChange={setWhy} placeholder="Why? (saved in the log)" className="mb-3" />
      )}
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
            : "Nothing is charged; the next charge moves to that day."}
        </WillHappen>
      )}
      <ErrorLine error={give.error} />
      <ConfirmButton disabled={!ready || give.isPending} onClick={() => daysOk && give.mutate(days)}>
        {give.isPending ? "Giving..." : daysOk ? `Give ${days} free days` : "Give free days"}
      </ConfirmButton>
    </div>
  );
}
