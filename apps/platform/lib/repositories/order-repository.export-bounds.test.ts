import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());

import { exportBounds } from "./order-repository";

describe("exportBounds: an export's days are Baghdad days", () => {
    it("starts at Baghdad midnight and stops before the next Baghdad midnight", () => {
        expect(exportBounds({ dateFrom: "2026-11-01", dateTo: "2026-11-30" })).toEqual({
            fromTs: "2026-10-31T21:00:00.000Z",
            untilTs: "2026-11-30T21:00:00.000Z",
        });
    });

    it("an order at 01:30 Baghdad on the 1st is in the 1st, not the day before", () => {
        const { fromTs, untilTs } = exportBounds({ dateFrom: "2026-11-01", dateTo: "2026-11-01" });
        const placed = "2026-10-31T22:30:00.000Z";
        expect(placed >= (fromTs ?? "")).toBe(true);
        expect(placed < (untilTs ?? "")).toBe(true);
    });

    it("leaves an open end open", () => {
        expect(exportBounds({})).toEqual({ fromTs: null, untilTs: null });
    });
});
