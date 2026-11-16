"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Lock, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure } from "@/lib/load-failure";
import { TOPUP_QUEUE_KEY, topupQueueItemSchema, topupWarnings, type TopupQueueItem } from "@/lib/topup-queue";
import { formatIQD, formatWhen } from "@/lib/format";

const responseSchema = z.object({ requests: z.array(topupQueueItemSchema) });

const METHOD_LABEL: Record<TopupQueueItem["method"], string> = { zain_cash: "Zain Cash", qi_card: "Qi Card" };


/** Shops waiting for our team to check a transfer receipt; refreshed every minute. */
export function useTopupRequests() {
  return useQuery({
    queryKey: TOPUP_QUEUE_KEY,
    queryFn: async (): Promise<TopupQueueItem[]> => {
      const res = okOrLoadFailure(await adminFetch("/api/wallet-topup-requests"), "the payments");
      return responseSchema.parse(await res.json()).requests;
    },
    refetchInterval: 60_000,
  });
}

/**
 * The bell's list of receipts to check. Deciding happens on «Payments to
 * check» (/payments), where the receipt, the amount that arrived and the
 * reason for a refusal have room.
 */
export function TopupRequestsSection({ requests }: { requests: TopupQueueItem[] }) {
  if (requests.length === 0) return null;

  return (
    <div className="border-b border-[var(--card-border)]" data-testid="wallet-topup-requests">
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Payments to check</p>
        <Link href="/payments" className="text-xs font-semibold text-blue-600 hover:underline">
          Open all
        </Link>
      </div>
      {requests.map((req) => {
        const flagged = topupWarnings(req).length > 0;
        return (
          <Link key={req.id} href="/payments" className="flex items-start gap-3 px-4 py-3 hover:bg-foreground/[0.03]">
            <span className="mt-0.5 text-green-600"><Wallet className="w-3.5 h-3.5" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{req.business_name ?? req.tenant_id}</p>
              <p className="text-xs text-foreground/50 tabular-nums mt-0.5">
                {formatIQD(req.amount_iqd)} by {METHOD_LABEL[req.method]}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-foreground/40">
                <span>{formatWhen(req.created_at)}</span>
                {req.billing?.locked && (
                  <span className="inline-flex items-center gap-0.5 text-amber-700">
                    <Lock className="w-3 h-3" />
                    locked
                  </span>
                )}
                {flagged && (
                  <span className="inline-flex items-center gap-0.5 text-rose-700">
                    <AlertTriangle className="w-3 h-3" />
                    check twice
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="mt-1 w-3.5 h-3.5 shrink-0 text-foreground/30" />
          </Link>
        );
      })}
    </div>
  );
}
