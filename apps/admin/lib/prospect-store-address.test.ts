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
  const dir = path.resolve(__dirname, "../../../packages/supabase/migrations");
  const newestDefining = (fn: string) => {
    const file = readdirSync(dir)
      .filter((f) => /^\d{14}_.*\.sql$/.test(f))
      .sort()
      .filter((f) => new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${fn}\\(`).test(readFileSync(path.join(dir, f), "utf8")))
      .at(-1);
    expect(file).toBeDefined();
    const sql = readFileSync(path.join(dir, file ?? ""), "utf8");
    // Only this function's own definition, up to the end of its body.
    const start = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${fn}\\(`));
    return sql.slice(start, sql.indexOf("$function$;", start));
  };

  it("uses the same steps as the newest store_address_base", () => {
    const sql = newestDefining("store_address_base");
    expect(sql).toContain("'[^a-z0-9]+', '-', 'g'");
    expect(sql).toContain("trim(both '-' from left(_base, 40))");
    expect(sql).toContain("coalesce(nullif(_base, ''), 'store')");
  });

  it("is the rule both Build Store and converting a lead use, with 8 random characters after it", () => {
    for (const fn of ["admin_build_prospect_store", "convert_lead_atomic"]) {
      const sql = newestDefining(fn);
      expect(sql).toContain("_slug_base := public.store_address_base(");
      expect(sql).toContain("_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)");
      expect(sql).not.toContain("regexp_replace(");
    }
  });
});
