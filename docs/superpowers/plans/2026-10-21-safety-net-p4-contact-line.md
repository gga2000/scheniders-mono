# PDP order safety net — P4: contact line — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox () syntax for tracking.

**Spec:** docs/superpowers/specs/2026-10-21-pdp-order-safety-net-design.md · **Index:** docs/superpowers/plans/2026-10-21-safety-net-index.md

---

## P4 — "Who contacts you" line (structured `commerce.contact` + shared resolver + opt-in PDP line)

**Goal:** Under the order button, tell the buyer which number will call them and, when the store has set call hours, when. The line uses only the configured window and never promises minutes. One pure resolver in `@scheniders/shared` builds the text, and a small client component in `@scheniders/sections` renders it. Both PDP layouts show it behind an opt-in prop. Piece 5 (the thank-you call card) takes its call number from `resolveTrackerContact` (P5 plan, "Call number"), so Task P4.3 points that resolver at the same structured `call_number`: the PDP line, the order tracker and the call card can then never name different numbers. `<ContactLine>` and `resolveContactLine` are exported so piece 5 can render the timed sentence with the order moment as `initialNow`.

**Design decisions (fixed for this piece):**
- **Where the config lives:** `StoreConfigV2.commerce.contact`. Sections already receive the whole `store_config_v2.commerce` through `toSectionTenant` (`packages/sections/src/helpers/section-tenant.ts:58-63`, `commerce: v2.commerce` at line 60). So no new tenant field, no RSC payload change, no migration and no RLS change. Config is jsonb, so the change is additive and the schema does not change.
- **Shape of the config:**
  - `call_number`: an Iraqi mobile. It is normalized to `07XXXXXXXXX`. If it is invalid, no line renders.
  - `call_hours`: `{ days: ("sun".."sat")[], from: "HH:mm", to: "HH:mm", tz?: IANA }`. `tz` defaults to `Asia/Baghdad`. `from` must be earlier than `to`. If the block is malformed it is ignored and the line becomes channel-only.
  - `whatsapp_confirm`: boolean. The line mentions WhatsApp only when this is `true`. Piece 5 reuses the same flag.
- **Variants:**

  | Variant | When it applies |
  |---|---|
  | `channel` | No (valid) hours |
  | `open_now` | Inside today's window: "today before {to}" |
  | `later_today` | Before opening on a call day: "today from {from}" |
  | `tomorrow` | Tomorrow is the next call day |
  | `next_day` | The next call day is further away: "on {weekday} from {from}" |

- **Clock:** Server and hydrating client both start from `ctx.runtime.now`, so the first paint matches. After mount the browser clock takes over. A timed line re-reads it every 60s; a channel-only line sets no timer.
- **Back-compat:** The new prop `show_contact_line` is `.optional().catch(undefined)`. When it is absent, nothing renders and markup is byte-identical, which the existing classic and express snapshot tests prove.
- **Verified against a scratch mirror of the working tree (2026-10-21):**
  - Resolver suite: 39/39 passing.
  - Section suite: 17/17 passing.
  - Unchanged: `_pdp-classic-snapshot`, `_pdp-express-snapshot`, `_pdp-express-cta`, `_pdp-form` and `_kurdish-coverage`.
  - `tsc` on `packages/sections` shows the same 11 errors that already exist in test files, and no new errors.
- **Correction to the discovery brief (re-verified by SQL):** section props are stored under `sections[i].base`, not `.props`.
  - The **draft** `pdp_direct_order` (`aae22169-…`) has `layout: "express"`, `trust_chips_placement: "under_cta"` and a filled `reassurance_i18n`.
  - The **published** layout is still classic (`base.layout` null).
  - Both layouts are wired here, so this does not change the plan. It does change the draft SQL path in P4.4.

**Precondition for every commit below:** Piece 0 merge is concluded. This command must print nothing:
```bash
git -C /Users/ali/scheniders-mono rev-parse -q --verify MERGE_HEAD
```

**Precondition (build order P1 → P2 → P3 → P4 → P5):** P1, P2 and P3 are committed before P4 starts. Each of these must print one line:
```bash
cd /Users/ali/scheniders-mono && grep -c 'queueOrderConfirmation' apps/storefront/app/actions/checkout.ts && grep -c 'create_storefront_order' apps/storefront/app/actions/checkout.ts && grep -c 'capture_consent_i18n: i18nStringOptional' packages/sections/src/pdp_direct_order.tsx && grep -c 'waFallbackHref' packages/sections/src/pdp_express/model.ts && grep -c 'captureConsent' packages/sections/src/pdp_express/model.ts
```
P4 edits the same PDP files after them: the schema anchor in P4.2 Step 4 is P3's last field, and P2/P3 add members to `ExpressModel`; P4's `contactConfig` sits next to `reassurance`, so it does not collide with either.

---

### Task P4.1 — Shared type + Zod schema + pure resolver

**Files:**
- Modify: `packages/shared/src/types/store-config-v2.ts`. This is `StoreCommerceConfig`, lines 382-415; the insert goes after line 414 `order_status_narratives?: …` and before the closing `}` at line 415.
- Create: `packages/shared/src/contact-line.ts`
- Create: `packages/shared/src/contact-line.test.ts`
- Modify: `packages/shared/src/index.ts`, line 24 (`export * from "./cod-risk";`)

