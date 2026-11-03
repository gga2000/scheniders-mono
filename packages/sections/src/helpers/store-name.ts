// =====================================================================
// storeDisplayName — the one name a store goes by in confirmation chrome
// =====================================================================
// The vCard the buyer saves, «رد {store}», «طلب من {store}» and «زبائن
// {store}» must all say the same name, or the call comes from a contact
// the buyer saved under something else. One resolver (D15):
// `commerce.contact.name_i18n` when it parses and resolves to a non-empty
// string, else `tenants.business_name` (trimmed, "" when absent).
//
// It parses the name on its own, with the shared `parseContactName`,
// so it works even when the contact block has no usable call number.
// =====================================================================

import { parseContactName, resolveI18n } from "@scheniders/shared";
import type { I18nString, LocaleCode } from "@scheniders/shared";

function field(v: unknown, key: string): unknown {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>)[key] : undefined;
}

function contactName(tenant: unknown): I18nString | null {
  const contact = field(field(field(tenant, "store_config_v2"), "commerce"), "contact");
  return parseContactName(field(contact, "name_i18n"));
}

function businessName(tenant: unknown): string {
  if (typeof tenant !== "object" || tenant === null || !("business_name" in tenant)) return "";
  const name = tenant.business_name;
  return typeof name === "string" ? name.trim() : "";
}

export function storeDisplayName(tenant: unknown, locale: LocaleCode): string {
  const name = contactName(tenant);
  if (name) {
    const named = resolveI18n(name, locale).trim();
    if (named) return named;
  }
  return businessName(tenant);
}
