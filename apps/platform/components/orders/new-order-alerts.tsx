"use client";

import { useNewOrderAlerts } from "@/hooks/use-new-order-alerts";

/** Mounts the app-wide new-order alert. Render once, in the root layout. */
export function NewOrderAlerts() {
    useNewOrderAlerts();
    return null;
}
