import { describe, expect, it } from "vitest";
import { uniqueCopyValue } from "./unique-copy-value";

describe("uniqueCopyValue", () => {
    it("adds -copy", () => {
        expect(uniqueCopyValue("perciveron", new Set(["perciveron"]))).toBe("perciveron-copy");
    });

    it("counts up when the copy is taken", () => {
        const taken = new Set(["perciveron", "perciveron-copy", "perciveron-copy-2"]);
        expect(uniqueCopyValue("perciveron", taken)).toBe("perciveron-copy-3");
    });

    it("keeps Arabic slugs intact", () => {
        expect(uniqueCopyValue("رفقات", new Set(["رفقات-copy"]))).toBe("رفقات-copy-2");
    });
});
