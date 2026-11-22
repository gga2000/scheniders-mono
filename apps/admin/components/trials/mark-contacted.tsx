"use client";

import { useState } from "react";
import { Loader2, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSupportLogShopCall } from "@/hooks/use-support-cases";
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS, type CallOutcome } from "@/lib/support";

const BUTTON =
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-60";
const OUTLINE = "border border-[var(--card-border)] text-foreground hover:bg-foreground/5";

/**
 * "Mark contacted" on a shop on trial: how the call went (done, no answer,
 * later) and an optional line for the next person, saved in the same call
 * log as the Support page's calls (POST /api/support/calls).
 */
export function MarkContacted({ shopId, shopName }: { shopId: string; shopName: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const log = useSupportLogShopCall();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(BUTTON, OUTLINE)}>
        <PhoneCall className="h-3.5 w-3.5" />
        Mark contacted
      </button>
    );
  }

  const record = (outcome: CallOutcome) => {
    if (log.isPending) return;
    log.mutate(
      { tenantId: shopId, outcome, note },
      {
        onSuccess: () => {
          setOpen(false);
          setNote("");
          toast.success(`Call on ${shopName} saved`);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        dir="auto"
        placeholder="What did they say? (optional)"
        aria-label={`What ${shopName} said`}
        className="w-56 rounded-full border border-[var(--card-border)] bg-transparent px-3 py-1 text-xs text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
      />
      {CALL_OUTCOMES.map((outcome) => (
        <button
          key={outcome}
          type="button"
          disabled={log.isPending}
          onClick={() => record(outcome)}
          className={cn(BUTTON, outcome === "done" ? "bg-[var(--primary)] text-[var(--primary-fg)]" : OUTLINE)}
        >
          {log.isPending && log.variables?.outcome === outcome && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {CALL_OUTCOME_LABELS[outcome]}
        </button>
      ))}
      <button
        type="button"
        disabled={log.isPending}
        onClick={() => setOpen(false)}
        className="px-2 py-1 text-xs text-foreground/70 transition-colors hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
