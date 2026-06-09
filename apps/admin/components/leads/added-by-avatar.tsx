"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface AddedByUser {
  display_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface AddedByAvatarProps {
  /** The employee who added the lead (`lead.created_by_user`). Null for legacy, un-attributed leads. */
  user: AddedByUser | null | undefined;
  /** ISO timestamp the lead was added (`lead.created_at`) — surfaced in the hover card. */
  addedAt?: string;
  size?: "xs" | "sm";
  /** Render the employee's name beside the avatar. */
  showName?: boolean;
  className?: string;
}

function formatAddedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Avatar of the employee who added a lead, with a hover card showing their name,
 * email, and when the lead was added. Falls back to an initial when no photo is set,
 * and to a neutral "untracked" placeholder for legacy leads with no attribution.
 */
export function AddedByAvatar({
  user,
  addedAt,
  size = "xs",
  showName = false,
  className,
}: AddedByAvatarProps) {
  const [open, setOpen] = useState(false);

  const dimensions = size === "xs" ? "w-6 h-6" : "w-7 h-7";
  const text = size === "xs" ? "text-[10px]" : "text-[11px]";

  // Legacy leads added before attribution existed: show a muted placeholder.
  if (!user) {
    return (
      <span
        className={cn(
          dimensions,
          "inline-flex items-center justify-center rounded-full border border-dashed border-[var(--card-border)] text-[var(--muted)] text-[10px] shrink-0",
          className
        )}
        title="No employee on record"
        aria-label="No employee on record"
      >
        —
      </span>
    );
  }

  const name = user.display_name?.trim() || user.email;
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={cn("relative inline-flex items-center gap-1.5", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt=""
          className={cn(dimensions, "rounded-full object-cover ring-2 ring-[var(--card-bg)] shrink-0")}
        />
      ) : (
        <div
          className={cn(
            dimensions,
            text,
            "rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 ring-2 ring-[var(--card-bg)] flex items-center justify-center text-white font-black shrink-0"
          )}
        >
          {initial}
        </div>
      )}

      {showName && (
        <span className="text-xs font-medium text-[var(--foreground)] truncate max-w-[120px]">
          {name}
        </span>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-52 p-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Supabase avatar URLs, matches LastActorBadge pattern
              <img
                src={user.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-[10px] font-black shrink-0">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[var(--foreground)] truncate leading-tight">
                {name}
              </p>
              {user.display_name && (
                <p className="text-[10px] text-[var(--muted)] truncate leading-tight">
                  {user.email}
                </p>
              )}
            </div>
          </div>
          <p className="text-[10px] text-[var(--muted)] mt-1.5 leading-snug">
            Added this lead{addedAt ? ` · ${formatAddedAt(addedAt)}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
