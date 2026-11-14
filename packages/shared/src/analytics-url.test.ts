import { describe, expect, it } from "vitest";
import { scrubAnalyticsUrl } from "./analytics-url";

describe("scrubAnalyticsUrl", () => {
  it("drops credential-bearing query keys and the hash", () => {
    expect(
      scrubAnalyticsUrl(
        "https://shop.scheniders.com/_preview/a/b?token=secret&utm_source=tiktok#access_token=x",
      ),
    ).toBe("https://shop.scheniders.com/_preview/a/b?utm_source=tiktok");
    expect(scrubAnalyticsUrl("https://schenidersapp.xyz/login?code=abc&invite=xyz")).toBe(
      "https://schenidersapp.xyz/login",
    );
  });

  it("keeps ordinary URLs unchanged", () => {
    const url = "https://www.scheniders.com/products/envoy?utm_campaign=nov&fbclid=1";
    expect(scrubAnalyticsUrl(url)).toBe(url);
  });
});
