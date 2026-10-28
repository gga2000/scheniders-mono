// =====================================================================
// faq_contact_split — the opt-in `compact: true` presentation
// =====================================================================
// The product page's FAQ in the express buy box's visual language: one
// start-aligned display heading, one hairline-ruled list of closed native
// <details> rows (zero JS; answers stay in the DOM for find-in-page and
// crawlers; the shared `name` keeps one row open at a time), and the
// contact card folded into one tinted row ending in the WhatsApp pill.
// The section file resolves every string; this file only lays them out.
// Arabic flips the visual order with classes — the document stays LTR.
// =====================================================================

import { cn } from "@scheniders/shared";
import { MaterialIcon, Section, WhatsAppIcon } from "./helpers/primitives";
import { ActionPill, ActionRow } from "./helpers/action-row";

export interface CompactFaqRow {
  question: string;
  answer: string;
}

export interface CompactFaqContact {
  title: string;
  sub: string;
  ctaLabel: string;
  href: string;
}

export function FaqContactCompact({
  title,
  headingAs: Heading,
  groupName,
  rows,
  contact,
  rtl,
}: {
  title: string;
  headingAs: "h1" | "h2";
  groupName: string;
  rows: readonly CompactFaqRow[];
  /** Null when the store has no usable WhatsApp number or no CTA label. */
  contact: CompactFaqContact | null;
  rtl: boolean;
}) {
  const textSide = rtl ? "text-right" : "text-left";
  return (
    <Section density="dense">
      {title && (
        <Heading
          data-i18n-field="title_i18n"
          className={cn(
            "mb-bk-sm font-bk-display text-lg font-black text-bk-ink text-balance",
            textSide,
          )}
        >
          {title}
        </Heading>
      )}
      <div className="divide-y divide-bk-divider border-y border-bk-divider">
        {rows.map(({ question, answer }, i) => (
          <details key={`${i}-${question}`} name={groupName} className="group">
            <summary
              className={cn(
                "flex min-h-14 w-full cursor-pointer list-none items-center gap-3 py-4 text-bk-ink transition-opacity duration-bk-fast active:opacity-70 motion-reduce:transition-none [&::-webkit-details-marker]:hidden",
                rtl && "flex-row-reverse",
              )}
            >
              <span
                data-i18n-field={`items[${i}].q_i18n`}
                className={cn(
                  "flex-1 font-bk-display text-base font-bold leading-snug text-balance",
                  textSide,
                )}
              >
                {question}
              </span>
              <MaterialIcon
                name="expand_more"
                className="shrink-0 text-xl text-bk-ink transition-transform duration-bk-base ease-out group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <p
              data-i18n-field={`items[${i}].a_i18n`}
              dir="auto"
              className={cn(
                "whitespace-pre-line pb-5 font-bk-body text-[15px] leading-loose text-bk-ink-soft text-pretty",
                rtl ? "pl-8" : "pr-8",
                textSide,
              )}
            >
              {answer}
            </p>
          </details>
        ))}
      </div>
      {contact && (
        <ActionRow
          kind="whatsapp"
          rtl={rtl}
          action={
            <ActionPill
              href={contact.href}
              external
              rtl={rtl}
              icon={<WhatsAppIcon shadow={false} className="h-5 w-5 shrink-0 text-bk-success" />}
              label={contact.ctaLabel}
              labelField="contact.cta_label_i18n"
            />
          }
        >
          {contact.title && (
            <p
              data-i18n-field="contact.title_i18n"
              className="font-bk-body text-sm font-bold leading-snug text-bk-ink text-balance"
            >
              {contact.title}
            </p>
          )}
          {contact.sub && (
            <p
              data-i18n-field="contact.sub_i18n"
              className="font-bk-body text-xs leading-relaxed text-bk-ink-soft text-pretty"
            >
              {contact.sub}
            </p>
          )}
        </ActionRow>
      )}
    </Section>
  );
}
