"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { isStaffReason, STAFF_REASON_MAX, STAFF_REASON_TOO_SHORT } from "@/lib/billing-lock-tools";

interface StaffReasonInputProps {
  value: string;
  onChange: (value: string) => void;
  /** What the reason is for, shown as the placeholder. */
  placeholder?: string;
  className?: string;
}

/**
 * The reason a staff member gives for a staff step (extend a trial, more
 * store orders, a plan move, a pause). It is saved in the activity log with
 * the action; the action waits until it has at least 3 letters (isStaffReason).
 * Once something is typed that is too short, the input says the rule under
 * itself, so no form leaves its button grey with nothing said (round 19: only
 * 2 of 12 forms said it, and "Qi 4471" has only 2 letters).
 */
export function StaffReasonInput({
  value,
  onChange,
  placeholder = "Reason (saved in the log)",
  className,
}: StaffReasonInputProps) {
  const ruleId = useId();
  const short = value.trim() !== "" && !isStaffReason(value);
  return (
    <span className={cn("block", className)}>
      <input
        type="text"
        aria-label="Reason"
        aria-invalid={short || undefined}
        aria-describedby={short ? ruleId : undefined}
        maxLength={STAFF_REASON_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 rounded-xl bg-white/80 dark:bg-white/10 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none text-xs font-medium text-foreground placeholder:text-foreground/40 disabled:cursor-wait disabled:opacity-60"
      />
      {short && (
        <span id={ruleId} className="mt-1 block text-[13px] leading-snug text-foreground/70">
          {STAFF_REASON_TOO_SHORT}
        </span>
      )}
    </span>
  );
}
