"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSupportPush } from "@/hooks/use-support-push";

const HINT: Record<"unsupported" | "blocked", string> = {
  unsupported: "This browser cannot get alerts. On iPhone, add this page to the Home Screen first.",
  blocked: "Notifications are blocked for this site. Allow them in the browser settings.",
};

/** Turns new-message alerts on or off for this device. */
export function SupportAlertsToggle() {
  const { state, busy, turnOn, turnOff } = useSupportPush();

  if (state === "checking") return null;

  if (state === "unsupported" || state === "blocked") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-foreground-muted" title={HINT[state]}>
        <BellOff className="h-4 w-4" />
        {state === "blocked" ? "Alerts blocked" : "No alerts here"}
      </span>
    );
  }

  const on = state === "on";
  const run = () =>
    (on ? turnOff() : turnOn()).then(
      () => toast.success(on ? "Alerts off on this device." : "Alerts on. A new message will ping this device."),
      (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not change alerts."),
    );

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title={on ? "New merchant messages ping this device." : "Get a ping on this device when a merchant writes."}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60",
        on
          ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300"
          : "border-[var(--card-border)] bg-[var(--card-bg)] text-foreground hover:bg-foreground/5",
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : on ? (
        <Bell className="h-4 w-4" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
      {on ? "Alerts on" : "Turn on alerts"}
    </button>
  );
}
