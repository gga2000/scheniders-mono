// The footer printed the tenant's business_name ("Scheniders Iraq") while
// the header printed its own wordmark («شنايدر» / "Scheniders"): two names
// for one shop on every page. `wordmark_i18n` is the header's field,
// mirrored, opt-in. Unset, the footer is byte-identical
// (_site-footer-baseline-snapshot).

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import site_footer from "./site_footer";
import type { Props } from "./site_footer";
import type { SectionRenderContext } from "./_types";
import { FIXTURE_NOW, fixtureTenant, productCtx, productRuntime } from "./_pdp-fixtures";

const WORDMARK = { ar: "شنايدر", en: "Scheniders" };
const tenant = { ...fixtureTenant, business_name: "Scheniders Iraq" };
const homeRuntime = { ...productRuntime, page_id: "home" as const };

function render(props: Props, overrides: Partial<SectionRenderContext> = {}): string {
  const Section = site_footer.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Section props={props} ctx={productCtx(undefined, { tenant, runtime: homeRuntime, ...overrides })} />
    </StoreBaseProvider>,
  );
}

/** Text of the info_panel wordmark paragraph. */
function panelWordmark(html: string): string {
  const m = html.match(/<p class="font-display text-2xl[^"]*"[^>]*>([^<]*)<\/p>/);
  expect(m, "no wordmark paragraph").not.toBeNull();
  return m ? m[1] : "";
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

describe("site_footer — wordmark_i18n", () => {
  const panel: Props = { ...site_footer.defaultProps, layout: "info_panel" };

  it("info_panel prints the configured wordmark per locale", () => {
    const ar = render({ ...panel, wordmark_i18n: WORDMARK });
    expect(panelWordmark(ar)).toBe("شنايدر");
    expect(ar).toContain('data-i18n-field="wordmark_i18n"');
    const en = render(
      { ...panel, wordmark_i18n: WORDMARK },
      { runtime: { ...homeRuntime, locale: "en" } },
    );
    expect(panelWordmark(en)).toBe("Scheniders");
  });

  it("info_panel keeps the business name when unset", () => {
    const html = render(panel);
    expect(panelWordmark(html)).toBe("Scheniders Iraq");
    expect(html).not.toContain('data-i18n-field="wordmark_i18n"');
  });

  it("bento shows the wordmark in the brand mark; the copyright keeps the legal name", () => {
    const html = render({ ...site_footer.defaultProps, wordmark_i18n: WORDMARK });
    expect(html).toContain("شنايدر");
    expect(html).toContain("© 2026 Scheniders Iraq");
  });

  it("parses a malformed value as unset", () => {
    const parsed = site_footer.schema.parse({ ...site_footer.defaultProps, wordmark_i18n: 42 });
    expect(parsed.wordmark_i18n).toBeUndefined();
  });
});
