// Express `promise_layout: "band"` (F01, spec §1.3): one espresso card of
// up to three rows, each only with its data, after the order status
// block. It replaces the reassurance line, the contact line and both
// trust-chip placements; `contactConfig` is set for it even with
// `show_contact_line` off. Absent keeps today's markup (baselines).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_BRAND_KIT, buildBrandKitVars } from "@scheniders/shared";
import type { StoreContactConfig } from "@scheniders/shared";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import type { Props } from "../pdp_direct_order";
import type { SectionRenderContext } from "../_types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant, productCtx, productRuntime, saleProduct } from "../_pdp-fixtures";
import type { Tenant } from "../types";
import { promiseRows } from "./promise-band";
import { EXPRESS_STRINGS } from "./strings";

const CONTACT: StoreContactConfig = {
  call_number: "07779703832",
  whatsapp_confirm: false,
  name_i18n: { ar: "شنايدر", en: "Scheniders" },
};
const FREE = { default_rate: { fee_iqd: 0 } };
const PAID = { default_rate: { fee_iqd: 5000 } };

function tenant(contact: StoreContactConfig | undefined, shipping: object = FREE): Tenant {
  return {
    ...fixtureTenant,
    store_config_v2: {
      commerce: { ...(contact ? { contact } : {}), shipping },
      enabled_locales: ["ar", "en"],
    },
  };
}

const BAND: Props = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  show_contact_line: false,
  promise_layout: "band",
  reassurance_i18n: { ar: "تفتح وتجرّب قبل لا تدفع — والتيستر هدية وياه", en: "Open it and try it before you pay. Tester included." },
  return_promise_i18n: { ar: "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع" },
  delivery_sla_i18n: { ar: "أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب" },
};

function render(props: Props, t: Tenant, overrides: Partial<SectionRenderContext> = {}): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render props={props} ctx={productCtx(saleProduct, { tenant: t, ...overrides })} />
    </StoreBaseProvider>,
  );
}

function rows(html: string): string[] {
  return [...html.matchAll(/data-promise-row="([a-z]+)"/g)].map((x) => x[1]);
}

describe("promise band rows", () => {
  it("all three rows, in order, with the shared call sentence and the save pill", () => {
    const html = render(BAND, tenant(CONTACT));
    expect(rows(html)).toEqual(["trust", "delivery", "call"]);
    expect(html).toContain('aria-label="شنو تحصل ويا طلبك"');
    expect(html).toContain("تفتح وتجرّب قبل لا تدفع — والتيستر هدية وياه");
    expect(html).toContain("ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع");
    expect(html).toContain(">التوصيل مجاني<");
    expect(html).not.toContain("التوصيل مجاني.");
    expect(html).toContain("أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب");
    expect(html).toContain(
      'راح يوصلك اتصال من <bdi class="whitespace-nowrap">0777 970 3832</bdi> لتأكيد طلبك — رد علينا ويطلع طلبك',
    );
    expect(html).toContain('download="شنايدر — تأكيد الطلبات.vcf"');
    expect(html).toContain('href="data:text/vcard;charset=utf-8,');
    expect(html).toContain(encodeURIComponent("TEL;TYPE=CELL,VOICE:+9647779703832"));
    expect(html).toContain("احفظ رقمنا");
    // The number is text, never a call link (D12).
    expect(html).not.toContain('href="tel:');
  });

  it("whatsapp_confirm true names the WhatsApp message first", () => {
    const html = render(BAND, tenant({ ...CONTACT, whatsapp_confirm: true }));
    expect(html).toContain("راح توصلك رسالة واتساب لتأكيد طلبك");
  });

  it("call hours add the shared when-part", () => {
    // FIXTURE_NOW is Monday 12:00 Baghdad.
    const html = render(
      BAND,
      tenant({ ...CONTACT, call_hours: { days: ["mon"], from: "10:00", to: "21:00" } }),
    );
    expect(html).toContain("اليوم قبل الساعة 9 م");
  });

  it("no usable contact: two rows and no save pill", () => {
    const html = render(BAND, tenant(undefined));
    expect(rows(html)).toEqual(["trust", "delivery"]);
    expect(html).not.toContain("data-save-number");
  });

  it("paid delivery: «التوصيل» with the SLA; without an SLA, no delivery row", () => {
    expect(render(BAND, tenant(CONTACT, PAID))).toContain(">التوصيل</p>");
    const noSla = render({ ...BAND, delivery_sla_i18n: undefined }, tenant(CONTACT, PAID));
    expect(rows(noSla)).toEqual(["trust", "call"]);
  });

  it("empty reassurance hides row 1", () => {
    expect(rows(render({ ...BAND, reassurance_i18n: undefined }, tenant(CONTACT)))).toEqual([
      "delivery",
      "call",
    ]);
  });

  it("nothing to say: no band and no empty card", () => {
    const html = render(
      { ...BAND, reassurance_i18n: undefined, delivery_sla_i18n: undefined },
      tenant(undefined, PAID),
    );
    expect(html).not.toContain("data-promise-band");
  });

  it("the terms link renders only with guarantee_anchor_id", () => {
    expect(render(BAND, tenant(CONTACT))).not.toContain("الشروط");
    const html = render({ ...BAND, guarantee_anchor_id: "guarantee" }, tenant(CONTACT));
    expect(html).toContain('href="#guarantee"');
    expect(html).toContain(">الشروط</a>");
  });

  it("english", () => {
    const html = render(BAND, tenant(CONTACT), { runtime: { ...productRuntime, locale: "en" } });
    expect(html).toContain('aria-label="What you get with your order"');
    expect(html).toContain(">Delivery is free<");
    expect(html).toContain('download="Scheniders — order confirmation.vcf"');
    expect(html).toContain("Save our number");
  });
});

