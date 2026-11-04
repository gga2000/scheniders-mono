import { describe, expect, it, vi } from "vitest";
import type { PrimeWebhookConfig } from "./client";
import {
    ensurePrimeWebhook,
    isPrimeWebhookCall,
    parsePrimeWebhookBody,
    PRIME_WEBHOOK_FIELDS,
    PRIME_WEBHOOK_HEADER,
    primeUpdateNotes,
    primeWebhookSecret,
    primeWebhookUrl,
} from "./webhook";

const config = { baseUrl: "https://prime-iq.com/myp/webapi", systemCode: "SYSTEM_A", password: "pw-one" };

describe("primeWebhookSecret", () => {
    it("is the same for the same account and changes with the password", () => {
        expect(primeWebhookSecret(config)).toBe(primeWebhookSecret({ ...config }));
        expect(primeWebhookSecret({ ...config, password: "pw-two" })).not.toBe(primeWebhookSecret(config));
        expect(primeWebhookSecret(config)).not.toContain("pw-one");
    });
});

describe("primeWebhookUrl", () => {
    it("points at the route and names the secret by a hash, not the secret", () => {
        const secret = primeWebhookSecret(config);
        const url = primeWebhookUrl("https://schenidersapp.xyz/", secret);
        expect(url).toMatch(/^https:\/\/schenidersapp\.xyz\/api\/prime\/webhook\?v=[0-9a-f]{12}$/);
        expect(url).not.toContain(secret);
        expect(primeWebhookUrl("https://schenidersapp.xyz", primeWebhookSecret({ ...config, password: "pw-two" }))).not.toBe(url);
    });
});

describe("isPrimeWebhookCall", () => {
    it("takes only our exact secret", () => {
        const secret = primeWebhookSecret(config);
        expect(isPrimeWebhookCall(secret, secret)).toBe(true);
        expect(isPrimeWebhookCall(null, secret)).toBe(false);
        expect(isPrimeWebhookCall("", secret)).toBe(false);
        expect(isPrimeWebhookCall(`${secret}x`, secret)).toBe(false);
        expect(isPrimeWebhookCall(secret.replace(/.$/, (c) => (c === "a" ? "b" : "a")), secret)).toBe(false);
    });
});

describe("parsePrimeWebhookBody", () => {
    it("reads one update or a list, with the case id as a number or text", () => {
        expect(parsePrimeWebhookBody({ caseId: 52176640, shipmentStatus: "DELIVERED" })).toEqual([
            { caseId: 52176640, shipmentStatus: "DELIVERED", returnReason: null, postponementReason: null, postponementDate: null },
        ]);
        expect(parsePrimeWebhookBody([{ caseId: "52176640" }, { caseId: 52176641, returnReason: "  رفض الاستلام " }])).toEqual([
            { caseId: 52176640, returnReason: null, postponementReason: null, postponementDate: null },
            { caseId: 52176641, returnReason: "رفض الاستلام", postponementReason: null, postponementDate: null },
        ]);
    });

    it("refuses a body that names no case", () => {
        expect(parsePrimeWebhookBody({ shipmentStatus: "DELIVERED" })).toBeNull();
        expect(parsePrimeWebhookBody({ caseId: 0 })).toBeNull();
        expect(parsePrimeWebhookBody("hello")).toBeNull();
    });

    it("cuts Prime's text to what the columns hold", () => {
        const [update] = parsePrimeWebhookBody({ caseId: 1, returnReason: "x".repeat(900), postponementDate: "2".repeat(90) }) ?? [];
        expect(update.returnReason).toHaveLength(500);
        expect(update.postponementDate).toHaveLength(40);
    });
});

describe("primeUpdateNotes", () => {
    it("keeps only what Prime said, so a later update without a reason keeps the earlier one", () => {
        const [returned, delivered] = parsePrimeWebhookBody([
            { caseId: 1, returnReason: "الزبون رفض", postponementReason: "", postponementDate: null },
            { caseId: 1, shipmentStatus: "DELIVERED" },
        ]) ?? [];
        expect(primeUpdateNotes(returned)).toEqual({ return_reason: "الزبون رفض" });
        expect(primeUpdateNotes(delivered)).toEqual({});
    });

    it("keeps a postponement's reason and date", () => {
        const [update] = parsePrimeWebhookBody({ caseId: 1, postponementReason: "مسافر", postponementDate: "2026-11-06" }) ?? [];
        expect(primeUpdateNotes(update)).toEqual({ postpone_reason: "مسافر", postponed_to: "2026-11-06" });
    });
});

describe("ensurePrimeWebhook", () => {
    const origin = "https://schenidersapp.xyz";
    const savedSetting = (over: Partial<PrimeWebhookConfig> = {}): PrimeWebhookConfig => ({
        configured: true,
        url: primeWebhookUrl(origin, primeWebhookSecret(config)),
        authenticationMode: "CUSTOM_HEADER",
        headerName: PRIME_WEBHOOK_HEADER,
        secretConfigured: true,
        fields: [...PRIME_WEBHOOK_FIELDS].reverse(),
        ...over,
    });
    const fakeClient = (current: PrimeWebhookConfig) => ({
        webhookConfig: vi.fn().mockResolvedValue(current),
        saveWebhookConfig: vi.fn().mockResolvedValue(undefined),
    });

    it("leaves a setting that already points at us alone", async () => {
        const client = fakeClient(savedSetting());
        expect(await ensurePrimeWebhook(client, config, origin)).toBe("unchanged");
        expect(client.webhookConfig).toHaveBeenCalledWith("UPDATE_STATUS");
        expect(client.saveWebhookConfig).not.toHaveBeenCalled();
    });

    it("saves our address, header, secret and fields when nothing is set", async () => {
        const client = fakeClient({ configured: false });
        expect(await ensurePrimeWebhook(client, config, origin)).toBe("saved");
        expect(client.saveWebhookConfig).toHaveBeenCalledWith("UPDATE_STATUS", {
            url: primeWebhookUrl(origin, primeWebhookSecret(config)),
            authenticationMode: "CUSTOM_HEADER",
            headerName: PRIME_WEBHOOK_HEADER,
            secret: primeWebhookSecret(config),
            fields: [...PRIME_WEBHOOK_FIELDS],
        });
    });

    it("saves again when the address, the secret or the fields differ", async () => {
        for (const over of [
            { url: "https://elsewhere.example/hook" },
            { url: primeWebhookUrl(origin, primeWebhookSecret({ ...config, password: "old" })) },
            { secretConfigured: false },
            { fields: [{ field: "primeCaseId", jsonKey: "caseId" }] },
            { headerName: "Authorization" },
        ]) {
            const client = fakeClient(savedSetting(over));
            expect(await ensurePrimeWebhook(client, config, origin)).toBe("saved");
        }
    });

    it("never touches Prime's shared test system", async () => {
        const client = fakeClient({ configured: false });
        await expect(ensurePrimeWebhook(client, { ...config, baseUrl: "https://devtest.prime-iq.com/myp/webapi" }, origin)).rejects.toThrow(
            "shared test system",
        );
        expect(client.webhookConfig).not.toHaveBeenCalled();
        expect(client.saveWebhookConfig).not.toHaveBeenCalled();
    });
});
