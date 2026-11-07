// Site-wide ("global") section slots: the top promo bar, the header, the
// footer and an optional sticky bottom bar. Shared by the live storefront
// (StorefrontGlobals, server) and the editor preview (live renderer, client)
// so both draw exactly the same chrome around a page.
import { getSection } from "@scheniders/sections";
import type { GlobalSections, SectionInstance } from "@scheniders/shared";

export type GlobalSlot = keyof GlobalSections;

// Slots that fall back to a built-in section when a tenant has not configured
// one — so every storefront page ships with navigation chrome out of the box.
// NB: sticky_bottom_bar has NO universal default — page-specific sticky bars
// are owned by the page's own sections.
const DEFAULT_SLOT_SECTION: Partial<Record<GlobalSlot, string>> = {
  promo_bar: "announcement_bar",
  header: "site_header",
  footer: "site_footer",
};

/** Id of the synthesized instance used when a slot is not configured. */
export function defaultSlotInstanceId(slot: GlobalSlot): string {
  return `__default_${slot}__`;
}

/** Build a default instance for a slot from the registered section's
 *  defaultProps. Null when the slot has no default or the type is unknown. */
export function defaultSlotInstance(slot: GlobalSlot): SectionInstance | null {
  const type = DEFAULT_SLOT_SECTION[slot];
  if (!type) return null;
  const def = getSection(type);
  if (!def) return null;
  return {
    id: defaultSlotInstanceId(slot),
    type,
    enabled: true,
    base: def.defaultProps as Record<string, unknown>,
  };
}

/** The instance a slot renders: the tenant's own, else the default. */
export function globalSlotInstance(
  globals: GlobalSections | null | undefined,
  slot: GlobalSlot,
): SectionInstance | null {
  return globals?.[slot] ?? defaultSlotInstance(slot);
}
