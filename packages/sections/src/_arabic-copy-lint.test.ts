// =====================================================================
// Arabic copy lint (F12) — the term sheet, applied
// =====================================================================
// 1. Chrome: the `ar` value of every table in STRING_TABLE_FILES, plus the
//    shared contact-line sentences. What breaks a rule today is frozen in
//    CHROME_ALLOWLIST, each entry with its reason; the list may only
//    shrink (the test fails on a new hit AND on an entry that no longer
//    hits, so a fix must also delete its entry).
// 2. Tenant: every Arabic string the PDP redesign writes into
//    scheniders-iraq's draft (`_pdp-redesign-fixtures.ts`, which the
//    migrations are checked against). The "before" copies (IRAQ_DRAFT_*)
//    are not ours to lint, and the merged inputs (IRAQ_REDESIGN_*) include
//    them. Customers' own words are quoted verbatim and never linted.
// 3. One name per action (COPY_ACTIONS): every place the page offers an
//    action uses the same words.
// =====================================================================

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTACT_LINE_STRINGS } from "@scheniders/shared";
import { COPY_ACTIONS, lintArabicCopy, type CopyRuleId } from "./_copy-terms";
import { STRING_TABLE_FILES, stringTableEntries } from "./_string-tables";
import * as REDESIGN from "./_pdp-redesign-fixtures";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, IRAQ_DRAFT_STICKY_PROPS } from "./_pdp-fixtures";
import { EXPRESS_STRINGS } from "./pdp_express/strings";
import { FAQ_STRINGS } from "./faq_contact_split.strings";
import { STICKY_STRINGS } from "./sticky_cta_bar.strings";

/** "<file> <key>: <rule>" for every hit. */
type HitLine = string;

const CHANGES_OTHER_TENANTS = "changing it alters other tenants' markup";

/** Today's chrome that breaks a rule, frozen. May only shrink. */
const CHROME_ALLOWLIST: Record<HitLine, string> = {
  "pdp_direct_order.client.tsx orderUnconfirmed: whatsapp-without-al": `«بالواتساب»; ${CHANGES_OTHER_TENANTS}`,
  "pdp_direct_order.client.tsx sendOnWhatsapp: whatsapp-without-al": `«بالواتساب»; ${CHANGES_OTHER_TENANTS}`,
  "pdp_express/strings.ts addressPlaceholder: latin-digits": `«شارع ١٤ رمضان»; ${CHANGES_OTHER_TENANTS}`,
  "pdp_express/strings.ts reviews: count-slot-singular": `the rating chip's «{count} تقييم»; ${CHANGES_OTHER_TENANTS}`,
  "product_reviews/strings.ts countMany: count-slot-singular": `the quiet layout's «{count} تقييم»; ${CHANGES_OTHER_TENANTS}`,
  "product_reviews/strings.ts starRow: count-slot-singular": `the bars' «{count} تقييم»; ${CHANGES_OTHER_TENANTS}`,
};

/** A `formatCount` forms set is <base>One / Two / Few / Many in one table:
 *  its Many form is the correct «{count} تقييم» for 11 and up. */
function isManyOfFormsSet(key: string, keys: ReadonlySet<string>): boolean {
  if (!key.endsWith("Many")) return false;
  const base = key.slice(0, -"Many".length);
  return ["One", "Two", "Few"].every((form) => keys.has(`${base}${form}`));
}

