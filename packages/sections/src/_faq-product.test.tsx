// =====================================================================
// faq_contact_split `product_faq` + `contact_style: "row"` (spec §1.7)
// =====================================================================
// Product questions answered from the product's own data, shown only
// when at least `min_answered` resolve; each answer ends in «اطلبه
// وجرّبه» (a jump to the order form). One contact row with «اتصل بينا»
// and «راسلنا واتساب» replaces the «عندك استفسار؟» card. The default and
// compact markup are pinned by the baseline snapshots.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import faq_contact_split from "./faq_contact_split";
import { ORDER_FORM_HREF, resolveProductFaq, type ProductFaqConfig } from "./faq_contact_split.product";
import { DIRECT_ORDER_FORM_ID } from "./pdp_direct_order.client";
import type { Product, Tenant } from "./types";
import { productCtx, productRuntime } from "./_pdp-fixtures";
import { BARE_TENANT, IRAQ_TENANT, LIVE_PDP_FAQ } from "./_pdp-lower-fixtures";
import { scentProduct } from "./_pdp-scent-fixtures";
import { wayferProduct } from "./_pdp-wayfer-fixtures";

const PRODUCT_FAQ: ProductFaqConfig = {
  title_i18n: { ar: "أسئلة قبل لا تطلب", en: "Before you order" },
  items: [
    { q_i18n: { ar: "شكد يثبت؟", en: "How long does it last?" }, answer: { kind: "attribute", key: "longevity_note" } },
    { q_i18n: { ar: "شكد حجم القنينة؟", en: "How big is the bottle?" }, answer: { kind: "size_ml" } },
  ],
};

const ROW = {
  ...LIVE_PDP_FAQ,
  product_faq: PRODUCT_FAQ,
  contact_style: "row",
  heading_style: "chapter",
  contact: {
    ...LIVE_PDP_FAQ.contact,
    title_i18n: { ar: "محتار بالريحة؟ نوصفلك ياها", en: "Not sure about the scent? We'll describe it" },
    sub_i18n: { ar: "نفس الرقم للاتصال والواتساب", en: "Same number for calls and WhatsApp" },
  },
};

/** Both questions answered: the scent fixture's longevity_note + a size. */
const answered: Product = { ...scentProduct, size_ml: 100 };

