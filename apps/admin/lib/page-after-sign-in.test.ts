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

  it("never follows a dot segment that leaves another site's address behind", () => {
    // Round 16 (Security new 1): each of these reads as "//example.com".
    for (const next of [
      "/.//example.com",
      "/..//example.com",
      "/%2e//example.com",
      "/%2E%2E//example.com",
      "/a/..//example.com/x?y=1",
      "/./\\example.com",
      "/.\\/example.com",
    ]) {
      expect(pageAfterSignIn(next), next).toBe("/");
    }
  });

  // Round 16 (Workflow new 1, also): the middleware sends these on to the
  // login page or the API (lib/plain-path.ts), or "/api" is a bare 404.
  it("never follows an encoded letter or slash, or the API's own root", () => {
    for (const next of ["/%6Cogin", "/api%2Fexport", "/%61pi/export", "/leads%2F7f1c", "/api", "/api?x=1"]) {
      expect(pageAfterSignIn(next), next).toBe("/");
    }
    expect(pageAfterSignIn("/merchants?q=%D8%A7")).toBe("/merchants?q=%D8%A7");
    expect(pageAfterSignIn("/apiary")).toBe("/apiary");
  });

  it("follows a dot segment that stays on a console page", () => {
    expect(pageAfterSignIn("/merchants/../leads?status=new")).toBe("/leads?status=new");
    expect(pageAfterSignIn("/a/../login")).toBe("/");
  });

  it("never goes back to the login page or to the API", () => {
    expect(pageAfterSignIn("/login")).toBe("/");
    expect(pageAfterSignIn("/login?error=expired")).toBe("/");
    expect(pageAfterSignIn("/login/")).toBe("/");
    expect(pageAfterSignIn("/api/export")).toBe("/");
  });
});