- [ ] **Step 1: Write the failing test.** Create `packages/shared/src/contact-line.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CONTACT_LINE_STRINGS,
  CONTACT_WEEKDAY_NAMES,
  formatClock,
  parseStoreContact,
  resolveContactLine,
} from "./contact-line";
import type { StoreCallHours, StoreContactConfig } from "./types/store-config-v2";

// 2026-10-19 is a Monday. Asia/Baghdad is a fixed UTC+3 (no DST since 2008).
const NUMBER = "07779703832";
const SHOWN = "0777 970 3832";
const HOURS: StoreCallHours = {
  days: ["sat", "sun", "mon", "tue", "wed", "thu"],
  from: "10:00",
  to: "21:00",
};
const WITH_HOURS: StoreContactConfig = { call_number: NUMBER, call_hours: HOURS, whatsapp_confirm: true };
const at = (iso: string) => new Date(iso);

describe("resolveContactLine — no call hours (channel only)", () => {
  it("is the approved Arabic sentence when the store sends the WhatsApp confirmation", () => {
    const line = resolveContactLine({ call_number: NUMBER, whatsapp_confirm: true }, "ar", at("2026-10-19T09:00:00Z"));
    expect(line).toEqual({
      variant: "channel",
      text: "راح توصلك رسالة واتساب لتأكيد طلبك، وبعدها اتصال من 0777 970 3832 — رد علينا ويطلع طلبك",
      number: SHOWN,
      dial: NUMBER,
    });
  });

  it("never mentions WhatsApp unless the store says it sends one", () => {
    const line = resolveContactLine({ call_number: NUMBER }, "ar", at("2026-10-19T09:00:00Z"));
    expect(line?.variant).toBe("channel");
    expect(line?.text).toBe("راح يوصلك اتصال من 0777 970 3832 لتأكيد طلبك — رد علينا ويطلع طلبك");
    expect(line?.text).not.toContain("واتساب");
  });

  it("speaks English and Kurdish", () => {
    const now = at("2026-10-19T09:00:00Z");
    expect(resolveContactLine({ call_number: NUMBER, whatsapp_confirm: true }, "en", now)?.text).toBe(
      "You'll get a WhatsApp message to confirm your order, then a call from 0777 970 3832. Answer it and your order ships.",
    );
    expect(resolveContactLine({ call_number: NUMBER }, "ku", now)?.text).toBe(
      "پەیوەندییەکت لە 0777 970 3832 بۆ دێت بۆ دڵنیاکردنەوەی داواکارییەکەت — وەڵام بدەرەوە و داواکارییەکەت دەنێردرێت",
    );
  });

  it("normalizes an E.164 number for display and dialing", () => {
    const line = resolveContactLine({ call_number: "+9647779703832" }, "ar", at("2026-10-19T09:00:00Z"));
    expect(line?.number).toBe(SHOWN);
    expect(line?.dial).toBe(NUMBER);
  });
});

describe("resolveContactLine — with call hours", () => {
  it("inside the window: today, before closing", () => {
    // Monday 12:00 Baghdad.
    const line = resolveContactLine(WITH_HOURS, "ar", at("2026-10-19T09:00:00Z"));
    expect(line?.variant).toBe("open_now");
    expect(line?.text).toBe(
      "راح توصلك رسالة واتساب لتأكيد طلبك، وبعدها اتصال من 0777 970 3832 اليوم قبل الساعة 9 م — رد علينا ويطلع طلبك",
    );
  });

  it("before opening on a call day: today, from opening", () => {
    // Monday 03:30 Baghdad.
    const line = resolveContactLine(WITH_HOURS, "ar", at("2026-10-19T00:30:00Z"));
    expect(line?.variant).toBe("later_today");
    expect(line?.text).toContain("اليوم من الساعة 10 ص");
  });

  it("after closing: tomorrow, from opening", () => {
    // Monday 22:00 Baghdad.
    const line = resolveContactLine(WITH_HOURS, "ar", at("2026-10-19T19:00:00Z"));
    expect(line?.variant).toBe("tomorrow");
    expect(line?.text).toContain("باچر من الساعة 10 ص");
  });

  it("skips a day off and names the next call day", () => {
    // Thursday 22:00 Baghdad; Friday is off.
    const line = resolveContactLine(WITH_HOURS, "ar", at("2026-10-22T19:00:00Z"));
    expect(line?.variant).toBe("next_day");
    expect(line?.text).toContain("يوم السبت من الساعة 10 ص");
    expect(resolveContactLine(WITH_HOURS, "en", at("2026-10-22T19:00:00Z"))?.text).toBe(
      "You'll get a WhatsApp message to confirm your order, then a call from 0777 970 3832 on Saturday from 10 am. Answer it and your order ships.",
    );
  });

  it("on a day off, during the day: tomorrow when tomorrow is a call day", () => {
    // Friday 12:00 Baghdad.
    expect(resolveContactLine(WITH_HOURS, "ar", at("2026-10-23T09:00:00Z"))?.variant).toBe("tomorrow");
  });

  it("reads the clock in the store's zone, not UTC", () => {
    // Monday 21:30 UTC is already Tuesday 00:30 in Baghdad: before opening.
    const line = resolveContactLine(WITH_HOURS, "ar", at("2026-10-19T21:30:00Z"));
    expect(line?.variant).toBe("later_today");
    // The same instant read as UTC would be Monday after hours.
    const utc = resolveContactLine(
      { ...WITH_HOURS, call_hours: { ...HOURS, tz: "UTC" } },
      "ar",
      at("2026-10-19T21:30:00Z"),
    );
    expect(utc?.variant).toBe("tomorrow");
  });

  it("opening minute is inside, closing minute is outside", () => {
    expect(resolveContactLine(WITH_HOURS, "ar", at("2026-10-19T07:00:00Z"))?.variant).toBe("open_now");
    expect(resolveContactLine(WITH_HOURS, "ar", at("2026-10-19T18:00:00Z"))?.variant).toBe("tomorrow");
  });

  it("prints configured minutes and only those", () => {
    const line = resolveContactLine(
      { call_number: NUMBER, call_hours: { ...HOURS, from: "09:30" } },
      "ar",
      at("2026-10-19T19:00:00Z"),
    );
    expect(line?.text).toBe("راح يوصلك اتصال من 0777 970 3832 باچر من الساعة 9:30 ص لتأكيد طلبك — رد علينا ويطلع طلبك");
  });

  it("never promises a number of minutes at any hour of the week", () => {
    const start = Date.parse("2026-10-19T00:00:00Z");
    for (let i = 0; i < 7 * 48; i++) {
      for (const locale of ["ar", "en", "ku"] as const) {
        const text = resolveContactLine(WITH_HOURS, locale, new Date(start + i * 30 * 60_000))?.text ?? "";
        expect(text).not.toMatch(/دقيقة|دقائق|minute|خولەک/);
        expect(text).toContain(SHOWN);
      }
    }
  });
});

describe("resolveContactLine — malformed config degrades, never invents", () => {
  const now = at("2026-10-19T09:00:00Z");

  it.each([undefined, null, "07779703832", 42, {}, { call_number: "" }, { call_number: "0123" }, { call_number: "07701" }])(
    "no usable call number (%j) → no line",
    (raw) => {
      expect(resolveContactLine(raw, "ar", now)).toBeNull();
    },
  );

  it.each([
    { ...HOURS, from: "21:00", to: "10:00" },
    { ...HOURS, from: "10:00", to: "10:00" },
    { ...HOURS, from: "25:00" },
    { ...HOURS, to: "9pm" },
    { ...HOURS, days: [] },
    { ...HOURS, days: ["friday"] },
    { ...HOURS, tz: "Mars/Olympus" },
    "10:00-21:00",
  ])("malformed hours (%j) → channel only", (call_hours) => {
    const line = resolveContactLine({ call_number: NUMBER, call_hours }, "ar", now);
    expect(line?.variant).toBe("channel");
    expect(line?.text).toBe("راح يوصلك اتصال من 0777 970 3832 لتأكيد طلبك — رد علينا ويطلع طلبك");
  });

  it("a non-boolean whatsapp_confirm is ignored, not trusted", () => {
    expect(resolveContactLine({ call_number: NUMBER, whatsapp_confirm: "yes" }, "ar", now)?.text).not.toContain("واتساب");
  });

  it("an invalid moment falls back to channel only", () => {
    expect(resolveContactLine(WITH_HOURS, "ar", new Date(Number.NaN))?.variant).toBe("channel");
  });

  it("parseStoreContact fills the default zone", () => {
    expect(parseStoreContact({ call_number: NUMBER, call_hours: HOURS })?.call_hours?.tz).toBe("Asia/Baghdad");
  });
});

describe("formatClock", () => {
  it.each([
    ["00:00", "ar", "12 ص"],
    ["12:00", "ar", "12 م"],
    ["21:00", "ar", "9 م"],
    ["21:00", "en", "9 pm"],
    ["10:30", "ku", "10:30 پ.ن"],
    ["13:05", "en", "1:05 pm"],
  ] as const)("%s in %s → %s", (hhmm, locale, out) => {
    expect(formatClock(hhmm, locale)).toBe(out);
  });
});

describe("contact-line strings", () => {
  it("every chrome string and weekday carries ar, en and ku", () => {
    for (const entry of [...Object.values(CONTACT_LINE_STRINGS), ...Object.values(CONTACT_WEEKDAY_NAMES)]) {
      for (const locale of ["ar", "en", "ku"] as const) {
        expect(entry[locale].trim()).not.toBe("");
      }
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**
```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/shared/src/contact-line.test.ts
```
Expected: FAIL, because `Failed to resolve import "./contact-line" from "packages/shared/src/contact-line.test.ts". Does the file exist?` (0 tests run).

- [ ] **Step 3: Add the stored types.** In `packages/shared/src/types/store-config-v2.ts`, replace:
```ts
  /** Per-stage copy for the order tracker. Missing stages use the shipped defaults. */
  order_status_narratives?: Partial<Record<CustomerOrderStage, OrderStatusNarrative>>;
}
```
with:
```ts
  /** Per-stage copy for the order tracker. Missing stages use the shipped defaults. */
  order_status_narratives?: Partial<Record<CustomerOrderStage, OrderStatusNarrative>>;
  /** Who contacts the buyer after an order, and when (the "who contacts
   *  you" line). Absent = no line anywhere. */
  contact?: StoreContactConfig;
}

