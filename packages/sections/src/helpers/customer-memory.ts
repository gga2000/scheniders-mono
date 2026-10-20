// =====================================================================
// customer-memory — the shopper's own delivery details, on their device
// =====================================================================
// A returning COD customer should not retype name, phone, governorate and
// address. The recognition is deliberately LOCAL: the details are written
// to this browser's localStorage after a successful order and read back on
// the next visit. Nothing is looked up by phone on the server — an anon
// "type a number, get an address" endpoint would let anyone enumerate
// customers' homes. Server-side recognition needs proof of the number
// (an OTP), which is out of scope until the WhatsApp channel is wired.
//
// Scoped per tenant so two stores on the same device never share a
// shopper's record, and time-boxed so a stale address does not resurface
// months later. Every storage access is guarded: privacy modes throw.
// =====================================================================

import { IRAQ_GOVERNORATES } from "@scheniders/shared";

export interface CustomerMemory {
  customer_name: string;
  phone: string;
  alt_phone?: string;
  governorate_code: string;
  city?: string;
  address_details: string;
  /** Epoch ms of the order that wrote this record. */
  saved_at: number;
}

const KEY_PREFIX = "schn:customer:";
/** Six months — long enough for a repeat buyer, short enough to forget a move. */
export const CUSTOMER_MEMORY_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function key(tenantId: string): string {
  return `${KEY_PREFIX}${tenantId}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** A remembered code the store no longer recognises is dropped, not prefilled. */
function governorate(v: unknown): string {
  const code = str(v);
  return IRAQ_GOVERNORATES.some((g) => g.code === code) ? code : "";
}

/** The remembered details, or null when absent, expired, or unreadable. */
export function readCustomerMemory(
  tenantId: string,
  now: number = Date.now(),
): CustomerMemory | null {
  try {
    const raw = window.localStorage.getItem(key(tenantId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const saved_at = typeof parsed.saved_at === "number" ? parsed.saved_at : 0;
    if (!saved_at || now - saved_at > CUSTOMER_MEMORY_TTL_MS) return null;
    const phone = str(parsed.phone);
    if (!phone) return null;
    return {
      customer_name: str(parsed.customer_name),
      phone,
      alt_phone: str(parsed.alt_phone) || undefined,
      governorate_code: governorate(parsed.governorate_code),
      city: str(parsed.city) || undefined,
      address_details: str(parsed.address_details),
      saved_at,
    };
  } catch {
    return null;
  }
}

/** Remember the details of an order this browser just placed. */
export function writeCustomerMemory(
  tenantId: string,
  memory: Omit<CustomerMemory, "saved_at">,
  now: number = Date.now(),
): void {
  try {
    window.localStorage.setItem(
      key(tenantId),
      JSON.stringify({ ...memory, saved_at: now } satisfies CustomerMemory),
    );
  } catch {
    /* storage unavailable — the next visit simply starts blank */
  }
}

/** "Not you?" — forget the record for this store. */
export function clearCustomerMemory(tenantId: string): void {
  try {
    window.localStorage.removeItem(key(tenantId));
  } catch {
    /* nothing to clear */
  }
}

/**
 * Fill only the blank fields of a form from memory, so a shopper who has
 * already started typing is never overwritten.
 */
export function prefillFromMemory<T extends Record<string, unknown>>(
  form: T,
  memory: CustomerMemory,
): { next: T; filled: boolean } {
  const next: Record<string, unknown> = { ...form };
  let filled = false;
  const fill = (field: string, value: string | undefined): void => {
    if (!value || next[field] !== "") return;
    next[field] = value;
    filled = true;
  };
  fill("customer_name", memory.customer_name);
  fill("phone", memory.phone);
  fill("alt_phone", memory.alt_phone);
  fill("governorate_code", memory.governorate_code);
  fill("city", memory.city);
  fill("address_details", memory.address_details);
  return { next: next as T, filled };
}
