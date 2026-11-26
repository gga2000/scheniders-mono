import { describe, expect, it } from "vitest";
import { readSetting } from "./use-settings";

describe("readSetting", () => {
    it("keeps known fields and the ones a form does not know", () => {
        const settings = { print_settings: { fragile_warning: true, label_size: "a4", legacy_flag: 1 } };
        expect(readSetting(settings, "print_settings")).toEqual({ fragile_warning: true, label_size: "a4", legacy_flag: 1 });
    });

    it("reads a wrong-typed field as unset and a missing or broken value as empty", () => {
        expect(readSetting({ print_settings: { fragile_warning: "yes", no_open_warning: true } }, "print_settings")).toEqual({
            fragile_warning: undefined,
            no_open_warning: true,
        });
        expect(readSetting({}, "print_settings")).toEqual({});
        expect(readSetting({ print_settings: "oops" }, "print_settings")).toEqual({});
    });
});
