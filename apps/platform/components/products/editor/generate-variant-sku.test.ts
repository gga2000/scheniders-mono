import { describe, expect, it } from "vitest";
import { generateSkuForVariant } from "./variant-matrix-table";

const options = [{ name: "Colour", values: ["Green", "Grey"] }, { name: "Size", values: ["M"] }] as Parameters<typeof generateSkuForVariant>[1];
const row = (colour: string) => ({ option_values: { Colour: colour, Size: "M" } }) as unknown as Parameters<typeof generateSkuForVariant>[0];

describe("generateSkuForVariant", () => {
    it("keeps whole option values, so Green and Grey stay apart", () => {
        expect(generateSkuForVariant(row("Green"), options, "TEE", new Set())).toBe("TEE-GREEN-M");
        expect(generateSkuForVariant(row("Grey"), options, "TEE", new Set())).toBe("TEE-GREY-M");
    });

    it("takes the next free number when the SKU is in use", () => {
        expect(generateSkuForVariant(row("Green"), options, "", new Set(["SKU-GREEN-M", "SKU-GREEN-M-2"]))).toBe("SKU-GREEN-M-3");
    });

    it("keeps Arabic letters and drops spaces and symbols", () => {
        expect(generateSkuForVariant(row("أخضر غامق"), options, "TEE", new Set())).toBe("TEE-أخضرغامق-M");
    });
});
