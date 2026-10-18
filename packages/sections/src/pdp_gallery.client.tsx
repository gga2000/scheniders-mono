// =====================================================================
// Section — pdp_gallery
// =====================================================================
// Product image gallery for the PDP. Renders the main image plus
// thumbnails / carousel / grid depending on the chosen layout. Supports
// click-to-zoom on the main image. Pulls images from
// `ctx.product.image_url` + `ctx.product.images` + `ctx.product.gallery_urls`.
//
// P2-30 hardening (other templates' PDP):
//   - every `next/image` carries `unoptimized={!isOptimizableImageHost()}`
//     so a merchant image on a non-allowlisted host no longer throws and
//     silently drops the whole section;
//   - zoom is a native `<dialog>` (focus trap + Escape for free, close
//     button, backdrop click, scroll lock) whose image is rendered at 2×
//     the viewport inside an `overflow:auto` pan area so mobile can
//     actually zoom;
//   - labels are localised (ar / en, ku → ar) instead of English-only;
//   - the main image is only wrapped in a `<button>` when zoom is on;
//   - the grid reveals "+N" instead of silently slicing to six.
// New props are additive with defaults so other templates are unchanged.
// =====================================================================
// Client half of `pdp_gallery` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./pdp_gallery.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LocaleCode } from "@scheniders/shared";
import { BentoCard, MaterialIcon, Sticker } from "./helpers/primitives";
import { formatCount, formatPrice } from "./helpers/format";
import type { CountForms } from "./helpers/format";
import { isOptimizableImageHost } from "./helpers/image";
import { chromeString } from "./helpers/chrome-strings";
import { cn } from "./helpers/utils";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./pdp_gallery";

/** Tiles shown before the grid collapses the rest behind "+N". */
const GRID_VISIBLE = 6;

/* ─── Localised labels (ar / en; ku follows ar like the rest of the
   storefront's fallback chain) ─────────────────────────────────────── */

const LABELS = {
  zoom_image: { ar: "تكبير الصورة", en: "Zoom image" },
  view_image: { ar: "عرض الصورة {n}", en: "View image {n}" },
  zoomed_image_of: {
    ar: "صورة مكبّرة لـ {name}",
    en: "Zoomed image of {name}",
  },
  save: { ar: "وفّر ", en: "Save " },
  sold_out: { ar: "نفد المخزون", en: "Sold Out" },
} as const;

type LabelKey = keyof typeof LABELS;

function label(key: LabelKey, locale: LocaleCode): string {
  const entry = LABELS[key];
  return locale === "en" ? entry.en : entry.ar;
}

const LOW_STOCK_FORMS: Record<"ar" | "en", CountForms> = {
  ar: {
    one: "آخر قطعة",
    two: "آخر قطعتين",
    few: "آخر {count} قطع",
    many: "آخر {count} قطعة",
    other: "آخر {count} قطعة",
  },
  en: { one: "Last {count} in stock", other: "Last {count} in stock" },
};

const MORE_IMAGES_FORMS: Record<"ar" | "en", CountForms> = {
  ar: {
    one: "عرض صورة إضافية",
    two: "عرض صورتين إضافيتين",
    few: "عرض {count} صور إضافية",
    many: "عرض {count} صورة إضافية",
    other: "عرض {count} صورة إضافية",
  },
  en: { one: "Show {count} more image", other: "Show {count} more images" },
};

function lowStockLabel(count: number, locale: LocaleCode): string {
  return formatCount(
    count,
    locale,
    LOW_STOCK_FORMS[locale === "en" ? "en" : "ar"],
  );
}

function moreImagesLabel(count: number, locale: LocaleCode): string {
  return formatCount(
    count,
    locale,
    MORE_IMAGES_FORMS[locale === "en" ? "en" : "ar"],
  );
}

/* ─── Frame ratio ───────────────────────────────────────────────────── */

const ASPECT_CLASS: Record<Props["aspect"], string> = {
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  auto: "",
};

/**
 * One product image inside a fixed- or natural-ratio frame. Fixed ratios
 * use `fill`; `auto` renders an intrinsic-size image so the frame follows
 * the picture. `unoptimized` is decided per host — never assume the
 * merchant's CDN is in `remotePatterns`.
 */
