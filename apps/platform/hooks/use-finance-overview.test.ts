import { describe, expect, it } from "vitest";
import { bucketKey } from "./use-finance-overview";

describe("bucketKey", () => {
    it("files the first Baghdad hours under the Baghdad day, not the UTC day", () => {
        // 00:30 Baghdad on 5 Oct is 21:30 UTC on 4 Oct.
        const { key } = bucketKey(new Date("2026-10-04T21:30:00.000Z"), "day");
        expect(key).toBe("2026-10-05");
    });

    it("keeps the last Baghdad minute on the same day", () => {
        const { key } = bucketKey(new Date("2026-10-05T20:59:00.000Z"), "day");
        expect(key).toBe("2026-10-05");
    });

    it("anchors weeks on the Monday of the Baghdad week", () => {
        // 2026-10-04 is a Sunday; its week starts Monday 2026-09-28.
        const { key } = bucketKey(new Date("2026-10-04T10:00:00.000Z"), "week");
        expect(key).toBe("2026-09-28");
    });
});
