// =====================================================================
// image_gallery — the proof stack (`layout: "stack"`, spec §1.5)
// =====================================================================
// Server components only, no hooks: the stack (ProofStack), each comment's
// screenshot (StackShot) and author line (StackAuthor). The source pill
// and scope line head the list; the first `initial_count` comments lead
// with a numbered doubt and the quote in «»; the legend follows the first
// comment; the rest render inside the expand island
// (image_gallery.stack.tsx). Every unlinked screenshot opens the viewer
// (image_gallery.client.tsx) at its own slide.
// =====================================================================

import Image from "next/image";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import { MaterialIcon } from "./helpers/primitives";
import { isOptimizableImageHost } from "./helpers/image";
import { readsRtl } from "./helpers/reading";
import { cn, PRESSABLE } from "./helpers/utils";
import { chromeString } from "./helpers/chrome-strings";
import { GalleryViewer } from "./image_gallery.client";
import type { GalleryViewerImage } from "./image_gallery.client";
import { ProofStackMore } from "./image_gallery.stack";
import { gs, proofMoreLabel } from "./image_gallery.strings";
import { STACK_SIZES, stackFrame } from "./image-gallery-crop";
import { VIEWER_STRINGS, fillAlt, fillCount } from "./image-gallery-viewer-strings";
import type { GalleryImage, Props } from "./image_gallery";
import type { SectionRenderContext } from "./_types";

/** One screenshot of the stack: a full-width box at the file's natural
 *  height, cropped to the comment column when its size is known (else a
 *  4/1 box), as a viewer button (or the merchant's link). */
function StackShot({
  img,
  alt,
  viewer,
}: {
  img: GalleryImage;
  alt: string;
  viewer: { index: number; label: string } | null;
}) {
  const frame = stackFrame(img);
  const picture =
    frame.kind === "sized" && img.width && img.height ? (
      <Image
        src={img.url}
        alt={alt}
        width={img.width}
        height={img.height}
        unoptimized={!isOptimizableImageHost(img.url)}
        sizes={frame.sizes}
        className="absolute top-0 h-auto max-w-none"
        style={{ width: frame.imageWidth, left: frame.imageLeft }}
      />
    ) : (
      <Image
        src={img.url}
        alt={alt}
        fill
        unoptimized={!isOptimizableImageHost(img.url)}
        sizes={STACK_SIZES}
        className="absolute inset-0 h-full w-full object-contain"
      />
    );
  const boxCls = cn(
    "relative block w-full overflow-hidden rounded-bk-card bg-bk-surface-alt",
    frame.kind === "fill" && "aspect-[4/1]",
  );
  const boxStyle = frame.kind === "sized" ? { aspectRatio: frame.aspectRatio } : undefined;
  if (img.link_href) {
    return (
      <StoreLink href={img.link_href} className={cn("block", PRESSABLE)}>
        <span className={boxCls} style={boxStyle}>
          {picture}
        </span>
      </StoreLink>
    );
  }
  if (!viewer) return null;
  return (
    <button
      type="button"
      data-gallery-open={viewer.index}
      aria-haspopup="dialog"
      aria-label={viewer.label}
      className={cn(
        boxCls,
        "cursor-zoom-in text-start focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2",
        PRESSABLE,
      )}
      style={boxStyle}
    >
      {picture}
    </button>
  );
}

/** The author line: the name as written (<bdi>), and the business tag. */
function StackAuthor({
  img,
  locale,
  rtl,
}: {
  img: GalleryImage;
  locale: LocaleCode;
  rtl: boolean;
}) {
  if (!img.author && !img.is_business) return null;
  return (
    <p
      className={cn(
        "mb-bk-xs flex items-center gap-2 font-bk-body text-[13px] font-bold text-bk-ink [overflow-wrap:anywhere]",
        rtl ? "flex-row-reverse text-right" : "text-left",
      )}
    >
      {img.author && <bdi>{img.author}</bdi>}
      {img.is_business && (
        <span
          data-proof-business="true"
          className="shrink-0 rounded-bk-pill border-bk border-bk-divider bg-bk-surface-alt px-2 text-xs font-bold text-bk-ink-soft"
        >
          {gs("business", locale)}
        </span>
      )}
    </p>
  );
}

/** The opt-in `layout: "stack"` proof stack. `images` arrive filtered and
 *  in the merchant's order (never re-ordered). */
