// =====================================================================
// faq_contact_split — the product FAQ and the one contact row (spec §1.7)
// =====================================================================
// Concept g4 A: only questions about THIS product, each answered from the
// product's own data (a text/enum attribute, `size_ml`) or a merchant
// text, and each answer ending in «اطلبه وجرّبه», a jump back to the
// order form. The list renders only when at least `min_answered` (default
// 2) questions resolve to an answer — one lonely question reads as an
// empty FAQ. Under it, one contact row: «اتصل بينا» (tel: the store's
// confirmation number) and «راسلنا واتساب» (prefilled «عندي سؤال عن
// {product}»), two equal 52px buttons; a channel the store has not set
// is not drawn, and with neither the row is gone. Server-only: native
// <details> (the first one open), no client JS. Arabic flips the visual
// order with classes, never `dir`.
// =====================================================================

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode, ResolvedProductAttribute } from "@scheniders/shared";
import { ChapterHeading } from "./helpers/chapter-heading";
import { ActionPill, ActionRow } from "./helpers/action-row";
import { MaterialIcon, Section, WhatsAppIcon } from "./helpers/primitives";
import { readsRtl } from "./helpers/reading";
import { cn } from "./helpers/utils";
import type { Product } from "./types";
import type { Props } from "./faq_contact_split";
import { fs } from "./faq_contact_split.strings";

/** The express order form's anchor. It must equal
 *  `DIRECT_ORDER_FORM_ID` (pdp_direct_order.client.tsx), which this
 *  server file cannot import from a "use client" module; a test pins the
 *  pair. */
export const ORDER_FORM_HREF = "#direct-order";

export const DEFAULT_MIN_ANSWERED = 2;

export type ProductFaqConfig = NonNullable<Props["product_faq"]>;
type ProductFaqAnswer = ProductFaqConfig["items"][number]["answer"];

export interface ProductFaqRow {
  question: string;
  answer: string;
}

/** The value in the template's `{value}` slot; no template → the value. */
function fill(template: string, value: string): string {
  return template ? template.split("{value}").join(value) : value;
}

function attributeText(attr: ResolvedProductAttribute, locale: LocaleCode): string {
  if (attr.kind === "text") return resolveI18n(attr.value, locale).trim();
  if (attr.kind === "enum") return (resolveI18n(attr.option.label_i18n, locale) || attr.value).trim();
  return "";
}

function answerOf(answer: ProductFaqAnswer, product: Product | undefined, locale: LocaleCode): string {
  if (answer.kind === "text") return resolveI18n(answer.a_i18n, locale).trim();
  if (answer.kind === "attribute") {
    const attr = product?.attributes?.find((a) => a.def.key === answer.key);
    const value = attr ? attributeText(attr, locale) : "";
    return value ? fill(resolveI18n(answer.template_i18n, locale), value) : "";
  }
  const ml = product?.size_ml;
  if (!ml || ml <= 0) return "";
  return fill(resolveI18n(answer.template_i18n, locale) || fs("sizeAnswer", locale), String(ml));
}

/** The questions that resolve to an answer for this product, in order —
 *  or none when fewer than `min_answered` do. */
export function resolveProductFaq(
  config: ProductFaqConfig,
  product: Product | undefined,
  locale: LocaleCode,
): ProductFaqRow[] {
  const rows = config.items.flatMap((item) => {
    const question = resolveI18n(item.q_i18n, locale).trim();
    const answer = answerOf(item.answer, product, locale);
    return question && answer ? [{ question, answer }] : [];
  });
  return rows.length >= (config.min_answered ?? DEFAULT_MIN_ANSWERED) ? rows : [];
}

export interface ContactRowData {
  title: string;
  sub: string;
  callHref: string | null;
  whatsappHref: string | null;
}

