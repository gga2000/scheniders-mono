import { describe, it, expect } from "vitest";
import {
  IRAQ_GOVERNORATES,
  governorateLabel,
  resolveGovernorate,
} from "./governorates";

describe("IRAQ_GOVERNORATES", () => {
  it("has 18 entries, each with code/name/name_en/name_ku", () => {
    expect(IRAQ_GOVERNORATES).toHaveLength(18);
    for (const g of IRAQ_GOVERNORATES) {
      expect(g.code).toBeTruthy();
      expect(g.name).toBeTruthy();
      expect(g.name_en).toBeTruthy();
      expect(g.name_ku).toBeTruthy();
    }
  });
});

describe("governorateLabel", () => {
  it("returns the Arabic name for locale 'ar'", () => {
    expect(governorateLabel("BG", "ar")).toBe("بغداد");
    expect(governorateLabel("ER", "ar")).toBe("أربيل");
  });

  it("returns the Kurdish name for locale 'ku'", () => {
    expect(governorateLabel("BG", "ku")).toBe("بەغدا");
    expect(governorateLabel("ER", "ku")).toBe("هەولێر");
    expect(governorateLabel("SU", "ku")).toBe("سلێمانی");
    expect(governorateLabel("SA", "ku")).toBe("سەلاحەدین");
  });

  it("returns the Latin name for other locales", () => {
    expect(governorateLabel("BG", "en")).toBe("Baghdad");
    expect(governorateLabel("ER", "en")).toBe("Erbil");
    expect(governorateLabel("BG", "fr")).toBe("Baghdad");
  });

  it("resolves by Latin or Arabic name, not just code", () => {
    expect(governorateLabel("Baghdad", "ku")).toBe("بەغدا");
    expect(governorateLabel("بغداد", "ku")).toBe("بەغدا");
  });

  it("falls back to the raw input when unrecognised", () => {
    expect(governorateLabel("ZZ", "ku")).toBe("ZZ");
    expect(governorateLabel("ZZ", "ar")).toBe("ZZ");
  });
});

describe("resolveGovernorate", () => {
  it("exposes name_ku on resolved entries", () => {
    expect(resolveGovernorate("KI")?.name_ku).toBe("کەرکووک");
  });
});
