import { describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({ WASEET_SHARED_ACCOUNT_TENANT_IDS: undefined as string | undefined }));
vi.mock("@/lib/env", () => ({ env: envState }));
vi.mock("@/lib/supabase-server", () => ({ verifyAccessToken: vi.fn() }));
vi.mock("@/lib/auth/resolve-active-tenant", () => ({ resolveActiveTenant: vi.fn() }));

import { waseetAccountAllows } from "./waseet-caller";

const ALI = "11111111-1111-4111-8111-111111111111";

describe("waseetAccountAllows", () => {
    it("lets nobody use the shared account when the list is unset", () => {
        envState.WASEET_SHARED_ACCOUNT_TENANT_IDS = undefined;
        expect(waseetAccountAllows(ALI)).toBe(false);
    });

    it("lets only listed stores in", () => {
        envState.WASEET_SHARED_ACCOUNT_TENANT_IDS = ` ${ALI.toUpperCase()} `;
        expect(waseetAccountAllows(ALI)).toBe(true);
        expect(waseetAccountAllows("22222222-2222-4222-8222-222222222222")).toBe(false);
    });
});