function FramedImage({
  src,
  alt,
  aspect,
  sizes,
  fit,
  priority,
}: {
  src: string;
  alt: string;
  aspect: Props["aspect"];
  sizes: string;
  fit: "cover" | "contain";
  priority?: boolean;
}) {
  const unoptimized = !isOptimizableImageHost(src);
  if (aspect === "auto") {
    return (
      <Image
        src={src}
        alt={alt}
        width={1200}
        height={1200}
        sizes={sizes}
        unoptimized={unoptimized}
        priority={priority}
        className="block h-auto w-full"
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized={unoptimized}
      priority={priority}
      className={fit === "cover" ? "object-cover" : "object-contain"}
    />
  );
}

/* ─── Zoom dialog ───────────────────────────────────────────────────── */

/**
 * Native `<dialog>` zoom: `showModal()` gives focus trapping + Escape;
 * a click on the backdrop (the dialog element itself) closes; the page
 * scroll is locked while open. The image is laid out at twice the
 * viewport's smaller side inside a pan area that allows both scrolling
 * and pinch-zoom, so a phone can actually inspect the product.
 */
function ZoomDialog({
  src,
  alt,
  open,
  onClose,
  closeLabel,
}: {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prev;
      };
    }
    if (dialog.open) dialog.close();
    return undefined;
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={alt}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-bk-ink/85"
    >
      {open && (
        <div className="relative h-full w-full">
          <div
            className="h-full w-full overflow-auto overscroll-contain"
            style={{ touchAction: "pan-x pan-y pinch-zoom" }}
          >
            <Image
              src={src}
              alt={alt}
              width={1600}
              height={1600}
              sizes="200vw"
              unoptimized={!isOptimizableImageHost(src)}
              className="block h-auto max-w-none"
              style={{ width: "200vmin" }}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="absolute end-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full shadow-md focus-visible:outline-none focus-visible:ring-2 ring-bk-focus"
            style={{
              backgroundColor: "var(--bk-surface, #ffffff)",
              color: "var(--bk-ink, #1a1a1a)",
            }}
          >
            <MaterialIcon name="close" />
          </button>
        </div>
      )}
    </dialog>
  );
}

/* ─── Data ──────────────────────────────────────────────────────────── */

function gatherImages(product: SectionRenderContext["product"]): string[] {
  if (!product) return [];
  const primary = product.image_url ? [product.image_url] : [];
  const rest = Array.isArray(product.images) ? product.images : [];
  // products.gallery_urls (jsonb import-time gallery) — typed string[], but
  // guard element shape anyway: builder previews may feed looser data.
  const gallery = Array.isArray(product.gallery_urls)
    ? product.gallery_urls.filter((u): u is string => typeof u === "string")
    : [];
  // Dedupe while preserving order.
  const seen = new Set<string>();
  const all: string[] = [];
  for (const url of [...primary, ...rest, ...gallery]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    all.push(url);
  }
  return all;
}

/* ─── Render ────────────────────────────────────────────────────────── */

