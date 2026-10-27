import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionPill, ActionRow } from "./action-row";

function row(rtl: boolean, external: boolean): string {
  return renderToStaticMarkup(
    <ActionRow
      kind={external ? "whatsapp" : "call"}
      rtl={rtl}
      action={
        <ActionPill
          href={external ? "https://wa.me/9647779703832" : "tel:+9647779703832"}
          external={external}
          rtl={rtl}
          icon={<span aria-hidden="true">i</span>}
          label="اتصل"
          labelField="call_row.action_i18n"
        />
      }
    >
      <p>تحب تحچي ويانا؟</p>
    </ActionRow>,
  );
}

describe("ActionRow / ActionPill", () => {
  it("is one tinted card row with the text block first and the pill last", () => {
    const html = row(false, false);
    expect(html).toMatch(/^<div data-action-row="call" class="[^"]*rounded-bk-card bg-bk-surface-alt/);
    expect(html.indexOf("تحب تحچي ويانا؟")).toBeLessThan(html.indexOf("<a "));
  });

  it("meets the 44px touch target and the reduced-motion contract", () => {
    const html = row(false, false);
    expect(html).toContain("min-h-11");
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("keeps a tel: link in place and opens WhatsApp in a new tab", () => {
    const call = row(false, false);
    expect(call).toContain('href="tel:+9647779703832"');
    expect(call).not.toContain("target=");
    const wa = row(false, true);
    expect(wa).toContain('data-action-row="whatsapp"');
    expect(wa).toContain('target="_blank"');
    expect(wa).toContain('rel="noopener noreferrer"');
  });

  it("tags the label for the editor", () => {
    expect(row(false, false)).toContain('<span data-i18n-field="call_row.action_i18n">اتصل</span>');
  });

  it("flips visual order for Arabic with classes, never dir", () => {
    const ar = row(true, false);
    const en = row(false, false);
    expect(ar.split("flex-row-reverse").length - 1).toBe(2);
    expect(ar).toContain("text-right");
    expect(ar).not.toContain("text-left");
    expect(en).not.toContain("flex-row-reverse");
    expect(en).toContain("text-left");
    for (const html of [ar, en]) expect(html).not.toContain("dir=");
  });
});