/** Weekday codes for call hours, Sunday first (matches `Date#getUTCDay`). */
export type ContactWeekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/**
 * When the store's team calls buyers to confirm orders. Wall-clock hours in
 * `tz`; `from` is strictly before `to` (no overnight windows). A malformed
 * block is ignored and the line names the channel only — it never guesses.
 */
export interface StoreCallHours {
  days: ContactWeekday[];
  /** "HH:mm", 24-hour. */
  from: string;
  /** "HH:mm", 24-hour, after `from`. */
  to: string;
  /** IANA zone; absent = Asia/Baghdad. */
  tz?: string;
}

/**
 * The structured contact promise shown under the order button and on the
 * thank-you card. `call_number` must be an Iraqi mobile: it is the number
 * the buyer is told to answer, so a malformed one hides the line instead
 * of printing a number nobody calls from.
 */
export interface StoreContactConfig {
  call_number?: string;
  call_hours?: StoreCallHours;
  /** The store sends the instant WhatsApp confirmation for storefront
   *  orders, so the line may announce it. Off unless set. */
  whatsapp_confirm?: boolean;
}
```

- [ ] **Step 4: Implement the resolver.** Create `packages/shared/src/contact-line.ts`:

```ts
// =====================================================================
// "Who contacts you" — the line under the order button
// =====================================================================
// Most COD losses happen after the order is placed: the buyer does not
// answer the confirmation call from a number they do not know. This line
// tells them, before they tap, which number will call and — when the store
// has set call hours — when. One resolver for every surface (PDP classic,
// PDP express, the thank-you card), so they can never disagree.
//
// Honesty rules:
//   • No config, or a call number that is not an Iraqi mobile → no line.
//   • No (valid) call hours → the channel and the number only, no time.
//   • With hours → today / tomorrow / a named weekday, built only from the
//     configured window. It never promises minutes ("within 30 min").
//   • WhatsApp is announced only when the store has said it sends one.
// =====================================================================

import { z } from "zod";
import { formatIraqiPhoneDisplay, normalizeIraqiMobile } from "./phone";
import { utcISOToZonedWallTime } from "./schedule-time";
import { resolveI18n } from "./types/store-config-v2";
import type {
  ContactWeekday,
  I18nString,
  LocaleCode,
  StoreCallHours,
  StoreContactConfig,
} from "./types/store-config-v2";

/** Sunday first, so an index is `Date#getUTCDay()`. */
export const CONTACT_WEEKDAYS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const satisfies readonly ContactWeekday[];

/** The Iraq market's zone; call hours without `tz` are read in it. */
export const DEFAULT_CONTACT_TIMEZONE = "Asia/Baghdad";

const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function clockMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** True when this runtime's Intl knows `tz`. An unknown zone makes Intl
 *  throw a RangeError at format time; the catch IS the answer here (the
 *  zone is rejected and the hours fall back to channel-only), not a
 *  swallowed failure. */
function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const clockSchema = z.string().regex(CLOCK_RE);

export const callHoursSchema = z
  .object({
    days: z.array(z.enum(CONTACT_WEEKDAYS)).min(1),
    from: clockSchema,
    to: clockSchema,
    tz: z.string().refine(isTimeZone).default(DEFAULT_CONTACT_TIMEZONE),
  })
  .refine((h) => clockMinutes(h.from) < clockMinutes(h.to));

/** Parses the stored `commerce.contact` jsonb. `call_number` comes out
 *  normalized to `07XXXXXXXXX`; a malformed `call_hours` or
 *  `whatsapp_confirm` degrades to absent instead of failing the parse. */
export const storeContactConfigSchema = z.object({
  call_number: z
    .string()
    .transform((v) => normalizeIraqiMobile(v))
    .pipe(z.string()),
  call_hours: callHoursSchema.optional().catch(undefined),
  whatsapp_confirm: z.boolean().optional().catch(undefined),
});

type ParsedCallHours = Required<StoreCallHours>;
type ParsedStoreContact = Required<Pick<StoreContactConfig, "call_number">> & {
  call_hours?: ParsedCallHours;
  whatsapp_confirm?: boolean;
};

/** The stored contact block, validated — or null when there is no usable
 *  call number. The return type is the stored type, so the schema and
 *  `StoreContactConfig` cannot drift apart without a type error. */
