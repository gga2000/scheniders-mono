import { describe, expect, it } from "vitest";
import { metaCookieUpdates, randomFbpId } from "./meta-cookies";

const NOW = 1_700_000_000_000;
const CLICK = "IwAR2F4-dbP0l7Mn1IawQQGCINEz7PYXQvwjNwB_qa2ofrHyiLjcbCRxTDMgk";

describe("metaCookieUpdates", () => {
  it("writes _fbc from a new ad click, keeping the click id's case, and _fbp when missing", () => {
    expect(metaCookieUpdates({ fbclid: CLICK, fbc: undefined, fbp: undefined, nowMs: NOW, random: 1234567890 })).toEqual([
      { name: "_fbc", value: `fb.1.${NOW}.${CLICK}` },
      { name: "_fbp", value: `fb.1.${NOW}.1234567890` },
    ]);
  });

  it("keeps a stored _fbc for the same click and never replaces the pixel's _fbp", () => {
    expect(
      metaCookieUpdates({ fbclid: CLICK, fbc: `fb.1.5.${CLICK}`, fbp: "fb.1.5.42", nowMs: NOW, random: 1 }),
    ).toEqual([]);
  });

  it("replaces _fbc when the shopper clicks a different ad", () => {
    const other = "IwAR0differentclickid";
    expect(metaCookieUpdates({ fbclid: other, fbc: `fb.1.5.${CLICK}`, fbp: "fb.1.5.42", nowMs: NOW, random: 1 })).toEqual([
      { name: "_fbc", value: `fb.1.${NOW}.${other}` },
    ]);
  });

  it("ignores a missing or malformed fbclid", () => {
    expect(metaCookieUpdates({ fbclid: null, fbc: undefined, fbp: "x", nowMs: NOW, random: 1 })).toEqual([]);
    expect(metaCookieUpdates({ fbclid: "a;b=c", fbc: undefined, fbp: "x", nowMs: NOW, random: 1 })).toEqual([]);
  });
});

describe("randomFbpId", () => {
  it("is a 10-digit number", () => {
    expect(String(randomFbpId())).toMatch(/^\d{10}$/);
  });
});
