import { describe, expect, it } from "vitest";
import { readingAlignClass, readsRtl } from "./reading";
import { readsRtl as expressReadsRtl } from "../pdp_express/text";

describe("readsRtl", () => {
  it("is true for Arabic and Kurdish, false for English", () => {
    expect(readsRtl("ar")).toBe(true);
    expect(readsRtl("ku")).toBe(true);
    expect(readsRtl("en")).toBe(false);
  });

  it("is the same function the express layout imports", () => {
    expect(expressReadsRtl).toBe(readsRtl);
  });
});

describe("readingAlignClass", () => {
  it("puts Arabic and Kurdish on the right edge and English on the left", () => {
    expect(readingAlignClass("ar")).toBe("items-end text-right");
    expect(readingAlignClass("ku")).toBe("items-end text-right");
    expect(readingAlignClass("en")).toBe("items-start text-left");
  });
});