describe("promise band replaces the old under-CTA lines", () => {
  const html = render({ ...BAND, show_contact_line: true }, tenant(CONTACT));

  it("no reassurance <p>, no contact line, no trust chips anywhere", () => {
    expect(html).not.toContain('<p class="flex items-center justify-center gap-1.5');
    expect(html).not.toContain("data-contact-line");
    expect(html).not.toContain('data-layer="trust"');
    expect(html).not.toContain('data-i18n-field="trust_chips.label_i18n"');
  });

  it("the bottom chip block is dropped too", () => {
    const bottom = render({ ...BAND, trust_chips_placement: undefined }, tenant(CONTACT));
    expect(bottom).not.toContain('data-i18n-field="trust_chips.label_i18n"');
  });

  it("the band sits inside the form, after the submit", () => {
    expect(html.indexOf('type="submit"')).toBeLessThan(html.indexOf("data-promise-band"));
    expect(html.indexOf("data-promise-band")).toBeLessThan(html.indexOf("</form>"));
  });

  it("classic ignores promise_layout", () => {
    const classic = render({ ...pdp_direct_order.defaultProps, promise_layout: "band" }, tenant(CONTACT));
    expect(classic).not.toContain("data-promise-band");
    expect(classic).not.toContain("data-contact-line");
  });
});

describe("promiseRows", () => {
  const base = {
    reassurance: "تفتح وتجرّب",
    returnPromise: "",
    guaranteeAnchorId: undefined,
    freeEverywhere: false,
    deliverySla: "",
    locale: "ar" as const,
  };

  it("whitespace-only copy counts as empty", () => {
    expect(promiseRows({ ...base, reassurance: "  " }).trust).toBeNull();
    expect(promiseRows({ ...base, deliverySla: " " }).delivery).toBeNull();
  });

  it("free delivery without an SLA is a title-only row", () => {
    expect(promiseRows({ ...base, freeEverywhere: true }).delivery).toEqual({
      title: "التوصيل مجاني",
      fact: "",
    });
  });
});

describe("save-number hints", () => {
  it.each(["numberSaveHint", "numberCopiedHint", "numberManualHint"] as const)(
    "%s never claims the contact was saved",
    (key) => {
      const ar = EXPRESS_STRINGS[key].ar;
      expect(ar).not.toMatch(/انحفظ|حفظناه|تم الحفظ/);
      expect(EXPRESS_STRINGS[key].en).not.toMatch(/\bsaved\b/i);
    },
  );
});

describe("promise band contrast on the scheniders brand kit", () => {
  // The fact lines are `text-bk-on-secondary/80` on `bg-bk-secondary`.
  const vars = buildBrandKitVars({
    ...EMPTY_BRAND_KIT,
    colors: {
      primary: "#f7db17",
      secondary: "#3e3129",
      accent: "#fbb82e",
      surface: "#fdf8ef",
      surface_alt: "#f8efdf",
      ink: "#483b36",
      success: "#3ecf8e",
      danger: "#e2574c",
    },
  }) as Record<string, string>;
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (c: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg: number[], bg: number[], alpha: number) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

  it("the espresso is #3e3129", () => {
    expect(vars["--bk-secondary"]).toBe("#3e3129");
  });

  it("fact lines at 80% clear 7:1", () => {
    const bg = rgb(vars["--bk-secondary"]);
    expect(ratio(over(rgb(vars["--bk-on-secondary"]), bg, 0.8), bg)).toBeGreaterThanOrEqual(7);
  });

  it("the yellow icons clear 7:1", () => {
    expect(ratio(rgb(vars["--bk-primary"]), rgb(vars["--bk-secondary"]))).toBeGreaterThanOrEqual(7);
  });
});
