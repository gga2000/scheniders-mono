/**
 * Replace `{var_name}` placeholders in a template string with values from `vars`.
 * Missing variables fall back to an empty string.
 *
 * Used by Schneiders WhatsApp templates (PDP, Cart, support buttons).
 */
export function fillTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}
