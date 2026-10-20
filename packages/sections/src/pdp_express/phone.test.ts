import { describe, expect, it } from "vitest";
import { normalizeIraqiMobile } from "@scheniders/shared";
import {
  applyPhoneEdit,
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

  it("drops the trunk 0 kept after +964, exactly like normalizeIraqiMobile", () => {
    for (const raw of [
      "+964 0770 123 4567",
      "00964 0770 123 4567",
      "009640770 123 4567",
      "964 0770 123 4567",
      "+964 770 123 4567",
    ]) {
      expect(phoneDigits(raw)).toBe("07701234567");
      expect(normalizeIraqiMobile(raw)).toBe(phoneDigits(raw));
    }
    // Mid-typing a pasted international prefix never doubles the 0.
    expect(phoneDigits("+964 0")).toBe("0");
    expect(phoneDigits("+964 07")).toBe("07");
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

  describe("applyPhoneEdit", () => {
    it("Backspace right after a group space deletes the digit before it", () => {
      // "0780 230|" … caret after the space at index 5, Backspace removes it.
      const prev = "0780 230";
      expect(applyPhoneEdit(prev, "0780230", 4, "deleteContentBackward")).toEqual({
        value: "0782 30",
        caret: 3,
      });
      // No inputType reported: treated as Backspace.
      expect(applyPhoneEdit(prev, "0780230", 4)).toEqual({ value: "0782 30", caret: 3 });
    });

    it("Delete right before a group space deletes the digit after it", () => {
      expect(
        applyPhoneEdit("0780 230 1677", "0780230 1677", 4, "deleteContentForward"),
      ).toEqual({ value: "0780 301 677", caret: 4 });
    });

    it("keeps the caret after the typed digit when a group space is inserted", () => {
      // Typing "9" after "0780" at the end.
      expect(applyPhoneEdit("0780", "07809", 5, "insertText")).toEqual({
        value: "0780 9",
        caret: 6,
      });
      // Typing "5" in the middle of the second group.
      // "0780 25|30": the trailing digit moves into the next group.
      expect(applyPhoneEdit("0780 230", "0780 2530", 7, "insertText")).toEqual({
        value: "0780 253 0",
        caret: 7,
      });
      // Typing the 8th digit lands after the space the reformat inserts.
      expect(applyPhoneEdit("0780 253", "0780 2531", 9, "insertText")).toEqual({
        value: "0780 253 1",
        caret: 10,
      });
    });

    it("keeps the caret in place when the edit changes nothing (a typed letter)", () => {
      expect(applyPhoneEdit("0780 230", "07a80 230", 3, "insertText")).toEqual({
        value: "0780 230",
        caret: 2,
      });
    });

    it("reformats a pasted international number to the national grouping", () => {
      const raw = "+964 0770 123 4567";
      expect(applyPhoneEdit("", raw, raw.length, "insertFromPaste")).toEqual({
        value: "0770 123 4567",
        caret: 13,
      });
    });

    it("an ordinary Backspace on a digit still deletes just that digit", () => {
      expect(
        applyPhoneEdit("0780 230 1677", "0780 23 1677", 7, "deleteContentBackward"),
      ).toEqual({ value: "0780 231 677", caret: 7 });
    });
  });
});
