// =====================================================================
// Section — brand_story
// =====================================================================
// Editorial-style brand origin story. Wider type column, an optional
// accent image, and an optional read-more link. Paragraphs are split on
// a double newline so the merchant can paste a multi-paragraph story
// straight into the editor.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import {
  BentoCard,
  ChunkyButton,
  MaterialIcon,
  ScribbleHeading,
  Section,
  Sticker,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { isOptimizableImageHost } from "./helpers/image";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  eyebrow_i18n: i18nStringOptional,
  title_i18n: i18nStringSchema,
  paragraphs_i18n: i18nStringSchema,
  accent_image_url: z.string().describe("image").optional(),
  link_label_i18n: i18nStringOptional,
  link_href: z.string().optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  eyebrow_i18n: { en: "Since 2024", ar: "منذ 2024" },
  title_i18n: {
    en: "A small studio with big ideas.",
    ar: "ستوديو صغير بأفكار كبيرة.",
  },
  paragraphs_i18n: {
    en:
      "Schneiders was born from a simple question: why does Iraq import its everyday essentials when we have the makers, the materials, and the taste at home?\n\nWe started in a one-room studio in Karrada, sketching ideas between cups of cardamom tea. Today, we ship across every governorate — same-day in Baghdad, 1–3 days everywhere else.\n\nEvery piece we make has to pass one test: would we wear it ourselves? If the answer's no, it doesn't ship.",
    ar:
      "وُلدت شنايدرز من سؤال بسيط: لماذا يستورد العراق أساسياته اليومية بينما لدينا الصنّاع والخامات والذوق؟\n\nبدأنا في ستوديو صغير في الكرّادة، نرسم أفكاراً بين أكواب الشاي بالهيل. واليوم نوصل لكل المحافظات — بنفس اليوم في بغداد و1-3 أيام في بقية المدن.\n\nكل قطعة نصنعها تخضع لاختبار واحد: هل سنرتديها نحن؟ إذا كان الجواب لا، فلا تُشحَن.",
  },
  accent_image_url: undefined,
  link_label_i18n: { en: "Read the full story", ar: "اقرأ القصة كاملةً" },
  link_href: "/about",
};

function BrandStory({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const eyebrow = resolveI18n(props.eyebrow_i18n, locale);
  const title = resolveI18n(props.title_i18n, locale);
  const paragraphsRaw = resolveI18n(props.paragraphs_i18n, locale);
  const linkLabel = resolveI18n(props.link_label_i18n, locale);
  const name = ctx.tenant.business_name;

  const paragraphs = paragraphsRaw
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <Section>
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-bk-md items-start">
        <div className="max-w-2xl">
          {eyebrow && (
            <div className="mb-bk-sm">
              <Sticker bg="mint" rotate={-2} size="sm">
                {eyebrow}
              </Sticker>
            </div>
          )}
          <ScribbleHeading color="butter" className="mb-bk-md">
            {title}
          </ScribbleHeading>
          <div className="space-y-bk-sm">
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className="font-body text-base sm:text-lg leading-relaxed text-bk-ink-soft"
              >
                {p}
              </p>
            ))}
          </div>
          {linkLabel && props.link_href && (
            <div className="mt-bk-md">
              <StoreLink href={props.link_href} aria-label={linkLabel}>
                <ChunkyButton bg="pink" size="md">
                  {linkLabel}
                </ChunkyButton>
              </StoreLink>
            </div>
          )}
        </div>
        <BentoCard
          bg="lilac"
          size="md"
          rotate={-1.5}
          className="relative overflow-hidden p-0 min-h-[280px]"
        >
          {props.accent_image_url ? (
            <Image
              src={props.accent_image_url}
              alt=""
              fill
              unoptimized={!isOptimizableImageHost(props.accent_image_url)}
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            /* No accent image: a designed editorial panel (brand mark +
               business name + eyebrow) instead of an empty gradient block. */
            <>
              <div className="absolute inset-0 bg-gradient-to-br from-bk-decor-b via-bk-decor-c/50 to-bk-secondary/50" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <span
                  className="flex h-14 w-14 items-center justify-center"
                  style={{
                    backgroundColor: "var(--bk-surface, #ffffff)",
                    color: "var(--bk-ink, #1a1a1a)",
                    border:
                      "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                    borderRadius: "var(--bk-radius-pill, 9999px)",
                    boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                  }}
                >
                  <MaterialIcon name="auto_awesome" className="text-2xl" />
                </span>
                <p
                  className="font-display font-black text-2xl uppercase leading-tight sm:text-3xl"
                  style={{ color: "var(--bk-ink, #1a1a1a)" }}
                >
                  {name}
                </p>
                {eyebrow && (
                  <span
                    className="font-label font-bold text-[11px] uppercase tracking-[0.25em]"
                    style={{ color: "var(--bk-ink-soft, rgba(26,26,26,0.7))" }}
                  >
                    {eyebrow}
                  </span>
                )}
              </div>
            </>
          )}
        </BentoCard>
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "brand_story",
  category: "story",
  name: { en: "Brand story", ar: "قصة العلامة" },
  description: {
    en: "Editorial-style brand origin story with paragraph body and optional accent image.",
    ar: "قصة علامة بأسلوب تحريري مع نص فقرات وصورة مساندة اختيارية.",
  },
  thumbnail: "/sections/brand_story.svg",
  valid_on: ["home", "about"],
  schema,
  defaultProps,
  render: BrandStory,
};

registerSection(definition);
export default definition;
