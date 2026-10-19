// =====================================================================
// Section — founder_note
// =====================================================================
// Pull-quote with the founder's photo, name, role, and an optional
// signature image. Used on About pages to put a face to the brand.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  Section,
  Sticker,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  quote_i18n: i18nStringSchema,
  founder_name_i18n: i18nStringSchema,
  founder_role_i18n: i18nStringOptional,
  photo_url: z.string().describe("image").optional(),
  signature_image_url: z.string().describe("image").optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  quote_i18n: {
    en: "Every piece we ship is something I'd wear myself — that's the only rule.",
    ar: "كل قطعة نشحنها هي قطعة أرتديها أنا — تلك هي القاعدة الوحيدة.",
  },
  founder_name_i18n: { en: "Yara Al-Shammari", ar: "يارا الشمري" },
  founder_role_i18n: { en: "Founder & Creative Director", ar: "المؤسِّسة والمديرة الإبداعية" },
  photo_url: undefined,
  signature_image_url: undefined,
};

function FounderNote({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const quote = resolveI18n(props.quote_i18n, locale);
  const name = resolveI18n(props.founder_name_i18n, locale);
  const role = resolveI18n(props.founder_role_i18n, locale);

  if (!quote) return null;

  return (
    <Section>
      <BentoCard bg="cream" size="lg" className="p-0 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] items-stretch">
          <div
            className="relative min-h-[240px] sm:min-h-[320px] border-b-[3px] sm:border-b-0 sm:border-r-[3px] border-bk-ink"
            style={{ backgroundColor: "var(--bk-surface,#fff7ed)" }}
          >
            {props.photo_url ? (
              <Image
                src={props.photo_url}
                alt={name}
                fill
                unoptimized
                sizes="(max-width: 640px) 100vw, 33vw"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-bk-primary/40 via-bk-accent/40 to-bk-secondary/40" />
            )}
            <div className="absolute top-3 left-3">
              <Sticker bg="pink" rotate={-5} size="sm">
                {locale !== "en" ? "كلمة المؤسِّس" : "Founder note"}
              </Sticker>
            </div>
          </div>
          <div className="p-6 sm:p-10 flex flex-col justify-center">
            <span
              className="font-display font-black text-7xl leading-none text-bk-primary/40 select-none"
              aria-hidden="true"
            >
              &ldquo;
            </span>
            <blockquote className="font-display font-black text-2xl sm:text-3xl uppercase leading-tight tracking-tight text-bk-ink -mt-4">
              {quote}
            </blockquote>
            <div className="mt-bk-md flex items-center gap-bk-sm">
              <div>
                <div className="font-display font-black text-base uppercase text-bk-ink">
                  {name}
                </div>
                {role && (
                  <div className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft mt-bk-2xs">
                    {role}
                  </div>
                )}
              </div>
              {props.signature_image_url && (
                <Image
                  src={props.signature_image_url}
                  alt={`${name} signature`}
                  width={120}
                  height={40}
                  unoptimized
                  className="h-10 w-auto"
                />
              )}
            </div>
          </div>
        </div>
      </BentoCard>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "founder_note",
  category: "story",
  name: { en: "Founder note", ar: "كلمة المؤسِّس" },
  description: {
    en: "Pull-quote with founder photo, name, role, and optional signature.",
    ar: "اقتباس مع صورة المؤسس واسمه ودوره وتوقيع اختياري.",
  },
  thumbnail: "/sections/founder_note.svg",
  valid_on: ["about", "home"],
  schema,
  defaultProps,
  render: FounderNote,
};

registerSection(definition);
export default definition;