export function PdpGalleryRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const images = useMemo(() => gatherImages(ctx.product), [ctx.product]);
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (active >= images.length) setActive(0);
  }, [active, images.length]);

  if (!ctx.product || images.length === 0) return null;

  const locale = ctx.runtime.locale;
  const productName = ctx.product.name ?? "";
  const product = ctx.product;
  const compareAt = product.compare_at_price;
  const savings =
    compareAt != null && compareAt > product.price
      ? compareAt - product.price
      : 0;
  const stockLeft =
    (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0);
  const aspectClass = ASPECT_CLASS[props.aspect];
  // Overlay stickers for the main (stacked) image: a "Save X" sale flag, a
  // low-stock urgency flag, or a sold-out flag.
  const overlayStickers = (
    <>
      {savings > 0 && (
        <div className="absolute top-3 right-3 z-10">
          <Sticker bg="pink" rotate={-6} size="sm">
            {label("save", locale)}
            <bdi>{formatPrice(savings, locale)}</bdi>
          </Sticker>
        </div>
      )}
      {stockLeft > 0 && stockLeft <= props.low_stock_threshold && (
        <div className="absolute bottom-3 left-3 z-10">
          <Sticker bg="lilac" rotate={3} size="xs">
            {lowStockLabel(stockLeft, locale)}
          </Sticker>
        </div>
      )}
      {stockLeft <= 0 && (
        <div className="absolute bottom-3 left-3 z-10">
          <Sticker bg="ink" rotate={3} size="xs">
            {label("sold_out", locale)}
          </Sticker>
        </div>
      )}
    </>
  );

  if (props.layout === "grid") {
    const hidden = showAll ? 0 : Math.max(0, images.length - GRID_VISIBLE);
    const visible = hidden > 0 ? images.slice(0, GRID_VISIBLE) : images;
    return (
      <section className="px-4 py-6">
        <div className="grid grid-cols-2 gap-bk-sm md:gap-bk-md">
          {visible.map((src, i) => {
            const isMoreTile = hidden > 0 && i === visible.length - 1;
            const tile = (
              <BentoCard
                key={`${i}-${src}`}
                bg="white"
                size="sm"
                className={cn("p-0 overflow-hidden relative", aspectClass)}
              >
                <FramedImage
                  src={src}
                  alt={productName}
                  aspect={props.aspect}
                  sizes="(max-width: 768px) 50vw, 25vw"
                  fit="cover"
                />
                {isMoreTile && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 z-10 flex items-center justify-center font-display text-3xl font-black"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--bk-ink, #1a1a1a) 60%, transparent)",
                      color: "var(--bk-surface, #ffffff)",
                    }}
                  >
                    +{hidden}
                  </span>
                )}
              </BentoCard>
            );
            if (!isMoreTile) return tile;
            return (
              <button
                key={`more-${i}-${src}`}
                type="button"
                onClick={() => setShowAll(true)}
                aria-label={moreImagesLabel(hidden, locale)}
                className="block w-full text-start focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2"
              >
                {tile}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  if (props.layout === "carousel") {
    return (
      <section className="py-6">
        <div className="flex gap-bk-sm overflow-x-auto px-4 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, i) => (
            <BentoCard
              key={`${i}-${src}`}
              bg="white"
              size="md"
              className={cn(
                "p-0 overflow-hidden shrink-0 snap-center w-[85%] md:w-[55%] lg:w-[45%] relative",
                aspectClass,
              )}
            >
              <FramedImage
                src={src}
                alt={productName}
                aspect={props.aspect}
                sizes="(max-width: 768px) 85vw, 45vw"
                fit="cover"
              />
            </BentoCard>
          ))}
        </div>
      </section>
    );
  }

  // Stacked — main image with optional thumbnail rail.
  const mainSrc = images[active] ?? images[0];
  const mainImage = (
    <FramedImage
      src={mainSrc}
      alt={productName}
      aspect={props.aspect}
      sizes="(max-width: 640px) 100vw, 576px"
      // object-contain so portrait/landscape product shots show in full
      // (no crop) on the white card; sizes matches the constrained slot
      // so next/image fetches a sharp asset rather than under-fetching.
      fit="contain"
      priority
    />
  );
  return (
    <section className="px-4 py-6">
      <BentoCard
        bg="white"
        size="md"
        className={cn(
          "p-0 overflow-hidden relative mx-auto w-full max-w-xl",
          aspectClass,
        )}
      >
        {props.show_zoom ? (
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="block w-full h-full relative cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-inset"
            aria-label={label("zoom_image", locale)}
          >
            {mainImage}
          </button>
        ) : (
          <div className="block w-full h-full relative">{mainImage}</div>
        )}
        {overlayStickers}
      </BentoCard>
      {props.show_thumbnails && images.length > 1 && (
        <div className="mt-bk-sm flex gap-bk-xs overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, i) => (
            <button
              key={`${i}-${src}`}
              type="button"
              onClick={() => setActive(i)}
              className="shrink-0 w-16 h-16 md:w-20 md:h-20 overflow-hidden relative focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2"
              style={{
                border:
                  "var(--bk-border-thickness, 3px) solid " +
                  (i === active
                    ? "var(--bk-primary, #ff5a8a)"
                    : "var(--bk-ink, #1a1a1a)"),
                borderRadius: "var(--bk-radius-input, 0.75rem)",
                boxShadow:
                  i === active
                    ? "0 0 0 3px color-mix(in srgb, var(--bk-primary, #ff5a8a) 30%, transparent)"
                    : undefined,
              }}
              aria-label={label("view_image", locale).replace(
                "{n}",
                String(i + 1),
              )}
              aria-pressed={i === active}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 768px) 64px, 80px"
                unoptimized={!isOptimizableImageHost(src)}
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {props.show_zoom && (
        <ZoomDialog
          src={mainSrc}
          alt={label("zoomed_image_of", locale).replace("{name}", productName)}
          open={zoomed}
          onClose={() => setZoomed(false)}
          closeLabel={chromeString("close", locale)}
        />
      )}
    </section>
  );
}
