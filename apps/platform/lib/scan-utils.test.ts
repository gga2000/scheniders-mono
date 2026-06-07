import { describe, it, expect } from "vitest";
import { extractScannedOrderId } from "./scan-utils";

describe("extractScannedOrderId", () => {
    it("returns plain ids and sequence numbers unchanged", () => {
        expect(extractScannedOrderId("1260529006")).toBe("1260529006");
        expect(extractScannedOrderId("2950")).toBe("2950");
        expect(extractScannedOrderId("LF-5434-137")).toBe("LF-5434-137");
    });

    it("strips the invoice QR prefix (QR:{ref}|PHONE:…)", () => {
        expect(extractScannedOrderId("QR:1260529006|PHONE:07712345678")).toBe("1260529006");
        expect(extractScannedOrderId("qr:2950|phone:07700000000")).toBe("2950");
    });

    it("strips the shipping-label QR prefix (ORDER:{ref}|PHONE:…)", () => {
        expect(extractScannedOrderId("ORDER:1260529006|PHONE:07712345678")).toBe("1260529006");
        expect(extractScannedOrderId("order:2970|PHONE:07700000000")).toBe("2970");
    });

    it("trims whitespace and handles empty input", () => {
        expect(extractScannedOrderId("  2950  ")).toBe("2950");
        expect(extractScannedOrderId("")).toBe("");
    });
});
