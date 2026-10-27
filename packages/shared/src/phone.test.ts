import { describe, it, expect } from "vitest";
import {
  normalizeIraqiMobile,
  isValidIraqiMobile,
  formatIraqiPhoneDisplay,
  maskIraqiMobile,
} from "./phone";

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

describe("formatIraqiPhoneDisplay", () => {
  it("groups a normalised Iraqi mobile as 07XX XXX XXXX", () => {
    expect(formatIraqiPhoneDisplay("07779703832")).toBe("0777 970 3832");
    expect(formatIraqiPhoneDisplay("+9647779703832")).toBe("0777 970 3832");
    expect(formatIraqiPhoneDisplay("00964 777 970 3832")).toBe("0777 970 3832");
    expect(formatIraqiPhoneDisplay("0777-970-3832")).toBe("0777 970 3832");
  });

  it("leaves non-mobile numbers untouched (trimmed)", () => {
    expect(formatIraqiPhoneDisplay(" 01 234 5678 ")).toBe("01 234 5678");
    expect(formatIraqiPhoneDisplay("+1 555 0100")).toBe("+1 555 0100");
  });
});

describe("maskIraqiMobile", () => {
  it("keeps the operator prefix and the last four digits and hides the middle three", () => {
    expect(maskIraqiMobile("07701234567")).toBe("0770 ••• 4567");
    expect(maskIraqiMobile("+964 770 123 4567")).toBe("0770 ••• 4567");
    expect(maskIraqiMobile("00964-770-123-4567")).toBe("0770 ••• 4567");
  });

  it("returns null for anything that is not an Iraqi mobile", () => {
    expect(maskIraqiMobile("")).toBeNull();
    expect(maskIraqiMobile(null)).toBeNull();
    expect(maskIraqiMobile(undefined)).toBeNull();
    expect(maskIraqiMobile("0612345678")).toBeNull();
  });
});