function render(input: unknown, product: Product, locale: LocaleCode = "ar", tenant: Tenant = IRAQ_TENANT): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <faq_contact_split.render
        props={faq_contact_split.schema.parse(input)}
        ctx={productCtx(product, { tenant, runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("schema", () => {
  it("accepts the product FAQ config", () => {
    const parsed = faq_contact_split.schema.parse(ROW);
    expect(parsed.product_faq).toEqual(PRODUCT_FAQ);
    expect(parsed.contact_style).toBe("row");
    expect(parsed.heading_style).toBe("chapter");
  });

  it.each<[string, unknown]>([
    ["product_faq", { items: [] }],
    ["product_faq", { items: [{ q_i18n: { ar: "؟" }, answer: { kind: "photo" } }] }],
    ["contact_style", "banner"],
    ["heading_style", "huge"],
  ])("a bad %s (%j) falls back to absent", (key, value) => {
    const parsed = faq_contact_split.schema.parse({ ...ROW, [key]: value });
    expect(parsed[key as keyof typeof parsed]).toBeUndefined();
    expect(parsed.items).toEqual(LIVE_PDP_FAQ.items);
  });
});

describe("resolveProductFaq", () => {
  it("Wayfarer today: no longevity_note, no size → 0 of 2, hidden", () => {
    expect(resolveProductFaq(PRODUCT_FAQ, wayferProduct, "ar")).toEqual([]);
  });

  it("both answered: the attribute text and «القنينة 100 مل»", () => {
    expect(resolveProductFaq(PRODUCT_FAQ, answered, "ar")).toEqual([
      { question: "شكد يثبت؟", answer: "ثبات ممتاز وفوحان قوي." },
      { question: "شكد حجم القنينة؟", answer: "القنينة 100 مل" },
    ]);
  });

  it("one answered of two: hidden at the default min_answered, shown at 1", () => {
    const sized: Product = { ...wayferProduct, size_ml: 100 };
    expect(resolveProductFaq(PRODUCT_FAQ, sized, "ar")).toEqual([]);
    expect(resolveProductFaq({ ...PRODUCT_FAQ, min_answered: 1 }, sized, "ar")).toEqual([
      { question: "شكد حجم القنينة؟", answer: "القنينة 100 مل" },
    ]);
  });

  it("a merchant text, an enum attribute and a template", () => {
    const config: ProductFaqConfig = {
      min_answered: 1,
      items: [
        { q_i18n: { ar: "يصلح هدية؟" }, answer: { kind: "text", a_i18n: { ar: "إي، نغلّفه هدية." } } },
        { q_i18n: { ar: "يناسب أي موسم؟" }, answer: { kind: "attribute", key: "season", template_i18n: { ar: "يناسب {value}" } } },
        { q_i18n: { ar: "الحجم؟" }, answer: { kind: "size_ml", template_i18n: { ar: "{value} مل بالضبط" } } },
      ],
    };
    expect(resolveProductFaq(config, answered, "ar").map((r) => r.answer)).toEqual([
      "إي، نغلّفه هدية.",
      "يناسب صيفي",
      "100 مل بالضبط",
    ]);
  });
});

describe("render", () => {
  it("Wayfarer today: only the contact row, no questions, no heading", () => {
    const html = render(ROW, wayferProduct);
    expect(html).not.toContain("data-faq-item");
    expect(html).not.toContain("أسئلة قبل لا تطلب");
    expect(count(html, "data-contact-row")).toBe(1);
    expect(html).toContain("محتار بالريحة؟ نوصفلك ياها");
    expect(html).toContain("نفس الرقم للاتصال والواتساب");
    expect(html).not.toContain("عندك استفسار؟");
    expect(html).not.toContain("لديك أسئلة أخرى؟");
  });

  it("two equal buttons: tel: the confirmation number, WhatsApp prefilled with the product", () => {
    const html = render(ROW, wayferProduct);
    expect(html).toContain('href="tel:+9647779703832" data-contact="call"');
    expect(html).toContain(
      `href="https://wa.me/9647779703832?text=${encodeURIComponent("عندي سؤال عن ويفر انتنس")}"`,
    );
    expect(html).toContain(">اتصل بينا<");
    expect(html).toContain(">راسلنا واتساب<");
    expect(count(html, "min-h-[3.25rem] flex-1 basis-0")).toBe(2);
  });

  it("both answered: the chapter heading, the first question open, «اطلبه وجرّبه» to the form", () => {
    const html = render(ROW, answered);
    expect(html).toContain("text-bk-chapter");
    expect(html).toContain(">أسئلة قبل لا تطلب<");
    expect(count(html, "data-faq-item")).toBe(2);
    expect(count(html, ' open=""')).toBe(1);
    expect(count(html, `href="${ORDER_FORM_HREF}" data-faq-order`)).toBe(2);
    expect(html.indexOf("data-faq-item")).toBeLessThan(html.indexOf("data-contact-row"));
  });

  it("the jump target is the express form's id", () => {
    expect(ORDER_FORM_HREF).toBe(`#${DIRECT_ORDER_FORM_ID}`);
  });

  it("only a call number: one button; nothing at all: no section", () => {
    const callOnly: Tenant = {
      ...BARE_TENANT,
      store_config_v2: { enabled_locales: ["ar", "en"], commerce: { contact: { call_number: "07779703832" } } },
    };
    const html = render(ROW, wayferProduct, "ar", callOnly);
    expect(html).toContain('data-contact="call"');
    expect(html).not.toContain('data-contact="whatsapp"');
    expect(render(ROW, wayferProduct, "ar", BARE_TENANT)).toBe("");
  });

  it("without contact_style row: the compact WhatsApp row", () => {
    const { contact_style: _c, ...card } = ROW;
    const html = render(card, wayferProduct);
    expect(html).toContain('data-action-row="whatsapp"');
    expect(html).not.toContain("data-contact-row");
  });

  it("adds no dir attribute", () => {
    expect(count(render(ROW, answered), 'dir="')).toBe(0);
  });

  it("English chrome", () => {
    const html = render(ROW, answered, "en");
    expect(html).toContain(">Call us<");
    expect(html).toContain(">WhatsApp us<");
    expect(html).toContain(">Order it, try it<");
    expect(html).toContain("The bottle is 100 ml");
  });
});

describe("compact + heading_style", () => {
  it("chapter sets the compact heading at the chapter scale", () => {
    const compact = { ...LIVE_PDP_FAQ, compact: true };
    expect(render({ ...compact, heading_style: "chapter" }, wayferProduct)).toContain("text-bk-chapter");
    expect(render(compact, wayferProduct)).not.toContain("text-bk-chapter");
  });
});
