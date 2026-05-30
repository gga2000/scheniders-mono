"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LastActor } from "@/hooks/use-last-actors";

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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

interface LastActorBadgeProps {
  actor: LastActor | null | undefined;
  size?: "xs" | "sm";
  showLabel?: boolean;
}

export function LastActorBadge({ actor, size = "xs", showLabel = false }: LastActorBadgeProps) {
  const [open, setOpen] = useState(false);

  if (!actor) return null;

  const dimensions = size === "xs" ? "w-5 h-5" : "w-6 h-6";
  const text = size === "xs" ? "text-[9px]" : "text-[10px]";
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
        <span className="text-[10px] font-semibold text-foreground/60 truncate max-w-[80px]">
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
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-[10px] font-black shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-foreground truncate leading-tight">
                {actor.display_name}
              </p>
              {actor.email && (
                <p className="text-[10px] text-foreground/45 truncate leading-tight">
                  {actor.email}
                </p>
              )}
            </div>
          </div>
          <p className="text-[10px] text-foreground/60 mt-1.5 leading-snug">
            <span className="font-semibold text-foreground/80">{verb}</span>
            <span className="text-foreground/40"> · {timeAgo(actor.when)}</span>
          </p>
        </div>
      )}
    </div>
  );
}
