// =====================================================================
// Section — collection_trio
// =====================================================================
// Warm tinted band (accent at 12% over the surface, large radius) with
// an eyebrow chip + title, then surface cards (default 3): photo on top
// (rounded), centred bold title, one-line sub, and a small primary pill
// CTA with a sparkle glyph. Each card links to a collection / category.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  CenteredSectionHeader,
  PRESSABLE,
  Section,
} from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { cn } from "./helpers/utils";
import { i18nStringOptional, i18nStringSchema } from "./_schema";
import { isOptimizableImageHost } from "./helpers/image";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  eyebrow_i18n: i18nStringOptional,
  eyebrow_icon_url: z.string().optional().describe("image"),
  title_i18n: i18nStringOptional,
  items: z
    .array(
      z.object({
        image_url: z.string().describe("image"),
        title_i18n: i18nStringSchema,
        sub_i18n: i18nStringOptional,
        cta_label_i18n: i18nStringOptional,
        href: z.string(),
      }),
    )
    .min(1)
    .max(4),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  eyebrow_i18n: { en: "Our picks", ar: "مختاراتنا" },
  title_i18n: { en: "Collections we love", ar: "تشكيلات على ذوقنا" },
  items: [
    {
      image_url: "",
      title_i18n: { en: "Everyday", ar: "للاستخدام اليومي" },
      sub_i18n: {
        en: "Easy choices for every day",
        ar: "خيارات مريحة لكل يوم",
      },
      cta_label_i18n: { en: "Browse", ar: "شوفهم" },
      href: "/categories",
    },
    {
      image_url: "",
      title_i18n: { en: "Going out", ar: "للطلعات" },
      sub_i18n: { en: "Stand out when it matters", ar: "تميّز بكل طلعة" },
      cta_label_i18n: { en: "Browse", ar: "شوفهم" },
      href: "/categories",
    },
    {
      image_url: "",
      title_i18n: { en: "Occasions", ar: "للمناسبات" },
      sub_i18n: { en: "For the special moments", ar: "للمناسبات الخاصة" },
      cta_label_i18n: { en: "Browse", ar: "شوفهم" },
      href: "/categories",
    },
  ],
};

/** Four-point sparkle glyph for the card CTAs (the header chip uses the
 *  shared `EyebrowChip` glyph). */
function SparkleGlyph({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2c.6 3.8 1.6 5.6 3.4 7 1.3 1 3 1.7 6.6 2.3v1.4c-3.6.6-5.3 1.3-6.6 2.3-1.8 1.4-2.8 3.2-3.4 7h-1.4c-.6-3.8-1.6-5.6-3.4-7-1.3-1-3-1.7-6.6-2.3v-1.4c3.6-.6 5.3-1.3 6.6-2.3 1.8-1.4 2.8-3.2 3.4-7H12Z" />
    </svg>
  );
}

const COLS: Record<number, string> = {
  1: "grid-cols-1 max-w-sm",
  2: "grid-cols-1 sm:grid-cols-2 max-w-2xl",
  3: "grid-cols-1 sm:grid-cols-3 max-w-5xl",
  4: "grid-cols-2 lg:grid-cols-4 max-w-6xl",
};

function CollectionTrio({
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

  const cols = COLS[Math.min(props.items.length, 4)] ?? COLS[3];

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

      {/* Tinted band — accent at 12% over the surface, big rounded corners */}
      <div
        className="px-4 py-bk-lg sm:px-8"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--bk-accent, #ffd84a) 12%, transparent)",
          borderRadius: "calc(var(--bk-radius-card, 1.25rem) * 1.5)",
        }}
      >
        <div className={`mx-auto grid ${cols} gap-bk-sm sm:gap-bk-md`}>
          {props.items.map((item, i) => {
            const cardTitle = resolveI18n(item.title_i18n, locale);
            const sub = resolveI18n(item.sub_i18n, locale);
            const ctaLabel = resolveI18n(item.cta_label_i18n, locale);
            return (
              <StoreLink
                key={i}
                href={item.href}
                className={cn("group block", PRESSABLE)}
              >
                <div
                  className="flex h-full flex-col overflow-hidden p-3 text-center transition-transform duration-150 motion-reduce:transition-none group-hover:-translate-y-1"
                  style={{
                    backgroundColor: "var(--bk-surface, #ffffff)",
                    borderRadius: "var(--bk-radius-card, 1.25rem)",
                    boxShadow:
                      "var(--bk-shadow-card, 0 8px 24px rgb(0 0 0 / 0.08))",
                  }}
                >
                  <div
                    className="relative aspect-[4/3] overflow-hidden"
                    style={{
                      borderRadius:
                        "calc(var(--bk-radius-card, 1.25rem) * 0.75)",
                    }}
                  >
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt={cardTitle}
                        fill
                        unoptimized={!isOptimizableImageHost(item.image_url)}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 motion-reduce:transition-none group-hover:scale-105"
                      />
                    ) : (
                      /* No image yet: tinted placeholder keeps the card a
                         designed surface in the editor. */
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(135deg, color-mix(in srgb, var(--bk-accent, #ffd84a) 35%, var(--bk-surface, #ffffff)), color-mix(in srgb, var(--bk-primary, #ff5a8a) 20%, var(--bk-surface, #ffffff)))",
                        }}
                      />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col items-center gap-1.5 px-2 pb-3 pt-4">
                    {cardTitle && (
                      <h3
                        className="font-display font-bold text-bk-h3 text-balance"
                        style={{
                          color: "var(--bk-ink, #1a1a1a)",
                          fontFamily: "var(--bk-font-display, inherit)",
                        }}
                      >
                        <span data-i18n-field="title_i18n">{cardTitle}</span>
                      </h3>
                    )}
                    {sub && (
                      <p
                        data-i18n-field="sub_i18n"
                        className="font-body text-sm leading-snug line-clamp-1"
                        style={{
                          color: "var(--bk-ink-soft, rgb(26 26 26 / 0.6))",
                          fontFamily: "var(--bk-font-body, inherit)",
                        }}
                      >
                        {sub}
                      </p>
                    )}
                    {ctaLabel && (
                      <span
                        className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 font-semibold text-sm transition-transform duration-150 motion-reduce:transition-none group-hover:scale-105"
                        style={{
                          backgroundColor: "var(--bk-primary, #ff5a8a)",
                          color: "var(--bk-on-primary, #ffffff)",
                          borderRadius: "var(--bk-radius-pill, 9999px)",
                          boxShadow:
                            "var(--bk-shadow-button, 0 2px 8px rgb(0 0 0 / 0.12))",
                          fontFamily: "var(--bk-font-body, inherit)",
                        }}
                      >
                        <SparkleGlyph size={12} className="opacity-80" />
                        <span data-i18n-field="cta_label_i18n">{ctaLabel}</span>
                      </span>
                    )}
                  </div>
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
  type: "collection_trio",
  category: "content",
  name: { en: "Collection trio", ar: "ثلاثية التشكيلات" },
  description: {
    en: "Tinted band of collection cards: photo, title, one-line sub, and a small pill CTA.",
    ar: "شريط ملوّن ببطاقات تشكيلات: صورة وعنوان وسطر وصف وزر صغير.",
  },
  thumbnail: "/sections/collection_trio.svg",
  valid_on: ["home", "category"],
  schema,
  defaultProps,
  render: CollectionTrio,
};

registerSection(definition);
export default definition;
