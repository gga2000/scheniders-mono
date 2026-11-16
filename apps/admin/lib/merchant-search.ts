import { isMerchantCodeQuery, normalizeMerchantCodeQuery } from "@scheniders/shared";
import { containsAny, ilikeContains } from "@/lib/search-filter";

/**
 * The filter for the Merchants search box: shop name, slug and email, plus the
 * shop number when the text looks like one ("100095", "#100095" or a few of
 * its digits).
 *
 * The list and the numbers above it both use this, so the header counts the
 * shops the list shows.
 */
export function merchantSearchFilter(search: string): string {
  // The phone too: staff often have only the number a merchant called from.
  const parts = [containsAny(["business_name", "slug", "contact_email", "contact_phone"], search)];
  // merchant_code is a database function over the shop (the six digits staff
  // read). The API cannot match the number column as text: a cast does not parse.
  if (isMerchantCodeQuery(search)) parts.push(`merchant_code.ilike.${ilikeContains(normalizeMerchantCodeQuery(search))}`);
  return parts.join(",");
}
