"use client";

import { useState } from "react";
import Image from "next/image";
import { resolveSchneidersConfig, SCHNEIDERS_DEFAULTS } from "@scheniders/shared";
import type { LocaleCode, SchneidersConfig } from "@scheniders/shared";
import { StoreLink } from "./store-context";
import type { Product } from "../types";
import { cn } from "./utils";
import { formatPrice } from "./format";
import { Sticker, MaterialIcon, WhatsAppIcon } from "./primitives";
import { whatsappOrderLink } from "./whatsapp";
import { useCart } from "./cart-store";

type Tint = "mint" | "lilac" | "butter" | "sky" | "pink" | "cream";

const TINT_BG: Record<Tint, string> = {
  mint: "bg-candy-mint/30",
  lilac: "bg-candy-lilac/30",
  butter: "bg-candy-butter/30",
  sky: "bg-candy-sky/30",
  pink: "bg-candy-pink/15",
  cream: "bg-candy-cream",
};

interface Props {
  product: Product;
  /** Background tint behind the image. Auto-rotates if not supplied. */
  tint?: Tint;
  /** Index used to deterministically pick a tint when none provided. */
  index?: number;
  className?: string;
  /** Optional sale-sticker config override (resolved). When omitted, defaults are used. */
  saleSticker?: SchneidersConfig["sale_sticker"];
  /** Tenant phone for the WhatsApp deep-link. When omitted the link is hidden. */
  whatsappPhone?: string | null;
  /** Public storefront origin to build full product URLs in the WhatsApp message. */
  storeOrigin?: string;
  /** Active locale — switches the WhatsApp template language. */
  locale?: LocaleCode;
  /** Eager-load the image (above-the-fold cards) to improve LCP. */
  priority?: boolean;
  /** Append a per-card "Order via WhatsApp" pill. Off by default — the Stitch
   *  card footer is BUY NOW + a compact cart icon; WhatsApp lives on the PDP /
   *  sticky bar, not on every grid card (it bulks the silhouette). */
  showWhatsapp?: boolean;
}

/** A product counts as "New" for ~30 days after it is created. */
const NEW_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;

const TINTS: Tint[] = ["mint", "lilac", "butter", "sky"];

