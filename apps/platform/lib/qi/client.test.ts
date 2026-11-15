import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    QiApiError,
    blockQiToken,
    cancelQiPaymentByRequest,
    chargeQiToken,
    classifyQiFailure,
    createQiPayment,
    findQiPaymentByRequest,
    getQiPaymentStatus,
    qiSignedString,
    verifyQiSignature,
} from "./client";

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

    it("blocks a token only when Qi confirms it, and treats already blocked or unknown as done", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(json(200, { token: "tok-1", blocked: true }))
            .mockResolvedValueOnce(json(403, { error: { code: 5, description: "Payment token is blocked." } }))
            .mockResolvedValueOnce(json(403, { error: { code: 31, description: "Payment token not found." } }));
        vi.stubGlobal("fetch", fetchMock);
        await blockQiToken(config, "tok-1");
        await blockQiToken(config, "tok-1");
        await blockQiToken(config, "tok-1");
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://qi.test/api/v1/token/tok-1/block");
        // Each block is its own request: a fresh UUID every time.
        const ids = fetchMock.mock.calls.map(([, i]) => JSON.parse((i as RequestInit).body as string).requestId);
        expect(ids.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
        expect(new Set(ids).size).toBe(3);
        expect(init.method).toBe("POST");
    });

    it("does not count a block as done when Qi did not confirm it", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce(json(200, { token: "tok-1", blocked: false }))
                .mockResolvedValueOnce(json(403, { error: { code: 5, description: "RequestId 1 was already used." } }))
                .mockResolvedValueOnce(json(400, { error: { code: 99, description: "Other" } }))
                .mockResolvedValueOnce(json(500, {})),
        );
        await expect(blockQiToken(config, "tok-1")).rejects.toMatchObject({ status: 502 });
        await expect(blockQiToken(config, "tok-1")).rejects.toMatchObject({ code: 5 });
        await expect(blockQiToken(config, "tok-1")).rejects.toMatchObject({ code: 99 });
        await expect(blockQiToken(config, "tok-1")).rejects.toMatchObject({ status: 500 });
    });

    it("never puts an odd token into the URL", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await expect(blockQiToken(config, "../x")).rejects.toBeInstanceOf(QiApiError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reads the confirmed amount, the card brand and a blocked token", async () => {
        const token = { token: "b6d6f1d0-5c4e-4bc1-9d38-0f6b6f0e3a11", type: "AUTH", blocked: true };
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(json(200, { ...paid, confirmedAmount: 1000, details: { maskedPan: "521372******8582", paymentSystem: "MASTER_CARD" }, paymentToken: token })),
        );
        const payment = await getQiPaymentStatus(config, paid.paymentId);
        expect(payment.confirmedAmount).toBe(1000);
        expect(payment.details?.paymentSystem).toBe("MASTER_CARD");
        expect(payment.paymentToken?.blocked).toBe(true);
    });

    it("treats a 2xx that is not a payment as an unknown outcome, never a refusal", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, { hello: "world" })));
        const err = await getQiPaymentStatus(config, paid.paymentId).catch((e: unknown) => e);
        expect(err).toMatchObject({ name: "QiApiError", status: 502 });
        expect(classifyQiFailure(err)).toBe("unknown");
    });

    it("finds a payment by our request id, and answers null when Qi has none", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(json(200, paid))
            .mockResolvedValueOnce(json(403, { error: { code: 12, description: "Payment with provided requestId not found." } }))
            .mockResolvedValueOnce(json(401, { error: { code: 27, description: "Bad credentials" } }));
        vi.stubGlobal("fetch", fetchMock);
        await expect(findQiPaymentByRequest(config, paid.requestId)).resolves.toMatchObject({ paymentId: paid.paymentId });
        await expect(findQiPaymentByRequest(config, paid.requestId)).resolves.toBeNull();
        // Any other failure is not "no payment": it must not let a row be closed.
        await expect(findQiPaymentByRequest(config, paid.requestId)).rejects.toMatchObject({ code: 27 });
        expect(fetchMock.mock.calls[0][0]).toBe(`https://qi.test/api/v1/payment/status/by/request/${paid.requestId}`);
    });

    it("cancels by our request id with a fresh request id of its own", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json(200, { ...paid, status: "CREATED", canceled: true }));
        vi.stubGlobal("fetch", fetchMock);
        const payment = await cancelQiPaymentByRequest(config, paid.requestId);
        expect(payment.canceled).toBe(true);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`https://qi.test/api/v1/payment/cancel/by/request/${paid.requestId}`);
        const body = JSON.parse(init.body as string) as { requestId: string };
        expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(body.requestId).not.toBe(paid.requestId);
    });

    it("never puts an odd request id into the URL", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await expect(findQiPaymentByRequest(config, "../x")).rejects.toBeInstanceOf(QiApiError);
        await expect(cancelQiPaymentByRequest(config, "1; drop")).rejects.toBeInstanceOf(QiApiError);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("classifyQiFailure", () => {
    const qi = (status: number, code?: number, message = "x") => new QiApiError(message, status, code);
    it.each([
        ["network error", new TypeError("fetch failed"), "unknown"],
        ["timeout", new DOMException("timeout", "TimeoutError"), "unknown"],
        ["5xx with a code", qi(500, 1), "unknown"],
        ["no code", qi(400), "unknown"],
        ["Qi internal 23", qi(400, 23), "unknown"],
        ["Qi internal 24", qi(400, 24), "unknown"],
        ["bad credentials", qi(401, 27), "ours"],
        ["unknown terminal", qi(403, 9), "ours"],
        ["bad field", qi(400, 21), "ours"],
        ["form domain", qi(400, 26), "ours"],
        ["not found", qi(403, 12), "not_found"],
        ["unknown token", qi(403, 31), "card_dead"],
        ["token not allowed", qi(403, 32), "card_dead"],
        ["bad token type", qi(403, 35), "card_dead"],
        ["blocked token", qi(403, 5, "Payment token is blocked."), "card_dead"],
        ["request id reused", qi(403, 5, "RequestId abc was already used."), "unknown"],
        ["declined", qi(400, 7), "refused"],
    ] as const)("%s → %s", (_, err, expected) => {
        expect(classifyQiFailure(err)).toBe(expected);
    });
});
