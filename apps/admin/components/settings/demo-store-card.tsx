"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ExternalLink, Loader2, LogIn, RotateCcw, Store } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure } from "@/lib/load-failure";
import {
  demoCountsLine,
  demoCountsSchema,
  demoCreatedSchema,
  demoStatusSchema,
  type DemoAction,
} from "@/lib/demo-store";

const KEY = ["admin", "demo-store"] as const;

async function post(action: DemoAction): Promise<unknown> {
  const res = await adminFetch("/api/demo-store", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = z.object({ error: z.string() }).safeParse(body);
    throw new Error(message.success ? message.data.error : `Failed: ${res.status}`);
  }
  return body;
}

/**
 * The demo store (Fermi B13): a separate shop full of invented orders for
 * recording videos. Super admins create it once, reset its data before a
 * recording, and open it signed in as its owner.
 */
export function DemoStoreCard() {
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: KEY,
    queryFn: async () =>
      demoStatusSchema.parse(await okOrLoadFailure(await adminFetch("/api/demo-store"), "the demo store").json()),
  });

  const create = useMutation({
    mutationFn: async () => demoCreatedSchema.parse(await post("create")).counts,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const reset = useMutation({
    mutationFn: async () => demoCountsSchema.parse(z.object({ counts: z.unknown() }).parse(await post("reset")).counts),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
    onSettled: () => setConfirmReset(false),
  });
  const open = useMutation({
    // The tab opens on the click itself, so no pop-up blocker stops it; the
    // link fills it once the server has made it.
    mutationFn: async (tab: Window | null) => {
      try {
        const { url } = z.object({ url: z.string().url() }).parse(await post("open"));
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        } else {
          window.location.assign(url);
        }
      } catch (err) {
        tab?.close();
        throw err;
      }
    },
  });

  const busy = create.isPending || reset.isPending || open.isPending;
  const failure = create.error ?? reset.error ?? open.error;
  const done = create.data ?? reset.data;

  return (
    <div className="pastel-card p-6" data-testid="demo-store-card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center">
          <Store className="w-4 h-4 text-foreground/70" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Demo store</h2>
          <p className="text-xs text-foreground/70">
            A separate shop with invented orders, for videos. It sends no WhatsApp, calls no courier, charges no
            money, and is left out of every number in this console.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-foreground/70">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : isError || !data ? (
        <p className="text-xs text-[var(--ink-red)]">Could not load the demo store. Reload the page.</p>
      ) : !data.store ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-foreground/70">No demo store yet.</p>
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-40"
            data-testid="demo-store-create"
          >
            {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            Create the demo store
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/70">
            <span className="font-semibold text-foreground">
              <bdi>{data.store.business_name}</bdi>
            </span>
            <span>{data.store.orders} orders</span>
            <span>{data.store.products} products</span>
            <a
              href={data.store.storefront_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              {data.store.storefront_url.replace("https://", "")}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => open.mutate(window.open("", "_blank"))}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-40"
              data-testid="demo-store-open"
            >
              {open.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
              Open as its owner
            </button>
            {confirmReset ? (
              <>
                <button
                  type="button"
                  onClick={() => reset.mutate()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  data-testid="demo-store-reset-confirm"
                >
                  {reset.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                  Yes, wipe and refill
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  disabled={reset.isPending}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground"
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/50 disabled:opacity-40"
                data-testid="demo-store-reset"
              >
                <RotateCcw className="w-3 h-3" />
                Reset demo data
              </button>
            )}
          </div>
          <p className="text-xs text-foreground/70">
            Reset puts back the same store with dates moved to today; anything recorded in it is lost. Open signs this
            browser in to the merchant app as the demo owner, so use a private window if you are signed in to a real
            store there.
          </p>
        </div>
      )}

      {failure && <p className="mt-3 text-xs text-[var(--ink-red)]">{failure.message}</p>}
      {done && !failure && <p className="mt-3 text-xs text-[var(--ink-green)]">Ready: {demoCountsLine(done)}.</p>}
    </div>
  );
}
