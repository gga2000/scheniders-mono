// =====================================================================
// Section — category_spotlight_pair
// =====================================================================
// Band with an eyebrow chip + big title, optionally flanked by two small
// decorative side images (hidden on mobile), then large photo link-cards
// (default 2) side by side. Each card is a rounded photo with a surface
// pill label (label + chevron) overlaid bottom-centre; the whole card
// links to a category / collection page.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  CenteredSectionHeader,
  Section,
} from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { cn, PRESSABLE } from "./helpers/utils";
import { i18nStringOptional, i18nStringSchema } from "./_schema";
import { isOptimizableImageHost } from "./helpers/image";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  eyebrow_i18n: i18nStringOptional,
  eyebrow_icon_url: z.string().optional().describe("image"),
  title_i18n: i18nStringOptional,
  /** Decorative art flanking the card band on wide screens. */
  side_image_left_url: z.string().optional().describe("image"),
  side_image_right_url: z.string().optional().describe("image"),
  items: z
    .array(
      z.object({
        image_url: z.string().describe("image"),
        label_i18n: i18nStringSchema,
        href: z.string(),
      }),
    )
    .min(1)
    .max(4),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  eyebrow_i18n: { en: "Categories", ar: "الفئات" },
  title_i18n: { en: "Shop by category", ar: "اختر حسب الفئة" },
  items: [
    {
      image_url: "",
      label_i18n: { en: "Curated picks", ar: "تشكيلة مختارة" },
      href: "/categories",
    },
    {
      image_url: "",
      label_i18n: { en: "Best sellers", ar: "الأكثر مبيعاً" },
      href: "/categories",
    },
  ],
};

/** Scrim ink at a given alpha, mixed from the brand token, never black. */
function scrimInk(alphaPercent: number): string {
  return `color-mix(in srgb, var(--bk-ink, #1a1a1a) ${alphaPercent}%, transparent)`;
}

function ChevronGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

// The page has one content measure (`max-w-6xl`, what trust_badge_row
// already uses); only the hero bleeds wider. A 2-up pair at `max-w-3xl`
// left the cards at 376px inside a 1512px viewport — small, and aligned
// to nothing above or below it.
// Width and column count are separate now: the decorative side art has
// to be positioned against the SAME box the cards occupy, so the band
// wrapper needs the measure on its own.
const COLS_WIDTH: Record<number, string> = {
  1: "max-w-xl",
  2: "max-w-6xl",
  3: "max-w-6xl",
  4: "max-w-6xl",
};

const COLS_GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
};

/**
 * Per-card width hint. The old blanket "33vw" was only accidentally
 * close for a 2-up grid and over-fetched everywhere else; these follow
 * the column count against the same `max-w-6xl` (1152px) measure.
 */
const CARD_SIZES: Record<number, string> = {
  1: "(max-width: 640px) 100vw, 576px",
  2: "(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 576px",
  3: "(max-width: 640px) 100vw, (max-width: 1200px) 33vw, 384px",
  4: "(max-width: 640px) 50vw, (max-width: 1200px) 25vw, 288px",
};

