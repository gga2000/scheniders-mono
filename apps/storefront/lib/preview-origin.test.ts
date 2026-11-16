// @vitest-environment jsdom
/**
 * The editor preview talks to the merchant admin over postMessage. Prod admin
 * lives at schenidersapp.xyz; the allow-list named a host that was never used,
 * so the preview ignored every editor message and posted its own to "*".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedParentOrigin, platformTargetOrigin } from "./preview-origin";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isAllowedParentOrigin", () => {
  it("trusts the production merchant admin, at its new and old address", () => {
    expect(isAllowedParentOrigin("https://app.usefermi.com")).toBe(true);
    expect(isAllowedParentOrigin("https://schenidersapp.xyz")).toBe(true);
  });

  it("rejects any other site", () => {
    expect(isAllowedParentOrigin("https://evil.example")).toBe(false);
    expect(isAllowedParentOrigin("")).toBe(false);
  });
});

describe("platformTargetOrigin", () => {
  it("targets the trusted embedder named by the referrer", () => {
    vi.spyOn(document, "referrer", "get").mockReturnValue(
      "https://app.usefermi.com/store/edit",
    );
    expect(platformTargetOrigin()).toBe("https://app.usefermi.com");
  });

  it("refuses to post when the embedder is not trusted", () => {
    vi.spyOn(document, "referrer", "get").mockReturnValue("https://evil.example/x");
    expect(platformTargetOrigin()).toBeNull();
  });
});
