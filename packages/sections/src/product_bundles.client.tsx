// =====================================================================
// Section — product_bundles ("frequently bought together")
// =====================================================================
// PDP AOV upsell: shows bundles that include the current product, with the
// combined price, the bundle saving, and an "add all to cart" button. Pricing
// uses the shared bundle engine; the server re-resolves + records the saving at
// checkout, so this is a faithful preview, never the source of truth.
// =====================================================================
// Client half of `product_bundles` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./product_bundles.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import * as React from "react";
import { resolveI18n, computeBundleDiscounts, pixelContentsFromItems } from "@scheniders/shared";
import type { Bundle } from "@scheniders/shared";
import { trackPixel } from "./helpers/pixels";
import { Section, SectionHeader, ChunkyButton, MaterialIcon } from "./helpers/primitives";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import type { Props } from "./product_bundles";

interface AddItem {
  product_id: string;
  variant_id: string | null;
  name: string;
  variant_name: string | null;
  price: number;
  quantity: number;
  image_url: string | null;
}

function BundleCard({
  bundle,
  productMap,
  locale,
  addItem,
}: {
  bundle: Bundle;
  productMap: Map<string, Product>;
  locale: "ar" | "en" | "ku";
  addItem: (i: AddItem) => void;
}): React.ReactElement | null {
  const products = bundle.product_ids
    .map((id) => productMap.get(id))
    .filter((p): p is Product => Boolean(p));
  if (products.length < 2) return null;

  const regular = products.reduce((s, p) => s + p.price, 0);
  const saving = computeBundleDiscounts(
    products.map((p) => ({ product_id: p.id, price: p.price, quantity: 1 })),
    [bundle],
  ).total_amount_iqd;
  const bundlePrice = regular - saving;
  const t = locale !== "en";

  function addAll(): void {
    for (const p of products) {
      addItem({
        product_id: p.id,
        variant_id: null,
        name: p.name,
        variant_name: null,
        price: p.price,
        quantity: 1,
        image_url: p.image_url ?? null,
      });
    }
    trackPixel(
      "AddToCart",
      pixelContentsFromItems(
        products.map((p) => ({ product_id: p.id, price: p.price, quantity: 1 })),
      ),
    );
  }

  return (
    <div className="rounded-bk-card border-2 border-bk-ink/10 bg-white p-bk-md">
      <div className="flex flex-wrap items-center gap-bk-sm">
        {products.map((p, i) => (
          <React.Fragment key={p.id}>
            {i > 0 && (
              <span className="font-display text-2xl text-bk-ink-soft" aria-hidden>
                +
              </span>
            )}
            <div className="flex flex-col items-center gap-1 text-center" style={{ width: 92 }}>
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt=""
                  loading="lazy"
                  className="h-20 w-20 rounded-bk-input object-cover"
                />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-bk-input bg-bk-ink/5">
                  <MaterialIcon name="image" className="text-2xl text-bk-ink-soft" />
                </span>
              )}
              <span className="line-clamp-2 font-body text-xs text-bk-ink">
                {p.name}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="mt-bk-sm flex flex-wrap items-center justify-between gap-bk-sm">
        <div className="flex items-baseline gap-bk-xs">
          <span className="font-display font-black text-2xl text-bk-ink">
            <bdi>{formatPrice(bundlePrice, locale)}</bdi>
          </span>
          {saving > 0 && (
            <>
              <span className="font-body text-sm text-bk-ink-soft line-through">
                <bdi>{formatPrice(regular, locale)}</bdi>
              </span>
              <span className="font-label font-bold text-xs uppercase tracking-[0.15em] text-bk-primary">
                {t ? `وفّر ${formatPrice(saving, locale)}` : `Save ${formatPrice(saving, locale)}`}
              </span>
            </>
          )}
        </div>
        <ChunkyButton type="button" bg="mint" size="md" onClick={addAll}>
          <MaterialIcon name="add_shopping_cart" />
          {t ? "أضف الكل" : "Add all"}
        </ChunkyButton>
      </div>
    </div>
  );
}

export function ProductBundlesRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}): React.ReactElement | null {
  const product = ctx.product;
  const addItem = useCart((s) => s.addItem);
  const locale = ctx.runtime.locale;

  const commerce = (
    ctx.tenant as { store_config_v2?: { commerce?: { bundles?: Bundle[] } } | null } | undefined
  )?.store_config_v2?.commerce;

  if (!product) return null;
  const productMap = new Map(ctx.products.map((p) => [p.id, p]));
  const relevant = (commerce?.bundles ?? []).filter(
    (b) =>
      b.enabled !== false &&
      b.product_ids.includes(product.id) &&
      // "Add all" adds one variant-less unit of each product, which a
      // product sold by variant cannot be bought as.
      b.product_ids.every((id) => {
        const p = productMap.get(id);
        return p !== undefined && !p.sold_by_variant;
      }),
  );
  if (relevant.length === 0) return null;

  const heading = resolveI18n(props.heading_i18n, locale);

  return (
    <Section>
      <SectionHeader title={heading} />
      <div className="space-y-bk-md">
        {relevant.map((b) => (
          <BundleCard
            key={b.id}
            bundle={b}
            productMap={productMap}
            locale={locale}
            addItem={addItem}
          />
        ))}
      </div>
    </Section>
  );
}
