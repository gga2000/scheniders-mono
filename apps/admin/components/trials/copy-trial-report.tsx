"use client";

import { useState } from "react";
import { ClipboardCopy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";

const reportAnswerSchema = z.object({ text: z.string().min(1) });
const errorAnswerSchema = z.object({ error: z.string() });

/**
 * "Copy report for WhatsApp" on a shop on trial (Fermi B12 item 2): the
 * shop's trial report as one Arabic message, in the same words the merchant
 * reads on Home (GET /api/merchants/[id]/trial-report), ready to paste.
 * A read that gets no answer (a dropped connection) is said too, never left
 * as a spinner that stops in silence (audit round 22). It only reads, so
 * trying again is safe.
 */
export function CopyTrialReport({ shopId, shopName }: { shopId: string; shopName: string }) {
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await adminFetch(`/api/merchants/${shopId}/trial-report`);
      const body: unknown = await res.json().catch(() => null);
      const report = reportAnswerSchema.safeParse(body);
      if (!res.ok || !report.success) {
        const said = errorAnswerSchema.safeParse(body);
        toast.error(said.success ? said.data.error : "Could not load the report. Try again.");
        return;
      }
      try {
        await navigator.clipboard.writeText(report.data.text);
        toast.success(`${shopName}'s report copied. Paste it in WhatsApp.`);
      } catch {
        toast.error("The browser did not let the report be copied. Try again.");
      }
    } catch {
      toast.error("The report did not load: no answer came back. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
      Copy report for WhatsApp
    </button>
  );
}
