import { describe, expect, it } from "vitest";
import { formatHours } from "./format-hours";

describe("formatHours", () => {
  it("uses the three Arabic plural shapes", () => {
    expect(formatHours(1, "ar")).toBe("ساعة واحدة");
    expect(formatHours(2, "ar")).toBe("ساعتين");
    expect(formatHours(6, "ar")).toBe("6 ساعات");   // NOT "6 ساعة"
    expect(formatHours(12, "ar")).toBe("12 ساعة");
  });

  it("switches to days at 24 hours, with the same shapes", () => {
    expect(formatHours(24, "ar")).toBe("يوم واحد");
    expect(formatHours(48, "ar")).toBe("يومين");
    expect(formatHours(72, "ar")).toBe("3 أيام");
    expect(formatHours(24 * 14, "ar")).toBe("14 يوم");
  });

  it("formats English", () => {
    expect(formatHours(6, "en")).toBe("6h");
    expect(formatHours(24, "en")).toBe("1 day");
    expect(formatHours(72, "en")).toBe("3 days");
  });

  it("rounds and never goes negative", () => {
    expect(formatHours(5.6, "en")).toBe("6h");
    expect(formatHours(-3, "en")).toBe("0h");
  });

  it("Kurdish counts with the singular noun after the number", () => {
    expect(formatHours(6, "ku")).toBe("6 کاتژمێر");
    expect(formatHours(48, "ku")).toBe("2 ڕۆژ");
  });
});
