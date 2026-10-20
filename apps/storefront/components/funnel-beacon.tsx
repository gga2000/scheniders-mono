"use client";
// The merchant's own funnel (Store → Command center), first-party. Fires a
// page_view per page render and a view_product on product pages, and hands
// the pixel helper a sink so AddToCart / InitiateCheckout reach the same
// table the marketing pixels see. Purchases are recorded by the checkout
// server with its own total — never from here.
import { useEffect } from "react";
import { setFunnelSink, type FunnelEvent } from "@scheniders/sections";

const FLUSH_MS = 800;
/** Matches the /api/events body limit. */
const MAX_BATCH = 20;

export function FunnelBeacon({
  tenantId,
  pageId,
  productId,
}: {
  tenantId: string;
  pageId: string;
  productId?: string;
}) {
  useEffect(() => {
    let queue: FunnelEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      // The route takes at most MAX_BATCH events a request; send the whole
      // queue, a batch at a time, rather than stranding the remainder.
      while (queue.length > 0) {
        const events = queue.splice(0, MAX_BATCH);
        void fetch("/api/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tenant_id: tenantId, events }),
          keepalive: true,
        }).catch((error: unknown) => {
          // Fire-and-forget: a lost batch only undercounts the funnel, so it
          // never surfaces to the shopper — but it is not silent either.
          console.warn("[funnel-beacon] events batch failed", error);
        });
      }
    };
    const push = (e: FunnelEvent) => {
      queue.push({ ...e, page_id: e.page_id ?? pageId });
      if (!timer) timer = setTimeout(flush, FLUSH_MS);
    };

    push({ type: "page_view" });
    if (productId) push({ type: "view_product", product_id: productId });
    setFunnelSink(push);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      setFunnelSink(null);
      document.removeEventListener("visibilitychange", onHide);
      if (timer) clearTimeout(timer);
      flush();
      queue = [];
    };
  }, [tenantId, pageId, productId]);
  return null;
}