export function parseStoreContact(raw: unknown): ParsedStoreContact | null {
  const parsed = storeContactConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Chrome strings. Every entry carries ar, en and ku. */
export const CONTACT_LINE_STRINGS = {
  leadWhatsapp: {
    ar: "راح توصلك رسالة واتساب لتأكيد طلبك، وبعدها اتصال من {number}{when} — رد علينا ويطلع طلبك",
    en: "You'll get a WhatsApp message to confirm your order, then a call from {number}{when}. Answer it and your order ships.",
    ku: "نامەیەکی واتسئاپت بۆ دێت بۆ دڵنیاکردنەوەی داواکارییەکەت، پاشان پەیوەندییەک لە {number}{when} — وەڵام بدەرەوە و داواکارییەکەت دەنێردرێت",
  },
  leadCall: {
    ar: "راح يوصلك اتصال من {number}{when} لتأكيد طلبك — رد علينا ويطلع طلبك",
    en: "You'll get a call from {number}{when} to confirm your order. Answer it and your order ships.",
    ku: "پەیوەندییەکت لە {number}{when} بۆ دێت بۆ دڵنیاکردنەوەی داواکارییەکەت — وەڵام بدەرەوە و داواکارییەکەت دەنێردرێت",
  },
  openNow: {
    ar: "اليوم قبل الساعة {to}",
    en: "today before {to}",
    ku: "ئەمڕۆ پێش کاتژمێر {to}",
  },
  laterToday: {
    ar: "اليوم من الساعة {from}",
    en: "today from {from}",
    ku: "ئەمڕۆ لە کاتژمێر {from} بەدواوە",
  },
  tomorrow: {
    ar: "باچر من الساعة {from}",
    en: "tomorrow from {from}",
    ku: "سبەینێ لە کاتژمێر {from} بەدواوە",
  },
  nextDay: {
    ar: "يوم {day} من الساعة {from}",
    en: "on {day} from {from}",
    ku: "ڕۆژی {day} لە کاتژمێر {from} بەدواوە",
  },
  am: { ar: "ص", en: "am", ku: "پ.ن" },
  pm: { ar: "م", en: "pm", ku: "د.ن" },
} satisfies Record<string, Required<I18nString>>;

export const CONTACT_WEEKDAY_NAMES = {
  sun: { ar: "الأحد", en: "Sunday", ku: "یەکشەممە" },
  mon: { ar: "الاثنين", en: "Monday", ku: "دووشەممە" },
  tue: { ar: "الثلاثاء", en: "Tuesday", ku: "سێشەممە" },
  wed: { ar: "الأربعاء", en: "Wednesday", ku: "چوارشەممە" },
  thu: { ar: "الخميس", en: "Thursday", ku: "پێنجشەممە" },
  fri: { ar: "الجمعة", en: "Friday", ku: "هەینی" },
  sat: { ar: "السبت", en: "Saturday", ku: "شەممە" },
} satisfies Record<ContactWeekday, Required<I18nString>>;

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out;
}

/** "21:00" → "9 م" / "9 pm" / "9 د.ن"; "10:30" → "10:30 ص". Minutes only
 *  when the configured time has them. */
export function formatClock(hhmm: string, locale: LocaleCode): string {
  const total = clockMinutes(hhmm);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
  const suffix = resolveI18n(h < 12 ? CONTACT_LINE_STRINGS.am : CONTACT_LINE_STRINGS.pm, locale);
  return `${h12}${mm} ${suffix}`;
}

export type ContactLineVariant =
  | "channel"
  | "open_now"
  | "later_today"
  | "tomorrow"
  | "next_day";

/** Named `Resolved…` so it never collides with the `<ContactLine>`
 *  component in `@scheniders/sections` when a file imports both. */
export interface ResolvedContactLine {
  variant: ContactLineVariant;
  /** The full sentence, number included. */
  text: string;
  /** The number as printed in `text` (`0777 970 3832`). */
  number: string;
  /** The same number in dialable local form (`07779703832`), for tel: and vCard. */
  dial: string;
}

type TimedVariant = Exclude<ContactLineVariant, "channel">;

/** Where `now` falls against the call window, read in the window's zone.
 *  Null only if no configured day exists, which the schema rules out. */
function callWindow(
  hours: ParsedCallHours,
  now: Date,
): { variant: TimedVariant; day: ContactWeekday } | null {
  const wall = utcISOToZonedWallTime(now.toISOString(), hours.tz);
  const [date, time] = wall.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const nowMin = clockMinutes(time);
  const open = new Set<ContactWeekday>(hours.days);
  const today = CONTACT_WEEKDAYS[dow];
  if (open.has(today)) {
    if (nowMin < clockMinutes(hours.from)) return { variant: "later_today", day: today };
    if (nowMin < clockMinutes(hours.to)) return { variant: "open_now", day: today };
  }
  for (let ahead = 1; ahead <= 7; ahead++) {
    const day = CONTACT_WEEKDAYS[(dow + ahead) % 7];
    if (open.has(day)) return { variant: ahead === 1 ? "tomorrow" : "next_day", day };
  }
  return null;
}

const WHEN_KEY: Record<TimedVariant, keyof typeof CONTACT_LINE_STRINGS> = {
  open_now: "openNow",
  later_today: "laterToday",
  tomorrow: "tomorrow",
  next_day: "nextDay",
};

/**
 * The "who contacts you" sentence for `raw` (the stored
 * `commerce.contact`) at the moment `now` — the render moment on the PDP,
 * the order moment on the thank-you card. Null = render nothing.
 */
export function resolveContactLine(
  raw: unknown,
  locale: LocaleCode,
  now: Date,
): ResolvedContactLine | null {
  const contact = parseStoreContact(raw);
  if (!contact) return null;
  const dial = contact.call_number;
  const number = formatIraqiPhoneDisplay(dial);
  const lead = resolveI18n(
    contact.whatsapp_confirm ? CONTACT_LINE_STRINGS.leadWhatsapp : CONTACT_LINE_STRINGS.leadCall,
    locale,
  );
  const slot =
    contact.call_hours && !Number.isNaN(now.getTime())
      ? callWindow(contact.call_hours, now)
      : null;
  if (!slot || !contact.call_hours) {
    return { variant: "channel", text: fill(lead, { number, when: "" }), number, dial };
  }
  const when = fill(resolveI18n(CONTACT_LINE_STRINGS[WHEN_KEY[slot.variant]], locale), {
    from: formatClock(contact.call_hours.from, locale),
    to: formatClock(contact.call_hours.to, locale),
    day: resolveI18n(CONTACT_WEEKDAY_NAMES[slot.day], locale),
  });
  return {
    variant: slot.variant,
    text: fill(lead, { number, when: ` ${when}` }),
    number,
    dial,
  };
}
```

- [ ] **Step 5: Export from the barrel.** In `packages/shared/src/index.ts`, replace:
```ts
export * from "./cod-risk";
```
with:
```ts
export * from "./cod-risk";
export * from "./contact-line";
```

- [ ] **Step 6: Run the tests and watch them pass.**
```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/shared/src/contact-line.test.ts packages/shared/src/schedule-time.test.ts packages/shared/src/phone.test.ts packages/shared/src/types/store-config-v2.test.ts
```
Expected: PASS, with `contact-line.test.ts` at 39 tests passing and the other three files still green.

- [ ] **Step 7: Type-check both consumers.**
```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check
```
Expected: both exit 0.

- [ ] **Step 8: Commit.**
```bash
cd /Users/ali/scheniders-mono && test -z "$(git rev-parse -q --verify MERGE_HEAD)" && git branch --show-current | grep -qx feat/pdp-entry-atelier && \
git add packages/shared/src/types/store-config-v2.ts packages/shared/src/contact-line.ts packages/shared/src/contact-line.test.ts packages/shared/src/index.ts && \
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(shared): structured commerce.contact and the who-contacts-you resolver

