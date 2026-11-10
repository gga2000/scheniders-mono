"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, Wallet, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";

const topupRequestsSchema = z.object({
  requests: z.array(
    z.object({
      id: z.string(),
      tenant_id: z.string(),
      amount_iqd: z.number(),
      method: z.enum(["zain_cash", "qi_card"]),
      created_at: z.string(),
      receipt_url: z.string().nullable(),
      tenants: z.object({ business_name: z.string(), slug: z.string() }).nullable(),
    }),
  ),
});
type TopupRequest = z.infer<typeof topupRequestsSchema>["requests"][number];

const TOPUP_REQUESTS_KEY = ["admin", "wallet-topup-requests"] as const;

const METHOD_LABEL: Record<TopupRequest["method"], string> = { zain_cash: "Zain Cash", qi_card: "Qi Card" };

function formatIQD(amount: number): string {
  return `${new Intl.NumberFormat("en-US").format(amount)} IQD`;
}

/** Shops waiting for our team to check a top-up receipt; refreshed every minute. */
export function useTopupRequests() {
  return useQuery({
    queryKey: TOPUP_REQUESTS_KEY,
    queryFn: async (): Promise<TopupRequest[]> => {
      const res = await adminFetch("/api/wallet-topup-requests");
      if (!res.ok) throw new Error(`Top-up requests failed: ${res.status}`);
      return topupRequestsSchema.parse(await res.json()).requests;
    },
    refetchInterval: 60_000,
  });
}

/**
 * The bell's top-up list. Approving adds money, so each button asks once more
 * on the same row («Add 25,000 IQD?») before anything is sent.
 */
export function TopupRequestsSection({ requests, timeAgo }: { requests: TopupRequest[]; timeAgo: (iso: string) => string }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<{ id: string; approve: boolean } | null>(null);
  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const res = await adminFetch(`/api/wallet-topup-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      if (!res.ok && res.status !== 409) throw new Error(`Top-up decision failed: ${res.status}`);
    },
    onSettled: () => {
      setConfirming(null);
      queryClient.invalidateQueries({ queryKey: TOPUP_REQUESTS_KEY });
    },
  });

  if (requests.length === 0) return null;

  return (
    <div className="border-b border-[var(--card-border)]" data-testid="wallet-topup-requests">
      <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">Wallet top-ups to check</p>
      {requests.map((req) => {
        const asking = confirming?.id === req.id ? confirming : null;
        const busy = decide.isPending && decide.variables?.id === req.id;
        return (
          <div key={req.id} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 text-green-600"><Wallet className="w-3.5 h-3.5" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{req.tenants?.business_name ?? req.tenant_id}</p>
              <p className="text-[11px] text-foreground/50 tabular-nums mt-0.5">
                {formatIQD(req.amount_iqd)} by {METHOD_LABEL[req.method]}
              </p>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-foreground/30">
                <span>{timeAgo(req.created_at)}</span>
                {req.receipt_url && (
                  <a
                    href={req.receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-blue-600 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Receipt
                  </a>
                )}
              </div>
            </div>
            {asking ? (
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className="text-[10px] text-foreground/60">
                  {asking.approve ? `Add ${formatIQD(req.amount_iqd)}?` : "Refuse this receipt?"}
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="rounded-lg border border-[var(--card-border)] px-2 py-1 text-[11px]"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => decide.mutate(asking)}
                    disabled={busy}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50 ${asking.approve ? "bg-green-600" : "bg-red-600"}`}
                  >
                    {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                    Yes
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label="Refuse"
                  onClick={() => setConfirming({ id: req.id, approve: false })}
                  className="inline-flex items-center rounded-lg border border-[var(--card-border)] px-2 py-1.5 text-[11px] text-red-600 hover:bg-red-50"
                >
                  <X className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming({ id: req.id, approve: true })}
                  className="inline-flex items-center gap-1 rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] font-semibold text-background hover:opacity-90"
                >
                  <Check className="w-3 h-3" />
                  Approve
                </button>
              </div>
            )}
          </div>
        );
      })}
      {decide.isError && <p className="px-4 pb-3 text-[11px] text-red-600">Couldn&apos;t save the decision. Try again.</p>}
    </div>
  );
}
