import { describe, expect, it } from "vitest";
import { plainPath } from "./plain-path";

/**
 * Round 16 (Reliability new 4, Sentry SCHENIDERS-1H): "/%6Ceads" and
 * "/api%2Fhourly-jobs" answered 500 and sent an error to Sentry each time.
 */
describe("plainPath", () => {
  it("decodes letters, digits and -._~", () => {
    expect(plainPath("/%6Ceads")).toBe("/leads");
    expect(plainPath("/%4C%45%41%44%53")).toBe("/LEADS");
    expect(plainPath("/%61pi/hourly-jobs")).toBe("/api/hourly-jobs");
    expect(plainPath("/leads/7f1c%2D%30%5F%7E%2e")).toBe("/leads/7f1c-0_~.");
  });

  it("decodes encoded slashes in a page's path", () => {
    expect(plainPath("/api%2Fhourly-jobs")).toBe("/api/hourly-jobs");
    expect(plainPath("/leads%2f7f1c")).toBe("/leads/7f1c");
    expect(plainPath("/a%5Cb")).toBe("/a\\b");
  });

  it("keeps an API path's encoded slashes", () => {
    expect(plainPath("/api/leads/a%2Fb")).toBe("/api/leads/a%2Fb");
    expect(plainPath("/%61pi/leads/a%2Fb")).toBe("/api/leads/a%2Fb");
  });

  it("leaves every other encoding, and a plain path, as it is", () => {
    for (const path of ["/", "/leads", "/merchants/%D8%A7", "/leads/a%20b", "/x%2561", "/login%3Fx", "/api/x%2F"]) {
      expect(plainPath(path), path).toBe(path);
    }
  });
});