One pure resolver turns the store's call number and optional call hours
(Asia/Baghdad by default) into the line under the order button: channel
only without hours, today/tomorrow/next call day with them, never a
promised number of minutes. WhatsApp is announced only when the store
says it sends the confirmation. Malformed stored values degrade to
channel-only or no line. ar/en/ku chrome strings.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P4.2 — `<ContactLine>` component + opt-in `show_contact_line` in both PDP layouts

**Files:** (line numbers below were read from the tree *before* P2 and P3. P2.7/P2.8 and P3.5/P3.6 edit these same files first, so every line here has moved. Each step quotes its anchor text: match on that, never on the number.)
- Create: `packages/sections/src/helpers/contact-line.tsx`
- Create: `packages/sections/src/_pdp-contact-line.test.tsx`
- Modify: `packages/sections/src/pdp_direct_order.tsx`. Before P3 the schema's last field was `scroll_hint_i18n` (line 160). After P3.5 Step 3 it is `capture_consent_i18n`, and Step 4 anchors on that.
- Modify: `packages/sections/src/pdp_direct_order.client.tsx`:
  - import block at line 85 (`import { isOptimizableImageHost } …`)
  - `const commerce = (` at lines 655-657
  - express model object, `reassurance,` at line 1220
  - classic reassurance block at lines 2106-2117, followed by `{waHref && (` at line 2119
- Modify: `packages/sections/src/pdp_express/model.ts`, the type import at lines 7-10 and `reassurance: string;` at line 99
- Modify: `packages/sections/src/pdp_express/checkout-row.tsx`, the import at line 15 and the reassurance block at lines 220-231 (before `{m.status === "error" && (` at line 233)
- Modify (comment only): `packages/sections/src/helpers/section-tenant.ts`, lines 21-25

- [ ] **Step 1: Write the failing test.** Create `packages/sections/src/_pdp-contact-line.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run it and watch it fail.**
```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_pdp-contact-line.test.tsx
```
Expected: FAIL, because `Failed to resolve import "./helpers/contact-line" from "packages/sections/src/_pdp-contact-line.test.tsx"`.

- [ ] **Step 3: Create the component.** Create `packages/sections/src/helpers/contact-line.tsx`:

```tsx
"use client";

// =====================================================================
// <ContactLine> — "who contacts you, and when", under an order button
// =====================================================================
// Renders `resolveContactLine` (packages/shared/src/contact-line.ts) for
// the store's `commerce.contact`. Server and hydrating client both start
// from the request moment (`ctx.runtime.now`), so the first paint matches;
// after mount the browser clock takes over, and a timed line re-reads it
// every minute so a page left open across closing time stops saying
// "today". A channel-only line never ticks. Styling is the caller's: the
// classic and express layouts each match their own reassurance line.
// =====================================================================

import { useEffect, useState } from "react";
import { resolveContactLine } from "@scheniders/shared";
import type { LocaleCode, StoreContactConfig } from "@scheniders/shared";
import { MaterialIcon } from "./primitives";

/** How often a timed line re-reads the clock. */
export const CONTACT_LINE_TICK_MS = 60_000;

export function ContactLine({
  contact,
  locale,
  initialNow,
  className,
  iconClassName,
}: {
  /** The stored `commerce.contact`; validated by the resolver. */
  contact: StoreContactConfig | undefined;
  locale: LocaleCode;
  /** The request moment (`ctx.runtime.now`). */
  initialNow: Date;
  className: string;
  iconClassName: string;
}) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const line = resolveContactLine(contact, locale, now);
  const timed = line !== null && line.variant !== "channel";

  useEffect(() => {
    if (!timed) return;
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, CONTACT_LINE_TICK_MS);
    return () => clearInterval(id);
  }, [timed]);

  if (!line) return null;
  const at = line.text.indexOf(line.number);
  return (
    <p className={className} data-contact-line={line.variant}>
      <MaterialIcon name="call" className={iconClassName} />
      <span>
        {at === -1 ? (
          line.text
        ) : (
          <>
            {line.text.slice(0, at)}
            <bdi className="whitespace-nowrap">{line.number}</bdi>
            {line.text.slice(at + line.number.length)}
          </>
        )}
      </span>
    </p>
  );
}
```

- [ ] **Step 4: Add the opt-in prop.** P3.5 Step 3 has already appended `show_capture_consent` and `capture_consent_i18n` after `scroll_hint_i18n`, so the schema's last field is now `capture_consent_i18n`. In `packages/sections/src/pdp_direct_order.tsx`, replace:
```ts
  capture_consent_i18n: i18nStringOptional.catch(undefined),
});
```
with:
```ts
  capture_consent_i18n: i18nStringOptional.catch(undefined),
  /** "Who contacts you" line under the submit, in both layouts: the call
   *  number (and, when set, the call hours) from the store's
   *  `commerce.contact`. Hidden when the store has no usable contact
   *  config. Absent = no line, byte-identical for every existing config. */
  show_contact_line: z.boolean().optional().catch(undefined),
});
```

- [ ] **Step 5: Wire the classic layout and the express model.** Make four edits in `packages/sections/src/pdp_direct_order.client.tsx`.

  (a) Replace:
```ts
import { isOptimizableImageHost } from "./helpers/image";
```
with:
```ts
import { isOptimizableImageHost } from "./helpers/image";
import { ContactLine } from "./helpers/contact-line";
```

  (b) Replace:
```ts
  const commerce = (
    ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined
  )?.store_config_v2?.commerce;
