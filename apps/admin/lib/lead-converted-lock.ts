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

/**
 * A lead with a prospect store is not deleted: the store would stay online
 * with the business's name, phone and address, and no screen could find it
 * again. The bulk bar names the ticked ones, so the person knows which to untick.
 */
export function prospectStoreLeadsMessage(names: readonly string[], bulk = false): string {
  const quoted = wordList(names.map((name) => `"${name}"`), 3);
  const one = names.length === 1;
  const refusal = one
    ? `${quoted} has a prospect store, so it can't be deleted.`
    : `${quoted} have prospect stores, so they can't be deleted.`;
  return bulk
    ? `${refusal} Untick ${one ? "it" : "them"} and try again. Nothing was deleted.`
    : `${refusal} The store would stay online with no lead to find it by.`;
}

/**
 * A lead that became a shop is not deleted: its sale counts in Lead numbers
 * and the Team board, and its commission row points at it. Names the ones
 * kept, so the person knows which to untick.
 */
export function convertedLeadsDeleteMessage(names: readonly string[], bulk = false): string {
  const quoted = wordList(names.map((name) => `"${name}"`), 3);
  const one = names.length === 1;
  const refusal = one
    ? `${quoted} is already a store, so it can't be deleted. Its sale and commission stay on record.`
    : `${quoted} are already stores, so they can't be deleted. Their sales and commission stay on record.`;
  return bulk ? `${refusal} Untick ${one ? "it" : "them"} and try again. Nothing was deleted.` : refusal;
}
