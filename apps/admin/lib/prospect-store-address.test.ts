import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { prospectAddressBase, prospectAddressPreview } from "./prospect-store-address";

describe("prospectAddressBase: the name part the database makes", () => {
  it("keeps Latin letters and digits, one dash between words", () => {
    expect(prospectAddressBase("NATTY FASHION")).toBe("natty-fashion");
    expect(prospectAddressBase(" Zara Baghdad!! ")).toBe("zara-baghdad");
    expect(prospectAddressBase("Kut  Perfumes 24/7")).toBe("kut-perfumes-24-7");
  });

  it("gives \"store\" when a name has no Latin letter or digit", () => {
    expect(prospectAddressBase("النمور ستور")).toBe("store");
    expect(prospectAddressBase("   ")).toBe("store");
  });

  it("keeps Latin words around Arabic ones", () => {
    expect(prospectAddressBase("عطور Kut")).toBe("kut");
  });

  it("cuts at 40 characters and leaves no dash at the cut", () => {
    // The same case as the build-prospect-store database suite.
    expect(prospectAddressBase("The best shoes and bags shop in all of Baghdad and Basra")).toBe(
      "the-best-shoes-and-bags-shop-in-all-of-b",
    );
    expect(prospectAddressBase("abcdefghij abcdefghij abcdefghij abcdefg xyz")).toBe(
      "abcdefghij-abcdefghij-abcdefghij-abcdefg",
    );
  });

  it("shows the random part as x's before the build", () => {
    expect(prospectAddressPreview("Natty Fashion")).toBe("natty-fashion-xxxxxxxx.usefermi.com");
  });
});

describe("prospectAddressBase follows the database", () => {
  it("uses the same steps as the newest admin_build_prospect_store", () => {
    const dir = path.resolve(__dirname, "../../../packages/supabase/migrations");
    const newest = readdirSync(dir)
      .filter((f) => /^\d{14}_.*\.sql$/.test(f))
      .sort()
      .filter((f) => /FUNCTION public\.admin_build_prospect_store\(/.test(readFileSync(path.join(dir, f), "utf8")))
      .at(-1);
    expect(newest).toBeDefined();
    const sql = readFileSync(path.join(dir, newest ?? ""), "utf8");
    expect(sql).toContain("'[^a-z0-9]+', '-', 'g'");
    expect(sql).toContain("trim(both '-' from left(_slug_base, 40))");
    expect(sql).toContain("_slug_base := 'store'");
    expect(sql).toContain("substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)");
  });
});
