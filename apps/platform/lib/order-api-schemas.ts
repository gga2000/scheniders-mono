import { z } from "zod";

/**
 * Request-body schemas for the order API routes.
 *
 * Order ids are always UUIDs (`orders.id`); validating the shape here keeps
 * arbitrary client strings out of the `.in()` filters and caps how many rows a
 * single call can touch. Tenant scoping is enforced separately in each route —
 * a well-formed id is not proof the caller owns the order.
 */

/** Max order ids accepted in one batch mutation. */
export const MAX_ORDER_IDS_PER_REQUEST = 500;

/**
 * Ids are validated as strings here and narrowed to UUIDs by `toOrderUuids`.
 * A per-item `.uuid()` would reject the whole batch over one stray id — and the
 * list can legitimately contain optimistic `temp-*` rows that simply have no
 * server-side counterpart. Only real UUIDs ever reach a query.
 */
const orderIdList = z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_ORDER_IDS_PER_REQUEST);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep only well-formed UUIDs — never interpolate a raw client string into a filter. */
export function toOrderUuids(ids: string[]): string[] {
    return ids.filter((id) => UUID_RE.test(id));
}

/** POST /api/orders/delete */
export const orderIdsBodySchema = z.object({ ids: orderIdList });

/**
 * Max orders Al-Waseet can accept in ONE request.
 *
 * `lib/waseet-api.ts` throttles to 28 calls per 30s window (the vendor allows 30).
 * Asking for more than one window's worth makes the handler sit idle waiting for
 * the next window and blow the function timeout — partway through, with some
 * orders already created at Al-Waseet. Keeping a request inside a single window
 * means it always completes; the client sends multiple requests for bigger runs.
 */
export const MAX_WASEET_ORDERS_PER_REQUEST = 28;

/** POST /api/waseet/submit-orders */
export const waseetSubmitBodySchema = z.object({
    orderIds: z.array(z.string().min(1)).min(1).max(MAX_WASEET_ORDERS_PER_REQUEST),
});
