// =====================================================================
// Section — product_attributes
// =====================================================================
// Renders the merchant's own product attributes on the PDP.
//
// The KIND decides the control, the LAYOUT decides the arrangement. That
// split matters: "render this note pyramid as a meter" is not a thing a
// merchant would ever want, so kind→control is not a choice we offer.
// What they do want is whether the block reads as a spec table, a stack
// of blocks, or something folded away — and that is the layout prop.
//
//   kind        control                        example
//   ─────────── ────────────────────────────── ──────────────────────────
//   group_list  pyramid                        a perfume's top/heart/base
//   range       meter with a labelled scale    longevity, battery life
//   enum        chip                           scent family, roast
//   boolean     yes / no
//   text        a line of prose per locale
//
// Nothing is hardcoded to perfume, or to any vertical: every label, unit
// and option comes from the tenant's own taxonomy.
// =====================================================================

import { z } from "zod";
import {
  resolveI18n,
  type LocaleCode,
  type ResolvedProductAttribute,
} from "@scheniders/shared";
import { Section, SectionHeader } from "./helpers/primitives";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  /** How the block is arranged. Controls come from each attribute's kind. */
  layout: z.enum(["stacked", "table", "accordion"]),
  /**
   * Which attributes to show, by key, in this order. Empty = every
   * attribute the product has, in the merchant's own display order.
   */
  attribute_keys: z.array(z.string()),
  /** Fold the block closed on first paint (accordion layout only). */
  start_collapsed: z.boolean(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Details", ar: "التفاصيل" },
  layout: "stacked",
  attribute_keys: [],
  start_collapsed: false,
};

/* ─────────────────────────────────────────────────────────────────── */
/* Controls, one per kind                                               */
/* ─────────────────────────────────────────────────────────────────── */

function AttributeName({ attr, locale }: { attr: ResolvedProductAttribute; locale: LocaleCode }) {
  return (
    <span className="font-label text-xs uppercase tracking-[0.15em] text-bk-ink-soft">
      {resolveI18n(attr.def.name_i18n, locale) || attr.def.key}
    </span>
  );
}