export function SchneidersProductCard({
  product,
  tint,
  index = 0,
  className,
  saleSticker,
  whatsappPhone,
  storeOrigin,
  locale = "en",
  priority = false,
  showWhatsapp = false,
}: Props) {
  const t = locale === "ar";
  const addItem = useCart((s) => s.addItem);
  const [justAdded, setJustAdded] = useState(false);
  const resolvedTint = tint ?? TINTS[index % TINTS.length];
  const onSale =
    product.compare_at_price != null && product.compare_at_price > product.price;
  const savings = onSale ? product.compare_at_price! - product.price : 0;
  const discountPct = onSale ? Math.round((savings / product.compare_at_price!) * 100) : 0;
  const inStock = (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0) > 0;
  // One corner badge per card, by priority: Save (on sale) → Bestseller → New.
  const isBestseller = !onSale && product.is_bestseller === true;
  const isNew =
    !onSale &&
    !isBestseller &&
    product.created_at != null &&
    Date.now() - new Date(product.created_at).getTime() < NEW_WINDOW_MS;

  const sticker = { ...SCHNEIDERS_DEFAULTS.sale_sticker, ...(saleSticker ?? {}) };
  const stickerLabel =
    sticker.style === "percent"
      ? t
        ? `خصم ${discountPct}%`
        : `-${discountPct}% OFF`
      : sticker.style === "label"
        ? (sticker.label ?? SCHNEIDERS_DEFAULTS.sale_sticker.label!)
        : t
          ? `وفّر ${formatPrice(savings)}`
          : `Save ${formatPrice(savings)}`;

  function quickAdd() {
    addItem({
      product_id: product.id,
      variant_id: null,
      name: product.name,
      variant_name: null,
      price: product.price,
      quantity: 1,
      image_url: product.image_url ?? null,
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1500);
  }

  return (
    <article className={cn("bento-card bg-white p-4 relative flex flex-col", className)}>
      {/* One rotated corner badge: Save (on sale) → Bestseller → New. */}
      {onSale ? (
        <div className="absolute -top-3 -left-2 z-10">
          <Sticker bg={sticker.bg ?? "pink"} rotate={sticker.rotate_deg ?? -8} size="sm">
            {stickerLabel}
          </Sticker>
        </div>
      ) : isBestseller ? (
        <div className="absolute -top-3 -left-2 z-10">
          <Sticker bg="butter" rotate={-8} size="sm">
            {t ? "الأكثر مبيعاً" : "Bestseller"}
          </Sticker>
        </div>
      ) : isNew ? (
        <div className="absolute -top-3 -left-2 z-10">
          <Sticker bg="mint" rotate={-8} size="sm">
            {t ? "جديد" : "New"}
          </Sticker>
        </div>
      ) : null}

      {/* Image area with pastel tint */}
      <StoreLink
        href={`/products/${product.slug ?? product.id}`}
        className={cn(
          "group relative aspect-[4/3] overflow-hidden mb-3 block",
          TINT_BG[resolvedTint],
        )}
        style={{
          border:
            "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
          borderRadius: "var(--bk-radius-input, 0.75rem)",
        }}
      >
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={cn(
              "object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]",
              !inStock && "opacity-60 grayscale",
            )}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-bk-ink-faint font-display font-bold text-sm uppercase">
            {t ? "لا توجد صورة" : "No image"}
          </div>
        )}
        {!inStock && (
          <div className="absolute top-2 right-2">
            <Sticker bg="ink" rotate={6} size="xs">
              {t ? "نفد المخزون" : "Sold Out"}
            </Sticker>
          </div>
        )}
      </StoreLink>

      <StoreLink href={`/products/${product.slug ?? product.id}`} className="block mb-3">
        <h3 className="font-body font-bold text-base text-bk-ink line-clamp-2 leading-tight">
          {product.name}
        </h3>
      </StoreLink>

      <div className="flex items-end justify-between mb-3 mt-auto">
        <div>
          {onSale && (
            <div className="font-body font-medium text-xs text-bk-ink-soft line-through">
              {formatPrice(product.compare_at_price!)}
            </div>
          )}
          <div className="font-display font-black text-xl text-bk-ink">
            {formatPrice(product.price)}
          </div>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <StoreLink
          href={`/products/${product.slug ?? product.id}`}
          className="flex-grow bento-card-sm font-display font-black text-sm py-2.5 flex justify-center items-center gap-2 uppercase tracking-wide hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none active:translate-y-[2px] active:translate-x-[2px] transition-all"
          style={{
            backgroundColor: "var(--bk-primary, #ff5a8a)",
            color: "var(--bk-on-primary, #ffffff)",
            border:
              "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
            borderRadius: "var(--bk-radius-input, 0.75rem)",
            boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
            fontFamily: "var(--bk-font-display, inherit)",
          }}
        >
          {t ? "اشترِ الآن" : "Buy Now"}
        </StoreLink>
        <button
          type="button"
          onClick={quickAdd}
          disabled={!inStock}
          aria-label={
            justAdded
              ? t
                ? "أُضيف إلى السلة"
                : "Added to cart"
              : t
                ? "أضف إلى السلة"
                : "Add to cart"
          }
          className="bento-card-sm bg-white p-2.5 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{
            color: justAdded ? "var(--bk-success, #16a34a)" : "var(--bk-ink, #1a1a1a)",
            border:
              "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
            borderRadius: "var(--bk-radius-input, 0.75rem)",
            boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
          }}
        >
          <MaterialIcon name={justAdded ? "check" : "add_shopping_cart"} className="text-lg" />
        </button>
      </div>
      {showWhatsapp && (() => {
        const productPath = `/products/${product.slug ?? product.id}`;
        const productUrl = storeOrigin
          ? `${storeOrigin.replace(/\/+$/, "")}${productPath}`
          : productPath;
        const link = whatsappOrderLink(
          whatsappPhone,
          {
            name: product.name,
            url: productUrl,
            price: formatPrice(product.price),
          },
          locale,
        );
        if (!link) return null;
        return (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="product-card-whatsapp"
            className="mt-2 inline-flex w-full items-center justify-center gap-2 px-3 py-2 text-xs font-display font-black uppercase tracking-wide"
            style={{
              backgroundColor: "var(--bk-success, #7cf0bd)",
              color: "var(--bk-ink, #1a1a1a)",
              border:
                "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
              borderRadius: "var(--bk-radius-pill, 9999px)",
              boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
            }}
          >
            <WhatsAppIcon className="h-4 w-4" />
            {locale === "ar" ? "اطلب عبر واتساب" : "Order via WhatsApp"}
          </a>
        );
      })()}
    </article>
  );
}
