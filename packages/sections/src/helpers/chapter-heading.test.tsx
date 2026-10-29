import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChapterHeading } from "./chapter-heading";

describe("ChapterHeading", () => {
  it("aligns to the right edge in Arabic and Kurdish", () => {
    for (const locale of ["ar", "ku"] as const) {
      const html = renderToStaticMarkup(<ChapterHeading title="أسئلة قبل لا تطلب" locale={locale} />);
      expect(html).toMatch(/^<div class="[^"]*items-end text-right/);
    }
  });

  it("aligns to the left edge in English", () => {
    const html = renderToStaticMarkup(<ChapterHeading title="Questions" locale="en" />);
    expect(html).toMatch(/^<div class="[^"]*items-start text-left/);
  });

  it("sets the title on the chapter step, black weight, as an h2 by default", () => {
    const html = renderToStaticMarkup(<ChapterHeading title="كرت الضمان" locale="ar" />);
    expect(html).toContain('<h2 class="font-bk-display text-bk-chapter font-black text-bk-ink text-balance">كرت الضمان</h2>');
  });

  it("renders only the title when eyebrow and sub are absent", () => {
    const html = renderToStaticMarkup(<ChapterHeading title="كرت الضمان" locale="ar" />);
    expect(html).toMatch(/^<div[^>]*><h2[^>]*>كرت الضمان<\/h2><\/div>$/);
  });

  it("renders the eyebrow chip before the title and the sub after it", () => {
    const html = renderToStaticMarkup(
      <ChapterHeading
        eyebrow="ويا كل طلب"
        title="كرت الضمان"
        sub="حقك مكتوب هنا"
        locale="ar"
        eyebrowField="eyebrow_i18n"
        titleField="heading_i18n"
        subField="sub_i18n"
      />,
    );
    const eyebrow = html.indexOf("ويا كل طلب");
    const title = html.indexOf("كرت الضمان");
    const sub = html.indexOf("حقك مكتوب هنا");
    expect(eyebrow).toBeGreaterThan(-1);
    expect(eyebrow).toBeLessThan(title);
    expect(title).toBeLessThan(sub);
    expect(html).toContain('data-i18n-field="eyebrow_i18n"');
    expect(html).toContain('data-i18n-field="heading_i18n"');
    expect(html).toContain('<p data-i18n-field="sub_i18n" class="max-w-prose font-bk-body text-sm text-bk-ink-soft text-pretty">');
  });

  it("takes an h3 level and an anchor id", () => {
    const html = renderToStaticMarkup(
      <ChapterHeading title="الثبات" locale="ar" as="h3" id="scent" />,
    );
    expect(html).toContain('<h3 id="scent"');
  });

  it("never sets a dir attribute", () => {
    const html = renderToStaticMarkup(<ChapterHeading eyebrow="x" title="y" sub="z" locale="ar" />);
    expect(html).not.toMatch(/\sdir=/);
  });
});
