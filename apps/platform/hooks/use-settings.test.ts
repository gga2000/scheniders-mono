import { describe, expect, it } from "vitest";
import { readSetting } from "./use-settings";

describe("readSetting", () => {
    it("keeps known fields and the ones a form does not know", () => {
        const settings = { print_settings: { label_size: "a4", show_price: false, legacy_flag: 1 } };
        expect(readSetting(settings, "print_settings")).toEqual({ label_size: "a4", show_price: false, legacy_flag: 1 });
    });

    it("reads a wrong-typed field as unset and a missing or broken value as empty", () => {
        expect(readSetting({ auto_archive: { enabled: "yes", days: 30 } }, "auto_archive")).toEqual({ enabled: undefined, days: 30 });
        expect(readSetting({}, "store_profile")).toEqual({});
        expect(readSetting({ quick_actions: "oops" }, "quick_actions")).toEqual({});
    });
});
