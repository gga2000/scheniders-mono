"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";

/**
 * Shown when the console could not read the person's own staff row (a network
 * or database blip). Buttons that need a role stay hidden until the read
 * works; the person stays signed in, because a failed read is not a "no".
 */
export function AccessCheckNotice() {
  const { accessCheckFailed, recheckAccess } = useAdminAuth();
  if (!accessCheckFailed) return null;

  return (
    <div
      role="alert"
      className="mx-4 md:mx-6 mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-500/5 px-4 py-2.5 text-sm text-foreground"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--ink-red)]" aria-hidden />
      <p className="flex-1 min-w-0">
        Could not check your access, so buttons that need it are hidden. You are still signed in.
      </p>
      <button
        type="button"
        onClick={recheckAccess}
        className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/50"
      >
        <RotateCw className="w-3.5 h-3.5" aria-hidden />
        Try again
      </button>
    </div>
  );
}
