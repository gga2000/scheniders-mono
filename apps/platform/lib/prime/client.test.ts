import { describe, expect, it, vi } from "vitest";
import { createPrimeClient, isPrimeUnreachable, jwtExpiryMs, PrimeApiError } from "./client";

const config = { baseUrl: "https://prime.test/myp/webapi", systemCode: "SYS", password: "pw", initialToken: "init" };

/** A JWT whose payload carries `exp` (seconds). Signature is irrelevant here. */
const jwt = (expSeconds: number) =>
    `x.${Buffer.from(JSON.stringify({ sub: "s", exp: expSeconds })).toString("base64url")}.sig`;

const json = (status: number, body: unknown) =>
    new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const future = () => Math.floor(Date.now() / 1000) + 30 * 86_400;

const payload = {
    merchantLoginId: "m", senderId: 1, custReceiptNoOri: "1001", senderSystemCaseIdWithCharacters: "1001",
    receiverName: "A", receiverHp1: "07701234567", state: "BGD", locationDetails: "x", receiptAmtIqd: 1000,
    qty: 1, productInfo: "p", rmk: "", haveReturnItems: "N" as const,
};

describe("jwtExpiryMs", () => {
    it("reads exp, and gives null for a token without a readable payload", () => {
        expect(jwtExpiryMs(jwt(100))).toBe(100_000);
        expect(jwtExpiryMs("not-a-jwt")).toBeNull();
        expect(jwtExpiryMs("a.%%%.c")).toBeNull();
    });
});

