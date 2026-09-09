// =====================================================================
// Section — testimonials_carousel
// =====================================================================
// Horizontal-scroll row of testimonial cards. Each card carries an
// avatar, name, optional city, star rating, quote, and a "verified"
// badge. Scroll snaps on mobile; flex row on desktop.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  Section,
  SectionHeader,
  Sticker,
} from "./helpers/primitives";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  items: z.array(
    z.object({
      author_name: z.string(),
      author_city: z.string().optional(),
      avatar_url: z.string().describe("image").optional(),
      rating: z.number().int().min(1).max(5),
      quote_i18n: i18nStringSchema,
      verified: z.boolean(),
    }),
  ),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "What customers say", ar: "ماذا يقول الزبائن" },
  items: [
    {
      author_name: "Hadeel M.",
      author_city: "Baghdad",
      avatar_url: undefined,
      rating: 5,
      quote_i18n: {
        en: "Same-day delivery, exactly as described. I'm reordering today.",
        ar: "وصلني بنفس اليوم وبنفس الوصف. سأطلب مرة ثانية اليوم.",
      },
      verified: true,
    },
    {
      author_name: "Ahmed K.",
      author_city: "Basra",
      avatar_url: undefined,
      rating: 5,
      quote_i18n: {
        en: "Quality is way beyond the price. The fabric is unreal.",
        ar: "الجودة أكبر بكثير من السعر. الخامة خرافية.",
      },
      verified: true,
    },
    {
      author_name: "Sara A.",
      author_city: "Erbil",
      avatar_url: undefined,
      rating: 4,
      quote_i18n: {
        en: "Cash on delivery worked great. Will buy again.",
        ar: "الدفع عند الاستلام راحة كاملة. أعيدُها بالتأكيد.",
      },
      verified: true,
    },
  ],
};

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={
            i < rating ? "text-bk-primary" : "text-bk-ink-faint"
          }
          aria-hidden="true"
        >
          ★
        </span>
      ))}
    </div>
  );
}

function TestimonialsCarousel({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);

  if (!props.items.length) return null;

  return (
    <Section>
      {heading && <SectionHeader title={heading} color="mint" />}
      <div className="flex gap-bk-md overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-3 lg:overflow-visible">
        {props.items.map((item, i) => {
          const quote = resolveI18n(item.quote_i18n, locale);
          return (
            <BentoCard
              key={`${i}-${item.author_name}`}
              bg="white"
              size="sm"
              rotate={i % 2 === 0 ? -0.5 : 0.5}
              className="p-5 min-w-[80%] sm:min-w-[340px] lg:min-w-0 snap-start flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <Stars rating={item.rating} />
                {item.verified && (
                  <Sticker bg="mint" rotate={4} size="xs">
                    {locale === "ar" ? "موثَّق" : "Verified"}
                  </Sticker>
                )}
              </div>
              <p className="font-body text-sm sm:text-base leading-relaxed text-bk-ink-soft flex-1 line-clamp-4">
                &ldquo;{quote}&rdquo;
              </p>
              <div className="flex items-center gap-3 pt-2 border-t-[3px] border-dashed border-bk-divider">
                {item.avatar_url ? (
                  <Image
                    src={item.avatar_url}
                    alt={item.author_name}
                    width={48}
                    height={48}
                    unoptimized
                    className="w-12 h-12 rounded-full border-bk border-bk-ink object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full border-bk border-bk-ink bg-bk-accent flex items-center justify-center font-display font-black text-lg">
                    {item.author_name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="font-display font-black text-sm uppercase text-bk-ink">
                    {item.author_name}
                  </div>
                  {item.author_city && (
                    <div className="font-label font-bold text-[11px] uppercase tracking-[0.2em] text-bk-ink-soft">
                      {item.author_city}
                    </div>
                  )}
                </div>
              </div>
            </BentoCard>
          );
        })}
      </div>
      {props.items.length > 1 && (
        <div
          className="mt-bk-sm flex justify-center gap-2 lg:hidden"
          aria-hidden="true"
        >
          {props.items.map((_, i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-bk-ink/25"
              style={{ backgroundColor: "var(--bk-ink-faint, rgb(26 26 26 / 0.25))" }}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "testimonials_carousel",
  category: "content",
  name: { en: "Testimonials carousel", ar: "شريط آراء الزبائن" },
  description: {
    en: "Horizontal-scroll row of customer testimonial cards with ratings.",
    ar: "شريط أفقي من بطاقات آراء الزبائن مع التقييم.",
  },
  thumbnail: "/sections/testimonials_carousel.svg",
  valid_on: ["home", "product", "about"],
  schema,
  defaultProps,
  render: TestimonialsCarousel,
};

registerSection(definition);
export default definition;
