// The soft commerce pieces: the order action's body (label, optional
// line, arrow on the reading end), the WhatsApp row (green glyph, ink
// label), the receipt row (flips in Arabic, ink figures), and the chapter
// heading as a page's h1. No colour literal, no `dir`, no yellow text.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChapterHeading } from "./chapter-heading";
import { ReceiptRow, SOFT_PRIMARY, SoftPrimaryBody, SoftWhatsappLink } from "./soft-commerce";

describe("soft commerce", () => {
  it("the order action: one yellow fill with the token shadow and no ink outline", () => {
    expect(SOFT_PRIMARY).toContain("bg-bk-primary");
    expect(SOFT_PRIMARY).toContain("shadow-bk-button");
    expect(SOFT_PRIMARY).toContain("rounded-bk-input");
    expect(SOFT_PRIMARY).toContain("min-h-[60px]");
    expect(SOFT_PRIMARY).not.toContain("border");
  });

  it("the action's body: label, small line, arrow pointing the reading way", () => {
    const ar = renderToStaticMarkup(<SoftPrimaryBody label="ثبّت طلبي" sub="128,500 د.ع" rtl />);
    expect(ar).toContain("flex-row-reverse");
    expect(ar).toContain(">ثبّت طلبي<");
    expect(ar).toContain(">128,500 د.ع<");
    expect(ar).toContain(">arrow_back<");
    const en = renderToStaticMarkup(<SoftPrimaryBody label="Place my order" rtl={false} busy />);
    expect(en).toContain(">progress_activity<");
    expect(en).not.toContain("flex-row-reverse");
    expect(en).toContain("animate-spin");
  });

  it("the merchant label carries its editor field on the label, not the button", () => {
    const html = renderToStaticMarkup(<SoftPrimaryBody label="كمّل طلبك" labelField="checkout_label_i18n" rtl />);
    expect(html).toContain('<span class="font-bk-display text-[19px] font-black" data-i18n-field="checkout_label_i18n">');
  });

  it("the WhatsApp row: green glyph, ink label, new tab", () => {
    const html = renderToStaticMarkup(<SoftWhatsappLink href="https://wa.me/9647700000000" label="اطلب عبر واتساب" rtl />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain("h-6 w-6 text-bk-success");
    expect(html).toContain("text-bk-ink");
    expect(html).toContain("flex-row-reverse");
  });

  it("a receipt row flips in Arabic; the total row is 22px/900 ink", () => {
    const row = renderToStaticMarkup(<ReceiptRow rtl label="المجموع" value="128,500 د.ع" strong />);
    expect(row).toContain("flex-row-reverse");
    expect(row).toContain("text-[22px] font-black leading-none text-bk-ink");
    expect(renderToStaticMarkup(<ReceiptRow rtl={false} label="Total" value="1" />)).not.toContain("flex-row-reverse");
  });

  it("the chapter heading can be a page's h1", () => {
    const h1 = renderToStaticMarkup(<ChapterHeading as="h1" locale="ar" title="سلتك" />);
    expect(h1).toContain('<h1 class="font-bk-display text-bk-chapter font-black text-bk-ink text-balance">سلتك</h1>');
  });

  it("no colour literal, no dir, no yellow text", () => {
    const all = [
      renderToStaticMarkup(<SoftPrimaryBody label="x" sub="y" rtl />),
      renderToStaticMarkup(<SoftWhatsappLink href="#" label="x" rtl={false} />),
      renderToStaticMarkup(<ReceiptRow rtl label="x" note="× 2" value="y" />),
    ].join("");
    expect(all).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(all).not.toContain(' dir="');
    expect(all).not.toContain("text-bk-primary");
  });
});
