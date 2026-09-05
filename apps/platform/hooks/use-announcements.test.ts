import { describe, it, expect } from "vitest";
import { buildAnnouncementInsert } from "./use-announcements";

/**
 * REL-D1. `announcements.tenant_id` has no database default and RLS checks it
 * (`WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()))`), so an insert that
 * omits it is rejected with 42501. The hook used to omit it AND discard the
 * returned error, so every "post announcement" silently evaporated — the live
 * database held exactly one announcement, from March.
 *
 * These tests pin the payload shape. If tenant_id ever falls out again, this fails.
 */
describe("buildAnnouncementInsert", () => {
    const TENANT = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a";

    it("THE BUG: includes tenant_id in the insert payload", () => {
        const payload = buildAnnouncementInsert("Stock arrives Sunday", TENANT, "Ali");
        expect(payload).not.toBeNull();
        expect(payload!.tenant_id).toBe(TENANT);
    });

    it("returns null when there is no active tenant, so no doomed insert is fired", () => {
        expect(buildAnnouncementInsert("Stock arrives Sunday", null, "Ali")).toBeNull();
    });

    it("returns null for blank or whitespace-only content", () => {
        expect(buildAnnouncementInsert("", TENANT, "Ali")).toBeNull();
        expect(buildAnnouncementInsert("   \n ", TENANT, "Ali")).toBeNull();
    });

    it("trims the content it stores", () => {
        expect(buildAnnouncementInsert("  hello  ", TENANT, "Ali")!.content).toBe("hello");
    });

    it("falls back to 'Admin' when the profile has no display name", () => {
        expect(buildAnnouncementInsert("hi", TENANT, null)!.created_by_name).toBe("Admin");
        expect(buildAnnouncementInsert("hi", TENANT, undefined)!.created_by_name).toBe("Admin");
    });
});
