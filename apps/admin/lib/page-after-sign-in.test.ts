import { describe, expect, it } from "vitest";
import { pageAfterSignIn } from "./page-after-sign-in";

/**
 * Round 14 (Workflow new 6): after a sign-in ended, staff signed in again and
 * landed on Home, not on the lead link they had opened.
 */
describe("pageAfterSignIn", () => {
  it("goes back to the console page staff asked for, with its filters", () => {
    expect(pageAfterSignIn("/leads/7f1c")).toBe("/leads/7f1c");
    expect(pageAfterSignIn("/merchants?status=trial&sort=new")).toBe("/merchants?status=trial&sort=new");
  });

  it("goes Home with nothing asked for", () => {
    expect(pageAfterSignIn(null)).toBe("/");
    expect(pageAfterSignIn(undefined)).toBe("/");
    expect(pageAfterSignIn("")).toBe("/");
  });

  it("never follows an address to another site", () => {
    for (const next of [
      "https://example.com/leads",
      "//example.com/leads",
      "/\\example.com/leads",
      "\\\\example.com",
      "javascript:alert(1)",
      "leads",
      "//[",
    ]) {
      expect(pageAfterSignIn(next)).toBe("/");
    }
  });

  it("never goes back to the login page or to the API", () => {
    expect(pageAfterSignIn("/login")).toBe("/");
    expect(pageAfterSignIn("/login?error=expired")).toBe("/");
    expect(pageAfterSignIn("/login/")).toBe("/");
    expect(pageAfterSignIn("/api/export")).toBe("/");
  });
});
