"use client";

import Link from "next/link";
import { MessageCircleOff, MessageCircleWarning } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";

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
      className="flex items-start gap-3 border-b border-[var(--card-border)] bg-amber-50 px-4 py-3 hover:bg-amber-100/70 dark:bg-amber-950/30"
      data-testid="whatsapp-paused-alert"
    >
      <span className="mt-0.5 text-amber-600"><MessageCircleOff className="w-3.5 h-3.5" /></span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          WhatsApp paused for {count} {count === 1 ? "shop" : "shops"}
        </p>
        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
          Most of their recent messages did not reach customers, or staff paused them. Orders still come in.
        </p>
      </div>
    </Link>
  );
}

/** The bell's red row while Interakt refuses sends for lack of balance. */
export function WhatsAppHealthAlert({ since, timeAgo }: { since: string | null; timeAgo: (iso: string) => string }) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--card-border)] bg-red-50 px-4 py-3 dark:bg-red-950/30" data-testid="interakt-empty-alert">
      <span className="mt-0.5 text-red-600"><MessageCircleWarning className="w-3.5 h-3.5" /></span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-red-700 dark:text-red-300">Interakt balance is empty</p>
        <p className="text-[11px] text-red-700/80 dark:text-red-300/80 mt-0.5">
          WhatsApp messages to every shop&apos;s customers are not being sent. Top up Interakt.
        </p>
        {since && <p className="text-[10px] text-red-700/60 mt-1">Since {timeAgo(since)}</p>}
      </div>
    </div>
  );
}
