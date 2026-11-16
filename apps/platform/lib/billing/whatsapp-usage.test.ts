import { describe, expect, it } from "vitest";
import { groupWhatsAppMonth } from "./whatsapp-usage";

describe("groupWhatsAppMonth", () => {
    it("adds up the month by purpose, old template names under today's purpose", () => {
        const month = groupWhatsAppMonth([
            { template_name: "cod_order_confirm_v3", count: 200, charged_iqd: 6000 },
            { template_name: "new_cod_order_confirm", count: 12, charged_iqd: 360 },
            { template_name: "order_reminder_v3", count: 90, charged_iqd: 2700 },
            { template_name: "order_discount_offer_v3", count: 10, charged_iqd: 800 },
        ]);
        expect(month.count).toBe(312);
        expect(month.iqd).toBe(9860);
        expect(month.rows).toEqual([
            { purpose: "confirmation", count: 212, iqd: 6360 },
            { purpose: "reminder", count: 90, iqd: 2700 },
            { purpose: "discount", count: 10, iqd: 800 },
        ]);
    });

    it("hides money from a member who may not see it", () => {
        const month = groupWhatsAppMonth([
            { template_name: "cod_order_confirm_v3", count: 3, charged_iqd: null },
            { template_name: "new_order_alert_staff", count: 1, charged_iqd: null },
            { template_name: null, count: 1, charged_iqd: null },
        ]);
        expect(month.count).toBe(5);
        expect(month.iqd).toBeNull();
        expect(month.rows.map((r) => [r.purpose, r.iqd])).toEqual([
            ["confirmation", null],
            ["staffAlert", null],
            ["other", null],
        ]);
    });

    it("an empty month is zero", () => {
        expect(groupWhatsAppMonth([])).toEqual({ count: 0, iqd: 0, rows: [] });
    });
});
