"use client";

import { useState } from "react";
import { Check, Loader2, Truck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";
import { answerLostWords } from "@/lib/answer-lost";
import { sendStep } from "@/lib/send-json";
import { formatWhen } from "@/lib/format";
import { SHELL_READ, useAfterPageReads } from "@/hooks/use-after-page-reads";

const outcomeSchema = z.enum(["not_linked", "shared_account", "choose_shop", "no_shop", "prime_down"]).nullable();

const primeRequestsSchema = z.object({
  requests: z.array(
    z.object({
      id: z.string(),
      tenant_id: z.string(),
      prime_phone: z.string(),
      created_at: z.string(),
      outcome: outcomeSchema,
      prime_login_id: z.string().nullable(),
      prime_name: z.string().nullable(),
      prime_shop_id: z.number().nullable(),
      prime_shops: z.array(z.object({ id: z.number(), name: z.string() })).nullable(),
      tenants: z.object({ business_name: z.string(), slug: z.string() }).nullable(),
    }),
  ),
});
type PrimeLinkRequest = z.infer<typeof primeRequestsSchema>["requests"][number];

const PRIME_REQUESTS_KEY = ["admin", "prime-link-requests"] as const;

/** What the team does about each request, by why it is still open. */
const WAITING_ON: Record<NonNullable<PrimeLinkRequest["outcome"]> | "unchecked", string> = {
  not_linked: "Prime has not linked this account to our system. Ask Prime; it links by itself after.",
  shared_account: "Another shop uses this Prime account. Approve to let this shop use it too.",
  choose_shop: "The shop is picking which Prime shop to send from.",
  no_shop: "This Prime account has no active shop. Ask Prime to open one.",
  prime_down: "Prime is not answering. Retried every few minutes.",
  unchecked: "Being checked with Prime.",
};

/** Shops whose Prime link is not made yet; refreshed every minute. */
export function usePrimeLinkRequests() {
  return useQuery({
    queryKey: PRIME_REQUESTS_KEY,
    meta: SHELL_READ,
    enabled: useAfterPageReads(),
    queryFn: async (): Promise<PrimeLinkRequest[]> => {
      const res = await adminFetch("/api/prime-link-requests");
      if (!res.ok) throw new Error(`Prime link requests failed: ${res.status}`);
      return primeRequestsSchema.parse(await res.json()).requests;
    },
    refetchInterval: 60_000,
  });
}

/**
 * The bell's Prime list (Fermi A3). Most shops link themselves; what is left
 * here waits on Prime or on us. «Approve» links a shop to the Prime account
 * the merchant app found, with a shop picked when the account has several.
 */
export function PrimeLinkRequestsSection({ requests }: { requests: PrimeLinkRequest[] }) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Record<string, number>>({});
  const approve = useMutation({
    mutationFn: async ({ id, shopId }: { id: string; shopId: number | null }) => {
      await sendStep<unknown>(
        `/api/prime-link-requests/${id}`,
        shopId ? { shopId } : {},
        "POST",
        answerLostWords("the Prime link requests"),
        "The request was not approved.",
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PRIME_REQUESTS_KEY }),
  });

  if (requests.length === 0) return null;

  return (
    <div className="border-b border-[var(--card-border)]" data-testid="prime-link-requests">
      <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-foreground/70">Prime link requests</p>
      {requests.map((req) => {
        const shops = req.prime_shops ?? [];
        const shopId = req.prime_shop_id ?? picked[req.id] ?? null;
        const canApprove = req.prime_login_id !== null && (shopId !== null || shops.length > 1);
        const busy = approve.isPending && approve.variables?.id === req.id;
        return (
          <div key={req.id} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 text-[#315EA8]"><Truck className="w-3.5 h-3.5" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate name-dir" title={req.tenants?.business_name ?? req.tenant_id}>{req.tenants?.business_name ?? req.tenant_id}</p>
              <p className="text-xs text-foreground/70 tabular-nums mt-0.5">
                Prime account {req.prime_phone}
                {req.prime_name ? ` · ${req.prime_name}` : ""}
                {req.prime_login_id && req.prime_login_id !== req.prime_phone ? ` (${req.prime_login_id})` : ""}
              </p>
              <p className="text-xs text-foreground/70 mt-1">{WAITING_ON[req.outcome ?? "unchecked"]}</p>
              {req.prime_login_id && req.prime_shop_id === null && shops.length > 1 && (
                <select
                  aria-label="Prime shop"
                  value={picked[req.id] ?? ""}
                  onChange={(e) => setPicked((p) => ({ ...p, [req.id]: Number(e.target.value) }))}
                  className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2 py-1 text-xs text-foreground"
                >
                  <option value="" disabled>Pick the Prime shop</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                  ))}
                </select>
              )}
              <p className="text-xs text-foreground/70 mt-1">{formatWhen(req.created_at)}</p>
            </div>
            {canApprove && (
              <button
                type="button"
                onClick={() => approve.mutate({ id: req.id, shopId: req.prime_shop_id === null ? shopId : null })}
                disabled={busy || shopId === null}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Approve
              </button>
            )}
          </div>
        );
      })}
      {approve.isError && <p className="px-4 pb-3 text-xs text-[var(--ink-red)]">{approve.error.message}</p>}
    </div>
  );
}