/** A range, drawn against its own declared scale. */
function Meter({ attr, locale }: { attr: Extract<ResolvedProductAttribute, { kind: "range" }>; locale: LocaleCode }) {
  const { range_min, range_max } = attr.def;
  const span = range_max - range_min;
  // The schema guarantees max > min, so this cannot divide by zero.
  const pct = ((attr.value - range_min) / span) * 100;
  const unit = resolveI18n(attr.def.unit_i18n, locale);

  return (
    <div className="space-y-bk-2xs">
      <div className="flex items-baseline justify-between gap-bk-xs">
        <AttributeName attr={attr} locale={locale} />
        <span className="font-body text-sm tabular-nums text-bk-ink">
          {attr.value}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-bk-pill bg-bk-surface-alt"
        role="img"
        aria-label={`${resolveI18n(attr.def.name_i18n, locale)}: ${attr.value} / ${range_max}`}
      >
        <div className="h-full rounded-bk-pill bg-bk-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** A grouped list, widest group first — the pyramid. */
function Pyramid({
  attr,
  locale,
}: {
  attr: Extract<ResolvedProductAttribute, { kind: "group_list" }>;
  locale: LocaleCode;
}) {
  // Render in the merchant's declared group order, not the object's key
  // order: for a perfume that is top → heart → base, and a pyramid read
  // out of order is just a list.
  const groups = attr.def.group_keys
    .map((g) => ({ key: g.key, label: resolveI18n(g.label_i18n, locale) || g.key, items: attr.value[g.key] }))
    .filter((g) => g.items && g.items.length > 0);

  return (
    <div className="space-y-bk-2xs">
      <AttributeName attr={attr} locale={locale} />
      <ul className="space-y-bk-2xs">
        {groups.map((g) => (
          <li
            key={g.key}
            className="flex flex-col gap-bk-2xs rounded-bk-input bg-bk-surface-alt px-bk-sm py-bk-xs sm:flex-row sm:items-baseline sm:gap-bk-sm"
          >
            <span className="font-label text-xs uppercase tracking-[0.12em] text-bk-ink-soft sm:w-24 sm:shrink-0">
              {g.label}
            </span>
            <span className="font-body text-sm text-bk-ink">{g.items.join(" · ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ attr, locale }: { attr: Extract<ResolvedProductAttribute, { kind: "enum" }>; locale: LocaleCode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-bk-xs">
      <AttributeName attr={attr} locale={locale} />
      <span className="rounded-bk-pill bg-bk-decor-a px-bk-sm py-[2px] font-body text-sm text-bk-on-decor">
        {resolveI18n(attr.option.label_i18n, locale) || attr.value}
      </span>
    </div>
  );
}

function Plain({ attr, locale }: { attr: ResolvedProductAttribute; locale: LocaleCode }) {
  const text =
    attr.kind === "boolean"
      ? attr.value
        ? locale === "en"
          ? "Yes"
          : "نعم"
        : locale === "en"
          ? "No"
          : "لا"
      : attr.kind === "text"
        ? resolveI18n(attr.value, locale)
        : "";
  if (!text) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-bk-xs">
      <AttributeName attr={attr} locale={locale} />
      <span className="font-body text-sm text-bk-ink">{text}</span>
    </div>
  );
}

function Control({ attr, locale }: { attr: ResolvedProductAttribute; locale: LocaleCode }) {
  switch (attr.kind) {
    case "range":
      return <Meter attr={attr} locale={locale} />;
    case "group_list":
      return <Pyramid attr={attr} locale={locale} />;
    case "enum":
      return <Chip attr={attr} locale={locale} />;
    default:
      return <Plain attr={attr} locale={locale} />;
  }
}

/** One-line value, for the table layout where the name is its own cell. */
function tableValue(attr: ResolvedProductAttribute, locale: LocaleCode): string {
  switch (attr.kind) {
    case "enum":
      return resolveI18n(attr.option.label_i18n, locale) || attr.value;
    case "range": {
      const unit = resolveI18n(attr.def.unit_i18n, locale);
      return `${attr.value}${unit ? ` ${unit}` : ""}`;
    }
    case "boolean":
      return attr.value ? (locale === "en" ? "Yes" : "نعم") : locale === "en" ? "No" : "لا";
    case "text":
      return resolveI18n(attr.value, locale);
    case "group_list":
      return attr.def.group_keys
        .map((g) => attr.value[g.key])
        .filter((items): items is string[] => !!items && items.length > 0)
        .map((items) => items.join(" · "))
        .join(" — ");
  }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Section                                                              */
/* ─────────────────────────────────────────────────────────────────── */

function ProductAttributesRender({ props, ctx }: { props: Props; ctx: SectionRenderContext }) {
  const all = ctx.product?.attributes ?? [];
  if (all.length === 0) return null;

  // An explicit key list is both a filter and an ordering.
  const attrs = props.attribute_keys.length
    ? props.attribute_keys
        .map((k) => all.find((a) => a.def.key === k))
        .filter((a): a is ResolvedProductAttribute => !!a)
    : all;
  if (attrs.length === 0) return null;

  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);

  if (props.layout === "table") {
    return (
      <Section density="dense">
        <div className="mx-auto max-w-3xl">
          {heading ? <SectionHeader title={heading} /> : null}
          {/* Wide values scroll inside the table, never the page. */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start">
              <tbody>
                {attrs.map((attr) => (
                  <tr key={attr.def.key} className="border-b border-bk-divider last:border-b-0">
                    <th
                      scope="row"
                      className="py-bk-xs pe-bk-sm text-start align-top font-label text-xs font-normal uppercase tracking-[0.15em] text-bk-ink-soft"
                    >
                      {resolveI18n(attr.def.name_i18n, locale) || attr.def.key}
                    </th>
                    <td className="py-bk-xs font-body text-sm text-bk-ink">{tableValue(attr, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    );
  }

  const body = (
    <div className="space-y-bk-md">
      {attrs.map((attr) => (
        <Control key={attr.def.key} attr={attr} locale={locale} />
      ))}
    </div>
  );

  if (props.layout === "accordion") {
    return (
      <Section density="dense">
        <div className="mx-auto max-w-3xl">
          {/* <details> so the content is in the DOM and indexable even when
              folded, and so it works with no JavaScript. */}
          <details
            open={!props.start_collapsed}
            className="rounded-bk-card border border-bk-divider px-bk-md py-bk-sm"
          >
            <summary className="cursor-pointer list-none font-display text-lg font-black text-bk-ink">
              {heading || resolveI18n(defaultProps.heading_i18n, locale)}
            </summary>
            <div className="mt-bk-md">{body}</div>
          </details>
        </div>
      </Section>
    );
  }

  return (
    <Section density="dense">
      <div className="mx-auto max-w-3xl">
        {heading ? <SectionHeader title={heading} /> : null}
        {body}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "product_attributes",
  category: "page",
  name: { en: "Product details", ar: "تفاصيل المنتج" },
  description: {
    en: "Shows the attributes you defined for this product — scales as meters, grouped lists as a pyramid, choices as chips.",
    ar: "يعرض الخصائص اللي عرّفتها للمنتج — المقاييس كمؤشرات، والقوائم المجمّعة كهرم، والاختيارات كأزرار.",
  },
  thumbnail: "/sections/product_attributes.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: ProductAttributesRender,
};

registerSection(definition);
export default definition;
