import { describe, expect, it } from "vitest";
import { bucketsBetween, periodBucket } from "./buckets";

describe("periodBucket (Baghdad days)", () => {
    it("files 00:30 Baghdad under the new day, not the UTC one", () => {
        // 2026-11-01 00:30 Baghdad = 2026-10-31 21:30 UTC.
        const at = new Date("2026-10-31T21:30:00.000Z");
        expect(periodBucket(at, "day").key).toBe("2026-11-01");
        expect(periodBucket(at, "month").key).toBe("2026-11");
        expect(periodBucket(at, "quarter").key).toBe("2026-Q4");
        expect(periodBucket(at, "year").key).toBe("2026");
    });

    it("starts weeks on Monday", () => {
        // Sunday 1 Nov 2026 belongs to the week of Monday 26 Oct.
        expect(periodBucket(new Date("2026-11-01T09:00:00.000Z"), "week").key).toBe("2026-10-26");
    });

    it("starts a month at its first Baghdad midnight", () => {
        expect(periodBucket(new Date("2026-10-15T09:00:00.000Z"), "month").ts).toBe(Date.parse("2026-09-30T21:00:00.000Z"));
    });
});

describe("bucketsBetween", () => {
    it("lists each bucket once, oldest first", () => {
        const keys = bucketsBetween(new Date("2026-09-30T21:00:00.000Z"), new Date("2026-11-02T20:59:59.999Z"), "month").map((b) => b.key);
        expect(keys).toEqual(["2026-10", "2026-11"]);
    });
    it("covers every week touched", () => {
        const keys = bucketsBetween(new Date("2026-10-28T21:00:00.000Z"), new Date("2026-11-09T20:59:59.999Z"), "week").map((b) => b.key);
        expect(keys).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    });
});
