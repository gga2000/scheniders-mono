import { describe, it, expect } from "vitest";
import {
  resolveVisitorLocale,
  parseAcceptLanguage,
  LOCALE_COOKIE,
} from "./locale";

describe("parseAcceptLanguage", () => {
  it("ranks by q and reduces to base language codes", () => {
    expect(parseAcceptLanguage("en-US,en;q=0.9,ar;q=0.8")).toEqual([
      "en",
      "en",
      "ar",
    ]);
    expect(parseAcceptLanguage("ar;q=0.3, ku;q=0.9")).toEqual(["ku", "ar"]);
  });
  it("handles empty / missing headers", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
  });
});

describe("resolveVisitorLocale (EC13)", () => {
  const base = { enabledLocales: ["ar", "en"] as const, defaultLocale: "ar" as const };

  it("honours an explicit cookie choice when enabled", () => {
    expect(
      resolveVisitorLocale({ ...base, cookieLocale: "en" }),
    ).toBe("en");
  });

  it("ignores a cookie for a locale the store did NOT enable", () => {
    expect(
      resolveVisitorLocale({ ...base, cookieLocale: "ku" }),
    ).toBe("ar"); // falls through to default
  });

  it("falls back to Accept-Language when no cookie", () => {
    expect(
      resolveVisitorLocale({ ...base, acceptLanguage: "en-US,en;q=0.9" }),
    ).toBe("en");
  });

  it("cookie beats Accept-Language", () => {
    expect(
      resolveVisitorLocale({
        ...base,
        cookieLocale: "ar",
        acceptLanguage: "en-US",
      }),
    ).toBe("ar");
  });

  it("falls back to default_locale when neither cookie nor Accept-Language match", () => {
    expect(
      resolveVisitorLocale({ ...base, acceptLanguage: "fr-FR,de;q=0.5" }),
    ).toBe("ar");
  });

  it("never returns a non-enabled locale (single-locale store)", () => {
    expect(
      resolveVisitorLocale({
        enabledLocales: ["ar"],
        defaultLocale: "ar",
        cookieLocale: "en",
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("ar");
  });

  it("defaults to Arabic when enabled_locales is empty/undefined", () => {
    expect(
      resolveVisitorLocale({ enabledLocales: undefined, defaultLocale: undefined }),
    ).toBe("ar");
  });

  it("uses the first enabled locale when the default isn't enabled", () => {
    expect(
      resolveVisitorLocale({ enabledLocales: ["en", "ku"], defaultLocale: "ar" }),
    ).toBe("en");
  });

  it("exposes the cookie name", () => {
    expect(LOCALE_COOKIE).toBe("sb_locale");
  });
});