```
with:
```ts
  const commerce = (
    ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined
  )?.store_config_v2?.commerce;
  // "Who contacts you" line: opt-in per section, and only for a store that
  // configured `commerce.contact` (the resolver validates what is stored).
  const contactConfig = props.show_contact_line ? commerce?.contact : undefined;
```

  (c) Replace this, inside the `<PdpExpress model={{ … }}>` object:
```ts
          reassurance,
          deliverySla,
          featureCards,
```
with:
```ts
          reassurance,
          contactConfig,
          deliverySla,
          featureCards,
```

  (d) Replace this, in the classic submit block:
```tsx
                  <MaterialIcon
                    name="visibility"
                    className="text-lg text-bk-primary"
                  />
                  {reassurance}
                </p>
              )}
```
with:
```tsx
                  <MaterialIcon
                    name="visibility"
                    className="text-lg text-bk-primary"
                  />
                  {reassurance}
                </p>
              )}

              {contactConfig && (
                <ContactLine
                  contact={contactConfig}
                  locale={locale}
                  initialNow={ctx.runtime.now}
                  className="flex items-center justify-center gap-1.5 text-center font-body text-sm text-bk-ink-soft"
                  iconClassName="text-lg text-bk-primary"
                />
              )}
```

- [ ] **Step 6: Add the model field.** Make two edits in `packages/sections/src/pdp_express/model.ts`.

  First, replace:
```ts
import type {
  GovernorateShippingConfig,
  LocaleCode,
} from "@scheniders/shared";
```
with:
```ts
import type {
  GovernorateShippingConfig,
  LocaleCode,
  StoreContactConfig,
} from "@scheniders/shared";
```

  Then replace:
```ts
  reassurance: string;
  deliverySla: string;
```
with:
```ts
  reassurance: string;
  /** The store's `commerce.contact` when the section opted into the
   *  "who contacts you" line; undefined = no line. */
  contactConfig: StoreContactConfig | undefined;
  deliverySla: string;
```

- [ ] **Step 7: Wire the express layout.** Make two edits in `packages/sections/src/pdp_express/checkout-row.tsx`.

  First, replace:
```ts
import { formatPrice } from "../helpers/format";
```
with:
```ts
import { ContactLine } from "../helpers/contact-line";
import { formatPrice } from "../helpers/format";
```

  Then replace:
```tsx
          <MaterialIcon name="verified_user" className="text-base text-bk-success" />
          {m.reassurance}
        </p>
      )}
```
with:
```tsx
          <MaterialIcon name="verified_user" className="text-base text-bk-success" />
          {m.reassurance}
        </p>
      )}

      {m.contactConfig && (
        <ContactLine
          contact={m.contactConfig}
          locale={locale}
          initialNow={m.ctx.runtime.now}
          className={cn(
            "flex items-center justify-center gap-1.5 text-center font-bk-body text-[13px] text-bk-ink-soft",
            rtl && "flex-row-reverse",
          )}
          iconClassName="text-base text-bk-primary"
        />
      )}
```

- [ ] **Step 8: Update the tenant-contract comment.** This is a comment-only edit to keep the documented field list true. In `packages/sections/src/helpers/section-tenant.ts`, replace:
```ts
//   store_config_v2.commerce
//                           cart_summary, checkout_form, checkout_order_summary,
//                           pdp_direct_order, product_bundles (delivery fees,
//                           discounts, bundles), order_tracker
//                           (order_status_narratives)
```
with:
```ts
//   store_config_v2.commerce
//                           cart_summary, checkout_form, checkout_order_summary,
//                           pdp_direct_order, product_bundles (delivery fees,
//                           discounts, bundles), order_tracker
//                           (order_status_narratives), pdp_direct_order
//                           (contact: the "who contacts you" line)
```

- [ ] **Step 9: Run the new test and the regression guards.**
```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_pdp-contact-line.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-express-cta.test.tsx packages/sections/src/_pdp-express-trust.test.tsx packages/sections/src/_pdp-form.test.tsx packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/_registry.test.ts packages/shared/src/contact-line.test.ts
```
Expected:
- PASS overall.
- `_pdp-contact-line.test.tsx`: 17 passing.
- Classic and express snapshot files pass **with no snapshot written or updated**, which proves the default markup is byte-identical.
- `_kurdish-coverage` passes, because no `STRINGS` entry was added to `pdp_direct_order.client.tsx`; the new chrome strings live in shared and carry `ku`.

- [ ] **Step 10: Run the full sections and shared suites.**
```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections packages/shared
```
Expected: PASS, with the same failures as before this task: zero new failures.

- [ ] **Step 11: Type-check and lint.**
```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check && pnpm lint
```
Expected: all exit 0. Lint may show warnings but no errors.

- [ ] **Step 12: Commit.**
```bash
cd /Users/ali/scheniders-mono && test -z "$(git rev-parse -q --verify MERGE_HEAD)" && git branch --show-current | grep -qx feat/pdp-entry-atelier && \
git add packages/sections/src/helpers/contact-line.tsx packages/sections/src/_pdp-contact-line.test.tsx packages/sections/src/pdp_direct_order.tsx packages/sections/src/pdp_direct_order.client.tsx packages/sections/src/pdp_express/model.ts packages/sections/src/pdp_express/checkout-row.tsx packages/sections/src/helpers/section-tenant.ts && \
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): opt-in who-contacts-you line under the PDP submit

show_contact_line renders the store's commerce.contact promise under the
order button in both classic and express, after the reassurance line,
through one <ContactLine> that piece 5's thank-you card can reuse. Server
and hydration start from ctx.runtime.now; the browser clock takes over
after mount and a timed line re-reads it each minute. Absent prop or no
usable contact config = no markup, so both PDP baselines are unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P4.3 — One call number: `resolveTrackerContact` follows `commerce.contact.call_number`

The order tracker (`order_tracker.client.tsx:155`), the store builder's "Order tracking messages" preview (`apps/platform/app/store/edit/page.tsx:189`) and piece 5's call card (P5 plan, "Call number") all name the number that calls the buyer through `resolveTrackerContact`. Today it reads `store_config.contact.phone_number`, then the WhatsApp number. Without this task, a store whose `commerce.contact.call_number` differs from `phone_number` would see the PDP line name one number and the thank-you card another. That is the drift the spec's "one shared resolver" exists to prevent. The structured number wins when it parses; otherwise the existing chain is unchanged. No store has `commerce.contact` today, so every current tracker renders byte-identically.

