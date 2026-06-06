import { describe, it, expect } from "vitest";
import { normalizeIraqiPhone, isValidIraqiPhone } from "./lead-phone";

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
