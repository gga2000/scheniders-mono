// =====================================================================
// Section — pdp_variants
// =====================================================================
// Variant selector for the PDP (size / colour / generic options). The
// section reads variants from `ctx.product.variants` when present and
// degrades to null when the product has no variant set. Three layouts
// are supported: chunky buttons (default), colour swatches, or a
// dropdown — picked via the `layout` prop in the editor.
// =====================================================================
// Client half of `pdp_variants` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./pdp_variants.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useEffect, useMemo } from "react";
import { cn } from "./helpers/utils";
import { useVariantStore } from "./helpers/variant-store";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./pdp_variants";

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

export function PdpVariantsRender({
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
  // The choice lives in the shared variant store so the buying sections on
  // this page (direct-order form, buy box, add-to-cart) sell what was picked.
  const productId = ctx.product?.id ?? "";
  const selected = useVariantStore((s) => s.selected[productId] ?? null);
  const select = useVariantStore((s) => s.select);
  const registerPicker = useVariantStore((s) => s.registerPicker);
  const setSelected = (id: string | null) => select(productId, id);

  // Register as this product's picker so the direct-order form does not
  // render a second one; keep the first sellable option selected by default.
  useEffect(() => {
    if (!productId) return;
    return registerPicker(productId);
  }, [productId, registerPicker]);
  useEffect(() => {
    if (!productId) return;
    if (!selected || !visible.find((v) => v.id === selected)) {
      select(productId, visible[0]?.id ?? null);
    }
  }, [productId, selected, visible, select]);

  if (!ctx.product || visible.length === 0) return null;

  const locale = ctx.runtime.locale;
  const labelText = locale !== "en" ? "اختر الخيار" : "Choose option";

  if (props.layout === "dropdown") {
    return (
      <section className="px-4 py-4">
        <label className="block">
          <span className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft mb-bk-xs">
            {labelText}
          </span>
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
            className="w-full bg-white px-4 py-3 font-body text-base focus:outline-none focus:ring-0"
            style={{
              color: "var(--bk-ink, #1a1a1a)",
              border:
                "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
              borderRadius: "var(--bk-radius-input, 0.75rem)",
            }}
          >
            {visible.map((v) => {
              const oos = (v.stock_quantity ?? 1) <= 0;
              return (
                <option key={v.id} value={v.id} disabled={oos}>
                  {v.name}
                  {oos
                    ? locale !== "en"
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
        <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft mb-bk-xs">
          {labelText}
        </p>
        <div className="flex flex-wrap gap-bk-sm">
          {visible.map((v) => {
            const oos = (v.stock_quantity ?? 1) <= 0;
            const colour = v.swatch_hex || labelToColour(v.name);
            const isSelected = selected === v.id;
            return (
              <button
                key={v.id}
                type="button"
                disabled={oos}
                onClick={() => setSelected(v.id)}
                title={v.name}
                aria-label={v.name}
                aria-pressed={isSelected}
                className={cn(
                  "w-12 h-12 rounded-full relative",
                  oos && "opacity-50 line-through",
                )}
                style={{
                  background: colour,
                  border:
                    "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                  boxShadow: isSelected
                    ? "0 0 0 4px color-mix(in srgb, var(--bk-primary, #ff5a8a) 40%, transparent), var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)"
                    : "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                }}
              >
                {oos && (
                  <span
                    className="absolute inset-0 flex items-center justify-center font-display font-black text-[10px] uppercase"
                    style={{ color: "var(--bk-ink, #1a1a1a)" }}
                  >
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
      <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft mb-bk-xs">
        {labelText}
      </p>
      <div className="flex flex-wrap gap-bk-xs">
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
                "px-4 py-2 font-display font-black text-sm uppercase transition-all",
                oos && "opacity-50 line-through",
              )}
              style={{
                backgroundColor: isSelected
                  ? "var(--bk-primary, #ff5a8a)"
                  : "#ffffff",
                color: isSelected
                  ? "var(--bk-on-primary, #ffffff)"
                  : "var(--bk-ink, #1a1a1a)",
                border:
                  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                borderRadius: "var(--bk-radius-input, 0.75rem)",
                boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                fontFamily: "var(--bk-font-display, inherit)",
              }}
            >
              {v.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
