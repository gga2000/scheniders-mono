// =====================================================================
// Section — pdp_gallery
// =====================================================================
// Product image gallery for the PDP. Renders the main image plus
// thumbnails / carousel / grid depending on the chosen layout. Supports
// click-to-zoom on the main image. Pulls images from
// `ctx.product.image_url` + `ctx.product.images`.
// =====================================================================

"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { BentoCard } from "./helpers/primitives";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  layout: z.enum(["stacked", "carousel", "grid"]),
  show_zoom: z.boolean(),
  show_thumbnails: z.boolean(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  layout: "stacked",
  show_zoom: true,
  show_thumbnails: true,
};

function gatherImages(
  product: SectionRenderContext["product"],
): string[] {
  if (!product) return [];
  const primary = product.image_url ? [product.image_url] : [];
  const rest = Array.isArray(product.images) ? product.images : [];
  // Dedupe while preserving order.
  const seen = new Set<string>();
  const all: string[] = [];
  for (const url of [...primary, ...rest]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    all.push(url);
  }
  return all;
}

function PdpGalleryRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const images = useMemo(() => gatherImages(ctx.product), [ctx.product]);
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (active >= images.length) setActive(0);
  }, [active, images.length]);

  if (!ctx.product || images.length === 0) return null;

  const productName = ctx.product.name ?? "";

  if (props.layout === "grid") {
    return (
      <section className="px-4 py-6">
        <div className="grid grid-cols-2 gap-3">
          {images.slice(0, 6).map((src, i) => (
            <BentoCard
              key={`${i}-${src}`}
              bg="white"
              size="sm"
              className="p-0 overflow-hidden aspect-square relative"
            >
              <Image
                src={src}
                alt={productName}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover"
              />
            </BentoCard>
          ))}
        </div>
      </section>
    );
  }

  if (props.layout === "carousel") {
    return (
      <section className="py-6">
        <div className="flex gap-3 overflow-x-auto px-4 snap-x snap-mandatory scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, i) => (
            <BentoCard
              key={`${i}-${src}`}
              bg="white"
              size="md"
              className="p-0 overflow-hidden shrink-0 snap-center w-[85%] aspect-square relative"
            >
              <Image
                src={src}
                alt={productName}
                fill
                sizes="85vw"
                className="object-cover"
              />
            </BentoCard>
          ))}
        </div>
      </section>
    );
  }

  // Stacked — main image with optional thumbnail rail.
  const mainSrc = images[active] ?? images[0];
  return (
    <section className="px-4 py-6">
      <BentoCard
        bg="white"
        size="md"
        className="p-0 overflow-hidden aspect-square relative"
      >
        <button
          type="button"
          onClick={() => props.show_zoom && setZoomed(true)}
          className="block w-full h-full relative"
          aria-label={props.show_zoom ? "Zoom image" : undefined}
        >
          <Image
            src={mainSrc}
            alt={productName}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            priority
          />
        </button>
      </BentoCard>
      {props.show_thumbnails && images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, i) => (
            <button
              key={`${i}-${src}`}
              type="button"
              onClick={() => setActive(i)}
              className="shrink-0 w-16 h-16 overflow-hidden relative"
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
              aria-label={`View image ${i + 1}`}
              aria-pressed={i === active}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {zoomed && props.show_zoom && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Zoomed image of ${productName}`}
        >
          <Image
            src={mainSrc}
            alt={productName}
            width={1600}
            height={1600}
            sizes="100vw"
            className="max-w-full max-h-full object-contain w-auto h-auto"
          />
        </div>
      )}
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "pdp_gallery",
  category: "page",
  name: { en: "Product gallery", ar: "ألبوم صور المنتج" },
  description: {
    en: "Product image gallery (stacked, carousel, or grid) with optional zoom.",
    ar: "ألبوم صور المنتج بتخطيطات متعددة مع تكبير اختياري.",
  },
  thumbnail: "/sections/pdp_gallery.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpGalleryRender,
};

registerSection(definition);
export default definition;
