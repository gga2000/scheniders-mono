import { NextResponse } from "next/server";
import { wordList } from "./word-list";

/**
 * The database locks a converted lead's owner, creator and status, because
 * commission is paid to whoever owned the lead when it became a store
 * (trigger leads_freeze_conversion_attribution). These turn that refusal into
 * a clear 409 instead of a generic 500.
 */
export function isConvertedLock(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { hint?: unknown }).hint === "LEAD_CONVERTED_LOCKED";
}

export function leadConvertedLockResponse(error: unknown): NextResponse | null {
  if (!isConvertedLock(error)) return null;
  return NextResponse.json(
    { error: "This lead is already a store. Its owner and status can't change, so the commission stays with who closed it." },
    { status: 409 },
  );
}

/**
 * The bulk bar's refusal: one ticked store stops the whole press, so it names
 * the ticked leads that are stores, and the person knows which to untick.
 */
export function convertedLeadsMessage(names: readonly string[]): string {
  if (names.length === 0) {
    return "A ticked lead is already a store, so its owner and status can't change. Nothing was changed.";
  }
  const quoted = wordList(names.map((name) => `"${name}"`), 3);
  return names.length === 1
    ? `${quoted} is already a store, so its owner and status can't change. Untick it and try again.`
    : `${quoted} are already stores, so their owner and status can't change. Untick them and try again.`;
}
