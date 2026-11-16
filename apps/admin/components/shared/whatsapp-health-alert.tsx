"use client";

import Link from "next/link";
import { MessageCircleOff, MessageCircleWarning } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";
import { formatDayTime } from "@/lib/format";

const healthSchema = z.object({ interaktEmpty: z.boolean(), since: z.string().nullable(), pausedShops: z.number().int() });

/** Is the platform's Interakt wallet empty? Every shop sends through it. */
export function useWhatsAppHealth() {
  return useQuery({
    queryKey: ["admin", "whatsapp-health"],
    queryFn: async () => {
      const res = await adminFetch("/api/whatsapp-health");
      if (!res.ok) throw new Error(`WhatsApp health failed: ${res.status}`);
      return healthSchema.parse(await res.json());
    },
    refetchInterval: 60_000,
  });
}

/** The bell's row while shops are paused to protect the shared number. */
export function WhatsAppPausedAlert({ count, onOpen }: { count: number; onOpen?: () => void }) {
  return (
    <Link
      href="/whatsapp"
      onClick={onOpen}
      className="flex items-start gap-3 border-b border-[var(--card-border)] bg-amber-500/5 px-4 py-3 hover:bg-amber-100/70 dark:bg-amber-950/30"
      data-testid="whatsapp-paused-alert"
    >
      <span className="mt-0.5 text-[var(--ink-amber)]"><MessageCircleOff className="w-3.5 h-3.5" /></span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[var(--ink-amber)]">
          WhatsApp paused for {count} {count === 1 ? "shop" : "shops"}
        </p>
        <p className="text-xs text-[var(--ink-amber)] mt-0.5">
          Most of their recent messages did not reach customers, or staff paused them. Orders still come in.
        </p>
      </div>
    </Link>
  );
}

/** The bell's red row while Interakt refuses sends for lack of balance. */
export function WhatsAppHealthAlert({ since }: { since: string | null }) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--card-border)] bg-red-500/5 px-4 py-3 dark:bg-red-950/30" data-testid="interakt-empty-alert">
      <span className="mt-0.5 text-[var(--ink-red)]"><MessageCircleWarning className="w-3.5 h-3.5" /></span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[var(--ink-red)]">Interakt balance is empty</p>
        <p className="text-xs text-[var(--ink-red)] mt-0.5">
          WhatsApp messages to every shop&apos;s customers are not being sent. Top up Interakt.
        </p>
        {since && <p className="text-xs text-[var(--ink-red)] mt-1">Since {formatDayTime(since)}</p>}
      </div>
    </div>
  );
}
