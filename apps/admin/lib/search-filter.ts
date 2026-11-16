/**
 * A PostgREST `or` filter that finds `text` inside any of `columns`:
 * `name.ilike."%noor%",city.ilike."%noor%"`.
 *
 * The text goes in quotes, so a comma, bracket or dot a person types is read
 * as text, not as filter syntax (unquoted, "a,b" split the filter and the API
 * answered 500). "%" is dropped so the text cannot widen the match.
 */
export function containsAny(columns: readonly string[], text: string): string {
  const value = ilikeContains(text.trim());
  return columns.map((column) => `${column}.ilike.${value}`).join(",");
}

/** "Contains this text" as one quoted ilike value. */
export function ilikeContains(text: string): string {
  return `"%${text.replace(/%/g, "").replace(/[\\"]/g, "\\$&")}%"`;
}
