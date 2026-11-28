import { describe, expect, it } from "vitest";
import { PHONE_SETUP_SINCE, computerSetupGate, type ComputerSetupGateInput } from "./computer-setup-gate";
import { FOUNDATION_STEPS, type FoundationStatus } from "./merchant-guide/foundation";

const NEW_SHOP = { createdAt: new Date(Date.parse(PHONE_SETUP_SINCE) + 60_000).toISOString(), isDemo: false };
const OLD_SHOP = { createdAt: "2026-11-20T10:00:00.000000+00:00", isDemo: false };

const statusOf = (done: boolean): FoundationStatus =>
    Object.fromEntries(FOUNDATION_STEPS.map((step) => [step, done])) as Record<(typeof FOUNDATION_STEPS)[number], boolean>;
const NOTHING_DONE = statusOf(false);
const ALL_DONE = statusOf(true);

const base: ComputerSetupGateInput = {
    phone: true,
    isAdmin: true,
    supportView: false,
    shop: NEW_SHOP,
    openHint: false,
    progress: null,
    status: NOTHING_DONE,
};

describe("computerSetupGate", () => {
    it("asks a new shop's owner on a phone to carry on on a computer", () => {
        expect(computerSetupGate(base)).toBe("setup");
    });

    it("never touches shops that existed before it shipped", () => {
        expect(computerSetupGate({ ...base, shop: OLD_SHOP })).toBe("app");
    });

    it("never touches staff, the demo store, a support view, or a tablet or computer", () => {
        expect(computerSetupGate({ ...base, isAdmin: false })).toBe("app");
        expect(computerSetupGate({ ...base, shop: { ...NEW_SHOP, isDemo: true } })).toBe("app");
        expect(computerSetupGate({ ...base, supportView: true })).toBe("app");
        expect(computerSetupGate({ ...base, phone: false })).toBe("app");
    });

    it("shows the app until the screen and the shop are known", () => {
        expect(computerSetupGate({ ...base, phone: null })).toBe("app");
        expect(computerSetupGate({ ...base, shop: null })).toBe("app");
    });

    it("waits on the screen while the owner's row or the shop loads", () => {
        expect(computerSetupGate({ ...base, progress: undefined })).toBe("wait");
        expect(computerSetupGate({ ...base, status: null })).toBe("wait");
    });

    it("opens once the basics are done, with one ready moment", () => {
        expect(computerSetupGate({ ...base, status: ALL_DONE })).toBe("ready");
        expect(computerSetupGate({ ...base, progress: { foundationDone: true, phoneOpen: false, phoneSetup: false }, status: null })).toBe("ready");
    });

    it("stays open after the ready moment or the phone choice, and on a phone that opened before", () => {
        expect(computerSetupGate({ ...base, progress: { foundationDone: true, phoneOpen: true, phoneSetup: false } })).toBe("app");
        expect(computerSetupGate({ ...base, progress: { foundationDone: false, phoneOpen: false, phoneSetup: true } })).toBe("app");
        expect(computerSetupGate({ ...base, openHint: true, progress: undefined })).toBe("app");
    });

    it("a basic undone later does not lock the phone again", () => {
        const someDone = { ...NOTHING_DONE, [FOUNDATION_STEPS[0]]: true };
        expect(computerSetupGate({ ...base, progress: { foundationDone: true, phoneOpen: true, phoneSetup: false }, status: someDone })).toBe("app");
    });
});
