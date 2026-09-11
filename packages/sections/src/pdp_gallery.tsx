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

import { z } from "zod";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { PdpGalleryRender } from "./pdp_gallery.client";

const aspectSchema = z.enum(["square", "portrait", "auto"]);

const schema = z.object({
  layout: z.enum(["stacked", "carousel", "grid"]),
  show_zoom: z.boolean(),
  show_thumbnails: z.boolean(),
  /** Frame ratio of the main / grid / carousel tiles. `auto` follows the
   *  image's own ratio (no crop, no letterbox). Additive — `square` keeps
   *  the historical look for every template that doesn't set it. */
  aspect: aspectSchema.default("square"),
  /** "Last N in stock" flag shows when 0 < stock ≤ this. Additive. */
  low_stock_threshold: z.number().int().min(1).max(99).default(5),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  layout: "stacked",
  show_zoom: true,
  show_thumbnails: true,
  aspect: "square",
  low_stock_threshold: 5,
};

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
