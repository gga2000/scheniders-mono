// =====================================================================
// Section — policy_content
// =====================================================================
// Long-form policy / legal content block. Renders a tiny subset of
// markdown — paragraphs, headings (## ), unordered lists (- ), inline
// bold (**…**) and inline links ([text](url)). No external markdown
// library — keeps the dependency surface tight and the output
// deterministic. The section owns the page's h1: policy pages render
// nothing else above it.
// =====================================================================

import { Fragment } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { CenteredSectionHeader, Section } from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  body_md_i18n: i18nStringSchema,
  last_updated_label_i18n: i18nStringOptional,
  /** Small chip above the h1 ("Policies"). */
  eyebrow_i18n: i18nStringOptional,
  /** ISO date (YYYY-MM-DD). The "last updated" line only renders when set —
   *  a label with no date was printing "آخر تحديث" and nothing else. */
  last_updated: z.string().optional().describe("date"),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Our policy", ar: "سياستنا" },
  eyebrow_i18n: { en: "Policies", ar: "السياسات" },
  body_md_i18n: {
    en: "## Overview\n\nWe deliver across Iraq with cash on delivery and a free inspection on arrival.\n\n## What's included\n\n- Free inspection on delivery\n- Same-day Baghdad shipping\n- **14-day returns** on unopened items\n- Cash on delivery across every governorate\n\n## How to contact us\n\nReach out on WhatsApp or via the contact page — we reply within one business day.",
    ar: "## نظرة عامة\n\nنوصّل في كل العراق بنظام الدفع عند الاستلام مع فحص مجاني عند الوصول.\n\n## ماذا يشمل ذلك\n\n- فحص مجاني عند التسليم\n- شحن بنفس اليوم داخل بغداد\n- **إرجاع خلال 14 يوماً** للمنتجات غير المفتوحة\n- الدفع عند الاستلام في كل المحافظات\n\n## كيف تتواصل معنا\n\nنحن متواجدون عبر واتساب أو صفحة التواصل — نردّ خلال يوم عمل واحد.",
  },
  last_updated_label_i18n: { en: "Last updated", ar: "آخر تحديث" },
};

/** Only these link targets render as anchors — a merchant-authored
 *  `[x](javascript:…)` must never become a live link. */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

const INLINE_TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
const LINK_TOKEN = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

/** Render a paragraph string: `**bold**` → <strong>, `[text](url)` → <a>. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(INLINE_TOKEN);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    const link = LINK_TOKEN.exec(part);
    if (link) {
      const [, label, href] = link;
      if (!SAFE_HREF.test(href)) return <Fragment key={i}>{label}</Fragment>;
      const external = /^https?:\/\//i.test(href);
      return (
        <a
          key={i}
          href={href}
          className="font-bold underline underline-offset-4"
          style={{ color: "var(--bk-ink, #1a1a1a)" }}
          {...(external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          {label}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Parse a tiny markdown subset and render to JSX. */
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let paraBuffer: string[] = [];

  function flushPara() {
    if (paraBuffer.length === 0) return;
    const text = paraBuffer.join(" ").trim();
    if (text)
      out.push(
        <p
          key={`p-${out.length}`}
          className="font-body text-base leading-relaxed text-bk-ink-soft"
        >
          {renderInline(text)}
        </p>,
      );
    paraBuffer = [];
  }

  function flushList() {
    if (listBuffer.length === 0) return;
    out.push(
      <ul
        key={`ul-${out.length}`}
        className="list-disc ps-6 space-y-bk-2xs font-body text-base text-bk-ink-soft"
      >
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      flushPara();
      flushList();
      // `## ` is one level under the section's h1 — so h2, not the h3 the
      // old scribble-h2 lockup forced.
      out.push(
        <h2
          key={`h-${out.length}`}
          className="font-display font-black text-bk-h3 text-bk-ink mt-bk-lg first:mt-0"
        >
          {renderInline(line.slice(3).trim())}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("- ")) {
      flushPara();
      listBuffer.push(line.slice(2).trim());
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    paraBuffer.push(line.trim());
  }
  flushPara();
  flushList();
  return out;
}

/** Long date in the page's language with Latin digits — Arabic locales
 *  default to Arabic-Indic numerals, which the storefront never uses (prices
 *  are Latin). Kurdish falls back to Arabic like the rest of the ku chain. */
function formatLastUpdated(iso: string, locale: LocaleCode): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat(locale === "en" ? "en" : "ar-u-nu-latn", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(ms));
}

function PolicyContentRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const eyebrow = resolveI18n(props.eyebrow_i18n, locale);
  const body = resolveI18n(props.body_md_i18n, locale);
  const lastUpdatedLabel = resolveI18n(props.last_updated_label_i18n, locale);
  const lastUpdated = props.last_updated
    ? formatLastUpdated(props.last_updated, locale)
    : null;
  if (!body) return null;

  return (
    <Section>
      <div className="mx-auto max-w-3xl">
        <CenteredSectionHeader
          // The policy pages are a single section, so this is their h1. On a
          // page that already has one (the contact page leads with
          // faq_contact_split) a second h1 would be wrong, so the level
          // follows the page rather than the section.
          as={ctx.runtime.page_id === "contact" ? "h2" : "h1"}
          align="start"
          eyebrow={eyebrow || undefined}
          eyebrowField="eyebrow_i18n"
          title={heading}
          titleField="heading_i18n"
        />
        <article
          className="p-bk-lg sm:p-bk-xl"
          style={{
            backgroundColor: "var(--bk-surface, #ffffff)",
            border:
              "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
            borderRadius: "var(--bk-radius-card, 1rem)",
            boxShadow: "var(--bk-shadow-card, 4px 4px 0px 0px #1a1a1a)",
          }}
        >
          <div
            className="space-y-bk-sm font-body"
            data-i18n-field="body_md_i18n"
          >
            {renderMarkdown(body)}
          </div>
          {lastUpdated && lastUpdatedLabel && (
            <p className="mt-bk-lg font-label text-xs bk-caps tracking-[0.2em] text-bk-ink-faint">
              {lastUpdatedLabel}{" "}
              <time dateTime={props.last_updated}>{lastUpdated}</time>
            </p>
          )}
        </article>
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "policy_content",
  category: "page",
  name: { en: "Policy content", ar: "محتوى السياسة" },
  description: {
    en: "Long-form policy text — supports paragraphs, headings, bold, links, and bullets.",
    ar: "نص سياسة طويل — يدعم الفقرات والعناوين والخط الغامق والروابط والنقاط.",
  },
  thumbnail: "/sections/policy_content.svg",
  valid_on: [
    "policy_shipping",
    "policy_returns",
    "policy_privacy",
    "policy_terms",
    "about",
    "contact",
  ],
  schema,
  defaultProps,
  render: PolicyContentRender,
};

registerSection(definition);
export default definition;
