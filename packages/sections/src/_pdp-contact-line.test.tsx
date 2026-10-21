// @vitest-environment jsdom
// =====================================================================
// pdp_direct_order — the "who contacts you" line (opt-in)
// =====================================================================
// `show_contact_line` renders the store's commerce.contact promise under
// the submit, in both layouts, from the one shared resolver. Without the
// prop, or without a usable contact config, nothing renders — the classic
// and express baselines stay byte-identical. Server markup uses the
// request moment; after mount the browser clock takes over and a timed
// line re-reads it every minute.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, render as domRender } from "@testing-library/react";
import type { StoreContactConfig } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import { CONTACT_LINE_TICK_MS } from "./helpers/contact-line";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import type { SectionRenderContext } from "./_types";
import {
  EXPRESS_IRAQ_PDP_PROPS,
  SIGNATURE_PDP_PROPS,
  fixtureTenant,
  productCtx,
  productRuntime,
  saleProduct,
} from "./_pdp-fixtures";

const Section = pdp_direct_order.render;

// FIXTURE_NOW (productRuntime.now) is Monday 2026-10-19 09:00 UTC = 12:00 Baghdad.
const CONTACT: StoreContactConfig = {
  call_number: "07779703832",
  call_hours: { days: ["sat", "sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "21:00" },
  whatsapp_confirm: true,
};

function ctxWith(contact: StoreContactConfig | undefined, overrides: Partial<SectionRenderContext> = {}) {
  return {
    tenant: {
      ...fixtureTenant,
      store_config_v2: { commerce: contact ? { contact } : {}, enabled_locales: ["ar", "en", "ku"] },
    },
    ...overrides,
  } satisfies Partial<SectionRenderContext>;
}

function render(props: Props, contact: StoreContactConfig | undefined, overrides: Partial<SectionRenderContext> = {}) {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(saleProduct, ctxWith(contact, overrides))} />
    </StoreBaseProvider>,
  );
}

const CLASSIC_ON: Props = { ...SIGNATURE_PDP_PROPS, show_contact_line: true };
const EXPRESS_ON: Props = { ...EXPRESS_IRAQ_PDP_PROPS, show_contact_line: true };
const en: Partial<SectionRenderContext> = { runtime: { ...productRuntime, locale: "en" } };

/** The contact line's opening <p …> tag. */
function lineTag(html: string): string {
  const at = html.indexOf("data-contact-line=");
  expect(at).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<p", at), html.indexOf(">", at) + 1);
}

/** The whole contact line <p …>…</p>. */
function lineHtml(html: string): string {
  const at = html.indexOf("data-contact-line=");
  expect(at).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<p", at), html.indexOf("</p>", at) + "</p>".length);
}

describe.each([
  ["classic", SIGNATURE_PDP_PROPS, CLASSIC_ON],
  ["express", EXPRESS_IRAQ_PDP_PROPS, EXPRESS_ON],
] as const)("%s layout", (_name, off, on) => {
  it("renders nothing without the opt-in, even when the store has a contact config", () => {
    expect(render(off, CONTACT)).not.toContain("data-contact-line");
  });

  it("renders nothing when opted in but the store has no contact config", () => {
    expect(render(on, undefined)).not.toContain("data-contact-line");
  });

  it("renders nothing when the stored call number is unusable", () => {
    expect(render(on, { ...CONTACT, call_number: "0123" })).not.toContain("data-contact-line");
  });

  it("renders the timed line under the submit and the reassurance line", () => {
    const html = render(on, CONTACT);
    expect(lineTag(html)).toContain('data-contact-line="open_now"');
    expect(lineHtml(html)).toContain('<bdi class="whitespace-nowrap">0777 970 3832</bdi>');
    expect(lineHtml(html)).toContain("اليوم قبل الساعة 9 م");
    expect(lineHtml(html)).toContain("رسالة واتساب");
    const line = html.indexOf("data-contact-line=");
    expect(line).toBeGreaterThan(html.indexOf('type="submit"'));
    expect(line).toBeGreaterThan(html.indexOf('data-i18n-field="reassurance_i18n"'));
  });

  it("names only the channel when the store set no hours", () => {
    const html = render(on, { call_number: "07779703832" });
    expect(lineTag(html)).toContain('data-contact-line="channel"');
    expect(lineHtml(html)).not.toContain("اليوم");
    expect(lineHtml(html)).not.toContain("رسالة واتساب");
  });

  it("speaks the shopper's locale", () => {
    expect(lineHtml(render(on, CONTACT, en))).toContain("today before 9 pm");
  });
});

describe("contact line placement per layout", () => {
  it("express puts the icon on the reading side, never via dir", () => {
    expect(lineTag(render(EXPRESS_ON, CONTACT))).toContain("flex-row-reverse");
    expect(lineTag(render(EXPRESS_ON, CONTACT, en))).not.toContain("flex-row-reverse");
    expect(lineTag(render(EXPRESS_ON, CONTACT))).not.toContain("dir=");
  });

  it("classic matches its reassurance line's type scale", () => {
    expect(lineTag(render(CLASSIC_ON, CONTACT))).toContain("font-body text-sm text-bk-ink-soft");
  });
});

describe("show_contact_line schema", () => {
  it("a malformed stored value is caught to undefined, never dropping the buy box", () => {
    const parsed = pdp_direct_order.schema.safeParse({ ...SIGNATURE_PDP_PROPS, show_contact_line: "yes" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.show_contact_line).toBeUndefined();
  });
});

describe("contact line after mount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const variant = () => document.querySelector("[data-contact-line]")?.getAttribute("data-contact-line");

  it("switches to the browser clock on mount and re-reads it every minute", () => {
    // The request said Monday 12:00; the browser says Monday 22:00 Baghdad.
    vi.setSystemTime(new Date("2026-10-19T19:00:00Z"));
    domRender(
      <StoreBaseProvider base="/s/fixture-store">
        <Section props={CLASSIC_ON} ctx={productCtx(saleProduct, ctxWith(CONTACT))} />
      </StoreBaseProvider>,
    );
    expect(variant()).toBe("tomorrow");
    // Tuesday 10:00 Baghdad: the window opened.
    vi.setSystemTime(new Date("2026-10-20T07:00:00Z"));
    act(() => {
      vi.advanceTimersByTime(CONTACT_LINE_TICK_MS);
    });
    expect(variant()).toBe("open_now");
  });

  it("a channel-only line sets no timer", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    domRender(
      <StoreBaseProvider base="/s/fixture-store">
        <Section props={CLASSIC_ON} ctx={productCtx(saleProduct, ctxWith({ call_number: "07779703832" }))} />
      </StoreBaseProvider>,
    );
    expect(variant()).toBe("channel");
    expect(spy.mock.calls.some(([, ms]) => ms === CONTACT_LINE_TICK_MS)).toBe(false);
  });
});
