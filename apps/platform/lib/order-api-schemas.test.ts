import { describe, it, expect } from "vitest";
import {
    orderIdsBodySchema,
    waseetSubmitBodySchema,
    toOrderUuids,
    MAX_ORDER_IDS_PER_REQUEST,
    MAX_WASEET_ORDERS_PER_REQUEST,
} from "./order-api-schemas";

const uuid = "3f1a5c7e-8b2d-4e6f-9a1b-2c3d4e5f6a7b";
const uuid2 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("orderIdsBodySchema", () => {
    it("accepts a non-empty array of ids", () => {
        expect(orderIdsBodySchema.safeParse({ ids: [uuid, uuid2] }).success).toBe(true);
    });

    it("rejects an empty array (nothing to delete)", () => {
        expect(orderIdsBodySchema.safeParse({ ids: [] }).success).toBe(false);
    });

    it("rejects a missing ids field", () => {
        expect(orderIdsBodySchema.safeParse({}).success).toBe(false);
    });

    it("rejects non-string entries", () => {
        expect(orderIdsBodySchema.safeParse({ ids: [123] }).success).toBe(false);
    });

    it(`caps the batch at ${MAX_ORDER_IDS_PER_REQUEST} ids`, () => {
        const atLimit = Array.from({ length: MAX_ORDER_IDS_PER_REQUEST }, () => uuid);
        const tooMany = [...atLimit, uuid];
        expect(orderIdsBodySchema.safeParse({ ids: atLimit }).success).toBe(true);
        expect(orderIdsBodySchema.safeParse({ ids: tooMany }).success).toBe(false);
    });
});

describe("waseetSubmitBodySchema", () => {
    it("accepts a non-empty array of ids", () => {
        expect(waseetSubmitBodySchema.safeParse({ orderIds: [uuid] }).success).toBe(true);
    });

    it("rejects an empty array", () => {
        expect(waseetSubmitBodySchema.safeParse({ orderIds: [] }).success).toBe(false);
    });
});

describe("waseet request cap", () => {
    // Al-Waseet throttles to ~30 calls/30s. A request must stay inside ONE window
    // or the handler idles waiting for the next one and dies on the function
    // timeout — after some orders have already been created at the courier.
    it("stays within a single vendor rate-limit window", () => {
        expect(MAX_WASEET_ORDERS_PER_REQUEST).toBeLessThanOrEqual(28);
    });

    it("accepts a full window", () => {
        const full = Array.from({ length: MAX_WASEET_ORDERS_PER_REQUEST }, () => uuid);
        expect(waseetSubmitBodySchema.safeParse({ orderIds: full }).success).toBe(true);
    });

    it("rejects more than one window (the client chunks instead)", () => {
        const over = Array.from({ length: MAX_WASEET_ORDERS_PER_REQUEST + 1 }, () => uuid);
        expect(waseetSubmitBodySchema.safeParse({ orderIds: over }).success).toBe(false);
    });
});

describe("toOrderUuids", () => {
    it("keeps well-formed uuids", () => {
        expect(toOrderUuids([uuid, uuid2])).toEqual([uuid, uuid2]);
    });

    it("drops optimistic temp ids without discarding the rest of the batch", () => {
        // The list can contain an optimistic row (`temp-<ts>`) that has no
        // server-side counterpart; it must not fail the whole delete.
        expect(toOrderUuids([`temp-${Date.now()}`, uuid])).toEqual([uuid]);
    });

    it("drops anything that is not a uuid, so no raw client string reaches a query", () => {
        expect(toOrderUuids(["'; drop table orders; --", "", "abc", uuid])).toEqual([uuid]);
    });

    it("is case-insensitive on hex digits", () => {
        expect(toOrderUuids([uuid.toUpperCase()])).toEqual([uuid.toUpperCase()]);
    });

    it("returns an empty array when nothing is a uuid", () => {
        expect(toOrderUuids(["temp-1", "nope"])).toEqual([]);
    });
});
