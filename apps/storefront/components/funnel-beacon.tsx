"use client";
// The merchant's own funnel (Store → Command center), first-party. Fires a
// page_view per page render and a view_product on product pages, and hands
// the pixel helper a sink so AddToCart / InitiateCheckout reach the same
// table the marketing pixels see. Purchases are recorded by the checkout
// server with its own total — never from here.
import { useEffect } from "react";
import { setFunnelSink, type FunnelEvent } from "@scheniders/sections";

const FLUSH_MS = 800;

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
      if (queue.length === 0) return;
      const events = queue.splice(0, 20);
      void fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, events }),
        keepalive: true,
      }).catch(() => {
        /* fire-and-forget */
      });
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
