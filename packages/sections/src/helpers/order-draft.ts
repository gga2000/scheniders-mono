// =====================================================================
// order-draft — the direct-order form survives a reload of this tab
// =====================================================================
// A buyer who reloads mid-order (a stalled spinner, an accidental pull to
// refresh) came back to an empty form and a NEW idempotency key — so the
// next tap could place a second order for one already placed. The typed
// fields and the in-flight keys are kept per tenant + product in
// sessionStorage (this tab only; gone when it closes), restored on load and
// cleared once the order is placed. Every storage access is guarded:
// privacy modes and full quotas throw, and the form must still work.
// =====================================================================

import { IRAQ_GOVERNORATES } from "@scheniders/shared";
import type { FormState } from "../pdp_direct_order.client";

export interface OrderDraft {
  form: FormState;
  /** The submission's idempotency key once one was minted — reusing it makes
   *  the next submit a replay of an order that may already exist. */
  idempotencyKey: string | null;
  /** The Purchase event_id paired with that key (pixel/CAPI dedup). */
  purchaseEventId: string | null;
}

const KEY_PREFIX = "schn:order-draft:";

export function orderDraftKey(tenantId: string, productId: string): string {
  return `${KEY_PREFIX}${tenantId}:${productId}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** A saved code the store no longer recognises is dropped, not restored. */
function governorate(v: unknown): string {
  const code = str(v);
  return IRAQ_GOVERNORATES.some((g) => g.code === code) ? code : "";
}

export function readOrderDraft(tenantId: string, productId: string): OrderDraft | null {
  try {
    const raw = window.sessionStorage.getItem(orderDraftKey(tenantId, productId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.form)) return null;
    const f = parsed.form;
    return {
      form: {
        customer_name: str(f.customer_name),
        phone: str(f.phone),
        alt_phone: str(f.alt_phone),
        governorate_code: governorate(f.governorate_code),
        address_details: str(f.address_details),
      },
      idempotencyKey: strOrNull(parsed.idempotencyKey),
      purchaseEventId: strOrNull(parsed.purchaseEventId),
    };
  } catch {
    // Storage blocked or the value corrupt: there is no draft to restore,
    // and the form starts as it would on a first visit.
    return null;
  }
}

export function writeOrderDraft(tenantId: string, productId: string, draft: OrderDraft): void {
  try {
    window.sessionStorage.setItem(orderDraftKey(tenantId, productId), JSON.stringify(draft));
  } catch {
    // Storage blocked or full: the order still submits; only a reload of
    // this tab would start over.
  }
}

export function clearOrderDraft(tenantId: string, productId: string): void {
  try {
    window.sessionStorage.removeItem(orderDraftKey(tenantId, productId));
  } catch {
    // Storage blocked: nothing was ever saved to clear.
  }
}

/** The restored form: every non-empty draft field wins over what the first
 *  render had (at mount that is only the sb_gov governorate prefill). */
export function mergeDraftForm(current: FormState, draft: FormState): FormState {
  return {
    customer_name: draft.customer_name || current.customer_name,
    phone: draft.phone || current.phone,
    alt_phone: draft.alt_phone || current.alt_phone,
    governorate_code: draft.governorate_code || current.governorate_code,
    address_details: draft.address_details || current.address_details,
  };
}
