import { Lock } from "lucide-react";
import { lockSentence, type ListBillingLock } from "@/lib/billing-lock-label";

/**
 * A shop held by the billing lock keeps the status "trial" or "active", so the
 * status alone reads as if nothing were wrong. This chip says it in a word; the
 * reason and the day are in its tooltip.
 */
export function LockedChip({ lock }: { lock: ListBillingLock }) {
  return (
    <span
      title={lockSentence(lock)}
      className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 w-fit shrink-0 bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-400"
    >
      <Lock className="w-3 h-3" aria-hidden="true" />
      Locked
    </span>
  );
}
