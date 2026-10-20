// =====================================================================
// referral-capture — a shared link's code, kept until the friend orders
// =====================================================================
// A referrer shares `/?ref=AB3K7M`. The friend lands anywhere on the store,
// browses, and orders later — so the code is captured from the URL on the
// first page that looks for it and remembered in localStorage (per tenant,
// 30 days). The order forms read it back to prefill the referral field.
// Only the code is stored; who referred is the server's business.
// =====================================================================

import { REFERRAL_PARAM, normalizeReferralCode } from "@scheniders/shared";

const KEY_PREFIX = "schn:ref:";
export const REFERRAL_CAPTURE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function key(tenantId: string): string {
  return `${KEY_PREFIX}${tenantId}`;
}

/** The code remembered for this store, or null. */
export function readCapturedReferral(tenantId: string, now: number = Date.now()): string | null {
  try {
    const raw = window.localStorage.getItem(key(tenantId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { code, saved_at } = parsed as { code?: unknown; saved_at?: unknown };
    if (typeof saved_at !== "number" || now - saved_at > REFERRAL_CAPTURE_TTL_MS) return null;
    return normalizeReferralCode(typeof code === "string" ? code : null);
  } catch {
    return null;
  }
}

export function writeCapturedReferral(tenantId: string, code: string, now: number = Date.now()): void {
  try {
    window.localStorage.setItem(key(tenantId), JSON.stringify({ code, saved_at: now }));
  } catch {
    /* storage unavailable — the code lives only in this page's form */
  }
}

export function clearCapturedReferral(tenantId: string): void {
  try {
    window.localStorage.removeItem(key(tenantId));
  } catch {
    /* nothing to clear */
  }
}

/**
 * Take `?ref=` off the current URL (if valid) into storage, then return the
 * code to use: the one just captured, else the one remembered earlier.
 */
export function captureReferral(tenantId: string, search: string = window.location.search): string | null {
  const fromUrl = normalizeReferralCode(new URLSearchParams(search).get(REFERRAL_PARAM));
  if (fromUrl) {
    writeCapturedReferral(tenantId, fromUrl);
    return fromUrl;
  }
  return readCapturedReferral(tenantId);
}
