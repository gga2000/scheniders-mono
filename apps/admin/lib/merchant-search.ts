import { isMerchantCodeQuery, normalizeMerchantCodeQuery } from "@scheniders/shared";

/**
 * The filter for the Merchants search box: shop name, slug and email, plus the
 * shop number when the text looks like one ("100095", "#100095" or a few of
 * its digits).
 *
 * The list and the numbers above it both use this, so the header counts the
 * shops the list shows.
 */
export function merchantSearchFilter(search: string): string {
  const text = contains(search.trim());
  // The phone too: staff often have only the number a merchant called from.
  const parts = [`business_name.ilike.${text}`, `slug.ilike.${text}`, `contact_email.ilike.${text}`, `contact_phone.ilike.${text}`];
  // merchant_code is a database function over the shop (the six digits staff
  // read). The API cannot match the number column as text: a cast does not parse.
  if (isMerchantCodeQuery(search)) parts.push(`merchant_code.ilike.${contains(normalizeMerchantCodeQuery(search))}`);
  return parts.join(",");
}

/**
 * "Contains this text", as a quoted filter value: in quotes a comma or a
 * bracket is read as text, not as filter syntax. "%" is dropped so the text
 * cannot widen the match.
 */
function contains(text: string): string {
  return `"%${text.replace(/%/g, "").replace(/[\\"]/g, "\\$&")}%"`;
}
