// =====================================================================
// storeDisplayName — the one name a store goes by in confirmation chrome
// =====================================================================
// The vCard the buyer saves, «رد {store}», «طلب من {store}» and «زبائن
// {store}» must all say the same name, or the call comes from a contact
// the buyer saved under something else. One resolver (D15):
// `commerce.contact.name_i18n` when it parses and resolves to a non-empty
// string, else `tenants.business_name` (trimmed, "" when absent).
//
// It parses the name on its own, with the shared `storeContactNameSchema`,
// so it works even when the contact block has no usable call number.
// =====================================================================

import { z } from "zod";
import { resolveI18n, storeContactNameSchema } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

const namedContactTenant = z.object({
  store_config_v2: z.object({
    commerce: z.object({
      contact: z.object({ name_i18n: storeContactNameSchema }),
    }),
  }),
});

function businessName(tenant: unknown): string {
  if (typeof tenant !== "object" || tenant === null || !("business_name" in tenant)) return "";
  const name = tenant.business_name;
  return typeof name === "string" ? name.trim() : "";
}

export function storeDisplayName(tenant: unknown, locale: LocaleCode): string {
  const parsed = namedContactTenant.safeParse(tenant);
  if (parsed.success) {
    const named = resolveI18n(parsed.data.store_config_v2.commerce.contact.name_i18n, locale).trim();
    if (named) return named;
  }
  return businessName(tenant);
}
