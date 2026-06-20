import { describe, it, expect } from "vitest";
import { normalizeIraqiMobile, isValidIraqiMobile } from "./phone";

describe("normalizeIraqiMobile (EC23)", () => {
  it("accepts the local 07XXXXXXXXX form", () => {
    expect(normalizeIraqiMobile("07701234567")).toBe("07701234567");
    expect(normalizeIraqiMobile("0770 123 4567")).toBe("07701234567");
    expect(normalizeIraqiMobile("0770-123-4567")).toBe("07701234567");
  });

  it("strips the +964 / 00964 country code and re-adds the national 0", () => {
    expect(normalizeIraqiMobile("+964 770 123 4567")).toBe("07701234567");
    expect(normalizeIraqiMobile("00964 7701234567")).toBe("07701234567");
    expect(normalizeIraqiMobile("9647701234567")).toBe("07701234567");
  });

  it("accepts the bare national significant number (no leading 0)", () => {
    expect(normalizeIraqiMobile("7701234567")).toBe("07701234567");
  });

  it("rejects placeholders, landlines, and malformed input", () => {
    expect(normalizeIraqiMobile("0000000000")).toBeNull(); // placeholder
    expect(normalizeIraqiMobile("123456789")).toBeNull(); // wrong prefix
    expect(normalizeIraqiMobile("0123456789")).toBeNull(); // not a 7-prefix mobile
    expect(normalizeIraqiMobile("077012345")).toBeNull(); // too short
    expect(normalizeIraqiMobile("077012345678")).toBeNull(); // too long
    expect(normalizeIraqiMobile("")).toBeNull();
    expect(normalizeIraqiMobile(null)).toBeNull();
    expect(normalizeIraqiMobile("not a phone")).toBeNull();
  });
});

describe("isValidIraqiMobile", () => {
  it("mirrors normalizeIraqiMobile's verdict", () => {
    expect(isValidIraqiMobile("07701234567")).toBe(true);
    expect(isValidIraqiMobile("+9647701234567")).toBe(true);
    expect(isValidIraqiMobile("0000000000")).toBe(false);
    expect(isValidIraqiMobile(undefined)).toBe(false);
  });
});
