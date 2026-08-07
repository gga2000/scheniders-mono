// =====================================================================
// Section — category_spotlight_pair
// =====================================================================
// Band with an eyebrow chip + big title, optionally flanked by two small
// decorative side images (hidden on mobile), then large photo link-cards
// (default 2) side by side. Each card is a rounded photo with a white
// pill label (label + chevron) overlaid bottom-centre; the whole card
// links to a category / collection page.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { Section } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { i18nStringOptional, i18nStringSchema } from "./_schema";
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

/** Four-point sparkle glyph — eyebrow chip fallback when no icon image. */
function SparkleGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2c.6 3.8 1.6 5.6 3.4 7 1.3 1 3 1.7 6.6 2.3v1.4c-3.6.6-5.3 1.3-6.6 2.3-1.8 1.4-2.8 3.2-3.4 7h-1.4c-.6-3.8-1.6-5.6-3.4-7-1.3-1-3-1.7-6.6-2.3v-1.4c3.6-.6 5.3-1.3 6.6-2.3 1.8-1.4 2.8-3.2 3.4-7H12Z" />
    </svg>
  );
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

const COLS: Record<number, string> = {
  1: "grid-cols-1 max-w-md",
  2: "grid-cols-1 sm:grid-cols-2 max-w-3xl",
  3: "grid-cols-1 sm:grid-cols-3 max-w-5xl",
  4: "grid-cols-2 lg:grid-cols-4 max-w-6xl",
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

  const cols = COLS[Math.min(props.items.length, 4)] ?? COLS[2];

  return (
    <Section>
      {/* Centred header: eyebrow chip + big title */}
      {(eyebrow || title) && (
        <div className="mb-bk-lg flex flex-col items-center gap-3 text-center">
          {eyebrow && (
            <span
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-label font-bold text-xs sm:text-sm"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--bk-accent, #ffd84a) 18%, var(--bk-surface, #ffffff))",
                color: "var(--bk-ink, #1a1a1a)",
                borderRadius: "var(--bk-radius-pill, 9999px)",
                fontFamily: "var(--bk-font-body, inherit)",
              }}
            >
              {props.eyebrow_icon_url ? (
                <Image
                  src={props.eyebrow_icon_url}
                  alt=""
                  width={16}
                  height={16}
                  unoptimized
                  sizes="16px"
                  className="h-4 w-4 object-contain"
                />
              ) : (
                <SparkleGlyph className="opacity-80" />
              )}
              {eyebrow}
            </span>
          )}
          {title && (
            <h2
              className="font-display font-black text-3xl sm:text-4xl tracking-tight"
              style={{
                color: "var(--bk-ink, #1a1a1a)",
                fontFamily: "var(--bk-font-display, inherit)",
              }}
            >
              {title}
            </h2>
          )}
        </div>
      )}

      {/* Card band, flanked by decorative side art on wide screens */}
      <div className="relative">
        {props.side_image_left_url && (
          <Image
            src={props.side_image_left_url}
            alt=""
            width={96}
            height={96}
            unoptimized
            sizes="96px"
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-1/2 hidden h-20 w-20 -translate-y-1/2 object-contain lg:block"
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
            className="pointer-events-none absolute right-0 top-1/2 hidden h-20 w-20 -translate-y-1/2 object-contain lg:block"
          />
        )}

        <div className={`mx-auto grid ${cols} gap-bk-sm sm:gap-bk-md`}>
          {props.items.map((item, i) => {
            const label = resolveI18n(item.label_i18n, locale);
            return (
              <StoreLink key={i} href={item.href} className="block group">
                <div
                  className="relative aspect-[4/3] overflow-hidden"
                  style={{
                    borderRadius: "var(--bk-radius-card, 1.25rem)",
                    boxShadow: "var(--bk-shadow-card, 0 8px 24px rgb(0 0 0 / 0.08))",
                  }}
                >
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={label}
                      fill
                      priority={i < 2}
                      unoptimized
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
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
                  {/* Soft bottom scrim keeps the pill legible on any photo. */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent" />
                  {label && (
                    <span
                      className="absolute bottom-4 left-1/2 inline-flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 px-5 py-2.5 font-semibold text-sm sm:text-base transition-transform group-hover:-translate-y-0.5"
                      style={{
                        backgroundColor: "var(--bk-surface, #ffffff)",
                        color: "var(--bk-ink, #1a1a1a)",
                        borderRadius: "var(--bk-radius-pill, 9999px)",
                        boxShadow:
                          "var(--bk-shadow-button, 0 2px 8px rgb(0 0 0 / 0.12))",
                        fontFamily: "var(--bk-font-body, inherit)",
                      }}
                    >
                      <span className="truncate">{label}</span>
                      <ChevronGlyph className="shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" />
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
