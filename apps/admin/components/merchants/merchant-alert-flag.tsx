"use client";

import { useState, useRef, useEffect } from "react";
import { AlertCircle, Clock, Ban, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminTenant } from "@/types/admin";

interface MerchantAlertFlagProps {
  merchant: AdminTenant;
}

interface AlertInfo {
  icon: typeof AlertCircle;
  label: string;
  detail: string;
  age: number | null;
  severity: "critical" | "warning";
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return null;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function computeAlert(merchant: AdminTenant): AlertInfo | null {
  const status = (merchant as { status?: string }).status;
  const trialEnd = (merchant as { trial_ends_at?: string | null }).trial_ends_at ?? null;
  const subEnd =
    (merchant as { subscription_ends_at?: string | null }).subscription_ends_at ?? null;
  const cancelledAt =
    (merchant as { cancelled_at?: string | null }).cancelled_at ?? null;
  const suspendedAt =
    (merchant as { suspended_at?: string | null }).suspended_at ?? null;

  if (status === "suspended") {
    const age = daysSince(suspendedAt);
    return {
      icon: Ban,
      label: "Suspended",
      detail:
        age !== null
          ? `Suspended ${age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`}`
          : "Account is currently suspended",
      age,
      severity: "critical",
    };
  }

  if (status === "cancelled") {
    const age = daysSince(cancelledAt) ?? daysSince(subEnd);
    return {
      icon: XCircle,
      label: "Cancelled",
      detail:
        age !== null
          ? `Subscription cancelled ${age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`}`
          : "Subscription has been cancelled",
      age,
      severity: "critical",
    };
  }

  if (status === "trial" && trialEnd) {
    const remaining = daysUntil(trialEnd);
    if (remaining !== null && remaining <= 0) {
      const expired = daysSince(trialEnd) ?? 0;
      return {
        icon: AlertCircle,
        label: "Trial expired",
        detail:
          expired === 0
            ? "Trial expired today — convert to paid"
            : `Trial expired ${expired} day${expired === 1 ? "" : "s"} ago`,
        age: expired,
        severity: "critical",
      };
    }
    if (remaining !== null && remaining <= 3) {
      return {
        icon: Clock,
        label: "Trial ending",
        detail: `Trial ends in ${remaining} day${remaining === 1 ? "" : "s"}`,
        age: remaining,
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
