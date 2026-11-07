// Server component: slot lookup + default-instance synthesis need nothing
// from the browser, and rendering through the server `RenderSection` keeps
// the section registry (and the 30-odd server-safe sections) out of the
// client bundle. Interactive chrome (site_header etc.) stays a client
// component on its own — the boundary is per section module.
import { RenderSection } from "@scheniders/sections";
import { isSectionEnabled } from "@scheniders/shared";
import type { GlobalSections, RuntimeContext } from "@scheniders/shared";
import type { SectionRenderContext } from "@scheniders/sections";
import { globalSlotInstance, type GlobalSlot } from "@/lib/global-slots";

type Slot = GlobalSlot;

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
        const inst = globalSlotInstance(globals, slot);
        if (!inst || !isSectionEnabled(inst, runtime)) return null;
        return <RenderSection key={inst.id} instance={inst} runtime={runtime} renderCtx={renderCtx} />;
      })}
    </>
  );
}