function chromeHits(): HitLine[] {
  const hits: HitLine[] = [];
  const add = (where: string, key: string, ar: string, skip: (rule: CopyRuleId) => boolean) => {
    for (const hit of lintArabicCopy(ar, "chrome")) {
      if (!skip(hit.rule)) hits.push(`${where} ${key}: ${hit.rule}`);
    }
  };
  for (const file of STRING_TABLE_FILES) {
    const entries = stringTableEntries(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
    const keys = new Set(entries.map((e) => e.key));
    for (const e of entries) {
      if (e.ar === null) continue;
      add(file, e.key, e.ar, (rule) => rule === "count-slot-singular" && isManyOfFormsSet(e.key, keys));
    }
  }
  for (const [key, entry] of Object.entries(CONTACT_LINE_STRINGS)) {
    add("@scheniders/shared contact-line", key, entry.ar, () => false);
  }
  return hits.sort();
}

/** Customers' own words, quoted verbatim (never corrected), by fixture path. */
const VERBATIM: readonly { path: RegExp; why: string }[] = [
  { path: /^SLICE_1C_PDP_PATCH\.scent_card\.quote_picks\.\d+\.text$/, why: "1c: a review clause, verbatim" },
  {
    path: /^SLICE_1D_GALLERY_PATCH\.images\.\d+\.(?:alt_i18n\.ar|quote_i18n\.ar|author)$/,
    why: "1d: TikTok comments and their authors, verbatim (to-do 4)",
  },
  { path: /^SLICE_1E_REVIEWS_PATCH\.review_curation\.\d+\.highlight$/, why: "1e: review key phrases, verbatim" },
];

/** Tenant copy that breaks a rule and is waiting on Ali (to-do 10). */
const TENANT_ALLOWLIST: Record<HitLine, string> = {
  "SLICE_1E_FAQ_PATCH.contact.sub_i18n.ar: whatsapp-without-al":
    "spec §1.7's «نفس الرقم للاتصال والواتساب»; Ali picks it or «نفس الرقم للاتصال وواتساب» (to-do 10)",
};

const ARABIC = /[ء-ي]/;

function walk(value: unknown, path: string, out: { path: string; text: string }[]): void {
  if (typeof value === "string") {
    if (ARABIC.test(value)) out.push({ path, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}.${i}`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, out);
  }
}

function tenantHits(): HitLine[] {
  const texts: { path: string; text: string }[] = [];
  for (const [name, value] of Object.entries(REDESIGN)) {
    if (name.startsWith("IRAQ_DRAFT_") || name.startsWith("IRAQ_REDESIGN_")) continue;
    walk(value, name, texts);
  }
  return texts
    .filter((t) => !VERBATIM.some((v) => v.path.test(t.path)))
    .flatMap((t) => lintArabicCopy(t.text, "tenant").map((h) => `${t.path}: ${h.rule}`))
    .sort();
}

describe("Arabic copy lint — chrome", () => {
  it("reads every table on the list", () => {
    for (const file of STRING_TABLE_FILES) {
      const entries = stringTableEntries(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
      expect(entries.filter((e) => e.ar !== null).length, file).toBeGreaterThan(0);
    }
  });

  it("only the frozen allowlist breaks the term sheet", () => {
    expect(chromeHits()).toEqual(Object.keys(CHROME_ALLOWLIST).sort());
  });

  it("every allowlist entry says why", () => {
    for (const reason of Object.values(CHROME_ALLOWLIST)) expect(reason).toContain(CHANGES_OTHER_TENANTS);
  });
});

describe("Arabic copy lint — the redesign's tenant copy", () => {
  it("only the copy waiting on Ali breaks the term sheet", () => {
    expect(tenantHits()).toEqual(Object.keys(TENANT_ALLOWLIST).sort());
  });

  it("the verbatim paths still exist (a renamed fixture would silently lint customers' words)", () => {
    const texts: { path: string; text: string }[] = [];
    for (const [name, value] of Object.entries(REDESIGN)) walk(value, name, texts);
    for (const v of VERBATIM) expect(texts.some((t) => v.path.test(t.path)), v.why).toBe(true);
  });
});

describe("one name per action", () => {
  it("each action uses its one name wherever the page offers it", () => {
    expect(IRAQ_DRAFT_STICKY_PROPS.primary_label_i18n.ar).toBe(COPY_ACTIONS.startOrder);
    expect(EXPRESS_IRAQ_DRAFT_PDP_PROPS.submit_label_i18n.ar).toBe(COPY_ACTIONS.placeOrder);
    expect(STICKY_STRINGS.continueOrder.ar).toBe(COPY_ACTIONS.continueOrder);
    expect(FAQ_STRINGS.whatsapp.ar).toBe(COPY_ACTIONS.whatsapp);
    expect(FAQ_STRINGS.call.ar).toBe(COPY_ACTIONS.call);
    expect(EXPRESS_STRINGS.saveNumber.ar).toBe(COPY_ACTIONS.saveNumber);
    expect(REDESIGN.SLICE_1D_ACCORDION_PATCH.heading_i18n.ar).toBe(COPY_ACTIONS.guarantee);
  });
});