function CategorySpotlightPair({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const eyebrow = resolveI18n(props.eyebrow_i18n, locale);
  const title = resolveI18n(props.title_i18n, locale);

  if (!props.items.length) return null;

  const count = Math.min(props.items.length, 4);
  const cardSizes = CARD_SIZES[count] ?? CARD_SIZES[2];

  return (
    <Section>
      {(eyebrow || title) && (
        <CenteredSectionHeader
          eyebrow={
            eyebrow ? (
              <>
                {props.eyebrow_icon_url && (
                  <Image
                    src={props.eyebrow_icon_url}
                    alt=""
                    width={16}
                    height={16}
                    unoptimized
                    sizes="16px"
                    className="h-4 w-4 object-contain"
                  />
                )}
                {eyebrow}
              </>
            ) : undefined
          }
          glyph={props.eyebrow_icon_url ? "none" : "sparkle"}
          title={title}
          eyebrowField="eyebrow_i18n"
          titleField="title_i18n"
        />
      )}

      {/* Card band, flanked by decorative side art on wide screens.
          The wrapper carries the SAME max-width as the grid so the art
          hugs the cards — pinned to the bare `relative` parent it sat at
          the viewport edges, 356px adrift of what it was flanking. */}
      <div className={cn("relative mx-auto", COLS_WIDTH[count] ?? COLS_WIDTH[2])}>
        {props.side_image_left_url && (
          <Image
            src={props.side_image_left_url}
            alt=""
            width={96}
            height={96}
            unoptimized
            sizes="96px"
            aria-hidden="true"
            className="pointer-events-none absolute -left-28 top-1/2 hidden h-20 w-20 -translate-y-1/2 object-contain xl:block"
          />
        )}
        {props.side_image_right_url && (
          <Image
            src={props.side_image_right_url}
            alt=""
            width={96}
            height={96}
            unoptimized
            sizes="96px"
            aria-hidden="true"
            className="pointer-events-none absolute -right-28 top-1/2 hidden h-20 w-20 -translate-y-1/2 object-contain xl:block"
          />
        )}

        <div className={cn("grid gap-bk-sm sm:gap-bk-md", COLS_GRID[count] ?? COLS_GRID[2])}>
          {props.items.map((item, i) => {
            const label = resolveI18n(item.label_i18n, locale);
            return (
              <StoreLink
                key={i}
                href={item.href}
                className={cn("group block", PRESSABLE)}
              >
                <div
                  className="relative aspect-[4/3] overflow-hidden"
                  style={{
                    borderRadius: "var(--bk-radius-card, 1.25rem)",
                    boxShadow:
                      "var(--bk-shadow-card, 0 8px 24px rgb(0 0 0 / 0.08))",
                  }}
                >
                  {item.image_url ? (
                    // Never `priority`: the hero owns the LCP preload budget;
                    // these cards sit below it on every page they appear on.
                    <Image
                      src={item.image_url}
                      alt={label}
                      fill
                      unoptimized={!isOptimizableImageHost(item.image_url)}
                      sizes={cardSizes}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 motion-reduce:transition-none group-hover:scale-105"
                    />
                  ) : (
                    /* No image yet: tinted placeholder so the card still
                       reads as a designed surface in the editor. */
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(135deg, color-mix(in srgb, var(--bk-accent, #ffd84a) 30%, var(--bk-surface, #ffffff)), color-mix(in srgb, var(--bk-primary, #ff5a8a) 18%, var(--bk-surface, #ffffff)))",
                      }}
                    />
                  )}
                  {/* Bottom scrim keeps the pill legible on any photo, in
                      brand ink rather than a literal black so a warm-ink
                      store gets warm shade. Taller and stronger than the
                      old wash: the pill now sits in the corner, where a
                      third of the frame at 25% left it floating. */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
                    style={{
                      background: `linear-gradient(to top, ${scrimInk(55)}, ${scrimInk(
                        18,
                      )} 45%, transparent)`,
                    }}
                  />
                  {label && (
                    <span
                      // Anchored to the card's bottom-start corner, not
                      // floated at centre. Centre put the label over the
                      // subject — on the best-sellers card it covered the
                      // bottles it was selling — and gave it no edge to
                      // line up with. Both cards now place it identically.
                      className="absolute bottom-4 start-4 inline-flex max-w-[calc(100%-2rem)] items-center gap-2 px-5 py-2.5 font-semibold text-sm sm:text-base transition-transform duration-150 motion-reduce:transition-none group-hover:-translate-y-0.5"
                      style={{
                        backgroundColor: "var(--bk-surface, #ffffff)",
                        color: "var(--bk-ink, #1a1a1a)",
                        borderRadius: "var(--bk-radius-pill, 9999px)",
                        boxShadow:
                          "var(--bk-shadow-button, 0 2px 8px rgb(0 0 0 / 0.12))",
                        fontFamily: "var(--bk-font-body, inherit)",
                      }}
                    >
                      <span className="truncate" data-i18n-field="label_i18n">
                        {label}
                      </span>
                      <ChevronGlyph className="shrink-0 opacity-70 transition-transform duration-150 motion-reduce:transition-none group-hover:translate-x-0.5" />
                    </span>
                  )}
                </div>
              </StoreLink>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "category_spotlight_pair",
  category: "content",
  name: { en: "Category spotlight pair", ar: "فئات مميزة (زوج)" },
  description: {
    en: "Eyebrow chip + title over large photo cards linking to categories, with a pill label on each photo.",
    ar: "شريحة تمهيدية وعنوان فوق بطاقات صور كبيرة تفتح الفئات، مع تسمية بارزة على كل صورة.",
  },
  thumbnail: "/sections/category_spotlight_pair.svg",
  valid_on: ["home", "category"],
  schema,
  defaultProps,
  render: CategorySpotlightPair,
};

registerSection(definition);
export default definition;
