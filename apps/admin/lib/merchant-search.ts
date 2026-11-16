/**
 * The filter for the Merchants search box: shop name, slug and email, plus the
 * shop number when the text looks like one ("100095" or "#100095").
 *
 * The list and the numbers above it both use this, so the header counts the
 * shops the list shows.
 */
export function merchantSearchFilter(search: string): string {
  const code = search.trim().replace(/^#/, "");
  // "%" and "," would be read as filter syntax, not as text.
  const text = search.replace(/[%,]/g, "");
  const parts = [`business_name.ilike.%${text}%`, `slug.ilike.%${text}%`, `contact_email.ilike.%${text}%`];
  if (/^\d{1,6}$/.test(code)) parts.push(`display_id::text.ilike.${code}%`);
  return parts.join(",");
}
