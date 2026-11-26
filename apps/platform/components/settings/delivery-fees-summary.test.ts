import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: null }) }));

import { FLAT_DELIVERY_FEE_IQD, FREE_DELIVERY_THRESHOLD_IQD } from "@scheniders/shared";
import { feesAtAGlance, governorateFees } from "./delivery-fees-summary";

describe("governorateFees", () => {
    it("charges the platform's flat fee everywhere when the shop set none", () => {
        const fees = governorateFees(null);
        expect(fees).toHaveLength(18);
        for (const g of fees) {
            expect(g.fee).toBe(FLAT_DELIVERY_FEE_IQD);
            expect(g.freeFrom).toBe(FREE_DELIVERY_THRESHOLD_IQD);
        }
    });

    it("uses a governorate's own rate, else the shop's default rate", () => {
        const fees = governorateFees({
            rates: { BG: { fee_iqd: 3_000, free_threshold_iqd: 50_000 } },
            default_rate: { fee_iqd: 6_000 },
        });
        expect(fees.find((g) => g.code === "BG")).toMatchObject({ fee: 3_000, freeFrom: 50_000 });
        expect(fees.find((g) => g.code === "BA")).toMatchObject({ fee: 6_000, freeFrom: 0 });
        expect(feesAtAGlance(fees)).toEqual({ baghdad: 3_000, otherMin: 6_000, otherMax: 6_000 });
    });
});
