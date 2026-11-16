import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
    init: vi.fn(),
    setUser: vi.fn(),
    setTag: vi.fn(),
    captureException: vi.fn(),
    lastEventId: vi.fn(() => "evt-1"),
}));

vi.mock("@sentry/nextjs", () => sentry);
vi.mock("@scheniders/shared/sentry-scrub", () => ({ baseSentryOptions: (o: object) => o }));

async function freshModule() {
    vi.resetModules();
    return import("./report-error");
}

describe("report-error", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.doMock("@sentry/nextjs", () => sentry);
    });

    it("setting who is signed in does not download the SDK, and applies once it loads", async () => {
        const mod = await freshModule();
        mod.setReportIdentity({ user: { id: "u1" }, tags: { tenant_id: "t1", user_role: "owner" } });
        expect(sentry.init).not.toHaveBeenCalled();
        expect(mod.lastReportedEventId()).toBeUndefined();

        await mod.loadSentry();
        expect(sentry.init).toHaveBeenCalledTimes(1);
        expect(sentry.setUser).toHaveBeenCalledWith({ id: "u1" });
        expect(sentry.setTag).toHaveBeenCalledWith("tenant_id", "t1");
        expect(mod.lastReportedEventId()).toBe("evt-1");
    });

    it("a report starts the SDK, initialises it once, then sends", async () => {
        const mod = await freshModule();
        const error = new Error("boom");
        mod.reportError(error, { tags: { area: "x" } });
        await mod.loadSentry();
        await Promise.resolve();
        expect(sentry.init).toHaveBeenCalledTimes(1);
        expect(sentry.captureException).toHaveBeenCalledWith(error, { tags: { area: "x" } });
    });

    it("a failed download is retried by the next call", async () => {
        vi.doMock("@sentry/nextjs", () => {
            throw new Error("chunk failed to load");
        });
        const mod = await freshModule();
        await expect(mod.loadSentry()).rejects.toThrow();

        vi.doMock("@sentry/nextjs", () => sentry);
        await mod.loadSentry();
        expect(sentry.init).toHaveBeenCalledTimes(1);
    });
});
