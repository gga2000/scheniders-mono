import { describe, it, expect } from "vitest";
import { IRAQ_GOVERNORATE_PATHS } from "@scheniders/shared/iraq-map-paths";
import { SHOP_GOVERNORATES, governorateNamed, readShopCity, shopGovernorate } from "./shop-city";

/*
 * Shops typed their city as "بغداد" or "Baghdad". The map knew only lowercase
 * Latin names, so two of three Baghdad shops were "unmapped", and the city
 * picker asked for city = "baghdad" exactly, so it found none of them.
 */

describe("shopGovernorate", () => {
  it.each([
    ["بغداد", "Baghdad"],
    ["Baghdad", "Baghdad"],
    [" baghdad ", "Baghdad"],
    ["BAGHDAD", "Baghdad"],
    // ة and ه, أ and ا, ى and ي are typed either way.
    ["البصره", "Basra"],
    ["البصرة", "Basra"],
    ["اربيل", "Erbil"],
    ["أربيل", "Erbil"],
    ["ديالي", "Diyala"],
    // A main city with a name of its own.
    ["الموصل", "Mosul"],
    ["Mosul", "Mosul"],
    ["نينوى", "Mosul"],
    ["الكوت", "Wasit"],
    ["Kut", "Wasit"],
    ["ذي  قار", "Dhi Qar"],
    ["Diwaniyah", "Qadisiyyah"],
  ])("puts %j in %s", (typed, name) => {
    expect(shopGovernorate(typed)?.name).toBe(name);
  });

  it.each([null, undefined, "", "Atlantis", "بغداد الجديدة", "Baghdadi"])("cannot tell where %j is", (typed) => {
    expect(shopGovernorate(typed)).toBeUndefined();
  });
});

describe("governorateNamed", () => {
  it("reads the picker's lowercase name", () => {
    expect(governorateNamed("baghdad")?.code).toBe("BGD");
    expect(governorateNamed("dhi qar")?.code).toBe("NAS");
    expect(governorateNamed("atlantis")).toBeUndefined();
  });
});

describe("readShopCity", () => {
  it("asks for every shop when no city is named", () => {
    expect(readShopCity(null)).toEqual({});
    expect(readShopCity("")).toEqual({});
  });

  it("names the governorate, or says it cannot", () => {
    const city = readShopCity("Baghdad");
    expect("governorate" in city && city.governorate?.code).toBe("BGD");
    expect(readShopCity("atlantis")).toEqual({ error: "Unknown city" });
  });
});

describe("SHOP_GOVERNORATES", () => {
  it("has each of the map's 18 governorates once, under a name of its own", () => {
    expect(SHOP_GOVERNORATES.map((g) => g.code).sort()).toEqual(IRAQ_GOVERNORATE_PATHS.map((path) => path.code).sort());
    expect(new Set(SHOP_GOVERNORATES.map((g) => g.name.toLowerCase())).size).toBe(18);
  });

  it("finds each governorate by its own name", () => {
    for (const g of SHOP_GOVERNORATES) {
      expect(shopGovernorate(g.name)?.code).toBe(g.code);
    }
  });

  it("builds patterns from letters and spaces only, so Postgres and the browser read them alike", () => {
    for (const g of SHOP_GOVERNORATES) {
      const words = g.pattern.replace(/^\^\\s\*\(|\)\\s\*\$$/g, "").replace(/\\s\+/g, " ").replace(/\[[^\]]+\]/g, "x");
      expect(words).toMatch(/^[\p{L} |]+$/u);
    }
  });
});
