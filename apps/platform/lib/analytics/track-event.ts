"use client";

import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { diag } from "@/lib/diag";

/**
 * OBS-D1 — self-hosted product analytics.
 *
 * The business could not answer: how often is the dashboard opened, is the date
 * filter ever used, how often does the metrics query fail for real merchants,
 * which numbers get clicked through. No analytics sink exists in this repo, and
 * choosing a vendor is a product decision with cost, DPA and customer-PII
 * implications — so events go to `public.analytics_events`, inside the system that
 * already holds this data.
 *
 * RULES:
 *  - `props` carries product usage only. NEVER customer PII (names, phones,
 *    addresses) and never money figures — the entitlement boundary SEC-D2
 *    established server-side applies to anything recorded here too.
 *  - Fire-and-forget. Instrumentation must never break, block or slow a render, so
 *    every failure is swallowed to `diag` and nothing is awaited by callers.
 *  - Never chain `.select()` onto the insert: the SELECT policy is admin-only, so
 *    asking for the row back makes an employee's event fail with 42501 even though
 *    the write itself is allowed.
 */
export const DASHBOARD_EVENTS = {
    opened: "dashboard_opened",
    rangeChanged: "dashboard_range_changed",
    metricsFailed: "dashboard_metrics_failed",
    drilldownClicked: "dashboard_drilldown_clicked",
    widgetErrored: "dashboard_widget_errored",
} as const;

export type TrackedEvent = (typeof DASHBOARD_EVENTS)[keyof typeof DASHBOARD_EVENTS];

/** Values safe to record: no free text from customer records. */
export type EventProps = Record<string, string | number | boolean | null>;

export function useTrackEvent() {
    const { user, tenantId, role } = useAuth();

    return useCallback(
        (event: TrackedEvent, props: EventProps = {}) => {
            if (!tenantId) return;   // nothing to attribute it to
            void supabase
                .from("analytics_events")
                .insert({
                    tenant_id: tenantId,
                    user_id: user?.id ?? null,
                    event,
                    props: { ...props, role: role ?? "unknown" },
                })
                .then(({ error }) => {
                    if (error) diag.warn(`[Diag:Analytics] ${event} not recorded — ${error.message}`);
                });
        },
        [tenantId, user?.id, role],
    );
}
