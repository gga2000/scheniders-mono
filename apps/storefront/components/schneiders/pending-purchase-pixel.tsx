"use client";

import { useEffect } from "react";
import { firePendingPurchase } from "@scheniders/sections/helpers/pixels";

/**
 * Fires, once, the Purchase an order form handed to this page (see
 * `handOffPurchase` in helpers/pixels): the form navigates the moment the
 * order is accepted, which can cancel its own pixel request. Rendered by
 * `SchneidersAnalyticsPixels` AFTER the pixel <Script>s, so React runs this
 * effect after theirs and `fbq` / `ttq` already exist (as queues, if their
 * libraries are still loading).
 */
export function PendingPurchasePixel() {
  useEffect(() => {
    firePendingPurchase();
  }, []);
  return null;
}
