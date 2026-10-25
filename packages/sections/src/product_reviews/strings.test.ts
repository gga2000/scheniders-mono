import { describe, expect, it } from "vitest";
import { reviewCount, rs } from "./strings";

describe("REVIEW_STRINGS", () => {
  it("fills every {token}", () => {
    expect(rs("starRow", "ar", { star: 5, count: 3 })).toBe("5 من 5: 3 تقييم");
    expect(rs("averageLabel", "en", { avg: "4.7" })).toBe("Rated 4.7 out of 5");
  });

  it("Kurdish has its own line, never English", () => {
    expect(rs("writeEntry", "ku")).toBe("هەڵسەنگاندنەکەت بنووسە");
  });

  it("counts read «N تقييم», with «تقييم واحد» for one", () => {
    expect(reviewCount(1, "ar")).toBe("تقييم واحد");
    expect(reviewCount(6, "ar")).toBe("6 تقييم");
    expect(reviewCount(11, "ar")).toBe("11 تقييم");
    expect(reviewCount(1, "en")).toBe("1 review");
    expect(reviewCount(6, "en")).toBe("6 reviews");
    expect(reviewCount(6, "ku")).toBe("6 هەڵسەنگاندن");
  });
});
