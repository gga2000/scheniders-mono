import { afterEach, describe, expect, it, vi } from "vitest";
import { FERMI_META_PIXEL_ID, FERMI_SIGNUP_PIXEL_JS, trackSignupComplete } from "./fermi-pixel";

const g = globalThis as { fbq?: unknown };

afterEach(() => {
    delete g.fbq;
});

describe("trackSignupComplete", () => {
    it("does nothing when the pixel is not on the page", () => {
        expect(() => trackSignupComplete({ email: "a@b.iq", sells: [] })).not.toThrow();
    });

    it("sets the owner's email and phone for matching, then sends CompleteRegistration", () => {
        const fbq = vi.fn();
        g.fbq = fbq;
        trackSignupComplete({ email: " Owner@Shop.IQ ", phone: "0770 123 4567", sells: ["clothing", "perfume"] });
        expect(fbq.mock.calls).toEqual([
            ["set", "userData", { em: "owner@shop.iq", country: "iq", ph: "9647701234567" }],
            ["track", "CompleteRegistration", { content_name: "fermi_trial", content_category: "clothing,perfume", status: true }],
        ]);
    });

    it("leaves the phone out when it is not a valid Iraqi mobile", () => {
        const fbq = vi.fn();
        g.fbq = fbq;
        trackSignupComplete({ email: "a@b.iq", phone: "123", sells: [] });
        expect(fbq.mock.calls[0]).toEqual(["set", "userData", { em: "a@b.iq", country: "iq" }]);
    });
});

describe("FERMI_SIGNUP_PIXEL_JS", () => {
    function run(search: string): unknown[][] {
        window.history.replaceState(null, "", `/signup${search}`);
        const fbq = vi.fn();
        g.fbq = fbq;
        new Function(FERMI_SIGNUP_PIXEL_JS)();
        return fbq.mock.calls;
    }

    afterEach(() => {
        sessionStorage.clear();
    });

    it("sends only the PageView on a plain visit", () => {
        expect(run("")).toEqual([["init", FERMI_META_PIXEL_ID], ["track", "PageView"]]);
    });

    it("sends the landing hand-over Lead with the number for matching, once per tab", () => {
        const search = "?type=%D8%B9%D8%B7%D9%88%D8%B1&name=x&phone=07701234567";
        expect(run(search).slice(2)).toEqual([
            ["set", "userData", { ph: "9647701234567", country: "iq" }],
            ["track", "Lead", { content_name: "fermi_trial", content_category: "عطور" }],
        ]);
        expect(run(search)).toHaveLength(2);
    });

    it("sends no Lead for a number that is not an Iraqi mobile", () => {
        expect(run("?phone=12345")).toHaveLength(2);
    });
});
