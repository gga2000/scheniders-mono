// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  REFERRAL_CAPTURE_TTL_MS,
  captureReferral,
  clearCapturedReferral,
  readCapturedReferral,
  writeCapturedReferral,
} from "./referral-capture";

const T = "55555555-5555-4555-8555-555555555555";
beforeEach(() => window.localStorage.clear());

describe("referral capture", () => {
  it("takes a valid ?ref= off the URL and remembers it for later pages", () => {
    expect(captureReferral(T, "?utm=x&ref=ab3k7m")).toBe("AB3K7M");
    expect(captureReferral(T, "")).toBe("AB3K7M");
  });
  it("ignores a malformed code and keeps the remembered one", () => {
    writeCapturedReferral(T, "AB3K7M");
    expect(captureReferral(T, "?ref=nope")).toBe("AB3K7M");
  });
  it("expires after 30 days and survives garbage", () => {
    writeCapturedReferral(T, "AB3K7M", 0);
    expect(readCapturedReferral(T, REFERRAL_CAPTURE_TTL_MS + 1)).toBeNull();
    window.localStorage.setItem(`schn:ref:${T}`, "{");
    expect(readCapturedReferral(T)).toBeNull();
  });
  it("clear forgets it", () => {
    writeCapturedReferral(T, "AB3K7M");
    clearCapturedReferral(T);
    expect(readCapturedReferral(T)).toBeNull();
  });
});
