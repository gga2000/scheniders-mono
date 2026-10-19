import { describe, expect, it } from "vitest";
import { normalizeIraqiMobile } from "@scheniders/shared";
import {
  caretAfterDigits,
  formatPhoneGroups,
  phoneDigits,
  phoneIssue,
} from "./phone";

describe("express phone entry", () => {
  it("groups 4-3-4 progressively", () => {
    expect(formatPhoneGroups("0780")).toBe("0780");
    expect(formatPhoneGroups("07802")).toBe("0780 2");
    expect(formatPhoneGroups("07802301677")).toBe("0780 230 1677");
  });

  it("maps Arabic-Indic digits and international prefixes to national form", () => {
    expect(phoneDigits("٠٧٨٠ ٢٣٠ ١٦٧٧")).toBe("07802301677");
    expect(phoneDigits("+964 780 230 1677")).toBe("07802301677");
    expect(phoneDigits("00964 780 230 1677")).toBe("07802301677");
    expect(phoneDigits("780 230 1677")).toBe("07802301677");
  });

  it("names the reason a number is not an Iraqi mobile", () => {
    expect(phoneIssue("06", false)).toBe("prefix");
    expect(phoneIssue("071", false)).toBe("operator");
    expect(phoneIssue("078023016771", false)).toBe("long");
    expect(phoneIssue("0780230", false)).toBeNull();
    expect(phoneIssue("0780230", true)).toBe("short");
    expect(phoneIssue("07802301677", true)).toBeNull();
  });

  it("never accepts a number the server would reject", () => {
    for (const d of ["07502301677", "07702301677", "07802301677", "07902301677"]) {
      expect(phoneIssue(d, true)).toBeNull();
      expect(normalizeIraqiMobile(formatPhoneGroups(d))).toBe(d);
    }
  });

  it("keeps the caret after the same digit once spaces are inserted", () => {
    expect(caretAfterDigits("0780 230 1677", 5)).toBe(6);
    expect(caretAfterDigits("0780 230 1677", 4)).toBe(4);
    expect(caretAfterDigits("0780", 0)).toBe(0);
  });
});
