"use client";

import { CalendarX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";

const missedSchema = z.object({ tenant_id: z.string(), business_name: z.string().nullable(), due: z.string() });
const checkSchema = z.object({ trialsNotBilled: z.array(missedSchema), renewalsMissed: z.array(missedSchema) });
export type BillingCheck = z.infer<typeof checkSchema>;

/** Shops the daily renewal job missed; checked every 10 minutes. */
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
  return check ? check.trialsNotBilled.length + check.renewalsMissed.length : 0;
}

function names(rows: BillingCheck["renewalsMissed"]): string {
  const shown = rows.slice(0, 3).map((r) => r.business_name ?? r.tenant_id.slice(0, 8));
  return rows.length > 3 ? `${shown.join(", ")} +${rows.length - 3}` : shown.join(", ");
}

/** The bell's red row when a daily billing job missed a shop. */
export function BillingCheckAlert({ check }: { check: BillingCheck }) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--card-border)] bg-red-500/5 px-4 py-3 dark:bg-red-950/30" data-testid="billing-check-alert">
      <span className="mt-0.5 text-[var(--ink-red)]"><CalendarX className="w-3.5 h-3.5" /></span>
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold text-[var(--ink-red)]">The daily renewal job missed shops</p>
        {check.trialsNotBilled.length > 0 && (
          <p className="text-xs text-[var(--ink-red)]">
            Trial ended, never billed: {names(check.trialsNotBilled)}
          </p>
        )}
        {check.renewalsMissed.length > 0 && (
          <p className="text-xs text-[var(--ink-red)]">
            Month ended, not renewed: {names(check.renewalsMissed)}
          </p>
        )}
      </div>
    </div>
  );
}
