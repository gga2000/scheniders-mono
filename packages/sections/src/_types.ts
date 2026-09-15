// =====================================================================
// Section system — shared type definitions
// =====================================================================
// Every section the store-config-v2 builder can place onto a page is a
// `SectionDefinition`. Sections live in their own file under
// `packages/sections/src/` and self-register via `registerSection()`
// on import — the barrel `index.ts` pulls them all in so the registry
// is populated as a side effect.
// =====================================================================

import type { ComponentType } from "react";
import type { z } from "zod";
import type { PageId, RuntimeContext } from "@scheniders/shared";
import type { Tenant, Product, Category } from "./types";

/**
 * Context handed to a section's render component at request time.
 * Concrete sections destructure what they need — search uses `products`,
 * PDP uses `product`, category pages use `category`, etc.
 */
export interface SectionRenderContext {
  tenant: Tenant;
  runtime: RuntimeContext;
  /** All visible products for this tenant (resolved upstream). */
  products: Product[];
  /** All visible categories for this tenant. */
  categories: Category[];
  /** Single product when on PDP. */
  product?: Product;
  /** Single category when on a category landing page. */
  category?: Category;
  /**
   * Live product count per category id. Optional: every existing section
   * and every test builds this context, so a required field would break
   * all of them at once.
   */
  category_product_counts?: Record<string, number>;
  /**
   * Best discount across the WHOLE catalogue, as a whole percent.
   *
   * A hero claiming "up to N% off" describes everything the shop sells,
   * not the products this page happened to load. Resolved upstream so
   * the claim cannot drift with a grid's fetch limit. Absent when
   * nothing is on sale.
   */
  max_discount_percent?: number;
  /**
   * Pre-aggregated public proof counts. Optional for the same reason,
   * and absent whenever the tenant has no stats row yet.
   */
  public_stats?: {
    completed_orders: number;
    customers: number;
    governorates_served: number;
  };
}

/**
 * One registered section type.
 *
 * - `type` — stable string id, referenced by `SectionInstance.type`.
 * - `schema` — Zod schema for the section's resolved props; the
 *   `<RenderSection />` helper validates at render time so editor
 *   mistakes degrade gracefully rather than crashing the storefront.
 * - `defaultProps` — what a new instance starts with in the editor.
 * - `render` — the React component that draws the section.
 */
export interface SectionDefinition<Props> {
  type: string;
  category:
    | "hero"
    | "products"
    | "trust"
    | "story"
    | "content"
    | "conversion"
    | "page";
  name: { en: string; ar?: string };
  description: { en: string; ar?: string };
  /** Path to a 320x200 SVG preview shown in the editor sidebar. */
  thumbnail: string;
  /** Pages this section is allowed to be placed on. */
  valid_on: PageId[];
  schema: z.ZodType<Props>;
  defaultProps: Props;
  render: ComponentType<{ props: Props; ctx: SectionRenderContext }>;
  /** The section paints a viewport-anchored overlay (`position: fixed`
   *  sticky bar, exit-intent modal). RenderPage must NOT wrap it in the
   *  `content-visibility: auto` lazy boundary or the scroll-reveal
   *  transform — both create a containing block that re-anchors `fixed`
   *  descendants to the section box (the bar then renders off-screen). */
  overlay?: boolean;
  /**
   * The section anchors itself to the top of the viewport (a sticky site
   * header). RenderSection must lift the sticky onto the SECTION WRAPPER
   * rather than leave it on the element inside.
   *
   * A sticky element only travels inside its parent's content box, and a
   * per-section wrapper is exactly the height of the section it wraps — so
   * `position: sticky` on the inner element has nowhere to go and scrolls
   * away as if it were static. Moving it to the wrapper lets it travel the
   * full height of the page container instead.
   *
   * A predicate rather than a flag: stickiness is a merchant setting, so
   * only an instance that actually asked for it should get the treatment.
   */
  stickyWrapper?: (props: Props) => boolean;
}

/** Convenience alias for the registry — props are erased to `unknown`. */
export type AnySectionDefinition = SectionDefinition<unknown>;
