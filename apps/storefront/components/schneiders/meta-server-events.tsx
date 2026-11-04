"use client";

import { useEffect } from "react";
import { setServerEventSink, type ServerPixelEvent } from "@scheniders/sections/helpers/pixels";

/**
 * Sends the store's server a copy of each Meta funnel event the pixel fires
 * (ViewContent / AddToCart / InitiateCheckout), with the same event id, for
 * /api/meta-event to forward through the Conversions API. Mounted only where
 * the Meta pixel runs, so a store without one, and the merchant's draft view,
 * send nothing.
 */
export function MetaServerEvents({ tenantId }: { tenantId: string }) {
  useEffect(() => {
    setServerEventSink((e: ServerPixelEvent) => {
      void fetch("/api/meta-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          event_name: e.event,
          event_id: e.eventId,
          value: e.data.value,
          contents: e.data.contents,
        }),
        // Survives the shopper moving on to the next page mid-request.
        keepalive: true,
      }).catch((error: unknown) => {
        // The browser copy of the event already went out; a lost server copy
        // costs only its backup, so the shopper never sees this.
        console.warn("[meta-server-events] send failed", error);
      });
    });
    return () => setServerEventSink(null);
  }, [tenantId]);
  return null;
}
