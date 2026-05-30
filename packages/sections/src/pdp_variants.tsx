// =====================================================================
// Section — pdp_variants
// =====================================================================
// Variant selector for the PDP (size / colour / generic options). The
// section reads variants from `ctx.product.variants` when present and
// degrades to null when the product has no variant set. Three layouts
// are supported: chunky buttons (default), colour swatches, or a
// dropdown — picked via the `layout` prop in the editor.
// =====================================================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { cn } from "./helpers/utils";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  layout: z.enum(["buttons", "swatches", "dropdown"]),
  show_oos: z.boolean(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  layout: "buttons",
  show_oos: true,
};

interface VariantLike {
  id: string;
  name: string;
  stock_quantity?: number;
  /** Optional explicit swatch colour (hex) — falls back to a name → hash. */
  swatch_hex?: string;
}

function readVariants(
  product: SectionRenderContext["product"],
): VariantLike[] {
  const raw =
    (product as unknown as { variants?: VariantLike[] } | undefined)?.variants;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v) => v && typeof v.id === "string");
}

/** Cheap, deterministic colour from a label string. */
function labelToColour(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue} 70% 65%)`;
}

function PdpVariantsRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const variants = useMemo(() => readVariants(ctx.product), [ctx.product]);
  const visible = props.show_oos
    ? variants
    : variants.filter((v) => (v.stock_quantity ?? 1) > 0);
  const [selected, setSelected] = useState<string | null>(
    visible[0]?.id ?? null,
  );

  useEffect(() => {
    if (selected && !visible.find((v) => v.id === selected)) {
      setSelected(visible[0]?.id ?? null);
    }
  }, [selected, visible]);

  if (!ctx.product || visible.length === 0) return null;

  const locale = ctx.runtime.locale;
  const labelText = locale === "ar" ? "اختر الخيار" : "Choose option";

  if (props.layout === "dropdown") {
    return (
      <section className="px-4 py-4">
        <label className="block">
          <span className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-2">
            {labelText}
          </span>
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
            className="w-full rounded-xl border-[3px] border-candy-ink bg-white px-4 py-3 font-body text-base focus:outline-none focus:ring-0"
          >
            {visible.map((v) => {
              const oos = (v.stock_quantity ?? 1) <= 0;
              return (
                <option key={v.id} value={v.id} disabled={oos}>
                  {v.name}
                  {oos
                    ? locale === "ar"
                      ? " — نفد"
                      : " — out of stock"
                    : ""}
                </option>
              );
            })}
          </select>
        </label>
      </section>
    );
  }

  if (props.layout === "swatches") {
    return (
      <section className="px-4 py-4">
        <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-2">
          {labelText}
        </p>
        <div className="flex flex-wrap gap-3">
          {visible.map((v) => {
            const oos = (v.stock_quantity ?? 1) <= 0;
            const colour = v.swatch_hex || labelToColour(v.name);
            return (
              <button
                key={v.id}
                type="button"
                disabled={oos}
                onClick={() => setSelected(v.id)}
                title={v.name}
                aria-label={v.name}
                aria-pressed={selected === v.id}
                className={cn(
                  "w-12 h-12 rounded-full border-[3px] border-candy-ink shadow-bento-sm relative",
                  selected === v.id && "ring-4 ring-candy-pink/40",
                  oos && "opacity-50 line-through",
                )}
                style={{ background: colour }}
              >
                {oos && (
                  <span className="absolute inset-0 flex items-center justify-center font-display font-black text-[10px] text-candy-ink uppercase">
                    ✕
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // Buttons (default)
  return (
    <section className="px-4 py-4">
      <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-2">
        {labelText}
      </p>
      <div className="flex flex-wrap gap-2">
        {visible.map((v) => {
          const oos = (v.stock_quantity ?? 1) <= 0;
          const isSelected = selected === v.id;
          return (
            <button
              key={v.id}
              type="button"
              disabled={oos}
              onClick={() => setSelected(v.id)}
              aria-pressed={isSelected}
              className={cn(
                "px-4 py-2 rounded-xl border-[3px] border-candy-ink font-display font-black text-sm uppercase shadow-bento-sm transition-all",
                isSelected ? "bg-candy-pink text-white" : "bg-white",
                oos && "opacity-50 line-through",
              )}
            >
              {v.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "pdp_variants",
  category: "page",
  name: { en: "Variant picker", ar: "اختيار الخيار" },
  description: {
    en: "Variant selector (size, colour, etc.) with three layouts.",
    ar: "اختيار خيار المنتج (مقاس، لون، إلخ) بثلاث طرق عرض.",
  },
  thumbnail: "/sections/pdp_variants.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpVariantsRender,
};

registerSection(definition);
export default definition;
