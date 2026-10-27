// =====================================================================
// T0 — site_footer renders, frozen before the opt-in `wordmark_i18n`
// =====================================================================
// Both layouts at their defaults, plus a frozen copy of scheniders-iraq's
// draft footer (globals.footer 7be7c06b-…, config rev 38, read 2026-10-22).
// The date is pinned because the default rights line prints the year.
// A diff here is a back-compat break, not a snapshot to refresh.
// =====================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import site_footer from "./site_footer";
import type { Props } from "./site_footer";
import type { SectionRenderContext } from "./_types";
import type { Tenant } from "./types";
import {
  FIXTURE_NOW,
  fixtureTenant,
  productCtx,
  productRuntime,
} from "./_pdp-fixtures";

const IRAQ_FOOTER_PROPS: Props = {
  columns: [
    {
      heading_i18n: { ar: "معلومات عنا", en: "About us" },
      links: [
        { href: "/contact", label_i18n: { ar: "تواصل معنا", en: "Contact us" } },
        { href: "/about", label_i18n: { ar: "من نحن", en: "Who we are" } },
        { href: "/track", label_i18n: { ar: "تتبع الطلب", en: "Track your order" } },
        { href: "/policies/privacy", label_i18n: { ar: "سياسة الخصوصية", en: "Privacy policy" } },
        { href: "/policies/terms", label_i18n: { ar: "الشروط والاحكام", en: "Terms and conditions" } },
        { href: "/policies/returns", label_i18n: { ar: "سياسة الاسترجاع", en: "Return and refund policy" } },
        { href: "/policies/shipping", label_i18n: { ar: "سياسة الشحن", en: "Shipping policy" } },
      ],
    },
  ],
  contact: {
    address_i18n: { ar: "العراق - بغداد - زيونة", en: "Iraq - Baghdad - Zayouna" },
  },
  layout: "info_panel",
  legal: { business_license: "310536983500003", company_name: "Schnieder - شنايدر" },
  links_heading_i18n: { ar: "معلومات عنا", en: "About us" },
  newsletter: {
    button_i18n: { ar: "اشترك", en: "Subscribe" },
    copy_i18n: {
      ar: "كن أول من يعرف آخر الاخبار عن متجرنا، عند انضمامك ستحصل فورا على كوبون خصم 15% على منتجاتنا.",
      en: "Be the first to hear our news — join and instantly get a 15% coupon.",
    },
    enabled: true,
    placeholder_i18n: { ar: "ادخل بريدك الالكتروني هنا", en: "Enter your email here" },
    success_i18n: {
      ar: "تم الاشتراك! كود الخصم مالتك: WELCOME15",
      en: "You're in! Your discount code: WELCOME15",
    },
  },
  rights_i18n: {
    ar: "جميع الحقوق محفوظة لمجموعة شركات شنايدر",
    en: "All rights reserved to the Scheniders group",
  },
  show_cod_badge: false,
  social_links: {
    instagram: "https://www.instagram.com/kawkab.brand/",
    tiktok: "https://www.tiktok.com/@kawkab.brand",
  },
  tagline_i18n: {
    ar: "عطور فخمة فائقة الجودة بأسعار تنافسية",
    en: "Premium, top-quality perfumes at competitive prices",
  },
};

const iraqTenant: Tenant = { ...fixtureTenant, business_name: "Scheniders Iraq" };
const homeRuntime = { ...productRuntime, page_id: "home" as const };

function render(props: Props, overrides: Partial<SectionRenderContext> = {}): string {
  const Section = site_footer.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(undefined, { runtime: homeRuntime, ...overrides })} />
    </StoreBaseProvider>,
  );
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

describe("site_footer baseline — defaults", () => {
  it("bento (arabic)", () => {
    expect(render(site_footer.defaultProps)).toMatchSnapshot();
  });

  it("bento (kurdish)", () => {
    expect(
      render(site_footer.defaultProps, { runtime: { ...homeRuntime, locale: "ku" } }),
    ).toMatchSnapshot();
  });

  it("info_panel (arabic)", () => {
    expect(render({ ...site_footer.defaultProps, layout: "info_panel" })).toMatchSnapshot();
  });
});

describe("site_footer baseline — frozen scheniders-iraq footer", () => {
  it("the frozen props still satisfy the schema unchanged", () => {
    const parsed = site_footer.schema.safeParse(IRAQ_FOOTER_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(IRAQ_FOOTER_PROPS);
  });

  it("arabic", () => {
    expect(render(IRAQ_FOOTER_PROPS, { tenant: iraqTenant })).toMatchSnapshot();
  });

  it("english", () => {
    expect(
      render(IRAQ_FOOTER_PROPS, {
        tenant: iraqTenant,
        runtime: { ...homeRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });
});
