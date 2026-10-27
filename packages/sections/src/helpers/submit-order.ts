// =====================================================================
// submit-order — post a COD order without ever losing the buyer
// =====================================================================
// A bare fetch has no deadline: on a stalled mobile connection the spinner
// ran forever. Here each attempt has one (ORDER_SUBMIT_TIMEOUT_MS). When an
// attempt gets no answer — a timeout, a network failure, or a 5xx (the
// server saying the failure was its own) — the SAME body, so the same
// idempotency key, is sent exactly once more. The server answers a key it
// has already seen with that order (the EC17 replay lookup runs before any
// validation), so the resend is a status check, never a second order. If
// the resend is not answered either the outcome is "unconfirmed": the order
// may or may not exist, and the caller must say so and offer a way out.
// =====================================================================

import { z } from "zod";

/** Per-attempt deadline: room for a slow 3G round trip through the
 *  checkout's database reads, short enough not to strand the buyer. */
export const ORDER_SUBMIT_TIMEOUT_MS = 20_000;

export type OrderPostOutcome =
  | { kind: "answered"; ok: boolean; status: number; data: unknown }
  | { kind: "unconfirmed" };

export interface PostOrderOptions {
  /** Called once, right before the resend — the "checking your order" state. */
  onResubmit: () => void;
  /** Per-attempt deadline; defaults to ORDER_SUBMIT_TIMEOUT_MS. */
  timeoutMs?: number;
}

type Answer = { ok: boolean; status: number; data: unknown };

/** What a successful order POST answers with. Each field is read on its own
 *  and dropped if it is not the expected type: the 2xx status IS the answer,
 *  so an unreadable field means a missing order number, never a doubted
 *  order. `duplicate` is only ever true when the server says so. */
const placedOrderSchema = z.object({
  orderNumber: z.string().optional().catch(undefined),
  /** The order's id — which order the post-purchase offer grows. */
  orderId: z.string().optional().catch(undefined),
  /** Proof this browser placed it (server-minted, short-lived). */
  upsellToken: z.string().optional().catch(undefined),
  total: z.number().optional().catch(undefined),
  /** The soft duplicate guard answered: this phone ordered these products
   *  minutes ago, and no new order was created. */
  duplicate: z.boolean().optional().catch(undefined),
});

export type PlacedOrder = z.infer<typeof placedOrderSchema>;

/** Narrow a 2xx order answer's body; a body that is not an object (none, or
 *  unreadable — see attempt) carries no fields. */
export function readPlacedOrder(data: unknown): PlacedOrder {
  const parsed = placedOrderSchema.safeParse(data);
  return parsed.success ? parsed.data : {};
}

async function attempt(url: string, body: string, timeoutMs: number): Promise<Answer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
    });
    if (res.status >= 500) {
      console.warn(`[submit-order] attempt answered ${res.status}; resending with the same key`);
      return null;
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch (error: unknown) {
      // The status IS the answer (2xx: the order was placed; 4xx: it was
      // refused); an unreadable body only means no order number / message,
      // which every caller already handles.
      console.warn("[submit-order] response body was unreadable", error);
    }
    return { ok: res.ok, status: res.status, data };
  } catch (error: unknown) {
    // Timed out or the network dropped. The request may still have reached
    // the server and placed the order before the answer was lost, so this is
    // "unknown" — not "nothing was submitted".
    console.warn("[submit-order] attempt got no answer", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** POST `body` to `url`: one attempt, and one same-body resend if the first
 *  is not answered. Never throws. */
export async function postOrderWithResubmit(
  url: string,
  body: string,
  opts: PostOrderOptions,
): Promise<OrderPostOutcome> {
  const timeoutMs = opts.timeoutMs ?? ORDER_SUBMIT_TIMEOUT_MS;
  const first = await attempt(url, body, timeoutMs);
  if (first) return { kind: "answered", ...first };
  opts.onResubmit();
  const second = await attempt(url, body, timeoutMs);
  if (second) return { kind: "answered", ...second };
  return { kind: "unconfirmed" };
}
