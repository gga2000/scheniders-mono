"use client";

import { cn } from "@/lib/utils";
import { STAFF_REASON_MAX } from "@/lib/billing-lock-tools";

interface StaffReasonInputProps {
  value: string;
  onChange: (value: string) => void;
  /** What the reason is for, shown as the placeholder. */
  placeholder?: string;
  className?: string;
}

/**
 * The reason a staff member gives for a billing tool (extend a trial, more
 * store orders, free unlock). It is saved in the activity log with the action;
 * the action stays disabled until it is at least 3 characters (isStaffReason).
 */
export function StaffReasonInput({
  value,
  onChange,
  placeholder = "Reason (saved in the log)",
  className,
}: StaffReasonInputProps) {
  return (
    <input
      type="text"
      aria-label="Reason"
      maxLength={STAFF_REASON_MAX}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full px-3 py-1.5 rounded-xl bg-white/80 dark:bg-white/10 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none text-xs font-medium text-foreground placeholder:text-foreground/40",
        className,
      )}
    />
  );
}
