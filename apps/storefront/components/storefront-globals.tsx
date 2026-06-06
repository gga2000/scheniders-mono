"use client";
import { RenderSection } from "@scheniders/sections";
import { isSectionEnabled } from "@scheniders/shared";
import type { GlobalSections, RuntimeContext } from "@scheniders/shared";
import type { SectionRenderContext } from "@scheniders/sections";

type Slot = keyof GlobalSections;

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
        const inst = globals[slot];
        if (!inst || !isSectionEnabled(inst, runtime)) return null;
        return <RenderSection key={inst.id} instance={inst} runtime={runtime} renderCtx={renderCtx} />;
      })}
    </>
  );
}
