"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCan } from "@/hooks/use-admin-auth";
import { adminFetch } from "@/lib/admin-fetch";
import { CUSTOM_WA_QUEUE_KEY, customWaQueueSchema } from "@/lib/custom-whatsapp-queue";
import { okOrLoadFailure, pollEvery } from "@/lib/load-failure";
import { LoadFailedLine } from "@/components/shared/load-failed-line";
import { StaleLine } from "@/components/shared/stale-line";
import { CustomMessageCard } from "./custom-message-card";

/**
 * «Custom messages» on the WhatsApp page: a shop paid 15,000 IQD for its own
 * wording of an automatic order message, and our team submits it in Interakt
 * by hand. Open requests first; the last 30 days of decided ones on request.
 */
export function CustomMessagesQueue() {
  const can = useCan();
  const [showEnded, setShowEnded] = useState(false);
  const read = useQuery({
    queryKey: CUSTOM_WA_QUEUE_KEY,
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch("/api/whatsapp/custom-templates"), "the custom messages");
      return customWaQueueSchema.parse(await res.json());
    },
    staleTime: 30_000,
    refetchInterval: pollEvery(120_000),
  });

  const items = read.data?.items ?? [];
  const open = items.filter((i) => i.status === "review" || i.status === "at_meta");
  const ended = items.filter((i) => i.status !== "review" && i.status !== "at_meta");
  const canReview = can("review_whatsapp_templates");

  return (
    <section id="custom-messages" className="pastel-card p-4 md:p-5 space-y-3" data-testid="custom-wa-queue">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Custom messages</h2>
          <p className="text-[13px] text-foreground/70 max-w-2xl">
            Shops that paid for their own wording of an order message. Copy each field into Interakt&apos;s new
            template form, submit it, then come back with Meta&apos;s answer. A refusal refunds the shop and shows
            it your reason.
          </p>
          <StaleLine read={read} what="the custom messages" kept="list" className="mt-2" />
        </div>
        {ended.length > 0 && (
          <button
            type="button"
            onClick={() => setShowEnded((v) => !v)}
            className="text-xs font-semibold text-[var(--ink-blue)] hover:underline"
          >
            {showEnded ? "Hide decided" : `Show decided, last 30 days (${ended.length})`}
          </button>
        )}
      </div>

      {read.isError && !read.data ? (
        <LoadFailedLine what="the custom messages" error={read.error} onRetry={() => void read.refetch()} retrying={read.isFetching} />
      ) : read.isPending ? (
        <p className="text-xs text-foreground/70">Loading…</p>
      ) : open.length === 0 ? (
        <p className="text-xs text-foreground/70">Nothing waiting.</p>
      ) : null}

      {open.map((item) => (
        <CustomMessageCard
          key={item.id}
          item={item}
          headerImageUrl={read.data?.header_images?.[item.purpose] ?? null}
          canReview={canReview}
        />
      ))}
      {showEnded &&
        ended.map((item) => <CustomMessageCard key={item.id} item={item} headerImageUrl={null} canReview={false} />)}
    </section>
  );
}
