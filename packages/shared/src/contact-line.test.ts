import { describe, expect, it } from "vitest";
import {
  CONTACT_LINE_STRINGS,
  CONTACT_WEEKDAY_NAMES,
  formatClock,
  parseStoreContact,
  resolveContactLine,
  storeContactNameSchema,
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

describe("commerce.contact.name_i18n", () => {
  it("parses a per-locale store name beside the call number", () => {
    expect(
      parseStoreContact({ call_number: NUMBER, name_i18n: { ar: "شنايدر", en: "Scheniders" } })?.name_i18n,
    ).toEqual({ ar: "شنايدر", en: "Scheniders" });
  });

  it("is absent when not set", () => {
    expect(parseStoreContact({ call_number: NUMBER })?.name_i18n).toBeUndefined();
  });

  it("a malformed name degrades to absent and never costs the call number", () => {
    for (const bad of ["شنايدر", { ar: 5 }, null, []]) {
      const parsed = parseStoreContact({ call_number: NUMBER, name_i18n: bad });
      expect(parsed?.call_number).toBe(NUMBER);
      expect(parsed?.name_i18n).toBeUndefined();
    }
  });

  it("the exported name schema is the one the contact schema uses", () => {
    expect(storeContactNameSchema.safeParse({ ku: "شنایدەر" }).success).toBe(true);
    expect(storeContactNameSchema.safeParse("شنايدر").success).toBe(false);
  });
});
