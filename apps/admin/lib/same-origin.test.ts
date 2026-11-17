import { describe, expect, it } from "vitest";
import { isOwnPageRead, isOwnPageWrite } from "./same-origin";

/*
 * Round 5 of the staff console audit: the API took any write that carried a
 * staff sign-in cookie, wherever the page that sent it lived.
 */

const HOST = "scheniders-mono-admin.vercel.app";
const headers = (entries: Record<string, string>) => new Headers(entries);

describe("isOwnPageWrite", () => {
  it("lets every read through, whatever page asked", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
      expect(isOwnPageWrite(method, headers({ origin: "https://evil.example" }), HOST)).toBe(true);
    }
  });

  it("lets a write from the console's own pages through", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isOwnPageWrite(method, headers({ origin: `https://${HOST}` }), HOST)).toBe(true);
    }
    expect(isOwnPageWrite("POST", headers({ "sec-fetch-site": "same-origin" }), HOST)).toBe(true);
  });

  it("refuses a write sent from another site", () => {
    expect(isOwnPageWrite("POST", headers({ origin: "https://evil.example" }), HOST)).toBe(false);
    expect(isOwnPageWrite("DELETE", headers({ origin: `https://${HOST}.evil.example` }), HOST)).toBe(false);
    expect(isOwnPageWrite("PATCH", headers({ origin: "http://scheniders-mono-admin.vercel.app:8080" }), HOST)).toBe(false);
    expect(isOwnPageWrite("POST", headers({ "sec-fetch-site": "cross-site" }), HOST)).toBe(false);
    expect(isOwnPageWrite("POST", headers({ "sec-fetch-site": "same-site" }), HOST)).toBe(false);
  });

  it("refuses a write whose page cannot be named", () => {
    expect(isOwnPageWrite("POST", headers({ origin: "null" }), HOST)).toBe(false);
    expect(isOwnPageWrite("POST", headers({}), HOST)).toBe(false);
  });

  it("trusts Origin over Sec-Fetch-Site when both are sent", () => {
    expect(isOwnPageWrite("POST", headers({ origin: "https://evil.example", "sec-fetch-site": "same-origin" }), HOST)).toBe(false);
  });
});

describe("a read that starts something", () => {
  it("comes from a console page", () => {
    expect(isOwnPageRead(headers({ "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("is refused from another site, a sibling site, an app outside the browser, or no browser page", () => {
    expect(isOwnPageRead(headers({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isOwnPageRead(headers({ "sec-fetch-site": "none" }))).toBe(false);
    expect(isOwnPageRead(headers({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(isOwnPageRead(headers({}))).toBe(false);
  });
});
