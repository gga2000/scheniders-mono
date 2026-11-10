"use client";

import { CalendarX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";

const missedSchema = z.object({ tenant_id: z.string(), business_name: z.string().nullable(), due: z.string() });
const checkSchema = z.object({ trialsNotPaused: z.array(missedSchema), renewalsMissed: z.array(missedSchema) });
export type BillingCheck = z.infer<typeof checkSchema>;

/** Shops the daily billing jobs missed; checked every 10 minutes. */
export function useBillingCheck() {
  return useQuery({
    queryKey: ["admin", "billing-check"],
    queryFn: async () => {
      const res = await adminFetch("/api/billing-check");
      if (!res.ok) throw new Error(`Billing check failed: ${res.status}`);
      return checkSchema.parse(await res.json());
    },
    refetchInterval: 10 * 60_000,
  });
}

export function billingCheckCount(check: BillingCheck | undefined): number {
  return check ? check.trialsNotPaused.length + check.renewalsMissed.length : 0;
}

function names(rows: BillingCheck["trialsNotPaused"]): string {
  const shown = rows.slice(0, 3).map((r) => r.business_name ?? r.tenant_id.slice(0, 8));
  return rows.length > 3 ? `${shown.join(", ")} +${rows.length - 3}` : shown.join(", ");
}

/** The bell's red row when a daily billing job missed a shop. */
export function BillingCheckAlert({ check }: { check: BillingCheck }) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--card-border)] bg-red-50 px-4 py-3 dark:bg-red-950/30" data-testid="billing-check-alert">
      <span className="mt-0.5 text-red-600"><CalendarX className="w-3.5 h-3.5" /></span>
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold text-red-700 dark:text-red-300">A daily billing job missed shops</p>
        {check.trialsNotPaused.length > 0 && (
          <p className="text-[11px] text-red-700/80 dark:text-red-300/80">
            Trial ended but still open: {names(check.trialsNotPaused)}
          </p>
        )}
        {check.renewalsMissed.length > 0 && (
          <p className="text-[11px] text-red-700/80 dark:text-red-300/80">
            Month ended, not renewed: {names(check.renewalsMissed)}
          </p>
        )}
      </div>
    </div>
  );
}