**Files:**
- Modify: `packages/sections/src/helpers/whatsapp.ts`: the import at line 14, `TenantContactShape` at lines 82-90, and `resolveTrackerContact` with its doc comment at lines 116-127
- Modify: `packages/sections/src/_order-tracker.test.tsx`: the `describe("resolveTrackerContact")` block at lines 110-124
- Modify: `apps/platform/app/store/edit/page.tsx`: the `resolveTrackerContact({ … })` call at lines 189-192
- Modify (comment only): `packages/sections/src/helpers/section-tenant.ts`, the `store_config_v2.commerce` reader list (edited in P4.2 Step 8)

- [ ] **Step 1: Write the failing test.** In `packages/sections/src/_order-tracker.test.tsx`, replace:
```ts
    expect(resolveTrackerContact({ store_config: { contact: {} } })).toBeNull();
    expect(resolveTrackerContact(null)).toBeNull();
  });
});
```
with:
```ts
    expect(resolveTrackerContact({ store_config: { contact: {} } })).toBeNull();
    expect(resolveTrackerContact(null)).toBeNull();
  });

  it("prefers the structured commerce.contact call number, normalized, over every legacy field", () => {
    expect(
      resolveTrackerContact({
        store_config: { contact: { phone_number: "07701112233", whatsapp_number: "07804445566" } },
        contact_phone: "07507778899",
        store_config_v2: { commerce: { contact: { call_number: "+9647779703832" } } },
      }),
    ).toBe("07779703832");
  });

  it("ignores an unusable structured number and keeps the legacy chain", () => {
    expect(
      resolveTrackerContact({
        store_config: { contact: { phone_number: "07701112233" } },
        store_config_v2: { commerce: { contact: { call_number: "0123" } } },
      }),
    ).toBe("07701112233");
    expect(
      resolveTrackerContact({ store_config_v2: { commerce: null }, contact_phone: "07507778899" }),
    ).toBe("07507778899");
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**
```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_order-tracker.test.tsx
```
Expected: FAIL in `prefers the structured commerce.contact call number…`: `expected '07701112233' to be '07779703832'`. The fallback test already passes, because it pins today's behaviour.

- [ ] **Step 3: Implement.** In `packages/sections/src/helpers/whatsapp.ts`, replace:
```ts
import type { LocaleCode } from "@scheniders/shared";
```
with:
```ts
import { parseStoreContact } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
```

Then replace:
```ts
  contact_phone?: string | null;
}
```
(the closing lines of `interface TenantContactShape`) with:
```ts
  contact_phone?: string | null;
  /** The structured "who contacts you" config (P4). Validated by
   *  `parseStoreContact`; the raw jsonb is never trusted as-is. */
  store_config_v2?: { commerce?: { contact?: unknown } | null } | null;
}
```

Then replace:
```ts
/**
 * The number the order tracker writes into `{contact}` and dials for its
 * call button: the store's configured call number, else its WhatsApp number.
 * The store builder's "Order tracking messages" preview resolves through this
 * too, so the merchant sees exactly which lines survive on the storefront.
 */
