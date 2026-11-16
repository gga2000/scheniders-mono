import { describe, it, expect } from "vitest";
import { createRequestIds } from "./request-ids";

/*
 * A staff top-up carries an id the server uses to drop a repeat. The id must
 * stay the same for a retry of the same request and change for a new one, or
 * a retry credits twice / a wanted second top-up is dropped.
 */
describe("createRequestIds", () => {
  it("gives a retry of the same payload the same id", () => {
    const ids = createRequestIds();
    const first = ids.idFor("shop-a:5000:receipt 12");
    expect(ids.idFor("shop-a:5000:receipt 12")).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("gives a different payload a new id", () => {
    const ids = createRequestIds();
    const first = ids.idFor("shop-a:5000:");
    expect(ids.idFor("shop-a:6000:")).not.toBe(first);
    expect(ids.idFor("shop-b:5000:")).not.toBe(first);
  });

  it("gives the same payload a new id once the request is done", () => {
    const ids = createRequestIds();
    const first = ids.idFor("shop-a:5000:");
    ids.done();
    expect(ids.idFor("shop-a:5000:")).not.toBe(first);
  });

  it("keeps two forms apart", () => {
    const a = createRequestIds();
    const b = createRequestIds();
    expect(a.idFor("shop-a:5000:")).not.toBe(b.idFor("shop-a:5000:"));
  });
});
