// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { setServerEventSink, trackPixel, type ServerPixelEvent } from "./pixels";
import { pixelContentsFromItems } from "@scheniders/shared";

const data = pixelContentsFromItems([{ product_id: "p1", price: 1000, quantity: 1 }]);
type FbqCall = unknown[];

function installFbq(): FbqCall[] {
  const calls: FbqCall[] = [];
  (globalThis as { fbq?: unknown }).fbq = (...args: unknown[]) => calls.push(args);
  return calls;
}

afterEach(() => {
  setServerEventSink(null);
  delete (globalThis as { fbq?: unknown }).fbq;
});

describe("Meta server copies of funnel events", () => {
  it("sends each funnel event to the server with the eventID the pixel got", () => {
    const fbq = installFbq();
    const seen: ServerPixelEvent[] = [];
    setServerEventSink((e) => seen.push(e));
    trackPixel("ViewContent", data);
    trackPixel("AddToCart", data);
    trackPixel("InitiateCheckout", data);
    expect(seen.map((e) => e.event)).toEqual(["ViewContent", "AddToCart", "InitiateCheckout"]);
    seen.forEach((e, i) => {
      expect(e.eventId).toMatch(/.{8,}/);
      expect(fbq[i]?.[3]).toEqual({ eventID: e.eventId });
    });
    expect(new Set(seen.map((e) => e.eventId)).size).toBe(3);
  });

  it("never forwards Purchase (the checkout server sends its own)", () => {
    installFbq();
    const seen: ServerPixelEvent[] = [];
    setServerEventSink((e) => seen.push(e));
    trackPixel("Purchase", data, "evt-1");
    expect(seen).toEqual([]);
  });

  it("sends nothing where the Meta pixel is not running", () => {
    const seen: ServerPixelEvent[] = [];
    setServerEventSink((e) => seen.push(e));
    trackPixel("ViewContent", data);
    expect(seen).toEqual([]);
  });

  it("keeps a caller's own event id", () => {
    installFbq();
    const seen: ServerPixelEvent[] = [];
    setServerEventSink((e) => seen.push(e));
    trackPixel("AddToCart", data, "evt-given-1");
    expect(seen[0]?.eventId).toBe("evt-given-1");
  });
});
