/**
 * Reporting helpers for bulk order operations.
 *
 * A bulk action can fail for a subset of the selection, and the operator needs
 * to know *which* orders were left behind and *why* — otherwise the only honest
 * response is to redo the whole batch. Previously every partial failure was
 * reported as "they may have been modified by someone else", which is only one
 * of several real causes and is a guess rather than a reading of the error.
 */

import { ExchangedOrderStatusError, isExchangedOriginalStatusViolation } from "@/lib/order-status-guard";

/** A single failed row from a settled bulk operation. */
export type BulkFailure = {
    id: string;
    error: unknown;
};

/** Why a row was left behind. Drives the wording the operator sees. */
export type BulkFailureReason = "conflict" | "permission" | "missing" | "network" | "exchanged" | "unknown";

/** Reasons a retry cannot fix: the same request is refused the same way. */
const FINAL_REASONS: ReadonlySet<BulkFailureReason> = new Set(["permission", "missing", "exchanged"]);

/** Minimum an order must expose to be named in a failure message. */
export type BulkOrderLabel = {
    id: string;
    order_id?: string | null;
    customer_name?: string | null;
};

/** How many order references to name before collapsing into "+N more". */
export const MAX_NAMED_FAILURES = 5;

function messageOf(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message: unknown }).message ?? "");
    }
    return "";
}

/**
 * Classify a failure by what actually went wrong.
 *
 * `CONFLICT_DETECTED` is thrown by the optimistic-concurrency guard in
 * order-repository; Postgres `42501` is an RLS/permission denial; the
 * exchanged-original guard refuses a delivered order that has an exchange or
 * return.
 */
export function classifyBulkFailure(error: unknown): BulkFailureReason {
    const message = messageOf(error);
    const code =
        error && typeof error === "object" && "code" in error
            ? String((error as { code: unknown }).code ?? "")
            : "";

    if (message === "CONFLICT_DETECTED") return "conflict";
    if (error instanceof ExchangedOrderStatusError || isExchangedOriginalStatusViolation(error)) return "exchanged";
    if (code === "42501" || /permission denied|row-level security/i.test(message)) return "permission";
    if (/row not found|no rows/i.test(message)) return "missing";
    if (/network|fetch failed|timeout|aborted/i.test(message)) return "network";
    return "unknown";
}

/** Human wording for one reason, given how many rows it accounts for. */
export function describeBulkFailureReason(reason: BulkFailureReason, count: number): string {
    const orders = count === 1 ? "order" : "orders";
    switch (reason) {
        case "conflict":
            return `${count} ${orders} changed by someone else — reload and try again`;
        case "permission":
            return `${count} ${orders} you do not have permission to change`;
        case "missing":
            return `${count} ${orders} no longer exist`;
        case "network":
            return `${count} ${orders} failed to reach the server`;
        case "exchanged":
            return `${count} ${orders} delivered with an exchange or return — keep ${count === 1 ? "it" : "them"} delivered and record the outcome on the exchange or return order`;
        default:
            return `${count} ${orders} failed for an unexpected reason`;
    }
}

/** How an order is referred to in a message: its order number, else the name. */
export function labelForOrder(id: string, orders: readonly BulkOrderLabel[]): string {
    const match = orders.find((order) => order.id === id);
    if (match?.order_id) return `#${match.order_id}`;
    if (match?.customer_name) return match.customer_name;
    return `#${id.slice(0, 8)}`;
}

/** Render up to MAX_NAMED_FAILURES references, then collapse the remainder. */
export function formatFailedOrderList(
    ids: readonly string[],
    orders: readonly BulkOrderLabel[],
    limit: number = MAX_NAMED_FAILURES,
): string {
    const named = ids.slice(0, limit).map((id) => labelForOrder(id, orders));
    const remaining = ids.length - named.length;
    return remaining > 0 ? `${named.join(", ")} +${remaining} more` : named.join(", ");
}

export type BulkFailureSummary = {
    total: number;
    /** Counts per reason, most common first. */
    byReason: { reason: BulkFailureReason; count: number }[];
    /** One-line headline, e.g. "3 of 10 orders were not updated". */
    title: string;
    /** Reasons plus the affected order references. */
    description: string;
    /** Ids that failed, so the caller can keep them selected. */
    failedIds: string[];
    /** Failed ids a retry could still succeed for; empty means offer no retry. */
    retryableIds: string[];
};

/**
 * Turn settled bulk failures into something an operator can act on: what
 * happened, to how many, and to which orders.
 */
export function summarizeBulkFailures(
    failures: readonly BulkFailure[],
    orders: readonly BulkOrderLabel[],
    attempted: number,
    verb: string = "updated",
): BulkFailureSummary {
    const counts = new Map<BulkFailureReason, number>();
    for (const failure of failures) {
        const reason = classifyBulkFailure(failure.error);
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }

    const byReason = [...counts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

    const failedIds = failures.map((failure) => failure.id);
    const retryableIds = failures
        .filter((failure) => !FINAL_REASONS.has(classifyBulkFailure(failure.error)))
        .map((failure) => failure.id);
    const noun = failures.length === 1 ? "order" : "orders";
    const reasons = byReason.map(({ reason, count }) => describeBulkFailureReason(reason, count));
    const list = formatFailedOrderList(failedIds, orders);

    return {
        total: failures.length,
        byReason,
        title: `${failures.length} of ${attempted} ${noun} were not ${verb}`,
        description: list ? `${reasons.join("; ")}. Affected: ${list}` : reasons.join("; "),
        failedIds,
        retryableIds,
    };
}

/**
 * Rows a single-statement bulk write silently skipped.
 *
 * A PostgREST `.update().in(...)` succeeds even when RLS filters rows out, so
 * reporting the requested count as the affected count overstates what happened.
 * Compare what came back against what was asked for.
 */
export function findUnaffectedIds(
    requestedIds: readonly string[],
    affectedIds: readonly string[],
): string[] {
    const affected = new Set(affectedIds);
    return [...new Set(requestedIds)].filter((id) => !affected.has(id));
}