export function resolveTrackerContact(tenant: unknown): string | null {
  const t = (tenant ?? {}) as TenantContactShape;
  const phone = t.store_config?.contact?.phone_number;
```
with:
```ts
/**
 * The number that calls the buyer to confirm an order. The order tracker
 * writes it into `{contact}` and dials it, and the thank-you call card shows
 * it. It is the structured `commerce.contact.call_number` (the number the PDP
 * "who contacts you" line names) when that parses as an Iraqi mobile, else
 * the store's configured call number, else its WhatsApp number. The store
 * builder's "Order tracking messages" preview resolves through this too, so
 * the merchant sees exactly which lines survive on the storefront.
 */
export function resolveTrackerContact(tenant: unknown): string | null {
  const t = (tenant ?? {}) as TenantContactShape;
  const structured = parseStoreContact(t.store_config_v2?.commerce?.contact);
  if (structured) return structured.call_number;
  const phone = t.store_config?.contact?.phone_number;
```

- [ ] **Step 4: Keep the editor preview on the same number.** In `apps/platform/app/store/edit/page.tsx`, replace:
```ts
                tracking_contact: resolveTrackerContact({
                    store_config: t.store_config,
                    contact_phone: t.contact_phone,
                }),
```
with:
```ts
                tracking_contact: resolveTrackerContact({
                    store_config: t.store_config,
                    contact_phone: t.contact_phone,
                    // The draft's structured call number, as the storefront
                    // tracker reads it once the draft is published.
                    store_config_v2: { commerce: initialConfig.commerce },
                }),
```

- [ ] **Step 5: Update the tenant-contract comment.** In `packages/sections/src/helpers/section-tenant.ts`, replace:
```ts
//                           (order_status_narratives), pdp_direct_order
//                           (contact: the "who contacts you" line)
```
with:
```ts
//                           (order_status_narratives), pdp_direct_order
//                           (contact: the "who contacts you" line),
//                           helpers/whatsapp resolveTrackerContact (contact)
```

- [ ] **Step 6: Run the tests and watch them pass.**
```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_order-tracker.test.tsx packages/sections/src/_pdp-contact-line.test.tsx packages/shared/src/contact-line.test.ts
```
Expected: PASS. Every pre-existing `_order-tracker` test is still green, because no fixture there sets `commerce.contact`.

- [ ] **Step 7: Type-check and lint.**
```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check && pnpm lint
```
Expected: all exit 0. Lint may show warnings but no errors.

- [ ] **Step 8: Commit.**
```bash
cd /Users/ali/scheniders-mono && test -z "$(git rev-parse -q --verify MERGE_HEAD)" && git branch --show-current | grep -qx feat/pdp-entry-atelier && \
git add packages/sections/src/helpers/whatsapp.ts packages/sections/src/_order-tracker.test.tsx apps/platform/app/store/edit/page.tsx packages/sections/src/helpers/section-tenant.ts && \
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): tracker and call card name the structured call number

resolveTrackerContact now prefers commerce.contact.call_number (validated
by parseStoreContact) before the legacy phone_number / WhatsApp chain, so
the PDP who-contacts-you line, the order tracker and the thank-you call
card can never name different numbers. The store builder's tracking
preview reads the draft's structured number too. Stores without
commerce.contact resolve exactly as before.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P4.4 — scheniders-iraq draft config (draft only, never published here)

There are no repo files and no migration in this task: the config is jsonb, so nothing about the schema changes. Run every SQL statement through the Supabase MCP `execute_sql` against project `sduvpgqwhxragxtxztur` (NEW). Never touch `store_config_v2` (published), and never call the publish RPC.

**What gets written and why:**
- `call_number`: `07779703832`. It is the store's single configured number: `tenants.contact_phone` is `+9647779703832` and `store_config.contact.whatsapp_number` is `07779703832`.
- `whatsapp_confirm: true`. The tenant's `app_settings.whatsapp_auto_send.enabled` is `true` (verified 2026-10-21), and piece 1 is built before this piece.
- No `call_hours`. The merchant has not confirmed call hours (open merchant question: "What are the real confirmation-call hours, including Fridays?"), so the line stays channel-only and invents nothing. Once the merchant answers, add hours with the same `jsonb_set` on the `{commerce,contact,call_hours}` path.
- `show_contact_line: true` on the draft `pdp_direct_order` section `aae22169-cef4-4495-842b-863a7caa71c2`. Its props live at `pages[i].sections[j].base` (verified). The draft section is in `layout: "express"`.
- `updated_at = now()` on the same row. The store builder's autosave writes its whole in-memory config over `store_config_v2_draft` (`apps/platform/hooks/use-store-builder-v2.ts:459-461`), and it offers a local crash backup only when that backup is newer than the row's `updated_at` (EC33, same file, lines 79-84). Bumping `updated_at` makes any older local backup stale, so it cannot resurrect a draft without these two paths.
- **Before Step 2, make sure no store-builder tab is open for scheniders-iraq.** An open editor holding the pre-write config would overwrite the new paths on its next autosave. If one is open, close it, run Step 2, then reload the editor so it hydrates from the row.

- [ ] **Step 1: Check the preconditions (read-only).**
```sql
select t.id,
       t.store_config_v2_draft -> 'commerce' -> 'contact'                     as draft_contact,
       t.store_config_v2       -> 'commerce' -> 'contact'                     as published_contact,
       (select a.value from public.app_settings a
         where a.tenant_id = t.id and a.key = 'whatsapp_auto_send')          as auto_send,
       (select count(*)
          from jsonb_array_elements(t.store_config_v2_draft -> 'pages') p,
               jsonb_array_elements(p.value -> 'sections') s
         where s.value ->> 'id' = 'aae22169-cef4-4495-842b-863a7caa71c2'
           and s.value ->> 'type' = 'pdp_direct_order')                       as pdp_matches
from public.tenants t
where t.slug = 'scheniders-iraq';
```
Expected: one row with
- `id = b5c4f2d4-834f-4af4-822d-9b9826a8f45a`
- `draft_contact = null`
- `published_contact = null`
- `auto_send` containing `"enabled": true`
- `pdp_matches = 1`

If `auto_send.enabled` is not `true`, or piece 1 has not shipped with this tenant in `STOREFRONT_WA_CONFIRM_TENANT_IDS`, write `"whatsapp_confirm": false` in Step 2 instead of `true`.

- [ ] **Step 2: Write the draft.** Only two paths change.
```sql
with target as (
  select t.id,
         (p.ordinality - 1)::int as page_idx,
         (s.ordinality - 1)::int as sec_idx
  from public.tenants t,
       jsonb_array_elements(t.store_config_v2_draft -> 'pages') with ordinality p,
       jsonb_array_elements(p.value -> 'sections') with ordinality s
  where t.slug = 'scheniders-iraq'
    and s.value ->> 'id' = 'aae22169-cef4-4495-842b-863a7caa71c2'
    and s.value ->> 'type' = 'pdp_direct_order'
)
update public.tenants t
set store_config_v2_draft = jsonb_set(
      jsonb_set(t.store_config_v2_draft, '{commerce,contact}',
                '{"call_number":"07779703832","whatsapp_confirm":true}'::jsonb, true),
      array['pages', x.page_idx::text, 'sections', x.sec_idx::text, 'base', 'show_contact_line'],
      'true'::jsonb, true),
    updated_at = now()
from target x
where t.id = x.id
returning t.id,
          t.store_config_v2_draft -> 'commerce' -> 'contact' as contact,
          t.store_config_v2_draft -> 'pages' -> x.page_idx -> 'sections' -> x.sec_idx -> 'base' -> 'show_contact_line' as flag;
```
Expected: one row with `contact = {"call_number": "07779703832", "whatsapp_confirm": true}` and `flag = true`.

A no-write `SELECT` version of the same `jsonb_set` expression was dry-run on 2026-10-21. With the two new paths removed, the result was identical to the current draft (`only_two_paths_changed = true`), and the target matched once. The only other column written is `updated_at`.

- [ ] **Step 3: Verify that the published config is untouched and the draft parses.**
```sql
select t.store_config_v2 -> 'commerce' -> 'contact' as published_contact,
       (select s.value -> 'base' -> 'show_contact_line'
          from jsonb_array_elements(t.store_config_v2 -> 'pages') p,
               jsonb_array_elements(p.value -> 'sections') s
         where s.value ->> 'type' = 'pdp_direct_order' limit 1)  as published_flag,
       t.store_config_v2_draft -> 'commerce' ?& array['shipping','discounts','contact'] as draft_commerce_intact,
       t.store_config_rev
from public.tenants t
where t.slug = 'scheniders-iraq';
```
Expected:
- `published_contact = null`
- `published_flag = null`
- `draft_commerce_intact = true`
- `store_config_rev` unchanged from before Step 2. Draft writes never bump it; only publish does (`20260622130000_publish_optimistic_lock.sql:5`).

- [ ] **Step 4: Check the live draft view locally.** Run `pnpm dev:storefront` (port 3001). Get a product slug with `select slug from products where tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a' and status = 'active' and is_visible limit 1;`. Open `http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/<slug>` (`apps/storefront/app/api/draft-view/route.ts`). No `PREVIEW_TOKEN_SECRET` is set in `apps/storefront/.env.local`, so outside production the literal dev token is accepted (`apps/storefront/lib/preview-access.ts:16-28`). The route sets the httpOnly `sb_draft_view` cookie, and `getTenantBySlug` then renders `store_config_v2_draft` in place of the published config (`apps/storefront/lib/tenant.ts:147-156`). Open `/s/scheniders-iraq/products/<slug>` without the cookie (a private window) for the published check below.
  - Expected: under «ثبّت طلبي» and the reassurance line «تفتح وتجرب قبل ما تدفع، والتيستر هدية وياه», this line appears with a call icon: «راح توصلك رسالة واتساب لتأكيد طلبك، وبعدها اتصال من 0777 970 3832 — رد علينا ويطلع طلبك».
  - The `<p>` carries `data-contact-line="channel"`.
  - The trust strip (`under_cta`) still renders below it.
  - The published storefront shows no line.
  - If the Playwright MCP is wedged, check the server-rendered markup with `curl … | grep -o 'data-contact-line="[a-z_]*"'`.

- [ ] **Step 5: Handoff note.** No commit. Publishing the draft waits for merchant sign-off and must happen only after piece 1 is live for this tenant; otherwise «رسالة واتساب» would be a false promise. If piece 1 is not yet live when publishing, first set `{commerce,contact,whatsapp_confirm}` to `false` with the same `jsonb_set` pattern.