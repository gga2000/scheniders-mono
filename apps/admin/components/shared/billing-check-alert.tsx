"use client";

import Link from "next/link";
import { CalendarX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";
import { SHELL_READ, useAfterPageReads } from "@/hooks/use-after-page-reads";

const missedSchema = z.object({ tenant_id: z.string(), business_name: z.string().nullable(), due: z.string() });
const checkSchema = z.object({ trialsNotBilled: z.array(missedSchema), renewalsMissed: z.array(missedSchema) });
export type BillingCheck = z.infer<typeof checkSchema>;

/** Shops the daily renewal job missed; checked every 10 minutes. */
export function useBillingCheck() {
  return useQuery({
    queryKey: ["admin", "billing-check"],
    meta: SHELL_READ,
    enabled: useAfterPageReads(),
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

const SHOWN = 3;

/** Up to three shops, each opening its page, then how many more. */
function Shops({ rows, onOpen }: { rows: BillingCheck["renewalsMissed"]; onOpen?: () => void }) {
  const more = rows.length - SHOWN;
  return (
    <>
      {rows.slice(0, SHOWN).map((row, i) => (
        <span key={row.tenant_id}>
          {i > 0 && ", "}
          <Link href={`/merchants/${row.tenant_id}`} onClick={onOpen} className="font-medium underline underline-offset-2">
            {row.business_name ?? row.tenant_id.slice(0, 8)}
          </Link>
        </span>
      ))}
      {more > 0 && ` +${more}`}
    </>
  );
}

/**
 * The bell's red row when the daily renewal job missed a shop. Its words name
 * the job, not the shop: the shop page's "Not renewed" means renewal is off,
 * a month left unrenewed on purpose (round 21, UX new 6).
 */
export function BillingCheckAlert({ check, onOpen }: { check: BillingCheck; onOpen?: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--card-border)] bg-red-500/5 px-4 py-3 dark:bg-red-950/30" data-testid="billing-check-alert">
      <span className="mt-0.5 text-[var(--ink-red)]"><CalendarX className="w-3.5 h-3.5" /></span>
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold text-[var(--ink-red)]">The daily renewal job missed shops</p>
        {check.trialsNotBilled.length > 0 && (
          <p className="text-xs text-[var(--ink-red)]">
            Trials it did not reach: <Shops rows={check.trialsNotBilled} onOpen={onOpen} />
          </p>
        )}
        {check.renewalsMissed.length > 0 && (
          <p className="text-xs text-[var(--ink-red)]">
            Months it did not reach: <Shops rows={check.renewalsMissed} onOpen={onOpen} />
          </p>
        )}
      </div>
    </div>
  );
}
