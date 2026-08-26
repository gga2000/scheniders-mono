import { describe, it, expect } from "vitest";
import { shouldApplyRealtimeUpdate } from "./realtime-batcher";

// CON-2 regression guard. Platform UPDATEs did not move `updated_at`, so peer
// edits arrived with an equal timestamp and the old `<=` check discarded them —
// realtime appeared connected while delivering nothing. `version` is bumped by
// a DB trigger on every write and cannot be faked by a client.

describe("shouldApplyRealtimeUpdate", () => {
    it("applies an event with a newer version", () => {
        expect(shouldApplyRealtimeUpdate({ version: 3 }, { version: 4 })).toBe(true);
    });

    it("skips an event with an older version (out-of-order delivery)", () => {
        expect(shouldApplyRealtimeUpdate({ version: 5 }, { version: 4 })).toBe(false);
    });

    it("skips an event with the same version (already applied)", () => {
        expect(shouldApplyRealtimeUpdate({ version: 4 }, { version: 4 })).toBe(false);
    });

    it("prefers version over updated_at when both are present", () => {
        // The regression: equal/stale timestamps must not veto a newer version.
        expect(
            shouldApplyRealtimeUpdate(
                { version: 2, updated_at: "2026-08-22T10:00:00Z" },
                { version: 3, updated_at: "2026-08-22T10:00:00Z" },
            ),
        ).toBe(true);
    });

    it("falls back to updated_at when versions are unavailable", () => {
        expect(
            shouldApplyRealtimeUpdate(
                { updated_at: "2026-08-22T10:00:00Z" },
                { updated_at: "2026-08-22T10:00:05Z" },
            ),
        ).toBe(true);
        expect(
            shouldApplyRealtimeUpdate(
                { updated_at: "2026-08-22T10:00:05Z" },
                { updated_at: "2026-08-22T10:00:00Z" },
            ),
        ).toBe(false);
    });

    it("applies the event when neither side carries comparable metadata", () => {
        expect(shouldApplyRealtimeUpdate({}, {})).toBe(true);
    });
});
