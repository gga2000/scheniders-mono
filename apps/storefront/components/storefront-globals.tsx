"use client";
import { RenderSection, getSection } from "@scheniders/sections";
import { isSectionEnabled } from "@scheniders/shared";
import type { GlobalSections, RuntimeContext, SectionInstance } from "@scheniders/shared";
import type { SectionRenderContext } from "@scheniders/sections";

type Slot = keyof GlobalSections;

// Slots that fall back to a built-in section when a tenant has not configured
// one — so every storefront page ships with navigation chrome out of the box.
const DEFAULT_SLOT_SECTION: Partial<Record<Slot, string>> = {
  header: "site_header",
  footer: "site_footer",
};

/** Build a default instance for a slot from the registered section's
 *  defaultProps. Returns null when the slot has no default or the section
 *  type is not registered. */
function defaultInstance(slot: Slot): SectionInstance | null {
  const type = DEFAULT_SLOT_SECTION[slot];
  if (!type) return null;
  const def = getSection(type);
  if (!def) return null;
  return {
    id: `__default_${slot}__`,
    type,
    enabled: true,
    base: def.defaultProps as Record<string, unknown>,
  };
}

export function StorefrontGlobals({
  globals, runtime, renderCtx, slots,
}: {
  globals: GlobalSections;
  runtime: RuntimeContext;
  renderCtx: Omit<SectionRenderContext, "runtime">;
  slots: Slot[];
}) {
  return (
    <>
      {slots.map((slot) => {
        const inst = globals[slot] ?? defaultInstance(slot);
        if (!inst || !isSectionEnabled(inst, runtime)) return null;
        return <RenderSection key={inst.id} instance={inst} runtime={runtime} renderCtx={renderCtx} />;
      })}
    </>
  );
}
