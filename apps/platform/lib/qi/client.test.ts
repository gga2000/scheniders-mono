import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QiApiError, blockQiToken, chargeQiToken, createQiPayment, getQiPaymentStatus, qiSignedString, verifyQiSignature } from "./client";

const config = { baseUrl: "https://qi.test/api/v1", terminalId: "237984", username: "u", password: "p" };

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const paid = {
    requestId: "4748b050-3d45-477a-be76-d9aa85d25a24",
    paymentId: "7f79e923-d2ba-417a-9653-d7ec709351dd",
    status: "SUCCESS",
    canceled: false,
    amount: 1000,
    currency: "IQD",
    creationDate: "2026-11-14T16:25:10",
    details: { maskedPan: "521372******8582" },
};

afterEach(() => vi.unstubAllGlobals());

describe("qiSignedString", () => {
    it("matches Qi's documented example", () => {
        expect(
            qiSignedString({
                requestId: "20250113-212519-073",
                paymentId: "b91e8d70-1ab7-4275-85a2-61f7dbb31410",
                status: "SUCCESS",
                amount: 10000,
                currency: "IQD",
                creationDate: "2025-01-13T21:25:19",
            }),
        ).toBe("b91e8d70-1ab7-4275-85a2-61f7dbb31410|10000.000|IQD|2025-01-13T21:25:19|SUCCESS");
    });

    it("writes - for missing fields", () => {
        expect(qiSignedString({ requestId: "r", paymentId: "p" })).toBe("p|-|-|-|-");
    });
});

describe("verifyQiSignature", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const sign = (text: string) => {
        const signer = createSign("sha256");
        signer.update(text);
        return signer.sign(privateKey).toString("base64");
    };

    it("accepts Qi's signature of the message", () => {
        expect(verifyQiSignature(paid, sign(qiSignedString(paid)), pem)).toBe(true);
    });

    it("refuses a message whose amount was changed", () => {
        const signature = sign(qiSignedString(paid));
        expect(verifyQiSignature({ ...paid, amount: 1_000_000 }, signature, pem)).toBe(false);
    });

    it("refuses an empty or broken signature instead of throwing", () => {
        expect(verifyQiSignature(paid, "", pem)).toBe(false);
        expect(verifyQiSignature(paid, "not-base64!!", "not a key")).toBe(false);
    });
});

describe("Qi API calls", () => {
    it("opens a payment with Basic Auth, the terminal header and whole IQD", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json(200, { ...paid, status: "CREATED", formUrl: "https://qi.test/pay/1" }));
        vi.stubGlobal("fetch", fetchMock);

        const payment = await createQiPayment(config, {
            requestId: paid.requestId,
            amountIqd: 50_000,
            finishPaymentUrl: "https://app.test/settings?section=billing&qi=x",
            notificationUrl: "https://app.test/api/webhooks/qi",
            locale: "ar_IQ",
        });

        expect(payment.formUrl).toBe("https://qi.test/pay/1");
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://qi.test/api/v1/payment");
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
        expect(headers["X-Terminal-Id"]).toBe("237984");
        expect(JSON.parse(init.body as string)).toMatchObject({ requestId: paid.requestId, amount: 50_000, currency: "IQD" });
    });

    it("reads a payment's status", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, paid)));
        const payment = await getQiPaymentStatus(config, paid.paymentId);
        expect(payment).toMatchObject({ status: "SUCCESS", amount: 1000, canceled: false });
        expect(payment.details?.maskedPan).toBe("521372******8582");
    });

    it("turns Qi's error body into QiApiError with its code", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(403, { error: { code: 12, description: "Payment with provided paymentId not found." } })));
        await expect(getQiPaymentStatus(config, paid.paymentId)).rejects.toMatchObject({ name: "QiApiError", code: 12, status: 403 });
    });

    it("never puts an odd payment id into the URL", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await expect(getQiPaymentStatus(config, "../admin")).rejects.toBeInstanceOf(QiApiError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("asks Qi for an AUTH token only when the shop saves its card", async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(200, { ...paid, status: "CREATED", formUrl: "https://qi.test/pay/1" })));
        vi.stubGlobal("fetch", fetchMock);
        const input = {
            requestId: paid.requestId,
            amountIqd: 25_000,
            finishPaymentUrl: "https://app.test/f",
            notificationUrl: "https://app.test/api/webhooks/qi",
            locale: "en_US" as const,
        };
        await createQiPayment(config, input);
        await createQiPayment(config, { ...input, saveCard: true });
        const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
        expect(bodies[0]).not.toHaveProperty("needPaymentToken");
        expect(bodies[1]).toMatchObject({ needPaymentToken: true, tokenType: "AUTH" });
    });

    it("reads the saved card token from a paid status", async () => {
        const token = { token: "b6d6f1d0-5c4e-4bc1-9d38-0f6b6f0e3a11", type: "AUTH", validTo: "2032-01-31T23:59:59" };
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, { ...paid, paymentToken: token })));
        const payment = await getQiPaymentStatus(config, paid.paymentId);
        expect(payment.paymentToken).toEqual(token);
    });

    it("charges a saved card as a recurring payment without the shop", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json(200, paid));
        vi.stubGlobal("fetch", fetchMock);
        await chargeQiToken(config, {
            requestId: paid.requestId,
            amountIqd: 25_000,
            token: "tok-1",
            finishPaymentUrl: "https://app.test/f",
            notificationUrl: "https://app.test/api/webhooks/qi",
        });
        expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toMatchObject({
            amount: 25_000,
            currency: "IQD",
            recurrent: true,
            withoutAuthenticate: true,
            paymentData: { paymentType: "PAYMENT_TOKEN", paymentToken: "tok-1" },
        });
    });

    it("blocks a token, and treats already blocked or unknown as done", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 200 }))
            .mockResolvedValueOnce(json(400, { error: { code: 5, description: "Token is blocked" } }))
            .mockResolvedValueOnce(json(400, { error: { code: 31, description: "Token not found" } }))
            .mockResolvedValueOnce(json(400, { error: { code: 99, description: "Other" } }));
        vi.stubGlobal("fetch", fetchMock);
        await blockQiToken(config, "tok-1", "r1");
        await blockQiToken(config, "tok-1", "r2");
        await blockQiToken(config, "tok-1", "r3");
        await expect(blockQiToken(config, "tok-1", "r4")).rejects.toMatchObject({ code: 99 });
        expect(fetchMock.mock.calls[0][0]).toBe("https://qi.test/api/v1/token/tok-1/block");
    });

    it("never puts an odd token into the URL", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await expect(blockQiToken(config, "../x", "r")).rejects.toBeInstanceOf(QiApiError);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
