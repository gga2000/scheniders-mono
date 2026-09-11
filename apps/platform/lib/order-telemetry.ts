import * as Sentry from "@sentry/nextjs";

/**
 * Error reporting for the orders surface.
 *
 * The busiest screen in the product reported nothing: failures surfaced as a
 * toast and a `console.error` and then vanished. Nobody could tell whether a
 * merchant's "it didn't save" was a one-off or a pattern, and the audit's own
 * money and security bugs had to be found by reading code rather than by seeing
 * them fail.
 *
 * Everything goes through here so each report carries the same context — which
 * tenant, which order, which operation — because an untagged exception on a
 * multi-tenant surface is nearly as hard to act on as no exception at all.
 */

export type OrderErrorContext = {
    /** What was being attempted, e.g. "updateStatus", "bulkDelete", "shipExport". */
    operation: string;
    orderId?: string | null;
    tenantId?: string | null;
    /** Anything else worth having in the report. Keep it small and non-PII. */
    extra?: Record<string, unknown>;
};

/**
 * Outcomes that are expected under normal use and must NOT be reported.
 *
 * `CONFLICT_DETECTED` is the optimistic-concurrency guard doing its job: two
 * people edited the same order and the second was told to refresh. Reporting it
 * would bury real failures under routine ones, which is how error tracking stops
 * being read.
 */
const EXPECTED_ERRORS = new Set(["CONFLICT_DETECTED"]);

export function isExpectedOrderError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return EXPECTED_ERRORS.has(message);
}

/** Build the Sentry payload. Exported so the shape can be tested without Sentry. */
export function buildOrderErrorReport(context: OrderErrorContext) {
    return {
        tags: {
            area: "orders",
            operation: context.operation,
            ...(context.tenantId ? { tenant_id: context.tenantId } : {}),
            ...(context.orderId ? { order_id: context.orderId } : {}),
        },
        contexts: {
            order: {
                operation: context.operation,
                orderId: context.orderId ?? null,
                tenantId: context.tenantId ?? null,
                ...(context.extra ?? {}),
            },
        },
    };
}

/**
 * Report a failure on the orders surface. Silently skips expected outcomes.
 */
export function reportOrderError(error: unknown, context: OrderErrorContext): void {
    if (isExpectedOrderError(error)) return;

    if (process.env.NODE_ENV !== "production") {
        console.error(`[orders:${context.operation}]`, error, context);
    }

    Sentry.captureException(error, buildOrderErrorReport(context));
}