export function ProofStack({
  props,
  images,
  ctx,
  listId,
  heading,
}: {
  props: Props;
  images: GalleryImage[];
  ctx: SectionRenderContext;
  listId: string;
  heading: string;
}) {
  const locale = ctx.runtime.locale;
  const rtl = readsRtl(locale);
  const strings = locale === "en" ? VIEWER_STRINGS.en : VIEWER_STRINGS.ar;
  const leadCount = Math.min(props.initial_count ?? 3, images.length);
  const source = resolveI18n(props.source_label_i18n, locale);
  const legend = resolveI18n(props.legend_i18n, locale);
  const legendImage = props.legend_image_url || ctx.tenant.branding?.logo_url || "";
  const altOf = (img: GalleryImage) =>
    resolveI18n(img.alt_i18n, locale) || resolveI18n(img.caption_i18n, locale);

  const unlinked = images.filter((img) => !img.link_href);
  const total = unlinked.length;
  const viewerImages: GalleryViewerImage[] = unlinked.map((img, i) => ({
    url: img.url,
    alt: altOf(img),
    counter: fillCount(strings.counter, i + 1, total),
  }));
  // Each unlinked picture's slot in the viewer, fixed before rendering.
  const slotOf = new Map(unlinked.map((img, i) => [img, i] as const));
  const viewerOf = (img: GalleryImage) => {
    const slot = slotOf.get(img);
    if (slot === undefined) return null;
    const alt = viewerImages[slot]?.alt;
    return {
      index: slot,
      label: alt ? fillAlt(strings.openNamed, alt) : fillCount(strings.open, slot + 1, total),
    };
  };
  const side = rtl ? "text-right" : "text-left";

  const lead = images.slice(0, leadCount).map((img, i) => {
    const quote = resolveI18n(img.quote_i18n, locale);
    const doubt = quote ? resolveI18n(img.doubt_i18n, locale) : "";
    return (
      <li key={i} data-proof-item={i} className="flex flex-col">
        {doubt && (
          <p
            data-proof-doubt={i + 1}
            className={cn(
              "mb-1.5 flex items-center gap-2.5 font-bk-body text-sm font-extrabold text-bk-ink-soft",
              rtl ? "flex-row-reverse text-right" : "text-left",
            )}
          >
            <span
              aria-hidden="true"
              className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-bk-pill bg-bk-secondary text-[13px] font-black tabular-nums text-bk-primary"
            >
              {i + 1}
            </span>
            <span>{doubt}</span>
          </p>
        )}
        {quote && (
          <p
            data-proof-quote="true"
            className={cn("mb-1 font-bk-display text-[20px] font-black leading-snug text-bk-ink text-pretty", side)}
          >
            «{quote}»
          </p>
        )}
        <StackAuthor img={img} locale={locale} rtl={rtl} />
        <StackShot img={img} alt={altOf(img)} viewer={viewerOf(img)} />
        {i === 0 && legend && (
          <div
            data-proof-legend="true"
            className={cn(
              "mt-bk-sm flex items-center gap-2.5 rounded-bk-card bg-bk-surface-alt px-3 py-2.5",
              rtl && "flex-row-reverse",
            )}
          >
            {legendImage && (
              <span aria-hidden="true" className="relative size-[26px] shrink-0">
                <Image
                  src={legendImage}
                  alt=""
                  width={26}
                  height={26}
                  unoptimized={!isOptimizableImageHost(legendImage)}
                  className="size-[26px] rounded-bk-pill object-cover"
                />
                <MaterialIcon name="favorite" className="absolute -bottom-1 -right-1 text-[13px] text-bk-ink" />
              </span>
            )}
            <p className={cn("min-w-0 flex-1 font-bk-body text-sm font-bold text-bk-ink", side)}>{legend}</p>
          </div>
        )}
      </li>
    );
  });

  const rest = images.slice(leadCount).map((img, i) => (
    <li key={i} data-proof-item={leadCount + i} className="py-bk-md first:pt-0">
      <StackAuthor img={img} locale={locale} rtl={rtl} />
      <StackShot img={img} alt={altOf(img)} viewer={viewerOf(img)} />
    </li>
  ));

  const body = (
    <div>
      {(source || props.scope === "store") && (
        <div className={cn("mb-bk-lg flex flex-col gap-bk-xs", rtl ? "items-end" : "items-start")}>
          {source && (
            <span
              data-proof-source="true"
              data-i18n-field="source_label_i18n"
              className={cn(
                "inline-flex min-h-7 items-center gap-1.5 rounded-bk-pill border-bk border-bk-divider bg-bk-surface-alt px-2.5 py-0.5 font-bk-body text-[13px] font-bold text-bk-ink",
                rtl && "flex-row-reverse",
              )}
            >
              <MaterialIcon name="forum" className="text-base" />
              {source}
            </span>
          )}
          {props.scope === "store" && (
            <p className={cn("font-bk-body text-[13px] font-semibold text-bk-ink-soft", side)}>
              {gs("proofScope", locale, { shown: leadCount, total: images.length })}
            </p>
          )}
        </div>
      )}
      <ol className="flex flex-col gap-bk-xl">{lead}</ol>
      {rest.length > 0 && (
        <ProofStackMore
          listId={listId}
          moreLabel={proofMoreLabel(rest.length, locale)}
          lessLabel={gs("proofLess", locale)}
          rtl={rtl}
        >
          {rest}
        </ProofStackMore>
      )}
    </div>
  );

  if (!viewerImages.length) return body;
  return (
    <GalleryViewer
      images={viewerImages}
      labels={{
        close: chromeString("close", locale),
        prev: strings.prev,
        next: strings.next,
      }}
      dialogLabel={heading || strings.viewer}
    >
      {body}
    </GalleryViewer>
  );
}
