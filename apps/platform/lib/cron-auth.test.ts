import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({ env: { CRON_SECRET: "s3cret" as string | undefined } }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { requireCronAuth } from "./cron-auth";

const call = (auth?: string) =>
    requireCronAuth(new Request("http://x/api/cron/y", { headers: auth ? { authorization: auth } : {} }));

describe("requireCronAuth", () => {
    it("lets the right bearer through", () => {
        expect(call("Bearer s3cret")).toBeNull();
    });
    it("refuses a wrong, partial or missing secret", () => {
        expect(call("Bearer s3cre")?.status).toBe(401);
        expect(call("Bearer s3cret0")?.status).toBe(401);
        expect(call()?.status).toBe(401);
    });
    it("fails closed when the secret is not configured", () => {
        mocks.env.CRON_SECRET = undefined;
        expect(call("Bearer ")?.status).toBe(503);
        mocks.env.CRON_SECRET = "s3cret";
    });
});
