// =====================================================================
// i18n completeness tests
// =====================================================================

import { describe, expect, it } from "vitest";
import type {
  PageConfig,
  SectionInstance,
  StoreConfigV2,
} from "@scheniders/shared";
import { emptyStoreConfigV2 } from "@scheniders/shared";

import { computeCompleteness } from "./i18n-completeness";

function s(
  id: string,
  type: string,
  base: Record<string, unknown>,
  extra: Partial<SectionInstance> = {},
): SectionInstance {
  return { id, type, enabled: true, base, ...extra };
}

function emptyConfig(): StoreConfigV2 {
  return emptyStoreConfigV2();
}

function withHome(sections: SectionInstance[]): StoreConfigV2 {
  const cfg = emptyConfig();
  const home: PageConfig = { page_id: "home", sections };
  cfg.pages = cfg.pages.map((p) => (p.page_id === "home" ? home : p));
  return cfg;
}

describe("computeCompleteness", () => {
  it("empty config — totals are 100% (nothing to translate)", () => {
    const cfg = emptyConfig();
    const result = computeCompleteness(cfg);
    expect(result.perLocale.en.total).toBe(0);
    expect(result.perLocale.ar.total).toBe(0);
    expect(result.perLocale.en.pct).toBe(100);
    expect(result.perLocale.ar.pct).toBe(100);
  });

  it("all-en — en is 100%, ar is 0%", () => {
    const cfg = withHome([
      s("h", "hero_image", {
        title_i18n: { en: "Hi" },
        subtitle_i18n: { en: "Welcome" },
        cta_label_i18n: { en: "Shop" },
      }),
    ]);
    const result = computeCompleteness(cfg);
    expect(result.perLocale.en.filled).toBe(3);
    expect(result.perLocale.en.total).toBe(3);
    expect(result.perLocale.en.pct).toBe(100);
    expect(result.perLocale.ar.filled).toBe(0);
    expect(result.perLocale.ar.total).toBe(3);
    expect(result.perLocale.ar.pct).toBe(0);
  });

  it("mixed — half-translated", () => {
    const cfg = withHome([
      s("h", "hero_image", {
        title_i18n: { en: "Hi", ar: "مرحبا" },
        subtitle_i18n: { en: "Welcome" },
      }),
    ]);
    const result = computeCompleteness(cfg);
    expect(result.perLocale.en.pct).toBe(100);
    expect(result.perLocale.ar.pct).toBe(50);
  });

  it("nested i18n — items inside arrays count", () => {
    const cfg = withHome([
      s("t", "trust_strip", {
        pills: [
          { label_i18n: { en: "A", ar: "أ" }, icon: "x", bg: "mint" },
          { label_i18n: { en: "B" }, icon: "y", bg: "pink" },
          { label_i18n: { en: "C", ar: "ج" }, icon: "z", bg: "sky" },
        ],
      }),
    ]);
    const result = computeCompleteness(cfg);
    expect(result.perLocale.en.total).toBe(3);
    expect(result.perLocale.en.filled).toBe(3);
    expect(result.perLocale.ar.total).toBe(3);
    expect(result.perLocale.ar.filled).toBe(2);
  });

  it("variant-i18n — variant overrides contribute to totals", () => {
    const cfg = withHome([
      s(
        "h",
        "hero_image",
        { title_i18n: { en: "Base", ar: "أساسي" } },
        {
          variants: [
            {
              id: "v1",
              label: "Mobile",
              priority: 10,
              conditions: [{ kind: "breakpoint", values: ["mobile"] }],
              override: {
                title_i18n: { en: "Mobile only" },
              },
            },
          ],
        },
      ),
    ]);
    const result = computeCompleteness(cfg);
    // Base (1) + variant override (1) = 2 i18n fields total per locale.
    expect(result.perLocale.en.total).toBe(2);
    expect(result.perLocale.en.filled).toBe(2);
    expect(result.perLocale.ar.total).toBe(2);
    expect(result.perLocale.ar.filled).toBe(1);
  });

  it("per-page breakdown — only the home page reports counts when others are empty", () => {
    const cfg = withHome([
      s("h", "hero_image", { title_i18n: { en: "Hi", ar: "مرحبا" } }),
    ]);
    const result = computeCompleteness(cfg);
    const home = result.perPage.find((p) => p.page_id === "home");
    expect(home).toBeDefined();
    expect(home!.perLocale.en.total).toBeGreaterThan(0);
    expect(home!.perLocale.ar.filled).toBeGreaterThanOrEqual(1);
    // Other pages contribute 0 (no sections by default).
    const cart = result.perPage.find((p) => p.page_id === "cart");
    expect(cart?.perLocale.en.total ?? 0).toBe(0);
  });
});
