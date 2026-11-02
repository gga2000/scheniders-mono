// =====================================================================
// image_gallery — the proof stack (`layout: "stack"`, spec §1.5)
// =====================================================================
// Server components only, no hooks: the stack (ProofStack), each comment's
// screenshot (StackShot) and author line (StackAuthor). The source pill
// and scope line head the list, with the legend under them; every comment
// is one card (numbered doubt, the quote in «», the author, then the
// screenshot flush at the bottom); the first `initial_count` lead and the
// rest render inside the expand island
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
  // The screenshot sits flush along the bottom of its comment card: the
  // card's own radius and overflow clip its corners.
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
    "relative block w-full overflow-hidden bg-bk-surface-alt",
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
        "flex items-center gap-2 font-bk-body text-[13px] font-bold text-bk-ink-soft [overflow-wrap:anywhere]",
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

  // Every comment is one card: what it answers and its strongest line on
  // top, the original screenshot flush along the bottom as the evidence.
  const card =
    "flex flex-col overflow-hidden rounded-bk-card border-bk border-bk-divider bg-bk-surface";

  const lead = images.slice(0, leadCount).map((img, i) => {
    const quote = resolveI18n(img.quote_i18n, locale);
    const doubt = quote ? resolveI18n(img.doubt_i18n, locale) : "";
    const hasAuthor = !!img.author || !!img.is_business;
    return (
      <li key={i} data-proof-item={i} className={card}>
        {(doubt || quote || hasAuthor) && (
          <div className={cn("flex flex-col gap-2 px-4 pb-3.5 pt-4", side)}>
            {doubt && (
              <p
                data-proof-doubt={i + 1}
                className={cn(
                  "flex items-center gap-2 font-bk-body text-[13px] font-extrabold text-bk-ink-soft",
                  rtl && "flex-row-reverse",
                )}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-bk-pill bg-bk-secondary text-xs font-black tabular-nums text-bk-primary"
                >
                  {i + 1}
                </span>
                <span>{doubt}</span>
              </p>
            )}
            {quote && (
              <p
                data-proof-quote="true"
                className="font-bk-display text-[19px] font-black leading-snug text-bk-ink text-pretty"
              >
                «{quote}»
              </p>
            )}
            <StackAuthor img={img} locale={locale} rtl={rtl} />
          </div>
        )}
        <StackShot img={img} alt={altOf(img)} viewer={viewerOf(img)} />
      </li>
    );
  });

  const rest = images.slice(leadCount).map((img, i) => (
    <li key={i} data-proof-item={leadCount + i} className={card}>
      {(img.author || img.is_business) && (
        <div className="px-4 py-2.5">
          <StackAuthor img={img} locale={locale} rtl={rtl} />
        </div>
      )}
      <StackShot img={img} alt={altOf(img)} viewer={viewerOf(img)} />
    </li>
  ));

  const hasHeader = !!source || props.scope === "store" || !!legend;
  const body = (
    <div>
      {hasHeader && (
        <div
          data-proof-header="true"
          className={cn("mb-bk-md flex flex-col gap-2", rtl ? "items-end" : "items-start")}
        >
          {(source || props.scope === "store") && (
            <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", rtl && "flex-row-reverse")}>
              {source && (
                <span
                  data-proof-source="true"
                  data-i18n-field="source_label_i18n"
                  className={cn(
                    "inline-flex min-h-7 items-center gap-1.5 rounded-bk-pill bg-bk-surface-alt px-2.5 py-0.5 font-bk-body text-[13px] font-bold text-bk-ink",
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
          {legend && (
            <p
              data-proof-legend="true"
              className={cn(
                "flex items-center gap-2 font-bk-body text-xs font-semibold text-bk-ink-soft",
                rtl ? "flex-row-reverse text-right" : "text-left",
              )}
            >
              {legendImage && (
                <span aria-hidden="true" className="relative size-5 shrink-0">
                  <Image
                    src={legendImage}
                    alt=""
                    width={20}
                    height={20}
                    unoptimized={!isOptimizableImageHost(legendImage)}
                    className="size-5 rounded-bk-pill object-cover"
                  />
                  <MaterialIcon name="favorite" className="absolute -bottom-1 -right-1 text-[11px] text-bk-ink" />
                </span>
              )}
              <span className="min-w-0">{legend}</span>
            </p>
          )}
        </div>
      )}
      <ol className="flex flex-col gap-bk-md">{lead}</ol>
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
