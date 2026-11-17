import { storeAddress } from "@scheniders/shared/store-address";

/** Random characters the database adds after the name part of a prospect store's address. */
export const PROSPECT_ADDRESS_SUFFIX_LENGTH = 8;

/**
 * The name part of a new store's web address, made the way the database's
 * `store_address_base` makes it for Build Store and for converting a lead
 * (the test checks): Latin letters and
 * digits in lower case, every other run of characters one "-", cut at 40
 * characters with no "-" at either end, and "store" when nothing is left
 * (a name in Arabic letters only).
 */
export function prospectAddressBase(source: string): string {
  const trimDashes = (s: string) => s.replace(/^-+|-+$/g, "");
  const base = trimDashes(trimDashes(source.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")).slice(0, 40));
  return base || "store";
}

/** What the Build Store form shows before the build: the random part is not known yet. */
export function prospectAddressPreview(source: string): string {
  return storeAddress(`${prospectAddressBase(source)}-${"x".repeat(PROSPECT_ADDRESS_SUFFIX_LENGTH)}`);
}
