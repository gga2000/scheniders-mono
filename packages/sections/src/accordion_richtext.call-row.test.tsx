// accordion_richtext — the opt-in `call_row` under the quiet layout: the
// merchant's prompt, the store's call number, and a tap-to-call pill. The
// number is `commerce.contact.call_number` through `parseStoreContact`.
// Static markup only. The quiet markup without `call_row` is pinned in
// _pdp-lower-baseline-snapshot.test.tsx; the cards markup in
// accordion_richtext.test.tsx.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import accordion_richtext, { resolveCallRow } from "./accordion_richtext";
import {
  BARE_TENANT,
  IRAQ_TENANT,
  LIVE_PDP_POLICIES,
  lowerCtx,
  type AccordionProps,
} from "./_pdp-lower-fixtures";
import type { Tenant } from "./types";

function render(props: AccordionProps, locale: LocaleCode = "ar", tenant: Tenant = IRAQ_TENANT): string {
  const Render = accordion_richtext.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Render props={props} ctx={lowerCtx(locale, tenant)} />
    </StoreBaseProvider>,
  );
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function withContact(contact: unknown): Tenant {
  return {
    ...IRAQ_TENANT,
    store_config_v2: {
      enabled_locales: ["ar", "en"],
      commerce: { contact: contact as { call_number: string } },
    },
  };
}

const CALL_ROW = {
  prompt_i18n: { ar: "تحب تحچي ويانا؟", en: "Rather talk to us?" },
  action_i18n: { ar: "اتصل", en: "Call" },
};
const WITH_CALL: AccordionProps = { ...LIVE_PDP_POLICIES, call_row: CALL_ROW };

describe("schema", () => {
  const { schema, defaultProps } = accordion_richtext;

  it("keeps `call_row` out of defaultProps", () => {
    expect(defaultProps).not.toHaveProperty("call_row");
  });

  it("the live config parses with call_row undefined", () => {
    const r = schema.safeParse(LIVE_PDP_POLICIES);
    expect(r.success).toBe(true);
    expect(r.data?.call_row).toBeUndefined();
  });

  it("accepts a prompt and an action", () => {
    expect(schema.safeParse(WITH_CALL).data?.call_row).toEqual(CALL_ROW);
  });

  it("a malformed call_row parses to undefined and renders no row", () => {
    const quiet = render(LIVE_PDP_POLICIES);
    for (const bad of ["call", 42, { prompt_i18n: 5, action_i18n: {} }, { prompt_i18n: {} }]) {
      const r = schema.safeParse({ ...LIVE_PDP_POLICIES, call_row: bad });
      expect(r.success).toBe(true);
      if (!r.success) continue;
      expect(r.data.call_row).toBeUndefined();
      expect(render(r.data)).toBe(quiet);
    }
  });
});

describe("resolveCallRow", () => {
  const contact = { call_number: "07779703832" };

  it("formats the number for reading and dials it in international form", () => {
    expect(resolveCallRow(CALL_ROW, contact, "ar")).toEqual({
      prompt: "تحب تحچي ويانا؟",
      action: "اتصل",
      number: "0777 970 3832",
      href: "tel:+9647779703832",
    });
  });

  it("normalises a stored +964 number to the same row", () => {
    expect(resolveCallRow(CALL_ROW, { call_number: "+964 777 970 3832" }, "en")).toEqual({
      prompt: "Rather talk to us?",
      action: "Call",
      number: "0777 970 3832",
      href: "tel:+9647779703832",
    });
  });

  it("is null without the opt-in, without a valid Iraqi mobile, or with an empty string", () => {
    expect(resolveCallRow(undefined, contact, "ar")).toBeNull();
    expect(resolveCallRow(CALL_ROW, undefined, "ar")).toBeNull();
    expect(resolveCallRow(CALL_ROW, { call_number: "12345" }, "ar")).toBeNull();
    expect(resolveCallRow(CALL_ROW, { call_number: "" }, "ar")).toBeNull();
    expect(resolveCallRow({ ...CALL_ROW, prompt_i18n: { ar: " ", en: "" } }, contact, "ar")).toBeNull();
    expect(resolveCallRow({ ...CALL_ROW, action_i18n: {} }, contact, "ar")).toBeNull();
  });
});

describe("quiet layout with call_row", () => {
  const ar = render(WITH_CALL, "ar");
  const en = render(WITH_CALL, "en");
  const quietAr = render(LIVE_PDP_POLICIES, "ar");

  it("appends exactly one call row after the list and changes nothing before it", () => {
    expect(count(ar, 'data-action-row="call"')).toBe(1);
    const at = ar.indexOf('<div data-action-row="call"');
    expect(at).toBeGreaterThan(0);
    // Everything up to the row is the frozen quiet markup minus its closing tag.
    expect(ar.slice(0, at)).toBe(quietAr.slice(0, quietAr.lastIndexOf("</section>")));
    expect(ar.endsWith("</div></section>")).toBe(true);
  });

  it("dials the store's call number and shows it", () => {
    expect(ar).toContain('href="tel:+9647779703832"');
    expect(ar).toContain("<bdi>0777 970 3832</bdi>");
    expect(ar).not.toContain("target=");
  });

  it("speaks the merchant's words, tagged for the editor", () => {
    expect(ar).toContain('<p data-i18n-field="call_row.prompt_i18n"');
    expect(ar).toContain(">تحب تحچي ويانا؟</p>");
    expect(ar).toContain('<span data-i18n-field="call_row.action_i18n">اتصل</span>');
    expect(en).toContain(">Rather talk to us?</p>");
    expect(en).toContain('<span data-i18n-field="call_row.action_i18n">Call</span>');
  });

  it("carries a call glyph and a 44px pill", () => {
    expect(ar).toMatch(/<span class="material-symbols-outlined[^"]*" aria-hidden="true">call<\/span>/);
    expect(count(ar, "min-h-11")).toBe(1);
  });

  it("flips visual order for Arabic with classes, never dir=rtl", () => {
    const row = ar.slice(ar.indexOf('<div data-action-row="call"'));
    expect(count(row, "flex-row-reverse")).toBe(2);
    expect(row).toContain("text-right");
    const enRow = en.slice(en.indexOf('<div data-action-row="call"'));
    expect(enRow).not.toContain("flex-row-reverse");
    expect(enRow).toContain("text-left");
    for (const html of [ar, en]) expect(html).not.toContain('dir="rtl"');
  });

  it("draws no row when the store has no usable call number", () => {
    expect(render(WITH_CALL, "ar", BARE_TENANT)).toBe(render(LIVE_PDP_POLICIES, "ar", BARE_TENANT));
    expect(render(WITH_CALL, "ar", withContact({ call_number: "12345" }))).toBe(quietAr);
  });

  it("is ignored by the cards layout", () => {
    for (const locale of ["ar", "en"] as const) {
      const cards = { ...LIVE_PDP_POLICIES, layout: "cards" as const };
      expect(render({ ...cards, call_row: CALL_ROW }, locale)).toBe(render(cards, locale));
    }
  });
});
