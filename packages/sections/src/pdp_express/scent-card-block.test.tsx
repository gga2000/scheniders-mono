// Express «بصمة العطر» card in the page (spec §1.4): it replaces the
// description, the journey and the note cards only in card mode, sits
// directly under the promise band, draws every element only with its
// data, keeps yellow out (D4), adds no `dir`, and is byte-identical off.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import type { Props } from "../pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, productCtx, productRuntime } from "../_pdp-fixtures";
import { IRAQ_REDESIGN_TENANT, SLICE_1B_PDP_PATCH } from "../_pdp-redesign-fixtures";
import { scentProduct } from "../_pdp-scent-fixtures";
import { WAYFER_ID, wayferProduct } from "../_pdp-wayfer-fixtures";
import type { Product } from "../types";

const SCENT_CARD: NonNullable<Props["scent_card"]> = {
  pyramid_key: "notes",
  chip_keys: ["season", "occasions"],
  note_key: "longevity_note",
  meter_keys: ["longevity", "sillage"],
  lead_key: "scent_lead",
  quote_terms: ["ثبات", "يثبت", "تفوح", "يفوح"],
  facts_source_i18n: { ar: "حسب تجربتنا", en: "Our own estimate" },
  quote_picks: [
    {
      product_id: WAYFER_ID,
      review_id: "6881921e-d263-4780-8878-762e01904146",
      text: "بخيت منه الصبح لسه الريحة تفوح",
    },
  ],
  product_copy: [
    {
      product_id: WAYFER_ID,
      lead_i18n: { ar: "فاكهي بلمسة توابل: يبدي بالتوت والتفاح، ويظل عليك بالباتشولي" },
      story_i18n: { ar: "ملك العطور الجديد: ويفر انتنس\n\nأنت تستاهل تكون مميز. لا ترضى بالعادي." },
    },
  ],
};

/** The draft as slice 1b left it: the promise band on, no scent card. */
const BAND_PROPS: Props = { ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, ...SLICE_1B_PDP_PATCH };
const CARD_PROPS: Props = { ...BAND_PROPS, scent_layout: "card", scent_card: SCENT_CARD };

function render(props: Props, product: Product, locale: LocaleCode = "ar"): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render
        props={props}
        ctx={productCtx(product, {
          tenant: IRAQ_REDESIGN_TENANT,
          runtime: { ...productRuntime, locale },
        })}
      />
    </StoreBaseProvider>,
  );
}

/** The card's own markup, from its opening tag to the end of the section. */
function cardOf(html: string): string {
  const start = html.indexOf("data-scent-card");
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", html.lastIndexOf("data-scent-story")));
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("scent_layout card — Wayfarer as the draft has it", () => {
  const html = render(CARD_PROPS, wayferProduct);
  const card = cardOf(html);

  it("replaces «عن العطر», «رحلة العطر» and the note cards", () => {
    expect(html).not.toContain("عن العطر");
    expect(html).not.toContain('data-layer="scent-journey"');
    expect(html).not.toContain('data-layer="note-row"');
  });

  it("sits directly under the promise band, after the order form", () => {
    expect(html.indexOf("data-promise-band")).toBeGreaterThan(-1);
    expect(html.indexOf("</form>")).toBeLessThan(html.indexOf("data-scent-card"));
    expect(html.indexOf("data-promise-band")).toBeLessThan(html.indexOf("data-scent-card"));
  });

  it("header, lead and the pyramid with all 5 photos", () => {
    expect(card).toContain("بصمة العطر");
    expect(card).toContain("رجالي");
    expect(card).toContain("فاكهي بلمسة توابل: يبدي بالتوت والتفاح، ويظل عليك بالباتشولي");
    expect(count(card, "data-note-photo")).toBe(5);
    expect(count(card, "data-note-chip")).toBe(0);
    expect(card).toContain("أول ما ترشه");
  });

  it("no facts block without data: no meter, no source tag, no empty slot", () => {
    expect(card).not.toContain("data-scent-facts");
    expect(card).not.toContain("data-meter");
    expect(card).not.toContain("حسب تجربتنا");
  });

  it("the merchant-picked clause, verbatim, credited", () => {
    expect(card).toContain("الثبات، بكلام زبون");
    expect(card).toContain("«بخيت منه الصبح لسه الريحة تفوح»");
    expect(card).toContain("<bdi>eng. سيف</bdi>");
    expect(card).toMatch(/aria-hidden="true"[^>]*>س<\/span>/);
  });

  it("the rating is text until the reviews summary exists, and a link after", () => {
    expect(card).toContain('data-scent-rating="text"');
    expect(card).toContain("4.7");
    expect(card).toContain("6 تقييمات");
    const linked = cardOf(render({ ...CARD_PROPS, identity_rating: "summary_link" }, wayferProduct));
    expect(linked).toContain('href="#reviews-summary"');
    expect(linked).not.toContain('href="#reviews"');
  });

  it("«قصة العطر» opens the story sheet with the rewrite and the note cards", () => {
    expect(card).toContain('aria-haspopup="dialog"');
    expect(card).toContain("قصة العطر");
    expect(card).toContain("ملك العطور الجديد: ويفر انتنس");
    expect(card).not.toContain("لاول 100 زبون");
    expect(card).toContain(">التوت البري الفاخر<");
    expect(card).not.toContain("🫐");
  });

  it("keeps yellow out and adds no dir attribute", () => {
    expect(card).not.toMatch(/bg-bk-primary|text-bk-primary/);
    expect(card).not.toContain('dir="');
  });
});

describe("scent_layout card — facts when the product has them", () => {
  it("meters, the source tag, chips and the staying-power line", () => {
    const card = cardOf(render(CARD_PROPS, scentProduct));
    expect(card).toContain('data-meter="longevity"');
    expect(card).not.toContain('data-meter="sillage"');
    expect(card).toContain("4 من 5");
    expect(count(card, "h-2 flex-1 rounded-bk-pill bg-bk-ink")).toBe(4);
    expect(count(card, "h-2 flex-1 rounded-bk-pill bg-bk-divider")).toBe(1);
    expect(card).toContain("حسب تجربتنا");
    expect(card).toContain('data-chip-row="season"');
    expect(card).toContain('data-chip-row="occasions"');
    expect(card).toContain("ثبات ممتاز وفوحان قوي.");
    // Two notes have photo cards; the rest are text chips.
    expect(count(card, "data-note-photo")).toBe(2);
    expect(count(card, "data-note-chip")).toBe(6);
  });

  it("english", () => {
    const card = cardOf(render(CARD_PROPS, scentProduct, "en"));
    expect(card).toContain("Scent profile");
    expect(card).toContain("4 of 5");
    expect(card).toContain("Our own estimate");
    expect(card).toContain("The scent’s story");
  });
});

describe("scent_layout off", () => {
  it("scent_card alone changes nothing", () => {
    expect(render({ ...BAND_PROPS, scent_card: SCENT_CARD }, wayferProduct)).toBe(
      render(BAND_PROPS, wayferProduct),
    );
  });

  it('"journey" keeps today\'s blocks', () => {
    const html = render({ ...CARD_PROPS, scent_layout: "journey" }, scentProduct);
    expect(html).not.toContain("data-scent-card");
    expect(html).toContain('data-layer="scent-journey"');
  });
});
