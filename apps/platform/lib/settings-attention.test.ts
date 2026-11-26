import { describe, expect, it } from "vitest";
import { settingsAttention, type SettingsAttentionInput } from "./settings-attention";

const fine: SettingsAttentionInput = {
    tenant: { status: "active", plan: "growth" },
    lock: { locked: false, balance_iqd: 100_000, daily_spend_iqd: 2_000 },
    staffAlertNumbers: 2,
    whatsappNumber: "07700000000",
};

describe("settingsAttention", () => {
    it("is empty when everything is set", () => {
        expect(settingsAttention(fine)).toEqual([]);
    });

    it("flags a wallet that runs out within three days, or is empty", () => {
        expect(settingsAttention({ ...fine, lock: { ...fine.lock!, balance_iqd: 5_000 } })).toEqual([
            { kind: "wallet", runway: { kind: "low", days: 2 }, balanceIqd: 5_000 },
        ]);
        expect(settingsAttention({ ...fine, lock: { ...fine.lock!, balance_iqd: 0 } })[0]).toMatchObject({ runway: { kind: "empty" } });
    });

    it("says nothing about the wallet in the trial, in a lock, for an exempt plan or when the balance is hidden", () => {
        const low = { ...fine.lock!, balance_iqd: 1_000 };
        expect(settingsAttention({ ...fine, lock: low, tenant: { status: "trial", plan: "growth" } })).toEqual([]);
        expect(settingsAttention({ ...fine, lock: { ...low, locked: true } })).toEqual([]);
        expect(settingsAttention({ ...fine, lock: low, tenant: { status: "active", plan: "internal" } })).toEqual([]);
        expect(settingsAttention({ ...fine, lock: { ...low, balance_iqd: null } })).toEqual([]);
    });

    it("flags no staff alert number and no WhatsApp number", () => {
        expect(settingsAttention({ ...fine, staffAlertNumbers: 0, whatsappNumber: " " }).map((i) => i.kind)).toEqual([
            "staff-alerts",
            "whatsapp",
        ]);
    });

    it("treats anything still loading as fine", () => {
        expect(settingsAttention({ tenant: null, lock: null, staffAlertNumbers: null, whatsappNumber: null })).toEqual([]);
    });
});
