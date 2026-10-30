import { describe, expect, it } from "vitest";
import { REVIEW_STRINGS, reviewCount, rs } from "./strings";

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

describe("REVIEW_STRINGS — highlights", () => {
  it("fills the summary, show-all and reply lines", () => {
    expect(rs("ofReviews", "ar", { count: "6 تقييمات" })).toBe("من 6 تقييمات");
    expect(rs("showAll", "ar", { count: 6 })).toBe("شوف كل التقييمات (6)");
    expect(rs("storeReply", "ar", { store: "شنايدر" })).toBe("رد شنايدر");
    expect(rs("storeReply", "en", { store: "Scheniders" })).toBe("Reply from Scheniders");
  });

  it("announces a pressed topic with the plural-correct count", () => {
    expect(rs("themeAnnounce", "ar", { topic: "الثبات", count: "4 تقييمات" })).toBe(
      "ذكروا «الثبات» في 4 تقييمات",
    );
    expect(rs("themeAnnounce", "en", { topic: "Longevity", count: "4 reviews" })).toBe(
      "“Longevity” is mentioned in 4 reviews",
    );
    expect(rs("themeAnnounce", "ku", { topic: "بۆن", count: "4 هەڵسەنگاندن" })).toBe(
      "باسی «بۆن» کراوە لە 4 هەڵسەنگاندن",
    );
  });

  it("every entry has ar, en and ku", () => {
    for (const entry of Object.values(REVIEW_STRINGS)) {
      expect(Object.keys(entry).sort()).toEqual(["ar", "en", "ku"]);
    }
  });
});
