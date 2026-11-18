"use client";

import { useState, useRef, useEffect } from "react";
import { AlertCircle, Clock, Ban, XCircle } from "lucide-react";
import { TRIAL_ENDING_DAYS, trialClock } from "@/lib/baghdad-day";
import { effectiveStatus } from "@/lib/effective-status";
import { cn } from "@/lib/utils";
/** A list row or the shop record: the flag reads its status, pause and trial end. */
interface AlertShop {
  status: string;
  restrictions?: unknown;
  trial_ends_at: string | null;
}

interface MerchantAlertFlagProps {
  merchant: AlertShop;
}

interface AlertInfo {
  icon: typeof AlertCircle;
  label: string;
  detail: string;
  age: number | null;
  severity: "critical" | "warning";
}

/*
 * The list row carries no date for a hold or a cancellation (the flag read
 * suspended_at, cancelled_at and subscription_ends_at, which no row has, so
 * "N days ago" never showed): it says what the status is.
 */
function computeAlert(merchant: AlertShop): AlertInfo | null {
  const status = merchant.status;
  const trialEnd = merchant.trial_ends_at;

  if (status === "suspended") {
    return { icon: Ban, label: "Suspended", detail: "Account is currently suspended", age: null, severity: "critical" };
  }

  if (status === "cancelled") {
    return { icon: XCircle, label: "Cancelled", detail: "Subscription has been cancelled", age: null, severity: "critical" };
  }

  // A paused trial still ends (lib/effective-status), and "Needs attention" counts it.
  if (effectiveStatus(status, merchant.restrictions) === "trial" && trialEnd) {
    // Baghdad calendar days, the same clock as the Merchants banner and the Trials page.
    const clock = trialClock(trialEnd);
    if (clock.ended) {
      const ago = -clock.days;
      return {
        icon: AlertCircle,
        label: "Trial ended",
        detail: ago === 0 ? "Trial ended today" : `Trial ended ${ago} day${ago === 1 ? "" : "s"} ago`,
        age: ago,
        severity: "critical",
      };
    }
    if (clock.days <= TRIAL_ENDING_DAYS) {
      return {
        icon: Clock,
        label: "Trial ending",
        detail:
          clock.days === 0
            ? "Trial ends today"
            : clock.days === 1
              ? "Trial ends tomorrow"
              : `Trial ends in ${clock.days} days`,
        age: clock.days,
        severity: "warning",
      };
    }
  }

  return null;
}

export function MerchantAlertFlag({ merchant }: MerchantAlertFlagProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alert = computeAlert(merchant);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  if (!alert) return null;

  const Icon = alert.icon;
  const isCritical = alert.severity === "critical";

  const handleEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };

  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 100);
  };

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      <button
        type="button"
        aria-label={alert.label}
        className={cn(
          "relative inline-flex items-center justify-center w-5 h-5 rounded-full transition-all",
          isCritical
            ? "bg-rose-500 text-white shadow-sm shadow-rose-500/40"
            : "bg-amber-400 text-white shadow-sm shadow-amber-400/40"
        )}
      >
        {/* Outer pulse ring */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full animate-ping",
            isCritical ? "bg-rose-500/60" : "bg-amber-400/60"
          )}
        />
        {/* Inner solid */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full",
            isCritical ? "bg-rose-500" : "bg-amber-400"
          )}
        />
        <Icon className="relative w-3 h-3 z-10" />
      </button>

      {/* Tooltip card */}
      {open && (
        <div
          role="tooltip"
          className={cn(
            "absolute left-0 top-full mt-1.5 z-50 w-60 p-3 rounded-2xl shadow-2xl border bg-[var(--card-bg)]",
            isCritical
              ? "border-rose-200 dark:border-rose-400/30"
              : "border-amber-200 dark:border-amber-400/30"
          )}
          style={{ animation: "fade-in 0.12s ease-out" }}
        >
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                "w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-white/30",
                isCritical
                  ? "bg-gradient-to-br from-rose-500 to-red-600 shadow-sm shadow-rose-500/40"
                  : "bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm shadow-amber-400/40"
              )}
            >
              <Icon className="w-3.5 h-3.5 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-[10px] font-black uppercase tracking-wider",
                  isCritical
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-amber-700 dark:text-amber-300"
                )}
              >
                {alert.label}
              </p>
              <p className="text-xs font-semibold text-foreground mt-1 leading-snug">
                {alert.detail}
              </p>
              {alert.age !== null && isCritical && alert.age >= 7 && (
                <p className="text-[10px] text-foreground/50 font-medium mt-1.5">
                  Action needed
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
