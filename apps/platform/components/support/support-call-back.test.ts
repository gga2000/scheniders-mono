import { describe, expect, it } from "vitest";
import { callBackWhen } from "./support-call-back";

describe("callBackWhen", () => {
    const now = Date.parse("2026-11-16T22:30:00Z");

    it("says soon when the call is due now or already late", () => {
        expect(callBackWhen("2026-11-16T22:30:00Z", now).key).toBe("support.callBack.soon");
        expect(callBackWhen("2026-11-16T20:00:00Z", now).key).toBe("support.callBack.soon");
    });

    it("names the hour when asked overnight", () => {
        const when = callBackWhen("2026-11-17T06:00:00Z", now);
        expect(when.key).toBe("support.callBack.at");
        expect(when.key === "support.callBack.at" && when.at.toISOString()).toBe("2026-11-17T06:00:00.000Z");
    });
});