/** The one contact row: title, sub line, call + WhatsApp. */
export function ContactRow({ data, locale }: { data: ContactRowData; locale: LocaleCode }) {
  const rtl = readsRtl(locale);
  const button = cn(
    "inline-flex min-h-[3.25rem] flex-1 basis-0 items-center justify-center gap-1.5 rounded-bk-pill border-bk border-bk-ink bg-bk-surface px-3 font-bk-display text-sm font-black text-bk-ink transition-opacity duration-bk-fast active:opacity-70 motion-reduce:transition-none",
    rtl && "flex-row-reverse",
  );
  return (
    <div data-contact-row="" className="mt-bk-sm rounded-bk-card bg-bk-surface-alt px-4 py-3">
      {(data.title || data.sub) && (
        <div className={rtl ? "text-right" : "text-left"}>
          {data.title && (
            <p
              data-i18n-field="contact.title_i18n"
              className="font-bk-body text-base font-bold leading-snug text-bk-ink text-balance"
            >
              {data.title}
            </p>
          )}
          {data.sub && (
            <p
              data-i18n-field="contact.sub_i18n"
              className="mt-0.5 font-bk-body text-xs leading-relaxed text-bk-ink-soft text-pretty"
            >
              {data.sub}
            </p>
          )}
        </div>
      )}
      <div className={cn("mt-bk-sm flex gap-bk-xs", rtl && "flex-row-reverse")}>
        {data.callHref && (
          <a href={data.callHref} data-contact="call" className={button}>
            <MaterialIcon name="call" className="text-lg" />
            <span>{fs("call", locale)}</span>
          </a>
        )}
        {data.whatsappHref && (
          <a
            href={data.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            data-contact="whatsapp"
            className={button}
          >
            <WhatsAppIcon shadow={false} className="h-5 w-5 shrink-0 text-bk-success" />
            <span>{fs("whatsapp", locale)}</span>
          </a>
        )}
      </div>
    </div>
  );
}

export function FaqProductView({
  title,
  chapter,
  groupName,
  rows,
  locale,
  contactRow,
  whatsappCard,
}: {
  title: string;
  chapter: boolean;
  groupName: string;
  rows: readonly ProductFaqRow[];
  locale: LocaleCode;
  /** `contact_style: "row"` with at least one channel. */
  contactRow: ContactRowData | null;
  /** Otherwise: today's compact WhatsApp row, when the store has a number. */
  whatsappCard: { title: string; sub: string; ctaLabel: string; href: string } | null;
}) {
  const rtl = readsRtl(locale);
  const textSide = rtl ? "text-right" : "text-left";
  if (rows.length === 0 && !contactRow && !whatsappCard) return null;
  return (
    <Section density="dense" data-faq-product="">
      {rows.length > 0 && (
        <>
          {title &&
            (chapter ? (
              <ChapterHeading title={title} locale={locale} titleField="product_faq.title_i18n" />
            ) : (
              <h2
                data-i18n-field="product_faq.title_i18n"
                className={cn("mb-bk-sm font-bk-display text-lg font-black text-bk-ink text-balance", textSide)}
              >
                {title}
              </h2>
            ))}
          <div className="divide-y divide-bk-divider border-y border-bk-divider">
            {rows.map(({ question, answer }, i) => (
              <details key={`${i}-${question}`} name={groupName} open={i === 0} data-faq-item="" className="group">
                <summary
                  className={cn(
                    "flex min-h-14 w-full cursor-pointer list-none items-center gap-3 py-4 text-bk-ink transition-opacity duration-bk-fast active:opacity-70 motion-reduce:transition-none [&::-webkit-details-marker]:hidden",
                    rtl && "flex-row-reverse",
                  )}
                >
                  <span className={cn("flex-1 font-bk-display text-base font-bold leading-snug text-balance", textSide)}>
                    {question}
                  </span>
                  <MaterialIcon
                    name="expand_more"
                    className="shrink-0 text-xl text-bk-ink transition-transform duration-bk-base ease-out group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <div className={cn("pb-4", textSide)}>
                  <p className="whitespace-pre-line font-bk-body text-[15px] leading-loose text-bk-ink-soft text-pretty">
                    {answer}
                  </p>
                  <a
                    href={ORDER_FORM_HREF}
                    data-faq-order=""
                    className={cn(
                      "mt-1 inline-flex min-h-11 items-center gap-1 font-bk-body text-sm font-black text-bk-ink underline underline-offset-4",
                      rtl && "flex-row-reverse",
                    )}
                  >
                    <span>{fs("orderAndTry", locale)}</span>
                    <MaterialIcon name="arrow_upward" className="text-base" />
                  </a>
                </div>
              </details>
            ))}
          </div>
        </>
      )}
      {contactRow ? (
        <ContactRow data={contactRow} locale={locale} />
      ) : (
        whatsappCard && (
          <ActionRow
            kind="whatsapp"
            rtl={rtl}
            action={
              <ActionPill
                href={whatsappCard.href}
                external
                rtl={rtl}
                icon={<WhatsAppIcon shadow={false} className="h-5 w-5 shrink-0 text-bk-success" />}
                label={whatsappCard.ctaLabel}
                labelField="contact.cta_label_i18n"
              />
            }
          >
            {whatsappCard.title && (
              <p
                data-i18n-field="contact.title_i18n"
                className="font-bk-body text-sm font-bold leading-snug text-bk-ink text-balance"
              >
                {whatsappCard.title}
              </p>
            )}
            {whatsappCard.sub && (
              <p
                data-i18n-field="contact.sub_i18n"
                className="font-bk-body text-xs leading-relaxed text-bk-ink-soft text-pretty"
              >
                {whatsappCard.sub}
              </p>
            )}
          </ActionRow>
        )
      )}
    </Section>
  );
}
