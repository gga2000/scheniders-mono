"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LastActor } from "@/hooks/use-last-actors";
import { formatWhen } from "@/lib/format";

const ACTION_LABELS: Record<string, string> = {
  topup: "topped up",
  top_up_wallet: "topped up",
  status_change: "changed status",
  plan_change: "changed plan",
  pause_tenant: "paused",
  unpause_tenant: "resumed",
  suspend_tenant: "suspended",
  reactivate_tenant: "reactivated",
  extend_trial: "extended trial",
  extend_subscription: "extended subscription",
  add_note: "added a note",
  mention_in_note: "was mentioned",
  impersonate: "impersonated",
  auto_renew_toggle: "toggled auto-renew",
  bulk_action: "ran bulk action",
};

interface LastActorBadgeProps {
  actor: LastActor | null | undefined;
  size?: "xs" | "sm";
  showLabel?: boolean;
}

export function LastActorBadge({ actor, size = "xs", showLabel = false }: LastActorBadgeProps) {
  const [open, setOpen] = useState(false);

  if (!actor) return null;

  const dimensions = size === "xs" ? "w-5 h-5" : "w-6 h-6";
  const text = size === "xs" ? "text-xs" : "text-xs";
  const initials = actor.display_name.charAt(0).toUpperCase();
  const verb = ACTION_LABELS[actor.action] ?? actor.action.replace(/_/g, " ");

  return (
    <div
      className="relative inline-flex items-center gap-1 group/lastactor"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {actor.avatar_url ? (
        <img
          src={actor.avatar_url}
          alt=""
          className={cn(
            dimensions,
            "rounded-full object-cover ring-2 ring-[var(--card-bg)] shrink-0"
          )}
        />
      ) : (
        <div
          className={cn(
            dimensions,
            text,
            "rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 ring-2 ring-[var(--card-bg)] flex items-center justify-center text-white font-black shrink-0"
          )}
        >
          {initials}
        </div>
      )}
      {showLabel && (
        <span className="text-xs font-semibold text-foreground/70 truncate max-w-[80px]" title={actor.display_name}>
          {actor.display_name}
        </span>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-48 p-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            {actor.avatar_url ? (
              <img
                src={actor.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-black shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground truncate leading-tight" title={actor.display_name}>
                {actor.display_name}
              </p>
              {actor.email && (
                <p className="text-xs text-foreground/70 truncate leading-tight" title={actor.email}>
                  {actor.email}
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-foreground/70 mt-1.5 leading-snug">
            <span className="font-semibold text-foreground/80">{verb}</span>
            <span className="text-foreground/70"> · {formatWhen(actor.when)}</span>
          </p>
        </div>
      )}
    </div>
  );
}