describe("createPrimeClient", () => {
    it("signs in once, sends the JWT as a Bearer header, and reuses it", async () => {
        const token = jwt(future());
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json(200, { accessToken: token }))
            .mockResolvedValueOnce(json(200, { "1001": 52176640 }))
            .mockResolvedValueOnce(json(200, { "1001": 52176640 }));
        const client = createPrimeClient(config, fetchImpl);

        expect(await client.createShipment(payload)).toBe(52176640);
        expect(await client.createShipment(payload)).toBe(52176640);

        expect(fetchImpl).toHaveBeenCalledTimes(3);
        const [loginUrl, loginInit] = fetchImpl.mock.calls[0];
        expect(loginUrl).toBe("https://prime.test/myp/webapi/auth/external-system-login");
        expect(JSON.parse(String(loginInit?.body))).toEqual({ login: "SYS", password: "pw", initialToken: "init" });
        const [shipUrl, shipInit] = fetchImpl.mock.calls[1];
        expect(shipUrl).toBe("https://prime.test/myp/webapi/external/create-shipments");
        expect((shipInit?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
        expect(JSON.parse(String(shipInit?.body))).toEqual([payload]);
    });

    it("signs in again and retries once when Prime says the token expired", async () => {
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json(200, { accessToken: jwt(future()) }))
            .mockResolvedValueOnce(json(401, { status: 401, error: "Unauthorized" }))
            .mockResolvedValueOnce(json(200, { accessToken: jwt(future() + 1) }))
            .mockResolvedValueOnce(json(200, [{ caseid: 7, shipmentStatus: "DELIVERED", stepCode: "DLEIVERD", shipmentCharge: 6000 }]));
        const client = createPrimeClient(config, fetchImpl);

        expect(await client.shipmentsInfo([7])).toEqual([{ caseid: 7, shipmentStatus: "DELIVERED", stepCode: "DLEIVERD", shipmentCharge: 6000 }]);
        expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it("turns Prime's validation body into a PrimeApiError with its code", async () => {
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json(200, { accessToken: jwt(future()) }))
            .mockResolvedValueOnce(json(422, { errorCode: 29, errorMessage: "Invalid receiver phone", errorType: "VALIDATION" }));
        const client = createPrimeClient(config, fetchImpl);

        const err = await client.createShipment(payload).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PrimeApiError);
        expect(err).toMatchObject({ status: 422, code: 29, message: "Invalid receiver phone" });
    });

    it("reports a refused login without a body", async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(401, undefined));
        const err = await createPrimeClient(config, fetchImpl).stepNames().catch((e: unknown) => e);
        expect(err).toMatchObject({ status: 401, message: "Prime refused the system login" });
    });

    it("fails when Prime answers without a case for our receipt", async () => {
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json(200, { accessToken: jwt(future()) }))
            .mockResolvedValueOnce(json(200, { "9999": 1 }));
        await expect(createPrimeClient(config, fetchImpl).createShipment(payload)).rejects.toBeInstanceOf(PrimeApiError);
    });

    it("maps step codes to their Arabic names", async () => {
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json(200, { accessToken: jwt(future()) }))
            .mockResolvedValueOnce(json(200, [{ code: "ONWAY", name: "عند مندوب التوصيل", nameEn: "With delivery agent" }, { code: "NEW", name: null, nameEn: null }]));
        const names = await createPrimeClient(config, fetchImpl).stepNames();
        expect(names.get("ONWAY")).toBe("عند مندوب التوصيل");
        expect(names.get("NEW")).toBe("NEW");
    });

    it("refuses more ids than one shipments-info call takes, and skips the call for none", async () => {
        const fetchImpl = vi.fn<typeof fetch>();
        const client = createPrimeClient(config, fetchImpl);
        expect(await client.shipmentsInfo([])).toEqual([]);
        await expect(client.shipmentsInfo(Array.from({ length: 51 }, (_, i) => i + 1))).rejects.toThrow();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("reads the status whether Prime calls it shipmentStatus (live) or status (its guide)", async () => {
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json(200, { accessToken: jwt(future()) }))
            .mockResolvedValueOnce(json(200, [{ caseid: 1, status: "DELIVERED", stepCode: "DLEIVERD" }, { caseid: 2, shipmentStatus: "ONWAY" }, { caseid: 3 }]));
        const infos = await createPrimeClient(config, fetchImpl).shipmentsInfo([1, 2, 3]);
        expect(infos.map((i) => i.shipmentStatus)).toEqual(["DELIVERED", "ONWAY", null]);
    });

    it("a 2xx with no body is Prime refusing the write, reported with that status", async () => {
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json(200, { accessToken: jwt(future()) }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const err = await createPrimeClient(config, fetchImpl).createShipment(payload).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PrimeApiError);
        expect(err).toMatchObject({ status: 204 });
        expect(isPrimeUnreachable(err)).toBe(false);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("asks once more after a server fault, then finds the case by its receipt", async () => {
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json(200, { accessToken: jwt(future()) }))
            .mockRejectedValueOnce(new TypeError("fetch failed"))
            .mockResolvedValueOnce(json(502, undefined))
            .mockResolvedValueOnce(json(200, [{ caseid: 4242, custReceiptNoOri: "1001", stepCode: "READYTOPICKUP" }]));
        const client = createPrimeClient(config, fetchImpl, { retryDelayMs: 0 });

        expect(await client.createShipment(payload)).toBe(4242);
        expect(fetchImpl).toHaveBeenCalledTimes(4);
        const [searchUrl, searchInit] = fetchImpl.mock.calls[3];
        expect(searchUrl).toBe("https://prime.test/myp/webapi/external/search-shipments?page=1");
        expect(JSON.parse(String(searchInit?.body))).toEqual({ receiptNoOri: "1001", shop: 1 });
    });

    it("gives up as unreachable when the retry and the lookup both fail, without retrying a refusal", async () => {
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json(200, { accessToken: jwt(future()) }))
            .mockRejectedValueOnce(new TypeError("fetch failed"))
            .mockRejectedValueOnce(new TypeError("fetch failed"))
            .mockRejectedValueOnce(new TypeError("fetch failed"))
            .mockResolvedValueOnce(json(422, { errorCode: 21, errorMessage: "المبلغ المدخل خارج الحدود المسموح بها.", errorType: "VALIDATION" }));
        const client = createPrimeClient(config, fetchImpl, { retryDelayMs: 0 });

        const down = await client.createShipment(payload).catch((e: unknown) => e);
        expect(isPrimeUnreachable(down)).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(4);

        const refused = await client.createShipment(payload).catch((e: unknown) => e);
        expect(refused).toMatchObject({ status: 422, code: 21 });
        expect(fetchImpl).toHaveBeenCalledTimes(5);
    });

    it("parallel calls on a cold instance share one sign-in", async () => {
        const fetchImpl = vi.fn<typeof fetch>(async (url) => {
            if (String(url).endsWith("/auth/external-system-login")) return json(200, { accessToken: jwt(future()) });
            return json(200, { "1001": 1 });
        });
        const client = createPrimeClient(config, fetchImpl);
        await Promise.all([client.createShipment(payload), client.createShipment(payload), client.createShipment(payload)]);
        const logins = fetchImpl.mock.calls.filter(([url]) => String(url).endsWith("/auth/external-system-login"));
        expect(logins).toHaveLength(1);
    });

    it("re-signs in a short-lived token before it expires instead of on every call", async () => {
        const fetchImpl = vi.fn<typeof fetch>(async (url) => {
            if (String(url).endsWith("/auth/external-system-login")) return json(200, { accessToken: jwt(Math.floor(Date.now() / 1000) + 600) });
            return json(200, { "1001": 1 });
        });
        const client = createPrimeClient(config, fetchImpl);
        await client.createShipment(payload);
        await client.createShipment(payload);
        const logins = fetchImpl.mock.calls.filter(([url]) => String(url).endsWith("/auth/external-system-login"));
        expect(logins).toHaveLength(1);
    });

    it("reads the step names once per day", async () => {
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json(200, { accessToken: jwt(future()) }))
            .mockResolvedValueOnce(json(200, [{ code: "ONWAY", name: "عند مندوب التوصيل" }]));
        const client = createPrimeClient(config, fetchImpl);
        expect((await client.stepNames()).get("ONWAY")).toBe("عند مندوب التوصيل");
        expect((await client.stepNames()).get("ONWAY")).toBe("عند مندوب التوصيل");
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("identifies itself and asks for Arabic on every call", async () => {
        const fetchImpl = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json(200, { accessToken: jwt(future()) }))
            .mockResolvedValueOnce(json(200, []));
        await createPrimeClient(config, fetchImpl).stepNames();
        for (const [, init] of fetchImpl.mock.calls) {
            const headers = init?.headers as Record<string, string>;
            expect(headers["User-Agent"]).toMatch(/^Scheniders\//);
            expect(headers["Accept-Language"]).toBe("ar");
        }
    });
});
