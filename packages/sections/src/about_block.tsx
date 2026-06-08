// =====================================================================
// Section — about_block
// =====================================================================
// Two-column About block: heading + body text on one side, optional
// supporting image on the other. The legacy v1 migration emits this
// section type by default, so keeping `about_block` registered restores
// those instances after the v2 cutover.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ScribbleHeading,
  Section,
  Sticker,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  eyebrow_i18n: i18nStringOptional,
  title_i18n: i18nStringSchema,
  body_i18n: i18nStringSchema,
  image_url: z.string().describe("image").optional(),
  image_position: z.enum(["left", "right"]),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  eyebrow_i18n: { en: "Our story", ar: "قصّتنا" },
  title_i18n: { en: "Schneiders, started in Baghdad.", ar: "شنايدرز، انطلقت من بغداد." },
  body_i18n: {
    en: "We build everyday essentials for Iraq — designed locally, made to last, delivered fast.",
    ar: "نصنع أساسيات يومية تليق بإيقاع العراق — تصميم محلي، جودة ثابتة، توصيل سريع.",
  },
  image_url: undefined,
  image_position: "right",
};

function AboutBlock({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const eyebrow = resolveI18n(props.eyebrow_i18n, locale);
  const title = resolveI18n(props.title_i18n, locale);
  const body = resolveI18n(props.body_i18n, locale);

  const reverse = props.image_position === "left";

  return (
    <Section>
      <div
        className={
          "grid grid-cols-1 sm:grid-cols-2 gap-bk-sm sm:gap-bk-md items-stretch " +
          (reverse ? "sm:[&>*:first-child]:order-2" : "")
        }
      >
        <BentoCard bg="cream" size="md" className="p-6 sm:p-8">
          {eyebrow && (
            <div className="mb-bk-xs">
              <Sticker bg="butter" rotate={-3} size="sm">
                {eyebrow}
              </Sticker>
            </div>
          )}
          <div data-i18n-field="title_i18n">
            <ScribbleHeading color="pink" className="mb-bk-sm">
              {title}
            </ScribbleHeading>
          </div>
          <p
            data-i18n-field="body_i18n"
            className="font-body text-base sm:text-lg leading-relaxed text-bk-ink-soft whitespace-pre-line"
          >
            {body}
          </p>
        </BentoCard>
        <BentoCard bg="white" size="md" className="relative overflow-hidden p-0 min-h-[240px]">
          {props.image_url ? (
            <Image
              src={props.image_url}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 640px) 100vw, 50vw"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-candy-mint/40 via-candy-sky/30 to-candy-lilac/40" />
          )}
        </BentoCard>
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "about_block",
  category: "story",
  name: { en: "About block", ar: "بطاقة تعريف" },
  description: {
    en: "Two-column About: heading + body text with a supporting image.",
    ar: "بطاقة تعريف بعمودين: عنوان ونص مع صورة مساندة.",
  },
  thumbnail: "/sections/about_block.svg",
  valid_on: ["home", "about"],
  schema,
  defaultProps,
  render: AboutBlock,
};

registerSection(definition);
export default definition;
