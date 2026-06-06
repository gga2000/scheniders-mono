import { describe, it, expect } from "vitest";
import { normalizeIraqiPhone, isValidIraqiPhone, leadPhone, toIntlIraqi } from "./lead-phone";
import type { Lead } from "@/types/leads";

describe("normalizeIraqiPhone", () => {
  it("strips +964 / 00964 and re-adds leading 0", () => {
    expect(normalizeIraqiPhone("+9647701234567")).toBe("07701234567");
    expect(normalizeIraqiPhone("009647701234567")).toBe("07701234567");
    expect(normalizeIraqiPhone("7701234567")).toBe("07701234567");
  });
  it("keeps a well-formed local number", () => {
    expect(normalizeIraqiPhone("07701234567")).toBe("07701234567");
  });
  it("converts Arabic-Indic digits", () => {
    expect(normalizeIraqiPhone("٠٧٧٠١٢٣٤٥٦٧")).toBe("07701234567");
  });
  it("returns empty string for empty input", () => {
    expect(normalizeIraqiPhone("")).toBe("");
  });
});

describe("isValidIraqiPhone", () => {
  it("accepts 10-11 digit 07 numbers", () => {
    expect(isValidIraqiPhone("07701234567")).toBe(true);
    expect(isValidIraqiPhone("+9647701234567")).toBe(true);
  });
  it("rejects non-Iraqi / too-short numbers", () => {
    expect(isValidIraqiPhone("12345")).toBe(false);
    expect(isValidIraqiPhone("0801234567")).toBe(false);
  });
});

describe("toIntlIraqi", () => {
  it("converts a local 07 number to 9647…", () => {
    expect(toIntlIraqi("07701234567")).toBe("9647701234567");
  });
  it("passes an already-international number through", () => {
    expect(toIntlIraqi("9647701234567")).toBe("9647701234567");
  });
  it("returns null for non-Iraqi input", () => {
    expect(toIntlIraqi("12345")).toBeNull();
  });
});

describe("leadPhone", () => {
  const make = (over: Partial<Lead>) =>
    ({ page_phone: null, phone_numbers: [], ...over }) as Lead;
  it("prefers the page phone", () => {
    expect(leadPhone(make({ page_phone: "07701234567" }))).toBe("07701234567");
  });
  it("falls back to the first additional number", () => {
    expect(
      leadPhone(make({ page_phone: "", phone_numbers: [{ title: "x", number: "07712345678" }] })),
    ).toBe("07712345678");
  });
  it("returns null when no phone exists", () => {
    expect(leadPhone(make({}))).toBeNull();
  });
});
