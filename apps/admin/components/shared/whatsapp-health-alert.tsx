"use client";

import { MessageCircleWarning } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";

const healthSchema = z.object({ interaktEmpty: z.boolean(), since: z.string().nullable() });

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
