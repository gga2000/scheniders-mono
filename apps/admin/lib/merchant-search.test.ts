import { describe, expect, it } from "vitest";
import { merchantSearchFilter } from "./merchant-search";

describe("merchantSearchFilter", () => {
  it("searches name, slug, email and phone for plain text", () => {
    expect(merchantSearchFilter("noor")).toBe(
      'business_name.ilike."%noor%",slug.ilike."%noor%",contact_email.ilike."%noor%",contact_phone.ilike."%noor%"',
    );
  });

  it("finds a shop by part of its phone number", () => {
    expect(merchantSearchFilter("07701")).toContain('contact_phone.ilike."%07701%"');
  });

  it("ignores spaces around the text", () => {
    expect(merchantSearchFilter("  noor ")).toBe(merchantSearchFilter("noor"));
  });

  it("adds the shop number when the text is one, with or without #", () => {
    expect(merchantSearchFilter("100095")).toContain(',merchant_code.ilike."%100095%"');
    expect(merchantSearchFilter(" #100095 ")).toContain(',merchant_code.ilike."%100095%"');
  });

  it("matches a few digits of a shop number, wherever they sit in it", () => {
    expect(merchantSearchFilter("95")).toContain(',merchant_code.ilike."%95%"');
  });

  it("never casts the number column to text: the API cannot parse that", () => {
    const filter = merchantSearchFilter("100095");

    expect(filter).not.toContain("::");
    expect(filter).not.toContain("display_id");
  });

  it("leaves the shop number out for text that is not one", () => {
    expect(merchantSearchFilter("1000957")).not.toContain("merchant_code");
    expect(merchantSearchFilter("10a")).not.toContain("merchant_code");
  });

  it("keeps commas, brackets and quotes in the text as text", () => {
    expect(merchantSearchFilter('Noor (Karrada), "new"')).toBe(
      'business_name.ilike."%Noor (Karrada), \\"new\\"%",slug.ilike."%Noor (Karrada), \\"new\\"%",contact_email.ilike."%Noor (Karrada), \\"new\\"%",contact_phone.ilike."%Noor (Karrada), \\"new\\"%"',
    );
    expect(merchantSearchFilter("a\\b")).toContain('"%a\\\\b%"');
  });

  it("drops % so the text cannot widen the match", () => {
    expect(merchantSearchFilter("50%")).toContain('business_name.ilike."%50%"');
  });
});
