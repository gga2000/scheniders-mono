// The opt-in "boutique" footer: a dark closing panel. Every line renders
// only from merchant data, the two contact actions are real links, and the
// markup never sets a document direction (the app stays LTR in Arabic).

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import site_footer from "./site_footer";
import type { Props } from "./site_footer";
import type { SectionRenderContext } from "./_types";
import type { Tenant } from "./types";
import { FIXTURE_NOW, fixtureTenant, productCtx, productRuntime } from "./_pdp-fixtures";

const homeRuntime = { ...productRuntime, page_id: "home" as const };
const tenant: Tenant = { ...fixtureTenant, business_name: "Scheniders Iraq" };

const PROPS: Props = {
  ...site_footer.defaultProps,
  layout: "boutique",
  wordmark_i18n: { ar: "شنايدر", en: "Scheniders" },
  tagline_i18n: { ar: "عطور فخمة", en: "Premium perfumes" },
  columns: [
    {
      heading_i18n: { ar: "معلومات عنا", en: "About us" },
      links: [
        { href: "/track", label_i18n: { ar: "تتبع الطلب", en: "Track your order" } },
        { href: "/policies/returns", label_i18n: { ar: "سياسة الاسترجاع", en: "Returns" } },
      ],
    },
  ],
  contact: { address_i18n: { ar: "العراق - بغداد - زيونة", en: "Iraq - Baghdad - Zayouna" } },
  legal: { business_license: "310536983500003", company_name: "Schnieder - شنايدر" },
  social_links: { instagram: "https://www.instagram.com/x/", tiktok: "  " },
};

function render(props: Props, overrides: Partial<SectionRenderContext> = {}): string {
  const Section = site_footer.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(undefined, { tenant, runtime: homeRuntime, ...overrides })} />
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

describe("site_footer — boutique layout", () => {
  it("the schema accepts the layout and drops an unknown one", () => {
    expect(site_footer.schema.parse(PROPS).layout).toBe("boutique");
    expect(site_footer.schema.parse({ ...PROPS, layout: "nope" }).layout).toBeUndefined();
  });

  it("renders the boutique panel, never a direction attribute", () => {
    const html = render(PROPS);
    expect(html).toContain('data-footer-layout="boutique"');
    expect(html).not.toMatch(/\sdir=/);
  });

  it("offers WhatsApp and a call as real links to the store's number", () => {
    const html = render(PROPS);
    expect(html).toContain('href="https://wa.me/9647701234567"');
    expect(html).toContain('href="tel:+9647701234567"');
    expect(html).toContain("واتساب");
    expect(html).toContain("اتصل بينا");
  });

  it("shows the links under the merchant's heading, store-prefixed", () => {
    const html = render(PROPS);
    expect(html).toContain("معلومات عنا");
    expect(html).toContain('href="/s/fixture-store/track"');
    expect(html).toContain("سياسة الاسترجاع");
  });

  it("prints the address once in the reader's language, with a maps link", () => {
    const ar = render(PROPS);
    expect(ar).toContain("العراق - بغداد - زيونة");
    expect(ar).not.toContain("Iraq - Baghdad - Zayouna");
    expect(ar).toContain(
      `https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent("العراق - بغداد - زيونة")}`,
    );
    const en = render(PROPS, { runtime: { ...homeRuntime, locale: "en" } });
    expect(en).toContain("Iraq - Baghdad - Zayouna");
    expect(en).toContain("Talk to us");
  });

  it("renders only social accounts with a URL", () => {
    const html = render(PROPS);
    expect(html).toContain('href="https://www.instagram.com/x/"');
    expect(html).not.toMatch(/aria-label="TikTok"/);
  });

  it("ends with the legal fine print and the merchant's rights line", () => {
    const html = render({ ...PROPS, rights_i18n: { ar: "جميع الحقوق محفوظة", en: "All rights reserved" } });
    expect(html).toContain("Schnieder - شنايدر");
    expect(html).toContain("310536983500003");
    expect(html).toContain("جميع الحقوق محفوظة");
  });

  it("shows the configured logo beside the wordmark, else none", () => {
    expect(render({ ...PROPS, logo_image_url: "https://cdn.example/logo.png" })).toContain(
      "logo.png",
    );
    expect(render(PROPS)).not.toContain("<img");
  });

  it("drops the contact block when the store has no number", () => {
    const html = render(PROPS, {
      tenant: { ...tenant, store_config: { contact: {} } },
    });
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("tel:");
  });
});
