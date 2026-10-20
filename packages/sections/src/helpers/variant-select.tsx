"use client";

// =====================================================================
// VariantSelect — choose the variant of a product sold by variant
// =====================================================================
// A product with variants is bought as one of them: the checkout refuses a
// variant-less line for it, and prices the line from the variant row. The
// PDP's add-to-cart and direct-order sections have no pill picker of their
// own (that lives in pdp_buy_box), so they use this plain, labelled select.
// Nothing is pre-selected — a silently chosen size is the variant version of
// a silently chosen governorate.
// =====================================================================

import type { LocaleCode } from "@scheniders/shared";
import type { ProductVariant } from "../types";
import { formatPrice } from "./format";

export function VariantSelect({
  id,
  variants,
  value,
  onChange,
  locale,
  basePrice,
  invalid,
}: {
  id: string;
  variants: readonly ProductVariant[];
  value: string | null;
  onChange: (variantId: string | null) => void;
  locale: LocaleCode;
  /** Shown for a variant whose own price is null (it then costs the product price). */
  basePrice: number;
  invalid?: boolean;
}) {
  const t = locale !== "en";
  return (
    <div className="flex flex-col gap-bk-2xs">
      <label htmlFor={id} className="font-label text-xs font-bold uppercase tracking-[0.2em] text-bk-ink-soft">
        {t ? "الخيار" : "Option"}
      </label>
      <select
        id={id}
        value={value ?? ""}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="min-h-11 w-full bg-bk-surface px-3 font-body text-bk-ink text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
        style={{
          border: invalid
            ? "1px solid var(--bk-danger, #dc2626)"
            : "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
          borderRadius: "var(--bk-radius-input, 0.75rem)",
        }}
      >
        <option value="">{t ? "اختر الخيار" : "Choose an option"}</option>
        {variants.map((v) => (
          <option key={v.id} value={v.id} disabled={v.stock_quantity <= 0}>
            {v.name} — {formatPrice(v.price ?? basePrice, locale)}
          </option>
        ))}
      </select>
    </div>
  );
}
