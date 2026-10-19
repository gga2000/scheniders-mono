"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { resolveSchneidersConfig } from "@scheniders/shared";
import type { SchneidersConfig } from "@scheniders/shared";
import { useStoreBase } from "@/lib/store-context";
import { useCart } from "@/lib/cart-store";
import { cn } from "@/lib/utils";
import type { Product, ProductVariant } from "@/lib/types";
import {
  BentoCard,
  ChunkyButton,
  MaterialIcon,
  ScribbleHeading,
  SectionEyebrow,
  Sticker,
  WhatsAppIcon,
} from "./primitives";
import { formatPrice } from "./format";
import { fillTemplate } from "./wa";

interface Props {
  product: Product;
  images: string[];
  variants: ProductVariant[];
  whatsappNumber?: string | null;
  /** Schneiders config from the parent server page. */
  schneidersConfig?: SchneidersConfig | null;
}

const TILE_TINTS = ["bg-bk-decor-a/30", "bg-bk-decor-b/30", "bg-bk-accent/30", "bg-bk-decor-c/30"];

export function SchneidersProductDetailClient({ product, images, variants, whatsappNumber, schneidersConfig }: Props) {
  const router = useRouter();
  const storeBase = useStoreBase();
  const addItem = useCart((s) => s.addItem);
  const schn = resolveSchneidersConfig(schneidersConfig);

  // Approved-review aggregates ride in on the product row (queries.ts merges
  // them in one indexed query). Absent or zero means "no rating to show".
  const reviewCount = product.review_count ?? 0;
  const avgRating = product.avg_rating ?? 0;
  const filledStars = Math.min(5, Math.max(0, Math.round(avgRating)));
  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants[0]?.id ?? null,
  );
  const [qty, setQty] = useState(1);

  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? null;
  const price = selectedVariant?.price ?? product.price;
  const original = product.compare_at_price ?? null;
  const stock = selectedVariant?.stock_quantity ?? product.stock_quantity ?? 0;
  const inStock = stock > 0;
  const onSale = original != null && original > price;
  const savings = onSale ? original! - price : 0;
  const discountPct = onSale ? Math.round(((original! - price) / original!) * 100) : 0;

  // Sale-sticker rendering (matches product-card)
  const saleStickerLabel =
    schn.sale_sticker.style === "percent"
      ? `-${discountPct}% OFF`
      : schn.sale_sticker.style === "label"
        ? (schn.sale_sticker.label ?? "LIMITED TIME")
        : `Save ${formatPrice(savings)}`;

  // Split variants into size-like (S/M/L/X-XL) and color-like (everything else)
  const { sizeVariants, otherVariants } = useMemo(() => {
    const sizeLike = /^(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|\d+)$/i;
    const sizes: ProductVariant[] = [];
    const others: ProductVariant[] = [];
    for (const v of variants) {
      if (sizeLike.test(v.name.trim())) sizes.push(v);
      else others.push(v);
    }
    return { sizeVariants: sizes, otherVariants: others };
  }, [variants]);

  function handleAddToCart() {
    addItem({
      product_id: product.id,
      variant_id: selectedVariant?.id ?? null,
      name: product.name,
      variant_name: selectedVariant?.name ?? null,
      price,
      quantity: qty,
      image_url: images[0] ?? null,
    });
    router.push(`${storeBase}/cart`);
  }

  function whatsappHref() {
    if (!whatsappNumber) return "#";
    const variantBlock = selectedVariant ? ` — ${selectedVariant.name}` : "";
    const text = fillTemplate(schn.whatsapp_templates.pdp_template ?? "", {
      product_name: product.name,
      variant_name: selectedVariant?.name ?? "",
      variant_block: variantBlock,
      qty,
      price: formatPrice(price),
      total: formatPrice(price * qty),
    });
    return `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
  }

  return (
    <div className="space-y-6">
      {/* ── Gallery ── */}
      <section className="space-y-4">
        <div className="relative w-full aspect-square bento-card overflow-hidden bg-white">
          {images[activeImage] ? (
            <Image
              src={images[activeImage]}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 480px"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-bk-surface font-display font-bold text-bk-ink/40 text-2xl uppercase">
              No image
            </div>
          )}

          {onSale && (
            <div className="absolute top-4 right-4 z-10">
              <Sticker bg={schn.sale_sticker.bg ?? "pink"} rotate={schn.sale_sticker.rotate_deg ?? -6} size="sm">
                {saleStickerLabel}
              </Sticker>
            </div>
          )}
          {schn.pdp.show_stock_urgency && inStock && stock <= 5 && (
            <div className="absolute bottom-4 left-4 z-10">
              <Sticker bg="lilac" rotate={3} size="xs">
                ✨ Last {stock} in stock
              </Sticker>
            </div>
          )}
          {!inStock && (
            <div className="absolute bottom-4 left-4 z-10">
              <Sticker bg="ink" rotate={3} size="xs">
                Sold Out
              </Sticker>
            </div>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveImage(i)}
                aria-label={`Image ${i + 1}`}
                className={cn(
                  "w-20 h-20 shrink-0 bento-card-sm overflow-hidden rounded-xl relative",
                  i === activeImage ? "" : "opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all",
                  TILE_TINTS[i % TILE_TINTS.length],
                )}
              >
                <Image src={img} alt={`Thumbnail ${i + 1}`} fill className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Info block ── */}
      <BentoCard bg="white" className="p-5 relative">
        <div className="inline-block bg-bk-decor-c text-bk-ink font-display font-bold text-xs px-2 py-1 rounded border-[3px] border-bk-ink mb-2 uppercase">
          {onSale ? "On Sale" : "New Arrival"}
        </div>
        <h1 className="font-display font-black text-3xl leading-tight mb-2 uppercase">
          {product.name}
        </h1>
        {/* Real approved-review aggregates, merged onto the product by the
            storefront query. This used to render five fixed stars and a
            hardcoded "(124)" for every product of every store — a review
            count nobody had earned. Now it shows what the product actually
            has, and nothing at all when it has none. */}
        {schn.pdp.show_star_rating && reviewCount > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <span
              className="text-bk-accent text-xl drop-shadow-[1px_1px_0px_var(--bk-ink,#1a1a1a)]"
              aria-hidden="true"
            >
              {"★".repeat(filledStars)}
              {"☆".repeat(5 - filledStars)}
            </span>
            <span className="font-body font-bold text-sm text-bk-ink/80">
              {avgRating.toFixed(1)} ({reviewCount})
            </span>
          </div>
        )}

        <div className="flex items-baseline flex-wrap gap-x-4 gap-y-2 relative">
          <span className="font-display font-black text-4xl">{formatPrice(price)}</span>
          {onSale && (
            <span className="font-body font-bold text-bk-ink/40 line-through text-lg">
              {formatPrice(original!)}
            </span>
          )}
          {onSale && (
            <div className="absolute -top-12 right-0">
              <Sticker bg="mint" rotate={12} size="sm">
                -{discountPct}% Wow!
              </Sticker>
            </div>
          )}
        </div>
      </BentoCard>

      {/* ── Delivery card ── */}
      {schn.pdp.show_delivery_card && (
        <BentoCard bg="butter" rotate={1} className="p-4 z-10 overflow-hidden">
          <div className="flex items-start gap-3 mb-3">
            <MaterialIcon name="local_shipping" className="text-3xl drop-shadow-[2px_2px_0px_var(--bk-ink,#1a1a1a)]" />
            <div>
              <h3 className="font-display font-black text-lg leading-tight uppercase">
                Delivered in {schn.delivery_promise.baghdad_hours}h
              </h3>
              <p className="font-label font-medium text-sm">To Baghdad &amp; major cities</p>
            </div>
          </div>
          <div className="flex items-start gap-3 mb-4">
            <MaterialIcon name="payments" className="text-3xl drop-shadow-[2px_2px_0px_var(--bk-ink,#1a1a1a)]" />
            <div>
              <h3 className="font-display font-black text-lg leading-tight uppercase">Pay cash on delivery</h3>
              <p className="font-label font-medium text-sm">100% secure, no hidden fees</p>
            </div>
          </div>
          <div className="inline-block bg-bk-decor-b text-bk-ink font-bold text-xs px-3 py-1.5 rounded-full border-2 border-bk-ink shadow-bento-sm -rotate-2">
            ✨ {schn.delivery_promise.inspection_text}
          </div>
        </BentoCard>
      )}

      {/* ── Variant selector ── */}
      {(sizeVariants.length > 0 || otherVariants.length > 0) && (
        <BentoCard bg="cream" className="p-5 space-y-6" style={{ borderStyle: "dashed" }}>
          {sizeVariants.length > 0 && (
            <div>
              <div className="flex justify-between items-end mb-3">
                <h3 className="font-display font-black text-xl uppercase">Size</h3>
                {schn.pdp.show_size_guide_link && (
                  <a href="#" className="font-label font-bold text-xs text-bk-ink/60 underline decoration-2 underline-offset-2">
                    Size Guide
                  </a>
                )}
              </div>
              <div className="flex gap-3 flex-wrap">
                {sizeVariants.map((v) => {
                  const selected = selectedVariantId === v.id;
                  const oos = v.stock_quantity === 0;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={oos}
                      onClick={() => setSelectedVariantId(v.id)}
                      className={cn(
                        "min-w-[3rem] h-12 px-3 bento-card-sm font-display font-bold text-lg transition-all rounded-xl",
                        selected ? "bg-bk-primary text-white scale-110 rotate-3" : "bg-white hover:bg-bk-surface",
                        oos && "opacity-40 cursor-not-allowed line-through",
                      )}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {otherVariants.length > 0 && (
            <div>
              <div className="flex justify-between items-end mb-3">
                <h3 className="font-display font-black text-xl uppercase">Option</h3>
                {selectedVariant && !sizeVariants.includes(selectedVariant) && (
                  <span className="font-label font-bold text-sm bg-bk-ink text-white px-2 py-0.5 rounded border border-bk-ink">
                    {selectedVariant.name}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                {otherVariants.map((v) => {
                  const selected = selectedVariantId === v.id;
                  const oos = v.stock_quantity === 0;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={oos}
                      onClick={() => setSelectedVariantId(v.id)}
                      className={cn(
                        "px-4 h-10 bento-card-sm font-display font-bold text-sm uppercase rounded-xl transition-all",
                        selected ? "bg-bk-primary text-white scale-105 rotate-2" : "bg-white hover:bg-bk-surface",
                        oos && "opacity-40 cursor-not-allowed line-through",
                      )}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <h3 className="font-display font-black text-xl uppercase mb-3">Quantity</h3>
            <div className="inline-flex items-center bento-card-sm bg-white overflow-hidden p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-10 h-10 flex items-center justify-center font-display font-black text-2xl hover:bg-bk-surface rounded-lg transition-colors"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="w-12 text-center font-display font-black text-xl">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(Math.max(1, stock || 99), q + 1))}
                className="w-10 h-10 flex items-center justify-center font-display font-black text-2xl bg-bk-decor-a rounded-lg border-2 border-bk-ink shadow-bento-sm hover:bg-bk-accent transition-colors"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            {inStock && stock > 0 && stock <= 10 && (
              <p className="text-xs font-label font-bold text-bk-ink/70 mt-2">
                Only {stock} left
              </p>
            )}
          </div>
        </BentoCard>
      )}

      {/* ── Description ── */}
      {product.description && (
        <section className="space-y-3">
          <ScribbleHeading color="mint" as="h3">About this product</ScribbleHeading>
          <BentoCard bg="white" className="p-5">
            <p className="font-body text-sm leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          </BentoCard>
        </section>
      )}

      {/* ── Reassurance row ── */}
      <BentoCard bg="lilac" className="p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { icon: "verified", label: "100% Original" },
            { icon: "local_shipping", label: `${schn.delivery_promise.baghdad_hours}h Delivery` },
            { icon: "support_agent", label: "WhatsApp Help" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-1">
              <MaterialIcon name={item.icon} className="text-2xl text-bk-ink" />
              <span className="font-display font-bold text-[10px] uppercase tracking-wide leading-tight">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </BentoCard>

      {/* Spacer for the sticky bar */}
      <div className="h-6" />

      {/* ── Sticky bottom action bar — overrides PageShell default ── */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-bk-decor-a border-t-4 border-bk-ink shadow-[0_-4px_0_0_rgba(26,26,26,1)] pb-safe">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <SectionEyebrow className="text-bk-ink/80">Total</SectionEyebrow>
            <span className="font-display font-black text-2xl">{formatPrice(price * qty)}</span>
          </div>
          <div className="flex gap-2 items-center">
            {whatsappNumber && (
              <a
                href={whatsappHref()}
                target="_blank"
                rel="noreferrer"
                aria-label="Order on WhatsApp"
                className="w-12 h-12 bento-card-sm bg-bk-primary text-white flex items-center justify-center rounded-xl hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none active:translate-y-[2px] active:translate-x-[2px] transition-all"
              >
                <WhatsAppIcon className="w-6 h-6" />
              </a>
            )}
            <ChunkyButton
              bg="white"
              onClick={handleAddToCart}
              disabled={!inStock}
              className="font-display font-black"
            >
              {inStock ? (
                <>
                  Add to Cart <span className="text-xl">🛍</span>
                </>
              ) : (
                "Sold Out"
              )}
            </ChunkyButton>
          </div>
        </div>
      </div>
    </div>
  );
}
