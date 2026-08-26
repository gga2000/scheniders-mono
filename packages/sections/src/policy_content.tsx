// =====================================================================
// Section — policy_content
// =====================================================================
// Long-form policy / legal content block. Renders a tiny subset of
// markdown — paragraphs, headings (## ), unordered lists (- ), and
// inline bold (**…**). No external markdown library — keeps the
// dependency surface tight and the output deterministic.
// =====================================================================

import { Fragment } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  Section,
  SectionHeader,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  body_md_i18n: i18nStringSchema,
  last_updated_label_i18n: i18nStringOptional,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Our policy", ar: "سياستنا" },
  body_md_i18n: {
    en: "## Overview\n\nWe deliver across Iraq with cash on delivery and a free inspection on arrival.\n\n## What's included\n\n- Free inspection on delivery\n- Same-day Baghdad shipping\n- **14-day returns** on unopened items\n- Cash on delivery across every governorate\n\n## How to contact us\n\nReach out on WhatsApp or via the contact page — we reply within one business day.",
    ar: "## نظرة عامة\n\nنوصّل في كل العراق بنظام الدفع عند الاستلام مع فحص مجاني عند الوصول.\n\n## ماذا يشمل ذلك\n\n- فحص مجاني عند التسليم\n- شحن بنفس اليوم داخل بغداد\n- **إرجاع خلال 14 يوماً** للمنتجات غير المفتوحة\n- الدفع عند الاستلام في كل المحافظات\n\n## كيف تتواصل معنا\n\nنحن متواجدون عبر واتساب أو صفحة التواصل — نردّ خلال يوم عمل واحد.",
  },
  last_updated_label_i18n: { en: "Last updated", ar: "آخر تحديث" },
};

/** Render a paragraph string, turning `**bold**` into <strong>. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
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
        className="list-disc pl-6 space-y-bk-2xs font-body text-base text-bk-ink-soft"
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
      out.push(
        <h3
          key={`h-${out.length}`}
          className="font-display font-black text-xl uppercase text-bk-ink mt-bk-lg first:mt-0"
        >
          {renderInline(line.slice(3).trim())}
        </h3>,
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

function PolicyContentRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const body = resolveI18n(props.body_md_i18n, locale);
  const lastUpdated = resolveI18n(props.last_updated_label_i18n, locale);
  if (!body) return null;

  return (
    <Section>
      <SectionHeader title={heading} color="butter" />
      <BentoCard bg="white" size="md" className="p-bk-lg sm:p-bk-xl">
        <div className="space-y-bk-sm">{renderMarkdown(body)}</div>
        {lastUpdated && (
          <p className="mt-bk-lg font-label text-xs uppercase tracking-[0.2em] text-bk-ink-faint">
            {lastUpdated}
          </p>
        )}
      </BentoCard>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "policy_content",
  category: "page",
  name: { en: "Policy content", ar: "محتوى السياسة" },
  description: {
    en: "Long-form policy text — supports paragraphs, headings, bold, and bullets.",
    ar: "نص سياسة طويل — يدعم الفقرات والعناوين والخط الغامق والنقاط.",
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
